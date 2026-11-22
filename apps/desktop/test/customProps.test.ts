import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importPropFile, importPropText, readCustomProp } from '../src/main/customProps';

const tmp = (p: string) => mkdtemp(join(tmpdir(), p));
const PROP = '#ifndef PROPS_MY_BUTTONS_H\n#define PROPS_MY_BUTTONS_H\n#include "prop_base.h"\nclass MyButtons : public PropBase {};\n#endif\n#ifdef PROP_TYPE\n#undef PROP_TYPE\n#endif\n#define PROP_TYPE MyButtons\n';

describe('custom prop files', () => {
  it('a prop header is checked, kept under its hash, and read back exactly', async () => {
    const src = await tmp('hw-propsrc-'); const dir = await tmp('hw-props-');
    await writeFile(join(src, 'my_buttons.h'), PROP);
    const cp = await importPropFile(join(src, 'my_buttons.h'), dir);
    expect(cp).toMatchObject({ file: 'my_buttons.h', propType: 'MyButtons', like: null });
    expect(await readdir(dir)).toEqual([`${cp.sha256}.h`]);
    expect(await readCustomProp(dir, cp)).toBe(PROP);
    // The same file again keeps one copy.
    await importPropFile(join(src, 'my_buttons.h'), dir);
    expect(await readdir(dir)).toHaveLength(1);
  });

  it('a version of a stock prop is known as one', async () => {
    const src = await tmp('hw-propsrc-'); const dir = await tmp('hw-props-');
    await writeFile(join(src, 'fett.h'), '// newer Fett263\n#define PROP_TYPE SaberFett263Buttons\n');
    expect((await importPropFile(join(src, 'fett.h'), dir)).like).toBe('fett263');
  });

  it('refuses what is not a prop header: another extension, no PROP_TYPE, or binary', async () => {
    const src = await tmp('hw-propsrc-'); const dir = await tmp('hw-props-');
    await writeFile(join(src, 'prop.txt'), PROP);
    await writeFile(join(src, 'config.h'), '#define NUM_BLADES 1\n');
    await writeFile(join(src, 'blob.h'), Buffer.from([0x23, 0x00, 0x01]));
    await expect(importPropFile(join(src, 'prop.txt'), dir)).rejects.toThrow(/\.h header/);
    await expect(importPropFile(join(src, 'config.h'), dir)).rejects.toThrow(/no "#define PROP_TYPE"/);
    await expect(importPropFile(join(src, 'blob.h'), dir)).rejects.toThrow(/not a text file/);
    expect(await readdir(dir)).toEqual([]);
  });

  it('a kept copy that is gone or changed is never built with', async () => {
    const src = await tmp('hw-propsrc-'); const dir = await tmp('hw-props-');
    await writeFile(join(src, 'my_buttons.h'), PROP);
    const cp = await importPropFile(join(src, 'my_buttons.h'), dir);
    await expect(readCustomProp(await tmp('hw-empty-'), cp)).rejects.toThrow(/not on this computer any more/);
    await writeFile(join(dir, `${cp.sha256}.h`), `${await readFile(join(dir, `${cp.sha256}.h`), 'utf8')}// edited\n`);
    await expect(readCustomProp(dir, cp)).rejects.toThrow(/has changed/);
  });

  it('a prop that came inside a shared saber is kept as a chosen file is, under the same hash', async () => {
    const src = await tmp('hw-propsrc-'); const dir = await tmp('hw-props-');
    await writeFile(join(src, 'my_buttons.h'), PROP);
    const chosen = await importPropFile(join(src, 'my_buttons.h'), await tmp('hw-props-'));
    const shared = await importPropText('C:\\Users\\sender\\props\\my_buttons.h', PROP, dir);
    expect(shared).toEqual(chosen);
    expect(await readCustomProp(dir, shared)).toBe(PROP);
    await expect(importPropText('config.h', '#define NUM_BLADES 1\n', dir)).rejects.toThrow(/no "#define PROP_TYPE"/);
    await expect(importPropText('blob.h', '#define PROP_TYPE X\u0000', dir)).rejects.toThrow(/not a text file/);
  });
});
