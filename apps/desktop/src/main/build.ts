// Build engine: config.h from the model into a private ProffieOS copy, arduino-cli compile, size and error
// reporting in plain language. Cache key is the config hash + OS tag + FQBN. Electron-free.

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { customPropFileName, generateConfig, validateModel, type GeneratedConfig, type SaberConfigModel, type SlotLines } from '@hiltwright/core';
import { readCustomProp } from './customProps';
import { PROFFIEOS_TAG, cliEnv, run, toolchainPaths, type Progress, type ToolchainPaths, ensureBuildRoot, userBuildRoot } from './toolchain';

export const FQBN: Record<'V2' | 'V3', string> = {
  V2: 'proffieboard:stm32l4:ProffieboardV2-L433CC:usb=cdc_msc_webusb,dosfs=sdspi,speed=80,opt=os',
  V3: 'proffieboard:stm32l4:ProffieboardV3-L452RE:usb=cdc_msc_webusb,dosfs=sdmmc1,speed=80,opt=os',
};
/**
 * Flash capacity per board, as the board support (core 4.6, pinned) declares it in boards.txt
 * (`upload.maximum_size`). A build uses the size arduino-cli reports for it when there is one.
 */
export const FLASH_BYTES: Record<'V2' | 'V3', number> = { V2: 262144, V3: 507904 };

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
  /** Which look went into which preset slot; stored on the saber once installed. */
  manifest: GeneratedConfig['manifest'] | null;
  /** ProffieOS tag the build used. */
  os: string;
  /** The board this firmware was built for; the install checks it against the bootloader's flash size. */
  board: 'V2' | 'V3';
}

/** What translateErrors needs to say which preset slot an error comes from. */
export interface ErrorContext { configFile: string; slotLines: SlotLines[]; presetNames: string[] }

/** The preset slot a compiler error in the config falls in, as the owner would say it. */
function slotOf(stderr: string, ctx: ErrorContext | undefined): string | null {
  if (!ctx) return null;
  const file = ctx.configFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[\\\\/])${file}:(\\d+):\\d+:\\s*(?:fatal )?(?:error|note)`, 'gm');
  for (const m of stderr.matchAll(re)) {
    const line = Number(m[1]);
    const slot = ctx.slotLines.find((s) => line >= s.line && line <= s.endLine);
    if (slot) return `In preset "${(ctx.presetNames[slot.preset] ?? `${slot.preset + 1}`).replace(/[\r\n]+/g, ' ')}", blade ${slot.blade + 1}, style "${slot.lookName}"`;
  }
  return null;
}

/** Turn compiler output into something a saber owner can act on. */
export function translateErrors(stderr: string, ctx?: ErrorContext): string[] {
  const out: string[] = [];
  if (/will not fit in region ['`]FLASH['`]|region ['`]FLASH['`] overflowed/i.test(stderr)) out.push('The firmware is too big for this board. Remove a style or two, or reuse styles with different colours instead of adding new ones.');
  if (/Please select Proffieboard V(\d)/i.test(stderr)) out.push(`This config is for a Proffieboard V${/Please select Proffieboard V(\d)/i.exec(stderr)![1]}. Check the board type in the saber's setup.`);
  const conflict = /#error (\S+) cannot be combined with (\S+)/i.exec(stderr);
  if (conflict) out.push(`Two button options conflict: ${conflict[1]} and ${conflict[2]}.`);
  if (/cannot convert 'const char\*' to 'StyleFactory\*'/i.test(stderr)) out.push('A preset has fewer styles than the saber has blades. Every preset needs one style per blade.');
  if (/cannot convert 'Preset\*' to 'BladeBase\*'/i.test(stderr) && !out.length) out.push('The blade table and the presets do not line up. Check the blade count.');
  // The compiler failing to open one of its own files is an install problem, not a config problem.
  if (/(arm-none-eabi-gcc|arduino-data)[^\n]*fatal error: [^\n:]+: No such file or directory/i.test(stderr) || /cannot execute '[^']+'/i.test(stderr)) {
    out.push('The compiler could not open one of its own files. On Windows this means the toolchain folder path is too long, or the download was incomplete. Reinstall the toolchain from Build & Flash.');
  }
  const parse = /(?:parse error|error: .*(?:was not declared|expected))[^\n]*/i.exec(stderr);
  if (!out.length && parse) out.push(`The compiler did not understand part of the config: ${parse[0].trim().slice(0, 160)}`);
  if (!out.length) {
    const first = stderr.split('\n').find((l) => /error/i.test(l));
    if (first) out.push(first.trim().slice(0, 200));
  }
  // An error inside a preset's style: say which preset, blade and style it is.
  const where = slotOf(stderr, ctx);
  if (where) {
    if (out.length) out[0] = `${where}: ${out[0]}`;
    else out.push(`${where}: the compiler did not accept this style.`);
  }
  return out;
}

