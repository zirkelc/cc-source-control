/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { ScSnapshot, ScView } from '../../types'
import { clean, cutEnd } from '../format'
import type { Handlers } from './handlers'
import {
  baseNameOf,
  branchTextOf,
  canUpdateFrom,
  previewMarkOf,
  changeCountOf,
  freshnessOf,
  isConfirmedSettled,
  operationTextOf,
  primaryOf,
} from './model'
import type { Primary } from './model'
import { t } from '../i18n'
import { glyphOf, icon } from './icons'
import type { IconName } from './icons'
import { COLOR, GLYPH, STATUSLINE_COLOR, THEMED_BAND_COLOR, VSCODE_BLUE } from './theme'
import type { Kit } from './theme'

/**
 * Below this many cells the band drops its words and the fetch age.
 */
export const NARROW_COLUMNS = 60

/**
 * The terminal draws its own `[-]` (collapse the band) over the band's last
 * cells; the band keeps them free.
 */
const ENGINE_MARK_COLUMNS = 4

/**
 * The main button. On the terminal VS Code's blue: a blue box holding a
 * plain Button, a glyph in front. Where the app draws native buttons
 * (desktop, editor, phone) the app's own primary button, so it sits among
 * the app's other buttons as one of them.
 *
 * @param kit the surface's elements
 * @param key the Button's address
 * @param iconName the glyph before the label on the terminal, or null
 * @param label what the button says
 * @param onPress what it does
 * @param isBusy drawn dim while an action runs
 * @param isWide on the terminal as wide as its row (the panel's, as VS Code's
 *   action button); the app's button keeps its own size
 */
export function primaryButton(
  kit: Kit,
  key: string,
  iconName: IconName | null,
  label: string,
  onPress: () => void,
  isBusy: boolean,
  isWide = false,
): RenderElement {
  const { Box, Button } = kit

  // the app's own button keeps the app's size, next to its neighbours
  if (kit.surface !== 'terminal') {
    return (
      <Box flexDirection="row">
        <Button key={key} variant="primary" dimColor={isBusy} onPress={onPress}>
          {label === '' ? ' ' : label}
        </Button>
      </Box>
    )
  }

  const shown = iconName !== null ? [glyphOf(iconName), label].filter(part => part !== '').join(' ') : label

  return (
    <Box
      flexDirection="row"
      alignItems="center"
      backgroundColor={VSCODE_BLUE}
      paddingX={1}
      {...(isWide ? { flexGrow: 1, justifyContent: 'center' as const } : {})}
    >
      <Button key={key} plain dimColor={isBusy} onPress={onPress}>
        {shown === '' ? ' ' : shown}
      </Button>
    </Box>
  )
}

/**
 * The status half of the band, in the order and colors of a git statusline:
 * branch with its worktree, changes, the counts against the upstream (a zero
 * dim) with a push and a pull button and the Sync button beside them, the
 * base branches' new commits as chips that take them in, then what is going
 * on and how fresh the remote side is.
 *
 * @param syncButton the main button when its job is a sync, drawn beside the
 *   counts it settles; null when the main button stays on the right
 */
