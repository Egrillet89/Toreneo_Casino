const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "state.json");
const PUBLIC_DIR = path.join(__dirname, "public");

function clampRound(value) {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return 1;
  return Math.min(30, Math.max(1, Math.trunc(asNumber)));
}

function ensureRoundShape(round) {
  const ids = ["A", "B", "C", "D"];
  const tables = Array.isArray(round?.tables) ? round.tables : [];

  const normalizedTables = ids.map((id) => {
    const existing = tables.find((t) => t && t.id === id) || { id, players: [] };
    const players = Array.isArray(existing.players) ? existing.players : [];
    const normalizedPlayers = Array.from({ length: 7 }).map((_, index) => {
      const p = players[index] || {};
      return {
        name: typeof p.name === "string" ? p.name : "",
        points: Number.isFinite(Number(p.points)) ? Number(p.points) : 0,
      };
    });

    return { id, players: normalizedPlayers };
  });

  return { tables: normalizedTables };
}

function ensureFinalistsShape(finalists) {
  const list = Array.isArray(finalists) ? finalists : [];
  return Array.from({ length: 9 }).map((_, index) => {
    const item = list[index] || {};
    return {
      name: typeof item.name === "string" ? item.name : "",
      points: Number.isFinite(Number(item.points)) ? Number(item.points) : 0,
    };
  });
}

function ensurePodiumShape(podium) {
  const list = Array.isArray(podium) ? podium : [];
  return Array.from({ length: 9 }).map((_, index) => {
    const item = list[index] || {};
    return {
      position: Number.isFinite(Number(item.position)) ? Number(item.position) : index + 1,
      name: typeof item.name === "string" ? item.name : "",
      prize: typeof item.prize === "string" ? item.prize : "",
      points: Number.isFinite(Number(item.points)) ? Number(item.points) : 0,
    };
  });
}

function clampSemifinalGroup(value) {
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return 1;
  return Math.min(20, Math.max(1, Math.trunc(asNumber)));
}

function ensureSemifinalShape(semifinal, groupNumber) {
  const next = semifinal && typeof semifinal === "object" ? semifinal : {};
  const key = String(groupNumber);
  next[key] = ensureRoundShape(next[key]);
  return next;
}

function computeGlobalRanking(rounds) {
  const pointsByName = new Map();

  Object.values(rounds || {}).forEach((round) => {
    const tables = Array.isArray(round?.tables) ? round.tables : [];
    tables.forEach((table) => {
      const players = Array.isArray(table?.players) ? table.players : [];
      players.forEach((player) => {
        const name = typeof player?.name === "string" ? player.name.trim() : "";
        if (!name) return;
        const points = Number(player?.points || 0);
        const safePoints = Number.isFinite(points) ? points : 0;
        pointsByName.set(name, (pointsByName.get(name) || 0) + safePoints);
      });
    });
  });

  return Array.from(pointsByName.entries())
    .map(([name, points]) => ({ name, points }))
    .sort((a, b) => b.points - a.points);
}

function normalizeState(state) {
  const next = state && typeof state === "object" ? { ...state } : {};

  next.visibleSection = next.visibleSection || "rounds";
  next.roundsPhase = next.roundsPhase === "semifinal" ? "semifinal" : "rounds";
  next.totalInscritos = Number.isFinite(Number(next.totalInscritos))
    ? Number(next.totalInscritos)
    : 0;
  next.finalists = ensureFinalistsShape(next.finalists);
  next.podium = ensurePodiumShape(next.podium);

  const currentRoundNumber = clampRound(
    next.currentRoundNumber ??
      (typeof next.currentRound?.name === "string"
        ? next.currentRound.name.match(/(\d+)/)?.[1]
        : null),
  );
  next.currentRoundNumber = currentRoundNumber;

  const rounds = next.rounds && typeof next.rounds === "object" ? next.rounds : {};
  const key = String(currentRoundNumber);
  rounds[key] = ensureRoundShape(rounds[key]);
  next.rounds = rounds;
  const semifinalGroup = clampSemifinalGroup(next.currentSemifinalNumber ?? 1);
  next.currentSemifinalNumber = semifinalGroup;
  next.semifinal = ensureSemifinalShape(next.semifinal, semifinalGroup);
  next.globalRanking = computeGlobalRanking({ ...rounds, ...(next.semifinal || {}) });

  next.currentRound = next.currentRound && typeof next.currentRound === "object" ? next.currentRound : {};
  next.currentRound.name = `Grupo ${next.roundsPhase === "semifinal" ? semifinalGroup : currentRoundNumber}`;

  if (typeof next.broadcastTitle !== "string" || !next.broadcastTitle.trim()) {
    next.broadcastTitle = next.roundsPhase === "semifinal" ? "SEMIFINAL" : "RONDA 1";
  }

  return next;
}

function readState() {
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return normalizeState(JSON.parse(raw));
}

function writeState(nextState) {
  const payload = {
    ...normalizeState(nextState),
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR));

app.get("/api/state", (_req, res) => {
  res.json(readState());
});

app.post("/api/state", (req, res) => {
  const nextState = req.body;

  if (!nextState || typeof nextState !== "object") {
    return res.status(400).json({ error: "Payload invalido" });
  }

  const savedState = writeState(nextState);
  io.emit("state:update", savedState);
  return res.json(savedState);
});

app.get(["/admin", "/admin/", "/panel", "/panel/"], (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "admin.html"));
});

io.on("connection", (socket) => {
  socket.emit("state:update", readState());
});

server.listen(PORT, () => {
  console.log(`Landing: http://localhost:${PORT}`);
  console.log(`Admin:   http://localhost:${PORT}/admin`);
});
