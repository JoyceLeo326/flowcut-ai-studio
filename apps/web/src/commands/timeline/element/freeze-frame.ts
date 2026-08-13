import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import { storageService } from "@/services/storage/service";
import {
	applyFreezeFrameMutation,
	createFreezeFrameSourceFingerprint,
	DEFAULT_FREEZE_FRAME_DURATION,
	FreezeFrameError,
	type CapturedFreezeFrameAsset,
	type FreezeFrameTarget,
} from "@/timeline/freeze-frame";
import type { ElementRef, SceneTracks } from "@/timeline/types";
import { generateUUID } from "@/utils/id";
import type { MediaTime } from "@/wasm";
import { toast } from "sonner";

export class FreezeFrameCommand extends Command {
	override readonly handlesRipple = true;

	private beforeTracks: SceneTracks | null = null;
	private afterTracks: SceneTracks | null = null;
	private frozenElementRef: ElementRef | null = null;
	private readonly frozenElementId = generateUUID();
	private readonly rightElementId = generateUUID();
	private currentAsset: CapturedFreezeFrameAsset;
	private isPrepared = false;
	private storageTransition: Promise<void> = Promise.resolve();

	constructor({
		projectId,
		target,
		asset,
		freezeDuration = DEFAULT_FREEZE_FRAME_DURATION,
	}: {
		projectId: string;
		target: FreezeFrameTarget;
		asset: CapturedFreezeFrameAsset;
		freezeDuration?: MediaTime;
	}) {
		super();
		this.projectId = projectId;
		this.target = target;
		this.currentAsset = asset;
		this.freezeDuration = freezeDuration;
	}

	private readonly projectId: string;
	private readonly target: FreezeFrameTarget;
	private readonly freezeDuration: MediaTime;

	async prepare(): Promise<void> {
		if (this.isPrepared) return;
		this.ensureRuntimeUrl();

		const storageCheck = await storageService.canStoreFile({
			size: this.currentAsset.file.size,
		});
		if (!storageCheck.canStore) {
			this.releaseRuntimeUrl();
			throw new FreezeFrameError({
				code: "STORAGE_FULL",
				message:
					"There is not enough browser storage for this freeze frame. Free space and try again.",
			});
		}

		try {
			this.storageTransition = storageService.saveMediaAsset({
				projectId: this.projectId,
				mediaAsset: this.currentAsset,
			});
			await this.storageTransition;
			this.isPrepared = true;
		} catch (error) {
			this.releaseRuntimeUrl();
			throw new FreezeFrameError({
				code: storageService.isQuotaExceededError({ error })
					? "STORAGE_FULL"
					: "ENCODE_FAILED",
				message: storageService.isQuotaExceededError({ error })
					? "There is not enough browser storage for this freeze frame."
					: "The freeze-frame image could not be saved locally.",
			});
		}
	}

	execute(): CommandResult | undefined {
		if (!this.isPrepared) {
			throw new Error(
				"FreezeFrameCommand.prepare() must complete before execute().",
			);
		}

		const editor = EditorCore.getInstance();
		if (editor.project.getActive().metadata.id !== this.projectId) {
			void this.deletePreparedAsset();
			throw new FreezeFrameError({
				code: "STALE_SOURCE",
				message:
					"The active project changed while the frame was being captured. Nothing was inserted.",
			});
		}
		const sourceAsset = editor.media
			.getAssets()
			.find((asset) => asset.id === this.target.asset.id);
		const sourceElement = editor.timeline.getElementsWithTracks({
			elements: [
				{
					trackId: this.target.trackId,
					elementId: this.target.element.id,
				},
			],
		})[0]?.element;
		if (
			!sourceAsset ||
			sourceElement?.type !== "video" ||
			createFreezeFrameSourceFingerprint({
				element: sourceElement,
				asset: sourceAsset,
			}) !== this.target.sourceFingerprint
		) {
			void this.deletePreparedAsset();
			throw new FreezeFrameError({
				code: "STALE_SOURCE",
				message:
					"The clip changed while its frame was being captured. Nothing was inserted; try again.",
			});
		}

		this.beforeTracks = editor.scenes.getActiveScene().tracks;
		let mutation;
		try {
			mutation = applyFreezeFrameMutation({
				tracks: this.beforeTracks,
				target: this.target,
				frozenAssetId: this.currentAsset.id,
				freezeDuration: this.freezeDuration,
				frozenElementId: this.frozenElementId,
				rightElementId: this.rightElementId,
			});
		} catch (error) {
			void this.deletePreparedAsset();
			throw error;
		}
		this.afterTracks = mutation.tracks;
		this.frozenElementRef = mutation.frozenElementRef;

		this.addAssetToEditor();
		editor.timeline.updateTracks(this.afterTracks);
		return createElementSelectionResult([this.frozenElementRef]);
	}

	override undo(): void {
		if (!this.beforeTracks) return;

		const editor = EditorCore.getInstance();
		editor.timeline.updateTracks(this.beforeTracks);
		editor.media.setAssets({
			assets: editor.media
				.getAssets()
				.filter((asset) => asset.id !== this.currentAsset.id),
		});
		this.releaseRuntimeUrl();
		this.storageTransition = this.storageTransition
			.then(() =>
				storageService.deleteMediaAsset({
					projectId: this.projectId,
					id: this.currentAsset.id,
				}),
			)
			.catch((error) => {
				console.error("Failed to remove freeze-frame asset on undo:", error);
			});
		this.isPrepared = false;
	}

	override redo(): CommandResult | undefined {
		if (!this.afterTracks || !this.frozenElementRef) {
			return this.execute();
		}

		this.ensureRuntimeUrl();
		this.addAssetToEditor();
		EditorCore.getInstance().timeline.updateTracks(this.afterTracks);
		this.isPrepared = true;
		this.storageTransition = this.storageTransition
			.then(() =>
				storageService.saveMediaAsset({
					projectId: this.projectId,
					mediaAsset: this.currentAsset,
				}),
			)
			.catch((error) => {
				console.error("Failed to restore freeze-frame asset on redo:", error);
				toast.error("Freeze frame restored in this session", {
					description:
						"Its generated image could not be saved for the next browser session.",
				});
			});

		return createElementSelectionResult([this.frozenElementRef]);
	}

	getFrozenElementRef(): ElementRef | null {
		return this.frozenElementRef;
	}

	private addAssetToEditor(): void {
		const editor = EditorCore.getInstance();
		const assets = editor.media.getAssets();
		if (assets.some((asset) => asset.id === this.currentAsset.id)) return;
		editor.media.setAssets({ assets: [...assets, this.currentAsset] });
	}

	private ensureRuntimeUrl(): void {
		if (this.currentAsset.url) return;
		this.currentAsset = {
			...this.currentAsset,
			url: URL.createObjectURL(this.currentAsset.file),
		};
	}

	private releaseRuntimeUrl(): void {
		if (!this.currentAsset.url) return;
		URL.revokeObjectURL(this.currentAsset.url);
		this.currentAsset = { ...this.currentAsset, url: undefined };
	}

	private async deletePreparedAsset(): Promise<void> {
		this.releaseRuntimeUrl();
		this.isPrepared = false;
		try {
			this.storageTransition = this.storageTransition.then(() =>
				storageService.deleteMediaAsset({
					projectId: this.projectId,
					id: this.currentAsset.id,
				}),
			);
			await this.storageTransition;
		} catch (error) {
			console.error("Failed to clean up stale freeze-frame asset:", error);
		}
	}
}
