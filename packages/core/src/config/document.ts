// The parsed shape of a ProffieOS config.h. Everything we do not understand is kept verbatim as opaque text,
// so hand-written configs survive a parse-and-emit round trip.

import type { PresetArray, PresetSource, StyleRef } from '../model';

export type SectionMacro = 'CONFIG_TOP' | 'CONFIG_STYLES' | 'CONFIG_PRESETS' | 'CONFIG_PROP' | 'CONFIG_BUTTONS' | 'PROP_BOTTOM' | 'CONFIG_BOTTOM';

export type TopLine =
  | { kind: 'define'; name: string; value: string | null; raw: string }
  | { kind: 'undef'; name: string; raw: string }
  | { kind: 'include'; path: string; raw: string }
  | { kind: 'maxLeds'; value: number; raw: string }
  | { kind: 'opaque'; raw: string };

export interface TopSection {
  lines: TopLine[];
}

/** A blade pointer expression inside a BladeConfig row. */
export type BladeExpr =
  | { kind: 'ws281x'; leds: number; dataPin: string; order: string; powerPins: string[]; extra: string[]; raw: string }
  | { kind: 'subblade'; variant: 'SubBlade' | 'SubBladeReverse' | 'SubBladeWithStride'; first: number; last: number; stride?: number; inner: BladeExpr | null; raw: string }
  | { kind: 'simple'; leds: string[]; pins: string[]; raw: string }
  | { kind: 'dim'; factor: string; inner: BladeExpr; raw: string }
  | { kind: 'raw'; raw: string };

export interface BladeConfigRow {
  id: string;
  blades: BladeExpr[];
  presetArray: string | null;
  saveName?: string;
  /** Rows containing preprocessor conditionals or anything unparseable are kept whole. */
  raw?: string;
  leading?: string;
}

export interface BladeConfigTable {
  name: string;
  rows: BladeConfigRow[];
  /** Comment or directive text after the last row, kept verbatim. */
  trailing?: string;
}

export type PresetsItem =
  | { kind: 'presets'; array: PresetArray }
  | { kind: 'blades'; table: BladeConfigTable }
  | { kind: 'opaque'; text: string };

export interface PresetsSection {
  items: PresetsItem[];
}

export interface ButtonLine {
  kind: 'button';
  type: string; // BUTTON_POWER, BUTTON_AUX, ...
  pin: string;
  name: string;
  className: string; // Button, LatchingButton, TouchButton, ...
  variable: string;
  raw: string;
}

export interface ButtonsSection {
  lines: (ButtonLine | { kind: 'opaque'; raw: string })[];
}

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'section'; macro: SectionMacro | string; open: string; close: string; body: string };

export interface ConfigDocument {
  /** Ordered file layout; parsed sections still point at their body text so unknown sections re-emit verbatim. */
  segments: Segment[];
  top: TopSection | null;
  presets: PresetsSection | null;
  buttons: ButtonsSection | null;
}

export type { PresetArray, PresetSource, StyleRef };
