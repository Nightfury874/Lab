# Tenebris Drakonos Forge

Nihar Basisth's lab: physics simulations, dev tools and small experiments, kept in a living forge guarded by a dragon called Nightfury.

**Live:** https://nightfury874.github.io/Lab/

## The workshop

| Experiment | What it is | Path |
| --- | --- | --- |
| RBMK Reactor | An RBMK-1000 core you can run: two-group diffusion, point kinetics, boiling, xenon, graphite-tipped rods — and 26 April 1986 | [`nuclear.html`](nuclear.html) |
| Double Pendulum | Chaos from two hinges, integrated with RK4 | [`Pendulum/`](Pendulum/) |
| JSON Ledger | JSON viewer, editor and diff checker | [`JSONViewer/`](JSONViewer/) |
| Wind Tunnel | Incompressible Euler fluid on a staggered grid; draw your own obstacles | [`WindTunnel/`](WindTunnel/) |
| Rock Paper Scissors Lizard Spock | Five clans hunting and converting each other | [`RockPaperScissor/`](RockPaperScissor/) |
| Crucible | Impulse-based collisions with tunable restitution | [`Collision/`](Collision/) |

Trinkets that live in their own repos: [Queens Replay](https://nightfury874.github.io/QueensByLinkedinReplay/), [Mindful Breathing](https://nightfury874.github.io/MindfulBreathing/), [Dictionary Lol](https://nightfury874.github.io/DictionaryLol/), [Edge Bookmark](https://nightfury874.github.io/EdgeBookmark/), [Web Sticky Note](https://nightfury874.github.io/WebStickyNote/), [CLOC Badge](https://github.com/marketplace/actions/generate-cloc-badge).

## How the forge works

Everything is plain files served by GitHub Pages; there is no build step yet.

| File | Role |
| --- | --- |
| `forge/manifest.js` | The single list of experiments, trinkets, ingots and links. Add an experiment here. |
| `forge/main.js` | The homepage: intro, fire, sparks, embers, hover heat, Nightfury's behaviour, secrets |
| `forge/fluid.js` | The smoke — the same Eulerian solver as the Wind Tunnel |
| `forge/dragon.js` | Nightfury's body: IK spine, legs, wings, low-poly shading |
| `forge/previews.js` | The live miniatures shown on hover |
| `forge/audio.js` | Synthesised sound (Web Audio, off by default) |
| `forge/lab-frame.js` | Shared frame on every experiment: back-to-forge ember, notes, peeking dragon |

### Adding an experiment

1. Add an entry to `experiments` in `forge/manifest.js` (id, name, hook, path, kind, added, notes).
2. Optionally add a `preview` factory with the same id in `forge/previews.js` for a live miniature.
3. Add `<script src="../forge/lab-frame.js" data-id="<id>" defer></script>` before `</body>` on the experiment's page.

There are secrets. `forge.reveal()` in the console is a start.
