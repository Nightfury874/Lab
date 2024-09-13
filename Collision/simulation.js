document.addEventListener("DOMContentLoaded", function() {
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
    const balls = [];
    const numBalls = 10;
    const elasticity = 0.5;
    const ballRadius = 10;
    const ballMass = 1; // Assuming all balls have the same mass for simplicity

    class Ball {
        constructor(x, y, vx, vy) {
            this.x = x;
            this.y = y;
            this.vx = vx;
            this.vy = vy;
            this.radius = ballRadius;
            this.mass = ballMass;
            this.elasticity = elasticity;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, 2 * Math.PI);
            ctx.fillStyle = 'blue';
            ctx.fill();
            ctx.closePath();
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            // Wall collision logic
            if (this.x - this.radius < 0 || this.x + this.radius > canvas.width) {
                this.vx *= -this.elasticity;
                this.x= this.x - this.radius < 0 ? this.radius : canvas.width - this.radius;
            }
            if (this.y - this.radius < 0 || this.y + this.radius > canvas.height) {
            this.vy *= -this.elasticity;
            this.y = this.y - this.radius < 0 ? this.radius : canvas.height - this.radius;
            }        // Check for collisions with other balls
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
        let dx = ball2.x - ball1.x;
        let dy = ball2.y - ball1.y;
        let collisionAngle = Math.atan2(dy, dx);
    
        let speed1 = Math.sqrt(ball1.vx * ball1.vx + ball1.vy * ball1.vy);
        let speed2 = Math.sqrt(ball2.vx * ball2.vx + ball2.vy * ball2.vy);
        let direction1 = Math.atan2(ball1.vy, ball1.vx);
        let direction2 = Math.atan2(ball2.vy, ball2.vx);
    
        let velocityX1 = speed1 * Math.cos(direction1 - collisionAngle);
        let velocityY1 = speed1 * Math.sin(direction1 - collisionAngle);
        let velocityX2 = speed2 * Math.cos(direction2 - collisionAngle);
        let velocityY2 = speed2 * Math.sin(direction2 - collisionAngle);
    
        let finalVelocityX1 = ((ball1.mass - ball2.mass) * velocityX1 + (2 * ball2.mass) * velocityX2) / (ball1.mass + ball2.mass);
        let finalVelocityX2 = ((2 * ball1.mass) * velocityX1 + (ball2.mass - ball1.mass) * velocityX2) / (ball1.mass + ball2.mass);
    
        ball1.vx = Math.cos(collisionAngle) * finalVelocityX1 + Math.cos(collisionAngle + Math.PI / 2) * velocityY1;
        ball1.vy = Math.sin(collisionAngle) * finalVelocityX1 + Math.sin(collisionAngle + Math.PI / 2) * velocity
        Y1;
        ball2.vx = Math.cos(collisionAngle) * finalVelocityX2 + Math.cos(collisionAngle + Math.PI / 2) * velocityY2;
        ball2.vy = Math.sin(collisionAngle) * finalVelocityX2 + Math.sin(collisionAngle + Math.PI / 2) * velocityY2;    // Apply the elasticity
        ball1.vx *= ball1.elasticity;
        ball1.vy *= ball1.elasticity;
        ball2.vx *= ball2.elasticity;
        ball2.vy *= ball2.elasticity;
    
        // Correct positions to prevent balls from sticking together
        let overlap = 0.5 * (ball1.radius + ball2.radius - Math.sqrt(dx * dx + dy * dy));
        ball1.x -= overlap * (ball1.x - ball2.x) / Math.abs(ball1.x - ball2.x);
        ball2.x += overlap * (ball1.x - ball2.x) / Math.abs(ball1.x - ball2.x);
        ball1.y -= overlap * (ball1.y - ball2.y) / Math.abs(ball1.y - ball2.y);
        ball2.y += overlap * (ball1.y - ball2.y) / Math.abs(ball1.y - ball2.y);
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
