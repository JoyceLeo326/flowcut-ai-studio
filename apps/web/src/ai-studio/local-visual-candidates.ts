import type { VisualGenerationJob, VisualUseCase } from "./catalog";
import type { VisionCutGeneratedAsset } from "./generated-library";

export interface LocalVisualCandidate {
	readonly candidateId: string;
	readonly job: VisualGenerationJob;
	readonly asset: VisionCutGeneratedAsset;
	readonly score: number;
	readonly reasons: readonly string[];
}

const CATEGORY_PREFERENCES: Record<VisualUseCase, readonly string[]> = {
	storyboard: ["documentary-human", "event-crowd", "architecture-space"],
	broll: ["city-night", "travel-place", "food-life", "event-crowd"],
	cover: ["talking-head", "product-detail", "sports-action"],
	background: ["city-night", "travel-place", "architecture-space"],
	"product-shot": ["product-detail", "tech-device", "food-life"],
	transition: ["city-night", "sports-action", "architecture-space"],
};

function searchTokens(value: string): readonly string[] {
	return value
		.normalize("NFKC")
		.toLocaleLowerCase()
		.split(/[\s,.;:!?，。；：！？、/\\|()[\]{}]+/u)
		.map((token) => token.trim())
		.filter((token) => token.length >= 2)
		.slice(0, 32);
}

function scoreAsset({
	asset,
	job,
}: {
	asset: VisionCutGeneratedAsset;
	job: VisualGenerationJob;
}): { score: number; reasons: readonly string[] } {
	const haystack = [
		asset.title,
		asset.category,
		asset.scene,
		asset.shotScale,
		asset.useCase,
		asset.styleWorld,
		asset.alt,
	]
		.join(" ")
		.normalize("NFKC")
		.toLocaleLowerCase();
	const reasons: string[] = [];
	let score = 0;

	if (asset.aspectRatio === job.aspectRatio) {
		score += 12;
		reasons.push("画幅一致");
	}
	if (CATEGORY_PREFERENCES[job.useCase].includes(asset.categoryId)) {
		score += 8;
		reasons.push("用途匹配");
	}

	const matchedTokens = searchTokens(job.prompt).filter((token) =>
		haystack.includes(token),
	);
	if (matchedTokens.length > 0) {
		score += Math.min(18, matchedTokens.length * 3);
		reasons.push(`语义命中 ${matchedTokens.slice(0, 3).join("/")}`);
	}

	return { score, reasons };
}

export function buildLocalVisualCandidates({
	jobs,
	library,
}: {
	readonly jobs: readonly VisualGenerationJob[];
	readonly library: readonly VisionCutGeneratedAsset[];
}): readonly LocalVisualCandidate[] {
	const remaining = new Map(library.map((asset) => [asset.id, asset] as const));
	const candidates: LocalVisualCandidate[] = [];

	for (const job of jobs) {
		const ranked = [...remaining.values()]
			.map((asset) => ({ asset, ...scoreAsset({ asset, job }) }))
			.sort(
				(left, right) =>
					right.score - left.score ||
					left.asset.id.localeCompare(right.asset.id),
			);
		const match = ranked[0];
		if (!match) break;
		remaining.delete(match.asset.id);
		candidates.push({
			candidateId: `${job.id}:${match.asset.id}`,
			job,
			asset: match.asset,
			score: match.score,
			reasons:
				match.reasons.length > 0 ? match.reasons : ["来自可用原创素材储备"],
		});
	}

	return candidates;
}
