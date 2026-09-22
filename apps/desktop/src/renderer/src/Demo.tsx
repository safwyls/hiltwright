// The demo room: pick a look, grab the saber, swing it. Everything the blade shows comes from the LED simulator,
// driven by the motion of the saber on screen.

import { useEffect, useMemo, useRef, useState } from 'react';
import { PROPS, SIMULATED_LOOKS, STARTER_LOOKS, argInfo, canSimulateLook, hexToColorWord, propBehaviour, registerLookSim, type LockupType, type LookDef } from '@hiltwright/core';
import { BLADE_DIAMETERS, DEFAULT_SCENE, DemoScene, STRIP_DENSITIES, ledsFor, type BladeDiameter, type ControlMode, type Motion, type SceneSettings } from './demoScene';
import { Icon } from './Icon';
import { DEFAULT_FIT, formatOf, meshFromPack, parseHilt, type HiltFit, type SideFile, type StoredHilt } from './hiltModel';
import type { PackInfo } from '../../shared/api';
import { FontEngine } from './fontEngine';
import type { Board } from './board';
import type { FontEntry } from '../../shared/api';
import { lookAtSlot } from '@hiltwright/core';
import { listHilts, removeHilt, saveHilt } from './hiltStore';
import type { Object3D } from 'three';

// Hiltwright's own looks; the owner's saved looks (built or pasted) join them once loaded, when they can be simulated.
/** The hilt the room opens with: a pack that ships inside the app. */
const BUILT_IN_PACK = 'punk-saber';
const STARTERS = STARTER_LOOKS.filter((l) => SIMULATED_LOOKS.includes(l.id) && (l.roles.includes('main') || l.roles.includes('side')));
const SLIDERS: { key: Exclude<keyof SceneSettings, 'grid' | 'bladeInches' | 'bladeDiameter' | 'ledsPerMetre' | 'staff' | 'bladeWhenOff'>; label: string; min: number; max: number; step: number; hint: string; centre?: number }[] = [
  // Each reads as an offset from its default: the defaults are what looks right, and either way from them is a tweak.
  { key: 'glow', label: 'Glow', min: 0, max: 3, step: 0.05, hint: 'Strength of the glow around the blade', centre: DEFAULT_SCENE.glow },
  { key: 'glowSpread', label: 'Glow spread', min: 0, max: 1, step: 0.02, hint: 'How far the glow reaches', centre: DEFAULT_SCENE.glowSpread },
  { key: 'bladeBrightness', label: 'Blade heat', min: 0.7, max: 2.5, step: 0.05, hint: 'Higher is hotter and paler; lower keeps more colour in the core', centre: DEFAULT_SCENE.bladeBrightness },
  { key: 'bladeLight', label: 'Blade light', min: 0, max: 3, step: 0.05, hint: 'How strongly the blade lights the floor and the hilt', centre: DEFAULT_SCENE.bladeLight },
  { key: 'roomLight', label: 'Room light', min: 0, max: 2.5, step: 0.05, hint: 'The room\u2019s own lamps. All the way down, only the blade lights the scene', centre: DEFAULT_SCENE.roomLight },
  { key: 'haze', label: 'Haze', min: 0, max: 0.3, step: 0.005, hint: 'How quickly the room fades with distance', centre: DEFAULT_SCENE.haze },
];
function loadScene(): SceneSettings {
  try { const raw = localStorage.getItem('hiltwright.demo.scene'); return raw ? { ...DEFAULT_SCENE, ...(JSON.parse(raw) as Partial<SceneSettings>) } : { ...DEFAULT_SCENE }; } catch { return { ...DEFAULT_SCENE }; }
}

const HOLDS: { type: LockupType; label: string; key: string }[] = [{ type: 'normal', label: 'Lockup', key: 'l' }, { type: 'drag', label: 'Drag', key: 'd' }, { type: 'melt', label: 'Melt', key: 'm' }, { type: 'lb', label: 'Lightning', key: 'n' }];

const api = () => window.hiltwright;

