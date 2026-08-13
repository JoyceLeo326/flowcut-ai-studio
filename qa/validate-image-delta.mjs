import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const BITMAP_PATTERN = /\.(?:png|jpe?g|webp|gif|avif)$/i;
const STORY_ASSET_PREFIX = 'mirror-src/assets/story-v3/';
function assert(condition, message) { if (!condition) throw new Error(message); }
function git(root, ...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }
function resolveInside(root, relativePath) { const resolvedRoot = path.resolve(root); const resolved = path.resolve(resolvedRoot, relativePath); const relative = path.relative(resolvedRoot, resolved); assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `image leaves repository root: ${relativePath}`); return resolved; }
export async function validateImageDelta({ root, base, manifestPath }) {
  const resolvedRoot = path.resolve(root); git(resolvedRoot, 'rev-parse', '--verify', `${base}^{commit}`);
  const output = git(resolvedRoot, 'diff', '--name-only', '--diff-filter=A', `${base}...HEAD`);
  const addedImages = output
    .split(/\r?\n/u)
    .map((value) => value.trim().replaceAll('\\', '/'))
    .filter((value) => value.startsWith(STORY_ASSET_PREFIX) && BITMAP_PATTERN.test(value));
  const manifest = JSON.parse(await readFile(path.resolve(manifestPath), 'utf8')); assert(Array.isArray(manifest.assets), 'manifest assets must be an array');
  const declared = new Set(manifest.assets.map((asset) => asset.file)); const undeclared = addedImages.filter((file) => !declared.has(file)); assert(undeclared.length === 0, `new images missing from manifest: ${undeclared.join(', ')}`);
  const hashes = new Map(); for (const relativePath of addedImages) { const bytes = await readFile(resolveInside(resolvedRoot, relativePath)); const hash = createHash('sha256').update(bytes).digest('hex'); if (hashes.has(hash)) throw new Error(`duplicate new image content: ${relativePath} matches ${hashes.get(hash)}`); hashes.set(hash, relativePath); }
  return { base: git(resolvedRoot, 'rev-parse', base), head: git(resolvedRoot, 'rev-parse', 'HEAD'), addedImages: addedImages.length, uniqueHashes: hashes.size };
}
function parseCliArgs(argv) { const options = {}; for (let index = 0; index < argv.length; index += 2) { const flag = argv[index]; const value = argv[index + 1]; assert(flag?.startsWith('--') && value, `invalid CLI arguments near ${flag ?? '<end>'}`); options[flag.slice(2)] = value; } assert(options.root && options.base && options.manifest, 'usage: node qa/validate-image-delta.mjs --root <repo> --base <sha-or-ref> --manifest <manifest.json>'); return options; }
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) { const options = parseCliArgs(process.argv.slice(2)); const result = await validateImageDelta({ root: options.root, base: options.base, manifestPath: path.resolve(options.root, options.manifest) }); process.stdout.write(`${JSON.stringify(result)}\n`); }
