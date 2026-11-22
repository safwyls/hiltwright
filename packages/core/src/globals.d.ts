// The only host facilities core assumes: timers, and UTF-8 decoding (for the presets files ProffieOS saves, issue #25).
// Both Node and browsers provide these; the client also accepts injected timers.
declare function setTimeout(handler: () => void, timeout?: number): unknown;
declare function clearTimeout(handle: unknown): void;
declare class TextDecoder { constructor(label?: string); decode(input?: Uint8Array): string; }
