const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const WebSocket = require("ws");

const PORT = 3000;
const MAX_PLAYERS = 15;

let players = [];
let status = "LOBBY";
let winner = null;
let nextId = 1;
let gameStartTime = 0;

function hostId() { return players.length > 0 ? players[0].id : null; }

function publicPlayers() {
  return players.map(p => ({
    id: p.id, name: p.name, x: p.x, y: p.y, angle: p.angle,
    role: p.role, isFound: p.isFound
  }));
}

function broadcastState() {
  const payload = JSON.stringify({ type: "state", status, winner, hostId: hostId(), gameStartTime, players: publicPlayers() });
  players.forEach(p => { if (p.ws.readyState === WebSocket.OPEN) p.ws.send(payload); });
}

function resetToLobby() {
  status = "LOBBY"; winner = null;
  players.forEach(p => { p.role = "verstecker"; p.isFound = false; });
}

function checkWinCondition() {
  if (status !== "PLAYING") return;
  const activeHiders = players.filter(p => p.role === "verstecker" && !p.isFound);
  if (activeHiders.length === 0) winner = "sucher";
}

const server = http.createServer((req, res) => {
  let reqUrl = req.url === "/" ? "/index.html" : req.url;
  let filePath = path.join(__dirname, "public", reqUrl);
  let extname = path.extname(filePath).toLowerCase();

  let mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg'
  };
  let contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404); res.end("File not found");
      } else {
        res.writeHead(500); res.end("Server Error");
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content, "utf-8");
    }
  });
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
        ws.close(); return;
      }
      const name = (msg.name || "Spieler").toString().slice(0, 20) || "Spieler";
      me = {
        id: nextId++, ws, name,
        x: 1904, y: 2728,
        angle: 0,
        role: "verstecker", isFound: false
      };
      players.push(me);
      ws.send(JSON.stringify({ type: "joined", id: me.id }));
      broadcastState();
      return;
    }

    if (!me) return;

    if (msg.type === "start_game") {
      if (me.id !== hostId() || status !== "LOBBY" || players.length < 2) return;
      const seekerIndex = Math.floor(Math.random() * players.length);

      gameStartTime = Date.now();

      players.forEach((p, i) => {
        p.role = i === seekerIndex ? "sucher" : "verstecker";
        p.isFound = false;
        p.x = 1904;
        p.y = 2728;
      });

      status = "PLAYING"; winner = null;
      broadcastState(); return;
    }

    if (msg.type === "move") {
      if (status !== "PLAYING" && status !== "LOBBY") return;
      if (me.isFound) return;

      me.x = typeof msg.x === "number" ? msg.x : me.x;
      me.y = typeof msg.y === "number" ? msg.y : me.y;
      me.angle = typeof msg.angle === "number" ? msg.angle : 0;

      broadcastState(); return;
    }

    if (msg.type === "found") {
      if (status !== "PLAYING" || me.role !== "sucher") return;
      const target = players.find(p => p.id === msg.targetId);
      if (target && target.role === "verstecker" && !target.isFound) {
        target.isFound = true; checkWinCondition(); broadcastState();
      }
      return;
    }

    if (msg.type === "reset_lobby") {
      if (me.id !== hostId()) return;
      resetToLobby(); broadcastState(); return;
    }
  });

  ws.on("close", () => {
    if (!me) return;
    players = players.filter(p => p.id !== me.id);
    if (status === "PLAYING") {
      if (me.role === "sucher" || players.length < 2) resetToLobby();
      else checkWinCondition();
    }
    if (players.length === 0) { status = "LOBBY"; winner = null; nextId = 1; }
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
  console.log("\n=== Hide & Seek Backrooms Server läuft ===");
  console.log(`Lokal: http://localhost:${PORT}`);
  addresses.forEach(a => console.log(`WLAN:  http://${a}:${PORT}`));
  console.log("==========================================\n");
});