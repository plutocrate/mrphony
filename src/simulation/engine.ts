import type { GameMap, Subject, SubjectType, Weather } from '../types'

// ─── Deterministic seeded PRNG ────────────────────────────────────────────────
function mkRng(seed: number) {
  let s = (seed ^ 0xdeadbeef) >>> 0
  return () => { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (s >>> 0) / 4294967296 }
}

// ─── Behaviour profiles — every weight is deterministic per subject type ─────
// These encode actual SAR (Search And Rescue) field research statistics:
// - P(stay on trail): hiker=90%, child=20%, elderly=95%, fugitive=5%
// - Attraction to water: children strongly attracted, elderly moderate
// - Downhill tendency: all lost subjects tend downhill due to gravity/gravity of habitation
// - Cover seeking: fugitives actively hide in dense vegetation
interface Profile {
  trailBias:    number  // 0-1 weight toward roads/paths
  downBias:     number  // 0-1 weight toward lower elevation
  waterBias:    number  // 0-1 attraction to water sources
  coverBias:    number  // 0-1 preference for forest/vegetation
  roadFlee:     number  // 0-1 flee from roads (fugitive only)
  panic:        number  // 0-1 chaotic random movement component
  kmph:         number  // base travel speed km/h
  cliffRisk:    number  // prob of attempting cliff/impassable tile
  nightPenalty: number  // extra disorientation after dark (>5h missing)
  fatigue:      number  // speed multiplier reduction per hour
}

const PROFILES: Record<SubjectType, Profile> = {
  adult_male:   { trailBias:.68, downBias:.52, waterBias:.30, coverBias:.15, roadFlee:.00, panic:.12, kmph:3.8, cliffRisk:.08, nightPenalty:.25, fatigue:.04 },
  adult_female: { trailBias:.74, downBias:.57, waterBias:.38, coverBias:.18, roadFlee:.00, panic:.14, kmph:3.2, cliffRisk:.04, nightPenalty:.28, fatigue:.05 },
  child:        { trailBias:.15, downBias:.10, waterBias:.75, coverBias:.55, roadFlee:.00, panic:.72, kmph:1.6, cliffRisk:.25, nightPenalty:.55, fatigue:.08 },
  elderly:      { trailBias:.92, downBias:.70, waterBias:.25, coverBias:.08, roadFlee:.00, panic:.06, kmph:1.2, cliffRisk:.01, nightPenalty:.40, fatigue:.10 },
  fugitive:     { trailBias:.00, downBias:.35, waterBias:.20, coverBias:.95, roadFlee:.95, panic:.30, kmph:5.5, cliffRisk:.30, nightPenalty:.10, fatigue:.02 },
}

const WEATHER_SPEED: Record<Weather, number> = {
  clear:1.0, overcast:.85, drizzle:.65, rain:.48, fog:.38
}

const DIRS8: [number,number][] = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]

export function findActualLocation(map: GameMap, sub: Subject, wx: Weather): { x:number; y:number } {
  const p = PROFILES[sub.type]
  const rng = mkRng(sub.lastSeenX * 7919 + sub.lastSeenY * 6271 + sub.missingHours * 1031)
  const speedMod = WEATHER_SPEED[wx] * (sub.fitness === 'fit' ? 1.15 : sub.fitness === 'poor' ? 0.55 : 1.0)
  const { width:W, height:H, tiles } = map

  let cx = sub.lastSeenX, cy = sub.lastSeenY

  // simulate hour by hour — deterministic
  for (let hour = 0; hour < sub.missingHours; hour++) {
    // fatigue accumulates
    const fatigueMod = Math.max(0.3, 1 - p.fatigue * hour)
    // night disorientation
    const nightMod = hour > 5 ? (1 - p.nightPenalty) : 1.0
    const effectiveKmph = p.kmph * speedMod * fatigueMod * nightMod
    // steps per hour (each step ~50m)
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

        let w = 1 / (t.moveCost + 0.1)

        // elevation: downhill preference
        const de = ct.elev - t.elev
        if (de > 0) w *= 1 + p.downBias * Math.min(1, de / 200)
        else w *= Math.max(0.05, 1 - p.downBias * Math.min(1, -de / 300))

        // trail / road
        if (t.sym === '#' || t.sym === '=' || t.sym === 'f' || t.sym === 'R') {
          if (p.roadFlee > 0.5) {
            w *= (1 - p.roadFlee) * 0.03
          } else {
            w *= 1 + p.trailBias * 4
          }
        }

        // water attraction (within 8 tiles)
        if (t.waterDist < 8) w *= 1 + p.waterBias * (1 - t.waterDist / 8)

        // village / town — all non-fugitives attracted
        if ((t.sym === 'B' || t.sym === 'C') && p.roadFlee < 0.5) w *= 1 + 0.8

        // cover (forest, plantation)
        if (t.sym === 'T' || t.sym === 't' || t.sym === 'P') w *= 1 + p.coverBias * 2.5

        // panic component — random zigzag
        const panicLevel = Math.min(0.9, p.panic + hour * 0.015)
        w *= (1 - panicLevel) + rng() * panicLevel * 2.5

        // night: strong pull to paths, avoid steep
        if (hour > 5) {
          if (t.sym === '=' || t.sym === '#' || t.sym === 'f') w *= 1.6
          if (t.slope > 30) w *= 0.5
        }

        // slope penalty — all people slow on steep terrain
        w *= Math.max(0.05, 1 - t.slope / 100)

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

// ─── Generate a deterministic "likely zone" radius for HUD display ────────────
export function getPredictedZone(sub: Subject, wx: Weather): { radius:number; description:string } {
  const p = PROFILES[sub.type]
  const speed = WEATHER_SPEED[wx] * p.kmph
  const maxDist = Math.round(speed * sub.missingHours * 0.6)
  const desc = sub.type === 'child'
    ? `Child: likely near water/shelter within ${maxDist} tiles. High randomness.`
    : sub.type === 'elderly'
    ? `Elderly: very likely on trails, downhill within ${maxDist} tiles.`
    : sub.type === 'fugitive'
    ? `Fugitive: deep cover, avoiding roads, within ${maxDist} tiles.`
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
