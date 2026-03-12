import { create } from 'zustand'
import type { AppState, TermLine, CaseFile, GameMap } from '../types'
import { generateAllCases } from '../cases/generator'

let lineId = 0
function ln(text: string, cls: TermLine['cls'] = 'normal'): TermLine {
  return { id: lineId++, text, cls }
}

function trailLength(waypoints: [number, number][]): number {
  let len = 0
  for (let i = 0; i < waypoints.length - 1; i++)
    len += Math.hypot(waypoints[i+1][0]-waypoints[i][0], waypoints[i+1][1]-waypoints[i][1])
  return len
}

function checkTrailCorridor(
  actual: { x: number; y: number },
  waypoints: [number, number][],
  half: number
): boolean {
  if (waypoints.length === 0) return false
  if (waypoints.length === 1)
    return Math.hypot(actual.x - waypoints[0][0], actual.y - waypoints[0][1]) <= half
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [ax, ay] = waypoints[i], [bx, by] = waypoints[i+1]
    const dx = bx-ax, dy = by-ay, lsq = dx*dx+dy*dy
    let dist: number
    if (lsq === 0) { dist = Math.hypot(actual.x-ax, actual.y-ay) }
    else {
      const t = Math.max(0, Math.min(1, ((actual.x-ax)*dx+(actual.y-ay)*dy)/lsq))
      dist = Math.hypot(actual.x-(ax+t*dx), actual.y-(ay+t*dy))
    }
    if (dist <= half) return true
  }
  return false
}

function generateFeedback(hit: boolean, actual: { x: number; y: number }, waypoints: [number, number][], c: CaseFile): TermLine[] {
  const lines: TermLine[] = [ln('')]
  if (hit) {
    lines.push(ln('██ VERIFIED — SUBJECT LOCATED IN SEARCH CORRIDOR ██', 'success'))
    lines.push(ln(''))
    const p = c.subject.type
    const reason =
      p === 'child'    ? 'Children seek water and cover — corridor captured water-adjacent terrain.' :
      p === 'elderly'  ? 'Elderly stay near roads/trails, avoiding steep slopes — corridor matched trail network.' :
      p === 'fugitive' ? 'Fugitives flee into dense cover away from roads — corridor targeted forest correctly.' :
                         'Adult subjects follow least resistance downhill toward habitation — good placement.'
    lines.push(ln(`ANALYSIS: ${reason}`, 'success'))
    lines.push(ln(`Subject ${c.subject.name} confirmed at grid (${actual.x}, ${actual.y}).`, 'success'))
    if (c.weather === 'fog')  lines.push(ln('Fog kept subject near last known position — close-range corridor was key.', 'dim'))
    if (c.weather === 'rain') lines.push(ln('Rain drove subject toward shelter. Forest edge and rock overhangs become attractors.', 'dim'))
    lines.push(ln(`Reward Rs.${c.reward}/- PAID.`, 'success'))
  } else {
    lines.push(ln('██ FAILED — SUBJECT NOT IN SEARCH CORRIDOR ██', 'error'))
    lines.push(ln(''))
    const cx = waypoints.reduce((a,w) => a+w[0], 0) / waypoints.length
    const cy = waypoints.reduce((a,w) => a+w[1], 0) / waypoints.length
    const dx = actual.x-cx, dy = actual.y-cy
    const dist = Math.hypot(dx, dy)
    const dir = Math.abs(dx)>Math.abs(dy) ? (dx>0?'east':'west') : (dy>0?'south':'north')
    const range = dist<8 ? 'very close to your trail' : dist<18 ? 'a moderate distance away' : 'quite far from your trail'
    lines.push(ln(`HINT: Subject was ${range} — look further ${dir}.`, 'warn'))
    const p = c.subject.type
    if (p === 'child')        lines.push(ln('HINT: Children follow water sources downstream or hide in dense scrub.', 'warn'))
    else if (p === 'elderly') lines.push(ln('HINT: Elderly rarely stray far from tracks. Check road/path corridors.', 'warn'))
    else if (p === 'fugitive') lines.push(ln('HINT: Fugitives avoid roads entirely. Deep forest and rocky terrain.', 'warn'))
    else lines.push(ln('HINT: Lost adults move downhill toward valleys and villages.', 'warn'))
    if (c.weather === 'fog')  lines.push(ln('HINT: Fog means subject stayed close to last known position.', 'warn'))
    if (c.weather === 'rain') lines.push(ln('HINT: Rain drives subjects to seek shelter under canopy or rock.', 'warn'))
    if (c.subject.fitness === 'poor') lines.push(ln('HINT: Poor fitness — subject unlikely to have traveled more than a few km.', 'warn'))
    if (c.subject.fitness === 'fit')  lines.push(ln('HINT: Subject was fit — could have covered significant ground.', 'warn'))
    lines.push(ln('Trail reset — reopen map to try again: case --open ~/cases/' + c.id + '/case.map', 'dim'))
    lines.push(ln('No reward issued.', 'error'))
  }
  lines.push(ln(''))
  return lines
}

