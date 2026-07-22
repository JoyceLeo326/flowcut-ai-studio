export const EXPORT_MANIFEST_SCHEMA_VERSION = 1 as const;

export const EXPORT_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"] as const;
export const EXPORT_CONTAINERS = ["mp4", "webm"] as const;
export const EXPORT_PLATFORMS = [
	"generic",
	"douyin",
	"xiaohongshu",
	"bilibili",
	"youtube",
	"podcast",
] as const;

export type ExportAspectRatio = (typeof EXPORT_ASPECT_RATIOS)[number];
export type ExportContainer = (typeof EXPORT_CONTAINERS)[number];
export type ExportPlatform = (typeof EXPORT_PLATFORMS)[number];
export type ExportMediaType = "video" | "image" | "audio";
export type ExportTimelineTrackType =
	| "video"
	| "text"
	| "audio"
	| "graphic"
	| "effect";
export type ExportTimelineElementType =
	| "video"
	| "image"
	| "text"
	| "audio"
	| "graphic"
	| "sticker"
	| "effect";
export type ExportIssueSeverity = "blocker" | "warning";

export type ExportIssueCode =
	| "NO_MEDIA_ASSETS"
	| "EMPTY_TIMELINE"
	| "NO_ACTIVE_VISUAL_CONTENT"
	| "MISSING_MEDIA_REFERENCE"
	| "PROJECT_DURATION_MISMATCH"
	| "PLATFORM_ASPECT_RATIO_UNSUPPORTED"
	| "PLATFORM_CONTAINER_UNSUPPORTED"
	| "SOURCE_REFRAME_REQUIRED"
	| "TARGET_DURATION_EXCEEDS_SOURCE"
	| "TARGET_DURATION_REQUIRES_EDIT"
	| "TIMELINE_CAPTIONS_MISSING"
	| "EXTERNAL_SUBTITLE_NOT_VERIFIED"
	| "PLATFORM_CAPTIONS_RECOMMENDED"
	| "REQUIRED_AUDIO_MISSING"
	| "AUDIO_SOURCE_MISSING"
	| "PLATFORM_AUDIO_REQUIRED"
	| "REQUIRED_COVER_MISSING"
	| "COVER_FRAME_OUT_OF_RANGE"
	| "COVER_MEDIA_MISSING"
	| "COVER_MEDIA_NOT_VISUAL"
	| "PLATFORM_COVER_RECOMMENDED";

export interface ExportProjectMetadataSnapshot {
	readonly id: string;
	readonly name: string;
	readonly version: number;
	readonly durationSeconds: number;
	readonly canvasSize: {
		readonly width: number;
		readonly height: number;
	};
	readonly fps: number;
}

export interface ExportMediaMetadataSnapshot {
	readonly id: string;
	readonly name: string;
	readonly type: ExportMediaType;
	readonly sizeBytes?: number;
	readonly durationSeconds?: number;
	readonly width?: number;
	readonly height?: number;
	readonly fps?: number;
	readonly hasAudio?: boolean;
}

export interface ExportTimelineElementSnapshot {
	readonly id: string;
	readonly name: string;
	readonly type: ExportTimelineElementType;
	readonly mediaId?: string;
	readonly startTimeSeconds: number;
	readonly durationSeconds: number;
	readonly hidden?: boolean;
	readonly sourceAudioEnabled?: boolean;
	readonly role?: "caption" | "title" | "content" | "other";
}

export interface ExportTimelineTrackSnapshot {
	readonly id: string;
	readonly name: string;
	readonly type: ExportTimelineTrackType;
	readonly hidden?: boolean;
	readonly muted?: boolean;
	readonly role?: "captions" | "titles" | "content" | "other";
	readonly elements: readonly ExportTimelineElementSnapshot[];
}

export interface ExportTimelineSnapshot {
	readonly sceneId: string;
	readonly sceneName: string;
	readonly tracks: readonly ExportTimelineTrackSnapshot[];
}

export type ExportSubtitleRequirementInput =
	| {
			readonly mode: "none";
	  }
	| {
			readonly mode: "burn-in" | "sidecar";
			readonly language: string;
			readonly source: "timeline-captions" | "external-file";
			readonly externalFileName?: string;
			readonly format?: "srt" | "vtt";
	  };

export type ExportAudioRequirementInput =
	| {
			readonly mode: "mute";
	  }
	| {
			readonly mode: "include";
			readonly required: boolean;
			readonly channels?: "mono" | "stereo";
			readonly targetLoudnessLufs?: number;
	  };

export type ExportCoverRequirementInput =
	| {
			readonly source: "none";
			readonly required: boolean;
	  }
	| {
			readonly source: "timeline-frame";
			readonly required: boolean;
			readonly atSeconds: number;
			readonly format?: "jpg" | "png";
	  }
	| {
			readonly source: "media-asset";
			readonly required: boolean;
			readonly mediaId: string;
			readonly format?: "jpg" | "png";
	  };

export interface ExportVariantIntentInput {
	readonly id: string;
	readonly label: string;
	readonly platform: ExportPlatform;
	readonly aspectRatio: ExportAspectRatio;
	readonly container?: ExportContainer;
	readonly targetDurationSeconds?: number;
	readonly fileNameSuffix?: string;
	readonly subtitles?: ExportSubtitleRequirementInput;
	readonly audio?: ExportAudioRequirementInput;
	readonly cover?: ExportCoverRequirementInput;
}

export interface CreateExportManifestInput {
	readonly project: ExportProjectMetadataSnapshot;
	readonly media: readonly ExportMediaMetadataSnapshot[];
	readonly timeline: ExportTimelineSnapshot;
	readonly variants: readonly ExportVariantIntentInput[];
	readonly fileNameStem?: string;
}

export interface ExportPlatformConstraint {
	readonly profile: "visioncut-local-delivery-defaults/v1";
	readonly livePlatformPolicyChecked: false;
	readonly allowedAspectRatios: readonly ExportAspectRatio[];
	readonly allowedContainers: readonly ExportContainer[];
	readonly captions: "optional" | "recommended";
	readonly audio: "optional" | "recommended" | "required";
	readonly cover: "optional" | "recommended";
}

