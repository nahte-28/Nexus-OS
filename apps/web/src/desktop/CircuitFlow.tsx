import { useEffect, useMemo, useRef, useState } from 'react'
import { circuitLayout, seededRandom, tracePath, type CircuitTrace } from '@nexus/core'
import { useTheme } from '../theme/ThemeContext'
import { useCircuitMotion } from './circuitSetting'

/**
 * NEXUS Circuit Flow (Visual Identity 2.0, phase 2): copper traces on the desktop board, always
 * faintly visible, with now and then a small pulse running along one and a pad lighting up where it
 * arrives. One SVG behind the dashboard and the windows, without pointer events.
 *
 * Why SVG and not a canvas: about a dozen traces and a handful of pulses, styled with the theme's
 * own colours (CSS variables) and redrawn by the browser at any scale. Pulses move with the Web
 * Animations API on transform and opacity only, so they run on the compositor without a
 * requestAnimationFrame loop; they pause when the page is hidden, and do not run at all with
 * "reduce motion" or when you switch them off in Instellingen.
 */

/** Calm pace: a pulse crosses about 110px a second (Pulse) or 80px (Focus). */
const SPEED = { focus: 80, pulse: 110 } as const
/** At most this many pulses at once; Focus is quieter. */
const PULSES = { focus: 3, pulse: 5 } as const

function useSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let timer: number | undefined
    const measure = () => setSize({ width: Math.round(el.clientWidth), height: Math.round(el.clientHeight) })
    measure()
    // Recalculate after a resize settles, not on every pixel of a drag.
    const later = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(measure, 200)
    }
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', later)
      return () => {
        window.removeEventListener('resize', later)
        window.clearTimeout(timer)
      }
    }
    const observer = new ResizeObserver(later)
    observer.observe(el)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [ref])
  return size
}

function useReducedMotion(): boolean {
  const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
  const [reduced, setReduced] = useState(query?.matches ?? false)
  useEffect(() => {
    if (!query) return
    const change = () => setReduced(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [query])
  return reduced
}

/** Keyframes that move a dot along the corners of [trace] in the first [travel] part of the cycle. */
function pulseFrames(trace: CircuitTrace, travel: number): Keyframe[] {
  const frames: Keyframe[] = []
  let walked = 0
  trace.points.forEach((p, i) => {
    if (i > 0) walked += Math.abs(p.x - trace.points[i - 1].x) + Math.abs(p.y - trace.points[i - 1].y)
    const at = (walked / trace.length) * travel
    frames.push({ offset: at, transform: `translate(${p.x}px, ${p.y}px)`, opacity: i === 0 ? 0 : i === trace.points.length - 1 ? 0.2 : 1 })
  })
  // Fade in right after the start, gone after arriving, then rest until the next round.
  frames.splice(1, 0, { offset: Math.min(travel * 0.08, frames[1].offset as number), opacity: 1 })
  frames.push({ offset: Math.min(1, travel + 0.02), opacity: 0, transform: frames[frames.length - 1].transform }, { offset: 1, opacity: 0, transform: frames[frames.length - 1].transform })
  return frames
}

export function CircuitFlow() {
  const box = useRef<HTMLDivElement>(null)
  const { width, height } = useSize(box)
  const { theme } = useTheme()
  const reduced = useReducedMotion()
  const enabled = useCircuitMotion()
  const layout = useMemo(() => circuitLayout(width, height), [width, height])
  const pulseRefs = useRef<Array<SVGGElement | null>>([])
  const padRefs = useRef<Array<SVGCircleElement | null>>([])

  // Which traces carry a pulse, and when: different lengths and pauses so nothing moves in step.
  const pulses = useMemo(() => {
    const random = seededRandom(width * 31 + height)
    const long = layout.traces.filter((t) => t.length >= 6 * 18)
    const picked = [...long].sort(() => random() - 0.5).slice(0, PULSES[theme])
    return picked.map((trace) => {
      const travel = (trace.length / SPEED[theme]) * 1000
      const rest = 5000 + random() * 11000
      return { trace, duration: travel + rest, travel: travel / (travel + rest), delay: random() * 9000, pad: layout.pads.findIndex((p) => p === trace.points[trace.points.length - 1]) }
    })
  }, [layout, theme, width, height])

  const moving = enabled && !reduced
  useEffect(() => {
    if (!moving) return
    const running: Animation[] = []
    pulses.forEach((p, i) => {
      const dot = pulseRefs.current[i]
      if (!dot || typeof dot.animate !== 'function') return
      running.push(dot.animate(pulseFrames(p.trace, p.travel), { duration: p.duration, delay: p.delay, iterations: Infinity, easing: 'linear', fill: 'both' }))
      const pad = padRefs.current[p.pad]
      if (pad && p.pad >= 0) {
        const t = p.travel
        running.push(
          pad.animate(
            [
              { offset: 0, opacity: 0.35, transform: 'scale(1)' },
              { offset: Math.max(0, t - 0.005), opacity: 0.35, transform: 'scale(1)' },
              { offset: Math.min(1, t + 0.01), opacity: 1, transform: 'scale(1.6)' },
              { offset: Math.min(1, t + 0.08), opacity: 0.35, transform: 'scale(1)' },
              { offset: 1, opacity: 0.35, transform: 'scale(1)' },
            ],
            { duration: p.duration, delay: p.delay, iterations: Infinity, easing: 'ease-out' },
          ),
        )
      }
    })
    // Nothing to see in a hidden tab: stop until it comes back.
    const visibility = () => running.forEach((a) => (document.hidden ? a.pause() : a.play()))
    document.addEventListener('visibilitychange', visibility)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      running.forEach((a) => a.cancel())
    }
  }, [pulses, moving])

  return (
    <div ref={box} aria-hidden="true" className="nx-circuit pointer-events-none absolute inset-0" data-testid="circuit-flow">
      {width > 0 && (
        <svg width={width} height={height} className="block">
          <g className="nx-circuit-traces">
            {layout.traces.map((t) => (
              <path key={t.id} d={tracePath(t)} />
            ))}
          </g>
          <g className="nx-circuit-pads">
            {layout.pads.map((p, i) => (
              <circle
                key={`${p.x},${p.y},${i}`}
                ref={(el) => {
                  padRefs.current[i] = el
                }}
                cx={p.x}
                cy={p.y}
                r={2.6}
                style={{ transformOrigin: `${p.x}px ${p.y}px`, transformBox: 'view-box' }}
              />
            ))}
          </g>
          {moving &&
            pulses.map((p, i) => (
              <g
                key={p.trace.id}
                ref={(el) => {
                  pulseRefs.current[i] = el
                }}
                className="nx-circuit-pulse"
                style={{ opacity: 0 }}
              >
                <circle r={5} className="nx-circuit-halo" />
                <circle r={1.8} />
              </g>
            ))}
        </svg>
      )}
    </div>
  )
}
