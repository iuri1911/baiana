// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest'
import { SessionRecorder, loadSessions } from './sessionLog'
beforeEach(() => localStorage.clear())
it('salva notas e vereditos sem duplicar a sessão e conserva só as últimas três', () => {
  vi.spyOn(performance, 'now').mockReturnValue(100)
  const recorder = new SessionRecorder()
  for (let i = 0; i < 4; i++) {
    vi.useFakeTimers().setSystemTime(new Date(2026, 8, 13, 12, i))
    recorder.begin({ bpm: 60 + i })
    recorder.add('note', { midi: 60, onTime: 150 })
    recorder.save()
    recorder.save()
  }
  expect(loadSessions()).toHaveLength(3)
  expect(loadSessions()[2].config).toEqual({ bpm: 63 })
  expect(loadSessions()[2].events[1].data).toEqual({ midi: 60, onTime: 150 })
  vi.useRealTimers()
  vi.restoreAllMocks()
})
it('limita o tamanho de sessões longas e informa eventos descartados', () => {
  const recorder = new SessionRecorder()
  recorder.begin({})
  for (let i = 0; i < 2600; i++) recorder.add('note', { midi: 60 })
  expect(recorder.session?.events).toHaveLength(2500)
  expect(recorder.session?.dropped).toBe(101)
})
it('não interrompe o treino se o armazenamento estiver indisponível', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  const recorder = new SessionRecorder()
  recorder.begin({})
  expect(recorder.save()).toBe(false)
  spy.mockRestore()
})
