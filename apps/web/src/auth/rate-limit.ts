import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { webEnv } from "@/env/web";

const redisUrl = webEnv.UPSTASH_REDIS_REST_URL;
const redisToken = webEnv.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
	throw new Error("Rate limiting requires Upstash Redis credentials");
}

const redis = new Redis({
	url: redisUrl,
	token: redisToken,
});

export const baseRateLimit = new Ratelimit({
	redis,
	limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 requests per minute
	analytics: true,
	prefix: "rate-limit",
});

export async function checkRateLimit({ request }: { request: Request }) {
	const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
	const { success } = await baseRateLimit.limit(ip);
	return { success, limited: !success };
}
