import type { Tile, GameMap, TSym } from '../types'

// ─── PRNG (seeded, deterministic) ─────────────────────────────────────────────
function mkRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return (): number => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

// ─── Seeded Perlin noise (2D) ─────────────────────────────────────────────────
function buildPermutation(seed: number): Uint8Array {
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  const rng = mkRng(seed + 77777)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]]
  }
  return p
}

function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10) }
function lerp(a: number, b: number, t: number) { return a + t * (b - a) }
function grad2(h: number, x: number, y: number): number {
  switch (h & 3) {
    case 0: return  x + y
    case 1: return -x + y
    case 2: return  x - y
    default: return -x - y
  }
}

class Noise2D {
  private pp: Uint8Array
  constructor(seed: number) {
    const p = buildPermutation(seed)
    this.pp = new Uint8Array(512)
    for (let i = 0; i < 512; i++) this.pp[i] = p[i & 255]
  }
  sample(x: number, y: number): number {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255
    const xf = x - Math.floor(x), yf = y - Math.floor(y)
    const u = fade(xf), v = fade(yf)
    const a = this.pp[X] + Y, b = this.pp[X + 1] + Y
    return lerp(
      lerp(grad2(this.pp[a],     xf,     yf),     grad2(this.pp[b],     xf - 1, yf),     u),
      lerp(grad2(this.pp[a + 1], xf,     yf - 1), grad2(this.pp[b + 1], xf - 1, yf - 1), u),
      v
    )
  }
  fbm(x: number, y: number, oct: number, lac = 2.05, gain = 0.5): number {
    let v = 0, a = 0.5, f = 1, mx = 0
    for (let i = 0; i < oct; i++) {
      v += this.sample(x * f, y * f) * a
      mx += a; a *= gain; f *= lac
    }
    return v / mx
  }
  warp(x: number, y: number, oct: number, strength = 1.8): number {
    const qx = this.fbm(x, y, oct)
    const qy = this.fbm(x + 5.2, y + 1.3, oct)
    return this.fbm(x + strength * qx, y + strength * qy, oct)
  }
}

// ─── BFS distance field ───────────────────────────────────────────────────────
function bfs(mask: boolean[], w: number, h: number): Uint16Array {
  const d = new Uint16Array(w * h).fill(9999)
  const q: number[] = []
  for (let i = 0; i < w * h; i++) if (mask[i]) { d[i] = 0; q.push(i) }
  let head = 0
  while (head < q.length) {
    const i = q[head++], cx = i % w, cy = i / w | 0
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const ni = ny * w + nx
      if (d[ni] === 9999) { d[ni] = d[i] + 1; q.push(ni) }
    }
  }
  return d
}

// ─── Hydraulic erosion (lightweight) ─────────────────────────────────────────
function erode(e: Float32Array, w: number, h: number, iters: number, rng: () => number): void {
  for (let it = 0; it < iters; it++) {
    let cx = Math.floor(rng() * w), cy = Math.floor(rng() * h), sed = 0
    for (let s = 0; s < 80; s++) {
      let bx = cx, by = cy, be = e[cy * w + cx]
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
        if (e[ny * w + nx] < be) { be = e[ny * w + nx]; bx = nx; by = ny }
      }
      if (bx === cx && by === cy) { e[cy * w + cx] += sed * 0.4; break }
      const drop = Math.min(e[cy * w + cx] - be, 0.015)
      e[cy * w + cx] -= drop; sed += drop
      cx = bx; cy = by
    }
  }
}

// ─── River carving ────────────────────────────────────────────────────────────
function carveRiver(e: Float32Array, w: number, h: number, rng: () => number, widen: boolean): boolean[] {
  const m = new Array(w * h).fill(false)
  let bx = 0, by = 0, be = 0
  for (let t = 0; t < 80; t++) {
    const x = 3 + (rng() * (w - 6) | 0), y = 3 + (rng() * (h - 6) | 0)
    if (e[y * w + x] > be) { be = e[y * w + x]; bx = x; by = y }
  }
  let cx = bx, cy = by
  const visited = new Set<number>()
  for (let step = 0; step < w * h * 0.6; step++) {
    const k = cy * w + cx
    if (visited.has(k)) break
    visited.add(k); m[k] = true
    if (widen && e[k] < 0.38) {
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
        const nx = cx + dx, ny = cy + dy
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) m[ny * w + nx] = true
      }
    }
    let lx = cx, ly = cy, le = e[k] + 999
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]] as [number,number][]) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const ne = e[ny * w + nx] + (rng() - 0.5) * 0.008
      if (ne < le) { le = ne; lx = nx; ly = ny }
    }
    if (lx === cx && ly === cy) break
    cx = lx; cy = ly
  }
  return m
}

