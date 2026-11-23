// All sound is synthesised with WebAudio: short oscillator/noise blips for shots,
// crashes, pickups and sirens. No audio files, nothing loaded. Every call is guarded
// so a browser that refuses an AudioContext (autoplay rules, headless shots) stays silent.

export function createAudio() {
  let ctx = null;
  let sirenOsc = null;
  let sirenGain = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function blip(freq, seconds, type = 'square', volume = 0.12, slideTo = null) {
    const ac = ensure();
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ac.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ac.currentTime + seconds);
      gain.gain.setValueAtTime(volume, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + seconds);
      osc.connect(gain).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + seconds);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(seconds, volume = 0.2) {
    const ac = ensure();
    if (!ac) return;
    try {
      const buffer = ac.createBuffer(1, Math.max(1, (ac.sampleRate * seconds) | 0), ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const source = ac.createBufferSource();
      source.buffer = buffer;
      const gain = ac.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(ac.destination);
      source.start();
    } catch {
      // As above.
    }
  }

  return {
    unlock() {
      ensure();
    },
    shot() {
      noise(0.12, 0.25);
      blip(160, 0.1, 'sawtooth', 0.15, 40);
    },
    dryFire() {
      blip(900, 0.05, 'square', 0.06);
    },
    reload() {
      blip(500, 0.07, 'square', 0.08);
      setTimeout(() => blip(700, 0.07, 'square', 0.08), 120);
    },
    crash(strength = 1) {
      noise(0.25, Math.min(0.4, 0.12 + strength * 0.1));
      blip(90, 0.2, 'triangle', 0.2, 45);
    },
    pickup() {
      blip(660, 0.09, 'sine', 0.14);
      setTimeout(() => blip(990, 0.12, 'sine', 0.14), 80);
    },
    cash() {
      blip(880, 0.08, 'square', 0.1);
      setTimeout(() => blip(1320, 0.14, 'square', 0.1), 70);
    },
    door() {
      blip(240, 0.08, 'square', 0.1, 180);
    },
    busted() {
      blip(392, 0.25, 'sawtooth', 0.14);
      setTimeout(() => blip(311, 0.25, 'sawtooth', 0.14), 220);
      setTimeout(() => blip(233, 0.5, 'sawtooth', 0.14), 440);
    },
    missionDone() {
      blip(523, 0.12, 'sine', 0.14);
      setTimeout(() => blip(659, 0.12, 'sine', 0.14), 110);
      setTimeout(() => blip(784, 0.22, 'sine', 0.14), 220);
    },
    /** A minimal running engine: one filtered sawtooth whose pitch and level
     * follow the driven car's speed. Calling it with `on` false stops it. */
    setEngine(on, speedRatio = 0) {
      const ac = ensure();
      if (!ac) return;
      const ratio = Math.max(0, Math.min(1, Math.abs(speedRatio) || 0));
      try {
        if (on && !engineOsc) {
          engineOsc = ac.createOscillator();
          engineGain = ac.createGain();
          engineFilter = ac.createBiquadFilter();
          engineOsc.type = 'sawtooth';
          engineFilter.type = 'lowpass';
          engineFilter.Q.value = 2;
          engineGain.gain.value = 0;
          engineOsc.connect(engineFilter).connect(engineGain).connect(ac.destination);
          engineOsc.start();
        }
        if (on && engineOsc) {
          const now = ac.currentTime;
          const frequency = 42 + ratio * 105 + ratio * ratio * 35;
          engineOsc.frequency.setTargetAtTime(frequency, now, 0.06);
          engineFilter.frequency.setTargetAtTime(240 + ratio * 720, now, 0.08);
          engineGain.gain.setTargetAtTime(0.018 + ratio * 0.04, now, 0.08);
        } else if (!on && engineOsc) {
          engineOsc.stop();
          engineOsc.disconnect();
          engineFilter.disconnect();
          engineGain.disconnect();
          engineOsc = null;
          engineFilter = null;
          engineGain = null;
        }
      } catch {
        engineOsc = null;
        engineFilter = null;
        engineGain = null;
      }
    },
    /** A two-tone siren that loops while the player is wanted; level 0 stops it. */
    setSiren(on) {
      const ac = ensure();
      if (!ac) return;
      try {
        if (on && !sirenOsc) {
          sirenOsc = ac.createOscillator();
          sirenGain = ac.createGain();
          sirenOsc.type = 'triangle';
          sirenGain.gain.value = 0.035;
          const lfo = ac.createOscillator();
          const lfoGain = ac.createGain();
          lfo.frequency.value = 0.7;
          lfoGain.gain.value = 140;
          lfo.connect(lfoGain).connect(sirenOsc.frequency);
          sirenOsc.frequency.value = 720;
          sirenOsc.connect(sirenGain).connect(ac.destination);
          sirenOsc.start();
          lfo.start();
          sirenOsc.__lfo = lfo;
        } else if (!on && sirenOsc) {
          sirenOsc.stop();
          if (sirenOsc.__lfo) sirenOsc.__lfo.stop();
          sirenOsc = null;
          sirenGain = null;
        }
      } catch {
        sirenOsc = null;
      }
    },
  };
}
