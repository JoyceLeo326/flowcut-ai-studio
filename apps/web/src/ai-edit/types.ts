export type EditMode = "local" | "hybrid" | "chatcut";

export type AspectRatio = "16:9" | "9:16" | "4:5" | "1:1";

export type EditStepKind =
	| "import-media"
	| "arrange-media"
	| "tighten-clips"
	| "set-aspect-ratio"
	| "remove-silence"
	| "transcribe-captions"
	| "semantic-highlights"
	| "creative-polish"
	| "audio-design"
	| "create-versions";

export type EditStepExecutor = "local" | "chatcut";
export type EditStepAvailability = "ready" | "handoff" | "blocked";

export type DeliveryPlatform =
	| "generic"
	| "douyin"
	| "xiaohongshu"
	| "bilibili"
	| "youtube"
	| "podcast";

export interface EditTarget {
	platform: DeliveryPlatform;
	label: string;
	aspectRatio: AspectRatio;
	targetDurationSeconds?: number;
	style: string;
}

export interface EditOutputVariant {
	label: string;
	aspectRatio: AspectRatio;
	targetDurationSeconds?: number;
}

export interface CreativeDirection {
	hook: string;
	narrative: string;
	captionStyle: string;
	motionStyle: string;
	audioStrategy: string;
	colorMood: string;
	outputVariants: EditOutputVariant[];
}

export interface EditPlanStep {
	id: string;
	kind: EditStepKind;
	title: string;
	description: string;
	executor: EditStepExecutor;
	availability: EditStepAvailability;
	enabled: boolean;
	params?: {
		aspectRatio?: AspectRatio;
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
	target: EditTarget;
	creativeDirection: CreativeDirection;
	summary: string;
	reviewChecklist: string[];
	riskNotes: string[];
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
	target: EditTarget;
	requestedSteps: EditPlanStep[];
	reviewChecklist: string[];
	privacy: {
		requiresExplicitUpload: true;
		provider: "ChatCut";
		consent: string;
	};
}
