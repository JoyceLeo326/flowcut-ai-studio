import type {
	TAction,
	TActionFunc,
	TActionWithArgs,
	TActionWithOptionalArgs,
	TActionArgsMap,
	TArgOfAction,
	TBoundActionList,
	TInvocationTrigger,
} from "./types";

const boundActions: TBoundActionList = {
	"toggle-play": [],
	"stop-playback": [],
	"seek-forward": [],
	"seek-backward": [],
	"frame-step-forward": [],
	"frame-step-backward": [],
	"jump-forward": [],
	"jump-backward": [],
	"goto-start": [],
	"goto-end": [],
	split: [],
	"split-left": [],
	"split-right": [],
	"delete-selected": [],
	"copy-selected": [],
	"paste-copied": [],
	"toggle-snapping": [],
	"toggle-ripple-editing": [],
	"toggle-source-audio": [],
	"select-all": [],
	"cancel-interaction": [],
	"deselect-all": [],
	"duplicate-selected": [],
	"toggle-elements-muted-selected": [],
	"toggle-elements-visibility-selected": [],
	"toggle-bookmark": [],
	undo: [],
	redo: [],
	"remove-media-asset": [],
	"remove-media-assets": [],
};

export function bindAction<A extends TAction>(
	...[action, handler]: [action: A, handler: TActionFunc<A>]
) {
	const handlers = boundActions[action];
	handlers.push(handler);
}

export function unbindAction<A extends TAction>(
	...[action, handler]: [action: A, handler: TActionFunc<A>]
) {
	const handlers = boundActions[action];
	const handlerIndex = handlers.indexOf(handler);
	if (handlerIndex >= 0) {
		handlers.splice(handlerIndex, 1);
	}
}

function dispatchAction<A extends TAction>({
	action,
	args,
	trigger,
}: {
	action: A;
	args: TArgOfAction<A>;
	trigger?: TInvocationTrigger;
}): void {
	boundActions[action].forEach((handler) => {
		handler(args, trigger);
	});
}

export function invokeAction(
	...[action, args, trigger]: [
		action: TActionWithOptionalArgs,
		args?: undefined,
		trigger?: TInvocationTrigger,
	]
): void;
export function invokeAction<A extends TActionWithArgs>(
	...[action, args, trigger]: [
		action: A,
		args: TActionArgsMap[A],
		trigger?: TInvocationTrigger,
	]
): void;
export function invokeAction(
	...[action, args, trigger]: [
		action: TAction,
		args?: TArgOfAction<TAction>,
		trigger?: TInvocationTrigger,
	]
): void {
	dispatchAction({
		action,
		args,
		trigger,
	});
}
