"use client";

import { useParams } from "next/navigation";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { AssetsPanel } from "@/components/editor/panels/assets";
import { InspectorPanel } from "@/components/editor/panels/inspector";
import { Timeline } from "@/timeline/components";
import { PreviewPanel } from "@/preview/components";
import { EditorHeader } from "@/components/editor/editor-header";
import { EditorProvider } from "@/components/providers/editor-provider";
import { Onboarding } from "@/components/editor/onboarding";
import { MigrationDialog } from "@/project/components/migration-dialog";
import { usePanelStore } from "@/editor/panel-store";
import { usePasteMedia } from "@/media/use-paste-media";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useEditor } from "@/editor/use-editor";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChangelogNotification } from "@/changelog/components/changelog-notification";
import {
	createPreviewOverlayControl,
	isPreviewOverlayVisible,
	mergePreviewOverlaySources,
	type PreviewOverlayControl,
	type PreviewOverlayInstance,
} from "@/preview/overlays";
import { usePreviewStore } from "@/preview/preview-store";
import { getGuidePreviewOverlaySource } from "@/guides";
import {
	bookmarkNotesPreviewOverlay,
	getBookmarkPreviewOverlaySource,
} from "@/timeline/bookmarks/index";
import {
	FolderOpen,
	MonitorPlay,
	Sparkles,
	StretchHorizontal,
} from "lucide-react";
import {
	OPEN_TOUCH_EDITOR_TAB_EVENT,
	type TouchEditorTab,
} from "@/editor/navigation-events";

const TOUCH_LAYOUT_QUERY =
	"(max-width: 1199px), (pointer: coarse) and (max-width: 1366px)";

function getTouchLayoutSnapshot() {
	if (typeof window === "undefined") return false;
	return window.matchMedia(TOUCH_LAYOUT_QUERY).matches;
}