// ─── Greedy path (road/footpath) ──────────────────────────────────────────────
function greedyPath(
  sx: number, sy: number, ex: number, ey: number,
  e: Float32Array, w: number, h: number, rng: () => number,
  elevWeight = 5
): boolean[] {
  const m = new Array(w * h).fill(false)
  let cx = sx, cy = sy
  for (let s = 0; s < (w + h) * 3; s++) {
    m[cy * w + cx] = true
    if (Math.abs(cx - ex) < 2 && Math.abs(cy - ey) < 2) break
    let bx = cx, by = cy, bs = Infinity
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue
      const sc = Math.hypot(nx - ex, ny - ey) + e[ny * w + nx] * elevWeight + rng() * 0.6
      if (sc < bs) { bs = sc; bx = nx; by = ny }
    }
    cx = bx; cy = by
  }
  return m
}

// ─── Movement cost & walkability ──────────────────────────────────────────────
const MOVE_COST: Record<TSym, number> = {
  'C':1,'#':1.2,'R':1.4,'B':1.5,'=':1.8,'f':2.2,',':2.5,'.':3,'W':3,'G':3,'P':3,
  'E':3.5,'t':4,'H':4,'T':5,'D':4.5,'O':3.5,'S':7,'M':8,'^':10,'-':5,
  '~':15,'L':999,'|':999,'X':2
}
const WALKABLE: Record<TSym, boolean> = {
  'C':true,'#':true,'R':true,'B':true,'=':true,'f':true,',':true,'.':true,
  'W':true,'G':true,'P':true,'E':true,'t':true,'H':true,'T':true,'D':true,
  'O':true,'S':true,'M':true,'^':true,'-':true,'~':false,'L':false,'|':false,'X':true
}

// ─── Indian place names ───────────────────────────────────────────────────────
const TOWNS = [
  'Rampur','Berinag','Munsiari','Kausani','Bageshwar','Kapkot','Gangolihat','Baijnath',
  'Mukteshwar','Binsar','Champawat','Pithoragarh','Devghat','Katarmal','Tharali','Ghat',
  'Karnaprayag','Nandprayag','Gopeshwar','Someshwar','Nauti','Agastyamuni','Okimath',
  'Ukhimath','Urgam','Mandal','Narayanpur','Barkot','Bhatwari','Harsil','Dharali',
  'Jhala','Sukhi','Sangla','Chitkul','Kalpa','Urni','Reckong','Naugaon','Uttarkashi',
]

