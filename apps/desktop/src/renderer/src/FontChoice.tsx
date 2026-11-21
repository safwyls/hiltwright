// Install › Fonts: choose the sound fonts this saber will carry, from the font library, with new fonts added to the
// library right here. Nothing here needs the saber or its card: the list is kept with the saber's setup, and the fonts
// go onto the card at Build & Install. Every font a preset names counts as chosen (saberFonts.ts).

import { useEffect, useMemo, useState } from 'react';
import type { ImportResult, LibraryFont } from '../../shared/api';
import { importSummary } from '../../shared/fontBulk';
import { chosenFonts, presetsUsing, withFontChosen, withFontDropped } from './saberFonts';
import { mb } from './FontLibrary';
import { Icon } from './Icon';
import { LoadingSpace } from './Loader';
import type { Workspace } from './workspace';

const api = () => window.hiltwright;
const cleanErr = (err: unknown) => String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '');
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function FontChoice({ ws, go }: { ws: Workspace; go: (page: 'armory' | 'presets' | 'library' | 'build') => void }) {
  const { saber, model, info } = ws;
  const [library, setLibrary] = useState<LibraryFont[]>([]);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(null);
  const [filter, setFilter] = useState('');
  const refresh = async () => { try { setLibrary(await api().fontLibrary.list()); } catch (err) { setNote({ tone: 'red', text: `The font library could not be read: ${cleanErr(err)}` }); } finally { setRead(true); } };
  useEffect(() => { void refresh(); }, []);
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
      setNote({ ...summary, text: r.added.length ? `${summary.text} ${r.added.length === 1 ? 'It is' : 'They are'} chosen for ${saber.name}.` : summary.text });
    } catch (err) { setNote({ tone: 'red', text: cleanErr(err) }); }
    finally { setBusy(false); setProgress(null); }
  };

  const libFont = (folder: string) => library.find((f) => same(f.folder, folder)) ?? null;
  // What the saber's card had when it was last read; nothing known for a saber never read.
  const cardFonts = info && info.fonts.length ? info.fonts : null;
  const onCard = (folder: string) => (cardFonts ? cardFonts.some((x) => same(x, folder)) : null);
  const toCopy = chosen.filter((f) => onCard(f) !== true && libFont(f));
  const copyBytes = toCopy.reduce((n, f) => n + (libFont(f)?.bytes ?? 0), 0);
  const missing = read ? chosen.filter((f) => !libFont(f) && onCard(f) !== true) : [];
  const offered = library.filter((f) => !chosen.some((c) => same(c, f.folder)) && (!filter.trim() || `${f.folder} ${f.meta.name} ${f.meta.maker}`.toLowerCase().includes(filter.trim().toLowerCase())));

  return (
    <>
      <div className="note"><Icon name="info" /><span>Choose the sound fonts {saber.name} will carry. They are copied onto its card at Build &amp; Install, with the card in a card reader. Presets, the next step, pick their fonts from this list.</span></div>
      {missing.length > 0 && <div className="note amber"><Icon name="warn" /><span>{missing.length === 1 ? `${missing[0]} is` : `${missing.join(', ')} are`} not in your font library{cardFonts ? ' or on the card' : ''}. {cardFonts ? `${missing.length === 1 ? 'It' : 'They'} cannot be copied: add ${missing.length === 1 ? 'it' : 'them'} to the library below.` : `The card's fonts have not been read yet. Unless the card has ${missing.length === 1 ? 'it' : 'them'} already, add ${missing.length === 1 ? 'it' : 'them'} to the library below so ${missing.length === 1 ? 'it' : 'they'} can be copied.`}</span></div>}
      {note && <div className={`note ${note.tone}`} role="status"><Icon name={note.tone === 'green' ? 'check' : 'info'} /><span>{note.text}</span></div>}

      <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(320px,420px)' }}>
        <section className="panel" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} aria-label={`Fonts for ${saber.name}`} data-tour="fontchoice-chosen">
          <div className="ph"><h2>Fonts for {saber.name} · {chosen.length}</h2></div>
          <div className="list" style={{ overflow: 'auto' }}>
            {chosen.length === 0 && <div className="li hint" style={{ minHeight: 48 }}>No fonts chosen yet. Add them from your font library.</div>}
            {chosen.map((f, i) => {
              const lf = libFont(f);
              const users = presetsUsing(model, f);
              const card = onCard(f);
              return (
                <div key={f} className="li" style={{ gap: 12, minHeight: 56 }}>
                  <span className="n" aria-hidden="true">{i + 1}</span>
                  <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
                    <b className="ellip" style={{ fontWeight: 600 }}>{f}</b>
                    <span className="hint ellip">{lf ? `${lf.meta.name || f}${lf.meta.maker ? ` by ${lf.meta.maker}` : ''} · ${mb(lf.bytes)}` : read ? 'Not in the font library' : 'Looking in the font library…'}{users.length ? ` · used by preset${users.length === 1 ? '' : 's'} ${users.map((u) => u + 1).join(', ')}` : ' · no preset uses it yet'}</span>
                  </span>
                  {card === true ? <span className="chip ok"><Icon name="check" />On the card</span> : lf ? <span className="chip"><Icon name="sd" />Copied at install</span> : read ? <span className="chip warn"><Icon name="warn" />{card === false ? 'Missing' : 'Not in the library'}</span> : null}
                  <button type="button" className="chip" disabled={busy || users.length > 0} title={users.length ? `Preset ${users.map((u) => u + 1).join(', ')} uses it: change ${users.length === 1 ? 'its' : 'their'} font first` : `Do not carry ${f}`} aria-label={`Remove ${f}`} onClick={() => drop(f)}><Icon name="x" /></button>
                </div>
              );
            })}
          </div>
          <div className="row between" style={{ marginTop: 'auto', padding: '12px 18px', borderTop: '1px solid var(--line)', gap: 12 }}>
            <span className="hint">{[
              toCopy.length ? `${toCopy.length} font${toCopy.length === 1 ? '' : 's'}, ${mb(copyBytes)}, to copy onto the card at install.` : '',
              missing.length ? `${missing.length} not in the font library.` : '',
              !toCopy.length && !missing.length && chosen.length && cardFonts ? 'Nothing to copy: the card has every chosen font, as last read.' : '',
            ].filter(Boolean).join(' ')}</span>
            <button type="button" className="btn sm pri" disabled={!chosen.length} onClick={() => go('presets')}><span className="b"><span className="i"><Icon name="chev" />Continue with Presets</span></span></button>
          </div>
        </section>

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
