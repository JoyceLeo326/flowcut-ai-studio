import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline";
import type {
	ChatCutPreparedImportPlan,
	PlaybackRate,
} from "./chatcut-result";
import { buildChatCutImportTracks } from "./chatcut-executor";

export class ApplyChatCutImportCommand extends Command {
	override readonly handlesRipple = true;

	private savedState: SceneTracks | null = null;

	readonly sceneId: string;
	private readonly plan: ChatCutPreparedImportPlan;
	private readonly fps: PlaybackRate;

	constructor({
		sceneId,
		plan,
		fps,
	}: {
		sceneId: string;
		plan: ChatCutPreparedImportPlan;
		fps: PlaybackRate;
	}) {
		super();
		this.sceneId = sceneId;
		this.plan = plan;
		this.fps = fps;
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const scene = editor.scenes.getActiveScene();
		if (scene.id !== this.sceneId || scene.id !== this.plan.timelineId) {
			throw new Error("活动场景与 ChatCut 导入基线不再一致。");
		}
		const result = buildChatCutImportTracks({
			tracks: scene.tracks,
			plan: this.plan,
			fps: this.fps,
			hasTimelineBookmarks: scene.bookmarks.length > 0,
		});
		this.savedState = scene.tracks;
		editor.timeline.updateTracks(result.tracks);
		return createElementSelectionResult([...result.changedElementRefs]);
	}

	undo(): void {
		if (!this.savedState) return;
		const editor = EditorCore.getInstance();
		if (editor.scenes.getActiveScene().id !== this.sceneId) {
			throw new Error("活动场景与 ChatCut 撤销目标不再一致。");
		}
		editor.timeline.updateTracks(this.savedState);
	}
}
