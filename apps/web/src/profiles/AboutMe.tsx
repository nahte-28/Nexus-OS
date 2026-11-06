import { applyRole, LIFE_ROLE_LABELS, LIFE_ROLES, setAbout, type LifeRole } from '@nexus/core'
import { profilesStore, useProfiles } from './store'

const field = 'w-full min-w-0 rounded-md border border-nx-border bg-nx-surface px-2 py-1.5 outline-none'

const PLACE_LABEL: Record<LifeRole, string> = { student: 'Je school', work: 'Je werk', other: 'Wat je doet (mag leeg)' }

/** Over jou: your name, what you do and where. Studying keeps the School profile; working makes it Werk. */
export function AboutMe() {
  const { state } = useProfiles()
  const about = state.about
  const first = state.profiles.school.name
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 font-semibold">Over jou</legend>
      <label className="flex flex-col gap-1">
        Je naam
        <input className={field} value={about.name} maxLength={60} autoComplete="given-name" onChange={(e) => profilesStore.update((s) => setAbout(s, { name: e.target.value }))} placeholder="Hoe NEXUS je aanspreekt" />
      </label>
      <div role="radiogroup" aria-label="Wat doe je?" className="space-y-1">
        <p>Wat doe je?</p>
        <div className="flex flex-wrap gap-3">
          {LIFE_ROLES.map((r) => (
            <label key={r} className="flex items-center gap-1.5">
              <input type="radio" name="nexus-role" checked={about.role === r} onChange={() => profilesStore.update((s) => applyRole(s, r))} />
              {LIFE_ROLE_LABELS[r]}
            </label>
          ))}
        </div>
      </div>
      {about.role && (
        <label className="flex flex-col gap-1">
          {PLACE_LABEL[about.role]}
          <input className={field} value={about.place} maxLength={60} onChange={(e) => profilesStore.update((s) => setAbout(s, { place: e.target.value }))} placeholder={about.role === 'student' ? 'Bv. AP Hogeschool' : about.role === 'work' ? 'Bv. Bakkerij Peeters' : ''} />
        </label>
      )}
      <label className="flex flex-col gap-1">
        Verjaardag (mag leeg)
        <input type="date" className={`${field} w-auto`} value={about.birthday} onChange={(e) => profilesStore.update((s) => setAbout(s, { birthday: e.target.value }))} />
      </label>
      {about.role && (
        <p className="text-sm text-nx-muted">
          {about.role === 'student'
            ? `Je eerste profiel is ${first}, met je lessen, Studie en KlasHub.`
            : `Je eerste profiel heet nu ${first}: je afspraken, taken en notities, zonder schoolapps. Kies je later "Ik studeer", dan komen die terug.`}
        </p>
      )}
    </fieldset>
  )
}
