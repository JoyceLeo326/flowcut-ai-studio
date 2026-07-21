import { describe, expect, test } from "bun:test";
import { GET } from "../app/api/media/openverse/[id]/route";
import {
	MAX_OPENVERSE_IMAGE_BYTES,
	type OpenverseFetch,
	isOpenverseImageId,
	proxyOpenverseImage,
} from "./openverse-download";

const VALID_ID = "123e4567-e89b-42d3-a456-426614174000";

function expectStatus({
	promise,
	status,
}: {
	promise: Promise<unknown>;
	status: number;
}) {
	return expect(promise).rejects.toMatchObject({ status });
}

describe("Openverse image download proxy", () => {
	test("strictly validates RFC UUIDs", () => {
		expect(isOpenverseImageId(VALID_ID)).toBe(true);
		expect(isOpenverseImageId(VALID_ID.toUpperCase())).toBe(true);
		expect(isOpenverseImageId("123e4567e89b42d3a456426614174000")).toBe(false);
		expect(isOpenverseImageId("123e4567-e89b-12d3-a456-426614174000")).toBe(
			false,
		);
		expect(isOpenverseImageId("123e4567-e89b-42d3-7456-426614174000")).toBe(
			false,
		);
		expect(isOpenverseImageId("../../etc/passwd")).toBe(false);
	});

	test("looks up metadata by UUID and returns a bounded attributed image", async () => {
		const calls: Array<{ init: RequestInit | undefined; url: string }> = [];
		// eslint-disable-next-line opencut/prefer-object-params -- A fetch test double must match the platform signature.
		const fetchImpl: OpenverseFetch = async (input, init) => {
			const url = String(input);
			calls.push({ init, url });
			if (calls.length === 1) {
				return Response.json({
					id: VALID_ID,
					url: "http://169.254.169.254/latest/meta-data",
					foreign_landing_url: "https://source.example/photo",
					license: "by",
					license_version: "4.0",
					license_url: "https://creativecommons.org/licenses/by/4.0/",
				});
			}

			return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
				headers: {
					"Content-Length": "4",
					"Content-Type": "image/jpeg",
				},
			});
		};

		const response = await proxyOpenverseImage({
			fetchImpl,
			id: VALID_ID,
		});

		expect(calls.map(({ url }) => url)).toEqual([
			`https://api.openverse.org/v1/images/${VALID_ID}/`,
			`https://api.openverse.org/v1/images/${VALID_ID}/thumb/`,
		]);
		expect(calls.every(({ init }) => init?.signal instanceof AbortSignal)).toBe(
			true,
		);
		expect(calls.every(({ init }) => init?.redirect === "error")).toBe(true);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe("image/jpeg");
		expect(response.headers.get("Content-Length")).toBe("4");
		expect(response.headers.get("X-Openverse-Source")).toBe(
			"https://source.example/photo",
		);
		expect(response.headers.get("X-Openverse-License")).toBe("CC BY 4.0");
		expect(response.headers.get("X-Openverse-License-Url")).toBe(
			"https://creativecommons.org/licenses/by/4.0/",
		);
		expect(new Uint8Array(await response.arrayBuffer())).toEqual(
			new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
		);
	});

	test("returns 400 before making a request for an invalid id", async () => {
		let fetchCalled = false;
		const fetchImpl: OpenverseFetch = async () => {
			fetchCalled = true;
			return new Response();
		};

		await expectStatus({
			promise: proxyOpenverseImage({ fetchImpl, id: "not-a-uuid" }),
			status: 400,
		});
		expect(fetchCalled).toBe(false);

		const routeResponse = await GET(new Request("http://localhost"), {
			params: Promise.resolve({ id: "not-a-uuid" }),
		});
		expect(routeResponse.status).toBe(400);
		expect(await routeResponse.json()).toEqual({
			code: "invalid_openverse_id",
			error: "Invalid Openverse image id",
		});
	});

	test("maps a missing Openverse record to 404", async () => {
		const fetchImpl: OpenverseFetch = async () =>
			new Response(null, { status: 404 });

		await expectStatus({
			promise: proxyOpenverseImage({ fetchImpl, id: VALID_ID }),
			status: 404,
		});
	});

	test("refuses thumbnail redirects instead of following another host", async () => {
		const calls: Array<RequestInit | undefined> = [];
		// eslint-disable-next-line opencut/prefer-object-params -- A fetch test double must match the platform signature.
		const fetchImpl: OpenverseFetch = async (_input, init) => {
			calls.push(init);
			if (calls.length === 1) {
				return Response.json({
					id: VALID_ID,
					foreign_landing_url: "https://source.example/photo",
					license: "cc0",
				});
			}
			return new Response(null, {
				headers: { Location: "http://127.0.0.1/internal" },
				status: 302,
			});
		};

		await expectStatus({
			promise: proxyOpenverseImage({ fetchImpl, id: VALID_ID }),
			status: 502,
		});
		expect(calls.every((init) => init?.redirect === "error")).toBe(true);
	});

	test("rejects SVG, other image types, and responses larger than 20 MB", async () => {
		async function runWithImageResponse(imageResponse: Response) {
			let callCount = 0;
			const fetchImpl: OpenverseFetch = async () => {
				callCount += 1;
				if (callCount === 1) {
					return Response.json({
						id: VALID_ID,
						url: "https://images.example/original",
						foreign_landing_url: "https://source.example/photo",
						license: "by",
					});
				}
				return imageResponse;
			};
			return proxyOpenverseImage({ fetchImpl, id: VALID_ID });
		}

		await expectStatus({
			promise: runWithImageResponse(
				new Response("not an image", {
					headers: { "Content-Type": "image/svg+xml" },
				}),
			),
			status: 502,
		});
		await expectStatus({
			promise: runWithImageResponse(
				new Response(new Uint8Array([1]), {
					headers: { "Content-Type": "image/bmp" },
				}),
			),
			status: 502,
		});
		await expectStatus({
			promise: runWithImageResponse(
				new Response(new Uint8Array([1]), {
					headers: {
						"Content-Length": String(MAX_OPENVERSE_IMAGE_BYTES + 1),
						"Content-Type": "image/png",
					},
				}),
			),
			status: 502,
		});
	});

	test("accepts only the supported raster image MIME types", async () => {
		for (const contentType of [
			"image/jpeg",
			"image/png",
			"image/webp",
			"image/gif",
			"image/avif",
		]) {
			let callCount = 0;
			const fetchImpl: OpenverseFetch = async () => {
				callCount += 1;
				if (callCount === 1) {
					return Response.json({
						id: VALID_ID,
						foreign_landing_url: "https://source.example/photo",
						license: "by",
					});
				}
				return new Response(new Uint8Array([1]), {
					headers: { "Content-Type": contentType },
				});
			};

			const response = await proxyOpenverseImage({ fetchImpl, id: VALID_ID });
			expect(response.headers.get("Content-Type")).toBe(contentType);
		}
	});

	test("enforces the byte limit when Content-Length is absent", async () => {
		let callCount = 0;
		const fetchImpl: OpenverseFetch = async () => {
			callCount += 1;
			if (callCount === 1) {
				return Response.json({
					id: VALID_ID,
					url: "https://images.example/original",
					foreign_landing_url: "https://source.example/photo",
					license: "by",
				});
			}
			const body = new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new Uint8Array(MAX_OPENVERSE_IMAGE_BYTES));
					controller.enqueue(new Uint8Array([1]));
					controller.close();
				},
			});
			return new Response(body, {
				headers: { "Content-Type": "image/png" },
			});
		};

		await expectStatus({
			promise: proxyOpenverseImage({ fetchImpl, id: VALID_ID }),
			status: 502,
		});
	});

	test("maps timeout failures to 504", async () => {
		const fetchImpl: OpenverseFetch = async () => {
			throw new DOMException("The operation timed out", "TimeoutError");
		};

		await expectStatus({
			promise: proxyOpenverseImage({ fetchImpl, id: VALID_ID }),
			status: 504,
		});
	});
});
