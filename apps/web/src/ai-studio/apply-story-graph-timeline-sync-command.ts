import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline";
import type { StoryGraph } from "./story-graph-model";
import { buildStoryGraphTimelineSync } from "./story-graph-timeline-sync";

export class ApplyStoryGraphTimelineSyncCommand extends Command {
	override readonly handlesRipple = true;
	private savedState: SceneTracks | null = null;

	constructor({
		graph,
		sceneId,
	}: {
		graph: StoryGraph;
		sceneId: string;
	}) {
		super();
		this.graph = graph;
		this.sceneId = sceneId;
	}

	private readonly graph: StoryGraph;
	readonly sceneId: string;

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const scene = editor.scenes.getActiveScene();
		if (scene.id !== this.sceneId) {
			throw new Error("Active scene no longer matches the Story Graph draft.");
		}
		const result = buildStoryGraphTimelineSync({
			graph: this.graph,
			tracks: scene.tracks,
			bookmarks: scene.bookmarks,
		});
		this.savedState = scene.tracks;
		editor.timeline.updateTracks(result.tracks);
		return createElementSelectionResult(
			result.orderedElementIds.map((elementId) => ({
				trackId: result.targetTrackId!,
				elementId,
			})),
		);
	}

	undo(): void {
		if (!this.savedState) return;
		const editor = EditorCore.getInstance();
		if (editor.scenes.getActiveScene().id !== this.sceneId) {
			throw new Error("Active scene no longer matches the Story Graph command.");
		}
		editor.timeline.updateTracks(this.savedState);
	}
}
