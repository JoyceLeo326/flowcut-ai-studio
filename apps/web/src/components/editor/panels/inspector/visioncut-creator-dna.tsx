"use client";

import {
	BrainCircuit,
	CheckCircle2,
	Clock3,
	Download,
	Fingerprint,
	HardDrive,
	History,
	PauseCircle,
	RotateCcw,
	ShieldCheck,
	Sparkles,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	CREATOR_DNA_UPDATED_EVENT,
	createEmptyCreatorDNA,
	deleteCreatorDNADecision,
	deleteCreatorDNA,
	exportCreatorDNA,
	exportCreatorDNAWithDecisionLedgers,
	loadCreatorDNA,
	overrideCreatorPreference,
	revokeCreatorDNADecision,
	saveCreatorDNA,
	setCreatorDNARecordingEnabled,
	type CreatorAudioPriority,
	type CreatorCaptionDensity,
	type CreatorDNAProfile,
	type CreatorDNAPreferences,
	type CreatorPreferenceSignal,
	type CreatorRhythm,
} from "@/ai-studio/creator-dna";
import {
	CREATOR_DECISION_LEDGER_UPDATED_EVENT,
	createCreatorDecisionLedger,
	loadCreatorDecisionLedger,
	type CreatorDecisionAction,
	type CreatorDecisionLedger,
	type CreatorDecisionLedgerEvent,
	type CreatorDecisionSourceKind,
	type CreatorDecisionSurface,
} from "@/ai-studio/creator-decision-ledger";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useEditor } from "@/editor/use-editor";
import { cn } from "@/utils/ui";

const RHYTHM_OPTIONS: Array<{ value: CreatorRhythm; label: string }> = [
	{ value: "calm", label: "舒缓" },
	{ value: "balanced", label: "均衡" },
	{ value: "fast", label: "紧凑" },
];

const CAPTION_OPTIONS: Array<{
	value: CreatorCaptionDensity;
	label: string;
}> = [
	{ value: "minimal", label: "克制" },
	{ value: "balanced", label: "适中" },
	{ value: "dense", label: "丰富" },
];

const AUDIO_OPTIONS: Array<{
	value: CreatorAudioPriority;
	label: string;
}> = [
	{ value: "voice", label: "人声" },
	{ value: "music", label: "音乐" },
	{ value: "ambient", label: "环境" },
];

const ACTION_LABELS: Record<CreatorDecisionAction, string> = {
	approve: "批准方向",
	reject: "拒绝方向",
	apply: "应用剪辑",
	undo: "撤销应用",
	"export-confirm": "确认交付",
};

const SOURCE_LABELS: Record<CreatorDecisionSourceKind, string> = {
	"confirmed-plan": "已确认方案",
	"edit-decision": "剪辑决策",
	"rough-cut": "自动初剪",
	"story-graph": "故事结构",
	export: "导出交付",
	"manual-preference": "人工偏好",
};

const SURFACE_LABELS: Record<CreatorDecisionSurface, string> = {
	"director-review": "导演审阅",
	"edit-review": "剪辑审阅",
	timeline: "时间线",
	"story-canvas": "故事画布",
	"export-center": "导出中心",
	"creator-dna": "DNA 面板",
};

function downloadText({
	content,
	filename,
}: {
	content: string;
	filename: string;
}) {
	const url = URL.createObjectURL(
		new Blob([content], { type: "application/json;charset=utf-8" }),
	);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	anchor.click();
	URL.revokeObjectURL(url);
}

