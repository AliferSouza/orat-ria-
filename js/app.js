import { obter, todos, salvar, remover, limparStore, exportarTudo, importarTudo } from "./db.js";
import { EXERCICIOS, DICAS } from "./conteudo.js";
import { CONQUISTAS, verificarConquistas } from "./conquistas.js";
import { sortearImproviso } from "./improviso.js";

// ─── Utilitários ─────────────────────────────────────────────
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const principal = $("#principal");
let rotaAtual = "";
let promptInstalar = null;
let toastTimer;

// ─── Estado de Gravação ───────────────────────────────────────
let gravador = null, partes = [], stream = null;
let inicioGravacao = 0, tempoPausadoTotal = 0, momentoPausa = 0;
let gravacaoTimer = null;
let audioCtx = null, analyser = null, animFrame = null;

// ─── Estado de rascunho e alterações não salvas ───────────────
let rascunhoTimer = null;
let temAlteracoesNaoSalvas = false;

// ─── Áudio compartilhado (bips) ───────────────────────────────
let bipCtx = null;
function getBipCtx() {
  if (!bipCtx) {
    bipCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return bipCtx;
}

// ─── Estado de Cronômetro ────────────────────────────────────
let cronometroInterval = null;
let cronometroSegundos = 0;
let cronometroAtivo = false;

// ─── Estado do Metrônomo ─────────────────────────────────────
let metronomoInterval = null;
let metronomoAtivo = false;
let metronomoCtx = null;

// ─── Estado do Teleprompter ───────────────────────────────────
let teleprompterInterval = null;
let teleprompterAtivo = false;
let teleprompterPosicao = 0;
let teleprompterGravandoSimultaneo = false;

// ─── Object URLs criadas (para evitar memory leak) ────────────
const objectUrls = new Set();
function criarURL(blob) {
  const url = URL.createObjectURL(blob);
  objectUrls.add(url);
  return url;
}
function revogarTodasURLs() {
  for (const url of objectUrls) {
    try { URL.revokeObjectURL(url); } catch (e) { /* já revogado */ }
  }
  objectUrls.clear();
}

// ─── Data helpers ────────────────────────────────────────────
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const id = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const escapar = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ─── Toast ────────────────────────────────────────────────────
function toast(msg, duracao = 3000) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.add("visivel");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("visivel"), duracao);
}

// ─── Builders ────────────────────────────────────────────────
function btn(texto, acao, classe = "") {
  return `<button class="btn ${classe}" type="button" data-acao="${acao}">${escapar(texto)}</button>`;
}
function pagina(titulo, sub = "", conteudo = "") {
  return `<section class="pagina"><div class="linha entre"><div><p class="eyebrow muted">ORATÓRIA DIÁRIA</p><h1>${escapar(titulo)}</h1>${sub ? `<p class="muted">${escapar(sub)}</p>` : ""}</div></div>${conteudo}</section>`;
}
function card(titulo, conteudo, extra = "") {
  return `<section class="card ${extra}"><h2>${titulo}</h2>${conteudo}</section>`;
}

// ─── Perfil ───────────────────────────────────────────────────
async function perfil() {
  return await obter("perfil", "principal") || { id: "principal", nome: "", metaMinutos: 10, tema: "claro", dias: [] };
}

// ─── Streak ──────────────────────────────────────────────────
function calcularStreak(atividades) {
  if (!atividades.length) return { atual: 0, melhor: 0, praticouHoje: false };
  const datasUnicas = [...new Set(atividades.map(a => a.data))].sort().reverse();
  const hojeStr = hoje();
  const ontemDate = new Date(); ontemDate.setDate(ontemDate.getDate() - 1);
  const ontemStr = `${ontemDate.getFullYear()}-${String(ontemDate.getMonth() + 1).padStart(2, "0")}-${String(ontemDate.getDate()).padStart(2, "0")}`;
  const praticouHoje = datasUnicas.includes(hojeStr);
  const praticouOntem = datasUnicas.includes(ontemStr);
  let atual = 0;
  if (praticouHoje || praticouOntem) {
    let dataEsperada = new Date(praticouHoje ? hojeStr : ontemStr);
    for (const d of datasUnicas) {
      const esperadaStr = `${dataEsperada.getFullYear()}-${String(dataEsperada.getMonth() + 1).padStart(2, "0")}-${String(dataEsperada.getDate()).padStart(2, "0")}`;
      if (d === esperadaStr) { atual++; dataEsperada.setDate(dataEsperada.getDate() - 1); }
      else if (d < esperadaStr) break;
    }
  }
  const datasAsc = [...datasUnicas].sort();
  let melhor = datasAsc.length ? 1 : 0, seqTemp = 1;
  for (let i = 1; i < datasAsc.length; i++) {
    const diff = Math.round((new Date(datasAsc[i]) - new Date(datasAsc[i - 1])) / 86400000);
    if (diff === 1) { seqTemp++; if (seqTemp > melhor) melhor = seqTemp; }
    else if (diff > 1) seqTemp = 1;
  }
  if (atual > melhor) melhor = atual;
  return { atual, melhor, praticouHoje };
}

// ─── Conquistas ──────────────────────────────────────────────
async function verificarERegistrarConquistas() {
  const [atividades, gravacoes, textos] = await Promise.all([
    todos("atividades"),
    todos("gravacoes"),
    todos("textos"),
  ]);
  const streak = calcularStreak(atividades);
  const registradas = await todos("conquistas");
  const jaIds = registradas.map(c => c.id);
  const { novas } = verificarConquistas({ atividades, gravacoes, textos, streak }, jaIds);
  for (const c of novas) {
    await salvar("conquistas", { id: c.id, data: new Date().toISOString() });
    setTimeout(() => toast(`🏆 Nova conquista: ${c.emoji} ${c.titulo}!`, 4500), 500);
  }
  return novas;
}

// ─── TELA: INÍCIO ─────────────────────────────────────────────
async function renderInicio() {
  revogarTodasURLs();
  const [p, atividades, gravacoes] = await Promise.all([
    obter("perfil", "principal"),
    todos("atividades"),
    todos("gravacoes"),
  ]);
  const perfilData = p || { id: "principal", nome: "", metaMinutos: 10, tema: "claro", dias: [] };
  const hojeAt = atividades.filter(a => a.data === hoje());
  const minutos = hojeAt.reduce((n, a) => n + (a.minutos || 0), 0);
  const meta = Number(perfilData.metaMinutos || 10);
  const cumpriu = minutos >= meta;
  const streak = calcularStreak(atividades);
  const nome = perfilData.nome ? `, ${escapar(perfilData.nome)}` : "";
  const streakMsg = streak.atual > 0 ? `${streak.atual} dia${streak.atual > 1 ? "s" : ""} seguido${streak.atual > 1 ? "s" : ""}` : "Comece hoje";
  const registradas = await todos("conquistas");
  const qtdConquistas = registradas.length;

  principal.innerHTML = pagina("Início", "Seu espaço pessoal de comunicação e prática", `
  <section class="hero">
    <span class="eyebrow">UM PASSO DE CADA VEZ</span>
    <h1>Treine sua comunicação${nome}.</h1>
    <p>Oratória, improviso, escrita e voz — tudo no seu ritmo, com dados apenas no seu dispositivo.</p>
    <div class="linha">
      ${btn("🎯 Praticar", "ir-praticar")}
      ${btn("🎲 Improvisação", "ir-improviso", "btn-secundario")}
      ${btn("📜 Teleprompter", "ir-teleprompter", "btn-secundario")}
      ${btn("🎙️ Gravar", "ir-gravacoes", "btn-secundario")}
    </div>
  </section>

  <div class="grid quatro">
    <div class="card">
      <p class="muted">Prática de hoje</p>
      <div class="numero">${minutos}<small style="font-size:1rem;font-weight:400"> min</small></div>
      <div class="progresso"><span style="width:${Math.min(100, (minutos / Math.max(1, meta)) * 100)}%"></span></div>
      <small class="muted">Meta: ${meta} min</small>
    </div>
    <div class="card card-destaque">
      <p class="muted">Sequência 🔥</p>
      <div class="numero">${streak.atual}d</div>
      <small class="muted">${streakMsg} · Recorde: ${streak.melhor}d</small>
    </div>
    <div class="card">
      <p class="muted">Atividades</p>
      <div class="numero">${atividades.length}</div>
      <small class="muted">Gravações: ${gravacoes.length}</small>
    </div>
    <div class="card" style="cursor:pointer" data-acao="ir-conquistas">
      <p class="muted">Conquistas 🏆</p>
      <div class="numero">${qtdConquistas}<small style="font-size:1rem;font-weight:400">/${CONQUISTAS.length}</small></div>
      <small class="muted" style="color:var(--pri)">Ver todas →</small>
    </div>
  </div>

  ${cumpriu
    ? '<div class="aviso ok"><strong>🎉 Meta alcançada!</strong> Parabéns pelo dia de prática. Você pode continuar ou descansar.</div>'
    : `<div class="aviso">Praticar ${Math.max(1, meta - minutos)} minuto(s) hoje mantém sua sequência ativa e seu desenvolvimento constante.</div>`}

  <div class="grid dois">
    ${card("💡 Sugestão do dia", `
      <p><strong>${escapar(EXERCICIOS[new Date().getDate() % EXERCICIOS.length].titulo)}</strong></p>
      <p>${escapar(EXERCICIOS[new Date().getDate() % EXERCICIOS.length].descricao)}</p>
      ${btn("Abrir exercício", "ir-praticar")}
    `)}
    ${card("🗣️ Dica de comunicação", `
      <p><strong>${escapar(DICAS[new Date().getDate() % DICAS.length].titulo)}</strong></p>
      <p>${escapar(DICAS[new Date().getDate() % DICAS.length].texto)}</p>
      <span class="tag">Dica rápida</span>
    `)}
  </div>`);
}

