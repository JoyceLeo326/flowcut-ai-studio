import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
	getCachedFontAtlas,
	loadFontAtlas,
	clearFontAtlasCache,
} from "@/fonts/google-fonts";
import type { FontAtlas } from "@/fonts/types";
import { SYSTEM_FONTS } from "@/fonts/system-fonts";

type Status = "idle" | "loading" | "error";

interface FontAtlasState {
	atlas: FontAtlas | null;
	status: Status;
}

export function useFontAtlas({ open }: { open: boolean }) {
	const [state, setState] = useState<FontAtlasState>(() => {
		const atlas = getCachedFontAtlas();
		return {
			atlas,
			status: atlas ? "idle" : "loading",
		};
	});
	const requestIdRef = useRef(0);
	const { atlas, status } = state;

	useEffect(() => {
		if (!open || atlas) return;

		const requestId = ++requestIdRef.current;
		void loadFontAtlas().then((data) => {
			if (requestIdRef.current !== requestId) {
				return;
			}

			if (data) {
				setState({ atlas: data, status: "idle" });
			} else {
				setState({ atlas: null, status: "error" });
			}
		});

		return () => {
			if (requestIdRef.current === requestId) {
				requestIdRef.current += 1;
			}
		};
	}, [open, atlas]);

	const retry = useCallback(() => {
		clearFontAtlasCache();
		const requestId = ++requestIdRef.current;
		setState((current) => ({ ...current, status: "loading" }));
		void loadFontAtlas().then((data) => {
			if (requestIdRef.current !== requestId) {
				return;
			}

			if (data) {
				setState({ atlas: data, status: "idle" });
			} else {
				setState({ atlas: null, status: "error" });
			}
		});
	}, []);

	const fontNames = useMemo(() => {
		if (!atlas) return [];
		return [...Object.keys(atlas.fonts), ...SYSTEM_FONTS].sort();
	}, [atlas]);

	return { atlas, status, fontNames, retry };
}
