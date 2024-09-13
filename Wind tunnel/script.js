var canvas = document.getElementById("myCanvas");
var c = canvas.getContext("2d");   
canvas.width = window.innerWidth - 20;
canvas.height = window.innerHeight - 100;

canvas.focus();

var simHeight = 1.1; 
var cScale = canvas.height / simHeight;
var simWidth = canvas.width / cScale;

var U_FIELD = 0;
var V_FIELD = 1;
var S_FIELD = 2;

var cnt = 0;

function cX(x) {
    return x * cScale;
}

function cY(y) {
    return canvas.height - y * cScale;
}

// ----------------- start of simulator ------------------------------

class Fluid {
    constructor(density, numX, numY, h) {
        this.density = density;
        this.numX = numX + 2; 
        this.numY = numY + 2;
        this.numCells = this.numX * this.numY;
        this.h = h;
        this.u = new Float32Array(this.numCells);
        this.v = new Float32Array(this.numCells);
        this.newU = new Float32Array(this.numCells);
        this.newV = new Float32Array(this.numCells);
        this.p = new Float32Array(this.numCells);
        this.s = new Float32Array(this.numCells);
        this.m = new Float32Array(this.numCells);
        this.newM = new Float32Array(this.numCells);
        this.m.fill(1.0)
        var num = numX * numY;
    }

    integrate(dt, gravity) {
        var n = this.numY;
        for (var i = 1; i < this.numX; i++) {
            for (var j = 1; j < this.numY-1; j++) {
                if (this.s[i*n + j] != 0.0 && this.s[i*n + j-1] != 0.0)
                    this.v[i*n + j] += gravity * dt;
            }    
        }
    }

    solveIncompressibility(numIters, dt) {

        var n = this.numY;
        var cp = this.density * this.h / dt;

        for (var iter = 0; iter < numIters; iter++) {

            for (var i = 1; i < this.numX-1; i++) {
                for (var j = 1; j < this.numY-1; j++) {

                    if (this.s[i*n + j] == 0.0)
                        continue;

                    var s = this.s[i*n + j];
                    var sx0 = this.s[(i-1)*n + j];
                    var sx1 = this.s[(i+1)*n + j];
                    var sy0 = this.s[i*n + j-1];
                    var sy1 = this.s[i*n + j+1];
                    var s = sx0 + sx1 + sy0 + sy1;
                    if (s == 0.0)
                        continue;

                    var div = this.u[(i+1)*n + j] - this.u[i*n + j] + 
                        this.v[i*n + j+1] - this.v[i*n + j];

                    var p = -div / s;
                    p *= scene.overRelaxation;
                    this.p[i*n + j] += cp * p;

                    this.u[i*n + j] -= sx0 * p;
                    this.u[(i+1)*n + j] += sx1 * p;
                    this.v[i*n + j] -= sy0 * p;
                    this.v[i*n + j+1] += sy1 * p;
                }
            }
        }
    }

    extrapolate() {
        var n = this.numY;
        for (var i = 0; i < this.numX; i++) {
            this.u[i*n + 0] = this.u[i*n + 1];
            this.u[i*n + this.numY-1] = this.u[i*n + this.numY-2]; 
        }
        for (var j = 0; j < this.numY; j++) {
            this.v[0*n + j] = this.v[1*n + j];
            this.v[(this.numX-1)*n + j] = this.v[(this.numX-2)*n + j] 
        }
    }

    sampleField(x, y, field) {
        var n = this.numY;
        var h = this.h;
        var h1 = 1.0 / h;
        var h2 = 0.5 * h;

        x = Math.max(Math.min(x, this.numX * h), h);
        y = Math.max(Math.min(y, this.numY * h), h);

        var dx = 0.0;
        var dy = 0.0;

        var f;

        switch (field) {
            case U_FIELD: f = this.u; dy = h2; break;
            case V_FIELD: f = this.v; dx = h2; break;
            case S_FIELD: f = this.m; dx = h2; dy = h2; break

        }

        var x0 = Math.min(Math.floor((x-dx)*h1), this.numX-1);
        var tx = ((x-dx) - x0*h) * h1;
        var x1 = Math.min(x0 + 1, this.numX-1);
        
        var y0 = Math.min(Math.floor((y-dy)*h1), this.numY-1);
        var ty = ((y-dy) - y0*h) * h1;
        var y1 = Math.min(y0 + 1, this.numY-1);

        var sx = 1.0 - tx;
        var sy = 1.0 - ty;

        var val = sx*sy * f[x0*n + y0] +
            tx*sy * f[x1*n + y0] +
            tx*ty * f[x1*n + y1] +
            sx*ty * f[x0*n + y1];
        
        return val;
    }

