"use client";

import { Bot, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PropertiesPanel } from "@/components/editor/panels/properties";
import { AIWorkspacePanel } from "./ai-workspace";

export function InspectorPanel() {
	return (
		<Tabs
			defaultValue="ai"
			variant="underline"
			className="flowcut-inspector-shell panel flex h-full flex-col overflow-hidden rounded-[8px] border bg-background"
		>
			<TabsList className="flowcut-inspector-tabs h-11 shrink-0">
				<TabsTrigger value="ai" className="h-11 flex-1 gap-1.5 text-[11px]">
					<Bot className="size-3.5" />
					AI 方案
				</TabsTrigger>
				<TabsTrigger
					value="properties"
					className="h-11 flex-1 gap-1.5 text-[11px]"
				>
					<SlidersHorizontal className="size-3.5" />
					属性
				</TabsTrigger>
			</TabsList>
			<TabsContent
				value="ai"
				forceMount
				className="mt-0 min-h-0 flex-1 overflow-hidden p-0 data-[state=inactive]:hidden"
			>
				<AIWorkspacePanel />
			</TabsContent>
			<TabsContent
				value="properties"
				forceMount
				className="mt-0 min-h-0 flex-1 overflow-hidden p-0 data-[state=inactive]:hidden"
			>
				<PropertiesPanel embedded />
			</TabsContent>
		</Tabs>
	);
}