function formatUpdatedAt(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "尚未更新";
	return new Intl.DateTimeFormat("zh-CN", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function formatDecisionTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "时间无效";
	return new Intl.DateTimeFormat("zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(date);
}

function getDecisionStatus({
	event,
	reversedEventIds,
}: {
	event: CreatorDecisionLedgerEvent;
	reversedEventIds: ReadonlySet<string>;
}): {
	label: string;
	className: string;
} {
	if (event.lifecycle.revokedAt) {
		return {
			label: "已撤回学习依据",
			className: "text-amber-700 dark:text-amber-300",
		};
	}
	if (reversedEventIds.has(event.id)) {
		return {
			label: "已由撤销动作反向关联",
			className: "text-sky-700 dark:text-sky-300",
		};
	}
	return {
		label: "有效",
		className: "text-emerald-700 dark:text-emerald-300",
	};
}

function getPreferenceCount(preferences: CreatorDNAPreferences): number {
	return Object.values(preferences).filter(Boolean).length;
}

function PreferenceRow({
	label,
	signal,
}: {
	label: string;
	signal?: CreatorPreferenceSignal<string>;
}) {
	return (
		<div className="flex min-w-0 items-center gap-3 border-t py-2.5 first:border-t-0">
			<div className="min-w-0 flex-1">
				<p className="text-[9px] text-muted-foreground">{label}</p>
				<p className="mt-0.5 truncate text-[11px] font-medium">
					{signal?.value ?? "等待确认"}
				</p>
			</div>
			{signal ? (
				<div className="w-20 shrink-0 text-right">
					<p className="font-mono text-[9px] text-muted-foreground">
						{Math.round(signal.confidence * 100)}%
					</p>
					<div className="mt-1 h-1 overflow-hidden rounded-[2px] bg-muted">
						<div
							className="h-full bg-emerald-500"
							style={{ width: `${signal.confidence * 100}%` }}
						/>
					</div>
					<p className="mt-1 text-[8px] text-muted-foreground">
						{signal.origin === "decision-ledger"
							? `${signal.effectiveEvidenceCount ?? signal.evidenceCount} 有效样本`
							: `${signal.evidenceCount} 次依据`}
					</p>
				</div>
			) : null}
		</div>
	);
}

function PreferenceSegment<T extends string>({
	label,
	value,
	options,
	disabled,
	onChange,
}: {
	label: string;
	value?: T;
	options: Array<{ value: T; label: string }>;
	disabled: boolean;
	onChange: (value: T) => void;
}) {
	return (
		<div className="border-t py-3 first:border-t-0">
			<div className="mb-2 flex items-center justify-between gap-2">
				<span className="text-[10px] font-medium">{label}</span>
				<span className="text-[8px] text-muted-foreground">人工覆盖</span>
			</div>
			<div className="grid grid-cols-3 gap-1 rounded-[7px] border p-1">
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						disabled={disabled}
						aria-pressed={value === option.value}
						className={cn(
							"min-h-11 rounded-[5px] px-1 text-[9px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45 xl:min-h-9",
							value === option.value
								? "bg-foreground text-background"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	);
}

export function VisionCutCreatorDNA() {
	const project = useEditor((value) => value.project.getActive());
	const projectId = project?.metadata.id ?? null;
	const [profile, setProfile] = useState<CreatorDNAProfile>(() =>
		createEmptyCreatorDNA(),
	);
	const [ledger, setLedger] = useState<CreatorDecisionLedger | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [pendingDecisionAction, setPendingDecisionAction] = useState<
		string | null
	>(null);
	const preferenceCount = useMemo(
		() => getPreferenceCount(profile.preferences),
		[profile.preferences],
	);
	const activeLedger = ledger?.projectId === projectId ? ledger : null;
	const decisionEvents = useMemo(
		() =>
			[...(activeLedger?.events ?? [])].sort(
				(left, right) =>
					Date.parse(right.occurredAt) - Date.parse(left.occurredAt) ||
					right.id.localeCompare(left.id),
			),
		[activeLedger?.events],
	);
	const reversedEventIds = useMemo(
		() =>
			new Set(
				(activeLedger?.events ?? [])
					.filter(
						(event) => event.action === "undo" && !event.lifecycle.revokedAt,
					)
					.flatMap((event) =>
						event.reversal ? [event.reversal.reversesEventId] : [],
					),
			),
		[activeLedger?.events],
	);
	const recordingEnabled =
		Boolean(projectId) && profile.enabled && (activeLedger?.enabled ?? true);

	useEffect(() => {
		let active = true;
		const loadState = async () => {
			const [storedProfile, storedLedger] = await Promise.all([
				loadCreatorDNA(),
				projectId
					? loadCreatorDecisionLedger(projectId)
					: Promise.resolve(null),
			]);
			if (!active) return;
			setProfile(storedProfile);
			setLedger(storedLedger);
		};
		void loadState()
			.catch(() => {
				if (active) toast.error("无法读取本地 Creator DNA");
			})
			.finally(() => {
				if (active) setIsLoading(false);
			});
		const handleUpdate = () => {
			void loadState().catch(() => undefined);
		};
		window.addEventListener(CREATOR_DNA_UPDATED_EVENT, handleUpdate);
		window.addEventListener(
			CREATOR_DECISION_LEDGER_UPDATED_EVENT,
			handleUpdate,
		);
		return () => {
			active = false;
			window.removeEventListener(CREATOR_DNA_UPDATED_EVENT, handleUpdate);
			window.removeEventListener(
				CREATOR_DECISION_LEDGER_UPDATED_EVENT,
				handleUpdate,
			);
		};
	}, [projectId]);

	const persist = async ({
		next,
		message,
	}: {
		next: CreatorDNAProfile;
		message?: string;
	}) => {
		try {
			await saveCreatorDNA(next);
			setProfile(next);
			if (message) toast.success(message);
		} catch {
			toast.error("无法保存本地 Creator DNA");
		}
	};

	const override = async <K extends keyof CreatorDNAPreferences>({
		key,
		value,
	}: {
		key: K;
		value: NonNullable<CreatorDNAPreferences[K]>["value"];
	}) => {
		await persist({
			next: overrideCreatorPreference({ profile, key, value }),
			message: "偏好已更新",
		});
	};

	const handleRecordingToggle = async (enabled: boolean) => {
		if (!projectId) return;
		try {
			const next = await setCreatorDNARecordingEnabled({
				profile,
				projectId,
				enabled,
			});
			setProfile(next.profile);
			setLedger(next.ledger);
			toast.success(enabled ? "个性化学习已开启" : "个性化学习已暂停");
		} catch {
			toast.error("无法更新 Creator DNA 记录状态");
		}
	};

	const handleRevokeDecision = async (eventId: string) => {
		if (!projectId) return;
		setPendingDecisionAction(`revoke:${eventId}`);
		try {
			const next = await revokeCreatorDNADecision({ projectId, eventId });
			setLedger(next.ledger);
			setProfile(next.profile);
			toast.success("这条记录已不再参与偏好学习");
		} catch (error) {
			toast.error("无法撤回这条学习依据", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setPendingDecisionAction(null);
		}
	};

	const handleDeleteDecision = async (eventId: string) => {
		if (!projectId) return;
		setPendingDecisionAction(`delete:${eventId}`);
		try {
			const next = await deleteCreatorDNADecision({ projectId, eventId });
			setLedger(next.ledger);
			setProfile(next.profile);
			toast.success("这条项目记录已永久删除");
		} catch (error) {
			toast.error("无法删除这条项目记录", {
				description: error instanceof Error ? error.message : undefined,
			});
		} finally {
			setPendingDecisionAction(null);
		}
	};

	const handleDelete = async () => {
		try {
			await deleteCreatorDNA();
			setProfile(createEmptyCreatorDNA());
			setLedger(projectId ? createCreatorDecisionLedger({ projectId }) : null);
			toast.success("Creator DNA 已从当前浏览器删除");
		} catch {
			toast.error("无法删除 Creator DNA");
		}
	};

	return (
		<div className="space-y-4 pb-5">
			<section className="overflow-hidden rounded-[8px] border">
				<div className="flex items-start gap-3 p-3.5">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-[7px] border bg-foreground text-background">
						<Fingerprint className="size-5" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="flex items-center justify-between gap-2">
							<h2 className="text-[14px] font-semibold">Creator DNA</h2>
							<span className="inline-flex items-center gap-1 text-[9px] text-emerald-700 dark:text-emerald-300">
								<HardDrive className="size-3" />
								仅此浏览器
							</span>
						</div>
						<p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
							{isLoading
								? "正在读取本地偏好"
								: projectId
									? decisionEvents.length > 0
										? `当前项目有 ${decisionEvents.length} 条明确用户动作`
										: "当前项目尚无明确创作决定"
									: "打开项目后查看决策账本"}
						</p>
					</div>
				</div>
				<div className="grid grid-cols-3 divide-x border-t text-center">
					{[
						["项目动作", decisionEvents.length],
						["稳定偏好", preferenceCount],
						[
							"状态",
							projectId ? (recordingEnabled ? "记录中" : "已暂停") : "未连接",
						],
					].map(([label, value]) => (
						<div key={label} className="min-w-0 px-2 py-2.5">
							<p className="text-[8px] text-muted-foreground">{label}</p>
							<p className="mt-1 truncate text-[11px] font-semibold">{value}</p>
						</div>
					))}
				</div>
			</section>

			<section className="flex items-center gap-3 border-y py-3">
				<div className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border">
					{recordingEnabled ? (
						<BrainCircuit className="size-4 text-emerald-600" />
					) : (
						<PauseCircle className="size-4 text-muted-foreground" />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-[11px] font-medium">个性化学习</p>
					<p className="mt-0.5 text-[9px] text-muted-foreground">
						只记录你明确批准、拒绝、应用、撤销或确认导出的动作
					</p>
				</div>
				<label
					htmlFor="creator-dna-recording"
					className={cn(
						"flex size-11 shrink-0 cursor-pointer items-center justify-center xl:size-10",
						(isLoading || !projectId) && "cursor-not-allowed",
					)}
				>
					<Switch
						id="creator-dna-recording"
						checked={recordingEnabled}
						disabled={isLoading || !projectId}
						onCheckedChange={(enabled) => void handleRecordingToggle(enabled)}
						aria-label="个性化学习"
						className="relative size-11 rounded-[6px] bg-transparent before:absolute before:left-1 before:top-3 before:h-5 before:w-9 before:rounded-full before:bg-input before:content-[''] data-[state=checked]:bg-transparent data-[state=checked]:before:bg-primary data-[state=unchecked]:bg-transparent [&>span]:absolute [&>span]:left-1.5 [&>span]:top-3.5"
					/>
				</label>
			</section>

			<section>
				<div className="mb-2 flex items-center justify-between gap-2">
					<h3 className="text-[12px] font-semibold">创作偏好</h3>
					<span className="text-[9px] text-muted-foreground">
						{formatUpdatedAt(profile.updatedAt)}
					</span>
				</div>
				<div className="border-y">
					<PreferenceRow
						label="视觉风格"
						signal={profile.preferences.visualStyle}
					/>
					<PreferenceRow
						label="常用平台"
						signal={profile.preferences.platform}
					/>
					<PreferenceRow
						label="主要画幅"
						signal={profile.preferences.aspectRatio}
					/>
				</div>
			</section>

			<section className="rounded-[8px] border px-3">
				<PreferenceSegment
					label="剪辑节奏"
					value={profile.preferences.rhythm?.value}
					options={RHYTHM_OPTIONS}
					disabled={!profile.enabled}
					onChange={(value) => void override({ key: "rhythm", value })}
				/>
				<PreferenceSegment
					label="字幕密度"
					value={profile.preferences.captionDensity?.value}
					options={CAPTION_OPTIONS}
					disabled={!profile.enabled}
					onChange={(value) => void override({ key: "captionDensity", value })}
				/>
				<PreferenceSegment
					label="声音重心"
					value={profile.preferences.audioPriority?.value}
					options={AUDIO_OPTIONS}
					disabled={!profile.enabled}
					onChange={(value) => void override({ key: "audioPriority", value })}
				/>
			</section>

			<section>
				<div className="mb-2 flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h3 className="flex items-center gap-1.5 text-[12px] font-semibold">
							<History className="size-3.5" />
							项目决策账本
						</h3>
						<p className="mt-1 truncate text-[9px] text-muted-foreground">
							{project ? project.metadata.name : "未打开项目"}
						</p>
					</div>
					{projectId ? (
						<span
							className="max-w-32 truncate font-mono text-[8px] text-muted-foreground"
							title={projectId}
						>
							{projectId}
						</span>
					) : null}
				</div>

				{decisionEvents.length > 0 ? (
					<div className="divide-y border-y">
						{decisionEvents.map((event) => {
							const status = getDecisionStatus({
								event,
								reversedEventIds,
							});
							const isPending =
								pendingDecisionAction === `revoke:${event.id}` ||
								pendingDecisionAction === `delete:${event.id}`;
							return (
								<article key={event.id} className="py-3">
									<div className="flex items-start gap-2.5">
										<div className="flex size-8 shrink-0 items-center justify-center rounded-[6px] border">
											{event.action === "undo" ? (
												<RotateCcw className="size-3.5 text-sky-600" />
											) : (
												<CheckCircle2 className="size-3.5 text-emerald-600" />
											)}
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-start justify-between gap-2">
												<p className="text-[10px] font-semibold">
													{ACTION_LABELS[event.action]}
												</p>
												<span
													className={cn(
														"shrink-0 text-[8px] font-medium",
														status.className,
													)}
												>
													{status.label}
												</span>
											</div>
											<p className="mt-1 text-[9px] text-muted-foreground">
												{SOURCE_LABELS[event.source.kind]} ·{" "}
												{SURFACE_LABELS[event.source.surface]}
											</p>
											<p
												className="mt-1 truncate font-mono text-[8px] text-muted-foreground"
												title={event.source.sourceId}
											>
												来源 {event.source.sourceId}
											</p>
											<div className="mt-1.5 flex items-center gap-1 text-[8px] text-muted-foreground">
												<Clock3 className="size-3 shrink-0" />
												<time dateTime={event.occurredAt}>
													{formatDecisionTime(event.occurredAt)}
												</time>
											</div>
											{event.reversal ? (
												<p
													className="mt-1 truncate font-mono text-[8px] text-sky-700 dark:text-sky-300"
													title={event.reversal.reversesEventId}
												>
													关联撤销 {event.reversal.reversesEventId}
												</p>
											) : null}
											{event.lifecycle.revokedAt ? (
												<p className="mt-1 text-[8px] text-muted-foreground">
													撤回于 {formatDecisionTime(event.lifecycle.revokedAt)}
												</p>
											) : null}
										</div>
									</div>
									<div className="mt-2 flex justify-end gap-1">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-11 xl:size-10"
											disabled={isPending || Boolean(event.lifecycle.revokedAt)}
											onClick={() => void handleRevokeDecision(event.id)}
											title={
												event.lifecycle.revokedAt
													? "这条记录已撤回"
													: "撤回学习依据"
											}
											aria-label={`撤回 ${ACTION_LABELS[event.action]} 学习依据`}
										>
											<RotateCcw className="size-4" />
										</Button>
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="size-11 xl:size-10"
													disabled={isPending}
													title="永久删除这条记录"
													aria-label={`永久删除 ${ACTION_LABELS[event.action]} 记录`}
												>
													<Trash2 className="size-4" />
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>
														永久删除这条项目记录？
													</AlertDialogTitle>
													<AlertDialogDescription>
														记录会从当前浏览器永久移除，相关偏好会立即重新计算。项目、素材和时间线不会改变。
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel className="min-h-11 xl:min-h-10">
														保留
													</AlertDialogCancel>
													<AlertDialogAction
														className="min-h-11 xl:min-h-10"
														onClick={() => void handleDeleteDecision(event.id)}
													>
														永久删除
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									</div>
								</article>
							);
						})}
					</div>
				) : (
					<div className="flex min-h-24 items-center justify-center border-y px-4 text-center">
						<p className="text-[9px] leading-relaxed text-muted-foreground">
							{projectId
								? "当前项目还没有明确批准、应用、撤销或交付确认记录。"
								: "打开一个项目后，这里会显示该项目的本机决策记录。"}
						</p>
					</div>
				)}
			</section>

			<section className="rounded-[8px] border p-3">
				<div className="flex items-start gap-2.5">
					<ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
					<div>
						<p className="text-[10px] font-medium">可解释、可清除</p>
						<p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
							账本按项目隔离，每条记录可撤销或删除；不保存原视频、字幕全文、API
							Key，也不暗中观察操作。
						</p>
					</div>
				</div>
				<div className="mt-3 grid grid-cols-2 gap-2">
					<Button
						variant="outline"
						className="h-11 xl:h-10"
						disabled={isLoading}
						onClick={() =>
							downloadText({
								content: activeLedger
									? exportCreatorDNAWithDecisionLedgers({
											profile,
											ledgers: [activeLedger],
										})
									: exportCreatorDNA(profile),
								filename: "visioncut-creator-dna.json",
							})
						}
					>
						<Download className="size-4" />
						导出
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								variant="outline"
								className="h-11 xl:h-10"
								disabled={isLoading}
							>
								<Trash2 className="size-4" />
								删除
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>删除 Creator DNA？</AlertDialogTitle>
								<AlertDialogDescription>
									当前浏览器里的创作偏好和确认记录会被永久清除，项目与素材不会受影响。
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel className="min-h-11 xl:min-h-10">
									保留
								</AlertDialogCancel>
								<AlertDialogAction
									className="min-h-11 xl:min-h-10"
									onClick={() => void handleDelete()}
								>
									确认删除
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</section>

			<div className="flex gap-2 px-1 text-[9px] leading-relaxed text-muted-foreground">
				<Sparkles className="mt-0.5 size-3.5 shrink-0" />
				<p>
					偏好会标注来源、样本数和时间衰减，只作为可拒绝的建议；当前项目要求始终优先。
				</p>
			</div>
		</div>
	);
}
