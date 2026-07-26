import { describe, expect, test } from "bun:test";
import type { MediaImportPreflightFeedback } from "./import-feedback";
import {
	IMPORT_PREFLIGHT_LIMITS,
	type ImportPreflightFileResult,
	type ImportPreflightOptions,
} from "./import-preflight";
import {
	claimPreparedMediaImport,
	prepareMediaImport,
	type PreparedMediaImport,
} from "./import-service";

const ENOUGH_STORAGE = {
	quotaBytes: 64 * 1024 * 1024 * 1024,
	usageBytes: 0,
	headroomBytes: 64 * 1024 * 1024 * 1024,
	availableBytes: 63 * 1024 * 1024 * 1024,
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
	codec,
}: {
	codec?: string;
} = {}): Uint8Array {
	const bytes = new Uint8Array(96);
	bytes.set([0, 0, 0, 96], 0);
	writeAscii({ bytes, offset: 4, value: "ftyp" });
	writeAscii({ bytes, offset: 8, value: "isom" });
	writeAscii({ bytes, offset: 16, value: "isom" });
	if (codec) writeAscii({ bytes, offset: 32, value: codec });
	return bytes;
}

function createFile({
	name,
	type = "video/mp4",
	bytes = createIsoBmffBytes({ codec: "avc1" }),
	size,
}: {
	name: string;
	type?: string;
	bytes?: Uint8Array;
	size?: number;
}): File {
	const file = new File([bytes], name, { type, lastModified: 123 });
	if (size !== undefined) {
		Object.defineProperty(file, "size", { value: size });
	}
	return file;
}

function createFeedback({ confirmWarnings }: { confirmWarnings: boolean }): {
	feedback: MediaImportPreflightFeedback;
	rejectedBatches: Array<readonly ImportPreflightFileResult<File>[]>;
	warningBatches: Array<readonly ImportPreflightFileResult<File>[]>;
} {
	const rejectedBatches: Array<readonly ImportPreflightFileResult<File>[]> = [];
	const warningBatches: Array<readonly ImportPreflightFileResult<File>[]> = [];

	return {
		feedback: {
			showRejected: ({ results }) => rejectedBatches.push(results),
			confirmWarnings: async ({ results }) => {
				warningBatches.push(results);
				return confirmWarnings;
			},
		},
		rejectedBatches,
		warningBatches,
	};
}

describe("unified media import service", () => {
	test("only prepares accepted files when warnings are declined", async () => {
		const feedback = createFeedback({ confirmWarnings: false });
		const preparedImport = await prepareMediaImport({
			files: [
				createFile({ name: "accepted.mp4" }),
				createFile({
					name: "needs-confirmation.mp4",
					bytes: createIsoBmffBytes(),
				}),
				createFile({
					name: "corrupted.mp4",
					bytes: new Uint8Array([1, 2, 3, 4]),
				}),
			],
			preflightOptions: TEST_OPTIONS,
			feedback: feedback.feedback,
		});

		expect(preparedImport.files.map((file) => file.name)).toEqual([
			"accepted.mp4",
		]);
		expect(preparedImport.rejectedCount).toBe(1);
		expect(preparedImport.confirmationDeclinedCount).toBe(1);
		expect(feedback.rejectedBatches[0]?.[0]?.file.name).toBe("corrupted.mp4");
		expect(feedback.warningBatches[0]?.[0]?.file.name).toBe(
			"needs-confirmation.mp4",
		);
	});

	test("normalizes confirmed files and issues a one-use processing receipt", async () => {
		const feedback = createFeedback({ confirmWarnings: true });
		const preparedImport = await prepareMediaImport({
			files: [
				createFile({
					name: "generic.mp4",
					type: "application/octet-stream",
				}),
			],
			preflightOptions: TEST_OPTIONS,
			feedback: feedback.feedback,
		});

		expect(preparedImport.files[0]?.type).toBe("video/mp4");
		expect(feedback.warningBatches).toHaveLength(1);
		expect(claimPreparedMediaImport({ preparedImport })).toEqual(
			preparedImport.files,
		);
		expect(() => claimPreparedMediaImport({ preparedImport })).toThrow(
			"already been processed",
		);

		const forgedImport: PreparedMediaImport = Object.freeze({
			...preparedImport,
			files: Object.freeze([...preparedImport.files]),
		});
		expect(() =>
			claimPreparedMediaImport({ preparedImport: forgedImport }),
		).toThrow("not preflighted");
	});

	test("enforces the 4 GiB file and 12 GiB batch limits before processing", async () => {
		const feedback = createFeedback({ confirmWarnings: true });
		const oversized = await prepareMediaImport({
			files: [
				createFile({
					name: "oversized.mp4",
					size: IMPORT_PREFLIGHT_LIMITS.maxFileBytes + 1,
				}),
			],
			preflightOptions: TEST_OPTIONS,
			feedback: feedback.feedback,
		});
		expect(oversized.files).toHaveLength(0);
		expect(oversized.preflight.files[0]?.reasons[0]?.code).toBe(
			"file-size-limit",
		);

		const batch = await prepareMediaImport({
			files: Array.from({ length: 4 }, (_, index) =>
				createFile({
					name: `large-${index}.mp4`,
					size: IMPORT_PREFLIGHT_LIMITS.maxFileBytes,
				}),
			),
			preflightOptions: TEST_OPTIONS,
			feedback: feedback.feedback,
		});
		expect(batch.files).toHaveLength(3);
		expect(batch.preflight.files[3]?.reasons[0]?.code).toBe("batch-size-limit");
	});

	test("enforces the 20-file limit and validates actual file headers", async () => {
		const feedback = createFeedback({ confirmWarnings: true });
		const tooMany = await prepareMediaImport({
			files: Array.from(
				{ length: IMPORT_PREFLIGHT_LIMITS.maxFiles + 1 },
				(_, index) => createFile({ name: `clip-${index}.mp4` }),
			),
			preflightOptions: TEST_OPTIONS,
			feedback: feedback.feedback,
		});
		expect(tooMany.files).toHaveLength(IMPORT_PREFLIGHT_LIMITS.maxFiles);
		expect(tooMany.preflight.files.at(-1)?.reasons[0]?.code).toBe(
			"file-count-limit",
		);

		const disguised = await prepareMediaImport({
			files: [
				createFile({
					name: "disguised.mp4",
					bytes: new Uint8Array([
						0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
					]),
				}),
			],
			preflightOptions: TEST_OPTIONS,
			feedback: feedback.feedback,
		});
		expect(disguised.files).toHaveLength(0);
		expect(
			disguised.preflight.files[0]?.reasons.map((reason) => reason.code),
		).toContain("extension-container-mismatch");
	});
});
