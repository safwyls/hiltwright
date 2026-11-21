// Presets: the saber's list of presets, each a name, a sound font, a track, and a look for every blade with its
// colours. One editor, mounted twice (docs/install-live-plan.md):
//   install  Install › Presets. Always the list for the next install: changes wait in the saber's model and replace
//            its presets when it is installed (a snapshot of the saber's own is kept first). Never needs the saber or its
//            card. When the saber has changed since the list was started (live, say), it says so and offers to bring
//            the saber's presets in. Preset sets are saved and loaded here.
//   live     Live › Presets. Always the saber's own list, even while a list for the next install waits: each change is
//            written to the saber now and shown as saved once it reads it back. Only styles its firmware carries can be
//            chosen. Read-only while the saber is unplugged, has no readable card, or shares its card with this computer
//            (ProffieOS saves presets on the card).

import { useEffect, useMemo, useRef, useState } from 'react';
import { STARTER_LOOKS, argInfo, bankFromSaber, bankLoadCheck, bankToModel, colorWordToHex, formatBuiltin, formatStyleArgs, hexToColorWord, lookSlots, parseStyleArgs, planRestore, registerLookSim, singleWords, starterLookFor, type BankLoadCheck, type LookDef, type PresetBank, type PresetRecord, type RestorePlan, type SaberConfigModel } from '@hiltwright/core';
import { BladePreview, canSimulate } from './BladePreview';
import { LookPreviewNote } from './PreviewNote';
import { SaberControls } from './Controls';
import type { Board } from './board';
import { Icon } from './Icon';
import { LoadingSpace } from './Loader';
import { ROLE_META } from './hardwareModel';
import type { Workspace } from './workspace';
import type { LibraryFont, SnapshotMeta } from '../../shared/api';
import { FontPicker } from './FontPicker';
import { Select } from './Select';
import { joinFont, splitFont } from './presetFields';
import { withSlotChoice } from './slotModel';
import { draftModel, presetBase, presetDrift, withPresetRenamed } from './saberModel';

const api = () => window.hiltwright;
type ModelPreset = SaberConfigModel['presets'][number];
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const clean = (name: string) => name.replace(/\s*\n\s*/g, ' ');

type PresetsGo = (page: 'looks' | 'build' | 'wiring' | 'armory' | 'fonts' | 'library' | 'presets' | 'live-presets' | 'live-card') => void;

