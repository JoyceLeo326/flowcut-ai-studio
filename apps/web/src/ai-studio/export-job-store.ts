import {
	EXPORT_JOB_SCHEMA_VERSION,
	hasDownloadableExportArtifact,
	markInterruptedExportQueue,
	type ExportJobArtifact,
	type ExportJobFailure,
	type ExportJobFailureCode,
	type ExportJobFailureKind,
	type ExportJobMeasurements,
	type ExportJobQueue,
	type ExportJobStatus,
} from "./export-job";

export interface ExportJobStorage {
	readProject(projectId: string): Promise<ExportJobQueue | null>;
	writeProject(queue: ExportJobQueue): Promise<void>;
	deleteProject(projectId: string): Promise<void>;
}

const EXPORT_JOB_STATUSES: readonly ExportJobStatus[] = [
	"queued",
	"rendering",
	"completed",
	"failed",
	"cancelled",
];
const EXPORT_JOB_FAILURE_KINDS: readonly ExportJobFailureKind[] = [
	"manifest-blocked",
	"unsupported",
	"stale-project",
	"render-error",
	"interrupted",
];
const EXPORT_JOB_FAILURE_CODES: readonly ExportJobFailureCode[] = [
	"MANIFEST_BLOCKED",
	"PROJECT_ID_MISMATCH",
	"PROJECT_VERSION_MISMATCH",
	"SCENE_ID_MISMATCH",
	"PROJECT_CANVAS_MISMATCH",
	"PROJECT_DURATION_MISMATCH",
	"REFRAME_NOT_REVIEWED",
	"TARGET_DURATION_NOT_RENDERABLE",
	"EXTERNAL_BURN_IN_UNSUPPORTED",
	"SIDECAR_SUBTITLES_UNSUPPORTED",
	"COVER_ARTIFACT_UNSUPPORTED",
	"RENDERER_FAILED",
	"RENDERER_RETURNED_NO_BUFFER",
	"RENDERER_RETURNED_EMPTY_BUFFER",
	"RENDER_INTERRUPTED",
];

const EXPORT_PLATFORMS = [
	"youtube",
	"douyin",
	"xiaohongshu",
	"bilibili",
	"podcast",
	"generic",
] as const;
const EXPORT_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === "string";
}

