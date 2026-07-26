import type { MediaIndex } from "./media-index";
import {
	createRoughCutPlan,
	type RoughCutEvidenceInterval,
	type RoughCutOptions,
	type RoughCutPlan,
	type RoughCutTimelineClip,
} from "./rough-cut-plan";

export function mediaIndexToRoughCutEvidence({
	index,
}: {
	index: MediaIndex;
}): readonly RoughCutEvidenceInterval[] {
	return Object.freeze(
		index.audioActivityCandidates
			.filter((candidate) => candidate.candidateType === "silence")
			.map((candidate) =>
				Object.freeze({
					evidenceId: candidate.findingId,
					assetId: index.assetId,
					kind: "low-audio-energy" as const,
					startSeconds: candidate.timeRange.startSeconds,
					endSeconds: candidate.timeRange.endSeconds,
					confidence: candidate.confidence.score,
					method: candidate.algorithmVersion,
				}),
			),
	);
}

export function createRoughCutPlanFromMediaIndex({
	index,
	assetFingerprint,
	clip,
	options,
	createdAt,
}: {
	index: MediaIndex;
	assetFingerprint: string;
	clip: RoughCutTimelineClip;
	options?: Partial<RoughCutOptions>;
	createdAt: string;
}): RoughCutPlan {
	if (index.assetId !== clip.assetId) {
		throw new TypeError(
			"MediaIndex and timeline clip must reference the same asset.",
		);
	}
	return createRoughCutPlan({
		clip,
		evidence: mediaIndexToRoughCutEvidence({ index }),
		evidenceArtifact: {
			mediaIndexId: index.mediaIndexId,
			assetFingerprint,
			algorithmVersion: index.algorithm.version,
		},
		options,
		createdAt,
	});
}
