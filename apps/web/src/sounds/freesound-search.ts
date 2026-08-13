export type SoundSearchType = "effects" | "songs";
export type SoundSearchSort = "downloads" | "rating" | "created" | "score";

const RESULT_FIELDS = [
	"id",
	"name",
	"description",
	"url",
	"previews",
	"download",
	"duration",
	"filesize",
	"type",
	"channels",
	"bitrate",
	"bitdepth",
	"samplerate",
	"username",
	"tags",
	"license",
	"created",
	"num_downloads",
	"avg_rating",
	"num_ratings",
].join(",");

function buildSortParameter({
	query,
	sort,
}: {
	query?: string;
	sort: SoundSearchSort;
}) {
	if (!query) return `${sort}_desc`;
	return sort === "score" ? "score" : `${sort}_desc`;
}

function buildSoundFilters({
	type,
	minRating,
	commercialOnly,
}: {
	type: SoundSearchType;
	minRating: number;
	commercialOnly: boolean;
}) {
	const filters = [
		type === "songs" ? "duration:[20.0 TO 600.0]" : "duration:[* TO 30.0]",
		`avg_rating:[${minRating} TO *]`,
	];
	if (commercialOnly) {
		filters.push('license:("Attribution" OR "Creative Commons 0")');
	}
	filters.push(
		type === "songs"
			? "(tag:music OR tag:instrumental OR tag:soundtrack OR tag:cinematic OR tag:beat OR tag:loop)"
			: "(tag:sound-effect OR tag:sfx OR tag:foley OR tag:ambient OR tag:nature OR tag:mechanical OR tag:electronic OR tag:impact OR tag:whoosh OR tag:explosion)",
	);
	return filters.join(" AND ");
}

export function buildFreesoundSearchParams({
	query,
	type,
	page,
	pageSize,
	sort,
	minRating,
	commercialOnly,
}: {
	query?: string;
	type: SoundSearchType;
	page: number;
	pageSize: number;
	sort: SoundSearchSort;
	minRating: number;
	commercialOnly: boolean;
}) {
	return new URLSearchParams({
		query: query || "",
		page: page.toString(),
		page_size: pageSize.toString(),
		sort: buildSortParameter({ query, sort }),
		fields: RESULT_FIELDS,
		filter: buildSoundFilters({ type, minRating, commercialOnly }),
	});
}
