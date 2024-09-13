// File: simulation.js

const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');

let entities = [];
let animationId;
let matchDuration = 10; // Default duration
let matchStartTime;

// Load images
const images = {
    'rock': new Image(),
    'paper': new Image(),
    'scissors': new Image()
};

images.rock.src = 'images/rock.svg';
images.paper.src = 'images/paper.svg';
images.scissors.src = 'images/scissors.svg';

// Ensure images are loaded before starting simulation
let imagesLoaded = 0;
for (let key in images) {
    images[key].onload = () => {
        imagesLoaded++;
        if (imagesLoaded === 3) {
            // Images are loaded, wait for user to click 'Start'
        }
    };
}

class Entity {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 'rock', 'paper', or 'scissors'
        this.vx = Math.random() * 2 - 1; // Random velocity
        this.vy = Math.random() * 2 - 1;
        this.radius = 16; // Radius for collision detection
        this.image = images[type];
    }

    updatePosition() {
        this.x += this.vx;
        this.y += this.vy;

        // Bounce off walls
        if (this.x <= this.radius || this.x >= canvas.width - this.radius) {
            this.vx *= -1;
        }
        if (this.y <= this.radius || this.y >= canvas.height - this.radius) {
            this.vy *= -1;
        }
    }

    render(ctx) {
        ctx.drawImage(this.image, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
    }

    updateType(newType) {
        this.type = newType;
        this.image = images[newType];
    }
}

function initEntities() {
    entities = [];

    // Get user input values
    const rockCount = parseInt(document.getElementById('rockCount').value) || 0;
    const paperCount = parseInt(document.getElementById('paperCount').value) || 0;
    const scissorsCount = parseInt(document.getElementById('scissorsCount').value) || 0;

    const totalEntities = rockCount + paperCount + scissorsCount;

    // Ensure there is at least one entity
    if (totalEntities === 0) {
        alert('Please enter at least one entity.');
        return false; // Return false to indicate initialization failed
    }

    // Function to generate entities of a specific type
    function createEntities(count, type) {
        for (let i = 0; i < count; i++) {
            let x = Math.random() * (canvas.width - 32) + 16;
            let y = Math.random() * (canvas.height - 32) + 16;
            entities.push(new Entity(x, y, type));
        }
    }

    createEntities(rockCount, 'rock');
    createEntities(paperCount, 'paper');
    createEntities(scissorsCount, 'scissors');

    return true; // Return true to indicate successful initialization
}

function checkCollisions() {
    for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
            let e1 = entities[i];
            let e2 = entities[j];
            let dx = e1.x - e2.x;
            let dy = e1.y - e2.y;
            let distance = Math.hypot(dx, dy);

            if (distance < e1.radius + e2.radius) {
                resolveInteraction(e1, e2);
            }
        }
    }
}

function resolveInteraction(e1, e2) {
    if (e1.type === e2.type) return; // Same type, no change

    const defeats = {
        'rock': 'scissors',
        'scissors': 'paper',
        'paper': 'rock'
    };

    if (defeats[e1.type] === e2.type) {
        e2.updateType(e1.type); // e1 wins, e2 changes type
    } else {
        e1.updateType(e2.type); // e2 wins, e1 changes type
    }
}
document.getElementById('landingPage').style.opacity = '0';
setTimeout(() => {
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('simulationContainer').style.display = 'flex';
    document.getElementById('simulationContainer').style.opacity = '1';
}, 500);


function animate() {
    // Draw a subtle grid background on the canvas
    drawBackground();

    entities.forEach(entity => {
        entity.updatePosition();
        entity.render(ctx);
    });

    checkCollisions();
    updateStats();

    // Check if match duration has been reached
    const elapsedTime = (Date.now() - matchStartTime) / 1000;
    if (elapsedTime >= matchDuration) {
        endMatch();
    } else {
        animationId = requestAnimationFrame(animate);
    }
}
function drawBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Optional: draw a grid
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;

    const gridSize = 50;
    for (let x = gridSize; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = gridSize; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}


function updateStats() {
    let counts = { 'rock': 0, 'paper': 0, 'scissors': 0 };
    entities.forEach(entity => {
        counts[entity.type]++;
    });

    let total = entities.length;
    let statsDiv = document.getElementById('stats');
    statsDiv.innerHTML = `
        Rocks: ${counts.rock} (${((counts.rock / total) * 100).toFixed(1)}%)<br>
        Papers: ${counts.paper} (${((counts.paper / total) * 100).toFixed(1)}%)<br>
        Scissors: ${counts.scissors} (${((counts.scissors / total) * 100).toFixed(1)}%)
    `;
}

function declareWinner() {
    let counts = { 'rock': 0, 'paper': 0, 'scissors': 0 };
    entities.forEach(entity => {
        counts[entity.type]++;
    });

    // Convert counts to an array and sort by counts in descending order
    let results = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    let winnerDiv = document.getElementById('winner');
    winnerDiv.innerHTML = `
        Winner: ${capitalize(results[0][0])} (${results[0][1]} entities)<br>
        Runner-up: ${capitalize(results[1][0])} (${results[1][1]} entities)<br>
        Third Place: ${capitalize(results[2][0])} (${results[2][1]} entities)
    `;
}

function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

function endMatch() {
    cancelAnimationFrame(animationId);
    animationId = null;
    declareWinner();
}

function resetMatch() {
    cancelAnimationFrame(animationId);
    animationId = null;
    document.getElementById('winner').innerHTML = '';
    initEntities(); // Reset entities based on current input values
    updateStats();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Controls
document.getElementById('startBtn').addEventListener('click', () => {
    if (!animationId && imagesLoaded === 3) {
        if (initEntities()) { // Initialize entities based on user input
            // Get match duration
            matchDuration = parseInt(document.getElementById('matchDuration').value) || 10;
            if (matchDuration <= 0) {
                alert('Please enter a valid match duration.');
                return;
            }

            document.getElementById('winner').innerHTML = ''; // Clear previous winner
            updateStats();
            matchStartTime = Date.now();
            animate();
        }
    }
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
        declareWinner();
    }
});

document.getElementById('resetBtn').addEventListener('click', () => {
    resetMatch();
});
