// Fatiador de quadros com carimbo de tempo exato.
//
// Nao ha algoritmo nenhum aqui de proposito: worklet de audio e carregado por
// URL e nao aceita import, entao qualquer coisa que dependesse de biblioteca
// teria que ser empacotada a mao. O que so o worklet sabe fazer e dizer QUANDO
// cada amostra chegou — e e so isso que ele faz. Altura e ataque saem no lado
// de la, em TypeScript testavel.
//
// Duas taxas, de proposito:
//  - energia por bloco de 128 amostras (~2,7 ms): e dela que sai o instante do
//    ataque, e o instante e o que a avaliacao de tempo mede;
//  - janela de 2048 amostras a cada 512 (~10,7 ms): e o que a deteccao de
//    altura precisa. Dó3 tem periodo de 367 amostras, entao 2048 cobre cinco
//    periodos da nota mais grave do instrumento.

const WINDOW = 2048
const HOP = 512

class PitchFrames extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ring = new Float32Array(WINDOW)
    this.write = 0
    this.filled = 0
    this.sinceHop = 0
    this.blocks = []
    this.last = 0
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0]
    // Sem entrada ligada o no continua vivo: devolver false o mataria de vez, e
    // o microfone pode voltar (troca de dispositivo, permissao concedida depois).
    if (!ch) return true
    const n = ch.length

    // Duas energias por bloco. A segunda e a que importa para achar palhetada:
    // a diferenca entre amostras vizinhas e um passa-altas de primeira ordem, e
    // palheta batendo na corda solta um estalo de agudo que a nota ja soando nao
    // tem — corda em decaimento perde o brilho antes de perder o volume. Sem
    // isso, nota repetida no mesmo volume (tremolo, que e O golpe do bandolim)
    // nao levantava ataque nenhum e sumia da avaliacao.
    let sum = 0
    let hf = 0
    let prev = this.last
    for (let i = 0; i < n; i++) {
      const x = ch[i]
      sum += x * x
      const d = x - prev
      hf += d * d
      prev = x
    }
    this.last = prev
    this.blocks.push({ time: currentTime, rms: Math.sqrt(sum / n), hf: Math.sqrt(hf / n) })
    // So cresce sem limite se a janela nunca encher — nao deveria acontecer,
    // mas um vazamento aqui roda para sempre dentro do thread de audio.
    if (this.blocks.length > 64) this.blocks.shift()

    for (let i = 0; i < n; i++) {
      this.ring[this.write] = ch[i]
      this.write = (this.write + 1) % WINDOW
    }
    this.filled = Math.min(WINDOW, this.filled + n)
    this.sinceHop += n

    if (this.sinceHop >= HOP && this.filled >= WINDOW) {
      this.sinceHop = 0
      const samples = new Float32Array(WINDOW)
      // `write` aponta para o mais antigo: o buffer circular desenrola a partir dali.
      for (let i = 0; i < WINDOW; i++) samples[i] = this.ring[(this.write + i) % WINDOW]
      this.port.postMessage(
        { samples, time: currentTime + n / sampleRate, blocks: this.blocks },
        [samples.buffer],
      )
      this.blocks = []
    }
    return true
  }
}

registerProcessor('pitch-frames', PitchFrames)
