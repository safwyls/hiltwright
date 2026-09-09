export default ({ shell, icon, btn, chip, meter, hilt }) => {
  const check = (label, detail, ok = true) => `
    <div class="li" style="gap:14px;min-height:46px">
      <span style="color:${ok ? 'var(--green)' : 'var(--amber)'};display:flex;width:18px">${ok ? icon.check : icon.warn}</span>
      <span class="col grow" style="gap:0"><span style="font-size:13.5px">${label}</span><span class="hint">${detail}</span></span>
    </div>`;

  const step = (n, label, sub, state) => {
    const color = state === 'done' ? 'var(--green)' : state === 'now' ? 'var(--holo)' : 'var(--line2)';
    const ic = state === 'done' ? icon.check : state === 'now' ? icon.spin : `<span class="mono" style="font-size:11px">${n}</span>`;
    return `
    <div class="col" style="gap:8px;flex:1;min-width:0">
      <div class="row" style="gap:8px">
        <span style="width:26px;height:26px;border:1px solid ${color};color:${color};display:flex;align-items:center;justify-content:center;flex:none;${state === 'now' ? 'box-shadow:0 0 10px rgba(95,211,255,.5)' : ''}"><span style="width:14px;height:14px;display:flex">${ic}</span></span>
        <span style="height:1px;flex:1;background:${state === 'done' ? 'var(--green)' : 'var(--line)'}"></span>
      </div>
      <div class="col" style="gap:1px">
        <span style="font-size:13px;font-weight:600;color:${state === 'todo' ? 'var(--mute)' : 'var(--text)'}">${label}</span>
        <span class="hint mono" style="font-size:11px">${sub}</span>
      </div>
    </div>`;
  };

  const bar = (label, kb, pct, color) => `
    <div class="row" style="gap:12px">
      <span style="width:170px;font-size:13px;color:var(--dim)">${label}</span>
      <div class="grow" style="height:8px;background:#1b2836"><div style="height:100%;width:${pct}%;background:${color}"></div></div>
      <span class="mono" style="width:64px;text-align:right;font-size:12px">${kb}</span>
    </div>`;

  const body = `
    <div class="row" style="justify-content:space-between;align-items:flex-end">
      <div>
        <div class="eyebrow">Build &amp; install</div>
        <h1>Install new firmware</h1>
        <p class="lead" style="margin-top:8px">Adding the Corruption look means a fresh build. Back up, build, write. About two minutes.</p>
      </div>
      <div class="row">${btn('Cancel', 'ghost')}${btn('Installing…', 'pri dis', icon.bolt)}</div>
    </div>

    <div style="display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:20px">
      <section class="panel amber" aria-label="Flash budget">
        <div class="ph"><h2>Flash budget · Proffieboard V2.2</h2>${chip('86% after this build', 'warn', icon.warn)}</div>
        <div class="pb col" style="gap:16px">
          <div class="row" style="align-items:baseline;gap:10px">
            <span class="mono" style="font-size:30px;letter-spacing:-.01em">219.6</span>
            <span class="mono dim" style="font-size:14px">of 256 KB</span>
            <span class="mono mute" style="font-size:12px;margin-left:auto">36.4 KB free after install</span>
          </div>
          ${meter(86)}
          <div class="col" style="gap:8px;padding-top:4px">
            ${bar('ProffieOS 8 + edit mode', '197.0 KB', 77, 'var(--holo-dim)')}
            ${bar('4 looks compiled in', '17.8 KB', 7, 'var(--holo)')}
            ${bar('Corruption (new)', '4.8 KB', 2, 'var(--amber)')}
          </div>
          <div class="note amber">${icon.warn}<span>Room for roughly 6 more looks on this board. Presets that reuse a look with different colours are free, so prefer those over new looks.</span></div>
        </div>
      </section>

      <section class="panel" aria-label="Pre-flight checks">
        <div class="ph"><h2>Pre-flight</h2>${chip('5 of 5', 'ok', icon.check)}</div>
        <div class="list">
          ${check('Every preset has a look for both blades', 'Fixed 3 minutes ago')}
          ${check('Button options work together', 'Fett263 · edit mode · gestures')}
          ${check('Wiring matches the V2.2 profile', 'bladePin, power pins 2 + 3 · crystal on pin 4')}
          ${check('Bootloader driver installed', 'Windows · WinUSB · checked just now')}
          ${check('Full backup taken', '256 KB flash + presets.ini · 12:04')}
        </div>
      </section>
    </div>

    <div style="display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:20px;flex:1;min-height:0">
      <section class="panel" aria-label="Install progress" aria-live="polite">
        <div class="ph"><h2>Installing</h2><span class="mono dim" style="font-size:12px">Step 2 of 6 · 00:41 elapsed</span></div>
        <div class="pb col" style="gap:16px">
          <div class="row" style="gap:12px;align-items:flex-start">
            ${step(1, 'Back up', '0.9 s', 'done')}
            ${step(2, 'Build firmware', 'compiling 5 looks…', 'now')}
            ${step(3, 'Reboot to bootloader', 'automatic', 'todo')}
            ${step(4, 'Write firmware', 'about 1 min', 'todo')}
            ${step(5, 'Verify', 'reads version', 'todo')}
            ${step(6, 'Restore presets', 'presets.ini', 'todo')}
          </div>
          <div class="col" style="gap:6px">
            <div class="row" style="justify-content:space-between;font-size:12.5px;color:var(--dim)"><span>Building hiltwright_graflex.h for Proffieboard V2.2</span><span class="mono">~ 20 s left</span></div>
            <div style="height:6px;background:#1b2836"><div style="height:100%;width:38%;background:var(--holo);box-shadow:0 0 10px var(--holo)"></div></div>
          </div>
          <div class="mono" style="font-size:12px;line-height:1.7;padding:12px 14px;background:#0b1016;border:1px solid var(--line);color:var(--dim)">
            <div><span class="mute">12:06:03</span>  generating config · 5 presets · 5 looks · 2 blades</div>
            <div><span class="mute">12:06:05</span>  compiling · Layers, TransitionEffectL, LockupTrL … <span class="holo">▌</span></div>
          </div>
          <div class="row" style="justify-content:space-between"><span class="hint">Keep the saber plugged in. Do not press its buttons.</span>${btn('Show full output', 'sm ghost')}</div>
        </div>
      </section>

      <section class="panel red" aria-label="Previous attempt">
        <div class="ph"><h2>Previous attempt · 12:02</h2>${chip('Fixed', 'ok', icon.check)}</div>
        <div class="pb col" style="gap:14px">
          <h3 style="color:var(--red)">Preset 4 “Crystal focus” needed a second look</h3>
          <p class="dim" style="font-size:13.5px;text-wrap:pretty">This saber has two blades, but that preset only had a look for the main blade. You added Crystal pulse for the crystal chamber, so the build now passes.</p>
          <div class="row">${btn('Open preset', 'sm')}${btn('Compiler output', 'sm ghost')}</div>
          <div class="note amber" style="margin-top:6px">${icon.warn}<span>If the saber ever fails to show up after a reboot: hold BOOT, tap RESET, release BOOT, then press Retry. Your backup from 12:04 can be restored at any time.</span></div>
        </div>
      </section>
    </div>`;

  const status = '<span><b>Board</b> Proffieboard V2.2 · 256 KB</span><span><b>Building</b> hiltwright_graflex.h · OS 8.10 · V2 · cdc_msc_webusb</span><span style="margin-left:auto"><b>Backup</b> 12:04 · restorable</span>';
  const conn = `${chip('Connected · COM7', 'live')}${chip('3.92 V · 78%', '', icon.battery)}${btn('Back up', 'sm dis', icon.shield)}`;
  return shell({ title: 'Hiltwright · Build & Install', active: 'build', body, status, conn });
};
