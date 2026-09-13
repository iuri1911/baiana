# Baiana — treino de braço

App de braço para **guitarra baiana de 5 cordas afinada em quintas**
(Dó–Sol–Ré–Lá–Mi), o instrumento que nenhum app de guitarra ou baixo cobre.
Roda no navegador, instala como app no celular e funciona offline.

→ https://iuri1911.github.io/baiana/

## O que tem

- **Braço** — toque para ouvir a nota e ver onde mais ela cai no braço inteiro.
- **Treino** — três exercícios sobre a mesma moldura:
  - *achar a nota* (o app diz, você aponta; opção de achar todas as ocorrências);
  - *nomear a posição* (o app acende, você diz que nota é);
  - *intervalos e oitavas* (a partir de uma raiz, ache a quinta, a oitava, a terça).
  O sorteio é por **repetição espaçada, posição por posição**: o que você erra ou
  demora volta mais cedo, o que você acerta rápido some por um intervalo que dobra.
- **Formas** — escalas e arpejos no braço, com grau em cada nota, tocando
  ascendente, descendente ou em bloco.
- **Tocar** — treino de velocidade **ouvindo o instrumento pelo microfone**.
  Escolha a forma, a tônica e a subdivisão; o app toca o metrônomo, escuta o que
  você tocou e diz se a repetição saiu limpa. Duas limpas sobem o BPM, duas
  reprovadas descem. Detalhes abaixo.
- **Mapa** — o braço colorido pelo que você acerta, para saber o que treinar.
- **Ajustes** — afinação corda a corda, número de trastes, marcadores de casa,
  nomes em Dó Ré Mi ou C D E, braço horizontal em todas as telas.

Nada sai do aparelho: configuração e progresso ficam no `localStorage`, com
exportar e importar em JSON.

## Por que quintas mudam o jogo

Toda corda vizinha guarda a mesma distância (7 semitons). Diferente do violão,
que tem o salto de terça na corda Si, **uma forma decorada aqui vale igual em
qualquer par de cordas**. O app usa isso: depois de acertar um intervalo, ele
mostra o deslocamento ("1 corda acima, mesma casa") que serve no braço inteiro.

## Identidade

