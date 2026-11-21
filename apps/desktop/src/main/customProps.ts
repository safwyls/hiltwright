// Custom prop files: a ProffieOS prop header the owner loads in place of the stock ones. Its text is kept in the data
// folder under its SHA-256, so the saber's model only records the name and hash, and a build always uses exactly the
// version the owner chose. The build copies it into the saber's own ProffieOS copy (build.ts).

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { inspectPropText, type CustomProp } from '@hiltwright/core';

/** The Fett263 prop, the biggest stock one, is about 230 KB. */
export const MAX_PROP_BYTES = 2 * 1024 * 1024;

export const customPropsDir = (userData: string) => join(userData, 'custom-props');

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Check a prop file and keep a copy of it. Refused when it is not a ProffieOS prop header. */
export async function importPropFile(file: string, dir: string): Promise<CustomProp> {
  const name = basename(file);
  if (!/\.h$/i.test(name)) throw new Error('A prop file is a .h header file.');
  const size = (await stat(file)).size;
  if (size > MAX_PROP_BYTES) throw new Error(`${name} is ${Math.round(size / 1024)} KB, far bigger than a prop file should be.`);
  const data = await readFile(file);
  if (data.includes(0)) throw new Error(`${name} is not a text file.`);
  const text = data.toString('utf8');
  const { propType, like } = inspectPropText(text);
  if (!propType) throw new Error(`${name} has no "#define PROP_TYPE", so it is not a ProffieOS prop file.`);
  const hash = sha256(data);
  await mkdir(dir, { recursive: true });
  const kept = join(dir, `${hash}.h`);
  try { await stat(kept); } catch { await writeFile(`${kept}.part`, data); await rename(`${kept}.part`, kept); }
  console.log(`[props] kept ${name} (${propType}${like ? `, a version of ${like}` : ''}) as ${hash.slice(0, 12)}`);
  return { file: name, sha256: hash, propType, like };
}

/** The text of a custom prop the model names, checked against its hash. */
export async function readCustomProp(dir: string, cp: CustomProp): Promise<string> {
  if (!/^[0-9a-f]{64}$/.test(cp.sha256)) throw new Error('The custom prop file is not recorded properly. Choose it again on the Wiring page.');
  let data: Buffer;
  try { data = await readFile(join(dir, `${cp.sha256}.h`)); } catch {
    throw new Error(`The custom prop file ${cp.file} is not on this computer any more. Choose it again on the Wiring page.`);
  }
  if (sha256(data) !== cp.sha256) throw new Error(`The kept copy of the custom prop file ${cp.file} has changed. Choose the file again on the Wiring page.`);
  return data.toString('utf8');
}