// ─── TELA: PRATICAR ───────────────────────────────────────────
async function renderPraticar() {
  revogarTodasURLs();
  const feitas = await todos("atividades");
  principal.innerHTML = pagina("Praticar", "Exercícios guiados com cronômetro integrado.", `
  <div class="grid dois">
    ${EXERCICIOS.map(e => `
      <article class="card">
        <div class="linha entre">
          <span class="tag">${escapar(e.tipo)}</span>
          <small class="muted">⏱️ ${e.tempo} min</small>
        </div>
        <h2>${escapar(e.titulo)}</h2>
        <p>${escapar(e.descricao)}</p>
        <ul>${e.passos.map(p => `<li>${escapar(p)}</li>`).join("")}</ul>
        <div class="linha entre" style="margin-top:1rem">
          ${btn("Abrir e praticar", "abrir-exercicio")}
          <input type="hidden" value="${e.id}" data-exercicio-id="${e.id}">
          <small class="muted">${feitas.some(a => a.exercicioId === e.id && a.data === hoje()) ? "✅ Praticado hoje" : "Disponível"}</small>
        </div>
      </article>`).join("")}
  </div>
  <div id="area-exercicio" class="card oculto" style="margin-top:1.5rem"></div>`);
}

function abrirExercicio(exercicioId) {
  const e = EXERCICIOS.find(x => x.id === exercicioId);
  if (!e) return;
  const area = $("#area-exercicio");
  area.classList.remove("oculto");
  area.dataset.id = e.id;
  pararCronometro(); cronometroSegundos = 0;
  area.innerHTML = `
    <div class="linha entre">
      <div><span class="tag">${escapar(e.tipo)}</span><h2>${escapar(e.titulo)}</h2></div>
      ${btn("Fechar", "fechar-exercicio", "btn-secundario btn-pequeno")}
    </div>
    <p>${escapar(e.descricao)}</p>
    <div class="cronometro-box">
      <p class="muted">Cronômetro (Sugerido: <strong>${e.tempo} min</strong>)</p>
      <div id="cronometro-display" class="cronometro-display">00:00</div>
      <div class="linha" style="justify-content:center">
        <button id="cronometro-toggle" class="btn btn-pequeno" type="button">▶ Iniciar</button>
        <button id="cronometro-zerar" class="btn btn-secundario btn-pequeno" type="button">↺ Zerar</button>
      </div>
      <p id="cronometro-status" class="muted" style="margin-top:.5rem;font-size:.85rem">Inicie para medir sua prática.</p>
    </div>
    <h3>Etapas</h3>
    <div class="checklist">
      ${e.passos.map((p, i) => `<label><input type="checkbox" data-passo="${i}"><span>${escapar(p)}</span></label>`).join("")}
    </div>
    <div class="campo">
      <label for="reflexao">O que você percebeu? (opcional)</label>
      <textarea id="reflexao" placeholder="Ex.: Fiz mais pausas, minha voz soou mais firme..."></textarea>
    </div>
    <div class="linha">
      ${btn("✅ Concluir e registrar", "concluir-exercicio")}
      ${btn("Cancelar", "fechar-exercicio", "btn-secundario")}
    </div>`;
  configurarEventosCronometro(e.tempo);
  area.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

function configurarEventosCronometro(tempoMinutos) {
  const display = $("#cronometro-display"), toggleBtn = $("#cronometro-toggle"),
        zerarBtn = $("#cronometro-zerar"), statusEl = $("#cronometro-status");
  const metaSegundos = tempoMinutos * 60;
  const att = () => { display.textContent = `${String(Math.floor(cronometroSegundos / 60)).padStart(2, "0")}:${String(cronometroSegundos % 60).padStart(2, "0")}`; };
  toggleBtn.onclick = () => {
    if (!cronometroAtivo) {
      cronometroAtivo = true; toggleBtn.textContent = "⏸ Pausar"; toggleBtn.classList.add("btn-aviso");
      statusEl.textContent = "Cronômetro correndo…";
      cronometroInterval = setInterval(() => {
        cronometroSegundos++; att();
        if (cronometroSegundos === metaSegundos) { tocarBip(); statusEl.innerHTML = `<strong>🎉 ${tempoMinutos} min atingidos!</strong>`; }
      }, 1000);
    } else {
      pararCronometro(); toggleBtn.textContent = "▶ Retomar"; toggleBtn.classList.remove("btn-aviso"); statusEl.textContent = "Pausado.";
    }
  };
  zerarBtn.onclick = () => {
    pararCronometro(); cronometroSegundos = 0; att();
    toggleBtn.textContent = "▶ Iniciar"; toggleBtn.classList.remove("btn-aviso"); statusEl.textContent = "Zerado.";
  };
}

function pararCronometro() {
  if (cronometroInterval) { clearInterval(cronometroInterval); cronometroInterval = null; }
  cronometroAtivo = false;
}

function tocarBip(freq = 587.33, dur = 0.6, vol = 0.2) {
  try {
    const ctx = getBipCtx();
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
  } catch (e) {}
}

async function concluirExercicio() {
  const area = $("#area-exercicio"), exercicioId = area?.dataset.id;
  if (!exercicioId) return;
  const e = EXERCICIOS.find(x => x.id === exercicioId);
  const passos = $$("[data-passo]", area).filter(x => x.checked).length;
  if (!passos) { toast("Marque pelo menos uma etapa realizada."); return; }
  const reflexao = $("#reflexao", area)?.value.trim() || "";
  const minutosRegistrados = cronometroSegundos > 30 ? Math.max(1, Math.round(cronometroSegundos / 60)) : e.tempo;
  pararCronometro();

  // Evita registrar o mesmo exercício duas vezes no mesmo dia
  const atividades = await todos("atividades");
  const jaRegistrada = atividades.some(a => a.exercicioId === exercicioId && a.data === hoje());
  if (jaRegistrada) { toast("Este exercício já foi registrado hoje."); return; }

  await salvar("atividades", { id: id(), exercicioId, titulo: e.titulo, data: hoje(), criadoEm: new Date().toISOString(), minutos: minutosRegistrados, passosConcluidos: passos, totalPassos: e.passos.length, reflexao });
  toast("✅ Atividade registrada!");
  await verificarERegistrarConquistas();
  await renderPraticar();
}

// ─── TELA: ROLETA DE IMPROVISO ────────────────────────────────
async function renderImproviso() {
  revogarTodasURLs();
  const sorteio = sortearImproviso();
  principal.innerHTML = pagina("🎲 Roleta de Improviso", "Treine o raciocínio rápido e a adaptação ao contexto.", `
  <section class="card" id="card-sorteio">
    <div class="linha entre">
      <h2>Seu desafio de improviso</h2>
      ${btn("🎲 Novo sorteio", "sortear-improviso", "btn-secundario btn-pequeno")}
    </div>

    <div class="improviso-bloco tema">
      <div class="improviso-label">📢 Tema</div>
      <div class="improviso-texto" id="imp-tema">${escapar(sorteio.tema)}</div>
    </div>
    <div class="improviso-bloco publico">
      <div class="improviso-label">👥 Público-alvo</div>
      <div class="improviso-texto" id="imp-publico">${escapar(sorteio.publico)}</div>
    </div>
    <div class="improviso-bloco restricao">
      <div class="improviso-label">🎯 Restrição / Desafio</div>
      <div class="improviso-texto" id="imp-restricao">${escapar(sorteio.restricao)}</div>
    </div>

    <div class="cronometro-box" style="margin-top:1.5rem">
      <p class="muted">Cronometre sua apresentação</p>
      <div id="imp-cronometro-display" class="cronometro-display">00:00</div>
      <div class="linha" style="justify-content:center;gap:.5rem">
        <button id="imp-crono-toggle" class="btn btn-pequeno" type="button">▶ Iniciar</button>
        <button id="imp-crono-zerar" class="btn btn-secundario btn-pequeno" type="button">↺ Zerar</button>
      </div>
    </div>

    <div class="aviso" style="margin-top:1rem">
      💡 <strong>Como jogar:</strong> Leia o tema, público e restrição. Pense por <strong>15 segundos</strong> e fale continuamente por 1 a 2 minutos sem parar. Aceite as imperfeições — o improviso se desenvolve com repetição.
    </div>
  </section>

  <section class="card" style="margin-top:1.5rem">
    <h2>Guia de Estrutura Rápida</h2>
    <div class="grid dois">
      <div class="item">
        <h3>Método PREP</h3>
        <ol style="color:var(--muted);line-height:1.8">
          <li><strong>P</strong>onto: Declare sua tese</li>
          <li><strong>R</strong>azão: Por que você acredita nisso?</li>
          <li><strong>E</strong>xemplo: Cite um caso concreto</li>
          <li><strong>P</strong>onto: Reforce com frase final</li>
        </ol>
      </div>
      <div class="item">
        <h3>Estrutura de 3 Atos</h3>
        <ol style="color:var(--muted);line-height:1.8">
          <li><strong>Contexto:</strong> Onde? Quando? Quem?</li>
          <li><strong>Conflito:</strong> O que mudou ou chamou atenção?</li>
          <li><strong>Conclusão:</strong> O que aprendemos?</li>
        </ol>
      </div>
    </div>
  </section>`);

  configurarCronometroImproviso();
}

function configurarCronometroImproviso() {
  let seg = 0, ativo = false, interval = null;
  const display = $("#imp-cronometro-display");
  const toggle = $("#imp-crono-toggle");
  const zerar = $("#imp-crono-zerar");
  if (!display || !toggle) return;
  const att = () => display.textContent = `${String(Math.floor(seg / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")}`;
  toggle.onclick = () => {
    if (!ativo) {
      ativo = true; toggle.textContent = "⏸ Pausar"; toggle.classList.add("btn-aviso");
      interval = setInterval(() => { seg++; att(); if (seg === 60) tocarBip(); if (seg === 120) tocarBip(880, 0.5, 0.3); }, 1000);
    } else {
      ativo = false; clearInterval(interval); toggle.textContent = "▶ Retomar"; toggle.classList.remove("btn-aviso");
    }
  };
  zerar.onclick = () => {
    ativo = false; clearInterval(interval); seg = 0; att();
    toggle.textContent = "▶ Iniciar"; toggle.classList.remove("btn-aviso");
  };
}

// ─── TELA: CONSTRUTOR PREP ────────────────────────────────────
async function renderPrep() {
  revogarTodasURLs();
  const [textos, registradas] = await Promise.all([
    todos("textos"),
    todos("conquistas"),
  ]);
  const listaPrep = textos.filter(t => t.tipo === "prep").sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  principal.innerHTML = pagina("🧠 Construtor de Argumentos (PREP)", "Estruture discursos persuasivos passo a passo.", `
  <div class="grid dois">
    <section class="card">
      <h2>Monte seu argumento</h2>
      <p class="muted">Preencha cada etapa do método PREP. O app gera um rascunho estruturado pronto para ensaiar.</p>

      <div class="campo">
        <label for="prep-titulo">Título do discurso / tema</label>
        <input id="prep-titulo" maxlength="120" placeholder="Ex.: Por que a comunicação clara é essencial no trabalho">
      </div>

      <div class="prep-etapa">
        <div class="prep-label"><span class="prep-letra">P</span> Ponto — Sua tese principal</div>
        <div class="campo"><textarea id="prep-ponto" rows="2" placeholder="Ex.: A comunicação clara reduz conflitos e aumenta a produtividade de qualquer equipe."></textarea></div>
      </div>

      <div class="prep-etapa">
        <div class="prep-label"><span class="prep-letra">R</span> Razão — Por que você acredita nisso?</div>
        <div class="campo"><textarea id="prep-razao" rows="2" placeholder="Ex.: Quando as pessoas entendem expectativas e objetivos com clareza, erros por má interpretação diminuem."></textarea></div>
      </div>

      <div class="prep-etapa">
        <div class="prep-label"><span class="prep-letra">E</span> Exemplo — Caso concreto ou dado</div>
        <div class="campo"><textarea id="prep-exemplo" rows="2" placeholder="Ex.: Em minha equipe, após adotarmos atas de reunião objetivas, o número de retrabalhos caiu pela metade em 30 dias."></textarea></div>
      </div>

      <div class="prep-etapa">
        <div class="prep-label"><span class="prep-letra">P</span> Ponto — Reforce com frase marcante</div>
        <div class="campo"><textarea id="prep-final" rows="2" placeholder="Ex.: Por isso, investir em clareza na comunicação não é um detalhe — é a base de qualquer resultado sólido."></textarea></div>
      </div>

      <div class="linha">
        ${btn("📋 Gerar rascunho", "gerar-prep")}
        ${btn("💾 Salvar discurso", "salvar-prep", "btn-secundario")}
      </div>
    </section>

    <section class="card">
      <h2>Rascunho gerado</h2>
      <div id="prep-resultado" class="prep-resultado">
        <p class="muted" style="text-align:center;padding:2rem">Preencha as etapas e clique em <strong>Gerar rascunho</strong> para ver seu discurso estruturado aqui.</p>
      </div>
      <div class="linha" id="prep-acoes-resultado" style="display:none;margin-top:1rem">
        ${btn("📋 Copiar texto", "copiar-prep", "btn-secundario")}
        ${btn("📜 Enviar para Teleprompter", "prep-para-teleprompter", "btn-secundario")}
      </div>
    </section>
  </div>

  <section class="card" style="margin-top:1.5rem">
    <h2>Discursos PREP salvos (${listaPrep.length})</h2>
    <div id="lista-prep">${renderListaPrep(listaPrep)}</div>
  </section>`);
}

function gerarRascunhoPrep() {
  const titulo = $("#prep-titulo")?.value.trim();
  const ponto = $("#prep-ponto")?.value.trim();
  const razao = $("#prep-razao")?.value.trim();
  const exemplo = $("#prep-exemplo")?.value.trim();
  const final = $("#prep-final")?.value.trim();
  const campos = [ponto, razao, exemplo, final].filter(Boolean);
  if (campos.length < 2) { toast("Preencha pelo menos Ponto e Razão para gerar o rascunho."); return null; }
  const partes = [];
  if (ponto) partes.push(ponto);
  if (razao) partes.push(razao);
  if (exemplo) partes.push(exemplo);
  if (final) partes.push(final);
  const texto = partes.join(" ");
  const el = $("#prep-resultado");
  el.innerHTML = `
    ${titulo ? `<h3>${escapar(titulo)}</h3>` : ""}
    ${ponto ? `<p><span class="tag">Ponto</span></p><p>${escapar(ponto)}</p>` : ""}
    ${razao ? `<p><span class="tag">Razão</span></p><p>${escapar(razao)}</p>` : ""}
    ${exemplo ? `<p><span class="tag">Exemplo</span></p><p>${escapar(exemplo)}</p>` : ""}
    ${final ? `<p><span class="tag">Conclusão</span></p><p><strong>${escapar(final)}</strong></p>` : ""}`;
  const acoes = $("#prep-acoes-resultado");
  if (acoes) acoes.style.display = "flex";
  el.dataset.textoGerado = titulo ? `${titulo}\n\n${texto}` : texto;
  return texto;
}

async function salvarPrep() {
  const titulo = $("#prep-titulo")?.value.trim() || "Discurso PREP";
  const ponto = $("#prep-ponto")?.value.trim() || "";
  const razao = $("#prep-razao")?.value.trim() || "";
  const exemplo = $("#prep-exemplo")?.value.trim() || "";
  const final = $("#prep-final")?.value.trim() || "";
  const conteudo = [ponto, razao, exemplo, final].filter(Boolean).join("\n\n");
  if (!conteudo) { toast("Preencha pelo menos um campo antes de salvar."); return; }
  await salvar("textos", { id: id(), titulo, conteudo, tipo: "prep", data: hoje(), atualizadoEm: new Date().toISOString(), prep: { ponto, razao, exemplo, final } });
  toast("Discurso PREP salvo!");
  await renderPrep();
}

function renderListaPrep(textos) {
  if (!textos.length) return '<p class="lista-vazia">Nenhum discurso PREP salvo ainda.</p>';
  return textos.map(t => `
    <article class="item">
      <div class="linha entre">
        <h3>${escapar(t.titulo)}</h3>
        <small class="muted">${escapar(t.data || "")}</small>
      </div>
      <p>${escapar((t.conteudo || "").slice(0, 200))}${(t.conteudo || "").length > 200 ? "…" : ""}</p>
      <div class="linha">
        ${btn("Carregar", "carregar-prep", "btn-secundario btn-pequeno")}
        <input type="hidden" data-prep-id="${t.id}">
        ${btn("Excluir", "excluir-prep", "btn-perigo btn-pequeno")}
      </div>
    </article>`).join("");
}

// ─── TELA: TELEPROMPTER ───────────────────────────────────────
async function renderTeleprompter() {
  revogarTodasURLs();
  const textos = await todos("textos");
  const listaTextos = textos.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
  principal.innerHTML = pagina("📜 Teleprompter", "Apresente seu texto com rolagem automática e grave simultaneamente.", `
  <div class="grid dois">
    <section class="card">
      <h2>Configurar Teleprompter</h2>

      <div class="campo">
        <label for="tp-texto">Texto para apresentar</label>
        <textarea id="tp-texto" rows="7" placeholder="Cole ou escreva seu texto aqui. Você também pode carregar um texto salvo abaixo."></textarea>
      </div>

      <div class="grid dois">
        <div class="campo">
          <label for="tp-velocidade">Velocidade de rolagem</label>
          <select id="tp-velocidade">
            <option value="60">Muito lenta (60s/tela)</option>
            <option value="40">Lenta (40s/tela)</option>
            <option value="25" selected>Normal (25s/tela)</option>
            <option value="15">Rápida (15s/tela)</option>
            <option value="8">Muito rápida (8s/tela)</option>
          </select>
        </div>
        <div class="campo">
          <label for="tp-tamanho">Tamanho da fonte</label>
          <select id="tp-tamanho">
            <option value="1.4">Pequena</option>
            <option value="2" selected>Média</option>
            <option value="2.8">Grande</option>
            <option value="3.8">Muito grande</option>
          </select>
        </div>
      </div>

      <div class="linha" style="margin-top:.5rem">
        <label class="linha" style="gap:.5rem;cursor:pointer">
          <input type="checkbox" id="tp-gravar-junto" style="accent-color:var(--pri);width:18px;height:18px">
          <span>Gravar áudio simultaneamente</span>
        </label>
      </div>

      ${btn("▶ Iniciar Teleprompter", "iniciar-teleprompter")}

      <div class="separador"></div>
      <h3>Carregar texto salvo</h3>
      <div style="max-height:240px;overflow-y:auto">
        ${listaTextos.length ? listaTextos.map(t => `
          <div class="item">
            <div class="linha entre">
              <span>${escapar(t.titulo || "Sem título")}</span>
              <button class="btn btn-secundario btn-pequeno" data-acao="carregar-tp" data-tp-id="${t.id}">Carregar</button>
            </div>
          </div>`).join("") : '<p class="muted">Nenhum texto salvo.</p>'}
      </div>
    </section>

    <section class="card" style="display:flex;flex-direction:column;gap:1rem">
      <h2>Como usar</h2>
      <div class="aviso" style="margin:0">
        <strong>1.</strong> Escreva ou carregue seu texto.<br>
        <strong>2.</strong> Ajuste velocidade e tamanho da fonte.<br>
        <strong>3.</strong> Opcionalmente, ative a gravação simultânea de áudio.<br>
        <strong>4.</strong> Clique em "Iniciar Teleprompter".<br>
        <strong>5.</strong> A leitura será em tela cheia — pressione <kbd>Esc</kbd> ou clique no botão para encerrar.
      </div>
      <div class="aviso atencao" style="margin:0">
        🎙️ A gravação simultânea requer permissão do microfone e funciona melhor em <code>localhost</code> ou HTTPS.
      </div>
    </section>
  </div>

  <!-- OVERLAY TELEPROMPTER (inserido no DOM mas oculto) -->
  <div id="teleprompter-overlay" class="tp-overlay oculto" role="dialog" aria-label="Teleprompter em tela cheia">
    <div id="tp-conteudo" class="tp-conteudo"></div>
    <div class="tp-linha-foco" aria-hidden="true"></div>
    <div class="tp-controles">
      <button id="tp-pausar" class="btn btn-pequeno">⏸ Pausar</button>
      <span id="tp-progresso-label" class="tag"></span>
      <button id="tp-encerrar" class="btn btn-perigo btn-pequeno">✕ Encerrar</button>
    </div>
  </div>`);
}

function iniciarTeleprompter() {
  const textoEl = $("#tp-texto");
  const texto = textoEl?.value.trim();
  if (!texto) { toast("Escreva ou carregue um texto antes de iniciar."); return; }
  const velocidade = Number($("#tp-velocidade")?.value || 25);
  const tamanho = Number($("#tp-tamanho")?.value || 2);
  const gravarJunto = $("#tp-gravar-junto")?.checked;
  const overlay = $("#teleprompter-overlay");
  const conteudo = $("#tp-conteudo");
  if (!overlay || !conteudo) return;
  conteudo.innerHTML = `<p style="font-size:${tamanho}rem;line-height:1.6">${escapar(texto).replace(/\n/g, "<br><br>")}</p>`;
  conteudo.scrollTop = 0;
  overlay.classList.remove("oculto");
  document.body.style.overflow = "hidden";
  teleprompterAtivo = true;
  const alturaTotal = conteudo.scrollHeight - conteudo.clientHeight;
  const pixelsPorMs = alturaTotal / (velocidade * 1000);
  let ultimo = performance.now();
  let pos = 0;
  const progLabel = $("#tp-progresso-label");
  function animar(agora) {
    if (!teleprompterAtivo) return;
    const delta = agora - ultimo; ultimo = agora;
    pos += pixelsPorMs * delta;
    if (pos >= alturaTotal) { pos = alturaTotal; pararTeleprompter(); return; }
    conteudo.scrollTop = pos;
    const pct = Math.round((pos / alturaTotal) * 100);
    if (progLabel) progLabel.textContent = `${pct}%`;
    teleprompterInterval = requestAnimationFrame(animar);
  }
  teleprompterInterval = requestAnimationFrame(animar);
  const pausarBtn = $("#tp-pausar");
  if (pausarBtn) {
    pausarBtn.onclick = () => {
      if (teleprompterAtivo) {
        teleprompterAtivo = false;
        cancelAnimationFrame(teleprompterInterval);
        pausarBtn.textContent = "▶ Retomar";
        ultimo = null;
      } else {
        teleprompterAtivo = true;
        ultimo = performance.now();
        teleprompterInterval = requestAnimationFrame(animar);
        pausarBtn.textContent = "⏸ Pausar";
      }
    };
  }
  $("#tp-encerrar").onclick = () => pararTeleprompter(gravarJunto);
  document.addEventListener("keydown", teclaEscTeleprompter, { once: true });
  if (gravarJunto) iniciarGravacao(true);
}

function teclaEscTeleprompter(e) {
  if (e.key === "Escape") pararTeleprompter();
}

function pararTeleprompter(gravarJunto = false) {
  teleprompterAtivo = false;
  if (teleprompterInterval) { cancelAnimationFrame(teleprompterInterval); teleprompterInterval = null; }
  const overlay = $("#teleprompter-overlay");
  if (overlay) overlay.classList.add("oculto");
  document.body.style.overflow = "";
  document.removeEventListener("keydown", teclaEscTeleprompter);
  if (gravarJunto && gravador && gravador.state !== "inactive") {
    gravador.stop();
    toast("Teleprompter encerrado. Gravação salva!");
  } else {
    toast("Teleprompter encerrado.");
  }
}

// ─── TELA: GRAVAÇÕES ──────────────────────────────────────────
async function renderGravacoes(filtroTag = "", busca = "") {
  revogarTodasURLs();
  let gravacoes = (await todos("gravacoes")).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  const todasTags = [...new Set(gravacoes.flatMap(g => g.tags || []))].sort();
  if (filtroTag) gravacoes = gravacoes.filter(g => (g.tags || []).includes(filtroTag));
  if (busca) {
    const termo = busca.toLowerCase();
    gravacoes = gravacoes.filter(g =>
      (g.titulo || "").toLowerCase().includes(termo) ||
      (g.tags || []).some(tag => tag.includes(termo))
    );
  }

  const itensHTML = gravacoes.length ? gravacoes.map(g => `
    <article class="item">
      <div class="gravacao">
        <div>
          <h3>${escapar(g.titulo || "Gravação de prática")}</h3>
          <small class="muted">${new Date(g.criadoEm).toLocaleString("pt-BR")} · ${g.duracao}s</small>
          ${(g.tags || []).length ? `<div style="margin-top:.4rem">${g.tags.map(t => `<span class="tag" style="margin-right:.25rem">#${escapar(t)}</span>`).join("")}</div>` : ""}
        </div>
        <div class="linha">
          <input type="checkbox" class="chk-comparar" data-grav-id="${g.id}" aria-label="Selecionar para comparar" title="Selecionar para comparar" style="accent-color:var(--pri);width:18px;height:18px">
          <button class="btn btn-secundario btn-pequeno" data-acao="baixar-gravacao" data-gravacao-id="${g.id}">⬇️</button>
          <input type="hidden" data-gravacao-id="${g.id}">
          ${btn("Excluir", "excluir-gravacao", "btn-perigo btn-pequeno")}
        </div>
      </div>
      <audio controls preload="metadata" src="${criarURL(g.blob)}"></audio>
    </article>`).join("") : '<p class="lista-vazia">Nenhuma gravação ainda.</p>';

  principal.innerHTML = pagina("🎙️ Gravações", "Grave, ouça, baixe e organize suas práticas de voz.", `
  <div class="aviso atencao">
    <strong>Privacidade:</strong> O microfone só é acessado após seu clique. O áudio fica exclusivamente neste dispositivo.
  </div>

  <section class="card">
    <h2>Nova gravação</h2>
    <div class="grid dois">
      <div class="campo">
        <label for="tema-gravacao">Tema ou título</label>
        <input id="tema-gravacao" maxlength="120" placeholder="Ex.: Apresentação de 1 minuto">
      </div>
      <div class="campo">
        <label for="tags-gravacao">Tags (separadas por vírgula)</label>
        <input id="tags-gravacao" maxlength="120" placeholder="Ex.: apresentação, trabalho">
      </div>
    </div>
    <canvas id="canvas-audio" width="520" height="64" aria-label="Visualizador de frequências"></canvas>
    <div class="linha">
      <button id="iniciar-gravacao" class="btn" type="button">🎙️ Iniciar</button>
      <button id="pausar-gravacao" class="btn btn-secundario" type="button" disabled>⏸ Pausar</button>
      <button id="parar-gravacao" class="btn btn-secundario" type="button" disabled>⏹ Parar e salvar</button>
      <span id="tempo-gravacao" class="tag">00:00</span>
    </div>
    <p id="estado-gravacao" class="muted" aria-live="polite" style="margin-top:.6rem">Aguardando seu comando.</p>
  </section>

  ${todasTags.length ? `
  <div class="linha" style="margin-top:1.2rem;flex-wrap:wrap;gap:.5rem">
    <span class="muted" style="font-weight:700">Filtrar por tag:</span>
    <button class="btn btn-secundario btn-pequeno ${!filtroTag ? "tag-ativa" : ""}" data-acao="filtrar-gravacoes" data-tag="">Todas</button>
    ${todasTags.map(t => `<button class="btn btn-secundario btn-pequeno ${filtroTag === t ? "tag-ativa" : ""}" data-acao="filtrar-gravacoes" data-tag="${escapar(t)}">#${escapar(t)}</button>`).join("")}
  </div>` : ""}

  <div class="campo" style="margin-top:1rem">
    <label for="busca-gravacoes">🔍 Buscar gravações</label>
    <input id="busca-gravacoes" type="search" placeholder="Título ou tag…" value="${escapar(busca)}">
  </div>

  <section class="card" style="margin-top:1.5rem">
    <div class="linha entre">
      <h2>Gravações salvas (${gravacoes.length})</h2>
      ${gravacoes.length >= 2 ? btn("🔄 Comparar 2 gravações", "abrir-comparador", "btn-secundario btn-pequeno") : ""}
    </div>
    ${itensHTML}
  </section>

  <!-- COMPARADOR (oculto até ativação) -->
  <div id="comparador-overlay" class="comparador-overlay oculto">
    <div class="comparador-box card">
      <div class="linha entre">
        <h2>🔄 Comparar Gravações</h2>
        <button class="btn btn-secundario btn-pequeno" id="fechar-comparador">✕ Fechar</button>
      </div>
      <p class="muted">Selecione duas gravações nos checkboxes acima e clique em "Abrir Comparador".</p>
      <div id="comparador-players" style="display:grid;gap:1rem"></div>
    </div>
  </div>`);

  inicializarCanvasPadrao();

  // Busca em tempo real
  const inputBusca = $("#busca-gravacoes");
  if (inputBusca) {
    inputBusca.addEventListener("input", (e) => {
      renderGravacoes(filtroTag, e.target.value);
    });
  }
}

function abrirComparador() {
  const selecionadas = $$(".chk-comparar:checked").map(el => el.dataset.gravId);
  if (selecionadas.length < 2) { toast("Selecione 2 gravações pelos checkboxes para comparar."); return; }
  const [id1, id2] = selecionadas;
  Promise.all([obter("gravacoes", id1), obter("gravacoes", id2)]).then(([g1, g2]) => {
    if (!g1 || !g2) { toast("Gravações não encontradas."); return; }
    const overlay = $("#comparador-overlay"), players = $("#comparador-players");
    if (!overlay || !players) return;
    players.innerHTML = `
      <div>
        <h3>${escapar(g1.titulo || "Gravação A")}</h3>
        <small class="muted">${new Date(g1.criadoEm).toLocaleString("pt-BR")} · ${g1.duracao}s</small>
        <audio controls src="${criarURL(g1.blob)}" style="width:100%;margin-top:.5rem"></audio>
      </div>
      <div>
        <h3>${escapar(g2.titulo || "Gravação B")}</h3>
        <small class="muted">${new Date(g2.criadoEm).toLocaleString("pt-BR")} · ${g2.duracao}s</small>
        <audio controls src="${criarURL(g2.blob)}" style="width:100%;margin-top:.5rem"></audio>
      </div>`;
    overlay.classList.remove("oculto");
  });
}

// ─── TELA: PORTUGUÊS / EDITOR ─────────────────────────────────
async function renderPortugues(filtroTag = "", busca = "") {
  revogarTodasURLs();
  const [textos] = await Promise.all([todos("textos")]);
  let lista = textos.filter(t => t.tipo !== "prep");
  const todasTags = [...new Set(lista.flatMap(t => t.tags || []))].sort();
  if (filtroTag) lista = lista.filter(t => (t.tags || []).includes(filtroTag));
  if (busca) {
    const termo = busca.toLowerCase();
    lista = lista.filter(t =>
      (t.titulo || "").toLowerCase().includes(termo) ||
      (t.conteudo || "").toLowerCase().includes(termo) ||
      (t.tags || []).some(tag => tag.includes(termo))
    );
  }
  lista = lista.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));

  principal.innerHTML = pagina("✍️ Português em Ação", "Escreva, revise e organize seus textos com métricas ao vivo.", `
  <div class="grid dois">
    <section class="card">
      <div class="linha entre">
        <h2>Oficina de escrita</h2>
        <button id="btn-novo-texto" class="btn btn-secundario btn-pequeno" type="button" style="display:none">➕ Novo</button>
      </div>
      <input type="hidden" id="id-texto-atual" value="">
      <div class="campo">
        <label for="titulo-texto">Título</label>
        <input id="titulo-texto" maxlength="120" placeholder="Ex.: Apresentação na reunião mensal">
      </div>
      <div class="campo">
        <label for="tags-texto">Tags (vírgula)</label>
        <input id="tags-texto" maxlength="120" placeholder="Ex.: trabalho, improviso">
      </div>
      <div class="campo">
        <label for="corpo-texto">Texto</label>
        <textarea id="corpo-texto" placeholder="Digite aqui…"></textarea>
      </div>
      <div class="metricas-editor" id="metricas-texto">
        <span class="metrica-badge">Palavras: <strong id="m-palavras">0</strong></span>
        <span class="metrica-badge">Caracteres: <strong id="m-caracteres">0</strong></span>
        <span class="metrica-badge">Frases: <strong id="m-frases">0</strong></span>
        <span class="metrica-badge" title="130 ppm">🎙️ Fala: <strong id="m-fala">0 min</strong></span>
        <span class="metrica-badge" title="200 ppm">📖 Leitura: <strong id="m-leitura">0 min</strong></span>
      </div>
      <div class="linha" style="margin-top:1rem">
        ${btn("🔍 Revisar", "revisar-texto")}
        ${btn("💾 Salvar", "salvar-texto", "btn-secundario")}
        ${btn("📜 Teleprompter", "texto-para-teleprompter", "btn-secundario")}
      </div>
      <div id="resultado-revisor" class="aviso oculto" aria-live="polite"></div>
    </section>

    <section class="card">
      <h2>Dicas de comunicação</h2>
      ${DICAS.map(d => `<div class="item"><h3>${escapar(d.titulo)}</h3><p>${escapar(d.texto)}</p></div>`).join("")}
    </section>
  </div>

  ${todasTags.length ? `
  <div class="linha" style="margin-top:1.2rem;flex-wrap:wrap;gap:.5rem">
    <span class="muted" style="font-weight:700">Filtrar:</span>
    <button class="btn btn-secundario btn-pequeno ${!filtroTag ? "tag-ativa" : ""}" data-acao="filtrar-textos" data-tag="">Todos</button>
    ${todasTags.map(t => `<button class="btn btn-secundario btn-pequeno ${filtroTag === t ? "tag-ativa" : ""}" data-acao="filtrar-textos" data-tag="${escapar(t)}">#${escapar(t)}</button>`).join("")}
  </div>` : ""}

  <div class="campo" style="margin-top:1rem">
    <label for="busca-textos">🔍 Buscar textos</label>
    <input id="busca-textos" type="search" placeholder="Título, conteúdo ou tag…" value="${escapar(busca)}">
  </div>

  <section class="card" style="margin-top:1.5rem">
    <h2>Textos salvos (${lista.length})</h2>
    <div id="lista-textos">${renderListaTextos(lista)}</div>
  </section>`);

  configurarMetricasTexto();
  iniciarAutoSaveTexto();

  // Busca em tempo real
  const inputBusca = $("#busca-textos");
  if (inputBusca) {
    inputBusca.addEventListener("input", (e) => {
      renderPortugues(filtroTag, e.target.value);
    });
  }
}

