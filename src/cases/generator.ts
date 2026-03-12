import type { CaseFile, Subject, SubjectType, Weather, GameMap } from '../types'
import { generateMap } from '../map/generator'
import { findActualLocation } from '../simulation/engine'

function mkRng(s:number){let a=(s^0xdeadbeef)>>>0;return()=>{a^=a<<13;a^=a>>17;a^=a<<5;return(a>>>0)/4294967296}}

const WEATHERS:Weather[]=['clear','overcast','drizzle','rain','fog']
const TYPES:SubjectType[]=['adult_male','adult_female','child','elderly','fugitive']

const MALE=['Ramesh Kumar','Dinesh Rawat','Suresh Bisht','Mohan Negi','Harish Joshi',
  'Deepak Rana','Vijay Singh','Anil Bora','Santosh Pant','Rajendra Mehta',
  'Prakash Tiwari','Govind Das','Naresh Dobhal','Lalit Arya','Bhupendra Singh']
const FEMALE=['Sunita Devi','Kamla Rawat','Meena Bisht','Pushpa Negi','Savitri Joshi',
  'Geeta Rana','Anita Singh','Rekha Bora','Kavita Pant','Nirmala Mehta',
  'Laxmi Tiwari','Durga Devi','Parvati Joshi','Shanta Rawat','Uma Bisht']
const CHILD=['Raju','Sonu','Pintu','Ravi','Amit','Priya','Rani','Gita','Neha','Tara']
const ELDERLY=['Bhagwati Devi','Shivram Pant','Ramdass Ji','Chandramani','Sumitra Devi',
  'Bhabani Rawat','Trilok Nath','Hira Devi','Dhani Ram']
const FUGITIVE=['Kalua alias Ramswaroop','Unknown male','Ramkishore Yadav','Pappu Giri',
  'Devendra Singh alias Deva','Unknown suspect','Harnam Lal','Brijesh Tiwari']

const DISTRICTS=['Pithoragarh','Bageshwar','Chamoli','Rudraprayag','Tehri','Uttarkashi','Almora','Nainital']
const STATIONS=['Berinag','Bageshwar','Kapkot','Gopeshwar','Chamoli','Rudraprayag','Agastyamuni','Munsiari']
const OFFICERS=['Sub-Inspector Tarun Bisht','Inspector Deepak Negi','SI Harish Rawat',
  'Inspector Mohan Joshi','Sub-Inspector Kamlesh Singh','Inspector Vipin Arya']

