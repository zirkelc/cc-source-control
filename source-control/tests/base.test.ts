import { describe, expect, test } from 'claude-code/testing'

import { parseLeftRight, parseRemoteRefs, pickBase } from '../hooks/parse'
import { BAND_PROPS, gitCommand, inRepository, NOW, REPOSITORY, started } from './fixtures'
import type { Script } from './fixtures'

const PLUGIN = 'git'

/**
 * `git for-each-ref refs/remotes` in a fork: origin (the fork) and upstream
 * (the project), each with its HEAD.
 */
const FORK_REFS = [
  'refs/remotes/origin/HEAD\x1frefs/remotes/origin/main',
  'refs/remotes/origin/main\x1f',
  'refs/remotes/origin/feature\x1f',
  'refs/remotes/upstream/HEAD\x1frefs/remotes/upstream/main',
  'refs/remotes/upstream/main\x1f',
  'refs/remotes/upstream/develop\x1f',
  '',
].join('\n')

/**
 * /work on `feature`, tracking origin/feature, one commit ahead of it.
 */
const FEATURE_STATUS = [
  '# branch.oid 2222222222222222222222222222222222222222',
  '# branch.head feature',
  '# branch.upstream origin/feature',
  '# branch.ab +1 -0',
  '',
].join('\0')

const ORIGIN_REFS = [
  'refs/remotes/origin/HEAD\x1frefs/remotes/origin/main',
  'refs/remotes/origin/main\x1f',
  'refs/remotes/origin/feature\x1f',
  '',
].join('\n')

/**
 * A feature branch three commits ahead of origin/main and five behind it.
 */
const featureRepository = (): Script => ({
  ...REPOSITORY,
  'status --porcelain=v2': { stdout: FEATURE_STATUS },
  'for-each-ref --format=%(refname)': { stdout: ORIGIN_REFS },
  'rev-list --left-right --count HEAD...origin/main': { stdout: '3\t5\n' },
  'fetch origin main': {},
})

const FRESH_FETCH = new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]])

describe('base branch parsing', () => {
  test('remote refs are read with each remote HEAD', () => {
    // Act
    const read = parseRemoteRefs(FORK_REFS)

    // Assert
    expect([...read.refs]).toEqual(['origin/main', 'origin/feature', 'upstream/main', 'upstream/develop'])
    expect([...read.heads]).toEqual([
      ['origin', 'origin/main'],
      ['upstream', 'upstream/main'],
    ])
  })

  test('the upstream remote wins over origin', () => {
    // Arrange
    const read = parseRemoteRefs(FORK_REFS)

    // Act
    const base = pickBase(read, ['origin', 'upstream'], '')

    // Assert
    expect(base).toEqual({ ref: 'upstream/main', remote: 'upstream', branch: 'main' })
  })

  test('a remote without HEAD falls back to main, then master', () => {
    // Arrange
    const read = parseRemoteRefs(['refs/remotes/origin/master\x1f', 'refs/remotes/origin/x\x1f'].join('\n'))

    // Act
    const base = pickBase(read, ['origin'], '')

    // Assert
    expect(base).toEqual({ ref: 'origin/master', remote: 'origin', branch: 'master' })
  })

  test('a configured name wins, bare or as a full ref', () => {
    // Arrange
    const read = parseRemoteRefs(FORK_REFS)

    // Act
    const bare = pickBase(read, ['origin', 'upstream'], 'develop')
    const full = pickBase(read, ['origin', 'upstream'], 'origin/feature')
    const missing = pickBase(read, ['origin', 'upstream'], 'release')

    // Assert
    expect(bare).toEqual({ ref: 'upstream/develop', remote: 'upstream', branch: 'develop' })
    expect(full).toEqual({ ref: 'origin/feature', remote: 'origin', branch: 'feature' })
    expect(missing).toBe(null)
  })

  test('left-right counts read ahead, then behind', () => {
    // Act
    const counts = parseLeftRight('3\t5\n')

    // Assert
    expect(counts).toEqual({ ahead: 3, behind: 5 })
    expect(parseLeftRight('')).toBe(null)
  })
})