/**
 * The prop's own rules for options that do not go together: `#if <condition>` directly followed by `#error <text>`,
 * where the condition is only `defined(X)`, `!defined(X)` and `NUM_BUTTONS <op> n` joined by `&&`. A term is true when
 * the config defines it, unknown when ProffieOS or the prop could define it themselves (`maybe`), false otherwise; a rule
 * counts only when every term is known to be true, so it never refuses a build the compiler would accept. Anything
 * else is left to the compiler.
 */
export function propRuleProblems(propText: string, defines: Set<string>, numButtons: number, maybe: Set<string> = new Set()): string[] {
  const out: string[] = [];
  const lines = propText.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    const cond = /^\s*#if\s+(.+?)\s*$/.exec(lines[i])?.[1];
    if (!cond || /\|\|/.test(cond)) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    const msg = /^\s*#error\s+(.+?)\s*$/.exec(lines[j] ?? '')?.[1];
    if (!msg) continue;
    let all = true;
    for (const raw of cond.split('&&').map((t) => t.trim())) {
      const neg = /^!\s*defined\s*\(?\s*(\w+)\s*\)?$/.exec(raw);
      const pos = /^defined\s*\(?\s*(\w+)\s*\)?$/.exec(raw);
      const btn = /^NUM_BUTTONS\s*(==|!=|<=|>=|<|>)\s*(\d+)$/.exec(raw);
      let v: boolean | null = null;
      if (pos) v = defines.has(pos[1]) ? true : maybe.has(pos[1]) ? null : false;
      else if (neg) v = defines.has(neg[1]) ? false : maybe.has(neg[1]) ? null : true;
      else if (btn) { const n = Number(btn[2]); v = { '==': numButtons === n, '!=': numButtons !== n, '<=': numButtons <= n, '>=': numButtons >= n, '<': numButtons < n, '>': numButtons > n }[btn[1]]!; }
      if (v !== true) { all = false; break; }
    }
    if (all) out.push(`These options cannot be used together on this prop: ${msg.replace(/^\/?props\/\S+\.h\s+/, 'the prop ')}`);
  }
  return out;
}

