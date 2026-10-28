/* Five Clans — browser presentation and controls. The simulation lives in engine.js. */
(() => {
  'use strict';
  const { World, CLANS, WIDTH: W, HEIGHT: H, CAP, STEP } = window.FiveClans;
  const $ = id => document.getElementById(id);
  const canvas = $('simulationCanvas'), ctx = canvas.getContext('2d');
  const chart = $('historyCanvas'), cctx = chart.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const presets = {
    kingdoms: 'Separate territories. A fragile peace at the borders.',
    scatter: 'Everywhere, all at once. No home-ground advantage.',
    siege: 'One rock. An arena of scissors. Can a single spark become an empire?',
    vortex: 'A ring of rivals, all moving with the same current.'
  };
  const verbs = { '0-2': 'crushes', '0-3': 'crushes', '1-0': 'covers', '1-4': 'disproves', '2-1': 'cuts', '2-3': 'decapitates', '3-4': 'poisons', '3-1': 'eats', '4-2': 'smashes', '4-0': 'vaporizes' };
  const images = CLANS.map(c => { const img = new Image(); img.src = `images/${c.id}.svg`; return img; });
  let sprites = [], world, mode = 'convert', paused = reduced, brush = -1, sound = false, audio;
  let accumulator = 0, lastFrame = 0, lastUI = 0, lastSound = 0, soundedContacts = 0;
  let previousCounts = [], leader = -1, lastLeaderTime = -10, endedShown = false, toastTimer;
  let view = { width: W, height: H, scale: 1, ox: 0, oy: 0 }, pointer = null, pointerDown = false, lastPaint = -Infinity;
  const trails = new Map();
  let activeLaw = -1;

  function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
  }
  function clock(time, tenths = false) {
    return `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(Math.floor(time % 60)).padStart(2, '0')}${tenths ? '.' + Math.floor(time % 1 * 10) : ''}`;
  }
  function addEvent(message) {
    const li = document.createElement('li'), time = document.createElement('time'), text = document.createElement('span');
    time.textContent = clock(world.time); text.textContent = message; li.append(time, text);
    $('events').prepend(li); while ($('events').children.length > 24) $('events').lastChild.remove();
  }
  function options() {
    return { seed: $('seed').value.trim() || 'FORGE-005', population: Number($('population').value), clans: Number($('ruleSet').value), preset: $('preset').value, mode, hunting: $('hunting').checked, duration: Number($('duration').value) };
  }
  function loadLink() {
    const p = new URLSearchParams(location.search);
    if (p.has('seed')) $('seed').value = p.get('seed').slice(0, 40) || 'FORGE-005';
    if (presets[p.get('formation')]) $('preset').value = p.get('formation');
    if (['3', '5'].includes(p.get('clans'))) $('ruleSet').value = p.get('clans');
    if (p.has('population')) {
      const n = Number(p.get('population'));
      if (Number.isFinite(n)) $('population').value = Math.round(Math.max(25, Math.min(600, n)) / 5) * 5;
    }
    if (p.has('speed')) { const n = Number(p.get('speed')); if (Number.isFinite(n)) $('speed').value = Math.max(.25, Math.min(3, n)); }
    if (['0', '60', '180', '300'].includes(p.get('duration'))) $('duration').value = p.get('duration');
    if (p.get('mode') === 'eliminate') mode = 'eliminate';
    if (p.get('hunt') === '0') $('hunting').checked = false;
    if (p.has('trails')) $('trails').checked = p.get('trails') !== '0';
    else $('trails').checked = false;
  }
  function updateSettings() {
    $('populationValue').textContent = $('population').value;
    $('speedValue').textContent = `${Number($('speed').value)}×`;
    $('presetHint').textContent = presets[$('preset').value];
    $('convertBtn').setAttribute('aria-pressed', mode === 'convert');
    $('eliminateBtn').setAttribute('aria-pressed', mode === 'eliminate');
    $('modeHint').textContent = mode === 'convert' ? 'The defeated joins the victor’s clan.' : 'The defeated disappears. Population falls.';
    $('preset').options[0].textContent = $('ruleSet').value === '3' ? 'Three kingdoms' : 'Five kingdoms';
    if (world) {
      const next = options(), pending = ['seed', 'population', 'clans', 'preset', 'mode', 'duration'].some(key => next[key] !== world.options[key]);
      $('settingsNote').textContent = pending ? 'New conditions ready. Reforge to apply.' : 'World settings apply on Reforge. Speed and behavior update live.';
      $('settingsNote').classList.toggle('pending', pending);
    }
  }
  function setPaused(value) {
    paused = value; accumulator = 0;
    $('pauseBtn').textContent = paused ? '▶' : 'Ⅱ';
    $('pauseBtn').setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
    $('statusText').textContent = world.ended ? 'EXPERIMENT COMPLETE' : paused ? 'EXPERIMENT PAUSED' : 'LIVE EXPERIMENT';
    $('statusLight').classList.toggle('paused', paused || world.ended);
  }
  function chooseBrush(type) {
    brush = type;
    document.querySelectorAll('.brush').forEach((b, i) => b.setAttribute('aria-pressed', i === type));
    $('observeBtn').setAttribute('aria-pressed', type === -1);
    $('toolHint').textContent = type === -1 ? 'Choose a shape below to add more.' : `${CLANS[type].name} selected · click or drag to add`;
    canvas.style.cursor = type === -1 ? 'default' : 'crosshair';
    // Selecting a brush dismisses the result, making the arena available for intervention.
    if (type >= 0) $('result').hidden = true;
  }
  function buildClans() {
    $('brushes').replaceChildren(); $('clanList').replaceChildren();
    CLANS.slice(0, world.options.clans).forEach((c, i) => {
      const button = document.createElement('button'); button.className = 'brush'; button.style.setProperty('--clan', c.color);
      button.title = `Reinforce ${c.name} (+6 per stroke)`; button.setAttribute('aria-label', `Add ${c.name} reinforcements`); button.setAttribute('aria-pressed', 'false');
      button.innerHTML = `<img src="images/${c.id}.svg" alt=""><span class="brush-label">${c.name}</span><span class="brush-count" aria-hidden="true"></span>`; button.addEventListener('click', () => chooseBrush(i)); $('brushes').append(button);
      const row = document.createElement('div'); row.className = 'clan-row'; row.id = `census-${i}`; row.style.setProperty('--clan', c.color);
      row.innerHTML = `<div class="clan-row-top"><img src="images/${c.id}.svg" alt=""><span class="clan-name">${c.name}</span><span class="clan-count"></span><span class="clan-share"></span></div><div class="meter"><span></span></div>`;
      $('clanList').append(row);
    });
    chooseBrush(-1); buildLaws();
  }
  function reforge() {
    world = new World(options()); $('seed').value = world.options.seed;
    previousCounts = world.counts(); leader = -1; lastLeaderTime = -10; endedShown = false;
    accumulator = 0; soundedContacts = 0; lastPaint = -Infinity; trails.clear(); $('events').replaceChildren(); $('result').hidden = true;
    $('worldLabel').textContent = `WORLD / ${world.options.seed}`;
    $('contactLabel').textContent = mode === 'convert' ? 'CONVERSIONS' : 'ELIMINATIONS';
    buildClans(); updateSettings(); setPaused(reduced);
    addEvent(world.options.preset === 'siege' ? 'A lone rock faces an empire of scissors.' : `${world.agents.length} agents enter. The balance will not hold.`);
    updateUI(); draw();
  }
  function checkMilestones(counts) {
    counts.forEach((n, i) => {
      if (!n && previousCounts[i] > 0) { addEvent(`${CLANS[i].name} has vanished from the arena.`); $('announcement').textContent = `${CLANS[i].name} is extinct.`; }
    });
    const max = Math.max(...counts), leaders = counts.map((n, i) => n === max ? i : -1).filter(i => i >= 0), total = world.agents.length;
    if (leaders.length === 1 && leaders[0] !== leader && world.time - lastLeaderTime > 3 && max / total > 1 / world.options.clans + .03) {
      leader = leaders[0]; lastLeaderTime = world.time; addEvent(`${CLANS[leader].name} takes the lead · ${Math.round(max / total * 100)}% of the arena.`);
    }
    previousCounts = counts;
  }
  function showResult() {
    if (endedShown) return;
    endedShown = true; setPaused(true);
    const counts = world.counts(), max = Math.max(...counts), winners = counts.map((n, i) => n === max ? i : -1).filter(i => i >= 0);
    const title = winners.length === 1 ? `${CLANS[winners[0]].name} ${world.reason === 'dominance' ? 'reigns' : 'leads'}.` : 'A divided arena.';
    $('resultTitle').textContent = title;
    $('resultTitle').style.color = winners.length === 1 ? CLANS[winners[0]].color : '#ffb347';
    $('resultNote').textContent = world.reason === 'dominance' ? `One clan remains after ${clock(world.time)} and ${world.contacts.toLocaleString()} encounters.` : `Time limit reached. ${winners.length > 1 ? 'The leading clans are tied.' : `${max} agents hold the largest population.`}`;
    $('result').hidden = false; addEvent(title); $('announcement').textContent = title;
    tone(196, .3); setTimeout(() => { if (world.ended) tone(294, .4); }, 150);
  }
  function updateUI() {
    const counts = world.counts(), total = world.agents.length;
    $('alive').textContent = total; $('conversions').textContent = world.contacts.toLocaleString(); $('capacity').textContent = `${total} / ${CAP}`;
    $('elapsed').textContent = clock(world.time, true);
    let entropy = 0;
    counts.forEach((n, i) => {
      const p = n / Math.max(1, total), row = $(`census-${i}`);
      row.querySelector('.clan-count').textContent = n; row.querySelector('.clan-share').textContent = `${(p * 100).toFixed(1)}%`;
      row.querySelector('.meter span').style.width = `${p * 100}%`; row.classList.toggle('extinct', !n);
      $('brushes').children[i].querySelector('.brush-count').textContent = n;
      if (p) entropy -= p * Math.log(p);
    });
    const diversity = Math.round(entropy / Math.log(world.options.clans) * 100);
    $('diversityValue').textContent = `${diversity}%`; $('diversityBar').style.width = `${diversity}%`;
    checkMilestones(counts); drawChart();
    if (world.ended) showResult();
  }
  function makeSprites() {
    sprites = CLANS.map((c, i) => {
      const s = document.createElement('canvas'); s.width = s.height = 80; const p = s.getContext('2d');
      p.shadowColor = '#0009'; p.shadowBlur = 5; p.shadowOffsetY = 3;
      if (images[i].complete && images[i].naturalWidth) p.drawImage(images[i], 10, 10, 60, 60);
      else { p.fillStyle = c.color; p.font = '24px sans-serif'; p.textAlign = 'center'; p.textBaseline = 'middle'; p.fillText(c.glyph, 40, 41); }
      return s;
    });
  }
  images.forEach(img => { img.onload = makeSprites; img.onerror = makeSprites; });
  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    // Turn the camera on portrait screens, keeping both the seeded world and
    // the shape artwork intact. This fills a phone without stretching the art.
    const rotated = r.height > r.width * 1.15, margin = r.width < 640 ? 14 : 28;
    const vw = rotated ? H : W, vh = rotated ? W : H, availableHeight = Math.max(1, r.height - 76);
    const scale = Math.min(Math.max(1, r.width - margin * 2) / vw, availableHeight / vh);
    view = { width: r.width, height: r.height, scale, ox: (r.width - vw * scale) / 2, oy: 40 + (availableHeight - vh * scale) / 2, dpr, rotated };
    const cr = chart.getBoundingClientRect(); chart.width = Math.round(cr.width * dpr); chart.height = Math.round(cr.height * dpr);
    if (world) { draw(); drawChart(); }
  }
  function draw() {
    const { width, height, scale: s, ox, oy, dpr = 1 } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
    const backdrop = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * .65);
    backdrop.addColorStop(0, '#17130f'); backdrop.addColorStop(1, '#0d0b09');
    ctx.fillStyle = backdrop; ctx.fillRect(0, 0, width, height);
    if (view.rotated) { ctx.translate(ox + H * s, oy); ctx.rotate(Math.PI / 2); }
    else ctx.translate(ox, oy);
    ctx.scale(s, s);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    ctx.fillStyle = '#ac805015';
    for (let x = 55; x < W; x += 110) for (let y = 55; y < H; y += 110) ctx.fillRect(x - 1, y - 1, 2, 2);
    const liveIds = new Set();
    for (const a of world.agents) {
      liveIds.add(a.id);
      const c = CLANS[a.type];
      if ($('trails').checked && !reduced) {
        const trail = trails.get(a.id);
        if (trail && trail.length > 1) {
          ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y);
          for (const point of trail) ctx.lineTo(point.x, point.y);
          ctx.lineTo(a.x, a.y); ctx.strokeStyle = c.color + '42'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
      const size = Math.max(38, 28 / s);
      if (view.rotated) { ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(-Math.PI / 2); ctx.drawImage(sprites[a.type], -size / 2, -size / 2, size, size); ctx.restore(); }
      else ctx.drawImage(sprites[a.type], a.x - size / 2, a.y - size / 2, size, size);
      if (a.flash > 0 && !reduced) { ctx.beginPath(); ctx.arc(a.x, a.y, 11 + (1 - a.flash) * 13, 0, Math.PI * 2); ctx.globalAlpha = a.flash * .7; ctx.strokeStyle = c.color; ctx.stroke(); ctx.globalAlpha = 1; }
    }
    for (const id of trails.keys()) if (!liveIds.has(id)) trails.delete(id);
    if (!reduced) for (const b of world.bursts) {
      const progress = 1 - b.life / b.max;
      ctx.globalAlpha = (1 - progress) * .65; ctx.strokeStyle = b.type < 0 ? '#ffb347' : CLANS[b.type].color;
      ctx.lineWidth = b.type < 0 ? 2 : 1; ctx.beginPath(); ctx.arc(b.x, b.y, 5 + progress * (b.type < 0 ? 300 : 29), 0, Math.PI * 2); ctx.stroke();
      if (b.type >= 0) for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + b.x; const r = 9 + progress * 33; ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 2, 2); }
    }
    ctx.globalAlpha = 1;
    if (pointer && brush >= 0) {
      ctx.strokeStyle = CLANS[brush].color; ctx.fillStyle = CLANS[brush].color + '0f'; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 32, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.translate(pointer.x, pointer.y); if (view.rotated) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = CLANS[brush].color; ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('+6', 0, -42); ctx.restore();
    }
    ctx.restore();
  }
  function drawChart() {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = chart.width / dpr, h = chart.height / dpr;
    if (!w || !h) return;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0); cctx.clearRect(0, 0, w, h);
    const l = 24, r = w - 4, top = 6, bottom = h - 19, range = Math.max(10, Math.min(120, world.time)), start = Math.max(0, world.time - 120);
    const samples = world.history.filter(s => s.time >= start);
    const last = { time: world.time, counts: world.counts() }; if (!samples.length || last.time > samples.at(-1).time) samples.push(last);
    $('chartEmpty').hidden = world.time > 1;
    const x = t => l + (t - start) / range * (r - l), y = p => bottom - p * (bottom - top);
    for (let type = 0; type < world.options.clans; type++) {
      const coords = samples.map(s => { const total = s.counts.reduce((a, b) => a + b, 0) || 1; const before = s.counts.slice(0, type).reduce((a, b) => a + b, 0) / total; return { x: x(s.time), lo: before, hi: before + s.counts[type] / total }; });
      if (!coords.length) continue;
      cctx.beginPath(); coords.forEach((p, i) => i ? cctx.lineTo(p.x, y(p.hi)) : cctx.moveTo(p.x, y(p.hi)));
      for (let i = coords.length - 1; i >= 0; i--) cctx.lineTo(coords[i].x, y(coords[i].lo));
      cctx.closePath(); cctx.fillStyle = CLANS[type].color + '55'; cctx.fill();
      cctx.beginPath(); coords.forEach((p, i) => i ? cctx.lineTo(p.x, y(p.hi)) : cctx.moveTo(p.x, y(p.hi)));
      cctx.strokeStyle = CLANS[type].color + 'b0'; cctx.lineWidth = 1; cctx.stroke();
    }
    cctx.font = '8px monospace'; cctx.textAlign = 'right'; cctx.fillStyle = '#a19486'; cctx.strokeStyle = '#a194861b';
    for (const p of [0, .5, 1]) { cctx.beginPath(); cctx.moveTo(l, y(p)); cctx.lineTo(r, y(p)); cctx.stroke(); cctx.fillText(Math.round(p * 100), l - 5, y(p) + 3); }
    cctx.textAlign = 'left'; cctx.fillText(clock(start), l, h - 4); cctx.textAlign = 'right'; cctx.fillText(clock(start + range), r, h - 4);
  }
  function buildLaws() {
    const k = world.options.clans, nodes = CLANS.slice(0, k).map((c, i) => { const a = i / k * Math.PI * 2 - Math.PI / 2; return { x: 250 + Math.cos(a) * 160, y: 165 + Math.sin(a) * 125, c }; });
    let markup = '<defs>' + CLANS.slice(0, k).map((c, i) => `<marker id="arrow${i}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10Z" fill="${c.color}"/></marker>`).join('') + '</defs>';
    const laws = [];
    nodes.forEach((a, i) => a.c.beats.filter(j => j < k).forEach(j => {
      const b = nodes[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
      markup += `<path class="rule-edge" data-from="${i}" data-to="${j}" d="M${a.x + ux * 29} ${a.y + uy * 29} Q${(a.x + b.x) / 2 - uy * 20} ${(a.y + b.y) / 2 + ux * 20} ${b.x - ux * 32} ${b.y - uy * 32}" fill="none" stroke="${a.c.color}" stroke-width="1.2" opacity=".38" marker-end="url(#arrow${i})"/>`;
      laws.push(`<li data-from="${i}" data-to="${j}"><b>${a.c.name}</b> ${verbs[`${i}-${j}`]} <b>${b.c.name}</b></li>`);
    }));
    nodes.forEach((n, i) => { markup += `<g class="rule-node" data-clan="${i}" tabindex="0" role="button" aria-label="Show ${n.c.name} relationships" aria-pressed="false"><circle cx="${n.x}" cy="${n.y}" r="25" fill="#15110e" stroke="${n.c.color}" stroke-width="1"/><image href="images/${n.c.id}.svg" x="${n.x - 14}" y="${n.y - 14}" width="28" height="28"/><text x="${n.x}" y="${n.y + 44}" text-anchor="middle">${n.c.name.toUpperCase()}</text></g>`; });
    $('ruleMap').innerHTML = markup; $('lawList').innerHTML = laws.join('');
    $('lawCount').textContent = k === 5 ? 'THE TEN LAWS' : 'THE THREE LAWS';
    $('lawsDescription').textContent = k === 5 ? 'Five clans. Each defeats two and loses to two.' : 'Classic mode. Each defeats one and loses to one.';
    document.querySelector('.laws-copy>p:not(.eyebrow)').textContent = k === 5 ? 'Each clan defeats two and falls to two. A perfect loop of advantages. Click a clan to trace its place in the food chain.' : 'Rock crushes scissors. Scissors cuts paper. Paper covers rock. Click a clan to follow the loop.';
    document.querySelectorAll('.rule-node').forEach(n => {
      const select = () => selectLaw(activeLaw === Number(n.dataset.clan) ? -1 : Number(n.dataset.clan));
      n.addEventListener('click', select); n.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
    }); selectLaw(-1);
  }
  function selectLaw(type) {
    activeLaw = type;
    document.querySelectorAll('.rule-edge').forEach(edge => { const relevant = type < 0 || Number(edge.dataset.from) === type || Number(edge.dataset.to) === type; edge.setAttribute('opacity', relevant ? type < 0 ? '.38' : '.95' : '.06'); edge.setAttribute('stroke-width', type < 0 ? '1.2' : '2'); });
    document.querySelectorAll('#lawList li').forEach(li => li.style.opacity = type < 0 || Number(li.dataset.from) === type || Number(li.dataset.to) === type ? 1 : .2);
    document.querySelectorAll('.rule-node').forEach(node => node.setAttribute('aria-pressed', Number(node.dataset.clan) === type));
  }
  function tone(frequency, duration = .08) {
    if (!sound || !audio || audio.state !== 'running') return;
    const osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
    osc.type = 'sine'; osc.frequency.setValueAtTime(frequency, now); osc.frequency.exponentialRampToValueAtTime(frequency * .65, now + duration);
    gain.gain.setValueAtTime(.025, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    osc.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now + duration);
  }
  function position(event) {
    const r = canvas.getBoundingClientRect(), x = (event.clientX - r.left - view.ox) / view.scale, y = (event.clientY - r.top - view.oy) / view.scale;
    return view.rotated ? { x: y, y: H - x } : { x, y };
  }
  function paint() {
    if (!pointer || brush < 0 || pointer.x < 0 || pointer.y < 0 || pointer.x > W || pointer.y > H) return;
    const amount = world.add(brush, pointer.x, pointer.y);
    if (!amount) { toast('Arena at capacity. Reforge or try elimination mode.'); return; }
    if (world.time - lastPaint > 2 || lastPaint === -Infinity || world.ended || endedShown) addEvent(`${amount} ${CLANS[brush].name} reinforcements enter the arena.`);
    if (endedShown && !world.ended) { endedShown = false; $('result').hidden = true; setPaused(false); }
    lastPaint = world.time; previousCounts = world.counts(); updateUI(); draw();
  }
  canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; pointer = position(e); pointerDown = true; canvas.setPointerCapture(e.pointerId); paint(); lastPaintWall = performance.now(); });
  let lastPaintWall = 0;
  canvas.addEventListener('pointermove', e => { pointer = position(e); if (pointerDown && performance.now() - lastPaintWall > 100) { paint(); lastPaintWall = performance.now(); } });
  function releasePointer() { pointerDown = false; }
  canvas.addEventListener('pointerup', releasePointer); canvas.addEventListener('pointercancel', releasePointer); canvas.addEventListener('lostpointercapture', releasePointer);
  canvas.addEventListener('pointerleave', () => { if (!pointerDown) pointer = null; });
  $('observeBtn').addEventListener('click', () => chooseBrush(-1));
  $('resetBtn').addEventListener('click', () => { reforge(); $('settingsDrawer').close(); });
  $('quickReset').addEventListener('click', reforge); $('againBtn').addEventListener('click', reforge);
  $('pauseBtn').addEventListener('click', () => { if (world.ended) { toast('Add a rival or reforge to begin another battle.'); return; } setPaused(!paused); });
  $('stepBtn').addEventListener('click', () => { setPaused(true); world.step(); updateUI(); draw(); });
  $('disturbBtn').addEventListener('click', () => { world.disturb(); trails.clear(); addEvent('An outside force scatters the arena.'); tone(65, .3); draw(); });
  $('clearLaw').addEventListener('click', () => selectLaw(-1));
  document.querySelectorAll('[data-drawer]').forEach(button => {
    button.addEventListener('click', () => {
      $(button.dataset.drawer).showModal();
      // A previously hidden canvas needs its visible dimensions before drawing.
      requestAnimationFrame(() => { resize(); drawChart(); });
    });
  });
  document.querySelectorAll('.drawer').forEach(drawer => {
    drawer.querySelector('.drawer-close').addEventListener('click', () => drawer.close());
    drawer.addEventListener('click', event => {
      if (event.target !== drawer) return;
      const rect = drawer.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) drawer.close();
    });
  });
  $('convertBtn').addEventListener('click', () => { mode = 'convert'; updateSettings(); });
  $('eliminateBtn').addEventListener('click', () => { mode = 'eliminate'; updateSettings(); });
  for (const id of ['population', 'speed', 'preset', 'ruleSet']) $(id).addEventListener('input', updateSettings);
  for (const id of ['seed', 'duration']) $(id).addEventListener('input', updateSettings);
  $('hunting').addEventListener('change', () => { world.options.hunting = $('hunting').checked; addEvent(world.options.hunting ? 'Pursuit instincts restored.' : 'Instincts quieted. Agents drift and collide.'); });
  $('trails').addEventListener('change', () => trails.clear());
  $('randomSeed').addEventListener('click', () => { const bytes = new Uint32Array(1); crypto.getRandomValues(bytes); $('seed').value = `FORGE-${bytes[0].toString(36).toUpperCase()}`; updateSettings(); toast('New seed ready. Reforge to release it.'); });
  $('soundBtn').addEventListener('click', async () => {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') await audio.resume();
      sound = !sound; $('soundBtn').textContent = sound ? 'Sound on' : 'Sound off'; $('soundBtn').setAttribute('aria-pressed', sound); if (sound) tone(220, .2);
    } catch { toast('Sound is unavailable in this browser.'); }
  });
  $('fullscreenBtn').addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if ($('arenaFrame').requestFullscreen) await $('arenaFrame').requestFullscreen(); else toast('Fullscreen is unavailable in this browser.'); }
    catch { toast('Fullscreen is unavailable in this browser.'); }
  });
  $('shareBtn').addEventListener('click', async () => {
    const o = world.options, url = new URL(location.href); url.hash = ''; url.search = '';
    const values = { seed: o.seed, formation: o.preset, clans: o.clans, population: o.population, mode: o.mode, hunt: o.hunting ? 1 : 0, duration: o.duration, speed: $('speed').value, trails: $('trails').checked ? 1 : 0 };
    for (const [k, v] of Object.entries(values)) url.searchParams.set(k, v);
    try { await navigator.clipboard.writeText(url.href); toast('Experiment link copied. It recreates the opening, before interventions.'); }
    catch { const field = document.createElement('input'); field.value = url.href; field.setAttribute('aria-label', 'Experiment link'); field.style.cssText = 'position:fixed;bottom:80px;left:5%;width:90%;z-index:10001'; document.body.append(field); field.focus(); field.select(); toast('Copy the selected experiment link.'); field.addEventListener('blur', () => field.remove(), { once: true }); }
  });
  $('exportBtn').addEventListener('click', () => {
    const data = world.history.slice(); if (data.at(-1).time !== world.time) data.push({ time: world.time, counts: world.counts(), contacts: world.contacts });
    const lines = [['simulation_seconds', ...CLANS.slice(0, world.options.clans).map(c => c.id), 'encounters'].join(','), ...data.map(s => [s.time.toFixed(3), ...s.counts, s.contacts].join(','))];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })), a = document.createElement('a');
    a.href = url; a.download = `five-clans-${world.options.seed.replace(/[^a-z0-9_-]/gi, '_')}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Population history exported · latest 30 simulation minutes.');
  });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,select,textarea,button,summary,[role="button"],a') || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (e.code === 'Space') { e.preventDefault(); if (!world.ended) setPaused(!paused); }
    else if (e.key.toLowerCase() === 'r') reforge();
    else if (e.key === 'Escape') chooseBrush(-1);
    else if (Number(e.key) >= 1 && Number(e.key) <= world.options.clans) chooseBrush(Number(e.key) - 1);
  });
  document.addEventListener('visibilitychange', () => { lastFrame = 0; accumulator = 0; if (document.hidden && audio) audio.suspend().catch(() => {}); else if (sound && audio) audio.resume().catch(() => {}); });
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, .1) : 0; lastFrame = now;
    if (!paused && !world.ended) {
      accumulator += dt * Number($('speed').value);
      let steps = 0;
      while (accumulator >= STEP && steps++ < 18 && !world.ended) { world.step(); accumulator -= STEP; }
      if ($('trails').checked && !reduced) for (const a of world.agents) { const path = trails.get(a.id) || []; path.push({ x: a.x, y: a.y }); if (path.length > 9) path.shift(); trails.set(a.id, path); }
      if (world.contacts > soundedContacts && now - lastSound > 100) { tone(160 + (world.contacts % 5) * 80); lastSound = now; soundedContacts = world.contacts; }
    }
    if (now - lastUI > 150 || world.ended && !endedShown) { updateUI(); lastUI = now; }
    draw();
  }
  loadLink(); makeSprites(); reforge(); resize();
  new ResizeObserver(resize).observe(canvas.parentElement);
  new ResizeObserver(() => { const dpr = Math.min(devicePixelRatio || 1, 2), r = chart.getBoundingClientRect(); chart.width = Math.round(r.width * dpr); chart.height = Math.round(r.height * dpr); drawChart(); }).observe(chart.parentElement);
  requestAnimationFrame(frame);
  if (reduced) toast('Motion reduced: arena starts paused. Press play when you’re ready.');
})();
