"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type SetStateAction,
} from "react";
import { SelectionBox } from "@/selection/selection-box";
import { SelectionContext } from "@/selection/context";
import { SELECTABLE_ITEM_ATTRIBUTE } from "@/selection/attributes";
import { resolveElementIntersections } from "@/selection/hit-testing";
import {
	applyBoxSelection,
	clearSelection,
	isSelected as getIsSelected,
	pruneSelection,
	replaceSelection,
	selectRange,
	toggleSelection,
} from "@/selection/state";
import type { SelectableSurfaceProps, SelectionState } from "@/selection/types";
import { useBoxSelect } from "@/selection/hooks/use-box-select";
import { cn } from "@/utils/ui";

export function SelectableSurface({
	orderedIds,
	children,
	className,
	ariaLabel = "Selectable items",
	revealId = null,
	onRevealComplete,
	onSelectionChange,
}: SelectableSurfaceProps) {
	const [selectionModel, setSelectionModel] = useState<{
		orderedIds: string[];
		state: SelectionState;
	}>(() => ({
		orderedIds,
		state: clearSelection(),
	}));
	const containerRef = useRef<HTMLDivElement>(null);
	const itemElementsRef = useRef<Map<string, HTMLElement>>(new Map());

	const hasSameOrderedIds =
		selectionModel.orderedIds.length === orderedIds.length &&
		selectionModel.orderedIds.every((id, index) => id === orderedIds[index]);
	if (!hasSameOrderedIds) {
		setSelectionModel({
			orderedIds,
			state: pruneSelection({
				state: selectionModel.state,
				orderedIds,
			}),
		});
	}

	const selectionState = selectionModel.state;
	const setSelectionState = useCallback(
		(update: SetStateAction<SelectionState>) => {
			setSelectionModel((model) => {
				const currentState = pruneSelection({
					state: model.state,
					orderedIds,
				});
				const nextState =
					typeof update === "function" ? update(currentState) : update;

				return {
					orderedIds,
					state: nextState,
				};
			});
		},
		[orderedIds],
	);

	const registerItem = useCallback(
		(id: string, element: HTMLElement | null) => {
			if (element) {
				itemElementsRef.current.set(id, element);
			} else {
				itemElementsRef.current.delete(id);
			}
		},
		[],
	);

	const getSelectableElements = useCallback(() => {
		return itemElementsRef.current;
	}, []);

	const getItemElement = useCallback((id: string) => {
		return itemElementsRef.current.get(id) ?? null;
	}, []);
	const shouldStartSelection = useCallback(
		(event: React.MouseEvent<Element>) => {
			return !(
				event.target instanceof Element &&
				event.target.closest(`[${SELECTABLE_ITEM_ATTRIBUTE}='true']`)
			);
		},
		[],
	);
	const resolveIntersections = useCallback(
		({
			startPos,
			currentPos,
		}: {
			startPos: { x: number; y: number };
			currentPos: { x: number; y: number };
		}) => {
			return resolveElementIntersections({
				startPos,
				currentPos,
				elements: getSelectableElements(),
			});
		},
		[getSelectableElements],
	);

	const clearSelectionState = useCallback(() => {
		setSelectionState(clearSelection());
	}, [setSelectionState]);

	const selectedIdSet = useMemo(
		() => new Set(selectionState.selectedIds),
		[selectionState.selectedIds],
	);

	const isSelected = useCallback(
		(id: string) => selectedIdSet.has(id),
		[selectedIdSet],
	);

	const handleItemClick = useCallback(
		({
			event,
			id,
		}: {
			event:
				| React.MouseEvent<HTMLDivElement>
				| React.KeyboardEvent<HTMLDivElement>;
			id: string;
		}) => {
			setSelectionState((state) => {
				const isToggleSelection = event.ctrlKey || event.metaKey;

				if (event.shiftKey) {
					return selectRange({
						state,
						orderedIds,
						targetId: id,
						isAdditive: isToggleSelection,
					});
				}

				if (isToggleSelection) {
					return toggleSelection({
						state,
						id,
					});
				}

				return replaceSelection({
					ids: [id],
					anchorId: id,
				});
			});
		},
		[orderedIds, setSelectionState],
	);

	const selectUnselectedItem = useCallback((id: string) => {
		setSelectionState((state) => {
			if (getIsSelected({ state, id })) {
				return state;
			}

			return replaceSelection({ ids: [id], anchorId: id });
		});
	}, [setSelectionState]);

	const handleItemMouseDown = useCallback(
		({
			event,
			id,
		}: {
			event: React.MouseEvent<HTMLDivElement>;
			id: string;
		}) => {
			if (event.button !== 2) {
				return;
			}

			selectUnselectedItem(id);
		},
		[selectUnselectedItem],
	);

	const handleBoxSelectionChange = useCallback(
		(change: Parameters<typeof applyBoxSelection>[0]) => {
			setSelectionState(applyBoxSelection(change));
		},
		[setSelectionState],
	);

	const { selectionBox, handleMouseDown, isSelecting, shouldIgnoreClick } =
		useBoxSelect({
			containerRef,
			resolveIntersections,
			selectedIds: selectionState.selectedIds,
			anchorId: selectionState.anchorId,
			onSelectionChange: handleBoxSelectionChange,
			shouldStartSelection,
		});

	const handleBackgroundClick = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			const clickedSelectableItem =
				event.target instanceof Element &&
				event.target.closest(`[${SELECTABLE_ITEM_ATTRIBUTE}='true']`);
			const isIgnoringClick = shouldIgnoreClick();
			if (clickedSelectableItem || isIgnoringClick) {
				return;
			}

			clearSelectionState();
		},
		[clearSelectionState, shouldIgnoreClick],
	);

	const handleBackgroundKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (event.target !== event.currentTarget) {
				return;
			}

			if (
				event.key !== "Enter" &&
				event.key !== " " &&
				event.key !== "Escape"
			) {
				return;
			}

			event.preventDefault();
			clearSelectionState();
		},
		[clearSelectionState],
	);

	useEffect(() => {
		onSelectionChange?.(selectionState);
	}, [onSelectionChange, selectionState]);

	useEffect(() => {
		if (!revealId) {
			return;
		}

		getItemElement(revealId)?.scrollIntoView({ block: "center" });

		const timer = setTimeout(() => {
			onRevealComplete?.();
		}, 1500);

		return () => clearTimeout(timer);
	}, [getItemElement, onRevealComplete, revealId]);

	const isBoxSelecting = isSelecting;
	const highlightedId = revealId;

	const contextValue = useMemo(() => {
		return {
			selectedIds: selectionState.selectedIds,
			anchorId: selectionState.anchorId,
			highlightedId,
			isBoxSelecting,
			isSelected,
			clearSelection: clearSelectionState,
			handleItemClick,
			handleItemMouseDown,
			registerItem,
		};
	}, [
		clearSelectionState,
		handleItemClick,
		handleItemMouseDown,
		highlightedId,
		isBoxSelecting,
		isSelected,
		registerItem,
		selectionState.anchorId,
		selectionState.selectedIds,
	]);

	return (
		<SelectionContext.Provider value={contextValue}>
			<div
				ref={containerRef}
				className={cn("relative min-h-full", className)}
				role="listbox"
				aria-label={ariaLabel}
				aria-multiselectable="true"
				tabIndex={0}
				onMouseDown={handleMouseDown}
				onClick={handleBackgroundClick}
				onKeyDown={handleBackgroundKeyDown}
			>
				{children}
				<SelectionBox bounds={selectionBox?.bounds ?? null} />
			</div>
		</SelectionContext.Provider>
	);
}
