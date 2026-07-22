import { describe, expect, test } from "bun:test";
import {
	IndexedDBIntentSpecStorage,
	MemoryIntentSpecStorage,
	createIntentSpec,
	deleteIntentSpec,
	exportIntentSpec,
	loadIntentSpec,
	parseIntentSpec,
	saveIntentSpec,
	updateIntentSpec,
	updateStoredIntentSpec,
} from "./intent-spec";

const CREATED_AT = "2026-07-23T08:00:00.000Z";
const UPDATED_AT = "2026-07-23T08:05:00.000Z";

function createProjectIntent({
	projectId,
	userIntent = "Create a concise founder story",
}: {
	projectId: string;
	userIntent?: string;
}) {
	return createIntentSpec({
		projectId,
		userIntent,
		source: "home",
		createdAt: CREATED_AT,
	});
}

describe("VisionCut IntentSpec domain", () => {
	test("normalizes deterministic creation input and freezes revision one", () => {
		const input = {
			projectId: "  ｐｒｏｊｅｃｔ－１  ",
			userIntent: "  Create\n a   60 second founder story  ",
			target: {
				platform: "  LinkedIn  ",
				aspectRatio: " 09 ： 016 ",
				durationSeconds: 60,
				style: "  restrained   documentary  ",
			},
			source: "home" as const,
			createdAt: "2026-07-23T16:00:00+08:00",
		};
		const first = createIntentSpec(input);
		const second = createIntentSpec(input);

		expect(first).toEqual(second);
		expect(first).toMatchObject({
			projectId: "project-1",
			revision: 1,
			userIntent: "Create a 60 second founder story",
			target: {
				platform: "LinkedIn",
				aspectRatio: "9:16",
				durationSeconds: 60,
				style: "restrained documentary",
			},
			createdAt: CREATED_AT,
			updatedAt: CREATED_AT,
		});
		expect(first.guarantees).toEqual({
			localOnly: true,
			accountRequired: false,
			network: false,
			paidService: false,
		});
		expect(first.revisions).toHaveLength(1);
		expect(Object.isFrozen(first)).toBe(true);
		expect(Object.isFrozen(first.target)).toBe(true);
		expect(Object.isFrozen(first.revisions)).toBe(true);
		expect(Object.isFrozen(first.revisions[0])).toBe(true);
	});

	test("creates immutable contiguous revisions and preserves the original", () => {
		const original = createIntentSpec({
			projectId: "project-1",
			userIntent: "Create a founder story",
			target: { platform: "LinkedIn", aspectRatio: "16:9" },
			source: "home",
			createdAt: CREATED_AT,
		});
		const originalJson = JSON.stringify(original);
		const revised = updateIntentSpec({
			spec: original,
			changes: {
				userIntent: "  Focus on the product turning point  ",
				target: { platform: "YouTube", aspectRatio: null },
			},
			source: "editor",
			updatedAt: UPDATED_AT,
		});

		expect(JSON.stringify(original)).toBe(originalJson);
		expect(original.revision).toBe(1);
		expect(revised.revision).toBe(2);
		expect(revised.revisions.map(({ revision }) => revision)).toEqual([1, 2]);
		expect(revised.revisions[0]).toEqual(original.revisions[0]);
		expect(revised.revisions[1]).toMatchObject({
			userIntent: "Focus on the product turning point",
			target: { platform: "YouTube" },
			source: "editor",
			createdAt: CREATED_AT,
			updatedAt: UPDATED_AT,
		});
		expect(revised.target).toEqual({ platform: "YouTube" });
		expect(Object.isFrozen(revised.revisions[1])).toBe(true);

		const noOp = updateIntentSpec({
			spec: revised,
			changes: {},
			source: "editor",
			updatedAt: "2026-07-23T08:10:00.000Z",
		});
		expect(noOp).toEqual(revised);
		expect(noOp.revision).toBe(2);
	});

	test("keeps persisted intents isolated by project and updates one project", async () => {
		const storage = new MemoryIntentSpecStorage();
		const first = createProjectIntent({ projectId: "project-a" });
		const second = createProjectIntent({
			projectId: "project-b",
			userIntent: "Create a product launch film",
		});
		await saveIntentSpec({ spec: first, storage });
		await saveIntentSpec({ spec: second, storage });

		const updated = await updateStoredIntentSpec({
			projectId: "project-a",
			changes: { target: { platform: "TikTok", aspectRatio: "9:16" } },
			source: "editor",
			updatedAt: UPDATED_AT,
			storage,
		});
		const untouched = await loadIntentSpec({
			projectId: "project-b",
			storage,
		});

		expect(updated).toMatchObject({
			projectId: "project-a",
			revision: 2,
			target: { platform: "TikTok", aspectRatio: "9:16" },
		});
		expect(untouched).toEqual(second);
		await deleteIntentSpec({ projectId: "project-a", storage });
		expect(
			await loadIntentSpec({ projectId: "project-a", storage }),
		).toBeNull();
		expect(await loadIntentSpec({ projectId: "project-b", storage })).toEqual(
			second,
		);
	});

	test("returns null for malformed or cross-project stored values", async () => {
		const valid = createProjectIntent({ projectId: "project-a" });
		const malformed = {
			...JSON.parse(JSON.stringify(valid)),
			revision: 4,
		};
		const storage = new MemoryIntentSpecStorage({
			entries: [{ projectId: "project-a", value: malformed }],
		});

		expect(parseIntentSpec({ value: malformed })).toBeNull();
		expect(
			await loadIntentSpec({ projectId: "project-a", storage }),
		).toBeNull();

		await storage.set({ projectId: "project-a", value: valid });
		expect(await loadIntentSpec({ projectId: "project-a", storage })).toEqual(
			valid,
		);
		await storage.set({ projectId: "project-b", value: valid });
		expect(
			await loadIntentSpec({ projectId: "project-b", storage }),
		).toBeNull();
	});

	test("uses the local in-memory fallback when IndexedDB is unavailable", async () => {
		const fallback = new MemoryIntentSpecStorage();
		const storage = new IndexedDBIntentSpecStorage({
			indexedDBFactory: null,
			fallback,
		});
		const spec = createProjectIntent({ projectId: "ssr-project" });

		await saveIntentSpec({ spec, storage });
		expect(await loadIntentSpec({ projectId: "ssr-project", storage })).toEqual(
			spec,
		);
		await deleteIntentSpec({ projectId: "ssr-project", storage });
		expect(
			await loadIntentSpec({ projectId: "ssr-project", storage }),
		).toBeNull();
	});

	test("exports validated revision history as portable JSON", () => {
		const first = createProjectIntent({ projectId: "project-export" });
		const revised = updateIntentSpec({
			spec: first,
			changes: { target: { durationSeconds: 45, style: "editorial" } },
			source: "editor",
			updatedAt: UPDATED_AT,
		});
		const exported = exportIntentSpec({ spec: revised });
		const parsed: unknown = JSON.parse(exported);

		expect(parseIntentSpec({ value: parsed })).toEqual(revised);
		expect(exported).toContain('"localOnly": true');
		expect(exported).toContain('"revision": 2');
	});
});
