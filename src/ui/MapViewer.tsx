import { useRef, useEffect, useCallback, useState } from 'react'
import { useStore, TRAIL_BUFFER, MAX_TRAIL_TILES } from '../store'
import { TutorialOverlay } from './Tutorial'
import type { Tile, TSym } from '../types'

const BASE_TS = 10

const BG: Record<TSym, string> = {
  '^': '#7a7a6a', 'M': '#5a5a4c', 'H': '#686858', '|': '#4a4a3e', 'O': '#3e2e24',
  'T': '#123612', 't': '#1e3e14', 'P': '#1e4a16', '.': '#364830', ',': '#5a6e3a',
  '~': '#083a6a', '-': '#0e2e50', 'D': '#7a6a4a', 'L': '#062040', 'S': '#12281a',
  '#': '#4e4638', '=': '#3c342c', 'f': '#2e2820', 'R': '#282860', 'B': '#7a5c30',
  'C': '#9a7838', 'W': '#183a52', 'G': '#5c2838', 'E': '#1e2828', 'X': '#bb2200',
}
const FG: Record<TSym, string> = {
  '^': '#e8e8cc',  'M': '#ccccbb', 'H': '#ddddcc', '|': '#bbbbaa', 'O': '#ffcc88',
  'T': '#55ee44',  't': '#88cc55', 'P': '#77ee55', '.': '#aaccaa', ',': '#eeff99',
  '~': '#66ccff',  '-': '#88bbee', 'D': '#eebb88', 'L': '#44aaff', 'S': '#77cc88',
  '#': '#ffeecc',  '=': '#ddbbaa', 'f': '#cc9988', 'R': '#ccccff', 'B': '#ffe0aa',
  'C': '#ffee88',  'W': '#77eeff', 'G': '#ffaabb', 'E': '#aaffee', 'X': '#ff3300',
}

const LEGEND: {sym:TSym; label:string}[] = [
  {sym:'^',label:'Peak / Trig. Point'},
  {sym:'M',label:'Mountain range'},
  {sym:'H',label:'Hillock'},
  {sym:'|',label:'Cliff / Escarpment'},
  {sym:'O',label:'Cave / Rock shelter'},
  {sym:'T',label:'Dense forest (Jungle)'},
  {sym:'t',label:'Open / Scrub forest'},
  {sym:'P',label:'Plantation / Orchard'},
  {sym:'.',label:'Open ground / Wasteland'},
  {sym:',',label:'Agricultural / Cultivated'},
  {sym:'~',label:'Perennial river'},
  {sym:'-',label:'Seasonal nala'},
  {sym:'D',label:'Dry sandy riverbed'},
  {sym:'L',label:'Lake / Reservoir'},
  {sym:'S',label:'Swamp / Wetland'},
  {sym:'#',label:'Metalled road / Highway'},
  {sym:'=',label:'Unmetalled / Kutcha road'},
  {sym:'f',label:'Footpath / Mule track'},
  {sym:'R',label:'Railway line'},
  {sym:'B',label:'Village / Hamlet'},
  {sym:'C',label:'Town / Urban area'},
  {sym:'W',label:'Well / Tank / Kund'},
  {sym:'G',label:'Temple / Shrine'},
  {sym:'E',label:'Electric pylon / HT'},
  {sym:'X',label:'Last seen position'},
]

function trailLength(waypoints: [number, number][]): number {
  let len = 0
  for (let i = 0; i < waypoints.length - 1; i++) {
    len += Math.hypot(waypoints[i+1][0]-waypoints[i][0], waypoints[i+1][1]-waypoints[i][1])
  }
  return len
}