    avgU(i, j) {
        var n = this.numY;
        var u = (this.u[i*n + j-1] + this.u[i*n + j] +
            this.u[(i+1)*n + j-1] + this.u[(i+1)*n + j]) * 0.25;
        return u;
                
    }

    avgV(i, j) {
        var n = this.numY;
        var v = (this.v[(i-1)*n + j] + this.v[i*n + j] +
            this.v[(i-1)*n + j+1] + this.v[i*n + j+1]) * 0.25;
        return v;
    }

    advectVel(dt) {

        this.newU.set(this.u);
        this.newV.set(this.v);

        var n = this.numY;
        var h = this.h;
        var h2 = 0.5 * h;

        for (var i = 1; i < this.numX; i++) {
            for (var j = 1; j < this.numY; j++) {

                cnt++;

                // u component
                if (this.s[i*n + j] != 0.0 && this.s[(i-1)*n + j] != 0.0 && j < this.numY - 1) {
                    var x = i*h;
                    var y = j*h + h2;
                    var u = this.u[i*n + j];
                    var v = this.avgV(i, j);
    //                  var v = this.sampleField(x,y, V_FIELD);
                    x = x - dt*u;
                    y = y - dt*v;
                    u = this.sampleField(x,y, U_FIELD);
                    this.newU[i*n + j] = u;
                }
                // v component
                if (this.s[i*n + j] != 0.0 && this.s[i*n + j-1] != 0.0 && i < this.numX - 1) {
                    var x = i*h + h2;
                    var y = j*h;
                    var u = this.avgU(i, j);
    //                  var u = this.sampleField(x,y, U_FIELD);
                    var v = this.v[i*n + j];
                    x = x - dt*u;
                    y = y - dt*v;
                    v = this.sampleField(x,y, V_FIELD);
                    this.newV[i*n + j] = v;
                }
            }    
        }

        this.u.set(this.newU);
        this.v.set(this.newV);
    }

    advectSmoke(dt) {

        this.newM.set(this.m);

        var n = this.numY;
        var h = this.h;
        var h2 = 0.5 * h;

        for (var i = 1; i < this.numX-1; i++) {
            for (var j = 1; j < this.numY-1; j++) {

                if (this.s[i*n + j] != 0.0) {
                    var u = (this.u[i*n + j] + this.u[(i+1)*n + j]) * 0.5;
                    var v = (this.v[i*n + j] + this.v[i*n + j+1]) * 0.5;
                    var x = i*h + h2 - dt*u;
                    var y = j*h + h2 - dt*v;

                    this.newM[i*n + j] = this.sampleField(x,y, S_FIELD);
                    }
            }    
        }
        this.m.set(this.newM);
    }

    // ----------------- end of simulator ------------------------------


    simulate(dt, gravity, numIters) {

        this.integrate(dt, gravity);

        this.p.fill(0.0);
        this.solveIncompressibility(numIters, dt);

        this.extrapolate();
        this.advectVel(dt);
        this.advectSmoke(dt);
    }
}

var scene = 
{
    gravity : -9.81,
    dt : 1.0 / 120.0,
    numIters : 100,
    frameNr : 0,
    overRelaxation : 1.9,
    obstacleX : 0.0,
    obstacleY : 0.0,
    obstacleRadius: 0.15, // Default obstacle size
    obstacleShape: 'circle',
    paused: false,
    sceneNr: 0,
    showObstacle: true,
    showStreamlines: false,
    showVelocities: false,   
    showPressure: false,
    showSmoke: true,
    fluid: null,
    customObstacleData: null, // New property to hold custom obstacle data
    customObstacleScale: 1.0  // Scale factor for the custom obstacle
};

