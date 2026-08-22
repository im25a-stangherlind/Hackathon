const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext("2d");

// Game States: "START", "LOBBY_SELECT", "LOBBY_ROOM", "PLAYING"
let gameState = "START";

let localId = "";
let playerList = [];
let remotePlayers = new Map();
let mapDecorations = [];
let isGameWinner = null;

const camera = { x: 0, y: 0 };
const WORLD_SIZE = { width: 2400, height: 1800 };

// Expanded Variant Prop Configs (6 Unique 3D Voxel Assets)
const PROP_TYPES = {
    BOX: { baseColor: "#66421e", lidColor: "#80542a", rimColor: "#3d2610", width: 18, height: 18, type: "box", name: "Tiny Crate", thickness: 12 },
    CANISTER: { baseColor: "#2c3e50", rimColor: "#7f8c8d", topColor: "#1a252f", radius: 8, type: "barrel", name: "Oil Canister", thickness: 16 },
    MINI_BUSH: { baseColor: "#0f3d12", leafColor: "#1b5e20", radius: 12, type: "bush", name: "Mini Shrub", thickness: 8 },
    CONE: { baseColor: "#d35400", rimColor: "#f39c12", topColor: "#e67e22", radius: 7, type: "barrel", name: "Safety Cone", thickness: 14 },
    SAFE: { baseColor: "#34495e", lidColor: "#566573", rimColor: "#1c2833", width: 16, height: 20, type: "safe", name: "Steel Safe", thickness: 18 },
    PIPE: { baseColor: "#7f8c8d", rimColor: "#95a5a6", topColor: "#34495e", radius: 6, type: "barrel", name: "Industrial Pipe", thickness: 24 }
};

const player = {
    x: 0, y: 0, radius: 14, angle: 0, isDisguised: false, disguiseType: null, role: "hunter",
    speed: 2.2,

    // UPDATED: Increased Ammo Limits
    ammo: 10,
    maxAmmo: 10,
    isReloading: false,
    reloadTimer: 0,
    RELOAD_DURATION: 45, // 0.75s bolt-lock duration
    rifleFlashTimer: 0
};

let matchTimeLeft = 18000;
const TOTAL_MATCH_DURATION = 18000;

let usernameInputText = "Hunter_" + Math.floor(Math.random() * 900 + 100);

const mockSocket = {
    readyState: 1,
    send: function(jsonString) {
        const msg = JSON.parse(jsonString);
        if (msg.type === "start_game") simulateStartGame();
        if (msg.type === "hider_caught") simulateHiderCaught(msg.target_id);
    },
    onmessage: null
};

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
resizeCanvas(); window.addEventListener("resize", resizeCanvas);

function generateMapProps() {
    mapDecorations = [];
    const types = Object.values(PROP_TYPES);
    // Crowding 180 total diverse 3D objects over the expanded world grid space
    for (let i = 0; i < 180; i++) {
        mapDecorations.push({
            x: Math.random() * (WORLD_SIZE.width - 150) + 75,
            y: Math.random() * (WORLD_SIZE.height - 150) + 75,
            propInfo: types[Math.floor(Math.random() * types.length)]
        });
    }
}

function connectToSocket(clientId) {
    localId = clientId;
    playerList = [
        { client_id: localId, role: "hunter", is_found: false },
        { client_id: "Bot_Echo", role: "prop", is_found: false },
        { client_id: "Bot_Viper", role: "prop", is_found: false },
        { client_id: "Bot_Stalker", role: "prop", is_found: false }
    ];
    setTimeout(() => { triggerNetworkMessage({ type: "player_list_update", players: playerList }); }, 100);
}

function simulateStartGame() {
    generateMapProps();
    isGameWinner = null;
    matchTimeLeft = TOTAL_MATCH_DURATION;
    player.x = WORLD_SIZE.width / 2; player.y = WORLD_SIZE.height / 2;
    player.role = "hunter"; player.ammo = player.maxAmmo;

    remotePlayers.clear();
    const types = Object.values(PROP_TYPES);

    playerList.forEach(p => {
        if (p.client_id !== localId) {
            remotePlayers.set(p.client_id, {
                client_id: p.client_id,
                x: Math.random() * (WORLD_SIZE.width - 400) + 200,
                y: Math.random() * (WORLD_SIZE.height - 400) + 200,
                angle: Math.random() * Math.PI * 2,
                speed: 0,
                role: "prop", isDisguised: true, is_found: false,
                disguiseType: types[Math.floor(Math.random() * types.length)]
            });
        }
    });
    gameState = "PLAYING"; triggerNetworkMessage({ type: "game_started" });
}

