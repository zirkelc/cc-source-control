import type { ScSnapshot } from '../types'
import type { ActionArg, ActionName, ActionOutcome } from './actions'

/**
 * Each action the agent hears about, in words; the ones it does not (stage,
 * unstage) are absent. Always English: the model reads these, not the person.
 */
const ACTION_WORDS: Readonly<Partial<Record<ActionName, string>>> = {
  fetch: 'fetch',
  pull: 'pull',
  pullAutostash: 'pull with autostash',
  push: 'push',
  sync: 'sync (pull, then push)',
  publish: 'publish the branch (push with upstream)',
  updateFromBase: 'update from the base branch',
  commit: 'commit',
  continueOperation: 'finish the operation in progress',
  abortOperation: 'abort the operation in progress',
}

/**
 * Whether a fetch brought anything: new commits on the upstream or a base.
 */
function hasNewCommits(before: ScSnapshot, after: ScSnapshot): boolean {
  const baseBehind = (snapshot: ScSnapshot) => snapshot.bases.map(base => `${base.ref}:${base.behind}`).join(',')

  return after.behind !== before.behind || baseBehind(after) !== baseBehind(before)
}

/**
 * What the agent is told after the person ran a git action from the band or
 * the panel, which it would otherwise never see: the action, how it ended,
 * and the repository afterwards. Null for what is not worth a row: staging,
 * and a fetch that worked and brought nothing.
 *
 * @param name the action
 * @param arg what it worked on (the base for an update)
 * @param outcome how it ended, in the person's words
 * @param before the repository as read before the action
 * @param after the repository as read after it, or null when unread
 */
export function noteOf(
  name: ActionName,
  arg: ActionArg,
  outcome: ActionOutcome,
  before: ScSnapshot,
  after: ScSnapshot | null,
): string | null {
  const words = ACTION_WORDS[name]

  if (words === undefined) {
    return null
  }

  if (name === 'fetch' && outcome.ok && (after === null || !hasNewCommits(before, after))) {
    return null
  }

  const base = name === 'updateFromBase' ? (before.bases.find(one => one.ref === arg.ref) ?? before.bases[0]) : undefined
  const action = base === undefined ? words : `${words} ${base.ref} (${base.mode})`
  const result = outcome.ok ? 'It succeeded' : 'It failed'
  const lines = [`[Source Control] The user ran "${action}" from the git band, outside this conversation. ${result}: ${outcome.text}`]

  if (after !== null) {
    const branch = after.branch ?? 'detached HEAD'
    const moved = before.head !== after.head && after.head !== null ? `, HEAD moved from ${before.head ?? 'none'} to ${after.head}` : ''
    const upstream = after.upstream === null ? 'no upstream' : `${after.ahead} ahead and ${after.behind} behind ${after.upstream}`

    lines.push(`Now: branch ${branch} at ${after.head ?? 'no commit'}${moved}; ${upstream}.`)

    if (after.conflicts.length > 0) {
      lines.push(`Conflicts in: ${after.conflicts.map(file => file.path).join(', ')}.`)
    }

    if (after.operation !== null) {
      lines.push(`A ${after.operation} is in progress.`)
    }
  }

  return lines.join('\n')
}
