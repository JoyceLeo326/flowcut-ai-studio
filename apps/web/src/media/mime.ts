import type { MediaType } from "@/media/types";

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
	avi: "video/x-msvideo",
	m4v: "video/x-m4v",
	mkv: "video/x-matroska",
	mov: "video/quicktime",
	mp4: "video/mp4",
	webm: "video/webm",
	aac: "audio/aac",
	flac: "audio/flac",
	m4a: "audio/mp4",
	mp3: "audio/mpeg",
	oga: "audio/ogg",
	ogg: "audio/ogg",
	wav: "audio/wav",
	avif: "image/avif",
	gif: "image/gif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	svg: "image/svg+xml",
	webp: "image/webp",
});

const DEFAULT_MIME_BY_MEDIA_TYPE: Readonly<Record<MediaType, string>> =
	Object.freeze({
		video: "video/mp4",
		audio: "audio/mpeg",
		image: "image/png",
	});

export function resolveMediaMimeType({
	name,
	mediaType,
	declaredType,
}: {
	name: string;
	mediaType: MediaType;
	declaredType?: string | null;
}): string {
	const normalizedDeclaredType = declaredType?.trim().toLowerCase() ?? "";
	if (normalizedDeclaredType.startsWith(`${mediaType}/`)) {
		return normalizedDeclaredType;
	}
	const extension = name.split(".").at(-1)?.trim().toLowerCase() ?? "";
	const inferred = MIME_BY_EXTENSION[extension];
	if (inferred?.startsWith(`${mediaType}/`)) return inferred;
	return DEFAULT_MIME_BY_MEDIA_TYPE[mediaType];
}

export function restoreFileMimeType({
	file,
	name,
	mediaType,
	storedMimeType,
	lastModified,
}: {
	file: File;
	name: string;
	mediaType: MediaType;
	storedMimeType?: string | null;
	lastModified: number;
}): File {
	const type = resolveMediaMimeType({
		name,
		mediaType,
		declaredType: file.type || storedMimeType,
	});
	if (file.type === type && file.name === name) return file;
	return new File([file], name, { type, lastModified });
}
