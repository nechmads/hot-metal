import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dismissIdeasByPublications, deleteIdeasByPublications } from '../../../services/data-layer/src/domains/ideas'
import { createSqliteD1 } from './helpers/sqlite-d1'

const migrations = resolve(import.meta.dirname, '../../../services/data-layer/migrations')

describe('bulk idea persistence', () => {
  let f: ReturnType<typeof createSqliteD1>
  beforeEach(() => {
    f = createSqliteD1()
    for (const file of readdirSync(migrations).filter((file) => file.endsWith('.sql')).sort()) {
      f.sql.exec(readFileSync(resolve(migrations, file), 'utf8'))
    }
    f.sql.exec(`
      INSERT INTO users(id,email,name) VALUES ('owner','owner@example.test','Owner');
      INSERT INTO publications(id,user_id,name,slug) VALUES
        ('pub','owner','Publication','publication'), ('other','owner','Other','other');
      INSERT INTO ideas(id,publication_id,title,angle,summary,status) VALUES
        ('new','pub','New','Angle','Summary','new'),
        ('reviewed','pub','Reviewed','Angle','Summary','reviewed'),
        ('promoted','pub','Promoted','Angle','Summary','promoted'),
        ('dismissed','pub','Dismissed','Angle','Summary','dismissed'),
        ('other-idea','other','Other idea','Angle','Summary','new');
      INSERT INTO sessions(id,user_id,publication_id,idea_id,title) VALUES
        ('writing','owner','pub','promoted','Keep draft'),
        ('moved','owner','other','new','Moved draft'),
        ('detached','owner',NULL,'reviewed','Detached draft'),
        ('unrelated','owner','other','other-idea','Other draft');
      UPDATE ideas SET session_id = 'writing' WHERE id = 'promoted';
    `)
  })
  afterEach(() => f.sql.close())

  it('dismisses new and reviewed ideas only within the selected publication', async () => {
    expect(await dismissIdeasByPublications(f.db, ['pub'])).toBe(2)
    expect(f.sql.prepare('SELECT id, status FROM ideas ORDER BY id').all()).toEqual([
      { id: 'dismissed', status: 'dismissed' },
      { id: 'new', status: 'dismissed' },
      { id: 'other-idea', status: 'new' },
      { id: 'promoted', status: 'promoted' },
      { id: 'reviewed', status: 'dismissed' },
    ])
    expect(await dismissIdeasByPublications(f.db, ['pub'])).toBe(0)
  })
  it('deletes all statuses while preserving sessions and other publications', async () => {
    expect(await deleteIdeasByPublications(f.db, ['pub'])).toBe(4)
    expect(f.sql.prepare('SELECT id FROM ideas').all()).toEqual([{ id: 'other-idea' }])
    expect(f.sql.prepare('SELECT id, publication_id, idea_id, title FROM sessions ORDER BY id').all()).toEqual([
      { id: 'detached', publication_id: null, idea_id: null, title: 'Detached draft' },
      { id: 'moved', publication_id: 'other', idea_id: null, title: 'Moved draft' },
      { id: 'unrelated', publication_id: 'other', idea_id: 'other-idea', title: 'Other draft' },
      { id: 'writing', publication_id: 'pub', idea_id: null, title: 'Keep draft' },
    ])
    expect(f.sql.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(await deleteIdeasByPublications(f.db, ['pub'])).toBe(0)
  })
  it('handles all publications in one operation', async () => {
    expect(await dismissIdeasByPublications(f.db, ['pub', 'other'])).toBe(3)
    expect(await deleteIdeasByPublications(f.db, ['pub', 'other'])).toBe(5)
    expect(f.sql.prepare('SELECT * FROM ideas').all()).toEqual([])
  })
  it('an empty scope never mutates data', async () => {
    expect(await dismissIdeasByPublications(f.db, [])).toBe(0)
    expect(await deleteIdeasByPublications(f.db, [])).toBe(0)
    expect(f.sql.prepare('SELECT count(*) AS count FROM ideas').get()).toEqual({ count: 5 })
  })
  it('rolls back session detachment and all deletions if any deletion fails', async () => {
    f.sql.exec(`CREATE TRIGGER block_delete BEFORE DELETE ON ideas WHEN OLD.id = 'other-idea' BEGIN SELECT RAISE(ABORT, 'blocked'); END;`)
    await expect(deleteIdeasByPublications(f.db, ['pub', 'other'])).rejects.toThrow()
    expect(f.sql.prepare("SELECT idea_id FROM sessions WHERE id = 'writing'").get()).toEqual({ idea_id: 'promoted' })
    expect(f.sql.prepare('SELECT count(*) AS count FROM ideas').get()).toEqual({ count: 5 })
  })
})
