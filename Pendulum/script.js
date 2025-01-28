class DoublePendulum {
    constructor(params) {
        this.m1 = params.m1;
        this.m2 = params.m2;
        this.l1 = params.l1;
        this.l2 = params.l2;
        this.g = params.g;
        
        this.state = [
            params.initialTheta1,
            0,
            params.initialTheta2,
            0
        ];
    }

    derivatives(state) {
        const [θ1, ω1, θ2, ω2] = state;
        const { m1, m2, l1, l2, g } = this;
        
        const cosΔ = Math.cos(θ2 - θ1);
        const sinΔ = Math.sin(θ2 - θ1);
        const denom = (m1 + m2) * l1 - m2 * l1 * cosΔ ** 2;

        const ω1_prime = (
            (m2 * l2 * ω2 ** 2 * sinΔ -
            (m1 + m2) * g * Math.sin(θ1) +
            m2 * g * Math.sin(θ2) * cosΔ) /
            denom
        );

        const ω2_prime = (
            (-l1 * ω1 ** 2 * sinΔ -
            g * Math.sin(θ2) * l2 +
            (m1 + m2) * g * Math.sin(θ1) * cosΔ) /
            (l2 * denom)
        );

        return [ω1, ω1_prime, ω2, ω2_prime];
    }

    update(dt) {
        const k1 = this.derivatives(this.state);
        const k2 = this.derivatives(this.state.map((s, i) => s + k1[i] * dt/2));
        const k3 = this.derivatives(this.state.map((s, i) => s + k2[i] * dt/2));
        const k4 = this.derivatives(this.state.map((s, i) => s + k3[i] * dt));
        
        this.state = this.state.map((s, i) => 
            s + (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]) * dt / 6
        );
    }

    get positions() {
        const θ1 = this.state[0];
        const θ2 = this.state[2];
        
        return {
            x1: this.l1 * Math.sin(θ1),
            y1: this.l1 * Math.cos(θ1),
            x2: this.l1 * Math.sin(θ1) + this.l2 * Math.sin(θ2),
            y2: this.l1 * Math.cos(θ1) + this.l2 * Math.cos(θ2)
        };
    }
}

class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.scale = 100;
        this.trace = [];
    }

    resize() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
    }

    draw(pendulum) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const cx = this.canvas.width/2;
        const cy = this.canvas.height/2;
        const { x1, y1, x2, y2 } = pendulum.positions;

        // Draw pendulum arms
        this.ctx.beginPath();
        this.ctx.moveTo(cx, cy);
        this.ctx.lineTo(cx + x1 * this.scale, cy + y1 * this.scale);
        this.ctx.lineTo(cx + x2 * this.scale, cy + y2 * this.scale);
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Draw masses
        this.drawMass(cx + x1 * this.scale, cy + y1 * this.scale, pendulum.m1);
        this.drawMass(cx + x2 * this.scale, cy + y2 * this.scale, pendulum.m2);

        // Draw trace
        this.trace.push({x: x2, y: y2});
        if(this.trace.length > 200) this.trace.shift();
        
        this.ctx.beginPath();
        this.trace.forEach((pos, i) => {
            const alpha = i/this.trace.length;
            this.ctx.strokeStyle = `rgba(255,0,0,${alpha})`;
            this.ctx.lineTo(cx + pos.x * this.scale, cy + pos.y * this.scale);
        });
        this.ctx.stroke();
    }

    drawMass(x, y, mass) {
        this.ctx.beginPath();
        this.ctx.arc(x, y, Math.sqrt(mass) * 8, 0, Math.PI * 2);
        this.ctx.fillStyle = '#2196F3';
        this.ctx.fill();
        this.ctx.strokeStyle = '#1976D2';
        this.ctx.stroke();
    }
}

class App {
    constructor() {
        this.canvas = document.getElementById('pendulumCanvas');
        this.renderer = new Renderer(this.canvas);
        this.pendulum = null;
        this.lastTime = 0;
        this.dragging = null;
        this.dragOffset = { x: 0, y: 0 };
        this.paused = false;

        this.initControls();
        this.initSimulation();
        this.setupEventListeners();
        this.resize();
        this.animate();

        new ResizeObserver(() => this.resize()).observe(this.canvas);
    }

    initControls() {
        document.getElementById('resetBtn').addEventListener('click', () => {
            this.initSimulation();
        });

        document.getElementById('pauseBtn').addEventListener('click', () => {
            this.paused = !this.paused;
            document.getElementById('pauseBtn').textContent = 
                this.paused ? 'Resume' : 'Pause';
        });

        ['mass1', 'mass2', 'length1', 'length2', 'gravity'].forEach(id => {
            document.getElementById(id).addEventListener('input', () => {
                this.initSimulation();
            });
        });
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
        this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) - this.canvas.width/2;
        const mouseY = (e.clientY - rect.top) - this.canvas.height/2;
        const scale = this.renderer.scale;

        const { x1, y1, x2, y2 } = this.pendulum.positions;
        const dist1 = Math.hypot(mouseX/scale - x1, mouseY/scale - y1);
        const dist2 = Math.hypot(mouseX/scale - x2, mouseY/scale - y2);

        if(dist1 < Math.sqrt(this.pendulum.m1)/2) {
            this.dragging = 'mass1';
        } else if(dist2 < Math.sqrt(this.pendulum.m2)/2) {
            this.dragging = 'mass2';
        }

        if(this.dragging) {
            this.dragOffset = {
                x: mouseX/scale - (this.dragging === 'mass1' ? x1 : x2),
                y: mouseY/scale - (this.dragging === 'mass1' ? y1 : y2)
            };
        }
    }

    handleMouseMove(e) {
        if(!this.dragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) - this.canvas.width/2;
        const mouseY = (e.clientY - rect.top) - this.canvas.height/2;
        const scale = this.renderer.scale;

        const targetX = mouseX/scale - this.dragOffset.x;
        const targetY = mouseY/scale - this.dragOffset.y;

        if(this.dragging === 'mass1') {
            const θ1 = Math.atan2(targetX, targetY);
            this.pendulum.state[0] = θ1;
            this.pendulum.state[1] = 0;
        } else {
            const { x1, y1 } = this.pendulum.positions;
            const relX = targetX - x1;
            const relY = targetY - y1;
            const θ2 = Math.atan2(relX, relY);
            this.pendulum.state[2] = θ2;
            this.pendulum.state[3] = 0;
        }
    }

    handleMouseUp() {
        this.dragging = null;
    }

    initSimulation() {
        this.pendulum = new DoublePendulum({
            m1: parseFloat(document.getElementById('mass1').value),
            m2: parseFloat(document.getElementById('mass2').value),
            l1: parseFloat(document.getElementById('length1').value),
            l2: parseFloat(document.getElementById('length2').value),
            g: parseFloat(document.getElementById('gravity').value),
            initialTheta1: Math.PI/2,
            initialTheta2: Math.PI/2
        });
        this.renderer.trace = [];
    }

    resize() {
        this.renderer.resize();
    }

    animate(timestamp = 0) {
        if(!this.paused) {
            const dt = timestamp - this.lastTime;
            if(dt > 10) {
                if(!this.dragging) {
                    this.pendulum.update(dt/1000);
                }
                this.renderer.draw(this.pendulum);
                this.lastTime = timestamp;
            }
        }
        requestAnimationFrame((ts) => this.animate(ts));
    }
}

window.addEventListener('load', () => new App());