import { useRef, useEffect, useState } from 'react'
import { useStore } from './store'
import { Terminal } from './ui/Terminal'
import { MapViewer } from './ui/MapViewer'
import { initMusic } from './music'

// CRT effect via CSS + WebGL canvas overlay reading from map canvas
// For terminal (DOM), CRT is pure CSS. For map (canvas), WebGL reads the canvas.

export default function App() {
  const mapOpen = useStore(s => s.mapOpen)

  // Register first-gesture music start once on mount
  useEffect(() => { initMusic() }, [])
  const offscreenRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    const h = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  return (
    <div style={{ width:'100vw', height:'100vh', overflow:'hidden', position:'relative', background:'#010801' }}>
      {/* Content layer */}
      <div style={{ position:'absolute', inset:0 }}>
        {mapOpen
          ? <MapViewer sourceRef={offscreenRef} />
          : <Terminal />
        }
      </div>

      {/* Hidden offscreen canvas for map→CRT pipeline */}
      <canvas ref={offscreenRef} width={size.w} height={size.h}
        style={{ position:'absolute', inset:0, opacity:0, pointerEvents:'none' }} />

      {/* CRT CSS overlay — always on */}
      <CssOverlay />
    </div>
  )
}

function CssOverlay() {
  return (
    <>
      {/* Scanlines */}
      <div style={{
        position:'absolute', inset:0, pointerEvents:'none', zIndex:200,
        background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.10) 2px,rgba(0,0,0,0.10) 4px)',
      }}/>
      {/* Vignette */}
      <div style={{
        position:'absolute', inset:0, pointerEvents:'none', zIndex:201,
        background:'radial-gradient(ellipse at center, transparent 52%, rgba(0,0,0,0.72) 100%)',
      }}/>
      {/* Phosphor flicker — very subtle, slow */}
      <div style={{
        position:'absolute', inset:0, pointerEvents:'none', zIndex:202,
        opacity:0.015, background:'rgba(0,255,0,1)',
        animation:'flick 2.5s ease-in-out infinite',
      }}/>
      {/* CRT curvature frame */}
      <div style={{
        position:'absolute', inset:'-2px', pointerEvents:'none', zIndex:203,
        borderRadius:'8px',
        boxShadow:'inset 0 0 80px rgba(0,0,0,0.6), 0 0 0 4px #000, inset 0 0 4px rgba(0,255,0,0.08)',
      }}/>
      <WebGLCRT />
      <style>{`
        @keyframes flick { 0%{opacity:.015} 50%{opacity:.004} 100%{opacity:.015} }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>
    </>
  )
}

// WebGL CRT renders on top of everything to apply curvature + chromatic aberration
function WebGLCRT() {
  const glRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  useEffect(() => {
    const h = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  useEffect(() => {
    const cv = glRef.current; if (!cv) return
    const gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: false })
    if (!gl) return

    const VERT = `attribute vec2 a;varying vec2 v;void main(){v=(a+1.0)*0.5;gl_Position=vec4(a,0,1);}`
    const FRAG = `
precision mediump float;
varying vec2 v;
uniform float u_t;
void main(){
  vec2 uv=v*2.0-1.0;
  float d=dot(uv,uv);
  // subtle curvature darkening at edges
  float vignette=1.0-d*0.45;
  // chromatic abberation ghost line
  float scanband=sin(v.y*800.0+u_t*2.0)*0.003;
  // output: transparent overlay with edge effects only
  float alpha=max(0.0,(1.0-vignette)*0.55);
  gl_FragColor=vec4(0,0,0,alpha+scanband*0.1);
}`

    function sh(type: number, src: string) {
      const s = gl.createShader(type)!
      gl.shaderSource(s,src); gl.compileShader(s); return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog); gl.useProgram(prog)
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uT = gl.getUniformLocation(prog, 'u_t')

    const start = performance.now()
    let raf: number
    function frame() {
      gl.viewport(0,0,cv!.width,cv!.height)
      gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform1f(uT, (performance.now()-start)/1000)
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <canvas ref={glRef} width={size.w} height={size.h}
      style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:210 }} />
  )
}