// Scan tiles around last-seen position and return dominant features
function scanTerrain(map: GameMap, x: number, y: number, radius = 6): {
  nearWater: boolean, nearRiver: boolean, nearLake: boolean, nearNala: boolean,
  nearForest: boolean, nearRoad: boolean, nearCliff: boolean, nearVillage: boolean,
  nearCultivated: boolean, nearTemple: boolean, nearOpen: boolean,
  waterBodyDesc: string, dominantTerrain: string,
} {
  const W = map.width, H = map.height
  const counts: Record<string, number> = {}
  let nearWater=false, nearRiver=false, nearLake=false, nearNala=false
  let nearForest=false, nearRoad=false
  let nearCliff=false, nearVillage=false, nearCultivated=false, nearTemple=false, nearOpen=false

  for (let dy=-radius; dy<=radius; dy++) {
    for (let dx=-radius; dx<=radius; dx++) {
      if (Math.hypot(dx,dy) > radius) continue
      const nx=x+dx, ny=y+dy
      if (nx<0||nx>=W||ny<0||ny>=H) continue
      const sym = map.tiles[ny][nx].sym
      counts[sym] = (counts[sym]||0) + 1
      if (sym==='~') { nearWater=true; nearRiver=true }
      if (sym==='L') { nearWater=true; nearLake=true }
      if (sym==='-') { nearWater=true; nearNala=true }
      if (sym==='D'||sym==='S') nearWater=true
      if (sym==='T'||sym==='t'||sym==='P') nearForest=true
      if (sym==='#'||sym==='='||sym==='f'||sym==='R') nearRoad=true
      if (sym==='|'||sym==='^'||sym==='M') nearCliff=true
      if (sym==='B'||sym==='C') nearVillage=true
      if (sym===',') nearCultivated=true
      if (sym==='G') nearTemple=true
      if (sym==='.') nearOpen=true
    }
  }

  const riverTiles = counts['~'] || 0
  const lakeTiles  = counts['L'] || 0
  const nalaTiles  = counts['-'] || 0
  const waterBodyDesc =
    lakeTiles > 12  ? 'large lake / reservoir' :
    lakeTiles > 3   ? 'small pond or tank' :
    riverTiles > 8  ? 'wide perennial river' :
    riverTiles > 2  ? 'perennial stream' :
    nalaTiles > 4   ? 'seasonal nala' :
    nearWater       ? 'water source' : 'none'

  // Find most common terrain type
  const terrainOrder = ['T','t','P',',','.','H','M','^','~','-','D','L','S']
  let dominant = '.'
  let maxCount = 0
  for (const sym of terrainOrder) {
    if ((counts[sym]||0) > maxCount) { maxCount = counts[sym]||0; dominant = sym }
  }
  const dominantNames: Record<string,string> = {
    'T':'dense jungle','t':'open scrub forest','P':'plantation area',
    ',':'cultivated terraces','.':'open wasteland','H':'hillock terrain',
    'M':'mountain ridgeline','^':'high peak area','~':'river valley',
    '-':'seasonal nala area','D':'dry riverbed','L':'lake shore','S':'marshy wetland'
  }

  return { nearWater, nearRiver, nearLake, nearNala, nearForest, nearRoad, nearCliff,
           nearVillage, nearCultivated, nearTemple, nearOpen, waterBodyDesc,
           dominantTerrain: dominantNames[dominant] || 'mixed terrain' }
}