function simulateHiderCaught(targetId) {
    let match = playerList.find(p => p.client_id === targetId);
    if (match && !match.is_found) {
        match.is_found = true;
        if (remotePlayers.has(targetId)) remotePlayers.get(targetId).is_found = true;

        let remainingHiders = playerList.filter(p => p.role === "prop" && !p.is_found).length;
        if (remainingHiders === 0) isGameWinner = "HUNTERS";
    }
}

const keys = {};
window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (gameState === "START" && (key === " " || key === "enter")) { gameState = "LOBBY_SELECT"; return; }
    if (gameState === "LOBBY_SELECT") {
        if (e.key.length === 1) usernameInputText += e.key;
        if (e.key === "Backspace") usernameInputText = usernameInputText.slice(0, -1);
        return;
    }
    keys[key] = true;
});
window.addEventListener("keyup", (e) => keys[e.key.toLowerCase()] = false);

const mouse_position = { x: 0, y: 0 }; let activeButtons = [];
window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse_position.x = e.clientX - rect.left; mouse_position.y = e.clientY - rect.top;
});

window.addEventListener("click", () => {
    for (let btn of activeButtons) {
        if (mouse_position.x >= btn.x && mouse_position.x <= btn.x + btn.w && mouse_position.y >= btn.y && mouse_position.y <= btn.y + btn.h) {
            btn.callback(); return;
        }
    }

    if (gameState !== "PLAYING" || isGameWinner !== null) return;

    if (player.role === "hunter" && !player.isReloading && player.ammo > 0) {
        player.ammo--;
        player.rifleFlashTimer = 6; player.isReloading = true;
        player.reloadTimer = player.RELOAD_DURATION;

        let maxRange = 500;
        let lx = player.x; let ly = player.y;
        let ex = player.x + Math.cos(player.angle) * maxRange; let ey = player.y + Math.sin(player.angle) * maxRange;

        remotePlayers.forEach((bot, botId) => {
            if (bot.is_found) return;
            let A = ex - lx; let B = ey - ly; let lenSq = A * A + B * B;
            let u = Math.max(0, Math.min(1, ((bot.x - lx) * A + (bot.y - ly) * B) / lenSq));
            let dist = Math.hypot(bot.x - (lx + u * A), bot.y - (ly + u * B));

            if (dist < bot.radius + 6) {
                mockSocket.send(JSON.stringify({ type: "hider_caught", target_id: botId }));
            }
        });

        if (player.ammo === 0 && isGameWinner === null) {
            let uncaughtHiders = playerList.filter(p => p.role === "prop" && !p.is_found).length;
            if (uncaughtHiders > 0) isGameWinner = "PROPS (HUNTER OUT OF AMMO)";
        }
    }
});

