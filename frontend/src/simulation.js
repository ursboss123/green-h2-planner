// ============================================================
// GREEN H2 CITY PLANNER — SIMULATION ENGINE
// Techno-economic dispatch + cost model
// ============================================================

// --- Load profiles (0-1 normalized, 24 hours) ---
export const SOLAR_PROFILE = [
  0, 0, 0, 0, 0, 0.03, 0.12, 0.30, 0.52, 0.70, 0.83, 0.91,
  0.95, 0.91, 0.83, 0.70, 0.52, 0.30, 0.10, 0.02, 0, 0, 0, 0,
]

export const LOAD_PROFILES = {
  residential: [
    0.42, 0.38, 0.35, 0.34, 0.36, 0.43, 0.58, 0.72,
    0.65, 0.55, 0.52, 0.56, 0.60, 0.58, 0.57, 0.62,
    0.70, 0.82, 0.92, 0.89, 0.84, 0.74, 0.63, 0.52,
  ],
  hospital: [
    0.76, 0.73, 0.71, 0.70, 0.72, 0.76, 0.81, 0.88,
    0.93, 0.96, 0.98, 1.00, 1.00, 0.98, 0.97, 0.95,
    0.94, 0.93, 0.91, 0.89, 0.87, 0.84, 0.81, 0.78,
  ],
  school: [
    0.08, 0.07, 0.07, 0.07, 0.08, 0.10, 0.18, 0.45,
    0.78, 0.92, 0.96, 1.00, 0.96, 0.94, 0.90, 0.72,
    0.38, 0.18, 0.10, 0.08, 0.07, 0.07, 0.07, 0.08,
  ],
}

// --- Technical parameters ---
export const PEAK_DEMAND_KW = { residential: 2.5, hospital: 80, school: 15 }
export const ELEC_EFF = 50       // kWh per kg H2
export const WATER_PER_H2 = 9   // litres per kg H2
export const FC_EFF = 0.50      // kWh electricity per kWh H2 HHV
export const H2_HHV = 39.4      // kWh per kg H2
export const BATT_EFF = 0.95    // round-trip per side (charge/discharge)
export const MAX_GRID_KW = 100_000

// --- Techno-economic parameters ---
export const CAPEX = { solar: 900, electrolyzer: 1200, h2tank: 600, fuelcell: 1800, battery: 450 }
export const OPEX_FRAC = { solar: 0.01, electrolyzer: 0.02, h2tank: 0.01, fuelcell: 0.02, battery: 0.01 }
export const GRID_BUY = 0.18    // €/kWh
export const GRID_SELL = 0.05   // €/kWh
export const WATER_COST = 0.003 // €/litre

export const LIFETIME = 25
export const DISCOUNT_RATE = 0.06
export const CRF = (DISCOUNT_RATE * Math.pow(1 + DISCOUNT_RATE, LIFETIME)) /
  (Math.pow(1 + DISCOUNT_RATE, LIFETIME) - 1)

