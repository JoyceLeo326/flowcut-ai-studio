import { describe, expect, test } from "bun:test";
import {
	EXPORT_ASPECT_RATIOS,
	ExportManifestInvariantError,
	assertExportManifestInvariants,
	createExportManifest,
	serializeExportManifest,
	type CreateExportManifestInput,
	type ExportIssueCode,
} from "./export-manifest";

function completeInput(): CreateExportManifestInput {
	return {
		project: {
			id: "project-launch-01",
			name: "VisionCut Launch Film",
			version: 7,
			durationSeconds: 30,
			canvasSize: { width: 1920, height: 1080 },
			fps: 30,
		},
		media: [
			{
				id: "video-a",
				name: "Interview A.mp4",
				type: "video",
				sizeBytes: 10_000,
				durationSeconds: 30,
				width: 1920,
				height: 1080,
				fps: 30,
				hasAudio: true,
			},
			{
				id: "cover-a",
				name: "Cover.png",
				type: "image",
				sizeBytes: 2_000,
				width: 1600,
				height: 900,
			},
		],
		timeline: {
			sceneId: "scene-main",
			sceneName: "Main scene",
			tracks: [
				{
					id: "video-main",
					name: "Main video",
					type: "video",
					elements: [
						{
							id: "video-element-a",
							name: "Interview A",
							type: "video",
							mediaId: "video-a",
							startTimeSeconds: 0,
							durationSeconds: 30,
							sourceAudioEnabled: true,
						},
					],
				},
				{
					id: "captions",
					name: "Chinese captions",
					type: "text",
					role: "captions",
					elements: [
						{
							id: "caption-1",
							name: "Caption cue 1",
							type: "text",
							role: "caption",
							startTimeSeconds: 0,
							durationSeconds: 4,
						},
					],
				},
			],
		},
		variants: [
			{
				id: "landscape",
				label: "Landscape master",
				platform: "youtube",
				aspectRatio: "16:9",
				subtitles: {
					mode: "sidecar",
					language: "zh-CN",
					source: "timeline-captions",
					format: "srt",
				},
				audio: {
					mode: "include",
					required: true,
					channels: "stereo",
					targetLoudnessLufs: -14,
				},
				cover: {
					source: "media-asset",
					required: true,
					mediaId: "cover-a",
					format: "png",
				},
			},
			{
				id: "vertical",
				label: "Vertical cut",
				platform: "douyin",
				aspectRatio: "9:16",
				targetDurationSeconds: 20,
				subtitles: {
					mode: "burn-in",
					language: "zh-CN",
					source: "timeline-captions",
				},
				audio: { mode: "include", required: true },
				cover: {
					source: "timeline-frame",
					required: true,
					atSeconds: 2,
				},
			},
		],
	};
}

function issueCodes(input: CreateExportManifestInput): ExportIssueCode[] {
	const manifest = createExportManifest(input);
	return [...manifest.preflight.blockers, ...manifest.preflight.warnings].map(
		(issue) => issue.code,
	);
}

