// Rekenmachine: a small, safe expression evaluator (no eval), with Belgian decimal commas.

export type CalcResult = { ok: true; value: number; text: string } | { ok: false; error: string }

const MAX_LENGTH = 200

/** Formats like a Belgian calculator: comma for decimals, at most 10 significant digits. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return 'Fout'
  const rounded = Number.parseFloat(n.toPrecision(10))
  const abs = Math.abs(rounded)
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-6)) return rounded.toExponential(6).replace('.', ',')
  return rounded.toLocaleString('nl-BE', { maximumFractionDigits: 10, useGrouping: false })
}

type Token = { kind: 'num'; value: number } | { kind: 'op'; value: string }

function tokenize(input: string): Token[] | string {
  const src = input.replace(/\s+/g, '').replace(/×/g, '*').replace(/[÷:]/g, '/').replace(/−/g, '-')
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/[0-9.,]/.test(c)) {
      let j = i
      while (j < src.length && /[0-9.,]/.test(src[j])) j++
      const raw = src.slice(i, j).replace(/,/g, '.')
      if ((raw.match(/\./g) ?? []).length > 1 || raw === '.') return 'Dat getal klopt niet.'
      tokens.push({ kind: 'num', value: Number(raw) })
      i = j
    } else if ('+-*/%^()'.includes(c)) {
      tokens.push({ kind: 'op', value: c })
      i++
    } else {
      return `"${c}" kan de rekenmachine niet lezen.`
    }
  }
  return tokens
}

/**
 * Evaluates [input] with + − × ÷, ^ (power), % (percent of the number before, or /100),
 * brackets and negative numbers. Returns a Dutch error for anything it cannot read.
 */
export function calculate(input: string): CalcResult {
  if (input.length > MAX_LENGTH) return { ok: false, error: 'Te lang.' }
  const tokens = tokenize(input)
  if (typeof tokens === 'string') return { ok: false, error: tokens }
  if (tokens.length === 0) return { ok: false, error: 'Tik een berekening.' }
  let pos = 0
  const peek = () => tokens[pos]
  const isOp = (v: string) => peek()?.kind === 'op' && peek()!.value === v
  const fail = (msg: string): never => {
    throw new Error(msg)
  }
  // expr := term (('+'|'-') term)*
  function expr(): number {
    let left = term()
    if (lastPercent) {
      left /= 100
      lastPercent = false
    }
    while (isOp('+') || isOp('-')) {
      const op = (tokens[pos++] as { value: string }).value
      const right = term()
      // 200 + 10% means 200 + 20, like a pocket calculator.
      const r = lastPercent ? (left * right) / 100 : right
      lastPercent = false
      left = op === '+' ? left + r : left - r
    }
    return left
  }
  let lastPercent = false
  // term := power (('*'|'/') power)*
  function term(): number {
    let left = power()
    while (isOp('*') || isOp('/')) {
      if (lastPercent) {
        left /= 100
        lastPercent = false
      }
      const op = (tokens[pos++] as { value: string }).value
      let right = power()
      // 80 × 25% is 20.
      if (lastPercent) right /= 100
      lastPercent = false
      if (op === '/' && right === 0) fail('Delen door nul kan niet.')
      left = op === '*' ? left * right : left / right
    }
    return left
  }
  // power := unary ('^' power)?
  function power(): number {
    const base = unary()
    if (isOp('^')) {
      pos++
      lastPercent = false
      return base ** power()
    }
    return base
  }
  // unary := '-' unary | postfix
  function unary(): number {
    if (isOp('-')) {
      pos++
      return -unary()
    }
    if (isOp('+')) {
      pos++
      return unary()
    }
    return postfix()
  }
  // postfix := primary '%'?
  function postfix(): number {
    const v = primary()
    if (isOp('%')) {
      pos++
      lastPercent = true
      return v
    }
    lastPercent = false
    return v
  }
  function primary(): number {
    const t = peek()
    if (!t) return fail('De berekening is niet af.')
    if (t.kind === 'num') {
      pos++
      return t.value
    }
    if (t.value === '(') {
      pos++
      const v = expr()
      if (!isOp(')')) fail('Er ontbreekt een haakje.')
      pos++
      return v
    }
    return fail('De berekening is niet af.')
  }
  try {
    const value = expr()
    if (pos < tokens.length) fail(isOp(')') ? 'Er staat een haakje te veel.' : 'De berekening klopt niet.')
    if (!Number.isFinite(value)) return { ok: false, error: 'Dat getal is te groot.' }
    return { ok: true, value, text: formatNumber(value) }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'De berekening klopt niet.' }
  }
}
