// Conferencia do microfone, antes do primeiro treino por audio.
//
// Mesma ideia da conferencia de oitava: em vez de adivinhar, mostra ao vivo o
// que o app esta ouvindo e deixa voce comparar com o que esta tocando. Se a nota
// na tela nao bate com a corda que voce tocou, nada adiante disso vai funcionar,
// e e melhor descobrir aqui do que no meio de um exercicio reprovando sozinho.

import { useEffect, useRef, useState } from 'react'
import { Painel } from '../../components/ui'
import { noteName } from '../../core/music'
import { useSettings } from '../../store/settings'
import { Mic, type MicFrame } from '../../shred/pitch/mic'

const PARADO: MicFrame = { midi: null, cents: 0, clarity: 0, rms: 0 }

export function MicCheck({
  noiseFloor,
  onNoiseFloor,
  onPronto,
}: {
  noiseFloor: number
  onNoiseFloor: (v: number) => void
  onPronto: () => void
}) {
  const { inst, nameOpts } = useSettings()
  const [erro, setErro] = useState<string | null>(null)
  const [ligado, setLigado] = useState(false)
  const [quadro, setQuadro] = useState<MicFrame>(PARADO)
  const [medindo, setMedindo] = useState(false)
  const micRef = useRef<Mic | null>(null)
  const picoRef = useRef(0)

  useEffect(() => {
    return () => micRef.current?.stop()
  }, [])

  const ligar = async () => {
    setErro(null)
    const mic = (micRef.current ??= new Mic({
      onFrame: (f) => {
        setQuadro(f)
        if (picoRef.current >= 0) picoRef.current = Math.max(picoRef.current, f.rms)
      },
    }))
    try {
      await mic.start()
      setLigado(true)
    } catch (e) {
      setErro(
        (e as Error).name === 'NotAllowedError'
          ? 'Permissão de microfone negada. Libere nas configurações do navegador e tente de novo.'
          : `Não consegui abrir o microfone: ${(e as Error).message}`,
      )
    }
  }

  /** Mede o silêncio da sala por 2 s e põe o piso um pouco acima do que ouviu. */
  const medirRuido = () => {
    picoRef.current = 0
    setMedindo(true)
    window.setTimeout(() => {
      // Folga de 60%: o piso tem que ficar acima do ruído de fundo, senão o ar
      // condicionado vira ataque. Mínimo para microfone bom não zerar.
      onNoiseFloor(Math.max(0.004, picoRef.current * 1.6))
      picoRef.current = -1
      setMedindo(false)
    }, 2000)
  }

  const afinado = quadro.midi !== null && Math.abs(quadro.cents) < 15
  const barra = Math.min(100, Math.round((quadro.rms / Math.max(noiseFloor * 6, 0.02)) * 100))

  return (
    <div className="tela tela--rolagem">
      <Painel titulo="Conferir o microfone">
        <p className="dica">
          O treino por áudio escuta a guitarra pelo microfone. Antes de começar, confira se ele
          ouve o que você toca — e prefira <strong>fone de ouvido</strong>, para o metrônomo não
          entrar junto na captação.
        </p>

        {!ligado ? (
          <>
            <button type="button" className="botao botao--principal" onClick={ligar}>
              Ligar o microfone
            </button>
            {erro && <p className="erro">{erro}</p>}
          </>
        ) : (
          <>
            <div className={`mic-leitura ${afinado ? 'is-afinado' : ''}`}>
              <strong className="mic-leitura__nota">
                {quadro.midi === null
                  ? '—'
                  : noteName(quadro.midi, { ...nameOpts, octave: true })}
              </strong>
              <span className="mic-leitura__cents">
                {quadro.midi === null
                  ? 'toque uma corda'
                  : `${quadro.cents > 0 ? '+' : ''}${quadro.cents.toFixed(0)} cents`}
              </span>
            </div>

            <div className="mic-nivel" aria-label="nível de entrada">
              <div className="mic-nivel__barra" style={{ width: `${barra}%` }} />
            </div>

            <h3 className="sub">Cordas soltas</h3>
            <p className="dica">
              Toque uma de cada vez e veja se o nome bate. Se aparecer uma oitava errada, ajuste a
              afinação em Ajustes.
            </p>
            <ul className="lista">
              {inst.strings.map((midi, i) => (
                <li key={i}>
                  <strong>{noteName(midi, { ...nameOpts, octave: true })}</strong> —{' '}
                  {inst.strings.length - i}ª corda
                  {quadro.midi === midi && <span className="pastilha"> ouvindo agora</span>}
                </li>
              ))}
            </ul>

            <h3 className="sub">Ruído da sala</h3>
            <p className="dica">
              Fique em silêncio e meça: o que estiver abaixo desse piso não conta como nota.
              Está em <strong>{noiseFloor.toFixed(3)}</strong>.
            </p>
            <button type="button" className="botao" onClick={medirRuido} disabled={medindo}>
              {medindo ? 'medindo, não toque nada…' : 'Medir o silêncio (2 s)'}
            </button>

            <button type="button" className="botao botao--principal" onClick={onPronto}>
              Está ouvindo certo, pode seguir
            </button>
          </>
        )}
      </Painel>
    </div>
  )
}
