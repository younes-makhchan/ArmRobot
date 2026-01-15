// Initialize Three.js scene
const scene = new THREE.Scene();

// Camera positioned along z-axis, looking towards x-y plane
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 10); // Along z-axis, looking down at XY plane
camera.lookAt(0, 0, 0); // Looking at origin (x-y plane)

// Renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Grid helper (blue grid)
const gridHelper = new THREE.GridHelper(20, 20, 0x0000ff, 0x0000ff);
scene.add(gridHelper);

// Axes helper with colors
const axesHelper = new THREE.AxesHelper(5);
scene.add(axesHelper);

// Red sphere - positioned in XY plane (z=0)
const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 32);
const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
sphere.position.set(4, 4, 0); // Position at x=4, y=4, z=0 (XY plane)
scene.add(sphere);

// --- Physical lengths for IK ---
const L1 = 3.0;
const L2 = 3.0;

// --- Robot Hierarchy (Strictly XY Plane, Z=0) ---
const whiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const lineMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

// Shoulder Joint (at Origin)
const shoulderJoint = new THREE.Group();
scene.add(shoulderJoint);

const arm1Mesh = new THREE.Mesh(new THREE.BoxGeometry(L1, 0.4, 0.1), whiteMaterial);
arm1Mesh.position.x = L1 / 2; // Shift mesh so pivot is at the left edge
shoulderJoint.add(arm1Mesh);

// Elbow Joint (at end of Arm 1)
const elbowJoint = new THREE.Group();
elbowJoint.position.x = L1;
shoulderJoint.add(elbowJoint);

const arm2Mesh = new THREE.Mesh(new THREE.BoxGeometry(L2, 0.3, 0.1), whiteMaterial);
arm2Mesh.position.x = L2 / 2; // Shift mesh so pivot is at the left edge
elbowJoint.add(arm2Mesh);

// --- Connecting Lines (Visual Bones) ---
const line1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, L1), lineMaterial);
line1.rotation.z = Math.PI / 2;
line1.position.x = L1 / 2;
shoulderJoint.add(line1);

const line2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, L2), lineMaterial);
line2.rotation.z = Math.PI / 2;
line2.position.x = L2 / 2;
elbowJoint.add(line2);

// Robot control variables
let baseRotation = 0;
let middleExtension = -3; // Z position of middle section (initial position)
let topExtension = -6; // Z position of top section (initial position)

// Keyboard controls state
const keys = {
    a: false, // Rotate base left
    d: false, // Rotate base right
    w: false, // Middle section up
    s: false, // Middle section down
    q: false, // Top section up
    e: false  // Top section down
};

// Keyboard event listeners
document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (key in keys) {
        keys[key] = true;
        event.preventDefault();
    }
});

document.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (key in keys) {
        keys[key] = false;
        event.preventDefault();
    }
});

// Coordinate display
const coordinateDiv = document.createElement('div');
coordinateDiv.style.position = 'absolute';
coordinateDiv.style.top = '10px';
coordinateDiv.style.left = '10px';
coordinateDiv.style.color = 'white';
coordinateDiv.style.fontFamily = 'Arial, sans-serif';
coordinateDiv.style.fontSize = '16px';
coordinateDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
coordinateDiv.style.padding = '5px';
coordinateDiv.style.borderRadius = '3px';
document.body.appendChild(coordinateDiv);

// Mouse controls - True raycasting for XY plane
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDragging = false;

// Plane for XY space (normal points toward Z, at Z=0)
const planeXY = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const intersectionPoint = new THREE.Vector3();

// Smoothing variables for fluid IK movement
let currentShoulderAngle = 0;
let currentElbowAngle = 0;
let currentBaseRotation = 0;
const smoothing = 0.08; // How "heavy" the robot feels

// Serial Communication Variables
let port;
let writer;
let isSerialConnected = false;
let lastSendTime = 0;
const sendInterval = 50; // milliseconds - don't flood serial buffer

// Serial Connection Functions
async function connectSerial() {
    try {
        // Request a port and open it
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 115200 }); // Match Arduino's Serial.begin(115200)

        // Setup a stream writer to send data
        writer = port.writable.getWriter();

        isSerialConnected = true;
        updateConnectionStatus("Connected - 115200 baud");

        console.log("Serial Connected at 115200 baud!");
    } catch (err) {
        console.error("Serial Connection Failed:", err);
        updateConnectionStatus("Connection Failed");
    }
}

function updateConnectionStatus(status) {
    const statusDiv = document.getElementById('connectionStatus');
    if (statusDiv) {
        statusDiv.textContent = status;
        statusDiv.style.color = status.includes("Connected") ? "#4CAF50" : "#f44336";
    }
}

function prepareRobotData() {
    // Convert Radians to Degrees for servos
    const baseDeg = Math.round(currentBaseRotation * (180 / Math.PI));
    const shoulderDeg = Math.round(currentShoulderAngle * (180 / Math.PI));
    const elbowDeg = Math.round(currentElbowAngle * (180 / Math.PI));

    // Create data packet: "B90,S45,E120\n"
    const data = `B${baseDeg},S${shoulderDeg},E${elbowDeg}\n`;

    return data;
}

