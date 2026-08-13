import type {
	ElementRef,
	SceneTracks,
	TimelineElement,
	TimelineTrack,
	VisualElement,
} from "@/timeline";
import type {
	AnimationChannel,
	ChannelData,
	CompositeChannelData,
	ElementAnimations,
	ScalarAnimationChannel,
	ScalarAnimationKey,
} from "@/animation/types";
import type { ParamValues } from "@/params";
import {
	addMediaTime,
	mediaTime,
	maxMediaTime,
	minMediaTime,
	roundMediaTime,
	subMediaTime,
	type MediaTime,
	ZERO_MEDIA_TIME,
} from "@/wasm";

const TRANSITION_KEY_PREFIX = "visioncut-transition:";
const TRANSITION_META_PREFIX = "visioncut.transition";

export const TRANSITION_PRESETS = [
	{
		id: "fade",
		name: "Fade",
		description: "A clean fade through the canvas background.",
		accent: "from-neutral-300 via-neutral-700 to-neutral-950",
	},
	{
		id: "push-left",
		name: "Push left",
		description: "Moves the outgoing shot left and brings the next shot in.",
		accent: "from-cyan-400 via-sky-600 to-neutral-900",
	},
	{
		id: "push-right",
		name: "Push right",
		description: "Reverses the push direction for a return or reveal.",
		accent: "from-neutral-900 via-indigo-600 to-fuchsia-400",
	},
	{
		id: "zoom",
		name: "Zoom through",
		description: "Blends a restrained scale change with a short fade.",
		accent: "from-emerald-300 via-teal-700 to-neutral-950",
	},
	{
		id: "whip",
		name: "Whip",
		description: "Adds a fast directional move with slight rotation.",
		accent: "from-amber-300 via-rose-500 to-neutral-950",
	},
] as const;

export type TransitionPresetId = (typeof TRANSITION_PRESETS)[number]["id"];
export type TransitionSide = "in" | "out";

export interface TransitionPair {
	trackId: string;
	left: VisualElement;
	right: VisualElement;
	cutTime: MediaTime;
}

export type TransitionTargetResolution =
	| { ok: true; pair: TransitionPair; source: "selection" | "playhead" }
	| { ok: false; reason: string };

export interface TransitionSummary {
	id: string;
	type: TransitionPresetId;
	duration: MediaTime;
	complete: boolean;
}

export type TransitionPlanResult =
	| {
			ok: true;
			updates: Array<{
				trackId: string;
				elementId: string;
				patch: Partial<TimelineElement>;
			}>;
			actualDuration: MediaTime;
	  }
	| { ok: false; reason: string };

interface TransitionMetadata {
	id: string;
	type: TransitionPresetId;
	peerId: string;
	duration: MediaTime;
}

interface TransitionKeySpec {
	path: string;
	startValue: number;
	endValue: number;
}

function isVisualTrack(track: TimelineTrack): boolean {
	return track.type !== "audio" && track.type !== "effect";
}

function isVisualElement(element: TimelineElement): element is VisualElement {
	return element.type !== "audio" && element.type !== "effect";
}

function orderedVisualTracks(tracks: SceneTracks): TimelineTrack[] {
	return [...tracks.overlay, tracks.main].filter(isVisualTrack);
}

function findElementRef({
	tracks,
	ref,
}: {
	tracks: SceneTracks;
	ref: ElementRef;
}): { track: TimelineTrack; element: VisualElement } | null {
	const track = orderedVisualTracks(tracks).find(
		(candidate) => candidate.id === ref.trackId,
	);
	const element = track?.elements.find(
		(candidate) => candidate.id === ref.elementId,
	);
	return track && element && isVisualElement(element) ? { track, element } : null;
}

function getTrackPairs({
	track,
	tolerance,
}: {
	track: TimelineTrack;
	tolerance: MediaTime;
}): TransitionPair[] {
	if (!isVisualTrack(track)) return [];
	const elements = track.elements
		.filter(isVisualElement)
		.slice()
		.sort((left, right) =>
			left.startTime !== right.startTime
				? left.startTime - right.startTime
				: left.id.localeCompare(right.id),
		);

	return elements.slice(0, -1).flatMap((left, index) => {
		const right = elements[index + 1];
		if (!right) return [];
		const cutTime = addMediaTime({ a: left.startTime, b: left.duration });
		if (Math.abs(right.startTime - cutTime) > tolerance) return [];
		return [{ trackId: track.id, left, right, cutTime }];
	});
}