export interface ExportIssue {
	readonly code: ExportIssueCode;
	readonly severity: ExportIssueSeverity;
	readonly scope: "project" | "variant";
	readonly variantId?: string;
	readonly message: string;
	readonly evidence?: {
		readonly actual?: string | number | boolean;
		readonly expected?: readonly string[];
		readonly references?: readonly string[];
	};
}

export type ExportSubtitleRequirement =
	| {
			readonly mode: "none";
	  }
	| {
			readonly mode: "burn-in" | "sidecar";
			readonly language: string;
			readonly source: "timeline-captions" | "external-file";
			readonly externalFileName?: string;
			readonly format: "srt" | "vtt";
	  };

export type ExportAudioRequirement =
	| {
			readonly mode: "mute";
	  }
	| {
			readonly mode: "include";
			readonly required: boolean;
			readonly channels: "mono" | "stereo";
			readonly targetLoudnessLufs?: number;
	  };

export type ExportCoverRequirement =
	| {
			readonly source: "none";
			readonly required: boolean;
	  }
	| {
			readonly source: "timeline-frame";
			readonly required: boolean;
			readonly atSeconds: number;
			readonly format: "jpg" | "png";
	  }
	| {
			readonly source: "media-asset";
			readonly required: boolean;
			readonly mediaId: string;
			readonly format: "jpg" | "png";
	  };

export interface ExportVariantIntent {
	readonly id: string;
	readonly label: string;
	readonly platform: ExportPlatform;
	readonly aspectRatio: ExportAspectRatio;
	readonly dimensions: {
		readonly width: number;
		readonly height: number;
	};
	readonly container: ExportContainer;
	readonly targetDurationSeconds: number;
	readonly requirements: {
		readonly subtitles: ExportSubtitleRequirement;
		readonly audio: ExportAudioRequirement;
		readonly cover: ExportCoverRequirement;
	};
	readonly platformConstraint: ExportPlatformConstraint;
	readonly plannedFiles: {
		readonly video: string;
		readonly subtitles?: string;
		readonly cover?: string;
	};
	readonly preflight: {
		readonly readyForRenderHandoff: boolean;
		readonly blockers: readonly ExportIssue[];
		readonly warnings: readonly ExportIssue[];
	};
}

export interface ExportManifest {
	readonly kind: "visioncut.export-manifest";
	readonly schemaVersion: typeof EXPORT_MANIFEST_SCHEMA_VERSION;
	readonly manifestId: string;
	readonly project: {
		readonly id: string;
		readonly name: string;
		readonly version: number;
		readonly sourceDurationSeconds: number;
		readonly canvasSize: {
			readonly width: number;
			readonly height: number;
		};
		readonly fps: number;
	};
	readonly sourceEvidence: {
		readonly sceneId: string;
		readonly sceneName: string;
		readonly media: {
			readonly total: number;
			readonly video: number;
			readonly image: number;
			readonly audio: number;
			readonly totalKnownBytes: number;
			readonly ids: readonly string[];
		};
		readonly timeline: {
			readonly durationSeconds: number;
			readonly trackCount: number;
			readonly elementCount: number;
			readonly activeVisualElementCount: number;
			readonly captionElementCount: number;
			readonly activeAudioElementCount: number;
			readonly hasAudioSource: boolean;
			readonly referencedMediaIds: readonly string[];
			readonly missingMediaIds: readonly string[];
		};
	};
	readonly intent: {
		readonly fileNameStem: string;
		readonly variants: readonly ExportVariantIntent[];
	};
	readonly preflight: {
		readonly canExportManifestJson: true;
		readonly readyForVideoRenderHandoff: boolean;
		readonly blockers: readonly ExportIssue[];
		readonly warnings: readonly ExportIssue[];
	};
	readonly localCapabilityBoundary: {
		readonly availableArtifacts: readonly [
			{
				readonly kind: "project-json";
				readonly fileName: string;
			},
			{
				readonly kind: "production-manifest-json";
				readonly fileName: string;
			},
		];
		readonly videoRendering: {
			readonly state: "not-executed";
			readonly performedByThisModel: false;
			readonly executorRequirement: "existing-render-engine-or-external-worker";
			readonly renderedFiles: readonly [];
		};
		readonly notice: string;
	};
}

export class ExportManifestInvariantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ExportManifestInvariantError";
	}
}

const DIMENSIONS_BY_ASPECT_RATIO: Record<
	ExportAspectRatio,
	{ readonly width: number; readonly height: number }
> = {
	"16:9": { width: 1920, height: 1080 },
	"9:16": { width: 1080, height: 1920 },
	"1:1": { width: 1080, height: 1080 },
	"4:5": { width: 1080, height: 1350 },
};

const PLATFORM_CONSTRAINTS: Record<ExportPlatform, ExportPlatformConstraint> = {
	generic: {
		profile: "visioncut-local-delivery-defaults/v1",
		livePlatformPolicyChecked: false,
		allowedAspectRatios: ["16:9", "9:16", "1:1", "4:5"],
		allowedContainers: ["mp4", "webm"],
		captions: "optional",
		audio: "optional",
		cover: "optional",
	},
	douyin: {
		profile: "visioncut-local-delivery-defaults/v1",
		livePlatformPolicyChecked: false,
		allowedAspectRatios: ["9:16"],
		allowedContainers: ["mp4"],
		captions: "recommended",
		audio: "recommended",
		cover: "recommended",
	},
	xiaohongshu: {
		profile: "visioncut-local-delivery-defaults/v1",
		livePlatformPolicyChecked: false,
		allowedAspectRatios: ["4:5", "9:16", "1:1"],
		allowedContainers: ["mp4"],
		captions: "recommended",
		audio: "recommended",
		cover: "recommended",
	},
	bilibili: {
		profile: "visioncut-local-delivery-defaults/v1",
		livePlatformPolicyChecked: false,
		allowedAspectRatios: ["16:9"],
		allowedContainers: ["mp4"],
		captions: "recommended",
		audio: "recommended",
		cover: "recommended",
	},
	youtube: {
		profile: "visioncut-local-delivery-defaults/v1",
		livePlatformPolicyChecked: false,
		allowedAspectRatios: ["16:9", "9:16"],
		allowedContainers: ["mp4"],
		captions: "recommended",
		audio: "recommended",
		cover: "recommended",
	},
	podcast: {
		profile: "visioncut-local-delivery-defaults/v1",
		livePlatformPolicyChecked: false,
		allowedAspectRatios: ["16:9", "1:1"],
		allowedContainers: ["mp4"],
		captions: "recommended",
		audio: "required",
		cover: "recommended",
	},
};

