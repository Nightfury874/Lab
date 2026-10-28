// Draws the reactor hall: a side-on cut through the core, rods and drives, boiling channels,
// steam drums, pumps, the neutrons themselves — and what happens when it all goes wrong.
(function () {
    'use strict';

    const G = window.Reactor.GRID;
    const TAU = Math.PI * 2;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const rand = (a, b) => a + Math.random() * (b - a);

    // Incandescence: dark red → orange → yellow → white as fuel heats.
    function heat(t, alpha = 1) {
        t = clamp(t, 0, 1);
        const stops = [[0, [60, 20, 14]], [0.3, [170, 40, 18]], [0.55, [255, 106, 43]], [0.78, [255, 190, 90]], [1, [255, 250, 230]]];
        for (let i = 1; i < stops.length; i++) {
            if (t <= stops[i][0]) {
                const [t0, a] = stops[i - 1], [t1, b] = stops[i], k = (t - t0) / (t1 - t0);
                return `rgba(${a.map((v, n) => Math.round(v + (b[n] - v) * k)).join(',')},${alpha})`;
            }
        }
        return `rgba(255,250,230,${alpha})`;
    }
    const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * clamp(t, 0, 1))).join(',')})`;

    // Overlay colour scales
    const SCALES = {
        flux: v => mix([10, 20, 60], [80, 220, 255], v),
        power: v => heat(v * 0.9 + 0.05, 0.85),
        void: v => mix([20, 70, 160], [235, 240, 250], v),
        xenon: v => mix([20, 40, 30], [190, 90, 255], v),
        temp: v => heat(v, 0.9)
    };

    class View {
        constructor(canvas, reactor) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d');
            this.R = reactor;
            this.mode = 'physical';
            this.hover = null;
            this.bubbles = [];
            this.shake = 0;
            this.boom = null;
            this.time = 0;
            this.pumpAngle = 0;
            this.resize();
        }

        resize() {
            const dpr = Math.min(2, window.devicePixelRatio || 1);
            const r = this.canvas.getBoundingClientRect();
            this.W = r.width; this.H = r.height;
            this.canvas.width = Math.round(r.width * dpr);
            this.canvas.height = Math.round(r.height * dpr);
            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            // layout: drives above, the core grid, plumbing below
            const above = 4.2, below = 2.6, top = this.top || 48, bottom = this.bottom || 30; // room for the mode bar and legend
            const s = Math.min((this.W - 24) / (G.NX + 4.5), (this.H - top - bottom) / (G.NY + above + below));
            this.s = s;
            this.x0 = (this.W - G.NX * s) / 2;
            this.y0 = top + above * s;
        }

        // grid units → pixels
        px(gx) { return this.x0 + gx * this.s; }
        py(gy) { return this.y0 + gy * this.s; }
        depthY(m) { return this.py(G.CT + m / G.ROW_M); }

        hit(x, y) {
            const gx = (x - this.x0) / this.s, gy = (y - this.y0) / this.s;
            const c = Math.floor(gx), r = Math.floor(gy);
            if (c < 0 || c >= G.NX) return null;
            if (G.COL[c] === 'rod' && gy > -3.5 && gy < G.CB) return { type: 'rod', rod: this.R.rods.find(rd => rd.col === c), gy };
            if (r < 0 || r >= G.NY) return null;
            return { type: 'cell', c, r };
        }

        // ---------------------------------------------------------------- drawing
        draw(dt) {
            const { ctx, W, H, R } = this;
            this.time += dt;
            ctx.save();
            if (this.shake > 0) {
                ctx.translate(rand(-1, 1) * this.shake * 10, rand(-1, 1) * this.shake * 10);
                this.shake = Math.max(0, this.shake - dt * 1.2);
            }
            this.drawHall();
            if (this.boom) { this.drawBoom(dt); ctx.restore(); return; }
            this.drawPlumbing(dt);
            this.drawStack();
            this.drawChannels(dt);
            this.drawRods();
            if (this.mode !== 'physical') this.drawOverlay();
            this.drawNeutrons();
            this.drawShield();
            if (this.hover) this.drawHover();
            ctx.restore();
        }

        drawHall() {
            const { ctx, W, H } = this;
            const g = ctx.createLinearGradient(0, 0, 0, H);
            g.addColorStop(0, '#0d0c0e'); g.addColorStop(1, '#070607');
            ctx.fillStyle = g;
            ctx.fillRect(-20, -20, W + 40, H + 40);
            // the glow of the core on the hall walls, scaled by power
            const P = this.R.power, glow = clamp(Math.log10(Math.max(P, 0.01)) / 4, 0, 1.3);
            const cx = this.px(G.NX / 2), cy = this.py(G.CT + G.CR / 2);
            const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.s * G.NX * 0.9);
            rg.addColorStop(0, `rgba(255,110,40,${0.10 * glow})`);
            rg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = rg;
            ctx.fillRect(0, 0, W, H);
        }

        drawStack() {
            const { ctx, s, R } = this;
            for (let c = 0; c < G.NX; c++) for (let r = 0; r < G.NY; r++) {
                const x = this.px(c), y = this.py(r);
                const refl = G.COL[c] === 'refl' || r < G.CT || r >= G.CB;
                const shade = refl ? 22 : 30, jitter = ((c * 7 + r * 13) % 5) - 2;
                // graphite warms with the stack temperature
                const warm = clamp((R.Tg - 280) / 500, 0, 1) * (refl ? 0.4 : 1);
                ctx.fillStyle = `rgb(${shade + jitter + warm * 22},${shade + jitter + warm * 6},${shade + 4 + jitter})`;
                ctx.beginPath(); ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + s - 1, y + 1); ctx.lineTo(x + 1, y + s - 1); ctx.fill();
                ctx.fillStyle = `rgb(${shade - 4 + jitter + warm * 18},${shade - 4 + jitter + warm * 4},${shade + jitter})`;
                ctx.beginPath(); ctx.moveTo(x + s - 1, y + 1); ctx.lineTo(x + s - 1, y + s - 1); ctx.lineTo(x + 1, y + s - 1); ctx.fill();
            }
            // core outline
            ctx.strokeStyle = 'rgba(255,180,90,0.15)';
            ctx.lineWidth = 1;
            ctx.strokeRect(this.px(G.C0), this.py(G.CT), (G.C1 - G.C0 + 1) * s, G.CR * s);
        }

        drawChannels(dt) {
            const { ctx, s, R } = this;
            const tw = s * 0.46;
            for (const c of G.FUEL_COLS) {
                const xc = this.px(c + 0.5);
                // tube runs from the bottom header to the top of the stack
                ctx.fillStyle = '#16181d';
                ctx.fillRect(xc - tw / 2 - 1, this.py(0), tw + 2, (G.NY) * s);
                for (let r = G.CT; r < G.CB; r++) {
                    const k = c * G.NY + r, y = this.py(r), a = R.alpha[k];
                    ctx.fillStyle = mix([22, 70, 150], [205, 215, 228], a * 0.95);
                    ctx.fillRect(xc - tw / 2, y, tw, s + 0.5);
                    // two fuel elements glowing with their temperature
                    const t = clamp((R.Tf[k] - 300) / 2300, 0, 1);
                    ctx.fillStyle = t > 0.05 ? heat(0.15 + t * 0.85) : '#3a2a22';
                    ctx.fillRect(xc - tw * 0.28, y, s * 0.07, s + 0.5);
                    ctx.fillRect(xc + tw * 0.28 - s * 0.07, y, s * 0.07, s + 0.5);
                    if (t > 0.35) {
                        ctx.globalCompositeOperation = 'lighter';
                        ctx.fillStyle = heat(t, (t - 0.35) * 0.5);
                        ctx.fillRect(xc - tw, y, tw * 2, s);
                        ctx.globalCompositeOperation = 'source-over';
                    }
                }
                // water above and below the core
                ctx.fillStyle = 'rgba(30,80,160,0.55)';
                ctx.fillRect(xc - tw / 2, this.py(G.CB), tw, (G.NY - G.CB) * s);
                ctx.fillStyle = mix([30, 80, 160], [200, 210, 225], R.alpha[c * G.NY + G.CT]);
                ctx.fillRect(xc - tw / 2, this.py(0), tw, G.CT * s);
            }
            // bubbles: born where water boils, carried up by the flow
            const speed = (2 + 5 * R.flow) * s;
            for (const c of G.FUEL_COLS) for (let r = G.CT; r < G.CB; r++) {
                const a = R.alpha[c * G.NY + r];
                if (Math.random() < a * dt * 9 && this.bubbles.length < 900) {
                    this.bubbles.push({ x: this.px(c + 0.5) + rand(-tw * 0.35, tw * 0.35), y: this.py(r + Math.random()), r: rand(1, 2.4) * (0.6 + a), c });
                }
            }
            ctx.strokeStyle = 'rgba(240,248,255,0.75)';
            ctx.lineWidth = 1;
            for (let i = this.bubbles.length - 1; i >= 0; i--) {
                const b = this.bubbles[i];
                b.y -= speed * dt * (1 + b.r * 0.15);
                b.x += Math.sin(this.time * 7 + b.y * 0.1) * 0.3;
                if (b.y < this.py(0)) { this.bubbles.splice(i, 1); continue; }
                ctx.beginPath();
                for (let j = 0; j < 6; j++) {
                    const ang = j / 6 * TAU;
                    ctx[j ? 'lineTo' : 'moveTo'](b.x + Math.cos(ang) * b.r, b.y + Math.sin(ang) * b.r);
                }
                ctx.closePath(); ctx.stroke();
            }
        }

        drawRods() {
            const { ctx, s, R } = this;
            const tw = s * 0.4;
            const top = this.py(-3.4), bot = this.py(G.CB);
            for (const rod of R.rods) {
                const xc = this.px(rod.col + 0.5);
                const ar = rod.group === 'AR';
                // channel: water in the cooling circuit
                ctx.fillStyle = 'rgba(30,80,160,0.5)';
                ctx.fillRect(xc - tw / 2, this.py(0), tw, G.NY * s);
                ctx.strokeStyle = 'rgba(232,182,48,0.25)';
                ctx.lineWidth = 1;
                ctx.strokeRect(xc - tw / 2 - 1.5, top, tw + 3, bot - top);
                const a = rod.pos * 7;
                const seg = (d0, d1, fill) => {
                    const y0 = Math.max(top, this.depthY(d0)), y1 = Math.min(bot, this.depthY(d1));
                    if (y1 <= y0) return null;
                    ctx.fillStyle = fill;
                    ctx.fillRect(xc - tw / 2, y0, tw, y1 - y0);
                    return [y0, y1];
                };
                // boron carbide absorber, with a hazard band at its tip
                const b = seg(a - G.ABSORBER, a, ar ? '#2a2033' : '#22242c');
                if (b) {
                    ctx.fillStyle = ar ? 'rgba(190,120,255,0.25)' : 'rgba(255,255,255,0.05)';
                    ctx.fillRect(xc - tw / 2, b[0], tw * 0.3, b[1] - b[0]);
                    const yt = b[1];
                    if (yt > top + 4) {
                        for (let i = 0; i < 4; i++) {
                            ctx.fillStyle = i % 2 ? '#111' : '#e8b630';
                            ctx.fillRect(xc - tw / 2, yt - 4 - i * 3, tw, 3);
                        }
                    }
                }
                // telescopic link through water
                const l = seg(a, a + G.LINK, 'rgba(0,0,0,0)');
                if (l) { ctx.fillStyle = '#4a4d55'; ctx.fillRect(xc - 1, l[0], 2, l[1] - l[0]); }
                // graphite displacer — the flaw
                const d = seg(a + G.LINK, a + G.LINK + G.DISPLACER, ar ? '#3b3640' : '#575963');
                if (d) {
                    ctx.fillStyle = 'rgba(255,255,255,0.08)';
                    ctx.beginPath(); ctx.moveTo(xc - tw / 2, d[0]); ctx.lineTo(xc + tw / 2, d[0]); ctx.lineTo(xc - tw / 2, d[1]); ctx.fill();
                }
                // target marker on the drive
                const ty = this.depthY(rod.target * 7);
                ctx.fillStyle = rod.override ? '#7fd1ff' : '#ffb347';
                ctx.beginPath(); ctx.moveTo(xc + tw / 2 + 2, ty); ctx.lineTo(xc + tw / 2 + 8, ty - 4); ctx.lineTo(xc + tw / 2 + 8, ty + 4); ctx.fill();
            }
        }

        drawShield() {
            const { ctx, s, R } = this;
            // upper biological shield — "Elena" — and the floor of channel caps above it
            const y = this.py(0) - s * 0.55;
            ctx.fillStyle = '#26262b';
            ctx.fillRect(this.px(-1), y, (G.NX + 2) * s, s * 0.55);
            ctx.fillStyle = '#323238';
            ctx.beginPath(); ctx.moveTo(this.px(-1), y); ctx.lineTo(this.px(G.NX + 1), y); ctx.lineTo(this.px(G.NX + 1), y + s * 0.2); ctx.fill();
            for (let c = G.C0; c <= G.C1; c++) {
                const x = this.px(c) + s * 0.15;
                ctx.fillStyle = G.COL[c] === 'rod' ? '#4b4d55' : ((c % 2) ? '#5b4a38' : '#6b5a44');
                ctx.fillRect(x, y - s * 0.22, s * 0.7, s * 0.22);
            }
            // rod drive servos with position lamps
            for (const rod of R.rods) {
                const x = this.px(rod.col + 0.5), yt = this.py(-3.6);
                ctx.fillStyle = '#1b1c21';
                ctx.fillRect(x - s * 0.45, yt - s * 0.55, s * 0.9, s * 0.55);
                ctx.fillStyle = '#2b2d34';
                ctx.fillRect(x - s * 0.45, yt - s * 0.55, s * 0.9, s * 0.12);
                const moving = Math.abs(rod.target - rod.pos) > 0.002;
                ctx.fillStyle = R.scram ? '#ff3b30' : moving ? (Math.floor(this.time * 8) % 2 ? '#ffb347' : '#5a3a10') : rod.group === 'AR' ? '#b48cff' : '#3ddc84';
                ctx.beginPath(); ctx.arc(x, yt - s * 0.28, s * 0.09, 0, TAU); ctx.fill();
                ctx.fillStyle = 'rgba(232,220,203,0.7)';
                ctx.font = `600 ${Math.max(9, s * 0.32)}px Rajdhani, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(rod.name, x, yt - s * 0.7);
                // shaft from the drive down to the shield
                ctx.fillStyle = '#3a3c44';
                ctx.fillRect(x - 1, yt, 2, this.py(-3.4) - yt);
            }
        }

        drawPlumbing(dt) {
            const { ctx, s, R } = this;
            const left = this.px(-1.8), right = this.px(G.NX + 1.8);
            // steam drums
            const dy = this.py(-2.6), dr = s * 0.9;
            for (const dx of [left, right]) {
                ctx.fillStyle = '#24252b';
                ctx.beginPath(); ctx.ellipse(dx, dy, dr * 0.9, dr, 0, 0, TAU); ctx.fill();
                ctx.fillStyle = 'rgba(40,100,190,0.65)';
                ctx.beginPath(); ctx.ellipse(dx, dy + dr * 0.25, dr * 0.75, dr * 0.6, 0, 0, Math.PI); ctx.fill();
                ctx.fillStyle = `rgba(230,235,245,${clamp(R.avgVoid * 1.5, 0.05, 0.6)})`;
                ctx.beginPath(); ctx.ellipse(dx, dy - dr * 0.3, dr * 0.6, dr * 0.35, 0, 0, TAU); ctx.fill();
            }
            // risers from the core top to the drums, downcomers to the pumps
            ctx.strokeStyle = '#2f3138';
            ctx.lineWidth = Math.max(2, s * 0.16);
            ctx.beginPath();
            ctx.moveTo(this.px(G.C0), this.py(0) - s * 0.6); ctx.lineTo(left, this.py(0) - s * 0.6); ctx.lineTo(left, dy + dr);
            ctx.moveTo(this.px(G.C1 + 1), this.py(0) - s * 0.6); ctx.lineTo(right, this.py(0) - s * 0.6); ctx.lineTo(right, dy + dr);
            const py = this.py(G.NY + 1.3);
            ctx.moveTo(left, dy + dr); ctx.lineTo(left, py);
            ctx.moveTo(right, dy + dr); ctx.lineTo(right, py);
            ctx.moveTo(left, py); ctx.lineTo(right, py);
            ctx.stroke();
            // header under the core
            ctx.fillStyle = '#23242a';
            ctx.fillRect(this.px(G.C0), this.py(G.NY), (G.C1 - G.C0 + 1) * s, s * 0.45);
            // the main circulation pumps
            this.pumpAngle += R.flow * dt * 14;
            for (const x of [this.px(4), this.px(G.NX - 4)]) {
                ctx.fillStyle = '#1d1e23';
                ctx.beginPath(); ctx.arc(x, py, s * 0.7, 0, TAU); ctx.fill();
                ctx.fillStyle = R.flow > 0.05 ? '#5d8fd6' : '#3a3c44';
                for (let i = 0; i < 4; i++) {
                    const a = this.pumpAngle + i * Math.PI / 2;
                    ctx.beginPath();
                    ctx.moveTo(x, py);
                    ctx.lineTo(x + Math.cos(a) * s * 0.55, py + Math.sin(a) * s * 0.55);
                    ctx.lineTo(x + Math.cos(a + 0.6) * s * 0.35, py + Math.sin(a + 0.6) * s * 0.35);
                    ctx.fill();
                }
            }
        }

        drawNeutrons() {
            const { ctx, s, R } = this;
            const P = Math.max(R.power, 1e-6);
            const vis = clamp((Math.log10(P) + 2) / 5, 0.12, 1);
            const n = R.neutrons, every = Math.max(1, Math.round(1 / vis));
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineCap = 'round';
            for (let i = 0; i < n.length; i += every) {
                const p = n[i];
                const x = this.px(p.x), y = this.py(p.y), x0 = this.px(p.px), y0 = this.py(p.py);
                if (p.f) {
                    ctx.strokeStyle = `rgba(255,236,170,${0.75 * vis})`;
                    ctx.lineWidth = 1.2;
                    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
                } else {
                    ctx.strokeStyle = `rgba(90,200,255,${0.55 * vis})`;
                    ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
                    ctx.fillStyle = `rgba(150,225,255,${0.9 * vis})`;
                    ctx.fillRect(x - 1, y - 1, 2, 2);
                }
            }
            for (const f of R.flashes) {
                const k = f.t / 0.35, x = this.px(f.x), y = this.py(f.y), rr = s * (0.15 + k * 0.55);
                ctx.strokeStyle = `rgba(255,${Math.round(240 - k * 140)},${Math.round(200 - k * 170)},${(1 - k) * vis})`;
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                for (let j = 0; j < 6; j++) {
                    const ang = j / 6 * TAU + f.x;
                    ctx[j ? 'lineTo' : 'moveTo'](x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
                }
                ctx.closePath(); ctx.stroke();
            }
            ctx.globalCompositeOperation = 'source-over';
        }

        overlayValue(mode, k) {
            const R = this.R;
            switch (mode) {
                case 'flux': return R.phi2[k] / (this.maxFlux || 1);
                case 'power': return R.shape[k] / 3;
                case 'void': return R.alpha[k];
                case 'xenon': return R.X[k] / G.XEQ1 / 2.5;
                case 'temp': return (R.Tf[k] - 270) / 2500;
            }
            return 0;
        }

        drawOverlay() {
            const { ctx, s, R } = this;
            const mode = this.mode, scale = SCALES[mode];
            if (mode === 'flux') { let m = 0; for (let k = 0; k < R.phi2.length; k++) m = Math.max(m, R.phi2[k]); this.maxFlux = m; }
            ctx.globalAlpha = 0.72;
            for (let c = 0; c < G.NX; c++) for (let r = 0; r < G.NY; r++) {
                const fuel = G.COL[c] === 'fuel' && r >= G.CT && r < G.CB;
                if (mode !== 'flux' && !fuel) continue;
                ctx.fillStyle = scale(clamp(this.overlayValue(mode, c * G.NY + r), 0, 1));
                ctx.fillRect(this.px(c), this.py(r), s + 0.5, s + 0.5);
            }
            ctx.globalAlpha = 1;
        }

        drawHover() {
            const { ctx, s } = this, h = this.hover;
            ctx.strokeStyle = '#ffb347';
            ctx.lineWidth = 1.5;
            if (h.type === 'rod') ctx.strokeRect(this.px(h.rod.col) + 1, this.py(-3.4), s - 2, (G.CB + 3.4) * s);
            else ctx.strokeRect(this.px(h.c) + 1, this.py(h.r) + 1, s - 2, s - 2);
        }

        // ---------------------------------------------------------------- destruction
        explode() {
            const { s, R } = this;
            const shards = [];
            let ex = G.NX / 2, ey = G.CT + G.CR * 0.7, best = 0;
            for (const c of G.FUEL_COLS) for (let r = G.CT; r < G.CB; r++) {
                const t = R.Tf[c * G.NY + r];
                if (t > best) { best = t; ex = c + 0.5; ey = r + 0.5; }
            }
            for (let c = 0; c < G.NX; c++) for (let r = 0; r < G.NY; r++) {
                for (let half = 0; half < 2; half++) {
                    const cx = c + (half ? 0.66 : 0.33), cy = r + (half ? 0.66 : 0.33);
                    const dx = cx - ex, dy = cy - ey, d = Math.hypot(dx, dy) + 0.5;
                    const f = 26 / Math.sqrt(d);
                    const hot = G.COL[c] === 'fuel' && r >= G.CT && r < G.CB ? clamp(R.Tf[c * G.NY + r] / 2800, 0.2, 1) : rand(0.05, 0.35);
                    shards.push({
                        x: this.px(cx), y: this.py(cy), vx: dx / d * f * s * rand(0.5, 1.4), vy: (dy / d * f - rand(8, 22)) * s * rand(0.5, 1.2),
                        a: rand(0, TAU), va: rand(-8, 8), sz: s * rand(0.4, 0.7), hot, half
                    });
                }
            }
            this.boom = {
                t: 0, shards,
                lid: { x: this.px(G.NX / 2), y: this.py(0) - s * 0.3, a: 0, va: rand(1.6, 2.4) * (Math.random() < 0.5 ? -1 : 1), vy: -s * 26, vx: rand(-3, 3) * s },
                smoke: [],
                ex: this.px(ex), ey: this.py(ey)
            };
            this.shake = 1.6;
        }

        drawBoom(dt) {
            const { ctx, W, H, s } = this, b = this.boom;
            b.t += dt;
            const g = s * 30;
            // fire light from the open core
            const fl = ctx.createRadialGradient(b.ex, b.ey, 0, b.ex, b.ey, s * 22);
            fl.addColorStop(0, `rgba(255,150,60,${0.5 + 0.15 * Math.sin(b.t * 13)})`);
            fl.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = fl;
            ctx.fillRect(0, 0, W, H);
            // the gutted pit
            ctx.fillStyle = '#120806';
            ctx.fillRect(this.px(G.C0), this.py(G.CT), (G.C1 - G.C0 + 1) * s, G.CR * s);
            for (let i = 0; i < 4; i++) {
                ctx.fillStyle = heat(0.3 + 0.25 * Math.random(), 0.5);
                ctx.fillRect(this.px(G.C0 + Math.random() * 20), this.py(G.CT + 10 + Math.random() * 6), s * rand(1, 3), s * rand(0.5, 2));
            }
            // smoke
            if (b.t < 12 && b.smoke.length < 160) for (let i = 0; i < 3; i++) b.smoke.push({ x: b.ex + rand(-s * 4, s * 4), y: b.ey, r: s * rand(0.8, 1.6), vx: rand(-1, 1) * s, vy: -rand(2.5, 5) * s, life: 0 });
            for (const p of b.smoke) {
                p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += s * 0.9 * dt;
                const a = clamp(0.35 - p.life * 0.04, 0, 0.35);
                ctx.fillStyle = `rgba(60,52,50,${a})`;
                ctx.beginPath();
                for (let j = 0; j < 6; j++) { const ang = j / 6 * TAU + p.x; ctx[j ? 'lineTo' : 'moveTo'](p.x + Math.cos(ang) * p.r, p.y + Math.sin(ang) * p.r); }
                ctx.fill();
            }
            // the 1,000-tonne lid, flipped
            const L = b.lid;
            L.vy += g * dt; L.x += L.vx * dt; L.y += L.vy * dt; L.a += L.va * dt;
            if (L.y > this.py(-1.5) && L.vy > 0) { L.y = this.py(-1.5); L.vy = 0; L.vx = 0; L.va = 0; L.a = Math.round(L.a / (Math.PI / 2)) * Math.PI / 2 + 0.35; }
            ctx.save();
            ctx.translate(L.x, L.y); ctx.rotate(L.a);
            ctx.fillStyle = '#2c2c32';
            ctx.fillRect(-G.NX * s * 0.45, -s * 0.3, G.NX * s * 0.9, s * 0.6);
            ctx.fillStyle = '#5b4a38';
            for (let i = 0; i < 18; i++) ctx.fillRect(-G.NX * s * 0.42 + i * s * 1.2, -s * 0.5, s * 0.7, s * 0.2);
            ctx.restore();
            // debris
            for (const p of b.shards) {
                p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
                if (p.y > H - 6 && p.vy > 0) { p.y = H - 6; p.vy *= -0.25; p.vx *= 0.5; p.va *= 0.5; }
                p.hot = Math.max(0, p.hot - dt * 0.06);
                ctx.save();
                ctx.translate(p.x, p.y); ctx.rotate(p.a);
                ctx.fillStyle = p.hot > 0.25 ? heat(p.hot) : `rgb(${40 + p.hot * 60},${38 + p.hot * 20},${42})`;
                ctx.beginPath(); ctx.moveTo(-p.sz / 2, -p.sz / 2); ctx.lineTo(p.sz / 2, p.half ? p.sz / 2 : -p.sz / 2); ctx.lineTo(-p.sz / 2, p.sz / 2); ctx.fill();
                ctx.restore();
            }
            // the flash
            if (b.t < 0.6) { ctx.fillStyle = `rgba(255,250,235,${1 - b.t / 0.6})`; ctx.fillRect(0, 0, W, H); }
        }
    }

    View.heat = heat;
    window.ReactorView = View;
})();