function statusText(
  kit: Kit,
  snapshot: ScSnapshot,
  view: ScView,
  handlers: Handlers,
  staleAfterMs: number,
  syncButton: RenderElement | null,
): RenderElement {
  const { Box, Button, Text } = kit
  const isNarrow = kit.columns < NARROW_COLUMNS
  const isTerminal = kit.surface === 'terminal'
  const palette = isTerminal ? STATUSLINE_COLOR : THEMED_BAND_COLOR
  const changes = changeCountOf(snapshot)
  const operation = operationTextOf(snapshot)
  const freshness = isNarrow ? null : freshnessOf(snapshot, view, staleAfterMs)
  const isUnpublished = snapshot.upstream === null && snapshot.branch !== null && snapshot.remoteName !== null && !snapshot.isUnborn
  const branchRoom = Math.max(8, Math.floor(kit.columns / 3))
  const colorOf = (color: string | undefined) => (color === undefined ? {} : { color })

  // the desktop draws the pencil as an icon (the glyph is an emoji there),
  // so the line breaks into the text before it and the text after it
  const hasIcons = kit.Svg !== null
  const isBusy = view.busy !== null
  // a narrow band keeps the first base alone: in a fork the project's, which a PR targets
  const bases = isNarrow ? snapshot.bases.slice(0, 1) : snapshot.bases
  const hasUpstream = snapshot.upstream !== null && !snapshot.isUnborn
  const worktree = snapshot.isLinkedWorktree ? (snapshot.root.split(/[\\/]/).pop() ?? '') : ''

  // a zero still shows while there is an upstream, dim, so the counts keep their place
  const count = (glyph: string, n: number, color: string | undefined) => (
    <Text {...(n > 0 ? colorOf(color) : { dimColor: true })}>{` ${glyph}${n}`}</Text>
  )

  // a status word that does what it names: dim at rest, as the words beside
  // it, at full strength while it warns (a button keeps one color)
  const statusButton = (key: string, label: string, isWarning: boolean, onPress: () => void) => (
    <Box key={key} flexDirection="row">
      <Text color={COLOR.muted}>{' · '}</Text>
      <Button
        key={key}
        plain
        dimColor={!isWarning}
        hover={{ scope: key, underline: true }}
        onPress={() => {
          if (!isBusy) {
            onPress()
          }
        }}
      >
        {label}
      </Button>
    </Box>
  )

  // a button keeps one color, so the counts stay colored text and these glyphs press
  const remoteButton = (key: 'push' | 'pull', glyph: string) => (
    <Box marginLeft={1}>
      <Button
        key={key}
        plain
        dimColor
        hover={{ scope: key, ...colorOf(key === 'push' ? palette.ahead : palette.behind) }}
        onPress={() => {
          if (!isBusy) {
            handlers.act(key)
          }
        }}
      >
        {glyph}
      </Button>
    </Box>
  )

  return (
    <Box flexDirection="row" alignItems="center">
      {isTerminal ? <Text bold color={palette.glyph}>{`${GLYPH.branch} `}</Text> : icon(kit, 'branch', 'muted', COLOR.muted)}
      <Text wrap="truncate-end">
        <Text bold={!isTerminal} {...colorOf(palette.branch)}>
          {cutEnd(clean(branchTextOf(snapshot)), branchRoom)}
        </Text>
        {worktree !== '' && !isNarrow && (
          <Text {...colorOf(palette.worktree)}>{`(${GLYPH.worktree} ${cutEnd(clean(worktree), branchRoom)})`}</Text>
        )}
        {changes > 0 && !hasIcons && <Text {...colorOf(palette.changes)}>{` ${GLYPH.changes} ${changes}`}</Text>}
      </Text>
      {changes > 0 && hasIcons && (
        <Box flexDirection="row" alignItems="center" marginLeft={1}>
          {icon(kit, 'edit', 'muted')}
          <Text>{`${changes}`}</Text>
        </Box>
      )}
      {hasUpstream && (
        <Text>
          {count(GLYPH.ahead, snapshot.ahead, palette.ahead)}
          {count(GLYPH.behind, snapshot.behind, palette.behind)}
        </Text>
      )}
      {/* without an upstream (never pushed, detached) a placeholder keeps the layout */}
      {!hasUpstream && !snapshot.isUnborn && <Text dimColor>{` ${GLYPH.ahead}- ${GLYPH.behind}-`}</Text>}
      {hasUpstream && snapshot.ahead > 0 && remoteButton('push', GLYPH.push)}
      {hasUpstream && snapshot.behind > 0 && remoteButton('pull', `${GLYPH.pull}${previewMarkOf(snapshot.pullPreview)}`)}
      {syncButton !== null && <Box marginLeft={1}>{syncButton}</Box>}
      {bases.map(base => {
        const label = `${clean(baseNameOf(snapshot, base))}${GLYPH.behind}${base.behind}${previewMarkOf(base.preview)}`

        // a chip with new commits takes them in, when nothing is in the way
        if (canUpdateFrom(snapshot, base)) {
          return (
            <Box key={`base:${base.ref}`} marginLeft={1}>
              <Button
                key={`base:${base.ref}`}
                plain
                dimColor={isBusy}
                hover={{ scope: `base:${base.ref}`, ...colorOf(palette.behind), underline: true }}
                onPress={() => {
                  if (!isBusy) {
                    handlers.act('updateFromBase', { ref: base.ref })
                  }
                }}
              >
                {label}
              </Button>
            </Box>
          )
        }

        return (
          <Box key={`base:${base.ref}`} marginLeft={1}>
            <Text {...(base.behind > 0 ? colorOf(palette.behind) : { dimColor: true })}>{label}</Text>
          </Box>
        )
      })}
      <Text wrap="truncate-end">
        {isConfirmedSettled(snapshot, view, staleAfterMs) && <Text color={COLOR.ok}>{` ${GLYPH.clean}`}</Text>}
        {operation !== null && <Text color={COLOR.error}>{` · ${operation}`}</Text>}
      </Text>
      {/* the band's only publish: the main button leaves it to this word */}
      {isUnpublished && statusButton('status:publish', `${GLYPH.publish} ${t().publishWord}`, false, () => handlers.act('publish'))}
      {view.busy !== null && <Text color={COLOR.muted}>{` · ${view.busy}`}</Text>}
      {/* the fetch's age fetches again; a fetch under way is no button */}
      {view.busy === null && freshness !== null && view.isFetching && <Text color={COLOR.muted}>{` · ${freshness.text}`}</Text>}
      {view.busy === null &&
        freshness !== null &&
        !view.isFetching &&
        statusButton('status:fetch', `${GLYPH.sync} ${freshness.text}`, freshness.isWarning, () => handlers.act('fetch'))}
    </Box>
  )
}

