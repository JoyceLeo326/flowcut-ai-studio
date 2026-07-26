import { Button } from "@/components/ui/button";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useReducer, useRef, useState } from "react";
import { extractTimelineAudio } from "@/media/mediabunny";
import { useEditor } from "@/editor/use-editor";
import { TRANSCRIPTION_DIAGNOSTICS_SCOPE } from "@/transcription/diagnostics";
import { DEFAULT_TRANSCRIPTION_SAMPLE_RATE } from "@/transcription/audio";
import { TRANSCRIPTION_LANGUAGES } from "@/transcription/supported-languages";
import type {
	CaptionChunk,
	TranscriptionLanguage,
	TranscriptionProgress,
} from "@/transcription/types";
import {
	DEFAULT_TRANSCRIPTION_MODEL,
	TRANSCRIPTION_MODELS,
} from "@/transcription/models";
import { transcriptionService } from "@/services/transcription/service";
import { decodeAudioToFloat32 } from "@/media/audio";
import { buildCaptionChunks } from "@/transcription/caption";
import { insertCaptionChunksAsTextTrack } from "@/subtitles/insert";
import { parseSubtitleFile } from "@/subtitles/parse";
import {
	appendTimelineTranscriptArtifact,
	emitTimelineTranscriptArtifactUpdated,
	type TimelineTranscriptArtifactDraft,
} from "@/ai-studio/transcript-artifact";
import { Spinner } from "@/components/ui/spinner";
import {
	Section,
	SectionContent,
	SectionField,
	SectionFields,
} from "@/components/section";
import { AlertCircleIcon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { DiagnosticSeverity } from "@/diagnostics/types";

const DIAGNOSTIC_BUTTON_VARIANT: Record<
	DiagnosticSeverity,
	"caution" | "destructive-foreground"
> = {
	caution: "caution",
	error: "destructive-foreground",
};

type ProcessingState =
	| {
			status: "idle";
			error: string | null;
			warnings: string[];
			notice: string | null;
	  }
	| { status: "processing"; step: string };

type ProcessingAction =
	| { type: "start"; step: string }
	| { type: "update_step"; step: string }
	| { type: "succeed"; warnings: string[]; notice: string | null }
	| { type: "fail"; error: string };

const IDLE_STATE: ProcessingState = {
	status: "idle",
	error: null,
	warnings: [],
	notice: null,
};

/* eslint-disable opencut/prefer-object-params -- React reducers must accept (state, action). */
function processingReducer(
	state: ProcessingState,
	action: ProcessingAction,
): ProcessingState {
	switch (action.type) {
		case "start":
			return { status: "processing", step: action.step };
		case "update_step":
			if (state.status !== "processing") return state;
			return { status: "processing", step: action.step };
		case "succeed":
			return {
				status: "idle",
				error: null,
				warnings: action.warnings,
				notice: action.notice,
			};
		case "fail":
			return {
				status: "idle",
				error: action.error,
				warnings: [],
				notice: null,
			};
	}
}
/* eslint-enable opencut/prefer-object-params */

export function Captions() {
	const [selectedLanguage, setSelectedLanguage] =
		useState<TranscriptionLanguage>("auto");
	const [processing, dispatch] = useReducer(processingReducer, IDLE_STATE);
	const containerRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const editor = useEditor();

	const isProcessing = processing.status === "processing";

	const activeDiagnostics = useEditor((e) =>
		e.diagnostics.getActive({ scope: TRANSCRIPTION_DIAGNOSTICS_SCOPE }),
	);

	const handleProgress = (progress: TranscriptionProgress) => {
		if (progress.status === "loading-model") {
			dispatch({
				type: "update_step",
				step: `Loading model ${Math.round(progress.progress)}%`,
			});
		} else if (progress.status === "transcribing") {
			dispatch({ type: "update_step", step: "Transcribing..." });
		}
	};

	const insertCaptions = ({
		captions,
	}: {
		captions: CaptionChunk[];
	}): string | null => {
		return insertCaptionChunksAsTextTrack({ editor, captions });
	};

	const getActiveTranscriptScope = () => {
		const projectId = editor.project.getActive()?.metadata.id;
		const sceneId = editor.scenes.getActiveSceneOrNull()?.id;
		if (!projectId || !sceneId) {
			throw new Error("No active project timeline is available.");
		}
		return {
			projectId,
			sceneId,
			timelineId: sceneId,
		};
	};

	const assertTranscriptScopeIsActive = ({
		scope,
	}: {
		scope: ReturnType<typeof getActiveTranscriptScope>;
	}) => {
		const currentProjectId = editor.project.getActive()?.metadata.id;
		const currentSceneId = editor.scenes.getActiveSceneOrNull()?.id;
		if (
			currentProjectId !== scope.projectId ||
			currentSceneId !== scope.sceneId
		) {
			throw new Error(
				"The active project or scene changed during processing. No captions or transcript evidence were saved.",
			);
		}
	};

	const finishWithTranscriptEvidence = async ({
		draft,
		warnings,
	}: {
		draft: TimelineTranscriptArtifactDraft;
		warnings: string[];
	}) => {
		dispatch({
			type: "update_step",
			step: "Saving transcript evidence...",
		});
		try {
			const artifact = await appendTimelineTranscriptArtifact({ draft });
			emitTimelineTranscriptArtifactUpdated({ artifact });
			dispatch({
				type: "succeed",
				warnings,
				notice: `Transcript evidence saved locally as revision ${artifact.revision}.`,
			});
		} catch (error) {
			console.error("Transcript evidence persistence failed:", error);
			const reason =
				error instanceof Error ? error.message : "Unknown storage error";
			dispatch({
				type: "succeed",
				warnings: [
					...warnings,
					`Captions were inserted into the timeline, but transcript evidence was not saved locally: ${reason}`,
				],
				notice: null,
			});
		}
	};

	const handleGenerateTranscript = async () => {
		dispatch({ type: "start", step: "Extracting audio..." });
		try {
			const scope = getActiveTranscriptScope();
			const audioBlob = await extractTimelineAudio({
				tracks: editor.scenes.getActiveScene().tracks,
				mediaAssets: editor.media.getAssets(),
				totalDuration: editor.timeline.getTotalDuration(),
			});

			dispatch({ type: "update_step", step: "Preparing audio..." });
			const { samples } = await decodeAudioToFloat32({
				audioBlob,
				sampleRate: DEFAULT_TRANSCRIPTION_SAMPLE_RATE,
			});

			const result = await transcriptionService.transcribe({
				audioData: samples,
				language: selectedLanguage === "auto" ? undefined : selectedLanguage,
				onProgress: handleProgress,
			});

			dispatch({ type: "update_step", step: "Generating captions..." });
			const captionChunks = buildCaptionChunks({ segments: result.segments });

			assertTranscriptScopeIsActive({ scope });
			const trackId = insertCaptions({ captions: captionChunks });
			if (trackId === null) {
				dispatch({ type: "fail", error: "No captions were generated" });
				return;
			}

			const model = TRANSCRIPTION_MODELS.find(
				(candidate) => candidate.id === DEFAULT_TRANSCRIPTION_MODEL,
			);
			if (!model) {
				dispatch({
					type: "succeed",
					warnings: [
						"Captions were inserted into the timeline, but transcript evidence was not saved locally because the Whisper model metadata was unavailable.",
					],
					notice: null,
				});
				return;
			}

			await finishWithTranscriptEvidence({
				draft: {
					...scope,
					captionTrackId: trackId,
					language: {
						code: selectedLanguage === "auto" ? "und" : selectedLanguage,
						basis:
							selectedLanguage === "auto"
								? "auto-requested-not-returned"
								: "user-selected",
						verified: false,
					},
					provenance: "local-whisper",
					sourceMetadata: {
						kind: "local-whisper",
						runtimePackage: "@huggingface/transformers",
						modelId: model.id,
						modelRepository: model.huggingFaceId,
						audioSource: "active-timeline-mix",
						mediaStored: false,
						apiKeyStored: false,
					},
					fullText:
						result.text.trim() ||
						result.segments
							.map((segment) => segment.text.trim())
							.filter(Boolean)
							.join(" "),
					segments: result.segments.map((segment) => ({
						text: segment.text,
						startSeconds: segment.start,
						endSeconds: segment.end,
					})),
				},
				warnings: [],
			});
		} catch (error) {
			console.error("Transcription failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleImportClick = () => {
		fileInputRef.current?.click();
	};

	const handleImportFile = async ({ file }: { file: File }) => {
		dispatch({ type: "start", step: "Reading subtitle file..." });
		try {
			const scope = getActiveTranscriptScope();
			const input = await file.text();
			const result = parseSubtitleFile({
				fileName: file.name,
				input,
			});

			if (result.captions.length === 0) {
				dispatch({
					type: "fail",
					error: "No valid subtitle cues were found in the subtitle file",
				});
				return;
			}

			dispatch({ type: "update_step", step: "Importing subtitles..." });

			assertTranscriptScopeIsActive({ scope });
			const trackId = insertCaptions({ captions: result.captions });
			if (trackId === null) {
				dispatch({ type: "fail", error: "No captions were generated" });
				return;
			}

			const nextWarnings = [...result.warnings];
			if (result.skippedCueCount > 0) {
				nextWarnings.unshift(
					`Imported ${result.captions.length} subtitle cue(s) and skipped ${result.skippedCueCount} malformed cue(s).`,
				);
			}

			const format = file.name.toLowerCase().endsWith(".ass") ? "ass" : "srt";
			await finishWithTranscriptEvidence({
				draft: {
					...scope,
					captionTrackId: trackId,
					language: {
						code: "und",
						basis: "subtitle-file-not-declared",
						verified: false,
					},
					provenance: "imported-subtitle",
					sourceMetadata: {
						kind: "imported-subtitle",
						fileName: file.name,
						format,
						mimeType: file.type.trim() || null,
						sizeBytes: file.size,
						lastModified: file.lastModified,
						fileContentStored: false,
						apiKeyStored: false,
					},
					fullText: result.captions
						.map((caption) => caption.text.trim())
						.join("\n"),
					segments: result.captions.map((caption) => ({
						text: caption.text,
						startSeconds: caption.startTime,
						endSeconds: caption.startTime + caption.duration,
					})),
				},
				warnings: nextWarnings,
			});
		} catch (error) {
			console.error("Subtitle import failed:", error);
			dispatch({
				type: "fail",
				error:
					error instanceof Error
						? error.message
						: "An unexpected error occurred",
			});
		}
	};

	const handleFileChange = async ({
		event,
	}: {
		event: React.ChangeEvent<HTMLInputElement>;
	}) => {
		const file = event.target.files?.[0];
		if (event.target) {
			event.target.value = "";
		}
		if (!file) return;

		await handleImportFile({ file });
	};

	const handleLanguageChange = ({ value }: { value: string }) => {
		if (value === "auto") {
			setSelectedLanguage("auto");
			return;
		}

		const matchedLanguage = TRANSCRIPTION_LANGUAGES.find(
			(language) => language.code === value,
		);
		if (!matchedLanguage) return;
		setSelectedLanguage(matchedLanguage.code);
	};

	const error = processing.status === "idle" ? processing.error : null;
	const warnings = processing.status === "idle" ? processing.warnings : [];
	const notice = processing.status === "idle" ? processing.notice : null;

	return (
		<PanelView
			title="Captions"
			contentClassName="px-0 flex flex-col h-full"
			actions={
				<TooltipProvider>
					<div className="flex items-center gap-1.5">
						{!isProcessing &&
							activeDiagnostics.map((diagnostic) => (
								<Tooltip key={diagnostic.id}>
									<TooltipTrigger asChild>
										<Button
											variant={DIAGNOSTIC_BUTTON_VARIANT[diagnostic.severity]}
											size="icon"
											aria-label={diagnostic.message}
										>
											<HugeiconsIcon icon={AlertCircleIcon} size={16} />
										</Button>
									</TooltipTrigger>
									<TooltipContent>{diagnostic.message}</TooltipContent>
								</Tooltip>
							))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleImportClick}
							disabled={isProcessing}
							className="items-center justify-center gap-1.5"
						>
							<HugeiconsIcon icon={CloudUploadIcon} />
							Import
						</Button>
					</div>
				</TooltipProvider>
			}
			ref={containerRef}
		>
			<input
				ref={fileInputRef}
				type="file"
				accept=".srt,.ass"
				className="hidden"
				onChange={(event) => void handleFileChange({ event })}
			/>
			<Section
				showTopBorder={false}
				showBottomBorder={false}
				className="flex-1"
			>
				<SectionContent className="flex flex-col gap-4 h-full pt-1">
					<SectionFields>
						<SectionField label="Language">
							<Select
								value={selectedLanguage}
								onValueChange={(value) => handleLanguageChange({ value })}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select a language" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">Auto detect</SelectItem>
									{TRANSCRIPTION_LANGUAGES.map((language) => (
										<SelectItem key={language.code} value={language.code}>
											{language.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</SectionField>
					</SectionFields>

					<Button
						type="button"
						className="mt-auto w-full"
						onClick={handleGenerateTranscript}
						disabled={isProcessing || activeDiagnostics.length > 0}
					>
						{isProcessing && <Spinner className="mr-1" />}
						{isProcessing ? processing.step : "Generate transcript"}
					</Button>
					{error && (
						<div className="bg-destructive/10 border-destructive/20 rounded-md border p-3">
							<p className="text-destructive text-sm">{error}</p>
						</div>
					)}
					{notice && (
						<div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3">
							<p className="text-sm text-emerald-700">{notice}</p>
						</div>
					)}
					{warnings.length > 0 && (
						<div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3">
							<ul className="space-y-1 text-sm text-amber-700">
								{warnings.map((warning) => (
									<li key={warning}>{warning}</li>
								))}
							</ul>
						</div>
					)}
				</SectionContent>
			</Section>
		</PanelView>
	);
}
