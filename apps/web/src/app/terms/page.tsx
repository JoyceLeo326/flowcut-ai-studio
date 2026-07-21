import type { Metadata } from "next";
import Link from "next/link";
import { Clapperboard } from "lucide-react";

export const metadata: Metadata = {
	title: "使用条款 - VisionCut AI",
	description: "VisionCut AI 的使用、第三方服务和开源许可边界。",
};

export default function TermsPage() {
	return (
		<div className="min-h-screen bg-background">
			<header className="border-b">
				<div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-6">
					<Link href="/projects" className="flex items-center gap-2 font-semibold">
						<Clapperboard className="size-4 text-primary" />
						VisionCut AI
					</Link>
					<Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
						返回项目
					</Link>
				</div>
			</header>
			<main className="mx-auto max-w-3xl space-y-10 px-6 py-12">
				<div className="space-y-3">
					<h1 className="text-3xl font-semibold">使用条款</h1>
					<p className="leading-relaxed text-muted-foreground">
						VisionCut AI 是实验性的意图驱动视频创造系统。使用它即表示接受以下边界。
					</p>
				</div>

				<TermsSection title="内容权利">
					用户保留其导入素材、项目和导出视频的全部权利，并负责确保有权使用相关内容。
				</TermsSection>
				<TermsSection title="本地数据">
					项目主要保存在浏览器中。用户应自行备份重要成片；清除站点数据、磁盘空间不足或浏览器故障可能造成项目丢失。
				</TermsSection>
				<TermsSection title="ChatCut 与第三方服务">
					ChatCut 是可选的外部服务，不属于本仓库。使用其转录、生成、云端编辑或导出功能时，用户同时受 ChatCut 的账户、隐私、内容和积分规则约束。
				</TermsSection>
				<TermsSection title="开源许可">
					VisionCut AI 代码按 MIT License 提供，并保留 OpenCut 的 MIT 许可和署名。第三方依赖继续适用各自许可证；本项目不授予 ChatCut 商标或服务的任何权利。
				</TermsSection>
				<TermsSection title="无担保">
					软件按“现状”提供，不保证不间断、无错误或适合特定用途。在法律允许的范围内，维护者不对数据丢失、内容问题或第三方服务费用承担责任。
				</TermsSection>

				<p className="border-t pt-6 text-sm text-muted-foreground">最后更新：2026-07-18</p>
			</main>
		</div>
	);
}

function TermsSection({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="space-y-3">
			<h2 className="text-lg font-semibold">{title}</h2>
			<p className="text-sm leading-7 text-muted-foreground">{children}</p>
		</section>
	);
}
