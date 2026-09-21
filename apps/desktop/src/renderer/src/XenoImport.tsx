// Bring fonts over from a Xenopixel card: pick the old card (or a copy), choose fonts, convert them onto the
// ProffieOS card, and optionally add a preset per font on the connected saber with the old blade colour.

import { useState } from 'react';
import { formatBuiltin, lookAtSlot, parseBuiltin } from '@hiltwright/core';
import type { CardInfo, XenoFontInfo } from '../../shared/api';
import type { Board } from './board';
import { Icon } from './Icon';

const api = () => window.hiltwright;
const mb = (b: number) => `${(b / 1048576).toFixed(1)} MB`;

export function XenoImport({ card, board, onChanged }: { card: CardInfo | null; board: Board; onChanged: () => void }) {
  const [source, setSource] = useState<{ root: string; fonts: XenoFontInfo[] } | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Record<string, 'copied' | 'exists' | 'failed'>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'green' | 'amber' | 'red'; text: string } | null>(null);
  const connected = board.status === 'connected' && !!board.info;

  const pick = async () => {
    setNote(null);
    const res = await api().importer.pickXeno();
    if (!res) return;
    setSource(res); setDone({});
    setChosen(new Set(res.fonts.map((f) => f.path)));
    if (!res.fonts.length) setNote({ tone: 'amber', text: 'No Xenopixel font folders found there. Choose the top of the card: the folder that holds the numbered folders 1, 2, 3 and so on.' });
  };

  const copy = async () => {
    if (!source || !card) return;
    setBusy(true); setNote(null);
    const results: Record<string, 'copied' | 'exists' | 'failed'> = { ...done };
    let copied = 0;
    for (const f of source.fonts.filter((x) => chosen.has(x.path) && results[x.path] !== 'copied')) {
      setProgress(`Converting ${f.name}…`);
      try { await api().importer.xenoFont(f.path, card.root, f.folder, false); results[f.path] = 'copied'; copied++; } catch (err) {
        results[f.path] = /already on the card/.test(String(err)) ? 'exists' : 'failed';
        console.log(`[import] ${f.name}: ${String(err)}`);
      }
      setDone({ ...results });
    }
    setProgress(null); setBusy(false);
    const skipped = Object.values(results).filter((r) => r === 'exists').length;
    const failed = Object.values(results).filter((r) => r === 'failed').length;
    setNote({ tone: failed ? 'red' : 'green', text: `${copied} font${copied === 1 ? '' : 's'} converted onto the card.${skipped ? ` ${skipped} already there and left alone.` : ''}${failed ? ` ${failed} failed; see the log.` : ''} Put the card back in the saber before adding presets.` });
    onChanged();
  };

  /** One new preset per converted font: duplicate the current preset, then point it at the font and the old colour. */
  const addPresets = async () => {
    if (!source || !connected || !board.info) return;
    setBusy(true); setNote(null);
    const fonts = source.fonts.filter((f) => done[f.path] === 'copied' || done[f.path] === 'exists');
    let added = 0;
    for (const f of fonts) {
      setProgress(`Adding a preset for ${f.name}…`);
      await board.duplicatePreset();
      const cur = board.currentPresetNow();
      // Carry the old blade colour over when blade 1's look is known to take a base colour.
      const b = cur ? parseBuiltin(cur.styles[0] ?? '') : null;
      const look = b && board.saber?.firmware ? lookAtSlot(board.saber.firmware, b.preset, b.blade) : null;
      const styles = b && look?.args.includes(1) ? { 1: formatBuiltin({ preset: b.preset, blade: b.blade, args: f.colorWord }) } : undefined;
      await board.editPreset({ font: `${f.folder};common`, name: f.name, track: '', ...(styles ? { styles } : {}) }, `Preset for ${f.name}`);
      added++;
    }
    setProgress(null); setBusy(false);
    setNote({ tone: 'green', text: `${added} preset${added === 1 ? '' : 's'} added after the current one. The saber only finds the fonts once the card is back in it.` });
  };

  const readyForPresets = source?.fonts.some((f) => done[f.path] === 'copied' || done[f.path] === 'exists') ?? false;
  return (
    <section className="panel" aria-label="Bring fonts from a Xenopixel card">
      <div className="ph"><h2>From a Xenopixel saber</h2><button type="button" className="btn sm" disabled={busy} onClick={() => void pick()}><span className="b"><span className="i"><Icon name="import" />{source ? 'Choose another card' : 'Choose the old card'}</span></span></button></div>
      <div className="pb col" style={{ gap: 10 }}>
        {!source && <span className="hint">Moving from a Xenopixel board? Put its SD card in a reader (or point at a copy of it). Hiltwright reads the fonts and their colours, renames the sounds the way ProffieOS expects and copies them to this card. The old card is never changed.</span>}
        {source && source.fonts.length > 0 && (
          <>
            <div className="list" style={{ border: '1px solid var(--line)', maxHeight: 260, overflow: 'auto' }}>
              {source.fonts.map((f) => {
                const on = chosen.has(f.path);
                const st = done[f.path];
                return (
                  <label key={f.path} className="li" style={{ minHeight: 40, gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={on} disabled={busy || st === 'copied'} onChange={() => setChosen((c) => { const n = new Set(c); if (on) n.delete(f.path); else n.add(f.path); return n; })} aria-label={`Import ${f.name}`} />
                    <span style={{ width: 14, height: 14, flex: 'none', background: f.hex, boxShadow: `0 0 8px ${f.hex}` }} />
                    <span className="col grow" style={{ gap: 0, minWidth: 0 }}><span className="small ellip">{f.name}</span><span className="hint mono ellip" style={{ fontSize: 11 }}>slot {f.slot} → {f.folder} · {f.sounds} sounds{f.tracks ? ` · ${f.tracks} track${f.tracks === 1 ? '' : 's'}` : ''} · {mb(f.bytes)}{f.effect ? ` · ${f.effect}` : ''}</span></span>
                    {st === 'copied' && <span className="chip ok"><Icon name="check" />On the card</span>}
                    {st === 'exists' && <span className="chip warn">Already there</span>}
                    {st === 'failed' && <span className="chip err">Failed</span>}
                  </label>
                );
              })}
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              <button type="button" className="btn pri" disabled={busy || !card || chosen.size === 0} onClick={() => void copy()}><span className="b"><span className="i"><Icon name="sd" />Convert {chosen.size} onto the card</span></span></button>
              <button type="button" className="btn" disabled={busy || !connected || !readyForPresets} title={!connected ? 'Connect the saber first' : undefined} onClick={() => void addPresets()}><span className="b"><span className="i"><Icon name="presets" />Add a preset for each</span></span></button>
              {progress && <span className="hint">{progress}</span>}
            </div>
            {!card && <span className="hint">Put the ProffieOS card in a reader to copy onto it.</span>}
            <span className="hint">Xenopixel blade effects (fire, unstable, rainbow and so on) are part of its firmware and do not carry over. The colour does, when the preset's look takes one; pick looks on the Presets and Looks pages afterwards.</span>
          </>
        )}
        {note && <div className={`note ${note.tone}`}><Icon name={note.tone === 'green' ? 'check' : note.tone === 'red' ? 'x' : 'warn'} /><span>{note.text}</span></div>}
      </div>
    </section>
  );
}
