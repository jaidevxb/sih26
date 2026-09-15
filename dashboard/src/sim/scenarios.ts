import { DEFAULTS, PLANT, type Inputs } from './model'

export type ScenarioId = 'blizzard' | 'gensetFailure' | 'shipDelay' | 'crewSurge'

export interface Scenario {
  id: ScenarioId
  label: string
  /** What the event does to the station. */
  apply: (base: Inputs) => Inputs
  /** One line on what the dispatcher did about it. Shown under the buttons. */
  response: string
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'blizzard',
    label: 'BLIZZARD',
    apply: (b) => ({
      ...b,
      outsideTemp_C: -38,
      windSpeed_ms: 29,
      solar_pct: 1,
      stormDays: 5,
      calm: {
        temp_C: DEFAULTS.outsideTemp_C,
        wind_ms: DEFAULTS.windSpeed_ms,
        solar_pct: DEFAULTS.solar_pct,
      },
    }),
    response:
      'Too windy for the turbines — they shut down above 25 m/s — and the cold pushes heating to about 135 kW. The plan keeps a genset running right through the storm and lets the boiler handle the extra heat.',
  },
  {
    id: 'gensetFailure',
    label: 'GENSET FAILS',
    apply: (b) => ({ ...b, gensetsAvailable: 1 }),
    response:
      'Only one genset left, so it now runs non-stop — it can no longer be switched off onto the battery. Fuel burn barely changes; what changes is the risk, because there is no backup any more.',
  },
  {
    id: 'shipDelay',
    label: 'SHIP 21 D LATE',
    apply: (b) => ({
      ...b,
      daysToResupply: Math.min(365, b.daysToResupply + 21),
    }),
    response:
      'The ship is 21 days late. The fuel in the tank has not changed, so the only question is whether it still stretches far enough. Watch the dashed line move on the yearly chart.',
  },
  {
    id: 'crewSurge',
    label: 'SUMMER CREW',
    apply: (b) => ({
      ...b,
      crew: 52,
      outsideTemp_C: -9,
      solar_pct: 62,
    }),
    response:
      'Summer season: 52 people on station, milder air and real sunlight. Demand jumps, so the gensets run harder — and the plan moves the heavy jobs into the long daylight hours.',
  },
]

export const SCENARIO_BY_ID = Object.fromEntries(
  SCENARIOS.map((s) => [s.id, s]),
) as Record<ScenarioId, Scenario>

/** Clears any scenario state without touching the operator's slider settings. */
export function clearScenario(inp: Inputs): Inputs {
  return {
    ...inp,
    gensetsAvailable: PLANT.gensetCount,
    stormDays: 0,
    calm: null,
  }
}
