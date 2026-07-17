import type { EditorCore } from "@/core";
import {
	BatchCommand,
	Command,
	InsertElementCommand,
	UpdateElementsCommand,
	UpdateProjectSettingsCommand,
} from "@/commands";
import { buildElementFromMedia, hasMediaId } from "@/timeline/element-utils";
import { DEFAULT_NEW_ELEMENT_DURATION } from "@/timeline/creation";
import {
	addMediaTime,
	maxMediaTime,
	mediaTimeFromSeconds,
	subMediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";
import type { EditPlan } from "./types";

const CANVAS_BY_RATIO = {
	"16:9": { width: 1920, height: 1080 },
	"9:16": { width: 1080, height: 1920 },
	"1:1": { width: 1080, height: 1080 },
} as const;

export interface ApplyEditPlanResult {
	commandCount: number;
	appliedStepCount: number;
	skippedStepCount: number;
}

export function applyLocalEditPlan({
	editor,
	plan,
}: {
	editor: EditorCore;
	plan: EditPlan;
}): ApplyEditPlanResult {
	const scene = editor.scenes.getActiveSceneOrNull();
	if (!scene)
		return { commandCount: 0, appliedStepCount: 0, skippedStepCount: 0 };

	const commands: Command[] = [];
	let appliedStepCount = 0;
	let skippedStepCount = 0;

	for (const step of plan.steps.filter((item) => item.enabled)) {
		if (step.executor !== "local" || step.availability !== "ready") {
			skippedStepCount += 1;
			continue;
		}

		if (step.kind === "arrange-media") {
			const allTracks = [
				scene.tracks.main,
				...scene.tracks.overlay,
				...scene.tracks.audio,
			];
			const usedMediaIds = new Set(
				allTracks.flatMap((track) =>
					track.elements.filter(hasMediaId).map((element) => element.mediaId),
				),
			);
			let visualCursor = editor.timeline.getTotalDuration();
			let inserted = 0;

			for (const asset of editor.media.getAssets()) {
				if (usedMediaIds.has(asset.id)) continue;
				const duration =
					asset.duration != null
						? mediaTimeFromSeconds({ seconds: asset.duration })
						: DEFAULT_NEW_ELEMENT_DURATION;
				const startTime =
					asset.type === "audio" ? ZERO_MEDIA_TIME : visualCursor;
				const element = buildElementFromMedia({
					mediaId: asset.id,
					mediaType: asset.type,
					name: asset.name,
					duration,
					startTime,
				});
				commands.push(
					new InsertElementCommand({
						element,
						placement:
							asset.type === "audio"
								? { mode: "auto", trackType: "audio" }
								: { mode: "explicit", trackId: scene.tracks.main.id },
					}),
				);
				if (asset.type !== "audio") {
					visualCursor = addMediaTime({ a: visualCursor, b: duration });
				}
				inserted += 1;
			}
			if (inserted > 0) appliedStepCount += 1;
			else skippedStepCount += 1;
			continue;
		}

		if (step.kind === "tighten-clips") {
			const trim = mediaTimeFromSeconds({ seconds: 0.25 });
			const trimTwice = addMediaTime({ a: trim, b: trim });
			const minimumDuration = addMediaTime({ a: trimTwice, b: trimTwice });
			let removedBefore = ZERO_MEDIA_TIME;
			const updates = scene.tracks.main.elements.flatMap((element) => {
				if (element.type !== "video" || element.duration <= minimumDuration)
					return [];
				const patch = {
					startTime: maxMediaTime({
						a: ZERO_MEDIA_TIME,
						b: subMediaTime({ a: element.startTime, b: removedBefore }),
					}),
					duration: subMediaTime({ a: element.duration, b: trimTwice }),
					trimStart: addMediaTime({ a: element.trimStart, b: trim }),
					trimEnd: addMediaTime({ a: element.trimEnd, b: trim }),
				};
				removedBefore = addMediaTime({ a: removedBefore, b: trimTwice });
				return [
					{ trackId: scene.tracks.main.id, elementId: element.id, patch },
				];
			});
			if (updates.length > 0) {
				commands.push(new UpdateElementsCommand({ updates }));
				appliedStepCount += 1;
			} else {
				skippedStepCount += 1;
			}
			continue;
		}

		if (step.kind === "set-aspect-ratio" && step.params?.aspectRatio) {
			const canvasSize = CANVAS_BY_RATIO[step.params.aspectRatio];
			commands.push(
				new UpdateProjectSettingsCommand({
					canvasSize,
					canvasSizeMode: "preset",
				}),
			);
			appliedStepCount += 1;
			continue;
		}

		skippedStepCount += 1;
	}

	if (commands.length > 0) {
		editor.command.execute({ command: new BatchCommand(commands) });
	}

	return { commandCount: commands.length, appliedStepCount, skippedStepCount };
}
