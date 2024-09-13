// File: simulation.js

const canvas = document.getElementById('simulationCanvas');
const ctx = canvas.getContext('2d');

let entities = [];
let animationId;
let matchDuration = 10; // Default duration
let matchStartTime;

// Analytics data
let analytics = {
    interactions: {
        'rock': { wins: 0, losses: 0, draws: 0 },
        'paper': { wins: 0, losses: 0, draws: 0 },
        'scissors': { wins: 0, losses: 0, draws: 0 },
        details: [] // Stores individual interaction details
    },
    survivalTimes: [],
    dominanceHistory: []
};


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
        this.birthTime = Date.now();
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
        // Record survival time before changing type
        let survivalTime = (Date.now() - this.birthTime) / 1000;
        analytics.survivalTimes.push({
            type: this.type,
            time: survivalTime
        });

        // Update type and reset birth time
        this.type = newType;
        this.image = images[newType];
        this.birthTime = Date.now();
    }
}

function updateSurvivalTimesDisplay() {
    const survivalData = analytics.survivalTimes;

    let totalTimes = { 'rock': 0, 'paper': 0, 'scissors': 0 };
    let counts = { 'rock': 0, 'paper': 0, 'scissors': 0 };

    survivalData.forEach(record => {
        totalTimes[record.type] += record.time;
        counts[record.type]++;
    });

    let averagesHTML = `
        <table class="analytics-table">
            <tr>
                <th>Entity</th>
                <th>Average Survival Time (s)</th>
            </tr>
            <tr>
                <td>Rock</td>
                <td>${(totalTimes.rock / counts.rock || 0).toFixed(2)}</td>
            </tr>
            <tr>
                <td>Paper</td>
                <td>${(totalTimes.paper / counts.paper || 0).toFixed(2)}</td>
            </tr>
            <tr>
                <td>Scissors</td>
                <td>${(totalTimes.scissors / counts.scissors || 0).toFixed(2)}</td>
            </tr>
        </table>
    `;

    document.getElementById('averageSurvivalTimes').innerHTML = averagesHTML;
}

function drawOutcomeChart() {
    const chartCanvas = document.getElementById('outcomeChart');
    const chartCtx = chartCanvas.getContext('2d');

    // Clear the chart
    chartCtx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);

    // Prepare data
    const data = analytics.interactions.details;
    if (data.length === 0) return;

    // Define chart dimensions
    const width = chartCanvas.width;
    const height = chartCanvas.height;

    // Calculate time intervals
    const startTime = data[0].time;
    const endTime = data[data.length - 1].time;
    const totalDuration = endTime - startTime;

    // Prepare counts over time
    const timeBuckets = [];
    const bucketCount = 50;
    const bucketSize = totalDuration / bucketCount;

    for (let i = 0; i <= bucketCount; i++) {
        timeBuckets.push({
            time: startTime + i * bucketSize,
            rockWins: 0,
            paperWins: 0,
            scissorsWins: 0
        });
    }

    // Populate counts
    data.forEach(interaction => {
        const bucketIndex = Math.floor((interaction.time - startTime) / bucketSize);
        const bucket = timeBuckets[bucketIndex];
        if (interaction.winner === 'rock') {
            bucket.rockWins++;
        } else if (interaction.winner === 'paper') {
            bucket.paperWins++;
        } else if (interaction.winner === 'scissors') {
            bucket.scissorsWins++;
        }
    });

    // Draw the chart
    const maxWins = Math.max(...timeBuckets.map(b => b.rockWins + b.paperWins + b.scissorsWins));

    chartCtx.beginPath();
    chartCtx.moveTo(0, height);

    // Draw rock wins
    chartCtx.strokeStyle = 'gray';
    chartCtx.beginPath();
    timeBuckets.forEach((bucket, index) => {
        const x = (index / bucketCount) * width;
        const y = height - (bucket.rockWins / maxWins) * height;
        if (index === 0) {
            chartCtx.moveTo(x, y);
        } else {
            chartCtx.lineTo(x, y);
        }
    });
    chartCtx.stroke();

    // Draw paper wins
    chartCtx.strokeStyle = 'blue';
    chartCtx.beginPath();
    timeBuckets.forEach((bucket, index) => {
        const x = (index / bucketCount) * width;
        const y = height - (bucket.paperWins / maxWins) * height;
        if (index === 0) {
            chartCtx.moveTo(x, y);
        } else {
            chartCtx.lineTo(x, y);
        }
    });
    chartCtx.stroke();

    // Draw scissors wins
    chartCtx.strokeStyle = 'red';
    chartCtx.beginPath();
    timeBuckets.forEach((bucket, index) => {
        const x = (index / bucketCount) * width;
        const y = height - (bucket.scissorsWins / maxWins) * height;
        if (index === 0) {
            chartCtx.moveTo(x, y);
        } else {
            chartCtx.lineTo(x, y);
        }
    });
    chartCtx.stroke();
}

