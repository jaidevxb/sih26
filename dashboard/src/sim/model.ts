/**
 * HIMSHAKTI — station energy model.
 *
 * The whole thing is seven rules, below in `dispatchHour`. Everything is pure
 * and deterministic, so the same slider settings always give the same numbers.
 *
 * Units are in the names: _kW, _kWh, _L, _Lph, _C, _ms.
 */

// ---------------------------------------------------------------- plant setup

export const PLANT = {
  station: 'BHARATI',
  latitude: "69°24'S",
  longitude: "76°11'E",

  gensetRated_kW: 90, // 2 x 90 kW diesel sets
  gensetCount: 2,
  windRated_kW: 18, // 2 x 9 kW turbines
  pvRated_kW: 12, // roof array, snow-soiled

  /** Usable heat recovered per kW of electricity the genset makes. */
  heatPerElec: 0.55,
  /** Heat a litre of diesel gives through the boiler (85 % of 10 kWh/L). */
  boilerKWhPerL: 8.5,

  /** One annual delivery. Sized to a year of optimised burn — not baseline. */
  tankCapacity_L: 215_000,

  /** What an operator actually leaves the lead set at, all year. */
  baselineLoadFactor: 0.75,

  batteryCRate: 0.4,
  socMin: 0.15,
  socMax: 0.95,
  socStart: 0.6,

  /** Deferrable block: snow melter + water maker. */
  deferStart_h: 10,
  deferHours: 3,

  /** Cost of restarting a set — wear, and reheating a loop that went cold. */
  startFuel_L: 20,
} as const

export const DAY0 = new Date(2026, 8, 15, 6, 0, 0) // 15 Sep 2026, late austral winter

// ------------------------------------------------------------- the formulas

export const heatDemand_kW = (temp_C: number) => Math.max(0, 2.4 * (18 - temp_C))

export const baseLoad_kW = (crew: number) => 22 + crew * 0.9

export function windPower_kW(v_ms: number): number {
  if (v_ms < 3 || v_ms > 25) return 0 // cut-in and cut-out
  return Math.min(PLANT.windRated_kW, 0.9 * v_ms * v_ms)
}

export const pvPower_kW = (solarFrac: number) => PLANT.pvRated_kW * clamp(solarFrac, 0, 1)

/** Low load is worse per kWh, because the first term is paid whatever you make. */
export const gensetFuel_Lph = (out_kW: number) =>
  out_kW <= 0 ? 0 : 0.08 * PLANT.gensetRated_kW + 0.21 * out_kW

export const boilerFuel_Lph = (heat_kW: number) =>
  heat_kW <= 0 ? 0 : heat_kW / PLANT.boilerKWhPerL

const deferDaily_kWh = (crew: number) => 45 + crew * 2.2

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// --------------------------------------------------------------------- inputs

export interface Inputs {
  // A — simulation inputs
  crew: number
  outsideTemp_C: number
  windSpeed_ms: number
  solar_pct: number
  daysToResupply: number

  // B — system constraints
  minStableLoad_pct: number
  batteryCapacity_kWh: number
  batteryDerate_pct: number
  deferFlex_h: number
  n1Reserve: boolean

  // scenario state
  gensetsAvailable: number
  stormDays: number
  /** What the weather relaxes to once stormDays have passed. */
  calm: { temp_C: number; wind_ms: number; solar_pct: number } | null
}

export const DEFAULTS: Inputs = {
  crew: 25,
  outsideTemp_C: -28,
  windSpeed_ms: 12,
  solar_pct: 15,
  daysToResupply: 210,

  minStableLoad_pct: 35,
  batteryCapacity_kWh: 200,
  batteryDerate_pct: 30,
  deferFlex_h: 6,
  n1Reserve: true,

  gensetsAvailable: 2,
  stormDays: 0,
  calm: null,
}

// ------------------------------------------------------------------- weather

/** Deterministic hash noise in [0,1) — no RNG state, so renders never flicker. */
function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** 0 at day 0 (deep winter), 1 at day 182 (midsummer). */
const season = (day: number) => (1 - Math.cos((2 * Math.PI * day) / 365)) / 2

