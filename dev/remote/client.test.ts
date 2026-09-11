import { describe, expect, it } from 'bun:test'
import { defaultUntil, parseArgs } from './client'

describe('parseArgs', () => {
  it('command, json args and flags', () => {
    expect(
      parseArgs(['--to', 'iphone', 'start', '{"exercise":"stone-1","bpm":60}', '--until', 'session:done']),
    ).toEqual({
      to: 'iphone',
      all: false,
      cmd: 'start',
      args: { exercise: 'stone-1', bpm: 60 },
      until: 'session:done',
      timeoutMs: 60000,
      n: 50,
    })
  })
  it('rejects unknown flags and bad json', () => {
    expect(() => parseArgs(['--target', 'x', 'ping'])).toThrow('unknown flag "--target"')
    expect(() => parseArgs(['start', '{oops'])).toThrow('args must be JSON')
  })
  it('ls, tail and wait are commands too', () => {
    expect(parseArgs(['ls']).cmd).toBe('ls')
    expect(parseArgs(['tail', 'ipad', '--n', '10'])).toMatchObject({ cmd: 'tail', args: { name: 'ipad' }, n: 10 })
    expect(parseArgs(['wait', 'session:done', '--timeout', '600000'])).toMatchObject({
      cmd: 'wait',
      args: { event: 'session:done' },
      timeoutMs: 600000,
    })
  })
})

describe('defaultUntil', () => {
  it('waits for the event each command produces', () => {
    expect(defaultUntil('calibrate')).toBe('calibration:done,calibration:failed')
    expect(defaultUntil('start')).toBe('session:start')
    expect(defaultUntil('stop')).toBe('session:done')
    expect(defaultUntil('record')).toBe('audio')
    expect(defaultUntil('ping')).toBe('cmd:done')
  })
})
