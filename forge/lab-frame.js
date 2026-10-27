// The lab frame: wraps every experiment in the forge. Include it with
//   <script src="../forge/lab-frame.js" data-id="pendulum" defer></script>
// It adds an ember that leads back to the forge, the smith's notes, and Nightfury peeking in.
(function () {
    const me = document.currentScript;
    const base = me.src.replace(/lab-frame\.js(\?.*)?$/, '');
    const id = me.dataset.id;

    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = base + 'lab-frame.css';
    document.head.appendChild(css);

    function build() {
        const F = window.FORGE;
        const item = F && F.experiments.find(x => x.id === id);

        const home = document.createElement('a');
        home.className = 'lf-home';
        home.href = base + '../index.html';
        home.innerHTML = '<span class="lf-gem" aria-hidden="true"></span><span class="lf-txt">Back to the forge</span>';
        document.body.appendChild(home);

        if (item) {
            const notes = document.createElement('aside');
            notes.className = 'lf-notes';
            notes.setAttribute('aria-label', 'The smith’s notes');
            notes.innerHTML = `
                <button class="lf-tab" aria-expanded="false" aria-label="Smith’s notes">Notes</button>
                <div class="lf-sheet">
                    <h2></h2>
                    <p class="lf-idea"></p>
                    <div class="lf-eq"></div>
                    <p class="lf-how"></p>
                    <a class="lf-src" target="_blank" rel="noopener">Read the source</a>
                </div>`;
            notes.querySelector('h2').textContent = item.name;
            notes.querySelector('.lf-idea').textContent = item.notes.idea;
            notes.querySelector('.lf-eq').textContent = item.notes.equation;
            notes.querySelector('.lf-how').textContent = item.notes.how;
            notes.querySelector('.lf-src').href = F.repo + item.path.replace(/index\.html$/, '');
            const tab = notes.querySelector('.lf-tab');
            tab.addEventListener('click', () => {
                const open = notes.classList.toggle('open');
                tab.setAttribute('aria-expanded', open);
            });
            document.body.appendChild(notes);
        }

        // Nightfury peeks in from the bottom-left corner every so often, and when you come near.
        const peek = document.createElement('div');
        peek.className = 'lf-peek';
        peek.setAttribute('aria-hidden', 'true');
        peek.innerHTML = `<svg viewBox="0 0 120 90">
            <polygon points="10,90 40,40 70,52 60,90" fill="#1b1f2b"/>
            <polygon points="40,40 96,30 118,44 70,52" fill="#262b3a"/>
            <polygon points="70,52 118,44 98,62" fill="#161a24"/>
            <polygon points="40,40 20,8 52,34" fill="#2c3242"/>
            <polygon points="56,36 46,2 70,32" fill="#232838"/>
            <polygon class="lf-eye" points="74,38 88,36 80,44" fill="#ffb347"/>
        </svg>`;
        document.body.appendChild(peek);
        const show = () => { peek.classList.add('up'); clearTimeout(peek._t); peek._t = setTimeout(() => peek.classList.remove('up'), 2600); };
        setTimeout(show, 1500);
        setInterval(show, 22000);
        addEventListener('pointermove', e => {
            if (e.clientX < 160 && e.clientY > innerHeight - 140) show();
        }, { passive: true });
    }

    function start() {
        if (window.FORGE) return build();
        const s = document.createElement('script');
        s.src = base + 'manifest.js';
        s.onload = build;
        document.head.appendChild(s);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
