// Wiring: the board, its buttons and prop, and every blade the saber drives. The one thing old firmware cannot tell
// us, so it is described here once and confirmed against the installer's notes. Everything is saved to the saber as
// it is changed; Build & Install compiles from it.

import { useEffect, useRef, useState } from 'react';
import { parseId, type BladeVariant, type BoardModel, type ModelBlade, type Prop, type SaberConfigModel } from '@hiltwright/core';
import { HardwareEditor } from './Hardware';
import type { Board } from './board';
import { Icon } from './Icon';
import type { Workspace } from './workspace';

export const PROPS: { value: Prop; label: string }[] = [
  { value: 'fett263', label: 'Fett263 · edit mode, gestures' }, { value: 'sa22c', label: 'SA22C' }, { value: 'bc', label: 'BC' }, { value: 'default', label: 'ProffieOS default' },
];

export function Wiring({ ws, board, go }: { ws: Workspace; board: Board; go: (page: 'presets' | 'armory') => void }) {
  const { saber, info, model, live } = ws;
  // Edits happen on a local copy and are saved a moment after the last change, so a slider drag is one write.
  const [draft, setDraft] = useState<SaberConfigModel | null>(model);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setDraft(model); }, [saber?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (model && !draft) setDraft(model); }, [model, draft]);
  const change = (patch: Partial<SaberConfigModel>, unconfirm = true) => {
    setDraft((d) => {
      if (!d) return d;
      const next: SaberConfigModel = { ...d, ...patch };
      if (unconfirm) delete next.wiringConfirmedAt;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => { void ws.saveModel(next); }, 300);
      return next;
    });
  };
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  if (!saber || !info || !draft) {
    return <section className="panel"><div className="pb col" style={{ gap: 6 }}><h3>No saber to wire yet</h3><span className="dim small">Plug a saber in, or start one in the Armory, and describe its wiring here.</span> <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => go('armory')}><span className="b"><span className="i">Go to the Armory</span></span></button></div></section>;
  }

  // Wiring that has been installed counts as confirmed until it is changed.
  const confirmed = !!draft.wiringConfirmedAt || (!!saber.firmware && JSON.stringify(draft.blades) === JSON.stringify(saber.model?.blades ?? draft.blades));
  const detected = info.pixelBlades;
  const measureBlocked = !live ? 'Connect the saber to measure a blade.' : !saber.firmware?.bladeId ? 'Turn this on, then build and install once; readings only count from firmware that scans with the blade powered.' : null;

  return (
    <div className="work" style={{ gridTemplateColumns: 'minmax(0,1fr) 340px' }}>
      <section className="panel fill" aria-label="Wiring">
        <div className="ph"><h2>Wiring of {saber.name}</h2>{saber.planned && <span className="hint">planned ahead; the hilt has not been connected yet</span>}</div>
        <div className="pb col scroll" style={{ gap: 14 }}>
          {!saber.planned && detected.length > 0 && !confirmed && (
            <div className="note"><Icon name="info" /><span>The saber reported {detected.length} pixel blade{detected.length === 1 ? '' : 's'} ({detected.join(', ')} px). That is a starting point, not the wiring: check each blade's data pin and power pins against what the installer wrote down.</span></div>
          )}
          <div className="row wrap" style={{ gap: 14 }}>
            <label className="field"><span className="label">Board</span>
              <div className="seg" role="radiogroup" aria-label="Proffieboard model" style={{ height: 32 }}>
                {(['V2', 'V3'] as BoardModel[]).map((b) => <button key={b} type="button" role="radio" aria-checked={draft.board === b} className={draft.board === b ? 'on' : ''} style={{ height: 30 }} onClick={() => change({ board: b })}>Proffieboard {b}</button>)}
              </div>
            </label>
            <label className="field"><span className="label">Buttons</span>
              <div className="seg" role="radiogroup" aria-label="How many buttons" style={{ height: 32 }}>
                {([1, 2, 3] as const).map((n) => <button key={n} type="button" role="radio" aria-checked={draft.buttons === n} className={draft.buttons === n ? 'on' : ''} style={{ height: 30 }} onClick={() => change({ buttons: n }, false)}>{n}</button>)}
              </div>
            </label>
            <label className="field grow" style={{ minWidth: 260 }}><span className="label">Prop file (how the buttons behave)</span>
              <span className="input sans" style={{ height: 32 }}><span className="ellip">{PROPS.find((p) => p.value === draft.prop)?.label}</span><span className="caret"><Icon name="down" /></span>
                <select value={draft.prop} aria-label="Prop file" onChange={(e) => change({ prop: e.target.value as Prop }, false)}>{PROPS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></span>
            </label>
          </div>
          <HardwareEditor blades={draft.blades} board={draft.board} detected={detected} locked={board.busy} onChange={(b: ModelBlade[]) => change({ blades: b })}
            swap={{
              variants: draft.bladeId?.variants ?? [],
              onVariants: (v: BladeVariant[]) => change(v.length ? { bladeId: { variants: v } } : { bladeId: undefined }, false),
              measureBlocked,
              measure: async () => { const r = await board.send('scanid', { idleMs: 1500 }); return parseId([...r.lines, ...r.events]); },
            }} />
        </div>
      </section>

      <aside className="rail" aria-label="Confirm">
        <div className={`stepc ${confirmed ? 'done' : 'now'}`}>
          <div className="head"><span className="nbox">{confirmed ? <Icon name="check" /> : 1}</span><b>Check it</b><span className="what">{draft.blades.length} blade{draft.blades.length === 1 ? '' : 's'}</span></div>
          <label className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <button type="button" className={`tog ${confirmed ? 'on' : ''}`} role="switch" aria-checked={confirmed} aria-label="I checked the wiring" onClick={() => change(confirmed ? { wiringConfirmedAt: undefined } : { wiringConfirmedAt: new Date().toISOString() }, false)}><i /></button>
            <span className="small dim">I checked every data pin and power pin against the installer's wiring.</span>
          </label>
          <span className="hint">A wrong pin can leave a blade dark or drive one that is not there. The build waits for this once per wiring change.</span>
        </div>
        <div className="stepc">
          <div className="head"><span className="nbox">2</span><b>Next</b><span className="what">presets</span></div>
          <button type="button" className="btn pri full" disabled={!confirmed} onClick={() => go('presets')}><span className="b"><span className="i"><Icon name="presets" />Presets</span></span></button>
          <span className="hint">{confirmed ? 'The saber’s presets: fonts, tracks and a look for each blade.' : 'Confirm the wiring first.'}</span>
        </div>
      </aside>
    </div>
  );
}