function isStatus(value: unknown): value is ExportJobStatus {
	return (
		typeof value === "string" &&
		EXPORT_JOB_STATUSES.some((status) => status === value)
	);
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFailureKind(value: unknown): value is ExportJobFailureKind {
	return (
		typeof value === "string" &&
		EXPORT_JOB_FAILURE_KINDS.some((kind) => kind === value)
	);
}

function isFailureCode(value: unknown): value is ExportJobFailureCode {
	return (
		typeof value === "string" &&
		EXPORT_JOB_FAILURE_CODES.some((code) => code === value)
	);
}

function isFailure(value: unknown): value is ExportJobFailure | null {
	return (
		value === null ||
		(isRecord(value) &&
			isFailureKind(value.kind) &&
			isFailureCode(value.code) &&
			isString(value.message))
	);
}

function isArtifact(value: unknown): value is ExportJobArtifact | null {
	if (value === null) return true;
	if (!isRecord(value)) return false;
	return (
		isString(value.fileName) &&
		isString(value.mimeType) &&
		value.blob instanceof Blob &&
		typeof value.byteLength === "number" &&
		Number.isSafeInteger(value.byteLength) &&
		value.byteLength >= 0 &&
		isString(value.createdAt)
	);
}

function isMeasurements(value: unknown): value is ExportJobMeasurements | null {
	if (value === null) return true;
	if (
		!isRecord(value) ||
		!isFiniteNumber(value.encodedByteLength) ||
		value.encodedByteLength < 0 ||
		!isFiniteNumber(value.renderElapsedMs) ||
		value.renderElapsedMs < 0 ||
		!isRecord(value.loudness) ||
		!isRecord(value.encodedDuration)
	) {
		return false;
	}
	return (
		value.loudness.state === "not-measured" &&
		value.loudness.measuredIntegratedLufs === null &&
		(value.loudness.targetIntegratedLufs === null ||
			isFiniteNumber(value.loudness.targetIntegratedLufs)) &&
		typeof value.loudness.notice === "string" &&
		value.encodedDuration.state === "not-probed" &&
		value.encodedDuration.measuredSeconds === null
	);
}

export function isExportJobQueue(value: unknown): value is ExportJobQueue {
	if (!isRecord(value)) return false;
	if (
		value.kind !== "visioncut.local-export-queue" ||
		value.schemaVersion !== EXPORT_JOB_SCHEMA_VERSION ||
		!isString(value.queueId) ||
		!isString(value.projectId) ||
		!Number.isSafeInteger(value.projectVersion) ||
		!isString(value.sceneId) ||
		!isString(value.manifestId) ||
		!isStatus(value.status) ||
		typeof value.progress !== "number" ||
		!Number.isFinite(value.progress) ||
		!isString(value.createdAt) ||
		!isNullableString(value.startedAt) ||
		!isNullableString(value.finishedAt) ||
		!isString(value.updatedAt) ||
		!Array.isArray(value.jobs) ||
		!isRecord(value.guarantees) ||
		(value.bundleFileName !== undefined && !isString(value.bundleFileName)) ||
		(value.retryOfQueueId !== undefined && !isString(value.retryOfQueueId)) ||
		(value.reusedArtifactCount !== undefined &&
			!isNonNegativeSafeInteger(value.reusedArtifactCount))
	) {
		return false;
	}
	if (
		value.guarantees.localRendererOnly !== true ||
		value.guarantees.automaticUpload !== false ||
		value.guarantees.timelineMutation !== false ||
		value.guarantees.loudnessMeasurementClaimed !== false
	) {
		return false;
	}
	return value.jobs.every((job) => {
		if (!isRecord(job) || !isRecord(job.output) || !isRecord(job.capability)) {
			return false;
		}
		const output = job.output;
		const capability = job.capability;
		const structurallyValid =
			isString(job.variantId) &&
			isString(job.label) &&
			isStatus(job.status) &&
			isFiniteNumber(job.progress) &&
			job.progress >= 0 &&
			job.progress <= 1 &&
			isString(output.fileName) &&
			(output.format === "mp4" || output.format === "webm") &&
			(output.platform === undefined ||
				EXPORT_PLATFORMS.some((platform) => platform === output.platform)) &&
			(output.aspectRatio === undefined ||
				EXPORT_ASPECT_RATIOS.some(
					(aspectRatio) => aspectRatio === output.aspectRatio,
				)) &&
			["low", "medium", "high", "very_high"].includes(String(output.quality)) &&
			isPositiveSafeInteger(output.width) &&
			isPositiveSafeInteger(output.height) &&
			isFiniteNumber(output.fps) &&
			output.fps > 0 &&
			typeof output.includeAudio === "boolean" &&
			(output.targetLoudnessLufs === null ||
				isFiniteNumber(output.targetLoudnessLufs)) &&
			isFiniteNumber(output.targetDurationSeconds) &&
			output.targetDurationSeconds > 0 &&
			(capability.state === "supported" || capability.state === "rejected") &&
			Array.isArray(capability.rejectionReasons) &&
			capability.rejectionReasons.every(
				(reason) => typeof reason === "string",
			) &&
			typeof capability.notice === "string" &&
			isString(job.queuedAt) &&
			isNullableString(job.startedAt) &&
			isNullableString(job.finishedAt) &&
			isFailure(job.failure) &&
			isArtifact(job.artifact) &&
			isMeasurements(job.measurements) &&
			(job.attempt === undefined || isPositiveSafeInteger(job.attempt)) &&
			(job.artifactOrigin === undefined ||
				job.artifactOrigin === null ||
				job.artifactOrigin === "rendered-this-queue" ||
				job.artifactOrigin === "reused-local-artifact") &&
			(job.artifact === null ||
				(job.artifact.byteLength === job.artifact.blob.size &&
					job.measurements?.encodedByteLength === job.artifact.byteLength));
		if (!structurallyValid) return false;
		if (job.status !== "completed") return true;
		const artifact = job.artifact;
		if (!isArtifact(artifact) || artifact === null) return false;
		return (
			artifact.byteLength > 0 &&
			artifact.fileName === output.fileName &&
			artifact.mimeType ===
				(output.format === "mp4" ? "video/mp4" : "video/webm") &&
			(artifact.blob.type === "" || artifact.blob.type === artifact.mimeType)
		);
	});
}

function normalizeProjectId(projectId: string): string {
	const normalized = projectId.normalize("NFKC").trim();
	if (!normalized || normalized.length > 240) {
		throw new Error("Export job project ID is invalid.");
	}
	return normalized;
}

export class MemoryExportJobStorage implements ExportJobStorage {
	private readonly queues = new Map<string, ExportJobQueue>();

	async readProject(projectId: string): Promise<ExportJobQueue | null> {
		return this.queues.get(normalizeProjectId(projectId)) ?? null;
	}

	async writeProject(queue: ExportJobQueue): Promise<void> {
		if (!isExportJobQueue(queue)) {
			throw new Error("Export queue failed storage validation.");
		}
		this.queues.set(normalizeProjectId(queue.projectId), queue);
	}

	async deleteProject(projectId: string): Promise<void> {
		this.queues.delete(normalizeProjectId(projectId));
	}
}

export class IndexedDBExportJobStorage implements ExportJobStorage {
	private readonly fallback: ExportJobStorage;

	constructor(
		private readonly options: {
			readonly databaseName?: string;
			readonly storeName?: string;
			readonly indexedDBFactory?: IDBFactory | null;
			readonly fallback?: ExportJobStorage;
		} = {},
	) {
		this.fallback = options.fallback ?? new MemoryExportJobStorage();
	}

	private factory(): IDBFactory | null {
		if (this.options.indexedDBFactory !== undefined) {
			return this.options.indexedDBFactory;
		}
		return typeof indexedDB === "undefined" ? null : indexedDB;
	}

	private storeName(): string {
		return this.options.storeName ?? "project-export-queues";
	}

	private async open(): Promise<IDBDatabase | null> {
		const factory = this.factory();
		if (!factory) return null;
		return new Promise((resolve, reject) => {
			const request = factory.open(
				this.options.databaseName ?? "visioncut-export-jobs",
				1,
			);
			request.onerror = () => reject(request.error);
			request.onblocked = () =>
				reject(new Error("Export job storage is blocked."));
			request.onupgradeneeded = () => {
				if (!request.result.objectStoreNames.contains(this.storeName())) {
					request.result.createObjectStore(this.storeName());
				}
			};
			request.onsuccess = () => resolve(request.result);
		});
	}

	async readProject(projectId: string): Promise<ExportJobQueue | null> {
		const normalizedProjectId = normalizeProjectId(projectId);
		const database = await this.open().catch(() => null);
		if (!database) return this.fallback.readProject(normalizedProjectId);
		try {
			const value = await new Promise<unknown | null>((resolve, reject) => {
				const request = database
					.transaction(this.storeName(), "readonly")
					.objectStore(this.storeName())
					.get(normalizedProjectId);
				request.onerror = () => reject(request.error);
				request.onsuccess = () =>
					resolve(request.result === undefined ? null : request.result);
			});
			if (value !== null && isExportJobQueue(value)) return value;
		} catch {
			// Restricted browser storage falls back to memory.
		} finally {
			database.close();
		}
		return this.fallback.readProject(normalizedProjectId);
	}

	async writeProject(queue: ExportJobQueue): Promise<void> {
		if (!isExportJobQueue(queue)) {
			throw new Error("Export queue failed storage validation.");
		}
		const database = await this.open().catch(() => null);
		if (!database) return this.fallback.writeProject(queue);
		try {
			await new Promise<void>((resolve, reject) => {
				const transaction = database.transaction(this.storeName(), "readwrite");
				transaction.objectStore(this.storeName()).put(queue, queue.projectId);
				transaction.onerror = () =>
					reject(transaction.error ?? new Error("Export queue write failed."));
				transaction.onabort = () =>
					reject(transaction.error ?? new Error("Export queue write aborted."));
				transaction.oncomplete = () => resolve();
			});
			await this.fallback.writeProject(queue);
		} catch {
			await this.fallback.writeProject(queue);
		} finally {
			database.close();
		}
	}

	async deleteProject(projectId: string): Promise<void> {
		const normalizedProjectId = normalizeProjectId(projectId);
		const database = await this.open().catch(() => null);
		if (database) {
			try {
				await new Promise<void>((resolve, reject) => {
					const transaction = database.transaction(
						this.storeName(),
						"readwrite",
					);
					transaction.objectStore(this.storeName()).delete(normalizedProjectId);
					transaction.onerror = () =>
						reject(
							transaction.error ?? new Error("Export queue delete failed."),
						);
					transaction.onabort = () =>
						reject(
							transaction.error ?? new Error("Export queue delete aborted."),
						);
					transaction.oncomplete = () => resolve();
				});
			} catch {
				// The in-memory fallback is still cleared below.
			} finally {
				database.close();
			}
		}
		await this.fallback.deleteProject(normalizedProjectId);
	}
}

type ExportJobStoreListener = () => void;

export class ExportJobStore {
	private readonly queues = new Map<string, ExportJobQueue>();
	private readonly loadedProjects = new Set<string>();
	private readonly listeners = new Set<ExportJobStoreListener>();
	private persistenceTail: Promise<void> = Promise.resolve();

	constructor(
		private readonly storage: ExportJobStorage = new IndexedDBExportJobStorage(),
	) {}

	subscribe(listener: ExportJobStoreListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	getProject(projectId: string): ExportJobQueue | null {
		return this.queues.get(normalizeProjectId(projectId)) ?? null;
	}

	async loadProject(projectId: string): Promise<ExportJobQueue | null> {
		const normalizedProjectId = normalizeProjectId(projectId);
		if (this.loadedProjects.has(normalizedProjectId)) {
			return this.getProject(normalizedProjectId);
		}
		const stored = await this.storage.readProject(normalizedProjectId);
		this.loadedProjects.add(normalizedProjectId);
		if (!stored) {
			this.emit();
			return null;
		}
		const normalized = markInterruptedExportQueue({ queue: stored });
		this.queues.set(normalizedProjectId, normalized);
		if (normalized !== stored) {
			this.schedulePersist(normalized);
		}
		this.emit();
		return normalized;
	}

	setProject(queue: ExportJobQueue): void {
		if (!isExportJobQueue(queue)) {
			throw new Error("Export queue failed store validation.");
		}
		const projectId = normalizeProjectId(queue.projectId);
		this.loadedProjects.add(projectId);
		this.queues.set(projectId, queue);
		this.schedulePersist(queue);
		this.emit();
	}

	async deleteProject(projectId: string): Promise<void> {
		const normalizedProjectId = normalizeProjectId(projectId);
		this.queues.delete(normalizedProjectId);
		this.loadedProjects.add(normalizedProjectId);
		await this.storage.deleteProject(normalizedProjectId);
		this.emit();
	}

	async flush(): Promise<void> {
		await this.persistenceTail;
	}

	private schedulePersist(queue: ExportJobQueue): void {
		this.persistenceTail = this.persistenceTail
			.catch(() => undefined)
			.then(() => this.storage.writeProject(queue));
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}

function assertStandaloneArtifact(artifact: ExportJobArtifact): void {
	if (
		!artifact.fileName ||
		!artifact.mimeType ||
		!(artifact.blob instanceof Blob) ||
		artifact.byteLength <= 0 ||
		artifact.blob.size !== artifact.byteLength ||
		(artifact.blob.type !== "" && artifact.blob.type !== artifact.mimeType)
	) {
		throw new Error("本地产物不完整，已停止下载；请重新渲染该变体。");
	}
}

export function downloadExportArtifact(artifact: ExportJobArtifact): void {
	assertStandaloneArtifact(artifact);
	const url = window.URL.createObjectURL(artifact.blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = artifact.fileName;
	anchor.hidden = true;
	document.body.append(anchor);
	try {
		anchor.click();
	} finally {
		anchor.remove();
		window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
	}
}

export function getDownloadableExportArtifacts(
	queue: ExportJobQueue,
): readonly ExportJobArtifact[] {
	return queue.jobs.flatMap((job) =>
		hasDownloadableExportArtifact(job) ? [job.artifact] : [],
	);
}

const ZIP_LOCAL_FILE_HEADER_SIZE = 30;
const ZIP_CENTRAL_DIRECTORY_HEADER_SIZE = 46;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const ZIP32_MAX_VALUE = 0xffff_ffff;

function crc32Update({
	crc,
	chunk,
}: {
	crc: number;
	chunk: Uint8Array;
}): number {
	let next = crc;
	for (const value of chunk) {
		next ^= value;
		for (let bit = 0; bit < 8; bit += 1) {
			next = (next >>> 1) ^ (next & 1 ? 0xedb8_8320 : 0);
		}
	}
	return next;
}

async function calculateBlobCrc32(blob: Blob): Promise<number> {
	let crc = 0xffff_ffff;
	const reader = blob.stream().getReader();
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			crc = crc32Update({ crc, chunk: value });
		}
	} finally {
		reader.releaseLock();
	}
	return (crc ^ 0xffff_ffff) >>> 0;
}

function zipDateTime(isoDate: string): {
	readonly date: number;
	readonly time: number;
} {
	const parsed = new Date(isoDate);
	const value = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
	const year = Math.min(2107, Math.max(1980, value.getFullYear()));
	return {
		date:
			((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
		time:
			(value.getHours() << 11) |
			(value.getMinutes() << 5) |
			Math.floor(value.getSeconds() / 2),
	};
}

function zipHeader(size: number): {
	readonly bytes: Uint8Array<ArrayBuffer>;
	readonly view: DataView;
} {
	const bytes = new Uint8Array(new ArrayBuffer(size));
	return { bytes, view: new DataView(bytes.buffer) };
}

function writeZipEntryHeaders({
	artifact,
	crc32,
	name,
	localOffset,
}: {
	artifact: ExportJobArtifact;
	crc32: number;
	name: Uint8Array;
	localOffset: number;
}): { readonly local: Uint8Array; readonly central: Uint8Array } {
	const { date, time } = zipDateTime(artifact.createdAt);
	const localHeader = zipHeader(ZIP_LOCAL_FILE_HEADER_SIZE + name.byteLength);
	localHeader.view.setUint32(0, 0x0403_4b50, true);
	localHeader.view.setUint16(4, 20, true);
	localHeader.view.setUint16(6, 0x0800, true);
	localHeader.view.setUint16(8, 0, true);
	localHeader.view.setUint16(10, time, true);
	localHeader.view.setUint16(12, date, true);
	localHeader.view.setUint32(14, crc32, true);
	localHeader.view.setUint32(18, artifact.byteLength, true);
	localHeader.view.setUint32(22, artifact.byteLength, true);
	localHeader.view.setUint16(26, name.byteLength, true);
	localHeader.bytes.set(name, ZIP_LOCAL_FILE_HEADER_SIZE);

	const centralHeader = zipHeader(
		ZIP_CENTRAL_DIRECTORY_HEADER_SIZE + name.byteLength,
	);
	centralHeader.view.setUint32(0, 0x0201_4b50, true);
	centralHeader.view.setUint16(4, 20, true);
	centralHeader.view.setUint16(6, 20, true);
	centralHeader.view.setUint16(8, 0x0800, true);
	centralHeader.view.setUint16(10, 0, true);
	centralHeader.view.setUint16(12, time, true);
	centralHeader.view.setUint16(14, date, true);
	centralHeader.view.setUint32(16, crc32, true);
	centralHeader.view.setUint32(20, artifact.byteLength, true);
	centralHeader.view.setUint32(24, artifact.byteLength, true);
	centralHeader.view.setUint16(28, name.byteLength, true);
	centralHeader.view.setUint32(42, localOffset, true);
	centralHeader.bytes.set(name, ZIP_CENTRAL_DIRECTORY_HEADER_SIZE);
	return { local: localHeader.bytes, central: centralHeader.bytes };
}

function fallbackBundleFileName(projectId: string): string {
	const projectPart = projectId
		.normalize("NFKC")
		.split("")
		.map((character) =>
			'<>:"/\\|?*'.includes(character) || (character.codePointAt(0) ?? 0) <= 31
				? "-"
				: character,
		)
		.join("")
		.replace(/\s+/gu, "-")
		.slice(0, 80);
	return `${projectPart || "visioncut"}_visioncut-delivery.zip`;
}

export async function createExportArtifactBundle(
	queue: ExportJobQueue,
): Promise<ExportJobArtifact> {
	const artifacts = getDownloadableExportArtifacts(queue);
	if (artifacts.length === 0) {
		throw new Error("当前没有经过校验的本地成片可供下载。");
	}
	if (artifacts.length > 0xffff) {
		throw new Error("可下载文件数量超过 ZIP32 上限。");
	}

	const encoder = new TextEncoder();
	const localParts: BlobPart[] = [];
	const centralParts: Uint8Array<ArrayBuffer>[] = [];
	const fileNames = new Set<string>();
	let localOffset = 0;
	for (const artifact of artifacts) {
		assertStandaloneArtifact(artifact);
		if (fileNames.has(artifact.fileName)) {
			throw new Error(
				`交付包存在重复文件名：${artifact.fileName}。请重新生成交付清单。`,
			);
		}
		fileNames.add(artifact.fileName);
		const name = encoder.encode(artifact.fileName);
		if (name.byteLength > 0xffff || artifact.byteLength > ZIP32_MAX_VALUE) {
			throw new Error("文件过大，无法使用浏览器 ZIP32 打包；请逐个下载。");
		}
		const crc32 = await calculateBlobCrc32(artifact.blob);
		const headers = writeZipEntryHeaders({
			artifact,
			crc32,
			name,
			localOffset,
		});
		localParts.push(new Uint8Array(headers.local).buffer, artifact.blob);
		centralParts.push(new Uint8Array(headers.central));
		localOffset += headers.local.byteLength + artifact.byteLength;
		if (localOffset > ZIP32_MAX_VALUE) {
			throw new Error("交付包超过 ZIP32 上限，请逐个下载成片。");
		}
	}

	const centralSize = centralParts.reduce(
		(total, part) => total + part.byteLength,
		0,
	);
	if (
		centralSize > ZIP32_MAX_VALUE ||
		localOffset + centralSize > ZIP32_MAX_VALUE
	) {
		throw new Error("交付包超过 ZIP32 上限，请逐个下载成片。");
	}
	const end = zipHeader(ZIP_END_OF_CENTRAL_DIRECTORY_SIZE);
	end.view.setUint32(0, 0x0605_4b50, true);
	end.view.setUint16(8, artifacts.length, true);
	end.view.setUint16(10, artifacts.length, true);
	end.view.setUint32(12, centralSize, true);
	end.view.setUint32(16, localOffset, true);

	const blob = new Blob(
		[
			...localParts,
			...centralParts.map((part) => part.buffer),
			end.bytes.buffer,
		],
		{ type: "application/zip" },
	);
	return {
		fileName: queue.bundleFileName ?? fallbackBundleFileName(queue.projectId),
		mimeType: "application/zip",
		blob,
		byteLength: blob.size,
		createdAt: new Date().toISOString(),
	};
}

export async function downloadExportArtifactBundle(
	queue: ExportJobQueue,
): Promise<{ readonly fileName: string; readonly fileCount: number }> {
	const fileCount = getDownloadableExportArtifacts(queue).length;
	const bundle = await createExportArtifactBundle(queue);
	downloadExportArtifact(bundle);
	return { fileName: bundle.fileName, fileCount };
}

export const exportJobStore = new ExportJobStore();
