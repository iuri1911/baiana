// Conferencia de oitava, na primeira abertura.
//
// A afinacao em quintas do instrumento e certa; a oitava e que depende do seu.
// Em vez de adivinhar, o app toca as cinco cordas soltas e voce diz se bate.

import { pluck, pluckSequence, unlockAudio } from '../audio/engine'
import { noteName } from '../core/music'
import { useSettings } from '../store/settings'

export function Calibration({ onPronto }: { onPronto: () => void }) {
  const { cfg, set, inst, nameOpts } = useSettings()

  const mover = (semitons: number) => set({ strings: cfg.strings.map((m) => m + semitons) })

  return (
    <div className="tela tela--rolagem calibra">
      <h1 className="calibra__titulo">Vamos conferir a oitava</h1>
      <p className="calibra__texto">
        Toque as cordas soltas do seu instrumento junto com o app. As notas estão certas — Dó, Sol, Ré, Lá, Mi — o que
        pode estar fora é a altura.
      </p>

      <div className="cordas">
        {inst.strings.map((midi, i) => (
          <button
            key={i}
            type="button"
            className="corda-botao"
            onClick={() => {
              unlockAudio()
              pluck(midi)
            }}
          >
            <strong>{noteName(midi, { ...nameOpts, octave: true })}</strong>
            <small>{inst.strings.length - i}ª corda</small>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="botao botao--principal"
        onClick={() => {
          unlockAudio()
          pluckSequence([...inst.strings], 130)
        }}
      >
        ▶ tocar as cinco
      </button>

      <p className="dica">
        Sem som? Toque a tela uma vez antes (o navegador só libera áudio depois de um toque) e confira o botão de
        silêncio do celular — no iPhone ele corta o som do navegador.
      </p>

      <div className="calibra__acoes">
        <button type="button" className="botao" onClick={() => mover(-12)}>
          uma oitava abaixo
        </button>
        <button type="button" className="botao" onClick={() => mover(12)}>
          uma oitava acima
        </button>
      </div>

      <button
        type="button"
        className="botao botao--principal"
        onClick={() => {
          set({ calibrado: true })
          onPronto()
        }}
      >
        É isso, pode seguir
      </button>
      <p className="dica">Dá para mudar depois em Ajustes, corda por corda se precisar.</p>
    </div>
  )
}