function drawMap(
  ctx: CanvasRenderingContext2D,
  tiles: Tile[][], W: number, H: number,
  offX: number, offY: number, zoom: number,
  waypoints: [number, number][],
  lastSeen: [number, number] | null,
  hasError: boolean,
  hoverTile: [number, number] | null,
): void {
  const ts = Math.max(2, Math.round(BASE_TS * zoom))
  const cw = ctx.canvas.width, ch = ctx.canvas.height

  ctx.fillStyle = '#020902'
  ctx.fillRect(0, 0, cw, ch)

  const x0 = Math.max(0, offX | 0)
  const y0 = Math.max(0, offY | 0)
  const x1 = Math.min(W, x0 + Math.ceil(cw / ts) + 2)
  const y1 = Math.min(H, y0 + Math.ceil(ch / ts) + 2)

  const fs = Math.max(5, ts - 2)
  ctx.font = `${fs}px 'Share Tech Mono',monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const t = tiles[y]?.[x]; if (!t) continue
      const px = (x - offX) * ts
      const py = (y - offY) * ts
      ctx.fillStyle = BG[t.sym] ?? '#111'
      ctx.fillRect(px, py, ts, ts)
      if (ts >= 7) {
        ctx.globalAlpha = 0.92
        ctx.fillStyle = FG[t.sym] ?? '#999'
        ctx.fillText(t.sym, px + ts * 0.5, py + ts * 0.5)
        ctx.globalAlpha = 1
      }
      if (t.label && ts >= 13) {
        ctx.font = `bold ${Math.max(7, ts - 3)}px 'Share Tech Mono',monospace`
        ctx.fillStyle = '#ffffff'
        ctx.globalAlpha = 0.9
        ctx.fillText(t.label, px + ts * 0.5, py - 3)
        ctx.globalAlpha = 1
        ctx.font = `${fs}px 'Share Tech Mono',monospace`
      }
    }
  }

  // subtle grid lines
  if (ts >= 8) {
    ctx.strokeStyle = 'rgba(40,100,40,0.07)'
    ctx.lineWidth = 0.5
    for (let y = y0; y <= y1; y++) {
      ctx.beginPath(); ctx.moveTo(0, (y - offY) * ts); ctx.lineTo(cw, (y - offY) * ts); ctx.stroke()
    }
    for (let x = x0; x <= x1; x++) {
      ctx.beginPath(); ctx.moveTo((x - offX) * ts, 0); ctx.lineTo((x - offX) * ts, ch); ctx.stroke()
    }
  }

  // last-seen marker
  if (lastSeen) {
    const [lx, ly] = lastSeen
    const px = (lx - offX) * ts, py = (ly - offY) * ts
    ctx.fillStyle = '#dd1100'; ctx.fillRect(px, py, ts, ts)
    ctx.shadowColor = '#ff3300'; ctx.shadowBlur = 20
    ctx.fillStyle = '#ffffff'
    ctx.font = `bold ${Math.max(8, ts)}px monospace`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('X', px + ts * 0.5, py + ts * 0.5)
    ctx.shadowBlur = 0
    ctx.font = `${fs}px 'Share Tech Mono',monospace`
  }

  // ── Draw trail buffer + path ──────────────────────────────────────────────
  if (waypoints.length >= 2) {
    const col = hasError ? '#ff4444' : '#ffdd00'
    // draw buffer fill around each segment
    ctx.globalAlpha = 0.13
    ctx.fillStyle = hasError ? '#ff4444' : '#ffdd00'
    for (let i = 0; i < waypoints.length - 1; i++) {
      const [ax, ay] = waypoints[i]
      const [bx, by] = waypoints[i + 1]
      const sx = (ax - offX + 0.5) * ts, sy = (ay - offY + 0.5) * ts
      const ex = (bx - offX + 0.5) * ts, ey = (by - offY + 0.5) * ts
      const segLen = Math.hypot(ex - sx, ey - sy) || 1
      const nx = -(ey - sy) / segLen * TRAIL_BUFFER * ts
      const ny = (ex - sx) / segLen * TRAIL_BUFFER * ts
      ctx.beginPath()
      ctx.moveTo(sx + nx, sy + ny); ctx.lineTo(ex + nx, ey + ny)
      ctx.lineTo(ex - nx, ey - ny); ctx.lineTo(sx - nx, sy - ny)
      ctx.closePath(); ctx.fill()
    }
    ctx.globalAlpha = 1

    // draw the trail line
    ctx.strokeStyle = col; ctx.lineWidth = 2
    ctx.setLineDash([ts * 0.5, ts * 0.25])
    ctx.shadowColor = col; ctx.shadowBlur = 8
    ctx.beginPath()
    const [fx, fy] = waypoints[0]
    ctx.moveTo((fx - offX + 0.5) * ts, (fy - offY + 0.5) * ts)
    for (let i = 1; i < waypoints.length; i++) {
      const [wx, wy] = waypoints[i]
      ctx.lineTo((wx - offX + 0.5) * ts, (wy - offY + 0.5) * ts)
    }
    ctx.stroke()
    ctx.setLineDash([]); ctx.shadowBlur = 0

    // length label at midpoint of trail
    const mid = Math.floor(waypoints.length / 2)
    const [mx, my] = waypoints[mid]
    const mpx = (mx - offX + 0.5) * ts, mpy = (my - offY + 0.5) * ts
    const len = trailLength(waypoints)
    ctx.fillStyle = '#fff'
    ctx.font = `11px 'Share Tech Mono',monospace`
    ctx.textAlign = 'center'
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4
    ctx.fillText(`${len.toFixed(1)}/${MAX_TRAIL_TILES}`, mpx, mpy - 14)
    ctx.shadowBlur = 0
    ctx.font = `${fs}px 'Share Tech Mono',monospace`
  }

  // draw waypoint dots
  waypoints.forEach((wp, i) => {
    const [wx, wy] = wp
    const px = (wx - offX + 0.5) * ts, py = (wy - offY + 0.5) * ts
    const isFirst = i === 0
    const isLast = i === waypoints.length - 1
    const dotColor = isFirst ? '#00ff88' : isLast ? '#ffe044' : 'rgba(255,220,50,0.6)'
    ctx.shadowColor = dotColor; ctx.shadowBlur = isFirst || isLast ? 18 : 8
    ctx.fillStyle = dotColor
    ctx.beginPath()
    ctx.arc(px, py, Math.max(3, ts * (isFirst || isLast ? 0.42 : 0.28)), 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  })

  // hover crosshair
  if (hoverTile) {
    const [hx, hy] = hoverTile
    const px = (hx - offX) * ts, py = (hy - offY) * ts
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    ctx.setLineDash([2, 2])
    ctx.strokeRect(px, py, ts, ts)
    ctx.setLineDash([])
  }
}

export function MapViewer({ sourceRef }: { sourceRef: React.RefObject<HTMLCanvasElement> }) {
  const store = useStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>()
  const drag = useRef<{mx:number;my:number;ox:number;oy:number}|null>(null)
  const [hover, setHover] = useState<Tile|null>(null)
  const [hoverTile, setHoverTile] = useState<[number,number]|null>(null)
  const isDragging = useRef(false)
  const dragStart = useRef<{x:number;y:number}|null>(null)

  const caseId = store.activeCaseId
  const c = caseId ? store.cases[caseId] : null
  const map = caseId ? store.maps[`map_${caseId}`] : null

  const getTile = useCallback((clientX:number, clientY:number): [number,number]|null => {
    const cv = canvasRef.current; if (!cv || !map) return null
    const rect = cv.getBoundingClientRect()
    const ts = BASE_TS * store.zoom
    const tx = ((clientX - rect.left) / ts + store.viewX) | 0
    const ty = ((clientY - rect.top) / ts + store.viewY) | 0
    if (tx < 0 || tx >= map.width || ty < 0 || ty >= map.height) return null
    return [tx, ty]
  }, [map, store.zoom, store.viewX, store.viewY])

  // render loop
  useEffect(() => {
    function loop() {
      const cv = canvasRef.current; if (!cv || !map) { rafRef.current = requestAnimationFrame(loop); return }
      const ctx = cv.getContext('2d'); if (!ctx) { rafRef.current = requestAnimationFrame(loop); return }
      const isTut = store.tutorialOpen
      const wps = isTut ? store.tutorialWaypoints : store.waypoints
      drawMap(ctx, map.tiles, map.width, map.height,
        store.viewX, store.viewY, store.zoom,
        wps,
        c ? [c.subject.lastSeenX, c.subject.lastSeenY] : null,
        !!store.pathError,
        hoverTile,
      )
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [map, store.viewX, store.viewY, store.zoom, store.waypoints, store.tutorialWaypoints, store.tutorialOpen, store.pathError, c, hoverTile])

  // canvas resize
  const wrapperRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const wrapper = wrapperRef.current; const cv = canvasRef.current
    if (!wrapper || !cv) return
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect
      const w = Math.round(r.width), h = Math.round(r.height)
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h }
    })
    ro.observe(wrapper)
    cv.width = wrapper.clientWidth; cv.height = wrapper.clientHeight
    return () => ro.disconnect()
  }, [])

  // keyboard
  const [cmdBuf, setCmdBuf] = useState('')
  const cmdTimeout = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!store.mapOpen) return
      const step = 5
      switch(e.key) {
        case 'ArrowLeft':  store.setView(Math.max(0,store.viewX-step), store.viewY); e.preventDefault(); return
        case 'ArrowRight': store.setView(store.viewX+step, store.viewY); e.preventDefault(); return
        case 'ArrowUp':    store.setView(store.viewX, Math.max(0,store.viewY-step)); e.preventDefault(); return
        case 'ArrowDown':  store.setView(store.viewX, store.viewY+step); e.preventDefault(); return
        case '+': case '=': store.setView(store.viewX, store.viewY, store.zoom*1.15); return
        case '-':            store.setView(store.viewX, store.viewY, store.zoom/1.15); return
        case 'Backspace': store.undoWaypoint(); e.preventDefault(); return
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        setCmdBuf(prev => {
          const next = prev + e.key
          clearTimeout(cmdTimeout.current)
          cmdTimeout.current = setTimeout(() => setCmdBuf(''), 2000)
          if (next === 'q') { store.closeMap(); return '' }
          if (next === 'wq') {
            if (store.activeCaseId) store.submitCase(store.activeCaseId)
            return ''
          }
          if (next === 'u') { store.undoWaypoint(); return '' }
          if (next === 'cc') { store.clearTrail(); return '' }
          return next
        })
      }
      if (e.key === 'Escape') { store.closeMap(); setCmdBuf('') }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(cmdTimeout.current) }
  }, [store])

  const onMouseMove = (e: React.MouseEvent) => {
    const tile = getTile(e.clientX, e.clientY)
    setHover(tile && map ? (map.tiles[tile[1]]?.[tile[0]] ?? null) : null)
    setHoverTile(tile)
    if (drag.current) {
      isDragging.current = true
      const ts = BASE_TS * store.zoom
      store.setView(
        Math.max(0, drag.current.ox - (e.clientX - drag.current.mx) / ts),
        Math.max(0, drag.current.oy - (e.clientY - drag.current.my) / ts),
      )
    }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = false
    dragStart.current = { x: e.clientX, y: e.clientY }
    drag.current = { mx: e.clientX, my: e.clientY, ox: store.viewX, oy: store.viewY }
  }

  const onMouseUp = (e: React.MouseEvent) => {
    const moved = dragStart.current
      ? Math.hypot(e.clientX - dragStart.current.x, e.clientY - dragStart.current.y)
      : 999
    drag.current = null
    dragStart.current = null

    // Only add waypoint if this was a click, not a drag
    if (moved < 5) {
      const tile = getTile(e.clientX, e.clientY)
      if (tile) store.addWaypoint(tile)
    }
    isDragging.current = false
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      store.setView(store.viewX, store.viewY, store.zoom * (e.deltaY < 0 ? 1.12 : 0.89))
    } else {
      const ts = BASE_TS * store.zoom
      store.setView(
        Math.max(0, store.viewX + e.deltaX / ts),
        Math.max(0, store.viewY + e.deltaY / ts),
      )
    }
  }

  if (!map || !c) return null

  const isTutorial = store.tutorialOpen
  // Use tutorialWaypoints when in tutorial mode
  const activeWaypoints = isTutorial ? store.tutorialWaypoints : store.waypoints

  const trailLen = activeWaypoints.length >= 2
    ? activeWaypoints.reduce((a, w, i) => i === 0 ? a : a + Math.hypot(w[0]-activeWaypoints[i-1][0], w[1]-activeWaypoints[i-1][1]), 0)
    : null

  const LEGEND_W = 220
  const HUD_H = 32

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: '#020902', overflow: 'hidden',
    }}>
      {/* HUD bar */}
      <div style={{
        height: `${HUD_H}px`, flexShrink: 0,
        background: 'rgba(0,8,0,0.96)',
        borderBottom: '1px solid #1a4a1a',
        paddingLeft: '14px', paddingRight: `${LEGEND_W + 10}px`,
        display: 'flex', alignItems: 'center', gap: '14px',
        fontFamily: "'Share Tech Mono',monospace", fontSize: '13px', color: '#a8e8a8',
        whiteSpace: 'nowrap', overflow: 'hidden',
      }}>
        <span style={{ color: '#39ff14', fontWeight: 'bold' }}>{c.id.toUpperCase()}</span>
        <span style={{ color: '#d4ffd4' }}>{c.subject.name}</span>
        <span style={{ color: '#4a8a4a' }}>|</span>
        {hover && (
          <span style={{ color: '#88cc88' }}>
            ({hover.x},{hover.y}) <strong style={{color:'#d4ffd4'}}>{hover.sym}</strong> {hover.elev}m sl:{hover.slope}°
          </span>
        )}
        {cmdBuf && (
          <span style={{ color: '#39ff14', background: 'rgba(0,50,0,0.8)', padding: '1px 8px', fontWeight:'bold' }}>
            :{cmdBuf}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: store.pathError ? '#ff6b6b' : '#ffd166' }}>
          {store.pathError
            ? `⚠ ${store.pathError}`
            : trailLen !== null
            ? `TRAIL: ${trailLen.toFixed(1)} / ${MAX_TRAIL_TILES} tiles  |  ${activeWaypoints.length} pts  —  wq=submit  u=undo  cc=clear`
            : isTutorial ? 'TUTORIAL MODE — press NEXT in the panel below'
            : 'CLICK map to plot trail  |  u=undo last  |  q=close  |  wq=submit'}
        </span>
      </div>

      {/* Map canvas + Legend */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div ref={wrapperRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              cursor: drag.current ? 'grabbing' : 'crosshair',
            }}
            onMouseMove={onMouseMove}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
            onMouseLeave={() => { drag.current = null; setHoverTile(null) }}
            onWheel={onWheel}
            onContextMenu={e => e.preventDefault()}
          />
        </div>

        {/* Legend panel */}
        <div style={{
          width: `${LEGEND_W}px`, flexShrink: 0,
          background: 'rgba(0,6,0,0.98)',
          borderLeft: '1px solid #1a3a1a',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px 6px',
            borderBottom: '1px solid #1a3a1a',
            fontFamily: "'Share Tech Mono',monospace",
            fontSize: '11px', fontWeight: 'bold',
            color: '#39ff14', letterSpacing: '0.08em',
          }}>
            SURVEY OF INDIA — LEGEND
          </div>

          <div style={{
            flex: 1, overflowY: 'auto',
            padding: '6px 10px 8px',
            scrollbarWidth: 'thin', scrollbarColor: '#1a3a1a #000',
          }}>
            {LEGEND.map(item => (
              <div key={item.sym} style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '4px' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '20px', height: '20px', flexShrink: 0,
                  background: BG[item.sym], color: FG[item.sym],
                  fontFamily: "'Share Tech Mono',monospace", fontWeight: 'bold', fontSize: '12px',
                }}>{item.sym}</span>
                <span style={{
                  fontFamily: "'Share Tech Mono',monospace",
                  fontSize: '11px', color: '#b8eeb8', lineHeight: 1.25,
                }}>{item.label}</span>
              </div>
            ))}

            {/* Trail status */}
            <div style={{
              marginTop: '10px', paddingTop: '8px',
              borderTop: '1px solid #1a3a1a',
              fontFamily: "'Share Tech Mono',monospace", fontSize: '10.5px',
            }}>
              <div style={{ color: '#39ff14', marginBottom: '5px', letterSpacing: '0.05em' }}>SEARCH TRAIL</div>
              <div style={{ color: store.waypoints.length > 0 ? '#00ff88' : '#3a6a3a' }}>
                Points: {store.waypoints.length}
              </div>
              {trailLen !== null && (
                <div style={{ marginTop: '2px', color: store.pathError ? '#ff6b6b' : '#a8e8a8' }}>
                  Length: {trailLen.toFixed(1)} / {MAX_TRAIL_TILES}
                </div>
              )}
              <div style={{ marginTop: '4px', color: '#3a6a3a', fontSize: '10px', lineHeight: 1.7 }}>
                click = add point{'\n'}
                u / Backspace = undo{'\n'}
                cc = clear trail
              </div>
            </div>

            <div style={{
              marginTop: '8px', paddingTop: '6px',
              borderTop: '1px solid #1a3a1a',
              fontFamily: "'Share Tech Mono',monospace",
              fontSize: '10px', color: '#3a6a3a', lineHeight: 1.8,
            }}>
              ctrl+scroll: zoom{'\n'}
              scroll: pan{'\n'}
              arrows: navigate{'\n'}
              +/-: zoom in/out
            </div>
          </div>
        </div>
      </div>
      {/* Tutorial overlay */}
      {isTutorial && <TutorialOverlay />}
    </div>
  )
}
