// Fonts & SD: a ProffieOS card in a card reader. Lists fonts with the checks that catch the classic failures,
// lists tracks, and copies a font folder from this computer onto the card after checking it.

import { useCallback, useEffect, useState } from 'react';
import type { CardInfo, FontEntry } from '../../shared/api';
import { Icon } from './Icon';

const api = () => window.hiltwright;

function mb(bytes: number | null): string {
  if (bytes == null) return '—';
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

export function Fonts() {
  const [cards, setCards] = useState<CardInfo[]>([]);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [fonts, setFonts] = useState<FontEntry[]>([]);
  const [tracks, setTracks] = useState<{ name: string; size: number }[]>([]);
  const [picked, setPicked] = useState<FontEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: '' | 'green' | 'amber' | 'red'; text: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setBusy(true);
    try {
      const found = await api().sd.locate();
      setCards(found);
      const best = found.find((c) => c.proffie) ?? null;
      setCard(best);
      if (best) {
        const [f, t] = await Promise.all([api().sd.listFonts(best.root), api().sd.listTracks(best.root)]);
        setFonts(f);
        setTracks(t);
        console.log(`[sd] card ${best.root} fonts=${f.length} tracks=${t.length} issues=${f.reduce((a, x) => a + x.report.issues.length, 0)}`);
      } else {
        setFonts([]);
        setTracks([]);
        console.log(`[sd] no ProffieOS card among ${found.length} removable volume(s)`);
      }
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void scan(); }, [scan]);

  const pick = async () => {
    const entry = await api().sd.pickFont();
    if (entry) { setPicked(entry); setMessage(null); }
  };

  const copy = async (replace: boolean) => {
    if (!picked || !card) return;
    setBusy(true);
    try {
      const entry = await api().sd.copyFont(picked.path, card.root, replace);
      setMessage({ tone: 'green', text: `${entry.name} copied to the card (${entry.report.files} files).` });
      setPicked(null);
      await scan();
    } catch (err) {
      const text = String(err).replace(/^Error: /, '');
      setMessage({ tone: /already on the card/.test(text) ? 'amber' : 'red', text });
    } finally { setBusy(false); }
  };

  const issues = fonts.flatMap((f) => f.report.issues.map((i) => ({ font: f.name, ...i })));
  const sel = fonts.find((f) => f.name === selected) ?? null;

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Fonts &amp; SD card</div><h1>Sound fonts</h1></div>
        <div className="row">
          <button type="button" className="btn" disabled={busy} onClick={() => void scan()}><span className="b"><span className="i"><Icon name="undo" />Look again</span></span></button>
          <button type="button" className="btn pri" disabled={busy || !card} onClick={() => void pick()}><span className="b"><span className="i"><Icon name="plus" />Add font folder</span></span></button>
        </div>
      </div>

      <section className="panel" aria-label="SD card status">
        <div className="row" style={{ padding: '14px 18px', gap: 18 }}>
          <span style={{ color: card ? 'var(--holo)' : 'var(--mute)', display: 'flex', width: 26, height: 26 }}><Icon name="sd" /></span>
          <div className="col grow" style={{ gap: 2 }}>
            <h3>{card ? `ProffieOS card at ${card.root}${card.label ? ` (${card.label})` : ''}` : busy ? 'Looking for a card…' : 'No ProffieOS card found'}</h3>
            <div className="dim small">
              {card ? `${mb(card.freeBytes)} free of ${mb(card.totalBytes)} · ${fonts.length} fonts · ${tracks.length} tracks · presets.ini ${card.hasPresetsIni ? 'present' : 'not present'}`
                : cards.length ? `${cards.length} removable volume${cards.length > 1 ? 's' : ''} seen, none with fonts on it. Put the saber's card in a reader.`
                : 'Put the saber\'s SD card in a card reader. This saber\'s firmware does not expose the card over USB.'}
            </div>
          </div>
          {card && <span className="chip live"><span className="dot" />Card reader</span>}
        </div>
        {message && <div style={{ padding: '0 18px 16px' }}><div className={`note ${message.tone}`}><Icon name={message.tone === 'green' ? 'check' : message.tone === 'red' ? 'x' : 'warn'} /><span>{message.text}</span></div></div>}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 20, flex: 1, minHeight: 0 }}>
        <section className="panel" aria-label="Fonts on the card" style={{ minHeight: 0, overflow: 'auto' }}>
          <table>
            <thead><tr><th>Font</th><th>Type</th><th>Files</th><th>Size</th><th>Status</th></tr></thead>
            <tbody>
              {fonts.map((f) => (
                <tr key={f.name} className={f.name === selected ? 'on' : ''} onClick={() => setSelected(f.name)} style={{ cursor: 'pointer' }}>
                  <td><span className="nowrap" style={{ fontWeight: 600 }}>{f.name}</span></td>
                  <td className="dim">{f.report.type}</td>
                  <td className="mono dim small">{f.report.files}</td>
                  <td className="mono dim small">{mb(f.report.bytes)}</td>
                  <td>{f.report.issues.length ? <span className={`chip ${f.report.issues.some((i) => i.kind === 'mixed' || i.kind === 'missing-hum') ? 'err' : 'warn'}`}><Icon name="warn" />{f.report.issues.length} issue{f.report.issues.length > 1 ? 's' : ''}</span> : <span className="chip ok"><Icon name="check" />Ready</span>}</td>
                </tr>
              ))}
              {fonts.length === 0 && <tr><td colSpan={5} className="hint">{card ? 'No font folders on this card.' : 'Nothing to show without a card.'}</td></tr>}
            </tbody>
          </table>
          {issues.length > 0 && (
            <div className="col" style={{ padding: '16px 18px', gap: 10, borderTop: '1px solid var(--line)' }}>
              {issues.slice(0, 8).map((i, k) => (
                <div key={k} className={`note ${i.kind === 'mixed' || i.kind === 'missing-hum' ? 'red' : 'amber'}`}><Icon name={i.kind === 'mixed' ? 'x' : 'warn'} /><span><b style={{ fontWeight: 600 }}>{i.font}:</b> {i.text}</span></div>
              ))}
              {issues.length > 8 && <span className="hint">{issues.length - 8} more…</span>}
            </div>
          )}
        </section>

        <aside className="col" style={{ gap: 20, minHeight: 0 }}>
          <section className="panel" aria-label="Add a font">
            <div className="ph"><h2>Add a font</h2>{picked && (picked.report.issues.length ? <span className="chip warn"><Icon name="warn" />{picked.report.issues.length} issue{picked.report.issues.length > 1 ? 's' : ''}</span> : <span className="chip ok"><Icon name="check" />Looks good</span>)}</div>
            <div className="pb col" style={{ gap: 12 }}>
              {picked ? (
                <>
                  <div className="col" style={{ gap: 2 }}><b style={{ fontWeight: 600 }}>{picked.name}</b><span className="hint mono" style={{ fontSize: 11 }}>{picked.path}</span></div>
                  <div className="row wrap" style={{ gap: 8 }}><span className="chip">{picked.report.type}</span><span className="chip">{picked.report.files} files</span><span className="chip">{mb(picked.report.bytes)}</span></div>
                  {picked.report.issues.map((i, k) => <div key={k} className={`note ${i.kind === 'mixed' || i.kind === 'missing-hum' ? 'red' : 'amber'}`}><Icon name="warn" /><span>{i.text}</span></div>)}
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn sm pri" disabled={busy || !card} onClick={() => void copy(false)}><span className="b"><span className="i"><Icon name="check" />Copy to card</span></span></button>
                    {fonts.some((f) => f.name.toLowerCase() === picked.name.toLowerCase()) && <button type="button" className="btn sm warn" disabled={busy} onClick={() => void copy(true)}><span className="b"><span className="i">Replace on card</span></span></button>}
                    <button type="button" className="btn sm ghost" onClick={() => setPicked(null)}><span className="b"><span className="i">Cancel</span></span></button>
                  </div>
                </>
              ) : (
                <>
                  <p className="hint">Choose a font folder on this computer. Hiltwright checks the files before anything is copied. Your originals are never changed.</p>
                  <button type="button" className="btn" disabled={busy || !card} onClick={() => void pick()}><span className="b"><span className="i"><Icon name="import" />Choose folder</span></span></button>
                </>
              )}
            </div>
          </section>

          <section className="panel" aria-label="Font detail" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="ph"><h2>{sel ? sel.name : 'Tracks'}</h2><span className="hint">{sel ? `${sel.report.type} · ${sel.report.files} files` : `${tracks.length} on the card`}</span></div>
            <div className="list" style={{ overflow: 'auto' }}>
              {sel
                ? Object.entries(sel.report.effects).sort().map(([effect, v]) => (
                    <div key={effect} className="li" style={{ minHeight: 34 }}><span className="grow small">{effect}</span><span className="mono mute" style={{ fontSize: 11.5 }}>{v.poly ? `${v.poly} poly` : ''}{v.poly && v.mono ? ' · ' : ''}{v.mono ? `${v.mono} mono` : ''}</span></div>
                  ))
                : tracks.map((t) => <div key={t.name} className="li" style={{ minHeight: 34 }}><span className="grow mono small">{t.name}</span><span className="mono mute" style={{ fontSize: 11.5 }}>{mb(t.size)}</span></div>)}
              {!sel && tracks.length === 0 && <div className="li hint" style={{ minHeight: 34 }}>No tracks folder.</div>}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
