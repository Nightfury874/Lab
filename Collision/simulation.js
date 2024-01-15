document.addEventListener("DOMContentLoaded", function() {
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
    const balls = [];
    const numBalls = 10;
    const elasticity = 0.5;
    const ballRadius = 10;

    class Ball {
        constructor(x, y, vx, vy) {
            this.x = x;
            this.y = y;
            this.vx = vx;
            this.vy = vy;
            this.radius = ballRadius;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
            ctx.fillStyle = 'blue';
            ctx.fill();
            ctx.closePath();
        }

        update() {
            this.x
            this.x += this.vx;
            this.y += this.vy;

            // Wall collision logic
            if (this.x - this.radius < 0 || this.x + this.radius > canvas.width) {
                this.vx *= -elasticity;
                this.x = this.x - this.radius < 0 ? this.radius : canvas.width - this.radius;
            }
            if (this.y - this.radius < 0 || this.y + this.radius > canvas.height) {
                this.vy *= -elasticity;
                this.y = this.y - this.radius < 0 ? this.radius : canvas.height - this.radius;
            }

            // Check for collisions with other balls
            for (let other of balls) {
                if (other !== this && isColliding(this, other)) {
                    resolveCollision(this, other);
                }
            }
        }
    }

    function isColliding(ball1, ball2) {
        let dx = ball2.x - ball1.x;
        let dy = ball2.y - ball1.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        return distance < ball1.radius + ball2.radius;
    }

    function resolveCollision(ball1, ball2) {
        // Basic elastic collision physics
        // For simplicity, assuming equal mass and perfectly elastic collision
        let vxTotal = ball1.vx - ball2.vx;
        ball1.vx = ((ball1.vx + ball2.vx) - vxTotal) * elasticity;
        ball2.vx = vxTotal + ball1.vx;

        let vyTotal = ball1.vy - ball2.vy;
        ball1.vy = ((ball1.vy + ball2.vy) - vyTotal) * elasticity;
        ball2.vy = vyTotal + ball1.vy;

        // Adjust positions to prevent overlap
        let overlap = (ball1.radius + ball2.radius) - Math.sqrt((ball2.x - ball1.x) ** 2 + (ball2.y - ball1.y) ** 2);
        ball1.x -= overlap / 2;
        ball1.y -= overlap / 2;
        ball2.x += overlap / 2;
        ball2.y += overlap / 2;
    }

    // Initialize balls
    for (let i = 0; i < numBalls; i++) {
        let x = Math.random() * (canvas.width - ballRadius * 2) + ballRadius;
        let y = Math.random() * (canvas.height - ballRadius * 2) + ballRadius;
        let vx = (Math.random() - 0.5) * 4;
        let vy = (Math.random() - 0.5) * 4;
        balls.push(new Ball(x, y, vx, vy));
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let ball of balls) {
            ball.update();
            ball.draw();
        }

        requestAnimationFrame(animate);
    }

    animate();
});
