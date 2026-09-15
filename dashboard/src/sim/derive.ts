/**
 * Turns one set of Inputs into everything on screen — KPI tiles, all four
 * charts, the status line and the recommendations — in a single pass, so they
 * can never disagree with each other. Runs in ~40 ms, fast enough to recompute
 * on every slider frame.
 */

import {
  PLANT,
  gensetFuel_Lph,
  runHours,
  runYear,
  type DaySummary,
  type Inputs,
  type Step,
} from './model'

const PLAN_HOURS = 48
const FORECAST_HOURS = 72

export interface Kpis {
  daysAutonomy: number
  daysAutonomyBaseline: number
  fuelRemaining_L: number
  tankFrac: number
  peakToday_kW: number
  fuelSavedYtd_L: number
  savedPct: number
  dailyBurn_L: number
  daysElapsed: number
}

export type StatusLevel = 'nominal' | 'caution' | 'alarm'

export interface Status {
  level: StatusLevel
  label: string
  message: string
}

export interface Recommendation {
  id: string
  time: string
  action: string
  reason: string
  fuelSaved_L: number
}

export interface BurndownPoint {
  day: number
  optimised: number | null
  baseline: number | null
}

export interface ForecastPoint {
  i: number
  label: string
  load_kW: number
  p10_kW: number
  p90_kW: number
  band: [number, number]
  heat_kW: number
}

export interface ShiftWindow {
  from: number
  to: number
}

export interface Dashboard {
  plan: Step[]
  forecast: ForecastPoint[]
  burndown: BurndownPoint[]
  shiftWindows: ShiftWindow[]
  kpis: Kpis
  status: Status
  recommendations: Recommendation[]
  resupplyDay: number
}

/** Day at which cumulative burn overruns the fuel on hand. */
function autonomyDays(year: DaySummary[], fuel_L: number): number {
  let cum = 0
  for (let i = 0; i < year.length; i++) {
    cum += year[i].fuel_L
    if (cum > fuel_L) return i
  }
  return year.length
}

/**
 * Fuel burnt since the last ship. The weather model repeats every 365 days, so
 * the days before today are the same conditions as the end of the run.
 */
function burntSince(year: DaySummary[], elapsed: number): number {
  let total = 0
  for (let k = 1; k <= elapsed; k++) total += year[(365 - k) % 365].fuel_L
  return total
}

function runsOf(flags: boolean[]): ShiftWindow[] {
  const out: ShiftWindow[] = []
  let from = -1
  flags.forEach((on, i) => {
    if (on && from < 0) from = i
    if (!on && from >= 0) {
      out.push({ from, to: i })
      from = -1
    }
  })
  if (from >= 0) out.push({ from, to: flags.length })
  return out
}

// ----------------------------------------------------------- recommendations

/**
 * Each row is read back out of the plan the dispatcher actually produced, and
 * every litre figure is the arithmetic difference against not doing it.
 */
