// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Mic } from './mic'

const ctx = vi.hoisted(() => ({
  state: 'running',
  audioWorklet: { addModule: vi.fn() },
  createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
}))
vi.mock('../../audio/engine', () => ({ audioContext: () => ctx }))
const stopTrack = vi.fn()
const stream = { getTracks: () => [{ stop: stopTrack }] }
const getUserMedia = vi.fn()
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('isSecureContext', true)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  getUserMedia.mockResolvedValue(stream)
  ctx.audioWorklet.addModule.mockResolvedValue(undefined)
  vi.stubGlobal('AudioWorkletNode', class {
    port = { close: vi.fn(), onmessage: null }
    disconnect = vi.fn()
  })
})
afterEach(() => vi.unstubAllGlobals())

it('explica a exigência de HTTPS antes de solicitar o microfone', async () => {
  vi.stubGlobal('isSecureContext', false)
  await expect(new Mic().start()).rejects.toThrow('HTTPS')
  expect(getUserMedia).not.toHaveBeenCalled()
})
it('libera o microfone se o processador de áudio falhar', async () => {
  ctx.audioWorklet.addModule.mockRejectedValueOnce(new Error('worklet indisponível'))
  const mic = new Mic()
  await expect(mic.start()).rejects.toThrow('worklet indisponível')
  expect(stopTrack).toHaveBeenCalledOnce()
  expect(mic.running).toBe(false)
  await mic.start()
  expect(mic.running).toBe(true)
  mic.stop()
})
it('encerra a captura concedida depois de sair da tela', async () => {
  let grant!: (value: unknown) => void
  getUserMedia.mockReturnValue(new Promise((resolve) => { grant = resolve }))
  const mic = new Mic()
  const opening = mic.start()
  mic.stop()
  grant(stream)
  await expect(opening).rejects.toMatchObject({ name: 'AbortError' })
  expect(stopTrack).toHaveBeenCalledOnce()
  expect(mic.running).toBe(false)
})
it('cliques simultâneos compartilham uma solicitação e parar libera a captura', async () => {
  const mic = new Mic()
  await Promise.all([mic.start(), mic.start()])
  expect(getUserMedia).toHaveBeenCalledOnce()
  expect(mic.running).toBe(true)
  mic.stop()
  expect(stopTrack).toHaveBeenCalledOnce()
  expect(mic.running).toBe(false)
})
