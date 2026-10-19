# Adaptive Scroll

Adaptive mouse-wheel and trackpad scrolling for Pi's fullscreen conversation.
Small, isolated scrolls move one line. Sustained fast scrolling ramps up gradually;
slowing down decays the speed, and reversing direction or pausing for 180 ms resets
it. No added momentum, background timers, or synthetic input events.

## Use

This directory is auto-discovered under `~/.pi/agent/extensions`. Run `/reload`
in Pi (or restart it). The extension starts enabled with the `normal` profile.

```text
/scroll-speed           Show the current profile
/scroll-speed gentle    Up to 6 lines per wheel event
/scroll-speed normal    Up to 12 lines per wheel event (default)
/scroll-speed fast      Up to 24 lines per wheel event
/scroll-speed off       Restore Pi's native scrolling
```

Profile choices last until `/reload` or restart; no settings files are modified.
These caps are before Pi's existing Alt+wheel multiplier (5x). PageUp/PageDown,
selection, mouse routing, and jump-to-message shortcuts stay native. Overlays use
native wheel speed. Regular mode is unchanged: the terminal owns its scrollback.
RPC, JSON, and print modes do not install terminal hooks.

## Compatibility

Pi's current `auto` wheel mode intentionally skips extra acceleration on local
macOS. This extension adds its own bounded curve there as well as on other
platforms. If your terminal already adds strong acceleration, try `gentle`.

Pi consumes wheel input before extension input listeners run, so there is no
public API for replacing the global acceleration curve. The extension captures
the TUI through an empty widget (without replacing the editor or footer) and
wraps the internal `wheelScroll.next` policy method. It checks compatibility
before installing, restores the original method on disable/reload/shutdown, and
reattaches when the renderer changes. Unsupported versions keep native scrolling;
a fullscreen startup compatibility failure displays a warning. Pi updates can
require adapting this small internal hook in `wheel-hook.ts`.

## Checks

```sh
cd ~/.pi/agent/extensions/adaptive-scroll
npm test
npm run check
```

Tests cover the curve, bounds, resets, native restoration, overlay behavior,
renderer replacement, and the installed Pi implementation's wheel routing.
