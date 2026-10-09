import { describe, expect, test } from 'claude-code/testing'

import { noteOf } from '../hooks/notes'
import type { ScSnapshot } from '../types'
import { NOW } from './fixtures'

const SNAPSHOT: ScSnapshot = {
  root: '/work',
  gitDir: '/work/.git',
  commonDir: '/work/.git',
  isLinkedWorktree: false,
  branch: 'feature',
  head: '1111111',
  isUnborn: false,
  upstream: 'origin/feature',
  remoteName: 'origin',
  ahead: 0,
  behind: 0,
  bases: [{ ref: 'origin/main', remote: 'origin', branch: 'main', ahead: 1, behind: 5, mode: 'merge', preview: null }],
  pullPreview: null,
  staged: [],
  unstaged: [],
  conflicts: [],
  stashCount: 0,
  operation: null,
  fetchedAt: NOW,
  readAt: NOW,
  details: null,
}

describe('notes', () => {
  test('an update from base names the base, the outcome and the new HEAD', () => {
    // Arrange
    const after: ScSnapshot = { ...SNAPSHOT, head: '2222222', bases: [{ ...SNAPSHOT.bases[0]!, behind: 0 }] }

    // Act
    const note = noteOf('updateFromBase', { ref: 'origin/main' }, { ok: true, text: 'Merge: 5 commits from origin/main' }, SNAPSHOT, after)

    // Assert
    expect(note).toBe(
      '[Source Control] The user ran "update from the base branch origin/main (merge)" from the git band, outside this conversation. It succeeded: Merge: 5 commits from origin/main\n' +
        'Now: branch feature at 2222222, HEAD moved from 1111111 to 2222222; 0 ahead and 0 behind origin/feature.',
    )
  })

  test('a failed merge lists the conflicts and the operation in progress', () => {
    // Arrange
    const after: ScSnapshot = { ...SNAPSHOT, operation: 'merge', conflicts: [{ path: 'app.ts', from: null, letter: 'C' }] }

    // Act
    const note = noteOf('updateFromBase', {}, { ok: false, text: 'Merge conflict' }, SNAPSHOT, after)

    // Assert
    expect(note?.split('\n').slice(2)).toEqual(['Conflicts in: app.ts.', 'A merge is in progress.'])
  })

  test('staging and a fetch that brought nothing are not told', () => {
    // Act
    const staged = noteOf('stage', { paths: ['a'] }, { ok: true, text: '' }, SNAPSHOT, SNAPSHOT)
    const fetched = noteOf('fetch', {}, { ok: true, text: 'nothing new' }, SNAPSHOT, SNAPSHOT)

    // Assert
    expect(staged).toBe(null)
    expect(fetched).toBe(null)
  })
})
