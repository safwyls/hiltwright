// Choosing a preset's music track: no track; the tracks in the preset's own font, then the saber's card, then the other
// fonts in the library, each from the library with a listen; or a path typed as it is on the card. The library's tracks
// are read when the picker first opens (each font's detail), and kept while the app runs.

import { useEffect, useMemo, useState } from 'react';
import type { LibraryFont } from '../../shared/api';
import { Icon } from './Icon';
import { LoadingSpace } from './Loader';
import { useSoundPlayer } from './FontLibrary';

const api = () => window.hiltwright;

/** A track inside a library font: the preset names it `<font folder>/<path>`. */
export interface LibraryTrack { font: string; fontName: string; path: string; seconds: number | null }

/** Each library font's tracks, by folder and size (a font changed on disk is read again). */
const known = new Map<string, LibraryTrack[]>();
const keyOf = (f: LibraryFont) => `${f.folder}|${f.bytes}`;

async function libraryTracks(fonts: LibraryFont[]): Promise<LibraryTrack[]> {
  const out: LibraryTrack[] = [];
  for (const f of fonts.filter((x) => x.support.tracks > 0)) {
    let list = known.get(keyOf(f));
    if (!list) {
      try { list = (await api().fontLibrary.detail(f.folder)).tracks.map((t) => ({ font: f.folder, fontName: f.meta.name || f.folder, path: t.path, seconds: t.seconds })); }
      catch { list = []; }
      known.set(keyOf(f), list);
    }
    out.push(...list);
  }
  return out;
}