/** Station is busier through the working day and the evening. */
const occFactor = (hod: number) =>
  0.86 + 0.3 * Math.max(Math.exp(-((hod - 10) ** 2) / 14), Math.exp(-((hod - 19) ** 2) / 10))

export interface Env {
  temp_C: number
  wind_ms: number
  solarFrac: number
  crew: number
}

export function envAt(day: number, hod: number, inp: Inputs): Env {
  // During a storm the conditions on the sliders hold; afterwards they relax.
  const a =
    inp.stormDays > 0 && day >= inp.stormDays && inp.calm
      ? inp.calm
      : { temp_C: inp.outsideTemp_C, wind_ms: inp.windSpeed_ms, solar_pct: inp.solar_pct }

  const s = season(day)
  const seed = day * 24 + hod

  const temp_C =
    a.temp_C + 18 * s + 2.5 * Math.sin((2 * Math.PI * (hod - 5)) / 24) + (noise(seed) - 0.5) * 3.6

  const gust = 1 + (noise(seed + 1013) - 0.5) * 0.45
  const wind_ms = Math.max(0, a.wind_ms * (0.82 + 0.18 * Math.cos((2 * Math.PI * day) / 365)) * gust)

  // Short polar-winter daylight window, widening through the year.
  const width = 4.2 + 5.6 * s
  const daylight = Math.max(0, 1 - ((hod - 12.5) / width) ** 2)
  const solarFrac = ((a.solar_pct + (95 - a.solar_pct) * s) / 100) * daylight

  // Summer campaign roughly doubles the winter-over party.
  const summerCrew = Math.min(60, Math.round(inp.crew * 2))
  const crew = Math.round(inp.crew + (summerCrew - inp.crew) * Math.max(0, (s - 0.5) * 2))

  return { temp_C, wind_ms, solarFrac, crew }
}

// -------------------------------------------------------------- dispatch step

export interface Step {
  i: number
  day: number
  hod: number
  label: string

  temp_C: number
  wind_ms: number

  load_kW: number // total electrical demand served
  heatDemand_kW: number
  wasteHeat_kW: number
  boilerHeat_kW: number
  electricHeat_kW: number

  wind_kW: number
  solar_kW: number
  spilled_kW: number

  g1_kW: number
  g2_kW: number
  battDischarge_kW: number
  battCharge_kW: number
  soc: number

  gensetFuel_L: number
  boilerFuel_L: number
  fuel_L: number

  shifted: boolean
  n1Ok: boolean
  unserved_kW: number
}

interface State {
  usable_kWh: number
  pMax_kW: number
  soc: number
  /** Were any sets running last hour? Used to charge for a restart. */
  wasOn: boolean
}

function newState(inp: Inputs): State {
  const usable_kWh = inp.batteryCapacity_kWh * (1 - inp.batteryDerate_pct / 100)
  return {
    usable_kWh,
    pMax_kW: usable_kWh * PLANT.batteryCRate,
    soc: PLANT.socStart,
    wasOn: true,
  }
}

/** What the pack can actually deliver this hour. */
const battAvail_kW = (b: State) =>
  Math.min(b.pMax_kW, Math.max(0, (b.soc - PLANT.socMin) * b.usable_kWh))

const battRoom_kWh = (b: State) => Math.max(0, (PLANT.socMax - b.soc) * b.usable_kWh)

// ------------------------------------------------------------ load shifting

/** Move the deferrable block to the windiest hours inside its flexibility window. */
function pickDeferStart(day: number, inp: Inputs): number {
  if (inp.deferFlex_h <= 0) return PLANT.deferStart_h

  let best: number = PLANT.deferStart_h
  let bestWind = -Infinity
  for (let s = PLANT.deferStart_h - inp.deferFlex_h; s <= PLANT.deferStart_h + inp.deferFlex_h; s++) {
    let wind = 0
    for (let h = s; h < s + PLANT.deferHours; h++) {
      const hod = ((h % 24) + 24) % 24
      const e = envAt(day, hod, inp)
      wind += windPower_kW(e.wind_ms) + pvPower_kW(e.solarFrac)
    }
    if (wind > bestWind) {
      bestWind = wind
      best = s
    }
  }
  return ((best % 24) + 24) % 24
}

