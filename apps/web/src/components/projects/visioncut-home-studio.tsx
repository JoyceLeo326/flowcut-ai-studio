"use client";

import Image from "next/image";
import {
	AlertTriangle,
	ArrowUpRight,
	CheckCircle2,
	Clapperboard,
	Film,
	FileVideo2,
	HardDrive,
	Loader2,
	Mic2,
	PanelTop,
	RefreshCw,
	Sparkles,
	UploadCloud,
	Wand2,
	X,
	XCircle,
	Zap,
	type LucideIcon,
} from "lucide-react";
import {
	useRef,
	useState,
	type DragEvent,
	type FormEvent,
	type ChangeEvent,
} from "react";
import {
	buildCreationMission,
	createDefaultCreationMission,
	CREATION_AUDIENCE_OPTIONS,
	CREATION_PLATFORM_OPTIONS,
	CREATION_PRIORITY_OPTIONS,
	CREATION_ROLE_OPTIONS,
	type CreationMissionResult,
	type CreationMissionSelection,
	parseCreationAudience,
	parseCreationDuration,
	parseCreationPlatform,
	parseCreationPriority,
	parseCreationRole,
} from "@/ai-studio/creation-mission";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
	IMPORT_PREFLIGHT_LIMITS,
	preflightMediaFiles,
	prepareFileForImport,
	type ImportPreflightBatchResult,
	type ImportPreflightFileResult,
} from "@/media/import-preflight";
import { formatStorageBytes } from "@/services/storage/quota";
import { cn } from "@/utils/ui";

const CREATION_STARTERS: Array<{
	id: string;
	label: string;
	intent: string;
	image: string;
	icon: LucideIcon;
	selection: Partial<CreationMissionSelection>;
}> = [
	{
		id: "talking-head",
		label: "口播精剪",
		intent: "把我的长口播清理成自然紧凑、带重点字幕和补镜的成片",
		image: "/flowcut/style-worlds/human-daylight.webp",
		icon: Mic2,
		selection: {
			audience: "通勤静音观看者",
			priority: "信息可复述",
			platform: "xiaohongshu",
			durationSeconds: 60,
		},
	},
	{
		id: "shorts",
		label: "长转短",
		intent: "从长视频中设计 3 个不同开场的竖屏短视频版本",
		image: "/flowcut/style-worlds/electric-noir.webp",
		icon: Zap,
		selection: {
			audience: "第一次认识主人公的人",
			priority: "三秒建立冲突",
			platform: "douyin",
			durationSeconds: 30,
		},
	},
	{
		id: "brand",
		label: "品牌广告",
		intent: "根据产品素材设计一支克制、高级、信息清楚的品牌广告",
		image: "/flowcut/style-worlds/botanical-luxury.webp",
		icon: PanelTop,
		selection: {
			creatorRole: "品牌内容负责人",
			audience: "通勤静音观看者",
			priority: "信息可复述",
			platform: "xiaohongshu",
			durationSeconds: 60,
		},
	},
	{
		id: "story",
		label: "人物故事",
		intent: "把访谈和现场素材重构成有开场、转折和情绪高潮的人物故事",
		image: "/visioncut/generated-library/fisherman-dawn-portrait.webp",
		icon: Film,
		selection: {
			creatorRole: "纪录片导演",
			audience: "关注人物命运的观众",
			priority: "人物情绪完整",
			platform: "bilibili",
			durationSeconds: 180,
		},
	},
	{
		id: "travel",
		label: "旅行纪录",
		intent: "把旅行片段组织成有到达感、人物关系和记忆温度的短纪录片",
		image: "/flowcut/style-worlds/warm-memory.webp",
		icon: Clapperboard,
		selection: {
			creatorRole: "独立创作者",
			audience: "关注人物命运的观众",
			priority: "人物情绪完整",
			platform: "bilibili",
			durationSeconds: 180,
		},
	},
];

export interface VisionCutHomeStudioProps {
	isCreating: boolean;
	onCreate: ({
		mission,
		files,
	}: {
		mission: CreationMissionResult;
		files: File[];
	}) => Promise<void>;
}

function getFileIdentity({ file }: { file: File }): string {
	return [file.name, file.size, file.lastModified, file.type].join("\u0000");
}

