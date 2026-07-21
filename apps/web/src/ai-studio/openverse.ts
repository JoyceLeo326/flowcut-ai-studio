export interface OpenverseSearchItem {
	id: string;
	title: string;
	creator: string;
	license: string;
	thumbnailUrl: string;
	assetUrl: string;
	sourceUrl: string;
}

export interface OpenverseSearchResult {
	total: number;
	items: OpenverseSearchItem[];
}

interface OpenverseResponseItem {
	id?: unknown;
	title?: unknown;
	creator?: unknown;
	license?: unknown;
	license_version?: unknown;
	thumbnail?: unknown;
	url?: unknown;
	foreign_landing_url?: unknown;
}

interface OpenverseResponse {
	result_count?: unknown;
	results?: unknown;
}

function isOpenverseResponseItem(
	value: unknown,
): value is OpenverseResponseItem {
	return typeof value === "object" && value !== null;
}

function boundedInteger({
	value,
	min,
	max,
}: {
	value: number;
	min: number;
	max: number;
}): number {
	const safeValue = Number.isFinite(value) ? Math.round(value) : min;
	return Math.min(max, Math.max(min, safeValue));
}

export function buildOpenverseUrl({
	query,
	page,
	pageSize,
}: {
	query: string;
	page: number;
	pageSize: number;
}): URL {
	const url = new URL("https://api.openverse.org/v1/images/");
	url.searchParams.set("q", query.trim().slice(0, 120));
	url.searchParams.set(
		"page",
		String(boundedInteger({ value: page + 1, min: 1, max: 250 })),
	);
	url.searchParams.set(
		"page_size",
		String(boundedInteger({ value: pageSize, min: 1, max: 40 })),
	);
	url.searchParams.set("license_type", "commercial");
	url.searchParams.set("mature", "false");
	return url;
}

function readableLicense({
	license,
	version,
}: {
	license: string;
	version?: string;
}): string {
	const label = license.toUpperCase().replaceAll("-", " ");
	return version ? `CC ${label} ${version}`.replace("CC CC", "CC") : label;
}

export function normalizeOpenverseResponse(
	value: OpenverseResponse,
): OpenverseSearchResult {
	const sourceItems = Array.isArray(value.results)
		? value.results.filter(isOpenverseResponseItem)
		: [];
	const items = sourceItems.flatMap((item): OpenverseSearchItem[] => {
		if (
			typeof item.id !== "string" ||
			typeof item.thumbnail !== "string" ||
			typeof item.url !== "string" ||
			typeof item.foreign_landing_url !== "string"
		) {
			return [];
		}
		const rawLicense =
			typeof item.license === "string" ? item.license : "unknown";
		return [
			{
				id: item.id,
				title:
					typeof item.title === "string" && item.title.trim()
						? item.title.trim()
						: "未命名素材",
				creator:
					typeof item.creator === "string" && item.creator.trim()
						? item.creator.trim()
						: "未知作者",
				license: readableLicense({
					license: rawLicense,
					version:
						typeof item.license_version === "string"
							? item.license_version
							: undefined,
				}),
				thumbnailUrl: item.thumbnail,
				assetUrl: item.url,
				sourceUrl: item.foreign_landing_url,
			},
		];
	});

	return {
		total:
			typeof value.result_count === "number" &&
			Number.isFinite(value.result_count)
				? value.result_count
				: items.length,
		items,
	};
}