/** The names a config defines in CONFIG_TOP (`#define NAME ...`). */
export function configDefines(text: string): Set<string> {
  const top = /#ifdef CONFIG_TOP([\s\S]*?)#endif/.exec(text)?.[1] ?? '';
  return new Set([...top.matchAll(/^\s*#define\s+(\w+)/gm)].map((m) => m[1]));
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

/**
 * Build a saber's firmware. Each saber builds in `<buildRoot>/<saberId>`, by default a folder of the Windows user's own
 * (userBuildRoot): never the shared toolchain folder, so another run's files cannot block it.
 */
export async function buildFirmware(opts: { toolchainRoot: string; buildRoot?: string; saberId: string; model: SaberConfigModel; onLine?: Progress; force?: boolean; customPropsDir?: string }): Promise<BuildResult> {
  const onLine = opts.onLine ?? (() => {});
  const t0 = Date.now();
  const p = toolchainPaths(opts.toolchainRoot);
  const fqbn = FQBN[opts.model.board];
  const flashBytes = FLASH_BYTES[opts.model.board];
  // The model is checked before anything is written (FW16): a bad config name never reaches a path.
  const errors = validateModel(opts.model);
  if (errors.length) return { ok: false, cached: false, ms: Date.now() - t0, configPath: '', configHash: '', flashBytes, warnings: [], manifest: null, os: PROFFIEOS_TAG, board: opts.model.board, dfuPath: null, textBytes: null, flashPct: null, problems: errors, output: '' };
  const gen = generateConfig(opts.model);
  const buildRoot = opts.buildRoot ?? userBuildRoot();
  const saberDir = join(buildRoot, opts.saberId.replace(/[^A-Za-z0-9_-]/g, '_'));
  // Every file the build writes stays inside the saber's own build folder.
  const inside = (path: string) => { if (!resolve(path).startsWith(resolve(saberDir) + sep)) throw new Error(`Refusing to write outside the build folder: ${path}`); return path; };
  const cacheKey = createHash('sha256').update(`${gen.hash}|${PROFFIEOS_TAG}|${fqbn}`).digest('hex').slice(0, 16);
  const cacheDir = inside(join(saberDir, 'cache', cacheKey));
  const configPath = inside(join(saberDir, `${opts.model.name}.h`));
  await ensureBuildRoot(buildRoot);
  await mkdir(saberDir, { recursive: true });
  await writeFile(configPath, gen.text, 'utf8');
  const base = { configPath, configHash: gen.hash, flashBytes, warnings: gen.warnings, manifest: gen.manifest, os: PROFFIEOS_TAG, board: opts.model.board };

  // A custom prop file: the version the owner chose, from the app's own copy, checked against its hash.
  let customProp: { name: string; text: string } | null = null;
  if (opts.model.prop === 'custom' && opts.model.customProp) {
    try {
      if (!opts.customPropsDir) throw new Error('Custom prop files are not available here.');
      customProp = { name: customPropFileName(opts.model.customProp), text: await readCustomProp(opts.customPropsDir, opts.model.customProp) };
    } catch (err) {
      const problem = err instanceof Error ? err.message : String(err);
      onLine(`build stopped before compiling: ${problem}`);
      return { ...base, ok: false, cached: false, ms: Date.now() - t0, dfuPath: null, textBytes: null, flashPct: null, problems: [problem], output: '' };
    }
  }

  // Options the chosen prop refuses together, caught from its own rules before the compiler runs (FW14).
  const propFile = /#ifdef CONFIG_PROP\s*\n#include "([^"]+)"/.exec(gen.text)?.[1];
  if (propFile) {
    let propText: string | null = customProp?.text ?? null;
    if (!customProp) { try { propText = await readFile(join(p.osDir, 'props', basename(propFile)), 'utf8'); } catch { /* not readable: the compiler still checks */ } }
    if (propText) {
      let ino = '';
      try { ino = await readFile(join(p.osDir, 'ProffieOS.ino'), 'utf8'); } catch { /* unknown */ }
      const maybe = new Set([...`${ino}\n${propText}`.matchAll(/^\s*#define\s+(\w+)/gm)].map((m) => m[1]));
      const defines = configDefines(gen.text);
      for (const d of defines) maybe.delete(d);
      const conflicts = propRuleProblems(propText, defines, opts.model.buttons, maybe);
      if (conflicts.length) {
        onLine(`build stopped before compiling: ${conflicts[0]}`);
        return { ...base, ok: false, cached: false, ms: Date.now() - t0, dfuPath: null, textBytes: null, flashPct: null, problems: conflicts, output: '' };
      }
    }
  }

  const cachedDfu = join(cacheDir, 'ProffieOS.ino.dfu');
  if (!opts.force && (await exists(cachedDfu))) {
    const meta = JSON.parse(await readFile(join(cacheDir, 'result.json'), 'utf8')) as { textBytes: number | null; maxSize?: number };
    const cap = meta.maxSize ?? flashBytes;
    onLine(`using the cached build ${cacheKey}`);
    return { ...base, flashBytes: cap, ok: true, cached: true, ms: Date.now() - t0, dfuPath: cachedDfu, textBytes: meta.textBytes, flashPct: meta.textBytes ? Math.round((meta.textBytes / cap) * 100) : null, problems: [], output: '' };
  }

  const sketch = await prepareSketch(p, saberDir, onLine);
  await writeFile(inside(join(sketch, 'config', `${opts.model.name}.h`)), gen.text, 'utf8');
  // Beside the stock props, so its own #includes of them work; under a name of its own, so none is replaced.
  if (customProp) { await writeFile(inside(join(sketch, 'props', customProp.name)), customProp.text, 'utf8'); onLine(`using the custom prop file ${opts.model.customProp?.file} as props/${customProp.name}`); }
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
  let json: { success?: boolean; compiler_err?: string; compiler_out?: string; builder_result?: { executable_sections_size?: { name: string; size: number; max_size?: number }[] } } | null = null;
  try { json = JSON.parse(r.stdout); } catch { /* hard failure prints no json */ }
  const stderr = (json?.compiler_err ?? '') + r.stderr;
  const ok = r.code === 0 && json?.success !== false;
  const textSection = json?.builder_result?.executable_sections_size?.find((s) => s.name === '.text' || s.name === 'text');
  const text = textSection?.size ?? null;
  // The board's real capacity, as arduino-cli reports it for this build; else the declared table (FW13).
  const cap = textSection?.max_size && textSection.max_size > 0 ? textSection.max_size : flashBytes;
  const output = ((json?.compiler_out ?? '') + '\n' + stderr).trim();
  for (const l of (json?.compiler_out ?? '').split(/\r?\n/)) if (l.trim()) onLine(l.trim());
  if (!ok) {
    const problems = translateErrors(stderr, { configFile: `${opts.model.name}.h`, slotLines: gen.slotLines, presetNames: opts.model.presets.map((x) => x.name) });
    onLine(`build failed: ${problems[0] ?? 'unknown error'}`);
    return { ...base, flashBytes: cap, ok: false, cached: false, ms: r.ms, dfuPath: null, textBytes: text, flashPct: null, problems, output };
  }
  const dfu = join(buildPath, 'ProffieOS.ino.dfu');
  if (!(await exists(dfu))) return { ...base, ok: false, cached: false, ms: r.ms, dfuPath: null, textBytes: text, flashPct: null, problems: ['The build finished but produced no firmware file.'], output };
  await mkdir(cacheDir, { recursive: true });
  await cp(dfu, cachedDfu);
  await writeFile(join(cacheDir, 'result.json'), JSON.stringify({ textBytes: text, maxSize: cap, fqbn, hash: gen.hash, at: new Date().toISOString() }), 'utf8');
  // Keep only a handful of cached builds per saber.
  try {
    const entries = (await readdir(join(saberDir, 'cache'))).filter((n) => n !== cacheKey);
    if (entries.length > 4) for (const old of entries.slice(0, entries.length - 4)) await rm(join(saberDir, 'cache', old), { recursive: true, force: true });
  } catch { /* ignore */ }
  onLine(`build ok in ${(r.ms / 1000).toFixed(1)} s · .text ${text ?? '?'} of ${cap} bytes (capacity ${textSection?.max_size ? 'reported by arduino-cli' : 'from the board table'})`);
  return { ...base, flashBytes: cap, ok: true, cached: false, ms: r.ms, dfuPath: cachedDfu, textBytes: text, flashPct: text ? Math.round((text / cap) * 100) : null, problems: [], output };
}