// ─── MAIN GENERATOR ───────────────────────────────────────────────────────────
// complexity 0-1 controls terrain ruggedness, feature density, river count
export function generateMap(seed: number, complexity = 0.5, W = 140, H = 96): GameMap {
  const rng = mkRng(seed)
  const N = W * H

  // Scale parameters by complexity
  const octaves = 5 + Math.floor(complexity * 5)          // 5-10
  const erosionIters = Math.floor(500 + complexity * 2000) // 500-2500
  const numRivers = 3 + Math.floor(complexity * 7)         // 3-10
  const numNalas = 3 + Math.floor(complexity * 8)          // 3-11
  const numCities = 2 + Math.floor(complexity * 2)         // 2-4
  const numTowns = 5 + Math.floor(complexity * 12)         // 5-17
  const warpStr = 0.8 + complexity * 2.2                   // 0.8-3.0 (more warped = more chaotic ridges)

  // Multi-layer noise with unique seeds per layer
  const elevNoise = new Noise2D(seed)
  const moistNoise = new Noise2D(seed + 113)
  const ridgeNoise = new Noise2D(seed + 227)
  const detailNoise = new Noise2D(seed + 341)

  const sc = 0.018 + complexity * 0.008 // scale: more complex = slightly more zoomed

  const elev = new Float32Array(N)
  const moist = new Float32Array(N)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const nx = x * sc, ny = y * sc

      // Main terrain: domain-warped FBM
      const base = elevNoise.warp(nx, ny, octaves, warpStr)
      // Ridge: abs gives sharp ridge lines
      const ridge = 1 - Math.abs(ridgeNoise.fbm(nx * 0.7, ny * 0.7, Math.min(octaves, 7)))
      // Detail bumps
      const detail = detailNoise.fbm(nx * 2, ny * 2, 3) * 0.12

      elev[i] = (base * 0.62 + ridge * 0.28 + detail + 1) * 0.48
      moist[i] = (moistNoise.fbm(nx + 40, ny + 30, Math.min(octaves, 6)) + 1) * 0.5
    }
  }

  // Hydraulic erosion
  erode(elev, W, H, erosionIters, rng)

  // Slope
  const slope = new Float32Array(N)
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      const dx = (elev[i + 1] - elev[i - 1]) * 0.5
      const dy = (elev[(y + 1) * W + x] - elev[(y - 1) * W + x]) * 0.5
      slope[i] = Math.sqrt(dx * dx + dy * dy) * 140
    }
  }

  // Rivers
  const riverM = new Array(N).fill(false)
  for (let r = 0; r < numRivers; r++) {
    const rv = carveRiver(elev, W, H, rng, true)
    for (let i = 0; i < N; i++) if (rv[i]) riverM[i] = true
  }

  // Nalas (thinner, no widening)
  const nalaM = new Array(N).fill(false)
  for (let r = 0; r < numNalas; r++) {
    const rv = carveRiver(elev, W, H, rng, false)
    for (let i = 0; i < N; i++) if (rv[i] && !riverM[i]) nalaM[i] = true
  }

  // Dry beds in low-moisture flat areas
  const dryM = new Array(N).fill(false)
  for (let i = 0; i < N; i++) {
    if (!riverM[i] && !nalaM[i] && moist[i] < 0.26 && elev[i] < 0.32 && slope[i] < 7)
      if (rng() < 0.05) dryM[i] = true
  }

  // Lakes: very low basins
  const lakeM = new Array(N).fill(false)
  for (let i = 0; i < N; i++) if (elev[i] < 0.05 && !riverM[i]) lakeM[i] = true

  // Swamp: low flat wet zones
  const swampM = new Array(N).fill(false)
  for (let i = 0; i < N; i++) {
    if (!riverM[i] && !lakeM[i] && moist[i] > 0.72 && elev[i] < 0.20 && slope[i] < 5) swampM[i] = true
  }

  // Cities (flat, low elevation, not on water)
  const cities: [number, number][] = []
  for (let a = 0; a < numCities * 80 && cities.length < numCities; a++) {
    const x = 8 + (rng() * (W - 16) | 0), y = 8 + (rng() * (H - 16) | 0)
    const i = y * W + x
    if (elev[i] > 0.10 && elev[i] < 0.48 && slope[i] < 10 && !riverM[i] && !lakeM[i])
      cities.push([x, y])
  }

  // Towns
  const towns: [number, number][] = []
  for (let a = 0; a < numTowns * 80 && towns.length < numTowns; a++) {
    const x = 4 + (rng() * (W - 8) | 0), y = 4 + (rng() * (H - 8) | 0)
    const i = y * W + x
    if (elev[i] > 0.08 && elev[i] < 0.62 && slope[i] < 22 && !riverM[i] && !lakeM[i])
      towns.push([x, y])
  }

  // Roads between cities
  const roadM = new Array(N).fill(false)
  for (let i = 0; i < cities.length - 1; i++) {
    const p = greedyPath(cities[i][0], cities[i][1], cities[i + 1][0], cities[i + 1][1], elev, W, H, rng, 6)
    for (let j = 0; j < N; j++) if (p[j]) roadM[j] = true
  }

  // Unmetalled roads between towns
  const unmetM = new Array(N).fill(false)
  for (let i = 0; i < towns.length - 1; i++) {
    const p = greedyPath(towns[i][0], towns[i][1], towns[i + 1][0], towns[i + 1][1], elev, W, H, rng, 3)
    for (let j = 0; j < N; j++) if (p[j] && !roadM[j]) unmetM[j] = true
  }

  // Footpaths from villages to roads/rivers
  const footM = new Array(N).fill(false)
  const footCandidates = towns.filter(() => rng() < 0.65)
  for (const [tx, ty] of footCandidates) {
    const destX = 5 + (rng() * (W - 10) | 0), destY = 5 + (rng() * (H - 10) | 0)
    const p = greedyPath(tx, ty, destX, destY, elev, W, H, rng, 1.5)
    for (let j = 0; j < N; j++) if (p[j] && !roadM[j] && !unmetM[j]) footM[j] = true
  }

  // Railway (only higher complexity)
  const railM = new Array(N).fill(false)
  if (complexity > 0.4 && cities.length >= 2) {
    const p = greedyPath(cities[0][0], cities[0][1], cities[cities.length - 1][0], cities[cities.length - 1][1], elev, W, H, rng, 4)
    for (let j = 0; j < N; j++) if (p[j]) railM[j] = true
  }

  // Wells (near towns)
  const wellM = new Array(N).fill(false)
  for (const [tx, ty] of [...cities, ...towns]) {
    const wx = tx + (rng() * 6 - 3 | 0), wy = ty + (rng() * 6 - 3 | 0)
    if (wx >= 0 && wx < W && wy >= 0 && wy < H) wellM[wy * W + wx] = true
  }

  // Temples on high ground
  const templeCount = 6 + Math.floor(complexity * 14)
  const templeM = new Array(N).fill(false)
  for (let t = 0; t < templeCount * 30 && Object.values(templeM).filter(Boolean).length < templeCount; t++) {
    const x = 3 + (rng() * (W - 6) | 0), y = 3 + (rng() * (H - 6) | 0)
    if (elev[y * W + x] > 0.52 && slope[y * W + x] < 28) templeM[y * W + x] = true
  }

  // Electric pylons along major roads
  const elecM = new Array(N).fill(false)
  for (let i = 0; i < N; i++) if (roadM[i] && i % 14 === 0) elecM[i] = true

  // Plantations (clusters at mid elevations)
  const plantM = new Array(N).fill(false)
  const plantCount = 8 + Math.floor(complexity * 12)
  for (let p = 0; p < plantCount; p++) {
    const cx = 5 + (rng() * (W - 10) | 0), cy = 5 + (rng() * (H - 10) | 0)
    const r = 2 + (rng() * 5 | 0)
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = cx + dx, ny = cy + dy
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
      if (Math.hypot(dx, dy) <= r && elev[ny * W + nx] < 0.55 && slope[ny * W + nx] < 20) plantM[ny * W + nx] = true
    }
  }

  // Caves at cliff faces
  const caveM = new Array(N).fill(false)
  for (let i = 0; i < N; i++) if (slope[i] > 44 && elev[i] > 0.46 && rng() < 0.008) caveM[i] = true

  // Distance fields
  const waterB = riverM.map((v, i) => v || nalaM[i] || lakeM[i] || swampM[i])
  const pathB = roadM.map((v, i) => v || unmetM[i] || footM[i] || railM[i])
  const waterDist = bfs(waterB, W, H)
  const roadDist = bfs(pathB, W, H)

  // Town labels
  const labelMap = new Map<number, string>()
  const usedNames = new Set<string>()
  for (const [x, y] of [...cities, ...towns]) {
    let name = TOWNS[rng() * TOWNS.length | 0]
    let tries = 0
    while (usedNames.has(name) && tries++ < 40) name = TOWNS[rng() * TOWNS.length | 0]
    usedNames.add(name); labelMap.set(y * W + x, name)
  }

  // ─── Assemble tiles ───────────────────────────────────────────────────────
  const tiles: Tile[][] = []
  for (let y = 0; y < H; y++) {
    const row: Tile[] = []
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const e = elev[i], s = slope[i], m = moist[i]
      let sym: TSym

      // Priority: built > hydro > terrain
      if      (cities.some(([cx, cy]) => cx === x && cy === y)) sym = 'C'
      else if (towns.some(([tx, ty]) => tx === x && ty === y))  sym = 'B'
      else if (railM[i])                                         sym = 'R'
      else if (roadM[i])                                         sym = '#'
      else if (elecM[i])                                         sym = 'E'
      else if (unmetM[i])                                        sym = '='
      else if (footM[i])                                         sym = 'f'
      else if (wellM[i])                                         sym = 'W'
      else if (templeM[i])                                       sym = 'G'
      else if (caveM[i])                                         sym = 'O'
      else if (lakeM[i])                                         sym = 'L'
      else if (swampM[i])                                        sym = 'S'
      else if (riverM[i])                                        sym = '~'
      else if (nalaM[i])                                         sym = '-'
      else if (dryM[i])                                          sym = 'D'
      else if (s > 54 && e > 0.40)                              sym = '|'
      else if (e > 0.87)                                         sym = '^'
      else if (e > 0.72 && s > 16)                              sym = 'M'
      else if (e > 0.58 || (e > 0.44 && s > 26))               sym = 'H'
      else if (plantM[i] && e < 0.55)                           sym = 'P'
      else if (m > 0.60 && s < 30)                              sym = 'T'
      else if (m > 0.40 && s < 40)                              sym = 't'
      else if (e < 0.40 && s < 10 && m > 0.30)                 sym = ','
      else                                                        sym = '.'

      row.push({
        x, y, sym,
        elev: Math.round(e * 4000),
        slope: Math.round(Math.min(90, s)),
        moveCost: MOVE_COST[sym] ?? 3,
        walkable: WALKABLE[sym] ?? true,
        waterDist: waterDist[i],
        roadDist: roadDist[i],
        label: labelMap.get(i),
      })
    }
    tiles.push(row)
  }

  return { id: `map_${seed}`, width: W, height: H, tiles, seed }
}
