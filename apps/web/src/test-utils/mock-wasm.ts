import { mock } from "bun:test";

const TICKS_PER_SECOND = 1_000_000;

function roundHalfAwayFromZero(value: number): number {
	const magnitude = Math.round(Math.abs(value));
	return value < 0 ? -magnitude : magnitude;
}

export function installMockWasm(): void {
	mock.module("@/wasm", () => ({
		TICKS_PER_SECOND,
		ZERO_MEDIA_TIME: 0,
		mediaTime: ({ ticks }: { ticks: number }) => {
			if (!Number.isInteger(ticks)) {
				throw new Error(`Expected integer media ticks, received ${ticks}.`);
			}
			return ticks;
		},
		roundMediaTime: ({ time }: { time: number }) => roundHalfAwayFromZero(time),
		mediaTimeFromSeconds: ({ seconds }: { seconds: number }) =>
			roundHalfAwayFromZero(seconds * TICKS_PER_SECOND),
		mediaTimeToSeconds: ({ time }: { time: number }) => time / TICKS_PER_SECOND,
		addMediaTime: ({ a, b }: { a: number; b: number }) => a + b,
		subMediaTime: ({ a, b }: { a: number; b: number }) => a - b,
		maxMediaTime: ({ a, b }: { a: number; b: number }) => Math.max(a, b),
		minMediaTime: ({ a, b }: { a: number; b: number }) => Math.min(a, b),
		clampMediaTime: ({
			time,
			min,
			max,
		}: {
			time: number;
			min: number;
			max: number;
		}) => Math.min(max, Math.max(min, time)),
		roundFrameTime: ({ time }: { time: number }) => time,
		roundFrameTicks: ({ ticks }: { ticks: number }) => ticks,
		snapSeekMediaTime: ({ time }: { time: number }) => time,
		lastFrameMediaTime: ({ duration }: { duration: number }) => duration,
		parseMediaTimecode: () => null,
	}));
}
