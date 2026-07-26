import { describe, expect, mock, test } from "bun:test";
import { Command } from "@/commands/base-command";
import type { SceneTracks } from "@/timeline";
import type { CommandManagerEditor } from "./commands";

let computeCalls = 0;
let applyCalls = 0;

mock.module("@/ripple", () => ({
	computeRippleAdjustments: () => {
		computeCalls += 1;
		return [{ trackId: "main", startTime: 0, delta: 1 }];
	},
	applyRippleAdjustments: ({ tracks }: { tracks: SceneTracks }) => {
		applyCalls += 1;
		return tracks;
	},
}));

const { CommandManager } = await import("./commands");

function emptyTracks(): SceneTracks {
	return {
		main: {
			id: "main",
			name: "Main",
			type: "video",
			muted: false,
			hidden: false,
			elements: [],
		},
		overlay: [],
		audio: [],
	};
}

function fakeEditor() {
	let tracks = emptyTracks();
	let updates = 0;
	const emptySelection = {
		selectedElements: [],
		selectedKeyframes: [],
		keyframeSelectionAnchor: null,
		selectedMaskPoints: null,
	};
	const editor: CommandManagerEditor = {
		scenes: {
			getActiveSceneOrNull: () => ({ tracks }),
		},
		selection: {
			getSnapshot: () => emptySelection,
			applySelectionPatch: () => emptySelection,
			restoreSnapshot: () => undefined,
		},
		timeline: {
			updateTracks: (next: SceneTracks) => {
				tracks = next;
				updates += 1;
			},
		},
	};
	return {
		editor,
		getUpdates: () => updates,
	};
}

class TestCommand extends Command {
	constructor(override readonly handlesRipple: boolean) {
		super();
	}

	execute(): undefined {
		return undefined;
	}

	override undo(): void {}
}

class FailingCommand extends Command {
	constructor(private readonly failure: "undo" | "redo") {
		super();
	}

	execute(): undefined {
		if (this.failure === "redo") {
			throw new Error("redo blocked");
		}
		return undefined;
	}

	override undo(): void {
		if (this.failure === "undo") {
			throw new Error("undo blocked");
		}
	}
}

function command(handlesRipple: boolean): Command {
	return new TestCommand(handlesRipple);
}

describe("CommandManager ripple ownership", () => {
	test("does not apply managed ripple when a command owns the full transform", () => {
		computeCalls = 0;
		applyCalls = 0;
		const fixture = fakeEditor();
		const manager = new CommandManager(fixture.editor);
		manager.isRippleEnabled = true;
		manager.execute({ command: command(true) });
		expect(computeCalls).toBe(0);
		expect(applyCalls).toBe(0);
		expect(fixture.getUpdates()).toBe(0);
	});

	test("preserves managed ripple for ordinary commands", () => {
		computeCalls = 0;
		applyCalls = 0;
		const fixture = fakeEditor();
		const manager = new CommandManager(fixture.editor);
		manager.isRippleEnabled = true;
		manager.execute({ command: command(false) });
		expect(computeCalls).toBe(1);
		expect(applyCalls).toBe(1);
		expect(fixture.getUpdates()).toBe(1);
	});

	test("identifies the exact command available for safe undo and redo", () => {
		const fixture = fakeEditor();
		const manager = new CommandManager(fixture.editor);
		const first = command(true);
		const second = command(true);
		manager.execute({ command: first });
		expect(manager.isLatest(first)).toBe(true);
		manager.execute({ command: second });
		expect(manager.isLatest(first)).toBe(false);
		expect(manager.isLatest(second)).toBe(true);
		manager.undo();
		expect(manager.isLatest(first)).toBe(true);
		expect(manager.isNextRedo(second)).toBe(true);
		manager.redo();
		expect(manager.isLatest(second)).toBe(true);
		expect(manager.isNextRedo(second)).toBe(false);
	});

	test("keeps a command in history when undo is rejected", () => {
		const fixture = fakeEditor();
		const manager = new CommandManager(fixture.editor);
		const failing = new FailingCommand("undo");
		manager.execute({ command: failing });

		expect(() => manager.undo()).toThrow("undo blocked");
		expect(manager.isLatest(failing)).toBe(true);
		expect(manager.isNextRedo(failing)).toBe(false);
	});

	test("keeps a command in the redo stack when redo is rejected", () => {
		const fixture = fakeEditor();
		const manager = new CommandManager(fixture.editor);
		let shouldFail = false;
		class RetryableCommand extends Command {
			execute(): undefined {
				if (shouldFail) throw new Error("redo blocked");
				return undefined;
			}

			override undo(): void {}
		}
		const retryable = new RetryableCommand();
		manager.execute({ command: retryable });
		manager.undo();
		shouldFail = true;

		expect(() => manager.redo()).toThrow("redo blocked");
		expect(manager.isNextRedo(retryable)).toBe(true);
		expect(manager.isLatest(retryable)).toBe(false);
	});
});
