// Print captured compiler output for failed spike builds, with build paths stripped.
import { readFileSync } from "node:fs";
const r = JSON.parse(readFileSync(new URL("./results.json", import.meta.url), "utf8"));
const wanted = process.argv.slice(2);
for (const [k, v] of Object.entries(r.compiles)) {
  if (wanted.length && !wanted.includes(k)) continue;
  if (v.ok) continue;
  let e = v.compilerErrHead || (v.errorExcerpt || []).join("\n") || "(none)";
  e = e.replaceAll(/[A-Z]:\\[^\n]*?\\builds\\[^\\]+\\ProffieOS\\/g, "");
  console.log(`===== ${k} (${(v.ms / 1000).toFixed(1)} s)`);
  console.log(e.slice(0, 2400));
}
