import { describe, expect, test } from "bun:test";
import type { StoryGraph } from "./story-graph-model";
import type { SceneTracks, VideoElement } from "@/timeline";
import { installMockWasm } from "@/test-utils/mock-wasm";

installMockWasm();

const { mediaTimeFromSeconds, mediaTimeToSeconds } = await import("@/wasm");
const { buildStoryGraphTimelineSync, inspectStoryGraphTimelineSync } =
	await import("./story-graph-timeline-sync");

const params = {
	transform: {
		position: { x: 0, y: 0 },
		scale: { x: 1, y: 1 },
		rotation: 0,
	},
	opacity: 1,
};

function video({
	id,
	start,
	duration,
}: {
	id: string;
	start: number;
	duration: number;
}): VideoElement {
	return {
		id,
		name: id,
		type: "video",
		mediaId: `asset-${id}`,
		startTime: mediaTimeFromSeconds({ seconds: start }),
		duration: mediaTimeFromSeconds({ seconds: duration }),
		trimStart: mediaTimeFromSeconds({ seconds: 0 }),
		trimEnd: mediaTimeFromSeconds({ seconds: 0 }),
		params,
	};
}

function tracks(elements: VideoElement[]): SceneTracks {
	return {
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements,
		},
		overlay: [],
		audio: [],
	};
}

function graph(elementIds: readonly string[]): StoryGraph {
	return {
		kind: "visioncut.story-graph",
		schemaVersion: 1,
		graphId: "graph-1",
		projectId: "project-1",
		version: 2,
		derivation: {
			deterministic: true,
			contentAnalysisPerformed: false,
			notice: "Timeline order draft.",
		},
		requirements: { network: false, paidService: false, apiKey: false },
		nodes: elementIds.map((elementId, index) => ({
			id: `node-${elementId}`,
			mediaId: `asset-${elementId}`,
			timelineStart: index,
			timelineEnd: index + 1,
			label: elementId,
			evidenceState: "timeline-and-media" as const,
			provenance: {
				sceneIds: ["scene-1"],
				trackIds: ["main"],
				timelineElementIds: [elementId],
				mediaIds: [`asset-${elementId}`],
				sourceNodeIds: [],
			},
		})),
	};
}

describe("Story Graph timeline synchronization", () => {
	test("reorders a contiguous same-track run while preserving total span", () => {
		const result = buildStoryGraphTimelineSync({
			graph: graph(["b", "a"]),
			tracks: tracks([
				video({ id: "a", start: 0, duration: 2 }),
				video({ id: "b", start: 2, duration: 3 }),
				video({ id: "c", start: 5, duration: 1 }),
			]),
		});
		expect(result.canApply).toBe(true);
		expect(result.tracks.main.elements.map((element) => element.id)).toEqual([
			"b",
			"a",
			"c",
		]);
		expect(
			result.tracks.main.elements.map((element) =>
				mediaTimeToSeconds({ time: element.startTime }),
			),
		).toEqual([0, 3, 5]);
	});

	test("reports an already synchronized graph as a no-op", () => {
		const inspection = inspectStoryGraphTimelineSync({
			graph: graph(["a", "b"]),
			tracks: tracks([
				video({ id: "a", start: 0, duration: 2 }),
				video({ id: "b", start: 2, duration: 3 }),
			]),
		});
		expect(inspection.canApply).toBe(false);
		expect(inspection.blockers.join(" ")).toContain("一致");
	});

	test("blocks gaps, overlapping layers and bookmarks", () => {
		const withGap = inspectStoryGraphTimelineSync({
			graph: graph(["b", "a"]),
			tracks: tracks([
				video({ id: "a", start: 0, duration: 2 }),
				video({ id: "b", start: 3, duration: 2 }),
			]),
		});
		expect(withGap.blockers.join(" ")).toContain("空隙");

		const withOverlay = tracks([
			video({ id: "a", start: 0, duration: 2 }),
			video({ id: "b", start: 2, duration: 3 }),
		]);
		withOverlay.overlay.push({
			id: "overlay",
			name: "Overlay",
			type: "video",
			muted: true,
			hidden: false,
			elements: [video({ id: "cover", start: 1, duration: 1 })],
		});
		expect(
			inspectStoryGraphTimelineSync({
				graph: graph(["b", "a"]),
				tracks: withOverlay,
			}).blockers.join(" "),
		).toContain("Overlay");

		expect(
			inspectStoryGraphTimelineSync({
				graph: graph(["b", "a"]),
				tracks: tracks([
					video({ id: "a", start: 0, duration: 2 }),
					video({ id: "b", start: 2, duration: 3 }),
				]),
				bookmarks: [{ time: mediaTimeFromSeconds({ seconds: 1 }) }],
			}).blockers.join(" "),
		).toContain("书签");
	});
});
