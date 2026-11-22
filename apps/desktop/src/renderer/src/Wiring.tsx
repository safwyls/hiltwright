// Wiring: the board, its buttons and prop, and every blade the saber drives. The one thing old firmware cannot tell
// us, so it is described here once and confirmed against the installer's notes. Everything is saved to the saber as
// it is changed; Build & Flash compiles from it.

import { useEffect, useRef, useState } from 'react';
import { carriedDefines, compareWiring, differenceText, parseId, wiringConfirmed, wiringFromConfig, withWiringConfirmation, type BladeVariant, type BoardModel, type ConfigWiring, type ModelBlade, type Prop, type SaberConfigModel } from '@hiltwright/core';
import { saberCardIn } from './cardOwner';
import { sharedLook } from './cardCache';
import { bladeWords, boardDefinesDiffer, importedBlades, importedBoardDefines, referenceFrom } from './wiringImport';
import { HardwareEditor } from './Hardware';
import { FEATURES } from './features';
import type { Board } from './board';
import { Icon } from './Icon';
import { Loader, LoadingSpace } from './Loader';
import type { Workspace } from './workspace';
import { Select } from './Select';
import { boardCorrection, boardSuggestion } from './saberModel';
import { checkBoard, type BoardCheck } from './installFlow';

export const PROPS: { value: Prop; label: string }[] = [
  { value: 'fett263', label: 'Fett263 · edit mode, gestures' }, { value: 'sa22c', label: 'SA22C' }, { value: 'bc', label: 'BC' }, { value: 'default', label: 'ProffieOS default' },
  { value: 'custom', label: 'Custom prop file…' },
];

/** The prop as the pages name it: a stock prop by its label, a custom one by its file. */
export function propLabel(m: Pick<SaberConfigModel, 'prop' | 'customProp'> | null | undefined): string {
  if (!m) return '';
  if (m.prop === 'custom') return m.customProp ? `Custom · ${m.customProp.file}` : 'Custom prop file (not chosen)';
  return PROPS.find((p) => p.value === m.prop)?.label ?? m.prop;
}

