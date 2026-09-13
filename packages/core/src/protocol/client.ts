// Transport-agnostic board client. The renderer supplies a Transport over Web Serial; tests supply a replay.
//
// Two modes, chosen per board:
// - Untagged (OS 7.x): one command in flight; a response is complete when a shape predicate says so (VARIATION=
//   ends a preset block) or when the line stream has been idle for `idleMs`. Writes answer with nothing or with
//   chatter, so they complete by idle and are verified with a read-back.
// - Tagged (OS 8.x, `tag| command` with a space after the pipe): the board prefixes every line the command prints
//   with `n,len,tag|`. The client tags each command uniquely and follows it with a sentinel command that the board
//   rejects (`tagx| hw_end` → `Whut? :tagx|`), so a response is complete exactly when the sentinel's rejection
//   arrives. No idle guessing, and a late answer to an earlier command is recognised by its tag and dropped
//   instead of being mistaken for the current one. That matters on a busy board: with a heavy style and the blade
//   on, a V2 answers seconds late.
// - Unsolicited status lines are delivered to `onEvent` and never counted as response lines.

import { LineBuffer, isNoise } from './lines';

export interface Transport {
  write(text: string): Promise<void> | void;
  /** Register a data callback. Returns an unsubscribe function. */
  onData(cb: (chunk: string) => void): () => void;
}

export interface SendOptions {
  /** Return true when the line completes the response. */
  until?: (line: string, all: string[]) => boolean;
  /** Complete after this many ms with no new lines (untagged mode only). */
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
  /** True when at least one line carried this command's tag (OS 8 framing in effect). */
  tagged: boolean;
}

export interface ClientOptions {
  idleMs?: number;
  timeoutMs?: number;
  /**
   * Tagged mode: if nothing for the current tag has arrived after this long, send a kick line. A board that has
   * fallen behind releases one earlier answer per line it receives, so kicks push the real answer out.
   */
  kickMs?: number;
  maxKicks?: number;
  /** Total timeout used in tagged mode, where the sentinel ends the response and only a dead board is left to wait for. */
  taggedTimeoutMs?: number;
  onEvent?: (line: string) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

const TAGGED = /^(\d+),(\d+),([A-Za-z0-9_]+)\|(.*)$/;
const REJECTED_TAG = /^Whut\? :([A-Za-z0-9_]+)\|\s*$/;

interface Pending {
  command: string;
  tag: string | null;
  sentinel: string | null;
  lines: string[];
  events: string[];
  sawTag: boolean;
  opts: Required<Pick<SendOptions, 'idleMs' | 'timeoutMs'>> & SendOptions;
  resolve: (done: boolean) => void;
  touch: () => void;
}

export class BoardClient {
  private lines = new LineBuffer();
  private queue: Promise<unknown> = Promise.resolve();
  private current: Pending | null = null;
  private seq = 0;
  private tagged = false;
  private closed = false;
  private readonly idleMs: number;
  private readonly timeoutMs: number;
  private readonly taggedTimeoutMs: number;
  private readonly kickMs: number;
  private readonly maxKicks: number;
  private kicks = 0;
  private readonly onEvent: (line: string) => void;
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private unsubscribe: () => void;

  constructor(private transport: Transport, opts: ClientOptions = {}) {
    this.idleMs = opts.idleMs ?? 400;
    this.timeoutMs = opts.timeoutMs ?? 8000;
    this.taggedTimeoutMs = opts.taggedTimeoutMs ?? 30000;
    this.kickMs = opts.kickMs ?? 800;
    this.maxKicks = opts.maxKicks ?? 30;
    this.onEvent = opts.onEvent ?? (() => {});
    this.now = opts.now ?? (() => Date.now());
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.unsubscribe = transport.onData((chunk) => this.receive(chunk));
  }

  /** Stop listening and end any command in flight (its kicks included) as timed out. */
  close(): void {
    this.unsubscribe();
    this.closed = true;
    this.current?.resolve(false);
  }

  /** Write to the transport; a failure (port gone) ends the current command instead of surfacing as an unhandled rejection. */
  private out(text: string): void {
    if (this.closed) return;
    Promise.resolve()
      .then(() => this.transport.write(text))
      .catch((err) => { this.onEvent(`(write failed: ${String(err)})`); this.current?.resolve(false); });
  }

  /** Whether commands are being tagged (OS 8 framing). */
  get isTagged(): boolean {
    return this.tagged;
  }

  /**
   * Find out whether the board understands `tag| command`. Sends a tagged `version`; OS 7 answers `Whut?`, OS 8
   * answers with tagged lines. Leaves the client in the matching mode and returns it.
   */
  async detectTagging(): Promise<boolean> {
    this.tagged = false;
    const r = await this.send('hwt| version', { idleMs: 700, timeoutMs: 6000 });
    this.tagged = r.tagged;
    return this.tagged;
  }