const valueOf = (t: LibraryTrack) => `${t.font}/${t.path}`;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const time = (s: number | null) => (s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const fileName = (p: string) => p.split('/').pop() ?? p;

export function TrackPicker({ library, libraryRead, fontFolder, cardTracks, current, onPick, onClose }: {
  library: LibraryFont[];
  /** The font library has been read: until then its tracks are not known. */
  libraryRead: boolean;
  /** The preset's font folder: its own tracks come first. */
  fontFolder: string;
  /** Tracks on this saber's card as last read (paths as the saber lists them). */
  cardTracks: string[];
  /** The preset's track now ('' for none). */
  current: string;
  onPick: (track: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [tracks, setTracks] = useState<LibraryTrack[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const player = useSoundPlayer();
  useEffect(() => {
    if (!libraryRead) return;
    let live = true;
    void libraryTracks(library).then((t) => { if (live) setTracks(t); });
    return () => { live = false; };
  }, [library, libraryRead]);

  const needle = q.trim().toLowerCase();
  const match = (...parts: string[]) => !needle || parts.join(' ').toLowerCase().includes(needle);
  const groups = useMemo(() => {
    const lib = (tracks ?? []).filter((t) => match(t.path, t.font, t.fontName));
    const own = lib.filter((t) => fontFolder && same(t.font, fontFolder));
    const others = lib.filter((t) => !(fontFolder && same(t.font, fontFolder)));
    const libValues = new Set((tracks ?? []).map((t) => valueOf(t).toLowerCase()));
    const card = [...new Set(cardTracks)].filter((t) => t && !libValues.has(t.toLowerCase()) && match(t));
    // The preset's track now, when it is in none of the lists (not on the card as last read, nor in the library).
    const elsewhere = !!current && !libValues.has(current.toLowerCase()) && !cardTracks.some((t) => same(t, current)) && match(current);
    return { own, card, others, elsewhere };
  }, [tracks, cardTracks, fontFolder, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const typed = q.trim().replace(/\\/g, '/');
  const typedOk = !!typed && /\.wav$/i.test(typed) && !/[;:*?"<>|]/.test(typed) && !same(typed, current)
    && ![...groups.own, ...groups.others].some((t) => same(valueOf(t), typed)) && !groups.card.some((t) => same(t, typed));
  const close = () => { player.stop(); onClose(); };
  const pick = (v: string) => { player.stop(); onPick(v); };
  const listen = async (t: LibraryTrack) => {
    setNote(null);
    try { await player.play(t.font, t.path); } catch (err) { setNote(`Could not play ${fileName(t.path)}: ${String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, '')}`); }
  };

  const useOrInUse = (v: string) => (same(v, current)
    ? <span className="chip live"><span className="dot" />In use</span>
    : <button type="button" className="btn sm pri" onClick={() => pick(v)}><span className="b"><span className="i">Use</span></span></button>);
  const libRow = (t: LibraryTrack) => {
    const v = valueOf(t);
    const playing = player.playing === v;
    return (
      <div key={`l:${v}`} className={`li ${same(v, current) ? 'on' : ''}`} style={{ minHeight: 52, gap: 12 }}>
        <button type="button" className={`chip ${playing ? 'live' : ''}`} aria-label={`${playing ? 'Stop' : 'Listen to'} ${fileName(t.path)}`} onClick={() => void listen(t)}><Icon name={playing ? 'x' : 'play'} /></button>
        <span className="col grow" style={{ gap: 2, minWidth: 0 }}>
          <b className="ellip" style={{ fontWeight: 600 }}>{fileName(t.path)}</b>
          <span className="hint ellip"><span className="mono">{v}</span>{t.seconds != null ? ` · ${time(t.seconds)}` : ''}{same(t.font, fontFolder) ? '' : ` · in ${t.fontName}`}</span>
        </span>
        {useOrInUse(v)}
      </div>
    );
  };
  const heading = (title: string, n: number) => <div key={`h:${title}`} className="listsec">{title}<span className="count">{n}</span></div>;
  const reading = !libraryRead || tracks === null;

  return (
    <div className="dialog-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} onKeyDown={(e) => { if (e.key === 'Escape') close(); }}>
      <section className="panel dialog" role="dialog" aria-modal="true" aria-label="Choose a music track">
        <div className="ph">
          <h2>Choose a music track</h2>
          <div className="row" style={{ gap: 8 }}>
            <label className="input sans" style={{ width: 220, height: 30 }}><Icon name="search" /><input type="text" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, font, or a path" aria-label="Search tracks, or type a path" style={{ position: 'static', color: 'var(--text)' }} /></label>
            <button type="button" className="chip" aria-label="Close" onClick={close}><Icon name="x" /></button>
          </div>
        </div>
        <div className="scroll" style={{ minHeight: 0 }}>
          <div className="list">
            {!needle && (
              <div className={`li ${current ? '' : 'on'}`} style={{ minHeight: 48, gap: 12 }}>
                <span style={{ width: 32, flex: 'none' }} />
                <span className="col grow" style={{ gap: 2 }}><b style={{ fontWeight: 600 }}>No track</b><span className="hint">The preset plays no music.</span></span>
                {current ? <button type="button" className="btn sm" onClick={() => pick('')}><span className="b"><span className="i">Use</span></span></button> : <span className="chip live"><span className="dot" />In use</span>}
              </div>
            )}
            {groups.elsewhere && (
              <div className="li on" style={{ minHeight: 48, gap: 12 }}>
                <span style={{ width: 32, flex: 'none' }} />
                <span className="col grow" style={{ gap: 2, minWidth: 0 }}><b className="ellip" style={{ fontWeight: 600 }}>{fileName(current)}</b><span className="hint ellip"><span className="mono">{current}</span> · the preset&apos;s track now: not on the card as last read, nor in the library</span></span>
                <span className="chip live"><span className="dot" />In use</span>
              </div>
            )}
            {groups.own.length > 0 && [heading(`In ${fontFolder}`, groups.own.length), ...groups.own.map(libRow)]}
            {groups.card.length > 0 && [heading('On the card', groups.card.length), ...groups.card.map((t) => (
              <div key={`c:${t}`} className={`li ${same(t, current) ? 'on' : ''}`} style={{ minHeight: 48, gap: 12 }}>
                <span style={{ width: 32, flex: 'none' }} />
                <span className="col grow" style={{ gap: 2, minWidth: 0 }}><b className="ellip" style={{ fontWeight: 600 }}>{fileName(t)}</b><span className="hint ellip"><span className="mono">{t}</span> · on the saber&apos;s card, as last read</span></span>
                {useOrInUse(t)}
              </div>
            ))]}
            {groups.others.length > 0 && [heading(fontFolder ? 'In other library fonts' : 'In library fonts', groups.others.length), ...groups.others.map(libRow)]}
            {reading && <LoadingSpace text="Reading the tracks in the font library…" compact />}
            {typedOk && (
              <div className="li" style={{ minHeight: 48, gap: 12 }}>
                <span style={{ width: 32, flex: 'none' }} />
                <span className="col grow" style={{ gap: 2, minWidth: 0 }}><span className="ellip">Use <b className="mono" style={{ fontWeight: 600 }}>{typed}</b></span><span className="hint ellip">A path on the card, as the saber reads it: tracks/name.wav, or font/tracks/name.wav.</span></span>
                <button type="button" className="btn sm" onClick={() => pick(typed)}><span className="b"><span className="i">Use</span></span></button>
              </div>
            )}
            {!reading && needle && !groups.own.length && !groups.card.length && !groups.others.length && !typedOk && (
              <div className="li hint" style={{ minHeight: 44 }}>No tracks match. To use a path on the card, type it in full, ending in .wav.</div>
            )}
          </div>
        </div>
        <div className="row between" style={{ padding: '10px 18px', borderTop: '1px solid var(--line)', gap: 12 }}>
          <span className="hint">{note ?? 'A track plays while the preset is on. It must be on the card for the saber to play it: a library font\'s tracks go with the font.'}</span>
        </div>
      </section>
    </div>
  );
}