export function Wiring({ ws, board, go }: { ws: Workspace; board: Board; go: (page: 'presets' | 'armory' | 'fonts') => void }) {
  const { saber, info, model, live } = ws;
  // Edits happen on a local copy and are saved a moment after the last change, so a slider drag is one write. A change
  // still waiting when the page closes is saved then, not dropped (FW22).
  const [draft, setDraft] = useState<SaberConfigModel | null>(model);
  const pending = useRef<{ t: ReturnType<typeof setTimeout>; next: SaberConfigModel } | null>(null);
  // What this page edits, as last loaded or saved here: a model that differs from it was changed elsewhere.
  const wiringOf = (m: SaberConfigModel) => JSON.stringify({ board: m.board, boardFrom: m.boardFrom ?? null, buttons: m.buttons, prop: m.prop, customProp: m.customProp ?? null, blades: m.blades, bladeId: m.bladeId ?? null, boardDefines: m.boardDefines ?? null });
  const known = useRef<string | null>(model ? wiringOf(model) : null);
  const [outside, setOutside] = useState<string | null>(null);
  // Checking the board: the saber visits its bootloader for its flash size and comes straight back (design D8).
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<BoardCheck | null>(null);
  const runCheck = async () => {
    if (!saber) return;
    setChecking(true); setChecked(null);
    try {
      setChecked(await checkBoard({
        flash: window.hiltwright.flash, board,
        noteBootloader: async (id, seen) => { const r = await window.hiltwright.library.noteBootloader(id, seen); await board.refreshLibrary(); return r; },
        sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
      }, saber));
    } finally { setChecking(false); }
  };
  useEffect(() => { setDraft(model); known.current = model ? wiringOf(model) : null; setOutside(null); setChecked(null); }, [saber?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (model && !draft) setDraft(model); }, [model, draft]);
  // The saber's model changed elsewhere (an adoption, a restore): show it, and never save the older copy over it.
  useEffect(() => {
    if (!model) return;
    const now = wiringOf(model);
    if (now === known.current) return;
    known.current = now;
    if (pending.current) {
      clearTimeout(pending.current.t); pending.current = null;
      setOutside("This saber's wiring was changed elsewhere; your last change was not applied.");
    }
    setDraft(model);
  }, [model]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (next: SaberConfigModel) => { pending.current = null; known.current = wiringOf(next); void ws.saveModel(next); };
  // A confirmation records the layout it was given for, so a board or blade change withdraws it by itself and
  // changing back restores it; nothing here has to clear it.
  const update = (fn: (d: SaberConfigModel) => SaberConfigModel) => {
    setDraft((d) => {
      if (!d) return d;
      const next = fn(d);
      if (pending.current) clearTimeout(pending.current.t);
      pending.current = { t: setTimeout(() => save(next), 300), next };
      setOutside(null);
      return next;
    });
  };
  const change = (patch: Partial<SaberConfigModel>) => update((d) => ({ ...d, ...patch }));
  // A custom prop file: chosen from this computer, checked and kept by the app; the model records its name and hash.
  // Choosing "Custom" again reuses the file chosen before; Choose another file replaces it.
  const [propNote, setPropNote] = useState<string | null>(null);
  const pickProp = async () => {
    setPropNote(null);
    try {
      const cp = await window.hiltwright.build.pickProp();
      if (cp) change({ prop: 'custom', customProp: cp });
    } catch (err) { setPropNote(String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')); }
  };
  const chooseProp = (value: Prop) => {
    if (value !== 'custom') { change({ prop: value }); return; }
    if (draft?.customProp) change({ prop: 'custom' }); else void pickProp();
  };
  useEffect(() => () => { const p = pending.current; if (p) { clearTimeout(p.t); save(p.next); } }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The installer's config file, when there is one: found on the saber's card in a card reader, or chosen from this
  // computer. Its pins are the surest source there is (the firmware cannot tell them), so it is shown beside the
  // wiring here, can fill it in, and is remembered so Build & Flash warns when they differ.
  const [config, setConfig] = useState<{ name: string; from: 'card' | 'file'; where: string | null; wiring: ConfigWiring } | null>(null);
  const [configNote, setConfigNote] = useState<string | null>(null);
  const [configLooking, setConfigLooking] = useState(false);
  useEffect(() => {
    setConfig(null); setConfigNote(null);
    if (!saber) return;
    let live = true;
    setConfigLooking(true);
    void (async () => {
      try {
        // Shared with any other page looking for drives at the same moment (cardCache.ts).
        const look = await sharedLook();
        const own = look.answered ? saberCardIn(look.cards, saber, board.library) : null;
        if (!own) return;
        for (const f of await window.hiltwright.sd.configFiles(own.card.root)) {
          const wiring = wiringFromConfig(f.text);
          if (wiring && live) { setConfig({ name: f.name, from: 'card', where: own.card.root, wiring }); return; }
        }
      } catch (err) { console.log(`[wiring] looking for a config on the card failed: ${String(err)}`); }
    })().finally(() => { if (live) setConfigLooking(false); });
    return () => { live = false; };
  }, [saber?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const pickConfig = async () => {
    setConfigNote(null);
    try {
      const f = await window.hiltwright.sd.pickConfig();
      if (!f) return;
      const wiring = wiringFromConfig(f.text);
      if (!wiring) { setConfigNote(`${f.name} has no BladeConfig table, so it says nothing about the wiring.`); return; }
      setConfig({ name: f.name, from: 'file', where: null, wiring });
    } catch (err) { setConfigNote(String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')); }
  };
  /** Fill in the wiring from the config, and check builds against it. A board read from the saber itself stays. */
  const useConfigWiring = () => {
    if (!config || !draft) return;
    const w = config.wiring;
    const keepBoard = draft.boardFrom === 'bootloader' || !w.board;
    change({
      blades: importedBlades(w, draft.blades),
      ...(keepBoard ? {} : { board: w.board!, boardFrom: 'owner' as const }),
      ...(w.buttons === 1 || w.buttons === 2 || w.buttons === 3 ? { buttons: w.buttons } : {}),
      // Its orientation, display, volume and the like (issue #14): builds would drop them otherwise.
      ...importedBoardDefines(w),
      wiringReference: referenceFrom(config.name, config.from, w),
    });
    setConfigNote(keepBoard && w.board && w.board !== draft.board ? `The board stays a Proffieboard ${draft.board}: that was read from the saber itself, and the config says ${w.board}.` : null);
  };
  /** Only the config's board settings (issue #14), for wiring that already matches it: the blades, and so the wiring confirmation, stay. */
  const useConfigSettings = () => { if (config) change({ ...importedBoardDefines(config.wiring), wiringReference: referenceFrom(config.name, config.from, config.wiring) }); };
  const checkAgainstConfig = () => { if (config) change({ wiringReference: referenceFrom(config.name, config.from, config.wiring) }); };

  if (!saber && ws.loading) return <section className="panel fill"><LoadingSpace text="Reading your sabers…" /></section>;
  if (!saber || !info || !draft) {
    return <section className="panel"><div className="pb col" style={{ gap: 6 }}><h3>No saber to wire yet</h3><span className="dim small">Plug a saber in, or start one in the Armory, and describe its wiring here.</span> <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go('armory')}><span className="b"><span className="i">Go to the Armory</span></span></button></div></section>;
  }

  const confirmed = wiringConfirmed(draft);
  // Confirmed or installed before confirmations recorded what they checked: ask once, and say why.
  const confirmOnce = !confirmed && !draft.wiringConfirmation && (!!saber.model?.wiringConfirmedAt || !!saber.firmware);
  const detected = info.pixelBlades;
  // The board is known from the saber, chosen here, or not known at all (install-target-safety D2).
  const boardChosen = !!draft.boardFrom;
  const fromBootloader = draft.boardFrom === 'bootloader';
  const suggestion = boardSuggestion(saber);
  const corrected = boardCorrection(saber);
  const measureBlocked = !live ? 'Connect the saber to measure a blade.' : !saber.firmware?.bladeId ? 'Turn this on, then build and install once; readings only count from firmware that scans with the blade powered.' : null;

  return (
    <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
      <section className="panel fill" aria-label="Wiring">
        <div className="ph"><h2>Wiring of {saber.name}</h2>{saber.planned && <span className="hint">planned ahead; the hilt has not been connected yet</span>}</div>
        <div className="pb col scroll" style={{ gap: 14 }}>
          {!saber.planned && detected.length > 0 && !confirmed && (
            <div className="note"><Icon name="info" /><span>The saber reported {detected.length} pixel blade{detected.length === 1 ? '' : 's'} ({detected.join(', ')} px). That is a starting point, not the wiring: check each blade's data pin and power pins against what the installer wrote down.</span></div>
          )}
          {/* Top-aligned: the board's hint under its control must not lift it above the others. */}
          <div className="row wrap" style={{ gap: 14, alignItems: 'flex-start' }} data-tour="wiring-basics">
            <label className="field"><span className="label">Board</span>
              <div className="seg" role="radiogroup" aria-label="Proffieboard model" style={{ height: 32 }}>
                {(['V2', 'V3'] as BoardModel[]).map((b) => <button key={b} type="button" role="radio" aria-checked={boardChosen && draft.board === b} className={boardChosen && draft.board === b ? 'on' : ''} style={{ height: 30 }} disabled={fromBootloader && draft.board !== b} title={fromBootloader && draft.board !== b ? `The saber's bootloader showed a Proffieboard ${draft.board}` : undefined} onClick={() => { if (!fromBootloader) change({ board: b, boardFrom: 'owner' }); }}>Proffieboard {b}</button>)}
              </div>
              {fromBootloader && <span className="hint">Read from the saber at its last install.</span>}
            </label>
            <label className="field"><span className="label">Buttons</span>
              <div className="seg" role="radiogroup" aria-label="How many buttons" style={{ height: 32 }}>
                {([1, 2, 3] as const).map((n) => <button key={n} type="button" role="radio" aria-checked={draft.buttons === n} className={draft.buttons === n ? 'on' : ''} style={{ height: 30 }} onClick={() => change({ buttons: n })}>{n}</button>)}
              </div>
            </label>
            <label className="field grow" style={{ minWidth: 260 }}><span className="label">Prop file (how the buttons behave)</span>
              <span className="input sans" style={{ height: 32 }}><span className="ellip">{propLabel(draft)}</span><span className="caret"><Icon name="down" /></span>
                <Select value={draft.prop} aria-label="Prop file" onChange={(e) => chooseProp(e.target.value as Prop)}>{PROPS.map((p) => <option key={p.value} value={p.value}>{p.value === 'custom' && draft.customProp ? `Custom · ${draft.customProp.file}` : p.label}</option>)}</Select></span>
            </label>
          </div>
          {draft.prop === 'custom' && (
            <div className={`note${draft.customProp ? '' : ' amber'}`}><Icon name={draft.customProp ? 'info' : 'warn'} /><span className="col" style={{ gap: 8 }}>
              {draft.customProp
                ? <span>Building with the prop file <b style={{ fontWeight: 600 }}>{draft.customProp.file}</b> ({draft.customProp.propType ?? 'no PROP_TYPE'}). {draft.customProp.like
                    ? `It is a version of the ${PROPS.find((p) => p.value === draft.customProp?.like)?.label ?? draft.customProp.like} prop, so Hiltwright adds that prop's options and checks, as it would for the one that comes with ProffieOS.`
                    : 'Hiltwright does not know this prop, so it adds none of its options and checks nothing about it: options it needs go in the prop file itself. The compiler still checks it.'} Hiltwright keeps its own copy: change the file, then choose it again to build with the new version.</span>
                : <span>Choose the prop file (a .h file) to build with. It is put beside the props that come with ProffieOS, so it can include them.</span>}
              <span className="row"><button type="button" className="btn sm" onClick={() => void pickProp()}><span className="b"><span className="i">{draft.customProp ? 'Choose another file…' : 'Choose the prop file…'}</span></span></button></span>
            </span></div>
          )}
          {propNote && <div className="note red"><Icon name="x" /><span>{propNote}</span></div>}
          {config ? (() => {
            const w = config.wiring;
            const diffs = compareWiring(draft, w);
            const danger = diffs.some((d) => d.danger);
            const kept = draft.wiringReference?.file === config.name;
            return (
              <div className={`note${danger ? ' red' : diffs.length || w.unreadable.length ? ' amber' : ' green'}`}><Icon name={diffs.length || w.unreadable.length ? 'warn' : 'check'} /><span className="col" style={{ gap: 6 }}>
                <span><b style={{ fontWeight: 600 }}>{config.name}</b> {config.from === 'card' ? `on ${saber.name}’s card in the card reader (${config.where})` : 'from this computer'} describes {w.board ? `a Proffieboard ${w.board}, ` : ''}{w.buttons != null ? `${w.buttons} button${w.buttons === 1 ? '' : 's'}, ` : ''}{w.blades.length} blade{w.blades.length === 1 ? '' : 's'}:</span>
                <span className="col" style={{ gap: 2 }}>{w.blades.map((b, i) => <span key={b.id} className="small mono">Blade {i + 1}: {w.unreadable.some((u) => u.blade === i + 1) ? 'not readable here' : bladeWords(b)}</span>)}</span>
                {w.unreadable.length > 0 && <span className="small">Hiltwright cannot read {w.unreadable.map((u) => `blade ${u.blade}`).join(', ')} ({w.unreadable[0].text}). Check {w.unreadable.length === 1 ? 'its' : 'their'} pins against the config by hand.</span>}
                {w.rows > 1 && <span className="small">It has {w.rows} blade configurations (Blade ID); this is the first.</span>}
                {w.prop && !w.prop.stock && draft.prop !== 'custom' && <span className="small">It uses the prop {w.prop.include.split('/').pop()}. If you have that file, choose it above as a custom prop file.</span>}
                {/* Its own settings (issue #14): a few describe the hilt and are carried into builds, the rest are not. */}
                {w.defines.length > 0 && (() => {
                  const carried = carriedDefines(w.defines);
                  const left = w.defines.filter((d) => !carried.includes(d));
                  return <>
                    {carried.length > 0 && <span className="small">Its board settings, which builds take over with its wiring: <span className="mono">{carried.join(', ')}</span>.</span>}
                    {left.length > 0 && <span className="small">Its other settings are Hiltwright{'’'}s to choose, so builds leave them out: <span className="mono">{left.join(', ')}</span>.</span>}
                  </>;
                })()}
                {diffs.length === 0
                  ? <span>The wiring here matches it.{kept ? '' : ' Check builds against it, so Build & Flash warns if the wiring here ever changes from it.'}</span>
                  : <span className="col" style={{ gap: 2 }}><span>{danger ? 'The wiring here differs from it. A wrong pin can damage the board:' : 'The wiring here differs from it:'}</span>{diffs.map((d) => <span key={`${d.blade}-${d.what}`} className="small">{differenceText(d)}</span>)}</span>}
                <span className="row wrap" style={{ gap: 8 }}>
                  {diffs.length > 0 && w.unreadable.length === 0 && <button type="button" className="btn sm pri" onClick={useConfigWiring}><span className="b"><span className="i">Use its wiring</span></span></button>}
                  {diffs.length === 0 && w.unreadable.length === 0 && boardDefinesDiffer(draft, w) && <button type="button" className="btn sm pri" onClick={useConfigSettings}><span className="b"><span className="i">Use its board settings</span></span></button>}
                  {!kept && <button type="button" className="btn sm" onClick={checkAgainstConfig}><span className="b"><span className="i">Check builds against it</span></span></button>}
                  {kept && <span className="hint small">Builds are checked against it.</span>}
                  <button type="button" className="btn sm ghost" onClick={() => void pickConfig()}><span className="b"><span className="i">Another config file…</span></span></button>
                </span>
                {configNote && <span className="small">{configNote}</span>}
              </span></div>
            );
          })() : (
            <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
              {configLooking && <span className="row hint small" style={{ gap: 8 }}><Loader size="sm" />Looking for the installer{'’'}s config on the card…</span>}
              {draft.wiringReference && (() => { const d = compareWiring(draft, draft.wiringReference); return <span className={`small${d.some((x) => x.danger) ? '' : ' hint'}`}>{d.length ? `Differs from ${draft.wiringReference.file}: ${d.map(differenceText).join('; ')}.` : `Matches ${draft.wiringReference.file}, the config builds are checked against.`}</span>; })()}
              <button type="button" className="btn sm ghost" onClick={() => void pickConfig()}><span className="b"><span className="i">Compare with a config file…</span></span></button>
              {configNote && <span className="small">{configNote}</span>}
            </div>
          )}
          {(draft.boardDefines?.length ?? 0) > 0 && (
            <div className="note"><Icon name="info" /><span className="col" style={{ gap: 6 }}>
              <span>Builds include these settings from {draft.wiringReference?.file ?? 'the installer’s config'}, which describe how this hilt is built: <span className="mono">{draft.boardDefines!.join(', ')}</span>.</span>
              <span className="row"><button type="button" className="btn sm ghost" onClick={() => change({ boardDefines: undefined })}><span className="b"><span className="i">Leave them out</span></span></button></span>
            </span></div>
          )}
          {!boardChosen && (
            <div className="note amber"><Icon name="warn" /><span className="col" style={{ gap: 8 }}>
              <span>Which Proffieboard is this? Check the label on the board (V2.2 or V3.x) and choose it above. Nothing is built until you do.{suggestion ? ` Its config name suggests a ${suggestion}.` : ''}</span>
              {live && !saber.planned && <>
                <span>Or let Hiltwright check: the saber restarts into bootloader mode for a few seconds, its flash size is read, and it comes straight back. Nothing is written.</span>
                <span className="row"><button type="button" className="btn sm" disabled={checking || board.busy} onClick={() => void runCheck()}><span className="b"><span className="i">{checking ? <Loader size="sm" /> : <Icon name="usb" />}{checking ? 'Checking the board…' : 'Check the board'}</span></span></button></span>
              </>}
            </span></div>
          )}
          {checked && <div className={`note ${checked.tone}`}><Icon name={checked.tone === 'green' ? 'check' : checked.tone === 'red' ? 'x' : 'warn'} /><span>{checked.text}</span></div>}
          {corrected && fromBootloader && <div className="note amber"><Icon name="warn" /><span>The saber's bootloader showed a Proffieboard {corrected.actual} at its last install, so the board was corrected from {corrected.saved}. Check the pins and confirm the wiring again.</span></div>}
          {outside && <div className="note amber"><Icon name="warn" /><span>{outside}</span></div>}
          <HardwareEditor blades={draft.blades} board={draft.board} detected={detected} locked={board.busy} onChange={(b: ModelBlade[]) => change({ blades: b })}
            swap={FEATURES.bladeId ? {
              variants: draft.bladeId?.variants ?? [],
              onVariants: (v: BladeVariant[]) => change(v.length ? { bladeId: { variants: v } } : { bladeId: undefined }),
              measureBlocked,
              measure: async () => { const r = await board.send('scanid', { idleMs: 1500 }); return parseId([...r.lines, ...r.events]); },
            } : undefined} />
        </div>
      </section>

      <aside className="rail" aria-label="Confirm">
        <div className={`stepc ${confirmed ? 'done' : 'now'}`} data-tour="wiring-confirm">
          <div className="head"><span className="nbox">{confirmed ? <Icon name="check" /> : 1}</span><b>Check it</b><span className="what">{draft.blades.length} blade{draft.blades.length === 1 ? '' : 's'}</span></div>
          <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <button type="button" className={`tog ${confirmed ? 'on' : ''}`} role="switch" aria-checked={confirmed} aria-label="I checked the wiring" onClick={() => update((d) => withWiringConfirmation(d, !confirmed))}><i /></button>
            <span className="small dim">I checked every data pin and power pin against the installer's wiring.</span>
          </label>
          {confirmOnce && <span className="note amber" style={{ padding: '6px 8px' }}><Icon name="warn" /><span>Hiltwright now records which wiring you checked. Check it once more to go on.</span></span>}
          <span className="hint">A wrong pin can leave a blade dark or drive one that is not there. This stays checked until the board or a blade changes.</span>
        </div>
        <div className="stepc">
          <div className="head"><span className="nbox">2</span><b>Next</b><span className="what">fonts</span></div>
          <button type="button" className="btn pri full" disabled={!confirmed} onClick={() => go('fonts')}><span className="b"><span className="i"><Icon name="fonts" />Fonts</span></span></button>
          <span className="hint">{confirmed ? 'The saber’s presets: fonts, tracks and a style for each blade.' : 'Confirm the wiring first.'}</span>
        </div>
      </aside>
    </div>
  );
}
