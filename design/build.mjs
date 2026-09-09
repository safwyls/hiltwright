// Assembles the Hiltwright mockup artboards (.dc.html) from screens/*.mjs and lib/shell.mjs.
// Run: node design/build.mjs   (writes into design/)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shell, icon, btn, chip, meter, hilt, crystal, lens, spinner, FONTS, CSS } from './lib/shell.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ctx = { shell, icon, btn, chip, meter, hilt, crystal, lens, spinner, FONTS, CSS };

const screens = {
  Main: 'armory',
  Presets: 'presets',
  Looks: 'looks',
  Build: 'build',
  Fonts: 'fonts',
  Setup: 'setup',
  System: 'system',
};

for (const [name, mod] of Object.entries(screens)) {
  const render = (await import(`./screens/${mod}.mjs`)).default;
  const html = render(ctx);
  writeFileSync(join(here, `${name}.dc.html`), html);
  console.log(`${name}.dc.html  ${(html.length / 1024).toFixed(1)} KB`);
}
