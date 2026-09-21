// How a saber held by the hilt moves. Pure maths, no renderer, so it can be tested.
//
// The wielder is the viewer: they stand on the camera's side of the room (positive z) and face into it, so
// "forward" is negative z. The hand goes where it is put. The blade is a rod of fixed length with its mass at the
// tip: the wrist pulls the tip toward where it would naturally hold it, which is pointing away from the chest. With
// the chest behind the hand, a sweep of the hand from left to right carries the blade through forward, level with
// the floor, not up and over; a raised hand points it up and a lowered one points it down. Because the tip has
// mass it trails a quick move of the hand, whips through, overshoots a little (the follow-through of a swing) and
// settles.

export type Vec = [number, number, number];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: Vec) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec, fallback: Vec): Vec => { const l = len(a); return l < 1e-9 ? fallback : [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * Where the hand really is for a position (x across, y up) chosen by the drag. A sideways sweep is an arc, not a
 * line: the arm reaches furthest forward in the middle and comes back toward the body at either side.
 */
export function handOnArc(x: number, y: number, reachX: number, push: number): Vec {
  const t = Math.max(-1, Math.min(1, x / reachX));
  return [x, y, -push * Math.cos((t * Math.PI) / 2)];
}

export interface WieldOptions {
  length: number;
  /** The blade points away from here. */
  chest: Vec;
  /** How hard the wrist pulls the tip to its rest place, and how much it resists motion. Under-damped gives follow-through. */
  stiffness: number;
  damping: number;
  /** How quickly the hand reaches where it was put, per second. */
  handSpeed: number;
}

export class Wield {
  hand: Vec;
  handTarget: Vec;
  dir: Vec;
  private tip: Vec;
  private velocity: Vec = [0, 0, 0];
  /** Degrees per second the blade turned during the last step. */
  turnRate = 0;

  constructor(start: Vec, private readonly o: WieldOptions) {
    this.hand = [...start]; this.handTarget = [...start];
    this.dir = unit(sub(start, o.chest), [0, 1, 0]);
    this.tip = add(this.hand, this.dir, o.length);
  }

  /** Blade elevation in degrees: 90 straight up, -90 straight down. */
  get tilt(): number { return (Math.asin(Math.max(-1, Math.min(1, this.dir[1]))) * 180) / Math.PI; }

  step(dt: number): void {
    if (!(dt > 0)) { this.turnRate = 0; return; }
    const before = this.dir;
    const follow = 1 - Math.exp(-dt * this.o.handSpeed);
    this.hand = add(this.hand, sub(this.handTarget, this.hand), follow);
    const rest = unit(sub(this.hand, this.o.chest), [0, 1, 0]);
    const steps = Math.max(1, Math.ceil(dt / 0.004));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const want = add(this.hand, rest, this.o.length);
      const pull = add(add([0, 0, 0], sub(want, this.tip), this.o.stiffness), this.velocity, -this.o.damping);
      this.velocity = add(this.velocity, pull, h);
      this.tip = add(this.tip, this.velocity, h);
      // The rod does not stretch: the tip goes back to blade's length from the hand, and loses its speed along the rod.
      const rod = unit(sub(this.tip, this.hand), rest);
      this.tip = add(this.hand, rod, this.o.length);
      this.velocity = add(this.velocity, rod, -dot(this.velocity, rod));
      this.dir = rod;
    }
    const cos = Math.max(-1, Math.min(1, dot(before, this.dir)));
    this.turnRate = ((Math.acos(cos) * 180) / Math.PI) / dt;
  }
}