function getPrimaryReason({
	result,
}: {
	result: ImportPreflightFileResult<File>;
}) {
	return (
		result.reasons.find((reason) => reason.severity === "error") ??
		result.reasons.find((reason) => reason.severity === "warning") ??
		result.reasons[0]
	);
}

export function VisionCutHomeStudio({
	isCreating,
	onCreate,
}: VisionCutHomeStudioProps) {
	const [intent, setIntent] = useState("");
	const [missionSelection, setMissionSelection] =
		useState<CreationMissionSelection>(() => createDefaultCreationMission());
	const [files, setFiles] = useState<File[]>([]);
	const [preflightResult, setPreflightResult] =
		useState<ImportPreflightBatchResult<File> | null>(null);
	const [confirmedFileIds, setConfirmedFileIds] = useState<Set<string>>(
		() => new Set(),
	);
	const [isPreflighting, setIsPreflighting] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const filesRef = useRef<File[]>([]);
	const preflightRunRef = useRef(0);

	const results = preflightResult?.files ?? [];
	const unconfirmedCount = results.filter(
		(result) =>
			result.status === "needs-confirmation" &&
			!confirmedFileIds.has(result.id),
	).length;
	const rejectedCount = results.filter(
		(result) => result.status === "rejected",
	).length;
	const readyResults = results.filter(
		(result) =>
			result.status === "accepted" ||
			(result.status === "needs-confirmation" &&
				confirmedFileIds.has(result.id)),
	);
	const filesAreReady =
		files.length === 0 ||
		(!isPreflighting &&
			preflightResult !== null &&
			readyResults.length > 0 &&
			unconfirmedCount === 0);

	async function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextIntent = intent.trim();
		if (!nextIntent || isCreating || !filesAreReady) return;
		const importFiles =
			files.length === 0
				? []
				: readyResults.map((result) => prepareFileForImport({ result }));
		await onCreate({
			mission: buildCreationMission({
				intent: nextIntent,
				selection: missionSelection,
			}),
			files: importFiles,
		});
	}

	async function runPreflight({ nextFiles }: { nextFiles: File[] }) {
		const runId = preflightRunRef.current + 1;
		preflightRunRef.current = runId;
		filesRef.current = nextFiles;
		setFiles(nextFiles);
		setPreflightResult(null);
		setConfirmedFileIds(new Set());
		if (nextFiles.length === 0) {
			setIsPreflighting(false);
			return;
		}

		setIsPreflighting(true);
		const nextResult = await preflightMediaFiles({ files: nextFiles });
		if (preflightRunRef.current !== runId) return;
		setPreflightResult(nextResult);
		setIsPreflighting(false);
	}

	function addFiles({ nextFiles }: { nextFiles: File[] }) {
		const existingIds = new Set(
			filesRef.current.map((file) => getFileIdentity({ file })),
		);
		const uniqueFiles = nextFiles.filter((file) => {
			const id = getFileIdentity({ file });
			if (existingIds.has(id)) return false;
			existingIds.add(id);
			return true;
		});
		void runPreflight({
			nextFiles: [...filesRef.current, ...uniqueFiles],
		});
	}

	function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		addFiles({ nextFiles: Array.from(event.target.files ?? []) });
		event.target.value = "";
	}

	function handleDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setIsDragOver(false);
		addFiles({ nextFiles: Array.from(event.dataTransfer.files) });
	}

	function removeFile({ resultId }: { resultId: string }) {
		void runPreflight({
			nextFiles: filesRef.current.filter(
				(file) => getFileIdentity({ file }) !== resultId,
			),
		});
	}

	function toggleConfirmation({
		resultId,
		checked,
	}: {
		resultId: string;
		checked: boolean;
	}) {
		setConfirmedFileIds((current) => {
			const next = new Set(current);
			if (checked) next.add(resultId);
			else next.delete(resultId);
			return next;
		});
	}

	function updateMission<K extends keyof CreationMissionSelection>({
		key,
		value,
	}: {
		key: K;
		value: CreationMissionSelection[K];
	}) {
		setMissionSelection((current) => ({ ...current, [key]: value }));
	}

	const previewMission = buildCreationMission({
		intent: intent.trim() || "把当前素材剪成一支有冲突、有选择、有结果的成片",
		selection: missionSelection,
	});

	return (
		<section className="relative isolate overflow-hidden border-y border-white/10 bg-[#08090a] text-white">
			<Image
				src="/flowcut/style-worlds/electric-noir.webp"
				alt=""
				fill
				loading="eager"
				sizes="100vw"
				className="-z-20 object-cover object-center opacity-40"
			/>
			<div className="absolute inset-0 -z-10 bg-black/70" />

			<div className="mx-auto flex min-h-[520px] max-w-[1480px] flex-col justify-center px-4 py-8 sm:px-8 lg:px-12">
				<div className="max-w-6xl">
					<div className="mb-3 flex items-center gap-2 text-[11px] font-medium text-[#d7ff3f]">
						<Sparkles className="size-4" />
						VISIONCUT CREATIVE BRAIN
					</div>
					<h1 className="max-w-3xl text-[28px] leading-[1.08] font-semibold sm:text-[36px] lg:text-[44px]">
						<span className="block sm:inline">告诉 AI</span>{" "}
						<span>你想让观众感受到什么</span>
					</h1>
					<p className="mt-3 max-w-2xl text-[13px] leading-6 text-white/62 sm:text-[14px]">
						上传可以稍后完成。先定义成片目标，VisionCut
						会把它拆成故事、镜头、声音与交付方案。
					</p>

					<section
						className="mt-5 grid overflow-hidden rounded-[8px] border border-white/14 bg-black/48 lg:grid-cols-[1.35fr_0.65fr]"
						aria-labelledby="creation-mission-title"
					>
						<div className="grid gap-px bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
							<label className="bg-black/55 p-3 text-[10px] text-white/48">
								主创称呼
								<input
									aria-label="主创称呼"
									className="mt-1.5 h-11 w-full rounded-[6px] border border-white/14 bg-white/7 px-3 text-xs text-white outline-none focus:border-[#d7ff3f]"
									maxLength={24}
									value={missionSelection.creatorName}
									onChange={(event) =>
										updateMission({
											key: "creatorName",
											value: event.target.value,
										})
									}
								/>
							</label>
							<label className="bg-black/55 p-3 text-[10px] text-white/48">
								我的角色
								<select
									aria-label="我的角色"
									className="mt-1.5 h-11 w-full rounded-[6px] border border-white/14 bg-[#17191b] px-3 text-xs text-white outline-none focus:border-[#d7ff3f]"
									value={missionSelection.creatorRole}
									onChange={(event) =>
										updateMission({
											key: "creatorRole",
											value: parseCreationRole({ value: event.target.value }),
										})
									}
								>
									{CREATION_ROLE_OPTIONS.map((option) => (
										<option key={option}>{option}</option>
									))}
								</select>
							</label>
							<label className="bg-black/55 p-3 text-[10px] text-white/48">
								目标观众
								<select
									aria-label="目标观众"
									className="mt-1.5 h-11 w-full rounded-[6px] border border-white/14 bg-[#17191b] px-3 text-xs text-white outline-none focus:border-[#d7ff3f]"
									value={missionSelection.audience}
									onChange={(event) =>
										updateMission({
											key: "audience",
											value: parseCreationAudience({
												value: event.target.value,
											}),
										})
									}
								>
									{CREATION_AUDIENCE_OPTIONS.map((option) => (
										<option key={option}>{option}</option>
									))}
								</select>
							</label>
							<label className="bg-black/55 p-3 text-[10px] text-white/48">
								本轮优先
								<select
									aria-label="本轮优先"
									className="mt-1.5 h-11 w-full rounded-[6px] border border-white/14 bg-[#17191b] px-3 text-xs text-white outline-none focus:border-[#d7ff3f]"
									value={missionSelection.priority}
									onChange={(event) =>
										updateMission({
											key: "priority",
											value: parseCreationPriority({
												value: event.target.value,
											}),
										})
									}
								>
									{CREATION_PRIORITY_OPTIONS.map((option) => (
										<option key={option}>{option}</option>
									))}
								</select>
							</label>
							<label className="bg-black/55 p-3 text-[10px] text-white/48">
								平台与画幅
								<select
									aria-label="平台与画幅"
									className="mt-1.5 h-11 w-full rounded-[6px] border border-white/14 bg-[#17191b] px-3 text-xs text-white outline-none focus:border-[#d7ff3f]"
									value={missionSelection.platform}
									onChange={(event) =>
										updateMission({
											key: "platform",
											value: parseCreationPlatform({
												value: event.target.value,
											}),
										})
									}
								>
									{CREATION_PLATFORM_OPTIONS.map((option) => (
										<option key={option.id} value={option.id}>
											{option.label}
										</option>
									))}
								</select>
							</label>
							<div className="grid grid-cols-2 gap-px bg-white/10">
								<label className="bg-black/55 p-3 text-[10px] text-white/48">
									成片时长
									<select
										aria-label="成片时长"
										className="mt-1.5 h-11 w-full rounded-[6px] border border-white/14 bg-[#17191b] px-2 text-xs text-white outline-none focus:border-[#d7ff3f]"
										value={missionSelection.durationSeconds}
										onChange={(event) =>
											updateMission({
												key: "durationSeconds",
												value: parseCreationDuration({
													value: event.target.value,
												}),
											})
										}
									>
										<option value="30">30 秒</option>
										<option value="60">60 秒</option>
										<option value="180">3 分钟</option>
									</select>
								</label>
								<label className="bg-black/55 p-3 text-[10px] text-white/48">
									交付时间
									<input
										aria-label="交付时间"
										className="mt-1.5 h-11 w-full rounded-[6px] border border-white/14 bg-white/7 px-2 text-xs text-white outline-none focus:border-[#d7ff3f]"
										maxLength={32}
										value={missionSelection.deliveryTime}
										onChange={(event) =>
											updateMission({
												key: "deliveryTime",
												value: event.target.value,
											})
										}
									/>
								</label>
							</div>
						</div>
						<div className="bg-[#121416]/92 p-4">
							<h2
								id="creation-mission-title"
								className="text-[10px] font-semibold tracking-[0.18em] text-[#d7ff3f]"
							>
								任务现场
							</h2>
							<p className="mt-2 text-sm font-medium">
								{previewMission.decision.owner} ·{" "}
								{missionSelection.deliveryTime}
							</p>
							<p className="mt-2 text-[10px] leading-5 text-white/55">
								{previewMission.decision.conflict}
							</p>
							<p className="mt-2 border-l-2 border-[#d7ff3f] pl-3 text-[10px] leading-5 text-white/72">
								{previewMission.decision.choice}
							</p>
							<p className="mt-2 text-[10px] leading-5 text-white/45">
								回看 · {previewMission.decision.reviewPrompt}
							</p>
						</div>
					</section>

					<form
						onSubmit={(event) => void submit(event)}
						className="mt-5 overflow-hidden rounded-[8px] border border-white/18 bg-black/55"
					>
						<Textarea
							ref={inputRef}
							value={intent}
							onChange={(event) => setIntent(event.target.value)}
							placeholder="例如：把这次产品发布会做成 60 秒、有明确高潮的品牌短片"
							className="min-h-24 resize-none border-0 bg-transparent p-4 text-[14px] leading-6 text-white shadow-none placeholder:text-white/35 focus-visible:ring-0 sm:min-h-28"
						/>
						<div
							className={cn(
								"flex min-h-14 items-center gap-3 border-t border-white/12 px-3 py-2.5 transition-colors",
								isDragOver && "bg-white/10",
							)}
							onDragEnter={(event) => {
								event.preventDefault();
								setIsDragOver(true);
							}}
							onDragOver={(event) => event.preventDefault()}
							onDragLeave={(event) => {
								const relatedTarget = event.relatedTarget;
								if (
									!(relatedTarget instanceof Node) ||
									!event.currentTarget.contains(relatedTarget)
								) {
									setIsDragOver(false);
								}
							}}
							onDrop={handleDrop}
						>
							<input
								ref={fileInputRef}
								type="file"
								multiple
								accept="video/*,audio/*,image/*"
								className="sr-only"
								onChange={handleFileChange}
							/>
							<Button
								type="button"
								variant="outline"
								className="h-11 border-white/18 bg-white/7 text-white hover:bg-white/12 hover:text-white"
								onClick={() => fileInputRef.current?.click()}
							>
								<UploadCloud className="size-4" />
								选择素材
							</Button>
							<div className="min-w-0 flex-1">
								<p className="truncate text-[11px] font-medium">
									{isPreflighting
										? `正在本地检查 ${files.length} 个文件`
										: files.length > 0
											? `${readyResults.length} 个可导入${
													unconfirmedCount > 0
														? `，${unconfirmedCount} 个待确认`
														: ""
												}${
													rejectedCount > 0 ? `，${rejectedCount} 个未通过` : ""
												}`
											: "把视频片段拖到这里"}
								</p>
								<p className="mt-0.5 truncate text-[9px] text-white/42">
									{files.length > 0
										? "仅在本机读取文件头，不会上传网络"
										: `视频、音频或图片，最多 ${IMPORT_PREFLIGHT_LIMITS.maxFiles} 个`}
								</p>
							</div>
							{files.length > 0 ? (
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-11 shrink-0 text-white/60 hover:bg-white/10 hover:text-white"
									onClick={() => void runPreflight({ nextFiles: [] })}
									title="清空待导入素材"
									aria-label="清空待导入素材"
								>
									<X className="size-4" />
								</Button>
							) : (
								<FileVideo2 className="size-4 shrink-0 text-white/35" />
							)}
						</div>
						{files.length > 0 ? (
							<div
								className="border-t border-white/12"
								aria-live="polite"
								aria-busy={isPreflighting}
							>
								<div className="flex min-h-10 items-center gap-2 px-3 text-[10px] text-white/55">
									<HardDrive className="size-3.5 shrink-0" />
									<span className="min-w-0 flex-1 truncate">
										{preflightResult?.storage.availableBytes !== null &&
										preflightResult?.storage.availableBytes !== undefined
											? `浏览器安全可用空间约 ${formatStorageBytes({
													bytes: preflightResult.storage.availableBytes,
												})}`
											: "浏览器未提供存储配额估算，正式导入时会再次检查"}
									</span>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-11 shrink-0 text-white/65 hover:bg-white/10 hover:text-white"
										onClick={() =>
											void runPreflight({
												nextFiles: filesRef.current,
											})
										}
										disabled={isPreflighting}
										title="重新检查全部文件"
										aria-label="重新检查全部文件"
									>
										<RefreshCw
											className={cn(
												"size-3.5",
												isPreflighting && "animate-spin",
											)}
										/>
									</Button>
								</div>
								{isPreflighting && results.length === 0 ? (
									<div className="flex min-h-14 items-center gap-2 border-t border-white/8 px-3 text-[11px] text-white/60">
										<Loader2 className="size-4 animate-spin" />
										正在核对扩展名、MIME、容器签名和本地空间
									</div>
								) : (
									<ul className="max-h-56 overflow-y-auto border-t border-white/8">
										{results.map((result, resultIndex) => {
											const primaryReason = getPrimaryReason({ result });
											const isConfirmed = confirmedFileIds.has(result.id);
											const confirmationId = `visioncut-import-confirmation-${resultIndex}`;
											const statusLabel =
												result.status === "accepted"
													? "已通过"
													: result.status === "rejected"
														? "未通过"
														: "需确认";
											const StatusIcon =
												result.status === "accepted"
													? CheckCircle2
													: result.status === "rejected"
														? XCircle
														: AlertTriangle;
											return (
												<li
													key={result.id}
													className="flex min-h-16 items-start gap-2 border-b border-white/8 px-3 py-2.5 last:border-b-0"
												>
													<StatusIcon
														className={cn(
															"mt-0.5 size-4 shrink-0",
															result.status === "accepted" &&
																"text-emerald-300",
															result.status === "rejected" && "text-rose-300",
															result.status === "needs-confirmation" &&
																"text-amber-300",
														)}
													/>
													<div className="min-w-0 flex-1">
														<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
															<span className="max-w-full truncate text-[11px] font-medium">
																{result.file.name}
															</span>
															<span className="text-[9px] text-white/42">
																{formatStorageBytes({
																	bytes: result.file.size,
																})}
															</span>
															<span
																className={cn(
																	"text-[9px] font-medium",
																	result.status === "accepted" &&
																		"text-emerald-300",
																	result.status === "rejected" &&
																		"text-rose-300",
																	result.status === "needs-confirmation" &&
																		"text-amber-300",
																)}
															>
																{statusLabel}
															</span>
														</div>
														<p className="mt-1 text-[9px] leading-4 text-white/48">
															{primaryReason?.message}
														</p>
														{result.status === "needs-confirmation" ? (
															<label
																htmlFor={confirmationId}
																className="mt-1.5 inline-flex min-h-11 cursor-pointer items-center gap-2 text-[9px] text-white/72"
															>
																<Checkbox
																	id={confirmationId}
																	checked={isConfirmed}
																	onCheckedChange={(checked) =>
																		toggleConfirmation({
																			resultId: result.id,
																			checked: checked === true,
																		})
																	}
																	aria-label={`确认仍然导入 ${result.file.name}`}
																	className="size-4 border-white/30 bg-black/20"
																/>
																我已了解提示，仍尝试导入
															</label>
														) : null}
													</div>
													{result.status !== "accepted" ? (
														<Button
															type="button"
															variant="ghost"
															size="icon"
															className="size-11 shrink-0 text-white/55 hover:bg-white/10 hover:text-white"
															onClick={() =>
																void runPreflight({
																	nextFiles: filesRef.current,
																})
															}
															title={`重新检查 ${result.file.name}`}
															aria-label={`重新检查 ${result.file.name}`}
														>
															<RefreshCw className="size-3.5" />
														</Button>
													) : null}
													<Button
														type="button"
														variant="ghost"
														size="icon"
														className="size-11 shrink-0 text-white/55 hover:bg-white/10 hover:text-white"
														onClick={() => removeFile({ resultId: result.id })}
														title={`移除 ${result.file.name}`}
														aria-label={`移除 ${result.file.name}`}
													>
														<X className="size-3.5" />
													</Button>
												</li>
											);
										})}
									</ul>
								)}
							</div>
						) : null}
						<div className="flex items-center justify-between gap-3 border-t border-white/12 px-3 py-2.5">
							<span className="hidden text-[10px] text-white/42 sm:block">
								{unconfirmedCount > 0
									? `还有 ${unconfirmedCount} 个文件需要确认或移除`
									: rejectedCount > 0
										? `${rejectedCount} 个未通过文件不会导入，可移除或重新检查`
										: "AI 先生成方案，执行前仍由你确认"}
							</span>
							<Button
								type="submit"
								disabled={
									!intent.trim() ||
									isCreating ||
									isPreflighting ||
									!filesAreReady
								}
								className="ml-auto h-11 bg-[#d7ff3f] px-4 text-black hover:bg-[#c8ef35]"
							>
								{isCreating ? (
									<Loader2 className="size-4 animate-spin" />
								) : (
									<Wand2 className="size-4" />
								)}
								{files.length > 0
									? `创建并导入 ${readyResults.length} 个`
									: "建立创作蓝图"}
							</Button>
						</div>
					</form>
				</div>

				<div className="scrollbar-hidden mt-5 flex gap-2 overflow-x-auto pb-1">
					{CREATION_STARTERS.map((starter) => {
						const Icon = starter.icon;
						const selected = intent === starter.intent;
						return (
							<button
								key={starter.id}
								type="button"
								aria-pressed={selected}
								className={cn(
									"group relative h-20 w-40 shrink-0 overflow-hidden rounded-[7px] border text-left sm:w-44",
									selected
										? "border-[#d7ff3f]"
										: "border-white/14 hover:border-white/35",
								)}
								onClick={() => {
									setIntent(starter.intent);
									setMissionSelection((current) => ({
										...current,
										...starter.selection,
									}));
									inputRef.current?.focus();
								}}
							>
								<Image
									src={starter.image}
									alt=""
									fill
									sizes="176px"
									className="object-cover transition duration-200 group-hover:scale-[1.02]"
								/>
								<span className="absolute inset-0 bg-black/62" />
								<span className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 text-[11px] font-medium">
									<Icon className="size-3.5 text-[#d7ff3f]" />
									{starter.label}
									<ArrowUpRight className="ml-auto size-3 text-white/55" />
								</span>
							</button>
						);
					})}
				</div>
			</div>
		</section>
	);
}
