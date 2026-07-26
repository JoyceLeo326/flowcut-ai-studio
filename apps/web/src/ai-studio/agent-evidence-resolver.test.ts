import { describe, expect, test } from "bun:test";
import {
	AGENT_EVIDENCE_PACKAGE_SCHEMA_VERSION,
	AGENT_EVIDENCE_RESOLVER_VERSION,
	AgentEvidenceResolverValidationError,
	assertAgentEvidencePackageInvariants,
	resolveAgentEvidence,
	type AgentEvidenceReference,
} from "./agent-evidence-resolver";
import { createMediaIndex, type MediaIndex } from "./media-index";
import {
	createTimelineTranscriptArtifact,
	type TimelineTranscriptArtifact,
} from "./transcript-artifact";

function createIndex(): MediaIndex {
	return createMediaIndex({
		assetId: "asset-interview",
		metadata: {
			durationSeconds: 12,
			hasVideo: true,
			hasAudio: true,
			videoWidth: 1920,
			videoHeight: 1080,
			nominalFrameRate: 30,
			fileSizeBytes: 12_000_000,
			mimeType: "video/mp4",
			source: {
				sourceId: "metadata-source",
				method: "html-media-element",
			},
		},
		videoFrameSamples: [
			{
				atSeconds: 0,
				differenceFromPrevious: 0,
				meanLuminance: 0.31,
				source: {
					sourceId: "frame-source",
					method: "canvas-2d-frame-sampler",
				},
			},
			{
				atSeconds: 2.5,
				differenceFromPrevious: 0.78,
				meanLuminance: 0.72,
				source: {
					sourceId: "frame-source",
					method: "canvas-2d-frame-sampler",
				},
			},
			{
				atSeconds: 7,
				differenceFromPrevious: 0.52,
				meanLuminance: 0.18,
				source: {
					sourceId: "frame-source",
					method: "canvas-2d-frame-sampler",
				},
			},
		],
		audioWindowSamples: [
			{
				startSeconds: 0,
				endSeconds: 0.5,
				rms: 0.004,
				peak: 0.012,
				source: {
					sourceId: "audio-source",
					method: "web-audio-api",
				},
			},
			{
				startSeconds: 0.5,
				endSeconds: 1,
				rms: 0.062,
				peak: 0.21,
				source: {
					sourceId: "audio-source",
					method: "web-audio-api",
				},
			},
		],
	});
}

function createTranscript({
	segmentCount = 2,
}: {
	segmentCount?: number;
} = {}): TimelineTranscriptArtifact {
	const segments = Array.from({ length: segmentCount }, (_, index) => ({
		text:
			segmentCount > 2
				? `Segment ${index} ${"evidence ".repeat(12)}`
				: index === 0
					? "Welcome to VisionCut."
					: "The evidence-backed cut starts here.",
		startSeconds: index * 1.5,
		endSeconds: index * 1.5 + 1.1,
	}));
	return createTimelineTranscriptArtifact({
		draft: {
			projectId: "project-evidence",
			sceneId: "scene-main",
			timelineId: "scene-main",
			captionTrackId: "track-captions",
			language: {
				code: "en",
				basis: "user-selected",
				verified: false,
			},
			provenance: "local-whisper",
			sourceMetadata: {
				kind: "local-whisper",
				runtimePackage: "@huggingface/transformers",
				modelId: "whisper-small",
				modelRepository: "onnx-community/whisper-small",
				audioSource: "active-timeline-mix",
				mediaStored: false,
				apiKeyStored: false,
			},
			fullText: segments.map((segment) => segment.text).join(" "),
			segments,
		},
		revision: 3,
		createdAt: "2026-07-27T02:00:00.000Z",
		previousArtifactFingerprint: null,
	});
}

function evidenceReferences({
	index,
	transcript,
}: {
	index: MediaIndex;
	transcript: TimelineTranscriptArtifact;
}): readonly AgentEvidenceReference[] {
	return [
		{
			evidenceId: "intent-r1",
			kind: "intent-spec",
			label: "IntentSpec revision 1",
			referenceId: "intent:project-evidence:r1",
			origin: "user-intent",
		},
		{
			evidenceId: "asset-main",
			kind: "asset-metadata",
			label: "Interview metadata",
			referenceId: index.assetId,
			origin: "project-metadata",
		},
		{
			evidenceId: "scene-main",
			kind: "scene-analysis",
			label: "Frame-change candidates",
			referenceId: index.mediaIndexId,
			origin: "imported-result",
		},
		{
			evidenceId: "visual-main",
			kind: "visual-analysis",
			label: "Numeric visual samples",
			referenceId: index.mediaIndexId,
			origin: "imported-result",
		},
		{
			evidenceId: "audio-main",
			kind: "audio-analysis",
			label: "Energy activity candidates",
			referenceId: index.mediaIndexId,
			origin: "imported-result",
		},
		{
			evidenceId: "transcript-main",
			kind: "transcript",
			label: "Transcript revision 3",
			referenceId: transcript.artifactId,
			origin: "imported-result",
		},
		{
			evidenceId: "performance-main",
			kind: "performance-data",
			label: "User-provided performance reference",
			referenceId: "performance:campaign-1",
			origin: "user-provided",
		},
	];
}

