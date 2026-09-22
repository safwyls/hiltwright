// Presets: the saber's list of presets, each a name, a sound font, a track, and a look for every blade with its
// colours. One editor, two ways of applying a change:
//   live    the saber is plugged in and its presets are the ones shown: the change is written to it now and shown as
//           saved once the saber reads it back. A look the firmware does not carry yet is queued for the next build.
//   staged  nothing is plugged in, or the list here has already diverged from the saber's: changes wait in the saber's
//           model and replace its presets at the next install (a snapshot of the saber's own is kept first).
// Preset sets save a whole list to reuse on another saber, or load one here.

import { useEffect, useMemo, useState } from 'react';
import { STARTER_LOOKS, argInfo, bankFromSaber, bankToModel, colorWordToHex, formatBuiltin, formatStyleArgs, hexToColorWord, lookSlots, parseStyleArgs, registerLookSim, type LookDef, type PresetBank, type SaberConfigModel } from '@hiltwright/core';
import { BladePreview, canSimulate } from './BladePreview';
import { SaberControls } from './Controls';
import type { Board } from './board';
import { Icon } from './Icon';
import { ROLE_META } from './hardwareModel';
import type { Workspace } from './workspace';

const api = () => window.hiltwright;
type ModelPreset = SaberConfigModel['presets'][number];
const splitFont = (font: string) => { const parts = font.split(';'); return { folder: parts[0] ?? '', common: parts.slice(1).includes('common') }; };
const joinFont = (folder: string, common: boolean) => (common && folder !== 'common' ? `${folder};common` : folder);
const when = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const clean = (name: string) => name.replace(/\s*\n\s*/g, ' ');