function findSelectedPair({
	tracks,
	selection,
	tolerance,
	playheadTime,
}: {
	tracks: SceneTracks;
	selection: ElementRef[];
	tolerance: MediaTime;
	playheadTime: MediaTime;
}): TransitionPair | null {
	const selected = selection
		.map((ref) => findElementRef({ tracks, ref }))
		.filter((item): item is NonNullable<typeof item> => item !== null);
	if (selected.length === 0 || selected.length > 2) return null;

	const trackIds = new Set(selected.map(({ track }) => track.id));
	if (trackIds.size !== 1) return null;
	const track = selected[0]?.track;
	if (!track) return null;
	const selectedIds = new Set(selected.map(({ element }) => element.id));
	const matchingPairs = getTrackPairs({ track, tolerance }).filter(
		(pair) =>
			selectedIds.has(pair.left.id) || selectedIds.has(pair.right.id),
	);

	if (selected.length === 2) {
		return (
			matchingPairs.find(
				(pair) =>
					selectedIds.has(pair.left.id) && selectedIds.has(pair.right.id),
			) ?? null
		);
	}

	return (
		[...matchingPairs].sort(
			(left, right) =>
				Math.abs(left.cutTime - playheadTime) -
				Math.abs(right.cutTime - playheadTime),
		)[0] ?? null
	);
}

export function resolveTransitionTarget({
	tracks,
	selection,
	playheadTime,
	tolerance,
}: {
	tracks: SceneTracks;
	selection: ElementRef[];
	playheadTime: MediaTime;
	tolerance: MediaTime;
}): TransitionTargetResolution {
	const selectedPair = findSelectedPair({
		tracks,
		selection,
		tolerance,
		playheadTime,
	});
	if (selectedPair) {
		return { ok: true, pair: selectedPair, source: "selection" };
	}

	if (selection.length > 1) {
		return {
			ok: false,
			reason: "Select two adjacent visual clips on the same track.",
		};
	}

	const candidates = orderedVisualTracks(tracks).flatMap((track) =>
		getTrackPairs({ track, tolerance }),
	);
	if (candidates.length === 0) {
		return {
			ok: false,
			reason: "Add two touching visual clips to create a transition.",
		};
	}

	const selectedId = selection[0]?.elementId;
	const relevantCandidates = selectedId
		? candidates.filter(
				(pair) => pair.left.id === selectedId || pair.right.id === selectedId,
			)
		: candidates;
	if (selectedId && relevantCandidates.length === 0) {
		return {
			ok: false,
			reason: "The selected clip does not touch another visual clip.",
		};
	}

	const pair = [...relevantCandidates].sort(
		(left, right) =>
			Math.abs(left.cutTime - playheadTime) -
			Math.abs(right.cutTime - playheadTime),
	)[0];
	return pair
		? { ok: true, pair, source: "playhead" }
		: { ok: false, reason: "No valid edit point was found." };
}

function metadataKey({
	side,
	field,
}: {
	side: TransitionSide;
	field: string;
}): string {
	return `${TRANSITION_META_PREFIX}.${side}.${field}`;
}

function isPresetId(value: unknown): value is TransitionPresetId {
	return TRANSITION_PRESETS.some((preset) => preset.id === value);
}

function readMetadata({
	element,
	side,
}: {
	element: VisualElement;
	side: TransitionSide;
}): TransitionMetadata | null {
	const id = element.params[metadataKey({ side, field: "id" })];
	const type = element.params[metadataKey({ side, field: "type" })];
	const peerId = element.params[metadataKey({ side, field: "peerId" })];
	const duration = element.params[metadataKey({ side, field: "duration" })];
	if (
		typeof id !== "string" ||
		id.length === 0 ||
		!isPresetId(type) ||
		typeof peerId !== "string" ||
		peerId.length === 0 ||
		typeof duration !== "number" ||
		!Number.isFinite(duration) ||
		duration <= 0
	) {
		return null;
	}
	return { id, type, peerId, duration: roundMediaTime({ time: duration }) };
}

