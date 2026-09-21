// Steering a saber directly: the hand stays put and the drag turns the blade about two axes.
//
// Left and right turn it about the vertical, so the tip sweeps an arc parallel to the floor and the tilt does not
// change. Up and down change the tilt and nothing else. The blade follows the drag with a short lag, so how fast it
// really turns (what the saber's gyro would report) rises and falls smoothly. Pure maths, tested under node.

import type { Vec } from './wield';

export interface SteerOptions {
  /** Degrees of turn per pixel dragged. */
  yawPerPixel: number;
  pitchPerPixel: number;
  /** How quickly the blade catches up with the drag, per second. */
  follow: number;
  /** Limits of tilt, in degrees. Just short of straight up and down, where "left and right" stops meaning anything. */
  minPitch: number;
  maxPitch: number;
}

export class Steer {
  /** Heading in degrees, clockwise seen from above: 0 points away from the viewer's side of the room, 90 to the right. */
  yaw: number; pitch: number;
  private yawTarget: number; private pitchTarget: number;
  dir: Vec = [0, 1, 0];
  /** Degrees per second the blade turned during the last step. */
  turnRate = 0;

  constructor(yaw: number, pitch: number, private readonly o: SteerOptions) {
    this.yaw = this.yawTarget = yaw; this.pitch = this.pitchTarget = pitch;
    this.dir = Steer.direction(yaw, pitch);
  }

  static direction(yaw: number, pitch: number): Vec {
    const y = (yaw * Math.PI) / 180; const p = (pitch * Math.PI) / 180;
    return [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
  }

  /** Blade elevation in degrees: what the saber reads from gravity. */
  get tilt(): number { return this.pitch; }

  /** A drag of (dx, dy) pixels: right swings clockwise seen from above, up tilts up. */
  dragBy(dx: number, dy: number): void {
    this.yawTarget += dx * this.o.yawPerPixel;
    this.pitchTarget = Math.max(this.o.minPitch, Math.min(this.o.maxPitch, this.pitchTarget - dy * this.o.pitchPerPixel));
  }

  aimAt(yaw: number, pitch: number): void { this.yawTarget = yaw; this.pitchTarget = pitch; }

  step(dt: number): void {
    if (!(dt > 0)) { this.turnRate = 0; return; }
    const before = this.dir;
    const k = 1 - Math.exp(-dt * this.o.follow);
    this.yaw += (this.yawTarget - this.yaw) * k;
    this.pitch += (this.pitchTarget - this.pitch) * k;
    this.dir = Steer.direction(this.yaw, this.pitch);
    const cos = Math.max(-1, Math.min(1, before[0] * this.dir[0] + before[1] * this.dir[1] + before[2] * this.dir[2]));
    this.turnRate = ((Math.acos(cos) * 180) / Math.PI) / dt;
  }
}
