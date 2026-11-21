// The demo room: pick a look, grab the saber, swing it. Everything the blade shows comes from the LED simulator,
// driven by the motion of the saber on screen.

import { useEffect, useMemo, useRef, useState } from 'react';
import { PROPS, propFamily, SIMULATED_LOOKS, STARTER_LOOKS, argInfo, canSimulateLook, hexToColorWord, propBehaviour, registerLookSim, type LockupType, type LookDef } from '@hiltwright/core';
import { BLADE_DIAMETERS, DEFAULT_SCENE, DemoScene, STRIP_DENSITIES, ledsFor, type BladeDiameter, type ControlMode, type Motion, type SceneSettings } from './demoScene';
import { Icon } from './Icon';
import { DEFAULT_FIT, formatOf, meshFromPack, parseHilt, type HiltFit, type HiltFormat, type SideFile } from './hiltModel';
import type { HiltAddMode, HiltInfo, HiltInput, PackInfo } from '../../shared/api';
import { FontEngine } from './fontEngine';
import type { Board } from './board';
import type { FontEntry } from '../../shared/api';
import { presetBladeLoad } from './demoFromSaber';
import { adoptOnce, asArrayBuffer } from './hiltStore';
import { ContributorLogo, useContributors } from './credits';
import type { Object3D } from 'three';
import { Select } from './Select';
import { LookPreviewNote } from './PreviewNote';

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
/** A hilt in the room: one the owner loaded (key = its id) or a pack's (key = `pack:<id>`), so neither can stand for the other. */
interface RoomHilt { key: string; id?: string; name: string; format: HiltFormat; fit: HiltFit; packId?: string; creator?: string; /** Bumped when its model is replaced, to reload it. */ rev?: number }
/** Notes in the Hilt panel that report something done rather than a problem. */
const OK_NOTE = /^(Fit copied|Exported|Imported|Brought over)/;
/** "2 hilts and 1 pack fit" */
const counted = (r: { added: number; fits: number }) => [r.added ? `${r.added} hilt${r.added === 1 ? '' : 's'}` : '', r.fits ? `${r.fits} pack fit${r.fits === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');

const HOLDS: { type: LockupType; label: string; key: string }[] = [{ type: 'normal', label: 'Lockup', key: 'l' }, { type: 'drag', label: 'Drag', key: 'd' }, { type: 'melt', label: 'Melt', key: 'm' }, { type: 'lb', label: 'Lightning', key: 'n' }];

const api = () => window.hiltwright;
const LIBRARY = 'library';

export function Demo({ initialLook, initialFont, board }: { initialLook?: string | null; initialFont?: string | null; board: Board }) {
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
  const [tab, setTab] = useState<Tab>(() => { try { const t = localStorage.getItem('hiltwright.demo.tab'); return t === 'sound' || t === 'saber' || t === 'blade' ? t : window.innerHeight < 800 ? 'blade' : 'help'; } catch { return window.innerHeight < 800 ? 'blade' : 'help'; } }); // opens on the controls, except in a short window, where their list would scroll
  const lastTab = useRef<Tab>('blade');
  useEffect(() => { if (tab !== 'help') lastTab.current = tab; try { localStorage.setItem('hiltwright.demo.tab', tab); } catch { /* private mode */ } }, [tab]);
  const toggleHelp = () => setTab((t) => (t === 'help' ? lastTab.current : 'help'));
  toggleHelpRef.current = toggleHelp;
  // The prop file decides what a style can do to the saber (turn it off, answer an ability): the saber's own unless changed here.
  // A custom prop file behaves here as the stock prop it is a version of.
  const saberModel = board.saber?.model ?? board.library[0]?.model ?? null;
  const saberProp = saberModel ? propFamily(saberModel) : null;
  const [propKey, setPropKey] = useState<string>(() => saberProp ?? 'fett263');
  const prop = propBehaviour(propKey);
  useEffect(() => { scene.current?.setProp(prop); }, [prop]);
  const [motion, setMotion] = useState<Motion>({ swing: 0, tilt: 0, turn: 0, twist: 0, on: false });
  const [lightOpen, setLightOpen] = useState<boolean>(() => { try { return localStorage.getItem('hiltwright.demo.lightOpen') === '1'; } catch { return false; } });
  useEffect(() => { try { localStorage.setItem('hiltwright.demo.lightOpen', lightOpen ? '1' : '0'); } catch { /* private mode */ } }, [lightOpen]);
  const [failed, setFailed] = useState<string | null>(null);

  // ---- sound: a font from the font library or a pack, played as the saber would ----
  // Cards are not a source here: reading one over the saber's USB link takes tens of seconds and froze the room.
  type Source = { kind: 'library' | 'pack'; root: string; label: string };
  const [sources, setSources] = useState<Source[]>([]);
  // Library fonts go by their folder (what a preset names); the name the owner gave them is shown.
  const [libNames, setLibNames] = useState<Record<string, string>>({});
  const libraryEntries = async (): Promise<FontEntry[]> => {
    const list = await api().fontLibrary.list();
    setLibNames(Object.fromEntries(list.map((f) => [f.folder, f.meta.name])));
    return list.map((f) => ({ name: f.folder, path: f.folder, report: f.report }));
  };
  const [source, setSource] = useState<Source | null>(null);
  const [fonts, setFonts] = useState<FontEntry[]>([]);
  const [fontName, setFontName] = useState<string>('');
  const [engine, setEngine] = useState<FontEngine | null>(null);
  const engineRef = useRef<FontEngine | null>(null);
  const [loading, setLoading] = useState<{ done: number; total: number; what: string } | null>(null);
  const [soundNote, setSoundNote] = useState<string | null>(null);
  const [volume, setVolume] = useState(() => { try { return Number(localStorage.getItem('hiltwright.demo.volume') ?? 0.8); } catch { return 0.8; } });
  const refreshSources = async () => {
    const [lib, found] = await Promise.all([api().fontLibrary.list().catch(() => []), api().packs.list().catch(() => [] as PackInfo[])]);
    const next: Source[] = lib.length ? [{ kind: 'library', root: LIBRARY, label: `Font library (${lib.length})` }] : [];
    if (found.some((p) => p.kind === 'font' && p.allow.demoPlayback)) next.push({ kind: 'pack', root: 'packs', label: 'Hiltwright fonts' });
    setSources(next);
    setSource((cur) => next.find((n) => n.root === cur?.root) ?? next[0] ?? null);
    return next;
  };
  /** The fonts a source holds, read straight from it (the `fonts` state follows the selected source a moment later). */
  const entriesOf = async (src: Source): Promise<{ name: string; path: string }[]> => src.kind === 'pack'
    ? (await api().packs.list().catch(() => [] as PackInfo[])).filter((p) => p.kind === 'font' && p.allow.demoPlayback).map((p) => ({ name: p.name, path: p.id }))
    : (await api().fontLibrary.list().catch(() => [])).map((f) => ({ name: f.folder, path: f.folder }));
  // The room opens with a font, so it is never silent: the one chosen in the font library on the way here, else the
  // one last heard here if it is still there, else the first font to hand.
  useEffect(() => {
    void refreshSources().then(async (next) => {
      const lib = next.find((n) => n.kind === 'library');
      if (initialFont && lib) { setSource(lib); void loadFont(initialFont, lib); return; }
      let last: { root?: unknown; name?: unknown } = {};
      try { last = JSON.parse(localStorage.getItem('hiltwright.demo.font') ?? '{}') as typeof last; } catch { /* nothing remembered */ }
      const lastSource = next.find((n) => n.root === last.root);
      const remembered = lastSource ? (await entriesOf(lastSource)).find((f) => f.name === last.name) : undefined;
      if (lastSource && remembered) { setSource(lastSource); void loadFont(remembered.name, lastSource, remembered.path); return; }
      for (const src of next) {
        const first = (await entriesOf(src))[0];
        if (first) { setSource(src); void loadFont(first.name, src, first.path); return; }
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!source) { setFonts([]); return; }
    let live = true;
    void (source.kind === 'pack' ? api().packs.list().then((ps) => ps.filter((p) => p.kind === 'font' && p.allow.demoPlayback).map((p) => ({ name: p.name, path: p.id, report: { files: p.sounds, bytes: 0, type: 'unknown' as const, effects: {}, issues: [] } }))) : libraryEntries()).then((f) => { if (live) setFonts(f); }).catch(() => { if (live) setFonts([]); });
    return () => { live = false; };
  }, [source?.root]); // eslint-disable-line react-hooks/exhaustive-deps
  const addToLibrary = async () => { const r = await api().fontLibrary.addFolder(); if (r?.added.length) await refreshSources(); };
  // Loads can overlap (the room's own first load, a font picked while one is still decoding): only the latest
  // one may sound. An engine from an earlier load is thrown away when it arrives.
  const loadSeq = useRef(0);
  const loadFont = async (name: string, from: Source | null = source, packId?: string) => {
    if (!from || !name) return;
    const mine = ++loadSeq.current;
    setFontName(name); setSoundNote(null);
    setLoading({ done: 0, total: 0, what: 'reading' });
    const off = api().sd.onReadFontProgress((p) => setLoading({ done: p.done, total: p.total, what: 'reading' }));
    try {
      const sounds = from.kind === 'pack' ? await api().packs.font(packId ?? fonts.find((f) => f.name === name)?.path ?? name) : await api().fontLibrary.readFont(name);
      off();
      const wasOn = engineRef.current?.isOn ?? false;
      engineRef.current?.dispose();
      const eng = await FontEngine.load(sounds, (done, total) => setLoading({ done, total, what: 'decoding' }));
      if (mine !== loadSeq.current) { eng.dispose(); return; }
      engineRef.current?.dispose();
      eng.setVolume(volume);
      engineRef.current = eng; setEngine(eng);
      try { localStorage.setItem('hiltwright.demo.font', JSON.stringify({ root: from.root, name })); } catch { /* private mode */ }
      if (sounds.skipped) setSoundNote(`${sounds.skipped} file${sounds.skipped === 1 ? '' : 's'} left out to stay under the memory cap.`);
      // A preset change while lit, as prop_base SetPreset does it: a fast on (fastout, no preon), then the font's name.
      // Whether the saber is on is asked of the blade, and only now: decoding takes a while, and the room lights
      // the blade as it opens, so a blade that was dark when the load began may be lit by the time the font is
      // ready, with no font having heard it ignite. (A blade still in preon lights later and says so itself.)
      if (scene.current ? scene.current.isLit : wasOn) eng.ignite();
      eng.announce();
    } catch (err) { off(); if (mine === loadSeq.current) setSoundNote(`Could not load that font: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}`); }
    finally { if (mine === loadSeq.current) setLoading(null); }
  };
  useEffect(() => { engineRef.current?.setVolume(volume); try { localStorage.setItem('hiltwright.demo.volume', String(volume)); } catch { /* private mode */ } }, [volume]);
  // Leaving the room: the font goes quiet, and a load still on its way must not start playing after it.
  useEffect(() => () => { loadSeq.current++; engineRef.current?.dispose(); engineRef.current = null; }, []);

  /** The saber as it is set up: the current preset's main-blade look and its font. */
  const saber = board.saber ?? board.library[0] ?? null;
  const info = board.info;
  const presets = info?.presets ?? saber?.presets ?? [];
  const [presetIndex, setPresetIndex] = useState<number>(() => board.info?.currentPreset ?? 0);
  const [fromNote, setFromNote] = useState<string | null>(null);
  const loadFromSaber = async (i: number) => {
    setPresetIndex(i);
    const p = presets[i];
    if (!p || !saber) return;
    const mainBlade = (saber.model?.blades.findIndex((b) => b.role === 'main') ?? 0) + 1 || 1;
    // The preset's style and its own colours, by the one rule the Styles page uses; a style the room cannot show is said so.
    const base = { model: saber.model, firmware: saber.firmware, saberPresets: presets, preset: i, shown: LOOKS };
    const main = presetBladeLoad({ ...base, blade: mainBlade, current: LOOKS.find((l) => l.id === lookId)?.name ?? LOOKS[0].name });
    if (main.lookId) { setLookId(main.lookId); setTried(main.colours); }
    // A staff hilt's second blade: the next blade slot the saber treats as a blade.
    const roles = saber.model?.blades.map((b) => b.role) ?? [];
    const secondBlade = roles.findIndex((r, k) => k !== mainBlade - 1 && (r === 'main' || r === 'side')) + 1;
    const second = secondBlade > 0 ? presetBladeLoad({ ...base, blade: secondBlade, current: LOOKS.find((l) => l.id === staffLookId)?.name ?? staffLook.name }) : null;
    if (second?.lookId) { setStaffLookId(second.lookId); setStaffTried(second.colours); }
    setFromNote([main.note, look3d.staff ? second?.note : null].filter(Boolean).join(' ') || null);
    const folder = p.font.split(';')[0];
    const from = sources.find((sr) => fonts.some((f) => f.name === folder) && sr.root === source?.root) ?? source;
    // The font may live on a different source than the one selected: try each until one has it.
    for (const sr of [from, ...sources].filter((x): x is Source => !!x)) {
      const list = sr.root === source?.root ? fonts : sr.kind === 'pack' ? (await api().packs.list().catch(() => [] as PackInfo[])).filter((p) => p.kind === 'font').map((p) => ({ name: p.name, path: p.id })) : await libraryEntries().catch(() => []);
      if (list.some((f) => f.name === folder)) { setSource(sr); await loadFont(folder, sr); return; }
    }
    setSoundNote(`The font "${folder}" is not in the Font library. Add it there to hear it here.`);
  };
  const [control, setControl] = useState<ControlMode>(() => { try { return localStorage.getItem('hiltwright.demo.control') === 'steer' ? 'steer' : 'hold'; } catch { return 'hold'; } });
  const [look3d, setLook3d] = useState<SceneSettings>({ ...DEFAULT_SCENE });
  // Hilts: the owner's own models and pack hilts, kept by the app in its data folder (main/hilts.ts) with the scene
  // settings and the chosen hilt, so every build of the app sees the same ones. One of them (or the built-in) in use.
  const [hilts, setHilts] = useState<RoomHilt[]>([]);
  const [hiltKey, setHiltKey] = useState<string>('');
  // Nothing is saved until what was kept has been read, so the defaults never overwrite it.
  const [roomReady, setRoomReady] = useState(false);
  const [hiltNote, setHiltNote] = useState<string | null>(null);
  // The fit controls are for placing a hilt on the blade: shown when the owner loads a hilt of their own, folded away otherwise.
  const [fitOpen, setFitOpen] = useState(false);
  const [hiltLength, setHiltLength] = useState<number | null>(null);
  const loaded = useRef<{ key: string; model: Object3D } | null>(null);
  // The built-in hilt is a pack that ships with the app; the procedural hilt only stands in when it is missing.
  const builtIn = hilts.find((h) => h.packId === BUILT_IN_PACK) ?? null;
  const hilt = (hiltKey ? hilts.find((h) => h.key === hiltKey) : null) ?? builtIn;
  // Packs beside the app or in the owner's packs folder. A pack hilt is listed with the pack's fit unless the owner
  // has adjusted it here, in which case their adjustment is kept apart from their own hilts, by pack id.
  const [packs, setPacks] = useState<PackInfo[]>([]);
  // A file whose name is taken, waiting for the owner's answer; a removal or reset waiting for confirmation.
  const [taken, setTaken] = useState<{ input: HiltInput; id: string; name: string; note: string | null } | null>(null);
  const [confirm, setConfirm] = useState<'remove' | 'reset' | null>(null);
  const errText = (err: unknown) => String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '');
  const packEntry = (p: PackInfo, fits: Record<string, HiltFit>): RoomHilt => ({ key: `pack:${p.id}`, name: p.id === BUILT_IN_PACK ? 'Built-in' : p.name, format: 'pack', fit: fits[p.id] ? { ...fits[p.id] } : { ...DEFAULT_FIT, ...(p.fit ?? {}) }, packId: p.id, creator: p.creator });
  const ownEntry = (h: HiltInfo): RoomHilt => ({ key: h.id, id: h.id, name: h.name, format: h.format, fit: h.fit, ...(h.creator ? { creator: h.creator } : {}) });
  /** Read the hilts, first bringing over any this page kept itself in an earlier version. */
  const loadHiltList = async () => {
    const found = await api().packs.list().catch(() => [] as PackInfo[]);
    setPacks(found);
    let moveNote: string | null = null;
    try {
      const moved = await adoptOnce(found);
      if (moved) moveNote = `Brought over ${counted(moved)} from an earlier version of Hiltwright.`;
    } catch (err) { moveNote = `Could not bring over your earlier hilts: ${errText(err)}`; }
    const [own, fits, room] = await Promise.all([api().hilts.list(), api().hilts.packFits(), api().hilts.room()]);
    setHilts([...own.map(ownEntry), ...found.filter((p) => p.kind === 'hilt').map((p) => packEntry(p, fits))]);
    return { room, moveNote };
  };
  useEffect(() => {
    void (async () => {
      try {
        const { room, moveNote } = await loadHiltList();
        if (room.scene) setLook3d(room.scene);
        setHiltKey(room.chosen ?? '');
        if (moveNote) setHiltNote(moveNote);
        setRoomReady(true);
      } catch (err) { setHiltNote(`Could not read your hilts: ${errText(err)}`); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Scene settings are saved a moment after the last change, and at once when the room closes.
  const sceneSave = useRef<{ t: ReturnType<typeof setTimeout>; run: () => void } | null>(null);
  useEffect(() => {
    if (!roomReady) return;
    if (sceneSave.current) clearTimeout(sceneSave.current.t);
    const run = () => { sceneSave.current = null; void api().hilts.setRoom({ scene: look3d }).catch((err) => setHiltNote(`Could not save the scene settings: ${errText(err)}`)); };
    sceneSave.current = { t: setTimeout(run, 300), run };
  }, [look3d, roomReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (roomReady) void api().hilts.setRoom({ chosen: hiltKey || null }).catch((err) => setHiltNote(`Could not remember the chosen hilt: ${errText(err)}`)); }, [hiltKey, roomReady]); // eslint-disable-line react-hooks/exhaustive-deps
  // A fit is saved a moment after the last nudge, and at once when another hilt is chosen or the room closes.
  const fitSave = useRef<{ key: string; t: ReturnType<typeof setTimeout>; run: () => void } | null>(null);
  const flushFit = () => { const f = fitSave.current; if (f) { clearTimeout(f.t); f.run(); } };
  const dropFit = (key: string) => { const f = fitSave.current; if (f?.key === key) { clearTimeout(f.t); fitSave.current = null; } };
  const saveFit = (h: RoomHilt) => {
    if (fitSave.current && fitSave.current.key !== h.key) flushFit();
    if (fitSave.current) clearTimeout(fitSave.current.t);
    const run = () => {
      fitSave.current = null;
      void (h.packId ? api().hilts.setPackFit(h.packId, h.fit) : api().hilts.setFit(h.id!, h.fit)).then(
        () => setHiltNote((n) => (n?.startsWith('Could not save the fit') ? null : n)),
        (err) => setHiltNote(`Could not save the fit: ${errText(err)}. Your changes are shown but will be lost when you leave the room.`));
    };
    fitSave.current = { key: h.key, t: setTimeout(run, 300), run };
  };
  useEffect(() => { if (fitSave.current && fitSave.current.key !== hilt?.key) flushFit(); }, [hilt?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { flushFit(); const s = sceneSave.current; if (s) { clearTimeout(s.t); s.run(); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const room = scene.current;
    if (!room) return;
    if (!hilt) { loaded.current = null; room.setHilt(null, DEFAULT_FIT); setHiltLength(null); return; }
    let live = true;
    void (async () => {
      try {
        // Parsing is the slow part: only when the file changes, not for every nudge of a slider.
        const want = `${hilt.key}#${hilt.rev ?? 0}`;
        if (loaded.current?.key !== want) {
          let model: Object3D;
          if (hilt.packId) model = meshFromPack(await api().packs.mesh(hilt.packId));
          else { const m = await api().hilts.model(hilt.id!); model = await parseHilt(m.format, asArrayBuffer(m.data), m.sideFiles.map((f) => ({ name: f.name, data: asArrayBuffer(f.data) }))); }
          loaded.current = { key: want, model };
        }
        if (live) { setHiltLength(room.setHilt(loaded.current.model, hilt.fit)); setHiltNote((n) => (n?.startsWith('That model could not be read') ? null : n)); }
      } catch (err) { if (live) { room.setHilt(null, DEFAULT_FIT); setHiltNote(`That model could not be read: ${String(err).replace(/^Error: /, '')}`); } }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hilt?.key, hilt?.rev, hilt?.fit.flip, hilt?.fit.rollDeg, hilt?.fit.lengthCm, hilt?.fit.offsetXmm, hilt?.fit.offsetZmm, hilt?.fit.seatMm, hilt?.fit.staffSeatMm, hilt?.fit.tiltXDeg, hilt?.fit.tiltZDeg, hilt?.fit.axis, hilts.length]);
  /** Keep a loaded model. A taken name asks first; nothing is listed unless it was kept. */
  const addHilt = async (input: HiltInput, mode: HiltAddMode, note: string | null) => {
    try {
      const r = await api().hilts.add(input, mode);
      if ('taken' in r) { setTaken({ input, ...r.taken, note }); return; }
      const entry = ownEntry(r.added);
      setHilts((all) => (all.some((h) => h.key === entry.key) ? all.map((h) => (h.key === entry.key ? { ...entry, rev: (h.rev ?? 0) + 1 } : h)) : [...all, entry]));
      setHiltKey(entry.key); setFitOpen(true);
      setHiltNote(note);
    } catch (err) { setHiltNote(`Could not keep this hilt: ${errText(err)}. It has not been added.`); }
  };
  /** One model file, plus for an OBJ its .mtl and any textures, chosen together in the file picker. */
  const loadHiltFiles = async (files: FileList | null) => {
    const all = Array.from(files ?? []);
    const file = all.find((f) => formatOf(f.name));
    if (!file) { if (all.length) setHiltNote('Use a .glb, .obj or .stl file. For an OBJ with colours, select its .mtl (and any texture images) along with it.'); return; }
    const format = formatOf(file.name) as 'glb' | 'obj' | 'stl';
    const sideFiles: SideFile[] = await Promise.all(all.filter((f) => f !== file).map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
    const data = await file.arrayBuffer();
    try { await parseHilt(format, data.slice(0), sideFiles); } catch (err) { setHiltNote(`That model could not be read: ${String(err).replace(/^Error: /, '')}`); return; }
    const note = format === 'obj' && !sideFiles.some((f) => /\.mtl$/i.test(f.name)) ? 'Loaded without colours. To keep them, pick the .obj and its .mtl together (Ctrl+click both in the file dialog).' : null;
    await addHilt({ name: file.name.replace(/\.[^.]+$/, ''), format, data, sideFiles }, 'new', note);
  };
  const setFit = (patch: Partial<HiltFit>) => {
    if (!hilt) return;
    const next = { ...hilt, fit: { ...hilt.fit, ...patch } };
    setHilts((all) => all.map((h) => (h.key === hilt.key ? next : h)));
    saveFit(next);
  };
  /** Credit a hilt the owner loaded to whoever made it. Kept with the hilt. */
  const setHiltCreator = async (h: RoomHilt, creator: string) => {
    if (!h.id) return;
    try { await api().hilts.setCreator(h.id, creator); } catch (err) { setHiltNote(`Could not save the credit: ${errText(err)}`); return; }
    setHilts((all) => all.map((x) => { if (x.key !== h.key) return x; const { creator: _old, ...rest } = x; return creator ? { ...rest, creator } : rest; }));
  };
  /** After the owner confirms: a loaded hilt is removed; a pack hilt goes back to the pack's own fit. */
  const forgetHilt = async () => {
    setConfirm(null);
    if (!hilt) return;
    dropFit(hilt.key);
    if (hilt.packId) {
      const p = packs.find((x) => x.id === hilt.packId);
      try { await api().hilts.resetPackFit(hilt.packId); } catch (err) { setHiltNote(`Could not reset the fit: ${errText(err)}`); return; }
      setHilts((all) => all.map((h) => (h.key === hilt.key ? { ...h, fit: { ...DEFAULT_FIT, ...(p?.fit ?? {}) } } : h)));
      return;
    }
    try { await api().hilts.remove(hilt.id!); } catch (err) { setHiltNote(`Could not remove ${hilt.name}: ${errText(err)}`); return; }
    setHilts((all) => all.filter((h) => h.key !== hilt.key)); setHiltKey('');
  };
  /** Every hilt the owner loaded, with its fit and credit, and every pack fit adjustment, to one zip, and back. */
  const exportHilts = async () => {
    flushFit();
    try {
      const r = await api().hilts.export();
      if (r) setHiltNote(`Exported ${r.hilts} hilt${r.hilts === 1 ? '' : 's'}${r.packFits ? ` and ${r.packFits} pack fit${r.packFits === 1 ? '' : 's'}` : ''} to ${r.file}.`);
    } catch (err) { setHiltNote(`Could not export your hilts: ${errText(err)}`); }
  };
  const importHilts = async () => {
    flushFit();
    try {
      const r = await api().hilts.import();
      if (!r) return;
      await loadHiltList();
      setHiltNote(`Imported ${r.added || r.fits ? counted(r) : 'nothing new'}${r.skipped ? `; ${r.skipped} ${r.skipped === 1 ? 'was' : 'were'} already here` : ''}.`);
    } catch (err) { setHiltNote(`Could not import those hilts: ${errText(err)}`); }
  };
  /** The fit as text, for sending to whoever makes the pack. */
  const copyFit = () => { if (!hilt) return; const f = Object.fromEntries(Object.entries(hilt.fit).filter(([k, v]) => v !== (DEFAULT_FIT as unknown as Record<string, unknown>)[k] && v != null)); void navigator.clipboard.writeText(JSON.stringify({ hilt: hilt.packId ?? hilt.name, fit: f })); setHiltNote('Fit copied.'); };

  const [sceneOpen, setSceneOpen] = useState(() => { try { return localStorage.getItem('hiltwright.demo.sceneOpen') !== '0'; } catch { return true; } });
  useEffect(() => { if (look3d.staff) scene.current?.setLook(staffLook.id, staffArgs, 'staff'); scene.current?.applySettings(look3d); }, [look3d]);
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
    // Dev aid: the room itself, for the website's picture of the hilt (site/scripts/hilt.mjs).
    if (import.meta.env.DEV) (window as unknown as { hiltwrightDemoScene?: DemoScene }).hiltwrightDemoScene = room;
    room.setControlMode(control);
    room.setProp(propBehaviour(propKey));
    room.applySettings(look3d);
    room.onMotion = setMotion;
    room.sound = {
      preon: () => engineRef.current?.preon() ?? { preon: 0, out: 0 },
      cancelPreon: () => engineRef.current?.cancelPreon(),
      retract: () => engineRef.current?.retract() ?? { in: 0, postoff: 0 },
    };
    room.onEvent = (ev) => {
      const eng = engineRef.current;
      if (!eng) return;
      // An on or off that did not come through room.setOn (a style's FAST_ON / FAST_OFF) is a fast one: no preon,
      // no pstoff. When it did, the engine has already been asked and these do nothing more.
      if (ev.kind === 'on') eng.ignite(); else if (ev.kind === 'off') eng.retract(true);
      else if (ev.kind === 'clash' || ev.kind === 'blast' || ev.kind === 'stab') eng.effect(ev.kind);
      else if (ev.kind === 'lockup') { if (ev.type) eng.beginLockup(ev.type === 'normal' ? 'lock' : ev.type); else eng.endLockup(); }
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
    <div className="dark" style={{ position: 'relative', flex: 1, minHeight: 0, margin: '-18px -24px', overflow: 'hidden' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }} role="img" aria-label="A saber in a dark room. Drag to move the hand that holds it." />
      {failed && <div className="note red" style={{ position: 'absolute', left: 20, top: 20, maxWidth: 420 }}><Icon name="x" /><span>The demo room needs WebGL, which is not available here. {failed}</span></div>}

      {/* The saber panel: what is on the blade, what it sounds like, what the saber around it does; the deck of things to do to it stays at the foot. */}
      <section className="panel" style={{ position: 'absolute', left: 20, top: 20, width: 340, maxHeight: 'calc(100% - 40px)', display: 'flex', flexDirection: 'column', background: 'color-mix(in srgb,var(--bg1) 92%,transparent)' }} aria-label="Saber" data-tour="demo-panel">
        <div className="seg" role="tablist" aria-label="Saber panel" style={{ margin: 10, marginBottom: 0, height: 32 }}>
          {([['blade', 'Blade'], ['sound', 'Sound'], ['saber', 'Saber'], ['help', 'Help']] as const).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} style={{ flex: 1, justifyContent: 'center', height: 30, fontSize: 12.5 }} data-tour={`demo-tab-${id}`} onClick={() => setTab(id)}>{label}</button>
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
                <label className="field"><span className="label">{staff ? 'Staff blade style' : 'Style'}</span>
                  <span className="input sans"><span className="ellip">{cur.name}</span><span className="caret"><Icon name="down" /></span>
                    <Select value={curId} aria-label={staff ? 'Staff blade style' : 'Style'} onChange={(e) => setId(e.target.value)}><optgroup label="Hiltwright">{STARTERS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>{saved.length > 0 && <optgroup label="Your styles">{saved.map((l) => <option key={l.id} value={l.id}>{l.name}{l.by && l.by !== 'you' ? ` (${l.by})` : ''}</option>)}</optgroup>}</Select></span>
                </label>
                <span className="hint" style={{ fontSize: 12 }}>{cur.description}</span>
                <LookPreviewNote look={cur} />
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
                    <div className="row" style={{ gap: 6 }} title="Set the style, its colours and the font from one of the saber's presets">
                      <span className="input sans grow" style={{ height: 28, fontSize: 12 }}><span className="ellip">{presets[presetIndex]?.name.replace(/\s*\n\s*/g, ' ') ?? 'Preset'}</span><span className="caret"><Icon name="down" /></span>
                        <Select value={presetIndex} aria-label="Saber preset" onChange={(e) => setPresetIndex(Number(e.target.value))}>{presets.map((p, i) => <option key={i} value={i}>{i + 1}. {p.name.replace(/\s*\n\s*/g, ' ')}</option>)}</Select></span>
                      <button type="button" className="chip" disabled={!!loading} onClick={() => void loadFromSaber(presetIndex)}><Icon name="play" />Load</button>
                    </div>
                    <span className="hint" style={{ fontSize: 11.5 }}>The preset's style, colours and font, as they are on the saber.</span>
                    {fromNote && <span className="hint" style={{ fontSize: 11.5 }} role="status">{fromNote}</span>}
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
                  ? <span className="hint">No fonts to hand. <button type="button" className="holo" onClick={() => void addToLibrary()}>Add a font folder</button> to the Font library to hear it here.</span>
                  : (
                    <div className="row" style={{ gap: 6 }}>
                      <span className="input sans grow" style={{ height: 28, fontSize: 12 }}><span className="ellip">{source?.label ?? 'Source'}</span><span className="caret"><Icon name="down" /></span>
                        <Select value={source?.root ?? ''} aria-label="Where the fonts are" onChange={(e) => setSource(sources.find((x) => x.root === e.target.value) ?? null)}>{sources.map((x) => <option key={x.root} value={x.root}>{x.label}</option>)}</Select></span>
                      <button type="button" className="chip" title="Add a font folder to the Font library" onClick={() => void addToLibrary()}><Icon name="import" /></button>
                      <button type="button" className="chip" title="Look again" onClick={() => void refreshSources()}><Icon name="undo" /></button>
                    </div>
                  )}
              </div>
              {source && (
                <div className="col" style={{ gap: 6 }}>
                  <div className="row between"><span className="label">Font</span>{engine && <span className="hint" style={{ fontSize: 11.5 }}>{engine.hasSmoothSwing ? 'SmoothSwing' : engine.hasPlainSwings ? 'Swing sounds, no SmoothSwing' : 'no swing sounds'}</span>}</div>
                  <span className="input sans" style={{ height: 28, fontSize: 12 }}><span className="ellip">{(fontName && (libNames[fontName] ?? fontName)) || (fonts.length ? 'Pick a font' : 'No fonts here')}</span><span className="caret"><Icon name="down" /></span>
                    <Select value={fontName} aria-label="Sound font" disabled={!!loading} onChange={(e) => void loadFont(e.target.value)}><option value="">Pick a font</option>{fonts.map((f) => <option key={f.name} value={f.name}>{libNames[f.name] ?? f.name}</option>)}</Select></span>
                </div>
              )}
              <label className="col" style={{ gap: 6 }}>
                <div className="row between"><span className="label">Volume</span><span className="mono mute" style={{ fontSize: 11 }}>{Math.round(volume * 100)}%</span></div>
                <input type="range" min={0} max={1} step={0.05} value={volume} aria-label="Volume" onChange={(e) => setVolume(Number(e.target.value))} />
              </label>
              {loading && <span className="hint">{loading.what === 'reading' ? 'Reading' : 'Decoding'} {loading.done}{loading.total ? ` of ${loading.total}` : ''}…</span>}
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
                  <Select value={propKey} aria-label="Prop file" onChange={(e) => setPropKey(e.target.value)}>{Object.keys(PROPS).map((k) => <option key={k} value={k}>{PROPS[k].name}{k === saberProp ? ' (this saber)' : ''}</option>)}</Select></span>
              </label>
              <ul className="col" style={{ gap: 4, margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--dim)' }}>
                <li>{prop.stylesCanPower ? 'A style can turn the saber off and back on itself.' : 'A style cannot turn the saber off or on; those parts of a style do not happen.'}</li>
                <li>{prop.abilities ? `Special abilities: ${prop.abilityGesture}.` : 'No special abilities.'}</li>
                <li>{prop.transitionSounds ? 'Plays a style’s own sounds (tr files).' : 'Does not play a style’s own sounds.'}</li>
                {prop.abilitiesDefine && <li>Hiltwright adds {prop.abilitiesDefine} to the build when a style uses abilities.</li>}
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
                <span className="hint" style={{ fontSize: 11.5 }}>For seeing what a style does with direction. Uses tilt-and-swing control, where the hand stays put; the mouse takes over again as soon as you drag.</span>
              </div>
            </>
          )}
        </div>

        {/* The deck: everything you can do to the saber, with its key. */}
        <div className="col" style={{ gap: 8, padding: 12, borderTop: '1px solid var(--line)', background: 'color-mix(in srgb,var(--bg0) 60%,transparent)' }} data-tour="demo-deck">
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn sm pri grow" style={{ justifyContent: 'center' }} title={motion.preon ? 'Preon is playing; pressing again cancels it, as on the saber' : undefined} onClick={() => { room?.setOn(!room.isOn); setHold(null); }}><span className="b"><span className="i">{motion.on ? 'Retract' : motion.preon ? 'Cancel preon' : 'Ignite'}<kbd className="kbd">Space</kbd></span></span></button>
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

      <section className="panel" style={{ position: 'absolute', right: 20, bottom: 18, width: 280, maxHeight: 'calc(100% - 130px)', display: 'flex', flexDirection: 'column', background: 'color-mix(in srgb,var(--bg1) 92%,transparent)' }} aria-label="Scene" data-tour="demo-scene">
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
            <div className="row" style={{ gap: 8 }} title="How densely the strip inside is populated. The count follows from the length: a shorter blade has fewer LEDs, and every style runs on that many.">
              <span className="dim" style={{ width: 76, flex: 'none' }}>Strip</span>
              <span className="input sans" style={{ height: 28, fontSize: 12, width: 92, flex: 'none' }}><span className="ellip">{look3d.ledsPerMetre}/m</span><span className="caret"><Icon name="down" /></span>
                <Select value={look3d.ledsPerMetre} aria-label="LEDs per metre of strip" onChange={(e) => setLook3d((v) => ({ ...v, ledsPerMetre: Number(e.target.value) }))}>{STRIP_DENSITIES.map((d) => <option key={d} value={d}>{d} per metre</option>)}</Select></span>
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
                <Select value={hilt && hilt !== builtIn ? hilt.key : ''} aria-label="Hilt model" onChange={(e) => { setConfirm(null); setHiltKey(e.target.value); }}><option value="">Built-in</option>
                  {hilts.some((h) => !h.packId) && <optgroup label="Your hilts">{hilts.filter((h) => !h.packId).map((h) => <option key={h.key} value={h.key}>{h.name}</option>)}</optgroup>}
                  {hilts.some((h) => h.packId && h !== builtIn) && <optgroup label="From packs">{hilts.filter((h) => h.packId && h !== builtIn).map((h) => <option key={h.key} value={h.key}>{h.name}</option>)}</optgroup>}
                </Select></span>
              <label className="chip" style={{ cursor: 'pointer', position: 'relative', overflow: 'hidden' }} title="Load a .glb, .obj or .stl file. For an OBJ, select its .mtl and textures with it."><Icon name="import" />Load
                <input type="file" multiple accept=".glb,.gltf,.obj,.stl,.mtl,.png,.jpg,.jpeg,.webp,.tga" aria-label="Load a hilt model" style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} onChange={(e) => { void loadHiltFiles(e.target.files); e.target.value = ''; }} /></label>
            </div>
            {taken && (
              <div className="note amber" role="alertdialog" aria-label="A hilt with this name is already here"><Icon name="warn" /><span className="col" style={{ gap: 8 }}>
                <span>You already have a hilt called {taken.name}. Replace its model, keeping its fit and credit, or keep both?</span>
                <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn sm pri" onClick={() => { const t = taken; setTaken(null); void addHilt(t.input, { replace: t.id }, t.note); }}><span className="b"><span className="i">Replace</span></span></button>
                  <button type="button" className="btn sm" onClick={() => { const t = taken; setTaken(null); void addHilt(t.input, 'keepBoth', t.note); }}><span className="b"><span className="i">Keep both</span></span></button>
                  <button type="button" className="btn sm ghost" onClick={() => setTaken(null)}><span className="b"><span className="i">Cancel</span></span></button>
                </span>
              </span></div>
            )}
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
                <div className="row" style={{ gap: 14, justifyContent: 'flex-end' }}><button type="button" className="holo small" title="Copy the fit as text" onClick={copyFit}>Copy fit</button><button type="button" className="holo small" onClick={() => setConfirm(hilt.packId ? 'reset' : 'remove')}>{hilt.packId ? 'Reset fit' : 'Remove'}</button></div>
                {confirm && (
                  <div className="note amber" role="alertdialog" aria-label={confirm === 'remove' ? 'Remove this hilt' : 'Reset this fit'}><Icon name="warn" /><span className="col" style={{ gap: 8 }}>
                    <span>{confirm === 'remove' ? `Remove ${hilt.name} from Hiltwright? Its fit and credit go with it. Your original file is not touched.` : `Reset the fit of ${hilt === builtIn ? 'the built-in hilt' : hilt.name} to the pack's own? Your adjustments will be lost.`}</span>
                    <span className="row" style={{ gap: 8 }}>
                      <button type="button" className="btn sm danger" onClick={() => void forgetHilt()}><span className="b"><span className="i">{confirm === 'remove' ? 'Remove' : 'Reset'}</span></span></button>
                      <button type="button" className="btn sm ghost" onClick={() => setConfirm(null)}><span className="b"><span className="i">Keep</span></span></button>
                    </span>
                  </span></div>
                )}
              </>
            )}
            {hilt && <HiltCredit key={hilt.key} hilt={hilt} title={hilt === builtIn ? 'Punk Saber' : hilt.name} licence={packs.find((p) => p.id === hilt.packId)?.licence ?? null} onCreator={(creator) => void setHiltCreator(hilt, creator)} />}
            {hiltNote && <span className={OK_NOTE.test(hiltNote) ? 'hint' : 'red small'} role={OK_NOTE.test(hiltNote) ? undefined : 'alert'}>{hiltNote}</span>}
            <div className="row" style={{ gap: 14 }} title="Keep your hilts, their fits and credits in one zip file, to move to another computer or keep safe">
              <button type="button" className="holo small" onClick={() => void exportHilts()}>Export hilts…</button>
              <button type="button" className="holo small" onClick={() => void importHilts()}>Import hilts…</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Who made the hilt in the room, with their logo. A pack's creator comes with the pack; a hilt the owner loaded can
 * be credited here, and then counts among that person's work on the Contributors page.
 */
