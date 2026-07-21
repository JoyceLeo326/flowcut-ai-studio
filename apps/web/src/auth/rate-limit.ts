import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { webEnv } from "@/env/web";

const redisUrl = webEnv.UPSTASH_REDIS_REST_URL;
const redisToken = webEnv.UPSTASH_REDIS_REST_TOKEN;

export const baseRateLimit =
	redisUrl && redisToken
		? new Ratelimit({
				redis: new Redis({ url: redisUrl, token: redisToken }),
				limiter: Ratelimit.slidingWindow(100, "1 m"),
				analytics: true,
				prefix: "visioncut-rate-limit",
			})
		: null;

export async function checkRateLimit({ request }: { request: Request }) {
	if (!baseRateLimit) {
		return { configured: false, limited: false, success: true } as const;
	}

	const forwardedIp = request.headers
		.get("x-forwarded-for")
		?.split(",")[0]
		?.trim();
	const identifier =
		forwardedIp || request.headers.get("x-real-ip") || "unknown-client";
	const { success } = await baseRateLimit.limit(identifier);
	return { configured: true, limited: !success, success } as const;
}
