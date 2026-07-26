import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline";
import { generateUUID } from "@/utils/id";
import {
	assertRoughCutPlan,
	getApprovedRoughCutOperations,
	type RoughCutPlan,
} from "./rough-cut-plan";
import { buildRoughCutTracks } from "./rough-cut-executor";
import { createLocalAssetFingerprintForMediaAsset } from "./media-index-adapter";

export class ApplyRoughCutCommand extends Command {
	override readonly handlesRipple = true;

	private savedState: SceneTracks | null = null;
	private readonly elementIds: readonly string[];
	readonly sceneId: string;

	constructor(private readonly plan: RoughCutPlan) {
		super();
		assertRoughCutPlan(plan);
		this.sceneId = plan.baseline.sceneId;
		this.elementIds = Object.freeze(
			Array.from(
				{ length: getApprovedRoughCutOperations(plan).length + 1 },
				() => generateUUID(),
			),
		);
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const scene = editor.scenes.getActiveScene();
		if (scene.id !== this.plan.baseline.sceneId) {
			throw new Error("Active scene no longer matches the rough-cut baseline.");
		}
		const asset = editor.media
			.getAssets()
			.find((candidate) => candidate.id === this.plan.assetId);
		if (!asset) {
			throw new Error("The analyzed asset is no longer available.");
		}
		const result = buildRoughCutTracks({
			tracks: scene.tracks,
			plan: this.plan,
			elementIds: this.elementIds,
			hasTimelineBookmarks: scene.bookmarks.length > 0,
			currentAssetFingerprint: createLocalAssetFingerprintForMediaAsset({
				asset,
			}),
		});
		this.savedState = scene.tracks;
		editor.timeline.updateTracks(result.tracks);
		return createElementSelectionResult([...result.createdElementRefs]);
	}

	undo(): void {
		if (!this.savedState) return;
		const editor = EditorCore.getInstance();
		if (editor.scenes.getActiveScene().id !== this.sceneId) {
			throw new Error("Active scene no longer matches the rough-cut command.");
		}
		editor.timeline.updateTracks(this.savedState);
	}
}