export function Presets({ ws, board, go }: { ws: Workspace; board: Board; go: (page: 'looks' | 'build' | 'wiring' | 'armory' | 'fonts') => void }) {
  const { saber, info, model, live } = ws;
  const staged = !!model?.presetsFrom;
  // Live: the saber's own list is what is shown, so each change goes to it at once. Staged edits win until installed.
  const isLive = live && !staged && !!info;
  const [ix, setIx] = useState(0);
  const [saved, setSaved] = useState<LookDef[]>([]);
  const [sets, setSets] = useState<PresetBank[]>([]);
  const [fonts, setFonts] = useState<string[]>([]);
  const [tracks, setTracks] = useState<string[]>([]);
  const [side, setSide] = useState<'sets' | 'try' | 'history'>('sets');
  const [note, setNote] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState<Record<string, string>>({});

  useEffect(() => {
    void api().looks.list().then((ls) => { for (const l of ls) registerLookSim(l); setSaved(ls); });
    void api().banks.list().then(setSets);
    void (async () => {
      const f = new Set<string>(); const t = new Set<string>();
      for (const s of board.library) { for (const x of s.fonts) if (x !== 'common') f.add(x); for (const x of s.tracks) t.add(x); }
      if (info) { for (const x of info.fonts) if (x !== 'common') f.add(x); for (const x of info.tracks) t.add(x); }
      try { for (const x of await api().sd.bankFonts()) f.add(x.name); } catch { /* no bank */ }
      setFonts([...f].sort((a, b) => a.localeCompare(b))); setTracks([...t].sort());
    })();
  }, [saber?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Live: the row the saber has selected is the one being edited.
  useEffect(() => { if (isLive && info?.currentPreset != null) setIx(info.currentPreset); }, [isLive, info?.currentPreset]);
  useEffect(() => { setConfirmDelete(false); }, [ix, saber?.id]);

  const allLooks = useMemo(() => [...STARTER_LOOKS, ...saved], [saved]);
  const lookById = (id: string | null | undefined) => (id ? allLooks.find((l) => l.id === id) ?? null : null);
  const compiled = new Set((saber?.firmware?.looks ?? []).map((l) => l.id));

  if (!saber || !model || !info) {
    return <section className="panel"><div className="pb col" style={{ gap: 6 }}><h3>No saber to set presets for yet</h3><span className="dim small">Plug a saber in, or start one in the Armory.</span><button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go('armory')}><span className="b"><span className="i">Go to the Armory</span></span></button></div></section>;
  }

  const presets = model.presets;
  const cur = presets[Math.min(ix, presets.length - 1)] ?? null;
  const curIx = Math.min(ix, Math.max(0, presets.length - 1));
  const liveRec = isLive ? info.presets[curIx] ?? null : null;

  // ---- writing a change: to the saber when live, otherwise into the staged model ----
  const stage = async (fn: (m: SaberConfigModel) => void, why = 'edits made here') => {
    const next = structuredClone(model);
    fn(next);
    if (!next.presetsFrom) next.presetsFrom = { name: why, at: new Date().toISOString() };
    await ws.saveModel(next);
  };
  const editPreset = async (patch: Partial<ModelPreset>, label: string) => {
    if (isLive) { await board.editPreset(patch, label); return; }
    await stage((m) => { Object.assign(m.presets[curIx], patch); });
  };
  const setLook = async (blade: number, look: LookDef | null, args: string | null) => {
    if (isLive && look && compiled.has(look.id) && saber.firmware) {
      const slots = lookSlots(saber.firmware, look.id);
      const slot = slots.find((s) => s.blade === blade) ?? slots[0];
      if (slot) { await board.setPresetStyles(curIx, { [blade]: formatBuiltin({ preset: slot.preset, blade: slot.blade, args }) }, `${look.name} → ${clean(cur?.name ?? '')}`); return; }
    }
    // Not on the saber yet (or nothing plugged in): the model carries it to the next build, with its colours.
    const next = structuredClone(model);
    const p = next.presets[curIx];
    const row = next.blades.map((_b, k) => p.looks?.[k] ?? null); row[blade - 1] = look?.id ?? null;
    const argRow = next.blades.map((_b, k) => p.lookArgs?.[k] ?? null); argRow[blade - 1] = args;
    p.looks = row.some(Boolean) ? row : undefined; p.lookArgs = argRow.some(Boolean) ? argRow : undefined;
    if (look && look.source !== 'starter' && !(next.looks ?? []).some((l) => l.id === look.id)) next.looks = [...(next.looks ?? []), look];
    if (!isLive && !next.presetsFrom) next.presetsFrom = { name: 'edits made here', at: new Date().toISOString() };
    await ws.saveModel(next);
    if (isLive) setNote({ tone: 'amber', text: `"${look?.name ?? 'That look'}" is not on ${saber.name} yet: it goes on with the next Build & Install.` });
  };
  const add = async () => {
    if (isLive) { await board.duplicatePreset(); return; }
    await stage((m) => { const src = m.presets[curIx]; m.presets.splice(curIx + 1, 0, src ? { ...structuredClone(src), name: `${src.name} copy` } : { name: `Preset ${m.presets.length + 1}`, font: 'common', track: '' }); });
    setIx(curIx + 1);
  };
  const remove = async () => {
    setConfirmDelete(false);
    if (isLive) { await board.deletePreset(); return; }
    await stage((m) => { m.presets.splice(curIx, 1); });
    setIx(Math.max(0, curIx - 1));
  };
  const move = async (to: number) => {
    if (to < 0 || to >= presets.length) return;
    if (isLive) { await board.movePreset(to); return; }
    await stage((m) => { const [p] = m.presets.splice(curIx, 1); m.presets.splice(to, 0, p); });
    setIx(to);
  };
  const select = (i: number) => { if (isLive) void board.choosePreset(i); else setIx(i); };

  // ---- preset sets ----
  const saveAsSet = async () => {
    const bank = bankFromSaber(`${saber.name} presets`, isLive ? info.presets : presets.map((p) => ({ name: p.name, font: p.font, track: p.track, styles: model.blades.map((_b, k) => (p.looks?.[k] ? `builtin 0 ${k + 1}${p.lookArgs?.[k] ? ` ${p.lookArgs[k]}` : ''}` : '')), variation: 0 })), model.blades, isLive ? saber.firmware : { hash: '', os: '', at: '', looks: [], presets: presets.map((p) => ({ name: p.name, looks: model.blades.map((_b, k) => p.looks?.[k] ?? '') })) });
    setSets(await api().banks.save(bank));
    setNote({ tone: 'green', text: `Saved "${bank.name}": ${bank.presets.length} presets, to load onto any saber.` });
  };
  const loadSet = async (bank: PresetBank) => {
    const next = bankToModel(bank, model, allLooks);
    await ws.saveModel(next);
    setIx(0);
    setNote({ tone: 'green', text: `"${bank.name}" is loaded: ${bank.presets.length} preset${bank.presets.length === 1 ? '' : 's'}, staged for the next install${live ? `, replacing what is on ${saber.name}` : ''}.` });
  };
  const dropStaged = async () => { const { presetsFrom: _drop, ...rest } = model; await ws.saveModel(rest); setNote(null); };

  const fontFolders = [...new Set([...fonts, ...(cur ? [splitFont(cur.font).folder] : [])])].filter(Boolean);
  const trackChoices = [...new Set(['', ...tracks, ...(cur ? [cur.track] : [])])];
  const cf = cur ? splitFont(cur.font) : { folder: '', common: true };
  const busy = board.busy;

  return (
    <>
      {staged && (
        <div className="note amber"><Icon name="info" /><span>{live ? `These ${presets.length} presets are staged (${model.presetsFrom!.name}, ${when(model.presetsFrom!.at)}) and will replace the ${info.presets.length} on ${saber.name} at the next install; a snapshot of the saber's own is kept first. ` : `These presets are staged (${model.presetsFrom!.name}, ${when(model.presetsFrom!.at)}) and go on with the next install. `}{live && <button type="button" className="holo" onClick={() => void dropStaged()}>Discard them and show the saber's own</button>}</span></div>
      )}
      {!live && !staged && !saber.planned && <div className="note"><Icon name="info" /><span>{saber.name} is not plugged in. These are its presets as last read; changes are staged and go on with the next install.</span></div>}
      {note && <div className={`note ${note.tone}`}><Icon name={note.tone === 'green' ? 'check' : 'info'} /><span>{note.text}</span></div>}

      <div className="work" style={{ gridTemplateColumns: 'minmax(220px,280px) minmax(0,1fr) minmax(260px,320px)' }}>
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Preset list">
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
          <div className="ph"><h2 className="ellip" style={{ minWidth: 0 }}>{cur ? clean(cur.name) || 'Unnamed' : 'No preset'}</h2>
            <div className="row" style={{ gap: 8 }}>{isLive ? <SaveChip save={board.save} /> : <span className="chip warn"><span className="dot" />Staged for install</span>}</div>
          </div>
          {cur && (
            <div className="pb col" style={{ gap: 16, overflowY: 'auto', overflowX: 'hidden' }}>
              <div className="grid2">
                <CommitField label="Name" value={cur.name} disabled={busy} onCommit={(name) => void editPreset({ name }, 'Rename')} />
                <CommitField label="Sound font" value={cf.folder} list="hw-fonts" choices={fontFolders} placeholder="Folder name on the card" disabled={busy} onCommit={(folder) => void editPreset({ font: joinFont(folder, cf.common) }, `Font → ${folder}`)} />
                <CommitField label="Track" value={cur.track} list="hw-tracks" choices={trackChoices.filter(Boolean)} placeholder="tracks/name.wav, or none" mono disabled={busy} onCommit={(track) => void editPreset({ track }, `Track → ${track || 'none'}`)} />
                <label className="row" style={{ gap: 10, alignSelf: 'end', minHeight: 38, fontSize: 13, color: 'var(--dim)' }}>
                  <button type="button" className={`tog ${cf.common ? 'on' : ''}`} role="switch" aria-checked={cf.common} disabled={busy} aria-label="Also use the common folder" onClick={() => void editPreset({ font: joinFont(cf.folder, !cf.common) }, cf.common ? 'Drop common fallback' : 'Add common fallback')}><i /></button>
                  Also use <span className="mono">common</span> sounds
                </label>
              </div>

              <div className="col" style={{ gap: 8 }}>
                <div className="row between"><span className="label">Looks, one per blade</span><button type="button" className="holo small" onClick={() => go('looks')}>Browse and try looks</button></div>
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
                      <div className="row" style={{ gap: 10 }}>
                        <span className="small" style={{ width: 130, flex: 'none', fontWeight: 600 }}>{k + 1}. {label}</span>
                        <span className="input sans grow" style={{ height: 30 }}><span className="ellip">{shownLook ? shownLook.name : liveStyle ? `${liveStyle} (not built here)` : 'Saber’s default'}</span><span className="caret"><Icon name="down" /></span>
                          <select value={shownLook?.id ?? ''} disabled={busy} aria-label={`Look for blade ${k + 1}, ${label}`} onChange={(e) => void setLook(k + 1, lookById(e.target.value), null)}>
                            <option value="">Saber's default</option>
                            <optgroup label="Hiltwright">{choices.filter((l) => l.source === 'starter').map((l) => <option key={l.id} value={l.id}>{l.name}{compiled.has(l.id) ? '' : live ? ' (needs a build)' : ''}</option>)}</optgroup>
                            {choices.some((l) => l.source !== 'starter') && <optgroup label="Your looks">{choices.filter((l) => l.source !== 'starter').map((l) => <option key={l.id} value={l.id}>{l.name}{l.by && l.by !== 'you' ? ` (${l.by})` : ''}{compiled.has(l.id) ? '' : live ? ' (needs a build)' : ''}</option>)}</optgroup>}
                          </select></span>
                        {shownLook && !onSaber && <span className="chip warn" title="Goes on with the next Build & Install"><Icon name="clock" />Queued</span>}
                        {shownLook && canSimulate(shownLook.id) && <div style={{ width: ROLE_META[b.role].kind === 'pixel' ? 150 : 24, flex: 'none' }}><BladePreview lookId={shownLook.id} args={args} leds={ROLE_META[b.role].kind === 'pixel' ? Math.min(60, Math.max(4, Math.round(b.pixels / 3))) : 1} dot={ROLE_META[b.role].kind !== 'pixel'} size="sm" /></div>}
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
                                <input type="color" value={shown} disabled={busy} aria-label={`${argInfo(n).name} for blade ${k + 1}`} onChange={(e) => setPending((p) => ({ ...p, [key]: e.target.value }))} onBlur={(e) => { const m = new Map(args); m.set(n, hexToColorWord(e.target.value)); setPending((p) => { const { [key]: _x, ...rest } = p; return rest; }); void setLook(k + 1, shownLook, formatStyleArgs(m) || null); }} />
                              </label>
                            );
                          })}
                          {args.size > 0 && <button type="button" className="holo small" disabled={busy} onClick={() => void setLook(k + 1, shownLook, null)}>Look's own colours</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
                <span className="hint">{isLive ? 'Looks already on the saber switch at once; a look it does not carry yet is queued for the next Build & Install, and its colours are written right after.' : 'Colours are written to the saber after the install.'}</span>
              </div>
            </div>
          )}
        </section>

        <section className="panel fill" aria-label="Sets, try it and history">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={side === 'sets'} className={side === 'sets' ? 'on' : ''} onClick={() => setSide('sets')}><Icon name="copy" />Sets<span className="count">{sets.length}</span></button>
            {isLive && <button type="button" role="tab" aria-selected={side === 'try'} className={side === 'try' ? 'on' : ''} onClick={() => setSide('try')}><Icon name="bolt" />Try it</button>}
            {live && <button type="button" role="tab" aria-selected={side === 'history'} className={side === 'history' ? 'on' : ''} onClick={() => setSide('history')}><Icon name="clock" />History<span className="count">{board.snapshots.length}</span></button>}
          </div>
          {side === 'sets' && (
            <>
              <div className="list" style={{ overflow: 'auto' }}>
                {sets.length === 0 && <div className="li hint" style={{ minHeight: 44 }}>No sets yet. Save this list as one to reuse it on another saber, or to keep a copy.</div>}
                {sets.map((s) => (
                  <div key={s.id} className="li" style={{ minHeight: 48, gap: 8 }}>
                    <span className="col grow" style={{ gap: 0 }}><span className="ellip small" style={{ fontWeight: 600 }}>{s.name}</span><span className="hint mono" style={{ fontSize: 11 }}>{s.presets.length} presets · {when(s.updated)}</span></span>
                    <button type="button" className="holo" style={{ fontSize: 11.5, fontWeight: 600 }} disabled={busy} onClick={() => void loadSet(s)}>Load</button>
                    <button type="button" className="chip" aria-label={`Delete set ${s.name}`} onClick={() => void api().banks.remove(s.id).then(setSets)}><Icon name="trash" /></button>
                  </div>
                ))}
              </div>
              <div className="col" style={{ marginTop: 'auto', padding: '12px 18px', borderTop: '1px solid var(--line)', gap: 8 }}>
                <button type="button" className="btn sm" disabled={!presets.length} onClick={() => void saveAsSet()}><span className="b"><span className="i"><Icon name="plus" />Save this list as a set</span></span></button>
                <span className="hint">A set keeps names, fonts, tracks and the look for each kind of blade, so it fits any saber. Loading one replaces this saber's presets at the next install.</span>
              </div>
            </>
          )}
          {side === 'try' && isLive && <SaberControls board={board} bare />}
          {side === 'history' && live && (
            <>
              <div className="list" style={{ overflow: 'auto' }}>
                {board.snapshots.length === 0 && <div className="li hint" style={{ minHeight: 40 }}>No snapshots yet.</div>}
                {board.snapshots.map((s, i) => (
                  <div key={s.file} className="li" style={{ minHeight: 44, gap: 8 }}>
                    <span className="col grow" style={{ gap: 0 }}><span className="ellip small">{s.label}</span><span className="hint mono" style={{ fontSize: 11 }}>{when(s.at)} · {s.presets} presets</span></span>
                    <button type="button" className="holo" style={{ fontSize: 11.5, fontWeight: 600 }} disabled={busy} onClick={() => void board.restoreSnapshot(s)}>{i === 0 ? 'Undo' : 'Restore'}</button>
                  </div>
                ))}
              </div>
              <div className="hint" style={{ marginTop: 'auto', padding: '12px 18px', borderTop: '1px solid var(--line)' }}>A snapshot of the saber's presets is kept before every change written to it. Restore sends the earlier values back and waits for the saber to confirm them.</div>
            </>
          )}
        </section>
      </div>
    </>
  );
}

/** Committed when the field is left or Enter is pressed, not on every keystroke: a live edit is a write to the saber. */
function CommitField({ label, value, list, choices, placeholder, mono, disabled, onCommit }: { label: string; value: string; list?: string; choices?: string[]; placeholder?: string; mono?: boolean; disabled: boolean; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const commit = () => { if (v !== value) onCommit(v); };
  return (
    <form className="field" onSubmit={(e) => { e.preventDefault(); commit(); }}>
      <span className="label">{label}</span>
      <span className={`input${mono ? '' : ' sans'}`}><input type="text" list={list} value={v} disabled={disabled} aria-label={label} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} /></span>
      {list && choices && <datalist id={list}>{choices.map((c) => <option key={c} value={c} />)}</datalist>}
    </form>
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
