"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { HistoryActions } from "@/components/editor/panels/assets/views/history-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import { frameRateToFloat } from "@/fps/utils";
import { cn } from "@/utils/ui";
import { generateUUID } from "@/utils/id";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	subMediaTime,
	ZERO_MEDIA_TIME,
	type MediaTime,
} from "@/wasm";
import {
	buildRemoveTransitionPlan,
	buildTransitionPlan,
	getTransitionSummary,
	resolveTransitionTarget,
	TRANSITION_PRESETS,
	type TransitionPresetId,
} from "./transition-model";

const DEFAULT_TRANSITION_SECONDS = 0.8;

export function TransitionsView() {
	const editor = useEditor();
	const tracks = useEditor(
		(current) => current.scenes.getActiveSceneOrNull()?.tracks ?? null,
	);
	const selectedElements = useEditor((current) =>
		current.selection.getSelectedElements(),
	);
	const playheadTime = useEditor((current) =>
		current.playback.getCurrentTime(),
	);
	const project = useEditor((current) => current.project.getActive());
	const [durationSeconds, setDurationSeconds] = useState(
		DEFAULT_TRANSITION_SECONDS,
	);
	const [lastError, setLastError] = useState<string | null>(null);

	const tolerance = useMemo(() => {
		const fps = project ? frameRateToFloat(project.settings.fps) : 30;
		return mediaTimeFromSeconds({ seconds: Math.max(1 / fps, 0.001) });
	}, [project]);

	const target = useMemo(
		() =>
			tracks
				? resolveTransitionTarget({
						tracks,
						selection: selectedElements,
						playheadTime,
						tolerance,
					})
				: { ok: false as const, reason: "Open a project to add a transition." },
		[playheadTime, selectedElements, tolerance, tracks],
	);
	const currentTransition = target.ok
		? getTransitionSummary({ pair: target.pair })
		: null;

	const applyTransition = (presetId: TransitionPresetId) => {
		if (!target.ok || !project) {
			const reason = target.ok
				? "Open a project to add a transition."
				: target.reason;
			setLastError(reason);
			toast.error("Transition not applied", { description: reason });
			return;
		}

		const plan = buildTransitionPlan({
			pair: target.pair,
			presetId,
			requestedDuration: mediaTimeFromSeconds({ seconds: durationSeconds }),
			transitionId: currentTransition?.id ?? generateUUID(),
			canvasWidth: project.settings.canvasSize.width,
		});
		if (!plan.ok) {
			setLastError(plan.reason);
			toast.error("Transition not applied", { description: plan.reason });
			return;
		}

		editor.timeline.updateElements({ updates: plan.updates });
		setLastError(null);
		toast.success(
			currentTransition ? "Transition replaced" : "Transition added",
			{
				description: `${formatSeconds(plan.actualDuration)} across ${target.pair.left.name} and ${target.pair.right.name}.`,
			},
		);
	};

	const removeTransition = () => {
		if (!target.ok) return;
		const plan = buildRemoveTransitionPlan({ pair: target.pair });
		if (!plan.ok) {
			setLastError(plan.reason);
			return;
		}
		editor.timeline.updateElements({ updates: plan.updates });
		setLastError(null);
		toast.success("Transition removed");
	};

	const previewCut = () => {
		if (!target.ok) return;
		const previewLead = mediaTimeFromSeconds({
			seconds: Math.max(0.35, durationSeconds / 2),
		});
		const start =
			target.pair.cutTime > previewLead
				? subMediaTime({ a: target.pair.cutTime, b: previewLead })
				: ZERO_MEDIA_TIME;
		editor.playback.seek({ time: start });
		editor.playback.play();
	};

	return (
		<PanelView
			title="Transitions"
			actions={<HistoryActions />}
			contentClassName="pb-6"
		>
			<div className="flex min-w-0 flex-col gap-4">
				<TargetStatus
					target={target}
					currentType={currentTransition?.type ?? null}
					isComplete={currentTransition?.complete ?? true}
					onPreview={previewCut}
				/>

				<div className="space-y-2 rounded-md border bg-muted/15 p-3">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-sm font-medium">Duration</p>
							<p className="text-xs text-muted-foreground">
								Shared across both sides of the cut
							</p>
						</div>
						<span className="shrink-0 font-mono text-xs tabular-nums">
							{durationSeconds.toFixed(1)} s
						</span>
					</div>
					<Slider
						aria-label="Transition duration"
						min={0.2}
						max={3}
						step={0.1}
						value={[durationSeconds]}
						onValueChange={(value) =>
							setDurationSeconds(value[0] ?? DEFAULT_TRANSITION_SECONDS)
						}
					/>
				</div>

				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{TRANSITION_PRESETS.map((preset) => {
						const isActive = currentTransition?.type === preset.id;
						return (
							<button
								key={preset.id}
								type="button"
								className={cn(
									"group min-h-24 min-w-0 rounded-md border p-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
									isActive
										? "border-primary bg-primary/5"
										: "hover:border-foreground/25 hover:bg-accent/50",
								)}
								onClick={() => applyTransition(preset.id)}
								disabled={!target.ok}
							>
								<div
									className={cn(
										"mb-2 h-7 rounded-sm bg-linear-to-r opacity-80",
										preset.accent,
									)}
								>
									<div className="mx-auto h-full w-px bg-white/70" />
								</div>
								<div className="flex items-center justify-between gap-2">
									<span className="truncate text-sm font-medium">
										{preset.name}
									</span>
									{isActive ? <Check className="size-4 shrink-0" /> : null}
								</div>
								<p className="mt-1 text-xs leading-4 text-muted-foreground">
									{preset.description}
								</p>
							</button>
						);
					})}
				</div>

				{lastError ? (
					<div
						className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
						role="alert"
					>
						<AlertCircle className="mt-0.5 size-4 shrink-0" />
						<p className="min-w-0 leading-5">{lastError}</p>
					</div>
				) : null}

				{currentTransition ? (
					<Button
						variant="destructive-foreground"
						className="min-h-11 w-full"
						onClick={removeTransition}
					>
						<Trash2 />
						Remove transition
					</Button>
				) : null}
			</div>
		</PanelView>
	);
}