function setupScene(sceneNr = 0) 
{
    scene.sceneNr = sceneNr;
    scene.obstacleRadius = 0.15;
    scene.overRelaxation = 1.9;

    scene.dt = 1.0 / 60.0;
    scene.numIters = 40;

    var res = 100;
    
    if (sceneNr == 0)
        res = 50;
    else if (sceneNr == 3)
        res = 200;

    var domainHeight = 1.0;
    var domainWidth = domainHeight / simHeight * simWidth;
    var h = domainHeight / res;

    var numX = Math.floor(domainWidth / h);
    var numY = Math.floor(domainHeight / h);

    var density = 1000.0;

    var f = scene.fluid = new Fluid(density, numX, numY, h);

    var n = f.numY;

    if (sceneNr == 0) {          // tank

        for (var i = 0; i < f.numX; i++) {
            for (var j = 0; j < f.numY; j++) {
                var s = 1.0;    // fluid
                if (i == 0 || i == f.numX-1 || j == 0)
                    s = 0.0;    // solid
                f.s[i*n + j] = s
            }
        }
        scene.gravity = -9.81;
        scene.showPressure = true;
        scene.showSmoke = false;
        scene.showStreamlines = false;
        scene.showVelocities = false;
    }
    else if (sceneNr == 1 || sceneNr == 3) { // vortex shedding

        var inVel = 2.0;
        for (var i = 0; i < f.numX; i++) {
            for (var j = 0; j < f.numY; j++) {
                var s = 1.0;    // fluid
                if (i == 0 || j == 0 || j == f.numY-1)
                    s = 0.0;    // solid
                f.s[i*n + j] = s

                if (i == 1) {
                    f.u[i*n + j] = inVel;
                }
            }
        }

        var pipeH = 0.1 * f.numY;
        var minJ = Math.floor(0.5 * f.numY - 0.5*pipeH);
        var maxJ = Math.floor(0.5 * f.numY + 0.5*pipeH);

        for (var j = minJ; j < maxJ; j++)
            f.m[j] = 0.0;

        setObstacle(0.4, 0.5, true)

        scene.gravity = 0.0;
        scene.showPressure = false;
        scene.showSmoke = true;
        scene.showStreamlines = false;
        scene.showVelocities = false;

        if (sceneNr == 3) {
            scene.dt = 1.0 / 120.0;
            scene.numIters = 100;
            scene.showPressure = true;
        }

    }
    else if (sceneNr == 2) { // paint

        scene.gravity = 0.0;
        scene.overRelaxation = 1.0;
        scene.showPressure = false;
        scene.showSmoke = true;
        scene.showStreamlines = false;
        scene.showVelocities = false;
        scene.obstacleRadius = 0.1;
    }

    document.getElementById("streamButton").checked = scene.showStreamlines;
    document.getElementById("velocityButton").checked = scene.showVelocities;
    document.getElementById("pressureButton").checked = scene.showPressure;
    document.getElementById("smokeButton").checked = scene.showSmoke;
    document.getElementById("overrelaxButton").checked = scene.overRelaxation > 1.0;

    // Set obstacle shape to 'circle' by default
    scene.obstacleShape = 'circle';
    // Update the obstacle shape radio buttons
    var obstacleShapeRadios = document.getElementsByName('obstacleShape');
    for (var i = 0; i < obstacleShapeRadios.length; i++) {
        if (obstacleShapeRadios[i].value == scene.obstacleShape) {
            obstacleShapeRadios[i].checked = true;
        }
    }

    // Hide the SVG upload button by default
    document.getElementById('uploadButton').style.display = 'none';
    document.getElementById('svgUpload').style.display = 'none';
}

// draw -------------------------------------------------------

function setColor(r,g,b) {
    c.fillStyle = `rgb(
        ${Math.floor(255*r)},
        ${Math.floor(255*g)},
        ${Math.floor(255*b)})`
    c.strokeStyle = `rgb(
        ${Math.floor(255*r)},
        ${Math.floor(255*g)},
        ${Math.floor(255*b)})`
}

function getSciColor(val, minVal, maxVal) {
    val = Math.min(Math.max(val, minVal), maxVal- 0.0001);
    var d = maxVal - minVal;
    val = d == 0.0 ? 0.5 : (val - minVal) / d;
    var m = 0.25;
    var num = Math.floor(val / m);
    var s = (val - num * m) / m;
    var r, g, b;

    switch (num) {
        case 0 : r = 0.0; g = s; b = 1.0; break;
        case 1 : r = 0.0; g = 1.0; b = 1.0-s; break;
        case 2 : r = s; g = 1.0; b = 0.0; break;
        case 3 : r = 1.0; g = 1.0 - s; b = 0.0; break;
    }

    return[255*r,255*g,255*b, 255]
}

