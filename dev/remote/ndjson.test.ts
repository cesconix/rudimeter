import { describe, expect, it } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { numbered, parseNdjson, renumbered, toNdjson, writeExported } from './ndjson'

describe('parseNdjson', () => {
  it('keeps raw and fields, skips blank lines, names the first bad line', () => {
    const lines = parseNdjson('{"event":"a","seq":1}\n\n{"event":"b","seq":2}\n')
    expect(lines.map((l) => l.fields.event)).toEqual(['a', 'b'])
    expect(lines[0].raw).toBe('{"event":"a","seq":1}')
    expect(() => parseNdjson('{"event":"a"}\n{oops\n')).toThrow('line 2: malformed JSON')
    expect(() => parseNdjson('[1]')).toThrow('line 1: not a JSON object')
  })
})

describe('numbered / renumbered', () => {
  const lines = parseNdjson('{"event":"a","seq":3,"receivedAt":"r3"}\n{"event":"b","seq":5,"at":"t5"}\n')
  it('numbered keeps each line byte for byte with its own seq and receivedAt (or at)', () => {
    expect(numbered(lines)).toEqual([
      { seq: 3, receivedAt: 'r3', line: '{"event":"a","seq":3,"receivedAt":"r3"}' },
      { seq: 5, receivedAt: 't5', line: '{"event":"b","seq":5,"at":"t5"}' },
    ])
  })
  it('numbered refuses a seq that does not climb, naming the line', () => {
    const bad = parseNdjson('{"seq":2}\n{"seq":2}\n')
    expect(() => numbered(bad)).toThrow('line 2: seq 2 does not climb from 2')
    expect(() => numbered(parseNdjson('{"event":"x"}\n'))).toThrow('line 1')
  })
  it('renumbered rewrites seq in place from the given base and keeps everything else', () => {
    const rows = renumbered(lines, 10)
    expect(rows.map((r) => r.seq)).toEqual([11, 12])
    expect(rows[0].line).toBe('{"event":"a","seq":11,"receivedAt":"r3"}')
    expect(rows[1]).toMatchObject({ receivedAt: 't5', line: '{"event":"b","seq":12,"at":"t5"}' })
  })
  it('toNdjson ends with one newline, empty for nothing', () => {
    expect(toNdjson(['{}', '{}'])).toBe('{}\n{}\n')
    expect(toNdjson([])).toBe('')
  })
})

// Never `.remote/`: a temp dir this suite owns and cleans up, so a regression here can never touch a real fixture.
describe('writeExported', () => {
  it('refuses to clobber an existing file without --force, leaving its content untouched', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rudimeter-export-'))
    const path = join(dir, 'existing.ndjson')
    try {
      await writeFile(path, 'original\n')
      await expect(writeExported(path, 'clobber\n', false)).rejects.toThrow(`${path} exists: pass --force to overwrite`)
      expect(await readFile(path, 'utf8')).toBe('original\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('--force overwrites the existing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rudimeter-export-'))
    const path = join(dir, 'existing.ndjson')
    try {
      await writeFile(path, 'original\n')
      await writeExported(path, 'forced\n', true)
      expect(await readFile(path, 'utf8')).toBe('forced\n')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
