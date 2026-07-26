import { useSyncExternalStore } from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onStoreChange: () => void): () => void {
	const mediaQuery = window.matchMedia(MOBILE_QUERY);
	mediaQuery.addEventListener("change", onStoreChange);
	return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
	return window.matchMedia(MOBILE_QUERY).matches;
}

function getServerSnapshot(): boolean {
	return false;
}

export function useIsMobile(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
