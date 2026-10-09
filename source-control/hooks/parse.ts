import type {
  ScBranch,
  ScCommit,
  ScFile,
  ScStash,
  ScWorktree,
} from '../types'

/**
 * What `git status --porcelain=v2 --branch --show-stash -z` says.
 */
export type StatusReading = {
  oid: string | null
  isUnborn: boolean
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  stashCount: number
  staged: ScFile[]
  unstaged: ScFile[]
  conflicts: ScFile[]
}

/**
 * The repository's three directories as `git rev-parse` names them.
 */
export type RepoPaths = {
  root: string
  gitDir: string
  commonDir: string
}

const STAGE_LETTERS: Readonly<Record<string, ScFile['letter']>> = {
  M: 'M',
  T: 'M',
  A: 'A',
  D: 'D',
  R: 'R',
  C: 'A',
}

/**
 * Splits `text` at its first `count - 1` spaces, the last field keeping the
 * rest (a path may hold spaces).
 */
function fieldsOf(text: string, count: number): string[] {
  const fields: string[] = []
  let rest = text

  while (fields.length < count - 1) {
    const at = rest.indexOf(' ')

    if (at < 0) {
      break
    }

    fields.push(rest.slice(0, at))
    rest = rest.slice(at + 1)
  }

  fields.push(rest)

  return fields
}

function fileOf(path: string, from: string | null, letter: ScFile['letter']): ScFile {
  return { path, from, letter }
}

/**
 * Reads `git status --porcelain=v2 --branch --show-stash -z`: the branch
 * headers, then one record per changed path, NUL-terminated, a rename's
 * original path in the record after it.
 *
 * @param out git's standard output
 * @returns the branch, its upstream and counts, and the files by list
 */
export function parseStatus(out: string): StatusReading {
  const reading: StatusReading = {
    oid: null,
    isUnborn: false,
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    stashCount: 0,
    staged: [],
    unstaged: [],
    conflicts: [],
  }

  const records = out.split('\0')

  for (let at = 0; at < records.length; at += 1) {
    const record = records[at] ?? ''

    if (record === '') {
      continue
    }

    if (record.startsWith('# ')) {
      const [name = '', ...rest] = record.slice(2).split(' ')
      const value = rest.join(' ')

      if (name === 'branch.oid') {
        reading.isUnborn = value === '(initial)'
        reading.oid = reading.isUnborn ? null : value
      } else if (name === 'branch.head') {
        reading.branch = value === '(detached)' ? null : value
      } else if (name === 'branch.upstream') {
        reading.upstream = value
      } else if (name === 'branch.ab') {
        const counts = /^\+(\d+) -(\d+)$/.exec(value)

        reading.ahead = Number(counts?.[1] ?? 0)
        reading.behind = Number(counts?.[2] ?? 0)
      } else if (name === 'stash') {
        reading.stashCount = Number(value) || 0
      }

      continue
    }

    const kind = record[0]

    if (kind === '1' || kind === '2') {
      const fields = fieldsOf(record, kind === '1' ? 9 : 10)
      const xy = fields[1] ?? '..'
      const path = fields[fields.length - 1] ?? ''
      const from = kind === '2' ? (records[at + 1] ?? null) : null

      if (kind === '2') {
        at += 1
      }

      const staged = STAGE_LETTERS[xy[0] ?? '.']
      const unstaged = STAGE_LETTERS[xy[1] ?? '.']

      if (staged) {
        reading.staged.push(fileOf(path, from, staged))
      }

      if (unstaged) {
        reading.unstaged.push(fileOf(path, staged === 'R' ? null : from, unstaged === 'R' ? 'M' : unstaged))
      }
    } else if (kind === 'u') {
      const fields = fieldsOf(record, 11)

      reading.conflicts.push(fileOf(fields[10] ?? '', null, 'C'))
    } else if (kind === '?') {
      reading.unstaged.push(fileOf(record.slice(2), null, 'U'))
    }
  }

  return reading
}

/**
 * Reads `git rev-parse --path-format=absolute --show-toplevel --git-dir
 * --git-common-dir`: three absolute paths, or null for anything else (a git
 * too old for `--path-format` echoes the flag back).
 */
export function parseRepoPaths(out: string): RepoPaths | null {
  const lines = out.split(/\r?\n/).filter(line => line !== '')
  const isAbsolute = (path: string) => /^(\/|[A-Za-z]:[\\/]|\\\\)/.test(path)

  if (lines.length !== 3 || !lines.every(isAbsolute)) {
    return null
  }

  const [root = '', gitDir = '', commonDir = ''] = lines

  return { root, gitDir, commonDir }
}

/**
 * The format `parseLog` reads: hash, short hash, commit time, decorations
 * (full ref names), subject; fields split by US, records by RS.
 */
export const LOG_FORMAT = '--format=%H%x1f%h%x1f%ct%x1f%P%x1f%D%x1f%s%x1e'

/**
 * Reads `git log --decorate=full` in LOG_FORMAT: one commit per record, its
 * decorations sorted into local branches, remote branches and tags.
 *
 * @param out git's standard output
 * @param side which side of the upstream these commits are on
 * @returns the commits, newest first
 */
