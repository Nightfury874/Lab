/* Fixed-step, seeded simulation. No DOM dependencies; also loadable in Node tests. */
(function (root) {
  'use strict';
  const CLANS = [
    { id: 'rock', name: 'Rock', color: '#efa65d', glyph: '◆', beats: [2, 3] },
    { id: 'paper', name: 'Paper', color: '#86c9ca', glyph: '▱', beats: [0, 4] },
    { id: 'scissors', name: 'Scissors', color: '#e17e79', glyph: '✂', beats: [1, 3] },
    { id: 'lizard', name: 'Lizard', color: '#a6c27c', glyph: '⌁', beats: [4, 1] },
    { id: 'spock', name: 'Spock', color: '#b3a0df', glyph: '⋎', beats: [2, 0] }
  ];
  const WIDTH = 1100, HEIGHT = 720, RADIUS = 9, CAP = 700, STEP = 1 / 60;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  function seeded(seed) {
    let state = 2166136261;
    for (const ch of String(seed)) state = Math.imul(state ^ ch.charCodeAt(0), 16777619);
    return () => {
      state += 0x6D2B79F5;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  class World {
    constructor(options = {}) {
      this.options = { seed: 'FORGE-005', population: 250, clans: 5, preset: 'kingdoms', mode: 'convert', hunting: true, duration: 0, ...options };
      this.options.clans = Number(this.options.clans) === 3 ? 3 : 5;
      this.options.population = clamp(Math.round(Number(this.options.population) || 250), 1, CAP);
      this.random = seeded(this.options.seed);
      this.agents = []; this.time = 0; this.contacts = 0; this.tick = 0;
      this.nextId = 0; this.ended = false; this.reason = ''; this.bursts = []; this.history = [];
      this.seed(); this.sample();
    }
    make(type, x, y, angle) {
      const speed = 52 + this.random() * 24;
      return { id: this.nextId++, type, x: clamp(x, RADIUS, WIDTH - RADIUS), y: clamp(y, RADIUS, HEIGHT - RADIUS), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, cooldown: .45, flash: 0, dead: false };
    }
    seed() {
      const { population: n, clans: k, preset } = this.options;
      for (let i = 0; i < n; i++) {
        let type = i % k, x, y, a = this.random() * Math.PI * 2;
        if (preset === 'siege') {
          // One rock surrounded by scissors: a conversion cascade waiting to happen.
          type = i === 0 ? 0 : 2;
          const r = i === 0 ? 0 : 42 + Math.sqrt(this.random()) * 245;
          x = WIDTH / 2 + Math.cos(a) * r * 1.35; y = HEIGHT / 2 + Math.sin(a) * r;
        } else if (preset === 'kingdoms') {
          const sector = type * Math.PI * 2 / k - Math.PI / 2;
          const r = Math.sqrt(this.random()) * 112;
          x = WIDTH / 2 + Math.cos(sector) * 280 + Math.cos(a) * r;
          y = HEIGHT / 2 + Math.sin(sector) * 215 + Math.sin(a) * r;
        } else if (preset === 'vortex') {
          const r = 100 + Math.sqrt(this.random()) * 185;
          x = WIDTH / 2 + Math.cos(a) * r * 1.4; y = HEIGHT / 2 + Math.sin(a) * r;
        } else { x = 30 + this.random() * (WIDTH - 60); y = 30 + this.random() * (HEIGHT - 60); }
        this.agents.push(this.make(type, x, y, preset === 'vortex' ? a + Math.PI / 2 : this.random() * Math.PI * 2));
      }
    }
    counts() {
      const counts = Array(this.options.clans).fill(0);
      for (const a of this.agents) if (!a.dead) counts[a.type]++;
      return counts;
    }
    sample() {
      this.history.push({ time: this.time, counts: this.counts(), contacts: this.contacts });
      // Full CSV history at half-second resolution, capped at 30 simulation minutes.
      if (this.history.length > 3601) this.history.shift();
    }
    add(type, x, y, count = 6) {
      if (!Number.isInteger(type) || type < 0 || type >= this.options.clans) return 0;
      const amount = Math.min(count, CAP - this.agents.length);
      for (let i = 0; i < amount; i++) {
        const a = this.random() * Math.PI * 2, r = Math.sqrt(this.random()) * 24;
        this.agents.push(this.make(type, x + Math.cos(a) * r, y + Math.sin(a) * r, this.random() * Math.PI * 2));
      }
      if (amount && this.counts().filter(Boolean).length > 1) {
        this.ended = false; this.reason = '';
        // An intervention after a timed match explicitly opens an untimed continuation.
        if (this.options.duration && this.time >= this.options.duration) this.options.duration = 0;
      }
      return amount;
    }
    disturb(x = WIDTH / 2, y = HEIGHT / 2) {
      for (const a of this.agents) {
        const dx = a.x - x, dy = a.y - y, d = Math.hypot(dx, dy) || 1;
        a.vx += dx / d * 125; a.vy += dy / d * 125;
      }
      this.bursts.push({ x, y, type: -1, life: 1, max: 1 });
    }
    step() {
      if (this.ended) return;
      const dt = STEP, cell = 84, columns = Math.ceil(WIDTH / cell), grid = new Map();
      // Snapshot neighborhoods before moving; every agent sees the same tick state.
      for (const a of this.agents) {
        const key = Math.floor(a.x / cell) + Math.floor(a.y / cell) * columns;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(a);
        a.cooldown = Math.max(0, a.cooldown - dt); a.flash = Math.max(0, a.flash - dt * 2);
      }
      const accelerations = [];
      for (const a of this.agents) {
        let fx = 0, fy = 0, prey = null, predator = null, pd = cell * cell, td = pd;
        const gx = Math.floor(a.x / cell), gy = Math.floor(a.y / cell);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (gx + ox < 0 || gx + ox >= columns || gy + oy < 0) continue;
          const near = grid.get(gx + ox + (gy + oy) * columns);
          if (!near) continue;
          for (const b of near) {
            if (a === b) continue;
            const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
            if (d2 < 24 * 24 && d2 > .01) { fx -= dx / d2 * 140; fy -= dy / d2 * 140; }
            if (b.type === a.type) continue;
            if (CLANS[a.type].beats.includes(b.type)) { if (d2 < pd) { prey = b; pd = d2; } }
            else if (d2 < td) { predator = b; td = d2; }
          }
        }
        if (this.options.hunting) {
          if (prey) { const d = Math.sqrt(pd) || 1; fx += (prey.x - a.x) / d * 80; fy += (prey.y - a.y) / d * 80; }
          if (predator) { const d = Math.sqrt(td) || 1; fx -= (predator.x - a.x) / d * 110; fy -= (predator.y - a.y) / d * 110; }
        }
        // Gentle deterministic wandering prevents isolated agents becoming stuck.
        fx += Math.sin(this.tick * .024 + a.id * 2.399) * 16;
        fy += Math.cos(this.tick * .021 + a.id * 1.618) * 16;
        if (a.x < 55) fx += 80; if (a.x > WIDTH - 55) fx -= 80;
        if (a.y < 55) fy += 80; if (a.y > HEIGHT - 55) fy -= 80;
        accelerations.push([fx, fy]);
      }
      for (let i = 0; i < this.agents.length; i++) {
        const a = this.agents[i], [fx, fy] = accelerations[i];
        a.vx += fx * dt; a.vy += fy * dt;
        let speed = Math.hypot(a.vx, a.vy);
        if (speed < .01) { a.vx = 35; speed = 35; }
        const target = clamp(speed, 35, 105), ratio = target / speed;
        a.vx *= ratio; a.vy *= ratio; a.x += a.vx * dt; a.y += a.vy * dt;
        if (a.x < RADIUS || a.x > WIDTH - RADIUS) { a.x = clamp(a.x, RADIUS, WIDTH - RADIUS); a.vx *= -1; }
        if (a.y < RADIUS || a.y > HEIGHT - RADIUS) { a.y = clamp(a.y, RADIUS, HEIGHT - RADIUS); a.vy *= -1; }
      }
      // Rebuild after movement so contacts use current positions, never stale cells.
      grid.clear();
      for (const a of this.agents) {
        const key = Math.floor(a.x / cell) + Math.floor(a.y / cell) * columns;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(a);
      }
      for (const a of this.agents) {
        if (a.dead || a.cooldown > 0) continue;
        const gx = Math.floor(a.x / cell), gy = Math.floor(a.y / cell);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          if (gx + ox < 0 || gx + ox >= columns || gy + oy < 0) continue;
          const near = grid.get(gx + ox + (gy + oy) * columns);
          if (!near) continue;
          for (const b of near) {
            if (b.id <= a.id || b.dead || a.dead || a.cooldown > 0 || b.cooldown > 0 || a.type === b.type) continue;
            if ((b.x - a.x) ** 2 + (b.y - a.y) ** 2 > (RADIUS * 2) ** 2) continue;
            const winner = CLANS[a.type].beats.includes(b.type) ? a : b, loser = winner === a ? b : a;
            this.contacts++;
            if (this.bursts.length < 100) this.bursts.push({ x: loser.x, y: loser.y, type: winner.type, life: .6, max: .6 });
            if (this.options.mode === 'eliminate') loser.dead = true;
            else { loser.type = winner.type; loser.flash = 1; }
            loser.cooldown = .5; winner.cooldown = .12;
          }
        }
      }
      this.agents = this.agents.filter(a => !a.dead);
      this.bursts = this.bursts.filter(b => (b.life -= dt) > 0);
      this.tick++; this.time = this.tick * dt;
      const surviving = this.counts().filter(Boolean).length;
      if (surviving <= 1) { this.ended = true; this.reason = 'dominance'; }
      else if (this.options.duration && this.time >= this.options.duration) { this.ended = true; this.reason = 'time'; }
      if (this.tick % 30 === 0 || this.ended) this.sample();
    }
  }
  const api = { World, CLANS, WIDTH, HEIGHT, RADIUS, CAP, STEP, seeded };
  root.FiveClans = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
