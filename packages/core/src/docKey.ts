/**
 * The user_settings key of a synced document that needs no SQL of its own: `doc.<name>`, allowed
 * by 20261126110000_settings_docs.sql (same pattern as the database check). New modules use this;
 * the older documents keep their own keys (goals, grades, ...).
 */
export const DOC_KEY_PATTERN = /^doc\.[a-z][a-z0-9-]{1,30}$/

/** The migration that allows doc.<name> keys, for startDocSync's setup message. */
export const SETTINGS_DOCS_MIGRATION = 'supabase/migrations/20261126110000_settings_docs.sql'

/** `doc.<name>`; throws for a name the database would refuse, so the mistake shows in tests. */
export function docKey(name: string): string {
  const key = `doc.${name}`
  if (!DOC_KEY_PATTERN.test(key)) throw new Error(`Ongeldige documentnaam: ${name}`)
  return key
}