function draw() 
{
    c.clearRect(0, 0, canvas.width, canvas.height);

    c.fillStyle = "#FF0000";
    var f = scene.fluid;
    var n = f.numY;

    var cellScale = 1.1;

    var h = f.h;

    var minP = f.p[0];
    var maxP = f.p[0];

    for (var i = 0; i < f.numCells; i++) {
        minP = Math.min(minP, f.p[i]);
        maxP = Math.max(maxP, f.p[i]);
    }

    var id = c.getImageData(0,0, canvas.width, canvas.height)

    var color = [255, 255, 255, 255]

    for (var i = 0; i < f.numX; i++) {
        for (var j = 0; j < f.numY; j++) {

            if (scene.showPressure) {
                var p = f.p[i*n + j];
                var s = f.m[i*n + j];
                color = getSciColor(p, minP, maxP);
                if (scene.showSmoke) {
                    color[0] = Math.max(0.0, color[0] - 255*s);
                    color[1] = Math.max(0.0, color[1] - 255*s);
                    color[2] = Math.max(0.0, color[2] - 255*s);
                }
            }
            else if (scene.showSmoke) {
                var s = f.m[i*n + j];
                color[0] = 255*s;
                color[1] = 255*s;
                color[2] = 255*s;
                if (scene.sceneNr == 2)
                    color = getSciColor(s, 0.0, 1.0);
            }
            else if (f.s[i*n + j] == 0.0) {
                color[0] = 0;
                color[1] = 0;
                color[2] = 0;
            }

            var x = Math.floor(cX(i * h));
            var y = Math.floor(cY((j+1) * h));
            var cx = Math.floor(cScale * cellScale * h) + 1;
            var cy = Math.floor(cScale * cellScale * h) + 1;

            var r = color[0];
            var g = color[1];
            var b = color[2];

            for (var yi = y; yi < y + cy; yi++) {
                var p = 4 * (yi * canvas.width + x)

                for (var xi = 0; xi < cx; xi++) {
                    id.data[p++] = r;
                    id.data[p++] = g;
                    id.data[p++] = b;
                    id.data[p++] = 255;
                }
            }
        }
    }

    c.putImageData(id, 0, 0);

    if (scene.showVelocities) {

        c.strokeStyle = "#000000";  
        var scale = 0.02;   

        for (var i = 0; i < f.numX; i++) {
            for (var j = 0; j < f.numY; j++) {

                var u = f.u[i*n + j];
                var v = f.v[i*n + j];

                c.beginPath();

                var x0 = cX(i * h);
                var x1 = cX(i * h + u * scale);
                var y = cY((j + 0.5) * h );

                c.moveTo(x0, y);
                c.lineTo(x1, y);
                c.stroke();

                var x = cX((i + 0.5) * h);
                var y0 = cY(j * h );
                var y1 = cY(j * h + v * scale)

                c.beginPath();
                c.moveTo(x, y0);
                c.lineTo(x, y1);
                c.stroke();

            }
        }
    }

    if (scene.showStreamlines) {

        var segLen = f.h * 0.2;
        var numSegs = 15;

        c.strokeStyle = "#000000";

        for (var i = 1; i < f.numX - 1; i += 5) {
            for (var j = 1; j < f.numY - 1; j += 5) {

                var x = (i + 0.5) * f.h;
                var y = (j + 0.5) * f.h;

                c.beginPath();
                c.moveTo(cX(x), cY(y));

                for (var n = 0; n < numSegs; n++) {
                    var u = f.sampleField(x, y, U_FIELD);
                    var v = f.sampleField(x, y, V_FIELD);
                    var l = Math.sqrt(u*u + v*v);
                    // x += u/l * segLen;
                    // y += v/l * segLen;
                    x += u * 0.01;
                    y += v * 0.01;
                    if (x > f.numX * f.h)
                        break;

                    c.lineTo(cX(x), cY(y));
                }
                c.stroke();
            }
        }
    }

    if (scene.showObstacle) {

        var r = scene.obstacleRadius + f.h;
        var x = cX(scene.obstacleX);
        var y = cY(scene.obstacleY);
        var size = cScale * r * 2; // full width/height of the square

        if (scene.showPressure)
            c.fillStyle = "#000000";
        else
            c.fillStyle = "#DDDDDD";

        if (scene.obstacleShape == 'circle') {
            c.beginPath();    
            c.arc(x, y, cScale * r, 0.0, 2.0 * Math.PI); 
            c.closePath();
            c.fill();

            c.lineWidth = 3.0;
            c.strokeStyle = "#000000";
            c.beginPath();    
            c.arc(x, y, cScale * r, 0.0, 2.0 * Math.PI); 
            c.closePath();
            c.stroke();
            c.lineWidth = 1.0;
        }
        else if (scene.obstacleShape == 'square') {
            c.fillRect(x - size / 2, y - size / 2, size, size);

            c.lineWidth = 3.0;
            c.strokeStyle = "#000000";
            c.strokeRect(x - size / 2, y - size / 2, size, size);
            c.lineWidth = 1.0;
        }
        else if (scene.obstacleShape == 'custom' && scene.customObstacleData) {
            // Draw the custom obstacle for visualization
            var obstacleCanvas = document.getElementById('svgCanvas');
            c.drawImage(
                obstacleCanvas,
                x - size / 2,
                y - size / 2,
                size,
                size
            );
        }
    }

    if (scene.showPressure) {
        var s = "pressure: " + minP.toFixed(0) + " - " + maxP.toFixed(0) + " N/m";
        c.fillStyle ="#000000";
        c.font = "16px Arial";
        c.fillText(s, 10, 35);
    }
}

