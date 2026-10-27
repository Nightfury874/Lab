// Tenebris Drakonos Forge — the living homepage.
(function () {
    'use strict';

    const F = window.FORGE;
    const sound = window.ForgeAudio;
    const heatColor = window.ForgeHeat;
    const $ = s => document.querySelector(s);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const rand = (a, b) => a + Math.random() * (b - a);

    const store = {
        get(k, d) { try { const v = localStorage.getItem('forge.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem('forge.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
    };

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = matchMedia('(pointer: fine)').matches;
    const hour = new Date().getHours();
    const night = hour >= 20 || hour < 6;
    const witching = hour === 3;

    const body = document.body, main = $('#main');
    if (finePointer) body.classList.add('ember-cursor');

    // ------------------------------------------------------------------ canvases
    const back = $('#back'), front = $('#front');
    const bctx = back.getContext('2d'), fctx = front.getContext('2d');
    let W = innerWidth, H = innerHeight, DPR = 1, pixel = false;

    // ------------------------------------------------------------------ fluid smoke
    let fluid = null, CELL = 16, smokeImg = null, smokeCanvas = document.createElement('canvas'), smokeCtx = smokeCanvas.getContext('2d');

    function setupFluid() {
        CELL = W < 700 ? 20 : 16;
        fluid = new window.ForgeFluid(Math.ceil(W / CELL), Math.ceil(H / CELL), 1);
        fluid.iters = W < 700 ? 10 : 14;
        fluid.walls({ top: false });
        smokeCanvas.width = fluid.nx - 2;
        smokeCanvas.height = fluid.ny - 2;
        smokeImg = new ImageData(smokeCanvas.width, smokeCanvas.height);
    }
    const toCell = (x, y) => [x / CELL + 1, (H - y) / CELL + 1];
    setupFluid();

    const angDiff = (a, b) => {
        let d = (b - a) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        return d;
    };

    function resize() {
        W = innerWidth; H = innerHeight;
        DPR = pixel ? 0.2 : Math.min(2, devicePixelRatio || 1);
        for (const [c, ctx] of [[back, bctx], [front, fctx]]) {
            c.width = Math.max(1, Math.round(W * DPR));
            c.height = Math.max(1, Math.round(H * DPR));
            ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
            ctx.imageSmoothingEnabled = !pixel;
        }
        setupFluid();
        for (const p of plates) sizePlate(p);
    }

    // ------------------------------------------------------------------ input
    const cursor = { x: W / 2, y: H * 0.6, vx: 0, vy: 0, speed: 0, inside: false, left: false, still: 0, moved: false, touch: false };
    let lastMove = performance.now();
    addEventListener('pointermove', e => {
        const now = performance.now(), dt = Math.max(1, now - lastMove) / 1000;
        cursor.vx = lerp(cursor.vx, (e.clientX - cursor.x) / dt, 0.4);
        cursor.vy = lerp(cursor.vy, (e.clientY - cursor.y) / dt, 0.4);
        cursor.x = e.clientX; cursor.y = e.clientY;
        cursor.inside = true; cursor.left = false; cursor.moved = true; cursor.still = 0;
        cursor.touch = e.pointerType === 'touch';
        lastMove = now;
        body.style.setProperty('--tx', e.clientX + 'px');
        body.style.setProperty('--ty', e.clientY + 'px');
        $('#torch').style.setProperty('--tx', e.clientX + 'px');
        $('#torch').style.setProperty('--ty', e.clientY + 'px');
    }, { passive: true });
    addEventListener('pointerdown', e => {
        cursor.touch = e.pointerType === 'touch';
        cursor.x = e.clientX; cursor.y = e.clientY;
    }, { capture: true, passive: true });
    document.addEventListener('mouseout', e => {
        if (!e.relatedTarget) { cursor.inside = false; cursor.left = true; }
    });

    // ------------------------------------------------------------------ particles
    const fire = [], sparks = [], embers = [], breath = [];
    let fireLevel = 0, fireBoost = 1, fireBoostTarget = 1, roomLight = 0, smokeFlash = 0;

    function spawnSparks(x, y, n, power = 1, dir = -Math.PI / 2, spread = Math.PI * 0.9) {
        if (reduced) n = Math.ceil(n / 3);
        for (let i = 0; i < n; i++) {
            const a = dir + rand(-spread / 2, spread / 2), sp = rand(200, 620) * power;
            sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: rand(0.75, 1) });
        }
        if (sparks.length > 900) sparks.splice(0, sparks.length - 900);
    }

    function resetEmber(e, anywhere) {
        e.x = rand(0, W);
        e.y = anywhere ? rand(0, H) : H + rand(0, 40);
        e.vx = 0; e.vy = rand(-30, -70);
        e.t = rand(0.4, 1);
        e.s = rand(1.2, 2.8);
    }
    for (let i = 0; i < (reduced ? 14 : 46); i++) { const e = {}; resetEmber(e, true); embers.push(e); }

    // ------------------------------------------------------------------ DOM: plates
    const plates = [];
    const opened = store.get('opened', []);

    function makePlate(item, container, isTrinket) {
        const a = document.createElement('a');
        a.className = 'plate';
        a.href = item.path || item.url;
        a.dataset.id = item.id;
        a.innerHTML = `<div class="face"><canvas aria-hidden="true"></canvas>
            <div class="meta"><span class="name"></span><span class="kind"></span></div>
            <span class="hook"></span></div>`;
        a.querySelector('.name').textContent = item.name;
        a.querySelector('.kind').textContent = isTrinket ? 'Trinket' : item.kind;
        a.querySelector('.hook').textContent = item.hook;
        container.appendChild(a);
        const p = { item, el: a, canvas: a.querySelector('canvas'), heat: opened.includes(item.id) ? 0.12 : 0, base: opened.includes(item.id) ? 0.12 : 0, state: 'cold', lingerTimer: 0, preview: null, external: isTrinket };
        plates.push(p);
        bindPlate(p);
        return p;
    }

    function sizePlate(p) {
        const r = Math.min(2, devicePixelRatio || 1);
        const w = Math.max(160, Math.round(p.canvas.clientWidth * r)), h = Math.round(w / 1.6);
        if (p.canvas.width === w && p.preview) return;
        p.canvas.width = w; p.canvas.height = h;
        const factory = window.ForgePreviews[p.item.id];
        if (!factory) return;
        const ctx = p.canvas.getContext('2d');
        p.preview = factory(ctx, w, h);
        if (p.item.id === 'rps') p.preview.onWinner = setWinner;
        for (let i = 0; i < 50; i++) p.preview.step(1 / 30);
        p.preview.draw();
    }

    F.experiments.forEach(x => makePlate(x, $('#plates'), false));
    F.trinkets.forEach(x => makePlate(x, $('#trinkets'), true));

    let active = null, lingered = null;

    function setState(p, state) {
        p.state = state;
        p.el.dataset.state = state;
    }

    function contact(p) {
        if (active && active !== p) release(active);
        active = p;
        setState(p, 'contact');
        clearTimeout(p.lingerTimer);
        p.lingerTimer = setTimeout(() => linger(p), 900);
        sound.clink(0.15);
    }
    function linger(p) {
        if (active !== p) return;
        setState(p, 'linger');
        lingered = p;
        brain.focus(p);
    }
    function release(p) {
        clearTimeout(p.lingerTimer);
        setState(p, 'cold');
        if (active === p) active = null;
        if (lingered === p) { lingered = null; brain.unfocus(); }
        if (p.preview) p.preview.draw();
    }

    function bindPlate(p) {
        const el = p.el;
        let pressTimer = 0;
        el.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') contact(p); });
        el.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') release(p); });
        el.addEventListener('focus', () => { contact(p); linger(p); });
        el.addEventListener('blur', () => release(p));
        el.addEventListener('pointerdown', e => {
            if (e.pointerType !== 'touch') return;
            pressTimer = setTimeout(() => { contact(p); linger(p); }, 500);
        });
        el.addEventListener('pointerup', () => clearTimeout(pressTimer));
        el.addEventListener('click', e => {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            // On touch, the first tap heats the plate (hover); the second strikes it.
            if (cursor.touch && active !== p) { contact(p); return; }
            strike(p);
        });
    }

    function strike(p) {
        const r = p.el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        p.el.classList.add('white-hot');
        spawnSparks(cx, cy, 70, 1.1, -Math.PI / 2, Math.PI * 2);
        shake();
        sound.clink(1);
        brain.breatheAt(cx, cy);
        if (!opened.includes(p.item.id)) { opened.push(p.item.id); store.set('opened', opened); }
        setTimeout(() => { location.href = p.el.href; }, reduced ? 120 : 700);
    }
    // Coming back through the browser's back button restores the page from cache.
    addEventListener('pageshow', () => plates.forEach(p => p.el.classList.remove('white-hot')));

    function shake() {
        if (reduced) return;
        main.classList.remove('shake');
        void main.offsetWidth;
        main.classList.add('shake');
    }

    // RPS winner banner
    const CLAN_COLOR = { rock: '#9aa0ad', paper: '#f2e6c9', scissors: '#ff6a2b', lizard: '#6fd08c', spock: '#7fb6ff' };
    function setWinner(w) { store.set('rpsWinner', w); showWinner(); }
    function showWinner() {
        const w = store.get('rpsWinner', null), b = $('#banner');
        if (!w) return;
        b.hidden = false;
        b.textContent = `The ${w} clan won the last battle`;
        b.style.setProperty('--clan', CLAN_COLOR[w]);
    }
    showWinner();

    // ------------------------------------------------------------------ DOM: cellar
    F.ingots.forEach(ig => {
        const d = document.createElement('div');
        d.className = 'ingot';
        d.tabIndex = 0;
        d.innerHTML = '<div class="bar"><span class="stamp"></span></div><div class="label"></div><p class="line"></p>';
        d.querySelector('.stamp').textContent = ig.stamp;
        d.querySelector('.label').textContent = ig.name;
        d.querySelector('.line').textContent = ig.line;
        d.addEventListener('pointerenter', () => sound.clink(0.12));
        $('#ingots').appendChild(d);
    });

    const chainLinks = '<svg viewBox="0 0 22 120" aria-hidden="true">' +
        Array.from({ length: 6 }, (_, i) => i % 2
            ? `<polygon points="9,${i * 20 + 2} 13,${i * 20 + 2} 13,${i * 20 + 24} 9,${i * 20 + 24}" fill="#3a3533"/>`
            : `<polygon points="11,${i * 20} 19,${i * 20 + 6} 19,${i * 20 + 20} 11,${i * 20 + 26} 3,${i * 20 + 20} 3,${i * 20 + 6}" fill="none" stroke="#4a4442" stroke-width="3"/>`
        ).join('') + '</svg>';
    const chains = F.links.map(l => {
        const a = document.createElement('a');
        a.className = 'chain';
        a.href = l.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('aria-label', l.name);
        a.innerHTML = chainLinks + `<span class="plaque"><img src="${l.icon}" alt=""></span><span class="nm"></span>`;
        a.querySelector('.nm').textContent = l.name;
        $('#chains').appendChild(a);
        return { el: a, angle: 0, vel: 0 };
    });

    // ------------------------------------------------------------------ title
    const title = $('#title');
    const words = [...title.querySelectorAll('.word')];
    words.forEach(w => { w.dataset.la = w.textContent.trim(); });

    function splitTitle() {
        words.forEach(w => {
            w.innerHTML = [...w.dataset.la].map(c => `<span class="ch">${c}</span>`).join('');
        });
    }
    function flattenTitle() { words.forEach(w => { w.textContent = w.dataset.la; }); }

    const GLYPHS = 'ABCDEFGHKMNPRSTUVXZ#%&';
    function scramble(el, target, done) {
        cancelAnimationFrame(el._raf);
        // Hold the word's width so the title never reflows mid-scramble.
        if (!el.style.minWidth) {
            el.style.minWidth = el.offsetWidth + 'px';
            el.style.textAlign = 'center';
        }
        const from = el.textContent, len = Math.max(from.length, target.length), t0 = performance.now(), dur = 520;
        const tick = now => {
            const k = (now - t0) / dur;
            let out = '';
            for (let i = 0; i < len; i++) {
                if (k > (i + 1) / len) out += target[i] || '';
                else out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            }
            el.textContent = out;
            if (k < 1) el._raf = requestAnimationFrame(tick);
            else { el.textContent = target; if (done) done(); }
        };
        el._raf = requestAnimationFrame(tick);
    }
    title.querySelectorAll('.latin').forEach(el => {
        let whisper = 0;
        el.addEventListener('pointerenter', () => {
            if (body.classList.contains('intro')) return;
            el.classList.add('translated');
            scramble(el, el.dataset.en);
            whisper = setTimeout(() => {
                if (!sound.on || !window.speechSynthesis) return;
                const u = new SpeechSynthesisUtterance(el.dataset.la);
                u.rate = 0.6; u.pitch = 0.3; u.volume = 0.5;
                speechSynthesis.speak(u);
            }, 1200);
        });
        el.addEventListener('pointerleave', () => {
            clearTimeout(whisper);
            el.classList.remove('translated');
            scramble(el, el.dataset.la);
        });
    });

    // ------------------------------------------------------------------ hearth & anvil
    const mouthEl = $('#mouth'), flueEl = $('#flue'), hearthEl = $('#hearth');
    let hearthHover = false, hearthLinger = 0;
    hearthEl.addEventListener('pointerenter', () => {
        hearthHover = true;
        const m = mouthEl.getBoundingClientRect();
        spawnSparks(m.left + m.width / 2, m.top + m.height * 0.7, 30, 0.8);
        hearthLinger = setTimeout(() => { hearthLinger = -1; }, 1100);
    });
    hearthEl.addEventListener('pointerleave', () => { hearthHover = false; clearTimeout(hearthLinger); hearthLinger = 0; });

    const strikes = [];
    $('#anvil').addEventListener('click', () => {
        const r = $('#anvil').getBoundingClientRect();
        spawnSparks(r.left + r.width * 0.55, r.top + r.height * 0.15, 40, 0.9);
        sound.clink(0.8);
        shake();
        const now = performance.now();
        strikes.push(now);
        if (strikes.length > 5) strikes.shift();
        if (strikes.length === 5) {
            const iv = strikes.slice(1).map((t, i) => t - strikes[i]);
            const L = v => v > 380 && v < 1100, S = v => v < 320;
            if (L(iv[0]) && S(iv[1]) && S(iv[2]) && L(iv[3])) { strikes.length = 0; moltenRain(); }
        }
    });

    // ------------------------------------------------------------------ secrets
    const SECRETS = {
        lights: ['Lights out', 'Some forges are better in the dark.'],
        name: ['Spoke the dragon’s name', 'Every dragon answers to its name. Just type it.'],
        konami: ['The old code', 'Old gamers know a code with arrows in it.'],
        rhythm: ['Hammer rhythm', 'Strike the anvil: long, short, short, long.'],
        console: ['Asked the console', 'You found this one.'],
        vault: ['Opened the vault', 'The vault is at the very bottom.'],
        witching: ['The witching hour', 'Come back at 3 a.m.'],
        annoyed: ['Annoyed Nightfury', 'Poke the dragon. Repeatedly.']
    };
    const found = store.get('secrets', []);
    let toastTimer = 0;
    function toast(msg) {
        const t = $('#toast');
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
    }
    function discover(id) {
        if (found.includes(id)) return;
        found.push(id);
        store.set('secrets', found);
        sound.chime();
        toast(`◆ Secret found — ${SECRETS[id][0]} (${found.length}/${Object.keys(SECRETS).length})`);
        drawTally();
    }
    function drawTally() {
        const n = found.length, total = Object.keys(SECRETS).length;
        let lines = '';
        for (let i = 0; i < n; i++) {
            const g = Math.floor(i / 5), k = i % 5, x = g * 60 + 10;
            lines += k < 4
                ? `<line x1="${x + k * 10}" y1="6" x2="${x + k * 10 + 2}" y2="40" stroke="#c9b8a3" stroke-width="3" stroke-linecap="round"/>`
                : `<line x1="${x - 6}" y1="34" x2="${x + 38}" y2="10" stroke="#c9b8a3" stroke-width="3" stroke-linecap="round"/>`;
        }
        const width = Math.max(60, Math.ceil(Math.max(n, 1) / 5) * 60);
        $('#tally').innerHTML = `<svg viewBox="0 0 ${width} 46" width="${width}">${lines}</svg>${n} of ${total} secrets found`;
    }
    drawTally();

    window.forge = {
        reveal() {
            discover('console');
            console.log('%cThe smith’s ledger of secrets', 'color:#ffb347;font-weight:bold');
            for (const [id, [nameText, hint]] of Object.entries(SECRETS)) {
                console.log(found.includes(id) ? `  ◆ ${nameText}` : `  ◇ ??? — ${hint}`);
            }
            return `${found.length} of ${Object.keys(SECRETS).length} found`;
        }
    };
    console.log(
        '%c\n      /\\_/\\\n  ___/ o o \\___     Tenebris Drakonos Forge\n /   \\  ^  /   \\    You opened the console. Nightfury noticed.\n/_____\\___/_____\\   Try:  forge.reveal()\n',
        'color:#ff6a2b;font-family:monospace'
    );

    // Lights out
    $('#lights').addEventListener('click', () => {
        const on = body.classList.toggle('lights-out');
        $('#lights').setAttribute('aria-pressed', on);
        if (on) discover('lights');
    });

    // Sound
    $('#sound').addEventListener('click', () => {
        sound.set(!sound.on);
        $('#sound').setAttribute('aria-pressed', sound.on);
        $('#sound').textContent = sound.on ? 'Sound on' : 'Sound off';
        store.set('sound', sound.on);
    });

    // Typed words and the Konami code
    const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let typed = '', keys = [];
    addEventListener('keydown', e => {
        if (e.target.closest && e.target.closest('input, textarea')) return;
        keys.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
        keys = keys.slice(-KONAMI.length);
        if (keys.join() === KONAMI.join()) { keys = []; togglePixel(); }
        if (/^[a-z]$/i.test(e.key)) {
            typed = (typed + e.key.toLowerCase()).slice(-12);
            if (typed.endsWith('nightfury')) { typed = ''; brain.flyLap(); discover('name'); }
        }
    });

    function togglePixel() {
        pixel = !pixel;
        body.classList.toggle('pixel', pixel);
        resize();
        discover('konami');
    }

    // Molten rain — the hidden experiment behind the hammer rhythm.
    let rainUntil = 0;
    function moltenRain() {
        rainUntil = performance.now() + 7000;
        discover('rhythm');
        sound.whoosh(1.2);
        if (!document.getElementById('rain-plate')) {
            const b = document.createElement('button');
            b.id = 'rain-plate';
            b.className = 'plate';
            b.style.cssText = 'border:0;background:none;padding:0;font:inherit;color:inherit;text-align:left;';
            b.innerHTML = '<div class="face"><div class="meta"><span class="name">Molten Rain</span><span class="kind">Secret</span></div><span class="hook">You found the hidden experiment. Click to make it rain again.</span></div>';
            b.addEventListener('click', moltenRain);
            $('#trinkets').appendChild(b);
        }
    }

    // Vault
    $('#riddle').addEventListener('submit', e => {
        e.preventDefault();
        const v = $('#answer').value.trim().toLowerCase().replace(/\s+/g, '');
        const door = $('#door');
        if (v === 'nightfury') {
            door.classList.add('open');
            sound.whoosh(1.6);
            discover('vault');
            const scrap = $('#scrap');
            scrap.hidden = false;
            scrap.innerHTML = '<h2>Scrap metal</h2>';
            if (F.scrap.length) {
                const ul = document.createElement('ul');
                F.scrap.forEach(s => { const li = document.createElement('li'); li.textContent = `${s.name} — ${s.line}`; ul.appendChild(li); });
                scrap.appendChild(ul);
            } else {
                const p = document.createElement('p');
                p.textContent = 'The scrap pile is empty. For now. Failed experiments end up here.';
                scrap.appendChild(p);
            }
        } else {
            door.classList.remove('wrong');
            void door.offsetWidth;
            door.classList.add('wrong');
            brain.wake();
        }
    });

    if (witching) setTimeout(() => discover('witching'), 4000);

    // ------------------------------------------------------------------ Nightfury's brain
    const dScale = clamp(Math.min(W, H) / 900, 0.55, 1.1);
    const dragon = new window.ForgeDragon({
        x: W / 2, y: H * 0.8,
        segments: 20 + F.experiments.length * 2 + F.trinkets.length, // grows as the forge grows
        spacing: 11 * dScale,
        width: 19 * dScale
    });

    const brain = (() => {
        let mood = 'sleep', moodT = 0, theta = 0, playMeter = 0, pokes = [], focusP = null, breatheTarget = null, lap = null;
        let nearT = 0, farT = 0, snortT = 0, lastBreathPhase = null, guideUntil = 0;

        function home() {
            const r = hearthEl.getBoundingClientRect();
            if (r.bottom > 40 && r.top < H - 40) {
                return { x: r.left + r.width / 2, y: r.top + r.height * 0.9, rx: r.width * 0.42, ry: Math.max(22, r.height * 0.11) };
            }
            return { x: W - 120 * dScale - 20, y: H - 90 * dScale - 20, rx: 70 * dScale, ry: 28 * dScale };
        }

        function set(m) { mood = m; moodT = 0; }

        return {
            get mood() { return mood; },
            focus(p) { focusP = p; set('guide'); },
            unfocus() { focusP = null; if (mood === 'guide') set('curious'); },
            wake() { set('curious'); sound.snort(); snortT = 0; },
            breatheAt(x, y) { breatheTarget = { x, y, t: 0 }; sound.whoosh(0.7); },
            flyLap() { lap = { t: 0, start: Math.atan2(dragon.head.y - H / 2, dragon.head.x - W / 2) }; set('fly'); sound.whoosh(1.4); },
            poke() {
                const now = performance.now();
                pokes = pokes.filter(t => now - t < 4000);
                pokes.push(now);
                if (pokes.length >= 3) {
                    pokes = [];
                    set('annoyed');
                    const [ci, cj] = toCell(dragon.head.x, dragon.head.y);
                    fluid.splat(ci, cj, 14, 1.5, rand(-30, 30), 20);
                    smokeFlash = 1;
                    sound.snort();
                    discover('annoyed');
                } else this.wake();
            },
            guideTo(until) { guideUntil = until; },
            update(dt) {
                moodT += dt;
                const h = home();
                const head = dragon.head;
                const dCursor = Math.hypot(cursor.x - head.x, cursor.y - head.y);
                const { inhale, exhale } = F.breath;
                const cyc = (performance.now() / 1000) % (inhale + exhale);
                const phase = cyc < inhale ? 'in' : 'out';
                dragon.breath = cyc < inhale ? cyc / inhale : 1 - (cyc - inhale) / exhale;
                if (phase !== lastBreathPhase) {
                    lastBreathPhase = phase;
                    if (dCursor < 260 && cursor.inside) sound.breathe(phase === 'in', phase === 'in' ? inhale : exhale);
                    if (phase === 'out' && mood === 'sleep') {
                        const m = dragon.mouth(), [ci, cj] = toCell(m.x, m.y);
                        fluid.splat(ci, cj, 1.6, 0.5, Math.cos(m.angle) * 8, -Math.sin(m.angle) * 8);
                    }
                }

                // Cursor speed → play
                const cs = Math.hypot(cursor.vx, cursor.vy);
                cursor.speed = lerp(cursor.speed, cs, 0.1);
                if (cursor.speed > 1300 && cursor.inside) playMeter += dt; else playMeter = Math.max(0, playMeter - dt * 0.5);
                if (playMeter > 1.1 && (mood === 'sleep' || mood === 'curious')) { set('play'); playMeter = 0; }

                let goal = { x: h.x, y: h.y, speed: 40 * dScale };
                dragon.wingGoal = 0.08;
                dragon.flapping = false;
                dragon.turnRate = 3;

                const orbit = speed => {
                    theta += dt * speed;
                    return { x: h.x + Math.cos(theta) * h.rx, y: h.y + Math.sin(theta) * h.ry };
                };

                switch (mood) {
                    case 'intro':
                    case 'sleep': {
                        const o = orbit(0.22);
                        goal = { ...o, speed: 42 * dScale };
                        dragon.eyeGoal = cursor.left ? 0.85 : (witching ? 1 : 0); // one eye opens when you leave
                        dragon.look = { x: cursor.x, y: cursor.y };
                        if (mood === 'sleep' && cursor.inside && dCursor < 220 * dScale + 60) { nearT += dt; if (nearT > 0.4) set('curious'); } else nearT = 0;
                        if (witching && mood === 'sleep') set('curious');
                        break;
                    }
                    case 'curious': {
                        const o = orbit(0.08);
                        goal = { x: lerp(o.x, cursor.x, 0.18), y: lerp(o.y, cursor.y, 0.18), speed: 30 * dScale };
                        dragon.eyeGoal = 1;
                        dragon.look = { x: cursor.x, y: cursor.y };
                        if (dCursor < 130 * dScale + 30) {
                            snortT += dt;
                            if (snortT > 3) {
                                snortT = 0;
                                const m = dragon.mouth(), [ci, cj] = toCell(m.x, m.y);
                                const a = Math.atan2(cursor.y - m.y, cursor.x - m.x);
                                fluid.splat(ci, cj, 2.5, 1, Math.cos(a) * 40, -Math.sin(a) * 40);
                                sound.snort();
                            }
                        } else snortT = 0;
                        if (dCursor > 320 * dScale + 60 || !cursor.inside) farT += dt; else farT = 0;
                        if (farT > 2.5 && !witching) { farT = 0; set('sleep'); }
                        break;
                    }
                    case 'guide': {
                        if (!focusP) { set('curious'); break; }
                        const r = focusP.el.getBoundingClientRect();
                        const tx = r.left < W / 2 ? r.right + 24 : r.left - 24;
                        goal = { x: clamp(tx, 30, W - 30), y: clamp(r.top + r.height * 0.75, 30, H - 30), speed: 260 * dScale };
                        dragon.eyeGoal = 1;
                        dragon.look = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                        break;
                    }
                    case 'play': {
                        goal = { x: cursor.x, y: cursor.y, speed: 420 * dScale };
                        dragon.turnRate = 5;
                        dragon.eyeGoal = 1;
                        dragon.look = { x: cursor.x, y: cursor.y };
                        if ((cursor.speed < 300 && moodT > 2.5) || moodT > 7 || !cursor.inside) set('curious');
                        break;
                    }
                    case 'annoyed': {
                        const away = { x: h.x - (cursor.x - h.x) * 0.3, y: h.y };
                        goal = { x: clamp(away.x, 40, W - 40), y: clamp(away.y, 40, H - 40), speed: 300 * dScale };
                        dragon.eyeGoal = 0.35;
                        dragon.look = { x: cursor.x, y: cursor.y };
                        if (moodT > 4) set('sleep');
                        break;
                    }
                    case 'fly': {
                        lap.t += dt / 6;
                        const a = lap.start + lap.t * Math.PI * 2;
                        goal = { x: W / 2 + Math.cos(a) * W * 0.4, y: H / 2 + Math.sin(a) * H * 0.36, speed: 700 * dScale };
                        dragon.turnRate = 6;
                        dragon.wingGoal = 1;
                        dragon.flapping = true;
                        dragon.eyeGoal = 1;
                        dragon.look = goal;
                        if (lap.t >= 1) set('curious');
                        break;
                    }
                    case 'tour': {
                        // First visit: show the visitor the way down to the newest work.
                        const d = $('.descend').getBoundingClientRect();
                        goal = { x: d.left + d.width / 2 + 60, y: d.top + d.height / 2, speed: 160 * dScale };
                        dragon.eyeGoal = 1;
                        dragon.look = { x: d.left + d.width / 2, y: d.bottom + 40 };
                        if (performance.now() > guideUntil) set('curious');
                        break;
                    }
                }

                // Hovered plates catch its eye even while it's curled up.
                if (active && mood !== 'fly' && mood !== 'play') {
                    const r = active.el.getBoundingClientRect();
                    dragon.look = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
                    dragon.eyeGoal = Math.max(dragon.eyeGoal, 0.7);
                }

                // Fire breath at a struck plate.
                if (breatheTarget) {
                    breatheTarget.t += dt;
                    const m = dragon.mouth();
                    const a = Math.atan2(breatheTarget.y - head.y, breatheTarget.x - head.x);
                    dragon.heading += clamp(angDiff(dragon.heading, a), -dt * 12, dt * 12);
                    dragon.eyeGoal = 1;
                    if (breatheTarget.t > 0.08 && !reduced) {
                        const dist = Math.hypot(breatheTarget.x - m.x, breatheTarget.y - m.y);
                        for (let i = 0; i < 6; i++) {
                            const aa = Math.atan2(breatheTarget.y - m.y, breatheTarget.x - m.x) + rand(-0.12, 0.12);
                            const sp = dist / rand(0.35, 0.5);
                            breath.push({ x: m.x, y: m.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: 0, max: rand(0.4, 0.55), s: rand(8, 18) * dScale });
                        }
                        const [ci, cj] = toCell(m.x, m.y);
                        fluid.splat(ci, cj, 2, 0.4, Math.cos(a) * 60, -Math.sin(a) * 60);
                    }
                    if (breatheTarget.t > 0.7) breatheTarget = null;
                }

                dragon.goal = goal;
                dragon.update(Math.min(dt, 1 / 20));
            },
            set
        };
    })();

    document.addEventListener('pointerdown', e => {
        if (e.target.closest('a, button, input, .ingot')) return;
        if (dragon.hits(e.clientX, e.clientY)) brain.poke();
        else spawnSparks(e.clientX, e.clientY, 8, 0.5);
    });

    // ------------------------------------------------------------------ chalk sketches in empty darkness
    let chalk = { a: 0, x: 0, y: 0, kind: 0 }, emptyCheck = 0, overEmpty = false;
    function drawChalk(ctx) {
        if (chalk.a <= 0.01) return;
        ctx.save();
        ctx.translate(chalk.x, chalk.y);
        ctx.strokeStyle = `rgba(230,220,200,${chalk.a * 0.22})`;
        ctx.fillStyle = `rgba(230,220,200,${chalk.a * 0.22})`;
        ctx.lineWidth = 1.4;
        const j = () => rand(-0.8, 0.8);
        ctx.beginPath();
        if (chalk.kind === 0) { // orbit
            ctx.ellipse(0, 0, 60, 22, -0.3, 0, Math.PI * 2);
            ctx.moveTo(8, 0); ctx.arc(0, 0, 8, 0, Math.PI * 2);
            ctx.moveTo(58, -6); ctx.arc(54, -8, 4, 0, Math.PI * 2);
        } else if (chalk.kind === 1) { // gear
            for (let i = 0; i <= 16; i++) {
                const a = i / 16 * Math.PI * 2, r = i % 2 ? 26 : 34;
                ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r + j(), Math.sin(a) * r + j());
            }
            ctx.moveTo(10, 0); ctx.arc(0, 0, 10, 0, Math.PI * 2);
        } else if (chalk.kind === 2) { // wave
            for (let x = -60; x <= 60; x += 4) ctx[x === -60 ? 'moveTo' : 'lineTo'](x, Math.sin(x / 10) * 14 + j());
            ctx.moveTo(-60, 26); ctx.lineTo(60, 26);
        } else { // tree
            const br = (x, y, a, l, d) => {
                if (d === 0) return;
                const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l;
                ctx.moveTo(x, y); ctx.lineTo(x2 + j(), y2 + j());
                br(x2, y2, a - 0.45, l * 0.7, d - 1); br(x2, y2, a + 0.45, l * 0.7, d - 1);
            };
            br(0, 36, -Math.PI / 2, 26, 5);
        }
        ctx.stroke();
        ctx.font = '14px "JetBrains Mono", monospace';
        ctx.fillText('next?', 44, 44);
        ctx.restore();
    }

    // ------------------------------------------------------------------ intro
    let introStart = performance.now(), introDone = false, introEmber = null;
    const returning = store.get('visited', false);

    function finishIntro() {
        if (introDone) return;
        introDone = true;
        roomLight = 1;
        fireLevel = Math.max(fireLevel, 1);
        flattenTitle();
        body.classList.remove('intro');
        brain.set('sleep');
        if (!returning && !reduced) {
            setTimeout(() => { brain.guideTo(performance.now() + 4500); brain.set('tour'); }, 900);
        }
        store.set('visited', true);
    }

    function runIntro(now) {
        const t = (now - introStart) / 1000;
        const m = mouthEl.getBoundingClientRect();
        const mx = m.left + m.width / 2, my = m.top + m.height * 0.8;
        if (t < 1.1) {
            const k = t / 1.1;
            introEmber = { x: lerp(W / 2 + 80, mx, k) + Math.sin(k * 9) * 30 * (1 - k), y: lerp(H + 10, my, 1 - (1 - k) * (1 - k)) };
        } else if (introEmber) {
            introEmber = null;
            spawnSparks(mx, my, 60, 1);
            sound.whoosh(1);
        }
        if (t > 1.1) {
            fireLevel = clamp((t - 1.1) / 1.2, 0, 1);
            roomLight = fireLevel;
        }
        const chars = title.querySelectorAll('.ch');
        const per = 0.075, start = 2.2;
        chars.forEach((c, i) => {
            if (t > start + i * per && !c.classList.contains('struck')) {
                c.classList.add('struck');
                const r = c.getBoundingClientRect();
                spawnSparks(r.left + r.width / 2, r.bottom - r.height * 0.2, 14, 0.7);
                if (i % 3 === 0) sound.clink(0.35);
            }
        });
        if (t > start + chars.length * per + 0.6) finishIntro();
    }

    if (returning || reduced) {
        finishIntro();
    } else {
        splitTitle();
        brain.set('intro');
        const skip = () => finishIntro();
        addEventListener('keydown', skip, { once: true });
        addEventListener('pointerdown', skip, { once: true });
        addEventListener('wheel', skip, { once: true, passive: true });
    }

    // Pre-coil the dragon so it is already asleep around the forge when the lights come on.
    for (let i = 0; i < 240; i++) brain.update(1 / 30);

    if (store.get('sound', false)) {
        // Browsers need a gesture before audio; arm it on the first one.
        addEventListener('pointerdown', () => { if (!sound.on) $('#sound').click(); }, { once: true });
    }

    // ------------------------------------------------------------------ main loop
    let last = performance.now(), lastScroll = scrollY;

    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;

        // Fire, sparks and breath belong to the page, so they scroll with it.
        const scrolled = scrollY - lastScroll;
        lastScroll = scrollY;
        if (scrolled) for (const list of [fire, sparks, breath]) for (const p of list) p.y -= scrolled;

        if (!introDone) runIntro(now);

        // Fire level: night burns hotter, hearth hover flares it, lingering pumps the bellows,
        // and a hovered reactor drives the light with its own power.
        const base = night ? 1.2 : 1;
        fireBoostTarget = 1;
        if (hearthHover) fireBoostTarget = hearthLinger === -1 ? 1.5 + 0.5 * Math.sin(now / 190) : 1.5;
        if (active && active.item.id === 'reactor' && active.preview) fireBoostTarget = 0.5 + active.preview.power * 1.6;
        fireBoost = lerp(fireBoost, fireBoostTarget, Math.min(1, dt * 4));
        const flicker = 0.88 + 0.12 * Math.sin(now / 90) * Math.sin(now / 37 + 1);
        const heatNow = (introDone ? 1 : fireLevel) * base * fireBoost;
        body.style.setProperty('--fire', (heatNow * flicker).toFixed(3));
        body.style.setProperty('--light', roomLight.toFixed(3));
        sound.fire(heatNow);

        const m = mouthEl.getBoundingClientRect();
        const hearthVisible = m.bottom > 0 && m.top < H;
        const mx = m.left + m.width / 2;

        // ---- fluid
        if (hearthVisible && heatNow > 0.05) {
            const fl = flueEl.getBoundingClientRect();
            const [ci, cj] = toCell(fl.left + fl.width / 2, fl.top);
            fluid.splat(ci, cj, 1.6 * (fl.width / CELL / 6), 5 * dt * heatNow, rand(-6, 6), 16 * heatNow);
        }
        if (cursor.moved && cursor.inside) {
            const [ci, cj] = toCell(cursor.x, cursor.y);
            fluid.splat(ci, cj, 2.5, 0, clamp(cursor.vx / CELL * 0.08, -60, 60), clamp(-cursor.vy / CELL * 0.08, -60, 60));
            cursor.moved = false;
        }
        fluid.step(Math.min(dt, 1 / 30), { buoyancy: 6, fade: 0.12 });

        // ---- particles
        if (hearthVisible && heatNow > 0.02) {
            const n = Math.floor((reduced ? 30 : 95) * heatNow * dt + Math.random());
            const lean = cursor.inside && Math.hypot(cursor.x - mx, cursor.y - m.bottom) < 320 ? (cursor.x - mx) * 0.5 : 0;
            for (let i = 0; i < n; i++) {
                fire.push({
                    x: rand(m.left + m.width * 0.18, m.right - m.width * 0.18),
                    y: m.bottom - m.height * 0.05,
                    vx: rand(-18, 18) + lean, vy: rand(-90, -160) * Math.min(1.6, heatNow),
                    life: 0, max: rand(0.5, 1.0), s: rand(9, 22) * (m.width / 180), r: rand(0, 6)
                });
            }
        }
        if (now < rainUntil) for (let i = 0; i < 6; i++) sparks.push({ x: rand(0, W), y: -5, vx: rand(-30, 30), vy: rand(100, 300), t: 1 });

        for (let i = fire.length - 1; i >= 0; i--) {
            const p = fire[i];
            p.life += dt;
            if (p.life > p.max) { fire.splice(i, 1); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 2;
            p.vx *= 0.98;
        }
        for (let i = sparks.length - 1; i >= 0; i--) {
            const s = sparks[i];
            s.vy += 1100 * dt;
            s.x += s.vx * dt; s.y += s.vy * dt;
            if (s.y > H - 2 && s.vy > 0) { s.y = H - 2; s.vy *= -0.35; s.vx *= 0.6; }
            s.t -= dt * 0.75;
            if (s.t <= 0 || s.x < -20 || s.x > W + 20) sparks.splice(i, 1);
        }
        for (let i = breath.length - 1; i >= 0; i--) {
            const b = breath[i];
            b.life += dt;
            if (b.life > b.max) { breath.splice(i, 1); continue; }
            b.x += b.vx * dt; b.y += b.vy * dt;
        }
        for (const e of embers) {
            const [ci, cj] = toCell(e.x, e.y);
            const [u, v] = fluid.velocityAt(clamp(ci, 1, fluid.nx - 2), clamp(cj, 1, fluid.ny - 2));
            e.vx = lerp(e.vx, u * CELL * 0.6, dt * 2);
            e.vy = lerp(e.vy, -v * CELL * 0.6 - 40, dt * 2);
            const dx = e.x - cursor.x, dy = e.y - cursor.y, d2 = dx * dx + dy * dy;
            if (cursor.inside && d2 < 120 * 120) { const d = Math.sqrt(d2) || 1; e.vx += dx / d * 300 * dt; e.vy += dy / d * 300 * dt; }
            e.x += e.vx * dt; e.y += e.vy * dt;
            e.t -= dt * 0.05;
            if (e.y < -20 || e.t <= 0 || e.x < -20 || e.x > W + 20) resetEmber(e, false);
        }

        // ---- plates: approach heat
        for (const p of plates) {
            const r = p.el.getBoundingClientRect();
            if (r.bottom < 0 || r.top > H) { p.heat = p.base; continue; }
            let target = p.base;
            if (cursor.inside && !cursor.touch) {
                const dx = Math.max(r.left - cursor.x, 0, cursor.x - r.right);
                const dy = Math.max(r.top - cursor.y, 0, cursor.y - r.bottom);
                target = Math.max(target, clamp(1 - Math.hypot(dx, dy) / 240, 0, 1) * 0.42);
            }
            if (p.state === 'contact') target = 0.78;
            if (p.state === 'linger') target = 1;
            p.heat = lerp(p.heat, target, Math.min(1, dt * 8));
            p.el.style.setProperty('--heat', p.heat.toFixed(3));
        }
        if (active && active.preview) { active.preview.step(dt); active.preview.draw(); }

        // ---- chains sway toward the cursor
        for (const c of chains) {
            const r = c.el.getBoundingClientRect();
            const near = cursor.inside && Math.abs(cursor.y - (r.top + r.height / 2)) < 260 && Math.abs(cursor.x - (r.left + r.width / 2)) < 260;
            const target = near ? clamp((cursor.x - (r.left + r.width / 2)) / 18, -14, 14) : 0;
            c.vel += (target - c.angle) * 30 * dt;
            c.vel *= Math.pow(0.04, dt);
            c.angle += c.vel * dt * 6;
            c.el.style.setProperty('--sway', c.angle.toFixed(2) + 'deg');
        }

        // ---- chalk: linger in empty darkness and unfinished ideas appear
        cursor.still += dt;
        emptyCheck -= dt;
        if (emptyCheck <= 0 && cursor.inside) {
            emptyCheck = 0.25;
            const el = document.elementFromPoint(cursor.x, cursor.y);
            overEmpty = !el || !el.closest('a, button, input, .ingot, h1, h2, h3, p, svg, .plate, .banner, .tally');
        }
        if (overEmpty && cursor.still > 1.6 && cursor.inside) {
            if (chalk.a < 0.02) { chalk.x = cursor.x + 30; chalk.y = cursor.y - 50; chalk.kind = Math.floor(cursor.x / 97 + cursor.y / 53) % 4; }
            chalk.a = Math.min(1, chalk.a + dt * 0.8);
        } else chalk.a = Math.max(0, chalk.a - dt * 2.5);

        brain.update(dt);

        // ================================================================ draw: back
        bctx.clearRect(0, 0, W, H);
        if (hearthVisible) {
            const gy = m.top + m.height * 0.75, R = Math.max(W, H) * 0.55 * Math.min(1.4, heatNow * flicker);
            const g = bctx.createRadialGradient(mx, gy, 0, mx, gy, R);
            g.addColorStop(0, `rgba(255,120,50,${0.22 * Math.min(1.3, heatNow * flicker)})`);
            g.addColorStop(0.4, `rgba(255,80,30,${0.07 * heatNow})`);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            bctx.fillStyle = g;
            bctx.fillRect(0, 0, W, H);
        }

        // smoke, posterised into flat bands for the low-poly look
        const d = smokeImg.data, nx = fluid.nx, ny = fluid.ny, sw = nx - 2, sh = ny - 2;
        for (let i = 1; i < nx - 1; i++) {
            for (let j = 1; j < ny - 1; j++) {
                const v = fluid.d[i * ny + j];
                const lvl = Math.min(4, Math.floor(v * 8)) / 4;
                const p = 4 * ((sh - j) * sw + (i - 1));
                const warm = clamp(j / ny < 0.5 ? 0.6 - j / ny : 0, 0, 0.5);
                d[p] = 92 + warm * 120; d[p + 1] = 82 + warm * 30; d[p + 2] = 80;
                d[p + 3] = lvl * 110;
            }
        }
        smokeCtx.putImageData(smokeImg, 0, 0);
        bctx.imageSmoothingEnabled = !pixel;
        bctx.drawImage(smokeCanvas, 0, H - sh * CELL, sw * CELL, sh * CELL);

        bctx.globalCompositeOperation = 'lighter';
        for (const p of fire) {
            const k = p.life / p.max;
            bctx.fillStyle = heatColor(1 - k * 0.9);
            bctx.globalAlpha = (1 - k) * 0.85;
            const s = p.s * (1 - k * 0.6);
            bctx.beginPath();
            bctx.moveTo(p.x + Math.cos(p.r) * s, p.y + Math.sin(p.r) * s * 1.4);
            bctx.lineTo(p.x + Math.cos(p.r + 2.1) * s * 0.7, p.y + Math.sin(p.r + 2.1) * s);
            bctx.lineTo(p.x + Math.cos(p.r + 4.2) * s * 0.7, p.y + Math.sin(p.r + 4.2) * s);
            bctx.fill();
        }
        for (const e of embers) {
            bctx.globalAlpha = e.t * 0.9;
            bctx.fillStyle = heatColor(0.45 + e.t * 0.5);
            bctx.beginPath();
            bctx.moveTo(e.x, e.y - e.s); bctx.lineTo(e.x + e.s * 0.7, e.y); bctx.lineTo(e.x, e.y + e.s); bctx.lineTo(e.x - e.s * 0.7, e.y);
            bctx.fill();
        }
        bctx.globalAlpha = 1;
        bctx.globalCompositeOperation = 'source-over';
        drawChalk(bctx);

        // ================================================================ draw: front
        fctx.clearRect(0, 0, W, H);
        const light = hearthVisible
            ? { x: mx, y: m.top + m.height * 0.7, power: Math.min(1.3, heatNow * flicker) * Math.max(0.15, roomLight), reach: 900 }
            : { x: cursor.x, y: cursor.y, power: 0.7, reach: 500 };
        if (roomLight > 0.02 || !introDone) {
            fctx.globalAlpha = introDone ? 1 : Math.max(0.05, roomLight);
            dragon.draw(fctx, light);
            fctx.globalAlpha = 1;
        }

        fctx.globalCompositeOperation = 'lighter';
        for (const b of breath) {
            const k = b.life / b.max;
            fctx.globalAlpha = 1 - k;
            fctx.fillStyle = heatColor(1 - k * 0.8);
            const s = b.s * (0.6 + k);
            fctx.beginPath();
            fctx.moveTo(b.x, b.y - s); fctx.lineTo(b.x + s * 0.8, b.y + s * 0.5); fctx.lineTo(b.x - s * 0.8, b.y + s * 0.5);
            fctx.fill();
        }
        fctx.lineWidth = 1.6;
        fctx.lineCap = 'round';
        for (const s of sparks) {
            fctx.globalAlpha = Math.min(1, s.t * 1.5);
            fctx.strokeStyle = heatColor(s.t);
            fctx.beginPath();
            fctx.moveTo(s.x, s.y);
            fctx.lineTo(s.x - s.vx * 0.018, s.y - s.vy * 0.018);
            fctx.stroke();
        }
        if (introEmber) {
            const g = fctx.createRadialGradient(introEmber.x, introEmber.y, 0, introEmber.x, introEmber.y, 40);
            g.addColorStop(0, 'rgba(255,180,90,0.9)'); g.addColorStop(1, 'rgba(255,80,20,0)');
            fctx.globalAlpha = 1;
            fctx.fillStyle = g;
            fctx.fillRect(introEmber.x - 40, introEmber.y - 40, 80, 80);
        }
        if (finePointer && cursor.inside && !cursor.touch) {
            const g = fctx.createRadialGradient(cursor.x, cursor.y, 0, cursor.x, cursor.y, 70);
            g.addColorStop(0, 'rgba(255,150,70,0.22)'); g.addColorStop(1, 'rgba(255,90,30,0)');
            fctx.globalAlpha = 1;
            fctx.fillStyle = g;
            fctx.fillRect(cursor.x - 70, cursor.y - 70, 140, 140);
            fctx.fillStyle = heatColor(0.85 + 0.15 * Math.sin(now / 120));
            fctx.beginPath();
            fctx.moveTo(cursor.x, cursor.y - 6); fctx.lineTo(cursor.x + 4, cursor.y); fctx.lineTo(cursor.x, cursor.y + 6); fctx.lineTo(cursor.x - 4, cursor.y);
            fctx.fill();
        }
        fctx.globalAlpha = 1;
        fctx.globalCompositeOperation = 'source-over';

        if (smokeFlash > 0) {
            fctx.fillStyle = `rgba(70,64,62,${Math.min(0.92, smokeFlash)})`;
            fctx.fillRect(0, 0, W, H);
            smokeFlash = Math.max(0, smokeFlash - dt * 0.8);
        }

        requestAnimationFrame(frame);
    }

    resize();
    addEventListener('resize', resize);
    requestAnimationFrame(frame);
})();
