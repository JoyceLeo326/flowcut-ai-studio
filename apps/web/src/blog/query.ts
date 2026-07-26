import type {
	Author,
	Category,
	MarbleAuthorList,
	MarbleCategoryList,
	Pagination,
	Post,
	MarblePost,
	MarblePostList,
	Tag,
	MarbleTagList,
} from "@/blog/types";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeSanitize from "rehype-sanitize";
import { z } from "zod";

const url =
	process.env.NEXT_PUBLIC_MARBLE_API_URL ?? "https://api.marblecms.com";
const key = process.env.MARBLE_WORKSPACE_KEY ?? "cmd4iw9mm0006l804kwqv0k46";

const EMPTY_PAGINATION: Pagination = {
	limit: 0,
	currpage: 1,
	nextPage: null,
	prevPage: null,
	totalItems: 0,
	totalPages: 0,
};

const EMPTY_POSTS: MarblePostList = {
	posts: [],
	pagination: EMPTY_PAGINATION,
};

const EMPTY_TAGS: MarbleTagList = {
	tags: [],
	pagination: EMPTY_PAGINATION,
};

const EMPTY_CATEGORIES: MarbleCategoryList = {
	categories: [],
	pagination: EMPTY_PAGINATION,
};

const EMPTY_AUTHORS: MarbleAuthorList = {
	authors: [],
	pagination: EMPTY_PAGINATION,
};

const paginationSchema: z.ZodType<Pagination> = z.object({
	limit: z.number().int().nonnegative(),
	currpage: z.number().int().positive(),
	nextPage: z.number().int().positive().nullable(),
	prevPage: z.number().int().positive().nullable(),
	totalItems: z.number().int().nonnegative(),
	totalPages: z.number().int().nonnegative(),
});

const authorSchema: z.ZodType<Author> = z.object({
	id: z.string(),
	name: z.string(),
	image: z.string(),
});

const categorySchema: z.ZodType<Category> = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
});

const tagSchema: z.ZodType<Tag> = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
});

const postSchema: z.ZodType<Post> = z.object({
	id: z.string(),
	slug: z.string(),
	title: z.string(),
	content: z.string(),
	description: z.string(),
	coverImage: z.string(),
	publishedAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	authors: z.array(authorSchema),
	category: categorySchema,
	tags: z.array(tagSchema),
	attribution: z
		.object({
			author: z.string(),
			url: z.string(),
		})
		.nullable(),
});

const marblePostListSchema: z.ZodType<MarblePostList> = z.object({
	posts: z.array(postSchema),
	pagination: paginationSchema,
});

const marblePostSchema: z.ZodType<MarblePost> = z.object({
	post: postSchema,
});

const marbleTagListSchema: z.ZodType<MarbleTagList> = z.object({
	tags: z.array(tagSchema),
	pagination: paginationSchema,
});

const marbleCategoryListSchema: z.ZodType<MarbleCategoryList> = z.object({
	categories: z.array(categorySchema),
	pagination: paginationSchema,
});

const marbleAuthorListSchema: z.ZodType<MarbleAuthorList> = z.object({
	authors: z.array(authorSchema),
	pagination: paginationSchema,
});

function isMarbleConfigured() {
	return ![
		"",
		"placeholder",
		"build-placeholder",
		"your_workspace_key_here",
	].includes(key);
}

async function fetchFromMarble<T>({
	endpoint,
	fallback,
	schema,
}: {
	endpoint: string;
	fallback: T;
	schema: z.ZodType<T>;
}): Promise<T> {
	if (!isMarbleConfigured()) {
		return fallback;
	}

	try {
		const response = await fetch(`${url}/${key}/${endpoint}`);
		if (!response.ok) {
			console.warn(
				`Failed to fetch ${endpoint}: ${response.status} ${response.statusText}`,
			);
			return fallback;
		}
		const payload: unknown = await response.json();
		const parsed = schema.safeParse(payload);
		if (!parsed.success) {
			console.warn(`Marble returned an invalid payload for ${endpoint}`);
			return fallback;
		}
		return parsed.data;
	} catch (error) {
		console.error(`Error fetching ${endpoint}:`, error);
		return fallback;
	}
}

export async function getPosts() {
	return fetchFromMarble<MarblePostList>({
		endpoint: "posts",
		fallback: EMPTY_POSTS,
		schema: marblePostListSchema,
	});
}

export async function getTags() {
	return fetchFromMarble<MarbleTagList>({
		endpoint: "tags",
		fallback: EMPTY_TAGS,
		schema: marbleTagListSchema,
	});
}

export async function getSinglePost({ slug }: { slug: string }) {
	return fetchFromMarble<MarblePost | null>({
		endpoint: `posts/${slug}`,
		fallback: null,
		schema: marblePostSchema.nullable(),
	});
}

export async function getCategories() {
	return fetchFromMarble<MarbleCategoryList>({
		endpoint: "categories",
		fallback: EMPTY_CATEGORIES,
		schema: marbleCategoryListSchema,
	});
}

export async function getAuthors() {
	return fetchFromMarble<MarbleAuthorList>({
		endpoint: "authors",
		fallback: EMPTY_AUTHORS,
		schema: marbleAuthorListSchema,
	});
}

export async function processHtmlContent({
	html,
}: {
	html: string;
}): Promise<string> {
	const processor = unified()
		.use(rehypeSanitize)
		.use(rehypeParse, { fragment: true })
		.use(rehypeSlug)
		.use(rehypeAutolinkHeadings, { behavior: "append" })
		.use(rehypeStringify);

	const file = await processor.process({ value: html, type: "html" });
	return String(file);
}
