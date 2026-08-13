"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Layers3, LocateFixed, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PanelView } from "@/components/editor/panels/assets/views/base-panel";
import { HistoryActions } from "@/components/editor/panels/assets/views/history-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";
import type { ElementRef, SceneTracks } from "@/timeline";
import {
	mediaTimeFromSeconds,
	mediaTimeToSeconds,
	type MediaTime,
} from "@/wasm";
import {
	ADJUSTMENT_PRESETS,
	buildAdjustmentLayer,
	getAdjustmentLayers,
	resolveAdjustmentRange,
	type AdjustmentLayerRef,
	type AdjustmentPresetId,
	type AdjustmentScope,
} from "./adjustment-model";

const DEFAULT_LAYER_SECONDS = 5;

export function AdjustmentView() {
	const editor = useEditor();
	const tracks = useEditor(
		(current) =>
			current.timeline.getPreviewTracks() ??
			current.scenes.getActiveSceneOrNull()?.tracks ??
			null,
	);
	const selectedElements = useEditor((current) =>
		current.selection.getSelectedElements(),
	);
	const playheadTime = useEditor((current) =>
		current.playback.getCurrentTime(),
	);
	const [scope, setScope] = useState<AdjustmentScope>("playhead");
	const [durationSeconds, setDurationSeconds] = useState(DEFAULT_LAYER_SECONDS);
	const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
	const [lastError, setLastError] = useState<string | null>(null);

	const layers = useMemo(
		() => (tracks ? getAdjustmentLayers({ tracks }) : []),
		[tracks],
	);
	const timelineSelectedLayerId = selectedElements.find((ref) =>
		layers.some(
			(layer) =>
				layer.trackId === ref.trackId && layer.element.id === ref.elementId,
		),
	)?.elementId;
	const activeLayer =
		layers.find(
			(layer) =>
				layer.element.id === (timelineSelectedLayerId ?? selectedLayerId),
		) ?? null;

	const addLayer = (presetId: AdjustmentPresetId) => {
		if (!tracks) {
			setLastError("Open a project to add an adjustment layer.");
			return;
		}
		const range = resolveAdjustmentRange({
			tracks,
			selection: selectedElements,
			playheadTime,
			requestedDuration: mediaTimeFromSeconds({ seconds: durationSeconds }),
			scope,
		});
		if (!range.ok) {
			setLastError(range.reason);
			toast.error("Adjustment layer not added", { description: range.reason });
			return;
		}

		try {
			editor.timeline.insertElement({
				element: buildAdjustmentLayer({
					presetId,
					startTime: range.startTime,
					duration: range.duration,
				}),
				placement: { mode: "auto", trackType: "effect" },
			});
			setLastError(null);
			toast.success("Adjustment layer added", {
				description: `${formatTime(range.startTime)} / ${formatDuration(range.duration)}`,
			});
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "The layer could not be created.";
			setLastError(message);
			toast.error("Adjustment layer not added", { description: message });
		}
	};

	const selectLayer = (layer: AdjustmentLayerRef) => {
		setSelectedLayerId(layer.element.id);
		editor.selection.setSelectedElements({
			elements: [{ trackId: layer.trackId, elementId: layer.element.id }],
		});
		editor.playback.seek({ time: layer.element.startTime });
	};

	const removeLayer = (layer: AdjustmentLayerRef) => {
		editor.timeline.deleteElements({
			elements: [{ trackId: layer.trackId, elementId: layer.element.id }],
		});
		if (selectedLayerId === layer.element.id) setSelectedLayerId(null);
		setLastError(null);
		toast.success("Adjustment layer removed");
	};

	return (
		<PanelView
			title="Adjustment layers"
			actions={<HistoryActions />}
			contentClassName="pb-6"
		>
			<div className="flex min-w-0 flex-col gap-4">
				<NewLayerControls
					scope={scope}
					onScopeChange={setScope}
					durationSeconds={durationSeconds}
					onDurationChange={setDurationSeconds}
				/>

				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
					{ADJUSTMENT_PRESETS.map((preset) => (
						<button
							key={preset.id}
							type="button"
							className="min-h-24 min-w-0 rounded-md border p-3 text-left outline-none transition-colors hover:border-foreground/25 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
							onClick={() => addLayer(preset.id)}
						>
							<div className="flex items-center gap-2">
								<span
									className={cn("size-2.5 shrink-0 rounded-sm", preset.color)}
								/>
								<span className="truncate text-sm font-medium">
									{preset.name}
								</span>
								<span className="ml-auto font-mono text-[10px] text-muted-foreground">
									{preset.intensity}%
								</span>
							</div>
							<p className="mt-2 text-xs leading-4 text-muted-foreground">
								{preset.description}
							</p>
						</button>
					))}
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

				<div className="space-y-2">
					<div className="flex items-center justify-between gap-2">
						<div>
							<p className="text-sm font-medium">On the timeline</p>
							<p className="text-xs text-muted-foreground">
								{layers.length} {layers.length === 1 ? "layer" : "layers"}
							</p>
						</div>
						<Badge variant="outline">Rendered on export</Badge>
					</div>
					{layers.length === 0 ? (
						<div className="flex min-h-32 flex-col items-center justify-center rounded-md border border-dashed p-4 text-center">
							<Layers3 className="mb-2 size-8 text-muted-foreground" />
							<p className="text-sm font-medium">No adjustment layers</p>
							<p className="mt-1 max-w-52 text-xs leading-5 text-muted-foreground">
								Choose a range and preset above. The new layer remains editable.
							</p>
						</div>
					) : (
						<div className="space-y-1.5">
							{layers.map((layer) => (
								<div
									key={layer.element.id}
									className={cn(
										"flex min-w-0 items-stretch rounded-md border",
										activeLayer?.element.id === layer.element.id &&
											"border-primary bg-primary/5",
									)}
								>
									<button
										type="button"
										className="min-h-12 min-w-0 flex-1 px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
										onClick={() => selectLayer(layer)}
									>
										<p className="truncate text-sm font-medium">
											{layer.element.name}
										</p>
										<p className="mt-0.5 text-xs text-muted-foreground">
											{formatTime(layer.element.startTime)} /{" "}
											{formatDuration(layer.element.duration)}
										</p>
									</button>
									<Button
										variant="ghost"
										size="icon"
										className="size-12 shrink-0 rounded-l-none text-muted-foreground hover:text-destructive"
										aria-label={`Remove ${layer.element.name}`}
										onClick={() => removeLayer(layer)}
									>
										<Trash2 />
									</Button>
								</div>
							))}
						</div>
					)}
				</div>

				{activeLayer && tracks ? (
					<LayerEditor
						layer={activeLayer}
						tracks={tracks}
						selection={selectedElements}
						playheadTime={playheadTime}
						onError={setLastError}
					/>
				) : null}
			</div>
		</PanelView>
	);
}