// ------------------------------------------------------------------ dispatch

export type Strategy = 'optimised' | 'baseline'

/**
 * One hour of dispatch.
 *
 * OPTIMISED — seven rules:
 *   1. Renewables serve the load first.
 *   2. Surplus charges the battery.
 *   3. Surplus left over goes to electric heating instead of being spilled.
 *   4. If the battery can cover the shortfall, the gensets stay off.
 *   5. Otherwise run a genset, never below its minimum stable load.
 *   6. N-1: one set only if the battery could carry the station on its own;
 *      otherwise a second set runs.
 *   7. Genset waste heat covers the heating load; the boiler makes up the rest.
 *
 * BASELINE — what the station does today: the lead set never stops and sits at a
 * fixed load factor, there is no battery and no load shifting, and any renewable
 * surplus is spilled.
 *
 * Rule 7 is the point of the project. Switching a genset off saves its fuel but
 * throws away the heat it was making, so the boiler has to burn diesel instead.
 * Optimising electricity on its own gets this decision wrong.
 */
function dispatchHour(
  i: number,
  day: number,
  hod: number,
  inp: Inputs,
  batt: State,
  strategy: Strategy,
  deferStart: number,
): Step {
  const env = envAt(day, hod, inp)
  const rated = PLANT.gensetRated_kW
  const floor_kW = rated * (inp.minStableLoad_pct / 100)
  const units = Math.max(0, inp.gensetsAvailable)

  const wind_kW = windPower_kW(env.wind_ms)
  const solar_kW = pvPower_kW(env.solarFrac)
  const renew_kW = wind_kW + solar_kW

  const start = strategy === 'optimised' ? deferStart : PLANT.deferStart_h
  const inBlock = hod >= start && hod < start + PLANT.deferHours
  const defer_kW = inBlock ? deferDaily_kWh(env.crew) / PLANT.deferHours : 0
  const shifted = strategy === 'optimised' && inBlock && start !== PLANT.deferStart_h

  const heat_kW = heatDemand_kW(env.temp_C)
  const demand_kW = baseLoad_kW(env.crew) * occFactor(hod) + defer_kW

  let g1 = 0
  let g2 = 0
  let discharge = 0
  let charge = 0
  let electricHeat_kW = 0
  let spilled_kW = 0
  let n1Ok = true
  let unserved_kW = 0

  if (strategy === 'optimised') {
    const net_kW = demand_kW - renew_kW

    if (net_kW <= 0) {
      // Rules 1–3: surplus goes to the battery, then to heat, then nowhere.
      let surplus = -net_kW
      charge = Math.min(surplus, batt.pMax_kW, battRoom_kWh(batt))
      surplus -= charge
      electricHeat_kW = Math.min(surplus, heat_kW)
      spilled_kW = surplus - electricHeat_kW
      // With the sets off, the pack has to be able to replace the wind farm.
      n1Ok = !inp.n1Reserve || batt.pMax_kW >= wind_kW
    } else if (units > 0 && net_kW <= battAvail_kW(batt)) {
      // Rule 4: ride it out on the battery, gensets off.
      discharge = net_kW
      n1Ok = !inp.n1Reserve || units >= 1
    } else if (units === 0) {
      discharge = Math.min(net_kW, battAvail_kW(batt))
      unserved_kW = net_kW - discharge
      n1Ok = false
    } else {
      // Rules 5–6: run the sets.
      let count = net_kW > rated ? 2 : 1
      // N-1: one set on its own is only allowed if the pack could instantly
      // replace it. Otherwise a second set has to share the load.
      if (inp.n1Reserve && count === 1 && batt.pMax_kW < Math.max(net_kW, floor_kW)) count = 2
      count = Math.min(count, units)

      const perUnit = Math.max(net_kW / count, floor_kW)
      g1 = Math.min(perUnit, rated)
      if (count >= 2) g2 = Math.min(perUnit, rated)

      n1Ok = !inp.n1Reserve || count >= 2 || batt.pMax_kW >= g1

      // Output forced out by the minimum-load floor is banked, then used for
      // heat — it is never spilled.
      const excess = g1 + g2 - net_kW
      if (excess > 0) {
        charge = Math.min(excess, batt.pMax_kW, battRoom_kWh(batt))
        electricHeat_kW = Math.min(excess - charge, heat_kW)
        spilled_kW = excess - charge - electricHeat_kW
      } else {
        unserved_kW = -excess
      }
    }
  } else {
    // Baseline: lead set always on at a fixed load factor, second only if the
    // first runs out of headroom. No storage, so surplus is simply spilled.
    const need_kW = demand_kW - renew_kW
    g1 = clamp(Math.max(rated * PLANT.baselineLoadFactor, Math.min(need_kW, rated)), floor_kW, rated)
    if (need_kW > g1 && units >= 2) g2 = clamp(need_kW - g1, floor_kW, rated)

    spilled_kW = Math.max(0, g1 + g2 + renew_kW - demand_kW)
    unserved_kW = Math.max(0, demand_kW - (g1 + g2 + renew_kW))
    // One set online and no pack to bridge with: this is not N-1 compliant.
    n1Ok = !inp.n1Reserve || g2 > 0
  }

  // Battery bookkeeping.
  if (batt.usable_kWh > 0) {
    batt.soc = clamp(batt.soc + (charge - discharge) / batt.usable_kWh, PLANT.socMin, PLANT.socMax)
  }

  // Rule 7 — the coupling. Waste heat first, electric top-up next, boiler last.
  const wasteHeat_kW = Math.min(heat_kW, (g1 + g2) * PLANT.heatPerElec)
  const boilerHeat_kW = Math.max(0, heat_kW - wasteHeat_kW - electricHeat_kW)

  // Rule 8 — a restart costs fuel, so the plan does not cycle the sets all day.
  const isOn = g1 + g2 > 0
  const restart_L = isOn && !batt.wasOn ? PLANT.startFuel_L : 0
  batt.wasOn = isOn

  const gensetFuel_L = gensetFuel_Lph(g1) + gensetFuel_Lph(g2) + restart_L
  const boilerFuel_L = boilerFuel_Lph(boilerHeat_kW)

  return {
    i,
    day,
    hod,
    label: `${String(hod).padStart(2, '0')}:00`,
    temp_C: env.temp_C,
    wind_ms: env.wind_ms,
    load_kW: demand_kW + electricHeat_kW,
    heatDemand_kW: heat_kW,
    wasteHeat_kW,
    boilerHeat_kW,
    electricHeat_kW,
    wind_kW,
    solar_kW,
    spilled_kW,
    g1_kW: g1,
    g2_kW: g2,
    battDischarge_kW: discharge,
    battCharge_kW: charge,
    soc: batt.soc,
    gensetFuel_L,
    boilerFuel_L,
    fuel_L: gensetFuel_L + boilerFuel_L,
    shifted,
    n1Ok,
    unserved_kW,
  }
}