function update() {
    if (gameState !== "PLAYING" || isGameWinner !== null) return;

    if (player.rifleFlashTimer > 0) player.rifleFlashTimer--;
    if (player.isReloading) {
        player.reloadTimer--; if (player.reloadTimer <= 0) player.isReloading = false;
    }

    matchTimeLeft--;
    if (matchTimeLeft <= 0) {
        matchTimeLeft = 0;
        isGameWinner = "PROPS (TIME EXPIRED)";
    }

    let moveX = 0, moveY = 0;
    if (keys["w"] || keys["arrowup"]) moveY -= 1; if (keys["s"] || keys["arrowdown"]) moveY += 1;
    if (keys["a"] || keys["arrowleft"]) moveX -= 1; if (keys["d"] || keys["arrowright"]) moveX += 1;

    if (moveX !== 0 && moveY !== 0) { moveX *= Math.SQRT1_2; moveY *= Math.SQRT1_2; }

    player.x += moveX * player.speed; player.y += moveY * player.speed;
    player.x = Math.max(player.radius, Math.min(WORLD_SIZE.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(WORLD_SIZE.height - player.radius, player.y));

    camera.x = player.x - (canvas.width / 2) / 1.7; camera.y = player.y - (canvas.height / 2) / 1.7;

    let worldMouseX = (mouse_position.x / 1.7) + camera.x;
    let worldMouseY = (mouse_position.y / 1.7) + camera.y;
    player.angle = Math.atan2(worldMouseY - player.y, worldMouseX - player.x);
}

function drawHighDetail3DProp(x, y, propInfo) {
    ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath();
    ctx.arc(x, y + 1, propInfo.radius || propInfo.width / 1.3, 0, Math.PI * 2); ctx.fill();

    for (let i = 0; i < propInfo.thickness; i++) {
        let drawY = y - i; let isTopLayer = (i === propInfo.thickness - 1);

        if (propInfo.type === "box") {
            ctx.fillStyle = isTopLayer ? propInfo.lidColor : propInfo.baseColor;
            ctx.fillRect(x - propInfo.width / 2, drawY - propInfo.height / 2, propInfo.width, propInfo.height);

            // Render wooden panel reinforcing edges
            if (i < 2 || i > propInfo.thickness - 3 || isTopLayer) {
                ctx.fillStyle = propInfo.rimColor;
                ctx.fillRect(x - propInfo.width / 2, drawY - propInfo.height / 2, propInfo.width, 2);
            }
            // UPDATED: Render structural X-shaped bracing cross struts on the topmost layer
            if (isTopLayer) {
                ctx.strokeStyle = propInfo.rimColor; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x - propInfo.width / 2 + 2, drawY - propInfo.height / 2 + 2);
                ctx.lineTo(x + propInfo.width / 2 - 2, drawY + propInfo.height / 2 - 2);
                ctx.moveTo(x + propInfo.width / 2 - 2, drawY - propInfo.height / 2 + 2);
                ctx.lineTo(x - propInfo.width / 2 + 2, drawY + propInfo.height / 2 - 2);
                ctx.stroke();
            }
        } else if (propInfo.type === "safe") {
            // STEEL SAFE LAYER DRAW: Draws a geometric box with a distinct inner vault door dial wheel
            ctx.fillStyle = isTopLayer ? propInfo.lidColor : propInfo.baseColor;
            ctx.fillRect(x - propInfo.width / 2, drawY - propInfo.height / 2, propInfo.width, propInfo.height);
            if (isTopLayer) {
                ctx.fillStyle = propInfo.rimColor;
                ctx.beginPath(); ctx.arc(x - 2, drawY, 3, 0, Math.PI * 2); ctx.fill(); // Dial knob lock mechanism
                ctx.fillRect(x + 3, drawY - 4, 2, 8); // Safe handle latch line
            }
        } else if (propInfo.type === "barrel") {
            ctx.fillStyle = (i === 4 || i === 10) ? propInfo.rimColor : propInfo.baseColor;
            if (isTopLayer) ctx.fillStyle = propInfo.topColor;
            ctx.beginPath(); ctx.arc(x, drawY, propInfo.radius, 0, Math.PI * 2); ctx.fill();
        } else if (propInfo.type === "bush") {
            ctx.fillStyle = isTopLayer ? propInfo.leafColor : propInfo.baseColor;
            ctx.beginPath(); ctx.arc(x, drawY, propInfo.radius, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore();
}

function drawGame() {
    ctx.save(); ctx.scale(1.7, 1.7);
    ctx.fillStyle = "#1e2226"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = "#252a30";

    let startGridX = Math.floor(camera.x / 60) * 60; let startGridY = Math.floor(camera.y / 60) * 60;
    for (let x = startGridX - 60; x < startGridX + (canvas.width / 1.7) + 60; x += 60) ctx.fillRect(x - camera.x, 0, 1.5, canvas.height);
    for (let y = startGridY - 60; y < startGridY + (canvas.height / 1.7) + 60; y += 60) ctx.fillRect(0, y - camera.y, canvas.width, 1.5);

    // NEW: ADVANTAGE MECHANIC - Laser Sight Guidance Path (Drawn beneath entities)
    if (player.role === "hunter" && !player.isReloading && player.ammo > 0 && isGameWinner === null) {
        ctx.save(); ctx.strokeStyle = "rgba(255, 50, 50, 0.25)"; ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]); // Clean red dotted guidance trajectory line
        ctx.beginPath(); ctx.moveTo(player.x - camera.x, player.y - camera.y);
        ctx.lineTo((player.x + Math.cos(player.angle) * 500) - camera.x, (player.y + Math.sin(player.angle) * 500) - camera.y);
        ctx.stroke(); ctx.restore();
    }

    let renderQueue = [];
    mapDecorations.forEach(p => renderQueue.push({ type: "prop", worldX: p.x, worldY: p.y, propInfo: p.propInfo }));
    renderQueue.push({ type: "player_norm", worldX: player.x, worldY: player.y, angle: player.angle, radius: player.radius });
    remotePlayers.forEach(bot => { if (!bot.is_found) renderQueue.push({ type: "bot_disg", worldX: bot.x, worldY: bot.y, disguiseType: bot.disguiseType }); });

    renderQueue.sort((a, b) => a.worldY - b.worldY);
    renderQueue.forEach(item => {
        let screenX = item.worldX - camera.x; let screenY = item.worldY - camera.y;
        if (screenX < -60 || screenX > (canvas.width / 1.7) + 60 || screenY < -60 || screenY > (canvas.height / 1.7) + 60) return;

        if (item.type === "prop") drawHighDetail3DProp(screenX, screenY, item.propInfo);
        if (item.type === "bot_disg") drawHighDetail3DProp(screenX, screenY, item.disguiseType);
        if (item.type === "player_norm") {
            ctx.save(); ctx.translate(screenX, screenY); ctx.rotate(item.angle);
            ctx.beginPath(); ctx.arc(0, 0, item.radius, 0, Math.PI * 2);
            ctx.fillStyle = "#3498db"; ctx.fill(); ctx.strokeStyle = "#111"; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = "#fff"; ctx.fillRect(4, -3, 5, 2); ctx.fillRect(4, 1, 5, 2);
            ctx.fillStyle = "#555"; ctx.fillRect(2, -1, 24, 2.5); ctx.restore();

            if (player.rifleFlashTimer > 0) {
                ctx.save(); ctx.globalCompositeOperation = "screen";
                ctx.strokeStyle = "rgba(255, 220, 100, 0.9)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(screenX, screenY);
                ctx.lineTo(screenX + Math.cos(item.angle) * 500, screenY + Math.sin(item.angle) * 500); ctx.stroke(); ctx.restore();
            }
            if (player.isReloading) {
                ctx.save(); let barW = 32; let barH = 4; let pct = (player.RELOAD_DURATION - player.reloadTimer) / player.RELOAD_DURATION;
                ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(screenX - barW / 2, screenY + 20, barW, barH);
                ctx.fillStyle = "#ffdd66"; ctx.fillRect(screenX - barW / 2, screenY + 20, barW * pct, barH); ctx.restore();
            }
        }
    });
    ctx.restore();

    let totalSeconds = Math.ceil(matchTimeLeft / 60);
    let displayMins = Math.floor(totalSeconds / 60);
    let displaySecs = totalSeconds % 60;
    let formattedTime = `${displayMins}:${displaySecs < 10 ? "0" : ""}${displaySecs}`;

    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = "bold 14px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(`AMMO: ${player.ammo}/${player.maxAmmo}   |   TIME REMAINING: ${formattedTime}`, canvas.width / 2, canvas.height - 40);

    if (isGameWinner !== null) {
        ctx.fillStyle = "rgba(10, 15, 20, 0.92)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = isGameWinner.includes("HUNTERS") ? "#2ecc71" : "#ff5555"; ctx.font = "bold 44px sans-serif";
        ctx.fillText("MATCH CONCLUDED", canvas.width / 2, canvas.height / 2 - 80);
        ctx.fillStyle = "#ffffff"; ctx.font = "20px sans-serif";
        ctx.fillText(`WINNER: ${isGameWinner}`, canvas.width / 2, canvas.height / 2 - 20);

        drawButton("PLAY AGAIN", canvas.width / 2 - 110, canvas.height / 2 + 40, 220, 45, "#2980b9", "#3498db", () => {
            gameState = "LOBBY_ROOM"; isGameWinner = null;
        });
    }
}

function triggerNetworkMessage(payload) { if (mockSocket.onmessage) mockSocket.onmessage({ data: JSON.stringify(payload) }); }
function setupMockNetworkRouting() {
    mockSocket.onmessage = (event) => {
        const msg = JSON.parse(event.data); if (msg.type === "player_list_update") playerList = msg.players;
        if (msg.type === "game_started") { gameState = "PLAYING"; }
    };
}
function drawButton(text, x, y, w, h, baseColor, hoverColor, callback) {
    let isHovered = (mouse_position.x >= x && mouse_position.x <= x + w && mouse_position.y >= y && mouse_position.y <= y + h);
    ctx.fillStyle = isHovered ? hoverColor : baseColor; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#111"; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "#fff"; ctx.font = "14px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, x + w / 2, y + h / 2);
    activeButtons.push({ x, y, w, h, callback });
}
function drawStartScreen() {
    ctx.fillStyle = "#111215"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#3498db"; ctx.font = "bold 48px sans-serif"; ctx.fillText("LASER SIGHT 3D PROP HUNTER", canvas.width / 2, canvas.height / 2 - 60);
    const alpha = 0.4 + Math.abs(Math.sin(Date.now() * 0.003)) * 0.6; ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`; ctx.font = "20px sans-serif"; ctx.fillText("PRESS SPACE OR ENTER TO CHOOSE ID", canvas.width / 2, canvas.height / 2 + 20);
}
function drawLobbySelect() {
    ctx.fillStyle = "#111215"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "left"; ctx.fillStyle = "#3498db"; ctx.font = "bold 32px sans-serif"; ctx.fillText("HUNTER MATCHMAKING", 50, 60);
    ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = "16px sans-serif"; ctx.fillText("Enter hunter operative handle tag:", 50, 140);
    ctx.fillStyle = "#1c1e22"; ctx.fillRect(50, 170, 300, 45); ctx.strokeStyle = "#333"; ctx.strokeRect(50, 170, 300, 45);
    ctx.fillStyle = "#fff"; ctx.font = "16px sans-serif"; ctx.fillText(usernameInputText + (Math.floor(Date.now() / 500) % 2 === 0 ? "_" : ""), 65, 193);
    drawButton("ENTER LOBBY INSTANCE", 50, 240, 240, 45, "#2980b9", "#3498db", () => {
        if (usernameInputText.trim().length > 0) { setupMockNetworkRouting(); connectToSocket(usernameInputText.trim()); gameState = "LOBBY_ROOM"; }
    });
}
function drawLobbyRoom() {
    ctx.fillStyle = "#111215"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "left"; ctx.fillStyle = "#3498db"; ctx.font = "bold 28px sans-serif"; ctx.fillText("GAME LOBBY ROOM", 50, 60);
    ctx.fillStyle = "#1c1e22"; ctx.fillRect(50, 100, 400, 400);
    playerList.forEach((p, idx) => {
        let y = 120 + idx * 60; ctx.fillStyle = p.client_id === localId ? "#2c3e50" : "#252830"; ctx.fillRect(70, y, 360, 45);
        ctx.fillStyle = "#fff"; ctx.font = "15px sans-serif"; ctx.fillText(p.client_id, 90, y + 27);
    });
    drawButton("START HUNT MATCH", 480, 100, 220, 45, "#27ae60", "#2ecc71", () => { mockSocket.send(JSON.stringify({ type: "start_game" })); });
}
function gameLoop() {
    activeButtons = []; update();
    if (gameState === "START") drawStartScreen();
    else if (gameState === "LOBBY_SELECT") drawLobbySelect();
    else if (gameState === "LOBBY_ROOM") drawLobbyRoom();
    else if (gameState === "PLAYING") drawGame();
    requestAnimationFrame(gameLoop);
}
gameLoop();
