// ============================================================
//  SISTEMA DE CONQUISTAS — ORATÓRIA DIÁRIA
//  Todas as verificações são locais e baseadas no IndexedDB.
// ============================================================

export const CONQUISTAS = [
  {
    id: "primeira-voz",
    emoji: "🎙️",
    titulo: "Primeira Voz",
    descricao: "Realizou sua primeira gravação de prática.",
    verificar: ({ gravacoes }) => gravacoes.length >= 1
  },
  {
    id: "texto-nascente",
    emoji: "✍️",
    titulo: "Texto Nascente",
    descricao: "Salvou seu primeiro texto na oficina de escrita.",
    verificar: ({ textos }) => textos.length >= 1
  },
  {
    id: "primeiro-passo",
    emoji: "👣",
    titulo: "Primeiro Passo",
    descricao: "Concluiu sua primeira atividade guiada.",
    verificar: ({ atividades }) => atividades.length >= 1
  },
  {
    id: "chama-viva",
    emoji: "🔥",
    titulo: "Chama Viva",
    descricao: "Praticou por 3 dias consecutivos.",
    verificar: ({ streak }) => streak.atual >= 3
  },
  {
    id: "semana-solida",
    emoji: "📅",
    titulo: "Semana Sólida",
    descricao: "Praticou por 7 dias consecutivos.",
    verificar: ({ streak }) => streak.atual >= 7
  },
  {
    id: "foco-e-ritmo",
    emoji: "🎯",
    titulo: "Foco e Ritmo",
    descricao: "Praticou o exercício de eliminação de muletas de fala.",
    verificar: ({ atividades }) => atividades.some(a => a.exercicioId === "vicios-fala")
  },
  {
    id: "voz-aquecida",
    emoji: "🎤",
    titulo: "Voz Aquecida",
    descricao: "Completou o exercício de aquecimento vocal.",
    verificar: ({ atividades }) => atividades.some(a => a.exercicioId === "aquecimento")
  },
  {
    id: "improvisador",
    emoji: "⚡",
    titulo: "Improvisador",
    descricao: "Completou um discurso relâmpago de improviso.",
    verificar: ({ atividades }) => atividades.some(a => a.exercicioId === "improviso")
  },
  {
    id: "texto-polido",
    emoji: "💎",
    titulo: "Texto Polido",
    descricao: "Escreveu e revisou um texto com mais de 200 palavras.",
    verificar: ({ textos }) => textos.some(t => (t.conteudo.match(/\S+/g) || []).length >= 200)
  },
  {
    id: "uma-hora",
    emoji: "⏰",
    titulo: "Uma Hora de Prática",
    descricao: "Acumulou 60 minutos de exercícios registrados.",
    verificar: ({ atividades }) => atividades.reduce((s, a) => s + (a.minutos || 0), 0) >= 60
  },
  {
    id: "colecionador-de-voz",
    emoji: "🗃️",
    titulo: "Colecionador de Voz",
    descricao: "Guardou 5 gravações de prática.",
    verificar: ({ gravacoes }) => gravacoes.length >= 5
  },
  {
    id: "retor",
    emoji: "🏛️",
    titulo: "Retor",
    descricao: "Completou o exercício de defesa de opinião.",
    verificar: ({ atividades }) => atividades.some(a => a.exercicioId === "argumento")
  },
  {
    id: "narrador",
    emoji: "📖",
    titulo: "Narrador",
    descricao: "Completou o exercício de contar uma pequena história.",
    verificar: ({ atividades }) => atividades.some(a => a.exercicioId === "historia")
  },
  {
    id: "recorde",
    emoji: "🏆",
    titulo: "Novo Recorde",
    descricao: "Atingiu sua melhor sequência de dias consecutivos.",
    verificar: ({ streak }) => streak.atual > 0 && streak.atual >= streak.melhor && streak.melhor >= 5
  }
];

/**
 * Verifica quais conquistas foram desbloqueadas com base nos dados atuais.
 * @param {object} dados - { atividades, gravacoes, textos, streak }
 * @param {string[]} jaDesbloqueadas - IDs já registrados anteriormente
 * @returns {{ todas: object[], novas: object[] }}
 */
export function verificarConquistas(dados, jaDesbloqueadas = []) {
  const desbloqueadas = CONQUISTAS.filter(c => c.verificar(dados));
  const novas = desbloqueadas.filter(c => !jaDesbloqueadas.includes(c.id));
  return { todas: desbloqueadas, novas };
}
