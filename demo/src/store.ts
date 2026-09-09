import { create } from 'zustand';
import { FONTS, LOOKS, SABERS } from './data';
import {
  ROLE_META, bladeRange, flashEstimate, freeDataPin, freePowerPin, uid,
  type Blade, type BladeType, type Board, type Font, type Preset, type Role, type Saber, type Variant, type Wiring,
} from './model';

export type BuildStep = 'backup' | 'build' | 'reboot' | 'write' | 'verify' | 'restore';
export const BUILD_STEPS: { id: BuildStep; label: string; sub: string; ms: number }[] = [
  { id: 'backup', label: 'Back up', sub: '256 KB flash + presets.ini', ms: 1200 },
  { id: 'build', label: 'Build firmware', sub: 'about 1 min on a real machine', ms: 6000 },
  { id: 'reboot', label: 'Reboot to bootloader', sub: 'automatic', ms: 1400 },
  { id: 'write', label: 'Write firmware', sub: 'about 1 min on a real machine', ms: 5000 },
  { id: 'verify', label: 'Verify', sub: 'reads version', ms: 1000 },
  { id: 'restore', label: 'Restore presets', sub: 'presets.ini', ms: 800 },
];

export interface BuildState {
  status: 'idle' | 'running' | 'done' | 'failed' | 'cancelled';
  stepIndex: number;
  elapsedMs: number;
  stepMs: number;
  log: string[];
  finishedAt: string | null;
}

export interface WizardState {
  step: number;
  name: string;
  board: Board;
  blades: Blade[];
  openBlade: string | null;
  swappable: boolean;
  variants: Variant[];
  measuring: string | null;
  driver: boolean;
}

export interface Snapshot { time: string; label: string; presets: Preset[] }

interface State {
  sabers: Saber[];
  activeId: string;
  connectedId: string | null;
  looks: typeof LOOKS;
  fonts: Font[];
  sdMounted: boolean;
  selectedPresetId: string;
  selectedLookId: string;
  lookFilters: string[];
  savedAt: number;
  snapshots: Snapshot[];
  build: BuildState;
  wizard: WizardState;
  console: { dir: 'in' | 'out'; text: string }[];
  toast: string | null;

  setActive(id: string): void;
  active(): Saber;
  // presets
  selectPreset(id: string): void;
  updatePreset(id: string, patch: Partial<Preset>, label?: string): void;
  reorderPresets(from: number, to: number): void;
  addPreset(): void;
  duplicatePreset(id: string): void;
  deletePreset(id: string): void;
  restoreSnapshot(i: number): void;
  undo(): void;
  // looks
  selectLook(id: string): void;
  toggleLookFilter(f: string): void;
  addLookToSaber(lookId: string): void;
  // build
  startBuild(): void;
  cancelBuild(): void;
  // fonts
  fixFont(id: string): void;
  toggleMount(): void;
  convertAndCopy(): void;
  // wizard
  wizardReset(): void;
  wizardSet(patch: Partial<WizardState>): void;
  wizardCount(n: number): void;
  wizardUpdateBlade(id: string, patch: Partial<Blade>): void;
  wizardSetRole(id: string, role: Role): void;
  wizardSetType(id: string, type: BladeType): void;
  wizardSetWiring(id: string, w: Wiring): void;
  wizardAddVariant(): void;
  wizardUpdateVariant(id: string, patch: Partial<Variant>): void;
  wizardRemoveVariant(id: string): void;
  wizardMeasure(id: string): void;
  wizardFinish(): void;
  // diagnostics
  sendCommand(cmd: string): void;
  showToast(text: string): void;
}

const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function newBlade(role: Role, blades: Blade[], board: Board): Blade {
  const type = ROLE_META[role].defaultType;
  const main = blades.find((b) => b.role === 'main');
  let wiring: Wiring;
  if (type === 'pixel') {
    wiring = role === 'crystal' && main ? { kind: 'chain', after: main.id } : { kind: 'own', dataPin: freeDataPin(blades, board), powerPins: [freePowerPin(blades)] };
  } else {
    wiring = { kind: 'power', pin: freePowerPin(blades) };
  }
  const pixels = role === 'main' ? 132 : role === 'side' ? 20 : role === 'crystal' ? 6 : type === 'pixel' ? 8 : 1;
  return { id: uid('b'), role, type, pixels, chip: 'WS2812B', order: 'GRB', ledColor: '#ffffff', parallel: 1, wiring };
}

const ROLE_ORDER: Role[] = ['main', 'crystal', 'accent', 'motor', 'side', 'side', 'accent', 'accent'];

