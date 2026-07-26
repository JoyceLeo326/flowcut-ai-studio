import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StoryGraph } from "@/ai-studio/story-graph-model";
import {
	createStoryGraphCanvasAggregate,
	rebaseStoryGraphCanvasAggregate,
	type StoryGraphCanvasAggregate,
} from "@/ai-studio/story-graph-canvas-model";

export type VisionCutExperience = "guided" | "pro";
export type VisionCutPrimarySurface = "canvas" | "preview";
export type VisionCutStoryGraphPublishStatus =
	| "accepted"
	| "stale"
	| "conflict"
	| "rejected";

export interface VisionCutWorkspaceState {
	experience: VisionCutExperience;
	primarySurface: VisionCutPrimarySurface;
	timelineVisible: boolean;
	storyGraph: StoryGraph | null;
	storyGraphAggregate: StoryGraphCanvasAggregate | null;
	setExperience: ({ experience }: { experience: VisionCutExperience }) => void;
	setPrimarySurface: ({
		surface,
	}: {
		surface: VisionCutPrimarySurface;
	}) => void;
	setTimelineVisible: ({ visible }: { visible: boolean }) => void;
	publishStoryGraph: ({ graph }: { graph: StoryGraph }) => void;
	publishStoryGraphCanvas: ({
		aggregate,
	}: {
		aggregate: StoryGraphCanvasAggregate;
	}) => VisionCutStoryGraphPublishStatus;
}

function isExperience(value: unknown): value is VisionCutExperience {
	return value === "guided" || value === "pro";
}

function isPrimarySurface(value: unknown): value is VisionCutPrimarySurface {
	return value === "canvas" || value === "preview";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export const useVisionCutWorkspaceStore = create<VisionCutWorkspaceState>()(
	persist(
		(set, get) => ({
			experience: "guided",
			primarySurface: "canvas",
			timelineVisible: false,
			storyGraph: null,
			storyGraphAggregate: null,
			setExperience: ({ experience }) =>
				set({
					experience,
					timelineVisible: experience === "pro",
				}),
			setPrimarySurface: ({ surface }) => set({ primarySurface: surface }),
			setTimelineVisible: ({ visible }) => set({ timelineVisible: visible }),
			publishStoryGraph: ({ graph }) =>
				set((state) => {
					const current = state.storyGraphAggregate;
					let aggregate: StoryGraphCanvasAggregate;
					if (
						current !== null &&
						current.projectId === graph.projectId &&
						current.graphId === graph.graphId &&
						current.graphVersion === graph.version
					) {
						try {
							aggregate = rebaseStoryGraphCanvasAggregate({
								aggregate: current,
								graph,
							});
						} catch {
							aggregate = createStoryGraphCanvasAggregate({ graph });
						}
					} else {
						aggregate = createStoryGraphCanvasAggregate({ graph });
					}
					return {
						storyGraph: graph,
						storyGraphAggregate: aggregate,
					};
				}),
			publishStoryGraphCanvas: ({ aggregate }) => {
				const state = get();
				if (
					state.storyGraph === null ||
					state.storyGraph.projectId !== aggregate.projectId ||
					state.storyGraph.graphId !== aggregate.graphId ||
					state.storyGraph.version !== aggregate.graphVersion
				) {
					return "rejected";
				}
				let canonical: StoryGraphCanvasAggregate;
				try {
					canonical = rebaseStoryGraphCanvasAggregate({
						aggregate,
						graph: state.storyGraph,
					});
				} catch {
					return "rejected";
				}
				const current = state.storyGraphAggregate;
				if (
					current !== null &&
					current.projectId === canonical.projectId &&
					current.graphId === canonical.graphId &&
					current.graphVersion === canonical.graphVersion
				) {
					if (canonical.revision < current.revision) return "stale";
					if (canonical.revision === current.revision) {
						return JSON.stringify(canonical.canvas) ===
							JSON.stringify(current.canvas)
							? "accepted"
							: "conflict";
					}
				}
				set({ storyGraphAggregate: canonical });
				return "accepted";
			},
		}),
		{
			name: "visioncut-workspace-preferences",
			version: 1,
			migrate: (persistedState) => {
				if (!isRecord(persistedState)) {
					return {
						experience: "guided",
						primarySurface: "canvas",
						timelineVisible: false,
					};
				}
				return {
					experience: isExperience(persistedState.experience)
						? persistedState.experience
						: "guided",
					primarySurface: isPrimarySurface(persistedState.primarySurface)
						? persistedState.primarySurface
						: "canvas",
					timelineVisible:
						typeof persistedState.timelineVisible === "boolean"
							? persistedState.timelineVisible
							: false,
				};
			},
			partialize: (state) => ({
				experience: state.experience,
				primarySurface: state.primarySurface,
				timelineVisible: state.timelineVisible,
			}),
		},
	),
);
