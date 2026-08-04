import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["."];
const skippedNames = new Set([".git", "node_modules", ".vercel", "coverage", "target"]);
const skippedFromSourceRoot = new Set([".next", ".open-next", "out", "build", "dist"]);
const textExtensions = new Set([
	"",
	".cjs",
	".css",
	".env",
	".html",
	".js",
	".json",
	".jsx",
	".mjs",
	".md",
	".rs",
	".sh",
	".toml",
	".ts",
	".tsx",
	".txt",
	".yaml",
	".yml",
]);
const signatures = [
	["openai-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
	["github-token", /\bgh[opusr]_[A-Za-z0-9]{20,}\b/],
	["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
	["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
	["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

const findings = [];

async function scanFile(pathname) {
	const info = await stat(pathname);
	if (
		info.size > 5 * 1024 * 1024 ||
		!textExtensions.has(extname(pathname).toLowerCase())
	)
		return;
	const content = await readFile(pathname, "utf8").catch(() => "");
	for (const [rule, signature] of signatures) {
		if (signature.test(content))
			findings.push({ path: relative(process.cwd(), pathname), rule });
	}
}

async function walk(pathname, sourceRoot) {
	const info = await stat(pathname).catch(() => null);
	if (!info) return;
	if (info.isFile()) return scanFile(pathname);
	for (const entry of await readdir(pathname, { withFileTypes: true })) {
		if (
			skippedNames.has(entry.name) ||
			(sourceRoot && skippedFromSourceRoot.has(entry.name))
		)
			continue;
		await walk(resolve(pathname, entry.name), false);
	}
}

for (const root of roots) {
	const resolved = resolve(root);
	await walk(resolved, resolve(".") === resolved);
}

if (findings.length) {
	console.error(
		`Secret guard blocked ${findings.length} high-confidence finding(s).`,
	);
	for (const finding of findings)
		console.error(`${finding.rule}: ${finding.path}`);
	process.exit(1);
}

console.log(
	`Secret guard passed ${roots.length} root(s); no high-confidence credentials found.`,
);