describe("versioned agent evidence resolver", () => {
	test("resolves deterministic segment, frame, luminance, and audio evidence with provenance", () => {
		const index = createIndex();
		const transcript = createTranscript();
		const references = evidenceReferences({ index, transcript });
		const first = resolveAgentEvidence({
			role: "director",
			evidenceReferences: references,
			mediaIndexes: [index],
			transcriptArtifact: transcript,
		});
		const second = resolveAgentEvidence({
			role: "director",
			evidenceReferences: [...references].reverse(),
			mediaIndexes: [index],
			transcriptArtifact: transcript,
		});

		expect(first.schemaVersion).toBe(AGENT_EVIDENCE_PACKAGE_SCHEMA_VERSION);
		expect(first.resolverVersion).toBe(AGENT_EVIDENCE_RESOLVER_VERSION);
		expect(first.fingerprint).toBe(second.fingerprint);
		expect(first).toEqual(second);
		expect(first.text).toContain('text="The evidence-backed cut starts here."');
		expect(first.text).toContain("differenceFromPrevious=0.780000");
		expect(first.text).toContain("meanLuminance=0.720000");
		expect(first.text).toContain("rms=0.062000");
		expect(first.text).toContain("peak=0.210000");
		expect(first.text).not.toContain("recognizedPerson");
		expect(first.text).not.toContain("detectedEmotion");
		expect(first.provenance).toContainEqual(
			expect.objectContaining({
				evidenceId: "transcript-main",
				sourceKind: "transcript-artifact",
				sourceFingerprint: transcript.contentFingerprint,
			}),
		);
		expect(first.provenance).toContainEqual(
			expect.objectContaining({
				evidenceId: "scene-main",
				sourceKind: "media-index",
				sourceId: index.mediaIndexId,
			}),
		);
		expect(Object.isFrozen(first)).toBe(true);
		assertAgentEvidencePackageInvariants({
			evidencePackage: first,
			expectedRole: "director",
			expectedEvidenceIds: references.map((reference) => reference.evidenceId),
		});
	});

	test("projects only evidence kinds accepted by each role", () => {
		const index = createIndex();
		const transcript = createTranscript();
		const references = evidenceReferences({ index, transcript });
		const camera = resolveAgentEvidence({
			role: "camera",
			evidenceReferences: references,
			mediaIndexes: [index],
			transcriptArtifact: transcript,
		});
		const sound = resolveAgentEvidence({
			role: "sound",
			evidenceReferences: references,
			mediaIndexes: [index],
			transcriptArtifact: transcript,
		});
		const growth = resolveAgentEvidence({
			role: "growth",
			evidenceReferences: references,
			mediaIndexes: [index],
			transcriptArtifact: transcript,
		});

		expect(camera.includedEvidenceIds).toEqual([
			"asset-main",
			"intent-r1",
			"scene-main",
			"visual-main",
		]);
		expect(camera.omittedEvidenceIds).toEqual([
			"audio-main",
			"performance-main",
			"transcript-main",
		]);
		expect(camera.text).toContain("meanLuminance=");
		expect(camera.text).not.toContain("Welcome to VisionCut");

		expect(sound.includedEvidenceIds).toEqual([
			"audio-main",
			"intent-r1",
			"transcript-main",
		]);
		expect(sound.text).toContain("rms=");
		expect(sound.text).toContain("Welcome to VisionCut");
		expect(sound.text).not.toContain("meanLuminance=");

		expect(growth.includedEvidenceIds).toEqual([
			"intent-r1",
			"performance-main",
		]);
		expect(growth.text).not.toContain("meanLuminance=");
		expect(growth.text).not.toContain("Welcome to VisionCut");
	});

	test("enforces a strict character budget without losing omission accounting", () => {
		const index = createIndex();
		const transcript = createTranscript({ segmentCount: 40 });
		const references = evidenceReferences({ index, transcript });
		const resolved = resolveAgentEvidence({
			role: "director",
			evidenceReferences: references,
			mediaIndexes: [index],
			transcriptArtifact: transcript,
			maxCharacters: 1_024,
		});

		expect(Array.from(resolved.text).length).toBeLessThanOrEqual(1_024);
		expect(resolved.budget.usedCharacters).toBe(
			Array.from(resolved.text).length,
		);
		expect(resolved.budget.truncated).toBe(true);
		expect(resolved.budget.omittedRecordCount).toBeGreaterThan(0);
		expect(
			resolved.limitations.some((limitation) =>
				limitation.includes("truncated"),
			),
		).toBe(true);
	});

	test("keeps an unresolved analysis reference as context without inventing payload", () => {
		const resolved = resolveAgentEvidence({
			role: "editor",
			evidenceReferences: [
				{
					evidenceId: "scene-missing",
					kind: "scene-analysis",
					label: "External scene label",
					referenceId: "media-index:missing",
					origin: "imported-result",
				},
			],
		});

		expect(resolved.text).toContain("sourcePayload=unresolved");
		expect(resolved.text).toContain('label="External scene label"');
		expect(resolved.text).not.toContain("meanLuminance=");
		expect(
			resolved.limitations.some((limitation) =>
				limitation.includes("no matching MediaIndex payload"),
			),
		).toBe(true);
	});

	test("rejects tampered package content and invalid budgets", () => {
		const index = createIndex();
		const transcript = createTranscript();
		const references = evidenceReferences({ index, transcript });
		const resolved = resolveAgentEvidence({
			role: "story",
			evidenceReferences: references,
			mediaIndexes: [index],
			transcriptArtifact: transcript,
		});
		const tampered = structuredClone(resolved);
		Reflect.set(tampered, "text", `${tampered.text}\nFabricated person: Alice`);

		expect(() =>
			assertAgentEvidencePackageInvariants({
				evidencePackage: tampered,
				expectedRole: "story",
				expectedEvidenceIds: references.map(
					(reference) => reference.evidenceId,
				),
			}),
		).toThrow(AgentEvidenceResolverValidationError);
		expect(() =>
			resolveAgentEvidence({
				role: "story",
				evidenceReferences: references,
				maxCharacters: 512,
			}),
		).toThrow(/between 1024 and 12000/iu);
	});
});
