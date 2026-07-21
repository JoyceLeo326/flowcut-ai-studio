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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseSearchItem(value: unknown): OpenverseSearchItem | null {
	if (!isRecord(value)) return null;
	const fields = [
		"id",
		"title",
		"creator",
		"license",
		"thumbnailUrl",
		"assetUrl",
		"sourceUrl",
	] as const;
	if (fields.some((field) => typeof value[field] !== "string")) return null;
	return {
		id: String(value.id),
		title: String(value.title),
		creator: String(value.creator),
		license: String(value.license),
		thumbnailUrl: String(value.thumbnailUrl),
		assetUrl: String(value.assetUrl),
		sourceUrl: String(value.sourceUrl),
	};
}

export function parseOpenverseSearchResult(
	value: unknown,
): OpenverseSearchResult | null {
	if (!isRecord(value) || typeof value.total !== "number") return null;
	if (!Array.isArray(value.items)) return null;
	const items = value.items.flatMap((item) => {
		const parsed = parseSearchItem(item);
		return parsed ? [parsed] : [];
	});
	if (items.length !== value.items.length) return null;
	return { total: value.total, items };
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
	value: unknown,
): OpenverseSearchResult {
	const response = isRecord(value) ? value : {};
	const sourceItems = Array.isArray(response.results)
		? response.results.filter(isOpenverseResponseItem)
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
			typeof response.result_count === "number" &&
			Number.isFinite(response.result_count)
				? response.result_count
				: items.length,
		items,
	};
}
