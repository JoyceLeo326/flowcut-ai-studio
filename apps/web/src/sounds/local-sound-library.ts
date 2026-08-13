import type { SoundEffect } from "./types";

export type LocalSoundKind = "effects" | "songs";
export type LocalSoundWaveform =
	| "click"
	| "whoosh"
	| "impact"
	| "pulse"
	| "ambient"
	| "beat";

export interface LocalSoundDefinition {
	readonly id: number;
	readonly slug: string;
	readonly name: string;
	readonly description: string;
	readonly kind: LocalSoundKind;
	readonly duration: number;
	readonly frequency: number;
	readonly waveform: LocalSoundWaveform;
	readonly tags: readonly string[];
}

export const LOCAL_SOUND_LIBRARY: readonly LocalSoundDefinition[] = [
	{
		id: -101,
		slug: "soft-ui-click",
		name: "Soft UI Click",
		description: "A restrained interface click for titles and product demos.",
		kind: "effects",
		duration: 0.22,
		frequency: 880,
		waveform: "click",
		tags: ["click", "interface", "title", "product"],
	},
	{
		id: -102,
		slug: "clean-whoosh",
		name: "Clean Whoosh",
		description: "A short directional transition for cuts and reveals.",
		kind: "effects",
		duration: 0.9,
		frequency: 520,
		waveform: "whoosh",
		tags: ["whoosh", "transition", "reveal", "motion"],
	},
	{
		id: -103,
		slug: "cinematic-impact",
		name: "Cinematic Impact",
		description: "A compact low impact for hooks and chapter changes.",
		kind: "effects",
		duration: 1.4,
		frequency: 72,
		waveform: "impact",
		tags: ["impact", "cinematic", "hook", "chapter"],
	},
	{
		id: -104,
		slug: "camera-marker",
		name: "Camera Marker",
		description: "A bright marker tone for beats and on-screen callouts.",
		kind: "effects",
		duration: 0.42,
		frequency: 1180,
		waveform: "pulse",
		tags: ["marker", "camera", "callout", "beat"],
	},
	{
		id: -201,
		slug: "focus-bed",
		name: "Focus Bed",
		description: "A calm tonal bed designed for speech-first edits.",
		kind: "songs",
		duration: 24,
		frequency: 196,
		waveform: "ambient",
		tags: ["music", "ambient", "focus", "speech", "calm"],
	},
	{
		id: -202,
		slug: "forward-motion",
		name: "Forward Motion",
		description: "A light rhythmic bed for product and creator videos.",
		kind: "songs",
		duration: 24,
		frequency: 110,
		waveform: "beat",
		tags: ["music", "beat", "product", "creator", "rhythm"],
	},
	{
		id: -203,
		slug: "night-documentary",
		name: "Night Documentary",
		description: "A quiet minor-toned texture for reflective sequences.",
		kind: "songs",
		duration: 24,
		frequency: 146.83,
		waveform: "ambient",
		tags: ["music", "documentary", "night", "reflective", "cinematic"],
	},
	{
		id: -204,
		slug: "launch-pulse",
		name: "Launch Pulse",
		description: "A measured pulse for launches, recaps, and explainers.",
		kind: "songs",
		duration: 24,
		frequency: 130.81,
		waveform: "beat",
		tags: ["music", "launch", "recap", "explainer", "pulse"],
	},
] as const;

export function localSoundBySlug(slug: string): LocalSoundDefinition | null {
	return LOCAL_SOUND_LIBRARY.find((sound) => sound.slug === slug) ?? null;
}

export function searchLocalSounds({
	query,
	type,
}: {
	query?: string;
	type: LocalSoundKind;
}): readonly LocalSoundDefinition[] {
	const tokens = (query ?? "")
		.normalize("NFKC")
		.toLocaleLowerCase()
		.split(/\s+/u)
		.filter(Boolean);
	return LOCAL_SOUND_LIBRARY.filter((sound) => {
		if (sound.kind !== type) return false;
		if (tokens.length === 0) return true;
		const haystack = [sound.name, sound.description, ...sound.tags]
			.join(" ")
			.toLocaleLowerCase();
		return tokens.every((token) => haystack.includes(token));
	});
}

export function localSoundToSearchResult({
	sound,
}: {
	sound: LocalSoundDefinition;
}): SoundEffect {
	const audioUrl = `/api/sounds/local/${encodeURIComponent(sound.slug)}`;
	return {
		id: sound.id,
		name: sound.name,
		description: sound.description,
		url: audioUrl,
		previewUrl: audioUrl,
		downloadUrl: audioUrl,
		duration: sound.duration,
		filesize: Math.ceil(sound.duration * 44_100 * 2) + 44,
		type: "audio/wav",
		channels: 1,
		bitrate: 705_600,
		bitdepth: 16,
		samplerate: 44_100,
		username: "VisionCut Original Audio",
		tags: [...sound.tags],
		license: "VisionCut bundled original / project use permitted",
		created: "2026-08-13T00:00:00.000Z",
		downloads: 0,
		rating: 5,
		ratingCount: 1,
	};
}