function NewLayerControls({
	scope,
	onScopeChange,
	durationSeconds,
	onDurationChange,
}: {
	scope: AdjustmentScope;
	onScopeChange: (scope: AdjustmentScope) => void;
	durationSeconds: number;
	onDurationChange: (seconds: number) => void;
}) {
	const options: Array<{ id: AdjustmentScope; label: string }> = [
		{ id: "playhead", label: "At playhead" },
		{ id: "selection", label: "Selected clip" },
		{ id: "scene", label: "Full scene" },
	];
	return (
		<div className="space-y-3 rounded-md border bg-muted/15 p-3">
			<div>
				<p className="text-sm font-medium">New layer range</p>
				<p className="mt-0.5 text-xs text-muted-foreground">
					Choose where the next preset should be applied.
				</p>
			</div>
			<div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
				{options.map((option) => (
					<Button
						key={option.id}
						variant={scope === option.id ? "secondary" : "ghost"}
						className="min-h-11 min-w-0 px-2 text-xs"
						onClick={() => onScopeChange(option.id)}
					>
						<span className="truncate">{option.label}</span>
					</Button>
				))}
			</div>
			{scope === "playhead" ? (
				<div className="space-y-2">
					<div className="flex justify-between text-xs text-muted-foreground">
						<span>Length</span>
						<span className="font-mono tabular-nums">
							{durationSeconds.toFixed(1)} s
						</span>
					</div>
					<Slider
						aria-label="New adjustment layer duration"
						min={0.5}
						max={30}
						step={0.5}
						value={[durationSeconds]}
						onValueChange={(value) =>
							onDurationChange(value[0] ?? DEFAULT_LAYER_SECONDS)
						}
					/>
				</div>
			) : null}
		</div>
	);
}

