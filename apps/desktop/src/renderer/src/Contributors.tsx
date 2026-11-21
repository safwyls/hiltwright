// Contributors: everyone whose work is in this library, the font makers, look authors and hilt makers, with their
// logos and links and what of theirs is here. Credit is by name as written on each font and look; this page only gathers it.

import { useEffect, useMemo, useState } from 'react';
import { STARTER_LOOKS, type LookDef } from '@hiltwright/core';
import type { LibraryFont, PackInfo } from '../../shared/api';
import { listHilts } from './hiltStore';
import { Icon } from './Icon';
import { LoadingSpace } from './Loader';
import { ContributorLogo, CreditCard, NOT_A_CONTRIBUTOR, useContributors } from './credits';

const api = () => window.hiltwright;

interface HiltCredit { name: string; licence: string | null }
interface Person { name: string; fonts: LibraryFont[]; looks: LookDef[]; hilts: HiltCredit[] }

export function Contributors({ onFonts, onLooks, onDemo }: { onFonts: () => void; onLooks: (creator: string) => void; onDemo: () => void }) {
  const people = useContributors();
  const [fonts, setFonts] = useState<LibraryFont[]>([]);
  const [saved, setSaved] = useState<LookDef[]>([]);
  const [hilts, setHilts] = useState<{ name: string; creator: string; licence: string | null }[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // Everyone is shown once fonts, styles and hilts are all read: before that the list would grow and reorder.
  const [read, setRead] = useState(0);
  const done = () => setRead((n) => n + 1);
  useEffect(() => {
    void api().fontLibrary.list().then(setFonts).catch(() => undefined).finally(done);
    void api().looks.list().then(setSaved).catch(() => undefined).finally(done);
    // Hilts for the demo room: those in packs, credited by the pack, and those the owner loaded and credited.
    void api().packs.list().catch(() => [] as PackInfo[]).then(async (packs) => [packs, await listHilts(packs).catch(() => [])] as const).then(([packs, own]) => setHilts([
      ...packs.filter((p) => p.kind === 'hilt' && p.creator).map((p) => ({ name: p.name, creator: p.creator, licence: p.licence || null })),
      ...own.filter((h) => h.creator).map((h) => ({ name: h.name, creator: h.creator!, licence: null })),
    ])).catch(() => undefined).finally(done);
  }, []);
  const loading = read < 3;

  // Everyone credited somewhere, matched regardless of case; the spelling on their first font or look wins.
  const everyone = useMemo(() => {
    const m = new Map<string, Person>();
    const at = (name: string) => { const n = name.trim(); if (NOT_A_CONTRIBUTOR.test(n)) return null; const k = n.toLowerCase(); if (!m.has(k)) m.set(k, { name: n, fonts: [], looks: [], hilts: [] }); return m.get(k)!; };
    for (const f of fonts) at(f.meta.maker)?.fonts.push(f);
    for (const l of [...STARTER_LOOKS, ...saved]) at(l.by)?.looks.push(l);
    for (const h of hilts) at(h.creator)?.hilts.push({ name: h.name, licence: h.licence });
    for (const p of people.list) at(p.name);
    const n = (p: Person) => p.fonts.length + p.looks.length + p.hilts.length;
    return [...m.values()].sort((a, b) => n(b) - n(a) || a.name.localeCompare(b.name));
  }, [fonts, saved, hilts, people.list]);
  const visible = everyone.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const sel = everyone.find((p) => p.name === selected) ?? visible[0] ?? null;
  const count = (p: Person) => [p.fonts.length ? `${p.fonts.length} font${p.fonts.length === 1 ? '' : 's'}` : null, p.looks.length ? `${p.looks.length} style${p.looks.length === 1 ? '' : 's'}` : null, p.hilts.length ? `${p.hilts.length} hilt${p.hilts.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || 'nothing here yet';
  const bundles = sel ? [...new Set(sel.fonts.map((f) => f.meta.bundle ?? ''))].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b)) : [];

  return (
    <div className="work" style={{ gridTemplateColumns: 'minmax(260px,360px) minmax(0,1fr)' }}>
      <section className="panel fill" aria-label="Contributors" data-tour="contributors-list">
        <div className="ph"><h2>Contributors{loading ? '' : ` · ${everyone.length}`}</h2>
          <label className="input sans" style={{ width: 150, height: 30 }}><Icon name="search" /><input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find" aria-label="Find a contributor" style={{ position: 'static', color: 'var(--text)' }} /></label>
        </div>
        <div className="list scroll grow" role="listbox" aria-label="Contributors">
          {loading && <LoadingSpace text="Gathering everyone credited…" />}
          {!loading && visible.map((p) => (
            <button key={p.name} type="button" role="option" aria-selected={p === sel} className={`li click ${p === sel ? 'on' : ''}`} style={{ minHeight: 56 }} onClick={() => { setSelected(p.name); setNote(null); }}>
              <ContributorLogo name={p.name} logo={people.logoFor(p.name)} size={32} />
              <span className="col grow" style={{ gap: 0, minWidth: 0, textAlign: 'left' }}><b className="ellip" style={{ fontWeight: 600 }}>{p.name}</b><span className="hint ellip">{count(p)}</span></span>
              {people.urlFor(p.name) && <Icon name="link" style={{ width: 14, height: 14, color: 'var(--mute)', flex: 'none' }} />}
            </button>
          ))}
          {!loading && everyone.length === 0 && <div className="li hint" style={{ minHeight: 60 }}>Nobody yet. Give a font a maker in the Font library, paste a style with its author, or credit a hilt in the demo room, and they appear here.</div>}
        </div>
        <div className="pb hint" style={{ borderTop: '1px solid var(--line)', padding: '10px 14px' }}>Names come from the maker on each font, the author on each style and the maker of each hilt. Spell them the same way and they are counted together.</div>
      </section>

      {loading ? <section className="panel fill"><LoadingSpace text="Reading fonts, styles and hilts…" /></section> : sel ? (
        <section className="panel fill" aria-label={`${sel.name}'s work`}>
          <div className="ph"><h2 className="ellip">{sel.name}</h2><span className="hint">{count(sel)}</span></div>
          <div className="pb col scroll" style={{ gap: 18 }}>
            <CreditCard key={sel.name} name={sel.name} label="Credited as" onError={setNote} />
            {note && <div className="note red"><Icon name="x" /><span>{note}</span></div>}

            {sel.fonts.length > 0 && (
              <div className="col" style={{ gap: 8 }}>
                <div className="row between"><span className="label">Fonts</span><button type="button" className="holo small" onClick={onFonts}>Open the Font library</button></div>
                {bundles.map((b) => {
                  const list = sel.fonts.filter((f) => (f.meta.bundle ?? '') === b);
                  return (
                    <div key={b || '-'} className="col" style={{ gap: 6 }}>
                      {bundles.length > 1 || b ? <span className="small dim">{b || 'Not in a bundle'} <span className="mute">· {list.length}</span></span> : null}
                      <div className="row wrap" style={{ gap: 6 }}>{list.map((f) => <span key={f.folder} className="chip" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontSize: 12.5 }}>{f.meta.name}</span>)}</div>
                    </div>
                  );
                })}
              </div>
            )}

            {sel.looks.length > 0 && (
              <div className="col" style={{ gap: 8 }}>
                <div className="row between"><span className="label">Styles</span><button type="button" className="holo small" onClick={() => onLooks(sel.name)}>Show their styles</button></div>
                <div className="row wrap" style={{ gap: 6 }}>{sel.looks.map((l) => <span key={l.id} className="chip" style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontSize: 12.5 }}><span style={{ display: 'inline-block', width: 9, height: 9, background: l.preview, boxShadow: `0 0 6px ${l.preview}` }} />{l.name}</span>)}</div>
              </div>
            )}

            {sel.hilts.length > 0 && (
              <div className="col" style={{ gap: 8 }}>
                <div className="row between"><span className="label">Hilts</span><button type="button" className="holo small" onClick={onDemo}>Open the demo room</button></div>
                <div className="row wrap" style={{ gap: 6 }}>{sel.hilts.map((h) => <span key={h.name} className="chip" title={h.licence ?? undefined} style={{ textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontSize: 12.5 }}><Icon name="blade" />{h.name}</span>)}</div>
              </div>
            )}

            {!sel.fonts.length && !sel.looks.length && !sel.hilts.length && <span className="hint">Nothing of theirs is in the library at the moment; their logo and link are kept for when something is.</span>}
          </div>
        </section>
      ) : <section className="panel"><div className="pb hint">Pick someone to see their work.</div></section>}
    </div>
  );
}
