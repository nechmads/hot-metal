import { describe, expect, it } from 'vitest'
import { bulkIdeaAction } from '../src/bl/content'
import { fixture, mcp, owner } from './content-fixtures'

describe('bulk idea authorization', () => {
  it('limits delegated all-publication scope to the live grant', async () => {
    const { deps } = fixture()
    await bulkIdeaAction(mcp, { action: 'delete' }, deps)
    expect(deps.ideas.deleteByPublications).toHaveBeenCalledExactlyOnceWith(['pub'])
  })
  it('rejects explicitly requested publications outside the grant', async () => {
    const { deps } = fixture()
    await expect(bulkIdeaAction(mcp, { action: 'delete', publicationId: 'other' }, deps)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(deps.ideas.deleteByPublications).not.toHaveBeenCalled()
  })
  it('requires write permission before any mutation', async () => {
    const { deps, connection } = fixture()
    connection.actions = ['read']
    await expect(bulkIdeaAction(mcp, { action: 'delete' }, deps)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(deps.ideas.deleteByPublications).not.toHaveBeenCalled()
  })
  it('ignores a client-supplied user identity', async () => {
    const { deps } = fixture()
    await bulkIdeaAction(owner, { action: 'dismiss', userId: 'foreign' }, deps)
    expect(deps.publications.listByUser).toHaveBeenCalledWith('owner')
    expect(deps.ideas.dismissByPublications).toHaveBeenCalledExactlyOnceWith(['pub', 'other'])
  })
})
