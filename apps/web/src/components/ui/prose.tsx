import { cn } from "@/utils/ui";
import rehypeParse from "rehype-parse";
import { unified } from "unified";
import { createElement } from "react";
import type React from "react";

type ProseProps = React.HTMLAttributes<HTMLElement> & {
	as?: "article";
	html: string;
};

type HastTextNode = {
	type: "text";
	value: string;
};

type HastElementNode = {
	type: "element";
	tagName: string;
	properties?: Record<string, unknown>;
	children?: HastNode[];
};

type HastRootNode = {
	type: "root";
	children?: HastNode[];
};

type HastNode = HastTextNode | HastElementNode | HastRootNode;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValidChildren(value: unknown): value is HastNode[] | undefined {
	return (
		value === undefined || (Array.isArray(value) && value.every(isHastNode))
	);
}

function isHastNode(value: unknown): value is HastNode {
	if (!isRecord(value)) {
		return false;
	}

	const type = value.type;
	if (type === "text") {
		return typeof value.value === "string";
	}

	const children = value.children;
	if (!hasValidChildren(children)) {
		return false;
	}

	if (type === "root") {
		return true;
	}

	if (type !== "element" || typeof value.tagName !== "string") {
		return false;
	}

	return value.properties === undefined || isRecord(value.properties);
}

function toReactProps({
	properties,
}: {
	properties: HastElementNode["properties"];
}): Record<string, unknown> {
	if (!properties) {
		return {};
	}

	const props: Record<string, unknown> = {};

	for (const [propertyName, propertyValue] of Object.entries(properties)) {
		if (propertyValue === null || propertyValue === undefined) {
			continue;
		}

		if (propertyName.startsWith("on")) {
			continue;
		}

		if (propertyName === "class") {
			props.className = Array.isArray(propertyValue)
				? propertyValue.join(" ")
				: propertyValue;
			continue;
		}

		if (propertyName === "for") {
			props.htmlFor = propertyValue;
			continue;
		}

		props[propertyName] = propertyValue;
	}

	return props;
}

function renderHastNode({
	node,
	key,
}: {
	node: HastNode;
	key: string;
}): React.ReactNode {
	if (node.type === "text") {
		return node.value;
	}

	if (node.type !== "element") {
		return null;
	}

	const children = (node.children ?? []).map((childNode, index) =>
		renderHastNode({ node: childNode, key: `${key}-${index}` }),
	);

	return createElement(
		node.tagName,
		{ ...toReactProps({ properties: node.properties }), key },
		children,
	);
}

function renderHtmlNodes({ html }: { html: string }): React.ReactNode {
	const parsed: unknown = unified()
		.use(rehypeParse, { fragment: true })
		.parse(html);
	if (!isHastNode(parsed) || parsed.type !== "root") {
		return null;
	}

	const rootNode = parsed;
	return (rootNode.children ?? []).map((childNode, index) =>
		renderHastNode({ node: childNode, key: `prose-node-${index}` }),
	);
}

function Prose({ children, html, className }: ProseProps) {
	return (
		<article
			className={cn(
				"prose prose-h2:font-semibold prose-h1:text-xl prose-a:text-blue-600 prose-p:first:mt-0 dark:prose-invert mx-auto max-w-none px-2",
				className,
			)}
		>
			{html ? renderHtmlNodes({ html }) : children}
		</article>
	);
}

export default Prose;
