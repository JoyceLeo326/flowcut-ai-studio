import { describe, expect, test } from "bun:test";
import postcss from "postcss";

const TOUCH_MEDIA_QUERY = "(max-width: 1199px), (pointer: coarse)";
const DENSE_DESKTOP_MEDIA_QUERY = "(min-width: 1200px) and (pointer: fine)";

async function readSource(relativePath: string) {
	return Bun.file(new URL(relativePath, import.meta.url)).text();
}

function declarationsFor({
	css,
	mediaQuery,
	selector,
}: {
	css: string;
	mediaQuery: string;
	selector: string;
}) {
	const declarations = new Map<string, string>();
	const root = postcss.parse(css);

	root.walkAtRules("media", (mediaRule) => {
		if (mediaRule.params !== mediaQuery) return;
		mediaRule.walkRules((rule) => {
			if (rule.selector !== selector) return;
			rule.walkDecls((declaration) => {
				declarations.set(declaration.prop, declaration.value);
			});
		});
	});

	return declarations;
}

describe("editor responsive interaction contract", () => {
	test("uses one touch-layout condition for viewport width and coarse pointers", async () => {
		const [pageSource, css] = await Promise.all([
			readSource("../../app/editor/[project_id]/page.tsx"),
			readSource("./editor-header.module.css"),
		]);

		expect(pageSource).toContain(
			`const TOUCH_LAYOUT_QUERY = "${TOUCH_MEDIA_QUERY}"`,
		);
		expect(css).toContain(`@media ${TOUCH_MEDIA_QUERY}`);
		expect(pageSource).not.toContain("max-width: 1366px");
	});

	test("keeps every header interaction target at least 44px in touch layouts", async () => {
		const css = await readSource("./editor-header.module.css");
		const trigger = declarationsFor({
			css,
			mediaQuery: TOUCH_MEDIA_QUERY,
			selector: ".interactionTarget",
		});
		const headerActions = declarationsFor({
			css,
			mediaQuery: TOUCH_MEDIA_QUERY,
			selector: ".headerActions :global(button)",
		});
		const menuItem = declarationsFor({
			css,
			mediaQuery: TOUCH_MEDIA_QUERY,
			selector: ".menuItem",
		});

		expect(trigger.get("min-width")).toBe("2.75rem");
		expect(trigger.get("min-height")).toBe("2.75rem");
		expect(headerActions.get("min-width")).toBe("2.75rem");
		expect(headerActions.get("min-height")).toBe("2.75rem");
		expect(menuItem.get("min-height")).toBe("2.75rem");
	});

	test("restores compact density only for wide fine-pointer desktops", async () => {
		const [headerSource, css] = await Promise.all([
			readSource("./editor-header.tsx"),
			readSource("./editor-header.module.css"),
		]);
		const desktopOnly = declarationsFor({
			css,
			mediaQuery: DENSE_DESKTOP_MEDIA_QUERY,
			selector: ".desktopOnly",
		});

		expect(desktopOnly.get("display")).toBe("flex");
		expect(headerSource).toContain("styles.headerActions");
		expect(headerSource).toContain("styles.interactionTarget");
		expect(headerSource).toContain("styles.menuItem");
		expect(headerSource).toContain("styles.desktopOnly");
		expect(headerSource).not.toMatch(/\blg:(?:h|min-h|size)-8\b/u);
	});
});
