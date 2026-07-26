import {
	formatStorageBytes,
	readStorageQuotaStatus,
	type StorageQuotaStatus,
} from "@/services/storage/quota";

export const IMPORT_PREFLIGHT_HEADER_BYTES = 64 * 1024;

export const IMPORT_PREFLIGHT_LIMITS = Object.freeze({
	maxFiles: 20,
	maxFileBytes: 4 * 1024 * 1024 * 1024,
	maxBatchBytes: 12 * 1024 * 1024 * 1024,
});

export type ImportPreflightStatus =
	| "accepted"
	| "rejected"
	| "needs-confirmation";

export type ImportPreflightReasonCode =
	| "validated"
	| "empty-file"
	| "file-count-limit"
	| "file-size-limit"
	| "batch-size-limit"
	| "read-failed"
	| "signature-unrecognized"
	| "container-header-incomplete"
	| "extension-unsupported"
	| "extension-container-mismatch"
	| "mime-missing"
	| "mime-generic"
	| "mime-kind-mismatch"
	| "mime-container-mismatch"
	| "codec-unknown"
	| "codec-support-unknown"
	| "codec-unsupported"
	| "storage-space-low";

export interface ImportPreflightReason {
	code: ImportPreflightReasonCode;
	severity: "info" | "warning" | "error";
	message: string;
}

export interface ImportPreflightFileLike {
	readonly name: string;
	readonly type: string;
	readonly size: number;
	readonly lastModified: number;
	slice(start?: number, end?: number, contentType?: string): Blob;
}

export type DetectedMediaKind = "video" | "audio" | "image";

export type DetectedMediaContainer =
	| "mp4"
	| "quicktime"
	| "quicktime-legacy"
	| "webm"
	| "matroska"
	| "avi"
	| "m4a"
	| "wav"
	| "ogg"
	| "flac"
	| "mp3"
	| "aac"
	| "png"
	| "jpeg"
	| "gif"
	| "webp"
	| "avif"
	| "svg";

export type VideoCodec =
	| "h264"
	| "hevc"
	| "av1"
	| "vp8"
	| "vp9"
	| "mpeg4"
	| "mjpeg";

export type PlaybackSupport = "supported" | "unsupported" | "unknown";

export interface ImportPreflightLimits {
	maxFiles: number;
	maxFileBytes: number;
	maxBatchBytes: number;
}

export interface ImportPreflightOptions {
	headerBytes?: number;
	limits?: Partial<ImportPreflightLimits>;
	readStorageQuota?: () => Promise<StorageQuotaStatus>;
	probePlaybackSupport?: ({
		mimeType,
		codec,
	}: {
		mimeType: string;
		codec: VideoCodec;
	}) => PlaybackSupport;
}

export interface ImportPreflightFileResult<
	TFile extends ImportPreflightFileLike = File,
> {
	id: string;
	file: TFile;
	status: ImportPreflightStatus;
	reasons: readonly ImportPreflightReason[];
	extension: string | null;
	declaredMimeType: string | null;
	normalizedMimeType: string | null;
	detectedKind: DetectedMediaKind | null;
	detectedContainer: DetectedMediaContainer | null;
	detectedCodec: VideoCodec | null;
	inspectedBytes: number;
}

export interface ImportPreflightBatchResult<
	TFile extends ImportPreflightFileLike = File,
> {
	files: readonly ImportPreflightFileResult<TFile>[];
	totalBytes: number;
	inspectedBytes: number;
	limits: ImportPreflightLimits;
	storage: StorageQuotaStatus;
}

interface ExtensionRule {
	kind: DetectedMediaKind;
	containers: readonly DetectedMediaContainer[];
}

interface SignatureResult {
	kind: DetectedMediaKind | null;
	container: DetectedMediaContainer | null;
	codec: VideoCodec | null;
	incompleteContainer: "ebml" | null;
}

interface MutablePreflightResult<
	TFile extends ImportPreflightFileLike,
> extends Omit<ImportPreflightFileResult<TFile>, "status" | "reasons"> {
	reasons: ImportPreflightReason[];
}