const ELEMENT_TYPES_BY_TRACK: Record<
	ExportTimelineTrackType,
	readonly ExportTimelineElementType[]
> = {
	video: ["video", "image"],
	text: ["text"],
	audio: ["audio"],
	graphic: ["graphic", "sticker"],
	effect: ["effect"],
};

const VISUAL_ELEMENT_TYPES: readonly ExportTimelineElementType[] = [
	"video",
	"image",
	"text",
	"graphic",
	"sticker",
];

function normalizeRequiredText({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
	if (!normalized) {
		throw new ExportManifestInvariantError(`${label} cannot be empty.`);
	}
	return normalized;
}

function assertFiniteNonNegative({
	value,
	label,
}: {
	value: number;
	label: string;
}): void {
	if (!Number.isFinite(value) || value < 0) {
		throw new ExportManifestInvariantError(
			`${label} must be a finite non-negative number.`,
		);
	}
}

function assertFinitePositive({
	value,
	label,
}: {
	value: number;
	label: string;
}): void {
	if (!Number.isFinite(value) || value <= 0) {
		throw new ExportManifestInvariantError(
			`${label} must be a finite positive number.`,
		);
	}
}

function assertPositiveInteger({
	value,
	label,
}: {
	value: number;
	label: string;
}): void {
	if (!Number.isSafeInteger(value) || value <= 0) {
		throw new ExportManifestInvariantError(
			`${label} must be a positive safe integer.`,
		);
	}
}

function normalizeIdentifier({
	value,
	label,
}: {
	value: string;
	label: string;
}): string {
	const normalized = normalizeRequiredText({ value, label });
	if (!/^[a-z0-9][a-z0-9_-]{0,63}$/iu.test(normalized)) {
		throw new ExportManifestInvariantError(
			`${label} must use 1-64 letters, numbers, underscores, or hyphens.`,
		);
	}
	return normalized;
}

function assertEnumMember({
	value,
	values,
	label,
}: {
	value: string;
	values: readonly string[];
	label: string;
}): void {
	if (!values.includes(value)) {
		throw new ExportManifestInvariantError(
			`${label} must be one of: ${values.join(", ")}.`,
		);
	}
}

function isControlCharacter(character: string): boolean {
	return (character.codePointAt(0) ?? 0) <= 31;
}

function replaceUnsafeFileNameCharacters(value: string): string {
	const reservedCharacters = new Set([
		"<",
		">",
		":",
		'"',
		"/",
		"\\",
		"|",
		"?",
		"*",
	]);
	return Array.from(value, (character) =>
		reservedCharacters.has(character) || isControlCharacter(character)
			? "-"
			: character,
	).join("");
}

function sanitizeFileNamePart({
	value,
	fallback,
}: {
	value: string;
	fallback: string;
}) {
	const normalized = replaceUnsafeFileNameCharacters(value.normalize("NFKC"))
		.trim()
		.replace(/\s+/gu, "-")
		.replace(/-+/gu, "-")
		.replace(/^[. -]+|[. -]+$/gu, "")
		.slice(0, 80);
	const candidate = normalized || fallback;
	return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(candidate)
		? `visioncut-${candidate}`
		: candidate;
}

function normalizeExternalFileName({
	value,
	format,
}: {
	value: string;
	format: "srt" | "vtt";
}): string {
	const normalized = normalizeRequiredText({
		value,
		label: "External subtitle file name",
	});
	if (
		normalized.length > 180 ||
		Array.from(normalized).some(
			(character) =>
				character === "\\" ||
				character === "/" ||
				isControlCharacter(character),
		) ||
		!normalized.toLocaleLowerCase("en-US").endsWith(`.${format}`)
	) {
		throw new ExportManifestInvariantError(
			`External subtitle file name must be a base file name ending in .${format}.`,
		);
	}
	return normalized;
}

function hashWithSeed({
	value,
	seed,
}: {
	value: string;
	seed: number;
}): string {
	let hash = seed >>> 0;
	for (const character of value) {
		hash ^= character.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16_777_619);
	}
	return (hash >>> 0).toString(36).padStart(7, "0");
}

function stableDigest({ value }: { value: string }): string {
	return `${hashWithSeed({ value, seed: 2_166_136_261 })}${hashWithSeed({
		value,
		seed: 3_332_816_977,
	})}`;
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
	}
	return `{${Object.keys(value)
		.sort()
		.map(
			(key) =>
				`${JSON.stringify(key)}:${canonicalJson(Object.getOwnPropertyDescriptor(value, key)?.value)}`,
		)
		.join(",")}}`;
}