function configurarMetricasTexto() {
  const textarea = $("#corpo-texto"); if (!textarea) return;
  function att() {
    const t = textarea.value.trim();
    const palavras = t ? (t.match(/\S+/g) || []).length : 0;
    $("#m-palavras").textContent = palavras;
    $("#m-caracteres").textContent = textarea.value.length;
    $("#m-frases").textContent = t ? (t.split(/[.!?]+/).map(s => s.trim()).filter(Boolean).length) : 0;
    $("#m-fala").textContent = `${palavras > 0 ? (palavras / 130).toFixed(1) : 0} min`;
    $("#m-leitura").textContent = `${palavras > 0 ? (palavras / 200).toFixed(1) : 0} min`;
  }
  textarea.addEventListener("input", att);
  att();
  $("#btn-novo-texto")?.addEventListener("click", () => {
    $("#id-texto-atual").value = ""; $("#titulo-texto").value = "";
    $("#tags-texto").value = ""; $("#corpo-texto").value = "";
    $("#btn-novo-texto").style.display = "none";
    $("#resultado-revisor").classList.add("oculto");
    temAlteracoesNaoSalvas = false;
    att(); toast("Editor limpo.");
  });
}

function analisarTexto(texto) {
  const avisos = [], t = texto.trim();
  if (!t) { avisos.push("Escreva algo antes de revisar."); return avisos; }
  const frases = t.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  if (frases.length === 1 && t.length > 120) avisos.push("Texto com uma única frase longa. Divida em 2-3 sentenças para pausas naturais na fala.");
  if (t.length < 60) avisos.push("Texto curto. Se for uma apresentação, adicione um exemplo ou conclusão.");
  if (/[.!?]\s+[a-záéíóúãõâêôç]/.test(t)) avisos.push("Frases começando com letra minúscula após ponto final.");
  for (const f of frases) {
    if ((f.match(/\S+/g) || []).length > 28) { avisos.push(`Frase muito longa (>${28} palavras): "${f.slice(0, 50)}…" — dificulta a respiração na oratória.`); break; }
  }
  const pleonasmos = [
    { p: /\bsubir\s+para\s+cima\b/i, m: "'subir para cima' → apenas 'subir'." },
    { p: /\bdescer\s+para\s+baixo\b/i, m: "'descer para baixo' → apenas 'descer'." },
    { p: /\bentrar\s+para\s+dentro\b/i, m: "'entrar para dentro' → apenas 'entrar'." },
    { p: /\bsair\s+para\s+fora\b/i, m: "'sair para fora' → apenas 'sair'." },
    { p: /\belo\s+de\s+ligaç[aã]o\b/i, m: "'elo de ligação' é redundante." },
    { p: /\bcerteza\s+absoluta\b/i, m: "'certeza absoluta' — basta 'certeza'." },
    { p: /\boutra\s+alternativa\b/i, m: "'outra alternativa' → 'outra opção'." },
    { p: /\brepetir\s+de\s+novo\b/i, m: "'repetir de novo' → apenas 'repetir'." },
    { p: /\bfato\s+real\b/i, m: "'fato real' — fato já é real." }
  ];
  pleonasmos.forEach(item => { if (item.p.test(t)) avisos.push(`Redundância: ${item.m}`); });
  if (/\ba\s+n[ií]vel\s+de\b/i.test(t)) avisos.push("Evite 'a nível de' — prefira 'em termos de' ou reestruture.");
  if (/\b(tipo\s+assim|aí\s+tipo)\b/i.test(t)) avisos.push("Muleta coloquial ('tipo assim') — evite em discursos formais.");
  const palavras = t.toLocaleLowerCase("pt-BR").match(/[a-zá-ú]+/g) || [];
  const cnt = {}; for (const p of palavras) cnt[p] = (cnt[p] || 0) + 1;
  const rep = Object.entries(cnt).filter(([p, n]) => n >= 4 && p.length > 3).map(([p]) => p);
  if (rep.length) avisos.push("Palavras repetidas (4+ vezes): " + rep.join(", ") + ".");
  if (!avisos.length) avisos.push("✅ Nenhuma inconsistência flagrante encontrada. Excelente trabalho!");
  avisos.push("💡 Leia em voz alta e cronometre para testar a naturalidade da fala.");
  return avisos;
}