function subscribeTouchLayout(onStoreChange: () => void) {
	if (typeof window === "undefined") return () => {};
	const mediaQuery = window.matchMedia(TOUCH_LAYOUT_QUERY);
	mediaQuery.addEventListener("change", onStoreChange);
	return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function useTouchEditorLayout() {
	return useSyncExternalStore(
		subscribeTouchLayout,
		getTouchLayoutSnapshot,
		() => false,
	);
}

function isTouchEditorTab(value: unknown): value is TouchEditorTab {
	switch (value) {
		case "ai":
		case "assets":
		case "preview":
		case "timeline":
			return true;
		default:
			return false;
	}
}

export default function Editor() {
	const params = useParams();
	const projectParam = params.project_id;
	const projectId = Array.isArray(projectParam)
		? projectParam[0]
		: projectParam;

	if (!projectId) return null;

	return (
		<EditorProvider projectId={projectId}>
			<div className="bg-background flex h-screen w-screen flex-col overflow-hidden">
				<DegradedRendererBanner />
				<EditorHeader />
				<div className="min-h-0 min-w-0 flex-1">
					<EditorLayout />
				</div>
				<Onboarding />
				<MigrationDialog />
				<ChangelogNotification />
			</div>
		</EditorProvider>
	);
}

function DegradedRendererBanner() {
	const isDegraded = useEditor((e) => e.renderer.isDegraded);
	const [dismissed, setDismissed] = useState(false);
	if (!isDegraded || dismissed) return null;

	return (
		<div className="flex h-9 items-center justify-center gap-2 border-b bg-accent text-xs text-muted-foreground">
			<span>为获得完整的视频预览性能，建议使用 Chrome 打开 VisionCut。</span>
			<Button
				variant="text"
				size="icon"
				className="w-auto p-0 [&_svg]:size-3.5"
				onClick={() => setDismissed(true)}
				aria-label="关闭提示"
			>
				<HugeiconsIcon icon={Cancel01Icon} />
			</Button>
		</div>
	);
}

function EditorLayout() {
	usePasteMedia();
	const isTouchLayout = useTouchEditorLayout();
	const { panels, setPanel } = usePanelStore();
	const activeScene = useEditor((editor) =>
		editor.scenes.getActiveSceneOrNull(),
	);
	const currentTime = useEditor((editor) => editor.playback.getCurrentTime());
	const activeGuide = usePreviewStore((state) => state.activeGuide);
	const overlays = usePreviewStore((state) => state.overlays);
	const setOverlayVisibility = usePreviewStore(
		(state) => state.setOverlayVisibility,
	);
	const showBookmarkNotes = isPreviewOverlayVisible({
		overlay: bookmarkNotesPreviewOverlay,
		overlays,
	});

	const overlaySource = useMemo(
		() =>
			mergePreviewOverlaySources({
				sources: [
					getGuidePreviewOverlaySource({
						guideId: activeGuide,
					}),
					activeScene
						? getBookmarkPreviewOverlaySource({
								bookmarks: activeScene.bookmarks,
								time: currentTime,
								isVisible: showBookmarkNotes,
							})
						: {
								definitions: [bookmarkNotesPreviewOverlay],
								instances: [],
							},
				],
			}),
		[activeGuide, activeScene, currentTime, showBookmarkNotes],
	);

	const overlayControls = useMemo(
		() =>
			overlaySource.definitions.map((overlay) =>
				createPreviewOverlayControl({ overlay, overlays }),
			),
		[overlaySource.definitions, overlays],
	);
	const horizontalPanelSizes = useMemo(() => {
		const total = panels.tools + panels.preview + panels.properties;
		if (total <= 0) return { tools: 25, preview: 50, properties: 25 };
		return {
			tools: (panels.tools / total) * 100,
			preview: (panels.preview / total) * 100,
			properties: (panels.properties / total) * 100,
		};
	}, [panels.preview, panels.properties, panels.tools]);

	if (isTouchLayout) {
		return (
			<TouchEditorLayout
				overlayControls={overlayControls}
				overlayInstances={overlaySource.instances}
				onOverlayVisibilityChange={setOverlayVisibility}
			/>
		);
	}

	return (
		<ResizablePanelGroup
			direction="vertical"
			className="size-full gap-[0.18rem]"
			onLayout={(sizes) => {
				setPanel({
					panel: "mainContent",
					size: sizes[0] ?? panels.mainContent,
				});
				setPanel({
					panel: "timeline",
					size: sizes[1] ?? panels.timeline,
				});
			}}
		>
			<ResizablePanel
				defaultSize={panels.mainContent}
				minSize={30}
				maxSize={85}
				className="min-h-0"
			>
				<ResizablePanelGroup
					direction="horizontal"
					className="size-full gap-[0.19rem] px-3"
					onLayout={(sizes) => {
						setPanel({ panel: "tools", size: sizes[0] ?? panels.tools });
						setPanel({ panel: "preview", size: sizes[1] ?? panels.preview });
						setPanel({
							panel: "properties",
							size: sizes[2] ?? panels.properties,
						});
					}}
				>
					<ResizablePanel
						defaultSize={horizontalPanelSizes.tools}
						minSize={22}
						maxSize={45}
						className="min-w-0"
					>
						<InspectorPanel />
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={horizontalPanelSizes.preview}
						minSize={30}
						className="min-h-0 min-w-0 flex-1"
					>
						<PreviewPanel
							overlayControls={overlayControls}
							overlayInstances={overlaySource.instances}
							onOverlayVisibilityChange={setOverlayVisibility}
						/>
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={horizontalPanelSizes.properties}
						minSize={16}
						maxSize={35}
						className="min-w-0"
					>
						<AssetsPanel />
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>

			<ResizableHandle withHandle />

			<ResizablePanel
				defaultSize={panels.timeline}
				minSize={15}
				maxSize={70}
				className="min-h-0 px-3 pb-3"
			>
				<Timeline />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

function TouchEditorLayout({
	overlayControls,
	overlayInstances,
	onOverlayVisibilityChange,
}: {
	overlayControls: PreviewOverlayControl[];
	overlayInstances: PreviewOverlayInstance[];
	onOverlayVisibilityChange: (params: {
		overlayId: string;
		isVisible: boolean;
	}) => void;
}) {
	const [activeTab, setActiveTab] = useState<TouchEditorTab>("ai");
	const [mountedTabs, setMountedTabs] = useState<ReadonlySet<TouchEditorTab>>(
		() => new Set(["ai"]),
	);

	useEffect(() => {
		const handleOpenTab = (event: Event) => {
			const nextTab: unknown = Reflect.get(event, "detail");
			if (isTouchEditorTab(nextTab)) {
				setActiveTab(nextTab);
				setMountedTabs((current) =>
					current.has(nextTab) ? current : new Set(current).add(nextTab),
				);
			}
		};
		window.addEventListener(OPEN_TOUCH_EDITOR_TAB_EVENT, handleOpenTab);
		return () =>
			window.removeEventListener(OPEN_TOUCH_EDITOR_TAB_EVENT, handleOpenTab);
	}, []);

	const tabs = [
		{ id: "ai", label: "AI", icon: Sparkles },
		{ id: "assets", label: "素材", icon: FolderOpen },
		{ id: "preview", label: "预览", icon: MonitorPlay },
		{ id: "timeline", label: "时间线", icon: StretchHorizontal },
	] as const;

	return (
		<Tabs
			value={activeTab}
			onValueChange={(value) => {
				if (isTouchEditorTab(value)) {
					setActiveTab(value);
					setMountedTabs((current) =>
						current.has(value) ? current : new Set(current).add(value),
					);
				}
			}}
			className="flowcut-touch-shell flex size-full min-h-0 flex-col overflow-hidden px-2 pb-2"
		>
			<div className="min-h-0 flex-1 overflow-hidden">
				{mountedTabs.has("assets") ? (
					<TabsContent
						value="assets"
						forceMount
						className="m-0 size-full p-0 data-[state=inactive]:hidden"
					>
						<AssetsPanel />
					</TabsContent>
				) : null}
				{mountedTabs.has("preview") ? (
					<TabsContent
						value="preview"
						forceMount
						className="m-0 size-full p-0 data-[state=inactive]:hidden"
					>
						<PreviewPanel
							overlayControls={overlayControls}
							overlayInstances={overlayInstances}
							onOverlayVisibilityChange={onOverlayVisibilityChange}
						/>
					</TabsContent>
				) : null}
				{mountedTabs.has("ai") ? (
					<TabsContent
						value="ai"
						forceMount
						className="m-0 size-full p-0 data-[state=inactive]:hidden"
					>
						<InspectorPanel />
					</TabsContent>
				) : null}
				{mountedTabs.has("timeline") ? (
					<TabsContent
						value="timeline"
						forceMount
						className="m-0 size-full p-0 data-[state=inactive]:hidden"
					>
						<Timeline />
					</TabsContent>
				) : null}
			</div>
			<TabsList className="flowcut-touch-tabs mt-2 grid h-14 shrink-0 grid-cols-4 rounded-[8px] border p-1">
				{tabs.map((tab) => {
					const Icon = tab.icon;
					return (
						<TabsTrigger
							key={tab.id}
							value={tab.id}
							className="flowcut-touch-tab h-full flex-col gap-0.5 rounded-[6px] px-1 py-1 text-[11px] transition data-[state=active]:border-border data-[state=active]:bg-accent data-[state=active]:text-foreground"
						>
							<Icon className="size-4" />
							{tab.label}
						</TabsTrigger>
					);
				})}
			</TabsList>
		</Tabs>
	);
}