function setObstacle(x, y, reset) {

    var vx = 0.0;
    var vy = 0.0;

    if (!reset) {
        vx = (x - scene.obstacleX) / scene.dt;
        vy = (y - scene.obstacleY) / scene.dt;
    }

    scene.obstacleX = x;
    scene.obstacleY = y;
    var r = scene.obstacleRadius;
    var f = scene.fluid;
    var n = f.numY;
    var cd = Math.sqrt(2) * f.h;

    for (var i = 1; i < f.numX-2; i++) {
        for (var j = 1; j < f.numY-2; j++) {

            f.s[i*n + j] = 1.0;

            var cellCenterX = (i + 0.5) * f.h;
            var cellCenterY = (j + 0.5) * f.h;

            var dx = cellCenterX - x;
            var dy = cellCenterY - y;

            var insideObstacle = false;

            if (scene.obstacleShape == 'circle') {
                if (dx * dx + dy * dy < r * r) {
                    insideObstacle = true;
                }
            } else if (scene.obstacleShape == 'square') {
                if (Math.abs(dx) < r && Math.abs(dy) < r) {
                    insideObstacle = true;
                }
            } else if (scene.obstacleShape == 'custom' && scene.customObstacleData) {
                // Map simulation grid to custom obstacle data
                var obstacleData = scene.customObstacleData;
                var imgWidth = obstacleData.width;
                var imgHeight = obstacleData.height;

                // Scale the obstacle to match the desired size
                var scale = scene.customObstacleScale * scene.obstacleRadius * 2 / f.h;
                var offsetX = x - scene.obstacleRadius;
                var offsetY = y - scene.obstacleRadius;

                var simX = (cellCenterX - offsetX) / (scene.obstacleRadius * 2);
                var simY = (cellCenterY - offsetY) / (scene.obstacleRadius * 2);

                if (simX >= 0 && simX < 1 && simY >= 0 && simY < 1) {
                    var imgX = Math.floor(simX * imgWidth);
                    var imgY = Math.floor(simY * imgHeight);

                    var index = (imgY * imgWidth + imgX) * 4; // 4 components per pixel (RGBA)
                    var alpha = obstacleData.data[index + 3]; // Use alpha channel

                    if (alpha > 128) { // Adjust threshold as needed
                        insideObstacle = true;
                    }
                }
            }

            if (insideObstacle) {
                f.s[i*n + j] = 0.0;
                if (scene.sceneNr == 2) 
                    f.m[i*n + j] = 0.5 + 0.5 * Math.sin(0.1 * scene.frameNr)
                else 
                    f.m[i*n + j] = 1.0;
                f.u[i*n + j] = vx;
                f.u[(i+1)*n + j] = vx;
                f.v[i*n + j] = vy;
                f.v[i*n + j+1] = vy;
            }
        }
    }
    
    scene.showObstacle = true;
}

