// Install › Fonts: choose the sound fonts this saber will carry, from the font library, with new fonts added to the
// library right here, and the voice pack its Fett263 controls speak in. Nothing here needs the saber or its card: the
// choices are kept with the saber's setup, and go onto the card on Install › Card. Every font a preset names counts as
// chosen (saberFonts.ts). The card is read when it can be, to say whether its voice pack works (voiceChoice.ts).

import { useEffect, useMemo, useState } from 'react';
import { propFamily } from '@hiltwright/core';
import type { ImportResult, LibraryFont, PackInfo } from '../../shared/api';
import { fontLibraryList, packList, useSharedList, voicePackList, type VoicePackList } from './sharedLists';
import { contributorsChanged } from './credits';
import { importSummary } from '../../shared/fontBulk';
import { chosenFonts, presetsUsing, withFontChosen, withFontDropped } from './saberFonts';
import { mb } from './FontLibrary';
import { Icon } from './Icon';
import { Loader, LoadingSpace } from './Loader';
import { Select } from './Select';
import type { Board } from './board';
import { useCardCheck } from './useCardCheck';
import { voiceNeedText, voiceOnCard, voiceWork } from './voiceChoice';
import type { Workspace } from './workspace';

const api = () => window.hiltwright;
const cleanErr = (err: unknown) => String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '');
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const NO_FONTS: LibraryFont[] = [];
const NO_PACKS: PackInfo[] = [];
const NO_VOICES: VoicePackList = { packs: [], support: null, source: null, credit: null };

