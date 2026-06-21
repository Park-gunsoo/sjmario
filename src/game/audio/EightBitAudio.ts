type MusicTheme = "surface" | "underground";

const AudioContextClass = window.AudioContext || window.webkitAudioContext;

const SOUND_PATH = `${import.meta.env.BASE_URL}assets/sound/`;

const SOUND_FILES = {
  surfaceMusic: "01. Ground Theme.mp3",
  undergroundMusic: "02. Underground Theme.mp3",
  gameOver: "Game Over.mp3",
  clear: "Clear.mp3",
  coin: "coin.wav",
  jump: "jump-super.wav",
  pipe: "pipe.wav",
  power: "mushroom_sound_effect.mp3"
} as const;

type SoundKey = keyof typeof SOUND_FILES;

const isPrivateNetworkHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();

  if (host.endsWith(".local")) {
    return true;
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return true;
  }

  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) {
    return true;
  }

  const private172Match = host.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!private172Match) {
    return false;
  }

  const secondOctet = Number(private172Match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
};

const shouldUseUploadedSounds = (): boolean =>
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  isPrivateNetworkHost(window.location.hostname) ||
  window.location.protocol === "file:";

export class EightBitAudio {
  private context?: AudioContext;
  private master?: GainNode;
  private musicTimer?: number;
  private step = 0;
  private theme: MusicTheme = "surface";
  private enabled = false;
  private muted = false;
  private assets = new Map<SoundKey, HTMLAudioElement>();
  private currentMusic?: HTMLAudioElement;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) {
      return;
    }

    this.muted = muted;

    if (this.muted) {
      this.stopMusic();
      return;
    }

    if (this.enabled) {
      this.startMusic(this.theme);
    }
  }

  async start(theme: MusicTheme): Promise<void> {
    if (shouldUseUploadedSounds()) {
      this.prepareAssets();
    }

    if (!AudioContextClass) {
      this.enabled = true;
      this.startMusic(theme);
      return;
    }

    if (!this.context) {
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = shouldUseUploadedSounds() ? 0.18 : 0.46;
      this.master.connect(this.context.destination);
    }

    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    this.enabled = true;
    this.startMusic(theme);
  }

  startMusic(theme: MusicTheme): void {
    this.theme = theme;
    this.stopMusic();
    this.step = 0;

    if (this.muted) {
      return;
    }

    const music = this.assets.get(theme === "surface" ? "surfaceMusic" : "undergroundMusic");
    if (music) {
      this.currentMusic = music;
      music.currentTime = 0;
      music.loop = true;
      music.volume = theme === "surface" ? 0.34 : 0.28;
      music.play().catch(() => this.scheduleMusic());
      return;
    }

    this.scheduleMusic();
  }

  stopMusic(): void {
    if (this.musicTimer !== undefined) {
      window.clearTimeout(this.musicTimer);
      this.musicTimer = undefined;
    }

    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
      this.currentMusic = undefined;
    }
  }

  playJump(): void {
    if (this.muted) {
      return;
    }

    if (this.playAsset("jump", 0.42)) {
      return;
    }

    this.playSweep(330, 620, 0.12, 0.2);
  }

  playCoin(): void {
    if (this.muted) {
      return;
    }

    if (this.playAsset("coin", 0.45)) {
      return;
    }

    this.playTone(880, 0.06, 0.22);
    window.setTimeout(() => this.playTone(1320, 0.08, 0.2), 55);
  }

  playPower(): void {
    if (this.muted) {
      return;
    }

    if (this.playAsset("power", 0.48)) {
      return;
    }

    [523, 659, 784, 1046].forEach((freq, index) => {
      window.setTimeout(() => this.playTone(freq, 0.09, 0.19), index * 70);
    });
  }

  playPipe(): void {
    if (this.muted) {
      return;
    }

    if (this.playAsset("pipe", 0.48)) {
      return;
    }

    this.playSweep(420, 110, 0.35, 0.22);
  }

  playHit(): void {
    if (this.muted) {
      return;
    }

    if (this.playAsset("gameOver", 0.34)) {
      return;
    }

    this.playSweep(180, 90, 0.16, 0.2);
  }

  playClear(): void {
    this.stopMusic();
    if (this.muted) {
      return;
    }

    if (this.playAsset("clear", 0.44)) {
      return;
    }

    [523, 659, 784, 1046, 1318].forEach((freq, index) => {
      window.setTimeout(() => this.playTone(freq, 0.16, 0.24), index * 130);
    });
  }

  private prepareAssets(): void {
    if (this.assets.size > 0) {
      return;
    }

    (Object.keys(SOUND_FILES) as SoundKey[]).forEach((key) => {
      const audio = new Audio(`${SOUND_PATH}${encodeURIComponent(SOUND_FILES[key])}`);
      audio.preload = "auto";
      this.assets.set(key, audio);
    });
  }

  private playAsset(key: SoundKey, volume: number): boolean {
    const source = this.assets.get(key);
    if (!source) {
      return false;
    }

    const sound = source.cloneNode(true) as HTMLAudioElement;
    sound.volume = volume;
    sound.play().catch(() => undefined);
    return true;
  }

  private scheduleMusic(): void {
    if (!this.enabled || !this.context) {
      return;
    }

    const surfaceNotes = [392, 494, 587, 659, 587, 494, 440, 523];
    const undergroundNotes = [196, 247, 294, 330, 294, 247, 220, 262];
    const notes = this.theme === "surface" ? surfaceNotes : undergroundNotes;
    const bass = this.theme === "surface" ? [98, 123, 147, 165] : [73, 87, 98, 110];
    const note = notes[this.step % notes.length];

    this.playTone(note, 0.13, 0.16);

    if (this.step % 2 === 0) {
      this.playTone(bass[Math.floor(this.step / 2) % bass.length], 0.16, 0.1);
    }

    this.step += 1;
    this.musicTimer = window.setTimeout(() => this.scheduleMusic(), this.theme === "surface" ? 215 : 260);
  }

  private playTone(frequency: number, duration: number, gainValue: number): void {
    if (!this.context || !this.master || this.context.state !== "running") {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  private playSweep(startFrequency: number, endFrequency: number, duration: number, gainValue: number): void {
    if (!this.context || !this.master || this.context.state !== "running") {
      return;
    }

    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