function fir(s:Subject, w:Weather, n:number, rng:()=>number, map: GameMap):string {
  const hr=8+Math.floor(rng()*10), mn=String(Math.floor(rng()*60)).padStart(2,'0')
  const dist=DISTRICTS[n%DISTRICTS.length], sta=STATIONS[n%STATIONS.length]
  const ofcr=OFFICERS[n%OFFICERS.length]
  const firNo=`${200+n}/SHO/${new Date().getFullYear()}`

  // Scan actual terrain around last-seen position
  const terrain = scanTerrain(map, s.lastSeenX, s.lastSeenY)

  if(s.type==='fugitive') {
    // Fugitive escape route based on actual terrain
    const escapeThrough = terrain.nearForest ? 'dense forest cover'
      : terrain.nearCliff ? 'a rocky escarpment'
      : terrain.nearWater ? 'the river crossing'
      : terrain.nearRoad ? 'a kutcha road section'
      : 'open wasteland'
    return [
      `FIR No. ${firNo}`,`Police Station: ${sta}`,`District: ${dist}, Uttarakhand`,``,
      `BOLO — BE ON LOOKOUT`,`━━━━━━━━━━━━━━━━━━━━━━━━━━━`,``,
      `Subject: ${s.name}`,`Age: ${s.age} yrs   Build: Medium`,``,
      `Circumstances:`,
      `Subject escaped from custody at ${hr}:${mn} hrs while being`,
      `transported through ${escapeThrough}.`,
      `Armed: ${rng()<0.3?'Possibly':'Unknown'}. Dangerous — do NOT approach alone.`,``,
      `Description: ${s.description}`,``,
      `Last seen at grid: ${s.lastSeenX}, ${s.lastSeenY}`,
      `Weather: ${w.toUpperCase()}   Hours elapsed: ${s.missingHours}`,``,
      `Reward: Rs. 50,000/- for verified tip leading to arrest.`,``,
      `Investigating Officer: ${ofcr}   Ph: 9412${String(100000+n*317).slice(0,6)}`,
    ].join('\n')
  }

  // Build terrain-accurate scenario based on what is ACTUALLY near the last-seen tile
  let activity: string
  let terrainDesc: string

  if (terrain.nearLake && terrain.waterBodyDesc.includes('large')) {
    activity = `was last seen walking toward the ${terrain.waterBodyDesc} to ${['fetch water','wash clothes','tend cattle near the shore'][n%3]}`
    terrainDesc = `The area borders a ${terrain.waterBodyDesc}. Shore terrain is steep in places.`
  } else if (terrain.nearLake) {
    activity = `went to the ${terrain.waterBodyDesc} ${['to collect water','for the cattle to drink','to wash utensils'][n%3]} and did not return`
    terrainDesc = `There is a ${terrain.waterBodyDesc} near the last known position.`
  } else if (terrain.nearRiver) {
    activity = `was last seen walking toward the ${terrain.waterBodyDesc} to ${['fetch water','wash clothes','water cattle'][n%3]}`
    terrainDesc = `The area has a ${terrain.waterBodyDesc} with dense riverine vegetation.`
  } else if (terrain.nearNala || terrain.nearWater) {
    activity = `went to the ${terrain.waterBodyDesc} to ${['fetch water','tend cattle','collect reeds'][n%3]} and did not return`
    terrainDesc = 'The area has seasonal streams and wet ground making tracking difficult.'
  } else if (terrain.nearForest && terrain.nearCultivated) {
    activity = `went to collect ${['firewood from the forest edge','medicinal herbs near the treeline','grass for cattle at the field margin'][n%3]}`
    terrainDesc = 'The area is a mix of cultivated terraces and dense forest.'
  } else if (terrain.nearForest) {
    activity = `was last seen entering the ${terrain.dominantTerrain} to ${['collect firewood','look for stray cattle','gather herbs'][n%3]}`
    terrainDesc = `The area is ${terrain.dominantTerrain} with poor visibility.`
  } else if (terrain.nearCultivated) {
    activity = `left home for ${['field work on the upper terraces','cattle grazing on cultivated land','the weekly bazaar via the field path'][n%3]} and went missing`
    terrainDesc = 'The area has cultivated terraces and scattered farm settlements.'
  } else if (terrain.nearTemple) {
    activity = `left for a ${['pilgrimage to the hilltop shrine','religious observance at the nearby temple','morning puja at the forest shrine'][n%3]} and did not return`
    terrainDesc = 'The area has religious sites on elevated ground with steep approach paths.'
  } else if (terrain.nearCliff) {
    activity = `was last seen near the ${['rocky escarpment above the village','cliff face at the forest edge','steep hillside track'][n%3]}`
    terrainDesc = 'The area has steep cliffs and escarpments. Terrain is hazardous.'
  } else if (terrain.nearRoad) {
    activity = `was last seen walking along the ${['kutcha road toward the next village','footpath to the upper hamlet','metalled road toward the bazaar'][n%3]}`
    terrainDesc = 'The area has road access but remote stretches with no habitation.'
  } else {
    activity = `went toward the ${terrain.dominantTerrain} and did not return`
    terrainDesc = `The surrounding area is ${terrain.dominantTerrain}.`
  }

  const weatherNote = w==='fog'?'Visibility was extremely poor due to dense fog. '
    : w==='rain'?'Heavy rainfall is complicating the search. '
    : w==='drizzle'?'Light drizzle was present at time of disappearance. '
    : ''

  return [
    `FIR No. ${firNo}`,`Police Station: ${sta}`,`District: ${dist}, Uttarakhand`,``,
    `MISSING PERSON REPORT`,`━━━━━━━━━━━━━━━━━━━━━━━━━━━`,``,
    `Subject: ${s.name}`,`Age: ${s.age}  Type: ${s.type.replace('_',' ')}  Fitness: ${s.fitness}`,``,
    `Circumstances:`,
    `${s.name} ${activity} at approximately ${hr}:${mn} hrs.`,
    `${weatherNote}Local searches by villagers have proved inconclusive.`,
    terrainDesc,``,
    `Physical Description: ${s.description}`,``,
    `Last known grid reference: ${s.lastSeenX}, ${s.lastSeenY}`,
    `Missing for: ${s.missingHours} hours`,
    `Weather at disappearance: ${w.toUpperCase()}`,``,
    `Reward: Rs. 10,000/- for verified tip confirming location.`,``,
    `Investigating Officer: ${ofcr}`,`Contact: 9412${String(100000+n*317).slice(0,6)}`,
  ].join('\n')
}

