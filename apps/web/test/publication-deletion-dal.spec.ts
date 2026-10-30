import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deletePublication } from '../../../services/data-layer/src/domains/publications'
import { createSqliteD1 } from './helpers/sqlite-d1'

const migrations = resolve(import.meta.dirname, '../../../services/data-layer/migrations')

describe('publication deletion', () => {
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
      INSERT INTO topics(id,publication_id,name) VALUES ('topic','pub','Topic');
      INSERT INTO ideas(id,publication_id,topic_id,title,angle,summary) VALUES
        ('idea','pub','topic','Idea','Angle','Summary'),
        ('other-idea','other',NULL,'Other idea','Angle','Summary');
      INSERT INTO sessions(id,user_id,publication_id,idea_id,title) VALUES
        ('promoted','owner','pub','idea','Keep my draft'),
        ('manual','owner','pub',NULL,'Manual draft'),
        ('detached','owner',NULL,'idea','Previously detached'),
        ('moved','owner','other','idea','Moved draft'),
        ('unrelated','owner','other','other-idea','Unrelated draft');
      UPDATE ideas SET session_id = 'promoted' WHERE id = 'idea';
    `)
  })
  afterEach(() => f.sql.close())

  it('removes the publication and its topics/ideas while preserving writing sessions', async () => {
    await deletePublication(f.db, 'pub')
    expect(f.sql.prepare("SELECT id FROM publications ORDER BY id").all()).toEqual([{ id: 'other' }])
    expect(f.sql.prepare('SELECT * FROM topics').all()).toEqual([])
    expect(f.sql.prepare('SELECT id FROM ideas').all()).toEqual([{ id: 'other-idea' }])
    expect(f.sql.prepare('SELECT id, publication_id, idea_id, title FROM sessions ORDER BY id').all()).toEqual([
      { id: 'detached', publication_id: null, idea_id: null, title: 'Previously detached' },
      { id: 'manual', publication_id: null, idea_id: null, title: 'Manual draft' },
      { id: 'moved', publication_id: 'other', idea_id: null, title: 'Moved draft' },
      { id: 'promoted', publication_id: null, idea_id: null, title: 'Keep my draft' },
      { id: 'unrelated', publication_id: 'other', idea_id: 'other-idea', title: 'Unrelated draft' },
    ])
    expect(f.sql.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('rolls back session changes when publication deletion fails', async () => {
    f.sql.exec(`CREATE TRIGGER block_delete BEFORE DELETE ON publications BEGIN SELECT RAISE(ABORT, 'blocked'); END;`)
    await expect(deletePublication(f.db, 'pub')).rejects.toThrow()
    expect(f.sql.prepare("SELECT publication_id, idea_id FROM sessions WHERE id = 'promoted'").get()).toEqual({
      publication_id: 'pub', idea_id: 'idea',
    })
    expect(f.sql.prepare("SELECT id FROM publications WHERE id = 'pub'").get()).toEqual({ id: 'pub' })
  })
})
