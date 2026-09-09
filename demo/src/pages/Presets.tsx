import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useActiveSaber, useSelectedPreset, useStore } from '../store';
import { COLOR_LABELS, ROLE_META, SMALL_LOOKS, isMainLike, type Blade, type ColorKey, type Preset } from '../model';
import { FONT_CHOICES, TRACK_CHOICES } from '../data';
import { Icon } from '../components/Icon';
import { Button, Chip, Field, NumberInput, Panel, PanelHead, Select, Slider, Swatch, TextInput, Toggle } from '../components/ui';
import { BladeBar, BladeGlyph, Crystal, Hilt, Lens, Spinner, type Fx } from '../components/saber';

function SortableRow({ preset, index, count, selected, onSelect, onMove, announce }: { preset: Preset; index: number; count: number; selected: boolean; onSelect: () => void; onMove: (d: number) => void; announce: (t: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: preset.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, cursor: 'pointer' };
  return (
    <div
      ref={setNodeRef} style={style} className={`li click ${selected ? 'on' : ''}`} role="option" aria-selected={selected} tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          const d = e.key === 'ArrowUp' ? -1 : 1;
          if (index + d < 0 || index + d >= count) return;
          onMove(d);
          announce(`${preset.name} moved to position ${index + d + 1} of ${count}`);
        } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); }
      }}
    >
      <span className="grip" {...attributes} {...listeners} aria-label={`Drag to reorder ${preset.name}`} tabIndex={-1}><Icon name="grip" /></span>
      <span className="n">{index + 1}</span>
      <span className="col grow" style={{ gap: 0 }}><span style={{ fontWeight: 600, fontSize: 13.5 }} className="ellip">{preset.name}</span><span className="hint ellip">{preset.font}</span></span>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: preset.colors.base, boxShadow: `0 0 8px ${preset.colors.base}`, flex: 'none' }} />
    </div>
  );
}

function SavedChip() {
  const savedAt = useStore((s) => s.savedAt);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  return <Chip tone="ok" icon="check">Saved to saber {s < 2 ? 'just now' : `${s} s ago`}</Chip>;
}

