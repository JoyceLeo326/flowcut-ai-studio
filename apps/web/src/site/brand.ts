export const SITE_URL =
	process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3200";

export const SITE_INFO = {
	title: "FlowCut AI Studio",
	description:
		"A local-first video editor with reviewable AI edit plans and an optional ChatCut cloud workflow.",
	url: SITE_URL,
	openGraphImage: "/open-graph/default.jpg",
	twitterImage: "/open-graph/default.jpg",
	favicon: "/favicon.ico",
};

export const DEFAULT_LOGO_URL = "/icons/favicon-96x96.png";
