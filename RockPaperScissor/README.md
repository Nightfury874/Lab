# Five Clans

A standalone, build-free experiment within the Forge portfolio. Run `node RockPaperScissor/preview-server.cjs` from the repository root and open `http://127.0.0.1:4173/RockPaperScissor/`. All styles, simulation code and icons live in this directory.

The main view is a single arena with a compact playback and reinforcement bar. Settings, statistics and rules live in native modal drawers, with keyboard focus trapping, Escape/backdrop dismissal and focus restoration. On portrait screens, the camera turns 90 degrees while shape artwork stays upright; the simulation itself is unchanged. The shared forge frame is loaded, with its duplicate floating widgets hidden locally; the header links back to the forge.

## Play

- The arena starts running. Space pauses/resumes, R reforges, 1–5 selects a reinforcement clan, and Escape returns to observation. Keyboard shortcuts leave form controls alone.
- Select a clan below the arena and click or drag to inject six agents at a time. The arena holds at most 700. Reinforcements can reopen a completed battle.
- Disturb pushes agents out from the center. Single-step advances one 1/60-second simulation tick while paused.
- Formation, starting population, number of clans, contact rules, seed and duration apply on **Reforge**. Speed, pursuit behavior and trails change live.
- Share copies a URL that recreates the opening with its conditions, not the current arena or intervention history.
- CSV exports sampled counts, encounters and simulation time for the latest 30 simulation minutes. The chart displays the latest 120 simulation seconds.
- Reduced-motion preference starts the arena paused and removes trails and collision effects. Sound is opt-in and synthesized locally.

## Model

`engine.js` contains the DOM-independent model. Positions live in a fixed 1100 × 720 world, so viewport size does not alter an experiment. A seeded PRNG determines initial placement and injected agents. A fixed 60 Hz timestep keeps trajectories independent of rendering rate; slow devices slow simulated time instead of taking unstable large steps. Speed changes how many simulation steps run per real second.

Local steering seeks the closest prey and avoids the closest predator within 84 world units. Separation, gentle wandering and wall avoidance keep populations moving. Spatial bins accelerate local queries. Contact within two agent radii triggers either conversion or elimination. A brief cooldown prevents the same agent changing clans repeatedly within a single encounter. Every pair has exactly one winner. No births, spontaneous mutations or unreported population changes occur.

The “coexistence” readout is normalized Shannon entropy: `−Σ(pᵢ ln pᵢ) / ln(number of clans)`. It measures population evenness, not win probability. At a time limit, the largest clan leads; equal leaders tie. An untimed experiment ends when one clan remains. Reintroducing a rival after a timed finish begins an untimed continuation.

## Files and checks

- `index.html` — semantic layout and controls.
- `styles.css` — responsive forge palette and local component styling.
- `simulation.js` — canvas rendering, chart, rule map, controls, sharing and export.
- `engine.js` — seeded agent model.
- `images/` — full-color Twemoji shape illustrations, rendered directly without circular badges. Attribution and the upstream CC BY 4.0 graphics license are included in this directory and linked from the rules drawer.

Run `node RockPaperScissor/engine.test.cjs` from the repository root. This checks all directed matchups in both contact modes, deterministic formations, population accounting, boundaries, classic mode, capacity and time limits.

`browser.test.cjs` is an optional Playwright integration check. Make Playwright available through Node module resolution and set `CHROME_PATH` if Chrome is installed somewhere other than the default Windows Program Files location. It checks controls, sharing, CSV downloads, responsive widths and reduced motion. It writes `desktop-preview.png` and `mobile-preview.png` here for visual review.