function renderListaTextos(textos) {
  if (!textos.length) return '<p class="lista-vazia">Nenhum texto salvo.</p>';
  return textos.map(t => `
    <article class="item">
      <div class="linha entre">
        <h3>${escapar(t.titulo || "Sem título")}</h3>
        <small class="muted">${escapar(t.data || "")}</small>
      </div>
      ${(t.tags || []).length ? `<div style="margin-bottom:.5rem">${t.tags.map(tg => `<span class="tag" style="margin-right:.25rem">#${escapar(tg)}</span>`).join("")}</div>` : ""}
      <p>${escapar((t.conteudo || "").slice(0, 200))}${(t.conteudo || "").length > 200 ? "…" : ""}</p>
      <div class="linha">
        ${btn("Carregar", "carregar-texto", "btn-secundario btn-pequeno")}
        <input type="hidden" data-texto-id="${t.id}">
        ${btn("Excluir", "excluir-texto", "btn-perigo btn-pequeno")}
      </div>
    </article>`).join("");
}

async function salvarTexto() {
  const titulo = $("#titulo-texto")?.value.trim();
  const conteudo = $("#corpo-texto")?.value.trim();
  const textoIdAtual = $("#id-texto-atual")?.value.trim();
  const tagsRaw = $("#tags-texto")?.value.trim();
  const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean) : [];
  if (!conteudo) { toast("Escreva algo antes de salvar."); return; }
  const textoId = textoIdAtual || id();
  await salvar("textos", { id: textoId, titulo: titulo || "Texto sem título", conteudo, tipo: "texto", tags, data: hoje(), atualizadoEm: new Date().toISOString() });
  toast(textoIdAtual ? "Texto atualizado!" : "Texto salvo!");
  temAlteracoesNaoSalvas = false;
  await verificarERegistrarConquistas();
  await renderPortugues();
}

