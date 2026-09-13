// NDJSON is the interchange format now, not the storage: `export` writes it, `import` reads it, the four
// fixtures in `.remote/` are it. Byte for byte: a line goes into the store exactly as it sits in the file.
import { writeFile } from 'node:fs/promises'
import type { NumberedLine } from '../../api/_lib/store'

export interface ParsedLine {
  raw: string
  fields: Record<string, unknown>
}

/** Throws at the first malformed line, with its number: an import is whole or nothing. Blank lines are skipped. */
export function parseNdjson(text: string): ParsedLine[] {
  const out: ParsedLine[] = []
  let n = 0
  for (const raw of text.split('\n')) {
    n++
    if (!raw.trim()) continue
    let fields: unknown
    try {
      fields = JSON.parse(raw)
    } catch (err) {
      throw new Error(`line ${n}: malformed JSON: ${(err as Error).message}`)
    }
    if (typeof fields !== 'object' || fields === null || Array.isArray(fields))
      throw new Error(`line ${n}: not a JSON object`)
    out.push({ raw, fields: fields as Record<string, unknown> })
  }
  return out
}

/** `receivedAt` as the server stamped it; `at` for lines that never went through a server; '' otherwise. */
export const receivedAtOf = (f: Record<string, unknown>): string =>
  typeof f.receivedAt === 'string' ? f.receivedAt : typeof f.at === 'string' ? f.at : ''

/** Rows for `appendNumbered`, each with its own `seq`. Throws where the file's numbering does not climb strictly. */
export function numbered(lines: ParsedLine[]): NumberedLine[] {
  let prev = 0
  return lines.map((l, i) => {
    const seq = l.fields.seq
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq <= prev)
      throw new Error(`line ${i + 1}: seq ${String(seq)} does not climb from ${prev} (pass --renumber)`)
    prev = seq
    return { seq, receivedAt: receivedAtOf(l.fields), line: l.raw }
  })
}

/** Rows renumbered from `from + 1`: the inner `seq` is rewritten, every other field (`receivedAt` included) is kept. */
export function renumbered(lines: ParsedLine[], from: number): NumberedLine[] {
  return lines.map((l, i) => {
    const seq = from + 1 + i
    return { seq, receivedAt: receivedAtOf(l.fields), line: JSON.stringify({ ...l.fields, seq }) }
  })
}

export const toNdjson = (raws: string[]): string => (raws.length ? `${raws.join('\n')}\n` : '')

/**
 * Writes `content` to `path`. Without `force`, the write itself is the guard — the exclusive flag `wx`
 * makes the filesystem refuse to create the file if it already exists, atomically: no check-then-write
 * window where a file created after the check but before the write would be silently destroyed. `export`'s
 * default path is where the four `.remote/` fixtures live, so this is the one write in the CLI that can
 * cause unrecoverable loss.
 */
export async function writeExported(path: string, content: string, force: boolean): Promise<void> {
  try {
    await writeFile(path, content, force ? undefined : { flag: 'wx' })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') throw new Error(`${path} exists: pass --force to overwrite`)
    throw err
  }
}