  private receive(chunk: string): void {
    for (const raw of this.lines.push(chunk)) {
      const cur = this.current;
      const m = TAGGED.exec(raw);
      if (m) {
        // A tagged line belongs to the command with that tag; anything else is a late answer to an earlier one.
        if (cur?.tag && m[3] === cur.tag) {
          cur.sawTag = true;
          this.acceptLine(cur, m[4]);
        } else {
          this.onEvent(`(late ${m[3]}) ${m[4]}`);
        }
        continue;
      }
      const rej = REJECTED_TAG.exec(raw);
      if (rej) {
        if (cur?.sentinel && rej[1] === cur.sentinel) { cur.resolve(true); continue; }
        if (/^k\d+$/.test(rej[1])) { this.onEvent(`(late) ${raw}`); continue; } // a kick's own rejection
        // The real command was unknown: the board names the tag, so restore the command for the callers' parsers.
        if (cur?.tag && rej[1] === cur.tag) { this.acceptLine(cur, `Whut? :${cur.command}`); continue; }
        this.onEvent(`(late) ${raw}`);
        continue;
      }
      if (isNoise(raw)) {
        this.onEvent(raw);
        if (cur) cur.events.push(raw);
        continue;
      }
      if (!cur) {
        if (raw.trim()) this.onEvent(raw);
        continue;
      }
      if (cur.tag) {
        // Tagged mode: an untagged, non-noise line while a command runs is still an event (STDERR output is not tagged).
        this.onEvent(raw);
        cur.events.push(raw);
        continue;
      }
      this.acceptLine(cur, raw);
    }
  }

  private acceptLine(cur: Pending, line: string): void {
    cur.lines.push(line);
    cur.touch();
    if (cur.opts.until?.(line, cur.lines)) cur.resolve(true);
  }

  /** Send one command and collect its response. Commands queue; the promise resolves in order. */
  send(command: string, options: SendOptions = {}): Promise<Response> {
    const run = () => new Promise<Response>((resolveOuter) => {
      // A caller may tag a command itself (the detection probe does); its lines are accepted under that tag but the
      // response still ends by idle, since no sentinel follows.
      const explicit = /^([A-Za-z0-9_]+)\| /.exec(command)?.[1] ?? null;
      const useTags = this.tagged && !explicit;
      const opts = { idleMs: options.idleMs ?? this.idleMs, timeoutMs: options.timeoutMs ?? (useTags ? this.taggedTimeoutMs : this.timeoutMs), ...options };
      const started = this.now();
      let idleHandle: unknown = null;
      let timeoutHandle: unknown = null;
      let kickHandle: unknown = null;
      let settled = false;
      const finish = (timedOut: boolean) => {
        if (settled) return;
        settled = true;
        if (idleHandle !== null) this.clearTimer(idleHandle);
        if (timeoutHandle !== null) this.clearTimer(timeoutHandle);
        if (kickHandle !== null) this.clearTimer(kickHandle);
        const cur = this.current!;
        this.current = null;
        resolveOuter({ command, lines: cur.lines, events: cur.events, ms: this.now() - started, timedOut, tagged: cur.sawTag });
      };
      const touch = () => {
        if (useTags) return; // the sentinel ends a tagged response; idle means nothing on a busy board
        // An explicitly tagged command (the probe) must not end on idle before anything has arrived: a board
        // running behind answers only after kicks, and the total timeout bounds the wait.
        if (explicit && !this.current?.lines.length) return;
        if (idleHandle !== null) this.clearTimer(idleHandle);
        idleHandle = this.setTimer(() => finish(false), opts.idleMs);
      };
      const tag = useTags ? `h${++this.seq}` : explicit;
      this.current = { command, tag, sentinel: useTags ? `${tag}x` : null, lines: [], events: [], sawTag: false, opts, resolve: (done) => finish(!done), touch };
      timeoutHandle = this.setTimer(() => finish(true), opts.timeoutMs);
      touch();
      // Kicks: while a tagged command has produced nothing (explicit tag) or no sentinel yet (auto tag), send a
      // harmless rejected line every kickMs. A board running N lines behind needs N of them; a healthy one none.
      if (tag) {
        let sent = 0;
        const kick = () => {
          if (settled) return;
          const need = useTags || !this.current?.sawTag;
          if (need && sent < this.maxKicks) {
            sent++;
            this.out(`k${++this.kicks}| hw_end\n`);
            this.onEvent(`(kick ${sent} for ${tag})`);
          }
          if (need) kickHandle = this.setTimer(kick, this.kickMs);
        };
        kickHandle = this.setTimer(kick, this.kickMs);
      }
      if (this.closed) { finish(true); return; }
      this.out(useTags ? `${tag}| ${command}\n${tag}x| hw_end\n` : `${command}\n`);
    });
    const next = this.queue.then(run, run);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }
}
