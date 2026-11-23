// The pages take the app's saber state (the board and the working saber). On the website there is never a saber:
// these are that state with nothing in it, so each page shows what it shows before any saber is known.

import type { Board } from '../src/board';
import type { Workspace } from '../src/workspace';

const refuse = async () => false;

export const noSaberBoard = {
  status: 'idle',
  portName: null,
  saber: null,
  info: null,
  library: [],
  libraryLoaded: true,
  card: { shared: false, root: null },
  busy: false,
  plugged: [],
  switchingTo: null,
  refreshLibrary: async () => undefined,
  setPresetStyles: refuse,
} as unknown as Board;

export const noSaberWorkspace: Workspace = {
  saber: null,
  info: null,
  live: false,
  model: null,
  choose: () => undefined,
  saveModel: async () => undefined,
  plans: [],
  loading: false,
};
