import { DatabaseSync } from 'node:sqlite'

/** D1's prepared-statement subset over real SQLite, with atomic synchronous batches. */
export function createSqliteD1(schema?: string) {
  const sql = new DatabaseSync(':memory:')
  sql.exec('PRAGMA foreign_keys=ON')
  if (schema) sql.exec(schema)
  const db = {
    withSession: () => db,
    prepare: (query: string) => {
      let values: unknown[] = []
      const statement = {
        bind: (...input: unknown[]) => {
          values = input
          return statement
        },
        first: async () => sql.prepare(query).get(...(values as [])) ?? null,
        all: async () => ({
          results: sql.prepare(query).all(...(values as [])),
        }),
        _run: () => ({
          success: true,
          meta: {
            changes: Number(sql.prepare(query).run(...(values as [])).changes),
          },
        }),
        run: async () => statement._run(),
      }
      return statement
    },
    batch: async (statements: { _run: () => unknown }[]) => {
      sql.exec('BEGIN')
      try {
        const results = statements.map((statement) => statement._run())
        sql.exec('COMMIT')
        return results
      } catch (error) {
        sql.exec('ROLLBACK')
        throw error
      }
    },
  }
  return { db: db as unknown as D1Database, sql }
}
