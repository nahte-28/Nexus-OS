import { describe, expect, it } from 'vitest'
import { GROUP_MIGRATION, groupError, suggestedName } from './group'

describe('studiegroep op Supabase', () => {
  it('asks for the SQL when the tables or functions are missing', () => {
    expect(groupError({ code: 'PGRST205', message: "Could not find the table 'public.study_groups'" })).toBe(`setup:${GROUP_MIGRATION}`)
    expect(groupError({ code: 'PGRST202', message: 'Could not find the function public.create_study_group' })).toBe(`setup:${GROUP_MIGRATION}`)
    expect(groupError({ message: 'group full' })).toMatch(/30 leden/)
  })

  it('suggests a name without the e-mail domain', () => {
    expect(suggestedName('ethan.de_smet@student.ap.be')).toBe('ethan de smet')
    expect(suggestedName(undefined)).toBe('')
  })
})
