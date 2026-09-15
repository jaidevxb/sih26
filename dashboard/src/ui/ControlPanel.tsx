import { AlertTriangle } from 'lucide-react'
import type { Inputs } from '../sim/model'

interface SliderSpec {
  key: keyof Inputs
  name: string
  min: number
  max: number
  step: number
  unit: string
}

const GROUP_A: SliderSpec[] = [
  { key: 'crew', name: 'People on station', min: 15, max: 60, step: 1, unit: 'people' },
  { key: 'outsideTemp_C', name: 'Outside temperature', min: -45, max: 0, step: 1, unit: '°C' },
  { key: 'windSpeed_ms', name: 'Wind speed', min: 0, max: 35, step: 1, unit: 'm/s' },
  { key: 'solar_pct', name: 'Sunlight', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'daysToResupply', name: 'Days until the ship arrives', min: 30, max: 365, step: 1, unit: 'days' },
]

const GROUP_B: SliderSpec[] = [
  { key: 'minStableLoad_pct', name: 'Lowest a genset may run at', min: 20, max: 60, step: 1, unit: '%' },
  { key: 'batteryCapacity_kWh', name: 'Battery size', min: 0, max: 500, step: 10, unit: 'kWh' },
  { key: 'batteryDerate_pct', name: 'Battery lost to the cold', min: 0, max: 50, step: 1, unit: '%' },
  { key: 'deferFlex_h', name: 'How far jobs can be moved', min: 0, max: 12, step: 1, unit: 'hours' },
]

function Slider({
  spec,
  value,
  onChange,
}: {
  spec: SliderSpec
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="ctl">
      <div className="ctl-row">
        <label className="ctl-name" htmlFor={spec.key}>
          {spec.name}
        </label>
        <span className="ctl-value">
          {value}
          <span className="u">{spec.unit}</span>
        </span>
      </div>
      <input
        id={spec.key}
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

export function ControlPanel({
  inputs,
  onChange,
}: {
  inputs: Inputs
  onChange: (patch: Partial<Inputs>) => void
}) {
  return (
    <>
      <div className="group-head" style={{ borderTop: 'none' }}>
        Conditions at the station
      </div>
      {GROUP_A.map((s) => (
        <Slider
          key={s.key}
          spec={s}
          value={inputs[s.key] as number}
          onChange={(v) => onChange({ [s.key]: v } as Partial<Inputs>)}
        />
      ))}

      <div className="group-head">Equipment and rules</div>
      {GROUP_B.map((s) => (
        <Slider
          key={s.key}
          spec={s}
          value={inputs[s.key] as number}
          onChange={(v) => onChange({ [s.key]: v } as Partial<Inputs>)}
        />
      ))}

      <div className="ctl">
        <div className="ctl-row" style={{ marginBottom: 0 }}>
          <span className="ctl-name">Always keep a backup ready (N-1)</span>
          <span className="toggle">
            <button
              type="button"
              aria-pressed={inputs.n1Reserve}
              onClick={() => onChange({ n1Reserve: true })}
            >
              ON
            </button>
            <button
              type="button"
              className="off"
              aria-pressed={!inputs.n1Reserve}
              onClick={() => onChange({ n1Reserve: false })}
            >
              OFF
            </button>
          </span>
        </div>
        {!inputs.n1Reserve && (
          <div className="banner banner-alarm" style={{ marginTop: 6 }}>
            <AlertTriangle size={13} strokeWidth={2} />
            <span>
              Saves fuel, but if the running genset trips the whole station goes dark.
            </span>
          </div>
        )}
      </div>
    </>
  )
}
