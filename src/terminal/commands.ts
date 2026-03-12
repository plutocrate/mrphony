import { useStore } from '../store'
import { pauseMusic, resumeMusic, getMusicStatus } from '../music'
import type { TermLine } from '../types'
import { getPredictedZone } from '../simulation/engine'

let _id = 5000
const L = (text: string, cls: TermLine['cls'] = 'normal'): TermLine => ({ id: _id++, text, cls })

// ─── Virtual filesystem helpers ───────────────────────────────────────────────
function norm(raw: string, cwd: string): string {
  const base = raw.startsWith('/') ? raw : (cwd.endsWith('/') ? cwd + raw : cwd + '/' + raw)
  const parts: string[] = []
  for (const s of base.split('/')) {
    if (!s || s === '.') continue
    if (s === '..') parts.pop()
    else parts.push(s)
  }
  return '/' + parts.join('/')
}

type Entry = { name: string; type: 'd' | 'f' }

function listDir(path: string): Entry[] | null {
  const p = path.replace(/\/$/, '')
  if (p === '/home/mrphony') return [{ name: 'cases', type: 'd' }]
  if (p === '/home/mrphony/cases')
    return Array.from({ length: 50 }, (_, i) => ({ name: `case${i+1}`, type: 'd' as const }))
  const m = p.match(/^\/home\/mrphony\/cases\/(case(\d+))$/)
  if (m) {
    const n = parseInt(m[2])
    if (n >= 1 && n <= 50) return [{ name: 'case.txt', type: 'f' }, { name: 'case.map', type: 'f' }]
  }
  return null
}

function isDir(path: string) { return listDir(path) !== null }

function readFile(path: string): string | null {
  const m = path.match(/^\/home\/mrphony\/cases\/(case(\d+))\/(case\.(txt|map))$/)
  if (!m) return null
  const caseId = m[1], type = m[4]
  const c = useStore.getState().cases[caseId]
  if (!c) return null
  if (type === 'txt') return c.fir
  return `[Binary terrain file — use: case --open ${path}]`
}

// ─── Boot lines (shown once) ──────────────────────────────────────────────────
export const BOOT_LINES: TermLine[] = [
  L(''),
  L('  ██████╗ ██╗      █████╗  ██████╗██╗  ██╗██╗     ██╗███╗  ██╗██╗   ██╗██╗  ██╗', 'dim'),
  L('  ██╔══██╗██║     ██╔══██╗██╔════╝██║ ██╔╝██║     ██║████╗ ██║██║   ██║╚██╗██╔╝', 'dim'),
  L('  ██████╔╝██║     ███████║██║     █████╔╝ ██║     ██║██╔██╗██║██║   ██║ ╚███╔╝ ', 'dim'),
  L('  ██╔══██╗██║     ██╔══██║██║     ██╔═██╗ ██║     ██║██║╚████║██║   ██║ ██╔██╗ ', 'dim'),
  L('  ██████╔╝███████╗██║  ██║╚██████╗██║  ██╗███████╗██║██║ ╚███║╚██████╔╝██╔╝ ██╗', 'dim'),
  L('  ╚═════╝ ╚══════╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝╚═╝  ╚══╝╚═════╝ ╚═╝  ╚═╝', 'dim'),
  L(''),
  L('  POLICE TERRAIN ANALYSIS SYSTEM  ·  RESTRICTED ACCESS  ·  UTTARAKHAND POLICE', 'bold'),
  L('  ─────────────────────────────────────────────────────────────────────────────────', 'dim'),
  L(`  Kernel    : BlackLinux 6.1.0-police-hardened #1 SMP`, 'dim'),
  L(`  Hostname  : policeblacklinux.up.gov.in`, 'dim'),
  L(`  User      : mrphony  [Terrain Analyst, Clearance L-2]`, 'dim'),
  L(`  Session   : ${new Date().toLocaleString('en-IN')}`, 'dim'),
  L('  ─────────────────────────────────────────────────────────────────────────────────', 'dim'),
  L('  WARNING: This terminal is for authorised government use only.', 'warn'),
  L('  All activity is logged and monitored. Unauthorised access is a criminal offence.', 'warn'),
  L('  ─────────────────────────────────────────────────────────────────────────────────', 'dim'),
  L(''),
  L("  Type 'help' for available commands.", 'dim'),
  L("  Type 'case --tutorial' to start the interactive tutorial.", 'warn'),
  L("  Type 'case --new' to receive your next assignment.", 'dim'),
  L(''),
]

