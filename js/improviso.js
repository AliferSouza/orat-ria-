// ============================================================
//  BANCO DE DADOS DO IMPROVISO — ROLETA DE TEMAS
// ============================================================

export const TEMAS_IMPROVISO = [
  "A importância de saber dizer não",
  "O que aprendi com um erro que cometi",
  "Como o hábito da leitura transforma a comunicação",
  "Inteligência emocional no trabalho",
  "Por que a empatia é uma habilidade prática",
  "O papel da tecnologia na educação",
  "Como construir confiança em público",
  "O valor do silêncio em uma conversa",
  "Uma experiência que mudou minha forma de pensar",
  "Por que consistência supera talento",
  "O que diferencia um líder de um chefe",
  "Como lidar com críticas construtivas",
  "A importância de pedir ajuda",
  "Minha relação com o tempo livre",
  "Por que o café da manhã importa",
  "Como a música influencia a produtividade",
  "O que significa ser autêntico",
  "A arte de escutar bem",
  "Como pequenas mudanças criam grandes resultados",
  "O que me motiva a continuar aprendendo",
  "Por que dormir bem é estratégico",
  "Meu livro, filme ou série favorito e o que me ensinou",
  "Como lidar com a procrastinação",
  "A importância de celebrar conquistas pequenas",
  "O que significa coragem no cotidiano",
  "Como a gratidão muda a perspectiva",
  "O valor das conversas difíceis",
  "Por que a organização mental precede a organização física",
  "Como construir uma rotina sustentável",
  "O que aprendi sobre comunicação ao observar outras pessoas falar"
];

export const PUBLICOS_IMPROVISO = [
  "Para crianças de 8 a 10 anos",
  "Para colegas de trabalho",
  "Para investidores exigentes",
  "Para uma roda de amigos",
  "Para um professor ou mentor",
  "Para alguém que discorda de você",
  "Para uma plateia de universitários",
  "Para uma entrevista de emprego",
  "Para clientes desconhecidos",
  "Para um grupo de idosos",
  "Para iniciantes completos no tema",
  "Para especialistas da área"
];

export const RESTRICOES_IMPROVISO = [
  "Sem usar a palavra 'coisa' ou 'isso'",
  "Comece com uma pergunta retórica",
  "Inclua um dado ou número inventado mas plausível",
  "Use uma analogia inusitada",
  "Fale em exatamente 60 segundos",
  "Sem vírgulas — use apenas pontos e ponto de exclamação",
  "Comece com uma história pessoal curta",
  "Feche com uma frase memorável ou chamada para ação",
  "Sem usar a palavra 'muito'",
  "Use a estrutura: problema → causa → solução",
  "Faça uma pausa de 2 segundos entre cada ponto",
  "Inclua um elogio sincero ao público no início"
];

export function sortearImproviso() {
  const aleatorio = (arr) => arr[Math.floor(Math.random() * arr.length)];
  return {
    tema: aleatorio(TEMAS_IMPROVISO),
    publico: aleatorio(PUBLICOS_IMPROVISO),
    restricao: aleatorio(RESTRICOES_IMPROVISO)
  };
}
