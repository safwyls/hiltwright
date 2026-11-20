// Where each file dialog last was, kept in <userData>/dialog-folders.json.
//
// Until Electron 43 the system remembered the last folder a dialog was in. Since then a dialog with no starting
// folder opens in Downloads every time, so the app remembers it instead: one folder per kind of dialog (adding font
// packages starts where font packages were last added, not where a logo was last picked). A missing or unreadable
// file, or a folder that is gone, means no starting folder: nothing here is worth stopping a dialog for.

import { existsSync, readFileSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export class DialogFolders {
  private folders: Record<string, string> = {};

  constructor(private readonly file: string) {
    try {
      const saved = (JSON.parse(readFileSync(file, 'utf8')) as { folders?: unknown }).folders;
      if (saved && typeof saved === 'object') {
        for (const [kind, folder] of Object.entries(saved)) if (typeof folder === 'string' && folder) this.folders[kind] = folder;
      }
    } catch { /* nothing saved yet */ }
  }

  /** The folder this kind of dialog should open in, or undefined when none is remembered or it no longer exists. */
  start(kind: string): string | undefined {
    const folder = this.folders[kind];
    return folder && existsSync(folder) ? folder : undefined;
  }

  /** Remembers the folder that holds what was picked (a file or a folder). A failed save is not an error. */
  async remember(kind: string, picked: string): Promise<void> {
    const folder = dirname(picked);
    if (!folder || this.folders[kind] === folder) return;
    this.folders[kind] = folder;
    try {
      await writeFile(`${this.file}.tmp`, JSON.stringify({ version: 1, folders: this.folders }, null, 2), 'utf8');
      await rename(`${this.file}.tmp`, this.file);
    } catch (err) {
      console.warn(`[dialogs] could not save the last folder: ${String(err)}`);
    }
  }
}