export function Presets() {
  const saber = useActiveSaber();
  const preset = useSelectedPreset();
  const looks = useStore((s) => s.looks);
  const connectedId = useStore((s) => s.connectedId);
  const { selectPreset, updatePreset, reorderPresets, addPreset, duplicatePreset, deletePreset, undo, restoreSnapshot } = useStore();
  const snapshots = useStore((s) => s.snapshots);
  const [live, setLive] = useState('');
  const [fx, setFx] = useState<Fx>('on');
  const [volume, setVolume] = useState(70);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connected = saber.id === connectedId;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = saber.presets.findIndex((p) => p.id === e.active.id);
    const to = saber.presets.findIndex((p) => p.id === e.over!.id);
    reorderPresets(from, to);
  };

  const pulse = (state: Fx, ms: number) => {
    if (fx === 'off') return;
    setFx(state);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFx('on'), ms);
  };
  const effects: { label: string; run: () => void }[] = [
    { label: 'Ignite', run: () => setFx('on') },
    { label: 'Clash', run: () => pulse('clash', 220) },
    { label: 'Blast', run: () => pulse('blast', 360) },
    { label: fx === 'lockup' ? 'Release' : 'Lockup', run: () => (fx === 'lockup' ? setFx('on') : fx !== 'off' && setFx('lockup')) },
    { label: 'Force', run: () => pulse('blast', 600) },
    { label: 'Retract', run: () => setFx('off') },
  ];

  const mainLook = looks.find((l) => l.id === preset.looks[saber.blades.find((b) => b.role === 'main')?.id ?? '']);
  const crystalBlade = saber.blades.find((b) => b.role === 'crystal');
  const motorBlade = saber.blades.find((b) => b.role === 'motor');
  const accentBlade = saber.blades.find((b) => b.role === 'accent');
  const on = fx !== 'off';
  const patch = (p: Partial<Preset>, label?: string) => updatePreset(preset.id, p, label);
  const setColor = (k: ColorKey, v: string) => patch({ colors: { ...preset.colors, [k]: v } }, `${COLOR_LABELS[k].label} changed`);

  const lookOptions = (b: Blade) => {
    if (isMainLike(b.role)) {
      return [
        ...saber.compiled.map((id) => ({ value: id, label: looks.find((l) => l.id === id)?.name ?? id })),
        ...saber.pending.map((id) => ({ value: id, label: `${looks.find((l) => l.id === id)?.name ?? id} (needs build)` })),
      ];
    }
    const list = b.role === 'motor' ? SMALL_LOOKS.motor : SMALL_LOOKS.light;
    return list.map((l) => ({ value: l.id, label: l.label }));
  };

  const spinning = !!motorBlade && on && (preset.looks[motorBlade.id] === 'spinOn' || (preset.looks[motorBlade.id] === 'spinClash' && fx === 'clash'));
  const accentLook = accentBlade ? preset.looks[accentBlade.id] : 'off';
  const accentLit = !!accentBlade && accentLook !== 'off' && (accentLook === 'pulseClash' ? fx === 'clash' || fx === 'lockup' : on || accentLook === 'battery');

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Presets · live on the saber</div><h1>{saber.name}</h1></div>
        <div className="row">
          {connected ? <SavedChip /> : <Chip tone="warn" icon="warn">Not connected · edits are kept for the next sync</Chip>}
          <Button size="sm" icon="undo" onClick={undo} disabled={snapshots.length === 0}>Undo</Button>
        </div>
      </div>
      <span className="sr" aria-live="polite">{live}</span>

      <div style={{ display: 'grid', gridTemplateColumns: '250px minmax(0,1fr) 300px', gap: 20, flex: 1, minHeight: 0 }}>
        <Panel label="Preset list" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <PanelHead right={<Button size="sm" icon="plus" onClick={addPreset}>Add</Button>}><h2>Presets · {saber.presets.length}</h2></PanelHead>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={saber.presets.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <div className="list" role="listbox" aria-label="Presets. Drag, or press Alt with the arrow keys, to reorder." style={{ overflow: 'auto' }}>
                {saber.presets.map((p, i) => (
                  <SortableRow key={p.id} preset={p} index={i} count={saber.presets.length} selected={p.id === preset.id} onSelect={() => selectPreset(p.id)} onMove={(d) => reorderPresets(i, i + d)} announce={setLive} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <div className="hint" style={{ marginTop: 'auto', padding: '14px 18px', borderTop: '1px solid var(--line)' }}>Order is saved to the saber as you drag. Press <span className="kbd">Alt</span> + <span className="kbd">↑</span> <span className="kbd">↓</span> to reorder with the keyboard.</div>
        </Panel>

        <Panel label="Preset editor" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <PanelHead right={<div className="row" style={{ gap: 4 }}><Button size="sm" variant="ghost" icon="copy" onClick={() => duplicatePreset(preset.id)} title="Duplicate preset" aria-label="Duplicate preset">Copy</Button><Button size="sm" variant="ghost" icon="trash" onClick={() => deletePreset(preset.id)} disabled={saber.presets.length <= 1} title="Delete preset" aria-label="Delete preset">Delete</Button></div>}>
            <h2 className="ellip" style={{ maxWidth: 180 }}>{preset.name}</h2>
            {saber.pending.some((id) => Object.values(preset.looks).includes(id))
              ? <Chip tone="warn" icon="warn">Needs a build</Chip>
              : <Chip tone="ok" icon="check">No build needed</Chip>}
          </PanelHead>
          <div className="pb col" style={{ gap: 16, overflow: 'auto' }}>
            <div className="grid2">
              <Field label="Name"><TextInput value={preset.name} onChange={(v) => patch({ name: v }, 'Renamed')} sans ariaLabel="Preset name" /></Field>
              <Field label="Sound font"><Select sans icon="fonts" value={preset.font} onChange={(v) => patch({ font: v }, 'Font changed')} options={FONT_CHOICES.map((f) => ({ value: f, label: f }))} ariaLabel="Sound font" tag={<span className="mute">+ common</span>} /></Field>
              <Field label="Track"><Select value={preset.track} onChange={(v) => patch({ track: v }, 'Track changed')} options={TRACK_CHOICES.map((t) => ({ value: t, label: t || 'No track' }))} ariaLabel="Track" /></Field>
              <Field label="Variation"><NumberInput value={preset.variation} min={0} max={32767} onChange={(v) => patch({ variation: v }, 'Variation changed')} ariaLabel="Variation" /></Field>
            </div>

            <div className="col" style={{ gap: 6 }}>
              <div className="row between"><h2 className="nowrap" style={{ fontSize: 10.5, color: 'var(--dim)' }}>Look per blade</h2><span className="hint">Small blades usually follow the main one.</span></div>
              {saber.blades.map((b, i) => (
                <div key={b.id} className="row" style={{ gap: 12, minHeight: 40, paddingLeft: 2 }}>
                  <span className="mono mute" style={{ fontSize: 11, width: 12 }}>{i + 1}</span>
                  <span style={{ width: 26, display: 'flex', justifyContent: 'center', flex: 'none' }}><BladeGlyph blade={b} color={b.role === 'crystal' ? preset.crystalColor : preset.colors.base} lit={on && preset.looks[b.id] !== 'off'} spinning={b.role === 'motor' && spinning} /></span>
                  <span className="col" style={{ gap: 0, width: 132, flex: 'none' }}><span style={{ fontSize: 13, fontWeight: 600 }}>{ROLE_META[b.role].label}</span><span className="hint" style={{ fontSize: 11.5 }}>{b.type === 'pixel' ? `${b.pixels} px` : b.type === 'motor' ? 'spinner' : b.type === 'star' ? 'star LED' : 'single LED'}</span></span>
                  <Select sans icon={isMainLike(b.role) ? 'looks' : preset.looks[b.id] === 'follow' ? 'link' : undefined} value={preset.looks[b.id] ?? 'off'} onChange={(v) => patch({ looks: { ...preset.looks, [b.id]: v } }, `${ROLE_META[b.role].label} look changed`)} options={lookOptions(b)} ariaLabel={`Look for ${ROLE_META[b.role].label}`} tag={<span className="mono mute" style={{ fontSize: 11 }}>builtin {saber.presets.indexOf(preset)} {i + 1}</span>} />
                </div>
              ))}
            </div>

            <div className="col" style={{ gap: 8 }}>
              <div className="row between"><h2 style={{ fontSize: 10.5, color: 'var(--dim)' }}>Colours</h2><span className="hint">Exposed by these looks. Click to change.</span></div>
              <div className="grid3" style={{ gap: 8 }}>
                {(mainLook?.args ?? (['base'] as ColorKey[])).map((k) => (
                  <Swatch key={k} label={COLOR_LABELS[k].label} color={preset.colors[k]} arg={`arg ${COLOR_LABELS[k].arg}`} onChange={(v) => setColor(k, v)} />
                ))}
                {crystalBlade && (preset.crystalLinked
                  ? <Swatch label="Crystal" color={preset.crystalColor} linkedTo="Base" onUnlink={() => patch({ crystalLinked: false }, 'Crystal colour unlinked')} />
                  : <Swatch label="Crystal" color={preset.crystalColor} arg="blade 2" onChange={(v) => patch({ crystalColor: v }, 'Crystal colour changed')} />)}
              </div>
              {crystalBlade && !preset.crystalLinked && <button type="button" className="hint holo" style={{ textAlign: 'left', fontWeight: 600 }} onClick={() => patch({ crystalLinked: true }, 'Crystal colour linked')}>Link the crystal back to the base colour</button>}
            </div>

            <div className="grid3" style={{ gap: 16 }}>
              <Field label="Ignition" right={<span className="mono dim" style={{ fontSize: 12 }}>{preset.ignition} ms</span>}><Slider value={preset.ignition} min={100} max={1000} step={10} onChange={(v) => patch({ ignition: v }, 'Ignition time changed')} ariaLabel="Ignition time" /></Field>
              <Field label="Retraction" right={<span className="mono dim" style={{ fontSize: 12 }}>{preset.retraction} ms</span>}><Slider value={preset.retraction} min={100} max={1000} step={10} onChange={(v) => patch({ retraction: v }, 'Retraction time changed')} ariaLabel="Retraction time" /></Field>
              <Field label="Swing sound"><Select sans value={preset.swing} onChange={(v) => patch({ swing: v }, 'Swing sound changed')} options={['Smooth swing', 'Accent swing', 'Classic swing'].map((s) => ({ value: s, label: s }))} ariaLabel="Swing sound" /></Field>
            </div>
          </div>
        </Panel>

        <Panel label="Live preview" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <PanelHead right={<Toggle on={connected} onChange={() => {}} label="Mirror on saber" />}><h2>Live preview</h2></PanelHead>
          <div className="pb col" style={{ gap: 16, overflow: 'auto' }}>
            <div className="row" style={{ gap: 0, padding: '10px 0 2px' }}><Hilt crystal={crystalBlade ? preset.crystalColor : null} /><BladeBar color={fx === 'lockup' ? preset.colors.lockup : preset.colors.base} fx={fx} ms={fx === 'off' ? preset.retraction : preset.ignition} /></div>
            <div className="grid3" style={{ gap: 8 }}>
              <div className="col" style={{ alignItems: 'center', gap: 8, padding: '12px 6px', border: '1px solid var(--line)', background: '#0b1016' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52 }}>
                  {crystalBlade ? <Crystal color={preset.crystalColor} h={40} lit={on && preset.looks[crystalBlade.id] !== 'off'} /> : <span className="mute small">none</span>}
                  {motorBlade && <span style={{ position: 'absolute', inset: -2, opacity: 0.7 }}><Spinner d={56} on={spinning} /></span>}
                </div>
                <span className="hint" style={{ fontSize: 11, textAlign: 'center' }}>Crystal{motorBlade ? (spinning ? ' · spinning' : ' · still') : ''}</span>
              </div>
              <div className="col" style={{ alignItems: 'center', gap: 8, padding: '12px 6px', border: '1px solid var(--line)', background: '#0b1016' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52 }}>{accentBlade ? <Lens color="#ffffff" d={18} lit={accentLit} pulse={accentLit && accentLook === 'pulse'} /> : <span className="mute small">none</span>}</div>
                <span className="hint" style={{ fontSize: 11, textAlign: 'center' }}>Accent · {accentLit ? 'lit' : 'idle'}</span>
              </div>
              <div className="col" style={{ alignItems: 'center', gap: 8, padding: '12px 6px', border: '1px solid var(--line)', background: '#0b1016' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 52, height: 52 }}><span className="mono" style={{ fontSize: 16, color: 'var(--holo)' }}>3.92</span></div>
                <span className="hint" style={{ fontSize: 11, textAlign: 'center' }}>Battery · 78%</span>
              </div>
            </div>
            <div className="grid3" style={{ gap: 8 }}>
              {effects.map((e) => <Button key={e.label} size="sm" onClick={e.run} full>{e.label}</Button>)}
            </div>
            <Field label="Volume" right={<span className="mono dim" style={{ fontSize: 12 }}>{volume}%</span>}><Slider value={volume} min={0} max={100} onChange={setVolume} ariaLabel="Volume" /></Field>
            <div className="col" style={{ gap: 8 }}>
              <div className="row between"><h2 style={{ fontSize: 10.5, color: 'var(--dim)' }}>Snapshots</h2><span className="hint">presets.ini before each change</span></div>
              <div className="list" style={{ border: '1px solid var(--line)' }}>
                {snapshots.length === 0 && <div className="li hint" style={{ minHeight: 36 }}>No changes yet</div>}
                {snapshots.slice(0, 5).map((s, i) => (
                  <div key={i} className="li" style={{ minHeight: 36, gap: 8 }}>
                    <span className="mono" style={{ fontSize: 12 }}>{s.time}</span>
                    <span className="grow dim ellip" style={{ fontSize: 12.5 }}>{s.label}</span>
                    <button type="button" className="holo" style={{ fontSize: 11.5, fontWeight: 600 }} onClick={() => restoreSnapshot(i)}>Restore</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
