function drawButton(text, x, y, w, h, baseColor, hoverColor, callback) {
    // FIXED: Completed the missing comparative coordinate equation
    let isHovered = (mouse_position.x >= x && mouse_position.x <= x + w &&
        mouse_position.y >= y && mouse_position.y <= y + h);

    ctx.fillStyle = isHovered ? hoverColor : baseColor;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "#222";
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = "#fff";
    ctx.font = "14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + h / 2);

    activeButtons.push({ x, y, w, h, callback });
}

function drawLobbySelect() {
    ctx.fillStyle = "#0a0f0d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffdd66";
    ctx.font = "bold 32px sans-serif";
    ctx.fillText("OFFLINE SIMULATED MULTIPLAYER", 50, 60);

    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "16px sans-serif";
    ctx.fillText("Type your local player identity name identifier:", 50, 140);

    ctx.fillStyle = "#161b18";
    ctx.fillRect(50, 170, 300, 45);
    ctx.strokeStyle = "#333";
    ctx.strokeRect(50, 170, 300, 45);

    ctx.fillStyle = "#fff";
    ctx.font = "16px sans-serif";
    let cursor = (Math.floor(Date.now() / 500) % 2 === 0 ? "_" : "");
    ctx.fillText(usernameInputText + cursor, 65, 193);

    // FIXED: Properly calling drawButton inside the UI loop layout context
    drawButton("CONNECT TO LOCAL SERVER", 50, 240, 240, 45, "#1a5e22", "#2e8b37", () => {
        if (usernameInputText.trim().length > 0) {
            setupMockNetworkRouting();
            connectToSocket(usernameInputText.trim());
            gameState = "LOBBY_ROOM";
        }
    });
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

const mouse_position = { x: 0, y: 0 };
let activeButtons = [];

window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse_position.x = e.clientX - rect.left;
    mouse_position.y = e.clientY - rect.top;
});

window.addEventListener("click", () => {
    for (let btn of activeButtons) {
        if (mouse_position.x >= btn.x && mouse_position.x <= btn.x + btn.w && mouse_position.y >= btn.y && mouse_position.y <= btn.y + btn.h) {
            btn.callback(); break;
        }
    }
});

function update() {
    if (gameState !== "PLAYING" || isGameWinner !== null) return;

    let moveX = 0, moveY = 0;
    if (keys["w"] || keys["arrowup"]) moveY -= 1;
    if (keys["s"] || keys["arrowdown"]) moveY += 1;
    if (keys["a"] || keys["arrowleft"]) moveX -= 1;
    if (keys["d"] || keys["arrowright"]) moveX += 1;

    if (moveX !== 0 && moveY !== 0) { moveX *= Math.SQRT1_2; moveY *= Math.SQRT1_2; }

    player.x += moveX * player.speed; player.y += moveY * player.speed;
    player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
    player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
    player.angle = Math.atan2(mouse_position.y - player.y, mouse_position.x - player.x);

    if (player.role === "sucher" && !player.isFound) {
        remotePlayers.forEach((bot, botId) => {
            if (bot.role === "verstecker" && !bot.is_found) {
                if (Math.hypot(player.x - bot.x, player.y - bot.y) < player.radius + bot.radius) {
                    mockSocket.send(JSON.stringify({ type: "player_found", target_client: botId }));
                }
            }
        });
    }

    remotePlayers.forEach(bot => {
        if (bot.is_found) return;

        if (bot.role === "sucher") {
            let targetEntity = (!player.isFound) ? player : null;
            let minDist = targetEntity ? Math.hypot(targetEntity.x - bot.x, targetEntity.y - bot.y) : Infinity;

            remotePlayers.forEach(other => {
                if (other.role === "verstecker" && !other.is_found) {
                    let d = Math.hypot(other.x - bot.x, other.y - bot.y);
                    if (d < minDist) { minDist = d; targetEntity = other; }
                }
            });

            if (targetEntity) {
                bot.angle = Math.atan2(targetEntity.y - bot.y, targetEntity.x - bot.x);
                bot.x += Math.cos(bot.angle) * bot.speed; bot.y += Math.sin(bot.angle) * bot.speed;

                if (Math.hypot(targetEntity.x - bot.x, targetEntity.y - bot.y) < bot.radius + targetEntity.radius) {
                    let targetId = (targetEntity === player) ? localId : targetEntity.client_id;
                    mockSocket.send(JSON.stringify({ type: "player_found", target_client: targetId }));
                }
            }
        } else {
            bot.changeDirTimer--;
            if (bot.changeDirTimer <= 0) {
                bot.targetX = Math.random() * (canvas.width - 100) + 50;
                bot.targetY = Math.random() * (canvas.height - 100) + 50;
                bot.changeDirTimer = Math.floor(Math.random() * 120) + 60;
            }
            let dx = bot.targetX - bot.x, dy = bot.targetY - bot.y;
            if (Math.hypot(dx, dy) > 5) {
                bot.angle = Math.atan2(dy, dx);
                bot.x += Math.cos(bot.angle) * bot.speed; bot.y += Math.sin(bot.angle) * bot.speed;
            }
        }
        bot.x = Math.max(bot.radius, Math.min(canvas.width - bot.radius, bot.x));
        bot.y = Math.max(bot.radius, Math.min(canvas.height - bot.radius, bot.y));
    });
}

