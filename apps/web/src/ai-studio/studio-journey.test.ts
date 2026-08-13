import { describe, expect, test } from "bun:test";
import { buildStudioJourney } from "./studio-journey";

const emptyProject = {
	assetCount: 0,
	analyzableAssetCount: 0,
	analyzedAssetCount: 0,
	hasIntent: false,
	storyNodeCount: 0,
	timelineElementCount: 0,
	succeededAgentCount: 0,
	totalAgentCount: 0,
	exportReady: false,
	exportBlockerCount: 0,
};

describe("studio journey", () => {
	test("points an empty project to material understanding", () => {
		const journey = buildStudioJourney(emptyProject);

		expect(journey.progressPercent).toBe(0);
		expect(journey.nextStage?.id).toBe("understand");
		expect(journey.nextStage?.summary).toBe("导入素材");
	});

	test("requires every analyzable source before marking understanding complete", () => {
		const partial = buildStudioJourney({
			...emptyProject,
			assetCount: 4,
			analyzableAssetCount: 3,
			analyzedAssetCount: 2,
			hasIntent: true,
		});
		const complete = buildStudioJourney({
			...emptyProject,
			assetCount: 4,
			analyzableAssetCount: 3,
			analyzedAssetCount: 3,
			hasIntent: true,
		});

		expect(partial.nextStage?.id).toBe("understand");
		expect(complete.nextStage?.id).toBe("design");
	});

	test("advances through a complete local production and delivery", () => {
		const journey = buildStudioJourney({
			assetCount: 3,
			analyzableAssetCount: 2,
			analyzedAssetCount: 2,
			hasIntent: true,
			storyNodeCount: 6,
			timelineElementCount: 9,
			succeededAgentCount: 7,
			totalAgentCount: 7,
			exportReady: true,
			exportBlockerCount: 0,
		});

		expect(journey.completedCount).toBe(4);
		expect(journey.progressPercent).toBe(100);
		expect(journey.nextStage).toBeNull();
	});
});
