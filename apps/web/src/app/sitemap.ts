import { SITE_URL } from "@/site/brand";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
	return ["", "/projects", "/privacy", "/terms"].map((path) => ({
		url: `${SITE_URL}${path}`,
		lastModified: new Date(),
		changeFrequency: path === "" ? "weekly" : "monthly",
		priority: path === "" ? 1 : 0.6,
	}));
}
