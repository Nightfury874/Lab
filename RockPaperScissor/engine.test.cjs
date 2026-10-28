const assert = require('node:assert/strict');
const { World, CLANS, WIDTH, HEIGHT, RADIUS, CAP } = require('./engine.js');

// Every pairing has exactly one winner; each clan has two prey and two predators.
for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) {
  assert.notEqual(CLANS[a].beats.includes(b), CLANS[b].beats.includes(a));
}
for (const preset of ['kingdoms', 'scatter', 'siege', 'vortex']) {
  const a = new World({ preset, seed: 'test', population: 100 });
  const b = new World({ preset, seed: 'test', population: 100 });
  for (let i = 0; i < 600; i++) { a.step(); b.step(); }
  assert.deepEqual(a.agents, b.agents, `deterministic ${preset}`);
  assert.equal(a.agents.length, 100, `conversion conserves population ${preset}`);
  for (const p of a.agents) {
    assert(Number.isFinite(p.x) && Number.isFinite(p.y));
    assert(p.x >= RADIUS && p.x <= WIDTH - RADIUS);
    assert(p.y >= RADIUS && p.y <= HEIGHT - RADIUS);
  }
}
// All ten directed contacts, in both array orders and both outcome modes.
for (let winner = 0; winner < 5; winner++) for (const loser of CLANS[winner].beats) {
  for (const mode of ['convert', 'eliminate']) for (const reverse of [false, true]) {
    const w = new World({ population: 2, mode });
    w.agents = [w.make(winner, 300, 300, 0), w.make(loser, 301, 300, 0)];
    if (reverse) w.agents.reverse();
    w.agents.forEach(a => { a.cooldown = 0; }); w.step();
    assert(w.agents.every(a => a.type === winner));
    assert.equal(w.agents.length, mode === 'convert' ? 2 : 1);
    assert.equal(w.contacts, 1); assert(w.ended);
    const frozen = w.time; w.step(); assert.equal(w.time, frozen);
    w.add(loser, 500, 400, 1); assert(!w.ended, 'reinforcements reopen the battle');
  }
}
const classic = new World({ clans: 3, population: 90 });
assert(classic.agents.every(a => a.type < 3));
classic.add(4, 300, 300); assert.equal(classic.agents.length, 90);
classic.add(0, 500, 500, 1000); assert.equal(classic.agents.length, CAP);
assert.equal(classic.add(0, 500, 500), 0);
const timed = new World({ population: 100, duration: 1 });
for (let i = 0; i < 60; i++) timed.step();
assert.equal(timed.time, 1); assert.equal(timed.reason, 'time');
timed.add(1, 20, 20); assert(!timed.ended); assert.equal(timed.options.duration, 0);
const elimination = new World({ population: 300, mode: 'eliminate', preset: 'scatter' });
for (let i = 0; i < 1800; i++) elimination.step();
assert.equal(elimination.agents.length + elimination.contacts, 300);
assert(elimination.contacts > 0);
console.log('Passed: rules, deterministic formations, conservation, all contact outcomes, boundaries, classic mode, capacity, time limit and intervention.');
