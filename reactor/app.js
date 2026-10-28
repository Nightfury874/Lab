// The control room: wires the reactor to the screen, the panel, the trends and the sound.
(function () {
    'use strict';

    const G = window.Reactor.GRID, SCEN = window.ReactorScenarios;
    const $ = id => document.getElementById(id);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    const R = new window.Reactor({ nTarget: innerWidth < 700 ? 340 : 650 });
    const view = new window.ReactorView($('core'), R);
    window.rbmk = R; // poke at the physics from the console

    // ------------------------------------------------------------------ formatting
    const fmtPower = mw => {
        if (mw < 1) return [(mw * 1000).toFixed(mw < 0.01 ? 2 : 1), 'kW'];
        if (mw < 1000) return [mw.toFixed(mw < 10 ? 2 : mw < 100 ? 1 : 0), 'MW'];
        return [(mw / 1000).toFixed(2), 'GW'];
    };
    const fmtClock = s => {
        s = Math.floor(s) % 86400;
        return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':');
    };
    const setpointFrom = x => 10 * Math.pow(360, x / 1000);
    const setpointTo = mw => Math.round(Math.log(mw / 10) / Math.log(360) * 1000);

    // ------------------------------------------------------------------ scenarios
    let scenarioId = null, script = [], fired = new Set(), clockBase = null, loading = false;
    let trend = [], peaks = {}, warn = {}, xeLast = 0, xeRate = 0, startOrm = 0;

    for (const [id, sc] of Object.entries(SCEN)) {
        const o = document.createElement('option');
        o.value = id; o.textContent = sc.name;
        $('scenario').appendChild(o);
    }

    function load(id) {
        scenarioId = id;
        $('scenario').value = id;
        loading = true;
        $('loading').hidden = false;
        $('wreck').hidden = true;
        // let the loading veil paint before the solver runs
        setTimeout(() => {
            const sc = SCEN[id];
            sc.setup(R);
            for (const r of R.rods) r.override = false;
            script = sc.script || [];
            fired = new Set();
            clockBase = sc.clock ?? null;
            view.boom = null; view.bubbles = []; view.shake = 0;
            trend = []; warn = {};
            peaks = { P: R.power, rho: R.dollars, Tf: R.maxTf };
            xeLast = R.avgXe; xeRate = 0;
            startOrm = R.orm;
            syncControls();
            showIntro(sc);
            renderLog(true);
            loading = false;
            $('loading').hidden = true;
            try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// */ }
        }, 40);
    }

    function showIntro(sc) {
        const box = $('intro');
        box.classList.remove('fade');
        box.innerHTML = '';
        const h = document.createElement('h3'); h.textContent = sc.name;
        const p = document.createElement('p'); p.style.margin = '0'; p.textContent = sc.intro;
        const b = document.createElement('button'); b.className = 'btn ghost'; b.textContent = 'Got it';
        b.addEventListener('click', () => box.classList.add('fade'));
        box.append(h, p, b);
        clearTimeout(box._t);
        box._t = setTimeout(() => box.classList.add('fade'), 22000);
    }

    // ------------------------------------------------------------------ controls
    function syncControls() {
        $('rr').value = Math.round(R.rrTarget * 100);
        $('ar').checked = R.ar.on;
        $('arSet').value = setpointTo(clamp(R.ar.setpoint, 10, 3600));
        $('flow').value = Math.round(R.flowTarget * 100);
        $('prot').checked = R.protection;
        const opts = [...$('warp').options].map(o => +o.value);
        $('warp').value = opts.reduce((a, b) => Math.abs(b - R.warp) < Math.abs(a - R.warp) ? b : a);
        $('cover').parentElement.classList.remove('open');
    }

    $('rr').addEventListener('input', e => {
        R.rrTarget = e.target.value / 100;
        for (const r of R.rods) if (r.group === 'RR') r.override = false;
    });
    $('ar').addEventListener('change', e => {
        if (R.scram) { e.target.checked = false; return; }
        R.ar.on = e.target.checked;
        if (R.ar.on && R.power > 10) {
            R.ar.setpoint = clamp(R.power, 10, 3600);    // bumpless transfer
            $('arSet').value = setpointTo(R.ar.setpoint);
        }
        for (const r of R.rods) if (r.group === 'AR') r.override = false;
        R.log(R.ar.on ? 'Automatic regulator engaged.' : 'Automatic regulator off — manual control.');
    });
    $('arSet').addEventListener('input', e => { R.ar.setpoint = setpointFrom(+e.target.value); });
    $('flow').addEventListener('input', e => { R.flowTarget = e.target.value / 100; R.flowRate = 0.1; });
    $('prot').addEventListener('change', e => {
        R.protection = e.target.checked;
        R.log(R.protection ? 'Emergency protection armed.' : 'Emergency protection disabled.', R.protection ? 'info' : 'warn');
    });
    $('warp').addEventListener('change', e => { R.warp = +e.target.value; });
    $('scenario').addEventListener('change', e => load(e.target.value));
    $('restart').addEventListener('click', () => load(scenarioId));
    $('again').addEventListener('click', () => load(scenarioId));
    $('calm').addEventListener('click', () => load('steady'));

    const az = $('cover').parentElement;
    $('cover').addEventListener('click', () => {
        az.classList.add('open');
        clearTimeout(az._t);
        az._t = setTimeout(() => az.classList.remove('open'), 8000);
    });
    $('az5').addEventListener('click', () => {
        if (R.state !== 'running') return;
        if (R.scram) {
            // reset once the rods are home
            if (R.rods.every(r => r.pos > 0.995)) {
                R.scram = false;
                R.rrTarget = 1;
                for (const r of R.rods) { r.target = r.pos; r.override = false; }
                syncControls();
                R.log('AZ-5 reset. Rods under manual control.');
            }
            return;
        }
        R.az5();
        audio.klaxon();
        az.classList.remove('open');
    });

    document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.modes button').forEach(x => x.classList.toggle('on', x === b));
        view.mode = b.dataset.mode;
        renderLegend();
    }));

    const LEGENDS = {
        flux: ['Thermal neutron flux', 'low', 'high', 'linear-gradient(90deg, rgb(10,20,60), rgb(80,220,255))'],
        power: ['Fission power', 'none', '3× average', 'linear-gradient(90deg, #3c140e, #ff6a2b, #fff4d6)'],
        void: ['Steam in the channel', 'water', 'steam', 'linear-gradient(90deg, rgb(20,70,160), rgb(235,240,250))'],
        xenon: ['Xenon-135', 'none', '2.5× full-power equilibrium', 'linear-gradient(90deg, rgb(20,40,30), rgb(190,90,255))'],
        temp: ['Fuel temperature', '270 °C', '2,770 °C', 'linear-gradient(90deg, #3c140e, #ff6a2b, #fff4d6)']
    };
    const legendHTML = $('legend').innerHTML;
    function renderLegend() {
        const l = $('legend'), m = LEGENDS[view.mode];
        if (!m) { l.innerHTML = legendHTML; return; }
        l.innerHTML = '';
        const bar = document.createElement('i');
        bar.className = 'bar-scale';
        bar.style.background = m[3];
        const wrap = document.createElement('span');
        wrap.append(m[0] + ': ' + m[1], bar, m[2]);
        l.append(wrap);
    }

    $('sound').addEventListener('click', () => {
        audio.toggle();
        $('sound').setAttribute('aria-pressed', audio.on);
        $('sound').textContent = audio.on ? 'Sound on' : 'Sound off';
    });

    // ------------------------------------------------------------------ the core canvas: hover + drag rods
    let dragging = null;
    const canvas = $('core');
    function local(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

    canvas.addEventListener('pointerdown', e => {
        const [x, y] = local(e), h = view.hit(x, y);
        if (h && h.type === 'rod' && !R.scram && R.state === 'running') {
            dragging = h.rod;
            canvas.setPointerCapture(e.pointerId);
            moveRod(y);
        }
    });
    canvas.addEventListener('pointermove', e => {
        const [x, y] = local(e);
        if (dragging) { moveRod(y); }
        const h = view.hit(x, y);
        view.hover = h;
        const tip = $('tip');
        if (!h) { tip.hidden = true; return; }
        tip.hidden = false;
        tip.innerHTML = tipText(h);
        const r = canvas.getBoundingClientRect();
        tip.style.left = Math.min(x + 14, r.width - 290) + 'px';
        tip.style.top = Math.min(y + 14, r.height - 120) + 'px';
    });
    canvas.addEventListener('pointerleave', () => { view.hover = null; $('tip').hidden = true; });
    canvas.addEventListener('pointerup', () => { dragging = null; });

    function moveRod(y) {
        const gy = (y - view.y0) / view.s;
        const t = clamp((gy - G.CT) / G.CR, 0, 1);
        dragging.target = t;
        dragging.override = true;
        if (dragging.group === 'AR' && R.ar.on) { R.ar.on = false; $('ar').checked = false; R.log('Regulator rod taken by hand — automatic regulator off.'); }
    }

    function tipText(h) {
        const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        if (h.type === 'rod') {
            const r = h.rod;
            const what = r.group === 'AR' ? 'automatic regulator' : 'manual control rod';
            return `<b>${esc(r.name)}</b> · ${what}<br>inserted ${(r.pos * 100).toFixed(0)}% · target ${(r.target * 100).toFixed(0)}%<br><span>Boron absorber on top, 1.25 m of water, then a 4.5 m graphite displacer. Drag to move it.</span>`;
        }
        const k = h.c * G.NY + h.r;
        if (G.COL[h.c] === 'fuel' && h.r >= G.CT && h.r < G.CB) {
            const depth = ((h.r - G.CT + 0.5) * G.ROW_M).toFixed(1);
            return `<b>Fuel channel</b> · ${depth} m below the top of the core<br>fuel ${R.Tf[k].toFixed(0)} °C · water ${R.Tw[k].toFixed(0)} °C<br>steam void ${(R.alpha[k] * 100).toFixed(0)}% · xenon ${(R.X[k] / G.XEQ1).toFixed(2)}×<br>power ${R.q[k] >= 1 ? R.q[k].toFixed(1) + ' MW' : (R.q[k] * 1000).toFixed(1) + ' kW'}`;
        }
        return `<b>Graphite</b><br><span>Moderator and reflector. Slows neutrons until uranium-235 can catch them. Stack at ${R.Tg.toFixed(0)} °C.</span>`;
    }

    // ------------------------------------------------------------------ warnings, log
    function watch() {
        const p = R.p;
        const flag = (id, on, text, level) => {
            if (on && !warn[id]) { warn[id] = true; R.log(text, level); }
            if (!on && warn[id] === true) warn[id] = 'reset';
            if (!on && warn[id] === 'reset') warn[id] = false;
        };
        flag('orm', R.orm < 15 && R.power > 1, `ORM below 15 rods (${R.orm}) — the regulations require the reactor to be shut down.`, 'warn');
        flag('prompt', R.dollars >= 1, 'Prompt critical: power is now growing on prompt neutrons alone.', 'alarm');
        flag('period', R.period > 0 && R.period < 20 && R.power > 0.01 * p.Pnom, `Short period: power is multiplying every ${(R.period * Math.LN2).toFixed(0)} s.`, 'warn');
        flag('void', R.avgVoid > 0.6, 'Average steam void above 60%.', 'warn');
        flag('fuel', R.maxTf > 2300, 'Fuel above 2,300 °C — it melts at about 2,800.', 'alarm');
        flag('xenon', xeRate > 0.004 && R.warp > 1, 'Xenon-135 building up — it is eating your reactivity.', 'warn');
    }

    let logCount = -1;
    function renderLog(force) {
        if (!force && R.events.length === logCount) return;
        logCount = R.events.length;
        const ol = $('log');
        ol.innerHTML = '';
        for (const e of R.events.slice(-9)) {
            const li = document.createElement('li');
            li.className = e.level;
            const t = document.createElement('time');
            t.textContent = clockBase != null ? fmtClock(clockBase + e.t) : 't+' + e.t.toFixed(1) + 's';
            li.append(t, e.text);
            ol.appendChild(li);
        }
    }

    // ------------------------------------------------------------------ HUD
    function hud() {
        const [v, u] = fmtPower(R.power);
        $('pVal').textContent = v; $('pUnit').textContent = u;
        $('pPct').textContent = `${(R.power / R.p.Pnom * 100).toFixed(R.power < 32 ? 2 : 1)}% of nominal`;
        const pos = clamp((Math.log10(Math.max(R.power, 1e-3)) + 3) / 7.5, 0, 1);
        $('needle').style.left = `calc(${(pos * 100).toFixed(2)}% - 2px)`;
        const set = (id, text, cls) => { const el = $(id); el.textContent = text; el.className = cls || ''; };
        const d = R.dollars;
        set('rho', `${d >= 0 ? '+' : ''}${d.toFixed(2)} $`, d >= 1 ? 'bad' : d > 0.4 ? 'warn' : '');
        set('keff', R.k.toFixed(5));
        const T = R.period;
        set('period', !isFinite(T) || Math.abs(T) > 999 ? '∞' : `${T > 0 ? '' : '−'}${Math.abs(T).toFixed(Math.abs(T) < 10 ? 1 : 0)} s`, T > 0 && T < 20 ? 'bad' : '');
        set('orm', `${R.orm} rods`, R.orm < 15 ? 'bad' : R.orm < 30 ? 'warn' : '');
        set('void', `${(R.avgVoid * 100).toFixed(0)}%`, R.avgVoid > 0.6 ? 'warn' : '');
        set('xe', `${R.avgXe.toFixed(2)}×`, xeRate > 0.004 ? 'warn' : '');
        set('tf', `${R.maxTf.toFixed(0)} °C`, R.maxTf > 2400 ? 'bad' : R.maxTf > 2150 ? 'warn' : '');
        set('tin', `${R.Tin.toFixed(1)} °C`, R.p.Tsat - R.Tin < 2 ? 'warn' : '');
        const lamp = (id, on, red) => { const el = document.querySelector(`[data-lamp="${id}"]`); el.classList.toggle('on', !!on); el.classList.toggle('red', !!(on && red)); };
        lamp('prompt', d >= 1, true);
        lamp('period', T > 0 && T < 20 && R.power > 1, T > 0 && T < 10);
        lamp('orm', R.orm < 15 && R.power > 1);
        lamp('void', R.avgVoid > 0.6);
        lamp('fuel', R.maxTf > 2300, R.maxTf > 2550);
        lamp('xenon', xeRate > 0.004);
        lamp('prot', !R.protection);
        lamp('scram', R.scram, true);
        $('rrVal').textContent = `${Math.round(R.rrTarget * 100)}%`;
        $('arVal').textContent = R.ar.on ? fmtPower(R.ar.setpoint).join(' ') : 'off';
        $('flowVal').textContent = `${Math.round(R.flow * 100)}%`;
        $('ar').checked = R.ar.on;
        $('rr').value = Math.round(R.rrTarget * 100);
        const press = $('az5');
        const resettable = R.scram && R.rods.every(r => r.pos > 0.995);
        press.firstChild.textContent = R.scram ? (resettable ? 'RESET' : 'AZ-5') : 'AZ-5';
        press.querySelector('small').textContent = R.scram ? (resettable ? 'release the rods' : 'rods driving in…') : 'emergency shutdown';
        if (R.scram && resettable) az.classList.add('open');
        $('clock').textContent = clockBase != null ? fmtClock(clockBase + R.time) : 'plant +' + fmtClock(R.plantHours * 3600);
        renderLog();
    }

    // ------------------------------------------------------------------ trends
    const gcan = $('graphs'), gctx = gcan.getContext('2d');
    let GW = 0, GH = 0;
    function sizeGraphs() {
        const dpr = Math.min(2, devicePixelRatio || 1), r = gcan.getBoundingClientRect();
        GW = r.width; GH = r.height;
        gcan.width = Math.round(GW * dpr); gcan.height = Math.round(GH * dpr);
        gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function sample() {
        trend.push({ t: R.time, P: R.power, rho: R.dollars, v: R.avgVoid, x: R.avgXe, tf: R.maxTf });
        if (trend.length > 480) trend.shift();
    }
    function panel(x, y, w, h, title, value, series, opts) {
        const c = gctx;
        c.fillStyle = '#0d0a0a'; c.fillRect(x, y, w, h);
        c.strokeStyle = '#231b19'; c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        const px = x + 8, pw = w - 16, py = y + 26, ph = h - 36;
        const t1 = trend.length ? trend[trend.length - 1].t : 0, t0 = t1 - 120;
        const X = t => px + (t - t0) / 120 * pw;
        const Y = v => py + ph - clamp((opts.map(v) - opts.lo) / (opts.hi - opts.lo), 0, 1) * ph;
        if (opts.bands) for (const b of opts.bands) {
            const ya = Y(b.from), yb = Y(b.to);
            c.fillStyle = b.color; c.fillRect(px, Math.min(ya, yb), pw, Math.abs(yb - ya));
        }
        if (opts.lines) for (const l of opts.lines) {
            c.strokeStyle = l.color; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(px, Y(l.v)); c.lineTo(px + pw, Y(l.v)); c.stroke(); c.setLineDash([]);
            c.fillStyle = l.color; c.font = '10px "JetBrains Mono", monospace'; c.textAlign = 'right'; c.fillText(l.label, px + pw, Y(l.v) - 3);
        }
        for (const s of series) {
            c.strokeStyle = s.color; c.lineWidth = 1.6; c.beginPath();
            let first = true;
            for (const d of trend) { if (d.t < t0) continue; const xx = X(d.t), yy = Y(s.get(d)); if (first) { c.moveTo(xx, yy); first = false; } else c.lineTo(xx, yy); }
            c.stroke();
        }
        c.fillStyle = '#8d8378'; c.font = '600 11px Rajdhani, sans-serif'; c.textAlign = 'left';
        c.fillText(title.toUpperCase(), x + 8, y + 15);
        c.fillStyle = '#ffb347'; c.font = '600 12px "JetBrains Mono", monospace'; c.textAlign = 'right';
        c.fillText(value, x + w - 8, y + 15);
    }
    function drawGraphs() {
        gctx.clearRect(0, 0, GW, GH);
        const narrow = GW < 700, cols = narrow ? 2 : 4, rows = narrow ? 2 : 1;
        const w = GW / cols, h = GH / rows;
        const at = i => [(i % cols) * w, Math.floor(i / cols) * h];
        const last = trend[trend.length - 1] || { P: 0, rho: 0, v: 0, x: 0, tf: 0 };
        let [x, y] = at(0);
        panel(x, y, w, h, 'Power', fmtPower(last.P).join(' '), [{ color: '#ff6a2b', get: d => d.P }],
            { map: v => Math.log10(Math.max(v, 1e-3)), lo: -3, hi: 4.5, lines: [{ v: 3200, label: 'nominal', color: 'rgba(255,179,71,0.5)' }] });
        [x, y] = at(1);
        panel(x, y, w, h, 'Reactivity', `${last.rho >= 0 ? '+' : ''}${last.rho.toFixed(2)} $`, [{ color: '#fff4d6', get: d => d.rho }],
            { map: v => v, lo: -3, hi: 3, bands: [{ from: 1, to: 3, color: 'rgba(255,59,48,0.18)' }], lines: [{ v: 0, label: '', color: 'rgba(141,131,120,0.4)' }, { v: 1, label: 'prompt critical', color: 'rgba(255,59,48,0.6)' }] });
        [x, y] = at(2);
        panel(x, y, w, h, 'Void · Xenon', `${(last.v * 100).toFixed(0)}% · ${last.x.toFixed(2)}×`, [{ color: '#5ab9ff', get: d => d.v * 3 }, { color: '#b48cff', get: d => d.x }],
            { map: v => v, lo: 0, hi: 3 });
        [x, y] = at(3);
        panel(x, y, w, h, 'Peak fuel temperature', `${last.tf.toFixed(0)} °C`, [{ color: '#ffb347', get: d => d.tf }],
            { map: v => v, lo: 200, hi: 3000, lines: [{ v: 2800, label: 'fuel fails', color: 'rgba(255,59,48,0.6)' }] });
    }

    // ------------------------------------------------------------------ destruction
    function onDestroyed() {
        view.explode();
        audio.boom();
        const az5Event = R.events.find(e => e.text.startsWith('AZ-5'));
        setTimeout(() => {
            const april = scenarioId === 'april';
            $('wreckTitle').textContent = april ? `${fmtClock(clockBase + R.time)} — Unit 4 is destroyed`
                : R.cause === 'excursion' ? 'Prompt-critical excursion' : 'The fuel has melted';
            $('wreckBody').textContent = april
                ? 'Seconds after AZ-5, the graphite tips of the descending rods pushed water out of the bottom of the core. Reactivity passed one dollar, steam voids fed it more, and power ran away faster than the rods could move. The fuel shattered, the steam explosion lifted the 1,000-tonne upper shield and the graphite caught fire. Two plant workers died that night, and 28 more died of acute radiation sickness in the following months. This is one simplified slice of a core; the real causes ran through the design, the regulations and the test programme as much as through the physics.'
                : R.cause === 'excursion'
                    ? 'Reactivity passed one dollar. With only prompt neutrons carrying the chain reaction, power multiplied faster than any rod could move, the fuel fragmented and the coolant flashed to steam.'
                    : 'The fuel ran hotter than the coolant could carry the heat away, and the channels failed. In an RBMK, losing water also adds reactivity — the two problems feed each other.';
            const stats = $('wreckStats');
            stats.innerHTML = '';
            const row = (k, v) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; stats.append(dt, dd); };
            row('Peak power', `${fmtPower(peaks.P).join(' ')} (${(peaks.P / R.p.Pnom).toFixed(1)}× nominal)`);
            row('Peak reactivity', `+${peaks.rho.toFixed(2)} $`);
            row('Peak fuel', `${peaks.Tf.toFixed(0)} °C`);
            if (az5Event) row('AZ-5 to destruction', `${(R.time - az5Event.t).toFixed(1)} s`);
            row('ORM at the start', `${startOrm} rods`);
            $('wreck').hidden = false;
            $('again').focus();
        }, 3600);
    }

    // ------------------------------------------------------------------ sound
    const audio = (() => {
        let ac = null, master = null, noise = null, pump = null, pumpGain = null, hum = null, humGain = null, on = false, alarmT = 0;
        function init() {
            ac = new (window.AudioContext || window.webkitAudioContext)();
            master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
            const len = ac.sampleRate, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            noise = buf;
            pump = ac.createOscillator(); pump.type = 'sawtooth'; pump.frequency.value = 48;
            const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
            pumpGain = ac.createGain(); pumpGain.gain.value = 0;
            pump.connect(lp).connect(pumpGain).connect(master); pump.start();
            hum = ac.createOscillator(); hum.type = 'square'; hum.frequency.value = 96;
            const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 3;
            humGain = ac.createGain(); humGain.gain.value = 0;
            hum.connect(bp).connect(humGain).connect(master); hum.start();
        }
        function click() {
            const t = ac.currentTime, src = ac.createBufferSource(), g = ac.createGain(), hp = ac.createBiquadFilter();
            src.buffer = noise; hp.type = 'highpass'; hp.frequency.value = 2500;
            g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
            src.connect(hp).connect(g).connect(master);
            src.start(t, Math.random() * 0.9, 0.02);
        }
        function tone(freq, start, dur, type = 'square', vol = 0.08) {
            const o = ac.createOscillator(), g = ac.createGain();
            o.type = type; o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, start);
            g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
            g.gain.setValueAtTime(vol, start + dur - 0.03);
            g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
            o.connect(g).connect(master); o.start(start); o.stop(start + dur + 0.02);
        }
        return {
            get on() { return on; },
            toggle() {
                on = !on;
                if (on && !ac) init();
                if (ac) { on ? ac.resume() : ac.suspend(); }
            },
            update(dt) {
                if (!on || !ac) return;
                // a neutron counter: clicks scale with the logarithm of power
                const rate = clamp(6 * (Math.log10(Math.max(R.power, 1e-4)) + 4), 0.5, 160);
                let n = rate * dt;
                while (n > 1 || Math.random() < n) { click(); n -= 1; }
                pumpGain.gain.setTargetAtTime(R.state === 'running' ? 0.05 * R.flow : 0, ac.currentTime, 0.3);
                pump.frequency.setTargetAtTime(30 + 30 * R.flow, ac.currentTime, 0.5);
                const moving = R.rods.some(r => Math.abs(r.target - r.pos) > 0.002);
                humGain.gain.setTargetAtTime(moving && R.state === 'running' ? 0.03 : 0, ac.currentTime, 0.05);
                alarmT -= dt;
                const alarm = R.state === 'running' && (R.dollars >= 1 || R.maxTf > 2300 || (R.period > 0 && R.period < 10 && R.power > 30));
                if (alarm && alarmT <= 0) { alarmT = 0.5; const t = ac.currentTime; tone(880, t, 0.2); tone(660, t + 0.25, 0.2); }
            },
            klaxon() {
                if (!on || !ac) return;
                const t = ac.currentTime;
                for (let i = 0; i < 3; i++) { tone(420, t + i * 0.7, 0.32, 'sawtooth', 0.09); tone(340, t + i * 0.7 + 0.34, 0.32, 'sawtooth', 0.09); }
            },
            boom() {
                if (!on || !ac) return;
                const t = ac.currentTime, src = ac.createBufferSource(), lp = ac.createBiquadFilter(), g = ac.createGain();
                src.buffer = noise; src.loop = true;
                lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(80, t + 3.5);
                g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
                src.connect(lp).connect(g).connect(master); src.start(t); src.stop(t + 4.6);
                const o = ac.createOscillator(), og = ac.createGain();
                o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(22, t + 2);
                og.gain.setValueAtTime(0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + 2.4);
                o.connect(og).connect(master); o.start(t); o.stop(t + 2.5);
            }
        };
    })();

    // ------------------------------------------------------------------ main loop
    let last = performance.now(), hudT = 0, sampleT = 0;
    function frame(now) {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (!loading) {
            for (const [i, e] of script.entries()) if (!fired.has(i) && R.time >= e.t) { fired.add(i); e.run(R); }
            const wasRunning = R.state === 'running', wasScram = R.scram;
            // keep plant time in step with the wall clock even when frames are slow
            for (let left = dt; left > 1e-4; left -= 0.05) R.step(Math.min(left, 0.05));
            if (!wasScram && R.scram) audio.klaxon();
            peaks.P = Math.max(peaks.P, R.power);
            peaks.rho = Math.max(peaks.rho, R.dollars);
            peaks.Tf = Math.max(peaks.Tf, R.maxTf);
            if (wasRunning && R.state === 'destroyed') onDestroyed();
            if (R.state === 'running') watch();
            sampleT += dt;
            if (sampleT > 0.25) {
                xeRate += ((R.avgXe - xeLast) / sampleT - xeRate) * 0.3;
                xeLast = R.avgXe;
                sample();
                sampleT = 0;
            }
        }
        view.draw(dt);
        drawGraphs();
        hudT += dt;
        if (hudT > 0.08) { hud(); hudT = 0; }
        audio.update(dt);
        requestAnimationFrame(frame);
    }

    function resize() {
        view.top = document.querySelector('.modes').offsetHeight + 18;
        view.bottom = document.getElementById('legend').offsetHeight + 14;
        view.resize();
        sizeGraphs();
    }
    addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(document.querySelector('.stage'));
    resize();
    const start = (location.hash || '').slice(1);
    load(SCEN[start] ? start : 'steady');
    requestAnimationFrame(frame);
})();
