import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { SITE_INFO } from "./brand.ts";

describe("public site metadata", () => {
	test("uses the FlowCut AI Studio product name", () => {
		assert.equal(SITE_INFO.title, "FlowCut AI Studio");
		assert.match(SITE_INFO.description, /FlowCut/);
		assert.doesNotMatch(SITE_INFO.description, /VisionCut/);
	});
});
