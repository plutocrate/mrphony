// ─── Music singleton ──────────────────────────────────────────────────────────
// Browsers block autoplay until a user gesture occurs.
// We start the music on the first keydown or click, then it loops forever.

let audio: HTMLAudioElement | null = null
let started = false
let paused = false

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio('/mrphony/theme.mp3')
    audio.loop = true
    audio.volume = 0.35
  }
  return audio
}

function tryStart() {
  if (started) return
  started = true
  paused = false
  getAudio().play().catch(() => {
    // autoplay blocked — will retry on next gesture
    started = false
  })
}

export function initMusic() {
  const handler = () => {
    tryStart()
    // once started, remove listeners
    if (started) {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('mousedown', handler)
    }
  }
  window.addEventListener('keydown', handler)
  window.addEventListener('mousedown', handler)
}

export function pauseMusic(): string {
  const a = getAudio()
  if (a.paused) return 'Music is already paused.'
  a.pause()
  paused = true
  return 'Music paused.'
}

export function resumeMusic(): string {
  const a = getAudio()
  if (!a.paused) return 'Music is already playing.'
  paused = false
  a.play().catch(() => {})
  return 'Music resumed.'
}

export function getMusicStatus(): 'playing' | 'paused' | 'stopped' {
  if (!audio) return 'stopped'
  if (audio.paused) return 'paused'
  return 'playing'
}
