import { betterAuth, type RateLimit } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Redis } from "@upstash/redis";
import { db } from "@/db";
import { webEnv } from "@/env/web";

const redisUrl = webEnv.UPSTASH_REDIS_REST_URL;
const redisToken = webEnv.UPSTASH_REDIS_REST_TOKEN;
const authSecret = webEnv.BETTER_AUTH_SECRET;

function parseRateLimit(value: unknown): RateLimit | undefined {
	if (typeof value !== "object" || value === null) return undefined;

	const key = Reflect.get(value, "key");
	const count = Reflect.get(value, "count");
	const lastRequest = Reflect.get(value, "lastRequest");
	if (
		typeof key !== "string" ||
		typeof count !== "number" ||
		typeof lastRequest !== "number"
	) {
		return undefined;
	}

	return { key, count, lastRequest };
}

if (!redisUrl || !redisToken || !authSecret) {
	throw new Error(
		"Authentication requires BETTER_AUTH_SECRET and Upstash Redis credentials",
	);
}

const redis = new Redis({
	url: redisUrl,
	token: redisToken,
});

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		usePlural: true,
	}),
	secret: authSecret,
	user: {
		deleteUser: {
			enabled: true,
		},
	},
	emailAndPassword: {
		enabled: true,
	},
	rateLimit: {
		storage: "secondary-storage",
		customStorage: {
			get: async (key) => {
				const value = await redis.get(key);
				return parseRateLimit(value);
			},
			set: async (key, value) => {
				await redis.set(key, value);
			},
		},
	},
	baseURL: webEnv.NEXT_PUBLIC_SITE_URL,
	appName: "VisionCut AI",
	trustedOrigins: [webEnv.NEXT_PUBLIC_SITE_URL],
});

export type Auth = typeof auth;
