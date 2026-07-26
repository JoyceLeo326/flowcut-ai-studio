import { describe, expect, test } from "bun:test";
import {
	IMPORT_PREFLIGHT_HEADER_BYTES,
	IMPORT_PREFLIGHT_LIMITS,
	preflightMediaFiles,
	type ImportPreflightFileLike,
	type ImportPreflightOptions,
} from "./import-preflight";

const ENOUGH_STORAGE = {
	quotaBytes: 32 * 1024 * 1024 * 1024,
	usageBytes: 0,
	headroomBytes: 32 * 1024 * 1024 * 1024,
	availableBytes: 31 * 1024 * 1024 * 1024,
};

const TEST_OPTIONS: ImportPreflightOptions = {
	readStorageQuota: async () => ENOUGH_STORAGE,
	probePlaybackSupport: () => "supported",
};

function writeAscii({
	bytes,
	offset,
	value,
}: {
	bytes: Uint8Array;
	offset: number;
	value: string;
}): void {
	for (let index = 0; index < value.length; index += 1) {
		bytes[offset + index] = value.charCodeAt(index);
	}
}

function createIsoBmffBytes({
	brand = "isom",
	codec,
}: {
	brand?: string;
	codec?: string;
} = {}): Uint8Array {
	const bytes = new Uint8Array(96);
	bytes.set([0, 0, 0, 96], 0);
	writeAscii({ bytes, offset: 4, value: "ftyp" });
	writeAscii({ bytes, offset: 8, value: brand.padEnd(4, " ").slice(0, 4) });
	writeAscii({ bytes, offset: 16, value: "isom" });
	if (codec) writeAscii({ bytes, offset: 32, value: codec });
	return bytes;
}

function createWebMBytes({ codec }: { codec?: string } = {}): Uint8Array {
	const bytes = new Uint8Array(96);
	bytes.set([0x1a, 0x45, 0xdf, 0xa3], 0);
	writeAscii({ bytes, offset: 12, value: "webm" });
	if (codec) writeAscii({ bytes, offset: 32, value: codec });
	return bytes;
}

function createFile({
	name,
	type,
	bytes,
}: {
	name: string;
	type: string;
	bytes: Uint8Array;
}): File {
	return new File([bytes], name, { type, lastModified: 123 });
}

class TrackedLargeFile implements ImportPreflightFileLike {
	readonly lastModified = 123;
	readonly sliceCalls: Array<{ start?: number; end?: number }> = [];
	readonly name: string;
	readonly type: string;
	readonly size: number;
	private readonly header: Uint8Array;

	constructor({
		name,
		type,
		size,
		header,
	}: {
		name: string;
		type: string;
		size: number;
		header: Uint8Array;
	}) {
		this.name = name;
		this.type = type;
		this.size = size;
		this.header = header;
	}

	slice(...args: [start?: number, end?: number, contentType?: string]): Blob {
		const [start, end] = args;
		this.sliceCalls.push({ start, end });
		const requestedLength = Math.max((end ?? this.size) - (start ?? 0), 0);
		return new Blob([this.header.subarray(0, requestedLength)]);
	}
}

