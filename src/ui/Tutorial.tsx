import { useStore } from '../store'

// Tutorial steps — each step describes a UI region and explains it
interface TutStep {
  title: string
  body: string[]
  highlight?: 'hud' | 'map' | 'legend' | 'trail' | 'waypoint' | 'submit' | 'fir'
  action?: string  // what the NEXT button says
}

const STEPS: TutStep[] = [
  {
    title: '01 / WELCOME TO TERRAIN ANALYSIS',
    body: [
      'This system helps locate missing persons and fugitives using',
      'Survey of India topographic maps.',
      '',
      'You are looking at CASE 0 — a training scenario.',
      'Subject: Meena Rawat, 68 years old, elderly female.',
      'Missing for 6 hours. Last seen at the X marker on the map.',
      '',
      'We will walk through how to analyse terrain and',
      'draw a search trail to find her.',
    ],
    highlight: 'map',
    action: 'NEXT →',
  },
  {
    title: '02 / READING THE FIR',
    body: [
      'Every case starts with a First Information Report (FIR).',
      '',
      'Key details to extract:',
      '  • Subject type (elderly, child, adult, fugitive)',
      '  • Fitness level (fit / average / poor)',
      '  • Hours missing — determines how far they could travel',
      '  • Weather — fog/rain greatly reduce movement range',
      '',
      'For Meena Rawat:',
      '  Elderly female, POOR fitness, 6 hours missing, CLEAR weather.',
      '  → Low mobility, very likely stayed near roads or tracks.',
    ],
    highlight: 'fir',
    action: 'NEXT →',
  },
  {
    title: '03 / READING THE MAP LEGEND',
    body: [
      'The legend on the right shows all terrain symbols.',
      '',
      'Key terrain types for elderly subjects:',
      '  #  Metalled road / highway  — HIGH probability',
      '  =  Kutcha / unmetalled road — HIGH probability',
      '  f  Footpath / mule track    — HIGH probability',
      '  T  Dense forest             — LOW (hard to enter)',
      '  |  Cliff / escarpment       — VERY LOW (impassable)',
      '  ~  Perennial river          — barrier / boundary',
      '',
      'Elderly subjects almost always stay on or near tracks.',
      'They move downhill toward villages and water sources.',
    ],
    highlight: 'legend',
    action: 'NEXT →',
  },
  {
    title: '04 / THE HUD STATUS BAR',
    body: [
      'The bar at the top shows live information:',
      '',
      '  [CASE ID]  Subject name  |  Tile (x,y)  Symbol  Elevation  Slope',
      '',
      'Hover over any tile to see its coordinates and terrain type.',
      '',
      'The right side shows your trail status:',
      '  • Total trail length vs the 25-tile limit',
      '  • Number of waypoints placed',
      '  • Controls reminder',
      '',
      'The trail limit forces you to commit to a specific search area.',
    ],
    highlight: 'hud',
    action: 'NEXT →',
  },
  {
    title: '05 / PLACING YOUR FIRST WAYPOINT',
    body: [
      'Now we begin plotting the search trail.',
      '',
      'The system is placing the FIRST waypoint near the last',
      'known position — the X marker.',
      '',
      'A green dot marks where the trail begins.',
      'The trail follows the most likely movement corridor.',
      '',
      'For elderly: start from the X, then follow the nearest',
      'road or footpath downhill.',
    ],
    highlight: 'waypoint',
    action: 'ADD WAYPOINT →',
  },
  {
    title: '06 / FOLLOWING THE TERRAIN',
    body: [
      'Good. First point placed.',
      '',
      'Now we follow the terrain. Look at the tiles between',
      'the X marker and the next downhill section.',
      '',
      'The system is placing the second waypoint along the',
      'predicted movement corridor — following the trail network',
      'and heading downhill toward the valley.',
      '',
      'Each new point extends the yellow trail line.',
      'The buffer zone (shaded area) shows the full search width.',
    ],
    highlight: 'trail',
    action: 'EXTEND TRAIL →',
  },
  {
    title: '07 / COMPLETING THE CORRIDOR',
    body: [
      'The trail is taking shape.',
      '',
      'For a 6-hour missing elderly subject in clear weather:',
      '  Speed ~1.2 km/h × 0.55 (poor fitness) = ~0.66 km/h',
      '  Max distance ≈ 4 km ≈ ~8 map tiles',
      '',
      'Your trail should cover the most likely area within',
      'that radius, biased along tracks and downhill routes.',
      '',
      'Adding the final waypoint now to complete the corridor.',
    ],
    highlight: 'trail',
    action: 'COMPLETE TRAIL →',
  },
  {
    title: '08 / SUBMIT WITH wq',
    body: [
      'Trail is complete. The shaded corridor shows the full',
      'search area — the system checks if the subject is',
      'anywhere within 4 tiles of the trail line.',
      '',
      'To submit your analysis:',
      '  → Type  wq  on your keyboard',
      '',
      'This works exactly like a terminal editor — write + quit.',
      '',
      'You will receive feedback on whether your corridor',
      'captured the subject, and why.',
      '',
      'Press FINISH to submit this tutorial case now.',
    ],
    highlight: 'submit',
    action: 'FINISH TUTORIAL',
  },
]

