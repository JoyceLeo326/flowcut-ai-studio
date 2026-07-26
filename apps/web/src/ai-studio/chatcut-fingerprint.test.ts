import { describe, expect, test } from "bun:test";
import {
	fingerprintJson,
	sha256Fingerprint,
	sha256Hex,
	stableJson,
} from "./chatcut-fingerprint";

describe("ChatCut SHA-256 fingerprints", () => {
	test("matches standard SHA-256 vectors", () => {
		expect(sha256Hex("")).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
		expect(sha256Hex("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
		expect(sha256Hex("你好，VisionCut")).toHaveLength(64);
	});

	test("emits protocol-compatible fingerprints", () => {
		expect(sha256Fingerprint("timeline")).toMatch(/^sha256:[a-f0-9]{64}$/u);
	});

	test("canonicalizes object key order without changing array order", () => {
		expect(stableJson({ z: 1, a: [3, 2, 1], omitted: undefined })).toBe(
			'{"a":[3,2,1],"z":1}',
		);
		expect(fingerprintJson({ a: 1, b: 2 })).toBe(
			fingerprintJson({ b: 2, a: 1 }),
		);
		expect(fingerprintJson([1, 2])).not.toBe(fingerprintJson([2, 1]));
	});
});