function drawButton(text, x, y, w, h, baseColor, hoverColor, callback) {
    let isHovered = (mouse_position.x >= x && mouse_position.x <= x + w && mouse_position.y >= y && mouse_position.y  {
        if (usernameInputText.trim().length > 0) {
            setupMockNetworkRouting();
            connectToSocket(usernameInputText.trim());
            gameState = "LOBBY_ROOM";
        }
    });
}

function drawLobbyRoom() {
    ctx.fillStyle = "#0c1210"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = "left"; ctx.fillStyle = "#ffdd66"; ctx.font = "bold 28px sans-serif";
    ctx.fillText("SERVER SIMULATOR ROOM CHANNELS", 50, 60);

    ctx.fillStyle = "#111815"; ctx.fillRect(50, 100, 400, 400);
    playerList.forEach((p, index) => {
        let yOffset = 120 + index * 60;
        ctx.fillStyle = p.client_id === localId ? "#1e2e27" : "#17201c"; ctx.fillRect(70, yOffset, 360, 45);
        ctx.fillStyle = "#fff"; ctx.font = "15px sans-serif"; ctx.fillText(p.client_id, 90, yOffset + 27);
        ctx.font = "11px sans-serif"; ctx.fillStyle = "#ffaa00";
        if (index === 0) ctx.fillText("[Lobby Leader]", 260, yOffset + 27);
    });

    if (isLobbyLeader) {
        ctx.fillStyle = "#16201c"; ctx.fillRect(480, 100, Math.max(350, canvas.width - 530), 400);
        ctx.fillStyle = "#ffdd66"; ctx.font = "bold 18px sans-serif"; ctx.fillText("SERVER COMMAND MODULE", 510, 140);
        drawButton("INITIALIZE MATCH START", 510, 430, 240, 45, "#e67e22", "#d35400", () => {
            mockSocket.send(JSON.stringify({ type: "start_game" }));
        });
    }
}

function drawEntityAura(x, y, angle, role, isFound) {
    if (isFound) return;
    if (role !== "sucher") {
        ctx.save(); ctx.globalCompositeOperation = "screen";
        const radialGlow = ctx.createRadialGradient(x, y, 2, x, y, 70);
        radialGlow.addColorStop(0, "rgba(255, 220, 130, 0.25)"); radialGlow.addColorStop(1, "rgba(255, 180, 90, 0.0)");
        ctx.fillStyle = radialGlow; ctx.beginPath(); ctx.arc(x, y, 70, 0, Math.PI * 2); ctx.fill();

        ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 300, angle - 0.38, angle + 0.38); ctx.lineTo(x, y); ctx.closePath();
        const coneGlow = ctx.createRadialGradient(x, y, 20, x, y, 300);
        coneGlow.addColorStop(0, "rgba(255, 240, 190, 0.45)"); coneGlow.addColorStop(1, "rgba(200, 160, 100, 0.0)");
        ctx.fillStyle = coneGlow; ctx.fill(); ctx.restore();
    } else {
        ctx.save(); ctx.globalCompositeOperation = "screen";
        const monsterEyes = ctx.createRadialGradient(x, y, 2, x, y, 140);
        monsterEyes.addColorStop(0, "rgba(200, 30, 30, 0.2)"); monsterEyes.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = monsterEyes; ctx.beginPath(); ctx.arc(x, y, 140, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
}

function drawGame() {
    ctx.fillStyle = "#000000"; ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!player.isFound) {
        ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle);
        ctx.beginPath(); ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
        ctx.fillStyle = player.role === "sucher" ? "#b21c1c" : "#8a7500"; ctx.fill(); ctx.restore();
    }

    remotePlayers.forEach(bot => {
        if (bot.is_found) return;
        ctx.save(); ctx.translate(bot.x, bot.y); ctx.rotate(bot.angle);
        ctx.beginPath(); ctx.arc(0, 0, bot.radius, 0, Math.PI * 2);
        ctx.fillStyle = bot.role === "sucher" ? "#b21c1c" : "#8a7500"; ctx.fill(); ctx.restore();
    });

    drawEntityAura(player.x, player.y, player.angle, player.role, player.isFound);
    remotePlayers.forEach(bot => { drawEntityAura(bot.x, bot.y, bot.angle, bot.role, bot.is_found); });

    if (isGameWinner !== null) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = "center"; ctx.fillStyle = "#ff5555"; ctx.font = "bold 40px sans-serif";
        ctx.fillText(`GAME OVER - WINNER: ${isGameWinner.toUpperCase()}`, canvas.width / 2, canvas.height / 2);
    }
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
