import { create } from "zustand";
import { persist } from "zustand/middleware";
import { PANEL_CONFIG } from "@/panels/layout";

export interface PanelSizes {
	tools: number;
	preview: number;
	properties: number;
	mainContent: number;
	timeline: number;
}

export type PanelId = keyof PanelSizes;

interface PanelState {
	panels: PanelSizes;
	setPanel: (args: { panel: PanelId; size: number }) => void;
	setPanels: (sizes: Partial<PanelSizes>) => void;
	resetPanels: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function readPanelSize({
	fallback,
	key,
	source,
}: {
	fallback: number;
	key: string;
	source: Record<string, unknown>;
}) {
	const value = source[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export const usePanelStore = create<PanelState>()(
	persist(
		(set) => ({
			...PANEL_CONFIG,
			setPanel: ({ panel, size }) =>
				set((state) => ({
					panels: {
						...state.panels,
						[panel]: size,
					},
				})),
			setPanels: (sizes) =>
				set((state) => ({
					panels: {
						...state.panels,
						...sizes,
					},
				})),
			resetPanels: () => set({ ...PANEL_CONFIG }),
		}),
		{
			name: "visioncut-panel-sizes",
			version: 2,
			migrate: (persistedState) => {
				if (!isRecord(persistedState)) {
					return { panels: { ...PANEL_CONFIG.panels } };
				}

				if (isRecord(persistedState.panels)) {
					const panels = persistedState.panels;
					return {
						panels: {
							tools: readPanelSize({
								source: panels,
								key: "tools",
								fallback: PANEL_CONFIG.panels.tools,
							}),
							preview: readPanelSize({
								source: panels,
								key: "preview",
								fallback: PANEL_CONFIG.panels.preview,
							}),
							properties: readPanelSize({
								source: panels,
								key: "properties",
								fallback: PANEL_CONFIG.panels.properties,
							}),
							mainContent: readPanelSize({
								source: panels,
								key: "mainContent",
								fallback: PANEL_CONFIG.panels.mainContent,
							}),
							timeline: readPanelSize({
								source: panels,
								key: "timeline",
								fallback: PANEL_CONFIG.panels.timeline,
							}),
						},
					};
				}

				const toolsPanel = readPanelSize({
					source: persistedState,
					key: "toolsPanel",
					fallback: PANEL_CONFIG.panels.tools,
				});
				const previewPanel = readPanelSize({
					source: persistedState,
					key: "previewPanel",
					fallback: PANEL_CONFIG.panels.preview,
				});
				const propertiesPanel = readPanelSize({
					source: persistedState,
					key: "propertiesPanel",
					fallback: PANEL_CONFIG.panels.properties,
				});

				return {
					panels: {
						tools: readPanelSize({
							source: persistedState,
							key: "tools",
							fallback: toolsPanel,
						}),
						preview: readPanelSize({
							source: persistedState,
							key: "preview",
							fallback: previewPanel,
						}),
						properties: readPanelSize({
							source: persistedState,
							key: "properties",
							fallback: propertiesPanel,
						}),
						mainContent: readPanelSize({
							source: persistedState,
							key: "mainContent",
							fallback: PANEL_CONFIG.panels.mainContent,
						}),
						timeline: readPanelSize({
							source: persistedState,
							key: "timeline",
							fallback: PANEL_CONFIG.panels.timeline,
						}),
					},
				};
			},
			partialize: (state) => ({
				panels: state.panels,
			}),
		},
	),
);
