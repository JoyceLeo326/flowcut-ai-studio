"use client";

import {
	ArrowRightIcon,
	CheckCircle2,
	Film,
	HardDrive,
	Shuffle,
	WandSparkles,
} from "lucide-react";
import { useState } from "react";
import { useLocalStorage } from "@/services/storage/use-local-storage";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "../ui/dialog";

const STEPS = [
	{
		title: "把素材拖进来就能开始",
		description:
			"先导入几个大视频片段、音频或图片。素材和项目默认保存在当前浏览器，本地剪辑不会自动上传。",
		icon: HardDrive,
		tips: ["切到素材页导入", "支持先粗放素材", "没有素材时只显示导入建议"],
	},
	{
		title: "AI 先设计方案，不直接乱改",
		description:
			"点击 AI 识别后，它会先给出目标平台、画幅、节奏、执行步骤和风险提示，你确认后再应用到时间线。",
		icon: WandSparkles,
		tips: ["不会写提示词可用推荐目标", "方案可先查看", "本地步骤可以撤销"],
	},
	{
		title: "需要字幕和语义再交给 ChatCut",
		description:
			"停顿检测、字幕转录、语义高光会生成 ChatCut 交接包。只有你确认复制或下载后，才继续云端识别流程。",
		icon: Shuffle,
		tips: ["本地和云端分开", "交接前可审查", "适合长视频精选"],
	},
	{
		title: "预览满意后再导出",
		description:
			"执行后先看预览，检查主体是否被裁切、字幕是否需要补、节奏是否太快，再从右上角导出成片。",
		icon: Film,
		tips: ["手机平板可用底部 Tab", "长时间线建议横屏", "导出大视频时保持浏览器前台"],
	},
] as const;

export function Onboarding() {
	const [step, setStep] = useState(0);
	const [hasSeenOnboarding, setHasSeenOnboarding] = useLocalStorage({
		key: "flowcut-has-seen-onboarding",
		defaultValue: false,
	});
	const current = STEPS[step] ?? STEPS[0];
	const Icon = current.icon;
	const isLast = step === STEPS.length - 1;

	const handleNext = () => {
		if (isLast) {
			setHasSeenOnboarding({ value: true });
			return;
		}
		setStep((value) => value + 1);
	};

	return (
		<Dialog
			open={!hasSeenOnboarding}
			onOpenChange={() => setHasSeenOnboarding({ value: true })}
		>
			<DialogContent className="sm:max-w-[460px]">
				<DialogTitle>
					<span className="sr-only">{current.title}</span>
				</DialogTitle>
				<DialogBody>
					<div className="space-y-5">
						<div className="flex items-start gap-3">
							<div className="flowcut-ai-pulse flex size-11 shrink-0 items-center justify-center rounded-md border bg-accent/40">
								<Icon className="size-5 text-primary" />
							</div>
							<div className="min-w-0">
								<h2 className="text-lg font-semibold">{current.title}</h2>
								<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
									{current.description}
								</p>
							</div>
						</div>
						<div className="grid gap-2">
							{current.tips.map((tip) => (
								<div
									key={tip}
									className="flex items-center gap-2 rounded-md border bg-muted/25 px-2 py-1.5 text-xs text-muted-foreground"
								>
									<CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
									<span>{tip}</span>
								</div>
							))}
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								{step + 1} / {STEPS.length}
							</span>
							<Button onClick={handleNext}>
								{isLast ? "进入 AI 剪辑台" : "下一步"}
								<ArrowRightIcon className="size-4" />
							</Button>
						</div>
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
