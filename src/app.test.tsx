// @vitest-environment jsdom
//
// Fumaça: monta o app de verdade, passa pela calibração, abre cada aba e
// responde uma pergunta inteira do treino. Não valida beleza — valida que a
// tela sobe, que o toque no braço vira resposta e que o progresso é gravado.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from './App'
import { SettingsProvider } from './store/settings'
import { ProgressProvider } from './store/progress'
import { DEFAULT_INSTRUMENT } from './core/tuning'
import { positionsOfPitchClass, posKey } from './core/fretboard'
import { PITCH_NAMES } from './core/music'

const inst = DEFAULT_INSTRUMENT

beforeAll(() => {
  // jsdom não tem nem um nem outro
  class RO {
    cb: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb
    }
    observe() {
      this.cb(
        [{ contentRect: { width: 420, height: 640 } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RO)
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running'
      currentTime = 0
      sampleRate = 48000
      destination = {}
      createGain() {
        return { gain: { value: 0 }, connect: (n: unknown) => n }
      }
      createBiquadFilter() {
        return { type: '', frequency: { value: 0 }, connect: (n: unknown) => n }
      }
      createBuffer(_c: number, len: number) {
        return { getChannelData: () => new Float32Array(len) }
      }
      createBufferSource() {
        return { buffer: null, connect: (n: unknown) => n, start() {}, stop() {}, onended: null }
      }
      resume() {}
    },
  )
})

beforeEach(() => localStorage.clear())
afterEach(cleanup)

function montar() {
  return render(
    <SettingsProvider>
      <ProgressProvider>
        <App />
      </ProgressProvider>
    </SettingsProvider>,
  )
}

function passarPelaCalibracao() {
  fireEvent.click(screen.getByRole('button', { name: /É isso/ }))
}

function tocar(container: HTMLElement, chave: string) {
  const alvo = container.querySelector(`[data-pos="${chave}"]`)
  expect(alvo, `a posição ${chave} deveria estar desenhada`).toBeTruthy()
  fireEvent.pointerDown(alvo!)
}

describe('app', () => {
  it('abre na conferência de oitava e só depois libera as abas', () => {
    montar()
    expect(screen.getByText(/conferir a oitava/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Treino/ })).toBeNull()

    passarPelaCalibracao()
    expect(screen.getByRole('button', { name: /Treino/ })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('baiana.config.v1')!).calibrado).toBe(true)
  })

  it('desce a afinação uma oitava quando o usuário diz que soa grave', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /uma oitava abaixo/i }))
    passarPelaCalibracao()
    const cfg = JSON.parse(localStorage.getItem('baiana.config.v1')!)
    expect(cfg.strings).toEqual(inst.strings.map((m) => m - 12))
  })

  it('no braço livre, tocar uma casa mostra a nota certa', () => {
    const { container } = montar()
    passarPelaCalibracao()
    tocar(container, '1:5') // 5ª casa da corda Sol
    expect(screen.getByText('Dó4')).toBeTruthy()
    expect(screen.getByText(/casa 5/)).toBeTruthy()
  })

  it('abre todas as abas sem quebrar', () => {
    montar()
    passarPelaCalibracao()
    for (const aba of ['Formas', 'Mapa', 'Ajustes', 'Treino', 'Braço']) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(aba) }))
      expect(screen.getByRole('navigation')).toBeTruthy()
    }
  })

  it('acerta uma pergunta de "achar a nota" e grava o progresso', () => {
    const { container } = montar()
    passarPelaCalibracao()
    fireEvent.click(screen.getByRole('button', { name: /Treino/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Começar$/ }))

    const perguntada = container.querySelector('.pergunta__nota')!.textContent!
    const pc = PITCH_NAMES.pt.sharp.indexOf(perguntada)
    expect(pc, `nota "${perguntada}" fora da lista`).toBeGreaterThanOrEqual(0)

    const resposta = positionsOfPitchClass(inst, pc, { zone: { from: 0, to: 7 } })[0]
    tocar(container, posKey(resposta))

    expect(screen.getByText(/1 ✓/)).toBeTruthy()
    const salvo = JSON.parse(localStorage.getItem('baiana.progresso.v1')!)
    expect(Object.keys(salvo[inst.strings.join(',')])).toContain(posKey(resposta))
  })

  it('erra de propósito e a série anda mesmo assim', () => {
    const { container } = montar()
    passarPelaCalibracao()
    fireEvent.click(screen.getByRole('button', { name: /Treino/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Começar$/ }))

    const perguntada = container.querySelector('.pergunta__nota')!.textContent!
    const pc = PITCH_NAMES.pt.sharp.indexOf(perguntada)
    const errada = positionsOfPitchClass(inst, (pc + 1) % 12, { zone: { from: 0, to: 7 } })[0]
    tocar(container, posKey(errada))

    expect(screen.getByText(/1\/20/)).toBeTruthy()
    expect(screen.getByText(/0 ✓/)).toBeTruthy()
  })

  it('o modo "nomear" pergunta pelo nome e aceita o botão da nota', () => {
    montar()
    passarPelaCalibracao()
    fireEvent.click(screen.getByRole('button', { name: /Treino/ }))
    fireEvent.click(screen.getByRole('button', { name: /Nomear/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Começar$/ }))

    expect(screen.getByText(/Que nota é essa/)).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Dó' })[0])
    expect(screen.getByText(/1\/20/)).toBeTruthy()
  })
})
