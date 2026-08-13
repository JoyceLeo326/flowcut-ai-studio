"use client";

import { useEffect, useState } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEditor } from "@/editor/use-editor";

export function HistoryActions() {
	const editor = useEditor();
	const [availability, setAvailability] = useState(() => ({
		canUndo: editor.command.canUndo(),
		canRedo: editor.command.canRedo(),
	}));

	useEffect(() => {
		let queued = false;
		const refresh = () => {
			if (queued) return;
			queued = true;
			queueMicrotask(() => {
				queued = false;
				setAvailability({
					canUndo: editor.command.canUndo(),
					canRedo: editor.command.canRedo(),
				});
			});
		};
		const unsubscribers = [
			editor.timeline.subscribe(refresh),
			editor.scenes.subscribe(refresh),
			editor.project.subscribe(refresh),
		];
		refresh();
		return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
	}, [editor]);

	return (
		<div className="flex items-center gap-1">
			<HistoryButton
				label="Undo"
				disabled={!availability.canUndo}
				onClick={() => editor.command.undo()}
			>
				<Undo2 />
			</HistoryButton>
			<HistoryButton
				label="Redo"
				disabled={!availability.canRedo}
				onClick={() => editor.command.redo()}
			>
				<Redo2 />
			</HistoryButton>
		</div>
	);
}

function HistoryButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-11 xl:size-7"
					aria-label={label}
					disabled={disabled}
					onClick={onClick}
				>
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
