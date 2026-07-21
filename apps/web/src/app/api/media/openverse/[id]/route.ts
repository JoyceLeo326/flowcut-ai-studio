import {
	OpenverseDownloadError,
	proxyOpenverseImage,
} from "@/ai-studio/openverse-download";
import { checkRateLimit } from "@/auth/rate-limit";

export const dynamic = "force-dynamic";

interface OpenverseRouteContext {
	params: Promise<{ id: string }>;
}

// eslint-disable-next-line opencut/prefer-object-params -- Next.js Route Handlers require request and context parameters.
export async function GET(
	request: Request,
	{ params }: OpenverseRouteContext,
): Promise<Response> {
	const { limited } = await checkRateLimit({ request });
	if (limited) {
		return Response.json(
			{ error: "请求过于频繁，请稍后重试" },
			{ headers: { "Retry-After": "60" }, status: 429 },
		);
	}

	const { id } = await params;

	try {
		return await proxyOpenverseImage({ id });
	} catch (error) {
		const downloadError =
			error instanceof OpenverseDownloadError
				? error
				: new OpenverseDownloadError({
						code: "openverse_upstream_error",
						message: "Unable to download the Openverse image",
						status: 502,
					});
		return Response.json(
			{ code: downloadError.code, error: downloadError.message },
			{
				headers: { "Cache-Control": "no-store" },
				status: downloadError.status,
			},
		);
	}
}
