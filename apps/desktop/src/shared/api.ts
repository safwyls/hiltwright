// The typed contract between renderer and main, exposed by the preload script as window.hiltwright.
// Only data crosses this boundary: no handles, no callbacks except the event subscriptions listed here.

import type { PresetRecord } from '@hiltwright/core';

/** What the app can learn about a board without touching its SD card. */
export interface SaberIdentity {
  /** USB serial number of the composite device (Windows: from the PnP instance id). Stable across reflashes. */
  usbSerial: string | null;
  configName: string | null;
  version: string | null;
  prop: string | null;
  buttons: number | null;
  installed: string | null;
  /** Pixel counts per WS281X blade as reported by `scanid`, in blade order. */
  pixelBlades: number[];
  /** BladeConfig row the board selected at the last `scanid`. */
  bladeConfig: number | null;
}

export interface SaberRecord {
  id: string;
  name: string;
  identity: SaberIdentity;
  firstSeen: string;
  lastSeen: string;
  /** Last presets read from the board. */
  presets: PresetRecord[];
  fonts: string[];
  tracks: string[];
}

export interface SnapshotMeta {
  file: string;
  at: string;
  label: string;
  presets: number;
}

export interface HiltwrightApi {
  appVersion: string;
  platform: string;
  library: {
    list(): Promise<SaberRecord[]>;
    /** Match an identity to a known saber, or create one. Returns the stored record. */
    upsert(input: { identity: SaberIdentity; presets: PresetRecord[]; fonts: string[]; tracks: string[]; name?: string }): Promise<SaberRecord>;
    rename(id: string, name: string): Promise<SaberRecord>;
    remove(id: string): Promise<void>;
  };
  snapshots: {
    list(saberId: string): Promise<SnapshotMeta[]>;
    save(saberId: string, label: string, presets: PresetRecord[]): Promise<SnapshotMeta>;
    read(saberId: string, file: string): Promise<PresetRecord[]>;
  };
  usb: {
    /** Serial numbers of Proffieboards currently attached, when the platform can tell us. */
    proffieSerials(): Promise<string[]>;
  };
  app: {
    userDataPath(): Promise<string>;
    openPath(path: string): Promise<void>;
  };
}
