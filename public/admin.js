const socket = io();

const form = document.getElementById("adminForm");
const saveStatus = document.getElementById("saveStatus");
const visibleStatus = document.getElementById("visibleStatus");
const saveButton = document.getElementById("saveButton");
const showButton = document.getElementById("showButton");
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
const roundNumberSelect = document.getElementById("roundNumberSelect");
const roundTablesEditor = document.getElementById("roundTablesEditor");
const finalistsEditor = document.getElementById("finalistsEditor");
const podiumEditor = document.getElementById("podiumEditor");

let currentState = null;
let selectedTab = "rounds";
let selectedRoundNumber = 1;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message, tone = "") {
  saveStatus.textContent = message;
  saveStatus.className = `save-status ${tone}`.trim();
}

function setVisibleStatus(section) {
  const label =
    section === "rounds" ? "Rondas" : section === "final" ? "Final" : "Podio";
  visibleStatus.textContent = `Mostrando: ${label}`;
}

function setActiveTab(tab) {
  selectedTab = tab;
  tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tab);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle("is-hidden", panel.dataset.panel !== tab);
  });
}

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

function ensureStateRounds(state, roundNumber) {
  const next = state && typeof state === "object" ? state : {};
  if (!next.rounds || typeof next.rounds !== "object") next.rounds = {};

  const key = String(roundNumber);
  next.rounds[key] = ensureRoundShape(next.rounds[key]);
  next.currentRoundNumber = roundNumber;
  return next;
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

function mesaNumberFor(roundNumber, tableIndex) {
  return (roundNumber - 1) * 4 + (tableIndex + 1);
}

function renderRoundTables(roundNumber) {
  ensureStateRounds(currentState, roundNumber);
  const round = currentState.rounds[String(roundNumber)];

  const tableLabels = ["A", "B", "C", "D"];
  roundTablesEditor.innerHTML = round.tables
    .map((table, tableIndex) => {
      const mesaNumber = mesaNumberFor(roundNumber, tableIndex);
      const header = `Mesa ${mesaNumber} (Mesa ${tableLabels[tableIndex]})`;

      const rows = table.players
        .map((player, playerIndex) => {
          const place = playerIndex + 1;
          return `
            <div class="player-row">
              <div class="player-place">${place}</div>
              <label class="player-field">
                Nombre
                <input name="player-name-${table.id}-${playerIndex}" value="${escapeHtml(player.name)}" />
              </label>
              <label class="player-field">
                Puntos
                <input name="player-points-${table.id}-${playerIndex}" type="number" min="0" step="1" value="${escapeHtml(player.points)}" />
              </label>
            </div>
          `;
        })
        .join("");

      return `
        <article class="editor-card">
          <div class="mini-title">${escapeHtml(header)}</div>
          <div class="player-grid">
            ${rows}
          </div>
        </article>
      `;
    })
    .join("");
}

function renderFinalistsEditors(finalists) {
  const normalized = ensureFinalistsShape(finalists);
  finalistsEditor.innerHTML = normalized
    .map(
      (item, index) => `
        <article class="editor-card">
          <div class="editor-card-grid">
            <label>
              Nombre
              <input name="finalist-name-${index}" value="${escapeHtml(item.name)}" />
            </label>
            <label>
              Puntos
              <input name="finalist-points-${index}" type="number" value="${escapeHtml(item.points)}" />
            </label>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderPodiumEditors(podium) {
  const normalized = ensurePodiumShape(podium);
  podiumEditor.innerHTML = normalized
    .map(
      (item, index) => `
        <article class="editor-card">
          <div class="editor-card-grid">
            <label>
              Posicion
              <input name="podium-position-${index}" type="number" value="${escapeHtml(item.position)}" />
            </label>
            <label>
              Nombre
              <input name="podium-name-${index}" value="${escapeHtml(item.name)}" />
            </label>
          </div>
          <div class="editor-card-grid">
            <label>
              Puntos
              <input name="podium-points-${index}" type="number" value="${escapeHtml(item.points)}" />
            </label>
          </div>
        </article>
      `,
    )
    .join("");
}

function initRoundSelect() {
  if (!roundNumberSelect || roundNumberSelect.options.length) return;

  const options = Array.from({ length: 30 }).map((_, index) => {
    const value = index + 1;
    return `<option value="${value}">Ronda ${value}</option>`;
  });

  roundNumberSelect.innerHTML = options.join("");
}

function renderForm(state) {
  currentState = state;
  initRoundSelect();

  form.elements.tournamentName.value = state.tournamentName;

  selectedRoundNumber = clampRound(state.currentRoundNumber || 1);
  if (roundNumberSelect) roundNumberSelect.value = String(selectedRoundNumber);

  if (form.elements.totalInscritos) {
    form.elements.totalInscritos.value = Number(state.totalInscritos || 0);
  }

  if (roundTablesEditor) renderRoundTables(selectedRoundNumber);
  currentState.finalists = ensureFinalistsShape(state.finalists);
  renderFinalistsEditors(currentState.finalists);
  currentState.podium = ensurePodiumShape(state.podium);
  renderPodiumEditors(currentState.podium);

  setVisibleStatus(state.visibleSection || "rounds");
}

function readNumber(formData, key) {
  const value = formData.get(key);
  return Number(value || 0);
}

function readInt(formData, key, { min = -Infinity, max = Infinity } = {}) {
  const value = formData.get(key);
  const parsed = Number(value ?? 0);
  const numeric = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  return Math.min(max, Math.max(min, numeric));
}

function collectState() {
  const formData = new FormData(form);
  const safeState = currentState && typeof currentState === "object" ? currentState : {};
  const visibleSection = safeState.visibleSection || "rounds";
  const roundNumber = clampRound(formData.get("roundNumber"));
  ensureStateRounds(safeState, roundNumber);

  const ids = ["A", "B", "C", "D"];
  const nextRound = {
    tables: ids.map((id) => ({
      id,
      players: Array.from({ length: 7 }).map((_, playerIndex) => ({
        name: String(formData.get(`player-name-${id}-${playerIndex}`) || ""),
        points: readInt(formData, `player-points-${id}-${playerIndex}`, { min: 0 }),
      })),
    })),
  };

  const nextRounds = { ...(safeState.rounds || {}) };
  nextRounds[String(roundNumber)] = nextRound;

  const derivedTables = ids.map((id, tableIndex) => {
    const mesaNumber = mesaNumberFor(roundNumber, tableIndex);
    const names = nextRound.tables
      .find((t) => t.id === id)
      .players.map((p) => p.name)
      .filter(Boolean)
      .join(", ");
    return {
      id,
      title: `Mesa ${mesaNumber}`,
      players: names,
      score: "",
      status: "En juego",
    };
  });

  return {
    tournamentName: formData.get("tournamentName"),
    broadcastTitle: `RONDA ${roundNumber}`,
    headline: "",
    updatedAt: safeState.updatedAt ?? null,
    visibleSection,
    totalInscritos: readInt(formData, "totalInscritos", { min: 0 }),
    currentRoundNumber: roundNumber,
    currentRound: {
      name: `Ronda ${roundNumber}`,
      subtitle: "Mesas en juego",
      note: "",
    },
    rounds: nextRounds,
    tables: derivedTables,
    ranking: Array.isArray(safeState.ranking) ? safeState.ranking : [],
    finalists: ensureFinalistsShape(safeState.finalists).map((_, index) => ({
      name: formData.get(`finalist-name-${index}`),
      points: readInt(formData, `finalist-points-${index}`, { min: 0 }),
    })),
    podium: ensurePodiumShape(safeState.podium).map((item, index) => ({
      position: readInt(formData, `podium-position-${index}`, { min: 1, max: 9 }),
      name: formData.get(`podium-name-${index}`),
      prize: item.prize,
      points: readInt(formData, `podium-points-${index}`, { min: 0 }),
    })),
    secondaryPrizes: Array.isArray(safeState.secondaryPrizes) ? safeState.secondaryPrizes : [],
  };
}

async function loadState() {
  const response = await fetch("/api/state");
  const state = await response.json();
  renderForm(state);
}

async function persistState(nextState) {
  const response = await fetch("/api/state", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(nextState),
  });

  if (!response.ok) {
    throw new Error("No fue posible guardar");
  }

  return response.json();
}

async function handleSave({ show } = { show: false }) {
  setStatus(show ? "Mostrando en landing..." : "Guardando cambios...", "");

  try {
    if (document.activeElement && typeof document.activeElement.blur === "function") {
      document.activeElement.blur();
    }
    const baseState = collectState();
    const nextState = show
      ? { ...baseState, visibleSection: selectedTab }
      : baseState;
    const savedState = await persistState(nextState);
    renderForm(savedState);
    setStatus(show ? "Mostrando en vivo" : "Guardado", "success");
  } catch (error) {
    console.error(error);
    setStatus("Error al guardar", "error");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
});

saveButton.addEventListener("click", () => {
  handleSave({ show: false });
});

showButton.addEventListener("click", () => {
  handleSave({ show: true });
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab);
  });
});

document.addEventListener(
  "wheel",
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== "number") return;
    const delta = event.deltaY || 0;
    event.preventDefault();
    target.blur();
    window.scrollBy({ top: delta, left: 0, behavior: "auto" });
  },
  { passive: false, capture: true },
);

if (roundNumberSelect) {
  roundNumberSelect.addEventListener("change", () => {
    selectedRoundNumber = clampRound(roundNumberSelect.value);
    if (roundTablesEditor) renderRoundTables(selectedRoundNumber);
  });
}

socket.on("state:update", (state) => {
  currentState = state;
  setVisibleStatus(state.visibleSection || "rounds");
});

loadState()
  .then(() => {
    setStatus("Listo para editar", "");
    setActiveTab(selectedTab);
  })
  .catch((error) => {
    console.error(error);
    setStatus("Error cargando datos", "error");
  });