function LayerEditor({
	layer,
	tracks,
	selection,
	playheadTime,
	onError,
}: {
	layer: AdjustmentLayerRef;
	tracks: SceneTracks;
	selection: ElementRef[];
	playheadTime: MediaTime;
	onError: (message: string | null) => void;
}) {
	const editor = useEditor();
	const intensityValue = layer.element.params.intensity;
	const intensity = typeof intensityValue === "number" ? intensityValue : 15;
	const durationSeconds = mediaTimeToSeconds({ time: layer.element.duration });

	const previewIntensity = (value: number) => {
		editor.timeline.previewElements({
			updates: [
				{
					trackId: layer.trackId,
					elementId: layer.element.id,
					updates: { params: { ...layer.element.params, intensity: value } },
				},
			],
		});
	};

	const updateRange = (scope: AdjustmentScope) => {
		const range = resolveAdjustmentRange({
			tracks,
			selection,
			playheadTime,
			requestedDuration: layer.element.duration,
			scope,
		});
		if (!range.ok) {
			onError(range.reason);
			toast.error("Layer range not changed", { description: range.reason });
			return;
		}
		editor.timeline.updateElements({
			updates: [
				{
					trackId: layer.trackId,
					elementId: layer.element.id,
					patch: { startTime: range.startTime, duration: range.duration },
				},
			],
		});
		onError(null);
	};

	return (
		<div className="space-y-4 rounded-md border p-3">
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="truncate text-sm font-medium">
						Edit {layer.element.name}
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						{formatTime(layer.element.startTime)} / {durationSeconds.toFixed(1)}{" "}
						s
					</p>
				</div>
				<Button
					variant="outline"
					size="icon"
					className="size-11 shrink-0"
					aria-label="Locate adjustment layer"
					onClick={() =>
						editor.playback.seek({ time: layer.element.startTime })
					}
				>
					<LocateFixed />
				</Button>
			</div>
			<div className="space-y-2">
				<div className="flex items-center justify-between text-xs">
					<span>Blur intensity</span>
					<span className="font-mono tabular-nums">
						{Math.round(intensity)}%
					</span>
				</div>
				<Slider
					aria-label="Adjustment layer blur intensity"
					min={0}
					max={100}
					step={1}
					value={[intensity]}
					onValueChange={(value) => previewIntensity(value[0] ?? intensity)}
					onValueCommit={() => editor.timeline.commitPreview()}
				/>
			</div>
			<div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
				<Button
					variant="outline"
					className="min-h-11 px-2 text-xs"
					onClick={() => updateRange("playhead")}
				>
					At playhead
				</Button>
				<Button
					variant="outline"
					className="min-h-11 px-2 text-xs"
					onClick={() => updateRange("selection")}
				>
					Match clip
				</Button>
				<Button
					variant="outline"
					className="min-h-11 px-2 text-xs"
					onClick={() => updateRange("scene")}
				>
					Full scene
				</Button>
			</div>
		</div>
	);
}

function formatTime(time: MediaTime): string {
	const seconds = Math.max(0, mediaTimeToSeconds({ time }));
	const minutes = Math.floor(seconds / 60);
	const remainder = seconds - minutes * 60;
	return `${minutes}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function formatDuration(time: MediaTime): string {
	return `${mediaTimeToSeconds({ time }).toFixed(1)} s`;
}