export function Demo({ initialLook, board }: { initialLook?: string | null; board: Board }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<DemoScene | null>(null);
  const [saved, setSaved] = useState<LookDef[]>([]);
  const LOOKS = useMemo(() => [...STARTERS, ...saved], [saved]);
  useEffect(() => { void api().looks.list().then((ls) => setSaved(ls.filter((l) => registerLookSim(l)))); }, []);
  const [lookId, setLookId] = useState(() => (initialLook && canSimulateLook(initialLook) ? initialLook : STARTERS[0].id));
  const [tried, setTried] = useState<Record<number, string>>({});
  // The staff blade has its own look and colours; the panel shows one blade at a time.
  const [staffLookId, setStaffLookId] = useState(() => { try { return localStorage.getItem('hiltwright.demo.staffLook') || ''; } catch { return ''; } });
  const [staffTried, setStaffTried] = useState<Record<number, string>>({});
  const [bladeTab, setBladeTab] = useState<'main' | 'staff'>('main');
  const [hold, setHold] = useState<LockupType | null>(null);
  // The saber panel's tab, and whether the controls legend is up; both remembered.
  type Tab = 'blade' | 'sound' | 'saber' | 'help';
  const toggleHelpRef = useRef(() => {});
  const [tab, setTab] = useState<Tab>(() => { try { const t = localStorage.getItem('hiltwright.demo.tab'); return t === 'sound' || t === 'saber' || t === 'blade' ? t : 'help'; } catch { return 'help'; } }); // first visit opens on the controls
  const lastTab = useRef<Tab>('blade');
  useEffect(() => { if (tab !== 'help') lastTab.current = tab; try { localStorage.setItem('hiltwright.demo.tab', tab); } catch { /* private mode */ } }, [tab]);
  const toggleHelp = () => setTab((t) => (t === 'help' ? lastTab.current : 'help'));
  toggleHelpRef.current = toggleHelp;
  // The prop file decides what a style can do to the saber (turn it off, answer an ability): the saber's own unless changed here.
  const saberProp = board.saber?.model?.prop ?? board.library[0]?.model?.prop ?? null;
  const [propKey, setPropKey] = useState<string>(() => saberProp ?? 'fett263');
  const prop = propBehaviour(propKey);
  useEffect(() => { scene.current?.setProp(prop); }, [prop]);
  const [motion, setMotion] = useState<Motion>({ swing: 0, tilt: 0, turn: 0, twist: 0, on: false });
  const [lightOpen, setLightOpen] = useState<boolean>(() => { try { return localStorage.getItem('hiltwright.demo.lightOpen') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('hiltwright.demo.lightOpen', lightOpen ? '1' : '0'); } catch { /* private mode */ } }, [lightOpen]);
  const [failed, setFailed] = useState<string | null>(null);

  // ---- sound: a font from a card, the saber's card, or the font bank, played as the saber would ----
  type Source = { kind: 'card' | 'bank' | 'pack'; root: string; label: string };
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [fonts, setFonts] = useState<FontEntry[]>([]);
  const [fontName, setFontName] = useState<string>('');
  const [engine, setEngine] = useState<FontEngine | null>(null);
  const engineRef = useRef<FontEngine | null>(null);
  const [loading, setLoading] = useState<{ done: number; total: number; what: string } | null>(null);
  const [soundNote, setSoundNote] = useState<string | null>(null);
  const [volume, setVolume] = useState(() => { try { return Number(localStorage.getItem('hiltwright.demo.volume') ?? 0.8); } catch { return 0.8; } });
  const refreshSources = async () => {
    const [cards, bank, found] = await Promise.all([api().sd.locate(), api().sd.fontBank(), api().packs.list().catch(() => [] as PackInfo[])]);
    const next: Source[] = cards.filter((c) => c.proffie).map((c) => ({ kind: 'card' as const, root: c.root, label: `Card at ${c.root}` }));
    if (bank) next.push({ kind: 'bank', root: bank, label: `Font bank (${bank.split(/[\\/]/).pop()})` });
    if (found.some((p) => p.kind === 'font' && p.allow.demoPlayback)) next.push({ kind: 'pack', root: 'packs', label: 'Hiltwright fonts' });
    setSources(next);
    setSource((cur) => next.find((n) => n.root === cur?.root) ?? next[0] ?? null);
  };
  useEffect(() => { void refreshSources(); }, []);
  useEffect(() => {
    if (!source) { setFonts([]); return; }
    let live = true;
    void (source.kind === 'pack' ? api().packs.list().then((ps) => ps.filter((p) => p.kind === 'font' && p.allow.demoPlayback).map((p) => ({ name: p.name, path: p.id, report: { files: p.sounds, bytes: 0, type: 'unknown' as const, effects: {}, issues: [] } }))) : source.kind === 'bank' ? api().sd.bankFonts() : api().sd.listFonts(source.root)).then((f) => { if (live) setFonts(f); }).catch(() => { if (live) setFonts([]); });
    return () => { live = false; };
  }, [source?.root]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickBank = async () => { const r = await api().sd.pickFontBank(); if (r) await refreshSources(); };
  const loadFont = async (name: string, from: Source | null = source) => {
    if (!from || !name) return;
    setFontName(name); setSoundNote(null);
    setLoading({ done: 0, total: 0, what: 'reading' });
    const off = api().sd.onReadFontProgress((p) => setLoading({ done: p.done, total: p.total, what: 'reading' }));
    try {
      const sounds = from.kind === 'pack' ? await api().packs.font(fonts.find((f) => f.name === name)?.path ?? name) : await api().sd.readFont(from.root, name);
      off();
      const wasOn = engineRef.current?.isOn ?? false;
      engineRef.current?.dispose();
      const eng = await FontEngine.load(sounds, (done, total) => setLoading({ done, total, what: 'decoding' }));
      eng.setVolume(volume);
      engineRef.current = eng; setEngine(eng);
      if (sounds.skipped) setSoundNote(`${sounds.skipped} file${sounds.skipped === 1 ? '' : 's'} left out to stay under the memory cap.`);
      eng.announce();
      if (wasOn) eng.ignite();
    } catch (err) { off(); setSoundNote(`Could not load that font: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}`); }
    finally { setLoading(null); }
  };
  useEffect(() => { engineRef.current?.setVolume(volume); try { localStorage.setItem('hiltwright.demo.volume', String(volume)); } catch { /* private mode */ } }, [volume]);
  useEffect(() => () => { engineRef.current?.dispose(); }, []);

  /** The saber as it is set up: the current preset's main-blade look and its font. */
  const saber = board.saber ?? board.library[0] ?? null;
  const info = board.info;
  const presets = info?.presets ?? saber?.presets ?? [];
  const [presetIndex, setPresetIndex] = useState<number>(() => board.info?.currentPreset ?? 0);
  const loadFromSaber = async (i: number) => {
    setPresetIndex(i);
    const p = presets[i];
    if (!p || !saber) return;
    const mainBlade = (saber.model?.blades.findIndex((b) => b.role === 'main') ?? 0) + 1 || 1;
    const look = saber.firmware ? lookAtSlot(saber.firmware, i, mainBlade) : null;
    if (look && LOOKS.some((l) => l.id === look.id)) { setLookId(look.id); setTried({}); }
    // A staff hilt's second blade: the next blade slot the saber treats as a blade.
    const roles = saber.model?.blades.map((b) => b.role) ?? [];
    const secondBlade = roles.findIndex((r, k) => k !== mainBlade - 1 && (r === 'main' || r === 'side')) + 1;
    const look2 = secondBlade > 0 && saber.firmware ? lookAtSlot(saber.firmware, i, secondBlade) : null;
    if (look2 && LOOKS.some((l) => l.id === look2.id)) { setStaffLookId(look2.id); setStaffTried({}); }
    const folder = p.font.split(';')[0];
    const from = sources.find((sr) => fonts.some((f) => f.name === folder) && sr.root === source?.root) ?? source;
    // The font may live on a different source than the one selected: try each until one has it.
    for (const sr of [from, ...sources].filter((x): x is Source => !!x)) {
      const list = sr.root === source?.root ? fonts : sr.kind === 'pack' ? (await api().packs.list().catch(() => [] as PackInfo[])).filter((p) => p.kind === 'font').map((p) => ({ name: p.name, path: p.id })) : await (sr.kind === 'bank' ? api().sd.bankFonts() : api().sd.listFonts(sr.root)).catch(() => []);
      if (list.some((f) => f.name === folder)) { setSource(sr); await loadFont(folder, sr); return; }
    }
    setSoundNote(`The font "${folder}" is not on any card or in the font bank here. Share the saber's card on Fonts & SD, or point the bank at a folder that has it.`);
  };
  const [control, setControl] = useState<ControlMode>(() => { try { return localStorage.getItem('hiltwright.demo.control') === 'steer' ? 'steer' : 'hold'; } catch { return 'hold'; } });
  const [look3d, setLook3d] = useState<SceneSettings>(loadScene);
  // Custom hilts: model files the owner loaded, kept in the browser's database, one of them (or none) in use.
  const [hilts, setHilts] = useState<StoredHilt[]>([]);
  const [hiltName, setHiltName] = useState<string>(() => { try { return localStorage.getItem('hiltwright.demo.hilt') ?? ''; } catch { return ''; } });
  const [hiltNote, setHiltNote] = useState<string | null>(null);
  // The fit controls are for placing a hilt on the blade: shown when the owner loads a hilt of their own, folded away otherwise.
  const [fitOpen, setFitOpen] = useState(false);
  const [hiltLength, setHiltLength] = useState<number | null>(null);
  const loaded = useRef<{ name: string; model: Object3D } | null>(null);
  // The built-in hilt is a pack that ships with the app; the procedural hilt only stands in when it is missing.
  const builtIn = hilts.find((h) => h.packId === BUILT_IN_PACK) ?? null;
  const hilt = (hiltName ? hilts.find((h) => h.name === hiltName) : null) ?? builtIn;
  // Packs beside the app or in the owner's packs folder. A pack hilt is listed with the pack's fit unless the owner
  // has adjusted it here, in which case their adjustment is kept like any other hilt's.
  const [packs, setPacks] = useState<PackInfo[]>([]);
  useEffect(() => {
    void (async () => {
      const [stored, found] = await Promise.all([listHilts().catch(() => [] as StoredHilt[]), api().packs.list().catch(() => [] as PackInfo[])]);
      setPacks(found);
      const packHilts: StoredHilt[] = found.filter((p) => p.kind === 'hilt').map((p) => {
        const kept = stored.find((h) => h.packId === p.id);
        const entry = kept ?? { name: p.name, format: 'pack', data: new ArrayBuffer(0), fit: { ...DEFAULT_FIT, ...(p.fit ?? {}) }, packId: p.id, creator: p.creator };
        return p.id === BUILT_IN_PACK ? { ...entry, name: 'Built-in' } : entry;
      });
      setHilts([...stored.filter((h) => !h.packId), ...packHilts]);
    })();
  }, []);
  useEffect(() => { try { localStorage.setItem('hiltwright.demo.hilt', hiltName); } catch { /* private mode */ } }, [hiltName]);
  useEffect(() => {
    const room = scene.current;
    if (!room) return;
    if (!hilt) { loaded.current = null; room.setHilt(null, DEFAULT_FIT); setHiltLength(null); return; }
    let live = true;
    void (async () => {
      try {
        // Parsing is the slow part: only when the file changes, not for every nudge of a slider.
        if (loaded.current?.name !== hilt.name) loaded.current = { name: hilt.name, model: hilt.packId ? meshFromPack(await api().packs.mesh(hilt.packId)) : await parseHilt(hilt.format, hilt.data.slice(0), hilt.sideFiles ?? []) };
        if (live) { setHiltLength(room.setHilt(loaded.current.model, hilt.fit)); setHiltNote(null); }
      } catch (err) { if (live) { room.setHilt(null, DEFAULT_FIT); setHiltNote(`That model could not be read: ${String(err).replace(/^Error: /, '')}`); } }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hilt?.name, hilt?.fit.flip, hilt?.fit.rollDeg, hilt?.fit.lengthCm, hilt?.fit.offsetXmm, hilt?.fit.offsetZmm, hilt?.fit.seatMm, hilt?.fit.staffSeatMm, hilt?.fit.tiltXDeg, hilt?.fit.tiltZDeg, hilt?.fit.axis, hilts.length]);
  /** One model file, plus for an OBJ its .mtl and any textures, chosen together in the file picker. */
  const loadHiltFiles = async (files: FileList | null) => {
    const all = Array.from(files ?? []);
    const file = all.find((f) => formatOf(f.name));
    if (!file) { if (all.length) setHiltNote('Use a .glb, .obj or .stl file. For an OBJ with colours, select its .mtl (and any texture images) along with it.'); return; }
    const format = formatOf(file.name)!;
    const sideFiles: SideFile[] = await Promise.all(all.filter((f) => f !== file).map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
    const entry: StoredHilt = { name: file.name.replace(/\.[^.]+$/, ''), format, data: await file.arrayBuffer(), fit: { ...DEFAULT_FIT }, ...(sideFiles.length ? { sideFiles } : {}) };
    try { await parseHilt(format, entry.data.slice(0), sideFiles); } catch (err) { setHiltNote(`That model could not be read: ${String(err).replace(/^Error: /, '')}`); return; }
    if (format === 'obj' && !sideFiles.some((f) => /\.mtl$/i.test(f.name))) setHiltNote('Loaded without colours. To keep them, pick the .obj and its .mtl together (Ctrl+click both in the file dialog).');
    await saveHilt(entry).catch(() => undefined);
    loaded.current = null;
    setHilts((all) => [...all.filter((h) => h.name !== entry.name), entry]);
    setHiltName(entry.name); setFitOpen(true);
    if (format !== 'obj' || sideFiles.some((f) => /\.mtl$/i.test(f.name))) setHiltNote(null);
  };
  const setFit = (patch: Partial<HiltFit>) => {
    if (!hilt) return;
    const next = { ...hilt, fit: { ...hilt.fit, ...patch } };
    setHilts((all) => all.map((h) => (h.name === hilt.name ? next : h)));
    void saveHilt(next).catch(() => undefined);
  };
  /** A loaded hilt is removed; a pack hilt goes back to the pack's own fit. */
  const forgetHilt = () => {
    if (!hilt) return;
    if (hilt.packId) { const p = packs.find((x) => x.id === hilt.packId); const reset = { ...hilt, fit: { ...DEFAULT_FIT, ...(p?.fit ?? {}) } }; setHilts((all) => all.map((h) => (h.name === hilt.name ? reset : h))); void removeHilt(hilt.name).catch(() => undefined); return; }
    void removeHilt(hilt.name).catch(() => undefined); setHilts((all) => all.filter((h) => h.name !== hilt.name)); setHiltName('');
  };
  /** The fit as text, for sending to whoever makes the pack. */
  const copyFit = () => { if (!hilt) return; const f = Object.fromEntries(Object.entries(hilt.fit).filter(([k, v]) => v !== (DEFAULT_FIT as unknown as Record<string, unknown>)[k] && v != null)); void navigator.clipboard.writeText(JSON.stringify({ hilt: hilt.packId ?? hilt.name, fit: f })); setHiltNote('Fit copied.'); };

  const [sceneOpen, setSceneOpen] = useState(() => { try { return localStorage.getItem('hiltwright.demo.sceneOpen') !== '0'; } catch { return true; } });
  useEffect(() => { if (look3d.staff) scene.current?.setLook(staffLook.id, staffArgs, 'staff'); scene.current?.applySettings(look3d); try { localStorage.setItem('hiltwright.demo.scene', JSON.stringify(look3d)); } catch { /* private mode */ } }, [look3d]);
  useEffect(() => { try { localStorage.setItem('hiltwright.demo.sceneOpen', sceneOpen ? '1' : '0'); } catch { /* private mode */ } }, [sceneOpen]);
  useEffect(() => { scene.current?.setControlMode(control); try { localStorage.setItem('hiltwright.demo.control', control); } catch { /* private mode */ } }, [control]);
  const look = LOOKS.find((l) => l.id === lookId) ?? LOOKS[0];
  const args = useMemo(() => new Map(Object.entries(tried).map(([n, v]) => [Number(n), hexToColorWord(v)])), [tried]);
  const staffLook = LOOKS.find((l) => l.id === staffLookId) ?? look;
  const staffArgs = useMemo(() => new Map(Object.entries(staffTried).map(([n, v]) => [Number(n), hexToColorWord(v)])), [staffTried]);
  useEffect(() => { try { localStorage.setItem('hiltwright.demo.staffLook', staffLookId); } catch { /* private mode */ } }, [staffLookId]);
  const holdRef = useRef(hold);
  holdRef.current = hold;

  // The room is built once; looks and colours are pushed into it.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let room: DemoScene;
    try { room = new DemoScene(el, canSimulateLook(lookId) ? lookId : STARTERS[0].id); } catch (err) { setFailed(String(err)); return; }
    scene.current = room;
    room.setControlMode(control);
    room.setProp(propBehaviour(propKey));
    room.applySettings(look3d);
    room.onMotion = setMotion;
    room.onEvent = (ev) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (ev.kind === 'on') eng.ignite(); else if (ev.kind === 'off') eng.retract();
      else if (ev.kind === 'clash' || ev.kind === 'blast' || ev.kind === 'stab') eng.effect(ev.kind);
      else if (ev.kind === 'lockup') { if (ev.type) eng.beginLockup(ev.type === 'normal' ? 'lock' : ev.type === 'melt' ? 'drag' : ev.type); else eng.endLockup(); }
      else if (ev.kind === 'sound') { if (propBehaviour(propKey).transitionSounds) eng.transition(ev.n); }
      else if (ev.kind === 'motion') eng.motion(ev.degPerSec, ev.dt);
    };
    const ro = new ResizeObserver(() => room.resize());
    ro.observe(el);

    let grab: { x: number; y: number; at: number } | null = null;
    let orbit: { x: number; y: number } | null = null;
    let pan: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      if (e.button === 0) { grab = { x: e.clientX, y: e.clientY, at: performance.now() }; room.grab(e.clientX, e.clientY); } else if (e.button === 1) { e.preventDefault(); pan = { x: e.clientX, y: e.clientY }; } else { orbit = { x: e.clientX, y: e.clientY }; }
    };
    const move = (e: PointerEvent) => {
      if (grab) room.moveHand(e.clientX, e.clientY);
      if (pan) { room.panBy(e.clientX - pan.x, e.clientY - pan.y); pan = { x: e.clientX, y: e.clientY }; }
      if (orbit) { room.orbitBy(e.clientX - orbit.x, e.clientY - orbit.y); orbit = { x: e.clientX, y: e.clientY }; }
      el.style.cursor = pan ? 'move' : grab ? 'grabbing' : room.bladeAt(e.clientX, e.clientY) != null ? 'crosshair' : 'grab';
    };
    const up = (e: PointerEvent) => {
      if (e.button === 0 && grab) {
        // A click that went nowhere is a blaster bolt, if it landed on the blade.
        const still = Math.hypot(e.clientX - grab.x, e.clientY - grab.y) < 5 && performance.now() - grab.at < 250;
        const at = still ? room.bladeAt(e.clientX, e.clientY) : null;
        if (at != null) room.trigger('blast', at);
        grab = null; room.release();
      } else if (e.button === 1) pan = null; else orbit = null;
    };
    // Plain scroll twists the hilt, which is what the hand would do; Ctrl+scroll (and a trackpad pinch, which
    // Chromium reports the same way) zooms.
    const wheel = (e: WheelEvent) => { e.preventDefault(); if (e.ctrlKey) room.zoomBy(Math.max(-3, Math.min(3, e.deltaY / 100))); else room.addTwist(e.deltaY * 0.12); };
    const dbl = () => room.setOn(!room.isOn);
    const menu = (e: Event) => e.preventDefault();
    // Chromium starts its own autoscroll on a middle press unless told not to.
    const noAutoscroll = (e: MouseEvent) => { if (e.button === 1) e.preventDefault(); };
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName ?? '')) return;
      const k = e.key.toLowerCase();
      if (k === '+' || k === '=') { room.zoomBy(-1); return; }
      if (k === '-' || k === '_') { room.zoomBy(1); return; }
      if (k === '?') { toggleHelpRef.current(); return; }
      if (k === ' ') { e.preventDefault(); room.setOn(!room.isOn); setHold(null); } else if (k === 'c') room.trigger('clash', undefined, e.shiftKey); else if (k === 'b') room.trigger('blast'); else if (k === 's') room.trigger('stab'); else if (k === 'r') room.resetPose(); else if (/^[1-4]$/.test(k) && !e.repeat) room.raise(`EFFECT_USER${k}`);
      else { const h = HOLDS.find((x) => x.key === k); if (h && !e.repeat) setHold(holdRef.current === h.type ? null : h.type); }
    };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false }); el.addEventListener('dblclick', dbl); el.addEventListener('contextmenu', menu); el.addEventListener('mousedown', noAutoscroll);
    window.addEventListener('keydown', key);
    const igniteSoon = setTimeout(() => room.setOn(true), 500);
    return () => {
      clearTimeout(igniteSoon); ro.disconnect(); window.removeEventListener('keydown', key);
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel); el.removeEventListener('dblclick', dbl); el.removeEventListener('contextmenu', menu); el.removeEventListener('mousedown', noAutoscroll);
      room.dispose(); scene.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (canSimulateLook(lookId)) { scene.current?.setLook(lookId, args); setHold(null); } }, [lookId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setArgs(args); }, [args]);
  useEffect(() => { if (canSimulateLook(staffLook.id)) scene.current?.setLook(staffLook.id, staffArgs, 'staff'); }, [staffLook.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scene.current?.setArgs(staffArgs, 'staff'); }, [staffArgs]);
  useEffect(() => { scene.current?.setLockup(hold); }, [hold]);
  useEffect(() => { if (!motion.on && hold) setHold(null); }, [motion.on, hold]);

  const room = scene.current;

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, margin: '-18px -24px', overflow: 'hidden' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }} role="img" aria-label="A saber in a dark room. Drag to move the hand that holds it." />
      {failed && <div className="note red" style={{ position: 'absolute', left: 20, top: 20, maxWidth: 420 }}><Icon name="x" /><span>The demo room needs WebGL, which is not available here. {failed}</span></div>}

      {/* The saber panel: what is on the blade, what it sounds like, what the saber around it does; the deck of things to do to it stays at the foot. */}
      <section className="panel" style={{ position: 'absolute', left: 20, top: 20, width: 340, maxHeight: 'calc(100% - 40px)', display: 'flex', flexDirection: 'column', background: 'rgba(12,17,23,.9)' }} aria-label="Saber">
        <div className="seg" role="tablist" aria-label="Saber panel" style={{ margin: 10, marginBottom: 0, height: 32 }}>
          {([['blade', 'Blade'], ['sound', 'Sound'], ['saber', 'Saber'], ['help', 'Help']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} style={{ flex: 1, justifyContent: 'center', height: 30, fontSize: 12.5 }} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <div className="pb col scroll" style={{ gap: 12, padding: 12, minHeight: 0 }}>
          {tab === 'blade' && (() => {
            const staff = look3d.staff && bladeTab === 'staff';
            const cur = staff ? staffLook : look; const curId = staff ? staffLook.id : lookId; const curTried = staff ? staffTried : tried;
            const setId = staff ? (v: string) => { setStaffLookId(v); setStaffTried({}); } : (v: string) => { setLookId(v); setTried({}); };
            const setCol = staff ? setStaffTried : setTried;
            const cols = cur.args.filter((n) => argInfo(n).kind === 'color');
            return (
              <>
                {look3d.staff && (
                  <div className="seg" role="tablist" aria-label="Which blade" style={{ alignSelf: 'flex-start', height: 28 }}>
                    <button type="button" role="tab" aria-selected={bladeTab === 'main'} className={bladeTab === 'main' ? 'on' : ''} style={{ height: 26, fontSize: 12, padding: '0 10px' }} onClick={() => setBladeTab('main')}>Main blade</button>
                    <button type="button" role="tab" aria-selected={bladeTab === 'staff'} className={bladeTab === 'staff' ? 'on' : ''} style={{ height: 26, fontSize: 12, padding: '0 10px' }} onClick={() => setBladeTab('staff')}>Staff blade</button>
                  </div>
                )}
                <label className="field"><span className="label">{staff ? 'Staff blade look' : 'Look'}</span>
                  <span className="input sans"><span className="ellip">{cur.name}</span><span className="caret"><Icon name="down" /></span>
                    <select value={curId} aria-label={staff ? 'Staff blade look' : 'Look'} onChange={(e) => setId(e.target.value)}><optgroup label="Hiltwright">{STARTERS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>{saved.length > 0 && <optgroup label="Your looks">{saved.map((l) => <option key={l.id} value={l.id}>{l.name}{l.by && l.by !== 'you' ? ` (${l.by})` : ''}</option>)}</optgroup>}</select></span>
                </label>
                <span className="hint" style={{ fontSize: 12 }}>{cur.description}</span>
                {cols.length > 0 && (
                  <div className="col" style={{ gap: 6 }}>
                    <span className="label">Colours</span>
                    <div className="row wrap" style={{ gap: 6 }}>
                      {cols.map((n) => {
                        const shown = curTried[n] ?? cur.defaults?.[n] ?? (n === 1 ? cur.preview : '#ffffff');
                        return (
                          <label key={n} className={`swatch ${curTried[n] ? '' : 'linked'}`} style={{ width: 'auto', height: 28, padding: '0 8px', gap: 6 }} title={argInfo(n).name}>
                            <span className="sq" style={{ width: 12, height: 12, background: shown, boxShadow: `0 0 8px ${shown}` }} />
                            <span className="small nowrap">{argInfo(n).name.replace(/ colour$/i, '')}</span>
                            <input type="color" value={shown} aria-label={`${argInfo(n).name}${staff ? ' of the staff blade' : ''}`} onChange={(e) => setCol((t) => ({ ...t, [n]: e.target.value }))} />
                          </label>
                        );
                      })}
                    </div>
                    <span className="hint" style={{ fontSize: 11.5 }}>Tried here only; the saber's own colours are set on Presets.</span>
                  </div>
                )}
                {presets.length > 0 && (
                  <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                    <span className="label">From {saber?.name ?? 'the saber'}</span>
                    <div className="row" style={{ gap: 6 }} title="Set the look and the font from one of the saber's presets">
                      <span className="input sans grow" style={{ height: 28, fontSize: 12 }}><span className="ellip">{presets[presetIndex]?.name.replace(/\s*\n\s*/g, ' ') ?? 'Preset'}</span><span className="caret"><Icon name="down" /></span>
                        <select value={presetIndex} aria-label="Saber preset" onChange={(e) => setPresetIndex(Number(e.target.value))}>{presets.map((p, i) => <option key={i} value={i}>{i + 1}. {p.name.replace(/\s*\n\s*/g, ' ')}</option>)}</select></span>
                      <button type="button" className="chip" disabled={!!loading} onClick={() => void loadFromSaber(presetIndex)}><Icon name="play" />Load</button>
                    </div>
                    <span className="hint" style={{ fontSize: 11.5 }}>The preset's look and its font, as they are on the saber.</span>
                  </div>
                )}
              </>
            );
          })()}

          {tab === 'sound' && (
            <>
              <div className="col" style={{ gap: 6 }}>
                <span className="label">Fonts from</span>
                {sources.length === 0
                  ? <span className="hint">No fonts to hand. Put a card in a reader, share the saber's card on Fonts &amp; SD, or <button type="button" className="holo" onClick={() => void pickBank()}>choose a folder of fonts</button> on this computer.</span>
                  : (
                    <div className="row" style={{ gap: 6 }}>
                      <span className="input sans grow" style={{ height: 28, fontSize: 12 }}><span className="ellip">{source?.label ?? 'Source'}</span><span className="caret"><Icon name="down" /></span>
                        <select value={source?.root ?? ''} aria-label="Where the fonts are" onChange={(e) => setSource(sources.find((x) => x.root === e.target.value) ?? null)}>{sources.map((x) => <option key={x.root} value={x.root}>{x.label}</option>)}</select></span>
                      <button type="button" className="chip" title="Choose a folder of fonts on this computer" onClick={() => void pickBank()}><Icon name="import" /></button>
                      <button type="button" className="chip" title="Look again for cards" onClick={() => void refreshSources()}><Icon name="undo" /></button>
                    </div>
                  )}
              </div>
              {source && (
                <div className="col" style={{ gap: 6 }}>
                  <div className="row between"><span className="label">Font</span>{engine && <span className="hint" style={{ fontSize: 11.5 }}>{engine.hasSmoothSwing ? 'SmoothSwing' : 'no swing sounds'}</span>}</div>
                  <span className="input sans" style={{ height: 28, fontSize: 12 }}><span className="ellip">{fontName || (fonts.length ? 'Pick a font' : 'No fonts here')}</span><span className="caret"><Icon name="down" /></span>
                    <select value={fontName} aria-label="Sound font" disabled={!!loading} onChange={(e) => void loadFont(e.target.value)}><option value="">Pick a font</option>{fonts.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}</select></span>
                </div>
              )}
              <label className="col" style={{ gap: 6 }}>
                <div className="row between"><span className="label">Volume</span><span className="mono mute" style={{ fontSize: 11 }}>{Math.round(volume * 100)}%</span></div>
                <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="Volume" onChange={(e) => setVolume(Number(e.target.value))} />
              </label>
              {loading && <span className="hint">{loading.what === 'reading' ? 'Reading' : 'Decoding'} {loading.done}{loading.total ? ` of ${loading.total}` : ''}{source?.kind === 'card' ? ' (slow over the saber’s USB link)' : ''}…</span>}
              {soundNote && <span className="hint">{soundNote}</span>}
              {!engine && !loading && source && <span className="hint" style={{ fontSize: 11.5 }}>Pick a font and the saber hums, swings, clashes and answers every effect with its sounds.</span>}
            </>
          )}

          {tab === 'help' && (
            <div style={{ display: 'grid', gridTemplateColumns: '118px minmax(0, 1fr)', gap: '5px 12px', fontSize: 12, color: 'var(--dim)', alignContent: 'start' }} role="note" aria-label="Controls">
              {[...(control === 'steer' ? [['Drag left, right', 'swing the blade level with the floor'], ['Drag up, down', 'tilt it up or down']] : [['Drag', 'move your hand; the blade follows it'], ['Hand high, low', 'points the blade up or down']]), ['Scroll', 'twist the hilt'], ['Dbl-click, Space', 'ignite, retract'], ['Click the blade', 'blaster bolt there'], ['C  ⇧C  B  S', 'clash, hard clash, blast, stab'], ['L  D  M  N', 'hold lockup, drag, melt, lightning'], ['1  2  3  4', 'special abilities'], ['Right-drag', 'look around'], ['Middle-drag', 'pan the view'], ['Ctrl+scroll, +, −', 'zoom'], ['R', 'reset the pose and the view'], ['?', 'this page']].map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}><span className="mono" style={{ color: 'var(--text)', fontSize: 11 }}>{k}</span><span>{v}</span></div>
              ))}
              <span className="hint" style={{ gridColumn: '1 / -1', marginTop: 6 }}>{control === 'hold' ? 'You are holding the hilt: the blade follows your hand.' : 'Tilt and swing: the mouse steers the blade directly.'} Change it on the Saber tab.</span>
            </div>
          )}

          {tab === 'saber' && (
            <>
              <label className="field"><span className="label">Prop file</span>
                <span className="input sans"><span className="ellip">{prop.name}</span><span className="caret"><Icon name="down" /></span>
                  <select value={propKey} aria-label="Prop file" onChange={(e) => setPropKey(e.target.value)}>{Object.keys(PROPS).map((k) => <option key={k} value={k}>{PROPS[k].name}{k === saberProp ? ' (this saber)' : ''}</option>)}</select></span>
              </label>
              <ul className="col" style={{ gap: 4, margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--dim)' }}>
                <li>{prop.stylesCanPower ? 'A look can turn the saber off and back on itself.' : 'A look cannot turn the saber off or on; those parts of a look do not happen.'}</li>
                <li>{prop.abilities ? `Special abilities: ${prop.abilityGesture}.` : 'No special abilities.'}</li>
                <li>{prop.transitionSounds ? 'Plays a look’s own sounds (tr files).' : 'Does not play a look’s own sounds.'}</li>
                {prop.abilitiesDefine && <li>Hiltwright adds {prop.abilitiesDefine} to the build when a look uses abilities.</li>}
              </ul>
              <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <span className="label">Mouse control</span>
                <div className="seg" role="radiogroup" aria-label="Mouse control">
                  <button type="button" role="radio" aria-checked={control === 'hold'} className={control === 'hold' ? 'on' : ''} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setControl('hold')}>Hold the hilt</button>
                  <button type="button" role="radio" aria-checked={control === 'steer'} className={control === 'steer' ? 'on' : ''} style={{ flex: 1, justifyContent: 'center' }} onClick={() => setControl('steer')}>Tilt and swing</button>
                </div>
                <span className="hint" style={{ fontSize: 11.5 }}>{control === 'hold' ? 'Drag to move the hand; the blade follows it, high or low.' : 'Drag left and right to swing level with the floor, up and down to tilt.'}</span>
              </div>
              <div className="col" style={{ gap: 6, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <div className="row between"><span className="label">Point the blade</span><button type="button" className="holo small" onClick={() => room?.resetPose()}>Reset</button></div>
                {([['Tilt', 'tilt', -89, 89, 'Up or down: what the saber reads from gravity'], ['Turn', 'turn', -180, 180, 'Left or right about the vertical'], ['Twist', 'twist', -180, 180, 'Rolled about its own axis']] as const).map(([label, key, min, max, hint]) => (
                  <label key={key} className="row" style={{ gap: 8 }} title={hint}>
                    <span className="dim" style={{ width: 44, flex: 'none', fontSize: 12 }}>{label}</span>
                    <input type="range" min={min} max={max} step={1} value={motion[key]} aria-label={`${label}: ${hint}`} style={{ flex: 1, minWidth: 0 }} onChange={(e) => { if (!room) return; if (control !== 'steer') { setControl('steer'); room.setControlMode('steer'); } room.setPose({ [key]: Number(e.target.value) }); }} />
                    <span className="mono mute" style={{ width: 40, textAlign: 'right', fontSize: 11 }}>{motion[key]}°</span>
                  </label>
                ))}
                <span className="hint" style={{ fontSize: 11.5 }}>For seeing what a look does with direction. Uses tilt-and-swing control, where the hand stays put; the mouse takes over again as soon as you drag.</span>
              </div>
            </>
          )}
        </div>

        {/* The deck: everything you can do to the saber, with its key. */}
        <div className="col" style={{ gap: 8, padding: 12, borderTop: '1px solid var(--line)', background: 'rgba(8,12,17,.6)' }}>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn sm pri grow" style={{ justifyContent: 'center' }} onClick={() => { room?.setOn(!motion.on); setHold(null); }}><span className="b"><span className="i">{motion.on ? 'Retract' : 'Ignite'}<kbd className="kbd">Space</kbd></span></span></button>
            <button type="button" className="chip" aria-pressed={tab === 'help'} title="Every mouse and keyboard control" onClick={toggleHelp}><kbd className="kbd" style={{ margin: '0 6px 0 0' }}>?</kbd>Controls</button>
          </div>
          <div className="col" style={{ gap: 4 }}>
            <span className="label">Hit</span>
            <Deck items={[['Clash', 'C', () => room?.trigger('clash')], ['Hard', '⇧C', () => room?.trigger('clash', undefined, true)], ['Blast', 'B', () => room?.trigger('blast')], ['Stab', 'S', () => room?.trigger('stab')]]} disabled={!motion.on} />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <span className="label">Hold</span>
            <Deck items={HOLDS.map((h) => [h.label, h.key.toUpperCase(), () => setHold(hold === h.type ? null : h.type), hold === h.type] as const)} disabled={!motion.on} cols={2} />
          </div>
          {prop.abilities > 0 && (
            <div className="col" style={{ gap: 4 }}>
              <span className="label" title={`Special abilities: ${prop.abilityGesture}`}>Special ability</span>
              <Deck items={[1, 2, 3, 4].map((n) => [`${n}`, `${n}`, () => room?.raise(`EFFECT_USER${n}`)] as const)} disabled={false} />
            </div>
          )}
        </div>
      </section>

      <div className="mono" style={{ position: 'absolute', right: 20, top: 20, fontSize: 11.5, color: 'var(--dim)', textAlign: 'right', lineHeight: 1.7, pointerEvents: 'none' }} aria-live="off">
        <div className="mute">what the saber's sensors would read</div>
        <div>swing <span style={{ color: 'var(--text)' }}>{motion.swing}°/s</span></div>
        <div>tilt <span style={{ color: 'var(--text)' }}>{motion.tilt > 0 ? 'up ' : motion.tilt < 0 ? 'down ' : ''}{Math.abs(motion.tilt)}°</span></div>
        <div>turn <span style={{ color: 'var(--text)' }}>{motion.turn}°</span></div>
        <div>twist <span style={{ color: 'var(--text)' }}>{motion.twist}°</span></div>
      </div>

      <section className="panel" style={{ position: 'absolute', right: 20, bottom: 18, width: 280, maxHeight: 'calc(100% - 130px)', display: 'flex', flexDirection: 'column', background: 'rgba(12,17,23,.9)' }} aria-label="Scene">
        <div className="row between" style={{ padding: '8px 12px', flex: 'none' }}>
          <button type="button" className="row" style={{ gap: 8 }} aria-expanded={sceneOpen} onClick={() => setSceneOpen((o) => !o)}><Icon name={sceneOpen ? 'down' : 'up'} /><b style={{ fontWeight: 600, fontSize: 13 }}>Scene</b></button>
          {sceneOpen && <button type="button" className="holo small" onClick={() => setLook3d({ ...DEFAULT_SCENE })}>Reset</button>}
        </div>
        {sceneOpen && (
          <div className="col scroll" style={{ gap: 7, padding: '0 12px 12px', fontSize: 12, minHeight: 0 }}>
            <button type="button" className="row between" aria-expanded={lightOpen} onClick={() => setLightOpen((o) => !o)}><span className="label">Light</span><span style={{ display: 'flex', width: 14, height: 14, color: 'var(--mute)' }}><Icon name={lightOpen ? 'down' : 'chev'} /></span></button>
            {lightOpen && SLIDERS.map((sl) => (
              <label key={sl.key} className="row" style={{ gap: 8 }} title={sl.hint}>
                <span className="dim" style={{ width: 76, flex: 'none' }}>{sl.label}</span>
                <input type="range" min={sl.min} max={sl.max} step={sl.step} value={look3d[sl.key]} aria-label={sl.hint} style={{ flex: 1, minWidth: 0 }} onChange={(e) => setLook3d((v) => ({ ...v, [sl.key]: Number(e.target.value) }))} />
                <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{sl.centre != null ? (Math.abs(look3d[sl.key] - sl.centre) < sl.step / 2 ? '0' : `${look3d[sl.key] > sl.centre ? '+' : '−'}${Math.abs(look3d[sl.key] - sl.centre).toFixed(sl.step < 0.01 ? 3 : 2).replace(/\.?0+$/, '')}`) : look3d[sl.key].toFixed(look3d[sl.key] < 1 && sl.max <= 1 ? 2 : 1)}</span>
              </label>
            ))}
            {lightOpen && (
              <label className="row" style={{ gap: 10 }}>
                <button type="button" className={`tog ${look3d.grid ? 'on' : ''}`} role="switch" aria-checked={look3d.grid} aria-label="Floor grid" onClick={() => setLook3d((v) => ({ ...v, grid: !v.grid }))}><i /></button>
                <span className="dim">Floor grid</span>
              </label>
            )}
            <span className="label" style={{ paddingTop: 8, marginTop: 2, borderTop: '1px solid var(--line)' }}>Blade</span>
            <label className="row" style={{ gap: 8 }} title="Blade length, in inches">
              <span className="dim" style={{ width: 76, flex: 'none' }}>Length</span>
              <input type="range" min={20} max={40} step={1} value={look3d.bladeInches} aria-label="Blade length in inches" style={{ flex: 1, minWidth: 0 }} onChange={(e) => setLook3d((v) => ({ ...v, bladeInches: Number(e.target.value) }))} />
              <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{look3d.bladeInches}"</span>
            </label>
            <div className="row" style={{ gap: 8 }} title="How densely the strip inside is populated. The count follows from the length: a shorter blade has fewer LEDs, and every look runs on that many.">
              <span className="dim" style={{ width: 76, flex: 'none' }}>Strip</span>
              <span className="input sans" style={{ height: 28, fontSize: 12, width: 92, flex: 'none' }}><span className="ellip">{look3d.ledsPerMetre}/m</span><span className="caret"><Icon name="down" /></span>
                <select value={look3d.ledsPerMetre} aria-label="LEDs per metre of strip" onChange={(e) => setLook3d((v) => ({ ...v, ledsPerMetre: Number(e.target.value) }))}>{STRIP_DENSITIES.map((d) => <option key={d} value={d}>{d} per metre</option>)}</select></span>
              <span className="mono mute" style={{ flex: 1, textAlign: 'right' }}>{ledsFor(look3d.bladeInches * 0.0254, look3d.ledsPerMetre)} LEDs</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="dim" style={{ width: 76, flex: 'none' }}>Diameter</span>
              <div className="seg" role="radiogroup" aria-label="Blade diameter" style={{ height: 28 }}>
                {(Object.keys(BLADE_DIAMETERS) as BladeDiameter[]).map((d) => <button key={d} type="button" role="radio" aria-checked={look3d.bladeDiameter === d} className={look3d.bladeDiameter === d ? 'on' : ''} style={{ height: 26, padding: '0 10px', fontSize: 12 }} onClick={() => setLook3d((v) => ({ ...v, bladeDiameter: d }))}>{d}"</button>)}
              </div>
            </div>
            <label className="row" style={{ gap: 10 }} title="Show the unlit blade tube while the saber is off. Off, the blade only exists while it is lit.">
              <button type="button" className={`tog ${look3d.bladeWhenOff ? 'on' : ''}`} role="switch" aria-checked={look3d.bladeWhenOff} aria-label="Show the blade when off" onClick={() => setLook3d((v) => ({ ...v, bladeWhenOff: !v.bladeWhenOff }))}><i /></button>
              <span className="dim">Blade shown when off</span>
            </label>
            <label className="row" style={{ gap: 10 }} title="A second blade out of the pommel, as on a staff hilt. It shows the same LEDs as the first.">
              <button type="button" className={`tog ${look3d.staff ? 'on' : ''}`} role="switch" aria-checked={look3d.staff} aria-label="Second blade, staff" onClick={() => setLook3d((v) => ({ ...v, staff: !v.staff }))}><i /></button>
              <span className="dim">Second blade (staff)</span>
            </label>
            <span className="label" style={{ paddingTop: 8, marginTop: 2, borderTop: '1px solid var(--line)' }}>Hilt</span>
            <div className="row" style={{ gap: 8 }}>
              <span className="dim" style={{ width: 76, flex: 'none' }}>Model</span>
              <span className="input sans" style={{ height: 28, fontSize: 12 }}><span className="ellip">{hilt?.name ?? 'Built-in'}</span><span className="caret"><Icon name="down" /></span>
                <select value={hilt && hilt !== builtIn ? hilt.name : ''} aria-label="Hilt model" onChange={(e) => setHiltName(e.target.value)}><option value="">Built-in</option>{hilts.filter((h) => h !== builtIn).map((h) => <option key={h.name} value={h.name}>{h.name}</option>)}</select></span>
              <label className="chip" style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden' }} title="Load a .glb, .obj or .stl file. For an OBJ, select its .mtl and textures with it."><Icon name="import" />Load
                <input type="file" multiple accept=".glb,.gltf,.obj,.stl,.mtl,.png,.jpg,.jpeg,.webp,.tga" aria-label="Load a hilt model" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={(e) => { void loadHiltFiles(e.target.files); e.target.value = ''; }} /></label>
            </div>
            {hilt && (
              <button type="button" className="row nowrap" style={{ gap: 6, alignSelf: 'flex-start' }} aria-expanded={fitOpen} onClick={() => setFitOpen((o) => !o)}><span style={{ display: 'flex', width: 14, height: 14, color: 'var(--mute)' }}><Icon name={fitOpen ? 'down' : 'chev'} /></span><span className="small dim">Fit and placement</span></button>
            )}
            {hilt && fitOpen && (
              <>
                <label className="row" style={{ gap: 8 }} title="Overall length of the hilt">
                  <span className="dim" style={{ width: 76, flex: 'none' }}>Length</span>
                  <input type="range" min={15} max={45} step={0.5} value={hilt.fit.lengthCm ?? Math.round((hiltLength ?? 0.28) * 200) / 2} aria-label="Hilt length in centimetres" style={{ flex: 1, minWidth: 0 }} onChange={(e) => setFit({ lengthCm: Number(e.target.value) })} />
                  <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{(hilt.fit.lengthCm ?? (hiltLength ?? 0.28) * 100).toFixed(0)}cm</span>
                </label>
                <label className="row" style={{ gap: 8 }} title="Turn the hilt about the blade so its controls face where you want">
                  <span className="dim" style={{ width: 76, flex: 'none' }}>Turn</span>
                  <input type="range" min={-180} max={180} step={5} value={hilt.fit.rollDeg} aria-label="Turn the hilt about the blade" style={{ flex: 1, minWidth: 0 }} onChange={(e) => setFit({ rollDeg: Number(e.target.value) })} />
                  <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{hilt.fit.rollDeg}°</span>
                </label>
                {([['Shift X', 'offsetXmm'], ['Shift Z', 'offsetZmm']] as ['Shift X' | 'Shift Z', 'offsetXmm' | 'offsetZmm'][]).map(([label, key]) => (
                  <label key={key} className="row" style={{ gap: 8 }} title="Slide the hilt sideways so the blade sits in its bore. In millimetres, in the hilt's own frame, so it stays put when you turn it.">
                    <span className="dim" style={{ width: 76, flex: 'none' }}>{label}</span>
                    <input type="range" min={-30} max={30} step={0.5} value={hilt.fit[key] ?? 0} aria-label={`${label}: sideways shift in millimetres`} style={{ flex: 1, minWidth: 0 }} onChange={(e) => setFit({ [key]: Number(e.target.value) })} />
                    <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{(hilt.fit[key] ?? 0).toFixed(1)}</span>
                  </label>
                ))}
                <label className="row" style={{ gap: 8 }} title="How deep the blade sits in the emitter. Raise it when the emitter's shroud or a flare extends past the socket, so the blade starts inside the hilt rather than at its very top.">
                  <span className="dim" style={{ width: 76, flex: 'none' }}>Seat</span>
                  <input type="range" min={-40} max={120} step={0.5} value={hilt.fit.seatMm ?? 0} aria-label="Seat: how deep the blade sits in the emitter, in millimetres" style={{ flex: 1, minWidth: 0 }} onChange={(e) => setFit({ seatMm: Number(e.target.value) })} />
                  <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{(hilt.fit.seatMm ?? 0).toFixed(1)}</span>
                </label>
                {look3d.staff && (
                  <label className="row" style={{ gap: 8 }} title="How deep the staff's second blade sits in the pommel">
                    <span className="dim" style={{ width: 76, flex: 'none' }}>Staff seat</span>
                    <input type="range" min={-40} max={120} step={0.5} value={hilt.fit.staffSeatMm ?? 0} aria-label="Staff seat: how deep the second blade sits in the pommel, in millimetres" style={{ flex: 1, minWidth: 0 }} onChange={(e) => setFit({ staffSeatMm: Number(e.target.value) })} />
                    <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{(hilt.fit.staffSeatMm ?? 0).toFixed(1)}</span>
                  </label>
                )}
                {([['Lean', 'tiltXDeg'], ['Lean side', 'tiltZDeg']] as [string, 'tiltXDeg' | 'tiltZDeg'][]).map(([label, key]) => (
                  <label key={key} className="row" style={{ gap: 8 }} title="Tilt the hilt relative to the blade, about the point where the blade enters it. For a curved hilt, whose long dimension does not run along the bore.">
                    <span className="dim" style={{ width: 76, flex: 'none' }}>{label}</span>
                    <input type="range" min={-45} max={45} step={0.5} value={hilt.fit[key] ?? 0} aria-label={`${label}: tilt of the hilt relative to the blade, in degrees`} style={{ flex: 1, minWidth: 0 }} onChange={(e) => setFit({ [key]: Number(e.target.value) })} />
                    <span className="mono mute" style={{ width: 34, textAlign: 'right' }}>{(hilt.fit[key] ?? 0).toFixed(1)}°</span>
                  </label>
                ))}
                <div className="row" style={{ gap: 8 }} title="Where the blade's axis is in the file. Drawn around the bore: the file's own axis. Box centre: the middle of the model. Auto picks the first when the file's axis runs through the model.">
                  <span className="dim" style={{ width: 76, flex: 'none' }}>Axis</span>
                  <div className="seg" role="radiogroup" aria-label="Blade axis in the file" style={{ height: 28 }}>
                    {([['auto', 'Auto'], ['origin', 'File'], ['box', 'Box']] as ['auto' | 'origin' | 'box', string][]).map(([v, label]) => <button key={v} type="button" role="radio" aria-checked={(hilt.fit.axis ?? 'auto') === v} className={(hilt.fit.axis ?? 'auto') === v ? 'on' : ''} style={{ height: 26, padding: '0 8px', fontSize: 12 }} onClick={() => setFit({ axis: v })}>{label}</button>)}
                  </div>
                </div>
                <label className="row" style={{ gap: 10 }}><button type="button" className={`tog ${hilt.fit.flip ? 'on' : ''}`} role="switch" aria-checked={hilt.fit.flip} aria-label="Blade comes out of the other end" onClick={() => setFit({ flip: !hilt.fit.flip })}><i /></button><span className="dim">Blade at the other end</span></label>
                <div className="row" style={{ gap: 14, justifyContent: 'flex-end' }}><button type="button" className="holo small" title="Copy the fit as text" onClick={copyFit}>Copy fit</button><button type="button" className="holo small" onClick={forgetHilt}>{hilt.packId ? 'Reset fit' : 'Remove'}</button></div>
              </>
            )}
            {hilt?.creator && <span className="hint">{hilt === builtIn ? 'Punk Saber' : hilt.name} by {hilt.creator}{packs.find((p) => p.id === hilt.packId)?.licence ? `, ${packs.find((p) => p.id === hilt.packId)!.licence}` : ''}</span>}
            {hiltNote && <span className={hiltNote === 'Fit copied.' ? 'hint' : 'red small'}>{hiltNote}</span>}
          </div>
        )}
      </section>
    </div>
  );
}

/** A row of same-sized chips, each with the key that does the same thing. */
function Deck({ items, disabled, cols = 4 }: { items: readonly (readonly [string, string, () => void] | readonly [string, string, () => void, boolean])[]; disabled: boolean; cols?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 4 }}>
      {items.map(([label, key, go, on]) => (
        <button key={label} type="button" className={`chip deck ${on ? 'sel' : ''}`} aria-pressed={on} disabled={disabled} title={`${label} (${key})`} onClick={go}><span className="ellip">{label}</span><kbd className="kbd">{key}</kbd></button>
      ))}
    </div>
  );
}