function freshWizard(): WizardState {
  const blades: Blade[] = [];
  blades.push(newBlade('main', blades, 'V2.2'));
  return { step: 1, name: 'New saber', board: 'V2.2', blades, openBlade: blades[0].id, swappable: false, variants: [], measuring: null, driver: false };
}

let buildTimer: ReturnType<typeof setInterval> | null = null;

export const useStore = create<State>((set, get) => ({
  sabers: SABERS,
  activeId: 'graflex',
  connectedId: 'graflex',
  looks: LOOKS,
  fonts: FONTS,
  sdMounted: true,
  selectedPresetId: 'p2',
  selectedLookId: 'corruption',
  lookFilters: [],
  savedAt: Date.now() - 2000,
  snapshots: [
    { time: '12:04', label: 'Base colour changed', presets: SABERS[0].presets },
    { time: '11:58', label: 'Presets reordered', presets: SABERS[0].presets },
    { time: '11:40', label: 'Before install · full backup', presets: SABERS[0].presets },
  ],
  build: { status: 'idle', stepIndex: 0, elapsedMs: 0, stepMs: 0, log: [], finishedAt: null },
  wizard: freshWizard(),
  console: [
    { dir: 'in', text: 'version' },
    { dir: 'out', text: 'ProffieOS v8.10 · config/hiltwright_graflex.h · prop: SaberFett263Buttons · buttons: 2 · installed: Sep 7 2026 21:48:57' },
  ],
  toast: null,

  setActive: (id) => set((s) => ({ activeId: id, selectedPresetId: s.sabers.find((x) => x.id === id)?.presets[0]?.id ?? '' })),
  active: () => get().sabers.find((s) => s.id === get().activeId) ?? get().sabers[0],

  selectPreset: (id) => set({ selectedPresetId: id }),
  updatePreset: (id, patch, label = 'Preset edited') => set((s) => {
    const saber = s.sabers.find((x) => x.id === s.activeId)!;
    const snap: Snapshot = { time: now(), label, presets: saber.presets };
    const presets = saber.presets.map((p) => {
      if (p.id !== id) return p;
      const next = { ...p, ...patch };
      if (next.crystalLinked) next.crystalColor = next.colors.base;
      return next;
    });
    return { sabers: s.sabers.map((x) => (x.id === saber.id ? { ...x, presets } : x)), savedAt: Date.now(), snapshots: [snap, ...s.snapshots].slice(0, 12) };
  }),
  reorderPresets: (from, to) => set((s) => {
    const saber = s.sabers.find((x) => x.id === s.activeId)!;
    if (from === to || to < 0 || to >= saber.presets.length) return {};
    const presets = [...saber.presets];
    const [m] = presets.splice(from, 1);
    presets.splice(to, 0, m);
    const snap: Snapshot = { time: now(), label: 'Presets reordered', presets: saber.presets };
    return { sabers: s.sabers.map((x) => (x.id === saber.id ? { ...x, presets } : x)), savedAt: Date.now(), snapshots: [snap, ...s.snapshots].slice(0, 12) };
  }),
  addPreset: () => set((s) => {
    const saber = s.sabers.find((x) => x.id === s.activeId)!;
    const base = saber.presets[0];
    const p: Preset = { ...base, id: uid('p'), name: `Preset ${saber.presets.length + 1}`, looks: { ...base.looks }, colors: { ...base.colors } };
    const snap: Snapshot = { time: now(), label: 'Preset added', presets: saber.presets };
    return { sabers: s.sabers.map((x) => (x.id === saber.id ? { ...x, presets: [...x.presets, p] } : x)), selectedPresetId: p.id, savedAt: Date.now(), snapshots: [snap, ...s.snapshots].slice(0, 12) };
  }),
  duplicatePreset: (id) => set((s) => {
    const saber = s.sabers.find((x) => x.id === s.activeId)!;
    const i = saber.presets.findIndex((p) => p.id === id);
    const src = saber.presets[i];
    const p: Preset = { ...src, id: uid('p'), name: `${src.name} copy`, looks: { ...src.looks }, colors: { ...src.colors } };
    const presets = [...saber.presets];
    presets.splice(i + 1, 0, p);
    const snap: Snapshot = { time: now(), label: 'Preset duplicated', presets: saber.presets };
    return { sabers: s.sabers.map((x) => (x.id === saber.id ? { ...x, presets } : x)), selectedPresetId: p.id, savedAt: Date.now(), snapshots: [snap, ...s.snapshots].slice(0, 12) };
  }),
  deletePreset: (id) => set((s) => {
    const saber = s.sabers.find((x) => x.id === s.activeId)!;
    if (saber.presets.length <= 1) return {};
    const presets = saber.presets.filter((p) => p.id !== id);
    const snap: Snapshot = { time: now(), label: 'Preset deleted', presets: saber.presets };
    return { sabers: s.sabers.map((x) => (x.id === saber.id ? { ...x, presets } : x)), selectedPresetId: presets[0].id, savedAt: Date.now(), snapshots: [snap, ...s.snapshots].slice(0, 12) };
  }),
  restoreSnapshot: (i) => set((s) => {
    const snap = s.snapshots[i];
    if (!snap) return {};
    const saber = s.sabers.find((x) => x.id === s.activeId)!;
    return { sabers: s.sabers.map((x) => (x.id === saber.id ? { ...x, presets: snap.presets } : x)), selectedPresetId: snap.presets[0]?.id ?? '', savedAt: Date.now(), snapshots: s.snapshots.slice(i + 1), toast: `Restored snapshot from ${snap.time}` };
  }),
  undo: () => get().restoreSnapshot(0),

  selectLook: (id) => set({ selectedLookId: id }),
  toggleLookFilter: (f) => set((s) => ({ lookFilters: s.lookFilters.includes(f) ? s.lookFilters.filter((x) => x !== f) : [...s.lookFilters, f] })),
  addLookToSaber: (lookId) => set((s) => ({
    sabers: s.sabers.map((x) => (x.id === s.activeId && !x.compiled.includes(lookId) && !x.pending.includes(lookId) ? { ...x, pending: [...x.pending, lookId] } : x)),
    toast: `${s.looks.find((l) => l.id === lookId)?.name} queued. Install it from Build & Install.`,
  })),

  startBuild: () => {
    const s = get();
    if (s.build.status === 'running') return;
    if (buildTimer) clearInterval(buildTimer);
    const saber = s.active();
    const est = flashEstimate(saber, s.looks);
    set({ build: { status: 'running', stepIndex: 0, elapsedMs: 0, stepMs: 0, log: [`${now()}  backup written · ${saber.id}-${new Date().toISOString().slice(0, 10)}.bin`], finishedAt: null } });
    const started = Date.now();
    let lastLogStep = -1;
    buildTimer = setInterval(() => {
      const st = get();
      if (st.build.status !== 'running') { if (buildTimer) clearInterval(buildTimer); return; }
      const elapsed = Date.now() - started;
      let acc = 0;
      let idx = BUILD_STEPS.length;
      let stepMs = 0;
      for (let i = 0; i < BUILD_STEPS.length; i++) {
        if (elapsed < acc + BUILD_STEPS[i].ms) { idx = i; stepMs = elapsed - acc; break; }
        acc += BUILD_STEPS[i].ms;
      }
      const log = [...st.build.log];
      if (idx !== lastLogStep) {
        lastLogStep = idx;
        const lines: Record<number, string> = {
          1: `${now()}  generating config · ${saber.presets.length} presets · ${est.libCount} looks · ${saber.blades.length} blades`,
          2: `${now()}  compiled · .text ${(est.used * 1024).toFixed(0)} bytes · ${est.pct}% of ${saber.flashKB} KB`,
          3: `${now()}  STM32 BOOTLOADER 0483:df11 found · WinUSB · writing ${(est.used).toFixed(1)} KB`,
          4: `${now()}  :leave · waiting for the serial port`,
          5: `${now()}  version → ProffieOS v8.10 · hiltwright_${saber.id}.h · installed ${now()}`,
        };
        if (lines[idx]) log.push(lines[idx]);
        if (idx === 1) log.push(`${now()}  compiling · Layers, TransitionEffectL, LockupTrL …`);
      }
      if (idx >= BUILD_STEPS.length) {
        if (buildTimer) clearInterval(buildTimer);
        log.push(`${now()}  presets.ini restored · done`);
        set((cur) => ({
          build: { status: 'done', stepIndex: BUILD_STEPS.length, elapsedMs: elapsed, stepMs: 0, log, finishedAt: now() },
          sabers: cur.sabers.map((x) => (x.id === saber.id ? { ...x, compiled: [...x.compiled, ...x.pending], pending: [], fw: `OS 8.10 · ${now()}`, lastBackup: `${now()} today` } : x)),
          toast: 'Firmware installed and verified.',
        }));
        return;
      }
      set({ build: { ...st.build, stepIndex: idx, elapsedMs: elapsed, stepMs, log } });
    }, 120);
  },
  cancelBuild: () => {
    if (buildTimer) clearInterval(buildTimer);
    set((s) => ({ build: { ...s.build, status: 'cancelled', log: [...s.build.log, `${now()}  cancelled before writing · saber untouched`] } }));
  },

  fixFont: (id) => set((s) => ({ fonts: s.fonts.map((f) => (f.id === id ? { ...f, issue: null, rate: '44.1 kHz', type: f.type === 'Mixed' ? 'Polyphonic' : f.type } : f)), toast: 'Fixed. The original file was kept.' })),
  toggleMount: () => set((s) => ({ sdMounted: !s.sdMounted, toast: s.sdMounted ? 'Card ejected. The saber can play sound again.' : 'Card mounted through the saber.' })),
  convertAndCopy: () => set((s) => (s.fonts.some((f) => f.name === 'Jedi Temple') ? { toast: 'Jedi Temple is already on the card.' } : {
    fonts: [...s.fonts, { id: uid('f'), name: 'Jedi Temple', type: 'Polyphonic', rate: '44.1 kHz', size: '36 MB', issue: null }],
    toast: 'Converted 41 files and copied Jedi Temple to the card.',
  })),

  wizardReset: () => set({ wizard: freshWizard() }),
  wizardSet: (patch) => set((s) => ({ wizard: { ...s.wizard, ...patch } })),
  wizardCount: (n) => set((s) => {
    const w = s.wizard;
    const target = Math.max(1, Math.min(8, n));
    let blades = [...w.blades];
    while (blades.length < target) blades.push(newBlade(ROLE_ORDER[blades.length] ?? 'accent', blades, w.board));
    while (blades.length > target) blades.pop();
    // Drop chains that point at removed blades.
    blades = blades.map((b) => (b.wiring.kind === 'chain' && !blades.some((x) => x.id === (b.wiring as { after: string }).after) ? { ...b, wiring: { kind: 'own', dataPin: freeDataPin(blades, w.board), powerPins: [freePowerPin(blades)] } } : b));
    const openBlade = blades.some((b) => b.id === w.openBlade) ? w.openBlade : blades[blades.length - 1].id;
    return { wizard: { ...w, blades, openBlade } };
  }),
  wizardUpdateBlade: (id, patch) => set((s) => ({ wizard: { ...s.wizard, blades: s.wizard.blades.map((b) => (b.id === id ? { ...b, ...patch } : b)) } })),
  wizardSetRole: (id, role) => set((s) => {
    const w = s.wizard;
    const others = w.blades.filter((b) => b.id !== id);
    const type = ROLE_META[role].defaultType;
    return { wizard: { ...w, blades: w.blades.map((b) => {
      if (b.id !== id) return b;
      const fresh = newBlade(role, others, w.board);
      return { ...b, role, type, pixels: b.type === type && type === 'pixel' ? b.pixels : fresh.pixels, wiring: b.type === type ? b.wiring : fresh.wiring };
    }) } };
  }),
  wizardSetType: (id, type) => set((s) => {
    const w = s.wizard;
    const others = w.blades.filter((b) => b.id !== id);
    return { wizard: { ...w, blades: w.blades.map((b) => {
      if (b.id !== id) return b;
      if (b.type === type) return b;
      const wiring: Wiring = type === 'pixel' ? { kind: 'own', dataPin: freeDataPin(others, w.board), powerPins: [freePowerPin(others)] } : { kind: 'power', pin: freePowerPin(others) };
      return { ...b, type, pixels: type === 'pixel' ? Math.max(b.pixels, 1) : type === 'star' ? 3 : 1, wiring };
    }) } };
  }),
  wizardSetWiring: (id, wiring) => set((s) => ({ wizard: { ...s.wizard, blades: s.wizard.blades.map((b) => (b.id === id ? { ...b, wiring } : b)) } })),
  wizardAddVariant: () => set((s) => {
    const main = s.wizard.blades.find((b) => b.role === 'main');
    const n = s.wizard.variants.length;
    const v: Variant = n === 0
      ? { id: uid('v'), name: 'Standard blade', pixels: main?.pixels ?? 132, ohms: null }
      : n === 1 ? { id: uid('v'), name: 'Short blade', pixels: Math.round((main?.pixels ?? 132) * 0.66), ohms: null }
      : { id: uid('v'), name: 'No blade', pixels: 0, ohms: null };
    return { wizard: { ...s.wizard, variants: [...s.wizard.variants, v] } };
  }),
  wizardUpdateVariant: (id, patch) => set((s) => ({ wizard: { ...s.wizard, variants: s.wizard.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) } })),
  wizardRemoveVariant: (id) => set((s) => ({ wizard: { ...s.wizard, variants: s.wizard.variants.filter((v) => v.id !== id) } })),
  wizardMeasure: (id) => {
    set((s) => ({ wizard: { ...s.wizard, measuring: id } }));
    setTimeout(() => set((s) => {
      const i = s.wizard.variants.findIndex((v) => v.id === id);
      const readings = [33000, 10000, 4700, 2200, 1000];
      const ohms = s.wizard.variants[i]?.pixels === 0 ? null : readings[i % readings.length];
      return { wizard: { ...s.wizard, measuring: null, variants: s.wizard.variants.map((v) => (v.id === id ? { ...v, ohms } : v)) }, toast: ohms === null ? 'Read open circuit: no blade. Saved as the no-blade configuration.' : `Read ${(ohms / 1000).toFixed(1)} kΩ from the plugged-in blade.` };
    }), 900);
  },
  wizardFinish: () => set((s) => {
    const w = s.wizard;
    const id = uid('saber');
    const mainId = w.blades.find((b) => b.role === 'main')?.id ?? w.blades[0].id;
    const looks: Record<string, string> = {};
    for (const b of w.blades) looks[b.id] = b.role === 'main' || b.role === 'side' ? 'sentinel' : b.role === 'motor' ? 'spinOn' : 'follow';
    const saber: Saber = {
      id, name: w.name.trim() || 'New saber', board: w.board, flashKB: w.board === 'V2.2' ? 256 : 512, fw: 'not installed yet',
      blades: w.blades, variants: w.swappable && w.variants.length ? w.variants : null, activeVariant: w.swappable && w.variants[0] ? w.variants[0].id : null,
      presets: [{ id: uid('p'), name: 'First light', font: 'TeensySF', track: '', variation: 0, looks, colors: { base: '#3d7bff', alt: '#ff3d3d', clash: '#ffffff', lockup: '#ffb547', blast: '#ffffff' }, crystalLinked: true, crystalColor: '#3d7bff', ignition: 300, retraction: 500, swing: 'Smooth swing' }],
      compiled: [], pending: ['sentinel'], lastBackup: 'none yet', lastSeen: 'now',
    };
    void mainId;
    return { sabers: [...s.sabers, saber], activeId: id, selectedPresetId: saber.presets[0].id, wizard: freshWizard(), toast: `${saber.name} added. Install firmware from Build & Install.` };
  }),

  sendCommand: (cmd) => set((s) => {
    const saber = s.active();
    const c = cmd.trim().toLowerCase();
    let out: string;
    if (c === 'version') out = `ProffieOS v8.10 · config/hiltwright_${saber.id}.h · prop: SaberFett263Buttons · buttons: 2`;
    else if (c === 'battery') out = 'Battery voltage: 3.92';
    else if (c === 'list_presets') out = saber.presets.map((p, i) => `${i}: ${p.name} · ${p.font} · ${Object.entries(p.looks).map(([, l]) => `builtin ${i} ${l === 'follow' ? '1' : '1'}`).join(', ')}`).join('\n');
    else if (c === 'id') out = saber.activeVariant ? `ID: ${(saber.variants!.find((v) => v.id === saber.activeVariant)!.ohms ?? 0)} ohms` : 'ID: not configured';
    else if (c === 'scanid') out = 'Scanning… 33012 ohms';
    else if (c === 'sdtest') out = 'Average speed: 1.9 MB/s · slowest read 4.1 ms · OK';
    else if (['on', 'off', 'clash', 'blast', 'lock', 'force', 'n', 'p'].includes(c)) out = 'OK';
    else if (c === 'help') out = 'version · battery · list_presets · id · scanid · sdtest · on · off · clash · blast · lock';
    else out = 'Whut?';
    const lines: { dir: 'in' | 'out'; text: string }[] = [{ dir: 'in', text: cmd }, ...out.split('\n').map((t) => ({ dir: 'out' as const, text: t }))];
    return { console: [...s.console, ...lines].slice(-60) };
  }),
  showToast: (text) => set({ toast: text }),
}));

// Convenience selectors
export const useActiveSaber = () => useStore((s) => s.sabers.find((x) => x.id === s.activeId) ?? s.sabers[0]);
export const useSelectedPreset = () => useStore((s) => {
  const saber = s.sabers.find((x) => x.id === s.activeId) ?? s.sabers[0];
  return saber.presets.find((p) => p.id === s.selectedPresetId) ?? saber.presets[0];
});

export { bladeRange };