export function getTransitionSummary({
	pair,
}: {
	pair: TransitionPair;
}): TransitionSummary | null {
	const outgoing = readMetadata({ element: pair.left, side: "out" });
	const incoming = readMetadata({ element: pair.right, side: "in" });
	const relatedOutgoing = outgoing?.peerId === pair.right.id ? outgoing : null;
	const relatedIncoming = incoming?.peerId === pair.left.id ? incoming : null;
	if (!relatedOutgoing && !relatedIncoming) return null;
	const complete = Boolean(
		relatedOutgoing &&
			relatedIncoming &&
			relatedOutgoing.id === relatedIncoming.id &&
			relatedOutgoing.type === relatedIncoming.type,
	);
	const metadata = relatedOutgoing ?? relatedIncoming;
	if (!metadata) return null;
	return {
		id: metadata.id,
		type: metadata.type,
		duration: metadata.duration,
		complete,
	};
}

function isLeafChannel(data: ChannelData): data is AnimationChannel {
	return "keys" in data && Array.isArray(data.keys);
}

function isManagedKeyId(id: string): boolean {
	return id.startsWith(TRANSITION_KEY_PREFIX);
}

function isManagedKeyForSide({
	id,
	side,
}: {
	id: string;
	side: TransitionSide;
}): boolean {
	return id.startsWith(`${TRANSITION_KEY_PREFIX}${side}:`);
}

function isScalarChannel(
	channel: AnimationChannel,
): channel is ScalarAnimationChannel {
	const firstKey = channel.keys[0];
	return firstKey ? "segmentToNext" in firstKey : "extrapolation" in channel;
}

function removeManagedKeysFromChannel({
	channel,
	side,
}: {
	channel: AnimationChannel;
	side: TransitionSide;
}): AnimationChannel | undefined {
	if (isScalarChannel(channel)) {
		const keys = channel.keys.filter(
			(keyframe) => !isManagedKeyForSide({ id: keyframe.id, side }),
		);
		return keys.length > 0 ? { ...channel, keys } : undefined;
	}
	const keys = channel.keys.filter(
		(keyframe) => !isManagedKeyForSide({ id: keyframe.id, side }),
	);
	return keys.length > 0 ? { ...channel, keys } : undefined;
}

function hasUnmanagedKeys(data: ChannelData | undefined): boolean {
	if (!data) return false;
	if (isLeafChannel(data)) {
		for (const key of data.keys) {
			if (!isManagedKeyId(key.id)) return true;
		}
		return false;
	}
	for (const channel of Object.values(data)) {
		if (!channel) continue;
		for (const key of channel.keys) {
			if (!isManagedKeyId(key.id)) return true;
		}
	}
	return false;
}

