import { webEnv } from "@/env/web";
import { checkRateLimit } from "@/auth/rate-limit";
import { buildFreesoundSearchParams } from "@/sounds/freesound-search";
import {
	localSoundToSearchResult,
	searchLocalSounds,
} from "@/sounds/local-sound-library";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const searchParamsSchema = z.object({
	q: z.string().max(500, "Query too long").optional(),
	type: z.enum(["songs", "effects"]).optional(),
	page: z.coerce.number().int().min(1).max(1000).default(1),
	page_size: z.coerce.number().int().min(1).max(150).default(20),
	sort: z
		.enum(["downloads", "rating", "created", "score"])
		.default("downloads"),
	min_rating: z.coerce.number().min(0).max(5).default(3),
	commercial_only: z
		.enum(["true", "false"])
		.default("true")
		.transform((value) => value === "true"),
});

const freesoundResultSchema = z.object({
	id: z.number(),
	name: z.string(),
	description: z.string(),
	url: z.string().url(),
	previews: z
		.object({
			"preview-hq-mp3": z.string().url(),
			"preview-lq-mp3": z.string().url(),
			"preview-hq-ogg": z.string().url(),
			"preview-lq-ogg": z.string().url(),
		})
		.optional(),
	download: z.string().url().optional(),
	duration: z.number(),
	filesize: z.number(),
	type: z.string(),
	channels: z.number(),
	bitrate: z.number(),
	bitdepth: z.number(),
	samplerate: z.number(),
	username: z.string(),
	tags: z.array(z.string()),
	license: z.string(),
	created: z.string(),
	num_downloads: z.number().optional(),
	avg_rating: z.number().optional(),
	num_ratings: z.number().optional(),
});

const freesoundResponseSchema = z.object({
	count: z.number(),
	next: z.string().url().nullable(),
	previous: z.string().url().nullable(),
	results: z.array(freesoundResultSchema),
});

const transformedResultSchema = z.object({
	id: z.number(),
	name: z.string(),
	description: z.string(),
	url: z.string(),
	previewUrl: z.string().optional(),
	downloadUrl: z.string().optional(),
	duration: z.number(),
	filesize: z.number(),
	type: z.string(),
	channels: z.number(),
	bitrate: z.number(),
	bitdepth: z.number(),
	samplerate: z.number(),
	username: z.string(),
	tags: z.array(z.string()),
	license: z.string(),
	created: z.string(),
	downloads: z.number().optional(),
	rating: z.number().optional(),
	ratingCount: z.number().optional(),
});

const apiResponseSchema = z.object({
	count: z.number(),
	next: z.string().nullable(),
	previous: z.string().nullable(),
	results: z.array(transformedResultSchema),
	query: z.string().optional(),
	type: z.string(),
	page: z.number(),
	pageSize: z.number(),
	sort: z.string(),
	minRating: z.number().optional(),
});

function transformFreesoundResult(
	result: z.infer<typeof freesoundResultSchema>,
) {
	return {
		id: result.id,
		name: result.name,
		description: result.description,
		url: result.url,
		previewUrl:
			result.previews?.["preview-hq-mp3"] ||
			result.previews?.["preview-lq-mp3"],
		downloadUrl: result.download,
		duration: result.duration,
		filesize: result.filesize,
		type: result.type,
		channels: result.channels,
		bitrate: result.bitrate,
		bitdepth: result.bitdepth,
		samplerate: result.samplerate,
		username: result.username,
		tags: result.tags,
		license: result.license,
		created: result.created,
		downloads: result.num_downloads || 0,
		rating: result.avg_rating || 0,
		ratingCount: result.num_ratings || 0,
	};
}

export async function GET(request: NextRequest) {
	try {
		const { limited } = await checkRateLimit({ request });
		if (limited) {
			return NextResponse.json(
				{ error: "Too many requests" },
				{ headers: { "Retry-After": "60" }, status: 429 },
			);
		}

		const { searchParams } = new URL(request.url);

		const validationResult = searchParamsSchema.safeParse({
			q: searchParams.get("q") || undefined,
			type: searchParams.get("type") || undefined,
			page: searchParams.get("page") || undefined,
			page_size: searchParams.get("page_size") || undefined,
			sort: searchParams.get("sort") || undefined,
			min_rating: searchParams.get("min_rating") || undefined,
			commercial_only: searchParams.get("commercial_only") || undefined,
		});

		if (!validationResult.success) {
			return NextResponse.json(
				{
					error: "Invalid parameters",
					details: validationResult.error.flatten().fieldErrors,
				},
				{ status: 400 },
			);
		}

		const {
			q: query,
			type,
			page,
			page_size: pageSize,
			sort,
			min_rating,
			commercial_only,
		} = validationResult.data;
		const soundType = type || "effects";
		const localResults = searchLocalSounds({ query, type: soundType }).map(
			(sound) => localSoundToSearchResult({ sound }),
		);
		const apiKey = webEnv.FREESOUND_API_KEY;
		if (!apiKey) {
			return NextResponse.json({
				count: localResults.length,
				next: null,
				previous: null,
				results: page === 1 ? localResults : [],
				query: query || "",
				type: soundType,
				page,
				pageSize,
				sort,
				minRating: min_rating,
			});
		}

		const params = buildFreesoundSearchParams({
			query,
			type: soundType,
			page,
			pageSize,
			sort,
			minRating: min_rating,
			commercialOnly: commercial_only,
		});

		const response = await fetch(
			`https://freesound.org/apiv2/search/?${params.toString()}`,
			{ headers: { Authorization: `Token ${apiKey}` } },
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Freesound API error:", response.status, errorText);
			return NextResponse.json({
				count: localResults.length,
				next: null,
				previous: null,
				results: page === 1 ? localResults : [],
				query: query || "",
				type: soundType,
				page,
				pageSize,
				sort,
				minRating: min_rating,
				upstreamUnavailable: true,
			});
		}

		const rawData = await response.json();

		const freesoundValidation = freesoundResponseSchema.safeParse(rawData);
		if (!freesoundValidation.success) {
			console.error(
				"Invalid Freesound API response:",
				freesoundValidation.error,
			);
			return NextResponse.json({
				count: localResults.length,
				next: null,
				previous: null,
				results: page === 1 ? localResults : [],
				query: query || "",
				type: soundType,
				page,
				pageSize,
				sort,
				minRating: min_rating,
				upstreamUnavailable: true,
			});
		}

		const data = freesoundValidation.data;

		const transformedResults = [
			...(page === 1 ? localResults : []),
			...data.results.map(transformFreesoundResult),
		];

		const responseData = {
			count: data.count + localResults.length,
			next: data.next ? String(page + 1) : null,
			previous: data.previous ? String(page - 1) : null,
			results: transformedResults,
			query: query || "",
			type: soundType,
			page,
			pageSize,
			sort,
			minRating: min_rating,
		};

		const responseValidation = apiResponseSchema.safeParse(responseData);
		if (!responseValidation.success) {
			console.error(
				"Invalid API response structure:",
				responseValidation.error,
			);
			return NextResponse.json(
				{ error: "Internal response formatting error" },
				{ status: 500 },
			);
		}

		return NextResponse.json(responseValidation.data);
	} catch (error) {
		console.error("Error searching sounds:", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
