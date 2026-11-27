// The Vercel functions in api/ run as plain Node ESM, which cannot load packages/core directly
// (its imports have no .js extensions). This bundles the part they use, packages/core/src/server.ts,
// into api/_core.js before the build; api/_core.d.ts gives it the same types. Not committed.
import { build } from 'rolldown'

await build({
  input: 'packages/core/src/server.ts',
  platform: 'node',
  output: { file: 'api/_core.js', format: 'esm' },
  logLevel: 'warn',
})
console.log('api/_core.js gebundeld')