function updateOutcomeRatiosDisplay() {
    const interactions = analytics.interactions;
    const entities = ['rock', 'paper', 'scissors'];
    let ratiosHTML = `
        <table class="analytics-table">
            <tr>
                <th>Entity</th>
                <th>Win/Loss Ratio</th>
            </tr>
    `;
    entities.forEach(entity => {
        const wins = interactions[entity].wins;
        const losses = interactions[entity].losses;
        const ratio = (losses === 0) ? 'N/A' : (wins / losses).toFixed(2);
        ratiosHTML += `
            <tr>
                <td>${capitalize(entity)}</td>
                <td>${ratio}</td>
            </tr>
        `;
    });
    ratiosHTML += '</table>';

    document.getElementById('outcomeRatios').innerHTML = ratiosHTML;
}


function updateLongestSurvivorDisplay() {
    let longestSurvival = { type: null, time: 0 };

    analytics.survivalTimes.forEach(record => {
        if (record.time > longestSurvival.time) {
            longestSurvival = record;
        }
    });

    let survivorHTML = longestSurvival.type ? `
        Longest Surviving Entity: ${capitalize(longestSurvival.type)} (${longestSurvival.time.toFixed(2)}s)
    ` : 'No survival data yet.';

    document.getElementById('longestSurvivor').innerHTML = survivorHTML;
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
    if (e1.type === e2.type) {
        analytics.interactions[e1.type].draws++;
        analytics.interactions[e2.type].draws++;
        return;
    }; // Same type, no change
    

    const defeats = {
        'rock': 'scissors',
        'scissors': 'paper',
        'paper': 'rock'
    };

    let winner, loser;

    if (defeats[e1.type] === e2.type) {
        e2.updateType(e1.type); // e1 wins
        winner = e1.type;
        loser = e2.type;
    } else {
        e1.updateType(e2.type); // e2 wins
        winner = e2.type;
        loser = e1.type;
    }
    analytics.interactions[winner].wins++;
    analytics.interactions[loser].losses++;

    // Record interaction detail
    analytics.interactions.details.push({
        time: (Date.now() - matchStartTime) / 1000,
        winner: winner,
        loser: loser
    });
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

function updateTotalInteractionsDisplay() {
    const totalInteractions = analytics.interactions.details.length;
    document.getElementById('totalInteractions').innerText = `Total Interactions: ${totalInteractions}`;
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
function updateAnalyticsDisplay() {
    // Total Wins/Losses/Draws
    const totalWLD = analytics.interactions;
    let wldHTML = `
        <table class="analytics-table">
            <tr>
                <th>Entity</th>
                <th>Wins</th>
                <th>Losses</th>
                <th>Draws</th>
            </tr>
            <tr>
                <td>Rock</td>
                <td>${totalWLD.rock.wins}</td>
                <td>${totalWLD.rock.losses}</td>
                <td>${totalWLD.rock.draws}</td>
            </tr>
            <tr>
                <td>Paper</td>
                <td>${totalWLD.paper.wins}</td>
                <td>${totalWLD.paper.losses}</td>
                <td>${totalWLD.paper.draws}</td>
            </tr>
            <tr>
                <td>Scissors</td>
                <td>${totalWLD.scissors.wins}</td>
                <td>${totalWLD.scissors.losses}</td>
                <td>${totalWLD.scissors.draws}</td>
            </tr>
        </table>`
       
        ;
    document.getElementById('totalWinsLossesDraws').innerHTML = wldHTML;
    updateSurvivalTimesDisplay();
    updateLongestSurvivorDisplay();
    updateOutcomeRatiosDisplay();
    drawOutcomeChart();
    updateTotalInteractionsDisplay();

}

document.getElementById('resetAnalyticsBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all analytics data?')) {
        analytics = {
            interactions: {
                'rock': { wins: 0, losses: 0, draws: 0 },
                'paper': { wins: 0, losses: 0, draws: 0 },
                'scissors': { wins: 0, losses: 0, draws: 0 },
                details: []
            },
            survivalTimes: [],
            dominanceHistory: []
        };
        updateAnalyticsDisplay();
    }
});