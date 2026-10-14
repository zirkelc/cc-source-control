import type { ElementTable, RenderSurface } from 'claude-code'

/**
 * VS Code's button blue (#0078D4): the one color not taken from the theme,
 * because it is the point of the primary button.
 */
export const VSCODE_BLUE = 'rgb(0,120,212)'

/**
 * Theme keys, so light and dark themes both read right (the /diff mod's
 * palette): blue for local and outgoing, purple for the remote side.
 */
export const COLOR = {
  local: 'suggestion',
  remote: 'merged',
  behind: 'warning',
  ahead: 'suggestion',
  ok: 'success',
  warn: 'warning',
  error: 'error',
  muted: 'inactive',
  added: 'diffAddedWord',
  removed: 'diffRemovedWord',
  badgeText: 'inverseText',
} as const

/**
 * The band's colors in the terminal, as a git statusline prints them: the
 * glyph blue, the branch red, changes and incoming commits yellow, outgoing
 * green, a worktree magenta. A statusline's escape codes get the terminal's
 * own soft palette, while a color name here is drawn as a fixed bright color
 * (and the terminal's palette cannot be named), so these are the palette's
 * values as hex: Tomorrow Night's. The other surfaces keep the theme keys,
 * which read right in light and dark themes alike.
 */
export const STATUSLINE_COLOR = {
  glyph: '#81a2be',
  branch: '#cc6666',
  changes: '#f0c674',
  ahead: '#b5bd68',
  behind: '#f0c674',
  worktree: '#b294bb',
} as const

/**
 * The band's colors on the desktop, the editor and the phone.
 */
export const THEMED_BAND_COLOR: Readonly<Record<keyof typeof STATUSLINE_COLOR, string | undefined>> = {
  glyph: COLOR.muted,
  branch: undefined,
  changes: undefined,
  ahead: COLOR.ahead,
  behind: COLOR.behind,
  worktree: COLOR.remote,
}

/**
 * Single-width glyphs only: emoji shift the terminal's columns.
 */
export const GLYPH = {
  branch: '⎇',
  worktree: '♣',
  wouldConflict: '✗',
  wouldOverwrite: '⚠',
  behind: '↓',
  ahead: '↑',
  sync: '↻',
  publish: '⇡',
  push: '⇡',
  pull: '⇣',
  claude: '✦',
  changes: '✎',
  clean: '✓',
  commit: '✓',
  panel: '◨',
  open: '▾',
  closed: '▸',
  node: '●',
  virtual: '○',
  rule: '─',
  stage: '+',
  unstage: '−',
} as const

/**
 * The status letters in VS Code's colors.
 */
export const LETTER_COLOR: Readonly<Record<string, string>> = {
  M: 'warning',
  A: 'success',
  U: 'success',
  R: 'success',
  D: 'error',
  C: 'error',
}

/**
 * The elements every drawing uses, from the surface's table; `Input` where
 * the surface has one (not the mobile app).
 */
export type Kit = {
  Box: ElementTable['Box']
  Text: ElementTable['Text']
  Button: ElementTable['Button']
  Input: ElementTable<'terminal'>['Input'] | null
  Svg: ElementTable<'desktop'>['Svg'] | null
  Link: ElementTable['Link'] | null
  surface: RenderSurface
  columns: number
}

/**
 * The kit for one drawing.
 *
 * @param table what `$.ui.resolve(e)` returned
 * @param surface `e.surface`
 * @param columns the cells the drawing has across
 */
export function kitOf(table: ElementTable, surface: RenderSurface, columns: number): Kit {
  // every table is completed to all names (a missing element draws a
  // fragment), so the surface, not the table, says what is really drawn
  const Input = surface !== 'mobile' && 'Input' in table ? table.Input : null
  const Svg = surface !== 'terminal' && 'Svg' in table ? table.Svg : null

  return { Box: table.Box, Text: table.Text, Button: table.Button, Input, Svg, Link: table.Link, surface, columns }
}
