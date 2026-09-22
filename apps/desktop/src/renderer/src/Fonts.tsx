// Fonts & SD: a ProffieOS card in a card reader. Lists fonts with the checks that catch the classic failures,
// lists tracks, and copies a font folder from this computer onto the card after checking it.

import { useCallback, useEffect, useState } from 'react';
import type { VoicePackStatus } from '@hiltwright/core';
import type { CardInfo, FontEntry } from '../../shared/api';
import type { Board } from './board';
import { XenoImport } from './XenoImport';
import { Icon } from './Icon';

const api = () => window.hiltwright;

function mb(bytes: number | null): string {
  if (bytes == null) return '—';
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`;
}

export function Fonts({ board }: { board: Board }) {
  const [cards, setCards] = useState<CardInfo[]>([]);
  const [card, setCard] = useState<CardInfo | null>(null);
  const [fonts, setFonts] = useState<FontEntry[]>([]);
  const [tracks, setTracks] = useState<{ name: string; size: number }[]>([]);
  const [picked, setPicked] = useState<FontEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: '' | 'green' | 'amber' | 'red'; text: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoicePackStatus | null>(null);
  // The saber's own card over USB. Hiltwright firmware carries a mass-storage interface, but ProffieOS only hands
  // the card over when asked ('sd 1'): the blade goes off, idle sounds stop, the card is released and Windows
  // mounts it as a drive. 'sd 0' takes it back. While the host has it, the saber cannot play from it.
  const live = board.status === 'connected' && !!board.info;
  const [usb, setUsb] = useState<'idle' | 'mounting' | 'mounted' | 'ejecting' | 'unsupported'>('idle');
  const [usbNote, setUsbNote] = useState<string | null>(null);
  const [usbRoot, setUsbRoot] = useState<string | null>(null);
  useEffect(() => { if (!live) { setUsb('idle'); setUsbRoot(null); } }, [live]);
  const mountUsb = async () => {
    setUsb('mounting'); setUsbNote(null);
    const before = new Set((await api().sd.locate()).map((c) => c.root));
    let r;
    try { r = await board.send('sd 1', { idleMs: 700 }); } catch (err) { setUsb('idle'); setUsbNote(String(err)); return; }
    if (r.lines.some((l) => /^Whut\? :/.test(l))) { setUsb('unsupported'); setUsbNote('This firmware cannot share its card over USB. Hiltwright firmware can: build and install it, or put the card in a reader.'); return; }
    if (!r.lines.some((l) => /SD Access ON/.test(l))) { setUsb('idle'); setUsbNote(`The saber answered "${r.lines.join(' ').trim() || 'nothing'}" instead of turning card access on.`); return; }
    // The card is released once audio goes quiet, then Windows takes a moment to mount it.
    for (let i = 0; i < 40; i++) {
      await new Promise((res) => setTimeout(res, 500));
      const now = (await api().sd.locate()).find((c) => !before.has(c.root));
      if (now) { setUsbRoot(now.root); setUsb('mounted'); await scan(); return; }
    }
    setUsb('idle'); setUsbNote('The saber said yes but no drive appeared in 20 seconds. If the blade was on or a sound was playing, wait for it to go quiet and try again.');
    try { await board.send('sd 0', { idleMs: 500 }); } catch { /* best effort */ }
  };
  const ejectUsb = async () => {
    setUsb('ejecting'); setUsbNote(null);
    if (usbRoot) {
      const e = await api().sd.eject(usbRoot);
      if (!e.ok) { setUsb('mounted'); setUsbNote(e.detail); return; }
    }
    try { await board.send('sd 0', { idleMs: 700 }); } catch { /* the saber may have dropped serial briefly */ }
    setUsbRoot(null); setUsb('idle');
    await scan();
  };

  const scan = useCallback(async () => {
    setBusy(true);
    try {
      const found = await api().sd.locate();
      setCards(found);
      const best = found.find((c) => c.proffie) ?? null;
      setCard(best);
      if (best) {
        const [f, t, vp] = await Promise.all([api().sd.listFonts(best.root), api().sd.listTracks(best.root), api().sd.voicePack(best.root)]);
        setVoice(vp);
        setFonts(f);
        setTracks(t);
        console.log(`[sd] card ${best.root} fonts=${f.length} tracks=${t.length} issues=${f.reduce((a, x) => a + x.report.issues.length, 0)}`);
      } else {
        setFonts([]);
        setTracks([]);
        setVoice(null);
        console.log(`[sd] no ProffieOS card among ${found.length} removable volume(s)`);
      }
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void scan(); }, [scan]);
  const usbBusy = usb === 'mounting' || usb === 'ejecting';

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
      <section className="panel" aria-label="SD card status">
        <div className="row" style={{ padding: '12px 18px', gap: 16 }}>
          <span style={{ color: card ? 'var(--holo)' : 'var(--mute)', display: 'flex', width: 26, height: 26 }}><Icon name="sd" /></span>
          <div className="col grow" style={{ gap: 2 }}>
            <h3>{card ? `ProffieOS card at ${card.root}${card.label ? ` (${card.label})` : ''}` : busy ? 'Looking for a card…' : 'No ProffieOS card found'}</h3>
            <div className="dim small">
              {card ? `${mb(card.freeBytes)} free of ${mb(card.totalBytes)} · ${fonts.length} fonts · ${tracks.length} tracks · presets.ini ${card.hasPresetsIni ? 'present' : 'not present'} · voice pack ${voice?.ini || voice?.menuSounds ? `version ${voice.version ?? 1}${voice.menuSounds ? '' : ', menu sounds missing'}` : 'not found'}`
                : cards.length ? `${cards.length} removable volume${cards.length > 1 ? 's' : ''} seen, none with fonts on it. Put the saber's card in a reader.`
                : live ? 'Put the card in a reader, or let the saber share it over USB: it stops playing while it does.' : 'Put the saber\'s SD card in a card reader, or plug the saber in and share its card over USB.'}
            </div>
          </div>
          {usb === 'mounted'
            ? <button type="button" className="btn sm warn" disabled={busy || usbBusy} onClick={() => void ejectUsb()}><span className="b"><span className="i"><Icon name="eject" />Give the card back</span></span></button>
            : <button type="button" className="btn sm pri" disabled={!live || busy || usbBusy || usb === 'unsupported'} title={live ? 'The saber releases its card and it appears as a drive. The blade goes off and sound stops until you give it back.' : 'Plug the saber in first'} onClick={() => void mountUsb()}><span className="b"><span className="i"><Icon name="usb" />{usb === 'mounting' ? 'Waiting for the drive…' : usb === 'ejecting' ? 'Giving it back…' : 'Share the saber\u2019s card'}</span></span></button>}
          <button type="button" className="btn sm" disabled={busy} onClick={() => void scan()}><span className="b"><span className="i"><Icon name="undo" />Look again</span></span></button>
        </div>
        {usb === 'mounted' && <div style={{ padding: '0 18px 12px' }}><div className="note amber"><Icon name="warn" /><span>The saber has handed its card to this computer{usbRoot ? ` (${usbRoot})` : ''}. It cannot play until you give the card back; do that here rather than unplugging, so nothing is left half written. Copying is slow this way, a big font can take minutes.</span></div></div>}
        {usbNote && <div style={{ padding: '0 18px 12px' }}><div className="note"><Icon name="info" /><span>{usbNote}</span></div></div>}
        {message && <div style={{ padding: '0 18px 16px' }}><div className={`note ${message.tone}`}><Icon name={message.tone === 'green' ? 'check' : message.tone === 'red' ? 'x' : 'warn'} /><span>{message.text}</span></div></div>}
      </section>

      <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 400px' }}>
        <section className="panel fill" aria-label="Fonts on the card">
          <div className="scroll">
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
          </div>
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

          <XenoImport card={card} board={board} onChanged={() => void scan()} />

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
