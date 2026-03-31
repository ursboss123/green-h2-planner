import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { simulate, calcScore, scoreRating, CAPEX, PEAK_DEMAND_KW, LOCATIONS, GHI_REFERENCE } from './simulation'

// ── Colour palette ──────────────────────────────────────────
const C = {
  solar: '#f59e0b',  electrolyzer: '#8b5cf6', h2tank: '#06b6d4',
  fuelcell: '#10b981', battery: '#3b82f6', grid: '#ef4444',
  residential: '#3b82f6', hospital: '#ef4444', school: '#f59e0b',
}

// ── Default state ───────────────────────────────────────────
const DEFAULT_BUILDINGS = {
  residential: { enabled: true,  count: 200 },
  hospital:    { enabled: false, count: 50  },
  school:      { enabled: false, count: 20  },
}
const DEFAULT_COMP = {
  solar: 800, electrolyzer: 200, h2tank: 1000, fuelcell: 100, battery: 400,
}

// ── Shared card style ────────────────────────────────────────
const card = {
  background: 'var(--bg-2)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 16,
}

// ── KPI card ─────────────────────────────────────────────────
function KpiCard({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg-1)', borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600, color }}>{value}</div>
    </div>
  )
}

// ── Slider row ───────────────────────────────────────────────
function SliderRow({ label, icon, unit, value, min, max, step, color, capexLabel, onChange, onMaxChange }) {
  const [editingMax, setEditingMax] = useState(false)
  const [maxInput, setMaxInput] = useState(String(max))

  // Sync local input when parent max changes (e.g. from auto-scale)
  const prevMax = useRef(max)
  if (prevMax.current !== max && !editingMax) {
    prevMax.current = max
    setMaxInput(String(max))
  }

  const commitMax = () => {
    const parsed = parseInt(maxInput, 10)
    if (!isNaN(parsed) && parsed > 0) onMaxChange(parsed)
    else setMaxInput(String(max))
    setEditingMax(false)
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <span style={{ color: 'var(--text-2)', fontSize: 12 }}>{icon} {label}</span>
        <span style={{ fontWeight: 600, color, fontSize: 13 }}>
          {value.toLocaleString()} {unit}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={Math.min(value, max)}
        onChange={e => onChange(+e.target.value)}
        style={{ accentColor: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
        <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{capexLabel}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 9, color: 'var(--text-3)' }}>max:</span>
          {editingMax ? (
            <input
              type="number"
              value={maxInput}
              onChange={e => setMaxInput(e.target.value)}
              onBlur={commitMax}
              onKeyDown={e => { if (e.key === 'Enter') commitMax(); if (e.key === 'Escape') { setMaxInput(String(max)); setEditingMax(false) } }}
              autoFocus
              style={{
                width: 72, fontSize: 10, padding: '1px 4px', borderRadius: 4,
                background: 'var(--bg-1)', border: `1px solid ${color}`,
                color: 'var(--text-1)', outline: 'none',
              }}
            />
          ) : (
            <button
              onClick={() => setEditingMax(true)}
              title="Click to set slider max"
              style={{
                fontSize: 10, color, background: 'none', border: `1px solid ${color}44`,
                borderRadius: 4, padding: '1px 6px', cursor: 'pointer',
              }}
            >
              {max.toLocaleString()} {unit}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Building card ────────────────────────────────────────────
function BuildingCard({ type, config, onToggle, onCount }) {
  const meta = {
    residential: { icon: '🏠', unit: 'households', max: 2000, step: 10, unitLabel: '2.5 kW/unit · evening peak' },
    hospital:    { icon: '🏥', unit: 'beds',        max: 500,  step: 5,  unitLabel: '80 kW/bed · near-constant' },
    school:      { icon: '🏫', unit: 'classrooms',  max: 100,  step: 1,  unitLabel: '15 kW/class · daytime only' },
  }[type]

  const peakKW = Math.round(PEAK_DEMAND_KW[type] * config.count)
  const color = C[type]

  return (
    <div style={{
      ...card,
      border: `1px solid ${config.enabled ? color : 'var(--border)'}`,
      background: config.enabled ? `${color}0d` : 'var(--bg-2)',
      marginBottom: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>{meta.icon}</span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>{type}</div>
            <div style={{ fontSize: 10, color: 'var(--text-2)' }}>{meta.unitLabel}</div>
          </div>
        </div>
        {/* Toggle switch */}
        <div
          onClick={onToggle}
          style={{
            width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
            background: config.enabled ? color : 'var(--bg-3)',
            position: 'relative', transition: 'background 0.2s', flexShrink: 0,
          }}
        >
          <div style={{
            width: 14, height: 14, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 3,
            left: config.enabled ? 18 : 3,
            transition: 'left 0.2s',
          }} />
        </div>
      </div>

      {config.enabled && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{meta.unit}</span>
            <span style={{ fontWeight: 600, color, fontSize: 13 }}>{config.count}</span>
          </div>
          <input type="range" min={0} max={meta.max} step={meta.step} value={config.count}
            onChange={e => onCount(+e.target.value)}
            style={{ accentColor: color }} />
          <div style={{ fontSize: 10, color, marginTop: 2 }}>
            Peak demand: {peakKW.toLocaleString()} kW
          </div>
        </>
      )}
    </div>
  )
}

// ── Score display ─────────────────────────────────────────────
function ScoreDisplay({ score }) {
  const rt = scoreRating(score)
  return (
    <div style={{
      background: 'var(--bg-1)', border: `2px solid ${rt.color}`,
      borderRadius: 10, padding: '12px 16px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: 1, textTransform: 'uppercase' }}>Score</div>
      <div style={{ fontSize: 36, fontWeight: 700, color: rt.color }}>{score}</div>
      <div style={{ fontSize: 13, color: rt.color }}>{rt.label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
        Lower LCOE + higher RE + more H2
      </div>
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-2)', marginBottom: 4 }}>{label}:00</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 600 }}>{Math.round(p.value)} kW</span>
        </div>
      ))}
    </div>
  )
}

const HOURS = Array.from({ length: 24 }, (_, i) => `${i}:00`)

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [step, setStep] = useState(0)
  const [buildings, setBuildings] = useState(DEFAULT_BUILDINGS)
  const [comp, setComp] = useState(DEFAULT_COMP)
  const [optimizing, setOptimizing] = useState(false)
  const [optimizeMsg, setOptimizeMsg] = useState('')

  // ── Location + GHI ───────────────────────────────────────────
  const [locationIdx, setLocationIdx] = useState(0)   // index into LOCATIONS
  const [customGhi, setCustomGhi] = useState(2285)
  const ghi = LOCATIONS[locationIdx].ghi ?? customGhi

  // ── Storage mode: 'h2' or 'battery' ─────────────────────────
  const [storageMode, setStorageMode] = useState('h2')

  // Zero out unused storage components when mode switches
  useEffect(() => {
    if (storageMode === 'h2') {
      setComp(c => ({ ...c, battery: 0 }))
    } else {
      setComp(c => ({ ...c, electrolyzer: 0, h2tank: 0, fuelcell: 0 }))
    }
  }, [storageMode])

  // ── Per-component slider max (user-editable, auto-scales with load) ─────
  const [sliderMaxes, setSliderMaxes] = useState({
    solar: 5000, electrolyzer: 2000, h2tank: 10000, fuelcell: 1000, battery: 5000,
  })

  const updateSliderMax = useCallback((key, val) =>
    setSliderMaxes(m => ({ ...m, [key]: val })), [])

  const results = useMemo(() => simulate(buildings, comp, ghi), [buildings, comp, ghi])
  const score = useMemo(() => calcScore(results), [results])

  // Auto-scale slider maxes when peak load changes significantly
  useEffect(() => {
    const peak = results.peakLoad
    if (peak < 1) return
    setSliderMaxes(prev => ({
      solar:        Math.max(prev.solar,        Math.ceil(peak * 3 / 500)  * 500),
      electrolyzer: Math.max(prev.electrolyzer, Math.ceil(peak * 1.5 / 200) * 200),
      h2tank:       Math.max(prev.h2tank,       Math.ceil(peak * 0.5 / 500)  * 500),
      fuelcell:     Math.max(prev.fuelcell,     Math.ceil(peak * 1.5 / 200) * 200),
      battery:      Math.max(prev.battery,      Math.ceil(peak * 2 / 500)  * 500),
    }))
  }, [results.peakLoad])

  const toggleBuilding = useCallback((type) =>
    setBuildings(b => ({ ...b, [type]: { ...b[type], enabled: !b[type].enabled } })), [])

  const updateCount = useCallback((type, val) =>
    setBuildings(b => ({ ...b, [type]: { ...b[type], count: val } })), [])

  const updateComp = useCallback((key, val) =>
    setComp(c => ({ ...c, [key]: val })), [])

  const fmtM = v => v >= 1e6 ? `€${(v / 1e6).toFixed(2)}M` : `€${Math.round(v / 1000)}k`

  // ── Target RE fraction (user input) ─────────────────────────
  const [targetRe, setTargetRe] = useState(50)   // percent
  const [optimizeResult, setOptimizeResult] = useState(null)

  // ── Backend LP optimise ──────────────────────────────────────
  const handleOptimize = useCallback(async () => {
    setOptimizing(true)
    setOptimizeMsg('Running optimizer...')
    setOptimizeResult(null)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || ''
      const resp = await fetch(`${apiUrl}/api/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buildings,
          storage_mode: storageMode,
          target_re: targetRe / 100,
          ghi,
        }),
      })
      if (!resp.ok) throw new Error(await resp.text())
      const data = await resp.json()
      setComp({
        solar:        Math.round(data.solar_kw        ?? comp.solar),
        electrolyzer: Math.round(data.electrolyzer_kw ?? comp.electrolyzer),
        h2tank:       Math.round(data.h2tank_kg       ?? comp.h2tank),
        fuelcell:     Math.round(data.fuelcell_kw     ?? comp.fuelcell),
        battery:      Math.round(data.battery_kwh     ?? comp.battery),
      })
      setOptimizeResult(data)
      setOptimizeMsg('✅ Optimal sizing applied!')
    } catch (err) {
      setOptimizeMsg(`Backend unavailable. (${err.message})`)
    } finally {
      setOptimizing(false)
      setTimeout(() => setOptimizeMsg(''), 6000)
    }
  }, [buildings, storageMode, targetRe, ghi, comp])

  // ── Slider configs — filtered by storage mode ────────────────
  const allSliders = [
    { key: 'solar',        label: 'Solar PV',     icon: '☀️',  unit: 'kW',  min: 0, step: 50,  color: C.solar,        modes: ['h2','battery'] },
    { key: 'electrolyzer', label: 'Electrolyzer', icon: '⚡',  unit: 'kW',  min: 0, step: 25,  color: C.electrolyzer, modes: ['h2'] },
    { key: 'h2tank',       label: 'H2 storage',   icon: '🫙',  unit: 'kg',  min: 0, step: 100, color: C.h2tank,       modes: ['h2'] },
    { key: 'fuelcell',     label: 'Fuel cell',    icon: '🔋',  unit: 'kW',  min: 0, step: 25,  color: C.fuelcell,     modes: ['h2'] },
    { key: 'battery',      label: 'Battery',      icon: '🔌',  unit: 'kWh', min: 0, step: 50,  color: C.battery,      modes: ['battery'] },
  ]
  const sliders = allSliders
    .filter(s => s.modes.includes(storageMode))
    .map(s => ({ ...s, max: sliderMaxes[s.key] }))

  const rt = scoreRating(score)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-1)', color: 'var(--text-1)' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{
        background: 'var(--bg-2)', borderBottom: '1px solid var(--border)',
        padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>⚡</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Green H2 City Planner</div>
            <div style={{ color: 'var(--text-2)', fontSize: 11 }}>Techno-economic optimization game</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {[
            { label: 'Peak load', value: `${results.peakLoad} kW` },
            { label: 'LCOE', value: `${results.lcoe}¢/kWh` },
            { label: 'RE fraction', value: `${results.reFraction}%`, color: '#10b981' },
            { label: 'H2/yr', value: `${(results.yrH2 / 1000).toFixed(1)} t`, color: '#06b6d4' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{label}</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: color || 'var(--text-1)' }}>{value}</div>
            </div>
          ))}
          <div style={{
            background: 'var(--bg-3)', borderRadius: 8, padding: '6px 14px',
            textAlign: 'center', border: `1px solid ${rt.color}`,
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>SCORE</div>
            <div style={{ fontWeight: 700, fontSize: 20, color: rt.color }}>{score}</div>
          </div>
        </div>
      </header>

      {/* ── Step tabs ───────────────────────────────────────────── */}
      <nav style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', display: 'flex', padding: '0 24px' }}>
        {[
          '🏙️  1. Design district',
          '⚙️  2. Size systems',
          '📊  3. Results & optimize',
        ].map((tab, i) => (
          <button key={i} onClick={() => setStep(i)} style={{
            background: 'none', border: 'none',
            borderBottom: step === i ? '2px solid #38bdf8' : '2px solid transparent',
            color: step === i ? '#38bdf8' : 'var(--text-2)',
            padding: '11px 18px', cursor: 'pointer', fontWeight: step === i ? 600 : 400,
            fontSize: 13, transition: 'color .15s',
          }}>{tab}</button>
        ))}
      </nav>

      {/* ── Main content ────────────────────────────────────────── */}
      <main style={{ padding: '20px 24px', maxWidth: 1400, margin: '0 auto' }}>

        {/* ── STEP 0: Design district ─────────────────────────── */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: 18, marginBottom: 6 }}>Design your energy district</h2>
            <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 20 }}>
              Set your location, storage strategy, and building mix.
            </p>

            {/* ── Location + GHI ── */}
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>📍 Location & Solar Resource</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>Location</div>
                  <select
                    value={locationIdx}
                    onChange={e => setLocationIdx(+e.target.value)}
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13,
                      background: 'var(--bg-1)', color: 'var(--text-1)', border: '1px solid var(--border)',
                    }}
                  >
                    {LOCATIONS.map((loc, i) => (
                      <option key={i} value={i}>{loc.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4 }}>
                    GHI (kWh/m²/yr)
                    {LOCATIONS[locationIdx].ghi && (
                      <span style={{ color: '#10b981', marginLeft: 6 }}>
                        {Math.round((ghi / GHI_REFERENCE) * 100)}% of Abu Dhabi baseline
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    value={ghi}
                    disabled={LOCATIONS[locationIdx].ghi !== null}
                    onChange={e => setCustomGhi(Math.max(200, Math.min(3000, +e.target.value)))}
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 13,
                      background: LOCATIONS[locationIdx].ghi ? 'var(--bg-3)' : 'var(--bg-1)',
                      color: 'var(--text-1)', border: '1px solid var(--border)', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              {/* GHI bar */}
              <div style={{ marginTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>
                  <span>London 1060</span><span>Abu Dhabi 2285</span><span>Riyadh 2408</span>
                </div>
                <div style={{ height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    width: `${Math.min(100, (ghi / 2500) * 100)}%`,
                    background: 'linear-gradient(90deg, #3b82f6, #f59e0b)',
                    transition: 'width 0.3s',
                  }} />
                </div>
              </div>
            </div>

            {/* ── Storage mode toggle ── */}
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>🔋 Storage Strategy</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { mode: 'h2', icon: '🟢', label: 'Green Hydrogen', sub: 'Electrolyzer + H2 tank + Fuel cell' },
                  { mode: 'battery', icon: '⚡', label: 'Battery Storage', sub: 'Li-ion battery only' },
                ].map(({ mode, icon, label, sub }) => (
                  <div
                    key={mode}
                    onClick={() => setStorageMode(mode)}
                    style={{
                      padding: '12px 14px', borderRadius: 8, cursor: 'pointer',
                      border: `2px solid ${storageMode === mode ? (mode === 'h2' ? '#10b981' : '#3b82f6') : 'var(--border)'}`,
                      background: storageMode === mode ? (mode === 'h2' ? '#10b98122' : '#3b82f622') : 'var(--bg-1)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 2 }}>{sub}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
              {Object.entries(buildings).map(([type, cfg]) => (
                <BuildingCard key={type} type={type} config={cfg}
                  onToggle={() => toggleBuilding(type)}
                  onCount={val => updateCount(type, val)} />
              ))}
            </div>

            {/* 24h load preview */}
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Combined 24h load profile</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={results.hourly}>
                  <defs>
                    <linearGradient id="loadGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="solarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.solar} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={C.solar} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} tick={{ fontSize: 10, fill: '#64748b' }} tickCount={8} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} unit=" kW" />
                  <Tooltip content={<ChartTooltip />} />
                  <Area dataKey="load" stroke="#38bdf8" fill="url(#loadGrad)" strokeWidth={2} name="Demand" />
                  <Area dataKey="solar" stroke={C.solar} fill="url(#solarGrad)" strokeWidth={2} name="Solar (preview)" />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 24, marginTop: 8, justifyContent: 'center', fontSize: 12 }}>
                <span style={{ color: 'var(--text-2)' }}>Peak load: <b style={{ color: '#38bdf8' }}>{results.peakLoad.toLocaleString()} kW</b></span>
                <span style={{ color: 'var(--text-2)' }}>Daily demand: <b style={{ color: C.solar }}>{results.dailyEnergy.toLocaleString()} kWh</b></span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setStep(1)} style={{
                background: '#0ea5e9', color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px 22px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
              }}>Next: Size systems →</button>
            </div>
          </div>
        )}

        {/* ── STEP 1: Size systems ────────────────────────────── */}
        {step === 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20 }}>

            {/* Left: sliders */}
            <div>
              <h2 style={{ fontSize: 18, marginBottom: 6 }}>Size your energy systems</h2>
              <p style={{ color: 'var(--text-2)', fontSize: 13, marginBottom: 6 }}>
                Mode: <strong style={{ color: storageMode === 'h2' ? '#10b981' : '#3b82f6' }}>
                  {storageMode === 'h2' ? '🟢 Green Hydrogen' : '⚡ Battery Storage'}
                </strong>
                &nbsp;·&nbsp; GHI: <strong style={{ color: '#f59e0b' }}>{ghi} kWh/m²/yr</strong>
                &nbsp;·&nbsp; Peak load: <strong style={{ color: '#38bdf8' }}>{results.peakLoad.toLocaleString()} kW</strong>
              </p>

              <div style={card}>
                {sliders.map(s => (
                  <SliderRow key={s.key}
                    {...s}
                    value={comp[s.key]}
                    capexLabel={`CAPEX: ${fmtM(comp[s.key] * CAPEX[s.key])} · O&M: ${fmtM(comp[s.key] * CAPEX[s.key] * (s.key === 'electrolyzer' ? 0.02 : 0.01))}/yr`}
                    onChange={val => updateComp(s.key, val)}
                    onMaxChange={val => updateSliderMax(s.key, val)} />
                ))}
              </div>

              {/* Target RE input */}
              <div style={{ ...card, marginTop: 12, marginBottom: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>🎯 Optimization Target</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>Min RE fraction required</span>
                  <input
                    type="number" min={0} max={100} step={5} value={targetRe}
                    onChange={e => setTargetRe(Math.max(0, Math.min(100, +e.target.value)))}
                    style={{
                      width: 64, padding: '4px 8px', borderRadius: 6, fontSize: 13,
                      background: 'var(--bg-1)', color: '#10b981',
                      border: '1px solid #10b981', fontWeight: 700, textAlign: 'center',
                    }}
                  />
                  <span style={{ fontSize: 13, color: '#10b981', fontWeight: 700 }}>%</span>
                </div>
                {/* Live actual RE from simulation */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>Actual RE (current sizing)</span>
                  <span style={{ fontWeight: 700, fontSize: 13, color: results.reFraction >= targetRe ? '#10b981' : '#ef4444' }}>
                    {results.reFraction}%
                    {results.reFraction >= targetRe
                      ? ' ✅'
                      : ` ⚠️ (need ${targetRe}%)`}
                  </span>
                </div>
                {/* Optimizer result */}
                {optimizeResult && (
                  <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--bg-1)', fontSize: 11 }}>
                    <span style={{ color: 'var(--text-2)' }}>Optimizer → </span>
                    <span style={{ color: '#10b981', fontWeight: 600 }}>RE: {optimizeResult.actual_re}%</span>
                    <span style={{ color: 'var(--text-3)' }}> · </span>
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>LCOE: {optimizeResult.lcoe}¢/kWh</span>
                    <span style={{ color: 'var(--text-3)' }}> · </span>
                    <span style={{ color: '#3b82f6', fontWeight: 600 }}>€{Math.round(optimizeResult.estimated_annual_cost_eur / 1000)}k/yr</span>
                  </div>
                )}
              </div>

              {/* Optimize button */}
              <button onClick={handleOptimize} disabled={optimizing} style={{
                width: '100%', marginTop: 12,
                background: optimizing ? 'var(--bg-3)' : '#7c3aed',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '11px 16px', fontWeight: 600, cursor: optimizing ? 'not-allowed' : 'pointer', fontSize: 13,
              }}>
                {optimizing ? '⏳ Optimizing...' : '🧮 LP Optimize via backend'}
              </button>
              {optimizeMsg && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>
                  {optimizeMsg}
                </div>
              )}
            </div>

            {/* Right: live KPIs + cost pie */}
            <div>
              <div style={{ ...card, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Live performance metrics</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <KpiCard label="Total CAPEX" value={fmtM(results.totalCapex)} color="#3b82f6" />
                  <KpiCard label="Annual cost" value={`${fmtM(results.annualCost)}/yr`} color="#f59e0b" />
                  <KpiCard label="LCOE" value={`${results.lcoe}¢/kWh`} color="#10b981" />
                  <KpiCard label="Self-supply" value={`${results.selfSupplyRate}%`} color="#8b5cf6" />
                  <KpiCard label="H2 produced" value={`${(results.yrH2 / 1000).toFixed(1)} t/yr`} color="#06b6d4" />
                  <KpiCard label="Water for H2" value={`${results.yrWaterM3} m³/yr`} color="#06b6d4" />
                  <KpiCard label="RE fraction" value={`${results.reFraction}%`} color="#10b981" />
                  <KpiCard label="Grid import" value={`${results.yrGridImportMWh} MWh/yr`} color="#ef4444" />
                </div>
              </div>

              <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Annual cost breakdown</div>
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={results.costBreakdown} cx="50%" cy="50%" outerRadius={80}
                      dataKey="value" nameKey="name"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={{ stroke: '#64748b' }}>
                      {results.costBreakdown.map((_, i) => (
                        <Cell key={i} fill={['#3b82f6', '#10b981', '#f59e0b', '#06b6d4'][i]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={v => [`€${v.toLocaleString()}/yr`]} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ScoreDisplay score={score} />
            </div>
          </div>
        )}

        {/* ── STEP 2: Results ─────────────────────────────────── */}
        {step === 2 && (
          <div>
            {/* Score banner */}
            <div style={{
              ...card, marginBottom: 20, textAlign: 'center',
              border: `2px solid ${scoreRating(score).color}`,
            }}>
              <div style={{ fontSize: 36, marginBottom: 4 }}>
                {score >= 750 ? '🏆' : score >= 550 ? '⭐' : score >= 350 ? '🔵' : '🔴'}
              </div>
              <div style={{ fontSize: 30, fontWeight: 700, color: scoreRating(score).color }}>{score} pts</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{scoreRating(score).label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                LCOE: {results.lcoe}¢/kWh · RE: {results.reFraction}% · H2: {(results.yrH2 / 1000).toFixed(1)} t/yr · Self-supply: {results.selfSupplyRate}%
              </div>
            </div>

            {/* 24h dispatch */}
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>24-hour energy dispatch</div>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={results.hourly}>
                  <defs>
                    {[['solar', C.solar], ['fuelcell', C.fuelcell], ['battery', C.battery], ['gridImport', C.grid]].map(([key, color]) => (
                      <linearGradient key={key} id={`g_${key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.5} />
                        <stop offset="95%" stopColor={color} stopOpacity={0.05} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} tick={{ fontSize: 10, fill: '#64748b' }} tickCount={8} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} unit=" kW" />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area dataKey="solar" stackId="s" stroke={C.solar} fill={`url(#g_solar)`} strokeWidth={1.5} name="Solar PV" />
                  <Area dataKey="fuelcell" stackId="s" stroke={C.fuelcell} fill={`url(#g_fuelcell)`} strokeWidth={1.5} name="Fuel cell" />
                  <Area dataKey="battery" stackId="s" stroke={C.battery} fill={`url(#g_battery)`} strokeWidth={1.5} name="Battery" />
                  <Area dataKey="gridImport" stackId="s" stroke={C.grid} fill={`url(#g_gridImport)`} strokeWidth={1.5} name="Grid import" />
                  <Line dataKey="load" stroke="#fff" strokeWidth={2} dot={false} name="Load" strokeDasharray="5 4" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Storage levels + cost bar */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Storage state of charge</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={results.hourly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="hour" tickFormatter={h => `${h}:00`} tick={{ fontSize: 10, fill: '#64748b' }} tickCount={8} />
                    <YAxis yAxisId="h2" tick={{ fontSize: 10, fill: '#06b6d4' }} unit=" kg" />
                    <YAxis yAxisId="batt" orientation="right" tick={{ fontSize: 10, fill: '#3b82f6' }} unit=" kWh" />
                    <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="h2" dataKey="h2Level" stroke="#06b6d4" strokeWidth={2} dot={false} name="H2 level (kg)" />
                    <Line yAxisId="batt" dataKey="battLevel" stroke="#3b82f6" strokeWidth={2} dot={false} name="Battery (kWh)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={card}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Annual cost breakdown</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={results.costBreakdown} layout="vertical">
                    <XAxis type="number" tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} width={55} />
                    <Tooltip formatter={v => [`€${v.toLocaleString()}/yr`]} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {results.costBreakdown.map((_, i) => (
                        <Cell key={i} fill={['#3b82f6', '#10b981', '#f59e0b', '#06b6d4'][i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Summary KPI grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { emoji: '💶', label: 'Total CAPEX', value: fmtM(results.totalCapex), sub: 'One-time investment', color: '#3b82f6' },
                { emoji: '📅', label: 'Annual cost', value: `${fmtM(results.annualCost)}/yr`, sub: 'Annualised total (CRF)', color: '#f59e0b' },
                { emoji: '💧', label: 'Water for electrolysis', value: `${results.yrWaterM3} m³/yr`, sub: '9 L per kg H2', color: '#06b6d4' },
                { emoji: '🌿', label: 'CO2 avoided', value: `~${results.co2Avoided} t/yr`, sub: 'vs grey H2 baseline', color: '#10b981' },
              ].map(({ emoji, label, value, sub, color }) => (
                <div key={label} style={{ ...card, textAlign: 'center', border: `1px solid ${color}44` }}>
                  <div style={{ fontSize: 26, marginBottom: 4 }}>{emoji}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-2)' }}>{label}</div>
                  <div style={{ fontWeight: 700, fontSize: 17, color, margin: '2px 0' }}>{value}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{sub}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <button onClick={() => setStep(0)} style={{
                background: 'var(--bg-2)', color: 'var(--text-1)',
                border: '1px solid var(--border)', borderRadius: 8,
                padding: '9px 18px', cursor: 'pointer', fontSize: 13,
              }}>← Redesign district</button>
              <button onClick={() => setStep(1)} style={{
                background: '#0ea5e9', color: '#fff', border: 'none',
                borderRadius: 8, padding: '9px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 13,
              }}>⚙️ Resize systems</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
