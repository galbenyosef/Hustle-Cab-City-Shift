export class CabAudio {
  constructor() {
    this.enabled = false;this.context = null;this.preference = true;this.ambientTimer = 0;
    try { this.preference = localStorage.getItem('hustle-sound') !== 'off'; } catch {}
  }
  async enable() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();this.master.gain.value = .65;
      const compressor = this.context.createDynamicsCompressor();compressor.threshold.value = -16;
      this.master.connect(compressor);compressor.connect(this.context.destination);
      this.engine = this.context.createOscillator();this.engine.type = 'sawtooth';
      this.filter = this.context.createBiquadFilter();this.filter.type = 'lowpass';this.filter.frequency.value = 180;
      this.engineGain = this.context.createGain();this.engineGain.gain.value = .14;
      this.engineLow = this.context.createOscillator();this.engineLow.type = 'triangle';
      this.engineLow.connect(this.filter);this.engineLow.start();
      this.engine.connect(this.filter);this.filter.connect(this.engineGain);this.engineGain.connect(this.master);this.engine.start();
      const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
      const noise = this.context.createBufferSource();noise.buffer = buffer;noise.loop = true;
      const noiseFilter = this.context.createBiquadFilter();noiseFilter.type = 'lowpass';noiseFilter.frequency.value = 500;
      this.roadGain = this.context.createGain();this.roadGain.gain.value = .005;
      noise.connect(noiseFilter);noiseFilter.connect(this.roadGain);this.roadGain.connect(this.master);noise.start();
    }
    await this.context.resume();this.enabled = this.context.state === 'running';this.preference = true;
    try { localStorage.setItem('hustle-sound', 'on'); } catch {}
    return this.enabled;
  }
  disable() {
    this.enabled = false;this.preference = false;if (this.context) this.context.suspend();
    try { localStorage.setItem('hustle-sound', 'off'); } catch {}
  }
  update(speed, accelerating, rain, paused, delta = 0, nearbyTraffic = 0) {
    if (!this.context || !this.enabled) return;
    const now = this.context.currentTime;
    const revs = 48 + Math.abs(speed) * 4.5 - Math.min(4, Math.floor(Math.abs(speed) / 7)) * 21 + (accelerating ? 17 : 0);
    this.master.gain.setTargetAtTime(paused ? 0 : .65, now, .12);
    this.engine.frequency.setTargetAtTime(revs, now, .14);this.engineLow.frequency.setTargetAtTime(revs * .5, now, .14);
    this.filter.frequency.setTargetAtTime(240 + Math.abs(speed) * 19 + (accelerating ? 160 : 0), now, .15);
    this.engineGain.gain.setTargetAtTime(.12 + (accelerating ? .065 : 0), now, .12);
    this.roadGain.gain.setTargetAtTime(.018 + Math.abs(speed) * .004 + nearbyTraffic * .002 + (rain ? .09 : 0), now, .3);
    if (paused) return;
    this.ambientTimer -= delta;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 6 + Math.random() * 8;
      if (nearbyTraffic > 1 && Math.random() > .45) this.horn(.025);
      else if (!rain) {this.tone(1900, .12, .018);this.tone(2450, .14, .013, 'sine', .16);this.tone(2100, .11, .012, 'sine', .32);}
    }
  }
  tone(frequency, duration, volume = .2, type = 'sine', delay = 0) {
    if (!this.context || !this.enabled) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();const gain = this.context.createGain();
    oscillator.type = type;oscillator.frequency.value = frequency;gain.gain.setValueAtTime(0, start);gain.gain.linearRampToValueAtTime(volume, start + .02);gain.gain.exponentialRampToValueAtTime(.001, start + duration);
    oscillator.connect(gain);gain.connect(this.master);oscillator.onended = () => {oscillator.disconnect();gain.disconnect();};oscillator.start(start);oscillator.stop(start + duration + .02);
  }
  horn(volume = .2) { this.tone(349, .45, volume, 'sawtooth');this.tone(440, .45, volume * .65, 'sawtooth'); }
  dispatch() { this.tone(660, .15, .16);this.tone(880, .3, .12, 'sine', .16); }
  payment() { this.tone(523, .25);this.tone(659, .3, .15, 'sine', .1);this.tone(784, .5, .12, 'sine', .2); }
}
