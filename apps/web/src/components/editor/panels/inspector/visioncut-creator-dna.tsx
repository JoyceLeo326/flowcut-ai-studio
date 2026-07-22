"use client";

import {
	BrainCircuit,
	Download,
	Fingerprint,
	HardDrive,
	PauseCircle,
	ShieldCheck,
	Sparkles,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
	CREATOR_DNA_UPDATED_EVENT,
	createEmptyCreatorDNA,
	deleteCreatorDNA,
	exportCreatorDNA,
	loadCreatorDNA,
	overrideCreatorPreference,
	saveCreatorDNA,
	setCreatorDNAEnabled,
	type CreatorAudioPriority,
	type CreatorCaptionDensity,
	type CreatorDNAProfile,
	type CreatorDNAPreferences,
	type CreatorPreferenceSignal,
	type CreatorRhythm,
} from "@/ai-studio/creator-dna";
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
				<div className="w-16 shrink-0 text-right">
					<p className="font-mono text-[9px] text-muted-foreground">
						{Math.round(signal.confidence * 100)}%
					</p>
					<div className="mt-1 h-1 overflow-hidden rounded-[2px] bg-muted">
						<div
							className="h-full bg-emerald-500"
							style={{ width: `${signal.confidence * 100}%` }}
						/>
					</div>
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
							"min-h-9 rounded-[5px] px-1 text-[9px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45",
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
	const [profile, setProfile] = useState<CreatorDNAProfile>(() =>
		createEmptyCreatorDNA(),
	);
	const [isLoading, setIsLoading] = useState(true);
	const preferenceCount = useMemo(
		() => getPreferenceCount(profile.preferences),
		[profile.preferences],
	);

	useEffect(() => {
		let active = true;
		void loadCreatorDNA()
			.then((stored) => {
				if (active) setProfile(stored);
			})
			.catch(() => {
				if (active) toast.error("无法读取本地 Creator DNA");
			})
			.finally(() => {
				if (active) setIsLoading(false);
			});
		const handleUpdate = () => {
			void loadCreatorDNA().then((stored) => {
				if (active) setProfile(stored);
			});
		};
		window.addEventListener(CREATOR_DNA_UPDATED_EVENT, handleUpdate);
		return () => {
			active = false;
			window.removeEventListener(CREATOR_DNA_UPDATED_EVENT, handleUpdate);
		};
	}, []);

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

	const handleDelete = async () => {
		try {
			await deleteCreatorDNA();
			setProfile(createEmptyCreatorDNA());
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
								: profile.explicitDecisionCount > 0
									? `来自 ${profile.explicitDecisionCount} 次明确确认`
									: "尚未记住任何创作决定"}
						</p>
					</div>
				</div>
				<div className="grid grid-cols-3 divide-x border-t text-center">
					{[
						["确认方案", profile.explicitDecisionCount],
						["稳定偏好", preferenceCount],
						["状态", profile.enabled ? "学习中" : "已暂停"],
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
					{profile.enabled ? (
						<BrainCircuit className="size-4 text-emerald-600" />
					) : (
						<PauseCircle className="size-4 text-muted-foreground" />
					)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="text-[11px] font-medium">个性化学习</p>
					<p className="mt-0.5 text-[9px] text-muted-foreground">
						只从你主动标记“记住这版方向”的方案更新
					</p>
				</div>
				<Switch
					checked={profile.enabled}
					disabled={isLoading}
					onCheckedChange={(enabled) =>
						void persist({
							next: setCreatorDNAEnabled({ profile, enabled }),
							message: enabled ? "个性化学习已开启" : "个性化学习已暂停",
						})
					}
					aria-label="个性化学习"
				/>
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

			<section className="rounded-[8px] border p-3">
				<div className="flex items-start gap-2.5">
					<ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
					<div>
						<p className="text-[10px] font-medium">可解释、可清除</p>
						<p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
							不保存原视频、不训练个人模型权重，也不把偏好发送到服务器。
						</p>
					</div>
				</div>
				<div className="mt-3 grid grid-cols-2 gap-2">
					<Button
						variant="outline"
						className="h-10"
						disabled={isLoading}
						onClick={() =>
							downloadText({
								content: exportCreatorDNA(profile),
								filename: "visioncut-creator-dna.json",
							})
						}
					>
						<Download className="size-4" />
						导出
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="outline" className="h-10" disabled={isLoading}>
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
								<AlertDialogCancel>保留</AlertDialogCancel>
								<AlertDialogAction onClick={() => void handleDelete()}>
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
					下一次生成方案时，已确认偏好会作为建议输入；项目级明确要求始终优先。
				</p>
			</div>
		</div>
	);
}
