import { useState } from 'preact/hooks';
import { initialVolume, type AudioEngine, type AudioSettings, type OutputMode } from '../../../io/audio';

export function AudioStep(props: { audio: AudioEngine; initial: AudioSettings; onNext(a: AudioSettings): void }) {
  const [mode, setMode] = useState<OutputMode>(props.initial.outputMode);
  const [volume, setVolume] = useState(initialVolume(props.initial.volume));
  const [balance, setBalance] = useState(props.initial.balance);
  const settings: AudioSettings = { outputMode: mode, volume, balance };

  const test = async (side: 'L' | 'R') => {
    await props.audio.ensureRunning();
    props.audio.apply(settings);
    props.audio.testSide(side);
  };

  return (
    <section class="card">
      <h1>Ton</h1>
      <p class="hint">iPad-Lautstärke etwa auf die Hälfte stellen. Die App begrenzt ihre Lautstärke zusätzlich.</p>
      <label class="choice">
        <input type="radio" name="mode" checked={mode === 'headphones'} onChange={() => setMode('headphones')} /> Kopfhörer
        (empfohlen, Richtung auch oben/unten)
      </label>
      <label class="choice">
        <input type="radio" name="mode" checked={mode === 'speakers'} onChange={() => setMode('speakers')} /> iPad-Lautsprecher
        (nur links/rechts)
      </label>
      <div class="actions">
        <button onClick={() => void test('L')}>Links testen</button>
        <button onClick={() => void test('R')}>Rechts testen</button>
      </div>
      <label>
        Lautstärke: {Math.round(volume * 100)} %
        <br />
        <input type="range" min={0} max={1} step={0.05} value={volume} onInput={(e) => setVolume(Number(e.currentTarget.value))} />
      </label>
      <label>
        Balance: {balance === 0 ? 'Mitte' : balance < 0 ? `links ${Math.round(-balance * 100)} %` : `rechts ${Math.round(balance * 100)} %`}
        <br />
        <input type="range" min={-1} max={1} step={0.1} value={balance} onInput={(e) => setBalance(Number(e.currentTarget.value))} />
      </label>
      <p class="hint">Beide Seiten sollen für ihn gleich laut klingen. Sonst die Balance verschieben und erneut testen.</p>
      <div class="actions">
        <button class="primary" onClick={() => props.onNext(settings)}>
          Weiter
        </button>
      </div>
    </section>
  );
}