export function FontChoice({ ws, board, go }: { ws: Workspace; board: Board; go: (page: 'armory' | 'presets' | 'library' | 'build' | 'card') => void }) {
  const { saber, model, info } = ws;
  // The voice pack, for the Fett263 controls: chosen here, put on the card on Install › Card (voiceChoice.ts).
  const card = useCardCheck(board, saber);
  // The voice packs and the font library are shared app-wide (sharedLists.ts): the card trip and the Card page use them too.
  const voiceShared = useSharedList(voicePackList, NO_VOICES);
  const voicePacks = voiceShared.read ? voiceShared.value.packs : null;
  const { value: library, read, failed } = useSharedList(fontLibraryList, NO_FONTS);
  const packs = useSharedList(packList, NO_PACKS).value;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(null);
  useEffect(() => { if (failed) setNote({ tone: 'red', text: `The font library could not be read: ${failed}` }); }, [failed]);
  const [filter, setFilter] = useState('');
  /** After adding fonts: every page's library list, and the credits (new fonts can bring their makers). */
  const refresh = async () => { await fontLibraryList.refresh(); contributorsChanged(); };
  useEffect(() => api().fontLibrary.onProgress(setProgress), []);

  const chosen = useMemo(() => chosenFonts(model), [model]);
  if (!saber && ws.loading) return <section className="panel fill"><LoadingSpace text="Reading your sabers…" /></section>;
  if (!saber || !model) {
    return <section className="panel"><div className="pb col" style={{ gap: 6 }}><h3>No saber to choose fonts for yet</h3><span className="dim small">Plug a saber in, or start one in the Armory.</span><button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go('armory')}><span className="b"><span className="i">Go to the Armory</span></span></button></div></section>;
  }

  const save = async (next: typeof model | null, text: string) => {
    if (!next) return;
    try { await ws.saveModel(next); setNote({ tone: 'green', text }); } catch (err) { setNote({ tone: 'red', text: `Not saved: ${cleanErr(err)}` }); }
  };
  const add = (folder: string) => void save(withFontChosen(model, folder), `${folder} is chosen for ${saber.name}.`);
  const drop = (folder: string) => void save(withFontDropped(model, folder), `${folder} is no longer chosen for ${saber.name}.`);
  // New fonts go into the library, and are chosen for this saber at once.
  const importFonts = async (what: () => Promise<ImportResult | null>) => {
    setBusy(true); setNote(null); setProgress(null);
    try {
      const r = await what();
      if (!r) return;
      await refresh();
      let next = model;
      for (const f of r.added) next = withFontChosen(next, f);
      if (r.added.length) await ws.saveModel(next);
      const summary = importSummary(r);
      setNote({ ...summary, text: r.added.length ? `${summary.text} ${r.added.length === 1 ? 'The font is' : 'The fonts are'} chosen for ${saber.name}.` : summary.text });
    } catch (err) { setNote({ tone: 'red', text: cleanErr(err) }); }
    finally { setBusy(false); setProgress(null); }
  };

  const libFont = (folder: string) => library.find((f) => same(f.folder, folder)) ?? null;
  // The free fonts that ship with Hiltwright: copied on the Card step like library fonts.
  const packFont = (folder: string) => packs.find((p) => p.kind === 'font' && p.allow.copyToCard && same(p.name, folder)) ?? null;
  // What the saber's card has: read just now (in a reader, or by the saber), else as last read; nothing for a saber never read.
  const cardFonts = card.cardCheck?.source === 'reader' || (card.cardCheck?.source === 'saber' && card.cardCheck.fonts.length) ? card.cardCheck.fonts : info && info.fonts.length ? info.fonts : null;
  const onCard = (folder: string) => (cardFonts ? cardFonts.some((x) => same(x, folder)) : null);
  const toCopy = chosen.filter((f) => onCard(f) !== true && (libFont(f) || packFont(f)));
  const copyBytes = toCopy.reduce((n, f) => n + (libFont(f)?.bytes ?? 0), 0);
  const missing = read ? chosen.filter((f) => !libFont(f) && !packFont(f) && onCard(f) !== true) : [];
  // The voice pack: the one chosen, else the one that comes with Hiltwright; and what the card has, when it is known.
  const fett263 = propFamily(model) === 'fett263';
  const bundled = voicePacks?.find((p) => p.have === 'bundled') ?? null;
  const voiceSel = voicePacks?.find((p) => p.id === (model.voicePack ?? bundled?.id)) ?? null;
  const voiceGroups = [...new Set((voicePacks ?? []).map((p) => p.group))];
  const cardVoice = card.cardCheck?.source === 'out' ? null : card.voice;
  const voiceNeed = fett263 ? voiceWork({ chosen: model.voicePack, fallback: bundled?.id ?? null, voice: cardVoice, onCard: voiceOnCard(saber.id) }) : null;
  const chooseVoice = (id: string) => {
    const p = voicePacks?.find((x) => x.id === id);
    if (p) void save({ ...model, voicePack: id }, `${p.name} is the voice for ${saber.name}.`);
  };
  const offered = library.filter((f) => !chosen.some((c) => same(c, f.folder)) && (!filter.trim() || `${f.folder} ${f.meta.name} ${f.meta.maker}`.toLowerCase().includes(filter.trim().toLowerCase())));

  return (
    <>
      <div className="note"><Icon name="info" /><span>Choose the sound fonts {saber.name} will carry. They are copied onto its card on the Card step, with the card in a card reader. Presets, the next step, pick their fonts from this list.</span></div>
      {missing.length > 0 && <div className="note amber"><Icon name="warn" /><span>{missing.length === 1 ? `${missing[0]} is` : `${missing.join(', ')} are`} not in your font library{cardFonts ? ' or on the card' : ''}. {cardFonts ? `${missing.length === 1 ? 'It' : 'They'} cannot be copied: add ${missing.length === 1 ? 'it' : 'them'} to the library below.` : `The card's fonts have not been read yet. Unless the card has ${missing.length === 1 ? 'it' : 'them'} already, add ${missing.length === 1 ? 'it' : 'them'} to the library below so ${missing.length === 1 ? 'it' : 'they'} can be copied.`}</span></div>}
      {note && <div className={`note ${note.tone}`} role="status"><Icon name={note.tone === 'green' ? 'check' : 'info'} /><span>{note.text}</span></div>}

      <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(320px,420px)' }}>
        <div className="col" style={{ gap: 16, minHeight: 0 }}>
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }} aria-label={`Fonts for ${saber.name}`} data-tour="fontchoice-chosen">
          <div className="ph"><h2>Fonts for {saber.name} · {chosen.length}</h2></div>
          <div className="list" style={{ overflow: 'auto' }}>
            {chosen.length === 0 && <div className="li hint" style={{ minHeight: 48 }}>No fonts chosen yet. Add them from your font library.</div>}
            {chosen.map((f, i) => {
              const lf = libFont(f);
              const pf = lf ? null : packFont(f);
              const users = presetsUsing(model, f);
              const card = onCard(f);
              return (
                <div key={f} className="li" style={{ gap: 12, minHeight: 56 }}>
                  <span className="n" aria-hidden="true">{i + 1}</span>
                  <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
                    <b className="ellip" style={{ fontWeight: 600 }}>{f}</b>
                    <span className="hint ellip">{lf ? `${lf.meta.name || f}${lf.meta.maker ? ` by ${lf.meta.maker}` : ''} · ${mb(lf.bytes)}` : pf ? `${pf.creator ? `by ${pf.creator} · ` : ''}comes with Hiltwright` : read ? 'Not in the font library' : 'Looking in the font library…'}{users.length ? ` · used by preset${users.length === 1 ? '' : 's'} ${users.map((u) => u + 1).join(', ')}` : ' · no preset uses it yet'}</span>
                  </span>
                  {card === true ? <span className="chip ok"><Icon name="check" />On the card</span> : lf || pf ? <span className="chip"><Icon name="sd" />Copied on the Card step</span> : read ? <span className="chip warn"><Icon name="warn" />{card === false ? 'Missing' : 'Not in the library'}</span> : null}
                  <button type="button" className="chip" disabled={busy || users.length > 0} title={users.length ? `Preset ${users.map((u) => u + 1).join(', ')} uses it: change ${users.length === 1 ? 'its' : 'their'} font first` : `Do not carry ${f}`} aria-label={`Remove ${f}`} onClick={() => drop(f)}><Icon name="x" /></button>
                </div>
              );
            })}
          </div>
          <div className="row between" style={{ marginTop: 'auto', padding: '12px 18px', borderTop: '1px solid var(--line)', gap: 12 }}>
            <span className="hint">{[
              toCopy.length ? `${toCopy.length} font${toCopy.length === 1 ? '' : 's'}, ${mb(copyBytes)}, to copy onto the card on the Card step.` : '',
              missing.length ? `${missing.length} not in the font library.` : '',
              !toCopy.length && !missing.length && chosen.length && cardFonts ? 'Nothing to copy: the card has every chosen font, as last read.' : '',
            ].filter(Boolean).join(' ')}</span>
            <button type="button" className="btn sm pri" disabled={!chosen.length} onClick={() => go('presets')}><span className="b"><span className="i"><Icon name="chev" />Continue with Presets</span></span></button>
          </div>
        </section>

        {fett263 && (
          <section className="panel" style={{ flex: 'none' }} aria-label="Voice pack">
            <div className="ph"><h2>Voice pack</h2>
              {card.cardChecking ? <span className="chip"><Loader size="sm" />Checking the card</span>
                : !cardVoice ? <span className="chip">Card not read</span>
                : voiceNeed && voiceNeed.why !== 'change' ? <span className="chip warn"><Icon name="warn" />{voiceNeed.why === 'mixed' ? 'Mixed with an old pack' : voiceNeed.why === 'old' ? `Version ${cardVoice.version ?? 1} on the card` : 'Missing'}</span>
                : <span className="chip ok"><Icon name="check" />Version {cardVoice.version} on the card</span>}
            </div>
            <div className="col" style={{ gap: 8, padding: '12px 18px 14px' }}>
              <span className="small">The voice the Fett263 controls speak their menus in. The voice pack goes in the card{'’'}s common folder on the Card step, with the card in a card reader.</span>
              {voicePacks === null && <span className="row" style={{ gap: 10 }}><Loader size="sm" /><span className="hint">Finding the voice packs…</span></span>}
              {voiceSel && <>
                <span className="input sans" style={{ maxWidth: 360 }}><span className="ellip">{voiceSel.name}</span><span className="caret"><Icon name="down" /></span><Select aria-label="Voice pack" value={voiceSel.id} onChange={(e) => chooseVoice(e.target.value)}>
                  {voiceGroups.map((g) => <optgroup key={g} label={g}>{voicePacks!.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)}
                </Select></span>
                <span className="hint small">By {voiceSel.author}{voiceSel.year ? `, ${voiceSel.year}` : ''} · {voiceSel.have === 'bundled' ? 'comes with Hiltwright' : voiceSel.have === 'downloaded' ? 'downloaded before' : `downloads ${mb(voiceSel.assetBytes)} at install`}{model.voicePack ? '' : ' · put on only when the card has no working pack'}</span>
              </>}
              {voiceNeed && <div className={`note${voiceNeed.why === 'change' ? '' : ' amber'}`} style={{ padding: '8px 10px' }}><Icon name={voiceNeed.why === 'change' ? 'sd' : 'warn'} /><span className="col grow" style={{ gap: 8, minWidth: 0 }}><span>{voiceNeedText(voiceNeed.why, voiceSel?.name ?? voiceNeed.pack, cardVoice)} The Card step does this, with the card in a card reader.{voiceNeed.why === 'mixed' || voiceNeed.why === 'missing' || voiceNeed.why === 'old' ? ' Until then the saber speaks an error on every preset change.' : ''}</span>
                <span className="row"><button type="button" className="btn sm" onClick={() => go('card')}><span className="b"><span className="i"><Icon name="sd" />{voiceNeed.why === 'change' ? 'Put it on the card' : 'Fix it on the card'}</span></span></button></span></span></div>}
              {!cardVoice && !card.cardChecking && <span className="hint small">{card.voiceWhy ? `The card's voice pack could not be checked: ${card.voiceWhy}.` : `What is on the card is checked once ${saber.name} is plugged in, or its card is in a card reader.`} <button type="button" className="holo" onClick={card.again}>Look again</button></span>}
            </div>
          </section>
        )}
        </div>

        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label="Font library" data-tour="fontchoice-library">
          <div className="ph"><h2>Font library</h2>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn sm" disabled={busy} title="A font package as you downloaded it" onClick={() => void importFonts(() => api().fontLibrary.addZip())}><span className="b"><span className="i"><Icon name="import" />Add .zip</span></span></button>
              <button type="button" className="btn sm" disabled={busy} title="A font folder, or a folder holding several fonts" onClick={() => void importFonts(() => api().fontLibrary.addFolder())}><span className="b"><span className="i"><Icon name="plus" />Add folder</span></span></button>
            </div>
          </div>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}><span className="input sans" style={{ height: 32 }}><input type="text" value={filter} placeholder="Find a font" aria-label="Find a font in the library" onChange={(e) => setFilter(e.target.value)} /></span></div>
          {busy && <div className="hint" style={{ padding: '10px 14px' }}>{progress ?? 'Adding fonts to the library…'}</div>}
          <div className="list" style={{ overflow: 'auto' }}>
            {!read && <LoadingSpace text="Reading your font library…" compact />}
            {read && library.length === 0 && <div className="li hint" style={{ minHeight: 48 }}>Your font library is empty. Add a font package (.zip) or a font folder.</div>}
            {read && library.length > 0 && offered.length === 0 && <div className="li hint" style={{ minHeight: 48 }}>{filter.trim() ? 'No other font matches.' : 'Every font in the library is chosen.'}</div>}
            {offered.map((f) => (
              <div key={f.folder} className="li" style={{ gap: 10, minHeight: 52 }}>
                <span className="col grow" style={{ gap: 2, minWidth: 0 }}><b className="ellip" style={{ fontWeight: 600 }}>{f.meta.name || f.folder}</b><span className="hint ellip">{f.folder}{f.meta.maker ? ` · ${f.meta.maker}` : ''} · {mb(f.bytes)}</span></span>
                <button type="button" className="btn sm" disabled={busy} onClick={() => add(f.folder)}><span className="b"><span className="i"><Icon name="plus" />Add</span></span></button>
              </div>
            ))}
          </div>
          <div className="hint" style={{ marginTop: 'auto', padding: '12px 18px', borderTop: '1px solid var(--line)' }}>Listen to fonts and edit their details in the <button type="button" className="holo" onClick={() => go('library')}>Font library</button>.</div>
        </section>
      </div>
    </>
  );
}
