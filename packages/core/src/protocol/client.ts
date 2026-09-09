// Transport-agnostic board client. The renderer supplies a Transport over Web Serial; tests supply a replay.
//
// Design, from the OS 7.8 transcripts:
// - Commands are serialised: one in flight at a time, because the board has no request ids on OS 7.
// - A response is complete when a shape predicate says so (e.g. VARIATION= ends a preset block) or when the line
//   stream has been idle for `idleMs`. Writes (set_font, set_preset) answer with nothing or with chatter, so they
//   always complete by idle timeout and must be verified with a read-back.
// - Unsolicited status lines are delivered to `onEvent` and never counted as response lines.
// - No `tag|command` framing: both the 7.8 and the 8.10 transcripts reject it, so responses end by shape or idle.

import { LineBuffer, isNoise } from './lines';

export interface Transport {
  write(text: string): Promise<void> | void;
  /** Register a data callback. Returns an unsubscribe function. */
  onData(cb: (chunk: string) => void): () => void;
}

export interface SendOptions {
  /** Return true when the line completes the response. */
  until?: (line: string, all: string[]) => boolean;
  /** Complete after this many ms with no new lines. */
  idleMs?: number;
  /** Give up after this many ms in total. */
  timeoutMs?: number;
}

export interface Response {
  command: string;
  lines: string[];
  /** Lines the board printed on its own during this command. */
  events: string[];
  ms: number;
  timedOut: boolean;
}

export interface ClientOptions {
  idleMs?: number;
  timeoutMs?: number;
  onEvent?: (line: string) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class BoardClient {
  private lines = new LineBuffer();
  private queue: Promise<unknown> = Promise.resolve();
  private current: { lines: string[]; events: string[]; opts: Required<Pick<SendOptions, 'idleMs' | 'timeoutMs'>> & SendOptions; resolve: (done: boolean) => void; touch: () => void } | null = null;
  private readonly idleMs: number;
  private readonly timeoutMs: number;
  private readonly onEvent: (line: string) => void;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private unsubscribe: () => void;

  constructor(private transport: Transport, opts: ClientOptions = {}) {
    this.idleMs = opts.idleMs ?? 400;
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.onEvent = opts.onEvent ?? (() => {});
    this.now = opts.now ?? (() => Date.now());
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.unsubscribe = transport.onData((chunk) => this.receive(chunk));
  }

  close(): void {
    this.unsubscribe();
  }

  private receive(chunk: string): void {
    for (const line of this.lines.push(chunk)) {
      if (isNoise(line)) {
        this.onEvent(line);
        if (this.current) this.current.events.push(line);
        continue;
      }
      if (!this.current) {
        if (line.trim()) this.onEvent(line);
        continue;
      }
      this.current.lines.push(line);
      this.current.touch();
      if (this.current.opts.until?.(line, this.current.lines)) this.current.resolve(true);
    }
  }

  /** Send one command and collect its response. Commands queue; the promise resolves in order. */
  send(command: string, options: SendOptions = {}): Promise<Response> {
    const run = () => new Promise<Response>((resolveOuter) => {
      const opts = { idleMs: options.idleMs ?? this.idleMs, timeoutMs: options.timeoutMs ?? this.timeoutMs, ...options };
      const started = this.now();
      let idleHandle: unknown = null;
      let timeoutHandle: unknown = null;
      let settled = false;
      const finish = (timedOut: boolean) => {
        if (settled) return;
        settled = true;
        if (idleHandle !== null) this.clearTimer(idleHandle);
        if (timeoutHandle !== null) this.clearTimer(timeoutHandle);
        const cur = this.current!;
        this.current = null;
        resolveOuter({ command, lines: cur.lines, events: cur.events, ms: this.now() - started, timedOut });
      };
      const touch = () => {
        if (idleHandle !== null) this.clearTimer(idleHandle);
        idleHandle = this.setTimer(() => finish(false), opts.idleMs);
      };
      this.current = { lines: [], events: [], opts, resolve: () => finish(false), touch };
      timeoutHandle = this.setTimer(() => finish(true), opts.timeoutMs);
      touch();
      void this.transport.write(`${command}\n`);
    });
    const next = this.queue.then(run, run);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }
}
