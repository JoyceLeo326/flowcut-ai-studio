import type { NextConfig } from "next";
import path from "node:path";
import { withBotId } from "botid/next/config";
import { withContentCollections } from "@content-collections/next";

const securityHeaders = [
	{
		key: "Content-Security-Policy",
		value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
	},
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "X-Frame-Options", value: "DENY" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{
		key: "Permissions-Policy",
		value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
	},
	...(process.env.NODE_ENV === "production"
		? [
				{
					key: "Strict-Transport-Security",
					value: "max-age=31536000; includeSubDomains",
				},
			]
		: []),
] as const;

const nextConfig: NextConfig = {
	async headers() {
		return [{ source: "/(.*)", headers: [...securityHeaders] }];
	},
	async redirects() {
		return [
			"/blog/:path*",
			"/brand",
			"/changelog/:path*",
			"/contributors",
			"/roadmap",
			"/sponsors",
		].map((source) => ({
			source,
			destination: "/projects",
			permanent: false,
		}));
	},
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	reactStrictMode: true,
	productionBrowserSourceMaps: true,
	output: "standalone",
	turbopack: {
		root: path.resolve(__dirname, "../.."),
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "api.openverse.org",
			},
			{
				protocol: "https",
				hostname: "plus.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "api.iconify.design",
			},
			{
				protocol: "https",
				hostname: "api.simplesvg.com",
			},
			{
				protocol: "https",
				hostname: "api.unisvg.com",
			},
			{
				protocol: "https",
				hostname: "cdn.brandfetch.io",
			},
		],
	},
};

export default withContentCollections(withBotId(nextConfig));
