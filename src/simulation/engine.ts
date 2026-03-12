import type { GameMap, Subject, SubjectType, Weather } from '../types'

function mkRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
}

interface Profile {
  trailBias:    number  // 0-1 weight toward roads/paths
  downBias:     number  // 0-1 weight toward lower elevation
  waterBias:    number  // 0-1 attraction to water sources
  coverBias:    number  // 0-1 preference for forest (positive = attracted, negative = repelled)
  forestPenalty:number  // multiplier applied to dense forest tiles (< 1 = avoid)
  roadFlee:     number  // 0-1 flee from roads (fugitive only)
  panic:        number  // 0-1 chaotic random movement component
  kmph:         number  // base travel speed km/h
  cliffRisk:    number  // prob of attempting cliff/impassable tile
  nightPenalty: number  // extra disorientation after dark (>5h missing)
  fatigue:      number  // speed multiplier reduction per hour
}

// SAR research-backed profiles:
// Elderly: 92% stay on trails, almost never enter dense forest voluntarily,
//          strong downhill bias, low panic, very low speed
// Child:   attracted to water, will enter any terrain, high panic/randomness
// Fugitive: actively seeks dense cover, flees all roads
const PROFILES: Record<SubjectType, Profile> = {
  adult_male:   { trailBias:.68, downBias:.52, waterBias:.30, coverBias:.00, forestPenalty:.30, roadFlee:.00, panic:.12, kmph:3.8, cliffRisk:.08, nightPenalty:.25, fatigue:.04 },
  adult_female: { trailBias:.74, downBias:.57, waterBias:.38, coverBias:.00, forestPenalty:.25, roadFlee:.00, panic:.10, kmph:3.2, cliffRisk:.04, nightPenalty:.28, fatigue:.05 },
  child:        { trailBias:.15, downBias:.10, waterBias:.75, coverBias:.60, forestPenalty:.90, roadFlee:.00, panic:.65, kmph:1.6, cliffRisk:.25, nightPenalty:.55, fatigue:.08 },
  elderly:      { trailBias:.95, downBias:.72, waterBias:.20, coverBias:.00, forestPenalty:.05, roadFlee:.00, panic:.04, kmph:1.2, cliffRisk:.01, nightPenalty:.45, fatigue:.12 },
  fugitive:     { trailBias:.00, downBias:.35, waterBias:.20, coverBias:.95, forestPenalty:.00, roadFlee:.95, panic:.25, kmph:5.5, cliffRisk:.30, nightPenalty:.10, fatigue:.02 },
}

const WEATHER_SPEED: Record<Weather, number> = {
  clear:1.0, overcast:.85, drizzle:.65, rain:.48, fog:.38
}

const DIRS8: [number,number][] = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]

// Symbols considered "trail/road"
const TRAIL_SYMS = new Set(['#', '=', 'f', 'R'])
// Symbols considered dense cover (forest, plantation)
const DENSE_COVER_SYMS = new Set(['T', 't', 'P'])
// Completely impassable or very hard
const HARD_SYMS = new Set(['|', '^', 'M'])

