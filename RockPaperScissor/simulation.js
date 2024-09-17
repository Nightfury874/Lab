// File: simulation.js

const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');

let entities = [];
let animationId = null; // Initialize as null
let matchDuration = 10; // Default duration
let matchStartTime = null;

// Placement variables
let placementCircles = [];
const placementOrder = ['rock', 'paper', 'scissors'];
let currentPlacementIndex = 0;

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
            // Images are loaded, enable start button if needed
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

    if (placementCircles.length === 0) {
        // If no placement circles, fallback to random placement
        return initRandomEntities();
    }

    placementCircles.forEach(circle => {
        for (let i = 0; i < circle.count; i++) {
            let angle = Math.random() * 2 * Math.PI;
            let radius = Math.random() * (circle.radius - 16); // 16 is entity radius
            let x = circle.x + radius * Math.cos(angle);
            let y = circle.y + radius * Math.sin(angle);

            // Ensure entities spawn within canvas bounds
            x = Math.max(16, Math.min(canvas.width - 16, x));
            y = Math.max(16, Math.min(canvas.height - 16, y));

            entities.push(new Entity(x, y, circle.type));
        }
    });

    // After spawning, clear placement circles
    placementCircles = [];
    currentPlacementIndex = 0;

    return true;
}

function initRandomEntities() {
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
    // Iterate backwards to safely remove entities during iteration
    for (let i = entities.length - 1; i >= 0; i--) {
        for (let j = i - 1; j >= 0; j--) {
            let e1 = entities[i];
            let e2 = entities[j];
            let dx = e1.x - e2.x;
            let dy = e1.y - e2.y;
            let distance = Math.hypot(dx, dy);

            if (distance < e1.radius + e2.radius) {
                resolveInteraction(i, j);
            }
        }
    }
}

function resolveInteraction(index1, index2) {
    let e1 = entities[index1];
    let e2 = entities[index2];

    if (e1.type === e2.type) return; // Same type, no change

    const defeats = {
        'rock': 'scissors',
        'scissors': 'paper',
        'paper': 'rock'
    };

    if (defeats[e1.type] === e2.type) {
        // e1 defeats e2; remove e2
        entities.splice(index2, 1);
    } else {
        // e2 defeats e1; remove e1
        entities.splice(index1, 1);
    }
}

// Handle Placement
canvas.addEventListener('click', handleCanvasClick);

function handleCanvasClick(event) {
    if (animationId !== null) return; // Prevent placement during simulation

    // Determine mouse position relative to canvas
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Get current placement type based on order
    if (currentPlacementIndex >= placementOrder.length) {
        alert('All entity types have been placed.');
        return;
    }

    const type = placementOrder[currentPlacementIndex];
    const countInput = document.getElementById(`${type}Count`);
    const count = parseInt(countInput.value) || 0;

    if (count === 0) {
        alert(`Please enter a number for ${capitalize(type)}.`);
        return;
    }

    // Create a placement circle
    const radius = Math.max(20, count); // Ensure minimum size for visibility
    placementCircles.push({ x, y, type, count, radius });

    currentPlacementIndex++;

    // Draw the circle temporarily
    drawPlacementCircles();
}

function animate() {
    // Start the animation loop by requesting the next frame
    animationId = requestAnimationFrame(animate);

    // Draw a subtle grid background on the canvas
    drawBackground();

    // Update and render entities
    entities.forEach(entity => {
        entity.updatePosition();
        entity.render(ctx);
    });

    // Check for collisions and resolve interactions
    checkCollisions();

    // Update statistics
    updateStats();

    // Check if match duration has been reached
    const elapsedTime = (Date.now() - matchStartTime) / 1000;
    if (elapsedTime >= matchDuration) {
        endMatch();
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

    // Draw placement circles if any (only when not animating)
    if (animationId === null && placementCircles.length > 0) {
        drawPlacementCircles();
    }
}

function drawPlacementCircles() {
    placementCircles.forEach(circle => {
        // Draw semi-transparent circle
        ctx.beginPath();
        ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 140, 186, 0.2)';
        ctx.fill();
        ctx.strokeStyle = '#008CBA';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw label
        ctx.fillStyle = '#000';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${capitalize(circle.type)} (${circle.count})`, circle.x, circle.y);
    });
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

    // Determine the winner
    let maxCount = Math.max(counts.rock, counts.paper, counts.scissors);
    let winners = Object.keys(counts).filter(type => counts[type] === maxCount);

    let winnerDiv = document.getElementById('winner');
    if (winners.length === 1) {
        winnerDiv.innerHTML = `Winner: ${capitalize(winners[0])} (${counts[winners[0]]} entities)`;
    } else {
        // Handle tie
        winnerDiv.innerHTML = `It's a tie between: ${winners.map(capitalize).join(', ')} (${maxCount} entities each)`;
    }
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
    placementCircles = [];
    currentPlacementIndex = 0;
    initEntities(); // Reset entities based on current input values or placements
    updateStats();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Controls
document.getElementById('startBtn').addEventListener('click', () => {
    if (animationId !== null) return; // Prevent multiple simulations
    if (imagesLoaded !== 3) {
        alert('Images are still loading. Please wait.');
        return;
    }

    // Get match duration
    matchDuration = parseInt(document.getElementById('matchDuration').value) || 10;
    if (matchDuration <= 0) {
        alert('Please enter a valid match duration.');
        return;
    }

    // Initialize entities based on placement or input
    if (initEntities()) { // Initialize entities based on placement or user input
        document.getElementById('winner').innerHTML = ''; // Clear previous winner
        updateStats();
        matchStartTime = Date.now();
        animate(); // Start the animation loop
    }
});

document.getElementById('pauseBtn').addEventListener('click', () => {
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
        declareWinner();
    }
});

document.getElementById('resetBtn').addEventListener('click', () => {
    resetMatch();
});
