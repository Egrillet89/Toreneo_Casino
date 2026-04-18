const socket = io();

const form = document.getElementById("adminForm");
const saveStatus = document.getElementById("saveStatus");
const visibleStatus = document.getElementById("visibleStatus");
const saveButton = document.getElementById("saveButton");
const showButton = document.getElementById("showButton");
const resetRankingButton = document.getElementById("resetRankingButton");
const deleteDataButton = document.getElementById("deleteDataButton");
const exportDataButton = document.getElementById("exportDataButton");
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
const roundNumberSelect = document.getElementById("roundNumberSelect");
const semifinalNumberSelect = document.getElementById("semifinalNumberSelect");
const roundTablesEditor = document.getElementById("roundTablesEditor");
const semifinalTablesEditor = document.getElementById("semifinalTablesEditor");
const finalistsEditor = document.getElementById("finalistsEditor");
const podiumEditor = document.getElementById("podiumEditor");

let currentState = null;
let selectedTab = "rounds";
let selectedRoundNumber = 1;
let selectedSemifinalNumber = 1;

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
    section === "rounds"
      ? "Rondas"
      : section === "semifinal"
        ? "Semifinal"
        : section === "final"
          ? "Final"
          : "Podio";
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
  tabPanels.forEach((panel) => {
    const isActive = panel.dataset.panel === tab;
    panel.querySelectorAll("input, select, textarea, button").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (el.id === "saveButton" || el.id === "showButton") return;
      if (el.closest(".admin-actions")) return;
      el.toggleAttribute("disabled", !isActive);
    });
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

function ensureStateSemifinal(state, groupNumber) {
  const next = state && typeof state === "object" ? state : {};
  if (!next.semifinal || typeof next.semifinal !== "object") next.semifinal = {};
  const key = String(groupNumber);
  next.semifinal[key] = ensureRoundShape(next.semifinal[key]);
  next.currentSemifinalNumber = groupNumber;
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
      position: index + 1,
      name: typeof item.name === "string" ? item.name : "",
      prize: typeof item.prize === "string" ? item.prize : "",
      points: Number.isFinite(Number(item.points)) ? Number(item.points) : 0,
    };
  });
}