function removeManagedSideFromData({
	data,
	side,
}: {
	data: ChannelData;
	side: TransitionSide;
}): ChannelData | undefined {
	if (isLeafChannel(data)) {
		return removeManagedKeysFromChannel({ channel: data, side });
	}

	const next: CompositeChannelData = {};
	for (const [key, channel] of Object.entries(data)) {
		if (!channel) continue;
		const cleaned = removeManagedKeysFromChannel({ channel, side });
		if (cleaned) next[key] = cleaned;
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

function removeManagedSide({
	animations,
	side,
}: {
	animations: ElementAnimations | undefined;
	side: TransitionSide;
}): ElementAnimations | undefined {
	if (!animations) return undefined;
	const next = Object.fromEntries(
		Object.entries(animations).flatMap(([path, data]) => {
			if (!data) return [];
			const cleaned = removeManagedSideFromData({ data, side });
			return cleaned ? [[path, cleaned]] : [];
		}),
	);
	return Object.keys(next).length > 0 ? next : undefined;
}

function baseNumber({
	element,
	key,
	fallback,
}: {
	element: VisualElement;
	key: string;
	fallback: number;
}): number {
	const value = element.params[key];
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getTransitionSpecs({
	presetId,
	side,
	element,
	canvasWidth,
}: {
	presetId: TransitionPresetId;
	side: TransitionSide;
	element: VisualElement;
	canvasWidth: number;
}): TransitionKeySpec[] {
	const opacity = baseNumber({ element, key: "opacity", fallback: 1 });
	const positionX = baseNumber({
		element,
		key: "transform.positionX",
		fallback: 0,
	});
	const scaleX = baseNumber({
		element,
		key: "transform.scaleX",
		fallback: 1,
	});
	const scaleY = baseNumber({
		element,
		key: "transform.scaleY",
		fallback: 1,
	});
	const rotate = baseNumber({
		element,
		key: "transform.rotate",
		fallback: 0,
	});
	const direction = presetId === "push-right" ? 1 : -1;

	switch (presetId) {
		case "fade":
			return [
				{
					path: "opacity",
					startValue: side === "out" ? opacity : 0,
					endValue: side === "out" ? 0 : opacity,
				},
			];
		case "push-left":
		case "push-right":
			return [
				{
					path: "transform.positionX",
					startValue:
						side === "out" ? positionX : positionX - direction * canvasWidth,
					endValue:
						side === "out" ? positionX + direction * canvasWidth : positionX,
				},
			];
		case "zoom":
			return [
				{
					path: "opacity",
					startValue: side === "out" ? opacity : 0,
					endValue: side === "out" ? 0 : opacity,
				},
				{
					path: "transform.scaleX",
					startValue: side === "out" ? scaleX : scaleX * 0.9,
					endValue: side === "out" ? scaleX * 1.12 : scaleX,
				},
				{
					path: "transform.scaleY",
					startValue: side === "out" ? scaleY : scaleY * 0.9,
					endValue: side === "out" ? scaleY * 1.12 : scaleY,
				},
			];
		case "whip":
			return [
				{
					path: "transform.positionX",
					startValue: side === "out" ? positionX : positionX + canvasWidth * 1.2,
					endValue: side === "out" ? positionX - canvasWidth * 1.2 : positionX,
				},
				{
					path: "transform.rotate",
					startValue: side === "out" ? rotate : rotate + 3,
					endValue: side === "out" ? rotate - 3 : rotate,
				},
			];
	}
}

function buildChannel({
	path,
	side,
	transitionId,
	startTime,
	endTime,
	startValue,
	endValue,
	existing,
}: {
	path: string;
	side: TransitionSide;
	transitionId: string;
	startTime: MediaTime;
	endTime: MediaTime;
	startValue: number;
	endValue: number;
	existing: ChannelData | undefined;
}): ScalarAnimationChannel {
	const retained: ScalarAnimationKey[] =
		existing &&
		isLeafChannel(existing) &&
		existing.keys.every(
			(key): key is ScalarAnimationKey =>
				typeof key.value === "number" && "segmentToNext" in key,
		)
			? existing.keys
			: [];
	const keyPrefix = `${TRANSITION_KEY_PREFIX}${side}:${transitionId}:${path}`;
	const generatedKeys: ScalarAnimationKey[] = [
		{
			id: `${keyPrefix}:0`,
			time: startTime,
			value: startValue,
			segmentToNext: "bezier",
			tangentMode: "auto",
		},
		{
			id: `${keyPrefix}:1`,
			time: endTime,
			value: endValue,
			segmentToNext: "linear",
			tangentMode: "auto",
		},
	];
	return {
		keys: [...retained, ...generatedKeys].sort(
			(left, right) => left.time - right.time,
		),
		extrapolation: { before: "hold", after: "hold" },
	};
}

function buildAnimations({
	element,
	side,
	presetId,
	transitionId,
	halfDuration,
	canvasWidth,
}: {
	element: VisualElement;
	side: TransitionSide;
	presetId: TransitionPresetId;
	transitionId: string;
	halfDuration: MediaTime;
	canvasWidth: number;
}): { ok: true; animations: ElementAnimations } | { ok: false; reason: string } {
	const specs = getTransitionSpecs({
		presetId,
		side,
		element,
		canvasWidth,
	});
	for (const spec of specs) {
		if (hasUnmanagedKeys(element.animations?.[spec.path])) {
			return {
				ok: false,
				reason: `${element.name} already has custom animation on ${spec.path}. Remove it before applying this transition.`,
			};
		}
	}

	const cleaned = removeManagedSide({ animations: element.animations, side }) ?? {};
	const startTime =
		side === "out"
			? maxMediaTime({
					a: ZERO_MEDIA_TIME,
					b: subMediaTime({ a: element.duration, b: halfDuration }),
				})
			: ZERO_MEDIA_TIME;
	const endTime =
		side === "out" ? element.duration : halfDuration;
	const animations: ElementAnimations = { ...cleaned };
	for (const spec of specs) {
		animations[spec.path] = buildChannel({
			...spec,
			side,
			transitionId,
			startTime,
			endTime,
			existing: animations[spec.path],
		});
	}
	return { ok: true, animations };
}

function metadataPatch({
	side,
	id,
	type,
	peerId,
	duration,
}: {
	side: TransitionSide;
	id: string;
	type: TransitionPresetId;
	peerId: string;
	duration: MediaTime;
}): ParamValues {
	return {
		[metadataKey({ side, field: "id" })]: id,
		[metadataKey({ side, field: "type" })]: type,
		[metadataKey({ side, field: "peerId" })]: peerId,
		[metadataKey({ side, field: "duration" })]: duration,
	};
}

function clearedMetadataPatch(side: TransitionSide): ParamValues {
	return {
		[metadataKey({ side, field: "id" })]: "",
		[metadataKey({ side, field: "type" })]: "",
		[metadataKey({ side, field: "peerId" })]: "",
		[metadataKey({ side, field: "duration" })]: 0,
	};
}

export function buildTransitionPlan({
	pair,
	presetId,
	requestedDuration,
	transitionId,
	canvasWidth,
}: {
	pair: TransitionPair;
	presetId: TransitionPresetId;
	requestedDuration: MediaTime;
	transitionId: string;
	canvasWidth: number;
}): TransitionPlanResult {
	const maxHalf = mediaTime({
		ticks: Math.floor(
			minMediaTime({ a: pair.left.duration, b: pair.right.duration }) * 0.45,
		),
	});
	const requestedHalf = mediaTime({
		ticks: Math.max(1, Math.round(requestedDuration / 2)),
	});
	const halfDuration = minMediaTime({ a: requestedHalf, b: maxHalf });
	if (halfDuration <= 0) {
		return { ok: false, reason: "Both clips need visible duration at the cut." };
	}
	const actualDuration = addMediaTime({ a: halfDuration, b: halfDuration });

	const outgoing = buildAnimations({
		element: pair.left,
		side: "out",
		presetId,
		transitionId,
		halfDuration,
		canvasWidth: Math.max(1, canvasWidth),
	});
	if (!outgoing.ok) return outgoing;
	const incoming = buildAnimations({
		element: pair.right,
		side: "in",
		presetId,
		transitionId,
		halfDuration,
		canvasWidth: Math.max(1, canvasWidth),
	});
	if (!incoming.ok) return incoming;

	return {
		ok: true,
		actualDuration,
		updates: [
			{
				trackId: pair.trackId,
				elementId: pair.left.id,
				patch: {
					animations: outgoing.animations,
					params: metadataPatch({
						side: "out",
						id: transitionId,
						type: presetId,
						peerId: pair.right.id,
						duration: actualDuration,
					}),
				},
			},
			{
				trackId: pair.trackId,
				elementId: pair.right.id,
				patch: {
					animations: incoming.animations,
					params: metadataPatch({
						side: "in",
						id: transitionId,
						type: presetId,
						peerId: pair.left.id,
						duration: actualDuration,
					}),
				},
			},
		],
	};
}

export function buildRemoveTransitionPlan({
	pair,
}: {
	pair: TransitionPair;
}): TransitionPlanResult {
	if (!getTransitionSummary({ pair })) {
		return { ok: false, reason: "There is no managed transition at this cut." };
	}
	return {
		ok: true,
		actualDuration: ZERO_MEDIA_TIME,
		updates: [
			{
				trackId: pair.trackId,
				elementId: pair.left.id,
				patch: {
					animations: removeManagedSide({
						animations: pair.left.animations,
						side: "out",
					}),
					params: clearedMetadataPatch("out"),
				},
			},
			{
				trackId: pair.trackId,
				elementId: pair.right.id,
				patch: {
					animations: removeManagedSide({
						animations: pair.right.animations,
						side: "in",
					}),
					params: clearedMetadataPatch("in"),
				},
			},
		],
	};
}
