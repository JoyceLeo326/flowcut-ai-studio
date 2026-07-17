import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
	title: "隐私说明 - FlowCut AI Studio",
	description: "FlowCut 本地剪辑与 ChatCut 云端交接的数据边界。",
};

export default function PrivacyPage() {
	return (
		<div className="min-h-screen bg-background">
			<header className="border-b">
				<div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
					<Link href="/projects" className="flex items-center gap-2 font-semibold">
						<Clapperboard className="size-4 text-primary" />
						FlowCut AI Studio
					</Link>
					<Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
						返回项目
					</Link>
				</div>
			</header>
			<main className="mx-auto max-w-3xl space-y-10 px-6 py-12">
				<div className="space-y-3">
					<div className="flex items-center gap-2 text-primary">
						<ShieldCheck className="size-5" />
						<span className="text-sm font-medium">Local-first</span>
					</div>
					<h1 className="text-3xl font-semibold">隐私说明</h1>
					<p className="leading-relaxed text-muted-foreground">
						本说明区分 FlowCut 本地编辑与用户主动选择的 ChatCut 云端流程。
					</p>
				</div>

				<LegalSection title="本地项目与素材">
					<p>项目、时间线和导入素材默认存放在当前浏览器的 IndexedDB/OPFS 中。</p>
					<p>FlowCut 只能读取用户通过文件选择器主动选择的文件，不能扫描本地磁盘。</p>
					<p>本地顺排、片段收紧、画幅修改、预览和导出不会自动上传媒体。</p>
				</LegalSection>

				<LegalSection title="ChatCut 云端步骤">
					<p>
						静音检测、语音转录、字幕和语义精选会被标记为 ChatCut 交接步骤。
						生成或复制交接包只包含计划和素材元数据，不会自动上传视频。
					</p>
					<p>
						只有用户在 Codex/ChatCut 中确认并提供文件后，媒体才会传给 ChatCut；
						后续处理受 ChatCut 自己的隐私政策、账户和积分规则约束。
					</p>
				</LegalSection>

				<LegalSection title="托管与日志">
					<p>
						访问公网部署时，托管平台可能像普通网站一样处理 IP、请求时间和错误日志。
						FlowCut 不在页面中加载第三方行为分析脚本，也不把媒体内容写入服务端日志。
					</p>
				</LegalSection>

				<LegalSection title="删除与控制">
					<p>
						可以在项目页删除单个项目，或通过浏览器站点数据设置清除全部本地项目。
						清除浏览器数据后无法由服务器恢复，请先导出重要成片。
					</p>
				</LegalSection>

				<p className="border-t pt-6 text-sm text-muted-foreground">最后更新：2026-07-18</p>
			</main>
		</div>
	);
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="space-y-3">
			<h2 className="text-lg font-semibold">{title}</h2>
			<div className="space-y-2 text-sm leading-7 text-muted-foreground">{children}</div>
		</section>
	);
}
