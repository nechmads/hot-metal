import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../src/bl')
function modules(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? modules(path) : path.endsWith('.ts') ? [path] : []
  })
}
describe('business-layer dependency boundary', () => {
  it.each(modules(root))('keeps %s independent of transport and runtime plumbing', (path) => {
    const source = readFileSync(path, 'utf8')
    const imports = Array.from(source.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g), (match) => match[1])
    for (const dependency of imports) {
      expect(dependency).not.toMatch(/^(hono|agents|cloudflare:|@modelcontextprotocol\/|@hotmetal\/data-layer)/)
      expect(dependency).not.toMatch(/(?:^|\/)(server|api|agents-api|http|infrastructure)(?:\/|$)/)
    }
    // Ignore prose and validation messages; inspect runtime/type identifiers only.
    const code = source.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
    expect(code).not.toMatch(/\b(Request|Response|D1Database|ExecutionContext|Env)\b/)
  })
})
