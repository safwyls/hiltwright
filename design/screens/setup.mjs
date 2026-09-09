export default ({ shell, icon, btn, chip, hilt, crystal, lens, spinner }) => {
  const stepTab = (n, label, state) => {
    const color = state === 'done' ? 'var(--green)' : state === 'now' ? 'var(--holo)' : 'var(--mute)';
    const ic = state === 'done' ? `<span style="width:14px;height:14px;display:flex">${icon.check}</span>` : `<span class="mono" style="font-size:11px">${n}</span>`;
    return `<div class="row" style="gap:10px;padding:0 4px;${state === 'now' ? 'border-bottom:2px solid var(--holo);' : 'border-bottom:2px solid transparent;'}height:44px" ${state === 'now' ? 'aria-current="step"' : ''}>
      <span style="width:24px;height:24px;border:1px solid ${color};color:${color};display:flex;align-items:center;justify-content:center">${ic}</span>
      <span style="font-size:13px;font-weight:600;color:${state === 'todo' ? 'var(--mute)' : 'var(--text)'}">${label}</span>
    </div>`;
  };

  const f = (label, val, caret = true) => `<label class="field"><span class="label">${label}</span><span class="input">${val}${caret ? `<span class="caret">${icon.down}</span>` : ''}</span></label>`;

  // Collapsed blade card: one line, click to open.
  const closed = (n, glyph, role, summary) => `
    <button class="bcard sum" aria-expanded="false">
      <span class="mono mute" style="font-size:11px;width:16px">${n}</span>
      <span class="g">${glyph}</span>
      <span style="font-weight:600;font-size:13.5px;width:150px;flex:none">${role}</span>
      <span class="dim grow" style="font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${summary}</span>
      <span style="color:var(--green);display:flex;width:16px;flex:none">${icon.check}</span>
      <span class="mute" style="display:flex;width:16px;flex:none">${icon.down}</span>
    </button>`;

  const segRole = (label, ic, on = false) => `<span class="${on ? 'on' : ''}">${ic}${label}</span>`;

  const body = `
    <div class="row" style="justify-content:space-between;align-items:flex-end">
      <div>
        <div class="eyebrow">Hardware setup · step 2 of 5</div>
        <h1>What lights up?</h1>
      </div>
      <div class="row">${btn('Back', '')}${btn('Continue', 'pri', icon.chev)}</div>
    </div>

    <div class="row" style="gap:28px;border-bottom:1px solid var(--line)">
      ${stepTab(1, 'Board', 'done')}${stepTab(2, 'Blades', 'now')}${stepTab(3, 'Buttons', 'todo')}${stepTab(4, 'Check', 'todo')}${stepTab(5, 'Windows driver', 'todo')}
    </div>

    <div style="display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:20px;flex:1;min-height:0">
      <section class="col" style="gap:10px;min-height:0">

        <div class="row" style="gap:18px;padding:0 0 2px">
          <div class="row" style="gap:0" role="group" aria-label="Number of blades">
            <button class="input" style="width:38px;justify-content:center;padding:0" aria-label="Fewer blades">${icon.minus}</button>
            <span class="input mono" style="width:56px;justify-content:center;font-size:16px;border-left:0;border-right:0">4</span>
            <button class="input" style="width:38px;justify-content:center;padding:0" aria-label="More blades">${icon.plus}</button>
          </div>
          <div class="col" style="gap:1px">
            <b style="font-weight:600">Blades</b>
            <span class="hint">Count every light or motor the saber controls separately: main blade, crystal chamber, accents, side blades, spinner.</span>
          </div>
        </div>

        ${closed(1, icon.blade, 'Main blade', '132 px pixel strip · WS2812B · own data line on bladePin · power LED 2 + 3')}

        <div class="bcard open col" style="gap:0" aria-expanded="true">
          <div class="sum" style="border-bottom:1px solid var(--line)">
            <span class="mono mute" style="font-size:11px;width:16px">2</span>
            <span class="g">${icon.crystal}</span>
            <span style="font-weight:600;font-size:13.5px">Crystal chamber</span>
            <span class="hint grow">6 px pixel strip · continues Blade 1's wire</span>
            ${btn('Remove', 'sm ghost')}
          </div>
          <div class="col" style="padding:12px 16px 14px;gap:12px">
            <div class="row" style="gap:16px;flex-wrap:wrap">
              <div class="col" style="gap:6px">
                <span class="label">What is it</span>
                <div class="seg" role="radiogroup" aria-label="Role">
                  ${segRole('Main blade', icon.blade)}${segRole('Crystal chamber', icon.crystal, true)}${segRole('Accent', icon.led)}${segRole('Side blade', icon.side)}${segRole('Motor', icon.motor)}
                </div>
              </div>
              <div class="col" style="gap:6px">
                <span class="label">Built from</span>
                <div class="seg" role="radiogroup" aria-label="Type">
                  ${segRole('Pixel strip', icon.strip, true)}${segRole('Star LED', icon.led)}${segRole('Single LED', icon.led)}${segRole('Motor', icon.motor)}
                </div>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">
              ${f('Pixels', '6', false)}${f('LED chip', 'WS2812B')}${f('Colour order', 'GRB')}
            </div>

            <div class="col" style="gap:8px">
              <div class="row" style="justify-content:space-between"><span class="label">Wiring</span><a href="#" style="font-size:12px;font-weight:600;text-decoration:none">Advanced: reversed or interleaved</a></div>
              <div class="row" style="gap:12px;align-items:stretch">
                <div class="opt" role="radio" aria-checked="false" tabindex="0">
                  <span class="radio"></span>
                  <span class="col" style="gap:2px"><b style="font-weight:600;font-size:13px">Own data line</b><span class="hint">Its own wire and its own power pins.</span></span>
                </div>
                <div class="opt on" role="radio" aria-checked="true" tabindex="0">
                  <span class="radio"></span>
                  <span class="col" style="gap:2px"><b style="font-weight:600;font-size:13px">Continues Blade 1's wire</b><span class="hint">Same strip after Blade 1: pixels <span class="mono">132–137</span>, shares power LED 2 + 3.</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        ${closed(3, icon.led, 'Accent', 'Single white LED · power LED 5')}
        ${closed(4, icon.motor, 'Motor', 'Crystal chamber spinner · power LED 6')}

      </section>

      <aside class="col" style="gap:16px;min-height:0">
        <section class="panel" aria-label="Saber diagram">
          <div class="ph"><h2>Your saber so far</h2>${chip('4 blades', 'live')}</div>
          <div class="pb col" style="gap:10px;padding:14px 18px">
            <div class="row" style="gap:0;padding:4px 0">${hilt('#ff3d3d')}<div class="blade grow" style="--c:#3d7bff"></div></div>
            <div class="list" style="border:1px solid var(--line)">
              <div class="li" style="min-height:36px;gap:12px"><span class="mono mute" style="font-size:11px;width:12px">1</span><span style="width:26px;display:flex;justify-content:center"><span class="blade" style="--c:#3d7bff;width:22px;height:6px;border-radius:0 3px 3px 0"></span></span><span class="grow" style="font-size:13px">Main blade</span><span class="mono mute" style="font-size:11px">132 px</span></div>
              <div class="li" style="min-height:36px;gap:12px"><span class="mono mute" style="font-size:11px;width:12px">2</span><span style="width:26px;display:flex;justify-content:center">${crystal('#ff3d3d', 22)}</span><span class="grow" style="font-size:13px">Crystal chamber</span><span class="mono mute" style="font-size:11px">6 px · in sequence</span></div>
              <div class="li" style="min-height:36px;gap:12px"><span class="mono mute" style="font-size:11px;width:12px">3</span><span style="width:26px;display:flex;justify-content:center">${lens('#ffffff', 14)}</span><span class="grow" style="font-size:13px">Accent</span><span class="mono mute" style="font-size:11px">white LED</span></div>
              <div class="li" style="min-height:36px;gap:12px"><span class="mono mute" style="font-size:11px;width:12px">4</span><span style="width:26px;display:flex;justify-content:center">${spinner(20)}</span><span class="grow" style="font-size:13px">Motor</span><span class="mono mute" style="font-size:11px">spinner</span></div>
            </div>
          </div>
        </section>

        <section class="panel" aria-label="Pins on the board">
          <div class="ph"><h2>Pins · V2.2</h2>${chip('No conflicts', 'ok', icon.check)}</div>
          <div class="pb col" style="gap:0;padding-top:8px;padding-bottom:10px">
            <div class="pin"><span class="k">bladePin</span><span class="v">Blade 1, then Blade 2</span></div>
            <div class="pin"><span class="k">blade2Pin</span><span class="free">free</span></div>
            <div class="pin"><span class="k">blade3Pin</span><span class="free">free</span></div>
            <div style="height:1px;background:var(--line);margin:6px 0"></div>
            <div class="pin"><span class="k">LED 1</span><span class="free">free</span></div>
            <div class="pin"><span class="k">LED 2 + 3</span><span class="v">Blades 1 and 2</span></div>
            <div class="pin"><span class="k">LED 4</span><span class="free">free</span></div>
            <div class="pin"><span class="k">LED 5</span><span class="v">Blade 3 · accent</span></div>
            <div class="pin"><span class="k">LED 6</span><span class="v">Blade 4 · motor</span></div>
          </div>
        </section>

        <section class="panel amber" aria-label="Wiring is identity" style="margin-top:auto">
          <div class="pb row" style="gap:12px;align-items:flex-start">
            <span style="display:flex;width:18px;color:var(--amber);flex:none;margin-top:2px">${icon.lock}</span>
            <p class="dim" style="font-size:12.5px;text-wrap:pretty">Read-only after setup. Every change asks you to confirm, because wrong power pins can damage hardware.</p>
          </div>
        </section>
      </aside>
    </div>`;

  const status = '<span><b>Board</b> Proffieboard V2.2 · 256 KB</span><span><b>Firmware</b> ProffieOS 4.7 · vendor build</span><span><b>Wizard</b> nothing written yet</span><span style="margin-left:auto"><b>Backup</b> none yet</span>';
  const conn = `${chip('Connected · COM7', 'live')}${chip('4.05 V · 92%', '', icon.battery)}${btn('Back up', 'sm', icon.shield)}`;
  return shell({ title: 'Hiltwright · Hardware setup', active: 'armory', body, status, conn, saber: 'New saber', board: 'Proffieboard V2.2' });
};
