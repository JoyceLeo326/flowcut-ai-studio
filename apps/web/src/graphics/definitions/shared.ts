import type { ParamDefinition } from "@/params";

export type GraphicStrokeAlign = "inside" | "center" | "outside";

export function resolveGraphicStrokeAlign(value: unknown): GraphicStrokeAlign {
	if (value === "inside" || value === "outside") {
		return value;
	}
	return "center";
}

export const STROKE_ALIGN_PARAM: ParamDefinition<"strokeAlign"> = {
	key: "strokeAlign",
	label: "Stroke align",
	type: "select",
	default: "center",
	group: "stroke",
	options: [
		{ value: "inside", label: "Inside" },
		{ value: "center", label: "Center" },
		{ value: "outside", label: "Outside" },
	],
};
