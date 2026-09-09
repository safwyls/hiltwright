// Hardware and preset model shared by the config codec, the wizard and the presets editor.
// Pure data. No Node, Electron or DOM here.

export type Board = 'V1' | 'V2' | 'V3' | 'unknown';

/** Where a blade's data and power come from. Mirrors the wizard's three answers. */
export type Wiring =
  | { kind: 'own'; dataPin: string; powerPins: string[] }
  | { kind: 'chain'; after: string; reverse?: boolean; stride?: number }
  | { kind: 'power'; pins: string[] };

export type BladeType = 'pixel' | 'simple';

/** One ProffieOS blade slot as the product understands it. `id` is stable within a saber. */
export interface BladeSpec {
  id: string;
  type: BladeType;
  /** Pixel count for strips; number of LED dies for simple blades. */
  pixels: number;
  /** WS281X colour order, e.g. GRB. Simple blades leave it empty. */
  order: string;
  /** Extra template arguments after PowerPINS on a WS281XBladePtr, preserved verbatim. */
  extra: string[];
  /** LED templates for SimpleBladePtr, in slot order, e.g. CreeXPE2WhiteTemplate<550>. NoLED for unused slots. */
  leds: string[];
  /** Strips soldered in parallel on the same data wire. Product metadata; ProffieOS never sees it. */
  parallel: number;
  wiring: Wiring;
}

/** A blade-identity row: which set of blades, and which preset array, applies at a Blade ID reading. */
export interface BladeConfiguration {
  /** The ID expression exactly as written: `0`, `33000`, `NO_BLADE`, ... */
  id: string;
  blades: BladeSpec[];
  presetArray: string;
  saveName?: string;
}

/** One style slot inside a preset, as compiled source. The style AST is a later phase. */
export type StyleRef =
  | { kind: 'styleptr'; style: string; args?: string; factory: 'StylePtr' | 'StyleNormalPtr' | string }
  | { kind: 'raw'; code: string };

export interface PresetSource {
  font: string;
  track: string;
  styles: StyleRef[];
  name: string;
  /** Comment or whitespace text that preceded this entry, kept for round trips. */
  leading?: string;
}

export interface PresetArray {
  name: string;
  presets: PresetSource[];
}