// ─── Help ─────────────────────────────────────────────────────────────────────
const HELP: TermLine[] = [
  L(''),
  L('AVAILABLE COMMANDS', 'bold'),
  L('──────────────────────────────────────────────────────', 'dim'),
  L('  ls [path]              list directory contents'),
  L('  cd <path>              change directory  (cd .. / cd ~)'),
  L('  pwd                    print working directory'),
  L('  cat <file>             read a file (case.txt for FIR)'),
  L('  help                   show this help'),
  L('  music pause            pause background music'),
  L('  music resume           resume background music'),
  L(''),
  L('  case --list            list all cases and their status', 'bold'),
  L('  case --new             receive a new open case'),
  L('  case --tutorial        interactive tutorial — start here!', 'bold'),
  L('  case --open <path>     open map  (case --open ~/cases/case1/case.map)'),
  L('  case --status <path|.> check evaluation status of a case'),
  L('  case --solved          show all closed cases and payment'),
  L(''),
  L('MAP CONTROLS', 'bold'),
  L('──────────────────────────────────────────────────────', 'dim'),
  L('  Click anywhere          add waypoint to search trail'),
  L('  u / Backspace           undo last waypoint'),
  L('  cc                      clear entire trail'),
  L('  Scroll                  pan the map'),
  L('  Ctrl + scroll           zoom in/out'),
  L('  Arrow keys              navigate'),
  L('  q                       close map (discard trail)'),
  L('  wq                      submit trail and evaluate case'),
  L(''),
]

// ─── Main dispatcher ──────────────────────────────────────────────────────────
export function handleCommand(raw: string): void {
  const store = useStore.getState()
  const { addLine, addLines, cases } = store
  const t = raw.trim()
  if (!t) return
  const parts = t.split(/\s+/), cmd = parts[0].toLowerCase(), args = parts.slice(1)

  switch (cmd) {
    case 'pwd':
      addLine(store.cwd); break

    case 'ls': {
      const target = args[0] ? norm(args[0], store.cwd) : store.cwd
      const entries = listDir(target)
      if (!entries) { addLine(`ls: ${args[0] || '.'}: No such directory`, 'error'); break }
      if (!entries.length) break
      // 4 columns
      for (let i = 0; i < entries.length; i += 4) {
        addLine(entries.slice(i, i+4).map(e => (e.type==='d' ? e.name+'/' : e.name).padEnd(22)).join(''))
      }
      break
    }

    case 'cd': {
      const target = args[0]
        ? norm(args[0].replace('~', '/home/mrphony'), store.cwd)
        : '/home/mrphony'
      if (!isDir(target)) { addLine(`cd: ${args[0]}: No such directory`, 'error'); break }
      store.setCwd(target); break
    }

    case 'cat': {
      if (!args[0]) { addLine('cat: missing operand', 'error'); break }
      const fp = norm(args[0].replace('~', '/home/mrphony'), store.cwd)
      const content = readFile(fp)
      if (content === null) { addLine(`cat: ${args[0]}: No such file`, 'error'); break }
      content.split('\n').forEach(l => addLine(l)); break
    }

    case 'music': {
      const sub = args[0]
      if (sub === 'pause') { addLine(pauseMusic(), 'dim'); break }
      if (sub === 'resume') { addLine(resumeMusic(), 'dim'); break }
      if (sub === 'status') { addLine('Music: ' + getMusicStatus(), 'dim'); break }
      addLine("music: usage: music pause | music resume | music status", 'error'); break
    }

    case 'help':
      addLines(HELP); break

    case 'q':
      if (store.mapOpen) { store.closeMap(); addLine('Map closed.', 'dim') }
      else addLine('q: no active map', 'error')
      break

    case 'wq':
      if (!store.mapOpen || !store.activeCaseId) {
        addLine('wq: no active map — open with case --open <path>', 'error'); break
      }
      store.submitCase(store.activeCaseId); break

    case 'case':
      handleCase(args, store); break

    default:
      addLine(`${cmd}: command not found  (try 'help')`, 'error')
  }
}