function updateAngleDisplay(baseDeg, shoulderDeg, elbowDeg) {
    // Update UI display
    const baseElement = document.getElementById('baseAngle');
    const shoulderElement = document.getElementById('shoulderAngle');
    const elbowElement = document.getElementById('elbowAngle');

    if (baseElement) baseElement.textContent = baseDeg;
    if (shoulderElement) shoulderElement.textContent = shoulderDeg;
    if (elbowElement) elbowElement.textContent = elbowDeg;

    // Console log for debugging
    console.log(`Base: ${baseDeg}°, Shoulder: ${shoulderDeg}°, Elbow: ${elbowDeg}°`);
}

// UI Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const connectButton = document.getElementById('connectButton');
    if (connectButton) {
        connectButton.addEventListener('click', connectSerial);
    }
});

// Mouse event listeners
document.addEventListener('mousedown', onMouseDown);
document.addEventListener('mousemove', onMouseMove);
document.addEventListener('mouseup', onMouseUp);

function onMouseDown(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(sphere);

    if (intersects.length > 0) {
        isDragging = true;
    }
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    if (!isDragging) return;

    const planeXY = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    raycaster.setFromCamera(mouse, camera);

    if (raycaster.ray.intersectPlane(planeXY, intersectionPoint)) {
        sphere.position.x = intersectionPoint.x;
        // RULE: Sphere cannot go below the floor (Y=0)
        sphere.position.y = Math.max(0, intersectionPoint.y);
    }
}

function onMouseUp() {
    isDragging = false;
}

// Animation loop - Smart IK Solver with Base Flip and Elbow-Up Priority
function animate(time) {
    requestAnimationFrame(animate);

    const tx = sphere.position.x - shoulderJoint.position.x;
    const ty = sphere.position.y - shoulderJoint.position.y;
    const dist = Math.sqrt(tx * tx + ty * ty);
    const reach = THREE.MathUtils.clamp(dist, 0.1, L1 + L2 - 0.01);

    // 1. SMART BASE ROTATION
    // This determines if the robot is "facing" left or right
    // We rotate the base 180 degrees (Math.PI) if the target is behind it
    const targetBaseRot = (tx < 0) ? Math.PI : 0;
    currentBaseRotation = THREE.MathUtils.lerp(currentBaseRotation, targetBaseRot, smoothing);
    shoulderJoint.rotation.y = currentBaseRotation;

    // 2. SOLVE IK (Adjusting for the base flip)
    // We take the absolute X value so the triangle math is always calculated as if it's facing right
    const localX = Math.abs(tx);
    const targetAngle = Math.atan2(ty, localX);

    const cosA = (L1 * L1 + reach * reach - L2 * L2) / (2 * L1 * reach);
    const angleA = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));

    const cosB = (L1 * L1 + L2 * L2 - reach * reach) / (2 * L1 * L2);
    const angleB = Math.acos(THREE.MathUtils.clamp(cosB, -1, 1));

    // 3. APPLY SMOOTH ANGLES WITH ELBOW-UP PRIORITY
    // shoulderJoint.rotation.z is the "shoulder"
    // elbowJoint.rotation.z is the "elbow"
    const targetShoulder = targetAngle + angleA;
    const targetElbow = -(Math.PI - angleB); // Negative keeps the elbow UP

    // Smooth transition
    currentShoulderAngle = THREE.MathUtils.lerp(currentShoulderAngle, targetShoulder, smoothing);
    currentElbowAngle = THREE.MathUtils.lerp(currentElbowAngle, targetElbow, smoothing);

    shoulderJoint.rotation.z = currentShoulderAngle;
    elbowJoint.rotation.z = currentElbowAngle;

    // 4. UPDATE UI WITH CURRENT ANGLES (Always visible)
    const baseDeg = Math.round(currentBaseRotation * (180 / Math.PI));
    const shoulderDeg = Math.round(currentShoulderAngle * (180 / Math.PI));
    const elbowDeg = Math.round(currentElbowAngle * (180 / Math.PI));

    updateAngleDisplay(baseDeg, shoulderDeg, elbowDeg);

    // 5. SERIAL COMMUNICATION (Throttled to avoid spam)
    if (time - lastSendTime > sendInterval) {
        const data = prepareRobotData();
        // Send to serial if connected (will implement later)
        lastSendTime = time;
    }

    // Update coordinate display
    coordinateDiv.innerHTML = `
        <b>Smart IK Mode (XY)</b><br>
        Target: ${sphere.position.x.toFixed(2)}, ${sphere.position.y.toFixed(2)}<br>
        Facing: ${(tx < 0) ? 'LEFT' : 'RIGHT'}<br>
        Status: Elbow-Up Priority
    `;

    renderer.render(scene, camera);
}
animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