function buildRecommendations(plan: Step[], inp: Inputs, shifts: ShiftWindow[]): Recommendation[] {
  const out: Recommendation[] = []
  const day1 = plan.slice(0, 24)
  const floor_kW = PLANT.gensetRated_kW * (inp.minStableLoad_pct / 100)

  // 1. Deferrable block moved into the windiest hours. Priced by re-running the
  //    same day with no flexibility and taking the difference.
  if (shifts.length > 0 && inp.deferFlex_h > 0) {
    const s = plan[shifts[0].from]
    const rigid = runHours(24, { ...inp, deferFlex_h: 0 }, 'optimised')
    const saved =
      rigid.reduce((a, p) => a + p.fuel_L, 0) - day1.reduce((a, p) => a + p.fuel_L, 0)
    if (saved >= 1) {
      out.push({
        id: 'shift',
        time: s.label,
        action: 'Run snow melter + water maker',
        reason: `Windiest ${PLANT.deferHours} h inside the ${inp.deferFlex_h} h window`,
        fuelSaved_L: saved,
      })
    }
  }

  // 2. Longest stretch the plan carries the station on the battery alone.
  const off = runsOf(day1.map((p) => p.g1_kW === 0 && p.g2_kW === 0)).sort(
    (a, b) => b.to - b.from - (a.to - a.from),
  )
  if (off.length > 0 && off[0].to - off[0].from >= 2) {
    const w = off[0]
    const hours = w.to - w.from
    const s = day1[w.from]
    // Stopping saves genset fuel but hands the heat back to the boiler.
    const saved =
      hours * gensetFuel_Lph(floor_kW) -
      (hours * floor_kW * PLANT.heatPerElec) / PLANT.boilerKWhPerL -
      PLANT.startFuel_L
    if (saved >= 1) {
      out.push({
        id: 'coast',
        time: s.label,
        action: `Stop Genset 1 for ${hours} h`,
        reason: `Battery at ${(s.soc * 100).toFixed(0)} % covers ${s.load_kW.toFixed(0)} kW; boiler takes the heat`,
        fuelSaved_L: saved,
      })
    }
  }

  // 3. One set instead of two, because the battery is the reserve.
  if (inp.n1Reserve && inp.batteryCapacity_kWh > 0) {
    const single = day1.filter((p) => p.g1_kW > 0 && p.g2_kW === 0)
    if (single.length >= 3) {
      out.push({
        id: 'n1',
        time: single[0].label,
        action: 'Keep Genset 2 shut down',
        reason: `Battery holds N-1 reserve for ${single.length} h`,
        fuelSaved_L: single.length * 0.08 * PLANT.gensetRated_kW,
      })
    }
  }

  // 4. Surplus wind sent to the heating loop instead of being spilled.
  const dump = day1.filter((p) => p.electricHeat_kW > 0.5)
  if (dump.length > 0) {
    const kWh = dump.reduce((a, p) => a + p.electricHeat_kW, 0)
    const saved = kWh / PLANT.boilerKWhPerL
    if (saved >= 1) {
      out.push({
        id: 'dump',
        time: dump[0].label,
        action: 'Send surplus to heating loop',
        reason: `${kWh.toFixed(0)} kWh that would otherwise be spilled`,
        fuelSaved_L: saved,
      })
    }
  }

  // 5. Always something to show: charge ahead of the coldest hour.
  if (out.length < 4) {
    const cold = [...day1].sort((a, b) => a.temp_C - b.temp_C)[0]
    out.push({
      id: 'precharge',
      time: cold.label,
      action: 'Charge battery before cold peak',
      reason: `${cold.temp_C.toFixed(0)} °C outside, ${cold.heatDemand_kW.toFixed(0)} kW of heat needed`,
      fuelSaved_L: cold.heatDemand_kW / PLANT.boilerKWhPerL / 4,
    })
  }

  return out.sort((a, b) => b.fuelSaved_L - a.fuelSaved_L).slice(0, 5)
}

// ------------------------------------------------------------------- status

function buildStatus(plan: Step[], k: Kpis, inp: Inputs): Status {
  const unserved = plan.some((p) => p.unserved_kW > 0.5)
  const setOut = inp.gensetsAvailable < PLANT.gensetCount

  if (unserved) {
    const worst = Math.max(...plan.map((p) => p.unserved_kW))
    return {
      level: 'alarm',
      label: 'LOAD SHED',
      message: `Short of ${worst.toFixed(0)} kW — generation and storage cannot meet demand.`,
    }
  }
  if (!inp.n1Reserve) {
    return {
      level: 'alarm',
      label: 'N-1 DISABLED',
      message: 'No backup held. Fuel burn is lower, but losing the running set drops the station.',
    }
  }
  if (k.daysAutonomy < inp.daysToResupply) {
    return {
      level: 'alarm',
      label: 'FUEL SHORT',
      message: `${k.daysAutonomy} d of fuel against ${inp.daysToResupply} d to the ship — short by ${inp.daysToResupply - k.daysAutonomy} d.`,
    }
  }
  if (setOut) {
    return {
      level: 'caution',
      label: 'SET OUT',
      message: 'One genset down. The other runs continuously — no backup left.',
    }
  }
  if (k.savedPct < 0) {
    return {
      level: 'caution',
      label: 'NO MARGIN',
      message: 'Too little storage to hold N-1, so a second set has to run. Add battery or relax N-1.',
    }
  }
  if (k.daysAutonomy < inp.daysToResupply * 1.12) {
    return {
      level: 'caution',
      label: 'MARGIN THIN',
      message: `${k.daysAutonomy} d of fuel against ${inp.daysToResupply} d to the ship — under 12 % spare.`,
    }
  }
  return {
    level: 'nominal',
    label: 'SYSTEM NOMINAL',
    message: `${k.daysAutonomy} d of fuel covers the ${inp.daysToResupply} d to the ship, ${k.daysAutonomy - inp.daysToResupply} d spare.`,
  }
}