/**
 * The band above the prompt: status on the left; the blue button for the
 * one thing to do now and the panel toggle on the right.
 *
 * @param kit the surface's elements and the band's width
 * @param snapshot the repository as last read
 * @param view the drawings' own state
 * @param handlers what the buttons do
 * @param staleAfterMs when the last fetch counts as old
 * @returns the band's tree
 */
export function bandView(
  kit: Kit,
  snapshot: ScSnapshot,
  view: ScView,
  handlers: Handlers,
  staleAfterMs: number,
): RenderElement {
  const { Box, Button } = kit
  const primary: Primary | null = primaryOf(snapshot)
  const isNarrow = kit.columns < NARROW_COLUMNS
  const isBusy = view.busy !== null

  // a sync pulls first, so it carries the pull's mark
  const syncMark = primary?.kind === 'sync' ? previewMarkOf(snapshot.pullPreview) : ''
  const primaryLabel = primary === null ? '' : `${isNarrow ? primary.short : primary.label}${syncMark}`
  const busyLabel = view.busy ?? ''

  const main =
    primary === null
      ? null
      : primaryButton(kit, 'primary', isBusy ? null : primary.icon, isBusy ? busyLabel : primaryLabel, () => {
          if (!isBusy) {
            handlers.primary(primary.kind)
          }
        }, isBusy)

  // a sync settles the counts, so it sits beside them; a publish is the
  // status word `publish`; the other jobs stay on the right
  const isSyncBesideCounts = primary?.kind === 'sync'
  const isPublish = primary?.kind === 'publish'

  return (
    <Box flexDirection="row" width="100%" paddingRight={kit.surface === 'terminal' ? ENGINE_MARK_COLUMNS : 0}>
      <Box flexShrink={1}>{statusText(kit, snapshot, view, handlers, staleAfterMs, isSyncBesideCounts ? main : null)}</Box>
      <Box flexGrow={1} />
      {main !== null && !isSyncBesideCounts && !isPublish && <Box marginLeft={1}>{main}</Box>}
      <Box marginLeft={1}>
        <Button key="panel" plain dimColor={!view.isPaneOpen} onPress={() => handlers.togglePane()}>
          {GLYPH.panel}
        </Button>
      </Box>
    </Box>
  )
}
