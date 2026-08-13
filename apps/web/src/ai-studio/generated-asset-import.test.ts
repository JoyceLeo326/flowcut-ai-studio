import { describe, expect, test } from "bun:test";
import { VISIONCUT_AVAILABLE_GENERATED_LIBRARY } from "./generated-library";
import { prepareGeneratedAssetFiles } from "./generated-asset-import";

describe("generated asset import preparation", () => {
	test("deduplicates selections and creates stable local files", async () => {
		const asset = VISIONCUT_AVAILABLE_GENERATED_LIBRARY[0];
		if (!asset) throw new Error("Expected generated asset fixture");
		const result = await prepareGeneratedAssetFiles({
			assets: [asset, asset],
			fetchImpl: async () =>
				new Response(new Uint8Array([1, 2, 3]), {
					headers: { "content-type": "image/webp" },
					status: 200,
				}),
		});

		expect(result.failures).toHaveLength(0);
		expect(result.files).toHaveLength(1);
		expect(result.files[0]?.name).toBe(`${asset.slug}.webp`);
		expect(result.files[0]?.lastModified).toBe(0);
	});

	test("keeps successful files when one asset cannot be loaded", async () => {
		const assets = VISIONCUT_AVAILABLE_GENERATED_LIBRARY.slice(0, 2);
		const result = await prepareGeneratedAssetFiles({
			assets,
			fetchImpl: async (input) =>
				String(input).includes(assets[0]?.slug ?? "missing")
					? new Response(new Uint8Array([1]), { status: 200 })
					: new Response(null, { status: 404 }),
		});

		expect(result.files).toHaveLength(1);
		expect(result.failures).toHaveLength(1);
		expect(result.failures[0]?.assetId).toBe(assets[1]?.id);
	});

	test("caps one unified browser import at twenty files", async () => {
		const result = await prepareGeneratedAssetFiles({
			assets: VISIONCUT_AVAILABLE_GENERATED_LIBRARY.slice(0, 25),
			fetchImpl: async () =>
				new Response(new Uint8Array([1]), {
					headers: { "content-type": "image/webp" },
					status: 200,
				}),
		});

		expect(result.files).toHaveLength(20);
	});
});