// interaction -------------------------------------------------------

var mouseDown = false;

function startDrag(x, y) {
    let bounds = canvas.getBoundingClientRect();

    let mx = x - bounds.left - canvas.clientLeft;
    let my = y - bounds.top - canvas.clientTop;
    mouseDown = true;

    x = mx / cScale;
    y = (canvas.height - my) / cScale;

    setObstacle(x,y, true);
}

function drag(x, y) {
    if (mouseDown) {
        let bounds = canvas.getBoundingClientRect();
        let mx = x - bounds.left - canvas.clientLeft;
        let my = y - bounds.top - canvas.clientTop;
        x = mx / cScale;
        y = (canvas.height - my) / cScale;
        setObstacle(x,y, false);
    }
}

function endDrag() {
    mouseDown = false;
}

canvas.addEventListener('mousedown', event => {
    startDrag(event.clientX, event.clientY);
});

canvas.addEventListener('mouseup', event => {
    endDrag();
});

canvas.addEventListener('mousemove', event => {
    drag(event.clientX, event.clientY);
});

canvas.addEventListener('touchstart', event => {
    startDrag(event.touches[0].clientX, event.touches[0].clientY)
});

canvas.addEventListener('touchend', event => {
    endDrag()
});

canvas.addEventListener('touchmove', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    drag(event.touches[0].clientX, event.touches[0].clientY)
}, { passive: false});


document.addEventListener('keydown', event => {
    switch(event.key) {
        case 'p': scene.paused = !scene.paused; break;
        case 'm': scene.paused = false; simulate(); scene.paused = true; break;
    }
});

// Handle obstacle shape selection
var obstacleShapeRadios = document.getElementsByName('obstacleShape');
for (var i = 0; i < obstacleShapeRadios.length; i++) {
    obstacleShapeRadios[i].addEventListener('change', function() {
        if (this.checked) {
            scene.obstacleShape = this.value;
            // Show or hide the SVG upload button
            if (scene.obstacleShape == 'custom') {
                document.getElementById('uploadButton').style.display = 'inline';
                document.getElementById('svgUpload').style.display = 'inline';
            } else {
                document.getElementById('uploadButton').style.display = 'none';
                document.getElementById('svgUpload').style.display = 'none';
                scene.customObstacleData = null;
                // Reinitialize the obstacle
                setObstacle(scene.obstacleX, scene.obstacleY, true);
            }
        }
    });
}

// Handle SVG upload
var svgUploadInput = document.getElementById('svgUpload');
svgUploadInput.addEventListener('change', function(event) {
    var file = event.target.files[0];
    if (file) {
        var reader = new FileReader();
        reader.onload = function(e) {
            var svgData = e.target.result;
            // Create an image from the SVG data
            var img = new Image();
            img.onload = function() {
                // Draw the SVG onto the hidden canvas
                var obstacleCanvas = document.getElementById('svgCanvas');
                var obstacleContext = obstacleCanvas.getContext('2d');

                // Resize the SVG to a standard size matching the obstacle size
                var desiredSize = 100; // Adjust as needed
                obstacleCanvas.width = desiredSize;
                obstacleCanvas.height = desiredSize;

                obstacleContext.clearRect(0, 0, obstacleCanvas.width, obstacleCanvas.height);
                obstacleContext.drawImage(img, 0, 0, desiredSize, desiredSize);
                // Get image data
                scene.customObstacleData = obstacleContext.getImageData(0, 0, obstacleCanvas.width, obstacleCanvas.height);
                scene.customObstacleScale = 1.0; // Reset scale
                // Reinitialize the obstacle
                setObstacle(scene.obstacleX, scene.obstacleY, true);
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        };
        reader.readAsText(file);
    }
});

// main -------------------------------------------------------

function simulate() 
{
    if (!scene.paused)
        scene.fluid.simulate(scene.dt, scene.gravity, scene.numIters)
        scene.frameNr++;
}

function update() {
    simulate();
    draw();
    requestAnimationFrame(update);
}

setupScene(1);
update();