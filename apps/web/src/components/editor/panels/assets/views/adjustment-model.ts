import type {
	CreateEffectElement,
	EffectElement,
	ElementRef,
	SceneTracks,
	TimelineElement,
} from "@/timeline";
import {
	addMediaTime,
	minMediaTime,
	subMediaTime,
	ZERO_MEDIA_TIME,
	type MediaTime,
} from "@/wasm";

export const ADJUSTMENT_LAYER_MARKER = "visioncut.adjustmentLayer";
export const ADJUSTMENT_PRESET_KEY = "visioncut.adjustmentPreset";

export const ADJUSTMENT_PRESETS = [
	{
		id: "clarity",
		name: "Light diffusion",
		description: "A light 6% diffusion that gently joins mixed sources.",
		intensity: 6,
		color: "bg-cyan-400",
	},
	{
		id: "soft-focus",
		name: "Soft focus",
		description: "A restrained 14% blur for portraits and quiet moments.",
		intensity: 14,
		color: "bg-violet-400",
	},
	{
		id: "dream",
		name: "Dream diffusion",
		description: "A visible 28% diffusion for memory and dream sequences.",
		intensity: 28,
		color: "bg-rose-400",
	},
	{
		id: "privacy",
		name: "Privacy blur",
		description: "A strong 64% scene blur for temporary redaction.",
		intensity: 64,
		color: "bg-amber-400",
	},
] as const;

export type AdjustmentPresetId = (typeof ADJUSTMENT_PRESETS)[number]["id"];
export type AdjustmentScope = "playhead" | "selection" | "scene";

export interface AdjustmentLayerRef {
	trackId: string;
	element: EffectElement;
}

export type AdjustmentRangeResult =
	| { ok: true; startTime: MediaTime; duration: MediaTime }
	| { ok: false; reason: string };

function visualElements(tracks: SceneTracks): TimelineElement[] {
	const result: TimelineElement[] = [];
	for (const track of [...tracks.overlay, tracks.main]) {
		if (track.type === "effect") continue;
		for (const element of track.elements) {
			result.push(element);
		}
	}
	return result;
}

function selectedVisualElement({
	tracks,
	selection,
}: {
	tracks: SceneTracks;
	selection: ElementRef[];
}): TimelineElement | null {
	if (selection.length !== 1) return null;
	const ref = selection[0];
	const track = [...tracks.overlay, tracks.main].find(
		(candidate) => candidate.id === ref.trackId,
	);
	const element = track?.elements.find(
		(candidate) => candidate.id === ref.elementId,
	);
	return element && element.type !== "effect" ? element : null;
}

export function resolveAdjustmentRange({
	tracks,
	selection,
	playheadTime,
	requestedDuration,
	scope,
}: {
	tracks: SceneTracks;
	selection: ElementRef[];
	playheadTime: MediaTime;
	requestedDuration: MediaTime;
	scope: AdjustmentScope;
}): AdjustmentRangeResult {
	const elements = visualElements(tracks);
	if (elements.length === 0) {
		return {
			ok: false,
			reason: "Add a visual clip before creating an adjustment layer.",
		};
	}
	const sceneEnd = elements
		.map((element) =>
			addMediaTime({ a: element.startTime, b: element.duration }),
		)
		.reduce((latest, candidate) => (candidate > latest ? candidate : latest));

	if (scope === "selection") {
		const selected = selectedVisualElement({ tracks, selection });
		return selected
			? {
					ok: true,
					startTime: selected.startTime,
					duration: selected.duration,
				}
			: {
					ok: false,
					reason: "Select one visual clip to match its range.",
				};
	}

	if (scope === "scene") {
		return { ok: true, startTime: ZERO_MEDIA_TIME, duration: sceneEnd };
	}

	if (playheadTime >= sceneEnd) {
		return {
			ok: false,
			reason: "Move the playhead over visible content first.",
		};
	}
	const duration = minMediaTime({
		a: requestedDuration,
		b: subMediaTime({ a: sceneEnd, b: playheadTime }),
	});
	return { ok: true, startTime: playheadTime, duration };
}

export function buildAdjustmentLayer({
	presetId,
	startTime,
	duration,
}: {
	presetId: AdjustmentPresetId;
	startTime: MediaTime;
	duration: MediaTime;
}): CreateEffectElement {
	const preset = ADJUSTMENT_PRESETS.find((item) => item.id === presetId);
	if (!preset) {
		throw new Error("Unknown adjustment preset.");
	}
	return {
		type: "effect",
		effectType: "blur",
		name: `Adjustment · ${preset.name}`,
		startTime,
		duration,
		trimStart: ZERO_MEDIA_TIME,
		trimEnd: ZERO_MEDIA_TIME,
		params: {
			intensity: preset.intensity,
			[ADJUSTMENT_LAYER_MARKER]: true,
			[ADJUSTMENT_PRESET_KEY]: preset.id,
		},
	};
}

export function isAdjustmentLayer(
	element: TimelineElement,
): element is EffectElement {
	return (
		element.type === "effect" &&
		element.params[ADJUSTMENT_LAYER_MARKER] === true
	);
}

export function getAdjustmentLayers({
	tracks,
}: {
	tracks: SceneTracks;
}): AdjustmentLayerRef[] {
	return tracks.overlay
		.filter((track) => track.type === "effect")
		.flatMap((track) =>
			track.elements.flatMap((element) =>
				isAdjustmentLayer(element) ? [{ trackId: track.id, element }] : [],
			),
		)
		.sort(
			(left, right) =>
				left.element.startTime - right.element.startTime ||
				left.element.id.localeCompare(right.element.id),
		);
}
