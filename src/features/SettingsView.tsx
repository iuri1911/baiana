// Ajustes: afinacao, nomes das notas, jeito de desenhar o braco.

import { useState } from 'react'
import { Alternar, Painel, Segmentado } from '../components/ui'
import { noteName } from '../core/music'
import { PRESETS, isRegular, stringStep } from '../core/tuning'
import { pluck } from '../audio/engine'
import { aplicarPreset, useSettings } from '../store/settings'
import { Calibration } from './Calibration'

export function SettingsView() {
  const { cfg, set, reset, inst, nameOpts } = useSettings()
  const [conferindo, setConferindo] = useState(false)

  if (conferindo) return <Calibration onPronto={() => setConferindo(false)} />

  const mexerCorda = (i: number, semitons: number) => {
    const novo = [...cfg.strings]
    novo[i] += semitons
    set({ strings: novo })
    if (cfg.som) pluck(novo[i])
  }

  const passo = stringStep(inst)

  return (
    <div className="tela tela--rolagem">
      <Painel titulo="Instrumento">
        <Segmentado
          titulo="Preset"
          valor={cfg.presetId}
          opcoes={PRESETS.map((p) => ({ valor: p.id, rotulo: p.name.split(' (')[0], dica: p.name }))}
          onChange={(id) => set(aplicarPreset(id))}
        />

        <div className="campo">
          <span className="campo__titulo">Afinação</span>
          <ul className="afinacao">
            {cfg.strings.map((midi, i) => (
              <li key={i}>
                <button type="button" className="botao botao--fantasma" onClick={() => mexerCorda(i, -1)}>
                  −
                </button>
                <button type="button" className="afinacao__nota" onClick={() => cfg.som && pluck(midi)}>
                  <strong>{noteName(midi, { ...nameOpts, octave: true })}</strong>
                  <small>{cfg.strings.length - i}ª</small>
                </button>
                <button type="button" className="botao botao--fantasma" onClick={() => mexerCorda(i, 1)}>
                  +
                </button>
              </li>
            ))}
          </ul>
          <div className="botoes">
            <button
              type="button"
              className="botao"
              onClick={() => set({ strings: cfg.strings.map((m) => m - 12) })}
            >
              tudo uma oitava abaixo
            </button>
            <button
              type="button"
              className="botao"
              onClick={() => set({ strings: cfg.strings.map((m) => m + 12) })}
            >
              uma oitava acima
            </button>
            <button type="button" className="botao" onClick={() => set(aplicarPreset(cfg.presetId))}>
              voltar ao preset
            </button>
          </div>
          <p className="dica">
            {isRegular(inst)
              ? passo === 7
                ? 'Afinação regular em quintas — as formas valem em qualquer par de cordas.'
                : `Afinação regular, ${passo} semitons entre cordas.`
              : 'Afinação irregular: as formas mudam de um par de cordas para outro.'}
          </p>
          <button type="button" className="botao botao--principal" onClick={() => setConferindo(true)}>
            Conferir pelo ouvido
          </button>
        </div>

        <label className="campo">
          <span className="campo__titulo">Trastes: {cfg.frets}</span>
          <input
            type="range"
            min={12}
            max={27}
            value={cfg.frets}
            onChange={(e) => {
              const frets = Number(e.target.value)
              set({ frets, zone: { from: Math.min(cfg.zone.from, frets), to: Math.min(cfg.zone.to, frets) } })
            }}
          />
        </label>

        <label className="campo">
          <span className="campo__titulo">Marcadores de casa</span>
          <input
            type="text"
            className="entrada"
            defaultValue={cfg.markers.join(', ')}
            onBlur={(e) =>
              set({
                markers: e.target.value
                  .split(/[^0-9]+/)
                  .map(Number)
                  .filter((n) => Number.isFinite(n) && n > 0),
              })
            }
          />
          <small className="dica">Como no seu braço. Padrão de bandolim: 5, 7, 10, 12…</small>
        </label>
      </Painel>

      <Painel titulo="Como mostrar">
        <Segmentado
          titulo="Nome das notas"
          valor={cfg.lang}
          opcoes={[
            { valor: 'pt', rotulo: 'Dó Ré Mi' },
            { valor: 'en', rotulo: 'C D E' },
          ]}
          onChange={(lang) => set({ lang })}
        />
        <Segmentado
          titulo="Acidentes"
          valor={cfg.accidental}
          opcoes={[
            { valor: 'sharp', rotulo: 'sustenido ♯' },
            { valor: 'flat', rotulo: 'bemol ♭' },
          ]}
          onChange={(accidental) => set({ accidental })}
        />
        <Segmentado
          titulo="Orientação do braço"
          valor={cfg.orientation}
          opcoes={[
            { valor: 'auto', rotulo: 'automática' },
            { valor: 'vertical', rotulo: 'em pé' },
            { valor: 'horizontal', rotulo: 'deitado' },
          ]}
          onChange={(orientation) => set({ orientation })}
        />
        <Alternar
          titulo="Corda grave do lado de cá"
          dica="embaixo no braço deitado, à esquerda no braço em pé — como você vê o instrumento; desligue para espelhar"
          valor={cfg.lowFirst}
          onChange={(lowFirst) => set({ lowFirst })}
        />
        <Alternar titulo="Som" valor={cfg.som} onChange={(som) => set({ som })} />
        <Alternar
          titulo="Deixar as notas soando"
          dica="por padrão a nota nova abafa a anterior, como a mão faz no braço"
          valor={cfg.sustentar}
          onChange={(sustentar) => set({ sustentar })}
        />
      </Painel>

      <Painel>
        <button
          type="button"
          className="botao botao--perigo"
          onClick={() => {
            if (confirm('Voltar todos os ajustes ao padrão?')) reset()
          }}
        >
          Restaurar ajustes padrão
        </button>
        <p className="dica">O progresso do treino não é apagado por aqui — isso fica na aba Progresso.</p>
      </Painel>
    </div>
  )
}