// ----------------------------------------------------------------- the runs

/** Hour-by-hour dispatch from day 0, hour 0. */
export function runHours(hours: number, inp: Inputs, strategy: Strategy): Step[] {
  const batt = newState(inp)
  const out: Step[] = []
  let deferStart = pickDeferStart(0, inp)
  for (let i = 0; i < hours; i++) {
    const day = Math.floor(i / 24)
    const hod = i % 24
    if (hod === 0 && i > 0) deferStart = pickDeferStart(day, inp)
    out.push(dispatchHour(i, day, hod, inp, batt, strategy, deferStart))
  }
  return out
}

export interface DaySummary {
  day: number
  fuel_L: number
}

/** A year of dispatch, summed to one fuel figure per day. */
export function runYear(inp: Inputs, strategy: Strategy): DaySummary[] {
  const batt = newState(inp)
  const days: DaySummary[] = []
  for (let day = 0; day < 366; day++) {
    const deferStart = strategy === 'optimised' ? pickDeferStart(day, inp) : PLANT.deferStart_h
    let fuel_L = 0
    for (let hod = 0; hod < 24; hod++) {
      fuel_L += dispatchHour(day * 24 + hod, day, hod, inp, batt, strategy, deferStart).fuel_L
    }
    days.push({ day, fuel_L })
  }
  return days
}
