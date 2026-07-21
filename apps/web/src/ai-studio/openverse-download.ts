export const MAX_OPENVERSE_IMAGE_BYTES = 20 * 1024 * 1024;
export const OPENVERSE_DOWNLOAD_TIMEOUT_MS = 8_000;

export type OpenverseFetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

type OpenverseDownloadStatus = 400 | 404 | 502 | 504;

type OpenverseDownloadCode =
	| "invalid_openverse_id"
	| "openverse_image_not_found"
	| "openverse_upstream_error"
	| "openverse_upstream_timeout";

export class OpenverseDownloadError extends Error {
	readonly code: OpenverseDownloadCode;
	readonly status: OpenverseDownloadStatus;

	constructor({
		code,
		message,
		status,
	}: {
		code: OpenverseDownloadCode;
		message: string;
		status: OpenverseDownloadStatus;
	}) {
		super(message);
		this.name = "OpenverseDownloadError";
		this.code = code;
		this.status = status;
	}
}

interface OpenverseImageMetadata {
	license: string;
	licenseUrl: URL | null;
	sourceUrl: URL;
}

const OPENVERSE_UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUPPORTED_RASTER_IMAGE_TYPES = new Set([
	"image/avif",
	"image/gif",
	"image/jpeg",
	"image/png",
	"image/webp",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function isOpenverseImageId(value: string): boolean {
	return OPENVERSE_UUID_PATTERN.test(value);
}

function upstreamError(message: string): OpenverseDownloadError {
	return new OpenverseDownloadError({
		code: "openverse_upstream_error",
		message,
		status: 502,
	});
}

function parseHttpUrl(value: unknown): URL | null {
	if (typeof value !== "string" || value.trim() === "") return null;

	try {
		const url = new URL(value);
		if (url.protocol !== "http:" && url.protocol !== "https:") return null;
		if (url.username !== "" || url.password !== "") return null;
		return url;
	} catch {
		return null;
	}
}

function formatLicense({ code, version }: { code: string; version?: string }) {
	const normalizedCode = code.trim().toUpperCase().replaceAll("-", " ");
	const label =
		normalizedCode === "CC0" || normalizedCode === "PDM"
			? normalizedCode
			: normalizedCode.startsWith("CC ")
				? normalizedCode
				: `CC ${normalizedCode}`;
	return version ? `${label} ${version.trim()}` : label;
}

function parseMetadata({
	id,
	value,
}: {
	id: string;
	value: unknown;
}): OpenverseImageMetadata {
	if (!isRecord(value) || typeof value.id !== "string") {
		throw upstreamError("Openverse returned invalid image metadata");
	}
	if (value.id.toLowerCase() !== id.toLowerCase()) {
		throw upstreamError("Openverse returned mismatched image metadata");
	}

	const sourceUrl = parseHttpUrl(value.foreign_landing_url);
	if (!sourceUrl) {
		throw upstreamError("Openverse returned an invalid source URL");
	}
	if (typeof value.license !== "string" || value.license.trim() === "") {
		throw upstreamError("Openverse returned missing license information");
	}

	const version =
		typeof value.license_version === "string" &&
		value.license_version.trim() !== ""
			? value.license_version
			: undefined;
	const license = formatLicense({ code: value.license, version });
	if (/\p{Cc}/u.test(license) || license.length > 200) {
		throw upstreamError("Openverse returned invalid license information");
	}

	return {
		license,
		licenseUrl: parseHttpUrl(value.license_url),
		sourceUrl,
	};
}

function parseImageContentType(response: Response): string {
	const contentType = response.headers.get("Content-Type")?.trim() ?? "";
	const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
	if (!SUPPORTED_RASTER_IMAGE_TYPES.has(mediaType)) {
		throw upstreamError("Openverse thumbnail is not a supported raster image");
	}
	return mediaType;
}

function validateDeclaredContentLength(response: Response): void {
	const rawLength = response.headers.get("Content-Length");
	if (rawLength === null) return;
	const normalizedLength = rawLength.trim();
	if (!/^\d+$/.test(normalizedLength)) {
		throw upstreamError("Original image returned an invalid Content-Length");
	}
	const length = Number(normalizedLength);
	if (!Number.isSafeInteger(length) || length > MAX_OPENVERSE_IMAGE_BYTES) {
		throw upstreamError("Original image exceeds the 20 MB limit");
	}
}

async function readImageBody(response: Response): Promise<Uint8Array> {
	if (!response.body) {
		throw upstreamError("Original image returned an empty response");
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let totalBytes = 0;

	while (true) {
		const result = await reader.read();
		if (result.done) break;
		if (!result.value) continue;
		totalBytes += result.value.byteLength;
		if (totalBytes > MAX_OPENVERSE_IMAGE_BYTES) {
			try {
				await reader.cancel();
			} catch {
				// The size error below is the actionable failure.
			}
			throw upstreamError("Original image exceeds the 20 MB limit");
		}
		chunks.push(result.value);
	}

	if (totalBytes === 0) {
		throw upstreamError("Original image returned an empty response");
	}
	const bytes = new Uint8Array(totalBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

function isTimeoutError(error: unknown): boolean {
	return (
		error instanceof DOMException &&
		(error.name === "TimeoutError" || error.name === "AbortError")
	);
}

export async function proxyOpenverseImage({
	fetchImpl = fetch,
	id,
}: {
	fetchImpl?: OpenverseFetch;
	id: string;
}): Promise<Response> {
	if (!isOpenverseImageId(id)) {
		throw new OpenverseDownloadError({
			code: "invalid_openverse_id",
			message: "Invalid Openverse image id",
			status: 400,
		});
	}

	const normalizedId = id.toLowerCase();
	const metadataUrl = new URL(
		`https://api.openverse.org/v1/images/${normalizedId}/`,
	);
	const thumbnailUrl = new URL(
		`https://api.openverse.org/v1/images/${normalizedId}/thumb/`,
	);
	const timeoutSignal = AbortSignal.timeout(OPENVERSE_DOWNLOAD_TIMEOUT_MS);

	try {
		const metadataResponse = await fetchImpl(metadataUrl, {
			cache: "no-store",
			headers: {
				Accept: "application/json",
				"User-Agent":
					"VisionCut/0.1 (https://github.com/JoyceLeo326/flowcut-ai-studio)",
			},
			redirect: "error",
			signal: timeoutSignal,
		});
		if (metadataResponse.status === 404) {
			throw new OpenverseDownloadError({
				code: "openverse_image_not_found",
				message: "Openverse image not found",
				status: 404,
			});
		}
		if (!metadataResponse.ok) {
			throw upstreamError("Openverse metadata service is unavailable");
		}

		const metadata = parseMetadata({
			id: normalizedId,
			value: await metadataResponse.json(),
		});
		const imageResponse = await fetchImpl(thumbnailUrl, {
			cache: "no-store",
			headers: {
				Accept: "image/avif,image/webp,image/png,image/jpeg,image/gif",
				"User-Agent":
					"VisionCut/0.1 (https://github.com/JoyceLeo326/flowcut-ai-studio)",
			},
			redirect: "error",
			signal: timeoutSignal,
		});
		if (!imageResponse.ok) {
			throw upstreamError("Openverse thumbnail service is unavailable");
		}

		const contentType = parseImageContentType(imageResponse);
		validateDeclaredContentLength(imageResponse);
		const bytes = await readImageBody(imageResponse);
		const headers = new Headers({
			"Cache-Control": "private, no-store",
			"Content-Length": String(bytes.byteLength),
			"Content-Type": contentType,
			"X-Content-Type-Options": "nosniff",
			"X-Openverse-License": metadata.license,
			"X-Openverse-Source": metadata.sourceUrl.toString(),
		});
		if (metadata.licenseUrl) {
			headers.set("X-Openverse-License-Url", metadata.licenseUrl.toString());
		}

		const body = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(body).set(bytes);
		return new Response(body, { headers, status: 200 });
	} catch (error) {
		if (error instanceof OpenverseDownloadError) throw error;
		if (timeoutSignal.aborted || isTimeoutError(error)) {
			throw new OpenverseDownloadError({
				code: "openverse_upstream_timeout",
				message: "Openverse image download timed out",
				status: 504,
			});
		}
		throw upstreamError("Unable to download the Openverse image");
	}
}
