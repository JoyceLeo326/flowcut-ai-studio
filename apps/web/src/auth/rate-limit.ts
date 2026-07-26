import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { webEnv } from "@/env/web";

const redisUrl = webEnv.UPSTASH_REDIS_REST_URL;
const redisToken = webEnv.UPSTASH_REDIS_REST_TOKEN;
const FALLBACK_WINDOW_MS = 60_000;
const FALLBACK_REQUEST_LIMIT = 30;
const FALLBACK_MAX_IDENTIFIERS = 10_000;

interface FallbackRateLimitEntry {
	count: number;
	resetAt: number;
}

const fallbackEntries = new Map<string, FallbackRateLimitEntry>();

export const baseRateLimit =
	redisUrl && redisToken
		? new Ratelimit({
				redis: new Redis({ url: redisUrl, token: redisToken }),
				limiter: Ratelimit.slidingWindow(100, "1 m"),
				analytics: true,
				prefix: "visioncut-rate-limit",
			})
		: null;

function requestIdentifier(request: Request): string {
	const forwardedIp = request.headers
		.get("x-forwarded-for")
		?.split(",")[0]
		?.trim();
	return forwardedIp || request.headers.get("x-real-ip") || "unknown-client";
}

function consumeFallbackLimit({
	identifier,
	now = Date.now(),
}: {
	identifier: string;
	now?: number;
}): boolean {
	const current = fallbackEntries.get(identifier);
	if (current === undefined || current.resetAt <= now) {
		if (fallbackEntries.size >= FALLBACK_MAX_IDENTIFIERS) {
			for (const [key, entry] of fallbackEntries) {
				if (entry.resetAt <= now) fallbackEntries.delete(key);
			}
			if (fallbackEntries.size >= FALLBACK_MAX_IDENTIFIERS) {
				const oldestIdentifier = fallbackEntries.keys().next().value;
				if (oldestIdentifier !== undefined) {
					fallbackEntries.delete(oldestIdentifier);
				}
			}
		}
		fallbackEntries.set(identifier, {
			count: 1,
			resetAt: now + FALLBACK_WINDOW_MS,
		});
		return true;
	}
	if (current.count >= FALLBACK_REQUEST_LIMIT) return false;
	current.count += 1;
	return true;
}

export async function checkRateLimit({ request }: { request: Request }) {
	const identifier = requestIdentifier(request);
	if (!baseRateLimit) {
		const success = consumeFallbackLimit({ identifier });
		return {
			configured: false,
			fallback: true,
			limited: !success,
			success,
		} as const;
	}

	const { success } = await baseRateLimit.limit(identifier);
	return {
		configured: true,
		fallback: false,
		limited: !success,
		success,
	} as const;
}
