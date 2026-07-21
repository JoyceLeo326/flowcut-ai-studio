import type { NextRequest } from "next/server";
import {
	buildOpenverseUrl,
	normalizeOpenverseResponse,
} from "@/ai-studio/openverse";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
	const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
	if (query.length < 2) {
		return Response.json(
			{ error: "请输入至少两个字符" },
			{ status: 400 },
		);
	}

	const page = Number(request.nextUrl.searchParams.get("page") ?? 0);
	const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? 24);
	const upstreamUrl = buildOpenverseUrl({ query, page, pageSize });

	try {
		const upstream = await fetch(upstreamUrl, {
			headers: {
				Accept: "application/json",
				"User-Agent":
					"FlowCut/0.1 (https://github.com/JoyceLeo326/flowcut-ai-studio)",
			},
			signal: AbortSignal.timeout(8_000),
		});
		if (!upstream.ok) {
			return Response.json(
				{ error: "开放素材服务暂时不可用" },
				{ status: 502 },
			);
		}
		const payload: unknown = await upstream.json();
		return Response.json(normalizeOpenverseResponse(payload), {
			headers: {
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
			},
		});
	} catch {
		return Response.json(
			{ error: "开放素材搜索超时，请稍后重试" },
			{ status: 504 },
		);
	}
}
