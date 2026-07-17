export type EditMode = "local" | "hybrid" | "chatcut";

export type EditStepKind =
	| "import-media"
	| "arrange-media"
	| "tighten-clips"
	| "set-aspect-ratio"
	| "remove-silence"
	| "transcribe-captions"
	| "semantic-highlights";

export type EditStepExecutor = "local" | "chatcut";
export type EditStepAvailability = "ready" | "handoff" | "blocked";

export interface EditPlanStep {
	id: string;
	kind: EditStepKind;
	title: string;
	description: string;
	executor: EditStepExecutor;
	availability: EditStepAvailability;
	enabled: boolean;
	params?: {
		aspectRatio?: "16:9" | "9:16" | "1:1";
	};
}

export interface EditPlanSource {
	assetCount: number;
	unusedAssetCount: number;
	timelineElementCount: number;
	videoClipCount: number;
	durationSeconds: number;
}

export interface EditPlan {
	id: string;
	formatVersion: "flowcut.edit-plan/v1";
	prompt: string;
	mode: EditMode;
	createdAt: string;
	source: EditPlanSource;
	steps: EditPlanStep[];
}

export interface PlannerInput extends EditPlanSource {
	prompt: string;
	mode: EditMode;
}

export interface HandoffMediaItem {
	name: string;
	type: "image" | "video" | "audio";
	durationSeconds?: number;
}

export interface ChatCutHandoff {
	formatVersion: "flowcut.chatcut-handoff/v1";
	project: {
		id: string;
		name: string;
	};
	media: HandoffMediaItem[];
	plan: EditPlan;
	requestedSteps: EditPlanStep[];
	privacy: {
		requiresExplicitUpload: true;
		provider: "ChatCut";
	};
}
