// One device, its lines, everything the dashboard and the CLI show for it. Pure: the caller brings the lines.
import {
  type AnalyzeDeps,
  analyzeCalibrations,
  analyzeSession,
  type Budget,
  type CalibrationAnalysis,
  errorBudget,
  type LogLine,
  parseLines,
  type SessionAnalysis,
  splitSessions,
} from './analysis'

export interface DeviceReport {
  device: string
  /** newest first */
  sessions: SessionAnalysis[]
  calibrations: CalibrationAnalysis
  budget: Budget
}

export function deviceReportFromLines(device: string, lines: LogLine[], deps: AnalyzeDeps, last = 20): DeviceReport {
  const all = splitSessions(lines, device).map((r) => analyzeSession(r, deps))
  const sessions = all.slice(-last).reverse()
  const calibrations = analyzeCalibrations(lines, device)
  const sampleRate = all[all.length - 1]?.engine.sampleRate ?? null
  return { device, sessions, calibrations, budget: errorBudget(calibrations, all, sampleRate) }
}

/** The same, from NDJSON text: the CLI reads text, the dashboard keeps parsed lines and appends to them. */
export function deviceReport(device: string, text: string, deps: AnalyzeDeps, last = 20): DeviceReport {
  return deviceReportFromLines(device, parseLines(text), deps, last)
}
