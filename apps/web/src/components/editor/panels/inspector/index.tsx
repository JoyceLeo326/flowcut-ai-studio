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
			className="panel flex h-full flex-col overflow-hidden rounded-sm border bg-background"
		>
			<TabsList className="h-10 shrink-0">
				<TabsTrigger value="ai" className="h-10 flex-1 gap-1.5 text-xs">
					<Bot className="size-3.5" />
					AI 方案
				</TabsTrigger>
				<TabsTrigger value="properties" className="h-10 flex-1 gap-1.5 text-xs">
					<SlidersHorizontal className="size-3.5" />
					属性
				</TabsTrigger>
			</TabsList>
			<TabsContent
				value="ai"
				forceMount
				className="mt-0 min-h-0 flex-1 overflow-hidden p-0"
			>
				<AIWorkspacePanel />
			</TabsContent>
			<TabsContent
				value="properties"
				forceMount
				className="mt-0 min-h-0 flex-1 overflow-hidden p-0"
			>
				<PropertiesPanel embedded />
			</TabsContent>
		</Tabs>
	);
}
