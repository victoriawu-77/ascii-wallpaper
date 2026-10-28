# Aster

A wallpaper studio in the browser, with a chat entry in the center of the stage. The stage plays a looping meadow of yellow flowers by default and redraws it as ASCII or as ordered dither. A monarch butterfly loop and three stills are on the same switch.

**Live:** https://victoriawu-77.github.io/aster-wallpaper/

## Run locally

```bash
npm install
npm run dev
```

Vite serves the app at `/aster-wallpaper/`.

## Build

```bash
npm run build
```

The static site is written to `dist/`, including `.nojekyll` for GitHub Pages. Pages publishes the `gh-pages` branch from the repository root.

## Using it

The center of the stage is one glass field. A short line types itself into the placeholder, then clears and tries the next. The animation rests while the field is focused or holds text. A reply appears in a small glass bubble above the field after you send, and it stays in the browser.

The dock runs in this order. Wallpaper is Meadow, Monarch, Portrait, Horizon, Waves, and one Your file control. Meadow is the flower-field loop. Monarch is the butterfly loop. Portrait, Horizon, and Waves are stills. Look is ASCII or Dither. Palette is a color map: Original leaves the picture alone, then Meadow, Blue, Amber, Lavender, and Mono. Strength and size follow. Actions are Save PNG and Copy link. ASCII and Dither remember their own values when you switch.

Drop an image or video onto the stage, or choose Your file. Save PNG downloads the current frame. Copy link writes filter, palette, strength, and size into the address bar so a refresh restores them.

While a video is playing and on screen, the effect samples each frame with `requestVideoFrameCallback`, or `requestAnimationFrame` when that callback does not arrive. Sampling pauses while the tab is hidden, the video is paused, or the stage is off screen. The video element stays under the canvas and is the source. Still images redraw when a control changes.