export function parseLog(out: string, side: ScCommit['side']): ScCommit[] {
  return out
    .split('\x1e')
    .map(record => record.replace(/^\s+/, ''))
    .filter(record => record !== '')
    .map(record => {
      const [hash = '', short = '', time = '0', parents = '', refs = '', ...subject] = record.split('\x1f')
      const commit: ScCommit = {
        hash,
        short,
        parents: parents.split(' ').filter(parent => parent !== ''),
        subject: subject.join('\x1f'),
        when: Number(time) * 1000,
        side,
        heads: [],
        remotes: [],
        tags: [],
        isHead: false,
      }

      for (const part of refs.split(', ').filter(ref => ref !== '')) {
        if (part === 'HEAD') {
          commit.isHead = true
        } else if (part.startsWith('HEAD -> ')) {
          commit.isHead = true
          commit.heads.push(part.slice('HEAD -> refs/heads/'.length))
        } else if (part.startsWith('tag: refs/tags/')) {
          commit.tags.push(part.slice('tag: refs/tags/'.length))
        } else if (part.startsWith('refs/heads/')) {
          commit.heads.push(part.slice('refs/heads/'.length))
        } else if (part.startsWith('refs/remotes/') && !part.endsWith('/HEAD')) {
          commit.remotes.push(part.slice('refs/remotes/'.length))
        }
      }

      return commit
    })
}

/**
 * The format `parseBranches` reads, one branch per line.
 */
export const BRANCH_FORMAT =
  '--format=%(HEAD)%1f%(refname:short)%1f%(upstream:short)%1f%(upstream:track,nobracket)'

/**
 * Reads `git for-each-ref refs/heads` in BRANCH_FORMAT.
 */
export function parseBranches(out: string): ScBranch[] {
  return out
    .split(/\r?\n/)
    .filter(line => line.includes('\x1f'))
    .map(line => {
      const [head = '', name = '', upstream = '', track = ''] = line.split('\x1f')

      return {
        name,
        upstream: upstream === '' ? null : upstream,
        ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
        behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
        isGone: track === 'gone',
        isCurrent: head === '*',
      }
    })
}

/**
 * Reads `git worktree list --porcelain`: blocks split by a blank line, the
 * main worktree first.
 *
 * @param out git's standard output
 * @param current the session's worktree root, to mark it
 */
export function parseWorktrees(out: string, current: string): ScWorktree[] {
  const samePath = (a: string, b: string) => a.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === b.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

  return out
    .split(/\r?\n\r?\n/)
    .map(block => block.split(/\r?\n/).filter(line => line !== ''))
    .filter(lines => lines[0]?.startsWith('worktree ') === true)
    .filter(lines => !lines.includes('bare'))
    .map((lines, index) => {
      const value = (name: string) => lines.find(line => line === name || line.startsWith(`${name} `))
      const path = (value('worktree') ?? '').slice('worktree '.length)
      const branch = value('branch')?.slice('branch refs/heads/'.length) ?? null

      return {
        path,
        branch,
        head: (value('HEAD') ?? '').slice('HEAD '.length, 'HEAD '.length + 7),
        isCurrent: samePath(path, current),
        isMain: index === 0,
        isPrunable: value('prunable') !== undefined,
        isLocked: value('locked') !== undefined,
        dirty: null,
      }
    })
}

/**
 * Reads `git stash list --format=%gd%x1f%s`.
 */
export function parseStashes(out: string): ScStash[] {
  return out
    .split(/\r?\n/)
    .filter(line => line.includes('\x1f'))
    .map(line => {
      const [ref = '', ...subject] = line.split('\x1f')

      return { ref, subject: subject.join(' ') }
    })
}

/**
 * Counts the changed paths `git status --porcelain` lists, one per line.
 */
export function countLines(out: string): number {
  return out.split(/\r?\n/).filter(line => line.trim() !== '').length
}

/**
 * The remote-tracking refs and the branch each remote's HEAD points at, as
 * `git for-each-ref refs/remotes` lists them in REMOTE_REF_FORMAT.
 */
export const REMOTE_REF_FORMAT = '--format=%(refname)%1f%(symref)%1f%(objectname)'

const REMOTES_PREFIX = 'refs/remotes/'

/**
 * Reads `git for-each-ref refs/remotes` in REMOTE_REF_FORMAT: the branch
 * refs (`origin/main`) with the commit each points at, and each remote's
 * HEAD (`origin/HEAD` → `origin/main`).
 */
export function parseRemoteRefs(out: string): { refs: Set<string>; heads: Map<string, string>; shas: Map<string, string> } {
  const refs = new Set<string>()
  const heads = new Map<string, string>()
  const shas = new Map<string, string>()

  for (const line of out.split(/\r?\n/)) {
    const [full = '', target = '', sha = ''] = line.split('\x1f')

    if (!full.startsWith(REMOTES_PREFIX)) {
      continue
    }

    const name = full.slice(REMOTES_PREFIX.length)

    if (name.endsWith('/HEAD')) {
      if (target.startsWith(REMOTES_PREFIX)) {
        heads.set(name.slice(0, -'/HEAD'.length), target.slice(REMOTES_PREFIX.length))
      }

      continue
    }

    refs.add(name)

    if (sha !== '') {
      shas.set(name, sha)
    }
  }

  return { refs, heads, shas }
}

