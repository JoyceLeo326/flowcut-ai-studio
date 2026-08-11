import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BITMAP_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
const RUNTIME_EXTENSIONS = new Set(['.html', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.vue', '.svelte']);
function assert(condition, message) { if (!condition) throw new Error(message); }
function resolveInside(root, relativePath, label) {
  const resolvedRoot = path.resolve(root); const resolved = path.resolve(resolvedRoot, relativePath); const relative = path.relative(resolvedRoot, resolved);
  assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `${label} leaves repository root: ${relativePath}`); return resolved;
}
function hasBitmapMagic(bytes, extension) {
  if (extension === '.png') return bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  if (extension === '.jpg' || extension === '.jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === '.webp') return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (extension === '.gif') return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
  if (extension === '.avif') return bytes.subarray(4, 8).toString('ascii') === 'ftyp' && bytes.subarray(8, 32).includes(Buffer.from('avif'));
  return false;
}
function isRuntimeUsage(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/').toLowerCase();
  if (normalized.includes('/docs/') || normalized.startsWith('docs/') || normalized.endsWith('readme.md')) return false;
  return RUNTIME_EXTENSIONS.has(path.extname(normalized));
}
export async function validateVisualStory({ root, manifestPath }) {
  const resolvedRoot = path.resolve(root); const resolvedManifest = path.resolve(manifestPath); const manifestRelative = path.relative(resolvedRoot, resolvedManifest);
  assert(manifestRelative && !manifestRelative.startsWith('..') && !path.isAbsolute(manifestRelative), 'manifest leaves repository root');
  const manifest = JSON.parse(await readFile(resolvedManifest, 'utf8'));
  assert(manifest && typeof manifest === 'object', 'manifest must be an object'); assert(typeof manifest.project === 'string' && manifest.project.trim(), 'manifest project is required');
  assert(manifest.version === 3, 'manifest version must be 3'); assert(Array.isArray(manifest.assets), 'manifest assets must be an array');
  assert(manifest.assets.length >= 50, `manifest needs at least 50 assets; found ${manifest.assets.length}`);
  const ids = new Set(); const files = new Set(); const prompts = new Set(); const hashes = new Map(); let runtimeReachable = 0;
  for (const [index, asset] of manifest.assets.entries()) {
    const prefix = `asset ${index + 1}`;
    for (const field of ['id', 'file', 'person', 'situation', 'action', 'productState', 'outcome', 'alt', 'prompt']) assert(typeof asset[field] === 'string' && asset[field].trim(), `${prefix} missing ${field}`);
    assert(asset.prompt.trim().length >= 40, `${prefix} prompt is too short`); assert(Array.isArray(asset.usedIn) && asset.usedIn.length > 0, `${prefix} missing usedIn`);
    assert(!ids.has(asset.id), `duplicate asset id: ${asset.id}`); assert(!files.has(asset.file), `duplicate asset file: ${asset.file}`); assert(!prompts.has(asset.prompt), `duplicate asset prompt: ${asset.id}`);
    ids.add(asset.id); files.add(asset.file); prompts.add(asset.prompt);
    const extension = path.extname(asset.file).toLowerCase(); assert(BITMAP_EXTENSIONS.has(extension), `${prefix} is not a supported bitmap: ${asset.file}`);
    const imagePath = resolveInside(resolvedRoot, asset.file, `${prefix} file`); const imageBytes = await readFile(imagePath); assert(hasBitmapMagic(imageBytes, extension), `${prefix} has invalid ${extension} file signature: ${asset.file}`);
    const hash = createHash('sha256').update(imageBytes).digest('hex'); if (hashes.has(hash)) throw new Error(`duplicate image content: ${asset.file} matches ${hashes.get(hash)}`); hashes.set(hash, asset.file);
    let assetHasRuntimeUsage = false;
    for (const usage of asset.usedIn) {
      assert(typeof usage === 'string' && usage.trim(), `${prefix} has an invalid usage target`); const usagePath = resolveInside(resolvedRoot, usage, `${prefix} usage`);
      try { const usageStat = await stat(usagePath); assert(usageStat.isFile(), `${prefix} usage target is not a file: ${usage}`); } catch (error) { if (error?.code === 'ENOENT') throw new Error(`missing usage target for ${asset.id}: ${usage}`); throw error; }
      assetHasRuntimeUsage ||= isRuntimeUsage(usage);
    }
    if (assetHasRuntimeUsage) runtimeReachable += 1;
  }
  assert(runtimeReachable >= 20, `at least 20 assets must be reachable from runtime code; found ${runtimeReachable}`);
  return { project: manifest.project, assetCount: manifest.assets.length, uniqueHashes: hashes.size, runtimeReachable };
}
function parseCliArgs(argv) { const options = {}; for (let index = 0; index < argv.length; index += 2) { const flag = argv[index]; const value = argv[index + 1]; assert(flag?.startsWith('--') && value, `invalid CLI arguments near ${flag ?? '<end>'}`); options[flag.slice(2)] = value; } assert(options.root && options.manifest, 'usage: node qa/validate-visual-story.mjs --root <repo> --manifest <manifest.json>'); return options; }
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) { const options = parseCliArgs(process.argv.slice(2)); const result = await validateVisualStory({ root: options.root, manifestPath: path.resolve(options.root, options.manifest) }); process.stdout.write(`${JSON.stringify(result)}\n`); }