export function findActualLocation(map: GameMap, sub: Subject, wx: Weather): { x:number; y:number } {
  const p = PROFILES[sub.type]
  const rng = mkRng(sub.lastSeenX * 7919 + sub.lastSeenY * 6271 + sub.missingHours * 1031)
  const speedMod = WEATHER_SPEED[wx] * (sub.fitness === 'fit' ? 1.15 : sub.fitness === 'poor' ? 0.55 : 1.0)
  const { width:W, height:H, tiles } = map

  let cx = sub.lastSeenX, cy = sub.lastSeenY

  for (let hour = 0; hour < sub.missingHours; hour++) {
    const fatigueMod = Math.max(0.3, 1 - p.fatigue * hour)
    const nightMod = hour > 5 ? (1 - p.nightPenalty) : 1.0
    const effectiveKmph = p.kmph * speedMod * fatigueMod * nightMod
    const steps = Math.max(1, Math.round(effectiveKmph * 1000 / 50))

    for (let step = 0; step < steps; step++) {
      const ct = tiles[cy]?.[cx]
      if (!ct) break

      const candidates: { nx:number; ny:number; w:number }[] = []

      for (const [dx, dy] of DIRS8) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue
        const t = tiles[ny][nx]
        if (!t.walkable && rng() > p.cliffRisk) continue

        // Base weight from movement cost
        let w = 1 / (t.moveCost + 0.1)

        // ── Elevation: downhill preference ───────────────────────────────
        const de = ct.elev - t.elev
        if (de > 0) w *= 1 + p.downBias * Math.min(1, de / 200)
        else        w *= Math.max(0.05, 1 - p.downBias * Math.min(1, -de / 300))

        // ── Trail / road attraction ──────────────────────────────────────
        if (TRAIL_SYMS.has(t.sym)) {
          if (p.roadFlee > 0.5) {
            // Fugitive: strongly avoid roads
            w *= 0.02
          } else {
            // Everyone else: attracted to trails, elderly extremely so
            w *= 1 + p.trailBias * 8
          }
        }

        // ── Dense forest / cover ─────────────────────────────────────────
        if (DENSE_COVER_SYMS.has(t.sym)) {
          if (p.coverBias > 0.5) {
            // Fugitive / child: attracted to cover
            w *= 1 + p.coverBias * 3
          } else {
            // Elderly / adults: hard penalty — they avoid thick forest
            w *= p.forestPenalty
          }
        }

        // ── Hard terrain: cliffs, peaks ──────────────────────────────────
        if (HARD_SYMS.has(t.sym)) {
          w *= p.cliffRisk * 0.1
        }

        // ── Water attraction ─────────────────────────────────────────────
        if (t.waterDist < 8) w *= 1 + p.waterBias * (1 - t.waterDist / 8)

        // ── Village / town: all non-fugitives attracted ──────────────────
        if ((t.sym === 'B' || t.sym === 'C') && p.roadFlee < 0.5) w *= 2.5

        // ── Road flee for fugitive ───────────────────────────────────────
        if (p.roadFlee > 0.5 && (t.sym === 'B' || t.sym === 'C')) w *= 0.01

        // ── Panic component — small random noise, capped ─────────────────
        // Panic is now a small noise term, NOT able to dominate trail weights
        const panicLevel = Math.min(0.5, p.panic + hour * 0.01)
        const noise = 1 + (rng() - 0.5) * panicLevel
        w *= Math.max(0.5, noise)

        // ── Night: stronger pull to any path, penalise slope ─────────────
        if (hour > 5) {
          if (TRAIL_SYMS.has(t.sym)) w *= 2.0
          if (t.slope > 25) w *= 0.4
          // Dense forest at night is very bad for elderly/adults
          if (DENSE_COVER_SYMS.has(t.sym) && p.forestPenalty < 0.5) w *= 0.3
        }

        // ── Slope penalty ────────────────────────────────────────────────
        w *= Math.max(0.05, 1 - t.slope / 90)

        candidates.push({ nx, ny, w: Math.max(0.0001, w) })
      }

      if (!candidates.length) break
      const total = candidates.reduce((s, c) => s + c.w, 0)
      let r = rng() * total
      let chosen = candidates[candidates.length - 1]
      for (const c of candidates) { r -= c.w; if (r <= 0) { chosen = c; break } }
      cx = chosen.nx; cy = chosen.ny
    }
  }

  return { x: cx, y: cy }
}

export function getPredictedZone(sub: Subject, wx: Weather): { radius:number; description:string } {
  const p = PROFILES[sub.type]
  const speed = WEATHER_SPEED[wx] * p.kmph
  const maxDist = Math.round(speed * sub.missingHours * 0.6)
  const desc = sub.type === 'child'
    ? `Child: likely near water/shelter within ${maxDist} tiles. High randomness.`
    : sub.type === 'elderly'
    ? `Elderly: very likely on trails/roads, downhill within ${maxDist} tiles. Avoids forest.`
    : sub.type === 'fugitive'
    ? `Fugitive: deep forest/cover, avoiding all roads, within ${maxDist} tiles.`
    : sub.type === 'adult_female'
    ? `Adult female: trail-following, downhill tendency, ${maxDist} tiles.`
    : `Adult male: moderate trail use, downhill, ${maxDist} tiles.`
  return { radius: maxDist, description: desc }
}

export function checkCorridor(
  actual: {x:number;y:number},
  start: [number,number], end: [number,number],
  halfWidthTiles: number
): boolean {
  const [ax,ay]=start,[bx,by]=end,dx=bx-ax,dy=by-ay,lsq=dx*dx+dy*dy
  if(lsq===0) return Math.hypot(actual.x-ax,actual.y-ay)<=halfWidthTiles
  const t=Math.max(0,Math.min(1,((actual.x-ax)*dx+(actual.y-ay)*dy)/lsq))
  return Math.hypot(actual.x-(ax+t*dx),actual.y-(ay+t*dy))<=halfWidthTiles
}