function deterministicId({
	prefix,
	value,
}: {
	prefix: string;
	value: unknown;
}) {
	return `${prefix}_${stableDigest({ value: canonicalJson(value) })}`;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
	return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizeSubtitleRequirement(
	requirement: ExportSubtitleRequirementInput | undefined,
): ExportSubtitleRequirement {
	if (!requirement || requirement.mode === "none") {
		if (requirement && Object.keys(requirement).some((key) => key !== "mode")) {
			throw new ExportManifestInvariantError(
				"Subtitle mode none cannot include subtitle source fields.",
			);
		}
		return { mode: "none" };
	}

	const language = normalizeRequiredText({
		value: requirement.language,
		label: "Subtitle language",
	});
	const format = requirement.format ?? "srt";
	if (requirement.source === "timeline-captions") {
		if (requirement.externalFileName !== undefined) {
			throw new ExportManifestInvariantError(
				"Timeline caption subtitles cannot include an external file name.",
			);
		}
		return {
			mode: requirement.mode,
			language,
			source: requirement.source,
			format,
		};
	}

	if (requirement.externalFileName === undefined) {
		throw new ExportManifestInvariantError(
			"External subtitles require externalFileName metadata.",
		);
	}
	return {
		mode: requirement.mode,
		language,
		source: requirement.source,
		externalFileName: normalizeExternalFileName({
			value: requirement.externalFileName,
			format,
		}),
		format,
	};
}

function normalizeAudioRequirement(
	requirement: ExportAudioRequirementInput | undefined,
): ExportAudioRequirement {
	if (!requirement) {
		return { mode: "include", required: false, channels: "stereo" };
	}
	if (requirement.mode === "mute") {
		if (Object.keys(requirement).some((key) => key !== "mode")) {
			throw new ExportManifestInvariantError(
				"Muted audio cannot include mix or loudness requirements.",
			);
		}
		return { mode: "mute" };
	}
	if (requirement.targetLoudnessLufs !== undefined) {
		if (
			!Number.isFinite(requirement.targetLoudnessLufs) ||
			requirement.targetLoudnessLufs < -70 ||
			requirement.targetLoudnessLufs > 0
		) {
			throw new ExportManifestInvariantError(
				"Target loudness must be between -70 and 0 LUFS.",
			);
		}
	}
	return {
		mode: "include",
		required: requirement.required,
		channels: requirement.channels ?? "stereo",
		...(requirement.targetLoudnessLufs === undefined
			? {}
			: { targetLoudnessLufs: requirement.targetLoudnessLufs }),
	};
}

function normalizeCoverRequirement(
	requirement: ExportCoverRequirementInput | undefined,
): ExportCoverRequirement {
	if (!requirement) return { source: "none", required: false };
	if (requirement.source === "none") {
		if (
			Object.keys(requirement).some(
				(key) => !["source", "required"].includes(key),
			)
		) {
			throw new ExportManifestInvariantError(
				"A cover with source none cannot include source metadata.",
			);
		}
		return { source: "none", required: requirement.required };
	}
	if (requirement.source === "timeline-frame") {
		assertFiniteNonNegative({
			value: requirement.atSeconds,
			label: "Cover frame time",
		});
		return {
			source: requirement.source,
			required: requirement.required,
			atSeconds: requirement.atSeconds,
			format: requirement.format ?? "jpg",
		};
	}
	return {
		source: requirement.source,
		required: requirement.required,
		mediaId: normalizeRequiredText({
			value: requirement.mediaId,
			label: "Cover media ID",
		}),
		format: requirement.format ?? "jpg",
	};
}

function validateProject(project: ExportProjectMetadataSnapshot) {
	const id = normalizeRequiredText({ value: project.id, label: "Project ID" });
	const name = normalizeRequiredText({
		value: project.name,
		label: "Project name",
	});
	if (!Number.isSafeInteger(project.version) || project.version < 0) {
		throw new ExportManifestInvariantError(
			"Project version must be a non-negative safe integer.",
		);
	}
	assertFiniteNonNegative({
		value: project.durationSeconds,
		label: "Project duration",
	});
	assertPositiveInteger({
		value: project.canvasSize.width,
		label: "Canvas width",
	});
	assertPositiveInteger({
		value: project.canvasSize.height,
		label: "Canvas height",
	});
	assertFinitePositive({ value: project.fps, label: "Project FPS" });
	return {
		id,
		name,
		version: project.version,
		durationSeconds: project.durationSeconds,
		canvasSize: {
			width: project.canvasSize.width,
			height: project.canvasSize.height,
		},
		fps: project.fps,
	};
}

function normalizeMedia(media: readonly ExportMediaMetadataSnapshot[]) {
	const ids = new Set<string>();
	return media
		.map((item, index) => {
			const id = normalizeRequiredText({
				value: item.id,
				label: `Media ${index + 1} ID`,
			});
			if (ids.has(id)) {
				throw new ExportManifestInvariantError(`Duplicate media ID: ${id}.`);
			}
			ids.add(id);
			assertEnumMember({
				value: item.type,
				values: ["video", "image", "audio"] as const,
				label: `Media ${id} type`,
			});
			if (item.sizeBytes !== undefined) {
				assertFiniteNonNegative({
					value: item.sizeBytes,
					label: `Media ${id} size`,
				});
			}
			if (item.durationSeconds !== undefined) {
				assertFiniteNonNegative({
					value: item.durationSeconds,
					label: `Media ${id} duration`,
				});
			}
			for (const [label, value] of [
				["width", item.width],
				["height", item.height],
				["FPS", item.fps],
			] as const) {
				if (value !== undefined) {
					assertFinitePositive({
						value,
						label: `Media ${id} ${label}`,
					});
				}
			}
			return {
				id,
				name: normalizeRequiredText({
					value: item.name,
					label: `Media ${id} name`,
				}),
				type: item.type,
				...(item.sizeBytes === undefined ? {} : { sizeBytes: item.sizeBytes }),
				...(item.durationSeconds === undefined
					? {}
					: { durationSeconds: item.durationSeconds }),
				...(item.width === undefined ? {} : { width: item.width }),
				...(item.height === undefined ? {} : { height: item.height }),
				...(item.fps === undefined ? {} : { fps: item.fps }),
				...(item.hasAudio === undefined ? {} : { hasAudio: item.hasAudio }),
			};
		})
		.sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeTimeline(timeline: ExportTimelineSnapshot) {
	const trackIds = new Set<string>();
	const elementIds = new Set<string>();
	return {
		sceneId: normalizeRequiredText({
			value: timeline.sceneId,
			label: "Timeline scene ID",
		}),
		sceneName: normalizeRequiredText({
			value: timeline.sceneName,
			label: "Timeline scene name",
		}),
		tracks: timeline.tracks.map((track, trackIndex) => {
			const id = normalizeRequiredText({
				value: track.id,
				label: `Timeline track ${trackIndex + 1} ID`,
			});
			if (trackIds.has(id)) {
				throw new ExportManifestInvariantError(
					`Duplicate timeline track ID: ${id}.`,
				);
			}
			trackIds.add(id);
			assertEnumMember({
				value: track.type,
				values: ["video", "text", "audio", "graphic", "effect"] as const,
				label: `Timeline track ${id} type`,
			});
			if (track.role === "captions" && track.type !== "text") {
				throw new ExportManifestInvariantError(
					`Caption track ${id} must be a text track.`,
				);
			}
			return {
				id,
				name: normalizeRequiredText({
					value: track.name,
					label: `Timeline track ${id} name`,
				}),
				type: track.type,
				hidden: track.hidden ?? false,
				muted: track.muted ?? false,
				...(track.role === undefined ? {} : { role: track.role }),
				elements: track.elements.map((element, elementIndex) => {
					const elementId = normalizeRequiredText({
						value: element.id,
						label: `Timeline element ${elementIndex + 1} ID`,
					});
					if (elementIds.has(elementId)) {
						throw new ExportManifestInvariantError(
							`Duplicate timeline element ID: ${elementId}.`,
						);
					}
					elementIds.add(elementId);
					assertEnumMember({
						value: element.type,
						values: [
							"video",
							"image",
							"text",
							"audio",
							"graphic",
							"sticker",
							"effect",
						] as const,
						label: `Timeline element ${elementId} type`,
					});
					if (!ELEMENT_TYPES_BY_TRACK[track.type].includes(element.type)) {
						throw new ExportManifestInvariantError(
							`Element ${elementId} type ${element.type} is invalid for ${track.type} track ${id}.`,
						);
					}
					if (
						(element.type === "video" || element.type === "image") &&
						!element.mediaId
					) {
						throw new ExportManifestInvariantError(
							`Visual media element ${elementId} requires a mediaId.`,
						);
					}
					if (element.role === "caption" && element.type !== "text") {
						throw new ExportManifestInvariantError(
							`Caption element ${elementId} must be a text element.`,
						);
					}
					assertFiniteNonNegative({
						value: element.startTimeSeconds,
						label: `Timeline element ${elementId} start time`,
					});
					assertFinitePositive({
						value: element.durationSeconds,
						label: `Timeline element ${elementId} duration`,
					});
					return {
						id: elementId,
						name: normalizeRequiredText({
							value: element.name,
							label: `Timeline element ${elementId} name`,
						}),
						type: element.type,
						...(element.mediaId === undefined
							? {}
							: {
									mediaId: normalizeRequiredText({
										value: element.mediaId,
										label: `Timeline element ${elementId} media ID`,
									}),
								}),
						startTimeSeconds: element.startTimeSeconds,
						durationSeconds: element.durationSeconds,
						hidden: element.hidden ?? false,
						sourceAudioEnabled: element.sourceAudioEnabled ?? true,
						...(element.role === undefined ? {} : { role: element.role }),
					};
				}),
			};
		}),
	};
}

function summarizeSource({
	media,
	timeline,
}: {
	media: ReturnType<typeof normalizeMedia>;
	timeline: ReturnType<typeof normalizeTimeline>;
}) {
	const mediaById = new Map(media.map((item) => [item.id, item] as const));
	const elements = timeline.tracks.flatMap((track) =>
		track.elements.map((element) => ({ track, element })),
	);
	const durationSeconds = elements.reduce(
		(maximum, { element }) =>
			Math.max(maximum, element.startTimeSeconds + element.durationSeconds),
		0,
	);
	const referencedMediaIds = uniqueSorted(
		elements.flatMap(({ element }) =>
			element.mediaId === undefined ? [] : [element.mediaId],
		),
	);
	const missingMediaIds = referencedMediaIds.filter((id) => !mediaById.has(id));
	const activeVisualElementCount = elements.filter(
		({ track, element }) =>
			!track.hidden &&
			!element.hidden &&
			VISUAL_ELEMENT_TYPES.includes(element.type),
	).length;
	const captionElementCount = elements.filter(
		({ track, element }) =>
			!track.hidden &&
			!element.hidden &&
			element.type === "text" &&
			(track.role === "captions" || element.role === "caption"),
	).length;
	const activeAudioElements = elements.filter(({ track, element }) => {
		if (track.muted || element.hidden) return false;
		if (element.type === "audio") return true;
		if (element.type !== "video" || !element.sourceAudioEnabled) return false;
		return element.mediaId
			? mediaById.get(element.mediaId)?.hasAudio === true
			: false;
	});

	return {
		mediaById,
		media: {
			total: media.length,
			video: media.filter((item) => item.type === "video").length,
			image: media.filter((item) => item.type === "image").length,
			audio: media.filter((item) => item.type === "audio").length,
			totalKnownBytes: media.reduce(
				(total, item) => total + (item.sizeBytes ?? 0),
				0,
			),
			ids: media.map((item) => item.id),
		},
		timeline: {
			durationSeconds,
			trackCount: timeline.tracks.length,
			elementCount: elements.length,
			activeVisualElementCount,
			captionElementCount,
			activeAudioElementCount: activeAudioElements.length,
			hasAudioSource: activeAudioElements.length > 0,
			referencedMediaIds,
			missingMediaIds,
		},
	};
}

function projectIssues({
	project,
	source,
}: {
	project: ReturnType<typeof validateProject>;
	source: ReturnType<typeof summarizeSource>;
}): ExportIssue[] {
	const issues: ExportIssue[] = [];
	if (source.media.total === 0) {
		issues.push({
			code: "NO_MEDIA_ASSETS",
			severity: "blocker",
			scope: "project",
			message: "No real media metadata is available for this export intent.",
		});
	}
	if (
		source.timeline.elementCount === 0 ||
		source.timeline.durationSeconds === 0
	) {
		issues.push({
			code: "EMPTY_TIMELINE",
			severity: "blocker",
			scope: "project",
			message: "The timeline has no positive-duration elements to render.",
		});
	}
	if (
		source.timeline.elementCount > 0 &&
		source.timeline.activeVisualElementCount === 0
	) {
		issues.push({
			code: "NO_ACTIVE_VISUAL_CONTENT",
			severity: "blocker",
			scope: "project",
			message: "The timeline has no visible visual elements.",
		});
	}
	if (source.timeline.missingMediaIds.length > 0) {
		issues.push({
			code: "MISSING_MEDIA_REFERENCE",
			severity: "blocker",
			scope: "project",
			message:
				"Timeline elements reference media that is not present in the snapshot.",
			evidence: { references: source.timeline.missingMediaIds },
		});
	}
	if (
		Math.abs(project.durationSeconds - source.timeline.durationSeconds) > 0.05
	) {
		issues.push({
			code: "PROJECT_DURATION_MISMATCH",
			severity: "warning",
			scope: "project",
			message:
				"Stored project duration differs from the duration derived from timeline metadata.",
			evidence: {
				actual: project.durationSeconds,
				expected: [String(source.timeline.durationSeconds)],
			},
		});
	}
	return issues;
}

function ratioForCanvas({ width, height }: { width: number; height: number }) {
	const value = width / height;
	return EXPORT_ASPECT_RATIOS.find((ratio) => {
		const dimensions = DIMENSIONS_BY_ASPECT_RATIO[ratio];
		return Math.abs(value - dimensions.width / dimensions.height) < 0.015;
	});
}

function variantIssue({
	code,
	severity,
	variantId,
	message,
	evidence,
}: {
	code: ExportIssueCode;
	severity: ExportIssueSeverity;
	variantId: string;
	message: string;
	evidence?: ExportIssue["evidence"];
}): ExportIssue {
	return {
		code,
		severity,
		scope: "variant",
		variantId,
		message,
		...(evidence === undefined ? {} : { evidence }),
	};
}

function createVariant({
	input,
	project,
	source,
	fileNameStem,
}: {
	input: ExportVariantIntentInput;
	project: ReturnType<typeof validateProject>;
	source: ReturnType<typeof summarizeSource>;
	fileNameStem: string;
}): ExportVariantIntent {
	const id = normalizeIdentifier({ value: input.id, label: "Variant ID" });
	const label = normalizeRequiredText({
		value: input.label,
		label: "Variant label",
	});
	assertEnumMember({
		value: input.platform,
		values: EXPORT_PLATFORMS,
		label: `Variant ${id} platform`,
	});
	assertEnumMember({
		value: input.aspectRatio,
		values: EXPORT_ASPECT_RATIOS,
		label: `Variant ${id} aspect ratio`,
	});
	const container = input.container ?? "mp4";
	assertEnumMember({
		value: container,
		values: EXPORT_CONTAINERS,
		label: `Variant ${id} container`,
	});
	const targetDurationSeconds =
		input.targetDurationSeconds ?? source.timeline.durationSeconds;
	if (input.targetDurationSeconds === undefined) {
		assertFiniteNonNegative({
			value: targetDurationSeconds,
			label: `Variant ${id} derived target duration`,
		});
	} else {
		assertFinitePositive({
			value: targetDurationSeconds,
			label: `Variant ${id} target duration`,
		});
	}
	const subtitles = normalizeSubtitleRequirement(input.subtitles);
	const audio = normalizeAudioRequirement(input.audio);
	const cover = normalizeCoverRequirement(input.cover);
	const constraint = PLATFORM_CONSTRAINTS[input.platform];
	const issues: ExportIssue[] = [];

	if (!constraint.allowedAspectRatios.includes(input.aspectRatio)) {
		issues.push(
			variantIssue({
				code: "PLATFORM_ASPECT_RATIO_UNSUPPORTED",
				severity: "blocker",
				variantId: id,
				message:
					"The selected aspect ratio is outside the current VisionCut delivery profile for this platform.",
				evidence: {
					actual: input.aspectRatio,
					expected: constraint.allowedAspectRatios,
				},
			}),
		);
	}
	if (!constraint.allowedContainers.includes(container)) {
		issues.push(
			variantIssue({
				code: "PLATFORM_CONTAINER_UNSUPPORTED",
				severity: "blocker",
				variantId: id,
				message:
					"The selected container is outside the current VisionCut delivery profile for this platform.",
				evidence: {
					actual: container,
					expected: constraint.allowedContainers,
				},
			}),
		);
	}
	const sourceRatio = ratioForCanvas(project.canvasSize);
	if (sourceRatio !== input.aspectRatio) {
		issues.push(
			variantIssue({
				code: "SOURCE_REFRAME_REQUIRED",
				severity: "warning",
				variantId: id,
				message:
					"The requested aspect ratio differs from the current project canvas and requires a reviewed reframe.",
				evidence: {
					actual:
						sourceRatio ??
						`${project.canvasSize.width}:${project.canvasSize.height}`,
					expected: [input.aspectRatio],
				},
			}),
		);
	}
	if (targetDurationSeconds > source.timeline.durationSeconds + 0.05) {
		issues.push(
			variantIssue({
				code: "TARGET_DURATION_EXCEEDS_SOURCE",
				severity: "warning",
				variantId: id,
				message:
					"The target duration exceeds the source timeline; no missing duration is invented by this manifest.",
				evidence: {
					actual: targetDurationSeconds,
					expected: [String(source.timeline.durationSeconds)],
				},
			}),
		);
	} else if (targetDurationSeconds < source.timeline.durationSeconds - 0.05) {
		issues.push(
			variantIssue({
				code: "TARGET_DURATION_REQUIRES_EDIT",
				severity: "warning",
				variantId: id,
				message:
					"The target duration is shorter than the timeline and requires a reviewed edit before rendering.",
				evidence: {
					actual: targetDurationSeconds,
					expected: [String(source.timeline.durationSeconds)],
				},
			}),
		);
	}

	if (
		subtitles.mode !== "none" &&
		subtitles.source === "timeline-captions" &&
		source.timeline.captionElementCount === 0
	) {
		issues.push(
			variantIssue({
				code: "TIMELINE_CAPTIONS_MISSING",
				severity: "blocker",
				variantId: id,
				message:
					"Timeline captions were requested, but no explicitly marked caption elements are present.",
			}),
		);
	}
	if (subtitles.mode !== "none" && subtitles.source === "external-file") {
		issues.push(
			variantIssue({
				code: "EXTERNAL_SUBTITLE_NOT_VERIFIED",
				severity: "warning",
				variantId: id,
				message:
					"Only external subtitle file-name metadata is recorded; file presence and contents were not inspected.",
				evidence: { references: [subtitles.externalFileName ?? ""] },
			}),
		);
	}
	if (subtitles.mode === "none" && constraint.captions === "recommended") {
		issues.push(
			variantIssue({
				code: "PLATFORM_CAPTIONS_RECOMMENDED",
				severity: "warning",
				variantId: id,
				message: "The current VisionCut platform profile recommends captions.",
			}),
		);
	}

	if (audio.mode === "include" && !source.timeline.hasAudioSource) {
		issues.push(
			variantIssue({
				code: audio.required
					? "REQUIRED_AUDIO_MISSING"
					: "AUDIO_SOURCE_MISSING",
				severity: audio.required ? "blocker" : "warning",
				variantId: id,
				message: audio.required
					? "Audio is required, but no active timeline audio source is present."
					: "Audio was requested, but no active timeline audio source is present.",
			}),
		);
	}
	if (constraint.audio === "required" && audio.mode === "mute") {
		issues.push(
			variantIssue({
				code: "PLATFORM_AUDIO_REQUIRED",
				severity: "blocker",
				variantId: id,
				message:
					"The current VisionCut platform profile requires an audio delivery.",
			}),
		);
	}

	if (cover.source === "none") {
		if (cover.required) {
			issues.push(
				variantIssue({
					code: "REQUIRED_COVER_MISSING",
					severity: "blocker",
					variantId: id,
					message: "A cover is required, but no cover source was selected.",
				}),
			);
		} else if (constraint.cover === "recommended") {
			issues.push(
				variantIssue({
					code: "PLATFORM_COVER_RECOMMENDED",
					severity: "warning",
					variantId: id,
					message: "The current VisionCut platform profile recommends a cover.",
				}),
			);
		}
	} else if (
		cover.source === "timeline-frame" &&
		cover.atSeconds > source.timeline.durationSeconds
	) {
		issues.push(
			variantIssue({
				code: "COVER_FRAME_OUT_OF_RANGE",
				severity: "blocker",
				variantId: id,
				message: "The requested cover frame is outside the timeline duration.",
				evidence: {
					actual: cover.atSeconds,
					expected: [`0-${source.timeline.durationSeconds}`],
				},
			}),
		);
	} else if (cover.source === "media-asset") {
		const coverMedia = source.mediaById.get(cover.mediaId);
		if (!coverMedia) {
			issues.push(
				variantIssue({
					code: "COVER_MEDIA_MISSING",
					severity: "blocker",
					variantId: id,
					message:
						"The selected cover media ID is not present in the snapshot.",
					evidence: { references: [cover.mediaId] },
				}),
			);
		} else if (coverMedia.type === "audio") {
			issues.push(
				variantIssue({
					code: "COVER_MEDIA_NOT_VISUAL",
					severity: "blocker",
					variantId: id,
					message: "An audio asset cannot be used as a cover image.",
					evidence: { references: [cover.mediaId] },
				}),
			);
		}
	}

	const suffix = sanitizeFileNamePart({
		value: input.fileNameSuffix ?? label,
		fallback: id,
	});
	const ratioPart = input.aspectRatio.replace(":", "x");
	const fileBase = `${fileNameStem}_${suffix}_${input.platform}_${ratioPart}`;
	const plannedFiles: ExportVariantIntent["plannedFiles"] = {
		video: `${fileBase}.${container}`,
		...(subtitles.mode === "sidecar"
			? { subtitles: `${fileBase}.${subtitles.format}` }
			: {}),
		...(cover.source === "none"
			? {}
			: { cover: `${fileBase}-cover.${cover.format}` }),
	};
	const blockers = issues.filter((issue) => issue.severity === "blocker");
	const warnings = issues.filter((issue) => issue.severity === "warning");

	return {
		id,
		label,
		platform: input.platform,
		aspectRatio: input.aspectRatio,
		dimensions: { ...DIMENSIONS_BY_ASPECT_RATIO[input.aspectRatio] },
		container,
		targetDurationSeconds,
		requirements: { subtitles, audio, cover },
		platformConstraint: {
			...constraint,
			allowedAspectRatios: [...constraint.allowedAspectRatios],
			allowedContainers: [...constraint.allowedContainers],
		},
		plannedFiles,
		preflight: {
			readyForRenderHandoff: blockers.length === 0,
			blockers,
			warnings,
		},
	};
}

function assertPlainJsonValue({
	value,
	path,
}: {
	value: unknown;
	path: string;
}): void {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "boolean"
	) {
		return;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new ExportManifestInvariantError(
				`${path} contains a non-finite number.`,
			);
		}
		return;
	}
	if (Array.isArray(value)) {
		value.forEach((item, index) =>
			assertPlainJsonValue({ value: item, path: `${path}[${index}]` }),
		);
		return;
	}
	if (typeof value !== "object") {
		throw new ExportManifestInvariantError(`${path} is not JSON-safe.`);
	}
	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		throw new ExportManifestInvariantError(`${path} must be a plain object.`);
	}
	for (const [key, item] of Object.entries(value)) {
		if (item === undefined) {
			throw new ExportManifestInvariantError(`${path}.${key} is undefined.`);
		}
		assertPlainJsonValue({ value: item, path: `${path}.${key}` });
	}
}

