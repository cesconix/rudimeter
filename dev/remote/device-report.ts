// One device, one file, everything the dashboard and the CLI show for it. Pure: the caller reads the file.
import {
  type AnalyzeDeps,
  analyzeCalibrations,
  analyzeSession,
  type Budget,
  type CalibrationAnalysis,
  errorBudget,
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

export function deviceReport(device: string, text: string, deps: AnalyzeDeps, last = 20): DeviceReport {
  const lines = parseLines(text)
  const all = splitSessions(lines, device).map((r) => analyzeSession(r, deps))
  const sessions = all.slice(-last).reverse()
  const calibrations = analyzeCalibrations(lines, device)
  const sampleRate = all[all.length - 1]?.engine.sampleRate ?? null
  return { device, sessions, calibrations, budget: errorBudget(calibrations, all, sampleRate) }
}
