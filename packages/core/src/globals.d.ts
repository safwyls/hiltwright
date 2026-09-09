// The only host facilities core assumes: timers. Both Node and browsers provide these; the client also accepts injected ones.
declare function setTimeout(handler: () => void, timeout?: number): unknown;
declare function clearTimeout(handle: unknown): void;