// Cache for lazily generated maps
const mapCache: Record<string, GameMap> = {}

export function getMapForCase(caseId: string): GameMap | null {
  if (mapCache[caseId]) return mapCache[caseId]

  if (caseId === 'case0') {
    const tutMap = generateMap(9999, 0.2)
    tutMap.id = 'map_case0'
    mapCache['map_case0'] = tutMap
    mapCache['case0'] = tutMap
    return tutMap
  }

  const n = parseInt(caseId.replace('case', ''))
  if (isNaN(n) || n < 1 || n > 50) return null

  const complexity = 0.1 + ((n - 1) / 49) * 0.9
  const seed = 1000 + n * 1597
  const map = generateMap(seed, complexity)
  map.id = `map_case${n}`
  mapCache[`map_case${n}`] = map
  mapCache[caseId] = map
  return map
}

export function generateAllCases():{cases:CaseFile[], maps:Record<string,GameMap>} {
  const cases:CaseFile[]=[], maps:Record<string,GameMap>={}

  for(let n=1;n<=50;n++){
    const rng=mkRng(n*1597+12347)
    // Complexity increases with case number: case1=0.1, case50=1.0
    const complexity=0.1+((n-1)/49)*0.9
    const map=getMapForCase(`case${n}`)!  // uses cache, generates lazily

    const W=map.width, H=map.height
    const type=TYPES[n%TYPES.length]
    const namePool=type==='adult_male'?MALE:type==='adult_female'?FEMALE:type==='child'?CHILD:type==='elderly'?ELDERLY:FUGITIVE
    const name=namePool[n%namePool.length]+(type==='child'?` (${6+Math.floor(rng()*8)} yrs)`:'')
    const age=type==='child'?6+Math.floor(rng()*8):type==='elderly'?65+Math.floor(rng()*15):22+Math.floor(rng()*40)
    const weather=WEATHERS[n%WEATHERS.length]
    const hours=2+Math.floor(rng()*20)
    // Place last-seen near terrain that matches subject type
    // Try up to 120 candidates, pick best scoring tile
    let lsx=8+Math.floor(rng()*(W-16)), lsy=8+Math.floor(rng()*(H-16))
    let bestScore = -1
    for (let attempt=0; attempt<120; attempt++) {
      const cx=8+Math.floor(rng()*(W-16)), cy=8+Math.floor(rng()*(H-16))
      const tile = map.tiles[cy]?.[cx]
      if (!tile || !tile.walkable) continue
      const sym = tile.sym
      let score = 0
      if (type==='elderly') {
        // Elderly: near roads/villages, low slope
        if (sym==='#'||sym==='='||sym==='f') score+=5
        if (sym==='B'||sym==='C') score+=4
        if (sym===','||sym==='.') score+=2
        if (tile.slope < 10) score+=3
        if (tile.roadDist < 4) score+=3
        if (sym==='T'||sym==='t') score-=4
      } else if (type==='child') {
        // Child: near water or forest
        if (tile.waterDist < 5) score+=5
        if (sym==='~'||sym==='-') score+=4
        if (sym==='T'||sym==='t') score+=3
        if (sym===','||sym==='.') score+=2
      } else if (type==='fugitive') {
        // Fugitive: near forest or cliff, away from roads
        if (sym==='T'||sym==='t') score+=5
        if (sym==='|'||sym==='M') score+=3
        if (tile.roadDist > 8) score+=3
        if (sym==='#'||sym==='B'||sym==='C') score-=3
      } else if (type==='adult_female'||type==='adult_male') {
        // Adults: near cultivated land, village outskirts, or forest edge
        if (sym===','||sym==='.') score+=4
        if (sym==='B') score+=3
        if (tile.roadDist < 6) score+=2
        if (tile.waterDist < 8) score+=2
        if (sym==='t'||sym==='P') score+=2
      }
      if (score > bestScore) { bestScore=score; lsx=cx; lsy=cy }
    }
    const fitness:Subject['fitness']=(['fit','average','poor']as const)[n%3]
    const clothes=['blue jacket','red shawl','grey sweater','green kurta','brown coat','black jacket','white kurta'][n%7]
    const desc=type==='fugitive'
      ?`Wearing dark clothing. Medium build. ${age} yrs. Considered dangerous.`
      :`${age}-year-old ${type.replace('_',' ')}. ${fitness==='poor'?'Limited mobility/health issues.':fitness==='fit'?'Physically active.':'Average fitness.'} Last seen wearing ${clothes}.`

    const sub:Subject={name,age,type,description:desc,lastSeenX:lsx,lastSeenY:lsy,actualX:0,actualY:0,missingHours:hours,fitness}
    const loc=findActualLocation(map,sub,weather)
    sub.actualX=loc.x; sub.actualY=loc.y

    cases.push({
      id:`case${n}`,num:n,
      title:`Case #${String(n).padStart(2,'0')} — ${name}`,
      fir:fir(sub,weather,n,rng,map),
      subject:sub,weather,
      reward:type==='fugitive'?50000:10000,
      status:'open',paid:false,
    })
  }
  // Tutorial case0
  const tutMap = generateMap(9999, 0.2)
  tutMap.id = 'map_case0'
  maps['map_case0'] = tutMap
  const tutW = tutMap.width, tutH = tutMap.height
  const tutRng = mkRng(9999)
  // Place tutorial elderly subject near a road/village
  let tutLsx = Math.floor(tutW*0.3), tutLsy = Math.floor(tutH*0.4)
  let tutBest = -1
  for (let a=0; a<120; a++) {
    const cx=8+Math.floor(tutRng()*(tutW-16)), cy=8+Math.floor(tutRng()*(tutH-16))
    const t=tutMap.tiles[cy]?.[cx]; if (!t||!t.walkable) continue
    let sc=0
    if (t.sym==='#'||t.sym==='='||t.sym==='f') sc+=5
    if (t.sym==='B'||t.sym==='C') sc+=4
    if (t.sym===','||t.sym==='.') sc+=2
    if (t.slope<10) sc+=3; if (t.roadDist<4) sc+=3
    if (sc>tutBest) { tutBest=sc; tutLsx=cx; tutLsy=cy }
  }
  const tutSub: Subject = {
    name: 'Meena Rawat', age: 68, type: 'elderly',
    description: '68-year-old elderly female. Limited mobility. Red shawl.',
    lastSeenX: tutLsx, lastSeenY: tutLsy,
    actualX: 0, actualY: 0,
    missingHours: 6, fitness: 'poor',
  }
  const tutLoc = findActualLocation(tutMap, tutSub, 'clear')
  tutSub.actualX = tutLoc.x; tutSub.actualY = tutLoc.y
  const tutFir = fir(tutSub, 'clear', 0, tutRng, tutMap)
    .replace('FIR No. 200/SHO/', 'FIR No. 000/TUTORIAL — ')
    .replace('MISSING PERSON REPORT', 'MISSING PERSON REPORT — TRAINING CASE')
  cases.unshift({
    id: 'case0', num: 0,
    title: 'TUTORIAL — Meena Rawat',
    fir: tutFir + '\nTHIS IS A TRAINING CASE — no reward.\nInvestigating Officer: Training Instructor',
    subject: tutSub, weather: 'clear', reward: 0, status: 'open', paid: false,
  })

  return {cases, maps: {}}  // maps are lazy — use getMapForCase()
}