// ============================================================
// Main simulation function
// ============================================================
export function simulate(buildings, components) {
  // buildings: { residential: {enabled, count}, hospital: {...}, school: {...} }
  // components: { solar, electrolyzer, h2tank, fuelcell, battery } all in kW/kWh/kg

  const hours = Array.from({ length: 24 }, (_, i) => i)

  // Total electrical load per hour (kW)
  const totalLoad = hours.map(h =>
    Object.entries(buildings).reduce((sum, [type, b]) =>
      b.enabled
        ? sum + LOAD_PROFILES[type][h] * PEAK_DEMAND_KW[type] * b.count
        : sum, 0)
  )

  // Solar generation per hour (kW)
  const solarGen = hours.map(h => SOLAR_PROFILE[h] * components.solar)

  // Initialise storage states
  let battSOC = components.battery * 0.50   // start at 50% SOC
  let h2Level = components.h2tank * 0.30    // start at 30% full

  const hourlyResults = []
  let totGridImport = 0, totGridExport = 0
  let totH2Produced = 0, totWaterUsed = 0

  for (const h of hours) {
    const load = totalLoad[h]
    const pv = solarGen[h]

    let surplus = pv - load
    let gridImport = 0, gridExport = 0
    let battCharge = 0, battDischarge = 0
    let electrolyzerPow = 0, fuelcellPow = 0
    let h2Produced = 0, h2Consumed = 0

    if (surplus >= 0) {
      // --- Surplus: charge battery, then run electrolyzer, then export ---
      const battRoom = (components.battery - battSOC) / BATT_EFF
      const ch = Math.min(surplus, battRoom, components.battery * 0.5)
      battCharge = ch
      battSOC = Math.min(components.battery, battSOC + ch * BATT_EFF)
      surplus -= ch

      // Electrolyze remaining surplus if H2 tank has room
      const maxElec = Math.min(surplus, components.electrolyzer)
      if (maxElec > 0 && h2Level < components.h2tank) {
        const h2Can = Math.min(maxElec / ELEC_EFF, components.h2tank - h2Level)
        electrolyzerPow = h2Can * ELEC_EFF
        h2Produced = h2Can
        h2Level += h2Produced
        totWaterUsed += h2Produced * WATER_PER_H2
        surplus -= electrolyzerPow
      }

      gridExport = Math.max(0, surplus)
      totGridExport += gridExport

    } else {
      // --- Deficit: discharge battery, then fuel cell, then import from grid ---
      let deficit = -surplus

      const dis = Math.min(battSOC * BATT_EFF, components.battery * 0.5, deficit)
      battDischarge = dis
      battSOC = Math.max(0, battSOC - dis / BATT_EFF)
      deficit -= dis

      if (deficit > 0 && h2Level > 0.001) {
        const maxFC = Math.min(components.fuelcell, deficit)
        const h2Need = maxFC / (FC_EFF * H2_HHV)
        const h2Avail = Math.min(h2Need, h2Level)
        fuelcellPow = h2Avail * FC_EFF * H2_HHV
        h2Consumed = h2Avail
        h2Level = Math.max(0, h2Level - h2Consumed)
        deficit -= fuelcellPow
      }

      gridImport = Math.min(deficit, MAX_GRID_KW)
      totGridImport += gridImport
    }

    totH2Produced += h2Produced

    hourlyResults.push({
      hour: h,
      load: +load.toFixed(1),
      solar: +pv.toFixed(1),
      fuelcell: +fuelcellPow.toFixed(1),
      battery: +(battDischarge - battCharge).toFixed(1),
      gridImport: +gridImport.toFixed(1),
      gridExport: +gridExport.toFixed(1),
      electrolyzer: +electrolyzerPow.toFixed(1),
      h2Level: +h2Level.toFixed(2),
      battLevel: +battSOC.toFixed(1),
    })
  }

  // --- Annual scaling (365 days) ---
  const yrGridImport = totGridImport * 365    // kWh/yr
  const yrGridExport = totGridExport * 365
  const yrH2 = totH2Produced * 365           // kg/yr
  const yrWater = totWaterUsed * 365         // litres/yr

  // --- CAPEX ---
  const capexSolar = components.solar * CAPEX.solar
  const capexElec = components.electrolyzer * CAPEX.electrolyzer
  const capexH2 = components.h2tank * CAPEX.h2tank
  const capexFC = components.fuelcell * CAPEX.fuelcell
  const capexBatt = components.battery * CAPEX.battery
  const totalCapex = capexSolar + capexElec + capexH2 + capexFC + capexBatt

  // --- Annual costs ---
  const annCapex = totalCapex * CRF
  const annOpex =
    capexSolar * OPEX_FRAC.solar +
    capexElec * OPEX_FRAC.electrolyzer +
    capexH2 * OPEX_FRAC.h2tank +
    capexFC * OPEX_FRAC.fuelcell +
    capexBatt * OPEX_FRAC.battery
  const annGridCost = yrGridImport * GRID_BUY - yrGridExport * GRID_SELL
  const annWaterCost = (yrWater / 1000) * WATER_COST * 1000  // yrWater in litres
  const totalAnnualCost = annCapex + annOpex + annGridCost + annWaterCost

  // --- KPIs ---
  const totalLoad24h = totalLoad.reduce((a, b) => a + b, 0)   // kWh
  const totalSolar24h = solarGen.reduce((a, b) => a + b, 0)
  const peakLoad = Math.max(...totalLoad)

  const selfSupplyRate = totalLoad24h > 0
    ? Math.min(100, Math.round((1 - totGridImport / totalLoad24h) * 100))
    : 100

  const lcoe = totalLoad24h > 0
    ? (totalAnnualCost / (totalLoad24h * 365)) * 100   // ct/kWh
    : 0

  const reFraction = totalLoad24h > 0
    ? Math.min(100, Math.round((totalSolar24h / totalLoad24h) * 100))
    : 0

  // Rough CO2 avoided: grid import baseline vs actual (0.4 kg CO2/kWh grid factor)
  const co2Avoided = Math.round(yrH2 * 9 / 1000)  // tonnes (H2 replaces grey H2)

  return {
    hourly: hourlyResults,
    // Capacity
    peakLoad: Math.round(peakLoad),
    dailyEnergy: Math.round(totalLoad24h),
    // Economics
    totalCapex: Math.round(totalCapex),
    annualCost: Math.round(totalAnnualCost),
    annCapex: Math.round(annCapex),
    annOpex: Math.round(annOpex),
    annGridCost: Math.round(annGridCost),
    annWaterCost: Math.round(annWaterCost),
    lcoe: +lcoe.toFixed(2),
    // Performance
    selfSupplyRate,
    reFraction,
    yrH2: Math.round(yrH2),
    yrWaterM3: Math.round(yrWater / 1000),
    yrGridImportMWh: Math.round(yrGridImport / 1000),
    yrGridExportMWh: Math.round(yrGridExport / 1000),
    co2Avoided,
    // Chart data
    costBreakdown: [
      { name: 'CAPEX', value: Math.round(annCapex) },
      { name: 'O&M', value: Math.round(annOpex) },
      { name: 'Grid', value: Math.round(Math.max(0, annGridCost)) },
      { name: 'Water', value: Math.round(annWaterCost) },
    ],
  }
}

// ============================================================
// Scoring function
// ============================================================
export function calcScore(results) {
  if (results.peakLoad === 0) return 0
  const costScore = Math.max(0, 500 - results.lcoe * 8)
  const reScore = results.reFraction * 1.5
  const h2Score = Math.min(150, results.yrH2 / 80)
  return Math.round(costScore + reScore + h2Score)
}

export function scoreRating(score) {
  if (score >= 750) return { label: 'Master engineer', color: '#d97706' }
  if (score >= 550) return { label: 'Expert designer', color: '#10b981' }
  if (score >= 350) return { label: 'Competent planner', color: '#3b82f6' }
  return { label: 'Needs optimization', color: '#ef4444' }
}
