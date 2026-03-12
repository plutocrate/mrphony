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

function fir(s:Subject, w:Weather, n:number, rng:()=>number):string {
  const hr=8+Math.floor(rng()*10), mn=String(Math.floor(rng()*60)).padStart(2,'0')
  const dist=DISTRICTS[n%DISTRICTS.length], sta=STATIONS[n%STATIONS.length]
  const ofcr=OFFICERS[n%OFFICERS.length]
  const firNo=`${200+n}/SHO/${new Date().getFullYear()}`

  if(s.type==='fugitive') return [
    `FIR No. ${firNo}`,`Police Station: ${sta}`,`District: ${dist}, Uttarakhand`,``,
    `BOLO — BE ON LOOKOUT`,`━━━━━━━━━━━━━━━━━━━━━━━━━━━`,``,
    `Subject: ${s.name}`,`Age: ${s.age} yrs   Build: Medium`,``,
    `Circumstances:`,
    `Subject escaped from custody at ${hr}:${mn} hrs while being`,
    `transported through ${['dense forest area','a mountain pass','the river crossing','a kutcha road section'][n%4]}.`,
    `Armed: ${rng()<0.3?'Possibly':'Unknown'}. Dangerous — do NOT approach alone.`,``,
    `Description: ${s.description}`,``,
    `Last seen at grid: ${s.lastSeenX}, ${s.lastSeenY}`,
    `Weather: ${w.toUpperCase()}   Hours elapsed: ${s.missingHours}`,``,
    `Reward: Rs. 50,000/- for verified tip leading to arrest.`,``,
    `Investigating Officer: ${ofcr}   Ph: 9412${String(100000+n*317).slice(0,6)}`,
  ].join('\n')

  const scenarios=[
    `went to collect ${['firewood','medicinal herbs','grass for cattle','water from the spring'][n%4]} and did not return`,
    `was last seen walking toward the ${['forest trail','river bank','upper pasture','temple on the hill'][n%4]}`,
    `left home early morning for the weekly ${['bazaar','pilgrimage','field work','cattle grazing'][n%4]} and went missing`,
    `was tending cattle near the ${['forest edge','seasonal nala','cultivated fields','hilltop shrine'][n%4]} when last seen`,
  ]
  return [
    `FIR No. ${firNo}`,`Police Station: ${sta}`,`District: ${dist}, Uttarakhand`,``,
    `MISSING PERSON REPORT`,`━━━━━━━━━━━━━━━━━━━━━━━━━━━`,``,
    `Subject: ${s.name}`,`Age: ${s.age}  Type: ${s.type.replace('_',' ')}  Fitness: ${s.fitness}`,``,
    `Circumstances:`,
    `${s.name} ${scenarios[n%scenarios.length]} at approximately ${hr}:${mn} hrs.`,
    `${w==='fog'?'Visibility was extremely poor due to dense fog. ':''}${w==='rain'?'Heavy rainfall complicating search. ':''}`,
    `Local searches by villagers have proved inconclusive.`,
    `Terrain in the area is ${['heavily forested and steep','rocky with seasonal nalas','open grassland with deep gorges','a mix of cultivated terraces and dense jungle'][n%4]}.`,``,
    `Physical Description: ${s.description}`,``,
    `Last known grid reference: ${s.lastSeenX}, ${s.lastSeenY}`,
    `Missing for: ${s.missingHours} hours`,
    `Weather at disappearance: ${w.toUpperCase()}`,``,
    `Reward: Rs. 10,000/- for verified tip confirming location.`,``,
    `Investigating Officer: ${ofcr}`,`Contact: 9412${String(100000+n*317).slice(0,6)}`,
  ].join('\n')
}

export function generateAllCases():{cases:CaseFile[], maps:Record<string,GameMap>} {
  const cases:CaseFile[]=[], maps:Record<string,GameMap>={}

  for(let n=1;n<=50;n++){
    const rng=mkRng(n*1597+12347)
    // Complexity increases with case number: case1=0.1, case50=1.0
    const complexity=0.1+((n-1)/49)*0.9
    const seed=1000+n*1597
    const map=generateMap(seed, complexity)
    map.id=`map_case${n}`
    maps[map.id]=map

    const W=map.width, H=map.height
    const type=TYPES[n%TYPES.length]
    const namePool=type==='adult_male'?MALE:type==='adult_female'?FEMALE:type==='child'?CHILD:type==='elderly'?ELDERLY:FUGITIVE
    const name=namePool[n%namePool.length]+(type==='child'?` (${6+Math.floor(rng()*8)} yrs)`:'')
    const age=type==='child'?6+Math.floor(rng()*8):type==='elderly'?65+Math.floor(rng()*15):22+Math.floor(rng()*40)
    const weather=WEATHERS[n%WEATHERS.length]
    const hours=2+Math.floor(rng()*20)
    const lsx=8+Math.floor(rng()*(W-16)), lsy=8+Math.floor(rng()*(H-16))
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
      fir:fir(sub,weather,n,rng),
      subject:sub,weather,
      reward:type==='fugitive'?50000:10000,
      status:'open',paid:false,
      createdAt:new Date(Date.now()-hours*3600000).toISOString()
    })
  }
  // Tutorial case0
  const tutMap = generateMap(9999, 0.2)
  tutMap.id = 'map_case0'
  maps['map_case0'] = tutMap
  const tutW = tutMap.width
  const tutSub: Subject = {
    name: 'Meena Rawat', age: 68, type: 'elderly',
    description: '68-year-old elderly female. Limited mobility. Red shawl.',
    lastSeenX: Math.floor(tutW * 0.3),
    lastSeenY: Math.floor(tutMap.height * 0.4),
    actualX: 0, actualY: 0,
    missingHours: 6, fitness: 'poor',
  }
  const tutLoc = findActualLocation(tutMap, tutSub, 'clear')
  tutSub.actualX = tutLoc.x; tutSub.actualY = tutLoc.y
  cases.unshift({
    id: 'case0', num: 0,
    title: 'TUTORIAL — Meena Rawat',
    fir: [
      'FIR No. 000/TUTORIAL','Police Station: Training Division','District: Pithoragarh, Uttarakhand','',
      'MISSING PERSON REPORT — TRAINING CASE','━━━━━━━━━━━━━━━━━━━━━━━━━━━','',
      'Subject: Meena Rawat','Age: 68  Type: elderly  Fitness: poor','',
      'Circumstances:',
      'Meena Rawat went to collect firewood near the village edge',
      'and did not return by evening. She is elderly, limited mobility.',
      'Weather was clear. Local searches proved inconclusive.','',
      'Physical Description: 68-year-old elderly female. Red shawl.','',
      'Last known grid reference: '+tutSub.lastSeenX+', '+tutSub.lastSeenY,
      'Missing for: 6 hours  Weather: CLEAR','',
      'THIS IS A TRAINING CASE — no reward.',
      'Investigating Officer: Training Instructor',
    ].join('\n'),
    subject: tutSub, weather: 'clear', reward: 0, status: 'open', paid: false,
  })

  return {cases,maps}
}
