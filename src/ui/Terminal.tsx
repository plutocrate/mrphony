import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { useStore } from '../store'
import { handleCommand, BOOT_LINES } from '../terminal/commands'

// ─── Color map — bright, easy on eyes ─────────────────────────────────────────
const CLR: Record<string, string> = {
  normal:  '#d4ffd4',   // bright mint
  error:   '#ff6b6b',   // bright red
  success: '#57ff9a',   // bright green
  dim:     '#6aaa6a',   // muted green (still readable)
  warn:    '#ffd166',   // amber
  bold:    '#ffffff',   // white
  input:   '#39ff14',   // neon green for typed input
}

export function Terminal() {
  const store = useStore()
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const booted = useRef(false)

  useEffect(() => {
    if (!booted.current) {
      booted.current = true
      if (store.lines.length === 0) store.addLines(BOOT_LINES)
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [store.lines.length])

  const prompt = `mrphony@policeblacklinux:${store.cwd.replace('/home/mrphony', '~')}$ `

  const submit = useCallback((raw: string) => {
    const t = raw.trim()
    store.addLine(prompt + t, 'input')
    store.pushHistory(t)
    setInput('')
    if (t) handleCommand(t)
  }, [store, prompt])

  const onKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { submit(input); return }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = Math.min(store.histIdx + 1, store.history.length - 1)
      store.setHistIdx(idx); setInput(store.history[idx] ?? '')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const idx = Math.max(store.histIdx - 1, -1)
      store.setHistIdx(idx); setInput(idx < 0 ? '' : store.history[idx] ?? '')
    }
  }, [input, store, submit])

  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: '#010f01', overflow: 'hidden', cursor: 'text',
      }}
      onClick={() => inputRef.current?.focus()}
    >
      {/* Output area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '14px 20px 4px',
        fontFamily: "'Share Tech Mono', 'Courier New', monospace",
        fontSize: '15px', lineHeight: '1.65',
        scrollbarWidth: 'thin', scrollbarColor: '#1c5c1c #010f01',
      }}>
        {store.lines.map(line => (
          <div key={line.id} style={{
            color: CLR[line.cls] ?? CLR.normal,
            textShadow: `0 0 6px ${CLR[line.cls] ?? CLR.normal}44`,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            minHeight: '1.65em',
          }}>
            {line.text || '\u00a0'}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{
        flexShrink: 0, padding: '6px 20px 14px',
        display: 'flex', alignItems: 'center',
        fontFamily: "'Share Tech Mono', monospace", fontSize: '15px',
        borderTop: '1px solid #0d3b0d',
      }}>
        <span style={{
          color: '#39ff14',
          textShadow: '0 0 12px #39ff1488',
          whiteSpace: 'nowrap', userSelect: 'none', marginRight: '2px',
        }}>
          {prompt}
        </span>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          {/* real hidden input for events */}
          <input
            ref={inputRef} autoFocus value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKey}
            style={{
              position: 'absolute', inset: 0, opacity: 0, cursor: 'text',
              fontFamily: 'inherit', fontSize: 'inherit',
              border: 'none', outline: 'none', background: 'transparent',
              color: 'transparent', caretColor: 'transparent', width: '100%',
            }}
            spellCheck={false} autoComplete="off" autoCorrect="off" autoCapitalize="off"
          />
          {/* visible text */}
          <span style={{ color: '#39ff14', textShadow: '0 0 8px #39ff1466', whiteSpace: 'pre' }}>{input}</span>
          {/* blinking block cursor */}
          <span style={{
            display: 'inline-block', width: '9px', height: '18px',
            background: '#39ff14', boxShadow: '0 0 14px #39ff14',
            animation: 'blink 1.1s step-end infinite', flexShrink: 0,
          }} />
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        ::-webkit-scrollbar { width: 5px }
        ::-webkit-scrollbar-track { background: #010f01 }
        ::-webkit-scrollbar-thumb { background: #1c5c1c }
      `}</style>
    </div>
  )
}
