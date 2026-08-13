export interface PixelSize {
	readonly width: number;
	readonly height: number;
}

export function hasEquivalentAspectRatio({
	source,
	output,
}: {
	source: PixelSize;
	output: PixelSize;
}): boolean {
	const dimensions = [source.width, source.height, output.width, output.height];
	if (
		dimensions.some((value) => !Number.isFinite(value) || value <= 0)
	) {
		return false;
	}

	const crossProductError = Math.abs(
		source.width * output.height - source.height * output.width,
	);
	const onePixelTolerance = Math.max(...dimensions);
	return crossProductError <= onePixelTolerance;
}
