import type { VisionCutGeneratedAsset } from "./generated-library";

export interface GeneratedAssetImportFailure {
	readonly assetId: string;
	readonly title: string;
	readonly message: string;
}

export interface GeneratedAssetImportPreparation {
	readonly files: readonly File[];
	readonly failures: readonly GeneratedAssetImportFailure[];
}

export type GeneratedAssetFetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export async function prepareGeneratedAssetFiles({
	assets,
	fetchImpl = fetch,
}: {
	readonly assets: readonly VisionCutGeneratedAsset[];
	readonly fetchImpl?: GeneratedAssetFetch;
}): Promise<GeneratedAssetImportPreparation> {
	const uniqueAssets = [
		...new Map(assets.map((asset) => [asset.id, asset] as const)).values(),
	].slice(0, 20);
	const settled = await Promise.allSettled(
		uniqueAssets.map(async (asset) => {
			const response = await fetchImpl(asset.path, {
				cache: "force-cache",
				credentials: "same-origin",
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const blob = await response.blob();
			if (blob.size === 0) throw new Error("素材文件为空");
			return new File([blob], `${asset.slug}.webp`, {
				lastModified: 0,
				type: blob.type || "image/webp",
			});
		}),
	);
	const files: File[] = [];
	const failures: GeneratedAssetImportFailure[] = [];

	for (const [index, result] of settled.entries()) {
		const asset = uniqueAssets[index];
		if (!asset) continue;
		if (result.status === "fulfilled") {
			files.push(result.value);
		} else {
			failures.push({
				assetId: asset.id,
				title: asset.title,
				message:
					result.reason instanceof Error
						? result.reason.message
						: "无法读取素材文件",
			});
		}
	}

	return { files, failures };
}
