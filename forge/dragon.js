// Nightfury — a procedural dragon. The spine is a follow-the-leader chain with bend limits,
// legs are two-bone IK with foot planting, and everything is drawn as flat low-poly facets
// shaded by the direction of the forge light. The behaviour ("brain") lives in main.js.
(function () {
    const TAU = Math.PI * 2;
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const angDiff = (a, b) => {
        let d = (b - a) % TAU;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        return d;
    };

    class Dragon {
        constructor({ x, y, segments = 32, spacing = 9, width = 11 }) {
            this.n = segments;
            this.sp = spacing;
            this.w = width;
            this.pts = Array.from({ length: segments }, (_, i) => ({ x: x - i * spacing, y }));
            this.heading = 0;
            this.speed = 0;
            this.goal = { x, y, speed: 30 };
            this.look = { x: x + 100, y };
            this.eye = 0;          // 0 closed … 1 wide open
            this.eyeGoal = 0;
            this.wing = 0.1;       // 0 folded … 1 spread
            this.wingGoal = 0.1;
            this.flapping = false;
            this.flapT = 0;
            this.breath = 0;
            this.turnRate = 3;
            this.maxBend = 0.42;
            this.jitter = Array.from({ length: segments }, () => Math.random() * 0.12 - 0.06);
            const legAt = [Math.round(segments * 0.13), Math.round(segments * 0.42)];
            this.legs = [];
            for (const seg of legAt) for (const side of [1, -1]) {
                const p = this.pts[seg];
                this.legs.push({ seg, side, front: seg === legAt[0], foot: { x: p.x, y: p.y + side * width * 2 }, from: null, to: null, t: 1 });
            }
        }

        get head() { return this.pts[0]; }
        get size() { return this.w * 1.05; }

        mouth() {
            const S = this.size, h = this.heading;
            return { x: this.head.x + Math.cos(h) * S * 2.1, y: this.head.y + Math.sin(h) * S * 2.1, angle: h };
        }

        hits(x, y) {
            return Math.hypot(x - this.head.x, y - this.head.y) < this.size * 2.2;
        }

        profile(t) {
            if (t < 0.08) return 0.6;
            if (t < 0.22) return lerp(0.6, 1, (t - 0.08) / 0.14);
            if (t < 0.4) return 1;
            return 0.06 + 0.94 * Math.pow(1 - (t - 0.4) / 0.6, 1.25);
        }

        update(dt) {
            const h = this.head, g = this.goal;
            const dx = g.x - h.x, dy = g.y - h.y, dist = Math.hypot(dx, dy);
            const want = Math.min(g.speed, dist * 2.2);
            if (dist > 2) {
                const turn = this.turnRate * (this.flapping ? 1.8 : 1);
                this.heading += clamp(angDiff(this.heading, Math.atan2(dy, dx)), -turn * dt, turn * dt);
            }
            this.speed = lerp(this.speed, want, Math.min(1, dt * 3));
            h.x += Math.cos(this.heading) * this.speed * dt;
            h.y += Math.sin(this.heading) * this.speed * dt;

            // Follow-the-leader spine with a bend limit so the body coils instead of folding.
            for (let i = 1; i < this.n; i++) {
                const prev = this.pts[i - 1], p = this.pts[i];
                let a = Math.atan2(p.y - prev.y, p.x - prev.x);
                const back = i === 1 ? this.heading + Math.PI : Math.atan2(prev.y - this.pts[i - 2].y, prev.x - this.pts[i - 2].x);
                a = back + clamp(angDiff(back, a), -this.maxBend, this.maxBend);
                p.x = prev.x + Math.cos(a) * this.sp;
                p.y = prev.y + Math.sin(a) * this.sp;
            }

            this.eye = lerp(this.eye, this.eyeGoal, Math.min(1, dt * 6));
            this.wing = lerp(this.wing, this.wingGoal, Math.min(1, dt * 4));
            if (this.flapping) this.flapT += dt * 9;

            this.updateLegs(dt);
        }

        frame(i) {
            const p = this.pts[i];
            const q = this.pts[Math.max(0, i - 1)], r = this.pts[Math.min(this.n - 1, i + 1)];
            const a = i === 0 ? this.heading : Math.atan2(q.y - r.y, q.x - r.x);
            return { p, a, nx: -Math.sin(a), ny: Math.cos(a) };
        }

        updateLegs(dt) {
            const L = this.w * 2.4;
            for (const leg of this.legs) {
                const { p, a, nx, ny } = this.frame(leg.seg);
                const ax = p.x + nx * leg.side * this.w * 0.7, ay = p.y + ny * leg.side * this.w * 0.7;
                leg.anchor = { x: ax, y: ay };
                const fwd = leg.front ? 0.45 : 0.1;
                if (this.flapping || this.wing > 0.6) {
                    // Tucked while flying.
                    const tx = ax - Math.cos(a) * L * 0.6 + nx * leg.side * L * 0.2;
                    const ty = ay - Math.sin(a) * L * 0.6 + ny * leg.side * L * 0.2;
                    leg.foot.x = lerp(leg.foot.x, tx, Math.min(1, dt * 10));
                    leg.foot.y = lerp(leg.foot.y, ty, Math.min(1, dt * 10));
                    leg.t = 1;
                    continue;
                }
                const rx = ax + nx * leg.side * L * 0.75 + Math.cos(a) * L * fwd;
                const ry = ay + ny * leg.side * L * 0.75 + Math.sin(a) * L * fwd;
                if (leg.t < 1) {
                    leg.t = Math.min(1, leg.t + dt / 0.14);
                    const e = leg.t * leg.t * (3 - 2 * leg.t);
                    leg.foot.x = lerp(leg.from.x, leg.to.x, e);
                    leg.foot.y = lerp(leg.from.y, leg.to.y, e);
                } else if (Math.hypot(leg.foot.x - rx, leg.foot.y - ry) > L * 0.8) {
                    // Don't lift a foot while its diagonal partner is in the air.
                    const partner = this.legs.find(o => o !== leg && o.side !== leg.side && o.front !== leg.front);
                    if (!partner || partner.t >= 1) {
                        leg.from = { ...leg.foot };
                        leg.to = { x: rx + Math.cos(a) * L * 0.35, y: ry + Math.sin(a) * L * 0.35 };
                        leg.t = 0;
                    }
                }
            }
        }

        shade(nx, ny, px, py, light, extra = 0) {
            const lx = light.x - px, ly = light.y - py, ld = Math.hypot(lx, ly) || 1;
            const fall = clamp(1 - ld / (light.reach || 900), 0, 1);
            const lam = Math.max(0, (nx * lx + ny * ly) / ld);
            const b = clamp(0.12 + lam * fall * 0.9 * light.power + extra, 0, 1);
            return `rgb(${Math.round(lerp(20, 190, b))},${Math.round(lerp(24, 82, b))},${Math.round(lerp(34, 48, b))})`;
        }

        draw(ctx, light) {
            const F = [];
            for (let i = 0; i < this.n; i++) {
                const f = this.frame(i);
                f.hw = this.w * this.profile(i / (this.n - 1)) * (1 + this.breath * 0.07);
                f.l = { x: f.p.x + f.nx * f.hw, y: f.p.y + f.ny * f.hw };
                f.r = { x: f.p.x - f.nx * f.hw, y: f.p.y - f.ny * f.hw };
                F.push(f);
            }

            ctx.lineJoin = 'round';
            this.drawLegs(ctx, light);
            if (this.wing < 0.35) this.drawWings(ctx, F, light);

            // Body: two facets per segment, each shaded by its own outward normal.
            for (let i = 0; i < this.n - 1; i++) {
                const a = F[i], b = F[i + 1], j = this.jitter[i];
                ctx.fillStyle = this.shade(a.nx, a.ny, a.p.x, a.p.y, light, j);
                ctx.beginPath();
                ctx.moveTo(a.p.x, a.p.y); ctx.lineTo(a.l.x, a.l.y); ctx.lineTo(b.l.x, b.l.y); ctx.lineTo(b.p.x, b.p.y);
                ctx.fill();
                ctx.fillStyle = this.shade(-a.nx, -a.ny, a.p.x, a.p.y, light, -j);
                ctx.beginPath();
                ctx.moveTo(a.p.x, a.p.y); ctx.lineTo(a.r.x, a.r.y); ctx.lineTo(b.r.x, b.r.y); ctx.lineTo(b.p.x, b.p.y);
                ctx.fill();
            }

            // Dorsal ridge.
            ctx.fillStyle = '#0b0c12';
            for (let i = 4; i < this.n * 0.8; i += 2) {
                const f = F[i], s = f.hw * 0.55, c = Math.cos(f.a), sn = Math.sin(f.a);
                ctx.beginPath();
                ctx.moveTo(f.p.x + c * s * 1.3, f.p.y + sn * s * 1.3);
                ctx.lineTo(f.p.x + f.nx * s * 0.45, f.p.y + f.ny * s * 0.45);
                ctx.lineTo(f.p.x - c * s * 0.9, f.p.y - sn * s * 0.9);
                ctx.lineTo(f.p.x - f.nx * s * 0.45, f.p.y - f.ny * s * 0.45);
                ctx.fill();
            }

            // Tail fins.
            const t = F[this.n - 1], t2 = F[this.n - 3], ta = t.a + Math.PI;
            for (const side of [1, -1]) {
                ctx.fillStyle = this.shade(t.nx * side, t.ny * side, t.p.x, t.p.y, light, 0.05);
                ctx.beginPath();
                ctx.moveTo(t2.p.x, t2.p.y);
                ctx.lineTo(t.p.x + Math.cos(ta + side * 0.9) * this.w * 1.6, t.p.y + Math.sin(ta + side * 0.9) * this.w * 1.6);
                ctx.lineTo(t.p.x + Math.cos(ta) * this.w * 0.8, t.p.y + Math.sin(ta) * this.w * 0.8);
                ctx.fill();
            }

            if (this.wing >= 0.35) this.drawWings(ctx, F, light);
            this.drawHead(ctx, light);
        }

        drawLegs(ctx, light) {
            const L = this.w * 2.4, l1 = L * 0.62, l2 = L * 0.62;
            for (const leg of this.legs) {
                const A = leg.anchor;
                if (!A) continue;
                const fx = leg.foot.x, fy = leg.foot.y;
                let D = Math.hypot(fx - A.x, fy - A.y);
                const base = Math.atan2(fy - A.y, fx - A.x);
                D = clamp(D, 1, l1 + l2 - 0.5);
                const alpha = Math.acos(clamp((l1 * l1 + D * D - l2 * l2) / (2 * l1 * D), -1, 1));
                const bend = leg.front ? -leg.side : leg.side;
                const kx = A.x + Math.cos(base + bend * alpha) * l1, ky = A.y + Math.sin(base + bend * alpha) * l1;
                const ex = A.x + Math.cos(base) * D, ey = A.y + Math.sin(base) * D;
                const thick = this.w * 0.42;
                const limb = (x1, y1, x2, y2, w1, w2, ex2 = 0) => {
                    const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a), ny = Math.cos(a);
                    ctx.fillStyle = this.shade(nx, ny, x1, y1, light, ex2);
                    ctx.beginPath();
                    ctx.moveTo(x1 + nx * w1, y1 + ny * w1); ctx.lineTo(x2 + nx * w2, y2 + ny * w2);
                    ctx.lineTo(x2 - nx * w2, y2 - ny * w2); ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
                    ctx.fill();
                };
                limb(A.x, A.y, kx, ky, thick, thick * 0.7, 0.04);
                limb(kx, ky, ex, ey, thick * 0.7, thick * 0.45, -0.02);
                ctx.fillStyle = '#0b0c12';
                for (const s of [-0.5, 0, 0.5]) {
                    const a = base + s;
                    ctx.beginPath();
                    ctx.moveTo(ex - Math.sin(a) * thick * 0.4, ey + Math.cos(a) * thick * 0.4);
                    ctx.lineTo(ex + Math.cos(a) * thick * 1.4, ey + Math.sin(a) * thick * 1.4);
                    ctx.lineTo(ex + Math.sin(a) * thick * 0.4, ey - Math.cos(a) * thick * 0.4);
                    ctx.fill();
                }
            }
        }

        drawWings(ctx, F, light) {
            const ws = Math.round(this.n * 0.16), we = Math.min(this.n - 1, ws + Math.round(this.n * 0.18));
            const sh = F[ws], tail = F[we];
            const flap = this.flapping ? Math.sin(this.flapT) : 0;
            const spread = clamp(this.wing + flap * 0.35 * this.wing, 0.05, 1.1);
            const L = this.w * (2.4 + 5.2 * spread);
            for (const side of [1, -1]) {
                const sx = sh.p.x + sh.nx * side * sh.hw * 0.6, sy = sh.p.y + sh.ny * side * sh.hw * 0.6;
                const back = sh.a + Math.PI;
                const main = back + side * lerp(0.3, 1.45, Math.min(1, spread));
                const fan = lerp(0.12, 0.42, Math.min(1, spread));
                const tips = [-1, 0, 1].map((k, idx) => {
                    const ang = main - side * k * fan;
                    const len = L * [1, 0.86, 0.68][idx];
                    return { x: sx + Math.cos(ang) * len, y: sy + Math.sin(ang) * len };
                });
                const att = { x: tail.p.x + tail.nx * side * tail.hw * 0.5, y: tail.p.y + tail.ny * side * tail.hw * 0.5 };
                const tris = [[{ x: sx, y: sy }, tips[0], tips[1]], [{ x: sx, y: sy }, tips[1], tips[2]], [{ x: sx, y: sy }, tips[2], att]];
                tris.forEach((tri, k) => {
                    const cx = (tri[0].x + tri[1].x + tri[2].x) / 3, cy = (tri[0].y + tri[1].y + tri[2].y) / 3;
                    const nx = cx - sx, ny = cy - sy, nl = Math.hypot(nx, ny) || 1;
                    ctx.globalAlpha = 0.92;
                    ctx.fillStyle = this.shade(nx / nl, ny / nl, cx, cy, light, (k % 2 ? 0.05 : -0.03));
                    ctx.beginPath();
                    ctx.moveTo(tri[0].x, tri[0].y); ctx.lineTo(tri[1].x, tri[1].y); ctx.lineTo(tri[2].x, tri[2].y);
                    ctx.fill();
                });
                ctx.globalAlpha = 1;
                ctx.strokeStyle = '#0b0c12';
                ctx.lineWidth = Math.max(1, this.w * 0.14);
                ctx.beginPath();
                for (const tip of tips) { ctx.moveTo(sx, sy); ctx.lineTo(tip.x, tip.y); }
                ctx.stroke();
            }
        }

        drawHead(ctx, light) {
            const S = this.size, h = this.head, a = this.heading;
            const c = Math.cos(a), s = Math.sin(a);
            const P = (fx, fy) => ({ x: h.x + c * fx * S - s * fy * S, y: h.y + s * fx * S + c * fy * S });

            // Horns, swept back.
            for (const side of [1, -1]) {
                const p1 = P(-0.1, side * 0.55), p2 = P(-1.5, side * 1.05), p3 = P(-0.55, side * 0.25);
                ctx.fillStyle = this.shade(-c, -s, p1.x, p1.y, light, 0.08);
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.fill();
            }

            const ring = [P(2.2, 0), P(1.25, 0.5), P(0.3, 0.78), P(-0.45, 0.5), P(-0.45, -0.5), P(0.3, -0.78), P(1.25, -0.5)];
            const ctr = P(0.45, 0);
            for (let i = 0; i < ring.length; i++) {
                const p = ring[i], q = ring[(i + 1) % ring.length];
                const mx = (p.x + q.x) / 2 - ctr.x, my = (p.y + q.y) / 2 - ctr.y, ml = Math.hypot(mx, my) || 1;
                ctx.fillStyle = this.shade(mx / ml, my / ml, ctr.x, ctr.y, light, i % 2 ? 0.06 : 0);
                ctx.beginPath(); ctx.moveTo(ctr.x, ctr.y); ctx.lineTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.fill();
            }

            // Eyes: ember amber, open by mood, slit pupil turned toward what it's looking at.
            const lookA = Math.atan2(this.look.y - h.y, this.look.x - h.x);
            for (const side of [1, -1]) {
                const e = P(0.6, side * 0.42), open = Math.max(0.06, this.eye);
                const l = 0.26 * S, w = 0.16 * S * open;
                ctx.fillStyle = this.eye > 0.15 ? '#ffb347' : '#5a2a14';
                ctx.beginPath();
                ctx.moveTo(e.x + c * l, e.y + s * l);
                ctx.lineTo(e.x - s * w, e.y + c * w);
                ctx.lineTo(e.x - c * l, e.y - s * l);
                ctx.lineTo(e.x + s * w, e.y - c * w);
                ctx.fill();
                if (this.eye > 0.3) {
                    const off = 0.08 * S;
                    ctx.strokeStyle = '#140805';
                    ctx.lineWidth = Math.max(1, S * 0.06);
                    ctx.beginPath();
                    const px = e.x + Math.cos(lookA) * off, py = e.y + Math.sin(lookA) * off;
                    ctx.moveTo(px - s * w * 0.8, py + c * w * 0.8);
                    ctx.lineTo(px + s * w * 0.8, py - c * w * 0.8);
                    ctx.stroke();
                }
            }
        }
    }

    window.ForgeDragon = Dragon;
})();
