import { describe, expect, test } from 'claude-code/testing'

import { BAND_PROPS, inRepository, NOW, REPOSITORY } from './fixtures'
import type { Script, World } from './fixtures'

const PLUGIN = 'git'
const HEAD = '2222222222222222222222222222222222222222'
const MAIN = '3333333333333333333333333333333333333333'
const ENGLISH = { LANG: 'en_US.UTF-8' }
const CLAUDE = { options: { resolveConflicts: 'claude' } }
const CONFLICT = 'u UU N... 100644 100644 100644 100644 aaaa bbbb cccc app.ts'

const featureStatus = (records: readonly string[] = []) =>
  [`# branch.oid ${HEAD}`, '# branch.head feature', '# branch.upstream origin/feature', '# branch.ab +1 -0', ...records, ''].join('\0')

/**
 * A feature branch five commits behind origin/main, whose merge stops on a
 * conflict in app.ts: git marks the merge and the status lists the file.
 */
function conflictingRepository(files: Map<string, number>): Script {
  const script: Script = {
    ...REPOSITORY,
    'status --porcelain=v2': { stdout: featureStatus() },
    'for-each-ref --format=%(refname)': {
      stdout: [
        `refs/remotes/origin/HEAD\x1frefs/remotes/origin/main\x1f${MAIN}`,
        `refs/remotes/origin/main\x1f\x1f${MAIN}`,
        `refs/remotes/origin/feature\x1f\x1f${HEAD}`,
        '',
      ].join('\n'),
    },
    'rev-list --left-right --count HEAD...origin/main': { stdout: '1\t5\n' },
    'merge-tree --write-tree': { exitCode: 1, stdout: 'tree\napp.ts\n' },
    [`diff --name-only ${HEAD}...${MAIN}`]: { stdout: 'app.ts\n' },
    'fetch origin main': {},
    'merge --no-edit origin/main': () => {
      script['status --porcelain=v2'] = { stdout: featureStatus([CONFLICT]) }
      files.set('/work/.git/MERGE_HEAD', NOW)

      return { exitCode: 1, stdout: 'CONFLICT (content): Merge conflict in app.ts\n' }
    },
  }

  return script
}

async function startedIn($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<Parameters<typeof test>[1]>[1]): Promise<World> {
  const files = new Map([['/work/.git/FETCH_HEAD', NOW - 60_000]])
  const world = inRepository(on, conflictingRepository(files), files, ENGLISH)

  on('turn.start', ($, e) => ({ turnId: e.turnId }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await world.clock.advance(100)

  return world
}

describe('resolving conflicts with Claude', () => {
  test('the buttons that take in commits carry ✦', CLAUDE, async ($, on) => {
    // Arrange
    await startedIn($, on)

    // Act
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

    // Assert
    expect((await ui.find({ type: 'Button', key: 'base:origin/main' }))?.text).toBe('main↓5 ✗1 ✦')
  })

  test('without the setting there is no ✦', async ($, on) => {
    // Arrange
    await startedIn($, on)

    // Act
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

    // Assert
    expect((await ui.find({ type: 'Button', key: 'base:origin/main' }))?.text).toBe('main↓5 ✗1')
  })

  test('a merge that stops on conflicts asks Claude to resolve them', CLAUDE, async ($, on) => {
    // Arrange
    const world = await startedIn($, on)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

    // Act
    await ui.press({ key: 'base:origin/main' })
    await world.clock.advance(100)

    // Assert
    expect(world.runs.some(run => run.line === 'merge --no-edit origin/main')).toBe(true)
    expect(world.prompts.length).toBe(1)
    expect(world.prompts[0]).toContain('(merge) in: app.ts')
  })

  test('without the setting a merge that stops on conflicts asks nothing', async ($, on) => {
    // Arrange
    const world = await startedIn($, on)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

    // Act
    await ui.press({ key: 'base:origin/main' })
    await world.clock.advance(100)

    // Assert
    expect(world.runs.some(run => run.line === 'merge --no-edit origin/main')).toBe(true)
    expect(world.prompts.length).toBe(0)
  })

  test('during a turn the merge goes to Claude and the files stay as they are', CLAUDE, async ($, on) => {
    // Arrange
    const world = await startedIn($, on)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'AbovePrompt', props: BAND_PROPS })

    await $.turn.start({ text: 'refactor the parser', turnId: 'turn-1' })

    // Act
    await ui.press({ key: 'base:origin/main' })
    await world.clock.advance(100)

    // Assert
    expect(world.runs.some(run => run.line.startsWith('merge --no-edit'))).toBe(false)
    expect(world.prompts.length).toBe(1)
    expect(world.prompts[0]).toContain('Please fetch `origin` and merge `origin/main` into the current branch.')
  })
})
