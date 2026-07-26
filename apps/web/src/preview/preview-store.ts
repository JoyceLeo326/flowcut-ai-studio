import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isGuideId, type GuideId } from "@/guides";
import { DEFAULT_GRID_CONFIG, GRID_MAX, GRID_MIN } from "@/guides/grid";
import type { GridConfig } from "@/guides/types";

type PreviewOverlaysState = Record<string, boolean>;

interface PreviewState {
	activeGuide: GuideId | null;
	overlays: PreviewOverlaysState;
	gridConfig: GridConfig;
	toggleGuide: (guideId: GuideId) => void;
	setGridConfig: (config: Partial<GridConfig>) => void;
	setOverlayVisibility: ({
		overlayId,
		isVisible,
	}: {
		overlayId: string;
		isVisible: boolean;
	}) => void;
	toggleOverlayVisibility: ({ overlayId }: { overlayId: string }) => void;
}

const DEFAULT_PREVIEW_OVERLAYS: PreviewOverlaysState = {};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getPersistedActiveGuide(state: unknown): GuideId | null {
	if (!isRecord(state)) {
		return null;
	}

	const layoutGuide = isRecord(state.layoutGuide) ? state.layoutGuide : null;
	const persistedGuide = state.activeGuide ?? layoutGuide?.platform ?? null;

	if (typeof persistedGuide !== "string") {
		return null;
	}

	return isGuideId(persistedGuide) ? persistedGuide : null;
}

function getGridDimension({
	value,
	fallback,
}: {
	value: unknown;
	fallback: number;
}): number {
	return typeof value === "number" &&
		Number.isInteger(value) &&
		value >= GRID_MIN &&
		value <= GRID_MAX
		? value
		: fallback;
}

function getPersistedGridConfig(state: unknown): GridConfig {
	const gridConfig =
		isRecord(state) && isRecord(state.gridConfig) ? state.gridConfig : null;

	return {
		rows: getGridDimension({
			value: gridConfig?.rows,
			fallback: DEFAULT_GRID_CONFIG.rows,
		}),
		cols: getGridDimension({
			value: gridConfig?.cols,
			fallback: DEFAULT_GRID_CONFIG.cols,
		}),
	};
}

export const usePreviewStore = create<PreviewState>()(
	persist(
		(set) => ({
			activeGuide: null,
			overlays: DEFAULT_PREVIEW_OVERLAYS,
			gridConfig: DEFAULT_GRID_CONFIG,
			toggleGuide: (guideId) => {
				set((state) => ({
					activeGuide: state.activeGuide === guideId ? null : guideId,
				}));
			},
			setGridConfig: (config) => {
				set((state) => ({
					gridConfig: { ...state.gridConfig, ...config },
				}));
			},
			setOverlayVisibility: ({ overlayId, isVisible }) => {
				set((state) => ({
					overlays: {
						...state.overlays,
						[overlayId]: isVisible,
					},
				}));
			},
			toggleOverlayVisibility: ({ overlayId }) => {
				set((state) => ({
					overlays: {
						...state.overlays,
						[overlayId]: !state.overlays[overlayId],
					},
				}));
			},
		}),
		{
			name: "preview-settings",
			version: 6,
			migrate: (persistedState) => {
				return {
					activeGuide: getPersistedActiveGuide(persistedState),
					overlays: DEFAULT_PREVIEW_OVERLAYS,
					gridConfig: getPersistedGridConfig(persistedState),
				};
			},
			partialize: (state) => ({
				activeGuide: state.activeGuide,
				overlays: state.overlays,
				gridConfig: state.gridConfig,
			}),
		},
	),
);
