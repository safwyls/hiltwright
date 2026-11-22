// Choosing a preset's sound font from the font library: each font with its name, maker and what it supports, a
// quick listen, and whether it is already on the saber's card. On Install, the fonts chosen for the saber on Install ›
// Fonts come first, then the rest of the library. Folders that are not in the library (on the card, or chosen but not in it)
// are offered too, and a folder name can be typed: the picker is the Sound font field's only way in.

import { useMemo, useState } from 'react';
import type { LibraryFont } from '../../shared/api';
import { Icon } from './Icon';
import { LoadingSpace } from './Loader';
import { mb, useSoundPlayer } from './FontLibrary';
import { ContributorLogo, useContributors } from './credits';

const api = () => window.hiltwright;
const TYPE: Record<LibraryFont['support']['type'], string> = { polyphonic: 'Polyphonic', monophonic: 'Monophonic', mixed: 'Mixed', unknown: 'Unknown' };

export function FontPicker({ fonts, loading, current, onCard, chosen, folders, onPick, onPickFolder, onClose, onManage }: {
  fonts: LibraryFont[];
  /** The font library is still being read: an empty list is not an empty library yet. */
  loading?: boolean;
  /** The folder the preset uses now. */
  current: string;
  /** Font folders on the saber's card as last read, or null when that is not known. */
  onCard: Set<string> | null;
  /** The font folders chosen for this saber on Install › Fonts: shown first, apart from the rest. Absent on Live. */
  chosen?: string[];
  /** Other folder names to offer: the card's fonts and chosen fonts; those in the library are shown as library fonts. */
  folders?: string[];
  onPick: (font: LibraryFont) => void;
  /** A folder that is not in the library, picked from `folders` or typed in the search box. */
  onPickFolder?: (folder: string) => void;
  onClose: () => void;
  onManage: () => void;
}) {
  const [q, setQ] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const player = useSoundPlayer();
  const people = useContributors();
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return fonts.filter((f) => !needle || `${f.meta.name} ${f.meta.maker} ${f.meta.bundle ?? ''} ${f.folder} ${f.meta.notes} ${f.support.special.join(' ')}`.toLowerCase().includes(needle));
  }, [fonts, q]);
  const listen = async (f: LibraryFont) => {
    setNote(null);
    if (player.playing?.startsWith(`${f.folder}/`)) { player.stop(); return; }
    try {
      const d = await api().fontLibrary.detail(f.folder);
      // The font's own name sound (font.wav, font01.wav or font/…), as the saber plays it when the preset is chosen.
      const s = d.sounds.filter((x) => x.effect === 'font name');
      if (!s.length) { setNote(`${f.meta.name} has no font.wav to play.`); return; }
      await player.play(f.folder, s[Math.floor(Math.random() * s.length)].path);
    } catch (err) { setNote(`Could not play ${f.meta.name}: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}`); }
  };
  const close = () => { player.stop(); onClose(); };
  const isChosen = (f: LibraryFont) => !!chosen?.some((c) => c.toLowerCase() === f.folder.toLowerCase());
  // With fonts chosen on Install › Fonts, two groups; a group the search leaves empty is not shown.
  // Folders outside the library, as the search finds them; and a typed folder name that is none of the above.
  const needle = q.trim().toLowerCase();
  const inLibrary = (name: string) => fonts.some((f) => f.folder.toLowerCase() === name.toLowerCase());
  const others = [...new Set((folders ?? []).filter((x) => x && x.toLowerCase() !== 'common' && !inLibrary(x)))].filter((x) => !needle || x.toLowerCase().includes(needle));
  const typed = q.trim();
  const typedOk = !!onPickFolder && !!typed && !/[\\/;:*?"<>|]/.test(typed) && typed.toLowerCase() !== 'common' && !inLibrary(typed) && !others.some((x) => x.toLowerCase() === typed.toLowerCase());
  const groups: { title: string | null; list: LibraryFont[] }[] = chosen
    ? [{ title: 'Chosen on Fonts', list: visible.filter(isChosen) }, { title: 'Rest of the library', list: visible.filter((f) => !isChosen(f)) }].filter((g) => g.list.length)
    : [{ title: null, list: visible }];

  return (
    <div className="dialog-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
      <section className="panel dialog" role="dialog" aria-modal="true" aria-label="Choose a sound font">
        <div className="ph">
          <h2>Choose a sound font</h2>
          <div className="row" style={{ gap: 8 }}>
            <label className="input sans" style={{ width: 220, height: 30 }}><Icon name="search" /><input type="text" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, maker, or a folder" aria-label="Search fonts, or type a folder name" style={{ position: 'static', color: 'var(--text)' }} /></label>
            <button type="button" className="chip" aria-label="Close" onClick={close}><Icon name="x" /></button>
          </div>
        </div>
        <div className="scroll" style={{ minHeight: 0 }}>
          <div className="list">
            {loading && fonts.length === 0 && <LoadingSpace text="Reading the font library…" compact />}
            {!loading && fonts.length === 0 && <div className="li hint" style={{ minHeight: 60 }}>The font library is empty. <button type="button" className="holo" onClick={() => { close(); onManage(); }}>Add fonts to it</button>, then choose them here.</div>}
            {fonts.length > 0 && visible.length === 0 && !others.length && !typedOk && <div className="li hint" style={{ minHeight: 44 }}>No fonts match.</div>}
            {groups.map((g) => [g.title && <div key={`h:${g.title}`} className="listsec">{g.title}<span className="count">{g.list.length}</span></div>, ...g.list.map((f) => {
              const isCur = f.folder.toLowerCase() === current.toLowerCase();
              const playing = player.playing?.startsWith(`${f.folder}/`) ?? false;
              const there = onCard ? [...onCard].some((x) => x.toLowerCase() === f.folder.toLowerCase()) : null;
              return (
                <div key={f.folder} className={`li ${isCur ? 'on' : ''}`} style={{ minHeight: 58, gap: 12 }}>
                  <button type="button" className={`chip ${playing ? 'live' : ''}`} aria-label={`${playing ? 'Stop' : 'Listen to'} ${f.meta.name}`} title="Play its font.wav, the sound the saber makes when the preset is chosen" onClick={() => void listen(f)}><Icon name={playing ? 'x' : 'play'} /></button>
                  {f.meta.maker ? <ContributorLogo name={f.meta.maker} logo={people.logoFor(f.meta.maker)} size={30} /> : <span style={{ width: 30, flex: 'none' }} />}
                  <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
                    <span className="row" style={{ gap: 8, minWidth: 0 }}>
                      <b className="ellip" style={{ fontWeight: 600 }}>{f.meta.name}</b>
                      {f.meta.maker && <span className="hint ellip">by {f.meta.maker}{f.meta.bundle ? ` · ${f.meta.bundle}` : ''}</span>}
                    </span>
                    <span className="hint ellip">
                      <span className="mono">{f.folder}</span> · {TYPE[f.support.type]}{f.support.smoothSwing ? ' · SmoothSwing' : ''}{f.support.special.length ? ` · ${f.support.special.join(', ')}` : ''}{f.support.tracks ? ` · ${f.support.tracks} track${f.support.tracks === 1 ? '' : 's'}` : ''} · {mb(f.bytes)}
                    </span>
                  </span>
                  {there === true && <span className="chip ok" title="Already on the saber's card"><Icon name="check" />On card</span>}
                  {there === false && <span className="chip" title="Not on the saber's card as last read. It is copied on Install › Card, or on Live › Card for a saber already flashed.">Not on card</span>}
                  {f.report.issues.length > 0 && <span className="chip warn" title={f.report.issues.map((i) => i.text).join('\n')}><Icon name="warn" />{f.report.issues.length}</span>}
                  {isCur
                    ? <span className="chip live"><span className="dot" />In use</span>
                    : <button type="button" className="btn sm pri" onClick={() => { player.stop(); onPick(f); }}><span className="b"><span className="i">Use</span></span></button>}
                </div>
              );
            })])}
            {onPickFolder && others.length > 0 && <div className="listsec">Not in the library<span className="count">{others.length}</span></div>}
            {onPickFolder && others.map((name) => {
              const isCur = name.toLowerCase() === current.toLowerCase();
              const there = onCard ? [...onCard].some((x) => x.toLowerCase() === name.toLowerCase()) : null;
              return (
                <div key={`f:${name}`} className={`li ${isCur ? 'on' : ''}`} style={{ minHeight: 48, gap: 12 }}>
                  <span style={{ width: 72, flex: 'none' }} />
                  <span className="col grow" style={{ gap: 2, minWidth: 0 }}><b className="ellip mono" style={{ fontWeight: 600 }}>{name}</b><span className="hint ellip">A folder name: no copy in your font library</span></span>
                  {there === true && <span className="chip ok" title="Already on the saber's card"><Icon name="check" />On card</span>}
                  {there === false && <span className="chip warn" title="Not on the saber's card as last read, and not in the library to copy">Not on card</span>}
                  {isCur
                    ? <span className="chip live"><span className="dot" />In use</span>
                    : <button type="button" className="btn sm pri" onClick={() => { player.stop(); onPickFolder(name); }}><span className="b"><span className="i">Use</span></span></button>}
                </div>
              );
            })}
            {typedOk && (
              <div className="li" style={{ minHeight: 48, gap: 12 }}>
                <span style={{ width: 72, flex: 'none' }} />
                <span className="col grow" style={{ gap: 2, minWidth: 0 }}><span className="ellip">Use <b className="mono" style={{ fontWeight: 600 }}>{typed}</b> as the folder name</span><span className="hint ellip">For a font on the card that is not in your library. Spelled as the folder on the card.</span></span>
                <button type="button" className="btn sm" onClick={() => { player.stop(); onPickFolder!(typed); }}><span className="b"><span className="i">Use</span></span></button>
              </div>
            )}
          </div>
        </div>
        <div className="row between" style={{ padding: '10px 18px', borderTop: '1px solid var(--line)', gap: 12 }}>
          <span className="hint">{note ?? 'The preset names the font by its folder. A font must be on the card for the saber to play it; it is copied on Install › Card, or on Live › Card for a saber already flashed.'}</span>
          <button type="button" className="holo small nowrap" onClick={() => { close(); onManage(); }}>Manage the library</button>
        </div>
      </section>
    </div>
  );
}
