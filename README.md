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
- **Mapa** — o braço colorido pelo que você acerta, para saber o que treinar.
- **Ajustes** — afinação corda a corda, número de trastes, marcadores de casa,
  nomes em Dó Ré Mi ou C D E, braço em pé ou deitado.

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

## Som

Corda pinçada por Karplus–Strong, gerada na hora em Web Audio — sem arquivo de
áudio nenhum, e cobre qualquer afinação que você configurar. No iPhone, o botão
de silêncio corta o som do navegador.

## Desenvolver

```bash
npm install
npm run dev -- --host   # abre no celular pelo IP da máquina
npm test                # núcleo musical, geometria do braço e fumaça do app
npm run build && npm run preview
node scripts/gerar-icones.mjs   # regera os PNG do ícone, sem dependência externa
```

O código está em português. `src/core/` é TypeScript puro e testado — teoria
musical, afinação, posições no braço, escalas e o algoritmo de repetição
espaçada. `src/components/Fretboard.tsx` desenha o braço e é usado por todas as
telas. Publicação: Action do GitHub para Pages a cada push na `main`.