function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		for (const item of Object.values(value)) {
			deepFreeze(item);
		}
		Object.freeze(value);
	}
	return value;
}

function manifestIdentityPayload(manifest: ExportManifest) {
	const { manifestId: _manifestId, ...payload } = manifest;
	return payload;
}

export function assertExportManifestInvariants({
	manifest,
}: {
	manifest: ExportManifest;
}): void {
	assertPlainJsonValue({ value: manifest, path: "manifest" });
	if (
		manifest.kind !== "visioncut.export-manifest" ||
		manifest.schemaVersion !== EXPORT_MANIFEST_SCHEMA_VERSION
	) {
		throw new ExportManifestInvariantError(
			"Unsupported export manifest schema.",
		);
	}
	if (
		manifest.intent.variants.length === 0 ||
		manifest.intent.variants.length > 8
	) {
		throw new ExportManifestInvariantError(
			"Export manifest must contain between 1 and 8 variants.",
		);
	}
	const variantIds = manifest.intent.variants.map((variant) => variant.id);
	if (new Set(variantIds).size !== variantIds.length) {
		throw new ExportManifestInvariantError(
			"Export variant IDs must be unique.",
		);
	}
	const plannedVideoFiles = manifest.intent.variants.map(
		(variant) => variant.plannedFiles.video,
	);
	if (new Set(plannedVideoFiles).size !== plannedVideoFiles.length) {
		throw new ExportManifestInvariantError(
			"Planned video file names must be unique.",
		);
	}
	const blockers = manifest.preflight.blockers;
	if (
		manifest.preflight.readyForVideoRenderHandoff !== (blockers.length === 0) ||
		manifest.intent.variants.some(
			(variant) =>
				variant.preflight.readyForRenderHandoff !==
				(variant.preflight.blockers.length === 0),
		)
	) {
		throw new ExportManifestInvariantError(
			"Preflight readiness must be derived from blocker counts.",
		);
	}
	if (
		manifest.localCapabilityBoundary.videoRendering.state !== "not-executed" ||
		manifest.localCapabilityBoundary.videoRendering.performedByThisModel !==
			false ||
		manifest.localCapabilityBoundary.videoRendering.renderedFiles.length !== 0
	) {
		throw new ExportManifestInvariantError(
			"The Export Center manifest cannot claim that video rendering was executed.",
		);
	}
	const expectedId = deterministicId({
		prefix: "export_manifest",
		value: manifestIdentityPayload(manifest),
	});
	if (manifest.manifestId !== expectedId) {
		throw new ExportManifestInvariantError(
			"Export manifest identity does not match its content.",
		);
	}
}