function HiltCredit({ hilt, title, licence, onCreator }: { hilt: RoomHilt; title: string; licence: string | null; onCreator: (creator: string) => void }) {
  const people = useContributors();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const own = !hilt.packId;
  if (editing) {
    return (
      <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); onCreator(draft.trim()); setEditing(false); }}>
        <span className="input sans grow" style={{ height: 28 }}><input type="text" autoFocus value={draft} placeholder="Who made this hilt" aria-label={`Who made ${title}`} onChange={(e) => setDraft(e.target.value)} /></span>
        <button type="submit" className="btn sm pri"><span className="b"><span className="i">Save</span></span></button>
        <button type="button" className="chip" aria-label="Cancel" onClick={() => setEditing(false)}><Icon name="x" /></button>
      </form>
    );
  }
  if (!hilt.creator) return own ? <button type="button" className="holo small" style={{ alignSelf: 'flex-start' }} onClick={() => { setDraft(''); setEditing(true); }}>Credit who made this hilt</button> : null;
  return (
    <span className="row" style={{ gap: 8 }}>
      <ContributorLogo name={hilt.creator} logo={people.logoFor(hilt.creator)} size={24} />
      <span className="hint grow">{title} by {hilt.creator}{licence ? `, ${licence}` : ''}</span>
      {own && <button type="button" className="holo small" onClick={() => { setDraft(hilt.creator ?? ''); setEditing(true); }}>Edit</button>}
    </span>
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
