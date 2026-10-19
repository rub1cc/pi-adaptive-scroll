import type { TUI } from "@earendil-works/pi-tui";
import { ScrollAcceleration, type Profile } from "./acceleration.ts";

export type ScrollMode = Profile | "off";
type WheelPolicy = { next(direction: number, now: number): number; reset(): void };
type Installation = { policy: WheelPolicy; original: WheelPolicy["next"]; replacement: WheelPolicy["next"]; deactivate(): void };

function wheelPolicy(tui: TUI): WheelPolicy | undefined {
  // Pi has no pre-viewport input hook. Keep this one private dependency isolated
  // and feature-detected; all event parsing, routing and rendering stays native.
  const candidate = (tui as unknown as { wheelScroll?: Partial<WheelPolicy> }).wheelScroll;
  if (candidate && typeof candidate.next === "function" && typeof candidate.reset === "function") {
    return candidate as WheelPolicy;
  }
  return undefined;
}

export class AdaptiveWheelHook {
  mode: ScrollMode = "normal";
  private readonly acceleration = new ScrollAcceleration();
  private installation: Installation | undefined;

  setMode(mode: ScrollMode): void {
    this.mode = mode;
    this.acceleration.reset();
    if (mode === "off") this.dispose();
  }

  sync(tui: TUI): boolean {
    const policy = tui.mode === "fullscreen" && this.mode !== "off" ? wheelPolicy(tui) : undefined;
    if (policy && this.installation?.policy === policy) return true;
    this.dispose();
    if (!policy) return false;

    const original = policy.next;
    let active = true;
    const replacement: WheelPolicy["next"] = (direction, now) => {
      if (!active || this.mode === "off" || tui.hasOverlay() || (direction !== -1 && direction !== 1)) {
        this.acceleration.reset();
        return original.call(policy, direction, now);
      }
      return this.acceleration.next(direction, now, this.mode);
    };
    if (!Reflect.set(policy, "next", replacement)) return false;
    this.installation = { policy, original, replacement, deactivate() { active = false; } };
    return true;
  }

  dispose(): void {
    if (this.installation) {
      const { policy, original, replacement } = this.installation;
      this.installation.deactivate();
      if (policy.next === replacement) {
        policy.next = original;
        policy.reset();
      }
      this.installation = undefined;
    }
    this.acceleration.reset();
  }
}
