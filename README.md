# Source Control for Claude Code

A mod for Claude Code (desktop app and terminal) that makes Git as visible and as easy to drive as VS Code's Source Control. It is built for working on one repository from several machines: you see at a glance whether there is something to pull or push before the copies drift apart.

> [!NOTE]
> This is a fork of [manuel-will/cc-source-control](https://github.com/manuel-will/cc-source-control). It adds [base branches](#base-branches) with one-click merge or rebase, a [merge preview](#merge-preview) that shows conflicts before you press, [notes to Claude](#claude-is-told) about what you did in the band, and a band in the colors of a git statusline with more buttons.

**The band above the chat box**: always there, minimal. In the terminal it uses the colors of a git statusline:

```
⎇ feature (♣ wt) ✎ 3 ↑1 ↓2 ⇡ ⇣ [ ↻ Sync 2↓ 1↑ ] upstream/main↓5 ✗2 origin/main↓0 · ↻ 4 min ago   ◨
```

- `⎇ feature`: the current branch (or `abc1234 (detached)`).
- `(♣ wt)`: the worktree, shown only in a linked worktree (one made with `git worktree add`, Claude's included), not in the main checkout. It is the name of the worktree's folder, in magenta in the terminal. A narrow terminal hides it.
- `✎ 3`: changed files.
- `↑1 ↓2`: local commits not on the remote yet (**push**), and commits on the remote not here yet (**pull**). They always show: a zero is dim, and a branch without upstream shows `↑- ↓-`.
- `⇡` pushes, `⇣` pulls. Each shows when there is something to push or pull.
- `↻ Sync` (pull, then push) sits next to the counts while the branch is behind or ahead.
- `upstream/main↓5`: commits on a base branch that are not on this branch yet. Press the chip to take them in. See [Base branches](#base-branches).
- `✗2` or `⚠` on a chip, on `⇣` or on Sync: taking those commits in would not go cleanly. See [Merge preview](#merge-preview).
- `⇡ publish` (branch without upstream): press it to publish the branch (push with upstream).
- `↻ 4 min ago`: when the remote was last checked (fetched). Press it to fetch. It shows at full strength (not dim) when stale, `offline` or `never checked`. A green `✓` shows only when everything is clean, in sync and freshly checked.
- The **main button** on the right does what is due now, as VS Code's does. In the desktop app it is the app's own primary button, in the terminal VS Code's blue:

  | State | Button |
  |---|---|
  | behind or ahead of the remote | `↻ Sync` (pull, then push), next to the counts |
  | local changes only | `✓ Commit…` (opens the panel at the message field) |
  | conflict, or a merge/rebase in progress | `Resolve…` / `Finish…` (opens the panel) |

- `◨` opens or closes the **Source Control panel** beside the chat.

**The Source Control panel** (docked on the right; above the prompt in narrow terminals):

```
Source Control                          ↻ Fetch  ↓ Pull  ↑ Push
⎇ main → origin/main 1↓ 1↑ · checked just now
origin · github.com/zirkelc/claude-git
────────────────────────────────────────────────────────────────
Message (Enter to commit on “main”)
 ✓ Commit (all 1)  [ ↻ Sync 1↓ 1↑ ]
▾ CHANGES 1                                                + all
M app.js                                                     +
▾ HISTORY
○ Incoming Changes                                      1 commit
● PC: Readme                                     ⟨origin/main⟩
│ ○ Outgoing Changes                                    1 commit
│ ● Laptop: notes                                       ⟨main⟩
● ╯ Docs: section 3
▾ BRANCHES 3 · ▾ WORKTREES 2 · ▾ STASHES 1
```

- **Commit:** type a message and press Enter, or use the main button. With nothing staged, all changes are committed (smart commit, as in VS Code).
- **Stage and unstage** each file with `+` and `−`, or all at once.
- **History** as VS Code's graph draws it: incoming commits purple, outgoing blue, pills for `main` and `origin/main` in their lane's color. Merges and branches get lanes of their own that join where they forked. In the terminal it reads like `git log --graph`.
- **Branches** with ↓/↑, `local only` or `deleted on remote`. Also **worktrees** (Claude's included) with their changes, and **stashes**.
- **Conflicts** have a section of their own. Resolve a file and stage it with `+`. Or hand the work to Claude with **“Ask Claude to resolve”**; **“Abort merge”** restores the previous state.
- If a pull would overwrite local changes, the panel offers **“Pull with autostash”**.
- The info row lists every base branch with its ↓/↑, and the toolbar has a button to update from the first base with new commits.
- Under the info row, one line per merge that would not go cleanly, with the files (see [Merge preview](#merge-preview)).

## Base branches

On every branch the band shows how far each base branch is ahead. A base is a remote's default branch: `<remote>/HEAD`, else `<remote>/main`, else `<remote>/master`.

- **Normal clone** (only `origin`): one base, shown without its prefix, as a statusline does: `main↓5`.
- **Fork** (`upstream` and `origin`): one chip each, `upstream` first, both with their prefix so it is clear which side the commits are on: `upstream/main↓5 origin/main↓2`. A narrow terminal keeps only the `upstream` chip, the one a pull request targets. Other remotes get no chip.
- On the base branch itself the chip repeats the upstream count (`main↓0`), so the band reads the same on every branch.
- **Press a chip** with new commits to fetch that base and take them in: a merge by default (a fast-forward when possible), or a rebase (see Settings). A conflict goes to the usual Resolve and Finish flow. A rebase does not start over uncommitted changes.
- `/git update` updates from the first base, `/git update origin` from the base on that remote.
- The background fetch also fetches every base remote, so the counts stay right in a fork.
- After a rebase of a published branch, the next push needs `--force-with-lease`. The mod does not do that for you.

## Merge preview

Like GitHub's "This branch has conflicts", the band shows before you press whether taking in new commits would go cleanly:

- `✗2`: two files would conflict.
- `⚠`: local changes (untracked files included) would be overwritten, so git would refuse to start. Commit or stash them first.
- No mark: a clean merge, or a fast-forward.

The marks sit on each base chip, on `⇣` and on Sync (it pulls first). The panel lists the files:

```
✗ Taking in upstream/main would conflict in: src/app.ts, src/lib/x.ts
⚠ Taking in origin/main would overwrite local changes in: README.md. Commit or stash them first.
```

The merge is worked out in memory with `git merge-tree --write-tree`, which touches neither the working tree, the index nor `HEAD`. A fast-forward cannot conflict, so it skips that step. Each result is cached by its pair of commits, so the status poll runs it again only after a fetch or a commit moves one side. The marks only warn: the buttons still work. In rebase mode the mark is close but not exact, because a rebase applies the commits one by one. It needs git 2.38 or newer for `✗`; `⚠` works with any git.

## Claude is told

What you do in the band or the panel happens outside the conversation, so Claude would not know about it. After each such action the mod adds a short note that Claude reads with your next message. It starts no turn and you do not see it as a message:

```
[Source Control] The user ran "update from the base branch origin/main (merge)" from the git band, outside this conversation. It succeeded: Merge: 5 commits from origin/main
Now: branch feature at 2222222, HEAD moved from 1111111 to 2222222; 0 ahead and 0 behind origin/feature.
```

Notes go out for pull, push, sync, publish, update from base, commit, and finishing or aborting a merge or rebase, failures included (with the conflicting files). None for staging, for the background fetch, for a fetch that found nothing, or for `/git` commands, whose output Claude already sees. The setting **Tell Claude** turns it off.

## Installation

It needs Claude Code 2.1.287 or newer.

**From GitHub**, once on every machine, in Claude Code:

```
/plugin marketplace add zirkelc/claude-git
/plugin install git@claude-git
/reload-plugins
```

Or in a terminal:

```
claude plugin marketplace add zirkelc/claude-git
claude plugin install git@claude-git --scope user
```

With `--scope user` the mod is on in every project. When Claude Desktop asks where to install, pick user (all projects). If you also installed the original `source-control` plugin from `manuel-will/cc-source-control`, remove it first: both draw a band and register `/git`.

The mod is also in the [zirkelc/agent-plugins](https://github.com/zirkelc/agent-plugins) marketplace, as `git@zirkelc`. Install it from one marketplace only.

**From a local checkout**, to work on the mod or to run changes before they are pushed:

```
git clone https://github.com/zirkelc/claude-git.git
claude --plugin-dir ./claude-git/source-control
```

To load it in every session, the desktop app included, add the folder to `CLAUDE_CODE_PLUGIN_DIRS` in the `env` block of `~/.claude/settings.json` (several folders are separated by `:`):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/path/to/claude-git/source-control"
  }
}
```

A plugin loaded this way reads its settings from `pluginConfigs` under the key `git@inline`, or from `/config`. Saved changes reload in a running session; if not, restart it.

**Update** an install from GitHub after a push to this repository:

```
claude plugin marketplace update claude-git
claude plugin update git@claude-git
```

Then restart Claude Code. A local checkout updates with `git pull`.

**Troubleshooting:** if `/git` works in one folder only, the mod is installed only there: `bash scripts/install-user.sh` installs it for every project. If `/git` is still missing in some projects, `bash scripts/diagnose.sh` names the reason for each, such as `"disableAllHooks": true` in the project's settings (mods are made of hooks) or the plugin turned off there. A note such as “7 userConfig options not yet set” during installation is harmless: without values of your own the defaults apply (see Settings). If the mod does not show up right away, restart Claude Code or the desktop app. If another mod also draws a band above the prompt and does not pass the event on, this band does not show: `/git debug` then says `band: 0 draws`.

## Keyboard and commands

| What | How |
|---|---|
| Open the panel (focus in the message field) | `/git` or `◨` |
| Focus the band (terminal) | `ctrl+x tab`, then `Tab` between buttons, `Enter` presses |
| Back to the prompt | `Esc` |
| Close the panel | `◨`, `ctrl+x x`, or `/git` again while it has focus |
| Actions | `/git sync`, `/git pull`, `/git push`, `/git fetch`, `/git publish`, `/git update [remote]` (from a base branch) |
| Commit | `/git commit <message>` |
| Summary | `/git status` |

## Settings (`/config`)

| Option | Default | Meaning |
|---|---|---|
| Fetch interval (minutes) | 10 | background `git fetch`, so ↓ is right. 0 = off |
| Status poll (seconds) | 30 | local `git status` (no network). Claude's commands refresh at once |
| Stale after (hours) | 12 | when the last fetch is marked yellow |
| Language | `auto` | `auto` follows Claude Code's language; `en` or `de` sets it |
| Base branch | empty | the branch to compare with and update from, e.g. `main` or `upstream/develop`. Empty = automatic |
| Update from base | `merge` | `merge` merges the base into the current branch; `rebase` rebases the current branch onto it |
| Tell Claude | on | after an action from the band or the panel, add a short note that Claude reads with your next message |

## Good to know

- **Language:** English or German. With `auto`, Claude Code's `language` setting decides first (for example `"language": "german"` in `~/.claude/settings.json`), then the locale (`LC_ALL`, `LC_MESSAGES`, `LANG`), then the system's language. Any other language gets English. More languages are a catalog each in `source-control/hooks/i18n.ts`.
- **Background fetch:** when a session opens and every 10 minutes after, never asking for a password (`GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`, SSH in batch mode). If it fails, the band says `offline`. Several sessions in one repository do not fetch twice: the mod looks at `FETCH_HEAD`.
- **No lock conflicts:** every read runs with `--no-optional-locks`.
- **Only non-destructive actions:** no force push, no reset, no discarding of changes. Pull uses `--no-rebase` (a merge, as VS Code does) unless you configured `pull.rebase` yourself. Update from base rebases only if you set **Update from base** to `rebase`.
- **Repository hooks do not run** when you commit or push from the mod: Claude Code runs Git for mods with hooks turned off. If the repository has hooks (Husky, for example), the panel says so. If you need them, let Claude commit.
- **Credentials** in remote URLs are never shown.
- **Colors:** in the terminal the band uses the Tomorrow Night palette as hex values (`STATUSLINE_COLOR` in `source-control/hooks/ui/theme.ts`), the colors a git statusline gets in that theme. Claude Code accepts no reference to the terminal's own palette, so with another terminal theme change those values. The desktop app uses its theme's colors.
- **Buttons have one color:** a button label cannot mix colors, so the counts stay colored text and the small `⇡` and `⇣` next to them press. The base chips, `⇡ publish` and the fetch time are dim at rest and colored under the pointer.
- **Not possible:** anything in the desktop app's left project sidebar. That belongs to the app; mods cannot draw there. The band and the panel take its place.

## License

MIT, see [LICENSE](LICENSE).

## Development

```
claude-git/                       ← repository = marketplace
├─ .claude-plugin/marketplace.json
└─ source-control/                ← the mod (plugin name: git)
   ├─ .claude-plugin/plugin.json
   ├─ hooks/                      register.tsx, i18n.ts, git.ts, parse.ts, snapshot.ts, actions.ts, ui/
   ├─ types/index.d.ts            contract for $.state
   └─ tests/                      claude plugin test
```

- **Try it locally:** `claude --plugin-dir ./source-control`. Saved changes reload; if not, restart the session. For the desktop app set `CLAUDE_CODE_PLUGIN_DIRS` and `CLAUDE_CODE_PLUGIN_DIR_WATCH=1` in the `env` block of `~/.claude/settings.json`.
- **Playground with every state:** `scripts/playground.sh` sets up a throwaway repository under `~/sc-playground`, with a remote of its own and a second clone playing the other machine. Open `~/sc-playground/work` in Claude Code once and keep the session open. Then `scripts/playground.sh behind` (or `ahead`, `diverged`, `conflict`, `overwrite`, `dirty`, `unpublished`, `stale`, `unfetched`, `offline`, `worktrees`, `detached`, `many`, `merges`, `clean`) puts it in that state, and `scripts/playground.sh tour` runs through them all. The mod refreshes within 30 s, at once with `/git status`.
- **Checks:**
  ```
  claude plugin validate ./source-control
  claude plugin test ./source-control
  tsc -p source-control            # once the mod has been loaded
  ```
- `bash scripts/diagnose.sh` checks, for every project Claude Code knows, whether the mod can load there.
