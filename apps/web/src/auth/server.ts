import { betterAuth, type RateLimit } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Redis } from "@upstash/redis";
import { db } from "@/db";
import { webEnv } from "@/env/web";

const redisUrl = webEnv.UPSTASH_REDIS_REST_URL;
const redisToken = webEnv.UPSTASH_REDIS_REST_TOKEN;
const authSecret = webEnv.BETTER_AUTH_SECRET;

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
				return value as RateLimit | undefined;
			},
			set: async (key, value) => {
				await redis.set(key, value);
			},
		},
	},
	baseURL: webEnv.NEXT_PUBLIC_SITE_URL,
	appName: "FlowCut AI Studio",
	trustedOrigins: [webEnv.NEXT_PUBLIC_SITE_URL],
});

export type Auth = typeof auth;
