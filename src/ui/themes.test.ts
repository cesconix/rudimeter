import { describe, expect, it } from 'bun:test'
import { memoryStore } from '../audio/storage'
import { loadTheme, parseTheme, saveTheme, THEME_KEY, THEMES } from './themes'

const ROLES = ['--bg', '--text', '--sub', '--sub-alt', '--main', '--caret', '--error'] as const
type Role = (typeof ROLES)[number]
interface Block {
  scheme: string
  tokens: Record<string, string>
}

const css = (await Bun.file(new URL('./themes.css', import.meta.url)).text()).replace(/\/\*[\s\S]*?\*\//g, '')
const MEDIA = /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\) \{([^}]*)\}\s*\}/

function parseBody(body: string): Block {
  const tokens: Record<string, string> = {}
  for (const [, name, value] of body.matchAll(/(--[a-z-]+):\s*([^;]+);/g)) tokens[name] = value.trim()
  return { scheme: body.match(/color-scheme:\s*([a-z]+);/)?.[1] ?? '', tokens }
}

// Every top-level block by the ids its selector names, and whether `:root` is among them.
const blocks = new Map<string, Block[]>()
let rootIds: string[] = []
for (const [, selector, body] of css.replace(MEDIA, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
  const ids = [...selector.matchAll(/\[data-theme="([a-z0-9-]+)"\]/g)].map((m) => m[1])
  for (const id of ids) blocks.set(id, [...(blocks.get(id) ?? []), parseBody(body)])
  if (selector.split(',').some((s) => s.trim() === ':root')) rootIds = ids
}
const media = css.match(MEDIA)
const palette = (id: string): Block => (blocks.get(id) ?? [])[0]

/** WCAG 2 contrast ratio of two #rrggbb colours: 1 (the same) to 21 (black on white). */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('themes.css', () => {
  it('has one block per theme of THEMES, and none other', () => {
    expect([...blocks.keys()].sort()).toEqual(THEMES.map((t) => t.id).sort())
    for (const [id, found] of blocks) expect({ id, blocks: found.length }).toEqual({ id, blocks: 1 })
  })

  it.each(THEMES.map((t) => [t.id, t] as const))('%s sets the seven roles and its colour scheme', (id, theme) => {
    const { scheme, tokens } = palette(id)
    expect(scheme).toBe(theme.scheme)
    expect(Object.keys(tokens).sort()).toEqual([...ROLES].sort())
    for (const role of ROLES) expect(tokens[role]).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is Rudimeter Light with no theme stamped, Rudimeter Dark when the device is dark', () => {
    expect(rootIds).toEqual(['rudimeter-light'])
    expect(media).not.toBeNull()
    expect(parseBody(media?.[1] ?? '')).toEqual(palette('rudimeter-dark'))
  })
})

// The score's roles: the notes and the letters are `--text` (currentColor), the staff lines and the
// labels `--sub`, the cursor and the highlight `--caret`; a primary button's label is `--bg` on `--main`.
describe('contrast rule', () => {
  it.each(THEMES.map((t) => [t.id] as const))('%s', (id) => {
    const t = palette(id).tokens as Record<Role, string>
    const on = (role: Role) => contrast(t[role], t['--bg'])
    // WCAG AA for body text: the notes and the sticking letters.
    expect(on('--text')).toBeGreaterThanOrEqual(4.5)
    // WCAG's floor for graphics: the staff lines, and the bar numbers beside them.
    expect(on('--sub')).toBeGreaterThanOrEqual(3)
    // The lines are a guide under the notes: never as loud as them.
    expect(on('--sub')).toBeLessThan(on('--text'))
    for (const role of ['--main', '--caret', '--error'] as const) expect(on(role)).toBeGreaterThanOrEqual(3)
  })
})

describe('the saved theme', () => {
  it('parses a known id, and anything else as System', () => {
    expect(parseTheme('dracula')).toBe('dracula')
    expect(parseTheme(null)).toBe('system')
    expect(parseTheme('')).toBe('system')
    expect(parseTheme('monokai')).toBe('system')
    expect(parseTheme('system')).toBe('system')
  })

  it('keeps a theme under its own key, and System as no key at all', () => {
    const store = memoryStore()
    saveTheme(store, 'nord')
    expect(store.getItem(THEME_KEY)).toBe('nord')
    expect(loadTheme(store)).toBe('nord')
    saveTheme(store, 'system')
    expect(store.getItem(THEME_KEY)).toBeNull()
    expect(loadTheme(store)).toBe('system')
  })

  it('falls back to System when the storage throws, and does not throw saving', () => {
    const broken = {
      getItem: () => {
        throw new Error('private')
      },
      setItem: () => {
        throw new Error('private')
      },
      removeItem: () => {
        throw new Error('private')
      },
    }
    expect(loadTheme(broken)).toBe('system')
    expect(() => saveTheme(broken, 'nord')).not.toThrow()
  })

  // The inline script stamps the theme before the bundle loads: it cannot import THEME_KEY.
  it('is read by index.html before the first paint, under the same key', async () => {
    const html = await Bun.file(new URL('../../index.html', import.meta.url)).text()
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain(`localStorage.getItem('${THEME_KEY}')`)
    expect(head).toContain('document.documentElement.dataset.theme')
  })
})
