// Preset banks: lists of presets built here, with no saber needed, and loaded onto one later. A bank names looks by
// blade role, so the same bank fits any saber; loading it puts its presets into that saber's build, and the next
// install replaces the saber's own presets with them (a snapshot of those is kept first).

import { useEffect, useMemo, useState } from 'react';
import { STARTER_LOOKS, argInfo, bankFromSaber, bankProblems, bankToModel, colorWordToHex, formatStyleArgs, hexToColorWord, newBank, newBankPreset, parseStyleArgs, registerLookSim, type BankPreset, type BladeRole, type LookDef, type PresetBank } from '@hiltwright/core';
import type { Board } from './board';
import { BladePreview, canSimulate } from './BladePreview';
import { Icon } from './Icon';
import { ROLES, ROLE_META } from './hardwareModel';
import { draftModel, infoFromRecord } from './saberModel';

const api = () => window.hiltwright;
const splitFont = (font: string) => { const parts = font.split(';'); return { folder: parts[0] ?? '', common: parts.slice(1).includes('common') }; };
const joinFont = (folder: string, common: boolean) => (common && folder !== 'common' ? `${folder};common` : folder);
/** Colour arguments first, the way an owner thinks about a look; then the rest. */
const argOrder = (args: number[]) => [...args].sort((a, b) => (argInfo(a).kind === 'color' ? 0 : 1) - (argInfo(b).kind === 'color' ? 0 : 1) || a - b);

