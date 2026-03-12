import { useEffect, useRef } from 'react'

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main(){v_uv=(a_pos+1.0)*0.5;gl_Position=vec4(a_pos,0,1);}
`

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform float u_time;
uniform vec2 u_res;
varying vec2 v_uv;

vec2 curve(vec2 uv){
  uv=(uv-0.5)*2.0;
  uv*=1.0+dot(uv.yx,uv.yx)*0.038;
  return uv*0.5+0.5;
}

void main(){
  vec2 uv=curve(v_uv);
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){gl_FragColor=vec4(0);return;}

  vec4 col=texture2D(u_tex,uv);

  // Scanlines — pronounced, CRT-style, alternating dark rows
  float lineY = floor(uv.y * u_res.y);
  float scan = mod(lineY, 2.0) < 1.0 ? 0.88 : 1.0;
  col.rgb *= scan;

  // Horizontal phosphor bloom bleed (subtle)
  float bloom = 0.0008;
  vec4 bleedL = texture2D(u_tex, vec2(uv.x - bloom, uv.y));
  vec4 bleedR = texture2D(u_tex, vec2(uv.x + bloom, uv.y));
  col.rgb = mix(col.rgb, (bleedL.rgb + bleedR.rgb) * 0.5, 0.12);

  // RGB fringe (chromatic aberration)
  float off=0.0005;
  float r=texture2D(u_tex,vec2(uv.x+off,uv.y)).r;
  float b=texture2D(u_tex,vec2(uv.x-off,uv.y)).b;
  col.r=r; col.b=b;

  // Very subtle slow flicker (much reduced)
  float flicker = sin(u_time * 0.7) * 0.008 + sin(u_time * 2.3) * 0.004;
  col.rgb += flicker;

  // Vignette
  vec2 vig=uv*2.0-1.0;
  float v=1.0-dot(vig,vig)*0.38;
  col.rgb*=v;

  // Phosphor green tint
  col.rgb*=vec3(0.87,1.05,0.80);

  // Minimal noise grain (reduced)
  float grain=fract(sin(dot(uv,vec2(12.9898+u_time*0.1,78.233)))*43758.5453)*0.025-0.012;
  col.rgb+=grain;

  col=clamp(col,0.0,1.0);
  gl_FragColor=col;
}
`

interface Props { width: number; height: number; sourceCanvas: HTMLCanvasElement | null }

export function CRTOverlay({ width, height, sourceCanvas }: Props) {
  const glCanvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = glCanvas.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false })
    if (!gl) return

    function compile(type: number, src: string) {
      const s = gl!.createShader(type)!
      gl!.shaderSource(s, src); gl!.compileShader(s)
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) console.error(gl!.getShaderInfoLog(s))
      return s
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog); gl.useProgram(prog)

    const vb = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, vb)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)

    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uRes  = gl.getUniformLocation(prog, 'u_res')
    const uTex  = gl.getUniformLocation(prog, 'u_tex')
    gl.uniform1i(uTex, 0)

    let raf = 0
    const start = performance.now()
    function frame() {
      if (!sourceCanvas || !gl) { raf = requestAnimationFrame(frame); return }
      gl.viewport(0, 0, canvas!.width, canvas!.height)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas) } catch {}
      gl.uniform1f(uTime, (performance.now() - start) / 1000)
      gl.uniform2f(uRes, canvas!.width, canvas!.height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); gl.deleteTexture(tex) }
  }, [sourceCanvas])

  useEffect(() => {
    if (glCanvas.current) { glCanvas.current.width = width; glCanvas.current.height = height }
  }, [width, height])

  return (
    <canvas
      ref={glCanvas}
      width={width} height={height}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 100 }}
    />
  )
}
