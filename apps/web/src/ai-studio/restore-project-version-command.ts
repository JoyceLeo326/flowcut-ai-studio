import {
	Command,
	createElementSelectionResult,
	type CommandResult,
} from "@/commands/base-command";
import { EditorCore } from "@/core";
import type { TProject } from "@/project/types";
import { ProjectVersionRestoreError } from "./project-version-restore";

export class RestoreProjectVersionCommand extends Command {
	override readonly handlesRipple = true;
	private previousProject: TProject | null = null;

	constructor({
		project,
		onExecute,
		onUndo,
	}: {
		project: TProject;
		onExecute?: () => void;
		onUndo?: () => void;
	}) {
		super();
		this.project = project;
		this.projectId = project.metadata.id;
		this.onExecute = onExecute;
		this.onUndo = onUndo;
	}

	private readonly project: TProject;
	private readonly onExecute: (() => void) | undefined;
	private readonly onUndo: (() => void) | undefined;
	readonly projectId: string;

	execute(): CommandResult {
		const editor = EditorCore.getInstance();
		const current = editor.project.getActive();
		if (current.metadata.id !== this.projectId) {
			throw new ProjectVersionRestoreError(
				"当前项目已切换，不能应用这个恢复命令。",
			);
		}
		const isFirstExecution = this.previousProject === null;
		this.previousProject ??= current;
		editor.project.setActiveProject({ project: this.project });
		if (!isFirstExecution) this.onExecute?.();
		return createElementSelectionResult([]);
	}

	undo(): void {
		if (this.previousProject === null) return;
		const editor = EditorCore.getInstance();
		if (editor.project.getActive().metadata.id !== this.projectId) {
			throw new ProjectVersionRestoreError(
				"当前项目已切换，不能撤销这个恢复命令。",
			);
		}
		editor.project.setActiveProject({ project: this.previousProject });
		this.onUndo?.();
	}
}