A mesma do [iuri.io](https://iuri.io): JetBrains Mono, fundo `#0B0B0C`, verde
`#9FE870` como única cor viva, canto reto, borda de 1px, rótulo em caixa alta e
título em prompt de terminal. Os tokens são cópia de `src/styles/global.css` do
site; a fonte vem embutida (subset latino) porque o app tem que abrir offline.

## Tocar: como o app ouve

Não há MIDI num instrumento de corda, então a entrada é o microfone. A cadeia é
worklet → altura → nota → avaliação, e cada etapa existe por um motivo:

- **O worklet só carimba o tempo.** Ele fatia o áudio e diz *quando* cada bloco
  chegou; altura e ataque saem no lado de cá, em TypeScript testável.
- **Duas taxas.** A energia sai a cada 128 amostras (~2,7 ms) e é dela que vem o
  instante do ataque; a altura sai a cada 512 (~10,7 ms), que é o que o
  [McLeod Pitch Method](https://www.npmjs.com/package/pitchy) precisa.
- **A nota é carimbada no ataque, não em quando a altura se firmou.** A altura só
  fecha uns 30 ms depois — no ataque o que existe é transiente. Usar esse
  instante jogaria toda a medida de regularidade para a frente.
- **O ataque é achado pelo agudo, não pelo volume.** Palheta batendo solta um
  estalo de agudo que a corda em decaimento já perdeu. Procurando salto de
  volume, nota repetida no mesmo volume — tremolo, que é *o* golpe do bandolim —
  não levantava ataque nenhum e sumia da avaliação.
- **O clique do metrônomo é ruído filtrado, não um bipe.** Uma senoide de 1200 Hz
  *é* uma nota: o detector casaria nela com confiança altíssima e a contaria como
  nota tocada, bem em cima do tempo, que é onde mais estraga. Ruído em
  passa-faixa não tem período, então a confiança despenca e o filtro descarta
  sozinho. Ainda assim, prefira fone de ouvido.
- **Fora da extensão do instrumento não é o instrumento.** Voz, ar condicionado e
  harmônico confundido com fundamental caem fora e são descartados.

A repetição passa quando as notas saem certas e na ordem **e** o espaçamento
entre ataques é regular (coeficiente de variação abaixo do limite), no andamento
pedido. Regularidade importa mais que grudar no clique: escala corrida mal tocada
quase sempre está certa na média e torta no detalhe. O orçamento de erro tem
**piso de 1** — exigir execução perfeita numa forma de 14 notas não é estudo, é
loteria. E repetição em que você não tocou nada não conta como falha nem baixa o
andamento.

Se as notas caem sistematicamente longe do clique, ajuste **atraso da entrada**
até o número `grade` do veredito cair. Desvio constante não afeta regularidade
nem aprovação.

A digitação sai da mão ficar parada, não da nota ficar perto da anterior — e a
diferença importa justamente em quintas. Dó maior sai `0-2-4-5` numa corda e
`0-2-4-5` na vizinha, com o braço esquerdo no lugar. Comparando com a nota
anterior, a escala subia a corda grave inteira até a 12ª casa: barato passo a
passo, e nada do que alguém toca.

## Som

Corda pinçada por Karplus–Strong, gerada na hora em Web Audio — sem arquivo de
áudio nenhum, e cobre qualquer afinação que você configurar. No iPhone, o botão
de silêncio corta o som do navegador.

## Desenvolver

```bash
npm install
npm run dev             # teste local em http://localhost:5173/baiana/
npm test                # núcleo musical, geometria do braço e fumaça do app
npm run build && npm run preview
node scripts/gerar-icones.mjs   # regera os PNG do ícone, sem dependência externa
```

O código está em português. `src/core/` é TypeScript puro e testado — teoria
musical, afinação, posições no braço, escalas e o algoritmo de repetição
espaçada. `src/shred/` é o treino por áudio, também puro e testado: a expansão da
forma em notas no tempo, a avaliação da repetição, a escada de BPM e o rastreador
que vira quadros de áudio em notas. `src/components/Fretboard.tsx` desenha o
braço e é usado por todas as telas. O worklet mora em `public/pitch-worklet.js`
porque worklet de áudio é carregado por URL e não aceita `import`.

Publicação: Action do GitHub para Pages a cada push na `main`.

## Testar o treino por áudio

Abra https://iuri1911.github.io/baiana/ no celular ou computador. O acesso pelo
IP do servidor em HTTP não libera o microfone; use o link HTTPS publicado.

1. Confira a oitava do instrumento e entre em **Tocar**.
2. Ligue o microfone, autorize o navegador e toque uma corda solta por vez.
3. Meça o silêncio da sala e confirme que as notas aparecem corretamente.
4. Para começar, escolha **Maior** (arpejo), tônica Dó, uma oitava, direção
   ascendente, colcheias e 60 BPM. Use **Ouvir exercício** para escutar o exercício.
5. Toque **Começar**, espere a contagem e execute uma nota por vez, com fones.
   O veredito apresenta acertos, notas que faltaram ou sobraram e regularidade.
6. **Parar** encerra também a captura. Use **Conferir o microfone novamente**
   para refazer a calibração quando mudar de aparelho ou ambiente.

Validação de setembro de 2026: 138 testes automatizados, compilação e teste de
navegação em Chromium na largura de celular com microfone simulado. A precisão
com a guitarra baiana real e a compatibilidade em Safari/iPhone precisam ser
conferidas no aparelho; o teste simulado não substitui essa etapa.

### Exemplo antes de tocar e registros

**Começar** toca uma demonstração completa antes dos quatro cliques de entrada.
A demonstração não entra na avaliação. **Ouvir exercício** repete somente o
exemplo. A sequência mostra nota, corda e casa, com destaque sincronizado.
Os atalhos de Dó maior e Lá menor preparam arpejos de uma oitava a 60 BPM.

**Registro da sessão → Exportar registros** baixa um JSON com as últimas três
sessões locais, incluindo configuração, notas esperadas e detectadas, tempos,
vereditos e uma amostra por segundo do nível/confiança da entrada. Não grava
áudio nem envia dados automaticamente. Envie o arquivo no chat para análise.
Sessões longas preservam os últimos 2.500 eventos e informam quantos foram
removidos. Parar, sair da aba ou ocultar o navegador salva o registro.
