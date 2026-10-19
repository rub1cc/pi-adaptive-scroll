export type Direction = -1 | 1;

export const PROFILES = {
  gentle: { maxLines: 6, ramp: 0.45 },
  normal: { maxLines: 12, ramp: 0.8 },
  fast: { maxLines: 24, ramp: 1.2 },
} as const;

export type Profile = keyof typeof PROFILES;

/** Event-driven only: no momentum timers or extra renders after input stops. */
export class ScrollAcceleration {
  private direction: Direction | undefined;
  private lastTime = 0;
  private energy = 0;

  reset(): void {
    this.direction = undefined;
    this.lastTime = 0;
    this.energy = 0;
  }

  next(direction: Direction, now: number, profile: Profile): number {
    const gap = now - this.lastTime;
    if (this.direction !== direction || gap < 0 || gap >= 180) {
      this.energy = 0;
    } else {
      // Sparse notches stay precise; tightly spaced events build speed gradually.
      this.energy = Math.min(40, this.energy * Math.exp(-gap / 220) + Math.max(0, 1 - gap / 140));
    }
    this.direction = direction;
    this.lastTime = now;
    const { maxLines, ramp } = PROFILES[profile];
    return Math.min(maxLines, 1 + Math.floor(Math.max(0, this.energy - 2) * ramp));
  }
}
