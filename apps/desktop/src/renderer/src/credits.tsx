// Contributors as every page sees them: one list, loaded once and shared, so a logo added on one page shows on
// every other at once. Names match regardless of case.

import { useEffect, useReducer, useState } from 'react';
import type { ContributorInfo } from '../../shared/api';
import { Icon } from './Icon';
import { creditOf } from '@hiltwright/core';
import appIcon from './assets/hiltwright-icon.svg';

const api = () => window.hiltwright;

let people: ContributorInfo[] = [];
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

async function refresh(): Promise<void> {
  try { people = await api().contributors.list(); } catch { /* keep what we had */ }
  for (const l of listeners) l();
}
/** Fonts added anywhere can bring their makers in as contributors: the credits everywhere show them. */
export function contributorsChanged(): void { if (loaded) void refresh(); }

const find = (name: string | null | undefined) => {
  const want = (name ?? '').trim().toLowerCase();
  return want ? people.find((p) => p.name.toLowerCase() === want) ?? null : null;
};

/** Logos that come with the app: Hiltwright's own work (the built-in looks) wears the app icon. */
const BUILT_IN_LOGOS: Record<string, string> = { hiltwright: appIcon };
const builtInLogo = (name: string | null | undefined) => BUILT_IN_LOGOS[(name ?? '').trim().toLowerCase()] ?? null;

/** Names that credit nobody in particular: the owner's own looks. */
export const NOT_A_CONTRIBUTOR = /^(you|unknown|me)?$/i;

export function useContributors() {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    loaded ??= refresh();
    return () => { listeners.delete(rerender); };
  }, []);
  return {
    list: people,
    /** The owner's logo for them, or the one the app ships (Hiltwright's icon), or null. */
    logoFor: (name: string | null | undefined) => find(name)?.logo ?? builtInLogo(name),
    /** Only a logo the owner set: the one Remove takes away. */
    ownLogoFor: (name: string | null | undefined) => find(name)?.logo ?? null,
    urlFor: (name: string | null | undefined) => find(name)?.url ?? null,
    /** Ask for an image; true when one was set. */
    setLogo: async (name: string) => { const r = await api().contributors.setLogo(name); await refresh(); return !!r; },
    clearLogo: async (name: string) => { await api().contributors.clearLogo(name); await refresh(); },
    setUrl: async (name: string, url: string) => { await api().contributors.setUrl(name, url); await refresh(); },
    /** Give a renamed author the old name's logo and link (a copy). */
    copyTo: async (from: string, to: string) => { const r = await api().contributors.copy(from, to); await refresh(); return r; },
    open: (name: string) => api().contributors.open(name),
    refresh,
  };
}

/** A contributor's logo, or their initials in its place. */
export function ContributorLogo({ name, logo, size = 22 }: { name: string; logo: string | null | undefined; size?: number }) {
  if (logo) return <img className="mlogo" src={logo} alt={`${name} logo`} style={{ width: size, height: size }} />;
  const initials = name.split(/[\s_-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';
  return <span className="mlogo" aria-hidden="true" style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.38)) }}>{initials}</span>;
}

/**
 * Credit for one person: their logo, name and link, with the means to add or change them. `onRename` makes the name
 * editable (for the owner's own looks, where the author was typed in by hand).
 */
export function CreditCard({ name, label = 'By', editedBy, onRename, onError }: { name: string; label?: string; /** The owner changed this style in the editor: say so under the author. */ editedBy?: boolean; onRename?: (name: string) => void | Promise<void>; onError?: (text: string) => void }) {
  const people = useContributors();
  const [editing, setEditing] = useState<'name' | 'url' | null>(null);
  const [draft, setDraft] = useState('');
  const logo = people.logoFor(name);
  const url = people.urlFor(name);
  const credited = !NOT_A_CONTRIBUTOR.test(name.trim());
  const fail = (err: unknown) => onError?.(String(err).replace(/^Error: (Error invoking remote method '[^']+': Error: )?/, ''));
  const submit = async () => {
    try {
      // Awaited, so a failed rename is reported and the form stays open for another try.
      if (editing === 'name') await onRename?.(draft.trim());
      else if (editing === 'url') await people.setUrl(name, draft);
      setEditing(null);
    } catch (err) { fail(err); }
  };
  return (
    <div className="credit">
      {credited ? <ContributorLogo name={name} logo={logo} size={40} /> : <span className="mlogo" style={{ width: 40, height: 40 }}><Icon name="looks" /></span>}
      <div className="col grow" style={{ gap: 3, minWidth: 0 }}>
        <span className="label" style={{ fontSize: 10.5 }}>{label}</span>
        {editing ? (
          <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <span className="input sans grow" style={{ height: 28 }}><input type="text" autoFocus value={draft} placeholder={editing === 'url' ? 'fett263.com' : 'Who made it'} aria-label={editing === 'url' ? `Link for ${name}` : 'Author'} onChange={(e) => setDraft(e.target.value)} /></span>
            <button type="submit" className="btn sm pri"><span className="b"><span className="i">Save</span></span></button>
            <button type="button" className="chip" aria-label="Cancel" onClick={() => setEditing(null)}><Icon name="x" /></button>
          </form>
        ) : (
          <>
            <span className="row" style={{ gap: 8, minWidth: 0 }}>
              <b className="ellip" style={{ fontWeight: 600 }}>{credited ? name : creditOf(name).kind === 'unknown' ? 'Unknown' : 'You'}</b>
              {onRename && <button type="button" className="holo small" onClick={() => { setDraft(credited ? name : ''); setEditing('name'); }}>Edit</button>}
            </span>
            {editedBy && <span className="hint">Edited by you</span>}
            {credited && (
              <span className="row wrap" style={{ gap: 10 }}>
                {url && <button type="button" className="holo small ellip" style={{ maxWidth: 200 }} title={url} onClick={() => void people.open(name)}><Icon name="link" style={{ width: 12, height: 12, verticalAlign: -1 }} /> {url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</button>}
                <button type="button" className="holo small" onClick={() => void people.setLogo(name).catch(fail)}>{logo ? 'Change logo' : 'Add logo'}</button>
                {people.ownLogoFor(name) && <button type="button" className="holo small" onClick={() => void people.clearLogo(name)}>{builtInLogo(name) ? 'Use the built-in logo' : 'Remove logo'}</button>}
                <button type="button" className="holo small" onClick={() => { setDraft(url ?? ''); setEditing('url'); }}>{url ? 'Edit link' : 'Add link'}</button>
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
