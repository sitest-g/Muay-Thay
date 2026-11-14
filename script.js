(() => {
  "use strict";

  const STORAGE_KEY = "round_sparring_v1";
  const $ = (id) => document.getElementById(id);
  const state = { rounds: loadRounds(), draftParticipants: [], activeRoundId: null, pendingConfirm: null };

  function loadRounds() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.rounds)); }
    catch { toast("Não foi possível salvar. Verifique o espaço disponível no navegador."); }
  }
  function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }
  function toast(message) {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2600);
  }
  function showView(id) {
    ["homeView", "setupView", "roundView"].forEach(view => $(view).classList.toggle("hidden", view !== id));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Método do círculo: para N ímpar, adiciona um participante fictício (BYE).
  // O atleta que enfrenta BYE faz a atividade alternativa naquela rodada.
  function generateSchedule(names) {
    const players = names.map((name, index) => ({ id: String(index), name }));
    const isOdd = players.length % 2 === 1;
    const ring = players.map(p => p.id);
    if (isOdd) ring.push("BYE");
    const total = ring.length - 1;
    const rotation = ring.slice();
    const rounds = [];

    for (let r = 0; r < total; r++) {
      const matches = [];
      let bag = null;
      for (let i = 0; i < rotation.length / 2; i++) {
        const a = rotation[i], b = rotation[rotation.length - 1 - i];
        if (a === "BYE") bag = b;
        else if (b === "BYE") bag = a;
        else matches.push({ a, b });
      }
      rounds.push({
        number: r + 1,
        matches,
        bag: bag === null ? null : bag,
        completed: false,
        completedAt: null
      });
      // Mantém a primeira posição fixa e gira as demais.
      rotation.splice(1, 0, rotation.pop());
    }
    return rounds;
  }

  function validateSchedule(names, rounds) {
    const expectedRounds = names.length % 2 === 0 ? names.length - 1 : names.length;
    if (rounds.length !== expectedRounds) return false;
    const expectedPairs = new Set();
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j < names.length; j++) expectedPairs.add(`${i}-${j}`);
    const seenPairs = new Set();
    const byes = new Map(names.map((_, i) => [String(i), 0]));

    for (const round of rounds) {
      const used = new Set();
      for (const match of round.matches) {
        if (match.a === match.b || used.has(match.a) || used.has(match.b)) return false;
        used.add(match.a); used.add(match.b);
        const key = [Number(match.a), Number(match.b)].sort((a,b) => a-b).join("-");
        if (seenPairs.has(key)) return false;
        seenPairs.add(key);
      }
      if (round.bag !== null) {
        if (used.has(round.bag) || !byes.has(round.bag)) return false;
        used.add(round.bag);
        byes.set(round.bag, byes.get(round.bag) + 1);
      }
      if (used.size !== names.length) return false;
    }
    if (seenPairs.size !== expectedPairs.size) return false;
    for (const count of byes.values()) if (names.length % 2 ? count !== 1 : count !== 0) return false;
    return true;
  }

  function startSetup() {
    state.draftParticipants = [];
    $("roundName").value = "";
    $("participantName").value = "";
    renderDraft();
    showView("setupView");
    $("roundName").focus();
  }
  function addParticipant() {
    const input = $("participantName");
    const name = input.value.trim().replace(/\s+/g, " ");
    if (!name) return toast("Digite o nome de um participante.");
    if (state.draftParticipants.some(p => p.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR")))
      return toast("Esse participante já está na lista.");
    if (state.draftParticipants.length >= 40) return toast("Limite de 40 participantes por Round.");
    state.draftParticipants.push(name);
    input.value = ""; input.focus(); renderDraft();
  }
  function renderDraft() {
    const list = $("participantList");
    list.innerHTML = state.draftParticipants.map((name, i) =>
      `<li class="participant-item"><span><strong>${String(i+1).padStart(2,"0")}</strong> &nbsp; ${escapeHtml(name)}</span><button class="remove-participant" data-remove="${i}" aria-label="Remover ${escapeHtml(name)}">×</button></li>`
    ).join("");
    $("participantCount").textContent = `${state.draftParticipants.length} ADICIONADOS`;
    $("createRoundBtn").disabled = state.draftParticipants.length < 2;
    $("setupHint").textContent = state.draftParticipants.length < 2 ? "Adicione pelo menos 2 participantes." : `${state.draftParticipants.length} atletas · ${state.draftParticipants.length % 2 ? state.draftParticipants.length : state.draftParticipants.length - 1} rodadas previstas.`;
  }
  function createRound() {
    const name = $("roundName").value.trim() || `Round ${state.rounds.length + 1}`;
    if (state.draftParticipants.length < 2) return toast("Adicione pelo menos 2 participantes.");
    const schedule = generateSchedule(state.draftParticipants);
    if (!validateSchedule(state.draftParticipants, schedule)) return toast("Falha na validação matemática. Round não criado.");
    const round = {
      id: uid(), name, createdAt: new Date().toISOString(),
      participants: [...state.draftParticipants], schedule, completedRounds: 0
    };
    state.rounds.unshift(round); save(); openRound(round.id);
  }

  function renderHome() {
    $("roundCount").textContent = `${state.rounds.length} ${state.rounds.length === 1 ? "ROUND" : "ROUNDS"}`;
    $("emptyState").classList.toggle("hidden", state.rounds.length > 0);
    $("roundList").innerHTML = state.rounds.map(round => {
      const total = round.schedule.length, done = round.completedRounds || 0, percent = Math.round(done / total * 100);
      const date = new Date(round.createdAt).toLocaleDateString("pt-BR");
      return `<article class="round-card" data-open="${round.id}" tabindex="0" role="button" aria-label="Abrir ${escapeHtml(round.name)}">
        <div><div class="round-card-top"><span class="eyebrow">SESSÃO · ${date}</span><span class="card-arrow">↗</span></div>
        <h3>${escapeHtml(round.name)}</h3><p>${round.participants.length} participantes · ${total} rodadas</p></div>
        <div><div class="round-card-bottom"><span>${done === total ? "CONCLUÍDO" : `${total-done} RODADAS RESTANTES`}</span><span>${percent}%</span></div><div class="mini-progress"><span style="width:${percent}%"></span></div></div>
      </article>`;
    }).join("");
  }

  function openRound(id) {
    state.activeRoundId = id;
    const round = getActiveRound();
    if (!round) return showView("homeView");
    showView("roundView"); renderRound();
  }
  function getActiveRound() { return state.rounds.find(r => r.id === state.activeRoundId); }
  function playerName(id) { const r = getActiveRound(); return r?.participants[Number(id)] ?? "—"; }

  function renderRound() {
    const round = getActiveRound(); if (!round) return;
    const total = round.schedule.length, done = round.completedRounds || 0;
    const percent = Math.round(done / total * 100);
    $("activeRoundName").textContent = round.name;
    $("roundMeta").textContent = `${round.participants.length} participantes · Criado em ${new Date(round.createdAt).toLocaleDateString("pt-BR")}`;
    $("progressText").textContent = `${done} / ${total}`;
    $("progressBar").style.width = `${percent}%`;
    $("progressPercent").textContent = `${percent}% concluído`;
    $("remainingText").textContent = done === total ? "SESSÃO FINALIZADA" : `${total-done} ${total-done === 1 ? "RODADA RESTANTE" : "RODADAS RESTANTES"}`;
    $("historyCount").textContent = `${done} CONCLUÍDAS`;
    $("roundComplete").classList.toggle("hidden", done !== total);
    $("currentRoundArea").classList.toggle("hidden", done === total);

    if (done < total) {
      const current = round.schedule[done];
      $("currentRoundNumber").textContent = current.number;
      $("totalRounds").textContent = `/ ${total}`;
      $("roundTag").textContent = done === 0 ? "PRIMEIRA RODADA" : "PRÓXIMA RODADA";
      $("matchGrid").innerHTML = current.matches.map((match, i) =>
        `<article class="match-card"><div class="match-top"><span>CHAVE ${String(i+1).padStart(2,"0")}</span><span>CONFRONTO</span></div><div class="match-vs"><span class="fighter">${escapeHtml(playerName(match.a))}</span><span class="versus">VS</span><span class="fighter">${escapeHtml(playerName(match.b))}</span></div></article>`
      ).join("");
      $("bagArea").classList.toggle("hidden", current.bag === null);
      if (current.bag !== null) $("bagName").textContent = playerName(current.bag);
      $("nextRoundBtn").textContent = done === 0 ? "INICIAR RODADA  →" : "PRÓXIMA RODADA  →";
    }
    renderHistory(round);
  }

  function renderHistory(round) {
    const done = round.schedule.slice(0, round.completedRounds || 0);
    $("historyEmpty").classList.toggle("hidden", done.length > 0);
    $("historyList").innerHTML = done.slice().reverse().map(r => {
      const pairs = r.matches.map(m => `<span class="history-chip">${escapeHtml(playerName(m.a))} × ${escapeHtml(playerName(m.b))}</span>`).join("");
      const bag = r.bag === null ? "" : `<span class="history-chip">SACO: ${escapeHtml(playerName(r.bag))}</span>`;
      const time = r.completedAt ? new Date(r.completedAt).toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"}) : "";
      return `<article class="history-item"><div class="history-summary"><span>RODADA ${r.number}</span><span>CONCLUÍDA ${time}</span></div><div class="history-details">${pairs}${bag}</div></article>`;
    }).join("");
  }

  function completeCurrentRound() {
    const round = getActiveRound(); if (!round) return;
    const index = round.completedRounds || 0;
    if (index >= round.schedule.length) return;
    round.schedule[index].completed = true;
    round.schedule[index].completedAt = new Date().toISOString();
    round.completedRounds = index + 1;
    save(); renderRound();
    if (round.completedRounds === round.schedule.length) toast("Round concluído. Todos os confrontos foram registrados!");
    else toast(`Rodada ${index + 1} registrada.`);
  }

  function confirmAction(title, message, callback) {
    $("dialogTitle").textContent = title; $("dialogText").textContent = message;
    state.pendingConfirm = callback; $("confirmDialog").showModal();
  }
  function deleteActiveRound() {
    const round = getActiveRound(); if (!round) return;
    state.rounds = state.rounds.filter(r => r.id !== round.id);
    state.activeRoundId = null; save(); renderHome(); showView("homeView"); toast("Round excluído.");
  }

  $("newRoundBtn").addEventListener("click", startSetup);
  const emptyCreateBtn = $("emptyCreateBtn");
  if (emptyCreateBtn) emptyCreateBtn.addEventListener("click", startSetup);
  $("setupBack").addEventListener("click", () => { renderHome(); showView("homeView"); });
  $("homeBrand").addEventListener("click", e => { e.preventDefault(); renderHome(); showView("homeView"); });
  const footerBrand = $("footerBrand");
  if (footerBrand) footerBrand.addEventListener("click", e => { e.preventDefault(); renderHome(); showView("homeView"); });
  $("addParticipantBtn").addEventListener("click", addParticipant);
  $("participantName").addEventListener("keydown", e => { if (e.key === "Enter") addParticipant(); });
  $("participantList").addEventListener("click", e => {
    const btn = e.target.closest("[data-remove]"); if (!btn) return;
    state.draftParticipants.splice(Number(btn.dataset.remove), 1); renderDraft();
  });
  $("createRoundBtn").addEventListener("click", createRound);
  $("roundBack").addEventListener("click", () => { renderHome(); showView("homeView"); });
  $("roundList").addEventListener("click", e => { const card = e.target.closest("[data-open]"); if (card) openRound(card.dataset.open); });
  $("roundList").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { const card = e.target.closest("[data-open]"); if (card) openRound(card.dataset.open); } });
  $("nextRoundBtn").addEventListener("click", completeCurrentRound);
  $("deleteRoundBtn").addEventListener("click", () => {
    const round = getActiveRound(); if (!round) return;
    confirmAction("Excluir este Round?", `“${round.name}” e todo o seu histórico serão removidos deste navegador.`, deleteActiveRound);
  });
  $("dialogConfirm").addEventListener("click", () => { const fn = state.pendingConfirm; state.pendingConfirm = null; if (fn) fn(); });
  $("confirmDialog").addEventListener("close", () => { state.pendingConfirm = null; });

  renderHome();
  showView("homeView");

  // Disponibiliza o algoritmo para testes automatizados no Node, sem afetar o navegador.
  if (typeof module !== "undefined" && module.exports) module.exports = { generateSchedule, validateSchedule };
})();