const EXTENSION_RULES: Readonly<Record<string, ExtensionRule>> = Object.freeze({
	mp4: { kind: "video", containers: ["mp4", "quicktime"] },
	mov: {
		kind: "video",
		containers: ["quicktime", "quicktime-legacy", "mp4"],
	},
	m4v: { kind: "video", containers: ["mp4", "quicktime"] },
	webm: { kind: "video", containers: ["webm"] },
	mkv: { kind: "video", containers: ["matroska"] },
	avi: { kind: "video", containers: ["avi"] },
	m4a: { kind: "audio", containers: ["m4a"] },
	wav: { kind: "audio", containers: ["wav"] },
	oga: { kind: "audio", containers: ["ogg"] },
	ogg: { kind: "audio", containers: ["ogg"] },
	flac: { kind: "audio", containers: ["flac"] },
	mp3: { kind: "audio", containers: ["mp3"] },
	aac: { kind: "audio", containers: ["aac"] },
	png: { kind: "image", containers: ["png"] },
	jpg: { kind: "image", containers: ["jpeg"] },
	jpeg: { kind: "image", containers: ["jpeg"] },
	gif: { kind: "image", containers: ["gif"] },
	webp: { kind: "image", containers: ["webp"] },
	avif: { kind: "image", containers: ["avif"] },
	svg: { kind: "image", containers: ["svg"] },
});

const MIME_BY_CONTAINER: Readonly<Record<DetectedMediaContainer, string>> =
	Object.freeze({
		mp4: "video/mp4",
		quicktime: "video/quicktime",
		"quicktime-legacy": "video/quicktime",
		webm: "video/webm",
		matroska: "video/x-matroska",
		avi: "video/x-msvideo",
		m4a: "audio/mp4",
		wav: "audio/wav",
		ogg: "audio/ogg",
		flac: "audio/flac",
		mp3: "audio/mpeg",
		aac: "audio/aac",
		png: "image/png",
		jpeg: "image/jpeg",
		gif: "image/gif",
		webp: "image/webp",
		avif: "image/avif",
		svg: "image/svg+xml",
	});

const CONTAINER_BY_MIME: Readonly<
	Record<string, readonly DetectedMediaContainer[]>
> = Object.freeze({
	"video/mp4": ["mp4", "quicktime"],
	"application/mp4": ["mp4", "quicktime"],
	"video/quicktime": ["quicktime", "quicktime-legacy", "mp4"],
	"video/x-m4v": ["mp4", "quicktime"],
	"video/webm": ["webm"],
	"video/x-matroska": ["matroska"],
	"video/matroska": ["matroska"],
	"video/x-msvideo": ["avi"],
	"video/avi": ["avi"],
	"audio/mp4": ["m4a"],
	"audio/x-m4a": ["m4a"],
	"audio/wav": ["wav"],
	"audio/wave": ["wav"],
	"audio/x-wav": ["wav"],
	"audio/ogg": ["ogg"],
	"audio/flac": ["flac"],
	"audio/mpeg": ["mp3"],
	"audio/mp3": ["mp3"],
	"audio/aac": ["aac"],
	"image/png": ["png"],
	"image/jpeg": ["jpeg"],
	"image/gif": ["gif"],
	"image/webp": ["webp"],
	"image/avif": ["avif"],
	"image/svg+xml": ["svg"],
});

const CODEC_LABELS: Readonly<Record<VideoCodec, string>> = Object.freeze({
	h264: "H.264",
	hevc: "HEVC/H.265",
	av1: "AV1",
	vp8: "VP8",
	vp9: "VP9",
	mpeg4: "MPEG-4 Visual",
	mjpeg: "Motion JPEG",
});

const CODEC_PARAMETERS: Readonly<Record<VideoCodec, string>> = Object.freeze({
	h264: "avc1.42E01E",
	hevc: "hvc1",
	av1: "av01.0.04M.08",
	vp8: "vp8",
	vp9: "vp09.00.10.08",
	mpeg4: "mp4v.20.9",
	mjpeg: "mjpeg",
});

