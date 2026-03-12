// Survey of India official topographic legend symbols
export type TSym =
  | '^'  // Triangulated peak / trig point
  | 'M'  // Mountain / High ridge
  | 'H'  // Hillock / Isolated hill
  | '|'  // Cliff / Escarpment
  | 'O'  // Cave / Rock shelter
  | 'T'  // Dense forest / Jungle (closed canopy)
  | 't'  // Open forest / Scrub / Degraded
  | 'P'  // Plantation / Orchard / Garden
  | '.'  // Open ground / Waste land / Grassland
  | ','  // Agricultural / Cultivated field
  | '~'  // Perennial river / stream
  | '-'  // Seasonal nala / Kud
  | 'D'  // Dry sandy riverbed / Chaur
  | 'L'  // Lake / Reservoir / Jheel
  | 'S'  // Swamp / Marsh / Wetland
  | '#'  // Metalled road / National/State highway
  | '='  // Unmetalled road / Kutcha / Forest track
  | 'f'  // Footpath / Mule track
  | 'R'  // Railway line (Broad/Metre/Narrow gauge)
  | 'B'  // Village / Gaon / Hamlet
  | 'C'  // Town / Kasba / Urban area
  | 'W'  // Well / Talaab / Kund
  | 'G'  // Temple / Dargah / Religious site / Shrine
  | 'E'  // Electricity tower / Pylon / High-tension line
  | 'X'  // Last known position marker (game-only)

export interface Tile {
  x: number; y: number
  sym: TSym
  elev: number      // metres
  slope: number     // degrees
  moveCost: number  // 1=easy … 999=impassable
  walkable: boolean
  waterDist: number // tiles to nearest water
  roadDist: number  // tiles to nearest path/road
  label?: string    // town/village name
}

export interface GameMap {
  id: string
  width: number; height: number
  tiles: Tile[][]
  seed: number
}

export type SubjectType = 'adult_male'|'adult_female'|'child'|'elderly'|'fugitive'
export type Weather     = 'clear'|'overcast'|'drizzle'|'rain'|'fog'
export type CaseStatus  = 'open'|'submitted'|'solved'|'failed'

export interface Subject {
  name: string; age: number; type: SubjectType
  description: string
  lastSeenX: number; lastSeenY: number
  actualX: number; actualY: number   // hidden
  missingHours: number
  fitness: 'fit'|'average'|'poor'
}

export interface CaseFile {
  id: string           // "case1" … "case50"
  num: number
  title: string
  fir: string          // First Information Report
  subject: Subject
  weather: Weather
  reward: number       // INR
  status: CaseStatus
  pathStart?: [number,number]
  pathEnd?: [number,number]
  submittedAt?: string
  paid: boolean
}

export interface TermLine {
  id: number
  text: string
  cls: 'normal'|'error'|'success'|'dim'|'warn'|'bold'|'input'
}

export interface AppState {
  // filesystem sim
  cwd: string
  // terminal
  lines: TermLine[]
  history: string[]
  histIdx: number
  // cases
  cases: Record<string, CaseFile>
  maps: Record<string, GameMap>
  // map view
  mapOpen: boolean
  activeCaseId: string|null
  // path drawing
  pathStart: [number,number]|null
  pathEnd: [number,number]|null
  pathError: string|null
  MAX_PATH_TILES: number
  // view
  viewX: number; viewY: number; zoom: number
}