function excelColumnLabel(index1Based) {
  let n = Number(index1Based);
  if (!Number.isFinite(n) || n <= 0) return "";
  n = Math.trunc(n);
  let label = "";
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

function mesaLabelFor(groupNumber, tableIndex) {
  return excelColumnLabel((groupNumber - 1) * 4 + (tableIndex + 1));
}

function renderGroupTables(groupNumber, editorEl, { sourceKey, inputPrefix, labelPrefix }) {
  if (!currentState) return;
  if (!editorEl) return;
  const group = currentState[sourceKey]?.[String(groupNumber)];
  const tables = Array.isArray(group?.tables) ? group.tables : ensureRoundShape({}).tables;

  editorEl.innerHTML = tables
    .map((table, tableIndex) => {
      const mesaLabel = mesaLabelFor(groupNumber, tableIndex);
      const header = `${labelPrefix} ${groupNumber} - Mesa ${mesaLabel}`;

      const rows = table.players
        .map((player, playerIndex) => {
          const place = playerIndex + 1;
          return `
            <div class="player-row">
              <div class="player-place">${place}</div>
              <label class="player-field">
                Nombre
                <input name="${inputPrefix}-name-${table.id}-${playerIndex}" value="${escapeHtml(player.name)}" />
              </label>
              <label class="player-field">
                Puntos
                <input name="${inputPrefix}-points-${table.id}-${playerIndex}" type="number" min="0" step="1" value="${escapeHtml(player.points)}" />
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
            <div class="field-readonly">
              <div class="field-label">Posicion</div>
              <div class="field-value">${escapeHtml(item.position)}</div>
            </div>
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
    return `<option value="${value}">Grupo ${value}</option>`;
  });

  roundNumberSelect.innerHTML = options.join("");
}

function initSemifinalSelect() {
  if (!semifinalNumberSelect || semifinalNumberSelect.options.length) return;

  const options = Array.from({ length: 20 }).map((_, index) => {
    const value = index + 1;
    return `<option value="${value}">Grupo ${value}</option>`;
  });

  semifinalNumberSelect.innerHTML = options.join("");
}

function renderForm(state, { keepTab, keepRoundNumber, keepSemifinalNumber } = {}) {
  currentState = state;
  initRoundSelect();
  initSemifinalSelect();

  form.elements.tournamentName.value = state.tournamentName;

  selectedRoundNumber = clampRound(keepRoundNumber ?? state.currentRoundNumber ?? 1);
  if (roundNumberSelect) roundNumberSelect.value = String(selectedRoundNumber);

  selectedSemifinalNumber = Math.min(
    20,
    clampRound(keepSemifinalNumber ?? state.currentSemifinalNumber ?? 1),
  );
  if (semifinalNumberSelect) semifinalNumberSelect.value = String(selectedSemifinalNumber);

  const totalInputs = Array.from(form.querySelectorAll('input[name="totalInscritos"]'));
  totalInputs.forEach((input) => {
    input.value = String(Number(state.totalInscritos || 0));
  });

  ensureStateRounds(currentState, selectedRoundNumber);
  ensureStateSemifinal(currentState, selectedSemifinalNumber);
  if (roundTablesEditor) {
    renderGroupTables(selectedRoundNumber, roundTablesEditor, {
      sourceKey: "rounds",
      inputPrefix: "player",
      labelPrefix: "Grupo",
    });
  }
  if (semifinalTablesEditor) {
    renderGroupTables(selectedSemifinalNumber, semifinalTablesEditor, {
      sourceKey: "semifinal",
      inputPrefix: "semi-player",
      labelPrefix: "Grupo",
    });
  }
  currentState.finalists = ensureFinalistsShape(state.finalists);
  renderFinalistsEditors(currentState.finalists);
  currentState.podium = ensurePodiumShape(state.podium);
  renderPodiumEditors(currentState.podium);

  const visible = state.visibleSection || "rounds";
  const defaultTab = visible === "rounds" && state.roundsPhase === "semifinal" ? "semifinal" : visible;
  selectedTab = keepTab ?? defaultTab;
  setVisibleStatus(defaultTab === "semifinal" ? "semifinal" : visible);
  setActiveTab(selectedTab);
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

function readIntFromInputValue(value, { min = -Infinity, max = Infinity } = {}) {
  const parsed = Number(value ?? 0);
  const numeric = Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  return Math.min(max, Math.max(min, numeric));
}

function getActivePanel() {
  return tabPanels.find((panel) => panel.dataset.panel === selectedTab) || null;
}

function commitGroupEdits({ mode, groupNumber, editorEl, inputPrefix }) {
  if (!currentState) return;
  if (!editorEl) return;

  const ids = ["A", "B", "C", "D"];
  const nextRound = {
    tables: ids.map((id) => ({
      id,
      players: Array.from({ length: 7 }).map((_, playerIndex) => {
        const nameInput = editorEl.querySelector(
          `input[name="${inputPrefix}-name-${id}-${playerIndex}"]`,
        );
        const pointsInput = editorEl.querySelector(
          `input[name="${inputPrefix}-points-${id}-${playerIndex}"]`,
        );
        return {
          name: String(nameInput?.value ?? ""),
          points: readIntFromInputValue(pointsInput?.value, { min: 0 }),
        };
      }),
    })),
  };

  if (mode === "semifinal") {
    ensureStateSemifinal(currentState, groupNumber);
    currentState.semifinal[String(groupNumber)] = ensureRoundShape(nextRound);
    currentState.currentSemifinalNumber = groupNumber;
  } else {
    ensureStateRounds(currentState, groupNumber);
    currentState.rounds[String(groupNumber)] = ensureRoundShape(nextRound);
    currentState.currentRoundNumber = groupNumber;
  }
}

function commitFinalistsEdits() {
  if (!currentState) return;
  if (!finalistsEditor) return;
  currentState.finalists = Array.from({ length: 9 }).map((_, index) => {
    const nameInput = finalistsEditor.querySelector(`input[name="finalist-name-${index}"]`);
    const pointsInput = finalistsEditor.querySelector(`input[name="finalist-points-${index}"]`);
    return {
      name: String(nameInput?.value ?? ""),
      points: readIntFromInputValue(pointsInput?.value, { min: 0 }),
    };
  });
}

function commitPodiumEdits() {
  if (!currentState) return;
  if (!podiumEditor) return;
  currentState.podium = Array.from({ length: 9 }).map((_, index) => {
    const nameInput = podiumEditor.querySelector(`input[name="podium-name-${index}"]`);
    const pointsInput = podiumEditor.querySelector(`input[name="podium-points-${index}"]`);
    const existing = Array.isArray(currentState.podium) ? currentState.podium[index] : null;
    return {
      position: index + 1,
      name: String(nameInput?.value ?? ""),
      prize: typeof existing?.prize === "string" ? existing.prize : "",
      points: readIntFromInputValue(pointsInput?.value, { min: 0 }),
    };
  });
}

function commitSharedEdits() {
  if (!currentState) return;
  if (form?.elements?.tournamentName) {
    currentState.tournamentName = String(form.elements.tournamentName.value ?? "");
  }
  const panel = getActivePanel();
  const totalInput = panel?.querySelector?.('input[name="totalInscritos"]');
  if (totalInput) {
    currentState.totalInscritos = readIntFromInputValue(totalInput.value, { min: 0 });
  }
}

function commitActiveTabEdits() {
  commitSharedEdits();

  if (selectedTab === "rounds") {
    commitGroupEdits({
      mode: "rounds",
      groupNumber: selectedRoundNumber,
      editorEl: roundTablesEditor,
      inputPrefix: "player",
    });
    return;
  }

  if (selectedTab === "semifinal") {
    commitGroupEdits({
      mode: "semifinal",
      groupNumber: selectedSemifinalNumber,
      editorEl: semifinalTablesEditor,
      inputPrefix: "semi-player",
    });
    return;
  }

  if (selectedTab === "final") {
    commitFinalistsEdits();
    return;
  }

  if (selectedTab === "podium") {
    commitPodiumEdits();
  }
}

function deriveTablesFromGroup(groupNumber, group) {
  const ids = ["A", "B", "C", "D"];
  const normalized = ensureRoundShape(group);
  return ids.map((id, tableIndex) => {
    const mesaLabel = mesaLabelFor(groupNumber, tableIndex);
    const names = normalized.tables
      .find((t) => t.id === id)
      .players.map((p) => p.name)
      .filter(Boolean)
      .join(", ");
    return {
      id,
      title: `Mesa ${mesaLabel}`,
      players: names,
      score: "",
      status: "En juego",
    };
  });
}

function collectState({ applyDisplaySelection } = { applyDisplaySelection: false }) {
  const safeState = currentState && typeof currentState === "object" ? currentState : {};

  const next = {
    tournamentName: typeof safeState.tournamentName === "string" ? safeState.tournamentName : "",
    broadcastTitle: typeof safeState.broadcastTitle === "string" ? safeState.broadcastTitle : "RONDA 1",
    headline: "",
    updatedAt: safeState.updatedAt ?? null,
    visibleSection: safeState.visibleSection || "rounds",
    totalInscritos: Number.isFinite(Number(safeState.totalInscritos)) ? Number(safeState.totalInscritos) : 0,
    roundsPhase: safeState.roundsPhase === "semifinal" ? "semifinal" : "rounds",
    currentRoundNumber: clampRound(safeState.currentRoundNumber ?? 1),
    currentSemifinalNumber: Math.min(20, clampRound(safeState.currentSemifinalNumber ?? 1)),
    currentRound: safeState.currentRound && typeof safeState.currentRound === "object" ? safeState.currentRound : {},
    rounds: safeState.rounds && typeof safeState.rounds === "object" ? safeState.rounds : {},
    semifinal: safeState.semifinal && typeof safeState.semifinal === "object" ? safeState.semifinal : {},
    tables: Array.isArray(safeState.tables) ? safeState.tables : [],
    ranking: Array.isArray(safeState.ranking) ? safeState.ranking : [],
    finalists: ensureFinalistsShape(safeState.finalists),
    podium: ensurePodiumShape(safeState.podium),
    secondaryPrizes: Array.isArray(safeState.secondaryPrizes) ? safeState.secondaryPrizes : [],
  };

  if (!applyDisplaySelection) {
    return next;
  }

  if (selectedTab === "rounds") {
    const groupNumber = selectedRoundNumber;
    next.visibleSection = "rounds";
    next.roundsPhase = "rounds";
    next.currentRoundNumber = groupNumber;
    next.broadcastTitle = "RONDA 1";
    next.currentRound = { name: `Grupo ${groupNumber}`, subtitle: "Mesas en juego", note: "" };
    next.rounds[String(groupNumber)] = ensureRoundShape(next.rounds[String(groupNumber)]);
    next.tables = deriveTablesFromGroup(groupNumber, next.rounds[String(groupNumber)]);
    return next;
  }

  if (selectedTab === "semifinal") {
    const groupNumber = selectedSemifinalNumber;
    next.visibleSection = "rounds";
    next.roundsPhase = "semifinal";
    next.currentSemifinalNumber = groupNumber;
    next.broadcastTitle = "SEMIFINAL";
    next.currentRound = { name: `Grupo ${groupNumber}`, subtitle: "Mesas en juego", note: "" };
    next.semifinal[String(groupNumber)] = ensureRoundShape(next.semifinal[String(groupNumber)]);
    next.tables = deriveTablesFromGroup(groupNumber, next.semifinal[String(groupNumber)]);
    return next;
  }

  next.visibleSection = selectedTab;
  return next;
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
    const editingTab = selectedTab;
    const editingRound = selectedRoundNumber;
    const editingSemifinal = selectedSemifinalNumber;

    const baseState = collectState({ applyDisplaySelection: false });
    const nextState = show ? collectState({ applyDisplaySelection: true }) : baseState;
    const savedState = await persistState(nextState);
    renderForm(savedState, {
      keepTab: editingTab,
      keepRoundNumber: editingRound,
      keepSemifinalNumber: editingSemifinal,
    });
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
  commitActiveTabEdits();
  handleSave({ show: false });
});

showButton.addEventListener("click", () => {
  commitActiveTabEdits();
  handleSave({ show: true });
});

function resetRankingPoints() {
  if (!currentState) return;

  currentState.rankingResetAt = `${new Date().toISOString()}-${Math.random().toString(16).slice(2)}`;
  currentState.globalRanking = [];

  const resetBucket = (bucket) => {
    if (!bucket || typeof bucket !== "object") return;
    Object.values(bucket).forEach((round) => {
      const normalized = ensureRoundShape(round);
      normalized.tables.forEach((table) => {
        table.players.forEach((player) => {
          player.points = 0;
        });
      });
      Object.assign(round, normalized);
    });
  };

  resetBucket(currentState.rounds);
  resetBucket(currentState.semifinal);
  if (Array.isArray(currentState.ranking)) currentState.ranking = [];
  currentState.finalists = ensureFinalistsShape(currentState.finalists).map((item) => ({
    ...item,
    points: 0,
  }));
  currentState.podium = ensurePodiumShape(currentState.podium).map((item) => ({
    ...item,
    points: 0,
  }));

  ensureStateRounds(currentState, selectedRoundNumber);
  ensureStateSemifinal(currentState, selectedSemifinalNumber);
}

if (resetRankingButton) {
  resetRankingButton.addEventListener("click", async () => {
    commitActiveTabEdits();
    const ok = window.confirm(
      "Esto pondrá en 0 los puntos de todos los jugadores (Grupos y Semifinal) y también Final/Podio. ¿Continuar?",
    );
    if (!ok) return;
    resetRankingPoints();
    if (selectedTab === "rounds" && roundTablesEditor) {
      renderGroupTables(selectedRoundNumber, roundTablesEditor, {
        sourceKey: "rounds",
        inputPrefix: "player",
        labelPrefix: "Grupo",
      });
    }
    if (selectedTab === "semifinal" && semifinalTablesEditor) {
      renderGroupTables(selectedSemifinalNumber, semifinalTablesEditor, {
        sourceKey: "semifinal",
        inputPrefix: "semi-player",
        labelPrefix: "Grupo",
      });
    }
    if (selectedTab === "final") renderFinalistsEditors(currentState.finalists);
    if (selectedTab === "podium") renderPodiumEditors(currentState.podium);
    await handleSave({ show: false });
  });
}

function clearAllGameData() {
  if (!currentState) return;

  currentState.rankingResetAt = `${new Date().toISOString()}-${Math.random().toString(16).slice(2)}`;
  currentState.globalRanking = [];

  const keepTournamentName = typeof currentState.tournamentName === "string" ? currentState.tournamentName : "";
  currentState.visibleSection = "rounds";
  currentState.roundsPhase = "rounds";
  currentState.totalInscritos = 0;
  currentState.currentRoundNumber = 1;
  currentState.currentSemifinalNumber = 1;

  currentState.rounds = {};
  currentState.semifinal = {};
  currentState.tables = [];
  currentState.ranking = [];

  currentState.finalists = ensureFinalistsShape([]).map((item) => ({ ...item, name: "", points: 0 }));
  currentState.podium = ensurePodiumShape([]).map((item) => ({ ...item, name: "", points: 0 }));
  currentState.tournamentName = keepTournamentName;

  ensureStateRounds(currentState, 1);
  ensureStateSemifinal(currentState, 1);
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toExportText(state) {
  const safeName = String(state?.tournamentName ?? "");
  const timestamp = new Date().toISOString();
  const json = JSON.stringify(state, null, 2);
  return `TORNEO: ${safeName}\nEXPORT: ${timestamp}\n\n${json}\n`;
}

if (deleteDataButton) {
  deleteDataButton.addEventListener("click", async () => {
    commitActiveTabEdits();
    const ok = window.confirm(
      "Esto eliminará todos los registros del juego (nombres y puntos) en Grupos, Semifinal, Final y Podio. ¿Continuar?",
    );
    if (!ok) return;

    const editingTab = selectedTab;
    const editingRound = selectedRoundNumber;
    const editingSemifinal = selectedSemifinalNumber;

    clearAllGameData();
    selectedRoundNumber = 1;
    selectedSemifinalNumber = 1;
    renderForm(currentState, {
      keepTab: editingTab,
      keepRoundNumber: 1,
      keepSemifinalNumber: 1,
    });
    await handleSave({ show: false });
  });
}

if (exportDataButton) {
  exportDataButton.addEventListener("click", () => {
    commitActiveTabEdits();
    const exported = collectState({ applyDisplaySelection: false });
    const stamp = new Date().toISOString().replaceAll(":", "-");
    downloadTextFile(`torneo-export-${stamp}.txt`, toExportText(exported));
  });
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    commitActiveTabEdits();
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
    commitGroupEdits({
      mode: "rounds",
      groupNumber: selectedRoundNumber,
      editorEl: roundTablesEditor,
      inputPrefix: "player",
    });
    selectedRoundNumber = clampRound(roundNumberSelect.value);
    ensureStateRounds(currentState, selectedRoundNumber);
    if (roundTablesEditor) {
      renderGroupTables(selectedRoundNumber, roundTablesEditor, {
        sourceKey: "rounds",
        inputPrefix: "player",
        labelPrefix: "Grupo",
      });
    }
  });
}

if (semifinalNumberSelect) {
  semifinalNumberSelect.addEventListener("change", () => {
    commitGroupEdits({
      mode: "semifinal",
      groupNumber: selectedSemifinalNumber,
      editorEl: semifinalTablesEditor,
      inputPrefix: "semi-player",
    });
    selectedSemifinalNumber = Math.min(20, clampRound(semifinalNumberSelect.value));
    ensureStateSemifinal(currentState, selectedSemifinalNumber);
    if (semifinalTablesEditor) {
      renderGroupTables(selectedSemifinalNumber, semifinalTablesEditor, {
        sourceKey: "semifinal",
        inputPrefix: "semi-player",
        labelPrefix: "Grupo",
      });
    }
  });
}

socket.on("state:update", (state) => {
  currentState = state;
  const visible = state.visibleSection || "rounds";
  if (visible === "rounds" && state.roundsPhase === "semifinal") {
    setVisibleStatus("semifinal");
    return;
  }
  setVisibleStatus(visible);
});

let liveHandlersAttached = false;

function attachLiveDraftHandlers() {
  if (liveHandlersAttached) return;
  liveHandlersAttached = true;

  form.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!currentState) return;

    if (target.name === "tournamentName") {
      currentState.tournamentName = String(target.value ?? "");
      return;
    }

    if (target.name === "totalInscritos") {
      currentState.totalInscritos = readIntFromInputValue(target.value, { min: 0 });
      return;
    }

    const match = String(target.name || "").match(
      /^(player|semi-player)-(name|points)-([A-D])-(\d+)$/,
    );
    if (match) {
      const [, prefix, field, tableId, playerIndexRaw] = match;
      const playerIndex = Number(playerIndexRaw);
      if (!Number.isFinite(playerIndex) || playerIndex < 0 || playerIndex > 6) return;

      const mode = prefix === "semi-player" ? "semifinal" : "rounds";
      const groupNumber = mode === "semifinal" ? selectedSemifinalNumber : selectedRoundNumber;

      if (mode === "semifinal") {
        ensureStateSemifinal(currentState, groupNumber);
      } else {
        ensureStateRounds(currentState, groupNumber);
      }

      const bucket = mode === "semifinal" ? currentState.semifinal : currentState.rounds;
      const round = bucket[String(groupNumber)];
      const table = round.tables.find((t) => t.id === tableId);
      if (!table) return;

      const player = table.players[playerIndex];
      if (!player) return;

      if (field === "name") {
        player.name = String(target.value ?? "");
      } else {
        player.points = readIntFromInputValue(target.value, { min: 0 });
      }
      return;
    }

    const finalistMatch = String(target.name || "").match(/^finalist-(name|points)-(\d+)$/);
    if (finalistMatch) {
      const [, field, indexRaw] = finalistMatch;
      const index = Number(indexRaw);
      if (!Number.isFinite(index) || index < 0 || index > 8) return;
      currentState.finalists = ensureFinalistsShape(currentState.finalists);
      if (field === "name") {
        currentState.finalists[index].name = String(target.value ?? "");
      } else {
        currentState.finalists[index].points = readIntFromInputValue(target.value, { min: 0 });
      }
      return;
    }

    const podiumMatch = String(target.name || "").match(/^podium-(name|points)-(\d+)$/);
    if (podiumMatch) {
      const [, field, indexRaw] = podiumMatch;
      const index = Number(indexRaw);
      if (!Number.isFinite(index) || index < 0 || index > 8) return;
      currentState.podium = ensurePodiumShape(currentState.podium);
      if (field === "name") {
        currentState.podium[index].name = String(target.value ?? "");
      } else {
        currentState.podium[index].points = readIntFromInputValue(target.value, { min: 0 });
      }
    }
  });
}

loadState()
  .then(() => {
    setStatus("Listo para editar", "");
    attachLiveDraftHandlers();
    setActiveTab(selectedTab);
  })
  .catch((error) => {
    console.error(error);
    setStatus("Error cargando datos", "error");
  });
