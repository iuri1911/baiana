// Gera os PNG do ícone sem depender de nada: desenha num buffer RGBA e
// escreve o PNG na mão (o zlib já vem no Node). Uma dependência a menos para
// instalar em qualquer máquina que for buildar isto.
//
//   node scripts/gerar-icones.mjs

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const SUPER = 3 // supersample, para a borda não sair serrilhada

const cor = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

function desenhar(tamanho) {
  const N = tamanho * SUPER
  const px = Buffer.alloc(N * N * 3)

  const pinta = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= N || y >= N) return
    const i = (y * N + x) * 3
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
  }
  const retangulo = (x0, y0, x1, y1, c) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++) {
      for (let x = Math.round(x0); x < Math.round(x1); x++) pinta(x, y, c)
    }
  }
  const circulo = (cx, cy, r, c) => {
    for (let y = Math.round(cy - r); y <= cy + r; y++) {
      for (let x = Math.round(cx - r); x <= cx + r; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) pinta(x, y, c)
      }
    }
  }

  // fundo cheio: ícone maskable pode ser recortado em círculo
  retangulo(0, 0, N, N, cor('#1b120c'))
  // escala
  retangulo(N * 0.16, 0, N * 0.84, N, cor('#35241a'))
  // pestana
  retangulo(N * 0.16, N * 0.1, N * 0.84, N * 0.14, cor('#e8e2d4'))
  // trastes
  for (const t of [0.36, 0.58, 0.78, 0.95]) {
    retangulo(N * 0.16, N * t, N * 0.84, N * (t + 0.012), cor('#9c968a'))
  }
  // cordas, mais grossas do grave para o agudo
  for (let i = 0; i < 5; i++) {
    const x = N * (0.22 + i * 0.14)
    const w = N * (0.016 - i * 0.002)
    retangulo(x - w / 2, 0, x + w / 2, N, cor('#d8cdb8'))
  }
  // a nota
  circulo(N * 0.5, N * 0.47, N * 0.115, cor('#e0a34a'))

  // reduz o supersample
  const saida = Buffer.alloc(tamanho * tamanho * 3)
  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SUPER; sy++) {
        for (let sx = 0; sx < SUPER; sx++) {
          const i = ((y * SUPER + sy) * N + x * SUPER + sx) * 3
          r += px[i]
          g += px[i + 1]
          b += px[i + 2]
        }
      }
      const n = SUPER * SUPER
      const j = (y * tamanho + x) * 3
      saida[j] = r / n
      saida[j + 1] = g / n
      saida[j + 2] = b / n
    }
  }
  return saida
}

function png(rgb, tamanho) {
  const linhas = Buffer.alloc((tamanho * 3 + 1) * tamanho)
  for (let y = 0; y < tamanho; y++) {
    linhas[y * (tamanho * 3 + 1)] = 0 // filtro "none"
    rgb.copy(linhas, y * (tamanho * 3 + 1) + 1, y * tamanho * 3, (y + 1) * tamanho * 3)
  }

  const crcTabela = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTabela[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const bloco = (tipo, dados) => {
    const tam = Buffer.alloc(4)
    tam.writeUInt32BE(dados.length)
    const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
    const soma = Buffer.alloc(4)
    soma.writeUInt32BE(crc(corpo))
    return Buffer.concat([tam, corpo, soma])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tamanho, 0)
  ihdr.writeUInt32BE(tamanho, 4)
  ihdr[8] = 8 // bits por canal
  ihdr[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(linhas, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(join(raiz, 'public'), { recursive: true })
for (const tamanho of [192, 512]) {
  const arquivo = join(raiz, 'public', `icone-${tamanho}.png`)
  writeFileSync(arquivo, png(desenhar(tamanho), tamanho))
  console.log('escrito', arquivo)
}