// ─── case sub-commands ────────────────────────────────────────────────────────
function handleCase(args:string[], store:ReturnType<typeof useStore.getState>) {
  const { addLine, addLines, cases } = store
  const flag = args[0]

  if (!flag || flag === '--list') {
    const all = Object.values(cases).sort((a,b) => a.num-b.num)
    addLines([L(''), L(`${'ID'.padEnd(10)}${'STATUS'.padEnd(12)}${'SUBJECT'.padEnd(22)}${'REWARD'.padEnd(12)}PAID`,'bold'), L('─'.repeat(62),'dim')])
    for (const c of all) {
      const cls: TermLine['cls'] = c.status==='solved'?'success':c.status==='failed'?'error':'normal'
      addLine(`${c.id.padEnd(10)}${c.status.padEnd(12)}${c.subject.name.slice(0,20).padEnd(22)}${'Rs.'+c.reward+'/-'} ${' '.repeat(4)}${c.paid?'YES':'—'}`, cls)
    }
    addLine(''); return
  }

  if (flag === '--tutorial') {
    store.openTutorial()
    return
  }

  if (flag === '--new') {
    const open = Object.values(cases).filter(c=>c.status==='open').sort((a,b)=>a.num-b.num)
    if (!open.length) { addLine('No open cases remaining.', 'warn'); return }
    const c = open[0]
    const zone = getPredictedZone(c.subject, c.weather)
    addLines([
      L(''), L(`CASE ASSIGNED: ${c.id.toUpperCase()} — ${c.title}`, 'bold'),
      L(`Subject  : ${c.subject.name}, ${c.subject.age} yrs, ${c.subject.type.replace('_',' ')}`),
      L(`Missing  : ${c.subject.missingHours}h  Weather: ${c.weather}  Fitness: ${c.subject.fitness}`),
      L(`Reward   : Rs.${c.reward}/-`),
      L(''),
      L('ANALYST PREDICTION:', 'bold'),
      L(`  ${zone.description}`, 'warn'),
      L(''),
      L(`Files in : ~/cases/${c.id}/`),
      L(`  cat ~/cases/${c.id}/case.txt           — read FIR details`, 'dim'),
      L(`  case --open ~/cases/${c.id}/case.map   — open terrain map`, 'dim'),
      L(''),
    ]); return
  }

  if (flag === '--open') {
    const raw = args[1]
    if (!raw) { addLine('Usage: case --open <path/to/case.map>', 'error'); return }
    const fp = norm(raw.replace('~', '/home/mrphony'), store.cwd)
    const m = fp.match(/\/home\/mrphony\/cases\/(case(\d+))\/case\.map$/)
    if (!m) { addLine(`case --open: not a valid .map path: ${raw}`, 'error'); return }
    const caseId = m[1], n = parseInt(m[2])
    if (n < 1 || n > 50) { addLine('case --open: case number out of range', 'error'); return }
    const c = cases[caseId]
    if (!c) { addLine(`${caseId}: not found`, 'error'); return }
    const zone = getPredictedZone(c.subject, c.weather)
    addLines([
      L(''), L(`Opening: ${caseId.toUpperCase()} — ${c.subject.name}`, 'bold'),
      L(`Last seen at tile (${c.subject.lastSeenX}, ${c.subject.lastSeenY})  [marked X on map]`),
      L(`Prediction: ${zone.description}`, 'warn'),
      L(`Controls: click=add point  u=undo  cc=clear  wq=submit  q=close`, 'dim'),
      L(''),
    ])
    store.openMap(caseId); return
  }

  if (flag === '--status') {
    const raw = args[1] || '.'
    const fp = norm(raw.replace('~', '/home/mrphony'), store.cwd)
    const m = fp.match(/\/home\/mrphony\/cases\/(case\d+)\/?$/)
    if (!m) { addLine(`case --status: not a case directory: ${raw}`, 'error'); return }
    const caseId = m[1], c = cases[caseId]
    if (!c) { addLine(`${caseId}: not found`, 'error'); return }
    addLines([
      L(''), L(`STATUS — ${caseId.toUpperCase()}`, 'bold'),
      L(`Subject   : ${c.subject.name}`),
      L(`Status    : ${c.status}`, c.status==='solved'?'success':c.status==='failed'?'error':'normal'),
      L(`Paid      : ${c.paid?'YES — Rs.'+c.reward+'/-':'NOT PAID'}`, c.paid?'success':'dim'),
      c.submittedAt ? L(`Submitted : ${new Date(c.submittedAt).toLocaleString('en-IN')}`, 'dim') : L('Submitted : pending','dim'),
      c.pathStart&&c.pathEnd ? L(`Path      : (${c.pathStart[0]},${c.pathStart[1]}) → (${c.pathEnd[0]},${c.pathEnd[1]})`, 'dim') : L('Path      : none','dim'),
      L(''),
    ]); return
  }

  if (flag === '--solved') {
    const closed = Object.values(cases).filter(c=>c.status==='solved'||c.status==='failed').sort((a,b)=>a.num-b.num)
    if (!closed.length) { addLine('No closed cases yet.','dim'); return }
    addLines([L(''), L('CLOSED CASES','bold'), L('─'.repeat(58),'dim')])
    let total = 0
    for (const c of closed) {
      if (c.paid) total += c.reward
      addLine(`${c.id.padEnd(10)}${c.status.padEnd(10)}${c.paid?'PAID Rs.'+c.reward+'/-  ':'UNPAID        '}${c.subject.name}`, c.status==='solved'?'success':'error')
    }
    addLines([L('─'.repeat(58),'dim'), L(`Total earned: Rs.${total}/-`,'success'), L('')]); return
  }

  addLine(`case: unknown flag '${flag}'  (try 'help')`, 'error')
}
