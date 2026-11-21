// What the pages are given as "the board" while the guided tour runs: the example saber (tourSaber.ts), plugged in,
// through the same shape as the real session (board.ts), so every page shows it the way it shows a real one. Nothing
// it is asked to do reaches a saber or the owner's data: a question the example saber has an answer for is answered here,
// and every send and write is refused with a plain message. The real session is only read, for the owner's saber list.

import type { Board } from './board';
import type { SaveState } from './boardOps';
import { EXAMPLE_ANSWERS, EXAMPLE_INFO, EXAMPLE_SABER } from './tourSaber';
import { TOUR_REFUSAL } from './tourLock';

const refused = (what: string) => { console.log(`[tour] not done: ${what}`); return TOUR_REFUSAL; };
const reject = (what: string) => Promise.reject(new Error(refused(what)));
const no = (what: string) => { refused(what); return Promise.resolve(false); };

/**
 * The stand-in board. `real` supplies only the owner's saber library (read) and its refresh (a read). `onRefused` is
 * told the plain message each time a page asks for something that is not done during the tour.
 */
export function tourBoard(real: Pick<Board, 'library' | 'refreshLibrary' | 'isPresetBlockEnd'>, onRefused: (save: SaveState) => void = () => {}): Board {
  const saber = EXAMPLE_SABER;
  const info = EXAMPLE_INFO;
  const op = (what: string) => { onRefused({ kind: 'failed', what, error: TOUR_REFUSAL }); return no(what); };
  return {
    card: { shared: false, root: null },
    cardShared: () => { refused('card shared'); },
    cardGivenBack: () => { refused('card given back'); },
    cardLostWhileShared: false,
    status: 'connected',
    error: null,
    portName: 'Example',
    info,
    saber,
    // The owner's own sabers stay listed (read only), with the example first so the Armory shows it as the one worked on.
    library: [saber, ...real.library.filter((s) => s.id !== saber.id)],
    libraryLoaded: true,
    lines: [],
    snapshots: [],
    save: { kind: 'idle' },
    busy: false,
    connect: async () => { refused('connect'); },
    disconnect: async () => { refused('disconnect'); },
    // A question the example saber has an answer for is answered here; nothing is sent anywhere. All else is refused.
    send: (command: string) => {
      const lines = EXAMPLE_ANSWERS[command.trim()];
      return lines ? Promise.resolve({ command, lines: [...lines], events: [], ms: 1, timedOut: false, tagged: false, silent: false }) : reject(`send ${command}`);
    },
    identify: async () => { refused('read the saber again'); return info; },
    choosePreset: (i: number) => op(`select preset ${i + 1}`),
    editPreset: (_patch, label: string) => op(label),
    setPresetStyles: (_i, _styles, label: string) => op(label),
    movePreset: () => op('move preset'),
    duplicatePreset: () => op('duplicate preset'),
    deletePreset: () => op('delete preset'),
    readSnapshot: async () => [],
    restoreSnapshot: () => op('restore'),
    renameSaber: () => reject('rename the saber'),
    updateSaber: () => reject('save the saber'),
    expectAfterInstall: () => { refused('expect after install'); },
    reachNext: () => no('reach a board'),
    currentSaber: () => saber,
    restartSaber: () => no('restart the saber'),
    currentPresets: () => info.presets,
    planSaber: () => reject('plan a saber'),
    adoptPlan: () => reject('adopt a plan'),
    currentPresetNow: () => info.presets[info.currentPreset ?? 0] ?? null,
    refreshLibrary: () => real.refreshLibrary(),
    isPresetBlockEnd: real.isPresetBlockEnd,
    rebootToBootloader: () => no('reboot to the bootloader'),
  };
}
