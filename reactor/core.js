// RBMK-1000 core — a side-on slice through the reactor.
//
// Three layers, the way plant simulators are built:
//  • Two-group neutron diffusion on a 25 × 20 grid (graphite, boiling water channels, boron rods with
//    graphite displacers, xenon, hot fuel). Solved every frame for the flux shape and k-effective.
//    Nothing about the void coefficient, Doppler, xenon or the graphite-tip effect is scripted: they
//    all come out of the cross sections changing under the neutrons.
//  • Point kinetics with delayed neutrons carries the power level, driven by ρ = 1 − 1/k.
//  • Monte Carlo neutrons fly through the same materials so you can watch them: born fast in the
//    fuel, slowed in graphite, caught by boron and water, splitting more uranium.
// Simplifications: one delayed group, one pressure, homogeneous boiling, a 2-D slice.
(function (root) {
    'use strict';

    const NX = 25, NY = 20;             // grid incl. graphite reflector
    const CT = 2, CR = 16, CB = CT + CR; // core rows [CT, CB)
    const C0 = 2, C1 = 22;              // channel columns [C0, C1]
    const ROW_M = 7 / CR;               // metres per core row (core is 7 m tall)
    const N = NX * NY;

    const DEF = {
        // Macroscopic cross sections, per cell of path. Shared by the diffusion solver and the particles.
        sG_F: 1.4, thG: 0.13, sW_F: 1.2, thW: 0.30, aG_F: 0.003, cRes: 0.06, dop: 0.22, fF: 0.03, aB_F: 1.2,
        sG_T: 1.1, aG_T: 0.006, sW_T: 1.0, aW_T: 0.16, fT: 0.375, cT: 0.2, xe: 0.045, aB_T: 6.0,
        aWR_T: 2.0,                     // water in the control-rod cooling channels
        arStrength: 0.03,               // the regulator column stands for a small group of rods (12 of 211)
        nu: 2.43,
        sigma: 0.7,                     // global density scale: sets how far neutrons migrate (≈ 2 channel pitches)
        // Particles (visual)
        vFast: 34, vTherm: 16, nTarget: 650,
        // Kinetics
        beta: 0.0065, lambda: 0.08, Lambda: 0.004,
        // Plant
        Pnom: 3200, Tsat: 284,
        tauFuel: 1,                     // s, fuel-to-coolant heat transfer time constant
        rhoRatio: 0.03,                 // steam/water density at 7 MPa
        graphiteCoef: 1.2e-4,           // per °C — positive in an RBMK: a cold stack is less reactive
        graphiteRef: 500,               // °C at which the diffusion constants were tuned
        rodSpeed: 0.4 / 7,              // fraction of stroke per second (0.4 m/s)
        source: 0.002                   // MW/s, start-up source
    };

    const COL = [];
    for (let c = 0; c < NX; c++) COL.push(c < C0 || c > C1 ? 'refl' : (c - C0) % 5 === 0 ? 'rod' : 'fuel');
    const ROD_COLS = COL.map((t, c) => t === 'rod' ? c : -1).filter(c => c >= 0);
    const FUEL_COLS = COL.map((t, c) => t === 'fuel' ? c : -1).filter(c => c >= 0);
    const AR_COLS = [12];
    const ROD_NAMES = { 2: 'RR-1', 7: 'RR-2', 12: 'AR', 17: 'RR-3', 22: 'RR-4' };
    const NFUEL = FUEL_COLS.length * CR;
    const isFuel = (c, r) => COL[c] === 'fuel' && r >= CT && r < CB;
    const boronScale = (p, c) => AR_COLS.includes(c) ? p.arStrength : 1;

    const ABSORBER = 7.0, LINK = 1.25, DISPLACER = 4.5;    // rod assembly, metres: boron long enough to cover the core

    const LI = 0.1035, LX = 0.0753, SX = 0.36, GI = 0.95, GX = 0.05;  // iodine/xenon, plant hours
    const XEQ1 = (GI + GX) / (LX + SX);
    const SQT0 = Math.sqrt(557);

    class Reactor {
        constructor(params = {}) {
            this.p = Object.assign({}, DEF, params);
            for (const k of ['q', 'qSlow', 'shape', 'Tf', 'Tw', 'alpha', 'I', 'X', 'segB', 'segW', 'dopplerMul',
                'phi1', 'phi2', 'D1', 'D2', 'R1', 'A2', 'S12', 'F1', 'F2'])
                this[k] = new Float64Array(N);
            this.rods = ROD_COLS.map(c => ({ col: c, name: ROD_NAMES[c], group: AR_COLS.includes(c) ? 'AR' : 'RR', pos: 1, target: 1 }));
            this.reset();
        }

        reset() {
            const p = this.p;
            this.neutrons = [];
            this.time = 0;
            this.plantHours = 0;
            this.warp = 120;
            this.flow = 1; this.flowTarget = 1; this.flowRate = 0.1;
            this.sub = 14;
            this.Tin = p.Tsat - this.sub;
            this.ar = { on: false, setpoint: 1600 };
            this.rrTarget = 1;
            this.protection = true;
            this.scram = false;
            this.P = 1e-3; this.Cp = 0;
            this.power = this.P; this.powerSlow = this.P;
            this.decay = 0;
            this.keff = 1; this.rho = 0;
            this.Tg = 280;                // graphite stack temperature, °C
            this.dlnP = 0; this.lastLnP = null;
            this.events = [];
            this.flashes = [];
            this.state = 'running';
            this.cause = null; this.overTime = 0;
            this.maxTf = 0; this.avgVoid = 0; this.avgXe = 0;
            for (const r of this.rods) r.pos = r.target = 1;
            for (const k of ['q', 'qSlow', 'alpha', 'I', 'X', 'shape']) this[k].fill(0);
            for (let c = 0; c < NX; c++) for (let r = 0; r < NY; r++) if (isFuel(c, r)) this.shape[c * NY + r] = 1;
            this.dopplerMul.fill(1);
            this.Tf.fill(this.Tin); this.Tw.fill(this.Tin);
            this.phi1.fill(1); this.phi2.fill(1);
            this.updateSegments();
            this.solve(200);
            this.Cp = p.beta * this.P / (p.Lambda * p.lambda);
            for (let i = 0; i < p.nTarget; i++) this.spawnInFuel();
        }

        log(text, level = 'info') { this.events.push({ t: this.time, text, level }); }

        // ------------------------------------------------------------ geometry & materials
        // Fraction of each rod-channel cell filled with boron and with water; the rest is graphite
        // (the displacer, or the reflector). Fractional so reactivity changes smoothly as rods move.
        updateSegments() {
            const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
            for (const rod of this.rods) {
                const a = rod.pos * 7;
                for (let r = 0; r < NY; r++) {
                    const k = rod.col * NY + r;
                    if (r < CT || r >= CB) { this.segB[k] = 0; this.segW[k] = 0; continue; }
                    const d0 = (r - CT) * ROW_M, d1 = d0 + ROW_M;
                    const b = overlap(d0, d1, a - ABSORBER, a) / ROW_M;
                    const g = overlap(d0, d1, a + LINK, a + LINK + DISPLACER) / ROW_M;
                    this.segB[k] = b;
                    this.segW[k] = Math.max(0, 1 - b - g);
                }
            }
        }

        materials() {
            const p = this.p, g = p.sigma;
            for (let c = 0; c < NX; c++) for (let r = 0; r < NY; r++) {
                const k = c * NY + r;
                let w = 0, fuel = false, boron = 0, xen = 0;
                if (isFuel(c, r)) { fuel = true; w = 1 - 0.95 * this.alpha[k]; xen = this.X[k] / XEQ1; }
                else if (COL[c] === 'rod') { boron = this.segB[k] * boronScale(p, c); w = this.segW[k] * boronScale(p, c); }
                const rem = p.sG_F * p.thG + p.sW_F * w * p.thW;
                const a1 = p.aG_F + (fuel ? p.cRes * this.dopplerMul[k] : 0) + boron * p.aB_F;
                const f1 = fuel ? p.fF : 0;
                const t1 = p.sG_F + p.sW_F * w + a1 + f1;
                const a2 = p.aG_T + (fuel ? p.aW_T : p.aWR_T) * w + (fuel ? p.cT + p.xe * xen + p.fT : 0) + boron * p.aB_T;
                const t2 = p.sG_T + p.sW_T * w + a2;
                this.D1[k] = 1 / (3 * t1 * g); this.D2[k] = 1 / (3 * t2 * g);
                this.R1[k] = (a1 + f1 + rem) * g; this.S12[k] = rem * g;
                this.A2[k] = a2 * g;
                this.F1[k] = p.nu * f1 * g; this.F2[k] = fuel ? p.nu * p.fT * g : 0;
            }
        }

        // ------------------------------------------------------------ two-group diffusion
        sweep(phi, D, rem, src, omega) {
            for (let c = 0; c < NX; c++) for (let r = 0; r < NY; r++) {
                const k = c * NY + r, Dk = D[k];
                let num = src[k], den = rem[k];
                for (let n = 0; n < 4; n++) {
                    const cc = n === 0 ? c - 1 : n === 1 ? c + 1 : c, rr = n === 2 ? r - 1 : n === 3 ? r + 1 : r;
                    if (cc < 0 || cc >= NX || rr < 0 || rr >= NY) { den += 2 * Dk / (1 + 4.26 * Dk); continue; }
                    const j = cc * NY + rr, d = 2 * Dk * D[j] / (Dk + D[j]);
                    den += d; num += d * phi[j];
                }
                phi[k] += omega * (num / den - phi[k]);
            }
        }

        solve(outers = 3) {
            this.materials();
            const src = this.src || (this.src = new Float64Array(N));
            const { phi1, phi2, F1, F2, S12 } = this;
            let S0 = 0;
            for (let k = 0; k < N; k++) S0 += F1[k] * phi1[k] + F2[k] * phi2[k];
            for (let o = 0; o < outers; o++) {
                for (let k = 0; k < N; k++) src[k] = (F1[k] * phi1[k] + F2[k] * phi2[k]) / this.keff;
                for (let s = 0; s < 3; s++) this.sweep(phi1, this.D1, this.R1, src, 1.4);
                for (let k = 0; k < N; k++) src[k] = S12[k] * phi1[k];
                for (let s = 0; s < 3; s++) this.sweep(phi2, this.D2, this.A2, src, 1.4);
                let S1 = 0;
                for (let k = 0; k < N; k++) S1 += F1[k] * phi1[k] + F2[k] * phi2[k];
                if (S0 > 0 && S1 > 0) this.keff *= S1 / S0;
                const norm = NFUEL / S1;
                for (let k = 0; k < N; k++) { phi1[k] *= norm; phi2[k] *= norm; }
                S0 = NFUEL;
            }
            // Fission power shape, mean 1 over the fuel.
            for (const c of FUEL_COLS) for (let r = CT; r < CB; r++) {
                const k = c * NY + r;
                this.shape[k] = F1[k] * phi1[k] + F2[k] * phi2[k];
            }
            this.rho = 1 - 1 / this.keff + this.p.graphiteCoef * (this.Tg - this.p.graphiteRef);
        }

        // ------------------------------------------------------------ Monte Carlo neutrons (visual)
        spawn(x, y, fast = true) {
            const a = Math.random() * Math.PI * 2;
            this.neutrons.push({ x, y, dx: Math.cos(a), dy: Math.sin(a), f: fast, px: x, py: y, age: 0 });
        }

        spawnInFuel() {
            let u = Math.random() * NFUEL;
            for (const c of FUEL_COLS) for (let r = CT; r < CB; r++) {
                u -= this.shape[c * NY + r];
                if (u <= 0) return this.spawn(c + Math.random(), r + Math.random(), true);
            }
            this.spawn(FUEL_COLS[0] + 0.5, CT + 0.5, true);
        }

        transport(dt) {
            const p = this.p, list = this.neutrons, dop = this.dopplerMul;
            for (let i = list.length - 1; i >= 0; i--) {
                const n = list[i];
                n.age += dt;
                let rem = (n.f ? p.vFast : p.vTherm) * dt;
                let alive = true;
                while (rem > 1e-9) {
                    const c = Math.floor(n.x), r = Math.floor(n.y);
                    if (c < 0 || c >= NX || r < 0 || r >= NY) { alive = false; break; }
                    const k = c * NY + r;
                    let w = 0, fuel = false, boron = 0, xen = 0;
                    if (isFuel(c, r)) { fuel = true; w = 1 - 0.95 * this.alpha[k]; xen = this.X[k] / XEQ1; }
                    else if (COL[c] === 'rod') { boron = this.segB[k] * boronScale(p, c); w = this.segW[k] * boronScale(p, c); }
                    let sS, sA, sFis, sSG = 0;
                    if (n.f) {
                        sSG = p.sG_F;
                        sS = sSG + p.sW_F * w;
                        sA = p.aG_F + (fuel ? p.cRes * dop[k] : 0) + boron * p.aB_F;
                        sFis = fuel ? p.fF : 0;
                    } else {
                        sS = p.sG_T + p.sW_T * w;
                        sA = p.aG_T + (fuel ? p.aW_T : p.aWR_T) * w + (fuel ? p.cT + p.xe * xen : 0) + boron * p.aB_T;
                        sFis = fuel ? p.fT : 0;
                    }
                    const st = sS + sA + sFis;
                    const s = -Math.log(1 - Math.random()) / (st * p.sigma);
                    const tx = n.dx > 0 ? (c + 1 - n.x) / n.dx : n.dx < 0 ? (c - n.x) / n.dx : Infinity;
                    const ty = n.dy > 0 ? (r + 1 - n.y) / n.dy : n.dy < 0 ? (r - n.y) / n.dy : Infinity;
                    const go = Math.min(s, rem, Math.min(tx, ty) + 1e-6);
                    n.x += n.dx * go; n.y += n.dy * go;
                    rem -= go;
                    if (go !== s) continue;
                    const u = Math.random() * st;
                    if (u < sS) {
                        const a = Math.random() * Math.PI * 2;
                        n.dx = Math.cos(a); n.dy = Math.sin(a);
                        if (n.f && Math.random() < (u < sSG ? p.thG : p.thW)) n.f = false;
                        continue;
                    }
                    if (u - sS < sFis) {
                        const m = Math.floor(p.nu + Math.random() - 0.43);
                        for (let j = 0; j < m; j++) this.spawn(n.x, n.y, true);
                        if (this.flashes.length < 140) this.flashes.push({ x: n.x, y: n.y, t: 0 });
                    }
                    alive = false;
                    break;
                }
                if (!alive) { list[i] = list[list.length - 1]; list.pop(); }
            }
        }

        // Keep the on-screen count steady; the kinetics carries the real level.
        population() {
            const T = this.p.nTarget, list = this.neutrons;
            if (list.length > T * 1.2) {
                const keep = T / list.length;
                for (let i = list.length - 1; i >= 0; i--) if (Math.random() > keep) { list[i] = list[list.length - 1]; list.pop(); }
            }
            while (list.length < T * 0.8) {
                if (list.length > 0 && Math.random() < 0.6) {
                    const n = list[Math.floor(Math.random() * list.length)], a = Math.random() * Math.PI * 2;
                    list.push({ x: n.x, y: n.y, dx: Math.cos(a), dy: Math.sin(a), f: n.f, px: n.x, py: n.y, age: 0 });
                } else this.spawnInFuel();
            }
        }

        // ------------------------------------------------------------ kinetics
        kinetics(dt) {
            const p = this.p;
            const n = 24, h = dt / n;
            let P = this.P, C = this.Cp;
            for (let i = 0; i < n; i++) {
                const dP = ((this.rho - p.beta) / p.Lambda) * P + p.lambda * C + p.source;
                const dC = (p.beta / p.Lambda) * P - p.lambda * C;
                P = Math.max(1e-9, P + dP * h);
                C = Math.max(0, C + dC * h);
            }
            this.P = P; this.Cp = C;
        }

        // ------------------------------------------------------------ thermal hydraulics
        thermal(dt) {
            const p = this.p;
            const nomCell = p.Pnom / NFUEL;
            const h = nomCell / 380, Cf = h * p.tauFuel;
            const f = Math.max(this.flow, 0.03);
            const colNom = nomCell * CR;
            const mcp = 0.25 * colNom / 14 * f;
            const mhfg = 0.75 * colNom / 0.145 * f;
            // Inlet subcooling comes from cold feedwater, which scales with steam production.
            const subTarget = Math.min(40, Math.max(0.3, 14 * (this.power / p.Pnom) / f));
            this.sub += (subTarget - this.sub) * Math.min(1, dt / 8);
            this.Tin = p.Tsat - this.sub;
            const ka = Math.min(1, dt / 0.35);
            let sumSlow = 0;
            for (const c of FUEL_COLS) for (let r = CT; r < CB; r++) sumSlow += this.qSlow[c * NY + r];
            let maxTf = 0, voidSum = 0;
            for (const c of FUEL_COLS) {
                let H = 0;
                const Hsat = mcp * this.sub;
                for (let r = CB - 1; r >= CT; r--) {
                    const k = c * NY + r;
                    const a = this.alpha[k];
                    const Qw = h * (1 - 0.6 * a * a * a * a) * (this.Tf[k] - this.Tw[k]); // dry-out degrades heat transfer
                    H += Math.max(0, Qw);
                    let x = 0;
                    if (H < Hsat) this.Tw[k] = this.Tin + H / mcp;
                    else { this.Tw[k] = p.Tsat; x = Math.min(1, (H - Hsat) / mhfg); }
                    this.alpha[k] += (x / (x + (1 - x) * p.rhoRatio) - a) * ka;
                    const qd = sumSlow > 0 ? this.decay * this.qSlow[k] / sumSlow : 0;
                    this.Tf[k] += (this.q[k] + qd - Qw) / Cf * dt;
                    if (this.Tf[k] < this.Tw[k]) this.Tf[k] = this.Tw[k];
                    if (this.Tf[k] > maxTf) maxTf = this.Tf[k];
                    voidSum += this.alpha[k];
                    // Doppler: hotter fuel broadens U-238 resonances and captures more neutrons.
                    this.dopplerMul[k] = 1 + p.dop * (Math.sqrt(this.Tf[k] + 273) / SQT0 - 1);
                }
            }
            this.maxTf = maxTf;
            this.avgVoid = voidSum / NFUEL;
        }

        xenon(dt) {
            const dth = dt * this.warp / 3600;
            this.plantHours += dth;
            const nomCell = this.p.Pnom / NFUEL;
            const n = Math.max(1, Math.ceil(dth / 0.05)), h = dth / n;
            let xs = 0;
            for (const c of FUEL_COLS) for (let r = CT; r < CB; r++) {
                const k = c * NY + r, rr = this.q[k] / nomCell;
                for (let s = 0; s < n; s++) {
                    const I = this.I[k], X = this.X[k];
                    this.I[k] = I + (GI * rr - LI * I) * h;
                    this.X[k] = X + (GX * rr + LI * I - LX * X - SX * rr * X) * h;
                }
                xs += this.X[k];
            }
            this.avgXe = xs / NFUEL / XEQ1;
            // The graphite stack heats and cools over hours.
            this.Tg += (this.graphiteEq(this.power) - this.Tg) * Math.min(1, dth / 1.5);
        }

        graphiteEq(power) { return this.Tin + 400 * Math.pow(Math.max(0, power) / this.p.Pnom, 0.7); }

        xenonEquilibrium(frac) {
            for (const c of FUEL_COLS) for (let r = CT; r < CB; r++) {
                const k = c * NY + r, rr = this.shape[k] * frac;
                this.I[k] = GI * rr / LI;
                this.X[k] = (GX + GI) * rr / (LX + SX * rr);
            }
        }

        // Replay a power history [[hours, fractionOfNominal], …] through the xenon chain.
        xenonHistory(history) {
            this.xenonEquilibrium(history[0][1]);
            for (const [hours, frac] of history.slice(1)) {
                const n = Math.ceil(hours / 0.02), h = hours / n;
                for (let s = 0; s < n; s++) for (const c of FUEL_COLS) for (let r = CT; r < CB; r++) {
                    const k = c * NY + r, rr = this.shape[k] * frac, I = this.I[k], X = this.X[k];
                    this.I[k] = I + (GI * rr - LI * I) * h;
                    this.X[k] = X + (GX * rr + LI * I - LX * X - SX * rr * X) * h;
                }
            }
            this.avgXe = this.X.reduce((a, b) => a + b, 0) / NFUEL / XEQ1;
        }

        // Skew the xenon (and iodine) towards the top of the core, keeping the total.
        xenonTilt(top, bottom) {
            let before = 0, after = 0;
            for (const c of FUEL_COLS) for (let r = CT; r < CB; r++) before += this.X[c * NY + r];
            for (const c of FUEL_COLS) for (let r = CT; r < CB; r++) {
                const k = c * NY + r, z = (r - CT) / (CR - 1), m = top + (bottom - top) * z;
                this.X[k] *= m; this.I[k] *= m; after += this.X[k];
            }
            const fix = before / after;
            for (const c of FUEL_COLS) for (let r = CT; r < CB; r++) { this.X[c * NY + r] *= fix; this.I[c * NY + r] *= fix; }
        }

        // Scale the xenon (and iodine) until the core is exactly critical as it stands.
        balanceXenon() {
            const scale = m => { for (let k = 0; k < N; k++) { this.X[k] *= m; this.I[k] *= m; } };
            const rhoAt = () => { this.solve(150); return this.rho; };
            let r0 = rhoAt();
            for (let i = 0; i < 8 && Math.abs(r0) > 2e-6; i++) {
                scale(1.01);
                const r1 = rhoAt();
                const slope = (r1 - r0) / 0.01;
                const m = 1 - r1 / slope / 1.01;
                scale(m);
                r0 = rhoAt();
            }
        }

        // ------------------------------------------------------------ control
        rodMotion(dt) {
            const v = this.p.rodSpeed * dt;
            for (const rod of this.rods) rod.pos += Math.max(-v, Math.min(v, rod.target - rod.pos));
            this.updateSegments();
        }

        controllers(dt) {
            if (this.scram) { for (const r of this.rods) r.target = 1; return; }
            for (const r of this.rods) if (r.group === 'RR' && !r.override) r.target = this.rrTarget;
            if (this.ar.on) {
                const e = Math.log(Math.max(this.power, 1e-9) / this.ar.setpoint) + 8 * this.dlnP;
                const v = Math.max(-this.p.rodSpeed, Math.min(this.p.rodSpeed, 0.15 * e));
                for (const r of this.rods) if (r.group === 'AR') r.target = Math.max(0, Math.min(1, r.pos + v * dt));
            }
        }

        az5(reason) {
            if (this.scram) return;
            this.scram = true;
            this.ar.on = false;
            this.log(reason ? `AZ-5 — ${reason}` : 'AZ-5 pressed. All rods driving in.', 'alarm');
        }

        // Operational reactivity margin in equivalent RBMK rods: the manual group stands for 199 rods,
        // the automatic regulator for 12, as in the real plant. The regulations demanded at least 15.
        get orm() {
            const rr = this.rods.filter(r => r.group === 'RR'), ar = this.rods.filter(r => r.group === 'AR');
            return Math.round(rr.reduce((s, r) => s + r.pos, 0) / rr.length * 199 + ar.reduce((s, r) => s + r.pos, 0) / ar.length * 12);
        }
        get k() { return 1 / (1 - this.rho); }
        get dollars() { return this.rho / this.p.beta; }
        get period() { return Math.abs(this.dlnP) < 1e-4 ? Infinity : 1 / this.dlnP; }

        // ------------------------------------------------------------ main step
        step(dt, { frozenPower = false, particles = true } = {}) {
            if (this.state !== 'running') return;
            dt = Math.min(dt, 0.05);
            this.time += dt;

            this.solve(3);
            if (!frozenPower) this.kinetics(dt);

            this.power = this.P;
            this.powerSlow += (this.P - this.powerSlow) * Math.min(1, dt / 0.5);
            const kq = Math.min(1, dt / 0.1), ks = Math.min(1, dt / 20), nomCell = 1 / NFUEL;
            for (const c of FUEL_COLS) for (let r = CT; r < CB; r++) {
                const k = c * NY + r;
                this.q[k] += (this.P * this.shape[k] * nomCell - this.q[k]) * kq;
                this.qSlow[k] += (this.q[k] - this.qSlow[k]) * ks;
            }
            const lnP = Math.log(this.P);
            if (this.lastLnP !== null) this.dlnP += ((lnP - this.lastLnP) / dt - this.dlnP) * Math.min(1, dt / 0.6);
            this.lastLnP = lnP;
            this.decay += (0.06 * this.P - this.decay) * Math.min(1, dt / 40);

            this.thermal(dt);
            this.xenon(dt);
            this.controllers(dt);
            this.rodMotion(dt);
            this.flow += Math.max(-this.flowRate * dt, Math.min(this.flowRate * dt, this.flowTarget - this.flow));

            if (particles) {
                for (const n of this.neutrons) { n.px = n.x; n.py = n.y; }
                this.transport(dt / 2);
                this.transport(dt / 2);
                this.population();
                for (const f of this.flashes) f.t += dt;
                this.flashes = this.flashes.filter(f => f.t < 0.35);
            }
            this.checks(dt);
        }

        checks(dt) {
            const p = this.p;
            if (this.protection && !this.scram) {
                if (this.power > 1.1 * p.Pnom) this.az5('emergency protection: overpower');
                else if (this.power > 0.01 * p.Pnom && this.period > 0 && this.period < 15) this.az5('emergency protection: short period');
            }
            if (this.settling) return;
            // Fuel fragments either from temperature or from energy dumped faster than it can conduct away.
            this.overTime = this.power > 8 * p.Pnom ? this.overTime + dt : 0;
            if (this.maxTf > 2800 || this.overTime > 0.4) {
                this.state = 'destroyed';
                this.cause = this.power > 2 * p.Pnom ? 'excursion' : 'meltdown';
                this.peakPower = this.power;
                this.log(this.cause === 'excursion'
                    ? 'Prompt critical excursion. Fuel fragments, steam explodes.'
                    : 'Fuel has melted. The core is lost.', 'alarm');
            }
        }

        // Bring the plant to a steady state at `power` MW: the level is held while temperatures, voids
        // and the flux shape settle, and the rods are walked to exactly critical.
        settle(power, { seconds = 30, xenon = 'equilibrium', fixRR = false, hold = false, graphite } = {}) {
            const p = this.p, frac = power / p.Pnom;
            this.P = this.power = this.powerSlow = power;
            if (graphite === undefined) this.Tg = this.graphiteEq(power); else this.Tg = graphite;
            this.decay = 0.06 * power;
            for (const c of FUEL_COLS) for (let r = CT; r < CB; r++) {
                const k = c * NY + r;
                this.q[k] = this.qSlow[k] = p.Pnom / NFUEL * frac * this.shape[k];
            }
            const warp = this.warp, speed = p.rodSpeed, controllers = this.controllers;
            this.warp = 0;
            p.rodSpeed = speed * 6;
            this.controllers = dt => {
                if (hold) return;
                const v = Math.max(-p.rodSpeed, Math.min(p.rodSpeed, this.rho * 6));
                for (const r of this.rods) if (r.group === 'AR') r.target = Math.max(0, Math.min(1, r.pos + v * dt));
                if (!fixRR) {
                    const ar = this.rods.find(r => r.group === 'AR').pos;
                    if (ar > 0.75) this.rrTarget = Math.min(1, this.rrTarget + 0.1 * dt);
                    if (ar < 0.25) this.rrTarget = Math.max(0, this.rrTarget - 0.1 * dt);
                }
                for (const r of this.rods) if (r.group === 'RR') r.target = this.rrTarget;
            };
            const steps = Math.round(seconds * 30);
            this.settling = true;
            for (let i = 0; i < steps; i++) {
                if (xenon === 'equilibrium' && i % 15 === 0) this.xenonEquilibrium(frac);
                this.step(1 / 30, { frozenPower: true, particles: false });
            }
            this.settling = false;
            this.controllers = controllers;
            p.rodSpeed = speed;
            this.warp = warp;
            if (hold) this.balanceXenon();
            this.ar.on = !hold; this.ar.setpoint = power;
            for (const r of this.rods) r.target = r.pos;
            this.rrTarget = this.rods[0].pos;
            this.Cp = p.beta * power / (p.Lambda * p.lambda);
            this.dlnP = 0; this.lastLnP = null;
            this.events = []; this.time = 0;
            this.state = 'running'; this.scram = false;
        }
    }

    Reactor.GRID = { NX, NY, CT, CR, CB, C0, C1, COL, ROD_COLS, FUEL_COLS, ROW_M, XEQ1, ABSORBER, LINK, DISPLACER, NFUEL };
    root.Reactor = Reactor;
    if (typeof module !== 'undefined') module.exports = Reactor;
})(typeof window !== 'undefined' ? window : globalThis);
