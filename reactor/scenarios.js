// Starting states for the reactor. Shared by the page and by the test harness.
(function (root) {
    'use strict';
    const Reactor = root.Reactor || (typeof require !== 'undefined' ? require('./core.js') : null);

    function atPower(R, power) {
        R.reset();
        for (const r of R.rods) r.pos = r.target = 0.5;
        R.rrTarget = 0.5;
        R.settle(power);
        R.warp = 120;
    }

    const SCENARIOS = {
        steady: {
            name: 'Steady at 50%',
            intro: 'Unit at 1,600 MW with the automatic regulator holding power. Everything is in your hands. Try pulling the manual rods, cutting the pumps or switching the regulator off.',
            setup(R) { atPower(R, 1600); }
        },
        full: {
            name: 'Full power',
            intro: '3,200 MW thermal — the rated output of an RBMK-1000. Voids are high in the upper core; the margins are real ones.',
            setup(R) { atPower(R, 3200); }
        },
        xenon: {
            name: 'Xenon pit',
            intro: 'Running at full power with equilibrium xenon, plant clock at ×600. Drop the regulator setpoint to 20% and watch xenon-135 build up and eat your reactivity. Can you climb back out?',
            setup(R) { atPower(R, 3200); R.warp = 600; }
        },
        cold: {
            name: 'Cold start-up',
            intro: 'Shut down, cold and clean: every rod in, no xenon, graphite at 280 °C. Withdraw the manual rods carefully and watch the period. The protection trips if it drops below 15 seconds.',
            setup(R) {
                R.reset();
                R.ar.on = false;
                R.flow = R.flowTarget = 0.6;
                R.rrTarget = 1;
                R.warp = 120;
            }
        },
        april: {
            name: '26 April 1986',
            intro: 'Chernobyl Unit 4, 01:22:30. The reactor has been held at 200 MW in a xenon pit for the turbine rundown test. Almost every rod is withdrawn — the operational reactivity margin is down to about 7 rods against a required minimum of 15 — and the emergency trips are disabled for the test.',
            clock: 1 * 3600 + 22 * 60 + 30,
            setup(R) {
                R.reset();
                R.flow = R.flowTarget = 1.15;
                for (const r of R.rods) r.pos = r.target = 0.5;
                R.rrTarget = 0.5;
                R.settle(1600, { seconds: 25 });
                // The day before: full power, a long hold at half power, then the fall to almost nothing.
                R.xenonHistory([[0, 1], [12, 0.75], [9, 0.5], [1.3, 0.22], [0.5, 0.01], [0.9, 0.0625]]);
                R.xenonTilt(3.0, 0.15);
                for (const r of R.rods) r.pos = r.target = r.group === 'AR' ? 0.6 : 0;
                R.rrTarget = 0;
                R.updateSegments();
                R.settle(200, { seconds: 30, xenon: 'keep', hold: true, graphite: 500 });
                R.settle(200, { seconds: 10, xenon: 'keep', hold: true, graphite: 500 });
                R.protection = false;
                R.warp = 1;
                R.ar.on = true;
                R.ar.setpoint = 200;
            },
            // Scripted plant events by elapsed seconds; the physics decides what happens.
            script: [
                { t: 0, run: R => R.log(`01:22:30 — 200 MW. ORM ${R.orm} rods. Emergency protection disabled for the test.`, 'warn') },
                { t: 34, run: R => { R.flowTarget = 0.85; R.flowRate = 0.0075; R.log('01:23:04 — Test begins. Turbine valves close; four pumps coast down with the turbine.', 'warn'); } },
                { t: 70, run: R => { if (!R.scram) R.az5('pressed at 01:23:40 by order of the shift supervisor'); } }
            ]
        }
    };

    root.ReactorScenarios = SCENARIOS;
    if (typeof module !== 'undefined') module.exports = SCENARIOS;
})(typeof window !== 'undefined' ? window : globalThis);
