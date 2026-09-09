import type { Blade, Font, Look, Preset, Saber } from './model';

export const LOOKS: Look[] = [
  { id: 'sentinel', name: 'Sentinel', by: 'Fett263', os: 'OS 8', kb: 4.2, c: '#3dffb0', tags: ['base'], args: ['base', 'clash', 'lockup', 'blast'], desc: 'A steady guardian blade with a soft audio flicker, bright clash and a rolling lockup.' },
  { id: 'duality', name: 'Duality', by: 'Fett263', os: 'OS 8', kb: 5.1, c: '#3d7bff', c2: '#ff3d3d', tags: ['dual'], args: ['base', 'alt', 'clash', 'lockup', 'blast'], desc: 'Two phases you switch between with a gesture. Each phase keeps its own colour.', needs: 'Needs the special-abilities option and an alt font folder on the SD card.' },
  { id: 'corruption', name: 'Corruption', by: 'Fett263', os: 'OS 8', kb: 4.8, c: '#ff3d3d', c2: '#7a1fff', tags: ['dual'], args: ['base', 'alt', 'clash', 'lockup'], desc: 'Rippling base colour with a second phase you switch to with a gesture. Clash, lockup and blast included.', needs: 'Needs the special-abilities option and an alt font folder on the SD card.' },
  { id: 'crystalpulse', name: 'Crystal pulse', by: 'Fett263', os: 'OS 8', kb: 1.9, c: '#b26bff', tags: ['crystal'], args: ['base'], desc: 'A slow breathing pulse meant for short strips and chambers.' },
  { id: 'unstable', name: 'Unstable', by: 'Hiltwright', os: 'OS 8', kb: 3.6, c: '#ff4a1a', tags: ['base'], args: ['base', 'clash', 'lockup'], desc: 'Crackling, uneven blade with sparks that run along the strip on clash.' },
  { id: 'rain', name: 'Rain', by: 'Hiltwright', os: 'OS 8', kb: 2.7, c: '#5fd3ff', tags: ['base'], args: ['base', 'clash'], desc: 'Droplets of white falling down the blade over a calm base.' },
  { id: 'kyber', name: 'Kyber bleed', by: 'Hiltwright', os: 'OS 8', kb: 3.9, c: '#ffffff', c2: '#ff2a2a', tags: ['dual'], args: ['base', 'alt', 'clash'], desc: 'Starts pure white, bleeds into the second colour from the hilt outwards.' },
  { id: 'ember', name: 'Ember', by: 'Hiltwright', os: 'OS 8', kb: 2.4, c: '#ffb547', tags: ['base'], args: ['base', 'clash'], desc: 'Warm glow with embers drifting toward the tip.' },
];

const graflexBlades: Blade[] = [
  { id: 'g-main', role: 'main', type: 'pixel', pixels: 132, chip: 'WS2812B', order: 'GRB', ledColor: '#ffffff', parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: [2, 3] } },
  { id: 'g-crystal', role: 'crystal', type: 'pixel', pixels: 6, chip: 'WS2812B', order: 'GRB', ledColor: '#ffffff', parallel: 1, wiring: { kind: 'chain', after: 'g-main' } },
  { id: 'g-accent', role: 'accent', type: 'single', pixels: 1, chip: '', order: '', ledColor: '#ffffff', parallel: 1, wiring: { kind: 'power', pin: 5 } },
  { id: 'g-motor', role: 'motor', type: 'motor', pixels: 0, chip: '', order: '', ledColor: '', parallel: 1, wiring: { kind: 'power', pin: 6 } },
];

const crossguardBlades: Blade[] = [
  { id: 'c-main', role: 'main', type: 'pixel', pixels: 144, chip: 'SK6812', order: 'GRBW', ledColor: '#ffffff', parallel: 1, wiring: { kind: 'own', dataPin: 'bladePin', powerPins: [1, 2, 3] } },
  { id: 'c-left', role: 'side', type: 'pixel', pixels: 20, chip: 'WS2812B', order: 'GRB', ledColor: '#ffffff', parallel: 1, wiring: { kind: 'own', dataPin: 'blade2Pin', powerPins: [4] } },
  { id: 'c-right', role: 'side', type: 'pixel', pixels: 20, chip: 'WS2812B', order: 'GRB', ledColor: '#ffffff', parallel: 1, wiring: { kind: 'own', dataPin: 'blade3Pin', powerPins: [5] } },
];

function preset(id: string, name: string, font: string, track: string, main: string, base: string, alt: string, extra: Partial<Preset> = {}): Preset {
  return {
    id, name, font, track, variation: 0,
    looks: { 'g-main': main, 'g-crystal': 'follow', 'g-accent': 'pulseClash', 'g-motor': 'spinOn' },
    colors: { base, alt, clash: '#ffffff', lockup: '#ffb547', blast: '#ffffff' },
    crystalLinked: true, crystalColor: base,
    ignition: 300, retraction: 500, swing: 'Smooth swing',
    ...extra,
  };
}