// ─── TELA: METRÔNOMO VOCAL ───────────────────────────────────
async function renderMetronomo() {
  revogarTodasURLs();
  principal.innerHTML = pagina("🎚️ Metrônomo Vocal", "Treine ritmo, cadência e respiração na oratória.", `
  <div class="grid dois">
    <section class="card">
      <h2>Configurações do metrônomo</h2>
      <p class="muted">O pulso guia o ritmo da sua fala. 120-140 BPM é o ritmo ideal para apresentações claras.</p>

      <div class="campo">
        <label for="metro-bpm">Velocidade (BPM)</label>
        <input type="range" id="metro-bpm" min="60" max="200" value="120" step="5"
          oninput="document.getElementById('metro-bpm-valor').textContent = this.value + ' BPM'">
        <span id="metro-bpm-valor" style="font-weight:700;color:var(--pri)">120 BPM</span>
      </div>

      <div class="campo">
        <label for="metro-som">Tipo de pulso</label>
        <select id="metro-som">
          <option value="tick">Clique discreto (tick)</option>
          <option value="grave">Batida grave (tom)</option>
          <option value="visual">Apenas visual (silencioso)</option>
        </select>
      </div>

      <div class="campo">
        <label for="metro-texto">Texto para ler (opcional)</label>
        <textarea id="metro-texto" rows="4" placeholder="Cole um texto para ler em voz alta acompanhando o pulso do metrônomo…"></textarea>
      </div>

      <div class="linha">
        <button id="metro-toggle" class="btn" type="button">▶ Iniciar</button>
        <span id="metro-bpm-display" class="tag" style="font-size:1rem">120 BPM</span>
      </div>
    </section>

    <section class="card">
      <div id="metro-visual" class="metro-visual">
        <div id="metro-ponto" class="metro-ponto"></div>
        <p class="muted" id="metro-status">Configure e inicie o metrônomo ao lado.</p>
      </div>

      <div class="separador"></div>

      <h3>Guia de cadências</h3>
      <div class="item"><div class="linha entre"><strong>60–80 BPM</strong><span class="tag">Discurso solene</span></div><p>Ideal para momentos de ênfase ou luto. Grave e pausado.</p></div>
      <div class="item"><div class="linha entre"><strong>100–120 BPM</strong><span class="tag">Conversa natural</span></div><p>Cadência conversacional, próxima da fala cotidiana.</p></div>
      <div class="item"><div class="linha entre"><strong>120–140 BPM</strong><span class="tag">Apresentação profissional</span></div><p>Ritmo recomendado: energético e claro para plateia.</p></div>
      <div class="item"><div class="linha entre"><strong>160+ BPM</strong><span class="tag">Treino de articulação</span></div><p>Para exercitar dicção e articulação em alta velocidade.</p></div>
    </section>
  </div>`);

  configurarMetronomo();
}

