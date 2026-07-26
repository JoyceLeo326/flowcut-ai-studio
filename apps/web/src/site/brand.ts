const vercelSiteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
	? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
	: undefined;

export const SITE_URL =
	process.env.NEXT_PUBLIC_SITE_URL ?? vercelSiteUrl ?? "http://localhost:3200";

export const SITE_INFO = {
	title: "FlowCut AI Studio",
	description:
		"FlowCut AI Studio turns a creative brief and source media into a reviewable video plan, editable timeline, and export-ready project.",
	url: SITE_URL,
	openGraphImage: "/open-graph/default.jpg",
	twitterImage: "/open-graph/default.jpg",
	favicon: "/favicon.ico",
};

export const DEFAULT_LOGO_URL = "/icons/favicon-96x96.png";