export const TRAIL_BUFFER = 4
export const MAX_TRAIL_TILES = 25

const { cases: caseList, maps } = generateAllCases()
const casesMap: Record<string, CaseFile> = {}
caseList.forEach(c => { casesMap[c.id] = c })

interface TutorialState {
  tutorialOpen: boolean
  tutorialStep: number
  tutorialWaypoints: [number, number][]
  openTutorial: () => void
  closeTutorial: () => void
  tutorialNext: () => void
}

interface Actions {
  addLine: (text: string, cls?: TermLine['cls']) => void
  addLines: (lines: TermLine[]) => void
  clearLines: () => void
  setCwd: (cwd: string) => void
  pushHistory: (cmd: string) => void
  setHistIdx: (i: number) => void
  openMap: (caseId: string) => void
  closeMap: () => void
  addWaypoint: (pt: [number, number]) => void
  undoWaypoint: () => void
  clearTrail: () => void
  setPathError: (e: string | null) => void
  setView: (x: number, y: number, z?: number) => void
  submitCase: (caseId: string) => void
  updateCase: (caseId: string, upd: Partial<CaseFile>) => void
  setPathStart: (pt: [number, number] | null) => void
  setPathEnd:   (pt: [number, number] | null) => void
}

export const useStore = create<AppState & Actions & TutorialState & { waypoints: [number, number][] }>((set, get) => ({
  cwd: '/home/mrphony',
  lines: [],
  history: [],
  histIdx: -1,
  cases: casesMap,
  maps,
  mapOpen: false,
  activeCaseId: null,
  pathStart: null,
  pathEnd: null,
  pathError: null,
  MAX_PATH_TILES: MAX_TRAIL_TILES,
  waypoints: [],
  viewX: 0, viewY: 0, zoom: 1,

  // Tutorial
  tutorialOpen: false,
  tutorialStep: 0,
  tutorialWaypoints: [],

  addLine: (text, cls = 'normal') =>
    set(s => ({ lines: [...s.lines.slice(-400), ln(text, cls)] })),
  addLines: (lines) =>
    set(s => ({ lines: [...s.lines.slice(-400), ...lines] })),
  clearLines: () => set({ lines: [] }),
  setCwd: (cwd) => set({ cwd }),
  pushHistory: (cmd) => set(s => ({ history: [cmd, ...s.history.slice(0, 99)], histIdx: -1 })),
  setHistIdx: (i) => set({ histIdx: i }),

  openMap: (caseId) => {
    const allCases = get().cases
    let c = allCases[caseId]
    if (!c) return
    const map = get().maps[`map_${caseId}`]
    if (!map) return
    // Always allow reopening — reset to open if previously failed/solved
    // (so player can retry)
    if (c.status === 'failed') {
      set(s => ({
        cases: { ...s.cases, [caseId]: { ...c!, status: 'open', paid: false, pathStart: undefined, pathEnd: undefined, submittedAt: undefined } }
      }))
      c = { ...c, status: 'open' }
    }
    set({
      mapOpen: true, activeCaseId: caseId,
      pathStart: null, pathEnd: null, pathError: null,
      waypoints: [],
      viewX: Math.max(0, c.subject.lastSeenX - 20),
      viewY: Math.max(0, c.subject.lastSeenY - 15),
      zoom: 1
    })
  },
  closeMap: () => set({ mapOpen: false }),

  openTutorial: () => {
    const c = get().cases['case0']
    if (!c) return
    set({
      tutorialOpen: true,
      tutorialStep: 0,
      tutorialWaypoints: [],
      mapOpen: true,
      activeCaseId: 'case0',
      pathStart: null, pathEnd: null, pathError: null,
      waypoints: [],
      viewX: Math.max(0, c.subject.lastSeenX - 20),
      viewY: Math.max(0, c.subject.lastSeenY - 15),
      zoom: 1,
    })
  },
  closeTutorial: () => set({ tutorialOpen: false, mapOpen: false, activeCaseId: null }),

  tutorialNext: () => {
    const { tutorialStep } = get()
    const TOTAL_STEPS = 8
    if (tutorialStep >= TOTAL_STEPS - 1) {
      // Final step — submit tutorial case
      const c = get().cases['case0']
      if (c) {
        const wp = get().tutorialWaypoints
        get().addLines([
          ln(''),
          ln('TUTORIAL COMPLETE — CASE0 SOLVED', 'success'),
          ln('You have learned to use the terrain analysis system.', 'dim'),
          ln("Now try: case --new  to receive your first real assignment.", 'bold'),
          ln(''),
        ])
      }
      set({ tutorialOpen: false, mapOpen: false, activeCaseId: null, tutorialStep: 0 })
      return
    }
    // Steps 5-7: progressively reveal waypoints
    const WAYPOINT_REVEAL_START = 4
    const c = get().cases['case0']
    if (c && tutorialStep >= WAYPOINT_REVEAL_START) {
      const sub = c.subject
      const map = get().maps['map_case0']
      if (map) {
        const fullPath = getTutorialPath(sub.lastSeenX, sub.lastSeenY, sub.actualX, sub.actualY)
        const wpIdx = tutorialStep - WAYPOINT_REVEAL_START
        const wp = fullPath[Math.min(wpIdx, fullPath.length - 1)]
        if (wp) {
          const newWps = get().tutorialWaypoints.length === 0 ? [wp] : [...get().tutorialWaypoints, wp]
          set({ tutorialWaypoints: newWps, waypoints: newWps })
          // Center view on latest waypoint
          set(s => ({
            viewX: Math.max(0, wp[0] - 20),
            viewY: Math.max(0, wp[1] - 15),
          }))
        }
      }
    }
    set(s => ({ tutorialStep: s.tutorialStep + 1 }))
  },

  addWaypoint: (pt) => {
    // Block manual waypoints during tutorial
    if (get().tutorialOpen) return
    const { waypoints } = get()
    const next: [number, number][] = [...waypoints, pt]
    const len = trailLength(next)
    if (len > MAX_TRAIL_TILES) {
      set({ pathError: `TRAIL TOO LONG: ${len.toFixed(1)} tiles — MAX ${MAX_TRAIL_TILES}` })
      return
    }
    set({ waypoints: next, pathError: null })
  },

  undoWaypoint: () => {
    if (get().tutorialOpen) return
    const { waypoints } = get()
    if (waypoints.length === 0) return
    set({ waypoints: waypoints.slice(0, -1), pathError: null })
  },

  clearTrail: () => { if (!get().tutorialOpen) set({ waypoints: [], pathError: null }) },

  setPathError: (e) => set({ pathError: e }),
  setView: (x, y, z) => set(s => ({ viewX: x, viewY: y, zoom: z ?? s.zoom })),
  setPathStart: (pt) => set({ pathStart: pt }),
  setPathEnd:   (pt) => set({ pathEnd: pt }),

  submitCase: (caseId) => {
    const { waypoints, cases } = get()
    if (waypoints.length < 2) {
      get().addLine('No trail set. Click on the map to draw a search trail (min 2 points), then type wq.', 'error')
      return
    }
    const c = cases[caseId]
    if (!c) { get().addLine(`case ${caseId}: not found`, 'error'); return }
    // Always allow submission regardless of prior status
    const actual = { x: c.subject.actualX, y: c.subject.actualY }
    const hit = checkTrailCorridor(actual, waypoints, TRAIL_BUFFER)
    const now = new Date().toISOString()
    const ps = waypoints[0], pe = waypoints[waypoints.length - 1]
    set(s => ({
      cases: {
        ...s.cases,
        [caseId]: { ...c, status: hit ? 'solved' : 'failed', pathStart: ps, pathEnd: pe, submittedAt: now, paid: hit || (s.cases[caseId]?.paid ?? false) }
      },
      waypoints: [], pathStart: null, pathEnd: null, mapOpen: false
    }))
    get().addLines(generateFeedback(hit, actual, waypoints, c))
  },

  updateCase: (caseId, upd) =>
    set(s => ({ cases: { ...s.cases, [caseId]: { ...s.cases[caseId], ...upd } } })),
}))

// Build a simple waypoint path for the tutorial (lerp with kinks)
export function getTutorialPath(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const pts: [number, number][] = []
  const steps = 4
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = Math.round(x0 + (x1 - x0) * t)
    const y = Math.round(y0 + (y1 - y0) * t)
    pts.push([x, y])
  }
  return pts
}
