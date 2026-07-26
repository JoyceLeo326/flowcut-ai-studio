import {
	EXPORT_JOB_SCHEMA_VERSION,
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
	"RENDER_INTERRUPTED",
];

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
		!isRecord(value.guarantees)
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
		return (
			isString(job.variantId) &&
			isString(job.label) &&
			isStatus(job.status) &&
			isFiniteNumber(job.progress) &&
			job.progress >= 0 &&
			job.progress <= 1 &&
			isString(job.output.fileName) &&
			(job.output.format === "mp4" || job.output.format === "webm") &&
			["low", "medium", "high", "very_high"].includes(
				String(job.output.quality),
			) &&
			isPositiveSafeInteger(job.output.width) &&
			isPositiveSafeInteger(job.output.height) &&
			isFiniteNumber(job.output.fps) &&
			job.output.fps > 0 &&
			typeof job.output.includeAudio === "boolean" &&
			(job.output.targetLoudnessLufs === null ||
				isFiniteNumber(job.output.targetLoudnessLufs)) &&
			isFiniteNumber(job.output.targetDurationSeconds) &&
			job.output.targetDurationSeconds > 0 &&
			(job.capability.state === "supported" ||
				job.capability.state === "rejected") &&
			Array.isArray(job.capability.rejectionReasons) &&
			job.capability.rejectionReasons.every(
				(reason) => typeof reason === "string",
			) &&
			typeof job.capability.notice === "string" &&
			isString(job.queuedAt) &&
			isNullableString(job.startedAt) &&
			isNullableString(job.finishedAt) &&
			isFailure(job.failure) &&
			isArtifact(job.artifact) &&
			isMeasurements(job.measurements) &&
			(job.artifact === null ||
				(job.artifact.byteLength === job.artifact.blob.size &&
					job.measurements?.encodedByteLength === job.artifact.byteLength))
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

export function downloadExportArtifact(artifact: ExportJobArtifact): void {
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

export const exportJobStore = new ExportJobStore();