describe("VisionCut Export Center manifest", () => {
	test("derives deterministic multi-variant intent from real metadata without claiming a render", () => {
		const input = completeInput();
		const first = createExportManifest(input);
		const second = createExportManifest(completeInput());

		expect(first).toEqual(second);
		expect(first.manifestId).toBe(second.manifestId);
		expect(first.sourceEvidence.media).toEqual({
			total: 2,
			video: 1,
			image: 1,
			audio: 0,
			totalKnownBytes: 12_000,
			ids: ["cover-a", "video-a"],
		});
		expect(first.sourceEvidence.timeline).toMatchObject({
			durationSeconds: 30,
			trackCount: 2,
			elementCount: 2,
			activeVisualElementCount: 2,
			captionElementCount: 1,
			hasAudioSource: true,
		});
		expect(first.intent.variants).toHaveLength(2);
		expect(first.intent.variants[0].plannedFiles).toEqual({
			video: "VisionCut-Launch-Film_Landscape-master_youtube_16x9.mp4",
			subtitles: "VisionCut-Launch-Film_Landscape-master_youtube_16x9.srt",
			cover: "VisionCut-Launch-Film_Landscape-master_youtube_16x9-cover.png",
		});
		expect(first.intent.variants[1].dimensions).toEqual({
			width: 1080,
			height: 1920,
		});
		expect(
			first.localCapabilityBoundary.availableArtifacts.map((item) => item.kind),
		).toEqual(["project-json", "production-manifest-json"]);
		expect(first.localCapabilityBoundary.videoRendering).toEqual({
			state: "not-executed",
			performedByThisModel: false,
			executorRequirement: "existing-render-engine-or-external-worker",
			renderedFiles: [],
		});
		expect(first.localCapabilityBoundary.notice).toContain("JSON only");
		expect(first.localCapabilityBoundary.notice).toContain(
			"existing render engine",
		);
		expect(first.preflight.readyForVideoRenderHandoff).toBe(true);
		expect(() =>
			assertExportManifestInvariants({ manifest: first }),
		).not.toThrow();
	});

	test("supports all four aspect ratios across generic variants", () => {
		const input = completeInput();
		const manifest = createExportManifest({
			...input,
			variants: EXPORT_ASPECT_RATIOS.map((aspectRatio, index) => ({
				id: `variant-${index + 1}`,
				label: `Variant ${aspectRatio}`,
				platform: "generic" as const,
				aspectRatio,
				audio: { mode: "include" as const, required: false },
			})),
		});

		expect(
			manifest.intent.variants.map((variant) => variant.aspectRatio),
		).toEqual(["16:9", "9:16", "1:1", "4:5"]);
		expect(
			manifest.intent.variants.map((variant) => variant.dimensions),
		).toEqual([
			{ width: 1920, height: 1080 },
			{ width: 1080, height: 1920 },
			{ width: 1080, height: 1080 },
			{ width: 1080, height: 1350 },
		]);
	});

	test("blocks profile-incompatible platform combinations and labels defaults as non-live policy", () => {
		const input = completeInput();
		const manifest = createExportManifest({
			...input,
			variants: [
				{
					id: "invalid-douyin",
					label: "Invalid Douyin landscape",
					platform: "douyin",
					aspectRatio: "16:9",
					container: "webm",
				},
			],
		});
		const variant = manifest.intent.variants[0];

		expect(variant.platformConstraint.livePlatformPolicyChecked).toBe(false);
		expect(variant.platformConstraint.profile).toBe(
			"visioncut-local-delivery-defaults/v1",
		);
		expect(variant.preflight.blockers.map((issue) => issue.code)).toEqual([
			"PLATFORM_ASPECT_RATIO_UNSUPPORTED",
			"PLATFORM_CONTAINER_UNSUPPORTED",
		]);
		expect(manifest.preflight.readyForVideoRenderHandoff).toBe(false);
	});

	test("blocks missing required subtitle, audio, and cover evidence", () => {
		const input = completeInput();
		const withoutCaptionAndAudio = {
			...input,
			media: input.media.map((item) =>
				item.id === "video-a" ? { ...item, hasAudio: false } : item,
			),
			timeline: {
				...input.timeline,
				tracks: input.timeline.tracks.filter(
					(track) => track.id !== "captions",
				),
			},
			variants: [
				{
					id: "requirements",
					label: "Required delivery",
					platform: "generic" as const,
					aspectRatio: "16:9" as const,
					subtitles: {
						mode: "burn-in" as const,
						language: "zh-CN",
						source: "timeline-captions" as const,
					},
					audio: { mode: "include" as const, required: true },
					cover: { source: "none" as const, required: true },
				},
			],
		};
		const codes = issueCodes(withoutCaptionAndAudio);

		expect(codes).toContain("TIMELINE_CAPTIONS_MISSING");
		expect(codes).toContain("REQUIRED_AUDIO_MISSING");
		expect(codes).toContain("REQUIRED_COVER_MISSING");
	});

	test("checks cover references and timeline-frame boundaries", () => {
		const input = completeInput();
		const manifest = createExportManifest({
			...input,
			variants: [
				{
					id: "late-frame",
					label: "Late frame",
					platform: "generic",
					aspectRatio: "16:9",
					cover: {
						source: "timeline-frame",
						required: true,
						atSeconds: 30.01,
					},
				},
				{
					id: "missing-cover",
					label: "Missing cover",
					platform: "generic",
					aspectRatio: "1:1",
					cover: {
						source: "media-asset",
						required: true,
						mediaId: "not-present",
					},
				},
				{
					id: "audio-cover",
					label: "Audio cover",
					platform: "generic",
					aspectRatio: "4:5",
					cover: {
						source: "media-asset",
						required: true,
						mediaId: "audio-cover",
					},
				},
			],
			media: [
				...input.media,
				{ id: "audio-cover", name: "Music.wav", type: "audio" },
			],
		});

		expect(manifest.preflight.blockers.map((issue) => issue.code)).toEqual([
			"COVER_FRAME_OUT_OF_RANGE",
			"COVER_MEDIA_MISSING",
			"COVER_MEDIA_NOT_VISUAL",
		]);
	});

	test("records external subtitle metadata without claiming the file was inspected", () => {
		const input = completeInput();
		const manifest = createExportManifest({
			...input,
			variants: [
				{
					id: "external-subtitles",
					label: "External subtitles",
					platform: "generic",
					aspectRatio: "16:9",
					subtitles: {
						mode: "sidecar",
						language: "en-US",
						source: "external-file",
						externalFileName: "launch.en.vtt",
						format: "vtt",
					},
				},
			],
		});

		expect(manifest.intent.variants[0].requirements.subtitles).toEqual({
			mode: "sidecar",
			language: "en-US",
			source: "external-file",
			externalFileName: "launch.en.vtt",
			format: "vtt",
		});
		expect(manifest.preflight.warnings.map((issue) => issue.code)).toContain(
			"EXTERNAL_SUBTITLE_NOT_VERIFIED",
		);
	});

	test("produces deeply immutable, serializable, IndexedDB-safe plain data", () => {
		const input = completeInput();
		const inputBefore = JSON.stringify(input);
		const manifest = createExportManifest(input);
		const serialized = serializeExportManifest({ manifest });
		const cloned = structuredClone(manifest);

		expect(JSON.stringify(input)).toBe(inputBefore);
		expect(JSON.parse(serialized)).toEqual(manifest);
		expect(cloned).toEqual(manifest);
		expect(Object.isFrozen(manifest)).toBe(true);
		expect(Object.isFrozen(manifest.intent.variants)).toBe(true);
		expect(Object.isFrozen(manifest.intent.variants[0].requirements)).toBe(
			true,
		);
		expect(serialized).not.toContain("createdAt");
		expect(serialized).not.toContain("blob:");
		expect(serialized).not.toContain('rendered":true');
	});

	test("blocks an empty project while still allowing an honest JSON manifest", () => {
		const input = completeInput();
		const manifest = createExportManifest({
			...input,
			project: { ...input.project, durationSeconds: 0 },
			media: [],
			timeline: { ...input.timeline, tracks: [] },
			variants: [
				{
					id: "empty",
					label: "Empty delivery",
					platform: "generic",
					aspectRatio: "16:9",
				},
			],
		});

		expect(manifest.preflight.blockers.map((issue) => issue.code)).toEqual([
			"NO_MEDIA_ASSETS",
			"EMPTY_TIMELINE",
		]);
		expect(manifest.preflight.canExportManifestJson).toBe(true);
		expect(manifest.preflight.readyForVideoRenderHandoff).toBe(false);
		expect(manifest.intent.variants[0].targetDurationSeconds).toBe(0);
		expect(serializeExportManifest({ manifest })).toContain(
			'"state": "not-executed"',
		);
	});

	test("rejects illegal structural combinations and boundary overflow", () => {
		const input = completeInput();
		expect(() => createExportManifest({ ...input, variants: [] })).toThrow(
			ExportManifestInvariantError,
		);
		expect(() =>
			createExportManifest({
				...input,
				variants: Array.from({ length: 9 }, (_, index) => ({
					id: `variant-${index}`,
					label: `Variant ${index}`,
					platform: "generic" as const,
					aspectRatio: "16:9" as const,
				})),
			}),
		).toThrow("between 1 and 8 variants");
		expect(() =>
			createExportManifest({
				...input,
				variants: [
					input.variants[0],
					{ ...input.variants[1], id: "landscape" },
				],
			}),
		).toThrow("variant IDs must be unique");
		expect(() =>
			createExportManifest({
				...input,
				variants: [
					{
						...input.variants[0],
						subtitles: {
							mode: "sidecar",
							language: "en-US",
							source: "external-file",
							externalFileName: "../captions.srt",
						},
					},
				],
			}),
		).toThrow("base file name");
		expect(() =>
			createExportManifest({
				...input,
				timeline: {
					...input.timeline,
					tracks: [
						{
							id: "wrong-track",
							name: "Wrong track",
							type: "audio",
							elements: [
								{
									id: "wrong-element",
									name: "Wrong element",
									type: "video",
									mediaId: "video-a",
									startTimeSeconds: 0,
									durationSeconds: 1,
								},
							],
						},
					],
				},
			}),
		).toThrow("invalid for audio track");
	});
});
