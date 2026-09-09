import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { DATA_PINS, POWER_PINS, ROLE_META, TYPE_META, bladeRange, bladeSummary, pinTable, powerOptions, type Blade, type BladeType, type Role } from '../model';
import { Icon } from '../components/Icon';
import { Button, Chip, Field, Note, NumberInput, Panel, PanelHead, Select, TextInput, Toggle } from '../components/ui';
import { BladeBar, BladeGlyph, Hilt, RoleIcon } from '../components/saber';

const STEPS = ['Board', 'Blades', 'Buttons', 'Check', 'Windows driver'];
const ROLES: Role[] = ['main', 'crystal', 'accent', 'side', 'motor'];
const TYPES: BladeType[] = ['pixel', 'star', 'single', 'motor'];

function BladeCard({ b, index }: { b: Blade; index: number }) {
  const w = useStore((s) => s.wizard);
  const { wizardSet, wizardUpdateBlade, wizardSetRole, wizardSetType, wizardSetWiring, wizardCount, wizardAddVariant, wizardUpdateVariant, wizardRemoveVariant, wizardMeasure } = useStore();
  const open = w.openBlade === b.id;
  const pixelParents = w.blades.filter((x) => x.id !== b.id && x.type === 'pixel' && x.wiring.kind !== 'chain');
  const range = bladeRange(w.blades, b.id);
  const incomplete = b.type === 'pixel' && b.pixels < 1;

  if (!open) {
    return (
      <button type="button" className={`bcard sum ${incomplete ? 'warn' : ''}`} aria-expanded={false} onClick={() => wizardSet({ openBlade: b.id })}>
        <span className="mono mute" style={{ fontSize: 11, width: 16 }}>{index + 1}</span>
        <span className="g" style={incomplete ? { color: 'var(--amber)' } : undefined}><RoleIcon role={b.role} /></span>
        <span style={{ fontWeight: 600, fontSize: 13.5, width: 150, flex: 'none' }}>{ROLE_META[b.role].label}</span>
        <span className="dim grow ellip small">{incomplete ? 'Needs a pixel count' : bladeSummary(w.blades, b)}</span>
        <span style={{ color: incomplete ? 'var(--amber)' : 'var(--green)', display: 'flex', width: 16, flex: 'none' }}><Icon name={incomplete ? 'warn' : 'check'} /></span>
        <span className="mute" style={{ display: 'flex', width: 16, flex: 'none' }}><Icon name="down" /></span>
      </button>
    );
  }

  const chainAfter = b.wiring.kind === 'chain' ? b.wiring.after : pixelParents[0]?.id;
  return (
    <div className="bcard open col" style={{ gap: 0 }} aria-expanded>
      <div className="sum" style={{ borderBottom: '1px solid var(--line)' }}>
        <span className="mono mute" style={{ fontSize: 11, width: 16 }}>{index + 1}</span>
        <span className="g"><RoleIcon role={b.role} /></span>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{ROLE_META[b.role].label}</span>
        <span className="hint grow ellip">{ROLE_META[b.role].hint}</span>
        <button type="button" className="hint" onClick={() => wizardSet({ openBlade: null })} aria-label="Collapse"><Icon name="up" size={16} /></button>
        {w.blades.length > 1 && <Button size="sm" variant="ghost" icon="trash" onClick={() => { wizardSet({ blades: w.blades.filter((x) => x.id !== b.id) }); wizardCount(w.blades.length - 1); }}>Remove</Button>}
      </div>
      <div className="col" style={{ padding: '12px 16px 14px', gap: 12 }}>
        <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
          <div className="col" style={{ gap: 6 }}>
            <span className="label">What is it</span>
            <div className="seg" role="radiogroup" aria-label="Role">
              {ROLES.map((r) => <button key={r} type="button" role="radio" aria-checked={b.role === r} className={b.role === r ? 'on' : ''} onClick={() => wizardSetRole(b.id, r)}><RoleIcon role={r} />{ROLE_META[r].label}</button>)}
            </div>
          </div>
          {b.role !== 'motor' && (
            <div className="col" style={{ gap: 6 }}>
              <span className="label">Built from</span>
              <div className="seg" role="radiogroup" aria-label="Type">
                {TYPES.filter((t) => t !== 'motor').map((t) => <button key={t} type="button" role="radio" aria-checked={b.type === t} className={b.type === t ? 'on' : ''} onClick={() => wizardSetType(b.id, t)}><Icon name={t === 'pixel' ? 'strip' : 'led'} />{TYPE_META[t].label}</button>)}
              </div>
            </div>
          )}
        </div>

        {b.type === 'pixel' && (
          <div className="grid3">
            <Field label="Pixels"><NumberInput value={b.pixels} min={1} max={400} onChange={(v) => wizardUpdateBlade(b.id, { pixels: v })} ariaLabel="Pixel count" /></Field>
            <Field label="LED chip"><Select value={b.chip} onChange={(v) => wizardUpdateBlade(b.id, { chip: v })} options={['WS2812B', 'WS2813', 'SK6812', 'APA102'].map((c) => ({ value: c, label: c }))} ariaLabel="LED chip" /></Field>
            <Field label="Colour order"><Select value={b.order} onChange={(v) => wizardUpdateBlade(b.id, { order: v })} options={['GRB', 'RGB', 'GRBW', 'RGBW', 'BGR'].map((c) => ({ value: c, label: c }))} ariaLabel="Colour order" /></Field>
            <Field label="Strips on this wire"><Select sans value={String(b.parallel)} onChange={(v) => wizardUpdateBlade(b.id, { parallel: Number(v) })} options={[{ value: '1', label: 'One strip' }, { value: '2', label: 'Two in parallel' }, { value: '3', label: 'Three in parallel' }]} ariaLabel="Strips wired in parallel on this data line" /></Field>
            <div className="field" style={{ gridColumn: '1 / -1' }}><span className="hint">Strips soldered to the same data wire show the same thing and cannot be controlled separately. Count them as one blade with one strip's pixel count. Two 20 px quillons on one wire are one 20 px blade.</span></div>
          </div>
        )}
        {b.type === 'star' && (
          <div className="grid3">
            <Field label="LED module"><Select sans value={b.chip || 'Tri-Cree RGB'} onChange={(v) => wizardUpdateBlade(b.id, { chip: v })} options={['Tri-Cree RGB', 'Quad-Cree RGBW', 'Custom (ask installer)'].map((c) => ({ value: c, label: c }))} ariaLabel="LED module" /></Field>
            <Field label="Resistors"><Select value={b.order || 'vendor preset'} onChange={(v) => wizardUpdateBlade(b.id, { order: v })} options={['vendor preset', '1.0 Ω / 0.5 Ω / 0.5 Ω', 'custom'].map((c) => ({ value: c, label: c }))} ariaLabel="Resistor values" /></Field>
            <div className="field"><span className="label">Note</span><span className="hint" style={{ paddingTop: 6 }}>Owners rarely know these. Vendor presets cover the usual shops.</span></div>
          </div>
        )}
        {b.type === 'single' && (
          <div className="grid3">
            <Field label="LED colour"><Select sans value={b.ledColor} onChange={(v) => wizardUpdateBlade(b.id, { ledColor: v })} options={[['#ffffff', 'White'], ['#ff3d3d', 'Red'], ['#3d7bff', 'Blue'], ['#3dffb0', 'Green'], ['#ffb547', 'Amber']].map(([v, l]) => ({ value: v, label: l }))} ariaLabel="LED colour" /></Field>
          </div>
        )}
        {b.type === 'motor' && <p className="hint">Runs from one power pin. Its look decides when it spins.</p>}

        <div className="col" style={{ gap: 8 }}>
          <div className="row between"><span className="label">Wiring</span>{b.type === 'pixel' && <button type="button" className="holo" style={{ fontSize: 12, fontWeight: 600 }} onClick={() => useStore.getState().showToast('Reversed and interleaved (stride) sub-blades would be set here.')}>Advanced: reversed or interleaved</button>}</div>
          {b.type === 'pixel' ? (
            <>
              <div className="row" style={{ gap: 12, alignItems: 'stretch' }}>
                <button type="button" className={`opt ${b.wiring.kind === 'own' ? 'on' : ''}`} role="radio" aria-checked={b.wiring.kind === 'own'} onClick={() => wizardSetWiring(b.id, { kind: 'own', dataPin: DATA_PINS[w.board][0], powerPins: [POWER_PINS[0]] })}>
                  <span className="radio" /><span className="col" style={{ gap: 2 }}><b style={{ fontWeight: 600, fontSize: 13 }}>Own data line</b><span className="hint">Its own wire and its own power pins.</span></span>
                </button>
                <button type="button" className={`opt ${b.wiring.kind === 'chain' ? 'on' : ''}`} role="radio" aria-checked={b.wiring.kind === 'chain'} disabled={pixelParents.length === 0} onClick={() => chainAfter && wizardSetWiring(b.id, { kind: 'chain', after: chainAfter })} style={pixelParents.length === 0 ? { opacity: 0.5 } : undefined}>
                  <span className="radio" /><span className="col" style={{ gap: 2 }}><b style={{ fontWeight: 600, fontSize: 13 }}>Continues another blade's wire</b><span className="hint">{pixelParents.length === 0 ? 'Needs another pixel blade on its own data line.' : range && b.wiring.kind === 'chain' ? <>Same strip: pixels <span className="mono">{range.start}–{range.end}</span>, shares its power.</> : 'Same strip, after that blade. Shares its power pins.'}</span></span>
                </button>
              </div>
              {b.wiring.kind === 'own' && (
                <div className="grid2">
                  <Field label="Data pin"><Select value={b.wiring.dataPin} onChange={(v) => wizardSetWiring(b.id, { kind: 'own', dataPin: v, powerPins: (b.wiring as { powerPins: number[] }).powerPins })} options={DATA_PINS[w.board].map((p) => ({ value: p, label: p }))} ariaLabel="Data pin" /></Field>
                  <div className="field"><span className="label">Power pins</span><div className="row wrap" style={{ gap: 6, minHeight: 38 }}>{POWER_PINS.map((p) => <Chip key={p} selected={(b.wiring as { powerPins: number[] }).powerPins.includes(p)} onClick={() => { const cur = (b.wiring as { powerPins: number[] }).powerPins; const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p].sort(); if (next.length) wizardSetWiring(b.id, { kind: 'own', dataPin: (b.wiring as { dataPin: string }).dataPin, powerPins: next }); }}>LED {p}</Chip>)}</div></div>
                </div>
              )}
              {b.wiring.kind === 'chain' && (
                <div className="grid2">
                  <Field label="After"><Select sans value={b.wiring.after} onChange={(v) => wizardSetWiring(b.id, { kind: 'chain', after: v })} options={pixelParents.map((p) => ({ value: p.id, label: `Blade ${w.blades.indexOf(p) + 1} · ${ROLE_META[p.role].label}` }))} ariaLabel="Continues after" /></Field>
                </div>
              )}
            </>
          ) : (
            <div className="grid3">
              <Field label={b.type === 'motor' ? 'Power pin' : 'Driven from'}><Select value={String((b.wiring as { pin?: number }).pin ?? 1)} onChange={(v) => wizardSetWiring(b.id, { kind: 'power', pin: Number(v) })} options={powerOptions(w.board).filter((o) => o.kind === 'fet' || b.type === 'single').map((o) => ({ value: String(o.pin), label: o.kind === 'pwm' ? `${o.label} · PWM, small LED only` : o.label }))} ariaLabel="Power pin" /></Field>
              <div className="field" style={{ gridColumn: '2 / -1' }}><span className="label">Note</span><span className="hint" style={{ paddingTop: 6 }}>{((b.wiring as { pin?: number }).pin ?? 1) > 6 ? 'A Free pin drives the LED straight from the chip through its own resistor: a few milliamps, fine for an indicator, not for a star LED or a motor.' : w.board === 'V3.9' && b.type === 'single' ? 'LED 1–6 are FET outputs from the battery. On a V3.9 a small indicator LED can use Free 1–3 as PWM instead and keep the FETs free.' : 'LED 1–6 switch battery power through a FET. Sharing one between blades is fine; the build adds the shared-power option.'}</span></div>
            </div>
          )}
        </div>

        {b.role === 'main' && (
          <div className="col" style={{ gap: 10, paddingTop: 6, borderTop: '1px solid var(--line)' }}>
            <div className="row between">
              <Toggle on={w.swappable} onChange={(v) => { wizardSet({ swappable: v }); if (v && w.variants.length === 0) { wizardAddVariant(); } }} label="Do you swap blades on this saber?" />
              {w.swappable && <Button size="sm" icon="plus" onClick={wizardAddVariant} disabled={w.variants.length >= 4}>Add a blade</Button>}
            </div>
            {w.swappable && (
              <div className="col" style={{ gap: 6 }}>
                {w.variants.map((v) => (
                  <div key={v.id} className="row" style={{ gap: 10, padding: '8px 10px', border: '1px solid var(--line)', background: '#0b1016' }}>
                    <span style={{ width: 160, flex: 'none' }}><TextInput value={v.name} onChange={(n) => wizardUpdateVariant(v.id, { name: n })} sans ariaLabel="Blade name" /></span>
                    <span style={{ width: 110, flex: 'none' }}><NumberInput value={v.pixels} min={0} max={400} onChange={(n) => wizardUpdateVariant(v.id, { pixels: n })} ariaLabel="Pixels" suffix="px" /></span>
                    <span className="mono grow small" style={{ color: v.ohms === null && v.pixels > 0 ? 'var(--amber)' : 'var(--dim)' }}>{v.pixels === 0 ? 'no blade · open circuit' : v.ohms === null ? 'ID not measured yet' : `ID ${(v.ohms / 1000).toFixed(1)} kΩ`}</span>
                    <Button size="sm" onClick={() => wizardMeasure(v.id)} disabled={w.measuring !== null}>{w.measuring === v.id ? 'Reading…' : 'Measure'}</Button>
                    <button type="button" className="mute" aria-label="Remove blade" onClick={() => wizardRemoveVariant(v.id)}><Icon name="x" size={16} /></button>
                  </div>
                ))}
                <span className="hint">Plug in each blade and press Measure. Hiltwright reads its ID resistor from the saber, so you never type a kilohm value. Presets are shared between blades unless you unlink one later.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Setup() {
  const nav = useNavigate();
  const w = useStore((s) => s.wizard);
  const { wizardSet, wizardCount, wizardFinish, showToast } = useStore();
  const pins = pinTable(w.blades, w.board);
  const crystal = w.blades.find((b) => b.role === 'crystal');
  const incomplete = w.blades.some((b) => b.type === 'pixel' && b.pixels < 1);
  const step2ok = pins.conflicts.length === 0 && !incomplete && w.blades.some((b) => b.role === 'main');
  const canContinue = w.step === 2 ? step2ok : true;
  const driver = w.driver;
  const setDriver = (v: boolean) => wizardSet({ driver: v });

  const next = () => {
    if (w.step === 5) { wizardFinish(); nav('/armory'); return; }
    wizardSet({ step: w.step + 1 });
  };

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Hardware setup · step {w.step} of 5</div><h1>{['', 'Which board?', 'What lights up?', 'How many buttons?', 'Does it all fit?', 'One-time Windows setup'][w.step]}</h1></div>
        <div className="row">
          <Button onClick={() => (w.step === 1 ? nav('/armory') : wizardSet({ step: w.step - 1 }))}>{w.step === 1 ? 'Cancel' : 'Back'}</Button>
          <Button variant="pri" icon={w.step === 5 ? 'check' : 'chev'} onClick={next} disabled={!canContinue}>{w.step === 5 ? 'Finish' : 'Continue'}</Button>
        </div>
      </div>

      <div className="row" style={{ gap: 28, borderBottom: '1px solid var(--line)' }}>
        {STEPS.map((s, i) => {
          const n = i + 1;
          const st = n < w.step ? 'done' : n === w.step ? 'now' : '';
          return <button type="button" key={s} className={`steptab ${st}`} aria-current={st === 'now' ? 'step' : undefined} onClick={() => n < w.step && wizardSet({ step: n })}><span className="nbox">{st === 'done' ? <Icon name="check" /> : n}</span><span className="l">{s}</span></button>;
        })}
      </div>

      {w.step === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 20 }}>
          <Panel>
            <PanelHead><h2>Board</h2></PanelHead>
            <div className="pb col" style={{ gap: 14 }}>
              <div className="grid2">
                <Field label="Saber name"><TextInput value={w.name} onChange={(v) => wizardSet({ name: v })} sans ariaLabel="Saber name" /></Field>
                <Field label="Proffieboard"><Select sans value={w.board} onChange={(v) => wizardSet({ board: v as 'V2.2' | 'V3.9' })} options={[{ value: 'V2.2', label: 'V2.2 · 256 KB flash' }, { value: 'V3.9', label: 'V3.9 · 512 KB flash' }]} ariaLabel="Board" /></Field>
              </div>
              <Note>We read the board type from the saber when it is plugged in. Pick it here only if the saber is not connected yet.</Note>
            </div>
          </Panel>
          <Panel label="Read from the saber">
            <PanelHead right={<Chip tone="live">Detected</Chip>}><h2>Read from the saber</h2></PanelHead>
            <div className="list">
              {[['Board', `Proffieboard ${w.board} · ${w.board === 'V2.2' ? 256 : 512} KB`], ['Firmware', 'ProffieOS 4.7 · Jul 2020'], ['Presets', '14 · stock vendor config'], ['SD card', 'no source folder']].map(([k, v]) => (
                <div key={k} className="li" style={{ minHeight: 40 }}><span className="dim grow small">{k}</span><span className="mono" style={{ fontSize: 12.5 }}>{v}</span></div>
              ))}
            </div>
            <div className="pb hint" style={{ paddingTop: 12 }}>Old firmware cannot report its wiring, which is why the next step asks you.</div>
          </Panel>
        </div>
      )}

      {w.step === 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 20, flex: 1, minHeight: 0 }}>
          <section className="col" style={{ gap: 10, minHeight: 0, overflow: 'auto', paddingRight: 2 }}>
            <div className="row" style={{ gap: 18, padding: '0 0 2px' }}>
              <div className="row" style={{ gap: 0 }} role="group" aria-label="Number of blades">
                <button type="button" className="input" style={{ width: 38, justifyContent: 'center', padding: 0 }} aria-label="Fewer blades" onClick={() => wizardCount(w.blades.length - 1)} disabled={w.blades.length <= 1}><Icon name="minus" /></button>
                <span className="input mono" style={{ width: 56, justifyContent: 'center', fontSize: 16, borderLeft: 0, borderRight: 0 }} aria-live="polite">{w.blades.length}</span>
                <button type="button" className="input" style={{ width: 38, justifyContent: 'center', padding: 0 }} aria-label="More blades" onClick={() => wizardCount(w.blades.length + 1)} disabled={w.blades.length >= 8}><Icon name="plus" /></button>
              </div>
              <div className="col" style={{ gap: 1 }}>
                <b style={{ fontWeight: 600 }}>Blades</b>
                <span className="hint">Count every light or motor the saber controls separately: main blade, crystal chamber, accents, side blades, spinner.</span>
              </div>
            </div>
            {w.blades.map((b, i) => <BladeCard key={b.id} b={b} index={i} />)}
          </section>

          <aside className="col" style={{ gap: 16, minHeight: 0, overflow: 'auto' }}>
            <Panel label="Saber diagram">
              <PanelHead right={<Chip tone="live">{w.blades.length} blade{w.blades.length > 1 ? 's' : ''}</Chip>}><h2>Your saber so far</h2></PanelHead>
              <div className="pb col" style={{ gap: 10, padding: '14px 18px' }}>
                <div className="row" style={{ gap: 0, padding: '4px 0' }}><Hilt crystal={crystal ? '#ff3d3d' : null} /><BladeBar color="#3d7bff" /></div>
                <div className="list" style={{ border: '1px solid var(--line)' }}>
                  {w.blades.map((b, i) => {
                    const r = bladeRange(w.blades, b.id);
                    return (
                      <div key={b.id} className="li" style={{ minHeight: 36, gap: 12 }}>
                        <span className="mono mute" style={{ fontSize: 11, width: 12 }}>{i + 1}</span>
                        <span style={{ width: 26, display: 'flex', justifyContent: 'center' }}><BladeGlyph blade={b} color={b.role === 'crystal' ? '#ff3d3d' : '#3d7bff'} spinning={b.role === 'motor'} /></span>
                        <span className="grow small">{ROLE_META[b.role].label}</span>
                        <span className="mono mute" style={{ fontSize: 11 }}>{b.type === 'pixel' ? `${b.pixels} px${b.wiring.kind === 'chain' && r ? ` · ${r.start}–${r.end}` : ''}` : b.type === 'motor' ? 'spinner' : b.type === 'star' ? 'star LED' : 'LED'}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Panel>

            <Panel label="Pins on the board">
              <PanelHead right={pins.conflicts.length ? <Chip tone="err" icon="x">{pins.conflicts.length} conflict{pins.conflicts.length > 1 ? 's' : ''}</Chip> : pins.sharedPower.length ? <Chip tone="warn" icon="info">Shared power</Chip> : <Chip tone="ok" icon="check">No conflicts</Chip>}><h2>Pins · {w.board}</h2></PanelHead>
              <div className="pb col" style={{ gap: 0, paddingTop: 8, paddingBottom: 10 }}>
                {pins.data.map((r) => <div key={r.pin} className={`pin ${r.conflict ? 'bad' : ''}`}><span className="k">{r.pin}</span>{r.users.length ? <span className="v">{r.users.map((id) => `Blade ${w.blades.findIndex((b) => b.id === id) + 1}`).join(', then ')}</span> : <span className="free">free</span>}</div>)}
                <div style={{ height: 1, background: 'var(--line)', margin: '6px 0' }} />
                {pins.power.map((r) => <div key={r.pin} className={`pin ${r.conflict ? 'bad' : ''}`}><span className="k">{r.pin}</span>{r.users.length ? <span className="v">{[...new Set(r.users)].map((id) => `Blade ${w.blades.findIndex((b) => b.id === id) + 1}`).join(' + ')}{r.shared && <span className="amber"> · shared</span>}</span> : <span className="free">{r.kind === 'pwm' ? 'free · PWM' : 'free'}</span>}</div>)}
                {pins.sharedPower.length > 0 && <div className="hint" style={{ paddingTop: 8 }}>{pins.sharedPower.join(', ')} {pins.sharedPower.length > 1 ? 'power' : 'powers'} more than one blade. ProffieOS allows that with the shared-power option (<span className="mono">SHARED_POWER_PINS</span>), which the build adds for you.</div>}
                {pins.conflicts.map((c) => <div key={c} className="red small" style={{ paddingTop: 8 }}>{c}</div>)}
              </div>
            </Panel>

            <Panel tone="amber" label="Wiring is identity">
              <div className="pb row" style={{ gap: 12, alignItems: 'flex-start' }}>
                <span style={{ display: 'flex', width: 18, color: 'var(--amber)', flex: 'none', marginTop: 2 }}><Icon name="lock" /></span>
                <p className="dim" style={{ fontSize: 12.5, textWrap: 'pretty' }}>Read-only after setup. Every change asks you to confirm, because wrong power pins can damage hardware.</p>
              </div>
            </Panel>
          </aside>
        </div>
      )}

      {w.step === 3 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 20 }}>
          <Panel>
            <PanelHead><h2>Buttons and behaviour</h2></PanelHead>
            <div className="pb col" style={{ gap: 14 }}>
              <div className="grid2">
                <Field label="Buttons"><Select sans value="2" onChange={() => {}} options={[{ value: '1', label: '1 button' }, { value: '2', label: '2 buttons' }, { value: '3', label: '3 buttons' }]} ariaLabel="Buttons" /></Field>
                <Field label="Control scheme"><Select sans value="fett263" onChange={() => {}} options={[{ value: 'fett263', label: 'Fett263 · edit mode, gestures, battle mode' }, { value: 'sa22c', label: 'SA22C' }, { value: 'bc', label: 'BC' }, { value: 'default', label: 'ProffieOS default' }]} ariaLabel="Control scheme" /></Field>
              </div>
              <Note>The control scheme is the prop file. It decides what a press, hold or twist does. Fett263 is what most installers ship.</Note>
            </div>
          </Panel>
          <Panel label="Buttons on the saber">
            <PanelHead><h2>Detected</h2></PanelHead>
            <div className="list">
              <div className="li" style={{ minHeight: 40 }}><span className="dim grow small">Power</span><span className="mono" style={{ fontSize: 12.5 }}>powerButtonPin</span></div>
              <div className="li" style={{ minHeight: 40 }}><span className="dim grow small">Aux</span><span className="mono" style={{ fontSize: 12.5 }}>auxPin</span></div>
            </div>
          </Panel>
        </div>
      )}

      {w.step === 4 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 20 }}>
          <Panel>
            <PanelHead right={<Chip tone="ok" icon="check">Ready to install</Chip>}><h2>{w.name || 'New saber'} · Proffieboard {w.board}</h2></PanelHead>
            <div className="list">
              {w.blades.map((b, i) => <div key={b.id} className="li" style={{ gap: 14 }}><span className="mono mute" style={{ fontSize: 11, width: 16 }}>{i + 1}</span><span style={{ color: 'var(--holo)', display: 'flex', width: 18 }}><RoleIcon role={b.role} /></span><span style={{ fontWeight: 600, width: 150, flex: 'none' }}>{ROLE_META[b.role].label}</span><span className="dim grow small ellip">{bladeSummary(w.blades, b)}</span></div>)}
              {w.swappable && w.variants.map((v) => <div key={v.id} className="li" style={{ gap: 14 }}><span className="mono mute" style={{ fontSize: 11, width: 16 }}>ID</span><span style={{ color: 'var(--holo)', display: 'flex', width: 18 }}><Icon name="blade" /></span><span style={{ fontWeight: 600, width: 150, flex: 'none' }}>{v.name}</span><span className="dim grow small">{v.pixels} px · {v.pixels === 0 ? 'open circuit' : v.ohms === null ? 'not measured' : `${(v.ohms / 1000).toFixed(1)} kΩ`}</span></div>)}
            </div>
            <div className="pb"><Note tone="green">Every preset will get one look per blade. Nothing has been written to the saber yet.</Note></div>
          </Panel>
          <Panel label="What happens next">
            <PanelHead><h2>What happens next</h2></PanelHead>
            <div className="pb col" style={{ gap: 10 }} >
              <p className="dim small">Hiltwright writes a config from this description, builds firmware with one starter look, backs up the saber, and installs. About two minutes on a real machine.</p>
              <p className="hint">On Windows the bootloader driver comes first. That is step 5.</p>
            </div>
          </Panel>
        </div>
      )}

      {w.step === 5 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 400px', gap: 20 }}>
          <Panel tone={driver ? '' : 'amber'}>
            <PanelHead right={driver ? <Chip tone="ok" icon="check">Installed</Chip> : <Chip tone="warn">Not installed</Chip>}><h2>Bootloader driver</h2></PanelHead>
            <div className="pb col" style={{ gap: 14 }}>
              <p className="dim" style={{ fontSize: 13.5, textWrap: 'pretty' }}>To install firmware, Windows needs a driver for the board's bootloader, once. Hiltwright reboots the saber into bootloader mode and Windows asks for permission a single time.</p>
              {!driver && <div className="row"><Button variant="warn" icon="lock" onClick={() => { showToast('Windows asked for permission. Driver bound to STM32 BOOTLOADER (simulated).'); setDriver(true); }}>Install driver</Button><span className="hint">Only needed for Build &amp; Install. Presets and fonts already work.</span></div>}
              {driver && <Note tone="green">The bootloader now shows service WinUSB. No reboot needed. Press Finish to add the saber.</Note>}
            </div>
          </Panel>
          <Panel label="If it goes wrong">
            <PanelHead><h2>If the saber disappears</h2></PanelHead>
            <div className="pb"><Note tone="amber">Hold BOOT, tap RESET, release BOOT. The board comes back as a bootloader and the install can retry. Nothing about this is permanent.</Note></div>
          </Panel>
        </div>
      )}
    </>
  );
}
