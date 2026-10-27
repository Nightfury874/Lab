// All forge sounds are synthesised with the Web Audio API. Off by default; nothing loads until switched on.
(function () {
    let ac = null, master = null, fireGain = null, rumbleGain = null, noise = null, popTimer = 0;
    let on = false, fireLevel = 1;

    function noiseBuffer(seconds, brown) {
        const len = ac.sampleRate * seconds, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < len; i++) {
            const w = Math.random() * 2 - 1;
            if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
        }
        return buf;
    }

    function loop(buf, filterType, freq, gain) {
        const src = ac.createBufferSource();
        src.buffer = buf; src.loop = true;
        const f = ac.createBiquadFilter(); f.type = filterType; f.frequency.value = freq;
        const g = ac.createGain(); g.gain.value = gain;
        src.connect(f).connect(g).connect(master);
        src.start();
        return g;
    }

    function burst(dur, type, freq, q, peak, when = 0) {
        const t = ac.currentTime + when;
        const src = ac.createBufferSource(); src.buffer = noise; src.loop = true;
        const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.02, dur / 4));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f).connect(g).connect(master);
        src.start(t, Math.random() * 1.5, dur + 0.05);
        return f;
    }

    function pops() {
        if (!on) return;
        if (Math.random() < 0.6 * fireLevel) burst(0.03 + Math.random() * 0.05, 'highpass', 1800 + Math.random() * 2500, 0.7, 0.05 * fireLevel);
        popTimer = setTimeout(pops, 40 + Math.random() * 220 / Math.max(0.3, fireLevel));
    }

    function init() {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = 0.8;
        master.connect(ac.destination);
        noise = noiseBuffer(2, false);
        fireGain = loop(noise, 'bandpass', 900, 0.018);
        rumbleGain = loop(noiseBuffer(3, true), 'lowpass', 160, 0.12);
    }

    const api = {
        get on() { return on; },
        set(value) {
            on = value;
            if (on) {
                if (!ac) init();
                ac.resume();
                master.gain.setTargetAtTime(0.8, ac.currentTime, 0.2);
                clearTimeout(popTimer);
                pops();
            } else if (ac) {
                master.gain.setTargetAtTime(0, ac.currentTime, 0.1);
                clearTimeout(popTimer);
            }
        },
        fire(level) {
            if (Math.abs(level - fireLevel) < 0.05) return;
            fireLevel = level;
            if (!on) return;
            fireGain.gain.setTargetAtTime(0.012 + 0.02 * level, ac.currentTime, 0.3);
            rumbleGain.gain.setTargetAtTime(0.08 + 0.08 * level, ac.currentTime, 0.5);
        },
        clink(strength = 1) {
            if (!on) return;
            const t = ac.currentTime;
            const base = 820 + Math.random() * 120;
            [1, 2.76, 5.4, 8.9].forEach((k, i) => {
                const o = ac.createOscillator(), g = ac.createGain();
                o.frequency.value = base * k;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(0.12 * strength / (i + 1), t + 0.004);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9 / (i * 0.6 + 1));
                o.connect(g).connect(master);
                o.start(t); o.stop(t + 1);
            });
            burst(0.05, 'highpass', 3000, 0.5, 0.15 * strength);
        },
        whoosh(dur = 0.8) {
            if (!on) return;
            const f = burst(dur, 'bandpass', 300, 1.2, 0.35);
            f.frequency.exponentialRampToValueAtTime(2200, ac.currentTime + dur * 0.6);
        },
        breathe(inhale, seconds) {
            if (!on) return;
            const f = burst(seconds, 'lowpass', inhale ? 700 : 450, 0.6, inhale ? 0.035 : 0.05);
            f.frequency.linearRampToValueAtTime(inhale ? 1100 : 300, ac.currentTime + seconds);
        },
        snort() {
            if (!on) return;
            burst(0.35, 'lowpass', 500, 1, 0.4);
            burst(0.25, 'bandpass', 1400, 2, 0.12, 0.05);
        },
        chime() {
            if (!on) return;
            const t = ac.currentTime;
            [523.25, 659.25, 783.99, 1046.5].forEach((fq, i) => {
                const o = ac.createOscillator(), g = ac.createGain();
                o.type = 'triangle'; o.frequency.value = fq;
                g.gain.setValueAtTime(0.0001, t + i * 0.09);
                g.gain.exponentialRampToValueAtTime(0.08, t + i * 0.09 + 0.01);
                g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.8);
                o.connect(g).connect(master);
                o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.9);
            });
        }
    };

    window.ForgeAudio = api;
})();