/**
 * The remotes in the order a base branch is looked for: `upstream` first
 * (in a fork it is the project the work goes back into), then `origin`,
 * then the rest as git lists them.
 */
export function baseRemotesOf(remotes: readonly string[]): string[] {
  const preferred = ['upstream', 'origin'].filter(name => remotes.includes(name))

  return [...preferred, ...remotes.filter(name => !preferred.includes(name))]
}

const DEFAULT_BRANCHES = ['main', 'master']

/**
 * The base branch among the remote-tracking refs. A configured name wins:
 * a full ref (`origin/develop`) as it is, a bare one (`develop`) on the first
 * remote that has it. Otherwise each remote in turn offers its HEAD, then
 * `main`, then `master`.
 *
 * @param remoteRefs what parseRemoteRefs read
 * @param remotes the remotes, as `git remote` lists them
 * @param configured the configured base branch, empty for automatic
 * @returns the ref and the remote and branch it names, or null when none
 *   fits (a configured name no remote has is not swapped for another)
 */
export function pickBase(
  remoteRefs: { refs: ReadonlySet<string>; heads: ReadonlyMap<string, string> },
  remotes: readonly string[],
  configured: string,
): { ref: string; remote: string; branch: string } | null {
  const order = baseRemotesOf(remotes)
  const wanted = configured.trim()

  const split = (ref: string) => {
    const remote = order
      .filter(name => ref.startsWith(`${name}/`))
      .sort((a, b) => b.length - a.length)[0]

    return remote === undefined ? null : { ref, remote, branch: ref.slice(remote.length + 1) }
  }

  if (wanted !== '') {
    if (remoteRefs.refs.has(wanted)) {
      return split(wanted)
    }

    const found = order.map(remote => `${remote}/${wanted}`).find(ref => remoteRefs.refs.has(ref))

    return found === undefined ? null : split(found)
  }

  for (const remote of order) {
    const head = remoteRefs.heads.get(remote)
    const candidates = [...(head === undefined ? [] : [head]), ...DEFAULT_BRANCHES.map(branch => `${remote}/${branch}`)]
    const found = candidates.find(ref => remoteRefs.refs.has(ref))

    if (found !== undefined) {
      return split(found)
    }
  }

  return null
}

/**
 * Reads `git rev-list --left-right --count HEAD...<base>`: commits only on
 * HEAD (ahead), then only on the base (behind).
 */
export function parseLeftRight(out: string): { ahead: number; behind: number } | null {
  const match = /^(\d+)\s+(\d+)/.exec(out.trim())

  return match ? { ahead: Number(match[1]), behind: Number(match[2]) } : null
}

/**
 * The remotes that get a base branch of their own: `upstream` and `origin`
 * where they exist (a fork has both), else the first remote.
 */
export function baseRemoteSetOf(remotes: readonly string[]): string[] {
  const named = baseRemotesOf(remotes).filter(name => name === 'upstream' || name === 'origin')

  return named.length > 0 ? named : remotes.slice(0, 1)
}

/**
 * One base branch per base remote, in order: in a fork the project's
 * (`upstream/main`) and the fork's own (`origin/main`). A configured full ref
 * (`origin/develop`) is the one base; a bare name (`develop`) is looked for
 * on each base remote; otherwise each remote offers its HEAD, then `main`,
 * then `master`.
 *
 * @param remoteRefs what parseRemoteRefs read
 * @param remotes the remotes, as `git remote` lists them
 * @param configured the configured base branch, empty for automatic
 */
export function pickBases(
  remoteRefs: { refs: ReadonlySet<string>; heads: ReadonlyMap<string, string> },
  remotes: readonly string[],
  configured: string,
): { ref: string; remote: string; branch: string }[] {
  const wanted = configured.trim()

  if (wanted !== '' && remoteRefs.refs.has(wanted)) {
    const full = pickBase(remoteRefs, remotes, wanted)

    return full === null ? [] : [full]
  }

  return baseRemoteSetOf(remotes)
    .map(remote => pickBase(remoteRefs, [remote], wanted))
    .filter((base): base is { ref: string; remote: string; branch: string } => base !== null)
}

/**
 * Reads `git merge-tree --write-tree --name-only --no-messages`: exit 0 is
 * a clean merge, exit 1 lists the conflicting files after the tree's id;
 * anything else (a git before 2.38 knows no `--write-tree`) says nothing.
 *
 * @returns the conflicting files, empty for a clean merge, null when unknown
 */
export function parseMergeTree(out: string, exitCode: number): string[] | null {
  if (exitCode === 0) {
    return []
  }

  if (exitCode !== 1) {
    return null
  }

  const [, ...files] = out.split(/\r?\n/).filter(line => line !== '')

  return files
}