function TargetStatus({
	target,
	currentType,
	isComplete,
	onPreview,
}: {
	target: ReturnType<typeof resolveTransitionTarget>;
	currentType: TransitionPresetId | null;
	isComplete: boolean;
	onPreview: () => void;
}) {
	if (!target.ok) {
		return (
			<div className="flex min-h-36 flex-col items-center justify-center rounded-md border border-dashed p-4 text-center">
				<div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted">
					<span className="text-lg" aria-hidden="true">
						&lt;-&gt;
					</span>
				</div>
				<p className="text-sm font-medium">Choose an edit point</p>
				<p className="mt-1 max-w-52 text-xs leading-5 text-muted-foreground">
					{target.reason}
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-md border bg-muted/15 p-3">
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-1.5">
						<Badge variant="secondary">
							{target.source === "selection" ? "Selected cut" : "Nearest cut"}
						</Badge>
						{currentType ? (
							<Badge variant={isComplete ? "outline" : "destructive"}>
								{isComplete ? "Applied" : "Repair needed"}
							</Badge>
						) : null}
					</div>
					<p className="mt-2 truncate text-sm font-medium">
						{target.pair.left.name}
						<span className="px-1.5 text-muted-foreground">-&gt;</span>
						{target.pair.right.name}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Cut at {formatSeconds(target.pair.cutTime)}
					</p>
				</div>
				<Button
					variant="outline"
					size="icon"
					className="size-11 shrink-0"
					aria-label="Preview transition"
					onClick={onPreview}
				>
					<Play />
				</Button>
			</div>
		</div>
	);
}

function formatSeconds(time: MediaTime): string {
	return `${mediaTimeToSeconds({ time }).toFixed(1)} s`;
}
