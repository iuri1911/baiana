import { describe, expect, it } from 'vitest'
import { layout } from './geometry'
import { DEFAULT_INSTRUMENT } from '../core/tuning'

const inst = DEFAULT_INSTRUMENT
const base = { inst, width: 400, height: 700, lowFirst: true as const }

describe('geometria do braço', () => {
  it('em pé, o braço desce a tela; deitado, atravessa', () => {
    const emPe = layout({ ...base, zone: { from: 0, to: 7 }, orientation: 'vertical' })
    expect(emPe.along).toBe(700)
    expect(emPe.across).toBe(400)
    expect(emPe.pt(100, 50)).toEqual({ x: 50, y: 100 })

    const deitado = layout({ ...base, zone: { from: 0, to: 7 }, orientation: 'horizontal' })
    expect(deitado.along).toBe(400)
    expect(deitado.pt(100, 50)).toEqual({ x: 100, y: 50 })
  })

  it('as casas andam sempre para frente e cabem na tela', () => {
    const l = layout({ ...base, zone: { from: 0, to: 7 }, orientation: 'vertical' })
    let anterior = -1
    for (const n of l.frets.filter((f) => f > 0)) {
      const [ini, fim] = l.cellSpan(n)
      expect(fim).toBeGreaterThan(ini)
      expect(fim).toBeLessThanOrEqual(l.along + 0.001)
      expect(fim).toBeGreaterThan(anterior)
      anterior = fim
    }
  })

  it('a casa aguda é mais estreita que a grave — é o braço de verdade', () => {
    const l = layout({ ...base, zone: { from: 0, to: 7 }, orientation: 'vertical' })
    const larg = (n: number) => l.cellSpan(n)[1] - l.cellSpan(n)[0]
    expect(larg(1)).toBeGreaterThan(larg(7))
  })

  it('janela larga derrete para o espaçamento uniforme, senão a 24ª some', () => {
    const curta = layout({ ...base, zone: { from: 0, to: 7 }, orientation: 'vertical' })
    const longa = layout({ ...base, zone: { from: 0, to: 24 }, orientation: 'vertical' })
    const razao = (l: ReturnType<typeof layout>, a: number, b: number) =>
      (l.cellSpan(a)[1] - l.cellSpan(a)[0]) / (l.cellSpan(b)[1] - l.cellSpan(b)[0])
    expect(razao(curta, 1, 7)).toBeGreaterThan(razao(longa, 1, 7))
    expect(longa.cellSpan(24)[1] - longa.cellSpan(24)[0]).toBeGreaterThan(12)
  })

  it('a corda solta só ganha faixa quando a janela começa no zero', () => {
    expect(layout({ ...base, zone: { from: 0, to: 5 }, orientation: 'vertical' }).openWidth).toBeGreaterThan(0)
    expect(layout({ ...base, zone: { from: 5, to: 12 }, orientation: 'vertical' }).openWidth).toBe(0)
  })

  it('as cordas ficam dentro do braço e invertem com lowFirst', () => {
    const l = layout({ ...base, zone: { from: 0, to: 7 }, orientation: 'vertical' })
    for (let s = 0; s < inst.strings.length; s++) {
      expect(l.stringAt(s)).toBeGreaterThanOrEqual(0)
      expect(l.stringAt(s)).toBeLessThanOrEqual(l.across)
    }
    expect(l.stringAt(0)).toBeLessThan(l.stringAt(4))
    const invertido = layout({ ...base, lowFirst: false, zone: { from: 0, to: 7 }, orientation: 'vertical' })
    expect(invertido.stringAt(0)).toBeGreaterThan(invertido.stringAt(4))
  })

  it('o Dó fica embaixo no braço deitado — é a corda mais perto de quem olha', () => {
    const deitado = layout({ ...base, zone: { from: 0, to: 7 }, orientation: 'horizontal' })
    // no deitado o eixo transversal é o y da tela, e y maior é mais embaixo
    expect(deitado.pt(10, deitado.stringAt(0)).y).toBeGreaterThan(deitado.pt(10, deitado.stringAt(4)).y)
  })

  it('em pé e deitado são a mesma vista girada: grave à esquerda vira grave embaixo', () => {
    const emPe = layout({ ...base, zone: { from: 0, to: 7 }, orientation: 'vertical' })
    const deitado = layout({ ...base, zone: { from: 0, to: 7 }, orientation: 'horizontal' })
    const ordemEmPe = [0, 1, 2, 3, 4].map((s) => emPe.stringAt(s))
    const ordemDeitado = [0, 1, 2, 3, 4].map((s) => deitado.stringAt(s))
    // girar 90° no sentido do relógio troca o sentido do eixo transversal
    expect(ordemEmPe.map((v, i, a) => v < (a[i + 1] ?? Infinity))).toEqual([true, true, true, true, true])
    expect(ordemDeitado.map((v, i, a) => v > (a[i + 1] ?? -Infinity))).toEqual([true, true, true, true, true])
  })

  it('aguenta tela de tamanho zero antes do primeiro layout', () => {
    const l = layout({ ...base, width: 0, height: 0, zone: { from: 0, to: 7 }, orientation: 'vertical' })
    expect(Number.isFinite(l.step)).toBe(true)
    expect(Number.isFinite(l.cellCenter(3))).toBe(true)
  })
})
