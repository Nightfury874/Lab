// The forge's single source of truth. The homepage, the lab frame and the README all read from this list.
// Adding an experiment = one entry here (+ a preview in previews.js if you want a live miniature).
window.FORGE = {
    repo: 'https://github.com/Nightfury874/Lab/tree/main/',

    // Breathing rhythm shared by Nightfury and the Mindful Breathing miniature (seconds).
    breath: { inhale: 4, exhale: 4 },

    experiments: [
        {
            id: 'reactor',
            name: 'RBMK Reactor',
            hook: 'Run a Chernobyl-type reactor — then live through 01:23:40 on 26 April 1986.',
            path: 'nuclear.html',
            kind: 'Simulation',
            added: '2025-02-10',
            notes: {
                idea: 'A side-on slice through an RBMK-1000 core: graphite, boiling water channels, boron rods with graphite displacers, xenon and a hot graphite stack. The positive void coefficient, the xenon pit and the graphite-tip effect of AZ-5 are not scripted — they come out of the physics.',
                equation: '−∇·Dg∇φg + Σr,g φg = (1/k) χg Σ νΣf φ + Σ scatter-in',
                how: 'Two-group neutron diffusion is solved on the grid every frame for the flux shape and k-effective. Point kinetics with delayed neutrons carries the power level, a channel-by-channel boiling model feeds voids and fuel temperature back in, and Monte Carlo neutrons fly through the same materials so you can watch them.'
            }
        },
        {
            id: 'pendulum',
            name: 'Double Pendulum',
            hook: 'Two hinges, one equation, zero predictability.',
            path: 'Pendulum/index.html',
            kind: 'Simulation',
            added: '2025-01-28',
            notes: {
                idea: 'The textbook example of chaos: nudge the start angle by a hair and the paths diverge completely within seconds.',
                equation: 'θ̈₁, θ̈₂ from the Lagrangian L = T − V',
                how: 'The equations of motion are integrated with fourth-order Runge–Kutta (RK4) so energy drifts slowly enough to watch the chaos rather than the numerical error.'
            }
        },
        {
            id: 'json',
            name: 'JSON Ledger',
            hook: 'View, edit, beautify and diff JSON without leaving the forge.',
            path: 'JSONViewer/index.html',
            kind: 'Tool',
            added: '2024-09-15',
            notes: {
                idea: 'A fast, no-nonsense JSON viewer and editor with a side-by-side diff checker.',
                equation: 'diff(a, b) via diff-match-patch',
                how: 'CodeMirror for editing, a collapsible tree for viewing, and the merge addon for comparing two documents.'
            }
        },
        {
            id: 'windtunnel',
            name: 'Wind Tunnel',
            hook: 'Draw any shape and watch the smoke wrap around it.',
            path: 'WindTunnel/index.html',
            kind: 'Simulation',
            added: '2024-09-13',
            notes: {
                idea: 'An incompressible Euler fluid on a staggered grid. The same solver drives the smoke on the forge homepage.',
                equation: '∇ · u = 0',
                how: 'Each step: Gauss–Seidel pressure projection with over-relaxation (ω = 1.9), then semi-Lagrangian advection of velocity and smoke.'
            }
        },
        {
            id: 'rps',
            name: 'Rock Paper Scissors Lizard Spock',
            hook: 'Five clans, ten rules, one survivor.',
            path: 'RockPaperScissor/index.html',
            kind: 'Simulation',
            added: '2024-09-13',
            notes: {
                idea: 'An agent-based battle: every piece hunts what it beats and flees what beats it. Whoever touches converts.',
                equation: 'each clan beats 2 and loses to 2',
                how: 'Steering towards prey and away from predators, pairwise contact checks, conversion on collision.'
            }
        },
        {
            id: 'collision',
            name: 'Crucible',
            hook: 'Hot ingots tumbling, colliding and cooling in a crucible.',
            path: 'Collision/index.html',
            kind: 'Simulation',
            added: '2024-01-15',
            notes: {
                idea: 'Rigid circles under gravity with impulse-based collision response and a tunable coefficient of restitution.',
                equation: 'j = −(1 + e) (v_rel · n) / (1/m₁ + 1/m₂)',
                how: 'Collisions are resolved with impulses along the contact normal, then overlapping bodies are pushed apart in proportion to their inverse mass.'
            }
        }
    ],

    // Smaller things that live in their own repos. They stay separate sites.
    trinkets: [
        { id: 'queens', name: 'Queens Replay', hook: 'Replay LinkedIn’s Queens puzzles.', url: 'https://nightfury874.github.io/QueensByLinkedinReplay/' },
        { id: 'breathing', name: 'Mindful Breathing', hook: 'Breathe with the forge.', url: 'https://nightfury874.github.io/MindfulBreathing/' },
        { id: 'dictionary', name: 'Dictionary Lol', hook: 'Words, but fun.', url: 'https://nightfury874.github.io/DictionaryLol/' },
        { id: 'bookmarks', name: 'Edge Bookmark', hook: 'A better bookmarks experience.', url: 'https://nightfury874.github.io/EdgeBookmark/' },
        { id: 'sticky', name: 'Web Sticky Note', hook: 'Sticky notes on any web page.', url: 'https://nightfury874.github.io/WebStickyNote/' },
        { id: 'cloc', name: 'CLOC Badge', hook: 'A GitHub Action that badges your lines of code.', url: 'https://github.com/marketplace/actions/generate-cloc-badge' }
    ],

    // The smith's path. Short on purpose.
    ingots: [
        { stamp: 'NIT', name: 'NIT Silchar', line: 'Studied Computer Science.' },
        { stamp: 'AJ', name: 'AgriJod', line: 'Co-founded an agritech company and built its products.' },
        { stamp: 'AI', name: 'AI · SaaS · Enterprise', line: 'Built and scaled AI, SaaS and enterprise software.' },
        { stamp: 'PM', name: 'ABA Healthtech', line: 'Product Manager at a healthtech company in ABA care.' }
    ],

    links: [
        { name: 'LinkedIn', url: 'https://www.linkedin.com/in/nihar874/', icon: 'icons/linkedin.svg' },
        { name: 'X', url: 'https://x.com/NiharBasisth', icon: 'icons/twitter.svg' },
        { name: 'GitHub', url: 'https://github.com/Nightfury874', icon: 'icons/github.svg' }
    ],

    // Failed or unfinished experiments shown honestly in the vault. Add entries as { name, line }.
    scrap: []
};
