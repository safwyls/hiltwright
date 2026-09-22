// Build the ProffieOS style catalogue from the OS source: every template in styles/, functions/ and transitions/,
// with its parameters, their defaults, and the documentation comment where the source has one. Run with Node 24:
//
//   node scripts/catalogue.ts <ProffieOS dir> > ../../packages/core/src/proffieCatalogue.ts
//
// The catalogue is what the style editor offers and what the parser checks against. Regenerate it when the
// pinned ProffieOS version changes.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface Param { name: string; kind: string; default: string | null; doc: string }
export interface Entry { name: string; kind: string; params: Param[]; doc: string; file: string; variadic: boolean; internal?: boolean; alias?: string }

const root = process.argv[2];
if (!root) { console.error('usage: catalogue.ts <ProffieOS dir>'); process.exit(2); }

const out: Record<string, Entry> = {};
const files: string[] = [];
for (const d of ['styles', 'functions', 'transitions']) for (const f of readdirSync(join(root, d))) if (f.endsWith('.h')) files.push(join(d, f));

const kindOfReturn = (s: string): string => {
  const t = s.toUpperCase();
  if (t.startsWith('COLOR') || t.startsWith('LAYER')) return 'COLOR';
  if (t.startsWith('FUNCTION')) return 'FUNCTION';
  if (t.startsWith('TRANSITION')) return 'TRANSITION';
  if (t.startsWith('INTEGER')) return 'FUNCTION'; // Int<N> and friends: used wherever a function is wanted
  return 'OTHER';
};

