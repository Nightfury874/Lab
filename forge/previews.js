// Live miniatures. Each preview is a factory: (ctx, w, h) => { step(dt), draw() }.
// Only the hovered one runs at full speed; the rest stay frozen as embers.
(function () {
    const C = {
        bg: '#0c0a0a',
        steel: '#2a2f3a',
        ash: '#6b6f7a',
        ember: '#ff6a2b',
        molten: '#ffb347',
        white: '#fff4d6',
        cool: '#7fb6ff'
    };
    const rand = (a, b) => a + Math.random() * (b - a);
    const TAU = Math.PI * 2;

    function heat(t) {
        // 0 = cold ash, 1 = white hot
        t = Math.max(0, Math.min(1, t));
        const stops = [[0, [70, 72, 80]], [0.35, [190, 40, 20]], [0.6, [255, 106, 43]], [0.8, [255, 179, 71]], [1, [255, 244, 214]]];
        for (let i = 1; i < stops.length; i++) {
            if (t <= stops[i][0]) {
                const [t0, a] = stops[i - 1], [t1, b] = stops[i];
                const k = (t - t0) / (t1 - t0);
                return `rgb(${a.map((v, n) => Math.round(v + (b[n] - v) * k)).join(',')})`;
            }
        }
        return 'rgb(255,244,214)';
    }

    function poly(ctx, x, y, r, sides, rot = 0) {
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const a = rot + (i / sides) * TAU;
            ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
    }

    function clear(ctx, w, h) {
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, w, h);
    }

    const P = {};

    P.windtunnel = (ctx, w, h) => {
        const nx = 64, ny = 40;
        const f = new window.ForgeFluid(nx, ny, 1);
        f.overRelax = 1.9;
        f.iters = 20;
        f.walls({ left: true, right: false, top: true, bottom: true });
        const cx = 18, cy = ny / 2 + 1, r = 5;
        for (let i = 1; i < f.nx - 1; i++)
            for (let j = 1; j < f.ny - 1; j++)
                if ((i - cx) ** 2 + (j - cy) ** 2 < r * r) f.s[f.index(i, j)] = 0;
        const img = new ImageData(f.nx, f.ny);
        const off = document.createElement('canvas');
        off.width = f.nx; off.height = f.ny;
        const octx = off.getContext('2d');
        return {
            step(dt) {
                const inflow = 22;
                for (let j = 1; j < f.ny - 1; j++) {
                    f.u[f.index(1, j)] = inflow;
                    f.d[f.index(0, j)] = Math.abs(j - f.ny / 2) % 6 < 2 ? 1 : 0;
                    f.d[f.index(1, j)] = f.d[f.index(0, j)];
                }
                f.step(Math.min(dt, 1 / 30));
            },
            draw() {
                const data = img.data;
                for (let i = 0; i < f.nx; i++) {
                    for (let j = 0; j < f.ny; j++) {
                        const p = 4 * ((f.ny - 1 - j) * f.nx + i);
                        const k = f.index(i, j);
                        if (!f.s[k]) { data[p] = 40; data[p + 1] = 44; data[p + 2] = 56; data[p + 3] = 255; continue; }
                        const lvl = Math.round(Math.min(1, f.d[k]) * 4) / 4; // posterised, stylised bands
                        data[p] = 12 + lvl * 243;
                        data[p + 1] = 10 + lvl * 170;
                        data[p + 2] = 10 + lvl * 61;
                        data[p + 3] = 255;
                    }
                }
                octx.putImageData(img, 0, 0);
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(off, 1, 1, f.nx - 2, f.ny - 2, 0, 0, w, h);
            }
        };
    };

    P.pendulum = (ctx, w, h) => {
        let s = [Math.PI * 0.75, 0, Math.PI * 0.95, 0];
        const g = 9.81, l = 1, m = 1;
        const trail = [];
        const deriv = ([a1, w1, a2, w2]) => {
            const d = a2 - a1, c = Math.cos(d), sn = Math.sin(d);
            const den = 2 * m * l - m * l * c * c;
            const w1p = (m * l * w2 * w2 * sn - 2 * m * g * Math.sin(a1) + m * g * Math.sin(a2) * c) / den;
            const w2p = (-l * w1 * w1 * sn - g * Math.sin(a2) * l + 2 * m * g * Math.sin(a1) * c) / (l * den);
            return [w1, w1p, w2, w2p];
        };
        const rk4 = dt => {
            const k1 = deriv(s);
            const k2 = deriv(s.map((v, i) => v + k1[i] * dt / 2));
            const k3 = deriv(s.map((v, i) => v + k2[i] * dt / 2));
            const k4 = deriv(s.map((v, i) => v + k3[i] * dt));
            s = s.map((v, i) => v + (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) * dt / 6);
        };
        const sc = Math.min(w, h) * 0.22, ox = w / 2, oy = h * 0.38;
        const pos = () => {
            const x1 = ox + Math.sin(s[0]) * sc, y1 = oy + Math.cos(s[0]) * sc;
            return [x1, y1, x1 + Math.sin(s[2]) * sc, y1 + Math.cos(s[2]) * sc];
        };
        return {
            step(dt) {
                for (let i = 0; i < 4; i++) rk4(Math.min(dt, 1 / 30) / 4 * 1.6);
                const p = pos();
                trail.push([p[2], p[3]]);
                if (trail.length > 160) trail.shift();
            },
            draw() {
                clear(ctx, w, h);
                ctx.lineWidth = Math.max(1.5, w / 160);
                for (let i = 1; i < trail.length; i++) {
                    ctx.strokeStyle = heat(i / trail.length);
                    ctx.globalAlpha = i / trail.length;
                    ctx.beginPath();
                    ctx.moveTo(trail[i - 1][0], trail[i - 1][1]);
                    ctx.lineTo(trail[i][0], trail[i][1]);
                    ctx.stroke();
                }
                ctx.globalAlpha = 1;
                const [x1, y1, x2, y2] = pos();
                ctx.strokeStyle = C.ash;
                ctx.lineWidth = w / 110;
                ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
                ctx.fillStyle = C.steel; poly(ctx, x1, y1, w / 34, 6); ctx.fill();
                ctx.fillStyle = C.molten; poly(ctx, x2, y2, w / 28, 6, 0.3); ctx.fill();
                ctx.fillStyle = C.ash; poly(ctx, ox, oy, w / 70, 4); ctx.fill();
            }
        };
    };

    P.reactor = (ctx, w, h) => {
        const cols = 14, rows = 8, nuclei = [];
        for (let i = 0; i < cols; i++)
            for (let j = 0; j < rows; j++)
                nuclei.push({ x: (i + 0.8) * w / (cols + 0.6), y: (j + 0.8) * h / (rows + 0.6), live: 1, flash: 0 });
        let neutrons = [];
        const rodX = [w * 0.33, w * 0.66];
        const self = { power: 0 };
        const inject = () => neutrons.push({ x: rand(0, w), y: rand(0, h), vx: rand(-1, 1) * 120, vy: rand(-1, 1) * 120 });
        for (let i = 0; i < 4; i++) inject();
        self.step = dt => {
            dt = Math.min(dt, 1 / 30);
            const rodDepth = h * (0.35 + 0.3 * Math.sin(performance.now() / 2400));
            let fissions = 0;
            for (const n of nuclei) {
                n.flash = Math.max(0, n.flash - dt * 3);
                if (!n.live && Math.random() < dt * 0.25) n.live = 1;
            }
            const next = [];
            for (const n of neutrons) {
                n.x += n.vx * dt; n.y += n.vy * dt;
                if (n.x < 0 || n.x > w || n.y < 0 || n.y > h) continue;
                if (n.y < rodDepth && rodX.some(rx => Math.abs(n.x - rx) < w * 0.015)) continue;
                let hit = false;
                for (const k of nuclei) {
                    if (k.live && Math.abs(k.x - n.x) < 5 && Math.abs(k.y - n.y) < 5) {
                        k.live = 0; k.flash = 1; hit = true; fissions++;
                        const kids = Math.random() < 0.5 ? 2 : 3;
                        for (let c = 0; c < kids && neutrons.length + next.length < 220; c++) {
                            const a = rand(0, TAU);
                            next.push({ x: k.x, y: k.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130 });
                        }
                        break;
                    }
                }
                if (!hit) next.push(n);
            }
            neutrons = next;
            if (neutrons.length < 2) inject();
            self.power += (Math.min(1, fissions / 3 + neutrons.length / 220) - self.power) * Math.min(1, dt * 4);
            self.rodDepth = rodDepth;
        };
        self.draw = () => {
            clear(ctx, w, h);
            const r = Math.max(2, w / 110);
            for (const k of nuclei) {
                ctx.fillStyle = k.flash > 0 ? heat(0.6 + k.flash * 0.4) : k.live ? '#3d6fd6' : '#2a2a2e';
                poly(ctx, k.x, k.y, r * (1 + k.flash), 6);
                ctx.fill();
            }
            ctx.fillStyle = '#4a4f5c';
            for (const rx of rodX) ctx.fillRect(rx - w * 0.012, 0, w * 0.024, self.rodDepth || h * 0.4);
            ctx.fillStyle = C.white;
            for (const n of neutrons) ctx.fillRect(n.x - 1, n.y - 1, 2.2, 2.2);
        };
        return self;
    };

    const CLANS = ['rock', 'paper', 'scissors', 'lizard', 'spock'];
    const BEATS = { rock: ['scissors', 'lizard'], paper: ['rock', 'spock'], scissors: ['paper', 'lizard'], lizard: ['spock', 'paper'], spock: ['scissors', 'rock'] };
    const CLAN_COLOR = { rock: '#9aa0ad', paper: '#f2e6c9', scissors: '#ff6a2b', lizard: '#6fd08c', spock: '#7fb6ff' };
    const CLAN_SIDES = { rock: 6, paper: 4, scissors: 3, lizard: 5, spock: 8 };

    P.rps = (ctx, w, h) => {
        let units = [], winnerAt = 0;
        const self = { winner: null };
        const reset = () => {
            units = [];
            for (const c of CLANS) for (let i = 0; i < 9; i++) units.push({ c, x: rand(10, w - 10), y: rand(10, h - 10), vx: 0, vy: 0 });
            winnerAt = 0;
        };
        reset();
        const R = Math.max(4, w / 55);
        self.step = dt => {
            dt = Math.min(dt, 1 / 30);
            if (winnerAt) { if (performance.now() - winnerAt > 1500) reset(); return; }
            for (const u of units) {
                let ax = 0, ay = 0;
                for (const o of units) {
                    if (o === u || o.c === u.c) continue;
                    const dx = o.x - u.x, dy = o.y - u.y, d2 = dx * dx + dy * dy + 1;
                    if (d2 > (w * 0.4) ** 2) continue;
                    const sgn = BEATS[u.c].includes(o.c) ? 1 : -0.8;
                    ax += sgn * dx / d2; ay += sgn * dy / d2;
                }
                const m = Math.hypot(ax, ay) || 1;
                u.vx += (ax / m) * 140 * dt + rand(-20, 20) * dt;
                u.vy += (ay / m) * 140 * dt + rand(-20, 20) * dt;
                const sp = Math.hypot(u.vx, u.vy), max = w * 0.18;
                if (sp > max) { u.vx *= max / sp; u.vy *= max / sp; }
                u.x += u.vx * dt; u.y += u.vy * dt;
                if (u.x < R || u.x > w - R) { u.vx *= -1; u.x = Math.max(R, Math.min(w - R, u.x)); }
                if (u.y < R || u.y > h - R) { u.vy *= -1; u.y = Math.max(R, Math.min(h - R, u.y)); }
            }
            for (const a of units) for (const b of units) {
                if (a.c === b.c || !BEATS[a.c].includes(b.c)) continue;
                if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < (R * 1.6) ** 2) b.c = a.c;
            }
            const alive = new Set(units.map(u => u.c));
            if (alive.size === 1) {
                self.winner = units[0].c;
                winnerAt = performance.now();
                if (self.onWinner) self.onWinner(self.winner);
            }
        };
        self.draw = () => {
            clear(ctx, w, h);
            for (const u of units) {
                ctx.fillStyle = CLAN_COLOR[u.c];
                poly(ctx, u.x, u.y, R, CLAN_SIDES[u.c], Math.atan2(u.vy, u.vx));
                ctx.fill();
            }
            if (winnerAt) {
                ctx.fillStyle = 'rgba(12,10,10,0.6)';
                ctx.fillRect(0, h * 0.4, w, h * 0.2);
                ctx.fillStyle = CLAN_COLOR[self.winner];
                ctx.font = `600 ${Math.round(h * 0.09)}px Rajdhani, sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(self.winner.toUpperCase() + ' WINS', w / 2, h * 0.53);
            }
        };
        return self;
    };

    P.collision = (ctx, w, h) => {
        const cx = w / 2, cy = h * 0.05, R = Math.min(w, h) * 0.85; // crucible = lower arc of a big circle
        const balls = [];
        const add = () => balls.push({ x: cx + rand(-w * 0.2, w * 0.2), y: -10, vx: rand(-40, 40), vy: 0, r: rand(w / 40, w / 22), t: 1 });
        for (let i = 0; i < 14; i++) { add(); balls[i].y = rand(h * 0.3, h * 0.8); }
        return {
            step(dt) {
                dt = Math.min(dt, 1 / 30);
                if (Math.random() < dt * 0.8 && balls.length < 22) add();
                for (const b of balls) {
                    b.vy += 400 * dt; b.x += b.vx * dt; b.y += b.vy * dt;
                    b.t = Math.max(0, b.t - dt * 0.06);
                    const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
                    if (d + b.r > R && dy > 0) {
                        const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
                        b.x = cx + nx * (R - b.r); b.y = cy + ny * (R - b.r);
                        if (vn > 0) { b.vx -= 1.6 * vn * nx; b.vy -= 1.6 * vn * ny; }
                    }
                }
                for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
                    const a = balls[i], b = balls[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, o = a.r + b.r - d;
                    if (o <= 0) continue;
                    const nx = dx / d, ny = dy / d, ma = a.r * a.r, mb = b.r * b.r;
                    const vr = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                    if (vr < 0) {
                        const jimp = -(1 + 0.5) * vr / (1 / ma + 1 / mb);
                        a.vx -= jimp * nx / ma; a.vy -= jimp * ny / ma;
                        b.vx += jimp * nx / mb; b.vy += jimp * ny / mb;
                        const k = Math.min(1, Math.abs(vr) / 600); a.t = Math.min(1, a.t + k); b.t = Math.min(1, b.t + k);
                    }
                    const sa = mb / (ma + mb), sb = ma / (ma + mb);
                    a.x -= nx * o * sa; a.y -= ny * o * sa; b.x += nx * o * sb; b.y += ny * o * sb;
                }
                for (let i = balls.length - 1; i >= 0; i--) if (balls[i].y > h + 40 || balls[i].x < -40 || balls[i].x > w + 40) balls.splice(i, 1);
                while (balls.length > 22) balls.shift();
            },
            draw() {
                clear(ctx, w, h);
                ctx.strokeStyle = C.ash;
                ctx.lineWidth = w / 80;
                ctx.beginPath();
                ctx.arc(cx, cy, R + ctx.lineWidth / 2, Math.PI * 0.12, Math.PI * 0.88);
                ctx.stroke();
                for (const b of balls) {
                    ctx.fillStyle = heat(0.35 + b.t * 0.65);
                    poly(ctx, b.x, b.y, b.r, 6, b.x * 0.05);
                    ctx.fill();
                }
            }
        };
    };

    P.json = (ctx, w, h) => {
        const lines = [
            [['{', C.ash]],
            [['  "forge"', C.molten], [': ', C.ash], ['"Tenebris Drakonos"', C.white], [',', C.ash]],
            [['  "dragon"', C.molten], [': ', C.ash], ['"Nightfury"', C.white], [',', C.ash]],
            [['  "fire"', C.molten], [': ', C.ash], ['true', C.ember], [',', C.ash]],
            [['  "experiments"', C.molten], [': ', C.ash], ['[', C.ash]],
            [['    "reactor"', C.white], [', ', C.ash], ['"pendulum"', C.white], [',', C.ash]],
            [['    "wind tunnel"', C.white], [', ', C.ash], ['"crucible"', C.white]],
            [['  ]', C.ash], [',', C.ash]],
            [['  "temperature"', C.molten], [': ', C.ash], ['1538', C.cool], [',', C.ash]],
            [['  "sleeping"', C.molten], [': ', C.ash], ['false', C.ember]],
            [['}', C.ash]]
        ];
        const total = lines.reduce((n, l) => n + l.reduce((m, [t]) => m + t.length, 0), 0);
        let typed = 0, hold = 0;
        return {
            step(dt) {
                if (typed >= total) { hold += dt; if (hold > 1.6) { typed = 0; hold = 0; } return; }
                typed += dt * 38;
            },
            draw() {
                clear(ctx, w, h);
                const fs = Math.round(h / 14);
                ctx.font = `${fs}px "JetBrains Mono", Consolas, monospace`;
                ctx.textBaseline = 'top';
                let left = Math.floor(typed), y = fs * 0.6;
                for (const line of lines) {
                    let x = fs * 0.8;
                    for (const [t, col] of line) {
                        if (left <= 0) break;
                        const part = t.slice(0, left);
                        left -= part.length;
                        ctx.fillStyle = col;
                        ctx.fillText(part, x, y);
                        x += ctx.measureText(part).width;
                    }
                    y += fs * 1.2;
                    if (left <= 0) {
                        if (Math.floor(performance.now() / 400) % 2) { ctx.fillStyle = C.molten; ctx.fillRect(x + 2, y - fs * 1.2, fs * 0.5, fs); }
                        break;
                    }
                }
            }
        };
    };

    P.queens = (ctx, w, h) => {
        const N = 8, cols = [];
        let row = 0, col = 0, timer = 0, done = 0;
        const ok = (r, c) => cols.every((cc, rr) => cc !== c && Math.abs(cc - c) !== Math.abs(rr - r));
        return {
            step(dt) {
                timer += dt;
                if (done) { if ((done += dt) > 2.2) { cols.length = 0; row = 0; col = 0; done = 0; } return; }
                while (timer > 0.06) {
                    timer -= 0.06;
                    if (row === N) { done = 0.001; return; }
                    if (col >= N) { col = cols.pop() + 1; row--; continue; }
                    if (ok(row, col)) { cols.push(col); row++; col = 0; } else col++;
                }
            },
            draw() {
                clear(ctx, w, h);
                const s = Math.min(w, h) * 0.9 / N, ox = (w - s * N) / 2, oy = (h - s * N) / 2;
                for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
                    ctx.fillStyle = (r + c) % 2 ? '#1d1a1a' : '#2a2525';
                    ctx.fillRect(ox + c * s, oy + r * s, s, s);
                }
                if (row < N && col < N && !done) { ctx.fillStyle = 'rgba(255,106,43,0.25)'; ctx.fillRect(ox + col * s, oy + row * s, s, s); }
                cols.forEach((c, r) => {
                    const x = ox + c * s + s / 2, y = oy + r * s + s / 2;
                    ctx.fillStyle = done ? C.white : C.molten;
                    ctx.beginPath();
                    ctx.moveTo(x - s * 0.3, y + s * 0.25);
                    ctx.lineTo(x - s * 0.32, y - s * 0.2); ctx.lineTo(x - s * 0.12, y);
                    ctx.lineTo(x, y - s * 0.3); ctx.lineTo(x + s * 0.12, y);
                    ctx.lineTo(x + s * 0.32, y - s * 0.2); ctx.lineTo(x + s * 0.3, y + s * 0.25);
                    ctx.closePath(); ctx.fill();
                });
            }
        };
    };

    P.breathing = (ctx, w, h) => {
        let t = 0;
        const { inhale, exhale } = window.FORGE.breath;
        return {
            step(dt) { t += dt; },
            draw() {
                clear(ctx, w, h);
                const cyc = (t % (inhale + exhale));
                const k = cyc < inhale ? cyc / inhale : 1 - (cyc - inhale) / exhale;
                const e = 0.5 - 0.5 * Math.cos(k * Math.PI);
                for (let i = 3; i >= 0; i--) {
                    ctx.fillStyle = heat(0.3 + e * 0.5 + i * 0.05);
                    ctx.globalAlpha = 0.25 + (3 - i) * 0.2;
                    poly(ctx, w / 2, h / 2, (h * 0.12 + e * h * 0.22) * (1 + i * 0.18), 6, t * 0.1 + i * 0.2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                ctx.fillStyle = C.bg;
                ctx.font = `600 ${Math.round(h / 11)}px Rajdhani, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(cyc < inhale ? 'IN' : 'OUT', w / 2, h / 2);
            }
        };
    };

    P.dictionary = (ctx, w, h) => {
        const words = ['FORGE', 'EMBER', 'DRAKE', 'ANVIL', 'SMITH', 'FLAME'];
        const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#%&*';
        let wi = 0, t = 0;
        return {
            step(dt) { t += dt; if (t > 2.4) { t = 0; wi = (wi + 1) % words.length; } },
            draw() {
                clear(ctx, w, h);
                const word = words[wi];
                ctx.font = `700 ${Math.round(h / 4.5)}px Rajdhani, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const step = w / (word.length + 1);
                for (let i = 0; i < word.length; i++) {
                    const settled = t > 0.25 + i * 0.15;
                    ctx.fillStyle = settled ? C.molten : C.ash;
                    ctx.fillText(settled ? word[i] : glyphs[Math.floor(Math.random() * glyphs.length)], step * (i + 1), h / 2);
                }
            }
        };
    };

    P.bookmarks = (ctx, w, h) => {
        let t = 0;
        const cols = [C.ember, C.molten, C.ash, C.cool, C.white];
        return {
            step(dt) { t += dt; },
            draw() {
                clear(ctx, w, h);
                for (let i = 0; i < 5; i++) {
                    const x = w * (0.2 + i * 0.15), len = h * (0.45 + 0.2 * Math.sin(t * 1.4 + i));
                    const sway = Math.sin(t * 2 + i * 1.3) * w * 0.01;
                    ctx.fillStyle = cols[i];
                    ctx.beginPath();
                    ctx.moveTo(x - w * 0.045, 0); ctx.lineTo(x + w * 0.045, 0);
                    ctx.lineTo(x + w * 0.045 + sway, len); ctx.lineTo(x + sway, len - h * 0.08);
                    ctx.lineTo(x - w * 0.045 + sway, len);
                    ctx.closePath(); ctx.fill();
                }
            }
        };
    };

    P.sticky = (ctx, w, h) => {
        const notes = [];
        let t = 0;
        const cols = ['#ffd166', '#ff9f6b', '#f2e6c9', '#ffb347'];
        return {
            step(dt) {
                t += dt;
                if (t > 0.5) { t = 0; notes.push({ x: rand(w * 0.15, w * 0.85), y: -h * 0.2, ty: rand(h * 0.3, h * 0.75), a: rand(-0.3, 0.3), c: cols[notes.length % 4] }); }
                for (const n of notes) n.y += (n.ty - n.y) * Math.min(1, dt * 6);
                if (notes.length > 9) notes.shift();
            },
            draw() {
                clear(ctx, w, h);
                const s = h * 0.28;
                for (const n of notes) {
                    ctx.save();
                    ctx.translate(n.x, n.y); ctx.rotate(n.a);
                    ctx.fillStyle = n.c; ctx.fillRect(-s / 2, -s / 2, s, s);
                    ctx.fillStyle = 'rgba(0,0,0,0.25)';
                    for (let l = 0; l < 3; l++) ctx.fillRect(-s * 0.35, -s * 0.2 + l * s * 0.18, s * (0.7 - l * 0.15), s * 0.05);
                    ctx.restore();
                }
            }
        };
    };

    P.cloc = (ctx, w, h) => {
        let t = 0;
        const langs = [['JS', 0.9, C.molten], ['HTML', 0.6, C.ember], ['CSS', 0.45, C.cool], ['MD', 0.15, C.ash]];
        return {
            step(dt) { t = (t + dt) % 4; },
            draw() {
                clear(ctx, w, h);
                const k = Math.min(1, t / 1.6);
                const e = 1 - (1 - k) ** 3;
                const bh = h * 0.14;
                ctx.font = `600 ${Math.round(bh * 0.7)}px Rajdhani, sans-serif`;
                ctx.textBaseline = 'middle';
                langs.forEach(([name, v, col], i) => {
                    const y = h * 0.18 + i * bh * 1.5;
                    ctx.fillStyle = C.ash; ctx.textAlign = 'right'; ctx.fillText(name, w * 0.2, y + bh / 2);
                    ctx.fillStyle = col; ctx.fillRect(w * 0.24, y, w * 0.6 * v * e, bh);
                    ctx.fillStyle = C.white; ctx.textAlign = 'left';
                    ctx.fillText(Math.round(v * e * 4800), w * 0.26 + w * 0.6 * v * e, y + bh / 2);
                });
            }
        };
    };

    window.ForgePreviews = P;
    window.ForgeHeat = heat;
    window.ForgePoly = poly;
})();