export function Banks({ board, onLooks, onBuild }: { board: Board; onLooks: () => void; onBuild: () => void }) {
  const [banks, setBanks] = useState<PresetBank[]>([]);
  const [bankId, setBankId] = useState<string>(() => { try { return localStorage.getItem('hiltwright.banks.current') ?? ''; } catch { return ''; } });
  const [presetIx, setPresetIx] = useState(0);
  const [saved, setSaved] = useState<LookDef[]>([]);
  const [fonts, setFonts] = useState<string[]>([]);
  const [tracks, setTracks] = useState<string[]>([]);
  const [targetId, setTargetId] = useState<string>('');
  const [note, setNote] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void api().banks.list().then((bs) => { setBanks(bs); if (!bs.some((b) => b.id === bankId)) setBankId(bs[0]?.id ?? ''); });
    void api().looks.list().then((ls) => { for (const l of ls) registerLookSim(l); setSaved(ls); });
    // Fonts and tracks the owner has to hand: every remembered saber's, plus the font bank on this computer.
    void (async () => {
      const seen = new Set<string>(); const tr = new Set<string>();
      for (const s of board.library) { for (const f of s.fonts) if (f !== 'common') seen.add(f); for (const t of s.tracks) tr.add(t); }
      try { for (const f of await api().sd.bankFonts()) seen.add(f.name); } catch { /* no bank */ }
      setFonts([...seen].sort((a, b) => a.localeCompare(b))); setTracks([...tr].sort());
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem('hiltwright.banks.current', bankId); } catch { /* private mode */ } setPresetIx(0); setConfirmDelete(false); }, [bankId]);
  useEffect(() => { if (!targetId && board.library.length) setTargetId(board.saber?.id ?? board.library[0].id); }, [board.library, board.saber?.id, targetId]);

  const bank = banks.find((b) => b.id === bankId) ?? null;
  const preset = bank?.presets[presetIx] ?? null;
  const allLooks = useMemo(() => [...STARTER_LOOKS, ...saved], [saved]);
  const lookById = (id: string | undefined) => (id ? allLooks.find((l) => l.id === id) ?? null : null);
  const target = board.library.find((s) => s.id === targetId) ?? null;
  const targetBlades = target?.model?.blades ?? null;
  const problems = useMemo(() => (bank && targetBlades ? bankProblems(bank, targetBlades, allLooks) : []), [bank, targetBlades, allLooks]);

  const persist = async (next: PresetBank) => {
    next = { ...next, updated: new Date().toISOString() };
    setBanks((all) => all.map((b) => (b.id === next.id ? next : b)));
    await api().banks.save(next).catch((err) => setNote({ tone: 'red', text: `Could not save the bank: ${String(err)}` }));
  };
  const update = (fn: (b: PresetBank) => void) => { if (!bank) return; const next = structuredClone(bank); fn(next); void persist(next); };
  const updatePreset = (fn: (p: BankPreset) => void) => update((b) => { const p = b.presets[presetIx]; if (p) fn(p); });
  const addBank = async (b: PresetBank) => { const list = await api().banks.save(b); setBanks(list); setBankId(b.id); setNote(null); };
  const removeBank = async () => { if (!bank) return; const list = await api().banks.remove(bank.id); setBanks(list); setBankId(list[0]?.id ?? ''); setConfirmDelete(false); };

  const fromSaber = async (rec: Board['library'][number]) => {
    const blades = rec.model?.blades ?? [{ role: 'main' as BladeRole }];
    await addBank(bankFromSaber(`${rec.name}'s presets`, rec.presets, blades, rec.firmware));
    setNote({ tone: 'green', text: rec.firmware ? `Copied ${rec.presets.length} presets from ${rec.name}, with the looks its firmware knows.` : `Copied ${rec.presets.length} presets from ${rec.name}. Its firmware was not built here, so the looks in them are unknown; only names, fonts and tracks came over.` });
  };

  const loadOnto = async () => {
    if (!bank || !target) return;
    const model = target.model ?? draftModel(infoFromRecord(target), target);
    const next = bankToModel(bank, model, allLooks);
    await board.updateSaber({ model: next }, target.id);
    setNote({ tone: 'green', text: `"${bank.name}" is loaded onto ${target.name}: its ${bank.presets.length} preset${bank.presets.length === 1 ? '' : 's'} go on at the next install, replacing the saber's own (a snapshot is kept). Build & Install does the rest.` });
  };

  return (
    <div className="work" style={{ gridTemplateColumns: 'minmax(240px,290px) minmax(200px,240px) minmax(0,1fr)' }}>
      <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Banks">
        <div className="ph"><h2>Banks · {banks.length}</h2>
          <button type="button" className="chip" title="A new, empty bank" onClick={() => void addBank(newBank(`Bank ${banks.length + 1}`))}><Icon name="plus" />New</button>
        </div>
        <div className="list" role="listbox" aria-label="Preset banks" style={{ overflow: 'auto' }}>
          {banks.length === 0 && <div className="li hint" style={{ minHeight: 40 }}>No banks yet. Start one, or copy a saber's presets.</div>}
          {banks.map((b) => (
            <button key={b.id} type="button" role="option" aria-selected={b.id === bankId} className={`li click ${b.id === bankId ? 'on' : ''}`} onClick={() => setBankId(b.id)}>
              <span className="col grow" style={{ gap: 0 }}><span className="ellip" style={{ fontWeight: 600, fontSize: 13.5 }}>{b.name}</span><span className="hint ellip">{b.presets.length} preset{b.presets.length === 1 ? '' : 's'}</span></span>
            </button>
          ))}
        </div>
        {board.library.length > 0 && (
          <div className="col" style={{ gap: 6, padding: '10px 14px', borderTop: '1px solid var(--line)' }}>
            <span className="label">Copy a saber's presets</span>
            <div className="row wrap" style={{ gap: 6 }}>{board.library.map((s) => <button key={s.id} type="button" className="chip" title={`${s.presets.length} presets as last read from ${s.name}`} onClick={() => void fromSaber(s)}><Icon name="copy" />{s.name}</button>)}</div>
          </div>
        )}
        <div className="col" style={{ gap: 10, padding: '10px 14px', borderTop: '1px solid var(--line)' }} aria-label="Load onto a saber">
          <span className="label">Load onto a saber</span>
          {note && <div className={`note ${note.tone}`}><Icon name={note.tone === 'green' ? 'check' : 'info'} /><span>{note.text}</span></div>}
          {board.library.length === 0 ? (
            <span className="hint">No saber has been seen yet. Connect one once and it will be remembered here; banks made now can be loaded onto it then.</span>
          ) : (
            <>
              <label className="field"><span className="label">Saber</span>
                <span className="input sans"><span className="ellip">{target?.name ?? 'Pick a saber'}</span><span className="caret"><Icon name="down" /></span>
                  <select value={targetId} aria-label="Saber to load the bank onto" onChange={(e) => setTargetId(e.target.value)}>{board.library.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === board.saber?.id && board.status === 'connected' ? ' (connected)' : ''}</option>)}</select></span>
              </label>
              {target && !targetBlades && <span className="hint">{target.name} has no wiring set up yet, so its blades are not known; Build &amp; Install asks for that first. The bank's main-blade looks will apply once it does.</span>}
              {problems.length > 0 && <div className="note amber"><Icon name="warn" /><span>{problems.slice(0, 4).join(' ')}{problems.length > 4 ? ` And ${problems.length - 4} more.` : ''}</span></div>}
              {target?.model?.presetsFrom && <span className="hint">{target.name} currently has bank "{target.model.presetsFrom.name}" loaded, waiting for an install.</span>}
              <button type="button" className="btn sm pri" disabled={!bank || !target || bank.presets.length === 0} onClick={() => void loadOnto()}><span className="b"><span className="i"><Icon name="import" />Load onto {target?.name ?? 'the saber'}</span></span></button>
              <span className="hint">Loading sets the saber up with these presets. They go on with the next install from Build &amp; Install, replacing the saber's own presets; a snapshot of those is kept so they can be restored. {target?.model?.presetsFrom && <button type="button" className="holo" onClick={onBuild}>Go to Build &amp; Install</button>}</span>
            </>
          )}
        </div>
      </section>

      <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Bank editor">
        {!bank ? (
          <div className="pb col" style={{ gap: 6 }}><h3>Build presets before a saber is even plugged in</h3><span className="dim small">A bank is a list of presets: a name, a sound font, a track, and a look for each kind of blade. Make one here, then load it onto any saber; it goes on with the next install.</span></div>
        ) : (
          <>
            <div className="ph">
              <span className="input sans grow" style={{ height: 32, minWidth: 0 }}><input type="text" value={bank.name} aria-label="Bank name" onChange={(e) => update((b) => { b.name = e.target.value; })} /></span>
              <div className="row" style={{ gap: 4, flex: 'none' }}>
                <button type="button" className="chip" title="Duplicate this bank" aria-label="Duplicate this bank" onClick={() => void addBank({ ...structuredClone(bank), id: newBank().id, name: `${bank.name} copy` })}><Icon name="copy" /></button>
                {confirmDelete
                  ? <button type="button" className="chip err" title="Really delete this bank" onClick={() => void removeBank()}><Icon name="trash" />Sure?</button>
                  : <button type="button" className="chip" title="Delete this bank" aria-label="Delete this bank" onClick={() => setConfirmDelete(true)}><Icon name="trash" /></button>}
              </div>
            </div>
            <div className="pb col" style={{ gap: 6, minHeight: 0, overflow: 'hidden', flex: 1 }}>
                <div className="row between"><span className="label">Presets · {bank.presets.length}</span>
                  <div className="row" style={{ gap: 4 }}>
                    <button type="button" className="chip" disabled={presetIx <= 0} aria-label="Move preset up" onClick={() => { update((b) => { [b.presets[presetIx - 1], b.presets[presetIx]] = [b.presets[presetIx], b.presets[presetIx - 1]]; }); setPresetIx(presetIx - 1); }}><Icon name="up" /></button>
                    <button type="button" className="chip" disabled={presetIx >= bank.presets.length - 1} aria-label="Move preset down" onClick={() => { update((b) => { [b.presets[presetIx + 1], b.presets[presetIx]] = [b.presets[presetIx], b.presets[presetIx + 1]]; }); setPresetIx(presetIx + 1); }}><Icon name="down" /></button>
                  </div>
                </div>
                <div className="list" role="listbox" aria-label="Presets in the bank" style={{ overflow: 'auto', flex: 1, minHeight: 120 }}>
                  {bank.presets.map((p, i) => (
                    <button key={i} type="button" role="option" aria-selected={i === presetIx} className={`li click ${i === presetIx ? 'on' : ''}`} onClick={() => setPresetIx(i)}>
                      <span className="n">{i + 1}</span>
                      <span className="col grow" style={{ gap: 0 }}><span className="ellip" style={{ fontWeight: 600, fontSize: 13 }}>{p.name || 'Unnamed'}</span><span className="hint ellip">{splitFont(p.font).folder || 'no font'}</span></span>
                    </button>
                  ))}
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  <button type="button" className="btn sm" onClick={() => { update((b) => { b.presets.push(newBankPreset(`Preset ${b.presets.length + 1}`)); }); setPresetIx(bank.presets.length); }}><span className="b"><span className="i"><Icon name="plus" />Add</span></span></button>
                  <button type="button" className="chip" disabled={!preset} onClick={() => { update((b) => { b.presets.splice(presetIx + 1, 0, { ...structuredClone(b.presets[presetIx]), name: `${b.presets[presetIx].name} copy` }); }); setPresetIx(presetIx + 1); }}><Icon name="copy" /></button>
                  <button type="button" className="chip" disabled={!preset} aria-label="Remove this preset" onClick={() => { update((b) => { b.presets.splice(presetIx, 1); }); setPresetIx(Math.max(0, presetIx - 1)); }}><Icon name="trash" /></button>
                </div>
            </div>
          </>
        )}
      </section>

      <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Preset editor">
        {bank && (
          <>
            <div className="ph"><h2 className="ellip" style={{ minWidth: 0 }}>{preset ? preset.name || 'Unnamed' : 'No preset'}</h2>{preset && <span className="hint">preset {presetIx + 1} of {bank.presets.length}</span>}</div>
            <div className="pb col scroll" style={{ gap: 14, minHeight: 0 }}>
                {!preset ? <span className="hint">Add a preset to start.</span> : (() => {
                  const cf = splitFont(preset.font);
                  return (
                    <>
                      <div className="grid2">
                        <label className="field"><span className="label">Name</span>
                          <span className="input sans"><input type="text" value={preset.name} aria-label="Preset name" onChange={(e) => updatePreset((p) => { p.name = e.target.value; })} /></span>
                        </label>
                        <label className="field"><span className="label">Sound font folder</span>
                          <span className="input sans"><input type="text" list="hw-bank-fonts" value={cf.folder} aria-label="Sound font folder" placeholder="As named on the card" onChange={(e) => updatePreset((p) => { p.font = joinFont(e.target.value, cf.common); })} /></span>
                          <datalist id="hw-bank-fonts">{fonts.map((f) => <option key={f} value={f} />)}</datalist>
                        </label>
                        <label className="field"><span className="label">Track</span>
                          <span className="input"><input type="text" list="hw-bank-tracks" value={preset.track} aria-label="Track" placeholder="tracks/name.wav, or none" onChange={(e) => updatePreset((p) => { p.track = e.target.value; })} /></span>
                          <datalist id="hw-bank-tracks">{tracks.map((t) => <option key={t} value={t} />)}</datalist>
                        </label>
                        <label className="row" style={{ gap: 10, alignSelf: 'end', minHeight: 38, fontSize: 13, color: 'var(--dim)' }}>
                          <button type="button" className={`tog ${cf.common ? 'on' : ''}`} role="switch" aria-checked={cf.common} aria-label="Also use the common folder" onClick={() => updatePreset((p) => { p.font = joinFont(cf.folder, !cf.common); })}><i /></button>
                          Also use <span className="mono">common</span> sounds
                        </label>
                      </div>

                      <div className="col" style={{ gap: 8 }}>
                        <div className="row between"><span className="label">Looks, by kind of blade</span><button type="button" className="holo small" onClick={onLooks}>Browse the looks</button></div>
                        {ROLES.map((role) => {
                          const id = preset.looks[role]; const look = lookById(id);
                          const args = parseStyleArgs(preset.lookArgs?.[role]);
                          const choices = allLooks.filter((l) => l.roles.includes(role));
                          return (
                            <div key={role} className="bcard col" style={{ gap: 8, padding: '10px 12px' }}>
                              <div className="row" style={{ gap: 10 }}>
                                <span className="small" style={{ width: 120, flex: 'none', fontWeight: 600 }}>{ROLE_META[role].label}</span>
                                <span className="input sans grow" style={{ height: 30 }}><span className="ellip">{look ? look.name : id ? `${id} (missing)` : 'Saber’s default'}</span><span className="caret"><Icon name="down" /></span>
                                  <select value={id ?? ''} aria-label={`Look for the ${ROLE_META[role].label.toLowerCase()}`} onChange={(e) => updatePreset((p) => { if (e.target.value) p.looks[role] = e.target.value; else delete p.looks[role]; if (p.lookArgs) delete p.lookArgs[role]; })}>
                                    <option value="">Saber's default</option>
                                    <optgroup label="Hiltwright">{choices.filter((l) => l.source === 'starter').map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
                                    {choices.some((l) => l.source !== 'starter') && <optgroup label="Your looks">{choices.filter((l) => l.source !== 'starter').map((l) => <option key={l.id} value={l.id}>{l.name}{l.by && l.by !== 'you' ? ` (${l.by})` : ''}</option>)}</optgroup>}
                                  </select></span>
                                {look && canSimulate(look.id) && <div style={{ width: ROLE_META[role].kind === 'pixel' ? 150 : 24, flex: 'none' }}><BladePreview lookId={look.id} args={args} leds={ROLE_META[role].kind === 'pixel' ? 40 : 1} dot={ROLE_META[role].kind !== 'pixel'} size="sm" /></div>}
                              </div>
                              {look && look.args.length > 0 && (
                                <div className="row wrap" style={{ gap: 6 }}>
                                  {argOrder(look.args).filter((n) => argInfo(n).kind === 'color').map((n) => {
                                    const word = args.get(n); const shown = (word && colorWordToHex(word)) ?? look.defaults?.[n] ?? (n === 1 ? look.preview : '#ffffff');
                                    return (
                                      <label key={n} className={`swatch ${word ? '' : 'linked'}`} style={{ width: 'auto', height: 28, padding: '0 8px', gap: 6 }} title={`${argInfo(n).name}${word ? '' : ' (the look’s own)'}`}>
                                        <span className="sq" style={{ width: 12, height: 12, background: shown, boxShadow: `0 0 8px ${shown}` }} />
                                        <span className="small nowrap">{argInfo(n).name.replace(/ colour$/i, '')}</span>
                                        <input type="color" value={shown} aria-label={`${argInfo(n).name} for the ${ROLE_META[role].label.toLowerCase()}`} onChange={(e) => updatePreset((p) => { const m = parseStyleArgs(p.lookArgs?.[role]); m.set(n, hexToColorWord(e.target.value)); p.lookArgs = { ...(p.lookArgs ?? {}), [role]: formatStyleArgs(m) }; })} />
                                      </label>
                                    );
                                  })}
                                  {args.size > 0 && <button type="button" className="holo small" onClick={() => updatePreset((p) => { if (p.lookArgs) delete p.lookArgs[role]; })}>Look's own colours</button>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
            </div>
          </>
        )}
      </section>

    </div>
  );
}
