import { z } from "zod";
import type { MediaAsset } from "@/media/types";
import type { TProject } from "@/project/types";
import type { SceneTracks, TScene } from "@/timeline";
import { roundMediaTime } from "@/wasm";
import { createLocalAssetFingerprintForMediaAsset } from "./media-index-adapter";
import {
	createProjectVersionRestorePayload,
	type ProjectVersionRestoreJsonObject,
	type ProjectVersionRestoreJsonValue,
	type ProjectVersionRestorePayload,
} from "./project-version-store";

export class ProjectVersionRestoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProjectVersionRestoreError";
	}
}

const timestampSchema = z.string().refine(
	(value) => {
		const timestamp = Date.parse(value);
		return (
			Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
		);
	},
	{ message: "Expected a canonical timestamp." },
);
const mediaTimeSchema = z.number().finite().nonnegative();
const frameRateSchema = z
	.object({
		numerator: z.number().int().positive(),
		denominator: z.number().int().positive(),
	})
	.strict();
const canvasSizeSchema = z
	.object({
		width: z.number().int().positive(),
		height: z.number().int().positive(),
	})
	.strict();
const backgroundSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("color"), color: z.string().min(1) }).strict(),
	z
		.object({
			type: z.literal("blur"),
			blurIntensity: z.number().finite().nonnegative(),
		})
		.strict(),
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSceneTracks(value: unknown): value is SceneTracks {
	if (!isRecord(value)) return false;
	const main = value.main;
	const overlay = value.overlay;
	const audio = value.audio;
	return (
		isRecord(main) &&
		main.type === "video" &&
		typeof main.id === "string" &&
		Array.isArray(main.elements) &&
		Array.isArray(overlay) &&
		Array.isArray(audio) &&
		overlay.every(
			(track) =>
				isRecord(track) &&
				typeof track.id === "string" &&
				Array.isArray(track.elements),
		) &&
		audio.every(
			(track) =>
				isRecord(track) &&
				track.type === "audio" &&
				typeof track.id === "string" &&
				Array.isArray(track.elements),
		)
	);
}

const sceneTracksSchema = z.custom<SceneTracks>(isSceneTracks, {
	message: "Timeline tracks are malformed.",
});
const bookmarkSchema = z
	.object({
		time: mediaTimeSchema,
		note: z.string().optional(),
		color: z.string().optional(),
		duration: mediaTimeSchema.optional(),
	})
	.strict();
const sceneSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1),
		isMain: z.boolean(),
		tracks: sceneTracksSchema,
		bookmarks: z.array(bookmarkSchema),
		createdAt: timestampSchema,
		updatedAt: timestampSchema,
	})
	.strict();
const projectStateSchema = z
	.object({
		projectId: z.string().min(1),
		metadata: z
			.object({
				id: z.string().min(1),
				name: z.string().min(1),
				duration: mediaTimeSchema,
				createdAt: timestampSchema,
				updatedAt: timestampSchema,
			})
			.strict(),
		currentSceneId: z.string().min(1),
		settings: z
			.object({
				fps: frameRateSchema,
				canvasSize: canvasSizeSchema,
				canvasSizeMode: z.enum(["preset", "custom"]).optional(),
				lastCustomCanvasSize: canvasSizeSchema.nullable().optional(),
				originalCanvasSize: canvasSizeSchema.nullable().optional(),
				background: backgroundSchema,
			})
			.strict(),
		version: z.number().int().nonnegative(),
		timelineViewState: z
			.object({
				zoomLevel: z.number().finite().positive(),
				scrollLeft: z.number().finite().nonnegative(),
				playheadTime: mediaTimeSchema,
			})
			.strict()
			.optional(),
	})
	.strict();
const timelineStateSchema = z
	.object({
		sceneId: z.string().min(1),
		scenes: z.array(sceneSchema).min(1).max(1_000),
	})
	.strict();

function toPortableJson({
	value,
	path,
	seen = new WeakSet<object>(),
}: {
	value: unknown;
	path: string;
	seen?: WeakSet<object>;
}): ProjectVersionRestoreJsonValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new ProjectVersionRestoreError(
				`${path} contains a non-finite number.`,
			);
		}
		return value;
	}
	if (value instanceof Date) return value.toISOString();
	if (
		typeof value !== "object" ||
		value instanceof ArrayBuffer ||
		ArrayBuffer.isView(value) ||
		(typeof Blob !== "undefined" && value instanceof Blob) ||
		(typeof File !== "undefined" && value instanceof File)
	) {
		throw new ProjectVersionRestoreError(
			`${path} cannot be represented in a local restore snapshot.`,
		);
	}
	if (seen.has(value)) {
		throw new ProjectVersionRestoreError(
			`${path} contains a cyclic object reference.`,
		);
	}
	seen.add(value);
	if (Array.isArray(value)) {
		const result = value.map((entry, index) =>
			toPortableJson({ value: entry, path: `${path}[${index}]`, seen }),
		);
		seen.delete(value);
		return result;
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new ProjectVersionRestoreError(
			`${path} contains a runtime-only object.`,
		);
	}
	const result: Record<string, ProjectVersionRestoreJsonValue> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (entry === undefined) continue;
		result[key] = toPortableJson({
			value: entry,
			path: `${path}.${key}`,
			seen,
		});
	}
	seen.delete(value);
	return result;
}

