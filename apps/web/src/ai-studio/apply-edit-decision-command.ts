import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { SceneTracks } from "@/timeline";
import { generateUUID } from "@/utils/id";
import type {
	EditDecisionCurrentAssetState,
	EditDecisionPlan,
} from "./edit-decision-orchestrator";
import { buildEditDecisionTracks } from "./edit-decision-executor";
import { createLocalAssetFingerprintForMediaAsset } from "./media-index-adapter";

export interface ApplyEditDecisionCommandInput {
	readonly sceneId: string;
	readonly plan: EditDecisionPlan;
	readonly approvedOperationIds: readonly string[];
	readonly currentAssets: readonly EditDecisionCurrentAssetState[];
}

export class ApplyEditDecisionCommand extends Command {
	override readonly handlesRipple = true;

	readonly sceneId: string;
	private readonly plan: EditDecisionPlan;
	private readonly approvedOperationIds: readonly string[];
	private readonly currentAssets: readonly EditDecisionCurrentAssetState[];
	private readonly elementIds: readonly string[];
	private savedState: SceneTracks | null = null;

	constructor({
		sceneId,
		plan,
		approvedOperationIds,
		currentAssets,
	}: ApplyEditDecisionCommandInput) {
		super();
		this.sceneId = sceneId;
		this.plan = plan;
		this.approvedOperationIds = Object.freeze([...approvedOperationIds]);
		this.currentAssets = Object.freeze(
			currentAssets.map((asset) => Object.freeze({ ...asset })),
		);
		this.elementIds = Object.freeze(
			Array.from(
				{
					length: approvedOperationIds.length + plan.inputs.assets.length,
				},
				() => generateUUID(),
			),
		);
	}

	execute(): CommandResult | undefined {
		const editor = EditorCore.getInstance();
		const project = editor.project.getActive();
		const scene = editor.scenes.getActiveScene();
		if (project.metadata.id !== this.plan.projectId) {
			throw new Error(
				"Active project no longer matches the approved edit-decision plan.",
			);
		}
		if (scene.id !== this.sceneId) {
			throw new Error(
				"Active scene no longer matches the approved edit-decision command.",
			);
		}

		const mediaAssets = editor.media.getAssets();
		const verifiedCurrentAssets = this.currentAssets.map((state) => {
			const asset = mediaAssets.find(
				(candidate) => candidate.id === state.assetId,
			);
			if (!asset) {
				throw new Error(
					`Approved material ${state.assetId} is no longer available.`,
				);
			}
			const inputFingerprint = createLocalAssetFingerprintForMediaAsset({
				asset,
			});
			if (inputFingerprint !== state.inputFingerprint) {
				throw new Error(
					`Approved material ${state.assetId} changed after review.`,
				);
			}
			return {
				...state,
				inputFingerprint,
			};
		});
		const result = buildEditDecisionTracks({
			tracks: scene.tracks,
			plan: this.plan,
			approvedOperationIds: this.approvedOperationIds,
			currentAssets: verifiedCurrentAssets,
			hasTimelineBookmarks: scene.bookmarks.length > 0,
			elementIds: this.elementIds,
		});

		const previousTracks = scene.tracks;
		editor.timeline.updateTracks(result.tracks);
		this.savedState = previousTracks;
		return createElementSelectionResult([...result.createdElementRefs]);
	}

	override undo(): void {
		if (!this.savedState) return;
		const editor = EditorCore.getInstance();
		if (editor.project.getActive().metadata.id !== this.plan.projectId) {
			throw new Error(
				"Active project no longer matches the edit-decision undo target.",
			);
		}
		if (editor.scenes.getActiveScene().id !== this.sceneId) {
			throw new Error(
				"Active scene no longer matches the edit-decision undo target.",
			);
		}
		editor.timeline.updateTracks(this.savedState);
	}
}
