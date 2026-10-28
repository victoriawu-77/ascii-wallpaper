# Aster

A wallpaper studio in the browser. The page is a blurred desktop of the current wallpaper, with one floating window of ASCII or ordered dither and the controls on the dark area below.

**Live:** https://victoriawu-77.github.io/ascii-wallpaper/

**Source:** https://github.com/victoriawu-77/ascii-wallpaper

## Run locally

```bash
npm install
npm run dev
```

Vite serves the app from the site root. The build uses a relative base, so the same `dist/` works at `/ascii-wallpaper/` and `/aster-wallpaper/`.

## Build

```bash
npm run build
```

The static site is written to `dist/`, including `.nojekyll` for GitHub Pages. Pages publishes the `gh-pages` branch from the repository root.

## Using it

The window holds the redrawn wallpaper. A short line types itself into the glass field in the center, then clears and tries the next. The animation rests while the field is focused or holds text. A reply appears in a small glass bubble above the field after you send, and it stays in the browser.

ASCII starts in Shadows: mask 90, strength 100, size 37, so the glyphs sit on a washed paper field. Dither starts at mask 88, strength 100, and size 15.

The dock runs in this order. Wallpaper is Meadow, Monarch, Portrait, Horizon, Waves, and one Your file control. Meadow is the flower-field loop. Monarch is the butterfly loop. Portrait, Horizon, and Waves are stills. Look is ASCII or Dither. Palette is a color map: Original leaves the picture alone, then Meadow, Blue, Amber, Lavender, and Mono. Strength and size follow. Actions are Save PNG and Copy link. ASCII and Dither remember their own values when you switch.

Drop an image or video onto the window, or choose Your file. Save PNG downloads the current frame. Copy link writes filter, palette, strength, and size into the address bar so a refresh restores them.

While a video is playing and on screen, the effect samples each frame with `requestVideoFrameCallback`, or `requestAnimationFrame` when that callback does not arrive. Sampling pauses while the tab is hidden, the video is paused, or the stage is off screen. The video element stays under the canvas and is the source. Still images redraw when a control changes.