// ----------------------------------------------------------------- assembly

export function computeDashboard(inp: Inputs): Dashboard {
  const hours = runHours(Math.max(PLAN_HOURS, FORECAST_HOURS), inp, 'optimised')
  const yearOpt = runYear(inp, 'optimised')
  const yearBase = runYear(inp, 'baseline')

  const daysElapsed = Math.max(0, 365 - inp.daysToResupply)
  const burnt = burntSince(yearOpt, daysElapsed)
  const burntBase = burntSince(yearBase, daysElapsed)
  const fuelRemaining_L = Math.max(0, PLANT.tankCapacity_L - burnt)

  const kpis: Kpis = {
    daysAutonomy: autonomyDays(yearOpt, fuelRemaining_L),
    daysAutonomyBaseline: autonomyDays(yearBase, fuelRemaining_L),
    fuelRemaining_L,
    tankFrac: fuelRemaining_L / PLANT.tankCapacity_L,
    peakToday_kW: Math.max(...hours.slice(0, 24).map((p) => p.load_kW)),
    fuelSavedYtd_L: burntBase - burnt,
    savedPct: burntBase > 0 ? ((burntBase - burnt) / burntBase) * 100 : 0,
    dailyBurn_L: yearOpt[0].fuel_L,
    daysElapsed,
  }

  // Fuel on hand day by day. Each line stops where it hits empty.
  const burndown: BurndownPoint[] = []
  let cOpt = fuelRemaining_L
  let cBase = fuelRemaining_L
  for (let d = 0; d <= 365; d++) {
    burndown.push({
      day: d,
      optimised: cOpt > 0 ? Math.round(cOpt) : null,
      baseline: cBase > 0 ? Math.round(cBase) : null,
    })
    cOpt -= yearOpt[d].fuel_L
    cBase -= yearBase[d].fuel_L
  }

  // The plan's own load, widened into a P10–P90 band that grows with horizon.
  const forecast: ForecastPoint[] = hours.slice(0, FORECAST_HOURS).map((p, i) => {
    const sigma = 0.045 + 0.0022 * i
    const p10 = p.load_kW * (1 - 1.2816 * sigma)
    const p90 = p.load_kW * (1 + 1.2816 * sigma)
    return {
      i,
      label: p.label,
      load_kW: p.load_kW,
      p10_kW: p10,
      p90_kW: p90,
      band: [p10, p90],
      heat_kW: p.heatDemand_kW,
    }
  })

  const plan = hours.slice(0, PLAN_HOURS)
  const shiftWindows = runsOf(plan.map((p) => p.shifted))

  return {
    plan,
    forecast,
    burndown,
    shiftWindows,
    kpis,
    status: buildStatus(plan, kpis, inp),
    recommendations: buildRecommendations(plan, inp, shiftWindows),
    resupplyDay: inp.daysToResupply,
  }
}

/** Rounding to figures an operator would actually write down. */
export const fmt = {
  litres: (v: number) => (Math.round(v / 100) * 100).toLocaleString('en-IN'),
  litresSmall: (v: number) => Math.round(v).toLocaleString('en-IN'),
  kW: (v: number) => Math.round(v).toString(),
  pct1: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`,
}
