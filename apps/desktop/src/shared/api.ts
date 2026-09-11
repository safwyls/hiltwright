// The typed contract between renderer and main, exposed by the preload script as window.hiltwright.
// Only data crosses this boundary: no handles, no callbacks except the event subscriptions listed here.

import type { FirmwareManifest, FontReport, LookDef, PresetRecord, SaberConfigModel } from '@hiltwright/core';

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
  /** The wiring, prop and looks the owner last built (or is preparing to build) for this saber. */
  model?: SaberConfigModel;
  /** What the last successful install compiled in. Absent on vendor firmware. */
  firmware?: FirmwareManifest;
}

export interface SaberPatch { model?: SaberConfigModel | null; firmware?: FirmwareManifest | null }

export interface SnapshotMeta {
  file: string;
  at: string;
  label: string;
  presets: number;
}

export interface CardInfo {
  root: string;
  label: string | null;
  freeBytes: number | null;
  totalBytes: number | null;
  proffie: boolean;
  hasPresetsIni: boolean;
}

export interface FontEntry {
  name: string;
  path: string;
  report: FontReport;
}

export interface ToolchainStatus {
  root: string;
  cli: boolean;
  cliVersion: string | null;
  core: boolean;
  gcc: boolean;
  dfuUtil: string | null;
  proffieOS: boolean;
  proffieOSVersion: string | null;
  ready: boolean;
}

export interface BuildResult {
  ok: boolean;
  cached: boolean;
  ms: number;
  configPath: string;
  configHash: string;
  dfuPath: string | null;
  textBytes: number | null;
  flashBytes: number;
  flashPct: number | null;
  problems: string[];
  output: string;
  warnings: string[];
  /** Which look went into which slot, for the saber record once installed. */
  manifest: Omit<FirmwareManifest, 'os' | 'at'> | null;
  os: string;
}

export interface UsbState {
  runtimePresent: boolean;
  bootloaderPresent: boolean;
  bootloaderDriver: string | null;
  bootloaderProblem: number | null;
}

export interface FlashStepResult { ok: boolean; ms: number; detail: string; file?: string }

/** Progress lines from long-running main-process jobs. */
export interface JobEvent { job: 'toolchain' | 'build' | 'flash'; line: string; at: number }

export interface HiltwrightApi {
  appVersion: string;
  platform: string;
  library: {
    list(): Promise<SaberRecord[]>;
    /** Match an identity to a known saber, or create one. Returns the stored record. */
    upsert(input: { identity: SaberIdentity; presets: PresetRecord[]; fonts: string[]; tracks: string[]; name?: string }): Promise<SaberRecord>;
    rename(id: string, name: string): Promise<SaberRecord>;
    remove(id: string): Promise<void>;
    /** Store the build model and/or firmware manifest for a saber. `null` clears a field. */
    update(id: string, patch: SaberPatch): Promise<SaberRecord>;
  };
  /** Pasted looks, shared across sabers, in userData/looks.json. */
  looks: {
    list(): Promise<LookDef[]>;
    add(look: LookDef): Promise<LookDef[]>;
    remove(id: string): Promise<LookDef[]>;
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
  sd: {
    /** Removable volumes, flagged when they look like a ProffieOS card. */
    locate(): Promise<CardInfo[]>;
    listFonts(root: string): Promise<FontEntry[]>;
    listTracks(root: string): Promise<{ name: string; size: number }[]>;
    /** Ask the user for a font folder on this computer and check it without copying. */
    pickFont(): Promise<FontEntry | null>;
    copyFont(src: string, root: string, replace: boolean): Promise<FontEntry>;
  };
  toolchain: {
    status(): Promise<ToolchainStatus>;
    /** Download and install whatever is missing. Progress arrives through onJobEvent. */
    install(): Promise<ToolchainStatus>;
  };
  build: {
    /** Generate config.h for the model and compile it. Progress arrives through onJobEvent. */
    run(saberId: string, model: SaberConfigModel, force: boolean): Promise<BuildResult>;
    /** The generated config text, without compiling. */
    preview(model: SaberConfigModel): Promise<{ text: string; hash: string; warnings: string[]; errors: string[] }>;
  };
  flash: {
    usb(): Promise<UsbState>;
    /** Wait up to timeoutMs for the bootloader to enumerate with a usable driver. */
    waitForBootloader(timeoutMs: number): Promise<{ ok: boolean; text: string }>;
    backup(saberId: string, label: string): Promise<FlashStepResult>;
    write(dfuPath: string): Promise<FlashStepResult>;
    /** Wait for the running firmware's serial device to be back. */
    waitForRuntime(timeoutMs: number): Promise<boolean>;
  };
  onJobEvent(cb: (e: JobEvent) => void): () => void;
  app: {
    userDataPath(): Promise<string>;
    openPath(path: string): Promise<void>;
  };
}
