const socket = io();

const nodes = {
  tournamentName: document.getElementById("tournamentName"),
  broadcastTitle: document.getElementById("broadcastTitle"),
  headline: document.getElementById("headline"),
  hero: document.querySelector(".hero"),
  viewRounds: document.getElementById("viewRounds"),
  viewFinal: document.getElementById("viewFinal"),
  viewPodium: document.getElementById("viewPodium"),
  roundsTemplate: document.getElementById("roundsTemplate"),
  finalTemplate: document.getElementById("finalTemplate"),
  podiumTemplate: document.getElementById("podiumTemplate"),
  roundTitle: document.getElementById("roundTitle"),
  roundsRanking: document.getElementById("roundsRanking"),
  roundNote: document.getElementById("roundNote"),
  tableGrid: document.getElementById("tableGrid"),
  rankingListFinal: document.getElementById("rankingListFinal"),
  finalistsList: document.getElementById("finalistsList"),
  podium: document.getElementById("podium"),
  secondaryPrizes: document.getElementById("secondaryPrizes"),
  updatedAt: document.getElementById("updatedAt"),
};

let currentState = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTimestamp(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function getRoundsPhase(state) {
  const phase = String(state?.roundsPhase ?? "rounds");
  return phase === "semifinal" ? "semifinal" : "rounds";
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

function renderTables(tables, groupNumber) {
  nodes.tableGrid.innerHTML = tables
    .map(
      (table, index) => {
        const safeGroup = Number.isFinite(Number(groupNumber)) ? Number(groupNumber) : 1;
        const mesaLabel = excelColumnLabel((safeGroup - 1) * 4 + (index + 1));
        const players = Array.isArray(table.players) ? table.players : [];
        const normalizedPlayers = Array.from({ length: 7 }).map((_, i) => {
          const p = players[i] || {};
          return {
            name: typeof p.name === "string" ? p.name : "",
            points: Number.isFinite(Number(p.points)) ? Number(p.points) : 0,
          };
        });

        function renderRow(player, place) {
          return `
            <div class="mesa-player-row">
              <span class="mesa-player-pos">${place}</span>
              <span class="mesa-player-name">${escapeHtml(player.name)}</span>
              <span class="mesa-player-points">${escapeHtml(player.points)} pts</span>
            </div>
          `;
        }

        const left = normalizedPlayers.slice(0, 4).map((p, i) => renderRow(p, i + 1)).join("");
        const right = normalizedPlayers
          .slice(4)
          .map((p, i) => renderRow(p, i + 5))
          .join("");

        return `
        <div class="mesa-overlay" data-id="${escapeHtml(table.id)}">
          <div class="mesa-number-marker">${escapeHtml(mesaLabel)}</div>
          <div class="mesa-players-grid">
            <div class="mesa-players-col">
              ${left}
            </div>
            <div class="mesa-players-col is-right">
              ${right}
            </div>
          </div>
        </div>
      `;
      },
    )
    .join("");
}

function renderRankingFinal(ranking) {
  if (!nodes.rankingListFinal) return;
  nodes.rankingListFinal.innerHTML = ranking
    .map(
      (item) => `
        <div class="ranking-item">
          <div class="rank-number">${escapeHtml(item.position)}</div>
          <div>${escapeHtml(item.name)}</div>
          <div class="points-chip">${escapeHtml(item.points)} pts</div>
        </div>
      `,
    )
    .join("");
}

function renderFinalists(finalists) {
  if (!nodes.finalistsList) return;
  const list = Array.isArray(finalists) ? finalists : [];
  const normalized = Array.from({ length: 9 }).map((_, index) => {
    const item = list[index] || {};
    return {
      position: index + 1,
      name: typeof item.name === "string" ? item.name : "",
      points: Number.isFinite(Number(item.points)) ? Number(item.points) : 0,
    };
  });

  const row1 = normalized.slice(0, 3);
  const row2 = normalized.slice(3, 6);
  const row3 = normalized.slice(6, 9);

  function cardMarkup(item) {
    return `
      <div class="finalist-card">
        <div class="finalist-name">
          <span class="finalist-pos">${escapeHtml(item.position)}</span>
          <span class="finalist-name-text">${escapeHtml(item.name)}</span>
        </div>
        <div class="finalist-points">${escapeHtml(item.points)} pts</div>
      </div>
    `;
  }

  nodes.finalistsList.innerHTML = `
    <div class="finalists-grid">
      <div class="finalists-row is-top">
        ${row1.map(cardMarkup).join("")}
      </div>
      <div class="finalists-row is-middle">
        ${row2.map(cardMarkup).join("")}
      </div>
      <div class="finalists-row is-bottom">
        ${row3.map(cardMarkup).join("")}
      </div>
    </div>
  `;
}

function renderPodium(podium) {
  if (!nodes.podium) return;
  const list = Array.isArray(podium) ? podium : [];
  const byPosition = new Map();
  list.forEach((item) => {
    const position = Number(item?.position);
    if (!Number.isFinite(position)) return;
    const normalized = Math.trunc(position);
    if (normalized < 1 || normalized > 9) return;
    if (byPosition.has(normalized)) return;
    byPosition.set(normalized, item);
  });

  const normalized = Array.from({ length: 9 }).map((_, index) => {
    const position = index + 1;
    const item = byPosition.get(position) || {};
    return {
      position,
      name: typeof item.name === "string" ? item.name : "",
      points: Number.isFinite(Number(item.points)) ? Number(item.points) : 0,
    };
  });

  function slotMarkup(item) {
    const showPosition = item.position >= 4;
    return `
      <div class="podium-overlay" data-pos="${escapeHtml(item.position)}">
        <div class="podium-line">
          ${showPosition ? `<span class="podium-place">${escapeHtml(item.position)}</span>` : ""}
          <span class="podium-name">${escapeHtml(item.name)}</span>
          <span class="podium-points">${escapeHtml(item.points)} pts</span>
        </div>
      </div>
    `;
  }

  nodes.podium.innerHTML = normalized.map(slotMarkup).join("");
}

function renderSecondaryPrizes(prizes) {
  if (!nodes.secondaryPrizes) return;
  nodes.secondaryPrizes.innerHTML = prizes
    .map(
      (prize) => `
        <div class="prize-card">
          <strong>${escapeHtml(prize.label)}</strong>
          <div>${escapeHtml(prize.prize)}</div>
        </div>
      `,
    )
    .join("");
}

function applyVisibleSection(section) {
  const normalized = section || "rounds";
  nodes.viewRounds.classList.toggle("is-hidden", normalized !== "rounds");
  nodes.viewFinal.classList.toggle("is-hidden", normalized !== "final");
  nodes.viewPodium.classList.toggle("is-hidden", normalized !== "podium");
  document.body.classList.toggle(
    "mode-rounds-template",
    normalized === "rounds" || normalized === "final" || normalized === "podium",
  );
  if (nodes.hero) nodes.hero.classList.toggle("is-hidden", normalized === "rounds" || normalized === "final" || normalized === "podium");
}

function getRoundNumber(state) {
  const phase = getRoundsPhase(state);
  const direct =
    phase === "semifinal" ? state.currentSemifinalNumber : state.currentRoundNumber;
  if (Number.isFinite(Number(direct))) return Number(direct);

  const fromName = String(state.currentRound?.name ?? "");
  const fromTitle = String(state.broadcastTitle ?? "");
  const match = `${fromName} ${fromTitle}`.match(/(\d+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeRoundsTemplateUrl(state) {
  const roundNumber = getRoundNumber(state);
  if (getRoundsPhase(state) === "semifinal") {
    return `/assets/backgrounds/${encodeURIComponent("rondas.png")}`;
  }
  if (roundNumber === 1) return `/assets/backgrounds/${encodeURIComponent("ronda 1.png")}`;
  if (roundNumber && roundNumber > 1) return `/assets/backgrounds/${encodeURIComponent("rondas.png")}`;
  return `/assets/backgrounds/${encodeURIComponent("rondas.png")}`;
}

function computeFinalTemplateUrl() {
  return `/assets/backgrounds/${encodeURIComponent("tabla finalistas.png")}`;
}

function computePodiumTemplateUrl() {
  return `/assets/backgrounds/${encodeURIComponent("tabla final.png")}`;
}

function getRoundTables(state, roundNumber) {
  const key = String(roundNumber);
  const phase = getRoundsPhase(state);
  const source = phase === "semifinal" ? state.semifinal : state.rounds;
  const roundTables = source?.[key]?.tables;
  if (Array.isArray(roundTables) && roundTables.length) {
    const order = ["A", "B", "C", "D"];
    return [...roundTables].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }

  const legacy = Array.isArray(state.tables) ? state.tables : [];
  if (!legacy.length) return [];

  return legacy.map((t) => {
    const names = String(t.players ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      id: t.id,
      players: Array.from({ length: 7 }).map((_, i) => ({
        name: names[i] || "",
        points: 0,
      })),
    };
  });
}

function computeRankingFromRoundTables(tables) {
  const pointsByName = new Map();

  tables.forEach((t) => {
    const players = Array.isArray(t.players) ? t.players : [];
    players.forEach((p) => {
      const name = String(p?.name ?? "").trim();
      if (!name) return;
      const points = Number(p?.points || 0);
      pointsByName.set(name, (pointsByName.get(name) || 0) + (Number.isFinite(points) ? points : 0));
    });
  });

  return Array.from(pointsByName.entries())
    .map(([name, points]) => ({ name, points }))
    .sort((a, b) => b.points - a.points);
}

let lastRankingKey = "";
let lastRankingResetAt = null;
let rankingAnimationFrameId = null;
let rankingLastFrameTime = 0;
let rankingOffsetPx = 0;
let rankingScrollHeightPx = 0;

function applyRankingReset(state) {
  const resetAt = typeof state?.rankingResetAt === "string" ? state.rankingResetAt : "";
  if (!resetAt) return;
  if (resetAt === lastRankingResetAt) return;
  lastRankingResetAt = resetAt;

  try {
    const key = "torneoBaccarat:rankingResetAt";
    localStorage.setItem(key, resetAt);
    localStorage.removeItem("torneoBaccarat:globalRanking");
    localStorage.removeItem("torneoBaccarat:globalRanking:rounds");
    localStorage.removeItem("torneoBaccarat:globalRanking:semifinal");

    lastRankingKey = "";
  } catch {}
}

function stopRankingAnimation() {
  if (rankingAnimationFrameId) {
    cancelAnimationFrame(rankingAnimationFrameId);
    rankingAnimationFrameId = null;
  }
  rankingLastFrameTime = 0;
}

function startRankingAnimation(viewportEl, trackEl) {
  stopRankingAnimation();
  if (!viewportEl || !trackEl) return;

  const speedPxPerSecond = 22;

  function tick(now) {
    if (!rankingLastFrameTime) rankingLastFrameTime = now;
    const deltaSeconds = Math.min(0.05, (now - rankingLastFrameTime) / 1000);
    rankingLastFrameTime = now;

    if (rankingScrollHeightPx > 0) {
      rankingOffsetPx += speedPxPerSecond * deltaSeconds;
      if (rankingOffsetPx >= rankingScrollHeightPx) {
        rankingOffsetPx -= rankingScrollHeightPx;
      }
      trackEl.style.transform = `translateY(-${rankingOffsetPx}px)`;
    }

    rankingAnimationFrameId = requestAnimationFrame(tick);
  }

  rankingAnimationFrameId = requestAnimationFrame(tick);
}

function computeRankingFromAllRounds(state) {
  const phase = getRoundsPhase(state);
  const rounds = state.rounds && typeof state.rounds === "object" ? state.rounds : {};
  const semifinal = state.semifinal && typeof state.semifinal === "object" ? state.semifinal : {};
  const allTables = [];

  const buckets = phase === "semifinal" ? [semifinal] : [rounds];
  buckets.forEach((bucket) => {
    Object.values(bucket || {}).forEach((round) => {
      const tables = Array.isArray(round?.tables) ? round.tables : [];
      tables.forEach((t) => allTables.push(t));
    });
  });
  return computeRankingFromRoundTables(allTables);
}

function renderRoundsRanking(ranking, { visibleSection }) {
  if (!nodes.roundsRanking) return;

  const phase = getRoundsPhase(currentState || {});
  const groupNumber = getRoundNumber(currentState || {});
  const shouldShow =
    visibleSection === "rounds" && (phase === "semifinal" || groupNumber >= 2);
  nodes.roundsRanking.classList.toggle("is-hidden", !shouldShow);
  if (!shouldShow) {
    nodes.roundsRanking.innerHTML = "";
    stopRankingAnimation();
    return;
  }

  const sorted = [...(ranking || [])].sort((a, b) => (b.points || 0) - (a.points || 0));
  const key = sorted
    .map((item) => `${String(item.name)}:${Number(item.points || 0)}`)
    .join("|");

  const needsReset = key !== lastRankingKey;
  lastRankingKey = key;

  const viewportMarkup = `
    <div class="rounds-ranking-viewport" id="roundsRankingViewport">
      <div class="rounds-ranking-track" id="roundsRankingTrack"></div>
    </div>
  `;

  if (!nodes.roundsRanking.querySelector("#roundsRankingViewport")) {
    nodes.roundsRanking.innerHTML = viewportMarkup;
  }

  const viewportEl = nodes.roundsRanking.querySelector("#roundsRankingViewport");
  const trackEl = nodes.roundsRanking.querySelector("#roundsRankingTrack");
  if (!viewportEl || !trackEl) return;

  const visibleCount = 10;
  const list = sorted.map((item, index) => ({ position: index + 1, ...item }));

  const content =
    list.length <= visibleCount
      ? [
          ...list,
          ...Array.from({ length: visibleCount - list.length }).map(() => ({
            position: "",
            name: "",
            points: "",
          })),
        ]
      : [...list, ...list];

  if (needsReset) {
    rankingOffsetPx = 0;
  }

  trackEl.innerHTML = content
    .map(
      (item) => `
        <div class="rounds-ranking-item">
          <span class="rounds-ranking-pos">${escapeHtml(item.position)}</span>
          <span class="rounds-ranking-name">${escapeHtml(item.name)}</span>
          <span class="rounds-ranking-points">${escapeHtml(item.points)}${item.points === "" ? "" : " pts"}</span>
        </div>
      `,
    )
    .join("");

  const rowHeight = Math.floor(viewportEl.clientHeight / visibleCount);
  viewportEl.style.setProperty("--rank-row-height", `${rowHeight}px`);
  rankingScrollHeightPx = list.length > visibleCount ? rowHeight * list.length : 0;

  if (list.length > visibleCount) {
    startRankingAnimation(viewportEl, trackEl);
  } else {
    stopRankingAnimation();
    trackEl.style.transform = "translateY(0)";
  }
}

function renderState(state) {
  currentState = state;
  const roundNumber = getRoundNumber(state);
  const phase = getRoundsPhase(state);

  applyRankingReset(state);

  if (nodes.roundTitle) {
    const isRound1 = roundNumber === 1;
    nodes.roundTitle.classList.toggle("is-hidden", isRound1);
    if (phase === "semifinal") {
      nodes.roundTitle.classList.toggle("is-hidden", false);
      nodes.roundTitle.textContent = "SEMIFINAL";
    } else if (!isRound1) {
      nodes.roundTitle.textContent = "RONDA 1";
    }
  }

  if (nodes.tournamentName) nodes.tournamentName.textContent = state.tournamentName;
  if (nodes.broadcastTitle) nodes.broadcastTitle.textContent = state.broadcastTitle;
  if (nodes.headline) {
    const headline = String(state.headline ?? "").trim();
    nodes.headline.textContent = headline;
    nodes.headline.style.display = headline ? "" : "none";
  }
  if (nodes.roundNote) {
    const total = Number(state.totalInscritos || 0);
    const label = getRoundsPhase(state) === "semifinal" ? "TOTAL CLASIFICADOS" : "TOTAL DE INSCRITOS";
    nodes.roundNote.textContent = `${label}: ${Number.isFinite(total) ? total : 0}`;
  }
  if (nodes.updatedAt) nodes.updatedAt.textContent = formatTimestamp(state.updatedAt);

  if (nodes.roundsTemplate) {
    const url = computeRoundsTemplateUrl(state);
    nodes.roundsTemplate.style.setProperty(
      "--rounds-template-url",
      url ? `url("${url}")` : "none",
    );
    const phase = getRoundsPhase(state);
    const isRondas = phase === "semifinal" ? true : Boolean(roundNumber && roundNumber >= 2);
    nodes.roundsTemplate.classList.toggle("has-ranking", isRondas);
    nodes.roundsTemplate.classList.toggle("template-round1", phase !== "semifinal" && roundNumber === 1);
    nodes.roundsTemplate.classList.toggle("template-rondas", phase === "semifinal" || isRondas || !roundNumber);
    nodes.roundsTemplate.classList.toggle("template-semifinal", phase === "semifinal");
  }

  if (nodes.finalTemplate) {
    const url = computeFinalTemplateUrl();
    nodes.finalTemplate.style.setProperty(
      "--final-template-url",
      url ? `url("${url}")` : "none",
    );
  }

  if (nodes.podiumTemplate) {
    const url = computePodiumTemplateUrl();
    nodes.podiumTemplate.style.setProperty(
      "--podium-template-url",
      url ? `url("${url}")` : "none",
    );
  }

  const safeRoundNumber = roundNumber || 1;
  const roundTables = getRoundTables(state, safeRoundNumber);
  renderTables(roundTables, safeRoundNumber);

  let computedRanking = computeRankingFromAllRounds(state);

  const rankingStorageKey =
    phase === "semifinal"
      ? "torneoBaccarat:globalRanking:semifinal"
      : "torneoBaccarat:globalRanking:rounds";

  if (computedRanking.length) {
    try {
      localStorage.setItem(rankingStorageKey, JSON.stringify(computedRanking));
    } catch {}
  } else {
    try {
      if (typeof state?.rankingResetAt === "string" && state.rankingResetAt) throw new Error("skip");
      const stored = JSON.parse(localStorage.getItem(rankingStorageKey) || "null");
      if (Array.isArray(stored)) computedRanking = stored;
    } catch {}
  }

  renderRoundsRanking(computedRanking, { visibleSection: state.visibleSection });
  renderRankingFinal(state.ranking);
  renderFinalists(state.finalists);
  renderPodium(state.podium);
  renderSecondaryPrizes(state.secondaryPrizes);
  applyVisibleSection(state.visibleSection);
}

async function loadInitialState() {
  const response = await fetch("/api/state");
  const state = await response.json();
  renderState(state);
}

socket.on("state:update", (state) => {
  renderState(state);
});

loadInitialState().catch((error) => {
  console.error("No fue posible cargar el estado inicial", error);
});
