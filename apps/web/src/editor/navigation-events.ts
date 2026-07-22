export type TouchEditorTab = "ai" | "assets" | "preview" | "timeline";

export const OPEN_TOUCH_EDITOR_TAB_EVENT = "flowcut:open-touch-editor-tab";
export const OPEN_MEDIA_IMPORT_EVENT = "flowcut:open-media-import";
export const OPEN_NATIVE_EXPORT_EVENT = "flowcut:open-native-export";

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
