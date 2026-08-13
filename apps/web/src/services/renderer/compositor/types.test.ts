import { describe, expect, test } from "bun:test";
import type { FrameItemDescriptor } from "./types";

describe("WASM frame descriptor contract", () => {
	test("uses the field name required by the scene-effect enum variant", () => {
		const item: FrameItemDescriptor = {
			type: "sceneEffect",
			effect_pass_groups: [
				[
					{
						shader: "gaussian-blur",
						uniforms: { u_sigma: 2 },
					},
				],
			],
		};

		expect(item).toEqual({
			type: "sceneEffect",
			effect_pass_groups: [
				[
					{
						shader: "gaussian-blur",
						uniforms: { u_sigma: 2 },
					},
				],
			],
		});
		expect("effectPassGroups" in item).toBe(false);
	});
});
