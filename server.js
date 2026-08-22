// server.js
// Lokaler Hide-and-Seek Multiplayer-Server. Läuft komplett offline im eigenen WLAN.
// Start:  npm install ws
//         node server.js
// Andere Spieler öffnen dann im Browser die Adresse, die im Terminal angezeigt wird.

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const WebSocket = require("ws");

const PORT = 3000;
const MAX_PLAYERS = 15;

let players = [];
let status = "lobby";
let winner = null;
let nextId = 1;

let startedAt = 0;
const hidingDur = 12000;
const huntDur = 120000;

function hostId() {
  return players.length > 0 ? players[0].id : null;
}

function publicPlayers() {
  return players.map(p => ({
    id: p.id, name: p.name, x: p.x, y: p.y,
    role: p.role, hidden: p.hidden, propType: p.propType, alive: p.alive
  }));
}

function broadcastState() {
  const payload = JSON.stringify({
    type: "state",
    status, winner,
    hostId: hostId(),
    startedAt, hidingDur, huntDur,
    players: publicPlayers()
  });
  players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(payload);
  });
}

function resetToLobby() {
  status = "lobby";
  winner = null;
  players.forEach(p => {
    p.role = "prop";
    p.alive = true;
    p.hidden = false;
    p.propType = null;
  });
}

function checkWinCondition() {
  if (status !== "hunting") return;
  const activeProps = players.filter(p => p.role === "prop" && p.alive);
  if (activeProps.length === 0) {
    winner = "hunter";
    status = "ended";
    broadcastState();
  }
}

setInterval(() => {
  if (status === "hiding") {
    if (Date.now() - startedAt > hidingDur) {
      status = "hunting";
      broadcastState();
    }
  } else if (status === "hunting") {
    if (Date.now() - startedAt > hidingDur + huntDur) {
      status = "ended";
      winner = "props";
      broadcastState();
    }
  }
}, 500);

const indexHtml = fs.readFileSync(path.join(__dirname, "public", "index.html"));

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(indexHtml);
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  let me = null;

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "join") {
      if (players.length >= MAX_PLAYERS) {
        ws.send(JSON.stringify({ type: "join_rejected", reason: "full" }));
        ws.close();
        return;
      }
      const name = (msg.name || "Spieler").toString().slice(0, 20) || "Spieler";
      me = {
        id: nextId++, ws, name,
        x: 0, y: 0, role: "prop",
        hidden: false, propType: null, alive: true
      };
      players.push(me);
      ws.send(JSON.stringify({ type: "joined", id: me.id }));
      broadcastState();
      return;
    }

    if (!me) return;

    if (msg.type === "start_game") {
      if (me.id !== hostId() || status !== "lobby" || players.length < 2) return;

      const seekerIndex = Math.floor(Math.random() * players.length);
      players.forEach((p, i) => {
        p.role = i === seekerIndex ? "hunter" : "prop";
        p.alive = true;
        p.hidden = false;
        p.propType = null;
      });

      status = "hiding";
      winner = null;
      startedAt = Date.now();
      broadcastState();
      return;
    }

    if (msg.type === "move") {
      if (status === "ended" || !me.alive) return;
      me.x = Number(msg.x) || me.x;
      me.y = Number(msg.y) || me.y;
      me.hidden = Boolean(msg.hidden);
      me.propType = msg.propType || null;
      broadcastState();
      return;
    }

    if (msg.type === "tag") {
      if (status !== "hunting" || me.role !== "hunter") return;
      const target = players.find(p => p.id === msg.targetId);
      if (target && target.role === "prop" && target.alive) {
        target.alive = false;
        target.hidden = false;
        checkWinCondition();
        broadcastState();
      }
      return;
    }

    if (msg.type === "reset_lobby") {
      if (me.id !== hostId()) return;
      resetToLobby();
      broadcastState();
      return;
    }
  });

  ws.on("close", () => {
    if (!me) return;
    players = players.filter(p => p.id !== me.id);

    if (status === "hiding" || status === "hunting") {
      const hunterLeft = me.role === "hunter";
      if (hunterLeft || players.length < 2) {
        resetToLobby();
      } else {
        checkWinCondition();
      }
    }

    if (players.length === 0) {
      status = "lobby";
      winner = null;
      nextId = 1;
    }
    broadcastState();
  });
});

server.listen(PORT, () => {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) addresses.push(net.address);
    }
  }
  console.log("\n=== PROP//HUNT Server läuft ===");
  console.log(`Lokal öffnen: http://localhost:${PORT}`);
  if (addresses.length) {
    console.log("Im WLAN öffnen:");
    addresses.forEach(a => console.log(`   http://${a}:${PORT}`));
  }
  console.log("===============================\n");
});