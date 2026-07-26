export const STICKER_CATEGORIES = {
	all: "All",
	// v0.4.0
	// logos: "Logos",
	flags: "Flags",
	shapes: "Shapes",
};

export function isStickerCategory(
	value: unknown,
): value is keyof typeof STICKER_CATEGORIES {
	return (
		typeof value === "string" &&
		Object.prototype.hasOwnProperty.call(STICKER_CATEGORIES, value)
	);
}