describe('base branch', () => {
  test('the band shows how far the base is ahead and a merge button', async ($, on) => {
    // Arrange
    const world = inRepository(on, featureRepository(), FRESH_FETCH)

    await started($, world)

    // Act
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

    // Assert
    expect((await ui.find({ type: 'Text', text: /origin\/main/ }))?.text).toContain('origin/main 5↓')
    expect((await ui.find({ type: 'Button', key: 'base' }))?.text).toBe('↓ main mergen')
  })

  test('the merge button fetches the base and merges it', async ($, on) => {
    // Arrange
    const script: Script = {
      ...featureRepository(),
      'merge --no-edit origin/main': () => {
        script['rev-list --left-right --count HEAD...origin/main'] = { stdout: '9\t0\n' }

        return {}
      },
    }
    const world = inRepository(on, script, FRESH_FETCH)

    await started($, world)

    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

    // Act
    await ui.press({ key: 'base' })
    await world.clock.advance(100)

    // Assert
    const lines = world.runs.map(run => run.line)
    const fetchAt = lines.indexOf('fetch origin main')
    const mergeAt = lines.indexOf('merge --no-edit origin/main')

    expect(fetchAt >= 0 && mergeAt > fetchAt).toBe(true)
    expect(world.toasts.at(-1)).toBe('Merge: 5 Commits von origin/main')
    expect(await ui.find({ type: 'Button', key: 'base' })).toBeUndefined()
  })

  test('the rebase mode rebases onto the base', { options: { baseUpdateMode: 'rebase' } }, async ($, on) => {
    // Arrange
    const world = inRepository(on, { ...featureRepository(), 'rebase origin/main': {} }, FRESH_FETCH)

    await started($, world)

    // Act
    const { text } = await $.command.run(gitCommand('update'))

    // Assert
    expect(world.runs.some(run => run.line === 'rebase origin/main')).toBe(true)
    expect(world.runs.some(run => run.line.startsWith('merge'))).toBe(false)
    expect(text).toBe('Rebase auf origin/main: 5 Commits übernommen')
  })

  test('a rebase does not start over uncommitted changes', { options: { baseUpdateMode: 'rebase' } }, async ($, on) => {
    // Arrange
    const dirty = FEATURE_STATUS.replace('# branch.ab +1 -0\0', '# branch.ab +1 -0\x001 .M N... 100644 100644 100644 aaaa bbbb app.js\0')
    const world = inRepository(on, { ...featureRepository(), 'status --porcelain=v2': { stdout: dirty } }, FRESH_FETCH)

    await started($, world)

    // Act
    const { text } = await $.command.run(gitCommand('update'))

    // Assert
    expect(text).toBe('Vor dem Rebase Änderungen committen oder stashen.')
    expect(world.runs.some(run => run.line.startsWith('fetch origin main'))).toBe(false)
  })

  test('on the base branch itself no base is shown', async ($, on) => {
    // Arrange
    const world = inRepository(on, { ...REPOSITORY, 'for-each-ref --format=%(refname)': { stdout: ORIGIN_REFS } }, FRESH_FETCH)

    await started($, world)

    // Act
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

    // Assert
    expect(await ui.find({ type: 'Button', key: 'base' })).toBeUndefined()
    expect(world.runs.some(run => run.line.startsWith('rev-list --left-right'))).toBe(false)
  })

  test('in a fork the fetch also fetches the upstream remote', async ($, on) => {
    // Arrange
    const world = inRepository(on, {
      ...featureRepository(),
      remote: { stdout: 'origin\nupstream\n' },
      'for-each-ref --format=%(refname)': { stdout: FORK_REFS },
      'rev-list --left-right --count HEAD...upstream/main': { stdout: '1\t2\n' },
      'fetch --prune upstream': {},
    })

    // Act
    await started($, world)

    // Assert
    const lines = world.runs.map(run => run.line)

    expect(lines.includes('fetch --prune origin')).toBe(true)
    expect(lines.includes('fetch --prune upstream')).toBe(true)
  })
})
