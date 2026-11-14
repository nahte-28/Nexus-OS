import { afterEach, describe, expect, it } from 'vitest'
import { aiHeaders, cleanOwnKey, keyHint, OWN_KEY_HEADER, removeOwnKey, saveOwnKey, setOwnKeyVault, type OwnKeyVault } from './ownKey'

function memoryVault() {
  let value: Parameters<OwnKeyVault['save']>[0] | undefined
  const vault: OwnKeyVault = {
    load: async () => value,
    save: async (v) => void (value = v),
    clear: async () => void (value = undefined),
  }
  return { vault, stored: () => value }
}

const KEY = 'sk-ant-api03-' + 'x'.repeat(30) + 'a1b2'

describe('eigen AI-sleutel', () => {
  afterEach(() => setOwnKeyVault(memoryVault().vault))

  it('herkent alleen een Anthropic-sleutel', () => {
    expect(cleanOwnKey(`  ${KEY} `)).toBe(KEY)
    expect(cleanOwnKey('sk-proj-123')).toBeNull()
    expect(keyHint(KEY)).toBe('sk-ant-…a1b2')
  })

  it('bewaart de sleutel versleuteld en stuurt hem mee met een vraag', async () => {
    const m = memoryVault()
    setOwnKeyVault(m.vault)
    expect(await aiHeaders('tok')).toEqual({ 'content-type': 'application/json', authorization: 'Bearer tok' })
    await saveOwnKey(KEY)
    const sealed = m.stored()!
    expect(sealed.hint).toBe('sk-ant-…a1b2')
    expect(sealed.wrap.extractable).toBe(false)
    expect(new TextDecoder().decode(sealed.data)).not.toContain('sk-ant')
    expect((await aiHeaders('tok'))[OWN_KEY_HEADER]).toBe(KEY)
    await removeOwnKey()
    expect(OWN_KEY_HEADER in (await aiHeaders('tok'))).toBe(false)
  })

  it('weigert iets wat geen sleutel is', async () => {
    await expect(saveOwnKey('mijn wachtwoord')).rejects.toThrow(/sk-ant-/)
  })
})
