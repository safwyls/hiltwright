// Build engine: config.h from the model into a private ProffieOS copy, arduino-cli compile, size and error
// reporting in plain language. Cache key is the config hash + OS tag + FQBN. Electron-free.

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { generateConfig, validateModel, type SaberConfigModel } from '@hiltwright/core';
import { PROFFIEOS_TAG, cliEnv, run, toolchainPaths, type Progress, type ToolchainPaths } from './toolchain';

export const FQBN: Record<'V2' | 'V3', string> = {
  V2: 'proffieboard:stm32l4:ProffieboardV2-L433CC:usb=cdc_msc_webusb,dosfs=sdspi,speed=80,opt=os',
  V3: 'proffieboard:stm32l4:ProffieboardV3-L452RE:usb=cdc_msc_webusb,dosfs=sdmmc1,speed=80,opt=os',
};
export const FLASH_BYTES: Record<'V2' | 'V3', number> = { V2: 262144, V3: 524288 };

export interface BuildResult {
  ok: boolean;
  cached: boolean;
  ms: number;
  configPath: string;
  configHash: string;
  dfuPath: string | null;
  textBytes: number | null;
  flashBytes: number;
  flashPct: number | null;
  /** Plain-language problems, first is the headline. */
  problems: string[];
  /** Raw compiler output, for "Show output". */
  output: string;
  warnings: string[];
}

