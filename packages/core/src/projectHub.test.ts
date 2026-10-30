import { describe, expect, it } from 'vitest'
import {
  addTask,
  blockedBy,
  columnTasks,
  emptyProjectHub,
  hubProgress,
  liveTasks,
  mergeProjectHub,
  milestoneProgress,
  moveTask,
  parseProjectHub,
  projectActivity,
  projectTimeline,
  removeMilestone,
  removeTask,
  saveMilestone,
  saveProjectMeta,
  setDependency,
  updateTask,
  type ProjectHubState,
} from './projectHub'

const ok = (r: ProjectHubState | { error: string }) => {
  if ('error' in r) throw new Error(r.error)
  return r
}

function board() {
  let s = emptyProjectHub()
  s = ok(addTask(s, 'p', { title: 'Schema tekenen' }, 't1', 1))
  s = ok(addTask(s, 'p', { title: 'Printplaat solderen', priority: 'high' }, 't2', 2))
  s = ok(addTask(s, 'p', { title: 'Verslag schrijven', dueAt: 500 }, 't3', 3))
  s = ok(addTask(s, 'other', { title: 'Ander project' }, 'x', 4))
  return s
}

describe('Project Hub', () => {
  it('adds tasks to a column in order and moves them on the board', () => {
    let s = board()
    expect(columnTasks(s, 'p', 'todo').map((t) => t.id)).toEqual(['t1', 't2', 't3'])
    expect(addTask(s, 'p', { title: '  ' }, 'y', 5)).toEqual({ error: 'Geef de taak een titel.' })
    s = moveTask(s, 't3', 'doing', 10)
    s = moveTask(s, 't1', 'doing', 11, 0)
    expect(columnTasks(s, 'p', 'doing').map((t) => t.id)).toEqual(['t1', 't3'])
    s = moveTask(s, 't2', 'todo', 12, 0)
    expect(columnTasks(s, 'p', 'todo').map((t) => t.id)).toEqual(['t2'])
    s = moveTask(s, 't1', 'done', 13)
    expect(hubProgress(liveTasks(s, 'p'))).toEqual({ done: 1, total: 3, percent: 33 })
    expect(projectActivity(s, 'p')[0].text).toBe('Schema tekenen → Klaar')
  })

  it('tracks dependencies and refuses loops', () => {
    let s = board()
    s = ok(setDependency(s, 't2', 't1', true, 5))
    expect(blockedBy(s, s.tasks.find((t) => t.id === 't2')!).map((t) => t.id)).toEqual(['t1'])
    expect(setDependency(s, 't1', 't2', true, 6)).toEqual({ error: 'Dan wachten die taken op elkaar.' })
    s = ok(setDependency(s, 't3', 't2', true, 6))
    expect(setDependency(s, 't1', 't3', true, 7)).toEqual({ error: 'Dan wachten die taken op elkaar.' })
    s = moveTask(s, 't1', 'done', 8)
    expect(blockedBy(s, s.tasks.find((t) => t.id === 't2')!)).toEqual([])
    s = removeTask(s, 't2', 9)
    expect(s.tasks.find((t) => t.id === 't3')!.dependsOn).toEqual([])
  })

  it('groups tasks under milestones and puts everything on a timeline', () => {
    let s = board()
    s = ok(saveMilestone(s, { id: 'm1', projectId: 'p', title: 'Prototype', dueAt: 300 }, 5))
    s = updateTask(s, 't1', { milestoneId: 'm1' }, 6)
    s = updateTask(s, 't2', { milestoneId: 'm1', deadlineId: 'd1' }, 6)
    s = moveTask(s, 't1', 'done', 7)
    expect(milestoneProgress(s, s.milestones[0])).toEqual({ done: 1, total: 2, percent: 50 })
    const deadlines = [
      { id: 'd1', title: 'Solderen', dueAt: 200, doneAt: null, projectId: 'p', deletedAt: null },
      { id: 'd2', title: 'Inleveren', dueAt: 900, doneAt: null, projectId: 'p', deletedAt: null },
      { id: 'd3', title: 'Elders', dueAt: 100, doneAt: null, projectId: 'q', deletedAt: null },
    ]
    expect(projectTimeline(s, 'p', deadlines).map((e) => `${e.kind}:${e.title}`)).toEqual(['milestone:Prototype', 'task:Verslag schrijven', 'deadline:Inleveren'])
    s = removeMilestone(s, 'm1', 8)
    expect(liveTasks(s, 'p').every((t) => t.milestoneId === null)).toBe(true)
  })

  it('logs a status change and merges per entry', () => {
    const a = saveProjectMeta(board(), 'p', { status: 'done', description: 'Labo 3' }, 10)
    expect(projectActivity(a, 'p')[0].text).toBe('Status: Opgeleverd')
    const b = updateTask(board(), 't1', { title: 'Schema op papier' }, 20)
    const merged = mergeProjectHub(a, b)
    expect(merged.meta[0].status).toBe('done')
    expect(merged.tasks.find((t) => t.id === 't1')!.title).toBe('Schema op papier')
    expect(parseProjectHub(JSON.parse(JSON.stringify(merged)))).toEqual(merged)
    expect(parseProjectHub({ tasks: [{ id: 'z', title: 'Zonder project' }] }).tasks).toEqual([])
  })
})