export function TutorialOverlay() {
  const store = useStore()
  const step = store.tutorialStep
  const s = STEPS[Math.min(step, STEPS.length - 1)]

  const highlightStyle = (region: TutStep['highlight']): React.CSSProperties => {
    if (s.highlight !== region) return {}
    return {
      outline: '2px solid #39ff14',
      outlineOffset: '2px',
      boxShadow: '0 0 16px rgba(57,255,20,0.4)',
      zIndex: 300,
      position: 'relative',
    }
  }

  return (
    <>
      {/* Dim overlay behind the box */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.55)',
        pointerEvents: 'none',
      }} />

      {/* Tutorial card */}
      <div style={{
        position: 'absolute',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 500,
        width: 'min(640px, 90vw)',
        background: 'rgba(0,10,0,0.97)',
        border: '1px solid #39ff14',
        boxShadow: '0 0 40px rgba(57,255,20,0.2), inset 0 0 30px rgba(0,30,0,0.8)',
        fontFamily: "'Share Tech Mono', monospace",
        color: '#a8e8a8',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid #1a4a1a',
          background: 'rgba(0,30,0,0.6)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ color: '#39ff14', fontSize: '12px', fontWeight: 'bold', letterSpacing: '0.1em' }}>
            {s.title}
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: i === step ? '#39ff14' : i < step ? '#1a6a1a' : '#0a2a0a',
                border: '1px solid #1a4a1a',
              }} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px 10px', fontSize: '13px', lineHeight: '1.7' }}>
          {s.body.map((line, i) => (
            <div key={i} style={{
              color: line.startsWith('  •') || line.startsWith('  ') ? '#88cc88' :
                     line.startsWith('For ') || line.startsWith('  →') ? '#ffe044' :
                     line === '' ? undefined : '#c8e8c8',
              minHeight: line === '' ? '8px' : undefined,
              fontStyle: line.startsWith('  •') ? 'normal' : undefined,
            }}>
              {line || '\u00a0'}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 16px 12px',
          borderTop: '1px solid #0a2a0a',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <button
            onClick={() => store.closeTutorial()}
            style={{
              background: 'transparent',
              border: '1px solid #1a3a1a',
              color: '#3a6a3a',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '11px',
              padding: '5px 12px',
              cursor: 'pointer',
              letterSpacing: '0.05em',
            }}
          >
            SKIP TUTORIAL
          </button>

          <button
            onClick={() => store.tutorialNext()}
            style={{
              background: 'rgba(0,60,0,0.8)',
              border: '1px solid #39ff14',
              color: '#39ff14',
              fontFamily: "'Share Tech Mono', monospace",
              fontSize: '13px',
              fontWeight: 'bold',
              padding: '7px 20px',
              cursor: 'pointer',
              letterSpacing: '0.08em',
              boxShadow: '0 0 12px rgba(57,255,20,0.2)',
            }}
          >
            {s.action}
          </button>
        </div>
      </div>
    </>
  )
}
