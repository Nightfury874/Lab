// Crucible — rigid circles under gravity with impulse-based collision response.
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
    const eInput = document.getElementById('restitution');
    const gInput = document.getElementById('gravity');
    const eVal = document.getElementById('eVal');

    let W, H, dpr, bowl;
    const balls = [];
    const MAX = 160;

    function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = W * dpr; canvas.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // The crucible is the lower arc of a circle.
        const R = Math.min(W * 0.42, H * 0.62);
        bowl = { x: W / 2, y: H - R - 30, r: R };
    }

    function heat(t) {
        t = Math.max(0, Math.min(1, t));
        const stops = [[0, [70, 72, 80]], [0.35, [190, 40, 20]], [0.6, [255, 106, 43]], [0.8, [255, 179, 71]], [1, [255, 244, 214]]];
        for (let i = 1; i < stops.length; i++) {
            if (t <= stops[i][0]) {
                const [t0, a] = stops[i - 1], [t1, b] = stops[i], k = (t - t0) / (t1 - t0);
                return `rgb(${a.map((v, n) => Math.round(v + (b[n] - v) * k)).join(',')})`;
            }
        }
        return 'rgb(255,244,214)';
    }

    function drop(x, y) {
        if (balls.length >= MAX) balls.shift();
        const r = 10 + Math.random() * 16;
        balls.push({ x, y, vx: (Math.random() - 0.5) * 80, vy: 0, r, m: r * r, t: 1, rot: Math.random() * 6 });
    }

    function step(dt) {
        const e = parseFloat(eInput.value), g = parseFloat(gInput.value);
        for (const b of balls) {
            b.vy += g * dt;
            b.x += b.vx * dt; b.y += b.vy * dt;
            b.rot += b.vx * dt * 0.02;
            b.t = Math.max(0, b.t - dt * 0.12);

            // Crucible wall: push back inside the arc and reflect the normal velocity.
            const dx = b.x - bowl.x, dy = b.y - bowl.y, d = Math.hypot(dx, dy);
            if (dy > -bowl.r * 0.2 && d + b.r > bowl.r) {
                const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
                b.x = bowl.x + nx * (bowl.r - b.r);
                b.y = bowl.y + ny * (bowl.r - b.r);
                if (vn > 0) {
                    b.vx -= (1 + e) * vn * nx;
                    b.vy -= (1 + e) * vn * ny;
                    b.vx *= 0.995; // a little friction against the wall
                }
            }
        }

        // Pairwise collisions: impulse along the contact normal, then positional correction.
        for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
                const a = balls[i], b = balls[j];
                const dx = b.x - a.x, dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                const overlap = a.r + b.r - dist;
                if (overlap <= 0 || dist === 0) continue;
                const nx = dx / dist, ny = dy / dist;
                const vRel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
                if (vRel < 0) {
                    const jImp = -(1 + e) * vRel / (1 / a.m + 1 / b.m);
                    a.vx -= jImp * nx / a.m; a.vy -= jImp * ny / a.m;
                    b.vx += jImp * nx / b.m; b.vy += jImp * ny / b.m;
                    // Hard hits heat the metal back up; resting contact doesn't.
                    if (-vRel > 150) {
                        const k = Math.min(0.6, -vRel / 900);
                        a.t = Math.min(1, a.t + k); b.t = Math.min(1, b.t + k);
                    }
                }
                const total = 1 / a.m + 1 / b.m;
                a.x -= nx * overlap * (1 / a.m) / total; a.y -= ny * overlap * (1 / a.m) / total;
                b.x += nx * overlap * (1 / b.m) / total; b.y += ny * overlap * (1 / b.m) / total;
            }
        }

        for (let i = balls.length - 1; i >= 0; i--) {
            if (balls[i].y > H + 100 || balls[i].x < -100 || balls[i].x > W + 100) balls.splice(i, 1);
        }
    }

    function draw() {
        ctx.fillStyle = '#0a0808';
        ctx.fillRect(0, 0, W, H);

        const glow = ctx.createRadialGradient(bowl.x, bowl.y + bowl.r * 0.6, 0, bowl.x, bowl.y + bowl.r * 0.6, bowl.r * 1.2);
        glow.addColorStop(0, 'rgba(255,106,43,0.12)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        // Faceted crucible wall.
        const a0 = Math.asin(-0.2), a1 = Math.PI - a0, segs = 14;
        for (let i = 0; i < segs; i++) {
            const t0 = a0 + (a1 - a0) * i / segs, t1 = a0 + (a1 - a0) * (i + 1) / segs;
            const r1 = bowl.r, r2 = bowl.r + 22;
            ctx.fillStyle = i % 2 ? '#2a2524' : '#322c2b';
            ctx.beginPath();
            ctx.moveTo(bowl.x + Math.cos(t0) * r1, bowl.y + Math.sin(t0) * r1);
            ctx.lineTo(bowl.x + Math.cos(t1) * r1, bowl.y + Math.sin(t1) * r1);
            ctx.lineTo(bowl.x + Math.cos(t1) * r2, bowl.y + Math.sin(t1) * r2);
            ctx.lineTo(bowl.x + Math.cos(t0) * r2, bowl.y + Math.sin(t0) * r2);
            ctx.fill();
        }

        for (const b of balls) {
            ctx.fillStyle = heat(0.3 + b.t * 0.7);
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
                const a = b.rot + k / 6 * Math.PI * 2;
                ctx[k ? 'lineTo' : 'moveTo'](b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            for (let k = 0; k < 3; k++) {
                const a = b.rot + k / 6 * Math.PI * 2;
                ctx.lineTo(b.x + Math.cos(a) * b.r, b.y + Math.sin(a) * b.r);
            }
            ctx.fill();
        }
    }

    let last = performance.now();
    function loop(now) {
        const dt = Math.min(1 / 30, (now - last) / 1000);
        last = now;
        for (let s = 0; s < 4; s++) step(dt / 4);
        draw();
        requestAnimationFrame(loop);
    }

    let pouring = false;
    canvas.addEventListener('pointerdown', e => { pouring = true; drop(e.clientX, e.clientY); });
    canvas.addEventListener('pointermove', e => { if (pouring && Math.random() < 0.35) drop(e.clientX, e.clientY); });
    window.addEventListener('pointerup', () => { pouring = false; });
    eInput.addEventListener('input', () => { eVal.textContent = parseFloat(eInput.value).toFixed(2); });
    document.getElementById('pour').addEventListener('click', () => {
        for (let i = 0; i < 24; i++) setTimeout(() => drop(bowl.x + (Math.random() - 0.5) * bowl.r, 40), i * 60);
    });
    document.getElementById('reset').addEventListener('click', () => { balls.length = 0; });
    window.addEventListener('resize', resize);

    resize();
    for (let i = 0; i < 20; i++) drop(bowl.x + (Math.random() - 0.5) * bowl.r, bowl.y + Math.random() * bowl.r * 0.5);
    requestAnimationFrame(loop);
});
