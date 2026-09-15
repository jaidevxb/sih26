import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Step } from '../sim/model'
import type { BurndownPoint, ForecastPoint, ShiftWindow } from '../sim/derive'
import type { Palette } from './theme'

const axisTick = (p: Palette) => ({ fontSize: 10, fill: p.axis })
const AXIS_LINE = { strokeWidth: 1 }

function Box({
  rows,
  head,
}: {
  head: string
  rows: { name: string; value: string; color?: string }[]
}) {
  return (
    <div className="tt">
      <div className="mono" style={{ fontWeight: 700, marginBottom: 3 }}>
        {head}
      </div>
      {rows.map((r) => (
        <div className="tt-row" key={r.name}>
          <span className="tt-key">
            {r.color ? <span className="swatch" style={{ background: r.color }} /> : null}
            {r.name}
          </span>
          <span className="mono">{r.value}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------- 48-hour dispatch plan --- */

export function DispatchChart({
  plan,
  windows,
  p,
  nowIndex,
}: {
  plan: Step[]
  windows: ShiftWindow[]
  p: Palette
  nowIndex: number
}) {
  const series = [
    { key: 'g1_kW', name: 'Genset 1', color: p.g1 },
    { key: 'g2_kW', name: 'Genset 2', color: p.g2 },
    { key: 'wind_kW', name: 'Wind', color: p.wind },
    { key: 'solar_kW', name: 'Solar', color: p.solar },
    { key: 'battDischarge_kW', name: 'Battery', color: p.battery },
  ] as const

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={plan} margin={{ top: 4, right: 6, bottom: 2, left: -14 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        {windows.map((w) => (
          <ReferenceArea
            key={w.from}
            x1={w.from}
            x2={w.to - 1}
            fill={p.shift}
            fillOpacity={0.12}
            stroke={p.shift}
            strokeOpacity={0.35}
          />
        ))}
        <XAxis
          dataKey="i"
          type="number"
          domain={[0, plan.length - 1]}
          ticks={[0, 6, 12, 18, 24, 30, 36, 42, 47]}
          tickFormatter={(v: number) => plan[v]?.label ?? ''}
          tick={axisTick(p)}
          stroke={p.axis}
          axisLine={AXIS_LINE}
          tickLine={false}
        />
        <YAxis
          tick={axisTick(p)}
          stroke={p.axis}
          axisLine={AXIS_LINE}
          tickLine={false}
          width={44}
          label={{ value: 'kW', position: 'insideTopLeft', fill: p.axis, fontSize: 10, dy: -2, dx: 18 }}
        />
        {series.map((s) => (
          <Area
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId="gen"
            type="monotone"
            stroke={s.color}
            strokeWidth={1}
            fill={s.color}
            fillOpacity={0.55}
            isAnimationActive={false}
          />
        ))}
        <Line
          dataKey="load_kW"
          name="Total load"
          type="monotone"
          stroke={p.load}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <ReferenceLine x={nowIndex} stroke={p.axis} strokeDasharray="2 2" />
        <Tooltip
          cursor={{ stroke: p.axis, strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const s = plan[label as number]
            if (!s) return null
            return (
              <Box
                head={`${s.label}  ·  day ${s.day + 1}`}
                rows={[
                  ...series.map((x) => ({
                    name: x.name,
                    color: x.color,
                    value: `${(s[x.key] as number).toFixed(0)} kW`,
                  })),
                  { name: 'Total load', color: p.load, value: `${s.load_kW.toFixed(0)} kW` },
                  { name: 'Battery SoC', value: `${(s.soc * 100).toFixed(0)} %` },
                  { name: 'Fuel', value: `${s.fuel_L.toFixed(1)} L/h` },
                ]}
              />
            )
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/* ---------------------------------------------------- annual fuel burndown - */

export function BurndownChart({
  data,
  resupplyDay,
  p,
}: {
  data: BurndownPoint[]
  resupplyDay: number
  p: Palette
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, bottom: 2, left: -4 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis
          dataKey="day"
          type="number"
          domain={[0, 365]}
          ticks={[0, 60, 120, 180, 240, 300, 365]}
          tickFormatter={(v: number) => `${v} d`}
          tick={axisTick(p)}
          stroke={p.axis}
          axisLine={AXIS_LINE}
          tickLine={false}
        />
        <YAxis
          tick={axisTick(p)}
          stroke={p.axis}
          axisLine={AXIS_LINE}
          tickLine={false}
          width={52}
          tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
          label={{ value: 'L', position: 'insideTopLeft', fill: p.axis, fontSize: 10, dy: -2, dx: 22 }}
        />
        <ReferenceLine
          x={resupplyDay}
          stroke={p.axis}
          strokeDasharray="4 3"
          label={{
            value: 'RESUPPLY SHIP',
            position: 'insideTopRight',
            fill: p.axis,
            fontSize: 9.5,
            letterSpacing: '0.06em',
          }}
        />
        <Line
          dataKey="optimised"
          name="AI optimised"
          stroke={p.optimised}
          strokeWidth={1.5}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="baseline"
          name="Baseline"
          stroke={p.baseline}
          strokeWidth={1.5}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Tooltip
          cursor={{ stroke: p.axis, strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const d = data[label as number]
            if (!d) return null
            return (
              <Box
                head={`Day ${d.day}`}
                rows={[
                  {
                    name: 'AI optimised',
                    color: p.optimised,
                    value: d.optimised === null ? 'empty' : `${d.optimised.toLocaleString('en-IN')} L`,
                  },
                  {
                    name: 'Baseline',
                    color: p.baseline,
                    value: d.baseline === null ? 'empty' : `${d.baseline.toLocaleString('en-IN')} L`,
                  },
                ]}
              />
            )
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------ load & heat forecast */

export function ForecastChart({ data, p }: { data: ForecastPoint[]; p: Palette }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 2, left: -14 }}>
        <CartesianGrid stroke={p.grid} vertical={false} />
        <XAxis
          dataKey="i"
          type="number"
          domain={[0, data.length - 1]}
          ticks={[0, 12, 24, 36, 48, 60, 71]}
          tickFormatter={(v: number) => `+${v} h`}
          tick={axisTick(p)}
          stroke={p.axis}
          axisLine={AXIS_LINE}
          tickLine={false}
        />
        <YAxis
          tick={axisTick(p)}
          stroke={p.axis}
          axisLine={AXIS_LINE}
          tickLine={false}
          width={44}
          label={{ value: 'kW', position: 'insideTopLeft', fill: p.axis, fontSize: 10, dy: -2, dx: 18 }}
        />
        <Area
          dataKey="band"
          name="P10–P90"
          stroke="none"
          fill={p.band}
          fillOpacity={0.16}
          isAnimationActive={false}
        />
        <Line
          dataKey="load_kW"
          name="Electrical load"
          stroke={p.optimised}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          dataKey="heat_kW"
          name="Heat demand"
          stroke={p.heat}
          strokeWidth={1.5}
          strokeDasharray="4 2"
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          cursor={{ stroke: p.axis, strokeWidth: 1 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const d = data[label as number]
            if (!d) return null
            return (
              <Box
                head={`${d.label}  ·  +${d.i} h`}
                rows={[
                  { name: 'Electrical P50', color: p.optimised, value: `${d.load_kW.toFixed(0)} kW` },
                  { name: 'P10 – P90', color: p.band, value: `${d.p10_kW.toFixed(0)} – ${d.p90_kW.toFixed(0)} kW` },
                  { name: 'Heat demand', color: p.heat, value: `${d.heat_kW.toFixed(0)} kW` },
                ]}
              />
            )
          }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function Legend({ items }: { items: { name: string; color: string; dashed?: boolean }[] }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {items.map((i) => (
        <span
          key={i.name}
          className="panel-note"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <span
            className="swatch"
            style={{
              background: i.dashed ? 'transparent' : i.color,
              borderTop: i.dashed ? `2px dashed ${i.color}` : undefined,
              height: i.dashed ? 0 : 8,
              width: i.dashed ? 12 : 8,
            }}
          />
          {i.name}
        </span>
      ))}
    </div>
  )
}