export const SABERS: Saber[] = [
  {
    id: 'graflex', name: 'Graflex Mk II', board: 'V2.2', flashKB: 256, fw: 'OS 8.10 · 7 Sep',
    blades: graflexBlades,
    variants: null, activeVariant: null,
    presets: [
      preset('p1', 'Sentinel', 'Greyscale Sentinel', 'tracks/sentinel.wav', 'sentinel', '#3dffb0', '#ffffff'),
      preset('p2', 'Duality', 'KyberPhonics Osha', 'tracks/duality.wav', 'duality', '#3d7bff', '#ff3d3d', { variation: 23299 }),
      preset('p3', 'Corrupted', 'KyberPhonics Osha', 'tracks/duality.wav', 'duality', '#ff3d3d', '#7a1fff'),
      preset('p4', 'Crystal focus', 'TeensySF', '', 'crystalpulse', '#b26bff', '#ffffff', { looks: { 'g-main': 'crystalpulse', 'g-crystal': 'pulse', 'g-accent': 'battery', 'g-motor': 'off' } }),
      preset('p5', 'Training', 'TeensySF', 'tracks/venus.wav', 'sentinel', '#ffd23d', '#ffffff', { looks: { 'g-main': 'sentinel', 'g-crystal': 'follow', 'g-accent': 'off', 'g-motor': 'off' } }),
    ],
    compiled: ['sentinel', 'duality', 'crystalpulse'],
    pending: [],
    lastBackup: '12:04 today', lastSeen: 'now',
  },
  {
    id: 'crossguard', name: 'Crossguard', board: 'V3.9', flashKB: 512, fw: 'OS 8.10 · 2 Sep',
    blades: crossguardBlades,
    variants: [
      { id: 'v-std', name: 'Standard 36 inch', pixels: 144, ohms: 33000 },
      { id: 'v-short', name: 'Short 24 inch', pixels: 96, ohms: 10000 },
      { id: 'v-none', name: 'No blade', pixels: 0, ohms: null },
    ],
    activeVariant: 'v-std',
    presets: ['Ember', 'Unstable', 'Rain', 'Kyber bleed', 'Sentinel', 'Duality', 'Guard', 'Night'].map((n, i) => ({
      id: `c${i + 1}`, name: n, font: ['Greyscale Sentinel', 'TeensySF', 'KyberPhonics Osha'][i % 3], track: i % 2 ? 'tracks/venus.wav' : '', variation: 0,
      looks: { 'c-main': ['ember', 'unstable', 'rain', 'kyber', 'sentinel', 'duality', 'ember', 'rain'][i], 'c-left': 'follow', 'c-right': 'follow' },
      colors: { base: ['#ff2a2a', '#ff4a1a', '#5fd3ff', '#ffffff', '#3dffb0', '#3d7bff', '#ff2a2a', '#7a1fff'][i], alt: '#ff2a2a', clash: '#ffffff', lockup: '#ffb547', blast: '#ffffff' },
      crystalLinked: true, crystalColor: '#ff2a2a', ignition: 250, retraction: 450, swing: 'Smooth swing',
    })),
    compiled: ['ember', 'unstable', 'rain', 'kyber', 'sentinel', 'duality'],
    pending: ['corruption', 'crystalpulse'],
    lastBackup: '4 Sep', lastSeen: '3 days ago',
  },
];

export const FONTS: Font[] = [
  { id: 'f1', name: 'KyberPhonics Osha', type: 'Polyphonic', rate: '44.1 kHz', size: '68 MB', issue: null },
  { id: 'f2', name: 'Greyscale Sentinel', type: 'Polyphonic', rate: '44.1 kHz', size: '91 MB', issue: null },
  { id: 'f3', name: 'TeensySF', type: 'Monophonic', rate: '44.1 kHz', size: '12 MB', issue: null },
  { id: 'f4', name: 'Duality Alt', type: 'Polyphonic', rate: '48 kHz', size: '40 MB', issue: { kind: 'rate', text: 'hum.wav is 48 kHz. The saber needs 44.1 kHz or lower.', fix: 'Convert hum.wav' } },
  { id: 'f5', name: 'SmthJedi', type: 'Mixed', rate: '44.1 kHz', size: '18 MB', issue: { kind: 'mix', text: 'clash01.wav and clsh1.wav are both present. ProffieOS plays only one, so some clashes will be silent.', fix: 'Keep polyphonic set' } },
  { id: 'f6', name: 'common', type: 'Shared sounds', rate: '44.1 kHz', size: '3 MB', issue: null },
];

export const CONVERTER_MAP: [string, string][] = [
  ['in.wav', 'in01.wav'],
  ['out.wav', 'out01.wav'],
  ['swing (1).wav', 'swng01.wav'],
  ['swing (2).wav', 'swng02.wav'],
  ['hum.wav', 'hum01.wav'],
  ['font.wav', 'font01.wav'],
];

export const FONT_CHOICES = ['KyberPhonics Osha', 'Greyscale Sentinel', 'TeensySF', 'Duality Alt', 'SmthJedi'];
export const TRACK_CHOICES = ['', 'tracks/duality.wav', 'tracks/sentinel.wav', 'tracks/venus.wav', 'tracks/march.wav'];