describe("media import preflight", () => {
	test("accepts a signed MP4 when its codec is supported", async () => {
		const file = createFile({
			name: "launch.mp4",
			type: "video/mp4",
			bytes: createIsoBmffBytes({ codec: "avc1" }),
		});
		const result = await preflightMediaFiles({
			files: [file],
			options: TEST_OPTIONS,
		});

		expect(result.files[0]?.status).toBe("accepted");
		expect(result.files[0]?.detectedContainer).toBe("mp4");
		expect(result.files[0]?.detectedCodec).toBe("h264");
		expect(result.files[0]?.reasons.map((reason) => reason.code)).toEqual([
			"validated",
		]);
	});

	test("rejects corrupted and disguised MP4 or MOV files", async () => {
		const corruptedMp4 = createFile({
			name: "broken.mp4",
			type: "video/mp4",
			bytes: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
		});
		const disguisedMov = createFile({
			name: "portrait.mov",
			type: "video/quicktime",
			bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		});
		const result = await preflightMediaFiles({
			files: [corruptedMp4, disguisedMov],
			options: TEST_OPTIONS,
		});

		expect(result.files.map((file) => file.status)).toEqual([
			"rejected",
			"rejected",
		]);
		expect(result.files[0]?.reasons[0]?.code).toBe("signature-unrecognized");
		expect(result.files[1]?.reasons.map((reason) => reason.code)).toContain(
			"extension-container-mismatch",
		);
		expect(result.files[1]?.reasons.map((reason) => reason.code)).toContain(
			"mime-kind-mismatch",
		);
	});

	test("rejects incomplete and disguised WebM containers", async () => {
		const incompleteWebM = createFile({
			name: "broken.webm",
			type: "video/webm",
			bytes: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]),
		});
		const disguisedWebM = createFile({
			name: "renamed.webm",
			type: "video/webm",
			bytes: createIsoBmffBytes({ codec: "avc1" }),
		});
		const result = await preflightMediaFiles({
			files: [incompleteWebM, disguisedWebM],
			options: TEST_OPTIONS,
		});

		expect(result.files[0]?.status).toBe("rejected");
		expect(result.files[0]?.reasons[0]?.code).toBe(
			"container-header-incomplete",
		);
		expect(result.files[1]?.status).toBe("rejected");
		expect(result.files[1]?.reasons.map((reason) => reason.code)).toContain(
			"extension-container-mismatch",
		);
		expect(result.files[1]?.reasons.map((reason) => reason.code)).toContain(
			"mime-container-mismatch",
		);
	});

	test("rejects an empty file without attempting to inspect it", async () => {
		const file = new TrackedLargeFile({
			name: "empty.mov",
			type: "video/quicktime",
			size: 0,
			header: new Uint8Array(),
		});
		const result = await preflightMediaFiles({
			files: [file],
			options: TEST_OPTIONS,
		});

		expect(result.files[0]?.status).toBe("rejected");
		expect(result.files[0]?.reasons[0]?.code).toBe("empty-file");
		expect(file.sliceCalls).toHaveLength(0);
	});

	test("rejects an oversized file before reading its bytes", async () => {
		const file = new TrackedLargeFile({
			name: "too-large.mp4",
			type: "video/mp4",
			size: IMPORT_PREFLIGHT_LIMITS.maxFileBytes + 1,
			header: createIsoBmffBytes({ codec: "avc1" }),
		});
		const result = await preflightMediaFiles({
			files: [file],
			options: TEST_OPTIONS,
		});

		expect(result.files[0]?.status).toBe("rejected");
		expect(result.files[0]?.reasons[0]?.code).toBe("file-size-limit");
		expect(file.sliceCalls).toHaveLength(0);
	});

	test("enforces the batch byte limit per file", async () => {
		const header = createIsoBmffBytes({ codec: "avc1" });
		const first = new TrackedLargeFile({
			name: "first.mp4",
			type: "video/mp4",
			size: 70,
			header,
		});
		const second = new TrackedLargeFile({
			name: "second.mp4",
			type: "video/mp4",
			size: 40,
			header,
		});
		const result = await preflightMediaFiles({
			files: [first, second],
			options: {
				...TEST_OPTIONS,
				limits: {
					maxFileBytes: 100,
					maxBatchBytes: 100,
				},
			},
		});

		expect(result.files[0]?.status).toBe("accepted");
		expect(result.files[1]?.status).toBe("rejected");
		expect(result.files[1]?.reasons[0]?.code).toBe("batch-size-limit");
		expect(second.sliceCalls).toHaveLength(0);
	});

	test("enforces the existing 20-file selection limit", async () => {
		const files = Array.from(
			{ length: IMPORT_PREFLIGHT_LIMITS.maxFiles + 1 },
			(_, index) =>
				createFile({
					name: `clip-${index}.mp4`,
					type: "video/mp4",
					bytes: createIsoBmffBytes({ codec: "avc1" }),
				}),
		);
		const result = await preflightMediaFiles({
			files,
			options: TEST_OPTIONS,
		});

		expect(result.files.at(-1)?.status).toBe("rejected");
		expect(result.files.at(-1)?.reasons[0]?.code).toBe("file-count-limit");
	});

	test("requires confirmation when a valid container has no visible codec", async () => {
		const file = createFile({
			name: "unknown-codec.mov",
			type: "video/quicktime",
			bytes: createIsoBmffBytes({ brand: "qt  " }),
		});
		const result = await preflightMediaFiles({
			files: [file],
			options: TEST_OPTIONS,
		});

		expect(result.files[0]?.status).toBe("needs-confirmation");
		expect(result.files[0]?.reasons[0]?.code).toBe("codec-unknown");
	});

	test("requires confirmation rather than rejecting an unsupported codec", async () => {
		const file = createFile({
			name: "hevc.mov",
			type: "video/quicktime",
			bytes: createIsoBmffBytes({ brand: "qt  ", codec: "hvc1" }),
		});
		const result = await preflightMediaFiles({
			files: [file],
			options: {
				...TEST_OPTIONS,
				probePlaybackSupport: () => "unsupported",
			},
		});

		expect(result.files[0]?.status).toBe("needs-confirmation");
		expect(result.files[0]?.reasons[0]?.code).toBe("codec-unsupported");
	});

	test("marks valid WebM with unknown browser support for confirmation", async () => {
		const file = createFile({
			name: "vp9.webm",
			type: "video/webm",
			bytes: createWebMBytes({ codec: "V_VP9" }),
		});
		const result = await preflightMediaFiles({
			files: [file],
			options: {
				...TEST_OPTIONS,
				probePlaybackSupport: () => "unknown",
			},
		});

		expect(result.files[0]?.detectedContainer).toBe("webm");
		expect(result.files[0]?.detectedCodec).toBe("vp9");
		expect(result.files[0]?.status).toBe("needs-confirmation");
		expect(result.files[0]?.reasons[0]?.code).toBe("codec-support-unknown");
	});

	test("reads only the bounded header from a large valid file", async () => {
		const file = new TrackedLargeFile({
			name: "large-fast-start.mp4",
			type: "video/mp4",
			size: 512 * 1024 * 1024,
			header: createIsoBmffBytes({ codec: "avc1" }),
		});
		const result = await preflightMediaFiles({
			files: [file],
			options: TEST_OPTIONS,
		});

		expect(result.files[0]?.status).toBe("accepted");
		expect(file.sliceCalls[0]).toEqual({
			start: 0,
			end: IMPORT_PREFLIGHT_HEADER_BYTES,
		});
		expect(result.inspectedBytes).toBeLessThanOrEqual(
			IMPORT_PREFLIGHT_HEADER_BYTES,
		);
	});

	test("surfaces low browser storage as confirmation instead of hiding it", async () => {
		const file = createFile({
			name: "clip.mp4",
			type: "video/mp4",
			bytes: createIsoBmffBytes({ codec: "avc1" }),
		});
		const result = await preflightMediaFiles({
			files: [file],
			options: {
				...TEST_OPTIONS,
				readStorageQuota: async () => ({
					quotaBytes: 100,
					usageBytes: 90,
					headroomBytes: 10,
					availableBytes: 5,
				}),
			},
		});

		expect(result.files[0]?.status).toBe("needs-confirmation");
		expect(result.files[0]?.reasons.map((reason) => reason.code)).toContain(
			"storage-space-low",
		);
	});
});
