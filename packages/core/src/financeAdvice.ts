/**
 * Financiën: the facts NEXUS AI gets for advice about a month. Only totals per category, budgets,
 * subscriptions and goals go out: no descriptions of transactions and no names of friends.
 */
import {
  alive,
  budgetStatus,
  CYCLE_LABELS,
  goalProgress,
  monthLabel,
  monthlyCost,
  monthOf,
  monthSeries,
  monthSummary,
  recurringPerMonth,
  shiftMonth,
  type FinanceState,
} from './finance'
import { sharedTotals } from './financeShared'

/** Plain amounts for the AI, without the narrow spaces of the Belgian format. */
const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`

export function financeFacts(s: FinanceState, now: number, month = monthOf(now)): string {
  const lines: string[] = []
  const sum = monthSummary(s, month, now)
  const current = month === monthOf(now)
  lines.push(`# ${monthLabel(month)}${current ? ` (vandaag is dag ${new Date(now).getDate()} van de maand)` : ''}`)
  lines.push(`Inkomen: ${eur(sum.income)}. Uitgaven: ${eur(sum.expenses)}. Saldo: ${eur(sum.net)}.`)
  if (sum.projected !== null) lines.push(`Verwachte uitgaven tegen het einde van de maand aan dit tempo: ${eur(sum.projected)}.`)
  lines.push('', '## Uitgaven per categorie')
  lines.push(...(sum.byCategory.length ? sum.byCategory.map((c) => `- ${c.category}: ${eur(c.amount)}`) : ['- geen']))

  const budgets = budgetStatus(s, month, now)
  lines.push('', '## Budgetten')
  lines.push(
    ...(budgets.length
      ? budgets.map((b) => `- ${b.label}: ${eur(b.spent)} van ${eur(b.available)} (${b.used}%)${b.carried > 0 ? `, waarvan ${eur(b.carried)} overgedragen` : ''}`)
      : ['- geen budgetten ingesteld']),
  )

  lines.push('', '## Vorige maanden')
  for (const m of monthSeries(s, shiftMonth(month, -1), 3)) lines.push(`- ${monthLabel(m.month)}: inkomen ${eur(m.income)}, uitgaven ${eur(m.expenses)}`)

  const subs = alive(s.subscriptions)
  lines.push('', '## Abonnementen')
  lines.push(...(subs.length ? subs.map((x) => `- ${x.name}: ${eur(x.amount)} ${CYCLE_LABELS[x.cycle].toLowerCase()} (${eur(monthlyCost(x))} per maand)`) : ['- geen']))

  const fixed = recurringPerMonth(s)
  if (fixed.income || fixed.expenses) lines.push('', '## Vaste bedragen', `Gemiddeld per maand ${eur(fixed.income)} vast inkomen en ${eur(fixed.expenses)} vaste uitgaven.`)

  const goals = alive(s.goals).map((g) => goalProgress(s, g, now))
  if (goals.length) {
    lines.push('', '## Spaardoelen')
    for (const g of goals) lines.push(`- ${g.goal.name}: ${eur(g.saved)} van ${eur(g.goal.target)}${g.goal.due ? `, tegen ${g.goal.due}` : ''}${g.perMonth ? ` (nodig: ${eur(g.perMonth)} per maand)` : ''}`)
  }

  const shared = sharedTotals(s)
  if (shared.owedToMe || shared.iOwe) lines.push('', '## Gedeelde kosten', `Vrienden zijn je samen ${eur(shared.owedToMe)} schuldig; jij bent ${eur(shared.iOwe)} schuldig.`)
  return lines.join('\n')
}
