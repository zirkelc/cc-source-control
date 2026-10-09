import { describe, expect, test } from 'claude-code/testing'

import { parseMergeTree } from '../hooks/parse'
import { BAND_PROPS, inRepository, NOW, REPOSITORY, started } from './fixtures'
import type { Script } from './fixtures'

const PLUGIN = 'source-control'
const HEAD = '2222222222222222222222222222222222222222'
const MAIN = '3333333333333333333333333333333333333333'

/**
 * /work on `feature`, one commit ahead of origin/feature; `changes` adds
 * porcelain lines for local changes.
 */
const featureStatus = (changes: readonly string[] = []) =>
  [`# branch.oid ${HEAD}`, '# branch.head feature', '# branch.upstream origin/feature', '# branch.ab +1 -0', ...changes, ''].join('\0')

/**
 * A feature branch three commits ahead of origin/main and five behind it,
 * with the remote refs and their commits.
 */
const repository = (merge: { exitCode: number; stdout: string }, diff = 'app.ts\n', changes: readonly string[] = []): Script => ({
  ...REPOSITORY,
  'status --porcelain=v2': { stdout: featureStatus(changes) },
  'for-each-ref --format=%(refname)': {
    stdout: [
      `refs/remotes/origin/HEAD\x1frefs/remotes/origin/main\x1f${MAIN}`,
      `refs/remotes/origin/main\x1f\x1f${MAIN}`,
      `refs/remotes/origin/feature\x1f\x1f${HEAD}`,
      '',
    ].join('\n'),
  },
  'rev-list --left-right --count HEAD...origin/main': { stdout: '3\t5\n' },
  'merge-tree --write-tree': merge,
  [`diff --name-only ${HEAD}...${MAIN}`]: { stdout: diff },
})

const FRESH_FETCH = new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]])

describe('merge preview parsing', () => {
  test('merge-tree reads clean, conflicting and unknown', () => {
    // Act
    const clean = parseMergeTree('abc\n', 0)
    const conflicting = parseMergeTree('abc\napp.ts\nlib/x.ts\n', 1)
    const unknown = parseMergeTree('', 129)

    // Assert
    expect(clean).toEqual([])
    expect(conflicting).toEqual(['app.ts', 'lib/x.ts'])
    expect(unknown).toBe(null)
  })
})

describe('merge preview', () => {
  test('a base whose merge would conflict carries the count of files on its chip', async ($, on) => {
    // Arrange
    const world = inRepository(on, repository({ exitCode: 1, stdout: 'tree\napp.ts\n' }), FRESH_FETCH)

    await started($, world)

    // Act
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

    // Assert
    expect((await ui.find({ type: 'Button', key: 'base:origin/main' }))?.text).toBe('main↓5 ✗1')
  })

  test('a clean merge has no mark', async ($, on) => {
    // Arrange
    const world = inRepository(on, repository({ exitCode: 0, stdout: 'tree\n' }), FRESH_FETCH)

    await started($, world)

    // Act
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

    // Assert
    expect((await ui.find({ type: 'Button', key: 'base:origin/main' }))?.text).toBe('main↓5')
  })

  test('a local change the merge would overwrite is marked', async ($, on) => {
    // Arrange
    const changes = ['1 .M N... 100644 100644 100644 aaaa bbbb app.ts']
    const world = inRepository(on, repository({ exitCode: 0, stdout: 'tree\n' }, 'app.ts\n', changes), FRESH_FETCH)

    await started($, world)

    // Act
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

    // Assert
    expect((await ui.find({ type: 'Button', key: 'base:origin/main' }))?.text).toBe('main↓5 ⚠')
  })

  test('the same pair of commits is merged in memory once', async ($, on) => {
    // Arrange
    const world = inRepository(on, repository({ exitCode: 1, stdout: 'tree\napp.ts\n' }), FRESH_FETCH)

    await started($, world)

    // Act
    await world.clock.advance(31_000)

    // Assert
    const merges = world.runs.filter(run => run.line.startsWith('merge-tree'))

    expect(merges.length).toBe(1)
  })
})