function asJsonObject({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): ProjectVersionRestoreJsonObject {
	const portable = toPortableJson({ value, path });
	if (!isRecord(portable)) {
		throw new ProjectVersionRestoreError(`${path} must be an object.`);
	}
	return portable;
}

function stripAudioBuffers(tracks: SceneTracks): SceneTracks {
	return {
		...tracks,
		audio: tracks.audio.map((track) => ({
			...track,
			elements: track.elements.map((element) => {
				const { buffer: _buffer, ...rest } = element;
				return rest;
			}),
		})),
	};
}

function serializeScene(scene: TScene) {
	return {
		id: scene.id,
		name: scene.name,
		isMain: scene.isMain,
		tracks: stripAudioBuffers(scene.tracks),
		bookmarks: scene.bookmarks,
		createdAt: scene.createdAt.toISOString(),
		updatedAt: scene.updatedAt.toISOString(),
	};
}

export function captureProjectVersionRestorePayload({
	project,
	assets,
	snapshotId,
	capturedAt,
	creativeState,
}: {
	project: TProject;
	assets: readonly MediaAsset[];
	snapshotId: string;
	capturedAt: string;
	creativeState?: unknown;
}): ProjectVersionRestorePayload {
	const projectState = asJsonObject({
		path: "$.projectState",
		value: {
			projectId: project.metadata.id,
			metadata: {
				id: project.metadata.id,
				name: project.metadata.name,
				duration: project.metadata.duration,
				createdAt: project.metadata.createdAt.toISOString(),
				updatedAt: project.metadata.updatedAt.toISOString(),
			},
			currentSceneId: project.currentSceneId,
			settings: project.settings,
			version: project.version,
			...(project.timelineViewState === undefined
				? {}
				: { timelineViewState: project.timelineViewState }),
		},
	});
	const timelineState = asJsonObject({
		path: "$.timelineState",
		value: {
			sceneId: project.currentSceneId,
			scenes: project.scenes.map(serializeScene),
		},
	});
	const portableCreativeState =
		creativeState === undefined
			? undefined
			: asJsonObject({
					path: "$.creativeState",
					value: creativeState,
				});
	return createProjectVersionRestorePayload({
		projectId: project.metadata.id,
		snapshotId,
		capturedAt,
		projectState,
		timelineState,
		...(portableCreativeState === undefined
			? {}
			: { creativeState: portableCreativeState }),
		assets: assets.map((asset) => ({
			assetId: asset.id,
			kind: asset.type,
			fingerprint: createLocalAssetFingerprintForMediaAsset({ asset }),
			name: asset.name,
			mimeType: asset.file.type,
			sizeBytes: asset.file.size,
		})),
	});
}

function validateAssetsForRestore({
	payload,
	assets,
}: {
	payload: ProjectVersionRestorePayload;
	assets: readonly MediaAsset[];
}): void {
	const byId = new Map(assets.map((asset) => [asset.id, asset]));
	for (const reference of payload.assets) {
		if (!["video", "audio", "image"].includes(reference.kind)) continue;
		const asset = byId.get(reference.assetId);
		if (asset === undefined) {
			throw new ProjectVersionRestoreError(
				`素材“${reference.name ?? reference.assetId}”当前不可用，不能恢复该版本。`,
			);
		}
		const currentFingerprint = createLocalAssetFingerprintForMediaAsset({
			asset,
		});
		if (currentFingerprint !== reference.fingerprint) {
			throw new ProjectVersionRestoreError(
				`素材“${reference.name ?? reference.assetId}”已被替换，不能恢复到旧结构。`,
			);
		}
	}
}

export function restoreProjectFromVersionPayload({
	payload,
	currentProject,
	assets,
}: {
	payload: ProjectVersionRestorePayload;
	currentProject: TProject;
	assets: readonly MediaAsset[];
}): TProject {
	if (payload.projectId !== currentProject.metadata.id) {
		throw new ProjectVersionRestoreError(
			"该版本属于另一个项目，不能在当前项目恢复。",
		);
	}
	validateAssetsForRestore({ payload, assets });
	const projectState = projectStateSchema.safeParse(payload.projectState);
	const timelineState = timelineStateSchema.safeParse(payload.timelineState);
	if (!projectState.success || !timelineState.success) {
		throw new ProjectVersionRestoreError("版本快照结构不完整，不能恢复。");
	}
	if (
		projectState.data.metadata.id !== payload.projectId ||
		!timelineState.data.scenes.some(
			(scene) => scene.id === projectState.data.currentSceneId,
		)
	) {
		throw new ProjectVersionRestoreError(
			"版本快照的项目或当前场景引用不一致。",
		);
	}
	const scenes: TScene[] = timelineState.data.scenes.map((scene) => ({
		...scene,
		bookmarks: scene.bookmarks.map((bookmark) => {
			const { duration, ...rest } = bookmark;
			return {
				...rest,
				time: roundMediaTime({ time: bookmark.time }),
				...(duration === undefined
					? {}
					: { duration: roundMediaTime({ time: duration }) }),
			};
		}),
		createdAt: new Date(scene.createdAt),
		updatedAt: new Date(scene.updatedAt),
	}));
	return {
		metadata: {
			id: projectState.data.metadata.id,
			name: projectState.data.metadata.name,
			duration: roundMediaTime({
				time: projectState.data.metadata.duration,
			}),
			createdAt: new Date(projectState.data.metadata.createdAt),
			updatedAt: new Date(),
			thumbnail: currentProject.metadata.thumbnail,
		},
		scenes,
		currentSceneId: projectState.data.currentSceneId,
		settings: projectState.data.settings,
		version: Math.max(currentProject.version, projectState.data.version) + 1,
		timelineViewState:
			projectState.data.timelineViewState === undefined
				? undefined
				: {
						...projectState.data.timelineViewState,
						playheadTime: roundMediaTime({
							time: projectState.data.timelineViewState.playheadTime,
						}),
					},
	};
}