/** Turn compiler output into something a saber owner can act on. */
export function translateErrors(stderr: string, presetNames: string[]): string[] {
  const out: string[] = [];
  if (/will not fit in region ['`]FLASH['`]|region ['`]FLASH['`] overflowed/i.test(stderr)) out.push('The firmware is too big for this board. Remove a look or two, or reuse looks with different colours instead of adding new ones.');
  if (/Please select Proffieboard V(\d)/i.test(stderr)) out.push(`This config is for a Proffieboard V${/Please select Proffieboard V(\d)/i.exec(stderr)![1]}. Check the board type in the saber's setup.`);
  const conflict = /#error (\S+) cannot be combined with (\S+)/i.exec(stderr);
  if (conflict) out.push(`Two button options conflict: ${conflict[1]} and ${conflict[2]}.`);
  if (/cannot convert 'const char\*' to 'StyleFactory\*'/i.test(stderr)) out.push('A preset has fewer looks than the saber has blades. Every preset needs one look per blade.');
  if (/cannot convert 'Preset\*' to 'BladeBase\*'/i.test(stderr) && !out.length) out.push('The blade table and the presets do not line up. Check the blade count.');
  const parse = /(?:parse error|error: .*(?:was not declared|expected))[^\n]*/i.exec(stderr);
  if (!out.length && parse) out.push(`The compiler did not understand part of the config: ${parse[0].trim().slice(0, 160)}`);
  if (!out.length) {
    const first = stderr.split('\n').find((l) => /error/i.test(l));
    if (first) out.push(first.trim().slice(0, 200));
  }
  void presetNames;
  return out;
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

/** Copy the pinned OS tree once per saber (no .git), then only the config and the .ino change between builds. */
async function prepareSketch(p: ToolchainPaths, saberDir: string, onLine: Progress): Promise<string> {
  const sketch = join(saberDir, 'ProffieOS');
  if (!(await exists(join(sketch, 'ProffieOS.ino')))) {
    onLine('preparing a private copy of ProffieOS');
    await rm(sketch, { recursive: true, force: true });
    await cp(p.osDir, sketch, { recursive: true, filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) });
  }
  return sketch;
}

export async function buildFirmware(opts: { toolchainRoot: string; saberId: string; model: SaberConfigModel; onLine?: Progress; force?: boolean }): Promise<BuildResult> {
  const onLine = opts.onLine ?? (() => {});
  const t0 = Date.now();
  const p = toolchainPaths(opts.toolchainRoot);
  const errors = validateModel(opts.model);
  const gen = generateConfig(opts.model);
  const fqbn = FQBN[opts.model.board];
  const flashBytes = FLASH_BYTES[opts.model.board];
  const saberDir = join(p.buildRoot, opts.saberId.replace(/[^A-Za-z0-9_-]/g, '_'));
  const cacheKey = createHash('sha256').update(`${gen.hash}|${PROFFIEOS_TAG}|${fqbn}`).digest('hex').slice(0, 16);
  const cacheDir = join(saberDir, 'cache', cacheKey);
  const configPath = join(saberDir, `${opts.model.name}.h`);
  await mkdir(saberDir, { recursive: true });
  await writeFile(configPath, gen.text, 'utf8');
  const base = { configPath, configHash: gen.hash, flashBytes, warnings: gen.warnings, manifest: gen.manifest, os: PROFFIEOS_TAG };
  if (errors.length) return { ...base, ok: false, cached: false, ms: Date.now() - t0, dfuPath: null, textBytes: null, flashPct: null, problems: errors, output: '' };

  const cachedDfu = join(cacheDir, 'ProffieOS.ino.dfu');
  if (!opts.force && (await exists(cachedDfu))) {
    const meta = JSON.parse(await readFile(join(cacheDir, 'result.json'), 'utf8')) as { textBytes: number | null };
    onLine(`using the cached build ${cacheKey}`);
    return { ...base, ok: true, cached: true, ms: Date.now() - t0, dfuPath: cachedDfu, textBytes: meta.textBytes, flashPct: meta.textBytes ? Math.round((meta.textBytes / flashBytes) * 100) : null, problems: [], output: '' };
  }

  const sketch = await prepareSketch(p, saberDir, onLine);
  await writeFile(join(sketch, 'config', `${opts.model.name}.h`), gen.text, 'utf8');
  const inoPath = join(sketch, 'ProffieOS.ino');
  let ino = await readFile(inoPath, 'utf8');
  ino = ino.replace(/^\s*#define CONFIG_FILE\b.*$/gm, (m) => `// ${m.trim()}`);
  const line = `#define CONFIG_FILE "config/${opts.model.name}.h"\n`;
  ino = /#ifndef CONFIG_FILE\s*\n/.test(ino) ? ino.replace(/(#ifndef CONFIG_FILE\s*\n)/, `${line}$1`) : line + ino;
  // The release zip's version string is a git keyword ("$Id: <sha> $"), which is what `version` then prints.
  // Stamp the tag we downloaded so the board reports something an owner (and parseVersion) can read.
  ino = ino.replace(/^const char version\[\] = "\$Id:\s*([0-9a-f]{7})[0-9a-f]*\s*\$";/m, (_m, sha: string) => `const char version[] = "${PROFFIEOS_TAG} hiltwright ${sha}";`);
  await writeFile(inoPath, ino, 'utf8');

  const buildPath = join(saberDir, 'build');
  onLine(`compiling ${opts.model.name}.h for Proffieboard ${opts.model.board}`);
  const r = await run(p.cli, ['compile', '--fqbn', fqbn, '--build-path', buildPath, '--warnings', 'none', '--format', 'json', sketch], { env: cliEnv(p), timeoutMs: 20 * 60 * 1000, quietStdout: true, onLine: (l) => { if (!/lto-wrapper|ld\.exe:|warning: (memory region|start of section)/.test(l)) onLine(l.trim()); } });
  let json: { success?: boolean; compiler_err?: string; compiler_out?: string; builder_result?: { executable_sections_size?: { name: string; size: number }[] } } | null = null;
  try { json = JSON.parse(r.stdout); } catch { /* hard failure prints no json */ }
  const stderr = (json?.compiler_err ?? '') + r.stderr;
  const ok = r.code === 0 && json?.success !== false;
  const text = json?.builder_result?.executable_sections_size?.find((s) => s.name === '.text' || s.name === 'text')?.size ?? null;
  const output = ((json?.compiler_out ?? '') + '\n' + stderr).trim();
  for (const l of (json?.compiler_out ?? '').split(/\r?\n/)) if (l.trim()) onLine(l.trim());
  if (!ok) {
    const problems = translateErrors(stderr, opts.model.presets.map((x) => x.name));
    onLine(`build failed: ${problems[0] ?? 'unknown error'}`);
    return { ...base, ok: false, cached: false, ms: r.ms, dfuPath: null, textBytes: text, flashPct: null, problems, output };
  }
  const dfu = join(buildPath, 'ProffieOS.ino.dfu');
  if (!(await exists(dfu))) return { ...base, ok: false, cached: false, ms: r.ms, dfuPath: null, textBytes: text, flashPct: null, problems: ['The build finished but produced no firmware file.'], output };
  await mkdir(cacheDir, { recursive: true });
  await cp(dfu, cachedDfu);
  await writeFile(join(cacheDir, 'result.json'), JSON.stringify({ textBytes: text, fqbn, hash: gen.hash, at: new Date().toISOString() }), 'utf8');
  // Keep only a handful of cached builds per saber.
  try {
    const entries = (await readdir(join(saberDir, 'cache'))).filter((n) => n !== cacheKey);
    if (entries.length > 4) for (const old of entries.slice(0, entries.length - 4)) await rm(join(saberDir, 'cache', old), { recursive: true, force: true });
  } catch { /* ignore */ }
  onLine(`build ok in ${(r.ms / 1000).toFixed(1)} s · .text ${text ?? '?'} bytes`);
  return { ...base, ok: true, cached: false, ms: r.ms, dfuPath: cachedDfu, textBytes: text, flashPct: text ? Math.round((text / flashBytes) * 100) : null, problems: [], output };
}