const EMPTY_STORAGE_STATUS: StorageQuotaStatus = Object.freeze({
	quotaBytes: null,
	usageBytes: null,
	headroomBytes: null,
	availableBytes: null,
});

function normalizeLimits({
	limits,
}: {
	limits: Partial<ImportPreflightLimits> | undefined;
}): ImportPreflightLimits {
	return {
		maxFiles: limits?.maxFiles ?? IMPORT_PREFLIGHT_LIMITS.maxFiles,
		maxFileBytes: limits?.maxFileBytes ?? IMPORT_PREFLIGHT_LIMITS.maxFileBytes,
		maxBatchBytes:
			limits?.maxBatchBytes ?? IMPORT_PREFLIGHT_LIMITS.maxBatchBytes,
	};
}

function normalizeMimeType({ type }: { type: string }): string | null {
	const normalized = type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
	return normalized || null;
}

function getExtension({ name }: { name: string }): string | null {
	const leafName = name.trim().split(/[\\/]/).at(-1) ?? "";
	const dotIndex = leafName.lastIndexOf(".");
	if (dotIndex <= 0 || dotIndex === leafName.length - 1) return null;
	return leafName.slice(dotIndex + 1).toLowerCase();
}

function createResultId({ file }: { file: ImportPreflightFileLike }): string {
	return [file.name, file.size, file.lastModified, file.type].join("\u0000");
}

function addReason<TFile extends ImportPreflightFileLike>({
	result,
	code,
	severity,
	message,
}: {
	result: MutablePreflightResult<TFile>;
	code: ImportPreflightReasonCode;
	severity: ImportPreflightReason["severity"];
	message: string;
}): void {
	if (result.reasons.some((reason) => reason.code === code)) return;
	result.reasons.push({ code, severity, message });
}

function getStatus({
	reasons,
}: {
	reasons: readonly ImportPreflightReason[];
}): ImportPreflightStatus {
	if (reasons.some((reason) => reason.severity === "error")) {
		return "rejected";
	}
	if (reasons.some((reason) => reason.severity === "warning")) {
		return "needs-confirmation";
	}
	return "accepted";
}

