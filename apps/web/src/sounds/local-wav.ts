import type { LocalSoundDefinition } from "./local-sound-library";

const SAMPLE_RATE = 44_100;

function clampSample(value: number): number {
	return Math.max(-1, Math.min(1, value));
}

function envelope({ index, total }: { index: number; total: number }): number {
	const fadeSamples = Math.min(Math.round(SAMPLE_RATE * 0.08), total / 4);
	return Math.min(1, index / fadeSamples, (total - index - 1) / fadeSamples);
}

function sampleFor({
	sound,
	index,
	total,
}: {
	sound: LocalSoundDefinition;
	index: number;
	total: number;
}): number {
	const time = index / SAMPLE_RATE;
	const progress = index / Math.max(1, total - 1);
	const phase = Math.PI * 2 * sound.frequency * time;
	const fade = envelope({ index, total });

	switch (sound.waveform) {
		case "click":
			return Math.sin(phase) * Math.exp(-time * 32) * 0.6;
		case "whoosh": {
			const sweep = Math.PI * 2 * (100 + 900 * progress * progress) * time;
			const noise = Math.sin(index * 12.9898) * 0.13;
			return (Math.sin(sweep) * 0.32 + noise) * Math.sin(Math.PI * progress);
		}
		case "impact":
			return (
				(Math.sin(phase) + Math.sin(phase * 0.49) * 0.55) *
				Math.exp(-time * 3.5) *
				0.58
			);
		case "pulse":
			return Math.sin(phase) * Math.pow(Math.max(0, 1 - progress), 3) * 0.48;
		case "ambient": {
			const chord =
				Math.sin(phase) * 0.42 +
				Math.sin(phase * 1.25) * 0.24 +
				Math.sin(phase * 1.5) * 0.16;
			return chord * (0.65 + Math.sin(time * 0.45) * 0.15) * fade * 0.34;
		}
		case "beat": {
			const beatProgress = (time * 2) % 1;
			const kick =
				Math.sin(Math.PI * 2 * 54 * time) * Math.exp(-beatProgress * 13);
			const tone = Math.sin(phase) * (0.4 + 0.2 * Math.sin(time * Math.PI));
			return (kick * 0.38 + tone * 0.22) * fade;
		}
	}
}

function writeAscii({
	view,
	offset,
	value,
}: {
	view: DataView;
	offset: number;
	value: string;
}) {
	for (let index = 0; index < value.length; index += 1) {
		view.setUint8(offset + index, value.charCodeAt(index));
	}
}

export function createLocalSoundWav(sound: LocalSoundDefinition): ArrayBuffer {
	const sampleCount = Math.round(sound.duration * SAMPLE_RATE);
	const dataBytes = sampleCount * 2;
	const buffer = new ArrayBuffer(44 + dataBytes);
	const view = new DataView(buffer);
	writeAscii({ view, offset: 0, value: "RIFF" });
	view.setUint32(4, 36 + dataBytes, true);
	writeAscii({ view, offset: 8, value: "WAVE" });
	writeAscii({ view, offset: 12, value: "fmt " });
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, SAMPLE_RATE, true);
	view.setUint32(28, SAMPLE_RATE * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	writeAscii({ view, offset: 36, value: "data" });
	view.setUint32(40, dataBytes, true);

	for (let index = 0; index < sampleCount; index += 1) {
		const sample = clampSample(sampleFor({ sound, index, total: sampleCount }));
		view.setInt16(44 + index * 2, Math.round(sample * 32_767), true);
	}
	return buffer;
}
