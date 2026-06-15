# Equalify

A Manifest V3 Chrome extension that adds a real-time equalizer, bass boost, reverb, stereo width, 8D rotation, and speed/pitch presets (slowed + reverb, nightcore, lo-fi) to web audio.

## What it works on

- **YouTube** - full support (normal HTML5 video).
- **SoundCloud, Bandcamp, and most sites** with an HTML5 `<audio>`/`<video>` element.
- **Spotify and other DRM/EME-protected streams: not supported.** Chrome blocks Web Audio from accessing decrypted DRM samples, so protected tracks can't be processed. This is a browser-level limitation, not something an extension can bypass.

## Features

- Volume boost (up to 600%) with a transparent peak limiter that keeps boosts clean (and leaves Flat untouched)
- Psychoacoustic bass enhancer (deeper-sounding bass on small speakers), clarity exciter, and an optional loudness mode
- Preamp, bass (low-shelf) and treble (high-shelf)
- 5-band graphic EQ (60 / 230 / 910 / 3.6k / 14k Hz)
- Reverb (synthesized impulse), stereo width (mid/side), 8D auto-rotation
- Speed control, with an optional **keep-pitch** toggle (podcast speed vs nightcore pitch-shift)
- One-click presets: Flat, Bass boost, Slowed + reverb, Nightcore, Lo-fi, 8D
- **Save your own custom presets**
- **Per-site memory** - settings are remembered separately for each site
- **Full-screen visualizer** (old-school Winamp style) - click the mini visualizer to launch it. Beat-reactive with additive neon glow, peak-hold caps, a bass-driven background glow, and an auto-cycle option. Five modes: Spectrum bars, Radial, Waveform, Orb (radial oscilloscope) and Particles. M = cycle mode, A = auto-cycle, F = fullscreen, Esc = close.
- **Live spectrum visualizer** and a **tab status** indicator in the popup
- Double-click a slider to reset, scroll over it to fine-tune
- All processing is local: no servers, no tracking

## How it works

The popup writes settings to `chrome.storage.local`. A content script builds a Web Audio graph from the page's media element
(`createMediaElementSource` -> preamp -> bass -> 5 peaking bands -> treble -> mid/side width -> 8D panner -> reverb mix -> compressor -> output)
and reacts to storage changes to update parameters live. No servers, no tracking, no data leaves the browser.

## Install (unpacked)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder
4. Open YouTube, play a video, click the Equalify toolbar icon and tweak

## Notes / roadmap

- Speed is applied via `playbackRate`, so it changes pitch too (intended for slowed/nightcore).
- Planned: record/export the current session to a file (with a clear "for your own/lawful audio" caveat), an on-page visualizer, and a Cloudflare-hosted landing page.