function asciiAt({
	bytes,
	offset,
	length,
}: {
	bytes: Uint8Array;
	offset: number;
	length: number;
}): string {
	if (offset < 0 || offset + length > bytes.length) return "";
	return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function startsWithBytes({
	bytes,
	signature,
}: {
	bytes: Uint8Array;
	signature: readonly number[];
}): boolean {
	return signature.every((value, index) => bytes[index] === value);
}

function includesAscii({
	bytes,
	value,
}: {
	bytes: Uint8Array;
	value: string;
}): boolean {
	if (value.length === 0 || bytes.length < value.length) return false;
	const target = value.toLowerCase();
	for (let index = 0; index <= bytes.length - value.length; index += 1) {
		let matches = true;
		for (let offset = 0; offset < value.length; offset += 1) {
			const byte = bytes[index + offset];
			const character = String.fromCharCode(byte).toLowerCase();
			if (character !== target[offset]) {
				matches = false;
				break;
			}
		}
		if (matches) return true;
	}
	return false;
}

function detectVideoCodec({
	bytes,
	container,
}: {
	bytes: Uint8Array;
	container: DetectedMediaContainer;
}): VideoCodec | null {
	const candidates: ReadonlyArray<{
		codec: VideoCodec;
		markers: readonly string[];
	}> =
		container === "webm" || container === "matroska"
			? [
					{ codec: "vp9", markers: ["v_vp9"] },
					{ codec: "vp8", markers: ["v_vp8"] },
					{ codec: "av1", markers: ["v_av1"] },
					{ codec: "h264", markers: ["v_mpeg4/iso/avc"] },
					{ codec: "hevc", markers: ["v_mpegh/iso/hevc"] },
				]
			: container === "avi"
				? [
						{ codec: "h264", markers: ["h264", "avc1"] },
						{ codec: "mjpeg", markers: ["mjpg", "mjpeg"] },
						{ codec: "mpeg4", markers: ["xvid", "divx"] },
					]
				: [
						{ codec: "h264", markers: ["avc1", "avc3"] },
						{ codec: "hevc", markers: ["hvc1", "hev1"] },
						{ codec: "av1", markers: ["av01"] },
						{ codec: "vp9", markers: ["vp09"] },
						{ codec: "vp8", markers: ["vp08"] },
						{ codec: "mpeg4", markers: ["mp4v"] },
					];

	for (const candidate of candidates) {
		if (
			candidate.markers.some((marker) =>
				includesAscii({ bytes, value: marker }),
			)
		) {
			return candidate.codec;
		}
	}
	return null;
}

function detectSignature({ bytes }: { bytes: Uint8Array }): SignatureResult {
	if (
		startsWithBytes({
			bytes,
			signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
		})
	) {
		return {
			kind: "image",
			container: "png",
			codec: null,
			incompleteContainer: null,
		};
	}
	if (startsWithBytes({ bytes, signature: [0xff, 0xd8, 0xff] })) {
		return {
			kind: "image",
			container: "jpeg",
			codec: null,
			incompleteContainer: null,
		};
	}
	const firstSix = asciiAt({ bytes, offset: 0, length: 6 });
	if (firstSix === "GIF87a" || firstSix === "GIF89a") {
		return {
			kind: "image",
			container: "gif",
			codec: null,
			incompleteContainer: null,
		};
	}
	if (asciiAt({ bytes, offset: 0, length: 4 }) === "RIFF") {
		const riffKind = asciiAt({ bytes, offset: 8, length: 4 });
		if (riffKind === "WEBP") {
			return {
				kind: "image",
				container: "webp",
				codec: null,
				incompleteContainer: null,
			};
		}
		if (riffKind === "WAVE") {
			return {
				kind: "audio",
				container: "wav",
				codec: null,
				incompleteContainer: null,
			};
		}
		if (riffKind === "AVI ") {
			return {
				kind: "video",
				container: "avi",
				codec: detectVideoCodec({ bytes, container: "avi" }),
				incompleteContainer: null,
			};
		}
	}
	if (startsWithBytes({ bytes, signature: [0x1a, 0x45, 0xdf, 0xa3] })) {
		if (includesAscii({ bytes, value: "webm" })) {
			return {
				kind: "video",
				container: "webm",
				codec: detectVideoCodec({ bytes, container: "webm" }),
				incompleteContainer: null,
			};
		}
		if (includesAscii({ bytes, value: "matroska" })) {
			return {
				kind: "video",
				container: "matroska",
				codec: detectVideoCodec({ bytes, container: "matroska" }),
				incompleteContainer: null,
			};
		}
		return {
			kind: null,
			container: null,
			codec: null,
			incompleteContainer: "ebml",
		};
	}
	if (asciiAt({ bytes, offset: 0, length: 4 }) === "OggS") {
		return {
			kind: "audio",
			container: "ogg",
			codec: null,
			incompleteContainer: null,
		};
	}
	if (asciiAt({ bytes, offset: 0, length: 4 }) === "fLaC") {
		return {
			kind: "audio",
			container: "flac",
			codec: null,
			incompleteContainer: null,
		};
	}
	if (
		asciiAt({ bytes, offset: 0, length: 3 }) === "ID3" ||
		(bytes.length >= 2 &&
			bytes[0] === 0xff &&
			(bytes[1] & 0xe0) === 0xe0 &&
			(bytes[1] & 0x06) !== 0)
	) {
		return {
			kind: "audio",
			container: "mp3",
			codec: null,
			incompleteContainer: null,
		};
	}
	if (
		bytes.length >= 2 &&
		bytes[0] === 0xff &&
		(bytes[1] === 0xf1 || bytes[1] === 0xf9)
	) {
		return {
			kind: "audio",
			container: "aac",
			codec: null,
			incompleteContainer: null,
		};
	}

	const atomType = asciiAt({ bytes, offset: 4, length: 4 });
	if (atomType === "ftyp") {
		const brand = asciiAt({ bytes, offset: 8, length: 4 }).toLowerCase();
		if (brand === "avif" || brand === "avis") {
			return {
				kind: "image",
				container: "avif",
				codec: null,
				incompleteContainer: null,
			};
		}
		if (brand === "m4a " || brand === "m4b ") {
			return {
				kind: "audio",
				container: "m4a",
				codec: null,
				incompleteContainer: null,
			};
		}
		const container = brand === "qt  " ? "quicktime" : "mp4";
		return {
			kind: "video",
			container,
			codec: detectVideoCodec({ bytes, container }),
			incompleteContainer: null,
		};
	}
	if (["moov", "mdat", "free", "wide"].includes(atomType)) {
		return {
			kind: "video",
			container: "quicktime-legacy",
			codec: detectVideoCodec({ bytes, container: "quicktime-legacy" }),
			incompleteContainer: null,
		};
	}

	const textPrefix = new TextDecoder()
		.decode(bytes.subarray(0, Math.min(bytes.length, 4096)))
		.replace(/^\uFEFF/, "")
		.trimStart()
		.toLowerCase();
	if (textPrefix.startsWith("<svg") || textPrefix.includes("<svg ")) {
		return {
			kind: "image",
			container: "svg",
			codec: null,
			incompleteContainer: null,
		};
	}

	return {
		kind: null,
		container: null,
		codec: null,
		incompleteContainer: null,
	};
}

function defaultProbePlaybackSupport({
	mimeType,
	codec,
}: {
	mimeType: string;
	codec: VideoCodec;
}): PlaybackSupport {
	if (typeof document === "undefined") return "unknown";
	const video = document.createElement("video");
	if (typeof video.canPlayType !== "function") return "unknown";
	const result = video.canPlayType(
		`${mimeType}; codecs="${CODEC_PARAMETERS[codec]}"`,
	);
	if (result === "probably" || result === "maybe") return "supported";
	return "unsupported";
}

async function readHeader<TFile extends ImportPreflightFileLike>({
	file,
	headerBytes,
}: {
	file: TFile;
	headerBytes: number;
}): Promise<Uint8Array> {
	const bytesToRead = Math.min(file.size, headerBytes);
	const boundedSlice = file.slice(0, bytesToRead).slice(0, bytesToRead);
	const buffer = await boundedSlice.arrayBuffer();
	return new Uint8Array(buffer, 0, Math.min(buffer.byteLength, bytesToRead));
}

function validateExtensionAndMime<TFile extends ImportPreflightFileLike>({
	result,
}: {
	result: MutablePreflightResult<TFile>;
}): void {
	const { extension, declaredMimeType, detectedContainer, detectedKind } =
		result;
	if (!detectedContainer || !detectedKind) return;

	const extensionRule = extension ? EXTENSION_RULES[extension] : undefined;
	if (!extensionRule) {
		addReason({
			result,
			code: "extension-unsupported",
			severity: "warning",
			message:
				"文件头可识别，但扩展名缺失或不在支持列表中；确认后会按实际容器导入。",
		});
	} else if (
		extensionRule.kind !== detectedKind ||
		!extensionRule.containers.includes(detectedContainer)
	) {
		addReason({
			result,
			code: "extension-container-mismatch",
			severity: "error",
			message: `扩展名 .${extension} 与检测到的 ${detectedContainer} 容器不一致，文件可能损坏或被伪装。`,
		});
	}

	if (!declaredMimeType) {
		addReason({
			result,
			code: "mime-missing",
			severity: "warning",
			message: "系统未提供 MIME 类型；确认后会按文件签名补全类型。",
		});
		return;
	}
	if (
		declaredMimeType === "application/octet-stream" ||
		declaredMimeType === "binary/octet-stream"
	) {
		addReason({
			result,
			code: "mime-generic",
			severity: "warning",
			message: "文件只声明为通用二进制类型；确认后会按文件签名补全类型。",
		});
		return;
	}

	const declaredKind = declaredMimeType.split("/", 1)[0];
	if (
		declaredKind === "video" ||
		declaredKind === "audio" ||
		declaredKind === "image"
	) {
		if (declaredKind !== detectedKind) {
			addReason({
				result,
				code: "mime-kind-mismatch",
				severity: "error",
				message: `声明类型 ${declaredMimeType} 与检测到的 ${detectedKind} 内容不一致。`,
			});
			return;
		}
	}

	const declaredContainers = CONTAINER_BY_MIME[declaredMimeType];
	if (declaredContainers && !declaredContainers.includes(detectedContainer)) {
		addReason({
			result,
			code: "mime-container-mismatch",
			severity: "error",
			message: `声明类型 ${declaredMimeType} 与检测到的 ${detectedContainer} 容器不一致。`,
		});
	} else if (!declaredContainers) {
		addReason({
			result,
			code: "mime-generic",
			severity: "warning",
			message: `浏览器声明了 ${declaredMimeType}，但无法据此确认具体容器；将以文件签名为准。`,
		});
	}
}

function validateVideoCodec<TFile extends ImportPreflightFileLike>({
	result,
	probePlaybackSupport,
}: {
	result: MutablePreflightResult<TFile>;
	probePlaybackSupport: NonNullable<
		ImportPreflightOptions["probePlaybackSupport"]
	>;
}): void {
	if (
		result.detectedKind !== "video" ||
		!result.detectedContainer ||
		!result.normalizedMimeType
	) {
		return;
	}
	if (!result.detectedCodec) {
		addReason({
			result,
			code: "codec-unknown",
			severity: "warning",
			message:
				"容器签名有效，但小头部内没有可验证的编码标识；导入前需要确认，正式解码会在下一步复核。",
		});
		return;
	}

	let support: PlaybackSupport;
	try {
		support = probePlaybackSupport({
			mimeType: result.normalizedMimeType,
			codec: result.detectedCodec,
		});
	} catch {
		support = "unknown";
	}
	if (support === "supported") return;

	const codecLabel = CODEC_LABELS[result.detectedCodec];
	addReason({
		result,
		code:
			support === "unsupported" ? "codec-unsupported" : "codec-support-unknown",
		severity: "warning",
		message:
			support === "unsupported"
				? `容器有效，但当前浏览器未确认可解码 ${codecLabel}；可以确认后尝试导入。`
				: `容器有效，但当前环境无法判断 ${codecLabel} 解码能力；可以确认后尝试导入。`,
	});
}

function finalizeResult<TFile extends ImportPreflightFileLike>({
	result,
}: {
	result: MutablePreflightResult<TFile>;
}): ImportPreflightFileResult<TFile> {
	if (result.reasons.length === 0) {
		result.reasons.push({
			code: "validated",
			severity: "info",
			message: "扩展名、MIME、容器签名和浏览器解码提示均通过预检。",
		});
	}
	return {
		...result,
		status: getStatus({ reasons: result.reasons }),
		reasons: Object.freeze([...result.reasons]),
	};
}

export async function preflightMediaFiles<
	TFile extends ImportPreflightFileLike,
>({
	files,
	options,
}: {
	files: readonly TFile[];
	options?: ImportPreflightOptions;
}): Promise<ImportPreflightBatchResult<TFile>> {
	const limits = normalizeLimits({ limits: options?.limits });
	const headerBytes = Math.max(
		1,
		Math.min(
			options?.headerBytes ?? IMPORT_PREFLIGHT_HEADER_BYTES,
			IMPORT_PREFLIGHT_HEADER_BYTES,
		),
	);
	const probePlaybackSupport =
		options?.probePlaybackSupport ?? defaultProbePlaybackSupport;
	const mutableResults: Array<MutablePreflightResult<TFile>> = [];
	let batchBytes = 0;

	for (const [index, file] of files.entries()) {
		const extension = getExtension({ name: file.name });
		const declaredMimeType = normalizeMimeType({ type: file.type });
		const result: MutablePreflightResult<TFile> = {
			id: createResultId({ file }),
			file,
			reasons: [],
			extension,
			declaredMimeType,
			normalizedMimeType: null,
			detectedKind: null,
			detectedContainer: null,
			detectedCodec: null,
			inspectedBytes: 0,
		};
		mutableResults.push(result);

		if (index >= limits.maxFiles) {
			addReason({
				result,
				code: "file-count-limit",
				severity: "error",
				message: `单次最多选择 ${limits.maxFiles} 个文件；移除其他文件后可重新检查。`,
			});
			continue;
		}
		if (file.size === 0) {
			addReason({
				result,
				code: "empty-file",
				severity: "error",
				message: "文件大小为 0 B，无法读取容器信息。",
			});
			continue;
		}
		if (file.size > limits.maxFileBytes) {
			addReason({
				result,
				code: "file-size-limit",
				severity: "error",
				message: `文件超过单文件上限 ${formatStorageBytes({
					bytes: limits.maxFileBytes,
				})}；未读取文件内容。`,
			});
			continue;
		}
		if (batchBytes + file.size > limits.maxBatchBytes) {
			addReason({
				result,
				code: "batch-size-limit",
				severity: "error",
				message: `加入该文件会超过批次上限 ${formatStorageBytes({
					bytes: limits.maxBatchBytes,
				})}；移除其他文件后可重新检查。`,
			});
			continue;
		}
		batchBytes += file.size;

		let bytes: Uint8Array;
		try {
			bytes = await readHeader({ file, headerBytes });
			result.inspectedBytes = bytes.byteLength;
		} catch {
			addReason({
				result,
				code: "read-failed",
				severity: "error",
				message: "无法读取文件头；请重新选择文件后再试。",
			});
			continue;
		}

		const signature = detectSignature({ bytes });
		if (signature.incompleteContainer === "ebml") {
			addReason({
				result,
				code: "container-header-incomplete",
				severity: "error",
				message:
					"检测到 EBML 起始签名，但缺少 WebM/Matroska 容器标识，文件可能已损坏。",
			});
			continue;
		}
		if (!signature.kind || !signature.container) {
			addReason({
				result,
				code: "signature-unrecognized",
				severity: "error",
				message: "文件头不符合支持的媒体容器签名，文件可能损坏或扩展名被伪装。",
			});
			continue;
		}

		result.detectedKind = signature.kind;
		result.detectedContainer = signature.container;
		result.detectedCodec = signature.codec;
		result.normalizedMimeType = MIME_BY_CONTAINER[signature.container];

		validateExtensionAndMime({ result });
		validateVideoCodec({ result, probePlaybackSupport });
	}

	let storage: StorageQuotaStatus = EMPTY_STORAGE_STATUS;
	try {
		storage = await (options?.readStorageQuota ?? readStorageQuotaStatus)();
	} catch {
		storage = EMPTY_STORAGE_STATUS;
	}

	if (storage.availableBytes !== null) {
		let reservedBytes = 0;
		for (const result of mutableResults) {
			if (getStatus({ reasons: result.reasons }) === "rejected") continue;
			if (reservedBytes + result.file.size <= storage.availableBytes) {
				reservedBytes += result.file.size;
				continue;
			}
			addReason({
				result,
				code: "storage-space-low",
				severity: "warning",
				message:
					"浏览器可用持久化空间可能不足；清理空间后可重新检查，也可以确认后尝试导入。",
			});
		}
	}

	const finalizedResults = mutableResults.map((result) =>
		finalizeResult({ result }),
	);
	return {
		files: Object.freeze(finalizedResults),
		totalBytes: files.reduce((total, file) => total + file.size, 0),
		inspectedBytes: finalizedResults.reduce(
			(total, result) => total + result.inspectedBytes,
			0,
		),
		limits,
		storage,
	};
}

export function prepareFileForImport({
	result,
}: {
	result: ImportPreflightFileResult<File>;
}): File {
	if (result.status === "rejected") {
		throw new Error(`Rejected file cannot be imported: ${result.file.name}`);
	}
	const normalizedMimeType = result.normalizedMimeType;
	if (
		!normalizedMimeType ||
		normalizeMimeType({ type: result.file.type }) === normalizedMimeType
	) {
		return result.file;
	}
	return new File([result.file], result.file.name, {
		type: normalizedMimeType,
		lastModified: result.file.lastModified,
	});
}
