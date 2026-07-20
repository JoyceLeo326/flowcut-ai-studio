"use client";

import { ArrowRightIcon, HardDrive, Shuffle, WandSparkles } from "lucide-react";
import { useState } from "react";
import { useLocalStorage } from "@/services/storage/use-local-storage";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "../ui/dialog";

const STEPS = [
	{
		title: "欢迎使用 FlowCut AI Studio",
		description:
			"素材、时间线和项目默认保存在当前浏览器，本地剪辑不会自动上传。",
		icon: HardDrive,
	},
	{
		title: "先审阅，再执行",
		description:
			"AI 会先生成逐项剪辑方案。本地步骤作为一次操作执行，可以直接撤销。",
		icon: WandSparkles,
	},
	{
		title: "按需交给 ChatCut",
		description:
			"字幕、静音检测和语义精选会生成交接包，只有你确认后才继续云端处理。",
		icon: Shuffle,
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
			<DialogContent className="sm:max-w-[425px]">
				<DialogTitle>
					<span className="sr-only">{current.title}</span>
				</DialogTitle>
				<DialogBody>
					<div className="space-y-5">
						<div className="flex size-10 items-center justify-center rounded-md border bg-accent/40">
							<Icon className="size-5 text-primary" />
						</div>
						<div className="space-y-2">
							<h2 className="text-lg font-semibold">{current.title}</h2>
							<p className="text-sm leading-relaxed text-muted-foreground">
								{current.description}
							</p>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-xs text-muted-foreground">
								{step + 1} / {STEPS.length}
							</span>
							<Button onClick={handleNext}>
								{isLast ? "进入工作区" : "下一步"}
								<ArrowRightIcon className="size-4" />
							</Button>
						</div>
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