export function Presets({ ws, board, go, mode }: { ws: Workspace; board: Board; go: PresetsGo; mode: 'install' | 'live' }) {
  const { saber, info, live } = ws;
  const inLive = mode === 'live';
  // A list for the next install is waiting (staged): Install shows and edits it; Live leaves it alone.
  const staged = !!ws.model?.presetsFrom;
  // Live always shows the saber's own list, so while a list for the next install waits, it is worked out without it.
  const model = useMemo(() => {
    if (!inLive || !staged || !info || !saber?.model) return ws.model;
    const { presetsFrom: _waiting, ...own } = saber.model;
    return draftModel(info, { ...saber, model: own });
  }, [inLive, staged, info, saber, ws.model]);
  // Live and plugged in: each change goes to the saber at once.
  const isLive = inLive && live && !!info;
  // Plugged in, and the saber said it cannot read its card: nothing is sent (design D6).
  const noCard = isLive && !!info?.sdMissing;
  // Shared with this computer: the saber saves presets on that card, so nothing is sent until it is back (card-safety D2).
  const sharedCard = isLive && board.card.shared;
  // Live with nothing plugged in shows the saber as last read, and changes nothing.
  const locked = noCard || sharedCard || (inLive && !isLive);
  const [ix, setIx] = useState(0);
  const [saved, setSaved] = useState<LookDef[]>([]);
  const [sets, setSets] = useState<PresetBank[]>([]);
  const [fonts, setFonts] = useState<string[]>([]);
  const [tracks, setTracks] = useState<string[]>([]);
  const [side, setSide] = useState<'sets' | 'try' | 'history'>(inLive ? 'try' : 'sets');
  const [note, setNote] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState<Record<string, string>>({});
  const [library, setLibrary] = useState<LibraryFont[]>([]);
  const [picking, setPicking] = useState(false);
  // History: the snapshot whose restore is being looked at, with its presets.
  const [restoring, setRestoring] = useState<{ meta: SnapshotMeta; presets: PresetRecord[] } | null>(null);
  useEffect(() => { setRestoring(null); }, [saber?.id, live]);
  // Sets: the set about to be loaded, with what loading it would do.
  const [loading, setLoading] = useState<{ bank: PresetBank } | null>(null);
  useEffect(() => { setLoading(null); }, [saber?.id]);
  // A colour is written once the picker has been still for half a second, or at once when it is left (F45).
  const colourTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => () => { for (const t of colourTimers.current.values()) clearTimeout(t); }, []);

  // Until each is read, an empty list means "not read yet": nothing is called missing, removed or empty meanwhile.
  const [savedRead, setSavedRead] = useState(false);
  const [setsRead, setSetsRead] = useState(false);
  const [libraryRead, setLibraryRead] = useState(false);
  useEffect(() => {
    void api().looks.list().then((ls) => { for (const l of ls) registerLookSim(l); setSaved(ls); }).finally(() => setSavedRead(true));
    void api().banks.list().then(setSets).finally(() => setSetsRead(true));
    void (async () => {
      const f = new Set<string>(); const t = new Set<string>();
      for (const s of board.library) { for (const x of s.fonts) if (x !== 'common') f.add(x); for (const x of s.tracks) t.add(x); }
      if (info) { for (const x of info.fonts) if (x !== 'common') f.add(x); for (const x of info.tracks) t.add(x); }
      // Fonts in the library can be named before they are on the card; Fonts & SD copies them over.
      try {
        const lib = await api().fontLibrary.list();
        setLibrary(lib);
        for (const x of lib) {
          f.add(x.folder);
          if (x.support.tracks) for (const tr of (await api().fontLibrary.detail(x.folder)).tracks) t.add(`${x.folder}/${tr.path}`);
        }
      } catch { /* library unreadable */ }
      setLibraryRead(true);
      setFonts([...f].sort((a, b) => a.localeCompare(b))); setTracks([...t].sort());
    })();
  }, [saber?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Live: the row the saber has selected is the one being edited.
  useEffect(() => { if (isLive && info?.currentPreset != null) setIx(info.currentPreset); }, [isLive, info?.currentPreset]);
  useEffect(() => { setConfirmDelete(false); }, [ix, saber?.id]);

  // Styles the saber's plan still carries after they were removed from the style library: they stay on this saber and
  // stay choosable here, or a preset using one would read as "Saber's default" while the plan installs the style (hote2, 2026-11-18).
  const keptLooks = useMemo(() => (savedRead ? (model?.looks ?? []).filter((l) => !saved.some((x) => x.id === l.id) && !STARTER_LOOKS.some((x) => x.id === l.id)) : []), [model?.looks, saved, savedRead]);
  const keptIds = useMemo(() => new Set(keptLooks.map((l) => l.id)), [keptLooks]);
  // Their previews need registering like the library's own.
  useEffect(() => { for (const l of keptLooks) registerLookSim(l); }, [keptLooks]);
  const allLooks = useMemo(() => [...STARTER_LOOKS, ...saved, ...keptLooks], [saved, keptLooks]);
  const lookById = (id: string | null | undefined) => (id ? allLooks.find((l) => l.id === id) ?? null : null);
  const compiled = new Set((saber?.firmware?.looks ?? []).map((l) => l.id));

  if (!saber && ws.loading) return <section className="panel fill"><LoadingSpace text="Reading your sabers…" /></section>;
  if (!saber || !model || !info) {
    return <section className="panel"><div className="pb col" style={{ gap: 6 }}><h3>No saber to set presets for yet</h3><span className="dim small">Plug a saber in, or start one in the Armory.</span><button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go('armory')}><span className="b"><span className="i">Go to the Armory</span></span></button></div></section>;
  }

  const presets = model.presets;
  const cur = presets[Math.min(ix, presets.length - 1)] ?? null;
  const curIx = Math.min(ix, Math.max(0, presets.length - 1));
  const liveRec = isLive ? info.presets[curIx] ?? null : null;

  // ---- writing a change: to the saber in Live, into the list for the next install in Install ----
  // A list started here remembers the saber's presets as they were, so a later change on the saber can be noticed.
  const startList = (why: string) => ({ name: why, at: new Date().toISOString(), ...(presetBase(info) ? { base: presetBase(info) } : {}) });
  const stage = async (fn: (m: SaberConfigModel) => void, why = 'edits made here') => {
    const next = structuredClone(model);
    fn(next);
    if (!next.presetsFrom) next.presetsFrom = startList(why);
    await ws.saveModel(next);
  };
  // What Live learns about the saber's own presets (a rename, a style in a slot) is kept with its model, unless a list
  // for the next install is waiting there: that list is the owner's, and Live never changes it.
  const keepLive = async (next: SaberConfigModel) => { if (!staged) await ws.saveModel(next); };
  const editPreset = async (patch: Partial<ModelPreset>, label: string) => {
    if (locked) return;
    if (isLive) {
      // The model as it was when the owner acted: a draft rebuilt meanwhile from the read-back loses nothing.
      const snapshot = model;
      const ok = await board.editPreset(patch, label);
      // A rename keeps the preset's chosen styles under its new name (design D2).
      if (ok && patch.name !== undefined) await keepLive(withPresetRenamed(snapshot, curIx, patch.name));
      return;
    }
    await stage((m) => { Object.assign(m.presets[curIx], patch); });
  };
  const setLook = async (blade: number, look: LookDef | null, args: string | null) => {
    if (locked) return;
    const snapshot = model;
    if (isLive) {
      const slots = look && saber.firmware ? lookSlots(saber.firmware, look.id) : [];
      const slot = slots.find((s) => s.blade === blade) ?? slots[0];
      if (look && slot) {
        // Written, and on the saber with its colours: the slot now holds this style, and nothing is left to write (F37).
        if (await board.setPresetStyles(curIx, { [blade]: formatBuiltin({ preset: slot.preset, blade: slot.blade, args }) }, `${look.name} → ${clean(cur?.name ?? '')}`)) await keepLive(withSlotChoice(snapshot, curIx, blade, look, null));
        return;
      }
      // Live changes only what the firmware carries; anything else goes on with an install.
      setNote({ tone: 'amber', text: `${look ? `"${look.name}" is not in ${saber.name}'s firmware` : 'That style is not in the firmware'}, so it cannot be chosen live. Choose it in Install › Presets: it goes on with the next install.` });
      return;
    }
    // Install: the model carries it to the next build, with its colours.
    const next = withSlotChoice(snapshot, curIx, blade, look, args);
    if (!next.presetsFrom) next.presetsFrom = startList('edits made here');
    await ws.saveModel(next);
  };
  const writeColour = (key: string, blade: number, look: LookDef, args: Map<number, string>, n: number, hex: string) => {
    const t = colourTimers.current.get(key);
    if (t) clearTimeout(t);
    colourTimers.current.delete(key);
    const m = new Map(args); m.set(n, hexToColorWord(hex));
    void setLook(blade, look, formatStyleArgs(m) || null).finally(() => setPending((p) => { if (p[key] !== hex) return p; const { [key]: _x, ...rest } = p; return rest; }));
  };
  const colourMoved = (key: string, blade: number, look: LookDef, args: Map<number, string>, n: number, hex: string) => {
    setPending((p) => ({ ...p, [key]: hex }));
    const t = colourTimers.current.get(key);
    if (t) clearTimeout(t);
    colourTimers.current.set(key, setTimeout(() => writeColour(key, blade, look, args, n, hex), 500));
  };
  const colourLeft = (key: string, blade: number, look: LookDef, args: Map<number, string>, n: number, hex: string) => {
    // Nothing moved since the timer wrote it: leaving sends nothing more.
    if (!colourTimers.current.has(key)) return;
    writeColour(key, blade, look, args, n, hex);
  };
  const add = async () => {
    if (locked) return;
    if (isLive) { await board.duplicatePreset(); return; }
    await stage((m) => { const src = m.presets[curIx]; m.presets.splice(curIx + 1, 0, src ? { ...structuredClone(src), name: `${src.name} copy` } : { name: `Preset ${m.presets.length + 1}`, font: 'common', track: '' }); });
    setIx(curIx + 1);
  };
  const remove = async () => {
    setConfirmDelete(false);
    if (locked) return;
    if (isLive) { await board.deletePreset(); return; }
    await stage((m) => { m.presets.splice(curIx, 1); });
    setIx(Math.max(0, curIx - 1));
  };
  const move = async (to: number) => {
    if (to < 0 || to >= presets.length || locked) return;
    if (isLive) { await board.movePreset(to); return; }
    await stage((m) => { const [p] = m.presets.splice(curIx, 1); m.presets.splice(to, 0, p); });
    setIx(to);
  };
  // Live unplugged still lets each preset be looked at; plugged in, choosing one selects it on the saber.
  const select = (i: number) => { if (isLive) { if (!locked) void board.choosePreset(i); } else setIx(i); };

  // ---- preset sets ----
  const saveAsSet = async () => {
    const bank = bankFromSaber(`${saber.name} presets`, isLive ? info.presets : presets.map((p) => ({ name: p.name, font: p.font, track: p.track, styles: model.blades.map((_b, k) => (p.looks?.[k] ? `builtin 0 ${k + 1}${p.lookArgs?.[k] ? ` ${p.lookArgs[k]}` : ''}` : '')), variation: 0 })), model.blades, isLive ? saber.firmware : { hash: '', os: '', at: '', looks: [], presets: presets.map((p) => ({ name: p.name, looks: model.blades.map((_b, k) => p.looks?.[k] ?? '') })) });
    setSets(await api().banks.save(bank));
    setNote({ tone: 'green', text: `Saved "${bank.name}": ${bank.presets.length} presets, to load onto any saber.` });
  };
  // A set's problems, and staged edits it would replace, are shown first; a clean load onto nothing staged goes at once.
  const askLoad = (bank: PresetBank) => {
    const check = bankLoadCheck(bank, model, allLooks);
    if (check.needsConfirm) setLoading({ bank }); else void loadSet(bank);
  };
  // Worked out again on every render: staged edits made while it is open are counted.
  const loadCheck: BankLoadCheck | null = loading ? bankLoadCheck(loading.bank, model, allLooks) : null;
  const loadSet = async (bank: PresetBank) => {
    setLoading(null);
    const loaded = bankToModel(bank, model, allLooks);
    // Counted from the saber as it was when the list first left it: an earlier list's starting point is kept.
    const base = model.presetsFrom?.base ?? presetBase(info);
    const next = { ...loaded, presetsFrom: { ...loaded.presetsFrom!, ...(base ? { base } : {}) } };
    await ws.saveModel(next);
    setIx(0);
    setNote({ tone: 'green', text: `"${bank.name}" is loaded: ${bank.presets.length} preset${bank.presets.length === 1 ? '' : 's'}, staged for the next install${live ? `, replacing what is on ${saber.name}` : ''}.` });
  };
  // ---- the saber changed since the list for the next install was started (Install only) ----
  const drift = !inLive && live ? presetDrift(model, info) : null;
  // Bringing the saber's presets in keeps the owner's list as a preset set first, so nothing they made is lost.
  const bringIn = async () => {
    const name = `${saber.name}, my list before bringing in the saber's (${when(new Date().toISOString())})`;
    const bank = bankFromSaber(name, presets.map((p) => ({ name: p.name, font: p.font, track: p.track, styles: model.blades.map((_b, k) => (p.looks?.[k] ? `builtin 0 ${k + 1}${p.lookArgs?.[k] ? ` ${p.lookArgs[k]}` : ''}` : '')), variation: 0 })), model.blades, { hash: '', os: '', at: '', looks: [], presets: presets.map((p) => ({ name: p.name, looks: model.blades.map((_b, k) => p.looks?.[k] ?? '') })) });
    try { setSets(await api().banks.save(bank)); } catch (err) { setNote({ tone: 'red', text: `Your list could not be kept as a set, so the saber's presets were not brought in: ${String(err)}` }); return; }
    const { presetsFrom: _drop, ...rest } = model;
    await ws.saveModel(rest);
    setIx(0);
    setNote({ tone: 'green', text: `These are ${saber.name}'s presets now. Your earlier list is kept as the set "${name}".` });
  };
  // Keeping the list: it is now counted from the saber as it is, so the same change is not pointed out again.
  const keepMine = async () => { if (model.presetsFrom) await ws.saveModel({ ...model, presetsFrom: { ...model.presetsFrom, ...(presetBase(info) ? { base: presetBase(info) } : {}) } }); };

  // ---- history: what a restore changes is worked out against the list as it is now, and shown first (F33) ----
  const showRestore = async (meta: SnapshotMeta) => {
    try { setRestoring({ meta, presets: await board.readSnapshot(meta) }); } catch (err) { setNote({ tone: 'red', text: `That snapshot could not be read: ${String(err)}` }); }
  };
  const restorePlan = restoring ? planRestore(restoring.presets, info.presets) : null;
  const dropStaged = async () => { const { presetsFrom: _drop, ...rest } = model; await ws.saveModel(rest); setNote(null); };

  const fontFolders = [...new Set([...fonts, ...(cur ? [splitFont(cur.font).folder] : [])])].filter(Boolean);
  const trackChoices = [...new Set(['', ...tracks, ...(cur ? [cur.track] : [])])];
  const cf = cur ? splitFont(cur.font) : { folder: '', extra: [], common: true };
  // Read-only when locked: every control is off, as while a write to the saber is under way (Live only).
  const busy = (isLive && board.busy) || locked;
  // The preset's font as the library knows it, and whether the saber's card has it (as last read).
  const libFont = library.find((f) => f.folder.toLowerCase() === cf.folder.toLowerCase()) ?? null;
  const cardFonts = info.fonts.length ? new Set(info.fonts) : null;
  const fontOnCard = cardFonts && cf.folder ? [...cardFonts].some((x) => x.toLowerCase() === cf.folder.toLowerCase()) : null;

  return (
    <>
      {picking && cur && (
        <FontPicker fonts={library} loading={!libraryRead} current={cf.folder} onCard={cardFonts} onClose={() => setPicking(false)} onManage={() => go('library')}
          onPick={(f) => { setPicking(false); void editPreset({ font: joinFont({ ...cf, folder: f.folder }) }, `Font → ${f.folder}`); }} />
      )}
      {/* Install: the list for the next install, and whether the saber has moved on since it was started. */}
      {!inLive && staged && (
        <div className="note amber"><Icon name="info" /><span>{live ? `These ${presets.length} presets are your list for the next install (${model.presetsFrom!.name}, ${when(model.presetsFrom!.at)}). They replace the ${info.presets.length} on ${saber.name} when it is installed; a snapshot of the saber's own is kept first. ` : `These presets are your list for the next install (${model.presetsFrom!.name}, ${when(model.presetsFrom!.at)}). `}<button type="button" className="holo" onClick={() => void dropStaged()}>Discard my changes</button></span></div>
      )}
      {!inLive && drift !== null && (
        <div className="note amber" role="alert"><Icon name="warn" /><span className="col" style={{ gap: 8 }}>
          <span>{saber.name} has changed since this list was made: {drift} preset{drift === 1 ? '' : 's'} differ{drift === 1 ? 's' : ''}, changed on the saber itself. Installing this list replaces those changes.</span>
          <span className="row" style={{ gap: 8 }}>
            <button type="button" className="btn sm" onClick={() => void bringIn()}><span className="b"><span className="i"><Icon name="undo" />Bring in the saber's presets</span></span></button>
            <button type="button" className="btn sm ghost" onClick={() => void keepMine()}><span className="b"><span className="i">Keep my list</span></span></button>
          </span>
        </span></div>
      )}
      {!inLive && !staged && !saber.planned && <div className="note"><Icon name="info" /><span>{live ? `These are ${saber.name}'s presets. ` : `These are ${saber.name}'s presets as last read. `}Changes here are kept for the next install and go on with it, with the card in the saber or in a reader.{live && <> To change the saber right now, use <button type="button" className="holo" onClick={() => go('live-presets')}>Live › Presets</button>.</>}</span></div>}
      {/* Live: the saber as it is. */}
      {inLive && !live && <div className="note"><Icon name="info" /><span>{saber.planned ? `${saber.name} has not been installed yet, so it has nothing to change live. Set its presets up in ` : `${saber.name} is not plugged in. These are its presets as last read. Plug it in to change them, or change them for the next install in `}<button type="button" className="holo" onClick={() => go('presets')}>Install › Presets</button>.</span></div>}
      {inLive && live && staged && <div className="note"><Icon name="info" /><span>A list for the next install is waiting in <button type="button" className="holo" onClick={() => go('presets')}>Install › Presets</button>. Changes here go to {saber.name} now and leave that list as it is.</span></div>}
      {sharedCard && !noCard && <div className="note amber"><Icon name="warn" /><span className="col" style={{ gap: 8 }}><span>{saber.name}'s card is shared with this computer. Give it back on Live › Card first. Preset changes, and the preset in use, are saved on the card, so nothing is sent from here while it is shared.</span><span><button type="button" className="btn sm" onClick={() => go('live-card')}><span className="b"><span className="i"><Icon name="sd" />Go to Live › Card</span></span></button></span></span></div>}
      {noCard && <div className="note red"><Icon name="info" /><span className="col" style={{ gap: 8 }}><span>{saber.name} has no readable SD card. Preset changes, and the preset in use, are saved on the card, so nothing can be changed here until it is back in. Put the card back, then reconnect, or make the change for the next install instead.</span><span><button type="button" className="btn sm" onClick={() => go('presets')}><span className="b"><span className="i">Change them in Install › Presets</span></span></button></span></span></div>}
      {note && <div className={`note ${note.tone}`}><Icon name={note.tone === 'green' ? 'check' : 'info'} /><span>{note.text}</span></div>}

      <div className="work" style={{ gridTemplateColumns: 'minmax(220px,280px) minmax(0,1fr) minmax(260px,320px)' }}>
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Preset list" data-tour="presets-list">
          <div className="ph"><h2>Presets · {presets.length}</h2>
            <div className="row" style={{ gap: 4 }}>
              <button type="button" className="chip" disabled={busy || curIx <= 0} aria-label="Move preset up" title="Move up" onClick={() => void move(curIx - 1)}><Icon name="up" /></button>
              <button type="button" className="chip" disabled={busy || curIx >= presets.length - 1} aria-label="Move preset down" title="Move down" onClick={() => void move(curIx + 1)}><Icon name="down" /></button>
            </div>
          </div>
          <div className="list" role="listbox" aria-label="Presets" style={{ overflow: 'auto' }}>
            {presets.length === 0 && <div className="li hint" style={{ minHeight: 44 }}>No presets yet. Add one, or load a set.</div>}
            {presets.map((p, i) => (
              <button key={i} type="button" role="option" aria-selected={i === curIx} className={`li click ${i === curIx ? 'on' : ''}`} disabled={busy} onClick={() => select(i)}>
                <span className="n">{i + 1}</span>
                <span className="col grow" style={{ gap: 0 }}><span className="ellip" style={{ fontWeight: 600, fontSize: 13.5 }}>{clean(p.name) || 'Unnamed'}</span><span className="hint ellip">{splitFont(p.font).folder || 'no font'}</span></span>
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 'auto', padding: '10px 14px', borderTop: '1px solid var(--line)', gap: 6 }}>
            <button type="button" className="btn sm" disabled={busy} onClick={() => void add()}><span className="b"><span className="i"><Icon name={presets.length ? 'copy' : 'plus'} />{presets.length ? 'Duplicate' : 'Add'}</span></span></button>
            {confirmDelete
              ? <button type="button" className="btn sm danger" disabled={busy || presets.length <= 1} onClick={() => void remove()}><span className="b"><span className="i"><Icon name="trash" />Really delete</span></span></button>
              : <button type="button" className="btn sm ghost" disabled={busy || presets.length <= 1} onClick={() => setConfirmDelete(true)}><span className="b"><span className="i"><Icon name="trash" />Delete</span></span></button>}
          </div>
        </section>

        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Preset editor">
          <div className="ph" style={{ flexWrap: 'wrap', rowGap: 8 }}><h2 className="ellip" style={{ minWidth: 0 }}>{cur ? clean(cur.name) || 'Unnamed' : 'No preset'}</h2>
            {/* A change that failed as the saber went away stays visible once the page shows the stored presets. */}
            <div className="row" style={{ gap: 8, minWidth: 0, maxWidth: '100%', flex: '0 1 auto', flexWrap: 'wrap', justifyContent: 'flex-end' }} data-tour="presets-state">{!inLive ? (staged ? <span className="chip warn"><span className="dot" />Staged for install</span> : <span className="chip"><span className="dot" />No changes yet</span>) : noCard ? <span className="chip err"><Icon name="x" />No SD card</span> : sharedCard ? <span className="chip warn"><Icon name="sd" />Card shared</span> : isLive ? <SaveChip save={board.save} /> : <span className="chip"><span className="dot" />Not plugged in</span>}</div>
          </div>
          {cur && (
            <div className="pb col" style={{ gap: 16, overflowY: 'auto', overflowX: 'hidden' }}>
              <div className="grid2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }} data-tour="presets-fields">
                <CommitField label="Name" value={cur.name} sync={board.save} disabled={busy} onCommit={(name) => void editPreset({ name }, 'Rename')} />
                <div className="col" style={{ gap: 4, minWidth: 0 }}>
                  <CommitField label="Sound font" value={cf.folder} sync={board.save} list="hw-fonts" choices={fontFolders} placeholder="Folder name on the card" disabled={busy} onCommit={(folder) => void editPreset({ font: joinFont({ ...cf, folder }) }, `Font → ${folder}`)} />
                  {cf.extra.length > 0 && <span className="hint ellip" title="Other folders in this preset's font, kept as they are">Also uses: <span className="mono">{cf.extra.join(', ')}</span></span>}
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <span className="hint ellip grow" title={libFont?.meta.notes || undefined}>
                      {cf.folder && (libFont ? <>{libFont.meta.name}{libFont.meta.maker ? ` by ${libFont.meta.maker}` : ''}</> : libraryRead ? 'Not in the font library' : 'Looking in the font library…')}
                      {fontOnCard === true && <span className="green"> · on the card</span>}
                      {fontOnCard === false && <> · <span className="amber">not on the card</span>{libFont && <>, <button type="button" className="holo" onClick={() => go(inLive ? 'live-card' : 'fonts')}>copy it over</button></>}</>}
                    </span>
                    <button type="button" className="holo small nowrap" disabled={busy} title="Choose from the fonts in your font library" onClick={() => setPicking(true)}>Choose from library</button>
                  </div>
                </div>
                <CommitField label="Track" value={cur.track} sync={board.save} list="hw-tracks" choices={trackChoices.filter(Boolean)} placeholder="tracks/name.wav, or none" mono disabled={busy} onCommit={(track) => void editPreset({ track }, `Track → ${track || 'none'}`)} />
                <label className="row" style={{ gap: 10, alignSelf: 'end', minHeight: 38, fontSize: 13, color: 'var(--dim)' }}>
                  <button type="button" className={`tog ${cf.common ? 'on' : ''}`} role="switch" aria-checked={cf.common} disabled={busy} aria-label="Also use the common folder" onClick={() => void editPreset({ font: joinFont({ ...cf, common: !cf.common }) }, cf.common ? 'Drop common fallback' : 'Add common fallback')}><i /></button>
                  Also use <span className="mono">common</span> sounds
                </label>
              </div>

              <div className="col" style={{ gap: 8 }} data-tour="presets-styles">
                <div className="row between"><span className="label">Styles, one per blade</span><button type="button" className="holo small" onClick={() => go('looks')}>Browse and try styles</button></div>
                {model.blades.map((b, k) => {
                  const id = cur.looks?.[k] ?? null;
                  const look = lookById(id);
                  const liveStyle = liveRec?.styles[k];
                  const liveLook = isLive && saber.firmware && liveStyle ? (() => { const m = /^builtin\s+(\d+)\s+(\d+)/.exec(liveStyle); return m ? saber.firmware!.looks.find((l) => l.id === saber.firmware!.presets[Number(m[1])]?.looks[Number(m[2]) - 1]) ?? null : null; })() : null;
                  const shownLook = look ?? (liveLook ? lookById(liveLook.id) : null);
                  const args = parseStyleArgs(cur.lookArgs?.[k] ?? (liveStyle ? liveStyle.replace(/^builtin\s+\d+\s+\d+\s*/, '') : ''));
                  const choices = allLooks.filter((l) => l.roles.includes(b.role));
                  const onSaber = shownLook ? compiled.has(shownLook.id) : true;
                  const label = ROLE_META[b.role].label;
                  return (
                    <div key={b.id} className="bcard col" style={{ gap: 8, padding: '10px 12px' }}>
                      <div className="row" style={{ gap: 6, columnGap: 10, flexWrap: 'wrap' }}>
                        <span className="small" style={{ width: 130, flex: 'none', fontWeight: 600 }}>{k + 1}. {label}</span>
                        <span className="input sans grow" style={{ height: 30, minWidth: 170 }}><span className="ellip">{shownLook ? shownLook.name : liveStyle ? `${liveStyle} (not built here)` : isLive ? 'No style chosen' : `Saber’s default (uses ${starterLookFor(b.role).name})`}</span><span className="caret"><Icon name="down" /></span>
                          <Select value={shownLook?.id ?? ''} disabled={busy} aria-label={`Style for blade ${k + 1}, ${label}`} onChange={(e) => void setLook(k + 1, lookById(e.target.value), null)}>
                            {/* "Saber's default" means no style chosen, which only a staged list can mean (F36). */}
                            {isLive ? <option value="" disabled>No style chosen</option> : <option value="">Saber's default (uses {starterLookFor(b.role).name})</option>}
                            {/* Live offers only what the firmware carries; Install marks what needs a build. */}
                            <optgroup label="Hiltwright">{choices.filter((l) => l.source === 'starter').map((l) => <option key={l.id} value={l.id} disabled={inLive && !compiled.has(l.id)}>{l.name}{compiled.has(l.id) ? '' : inLive ? ' (not in the firmware)' : live ? ' (needs a build)' : ''}</option>)}</optgroup>
                            {choices.some((l) => keptIds.has(l.id)) && <optgroup label="Only on this saber (removed from your styles)">{choices.filter((l) => keptIds.has(l.id)).map((l) => <option key={l.id} value={l.id} disabled={inLive && !compiled.has(l.id)}>{l.name}</option>)}</optgroup>}
                            {choices.some((l) => l.source !== 'starter' && !keptIds.has(l.id)) && <optgroup label="Your styles">{choices.filter((l) => l.source !== 'starter' && !keptIds.has(l.id)).map((l) => <option key={l.id} value={l.id} disabled={inLive && !compiled.has(l.id)}>{l.name}{l.by && l.by !== 'you' ? ` (${l.by})` : ''}{compiled.has(l.id) ? '' : inLive ? ' (not in the firmware)' : live ? ' (needs a build)' : ''}</option>)}</optgroup>}
                          </Select></span>
                        {!inLive && shownLook && !onSaber && <span className="chip warn" title="Goes on with the next Build & Install"><Icon name="clock" />Queued</span>}
                        {shownLook && canSimulate(shownLook.id) && <div style={{ width: ROLE_META[b.role].kind === 'pixel' ? 150 : 24, flex: 'none' }}><BladePreview lookId={shownLook.id} args={args} leds={ROLE_META[b.role].kind === 'pixel' ? Math.min(60, Math.max(4, Math.round(b.pixels / 3))) : 1} dot={ROLE_META[b.role].kind !== 'pixel'} size="sm" /></div>}
                        {shownLook && canSimulate(shownLook.id) && <LookPreviewNote look={shownLook} compact />}
                      </div>
                      {shownLook && shownLook.args.length > 0 && (
                        <div className="row wrap" style={{ gap: 6 }}>
                          {shownLook.args.filter((n) => argInfo(n).kind === 'color').map((n) => {
                            const key = `${k}:${n}`;
                            const word = args.get(n);
                            const shown = pending[key] ?? (word ? colorWordToHex(word) : null) ?? shownLook.defaults?.[n] ?? (n === 1 ? shownLook.preview : '#ffffff');
                            return (
                              <label key={n} className={`swatch ${word || pending[key] ? '' : 'linked'}`} style={{ width: 'auto', height: 28, padding: '0 8px', gap: 6 }} title={`${argInfo(n).name}${word ? '' : ' (the look’s own)'}`}>
                                <span className="sq" style={{ width: 12, height: 12, background: shown, boxShadow: `0 0 8px ${shown}` }} />
                                <span className="small nowrap">{argInfo(n).name.replace(/ colour$/i, '')}</span>
                                <input type="color" value={shown} disabled={busy} aria-label={`${argInfo(n).name} for blade ${k + 1}`} onChange={(e) => colourMoved(key, k + 1, shownLook, args, n, e.target.value)} onBlur={(e) => colourLeft(key, k + 1, shownLook, args, n, e.target.value)} />
                              </label>
                            );
                          })}
                          {args.size > 0 && <button type="button" className="holo small" disabled={busy} onClick={() => void setLook(k + 1, shownLook, null)}>Style's own colours</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
                <span className="hint">{inLive ? 'Styles in the saber\'s firmware switch at once, with their colours. Any other style is chosen in Install › Presets and goes on with the next install.' : 'Styles and their colours go on with the next install; a style the firmware does not carry yet is built in.'}</span>
              </div>
            </div>
          )}
        </section>

        <section className="panel fill" aria-label="Sets, try it and history" data-tour="presets-sets">
          <div className="tabs" role="tablist">
            {!inLive && <button type="button" role="tab" aria-selected={side === 'sets'} className={side === 'sets' ? 'on' : ''} onClick={() => setSide('sets')}><Icon name="copy" />Sets<span className="count">{sets.length}</span></button>}
            {inLive && <button type="button" role="tab" aria-selected={side === 'try'} className={side === 'try' ? 'on' : ''} onClick={() => setSide('try')}><Icon name="bolt" />Try it</button>}
            {inLive && <button type="button" role="tab" aria-selected={side === 'history'} className={side === 'history' ? 'on' : ''} onClick={() => setSide('history')}><Icon name="clock" />History<span className="count">{board.snapshots.length}</span></button>}
          </div>
          {inLive && !isLive && <div className="pb hint">Plug {saber.name} in to try its effects and to see the snapshots kept before each change.</div>}
          {!inLive && side === 'sets' && (
            <>
              <div className="list" style={{ overflow: 'auto' }}>
                {!setsRead && <LoadingSpace text="Reading your preset sets…" compact />}
                {setsRead && sets.length === 0 && <div className="li hint" style={{ minHeight: 44 }}>No sets yet. Save this list as one to reuse it on another saber, or to keep a copy.</div>}
                {sets.map((s) => (
                  <div key={s.id} className="col" style={{ gap: 0 }}>
                    <div className="li" style={{ minHeight: 48, gap: 8 }}>
                      <span className="col grow" style={{ gap: 0 }}><span className="ellip small" style={{ fontWeight: 600 }}>{s.name}</span><span className="hint mono" style={{ fontSize: 11 }}>{s.presets.length} presets · {when(s.updated)}</span></span>
                      <button type="button" className="holo" style={{ fontSize: 11.5, fontWeight: 600 }} disabled={busy || loading?.bank.id === s.id} onClick={() => askLoad(s)}>Load</button>
                      <button type="button" className="chip" aria-label={`Delete set ${s.name}`} onClick={() => { if (loading?.bank.id === s.id) setLoading(null); void api().banks.remove(s.id).then(setSets); }}><Icon name="trash" /></button>
                    </div>
                    {loading?.bank.id === s.id && loadCheck && (
                      <div className="col" style={{ gap: 8, padding: '10px 14px 12px', borderBottom: '1px solid var(--line)' }}>
                        {loadCheck.problems.length > 0 && (
                          <div className="col" style={{ gap: 4 }}>
                            <span className="small" style={{ fontWeight: 600 }}>{loadCheck.canLoad ? `This set does not fit ${saber.name} exactly:` : 'This set cannot be loaded:'}</span>
                            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>{loadCheck.problems.map((p, k) => <li key={k}>{p}</li>)}</ul>
                          </div>
                        )}
                        {loadCheck.replacesStaged && <span className="small amber">{loadCheck.replacesStaged}</span>}
                        <span className="row" style={{ gap: 8 }}>
                          {loadCheck.canLoad && <button type="button" className="btn sm" disabled={busy} onClick={() => void loadSet(s)}><span className="b"><span className="i">{loadCheck.problems.length ? 'Load it anyway' : 'Load it'}</span></span></button>}
                          <button type="button" className="holo small" onClick={() => setLoading(null)}>Cancel</button>
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="col" style={{ marginTop: 'auto', padding: '12px 18px', borderTop: '1px solid var(--line)', gap: 8 }}>
                <button type="button" className="btn sm" disabled={!presets.length} onClick={() => void saveAsSet()}><span className="b"><span className="i"><Icon name="plus" />Save this list as a set</span></span></button>
                <span className="hint">A set keeps names, fonts, tracks and the style for each kind of blade, so it fits any saber. Loading one replaces this saber's presets at the next install.</span>
              </div>
            </>
          )}
          {side === 'try' && isLive && <SaberControls board={board} bare />}
          {side === 'history' && isLive && (
            <>
              <div className="list" style={{ overflow: 'auto' }}>
                {board.snapshots.length === 0 && <div className="li hint" style={{ minHeight: 40 }}>No snapshots yet.</div>}
                {board.snapshots.map((s, i) => (
                  <div key={s.file} className="col" style={{ gap: 0 }}>
                    <div className="li" style={{ minHeight: 44, gap: 8 }}>
                      <span className="col grow" style={{ gap: 0 }}><span className="ellip small">{s.label}</span><span className="hint mono" style={{ fontSize: 11 }}>{when(s.at)} · {s.presets} presets</span></span>
                      <button type="button" className="holo" style={{ fontSize: 11.5, fontWeight: 600 }} disabled={busy || restoring?.meta.file === s.file} onClick={() => void showRestore(s)}>{i === 0 ? 'Undo' : 'Restore'}</button>
                    </div>
                    {restoring?.meta.file === s.file && restorePlan && <RestorePreview plan={restorePlan} busy={busy} onCancel={() => setRestoring(null)} onRestore={(kind) => void board.restoreSnapshot(s, kind, restorePlan).then(() => setRestoring(null))} />}
                  </div>
                ))}
              </div>
              <div className="hint" style={{ marginTop: 'auto', padding: '12px 18px', borderTop: '1px solid var(--line)' }}>A snapshot of the saber's presets is kept before every change written to it. Restore first shows what it will change, then sends the earlier values back and waits for the saber to confirm them.</div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

/**
 * Committed when the field is left or Enter is pressed, not on every keystroke: a live edit is a write to the saber.
 * `sync` is the save state: each time it changes the field shows `value` again, so after a write the saber did not
 * confirm, the field shows what the saber reports rather than what was typed (F44).
 */
function CommitField({ label, value, sync, list, choices, placeholder, mono, disabled, onCommit }: { label: string; value: string; sync?: unknown; list?: string; choices?: string[]; placeholder?: string; mono?: boolean; disabled: boolean; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value, sync]);
  const commit = () => { if (v !== value) onCommit(v); };
  return (
    <form className="field" onSubmit={(e) => { e.preventDefault(); commit(); }}>
      <span className="label">{label}</span>
      <span className={`input${mono ? '' : ' sans'}`}><input type="text" list={list} value={v} disabled={disabled} aria-label={label} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} /></span>
      {list && choices && <datalist id={list}>{choices.map((c) => <option key={c} value={c} />)}</datalist>}
    </form>
  );
}

/** What restoring a snapshot will change, said before anything is sent (preset-history-restore, F33). */
function RestorePreview({ plan, busy, onRestore, onCancel }: { plan: RestorePlan; busy: boolean; onRestore: (kind: 'preset' | 'list') => void; onCancel: () => void }) {
  // When the whole list comes to the same one write as the single preset, one button says it.
  const wholeToo = !plan.wholeRefused && plan.steps.length > 0 && !(plan.single && plan.steps.length === 1);
  return (
    <div className="col" style={{ gap: 8, padding: '10px 14px 12px', borderBottom: '1px solid var(--line)' }}>
      {plan.same && <span className="small">{"The saber's presets already match this snapshot. Nothing to restore."}</span>}
      {plan.single && (
        <div className="col" style={{ gap: 6 }}>
          <span className="small">{singleWords(plan.single)}</span>
          <span><button type="button" className="btn sm" disabled={busy} onClick={() => onRestore('preset')}><span className="b"><span className="i">Restore this preset</span></span></button></span>
        </div>
      )}
      {!plan.same && plan.singleRefused && <span className="hint">{plan.singleRefused}</span>}
      {wholeToo && (
        <div className="col" style={{ gap: 6 }}>
          <span className="small" style={{ fontWeight: 600 }}>Restoring the whole list makes {plan.steps.length === 1 ? 'this change' : `these ${plan.steps.length} changes`}:</span>
          <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>{plan.changes.map((c, k) => <li key={k}>{c}</li>)}</ol>
          <span><button type="button" className="btn sm" disabled={busy} onClick={() => onRestore('list')}><span className="b"><span className="i">Restore the whole list</span></span></button></span>
        </div>
      )}
      {plan.wholeRefused && <span className="hint">{plan.wholeRefused}</span>}
      <span><button type="button" className="holo small" onClick={onCancel}>Cancel</button></span>
    </div>
  );
}

function SaveChip({ save }: { save: Board['save'] }) {
  switch (save.kind) {
    case 'writing': return <span className="chip warn"><span className="dot" />Writing {save.what}…</span>;
    case 'saved': return <span className="chip ok"><Icon name="check" />Saved, {save.what}</span>;
    case 'failed': return <span className="chip err"><Icon name="x" />{save.what} failed: {save.error}</span>;
    default: return <span className="chip live"><span className="dot" />Live on the saber</span>;
  }
}
