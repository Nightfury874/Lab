// Eulerian fluid on a staggered grid — the same method as the Wind Tunnel:
// Gauss–Seidel pressure projection with over-relaxation, then semi-Lagrangian advection.
(function () {
    const U = 0, V = 1, D = 2;

    class Fluid {
        constructor(nx, ny, h) {
            this.nx = nx + 2;
            this.ny = ny + 2;
            this.h = h;
            const n = this.nx * this.ny;
            this.u = new Float32Array(n);
            this.v = new Float32Array(n);
            this.nu = new Float32Array(n);
            this.nv = new Float32Array(n);
            this.s = new Float32Array(n).fill(1); // 1 = fluid, 0 = solid
            this.d = new Float32Array(n);         // smoke density
            this.nd = new Float32Array(n);
            this.overRelax = 1.9;
            this.iters = 16;
        }

        // Solid walls on the sides and bottom; the top stays open so smoke can escape.
        walls({ top = false, left = true, right = true, bottom = true } = {}) {
            const { nx, ny, s } = this;
            for (let i = 0; i < nx; i++) {
                if (bottom) s[i * ny] = 0;
                if (top) s[i * ny + ny - 1] = 0;
            }
            for (let j = 0; j < ny; j++) {
                if (left) s[j] = 0;
                if (right) s[(nx - 1) * ny + j] = 0;
            }
        }

        project(dt) {
            const { nx, ny, u, v, s, overRelax } = this;
            for (let it = 0; it < this.iters; it++) {
                for (let i = 1; i < nx - 1; i++) {
                    for (let j = 1; j < ny - 1; j++) {
                        if (s[i * ny + j] === 0) continue;
                        const sx0 = s[(i - 1) * ny + j], sx1 = s[(i + 1) * ny + j];
                        const sy0 = s[i * ny + j - 1], sy1 = s[i * ny + j + 1];
                        const st = sx0 + sx1 + sy0 + sy1;
                        if (st === 0) continue;
                        const div = u[(i + 1) * ny + j] - u[i * ny + j] + v[i * ny + j + 1] - v[i * ny + j];
                        const p = (-div / st) * overRelax;
                        u[i * ny + j] -= sx0 * p;
                        u[(i + 1) * ny + j] += sx1 * p;
                        v[i * ny + j] -= sy0 * p;
                        v[i * ny + j + 1] += sy1 * p;
                    }
                }
            }
        }

        sample(x, y, field) {
            const { nx, ny, h } = this;
            const h1 = 1 / h, h2 = 0.5 * h;
            x = Math.max(Math.min(x, nx * h), h);
            y = Math.max(Math.min(y, ny * h), h);
            let dx = 0, dy = 0, f;
            if (field === U) { f = this.u; dy = h2; }
            else if (field === V) { f = this.v; dx = h2; }
            else { f = this.d; dx = h2; dy = h2; }
            const x0 = Math.min(Math.floor((x - dx) * h1), nx - 1);
            const tx = ((x - dx) - x0 * h) * h1;
            const x1 = Math.min(x0 + 1, nx - 1);
            const y0 = Math.min(Math.floor((y - dy) * h1), ny - 1);
            const ty = ((y - dy) - y0 * h) * h1;
            const y1 = Math.min(y0 + 1, ny - 1);
            const sx = 1 - tx, sy = 1 - ty;
            return sx * sy * f[x0 * ny + y0] + tx * sy * f[x1 * ny + y0] +
                tx * ty * f[x1 * ny + y1] + sx * ty * f[x0 * ny + y1];
        }

        advect(dt) {
            const { nx, ny, h, u, v, s } = this;
            this.nu.set(u);
            this.nv.set(v);
            const h2 = 0.5 * h;
            for (let i = 1; i < nx; i++) {
                for (let j = 1; j < ny; j++) {
                    const k = i * ny + j;
                    if (s[k] !== 0 && s[(i - 1) * ny + j] !== 0 && j < ny - 1) {
                        const x = i * h, y = j * h + h2;
                        const avgV = (v[(i - 1) * ny + j] + v[k] + v[(i - 1) * ny + j + 1] + v[k + 1]) * 0.25;
                        this.nu[k] = this.sample(x - dt * u[k], y - dt * avgV, U);
                    }
                    if (s[k] !== 0 && s[k - 1] !== 0 && i < nx - 1) {
                        const x = i * h + h2, y = j * h;
                        const avgU = (u[k - 1] + u[k] + u[(i + 1) * ny + j - 1] + u[(i + 1) * ny + j]) * 0.25;
                        this.nv[k] = this.sample(x - dt * avgU, y - dt * v[k], V);
                    }
                }
            }
            u.set(this.nu);
            v.set(this.nv);

            this.nd.set(this.d);
            for (let i = 1; i < nx - 1; i++) {
                for (let j = 1; j < ny - 1; j++) {
                    const k = i * ny + j;
                    if (s[k] === 0) continue;
                    const cu = (u[k] + u[(i + 1) * ny + j]) * 0.5;
                    const cv = (v[k] + v[k + 1]) * 0.5;
                    this.nd[k] = this.sample(i * h + h2 - dt * cu, j * h + h2 - dt * cv, D);
                }
            }
            this.d.set(this.nd);
        }

        step(dt, { buoyancy = 0, fade = 0 } = {}) {
            const { nx, ny, v, d, s } = this;
            if (buoyancy) {
                for (let i = 1; i < nx - 1; i++) {
                    for (let j = 1; j < ny - 1; j++) {
                        const k = i * ny + j;
                        if (s[k] && s[k - 1]) v[k] += buoyancy * dt * (d[k] + d[k - 1]) * 0.5;
                    }
                }
            }
            this.project(dt);
            this.advect(dt);
            if (fade) {
                const keep = Math.max(0, 1 - fade * dt);
                for (let k = 0; k < d.length; k++) d[k] *= keep;
            }
        }

        // Grid helpers in cell coordinates (i across, j up).
        index(i, j) { return i * this.ny + j; }

        splat(ci, cj, radius, amount, du = 0, dv = 0) {
            const { nx, ny } = this;
            const r2 = radius * radius;
            const i0 = Math.max(1, Math.floor(ci - radius)), i1 = Math.min(nx - 2, Math.ceil(ci + radius));
            const j0 = Math.max(1, Math.floor(cj - radius)), j1 = Math.min(ny - 2, Math.ceil(cj + radius));
            for (let i = i0; i <= i1; i++) {
                for (let j = j0; j <= j1; j++) {
                    const k = i * ny + j;
                    if (!this.s[k]) continue;
                    const q = ((i - ci) ** 2 + (j - cj) ** 2) / r2;
                    if (q > 1) continue;
                    const w = 1 - q;
                    this.d[k] = Math.min(1.5, this.d[k] + amount * w);
                    this.u[k] += du * w;
                    this.v[k] += dv * w;
                }
            }
        }

        // Velocity at a cell centre, in cells per second.
        velocityAt(ci, cj) {
            const h = this.h;
            const x = (ci + 0.5) * h, y = (cj + 0.5) * h;
            return [this.sample(x, y, U), this.sample(x, y, V)];
        }
    }

    window.ForgeFluid = Fluid;
})();