function configurarMetronomo() {
  const toggle = $("#metro-toggle"); if (!toggle) return;
  const bpmInput = $("#metro-bpm");
  const somSelect = $("#metro-som");
  const ponto = $("#metro-ponto");
  const status = $("#metro-status");
  const bpmDisplay = $("#metro-bpm-display");

  toggle.onclick = () => {
    if (!metronomoAtivo) {
      metronomoAtivo = true;
      toggle.textContent = "⏹ Parar";
      toggle.classList.add("btn-aviso");
      const bpm = Number(bpmInput?.value || 120);
      const intervaloMs = 60000 / bpm;
      if (bpmDisplay) bpmDisplay.textContent = `${bpm} BPM`;
      if (status) status.textContent = "Metrônomo ativo — leia acompanhando o pulso.";
      let par = false;
      metronomoInterval = setInterval(() => {
        par = !par;
        if (ponto) {
          ponto.style.transform = par ? "scale(1.4)" : "scale(1)";
          ponto.style.background = par ? "var(--pri)" : "var(--borda)";
        }
        const tipo = somSelect?.value || "tick";
        if (tipo === "tick") tocarBip(1200, 0.04, 0.12);
        else if (tipo === "grave") tocarBip(200, 0.08, 0.15);
      }, intervaloMs);
    } else {
      pararMetronomo();
      toggle.textContent = "▶ Iniciar";
      toggle.classList.remove("btn-aviso");
      if (status) status.textContent = "Metrônomo pausado.";
      if (ponto) { ponto.style.transform = "scale(1)"; ponto.style.background = "var(--borda)"; }
    }
  };
}

function pararMetronomo() {
  if (metronomoInterval) { clearInterval(metronomoInterval); metronomoInterval = null; }
  metronomoAtivo = false;
}

// ─── TELA: CONQUISTAS ─────────────────────────────────────────
async function renderConquistas() {
  revogarTodasURLs();
  const [atividades, gravacoes, textos, registradas] = await Promise.all([
    todos("atividades"),
    todos("gravacoes"),
    todos("textos"),
    todos("conquistas"),
  ]);
  const streak = calcularStreak(atividades);
  const jaIds = registradas.map(c => c.id);
  const { todas } = verificarConquistas({ atividades, gravacoes, textos, streak }, []);
  const desbloqueadasIds = new Set(todas.map(c => c.id));
  const qtd = todas.filter(c => desbloqueadasIds.has(c.id) && jaIds.includes(c.id)).length;

  principal.innerHTML = pagina("🏆 Conquistas", `${qtd} de ${CONQUISTAS.length} desbloqueadas`, `
  <div class="grid dois">
    ${CONQUISTAS.map(c => {
      const desbloqueada = jaIds.includes(c.id);
      const registrada = registradas.find(r => r.id === c.id);
      const dataStr = registrada ? new Date(registrada.data).toLocaleDateString("pt-BR") : "";
      return `
      <div class="card conquista-card ${desbloqueada ? "desbloqueada" : "bloqueada"}">
        <div class="conquista-emoji">${desbloqueada ? c.emoji : "🔒"}</div>
        <div>
          <h3>${desbloqueada ? escapar(c.titulo) : "???"}</h3>
          <p>${desbloqueada ? escapar(c.descricao) : "Continue praticando para desbloquear."}</p>
          ${desbloqueada && dataStr ? `<small class="muted">Desbloqueada em ${dataStr}</small>` : ""}
        </div>
      </div>`;
    }).join("")}
  </div>`);
}

// ─── TELA: PROGRESSO ─────────────────────────────────────────
async function renderProgresso() {
  revogarTodasURLs();
  const [acts, registradas] = await Promise.all([
    todos("atividades"),
    todos("conquistas"),
  ]);
  const lista = acts.sort((a, b) => b.data.localeCompare(a.data));
  const porDia = {};
  for (const a of lista) porDia[a.data] = (porDia[a.data] || 0) + (a.minutos || 0);
  const dias = Object.entries(porDia).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);
  const streak = calcularStreak(lista);
  const totalMinutos = lista.reduce((n, a) => n + (a.minutos || 0), 0);

  principal.innerHTML = pagina("📈 Progresso", "Regularidade e dedicação ao longo do tempo.", `
  <div class="grid quatro">
    <div class="card"><p class="muted">Atividades</p><div class="numero">${lista.length}</div><small class="muted">Exercícios</small></div>
    <div class="card"><p class="muted">Tempo total</p><div class="numero">${totalMinutos}<small style="font-size:1rem"> min</small></div><small class="muted">Acumulado</small></div>
    <div class="card card-destaque"><p class="muted">Sequência 🔥</p><div class="numero">${streak.atual}d</div><small class="muted">${streak.atual > 0 ? "Ativa" : "Inicie hoje"}</small></div>
    <div class="card"><p class="muted">Conquistas 🏆</p><div class="numero">${registradas.length}/${CONQUISTAS.length}</div><small class="muted" style="color:var(--pri);cursor:pointer" data-acao="ir-conquistas">Ver todas →</small></div>
  </div>

  <section class="card" style="margin-top:1.5rem">
    <h2>Últimos 14 dias</h2>
    ${dias.length ? dias.map(([dia, min]) => `
      <div class="item">
        <div class="linha entre">
          <strong>${new Date(dia + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}</strong>
          <span>${min} min</span>
        </div>
        <div class="progresso"><span style="width:${Math.min(100, (min / 30) * 100)}%"></span></div>
        <small class="muted">${lista.filter(a => a.data === dia).length} atividade(s)</small>
      </div>`).join("") : '<p class="lista-vazia">Seus registros aparecerão aqui após a primeira atividade.</p>'}
  </section>
  <div class="aviso" style="margin-top:1.5rem">💡 5 a 10 minutos diários trazem mais resultado que sessões longas e esporádicas.</div>`);
}

// ─── TELA: CONFIGURAÇÕES ─────────────────────────────────────
async function renderConfig() {
  revogarTodasURLs();
  const p = await perfil();
  principal.innerHTML = pagina("⚙️ Dados e ajustes", "Gerencie seu perfil, dados e cópias de segurança.", `
  <section class="card">
    <h2>Perfil</h2>
    <div class="campo"><label for="nome">Como ser chamado(a)?</label><input id="nome" maxlength="80" value="${escapar(p.nome)}" placeholder="Nome ou apelido (opcional)"></div>
    <div class="campo"><label for="meta">Meta diária (minutos)</label><input id="meta" type="number" min="1" max="180" value="${Number(p.metaMinutos) || 10}"></div>
    <div class="campo"><label for="tema-config">Tema visual</label>
      <select id="tema-config">
        <option value="claro" ${p.tema === "claro" ? "selected" : ""}>Claro</option>
        <option value="escuro" ${p.tema === "escuro" ? "selected" : ""}>Escuro</option>
        <option value="auto" ${p.tema === "auto" ? "selected" : ""}>Automático</option>
      </select>
    </div>
    ${btn("Salvar preferências", "salvar-config")}
  </section>

  <section class="card" style="margin-top:1.5rem">
    <h2>Backup e restauração</h2>
    <p class="muted">Exporte um JSON completo com perfil, atividades, textos e gravações.</p>
    <div class="linha">
      ${btn("📤 Exportar backup", "exportar-backup")}
      <label class="btn btn-secundario" for="importar-backup">📥 Restaurar backup</label>
      <input class="oculto" id="importar-backup" type="file" accept="application/json,.json">
    </div>
  </section>

  <section class="card" style="margin-top:1.5rem">
    <h2>Armazenamento local</h2>
    <div class="linha">
      ${btn("Apagar gravações", "apagar-gravacoes", "btn-secundario")}
      ${btn("Apagar tudo", "apagar-tudo", "btn-perigo")}
    </div>
  </section>

  <section class="card" style="margin-top:1.5rem">
    <h2>Sobre</h2>
    <p class="muted">Oratória Diária · v2.1.0 · PWA local-first, sem rastreadores.</p>
  </section>`);
}