export function createExportManifest(
	input: CreateExportManifestInput,
): ExportManifest {
	if (input.variants.length === 0 || input.variants.length > 8) {
		throw new ExportManifestInvariantError(
			"Export intent must contain between 1 and 8 variants.",
		);
	}
	const project = validateProject(input.project);
	const media = normalizeMedia(input.media);
	const timeline = normalizeTimeline(input.timeline);
	const source = summarizeSource({ media, timeline });
	const fileNameStem = sanitizeFileNamePart({
		value: input.fileNameStem ?? project.name,
		fallback: "visioncut-project",
	});
	const variants = input.variants.map((variant) =>
		createVariant({ input: variant, project, source, fileNameStem }),
	);
	const variantIds = variants.map((variant) => variant.id);
	if (new Set(variantIds).size !== variantIds.length) {
		throw new ExportManifestInvariantError(
			"Export variant IDs must be unique.",
		);
	}
	const projectPreflightIssues = projectIssues({ project, source });
	const allIssues = [
		...projectPreflightIssues,
		...variants.flatMap((variant) => [
			...variant.preflight.blockers,
			...variant.preflight.warnings,
		]),
	];
	const blockers = allIssues.filter((issue) => issue.severity === "blocker");
	const warnings = allIssues.filter((issue) => issue.severity === "warning");
	const payload: Omit<ExportManifest, "manifestId"> = {
		kind: "visioncut.export-manifest",
		schemaVersion: EXPORT_MANIFEST_SCHEMA_VERSION,
		project: {
			id: project.id,
			name: project.name,
			version: project.version,
			sourceDurationSeconds: project.durationSeconds,
			canvasSize: { ...project.canvasSize },
			fps: project.fps,
		},
		sourceEvidence: {
			sceneId: timeline.sceneId,
			sceneName: timeline.sceneName,
			media: source.media,
			timeline: source.timeline,
		},
		intent: { fileNameStem, variants },
		preflight: {
			canExportManifestJson: true,
			readyForVideoRenderHandoff: blockers.length === 0,
			blockers,
			warnings,
		},
		localCapabilityBoundary: {
			availableArtifacts: [
				{
					kind: "project-json",
					fileName: `${fileNameStem}_visioncut-project.json`,
				},
				{
					kind: "production-manifest-json",
					fileName: `${fileNameStem}_visioncut-export-manifest.json`,
				},
			],
			videoRendering: {
				state: "not-executed",
				performedByThisModel: false,
				executorRequirement: "existing-render-engine-or-external-worker",
				renderedFiles: [],
			},
			notice:
				"This local domain model exports project or production-manifest JSON only. Video rendering must be performed by the existing render engine or an external worker.",
		},
	};
	const manifest: ExportManifest = {
		...payload,
		manifestId: deterministicId({ prefix: "export_manifest", value: payload }),
	};
	assertExportManifestInvariants({ manifest });
	return deepFreeze(manifest);
}

export function serializeExportManifest({
	manifest,
	space = 2,
}: {
	manifest: ExportManifest;
	space?: number;
}): string {
	assertExportManifestInvariants({ manifest });
	if (!Number.isSafeInteger(space) || space < 0 || space > 10) {
		throw new ExportManifestInvariantError(
			"JSON indentation must be an integer between 0 and 10.",
		);
	}
	return JSON.stringify(manifest, null, space);
}