function splitTop(s: string): string[] {
  const parts: string[] = []; let depth = 0; let cur = '';
  for (const ch of s) {
    if (ch === '<' || ch === '(') depth++;
    if (ch === '>' || ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

const FUNCTION_HEADS = /^(Int<|Scale<|Sin<|Saw<|SwingSpeed|BladeAngle|TwistAngle|NoisySoundLevel|SoundLevel|SmoothSoundLevel|BatteryLevel|Bump<|SmoothStep<|Trigger<|Ifon|InOutFunc|Sum<|Mult<|Subtract<|Percentage<|Divide<|IsLessThan|IsBetween|LayerFunctions|CenterDistF|LinearSectionF|CircularSectionF|BlinkingF|Variation|AltF|SyncAlt|RandomF|RandomPerLEDF|BrownNoiseF|SlowNoise|HumpFlickerF|SparkleF|ClashImpactF|WavLen|EffectPosition|EffectIncrementF|IncrementF|ThresholdPulseF|Remap|HoldPeakF|EffectRandomF|TwistAcceleration|SwingAcceleration|TimeSinceEffect|Mod<|EffectPulseF|PulsingF|Sequence|MarbleF|OnSparkF|WaveF|SlowNoise|VolumeLevel|LengthFinder|ColorSelect|IntSelect|Divide)/;
const TRANSITION_HEADS = /^Tr[A-Z]/;
const COLOR_HEADS = /^(Rgb<|Rgb16<|RgbArg<|Black$|White$|Red$|Green$|Blue$|Yellow$|Cyan$|Magenta$|Orange|Mix<|Layers<|AlphaL<|Gradient|Stripes|Rainbow|Pulsing|AudioFlicker|Blinking|Transparent|OrangeRed|DeepSkyBlue|DodgerBlue|LemonChiffon|Rotate|BrownNoiseFlicker|HumpFlicker|RandomFlicker|RandomPerLEDFlicker|Sparkle|StyleFire|Fire|ColorChange|Cylon|Lockup|ResponsiveLockupL|Simple|Blast|Style|InOutHelper|ColorSequence|EasyBlade|Strobe|Color)/;

function kindFromDefault(def: string | null): string | null {
  if (!def) return null;
  if (/^-?\d+$/.test(def)) return 'INTEGER';
  if (/^(EFFECT_|SaberBase::EFFECT_)/.test(def)) return 'EFFECT';
  if (/^(SaberBase::LOCKUP_|LOCKUP_)/.test(def)) return 'LOCKUP_TYPE';
  if (TRANSITION_HEADS.test(def)) return 'TRANSITION';
  if (FUNCTION_HEADS.test(def)) return 'FUNCTION';
  if (COLOR_HEADS.test(def)) return 'COLOR';
  return null;
}

function paramKind(decl: string, name: string, def: string | null, docLine: string): string {
  const fromDefault = kindFromDefault(def);
  if (fromDefault) return fromDefault;
  if (/^(int|bool|uint8_t|uint16_t|uint32_t|float|size_t)\b/.test(decl)) return 'INTEGER';
  if (/^BladeEffectType\b/.test(decl)) return 'EFFECT';
  if (/LockupType\b/.test(decl)) return 'LOCKUP_TYPE';
  const n = name.toUpperCase(); const d = docLine.toUpperCase();
  if (/\bTR\d*$|TRANSITION|^TR_|_TR$|OUT_TR|IN_TR/.test(n) || /\bTRANSITION\b/.test(d)) return 'TRANSITION';
  if (/COLOR|^(BASE|A|B|C|C1|C2|C3|LAYER|L\d|OFF|SPARK)$/.test(n) || /\bCOLOR\b/.test(d)) return 'COLOR';
  if (/^EFFECT/.test(n)) return 'EFFECT';
  if (/MILLIS|^MS$|RPM|PERIOD|PERCENT|^N$|^TIME|DELAY|GRADE|PROMILLE|INTENSITY|WIDTH$|COUNT|SECONDS/.test(n) && /_FUNCTION|^F$/.test(n) === false && !/FUNCTION/.test(d)) return 'INTEGER';
  return 'FUNCTION';
}

/** Helpers, test types and display/POV styles: real declarations, but nothing a blade style would name. */
const INTERNAL_NAME = /Finder\d*$|Helper\d$|Selector$|^AddBend$|^SVFWrapper$|^F$|^Style$|POV|Display|ShowColor|GetArgMax|FromFile|FromHumFile|^ByteOrderStyle$|^ChargingStyle$|^Compose$|LARGE_TYPE|^Rgba16$|^MixHelper|^LengthFinder$|^FireConfig$|^TrConcat[23]$|^BulletCountF$|^Blaster|^InOutHelperF$/;

const seenDocs = new Map<string, { kind: string; doc: string; paramDocs: Record<string, string> }>();

for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8');
  const lines = text.split(/\r?\n/);
  // 1. Documentation blocks: "// Usage: NAME<...>" and "// or: NAME<...>" lines, "// NAME: doc", "// return value: KIND".
  for (let i = 0; i < lines.length; i++) {
    const m = /^\/\/ Usage: ([A-Za-z_][A-Za-z0-9_]*)/.exec(lines[i]);
    if (!m) continue;
    const names = [m[1]];
    const paramDocs: Record<string, string> = {}; const free: string[] = []; let kind = 'OTHER';
    for (let j = i + 1; j < lines.length && lines[j].startsWith('//'); j++) {
      const l = lines[j].replace(/^\/\/ ?/, '');
      const alias = /^or: ([A-Za-z_][A-Za-z0-9_]*)/i.exec(l); if (alias) { names.push(alias[1]); continue; }
      const r = /^return value: (.*)$/.exec(l); if (r) { kind = kindOfReturn(r[1]); continue; }
      const p = /^([A-Z][A-Z0-9_ ,&]*?):\s+(.*)$/.exec(l);
      if (p) { for (const pn of p[1].split(/[,&]/).map((x) => x.trim()).filter(Boolean)) paramDocs[pn] = p[2]; continue; }
      if (l.trim() && !/^Usage:/.test(l)) free.push(l.trim());
    }
    for (const n of names) seenDocs.set(n, { kind, doc: free.join(' '), paramDocs });
  }
  // 2. Every declaration: template<PARAMS> using NAME = ...;  and  template<PARAMS> class NAME
  const flat = text.replace(/\r?\n/g, '\n');
  const declRe = /template\s*<([^;{]*?)>\s*(using|class|struct)\s+([A-Za-z_][A-Za-z0-9_]*)\b(?:\s*=\s*([^;]*);)?/g;
  let dm: RegExpExecArray | null;
  while ((dm = declRe.exec(flat))) {
    const [, paramsText, what, name, rhs] = dm;
    if (out[name] && out[name].params.length) continue; // first declaration wins (aliases repeat with X variants)
    const docs = seenDocs.get(name);
    const params: Param[] = []; let variadic = false;
    for (const raw of splitTop(paramsText.replace(/\s+/g, ' ').trim())) {
      const pm = /^(class|typename|int|bool|uint8_t|uint16_t|uint32_t|float|size_t|BladeEffectType|LockupType|SaberBase::LockupType)\s*(\.\.\.)?\s*([A-Za-z_][A-Za-z0-9_]*)?\s*(?:=\s*([\s\S]*))?$/.exec(raw);
      if (!pm) continue;
      if (pm[2]) variadic = true;
      const pname = pm[3] ?? 'ARG';
      const def = pm[4]?.trim() ?? null;
      params.push({ name: pname, kind: paramKind(raw, pname, def, docs?.paramDocs[pname] ?? ''), default: def, doc: docs?.paramDocs[pname] ?? '' });
    }
    // Rules the names make plain: a ...Tr parameter is a transition; in functions/ a bare A or B is a function; an
    // X-suffixed template takes functions where its plain twin takes numbers.
    for (const p of params) {
      if (/Tr$|^TR\d*$|TRANSITION/i.test(p.name) && p.kind !== 'TRANSITION' && !p.default) p.kind = 'TRANSITION';
      if (file.startsWith('functions') && /^[AB]$/.test(p.name) && p.kind === 'COLOR') p.kind = 'FUNCTION';
      if (/X$/.test(name) && p.kind === 'INTEGER' && !/^(int|bool|uint|float|size_t)/.test(paramsText)) p.kind = 'FUNCTION';
      if (file.startsWith('transitions') && variadic && p === params[params.length - 1] && p.kind === 'FUNCTION') p.kind = 'TRANSITION'; // TrJoin<TR...>, TrRandom<TR...>
    }
    let kind = docs?.kind ?? 'OTHER';
    if (kind === 'OTHER') kind = file.startsWith('transitions') ? 'TRANSITION' : file.startsWith('functions') ? 'FUNCTION' : /L$|Layer/.test(name) ? 'COLOR' : /F$|Func$/.test(name) ? 'FUNCTION' : 'COLOR';
    const internal = (/SVF$|Base$|Helper$|Impl$|X$|^Layers$|^Sequence$/.test(name) && !docs) || INTERNAL_NAME.test(name);
    // The alias body, when it is plain template text the simulator can substitute into (no arithmetic or decltype).
    const alias = what === 'using' && rhs ? rhs.replace(/\s+/g, '') : '';
    const usable = alias && /^[A-Za-z0-9_:<>,.-]+$/.test(alias) && !/[A-Za-z0-9_]\s*[*+/]\s*[A-Za-z0-9_]/.test(rhs ?? '');
    out[name] = { name, kind, params, doc: docs?.doc ?? '', file, variadic, ...(internal ? { internal: true } : {}), ...(usable ? { alias } : {}) };
  }
  // 3. Plain aliases and classes without template parameters (Rainbow, TrInstant, Black ...).
  for (const am of flat.matchAll(/^(?:using|typedef)\s+(?:([A-Za-z_][A-Za-z0-9_<>, ]*?)\s+)?([A-Z][A-Za-z0-9_]*)\s*(?:=\s*([^;]+))?;/gm)) {
    const name = am[2];
    if (out[name]) continue;
    const docs = seenDocs.get(name);
    let kind = docs?.kind ?? 'OTHER';
    const rhs = am[3] ?? am[1] ?? '';
    if (kind === 'OTHER') kind = kindFromDefault(rhs.trim()) ?? (file.startsWith('transitions') ? 'TRANSITION' : file.startsWith('functions') ? 'FUNCTION' : 'COLOR');
    out[name] = { name, kind, params: [], doc: docs?.doc ?? (kind === 'COLOR' && /Rgb</.test(rhs) ? rhs.replace(/\s+/g, '').replace(/^Rgb</, 'rgb(').replace(/>$/, ')') : ''), file, variadic: false, ...(INTERNAL_NAME.test(name) ? { internal: true } : {}) };
  }
  for (const cm of flat.matchAll(/^class\s+([A-Z][A-Za-z0-9_]*)\s*(?::[^{]*)?\{/gm)) {
    const name = cm[1];
    if (out[name]) continue;
    const docs = seenDocs.get(name);
    if (!docs) continue; // undocumented plain classes are internals
    out[name] = { name, kind: docs.kind === 'OTHER' ? (file.startsWith('transitions') ? 'TRANSITION' : 'FUNCTION') : docs.kind, params: [], doc: docs.doc, file, variadic: false, ...(INTERNAL_NAME.test(name) ? { internal: true } : {}) };
  }
}

// Layers is special: BASE then any number of layers.
if (out.Layers) { out.Layers.params = [{ name: 'BASE', kind: 'COLOR', default: null, doc: 'The colour underneath' }, { name: 'LAYER', kind: 'COLOR', default: null, doc: 'A layer painted over what is below' }]; out.Layers.variadic = true; delete out.Layers.internal; }

const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
process.stdout.write(`// Generated by apps/desktop/scripts/catalogue.ts from the ProffieOS source. Do not edit by hand.
export default ${JSON.stringify(sorted, null, 1)};
`);
console.error(`${Object.keys(sorted).length} entries, ${Object.values(sorted).filter((e) => e.doc).length} documented`);
