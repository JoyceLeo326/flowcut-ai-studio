import type { ExportManifest } from "@/ai-studio/export-manifest";

export type TouchEditorTab =
	| "canvas"
	| "ai"
	| "assets"
	| "preview"
	| "timeline";

export const OPEN_TOUCH_EDITOR_TAB_EVENT = "flowcut:open-touch-editor-tab";
export const OPEN_MEDIA_IMPORT_EVENT = "flowcut:open-media-import";
export const OPEN_NATIVE_EXPORT_EVENT = "flowcut:open-native-export";
export const START_VISIONCUT_EXPORT_QUEUE_EVENT =
	"flowcut:start-visioncut-export-queue";
export const CANCEL_VISIONCUT_EXPORT_QUEUE_EVENT =
	"flowcut:cancel-visioncut-export-queue";

export interface VisionCutExportQueueRequest {
	readonly manifest: ExportManifest;
}

export interface VisionCutExportQueueCancelRequest {
	readonly queueId: string;
}

export function requestMediaImport(): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent<TouchEditorTab>(OPEN_TOUCH_EDITOR_TAB_EVENT, {
			detail: "assets",
		}),
	);
	window.dispatchEvent(new Event(OPEN_MEDIA_IMPORT_EVENT));
}

export function requestNativeExport(): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new Event(OPEN_NATIVE_EXPORT_EVENT));
}

export function requestVisionCutExportQueue({
	manifest,
}: VisionCutExportQueueRequest): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent<VisionCutExportQueueRequest>(
			START_VISIONCUT_EXPORT_QUEUE_EVENT,
			{ detail: { manifest } },
		),
	);
}

export function requestVisionCutExportQueueCancel({
	queueId,
}: VisionCutExportQueueCancelRequest): void {
	if (typeof window === "undefined") return;
	window.dispatchEvent(
		new CustomEvent<VisionCutExportQueueCancelRequest>(
			CANCEL_VISIONCUT_EXPORT_QUEUE_EVENT,
			{ detail: { queueId } },
		),
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isVisionCutExportQueueRequest(
	value: unknown,
): value is VisionCutExportQueueRequest {
	if (!isRecord(value) || !isRecord(value.manifest)) return false;
	return (
		value.manifest.kind === "visioncut.export-manifest" &&
		typeof value.manifest.manifestId === "string" &&
		isRecord(value.manifest.project) &&
		typeof value.manifest.project.id === "string"
	);
}

export function isVisionCutExportQueueCancelRequest(
	value: unknown,
): value is VisionCutExportQueueCancelRequest {
	return (
		isRecord(value) &&
		typeof value.queueId === "string" &&
		value.queueId.length > 0
	);
}
