"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";

interface MobileGateProps {
	children: React.ReactNode;
}

export function MobileGate({ children }: MobileGateProps) {
	const [showHint, setShowHint] = useState(true);

	return (
		<>
			{children}
			{showHint ? (
				<div className="fixed right-3 bottom-20 left-3 z-50 rounded-md border bg-background/95 p-3 shadow-lg backdrop-blur lg:hidden">
					<div className="flex items-start gap-3">
						<p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
							手机和平板会用底部 Tab：先在“素材”导入视频，再回到“AI”生成方案，最后去“预览”和“时间线”检查。长时间线建议横屏，导出大视频时保持浏览器在前台。
						</p>
						<Button
							variant="ghost"
							size="icon"
							className="size-7 shrink-0"
							onClick={() => setShowHint(false)}
							aria-label="关闭移动端提示"
						>
							<X className="size-4" />
						</Button>
					</div>
				</div>
			) : null}
		</>
	);
}
