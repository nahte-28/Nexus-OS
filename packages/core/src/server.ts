/** What the Vercel functions in api/ use from core; bundled into api/_core.js (scripts/bundle-api-core.mjs). */
export { handleMcp, MCP_PROTOCOL_VERSIONS, type JsonRpcResponse, type McpData } from './mcp'
export { toLifeItem, type LifeItem } from './life'
export { toNote, type Note } from './notes'
export { parseProfilesState } from './profiles'