// ─── GRAVAÇÃO DE ÁUDIO ────────────────────────────────────────
function inicializarCanvasPadrao() {
  const canvas = $("#canvas-audio"); if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const escuro = document.documentElement.dataset.tema === "escuro";
  ctx.fillStyle = escuro ? "#1e2c45" : "#eaf0ff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = escuro ? "#9aa9c4" : "#63708a";
  ctx.font = "12px Inter, sans-serif"; ctx.textAlign = "center";
  ctx.fillText("As ondas de voz aparecerão aqui durante a gravação", canvas.width / 2, canvas.height / 2 + 4);
}

function iniciarVisualizador(streamObj, canvas) {
  if (!canvas) return;
  try {
    // Reutiliza AudioContext se já estiver aberto
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const source = audioCtx.createMediaStreamSource(streamObj);
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 64;
    source.connect(analyser);
    const ctx = canvas.getContext("2d");
    const bufLen = analyser.frequencyBinCount;
    const data = new Uint8Array(bufLen);
    function draw() {
      animFrame = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const bw = canvas.width / bufLen;
      let x = 0;
      for (let i = 0; i < bufLen; i++) {
        const bh = Math.max(3, (data[i] / 255) * canvas.height);
        const g = ctx.createLinearGradient(0, canvas.height, 0, 0);
        g.addColorStop(0, "#1e4fb8"); g.addColorStop(1, "#709aff");
        ctx.fillStyle = g;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, canvas.height - bh, bw - 2, bh, [4, 4, 0, 0]);
        else ctx.rect(x, canvas.height - bh, bw - 2, bh);
        ctx.fill(); x += bw;
      }
    }
    draw();
  } catch (e) { console.warn("Visualizador:", e); }
}

function pararVisualizador() {
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  if (audioCtx && audioCtx.state !== "closed") { audioCtx.close(); audioCtx = null; }
  analyser = null; inicializarCanvasPadrao();
}

async function iniciarGravacao(silencioso = false) {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { if (!silencioso) toast("Gravação não suportada neste navegador."); return; }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    partes = []; tempoPausadoTotal = 0; momentoPausa = 0;
    gravador = new MediaRecorder(stream);
    inicioGravacao = Date.now();
    gravador.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
    gravador.onstop = async () => {
      try {
        pararVisualizador();
        if (gravacaoTimer) clearInterval(gravacaoTimer);
        const dur = Math.max(1, Math.round((Date.now() - inicioGravacao - tempoPausadoTotal) / 1000));
        const blob = new Blob(partes, { type: gravador.mimeType || "audio/webm" });
        const titulo = $("#tema-gravacao")?.value.trim() || "Prática de voz";
        const tagsRaw = $("#tags-gravacao")?.value.trim();
        const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean) : [];
        await salvar("gravacoes", { id: id(), titulo, tags, criadoEm: new Date().toISOString(), duracao: dur, blob });
        stream?.getTracks().forEach(t => t.stop()); stream = null; gravador = null;
        const ini = $("#iniciar-gravacao"); if (ini) { ini.disabled = false; ini.classList.remove("btn-gravando"); }
        const est = $("#estado-gravacao"); if (est) { est.textContent = "Aguardando seu comando."; est.classList.remove("status-gravando"); }
        toast("✅ Gravação salva!");
        await verificarERegistrarConquistas();
        if (rotaAtual === "gravacoes") await renderGravacoes();
      } catch (e) { toast("Erro ao salvar: " + e.message); }
    };
    gravador.start(250);
    const canvas = $("#canvas-audio"); iniciarVisualizador(stream, canvas);
    const ini = $("#iniciar-gravacao"), pau = $("#pausar-gravacao"), par = $("#parar-gravacao");
    if (ini) { ini.disabled = true; ini.classList.add("btn-gravando"); }
    if (pau) pau.disabled = false; if (par) par.disabled = false;
    const est = $("#estado-gravacao"); if (est) { est.textContent = "🔴 Gravando…"; est.classList.add("status-gravando"); }
    gravacaoTimer = setInterval(() => {
      if (!gravador || gravador.state === "inactive") { clearInterval(gravacaoTimer); return; }
      if (gravador.state === "recording") {
        const s = Math.floor((Date.now() - inicioGravacao - tempoPausadoTotal) / 1000);
        const el = $("#tempo-gravacao"); if (el) el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
      }
    }, 500);
  } catch (e) {
    stream?.getTracks().forEach(t => t.stop()); stream = null;
    if (!silencioso) toast("Microfone indisponível. " + e.message);
  }
}

function alternarPausaGravacao() {
  if (!gravador) return;
  const btn = $("#pausar-gravacao");
  const ini = $("#iniciar-gravacao");
  const est = $("#estado-gravacao");
  if (gravador.state === "recording") {
    gravador.pause(); momentoPausa = Date.now();
    if (btn) { btn.textContent = "▶ Retomar"; btn.classList.add("btn-aviso"); }
    if (est) { est.textContent = "⏸ Pausado."; est.classList.remove("status-gravando"); }
    if (ini) ini.classList.remove("btn-gravando");
  } else if (gravador.state === "paused") {
    tempoPausadoTotal += Date.now() - momentoPausa;
    gravador.resume();
    if (btn) { btn.textContent = "⏸ Pausar"; btn.classList.remove("btn-aviso"); }
    if (est) { est.textContent = "🔴 Gravando…"; est.classList.add("status-gravando"); }
    if (ini) ini.classList.add("btn-gravando");
  }
}

