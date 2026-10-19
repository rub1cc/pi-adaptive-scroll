import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { AdaptiveWheelHook, type ScrollMode } from "./wheel-hook.ts";

const WIDGET = "adaptive-scroll:controller";
const MODES = ["gentle", "normal", "fast", "off"] as const;

export default function adaptiveScrollExtension(pi: ExtensionAPI) {
  const hook = new AdaptiveWheelHook();
  let activeTui: TUI | undefined;

  pi.on("session_start", (_event, ctx) => {
    if (ctx.mode !== "tui") return;
    ctx.ui.setWidget(WIDGET, (tui) => {
      activeTui = tui;
      if (tui.mode === "fullscreen" && hook.mode !== "off" && !hook.sync(tui)) {
        ctx.ui.notify("Adaptive scrolling is unavailable in this Pi version; native scrolling is unchanged.", "warning");
      }
      return {
        render() {
          // The injected TUI is a stable proxy; reattach if /settings replaces it.
          hook.sync(tui);
          return [];
        },
        invalidate() {},
        dispose() {
          hook.dispose();
          activeTui = undefined;
        },
      };
    });
  });

  pi.registerCommand("scroll-speed", {
    description: "Adaptive wheel scrolling: gentle, normal (default), fast, off",
    getArgumentCompletions: (prefix) => MODES.filter((mode) => mode.startsWith(prefix)).map((mode) => ({ value: mode, label: mode })),
    handler: async (args, ctx) => {
      const mode = args.trim();
      if (mode && !MODES.includes(mode as ScrollMode)) {
        ctx.ui.notify("Usage: /scroll-speed [gentle|normal|fast|off]", "warning");
        return;
      }
      if (mode) hook.setMode(mode as ScrollMode);
      const attached = activeTui ? hook.sync(activeTui) : false;
      const availability = hook.mode !== "off" && !attached ? " (inactive: requires a compatible fullscreen TUI)" : "";
      ctx.ui.notify(`Adaptive scrolling: ${hook.mode}${availability}. Profiles reset to normal on /reload.`, "info");
    },
  });

  pi.on("session_shutdown", (_event, ctx) => {
    hook.dispose();
    activeTui = undefined;
    if (ctx.mode === "tui") ctx.ui.setWidget(WIDGET, undefined);
  });
}
