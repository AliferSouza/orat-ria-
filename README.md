# Oratória Diária — PWA local-first

Aplicativo em HTML, CSS e JavaScript nativos, sem framework e sem backend. Os dados pessoais são armazenados no IndexedDB do navegador.

## Executar localmente

No Windows, você pode simplesmente dar **dois cliques em `iniciar.bat`** (ou executar `.\servidor.ps1` no PowerShell).

Ou com Python:

```bash
python3 -m http.server 8080
```

Abra `http://localhost:8080`.

> O Service Worker, a instalação PWA e o microfone precisam de contexto seguro: `localhost` funciona para testes. Em hospedagem, use HTTPS.

## Recursos

- Início com meta de prática diária, resumo de atividades e contador de sequência (streak com recorde histórico).
- Exercícios guiados de oratória, improviso, aquecimento vocal, eliminação de muletas de fala e argumentação.
- Cronômetro interativo em cada exercício com sinal sonoro suave ao completar o tempo sugerido.
- Oficina de escrita com métricas em tempo real (palavras, caracteres, frases, tempo de leitura e tempo de fala em voz alta a 130 ppm).
- Revisor textual com detecção de redundâncias/pleonasmos, frases excessivamente longas e vícios de linguagem.
- Gravações de voz com visualizador de ondas sonoras em tempo real (`AudioContext`), controles de pausa/retomada e download do arquivo de áudio.
- Progresso com gráficos dos últimos 14 dias e histórico detalhado.
- Perfil, tema claro/escuro/automático e meta diária configurável.
- Backup JSON completo (incluindo áudios em Base64) e restauração local.
- Service Worker com cache offline atualizado (v2).
- Ícones vetoriais SVG e PNGs de alta resolução (192×192 e 512×512) compatíveis com PWA maskable.

## Privacidade e limites

- Não há conta nem servidor próprio.
- Os dados ficam no navegador/dispositivo; limpar os dados do navegador pode apagá-los.
- O backup JSON pode conter textos e gravações: mantenha-o em local seguro.
- A disponibilidade do microfone depende do navegador e da permissão do usuário.
- O revisor usa regras simples e não substitui revisão humana.
- O progresso mostra registros e estimativas; não é uma nota científica nem comprova melhora de habilidade.

## Estrutura

- `index.html`: estrutura principal
- `css/estilo.css`: aparência responsiva, visualizador e temas
- `js/app.js`: telas, cronômetro, áudio visualizer, navegação e ações
- `js/db.js`: IndexedDB, backup e restauração
- `js/conteudo.js`: exercícios pedagógicos, aquecimento vocal e dicas
- `sw.js`: cache offline v2
- `manifest.webmanifest`: configuração PWA com ícones responsivos
- `icons/`: ícones SVG e PNG (192x192, 512x512)
- `iniciar.bat` e `servidor.ps1`: inicialização local imediata no Windows sem dependências

## Próximos passos sugeridos

1. Testar no Chromium e Firefox, incluindo recarregamento offline.
2. Testar backup/restauração com gravações grandes.
3. Acrescentar testes automatizados adicionais se desejado.