// ─── NAVEGAÇÃO SPA ────────────────────────────────────────────
async function navegar() {
  const rota = location.hash.replace(/^#\/?/, "").split("?")[0] || "inicio";
  rotaAtual = rota;
  $$(".nav a").forEach(a => a.setAttribute("aria-current", a.dataset.rota === rota ? "page" : "false"));
  pararMetronomo(); pararCronometro();

  // Esqueleto de carregamento enquanto a tela renderiza
  principal.innerHTML = `
    <section class="pagina">
      <div class="loading-skeleton">
        <div class="skeleton-line avatar"></div>
        <div class="skeleton-line titulo"></div>
        <div class="skeleton-line subtitulo"></div>
        <div class="skeleton-line texto"></div>
        <div class="skeleton-line texto"></div>
        <div class="skeleton-line texto"></div>
      </div>
    </section>`;

  try {
    if (rota === "inicio") await renderInicio();
    else if (rota === "praticar") await renderPraticar();
    else if (rota === "portugues") await renderPortugues();
    else if (rota === "gravacoes") await renderGravacoes();
    else if (rota === "progresso") await renderProgresso();
    else if (rota === "configuracoes") await renderConfig();
    else if (rota === "improviso") await renderImproviso();
    else if (rota === "teleprompter") await renderTeleprompter();
    else if (rota === "metronomo") await renderMetronomo();
    else if (rota === "conquistas") await renderConquistas();
    else if (rota === "prep") await renderPrep();
    else { location.hash = "#inicio"; return; }
  } catch (e) {
    principal.innerHTML = pagina("Erro", "Seus dados estão seguros.", `<div class="aviso atencao">${escapar(e.message || "Erro inesperado.")}</div>${btn("Início", "ir-inicio")}`);
    console.error(e);
  }
}

// ─── DELEGAÇÃO DE EVENTOS ─────────────────────────────────────
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-acao]"); if (!b) return;
  const acao = b.dataset.acao;
  try {
    if (acao === "ir-praticar") location.hash = "#praticar";
    else if (acao === "ir-portugues") location.hash = "#portugues";
    else if (acao === "ir-gravacoes") location.hash = "#gravacoes";
    else if (acao === "ir-improviso") location.hash = "#improviso";
    else if (acao === "ir-teleprompter") location.hash = "#teleprompter";
    else if (acao === "ir-metronomo") location.hash = "#metronomo";
    else if (acao === "ir-conquistas") location.hash = "#conquistas";
    else if (acao === "ir-prep") location.hash = "#prep";
    else if (acao === "ir-inicio") location.hash = "#inicio";

    else if (acao === "abrir-exercicio") {
      abrirExercicio(b.closest(".card").querySelector("[data-exercicio-id]")?.dataset.exercicioId);
    }
    else if (acao === "concluir-exercicio") await concluirExercicio();
    else if (acao === "fechar-exercicio") { pararCronometro(); $("#area-exercicio")?.classList.add("oculto"); }

    else if (acao === "sortear-improviso") await renderImproviso();

    else if (acao === "gerar-prep") gerarRascunhoPrep();
    else if (acao === "salvar-prep") await salvarPrep();
    else if (acao === "copiar-prep") {
      const txt = $("#prep-resultado")?.dataset.textoGerado;
      if (txt && navigator.clipboard) { await navigator.clipboard.writeText(txt); toast("📋 Texto copiado!"); }
    }
    else if (acao === "prep-para-teleprompter") {
      const txt = $("#prep-resultado")?.dataset.textoGerado;
      if (txt) { sessionStorage.setItem("tp-texto-pendente", txt); location.hash = "#teleprompter"; toast("Texto enviado para o Teleprompter!"); }
    }
    else if (acao === "carregar-prep") {
      const pId = b.parentElement.querySelector("[data-prep-id]")?.dataset.prepId;
      const t = await obter("textos", pId);
      if (t) {
        $("#prep-titulo").value = t.titulo || "";
        if (t.prep) {
          $("#prep-ponto").value = t.prep.ponto || "";
          $("#prep-razao").value = t.prep.razao || "";
          $("#prep-exemplo").value = t.prep.exemplo || "";
          $("#prep-final").value = t.prep.final || "";
        }
        toast("Discurso PREP carregado.");
      }
    }
    else if (acao === "excluir-prep") {
      const pId = b.parentElement.querySelector("[data-prep-id]")?.dataset.prepId;
      if (confirm("Excluir este discurso PREP?")) { await remover("textos", pId); await renderPrep(); toast("Excluído."); }
    }

    else if (acao === "iniciar-teleprompter") iniciarTeleprompter();
    else if (acao === "carregar-tp") {
      const t = await obter("textos", b.dataset.tpId);
      if (t) { $("#tp-texto").value = t.conteudo; toast("Texto carregado."); }
    }
    else if (acao === "texto-para-teleprompter") {
      const txt = $("#corpo-texto")?.value.trim();
      if (txt) { sessionStorage.setItem("tp-texto-pendente", txt); location.hash = "#teleprompter"; toast("Texto enviado para Teleprompter!"); }
    }

    else if (acao === "revisar-texto") {
      const r = $("#resultado-revisor"); if (!r) return;
      r.classList.remove("oculto");
      r.innerHTML = "<strong>Apontamentos do revisor:</strong><ul>" + analisarTexto($("#corpo-texto")?.value || "").map(x => `<li>${escapar(x)}</li>`).join("") + "</ul>";
      r.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    else if (acao === "salvar-texto") await salvarTexto();
    else if (acao === "carregar-texto") {
      const tId = b.parentElement.querySelector("[data-texto-id]")?.dataset.textoId;
      const t = await obter("textos", tId);
      if (t) {
        $("#id-texto-atual").value = t.id;
        $("#titulo-texto").value = t.titulo;
        $("#tags-texto").value = (t.tags || []).join(", ");
        $("#corpo-texto").value = t.conteudo;
        $("#btn-novo-texto").style.display = "inline-flex";
        $("#corpo-texto").dispatchEvent(new Event("input"));
        temAlteracoesNaoSalvas = false;
        window.scrollTo({ top: 0, behavior: "smooth" });
        toast("Texto carregado.");
      }
    }
    else if (acao === "excluir-texto") {
      const tId = b.parentElement.querySelector("[data-texto-id]")?.dataset.textoId;
      if (confirm("Excluir este texto?")) { await remover("textos", tId); await renderPortugues(); toast("Excluído."); }
    }
    else if (acao === "filtrar-textos") await renderPortugues(b.dataset.tag, $("#busca-textos")?.value || "");
    else if (acao === "filtrar-gravacoes") await renderGravacoes(b.dataset.tag, $("#busca-gravacoes")?.value || "");

    else if (acao === "abrir-comparador") abrirComparador();

    else if (acao === "excluir-gravacao") {
      const gId = b.parentElement.querySelector("[data-gravacao-id]")?.dataset.gravacaoId;
      if (confirm("Excluir gravação?")) { await remover("gravacoes", gId); await renderGravacoes(); toast("Gravação excluída."); }
    }
    else if (acao === "baixar-gravacao") {
      const g = await obter("gravacoes", b.dataset.gravacaoId);
      if (g?.blob) { baixar(g.blob, `oratoria-${(g.titulo || "audio").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${g.criadoEm.slice(0, 10)}.webm`); toast("Download iniciado!"); }
    }

    else if (acao === "salvar-config") {
      const p = await perfil();
      p.nome = $("#nome")?.value.trim();
      p.metaMinutos = Math.min(180, Math.max(1, Number($("#meta")?.value) || 10));
      p.tema = $("#tema-config")?.value;
      await salvar("perfil", p); aplicarTema(p.tema); toast("Preferências salvas!"); await renderConfig();
    }
    else if (acao === "exportar-backup") {
      const dados = await exportarTudo();
      baixar(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" }), `oratoria-backup-${hoje()}.json`);
      toast("Backup exportado.");
    }
    else if (acao === "apagar-gravacoes") {
      if (confirm("Apagar todas as gravações?")) { await limparStore("gravacoes"); await renderConfig(); toast("Gravações apagadas."); }
    }
    else if (acao === "apagar-tudo") {
      if (confirm("ATENÇÃO: Apagará todos os dados. Continuar?")) {
        for (const s of ["perfil", "atividades", "gravacoes", "textos", "conquistas"]) await limparStore(s);
        await renderInicio(); toast("Dados apagados.");
      }
    }
  } catch (err) { console.error(err); toast("Erro: " + err.message); }
});

// ─── Gravador via eventos diretos ─────────────────────────────
$("#principal").addEventListener("click", e => {
  if (e.target.id === "iniciar-gravacao") iniciarGravacao();
  if (e.target.id === "pausar-gravacao") alternarPausaGravacao();
  if (e.target.id === "parar-gravacao" && gravador && gravador.state !== "inactive") {
    gravador.stop(); e.target.disabled = true;
    const p = $("#pausar-gravacao"); if (p) p.disabled = true;
    const ini = $("#iniciar-gravacao"); if (ini) { ini.disabled = false; ini.classList.remove("btn-gravando"); }
    const est = $("#estado-gravacao"); if (est) { est.textContent = "Salvando…"; est.classList.remove("status-gravando"); }
  }
  const fechar = e.target.closest("#fechar-comparador");
  if (fechar) {
    const o = $("#comparador-overlay"); if (o) o.classList.add("oculto");
  }
  // Clique fora do conteúdo fecha o comparador
  if (e.target.id === "comparador-overlay") {
    e.target.classList.add("oculto");
  }
});

$("#principal").addEventListener("change", async e => {
  if (e.target.id === "importar-backup" && e.target.files?.[0]) {
    try {
      const dados = JSON.parse(await e.target.files[0].text());
      if (confirm("Restaurar substituirá os dados atuais. Continuar?")) {
        await importarTudo(dados); const p = await perfil(); aplicarTema(p.tema || "claro");
        toast("Backup restaurado!"); await navegar();
      }
    } catch (err) { toast("Erro no backup: " + err.message); }
    e.target.value = "";
  }
});

// ─── Utilitários globais ──────────────────────────────────────
function baixar(blob, nome) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function aplicarTema(tema) {
  const efetivo = tema === "auto" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro") : tema;
  document.documentElement.dataset.tema = efetivo;
}

// ─── Botão de tema ───────────────────────────────────────────
$("#tema").addEventListener("click", async () => {
  const p = await perfil();
  // Alterna entre claro e escuro; se estiver em auto, vai para claro
  const atual = document.documentElement.dataset.tema;
  p.tema = atual === "escuro" ? "claro" : "escuro";
  await salvar("perfil", p); aplicarTema(p.tema);
  if (rotaAtual === "configuracoes") await renderConfig();
});

// ─── PWA Install ─────────────────────────────────────────────
function jaInstalado() {
  return window.matchMedia('(display-mode: standalone)').matches;
}

function atualizarBotaoInstalar() {
  const btn = $("#instalar");
  if (!btn) return;
  if (jaInstalado()) {
    btn.hidden = true;
    return;
  }
  btn.hidden = !promptInstalar;
}

$("#instalar").addEventListener("click", async () => {
  if (!promptInstalar) return;
  try {
    await promptInstalar.prompt();
    const resultado = await promptInstalar.userChoice;
    if (resultado.outcome === "accepted") {
      toast("✅ App instalado com sucesso!");
    } else {
      toast("Instalação cancelada.");
    }
  } catch (e) {
    toast("Erro ao instalar: " + e.message);
  } finally {
    promptInstalar = null;
    atualizarBotaoInstalar();
  }
});

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  promptInstalar = e;
  atualizarBotaoInstalar();
});

// Se já está instalado (abriu como PWA), esconde o botão imediatamente
if (jaInstalado()) {
  const btn = $("#instalar");
  if (btn) btn.hidden = true;
}

// ─── Auto-save de rascunho + confirmação de saída ─────────────
function iniciarAutoSaveTexto() {
  const corpo = $("#corpo-texto");
  const titulo = $("#titulo-texto");
  const tags = $("#tags-texto");
  if (!corpo) return;

  function salvarRascunho() {
    if (!temAlteracoesNaoSalvas) return;
    const dados = {
      id: $("#id-texto-atual")?.value || id(),
      titulo: titulo?.value.trim() || "",
      conteudo: corpo.value.trim(),
      tags: tags?.value.split(",").map(t => t.trim().toLowerCase()).filter(Boolean) || [],
      data: hoje(),
      atualizadoEm: new Date().toISOString(),
      tipo: "texto",
      rascunho: true
    };
    salvar("textos", dados).catch(() => {});
  }

  corpo.addEventListener("input", () => {
    temAlteracoesNaoSalvas = true;
    clearTimeout(rascunhoTimer);
    rascunhoTimer = setTimeout(salvarRascunho, 2000);
  });
  titulo?.addEventListener("input", () => { temAlteracoesNaoSalvas = true; });
  tags?.addEventListener("input", () => { temAlteracoesNaoSalvas = true; });
}

function pararAutoSaveTexto() {
  clearTimeout(rascunhoTimer);
}

window.addEventListener("beforeunload", e => {
  if (temAlteracoesNaoSalvas && gravador?.state !== "inactive") {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ─── Hash routing ─────────────────────────────────────────────
window.addEventListener("hashchange", navegar);

// ─── Boot ─────────────────────────────────────────────────────
(async () => {
  try {
    const p = await perfil(); aplicarTema(p.tema || "claro"); await navegar();
    const tpPendente = sessionStorage.getItem("tp-texto-pendente");
    if (tpPendente && rotaAtual === "teleprompter") {
      sessionStorage.removeItem("tp-texto-pendente");
      const tp = $("#tp-texto"); if (tp) tp.value = tpPendente;
    }
  } catch (e) { principal.textContent = "Não foi possível iniciar: " + e.message; }
  if ("serviceWorker" in navigator) {
    try { await navigator.serviceWorker.register("./sw.js"); $("#status-offline").textContent = "● Pronto para uso offline"; }
    catch (e) { $("#status-offline").textContent = "● Offline disponível em HTTPS"; console.warn(e); }
  } else { $("#status-offline").textContent = "● PWA não suportado neste navegador"; }
})();
