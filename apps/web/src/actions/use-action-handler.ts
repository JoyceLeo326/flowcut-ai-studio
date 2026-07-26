import { useCallback, useEffect, useRef } from "react";
import type {
	TAction,
	TActionFunc,
	TActionHandlerOptions,
	TArgOfAction,
	TInvocationTrigger,
} from "@/actions";
import { bindAction, unbindAction } from "@/actions";

export function useActionHandler<A extends TAction>(
	...[action, handler, isActive]: [
		action: A,
		handler: TActionFunc<A>,
		isActive: TActionHandlerOptions,
	]
) {
	const handlerRef = useRef<TActionFunc<A>>(handler);
	const isBoundRef = useRef(false);

	useEffect(() => {
		handlerRef.current = handler;
	}, [handler]);

	const stableHandler = useCallback<TActionFunc<A>>(
		(arg: TArgOfAction<A>, trigger?: TInvocationTrigger) => {
			handlerRef.current(arg, trigger);
		},
		[],
	);

	useEffect(() => {
		const shouldBind =
			isActive === undefined ||
			(typeof isActive === "boolean" ? isActive : isActive.current);

		if (shouldBind && !isBoundRef.current) {
			bindAction(action, stableHandler);
			isBoundRef.current = true;
		} else if (!shouldBind && isBoundRef.current) {
			unbindAction(action, stableHandler);
			isBoundRef.current = false;
		}

		return () => {
			unbindAction(action, stableHandler);
			isBoundRef.current = false;
		};
	}, [action, stableHandler, isActive]);
}
