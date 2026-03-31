# ============================================================
# GREEN H2 CITY PLANNER — OPTIMIZER
# Proper hour-by-hour dispatch simulation + parametric sweep
# Minimises LCOE subject to a minimum RE fraction constraint.
# ============================================================

import numpy as np
from typing import Dict

# ── Techno-economic constants ─────────────────────────────────────────────────
CAPEX        = dict(solar=900, electrolyzer=1200, h2tank=600, fuelcell=1800, battery=450)
OPEX_FRAC    = dict(solar=0.01, electrolyzer=0.02, h2tank=0.01, fuelcell=0.02, battery=0.01)
LIFETIME     = 25
DR           = 0.06
CRF          = DR * (1 + DR)**LIFETIME / ((1 + DR)**LIFETIME - 1)
GRID_BUY     = 0.18    # €/kWh
GRID_SELL    = 0.05    # €/kWh
WATER_COST   = 0.003   # €/litre
ELEC_EFF     = 50.0    # kWh/kg H2
WATER_KG     = 9.0     # L/kg H2
FC_EFF       = 0.50    # fuel cell electric efficiency (HHV)
H2_HHV       = 39.4    # kWh/kg
BATT_EFF     = 0.95    # one-way battery efficiency
GHI_REF      = 2285.0  # Abu Dhabi baseline kWh/m²/yr

# ── Profiles ──────────────────────────────────────────────────────────────────
SOLAR_PROFILE = np.array([
    0, 0, 0, 0, 0, 0.03, 0.12, 0.30, 0.52, 0.70, 0.83, 0.91,
    0.95, 0.91, 0.83, 0.70, 0.52, 0.30, 0.10, 0.02, 0, 0, 0, 0,
])

LOAD_PROFILES = {
    "residential": np.array([0.42,0.38,0.35,0.34,0.36,0.43,0.58,0.72,
                              0.65,0.55,0.52,0.56,0.60,0.58,0.57,0.62,
                              0.70,0.82,0.92,0.89,0.84,0.74,0.63,0.52]),
    "hospital":    np.array([0.76,0.73,0.71,0.70,0.72,0.76,0.81,0.88,
                              0.93,0.96,0.98,1.00,1.00,0.98,0.97,0.95,
                              0.94,0.93,0.91,0.89,0.87,0.84,0.81,0.78]),
    "school":      np.array([0.08,0.07,0.07,0.07,0.08,0.10,0.18,0.45,
                              0.78,0.92,0.96,1.00,0.96,0.94,0.90,0.72,
                              0.38,0.18,0.10,0.08,0.07,0.07,0.07,0.08]),
}
PEAK_KW = dict(residential=2.5, hospital=80.0, school=15.0)


# ── Build load array ──────────────────────────────────────────────────────────
def build_load(buildings: Dict) -> np.ndarray:
    load = np.zeros(24)
    for btype, cfg in buildings.items():
        if cfg.get("enabled") and btype in LOAD_PROFILES:
            load += LOAD_PROFILES[btype] * PEAK_KW[btype] * cfg.get("units", 1)
    return load


# ── Full hourly dispatch simulation ──────────────────────────────────────────
def dispatch(load: np.ndarray, solar_kw: float, elec_kw: float, h2tank_kg: float,
             fc_kw: float, batt_kwh: float, ghi_scale: float = 1.0):
    """
    Run 24-h dispatch. Returns dict of annual KPIs.
    Dispatch priority:
      Surplus  → battery charge → electrolyzer → grid export
      Deficit  → battery discharge → fuel cell → grid import
    """
    pv = SOLAR_PROFILE * solar_kw * ghi_scale

    batt_soc = batt_kwh * 0.50
    h2_level = h2tank_kg * 0.30

    tot_grid_imp = tot_grid_exp = 0.0
    tot_h2_prod = tot_water = 0.0
    tot_solar_used = 0.0     # solar directly meeting load or stored
    tot_load = float(load.sum())

    for h in range(24):
        L = load[h]
        P = pv[h]
        surplus = P - L

        if surplus >= 0:
            # 1. Charge battery
            room = (batt_kwh - batt_soc) / BATT_EFF
            ch = min(surplus, room, batt_kwh * 0.5)
            batt_soc = min(batt_kwh, batt_soc + ch * BATT_EFF)
            surplus -= ch

            # 2. Electrolyze
            if elec_kw > 0 and h2_level < h2tank_kg:
                pw = min(surplus, elec_kw)
                h2_can = min(pw / ELEC_EFF, h2tank_kg - h2_level)
                pw = h2_can * ELEC_EFF
                h2_level += h2_can
                tot_h2_prod += h2_can
                tot_water += h2_can * WATER_KG
                surplus -= pw

            # 3. Export remainder
            tot_grid_exp += max(0, surplus)
            tot_solar_used += P

        else:
            deficit = -surplus
            tot_solar_used += P   # all solar was used

            # 1. Battery discharge
            dis = min(batt_soc * BATT_EFF, batt_kwh * 0.5, deficit)
            batt_soc = max(0, batt_soc - dis / BATT_EFF)
            deficit -= dis

            # 2. Fuel cell
            if fc_kw > 0 and h2_level > 1e-6:
                pw = min(fc_kw, deficit)
                h2_need = pw / (FC_EFF * H2_HHV)
                h2_avail = min(h2_need, h2_level)
                fc_out = h2_avail * FC_EFF * H2_HHV
                h2_level = max(0, h2_level - h2_avail)
                deficit -= fc_out

            # 3. Grid import
            tot_grid_imp += deficit

    # ── Annual scaling ────────────────────────────────────────────────────────
    yr_grid_imp  = tot_grid_imp * 365
    yr_grid_exp  = tot_grid_exp * 365
    yr_h2        = tot_h2_prod * 365
    yr_water     = tot_water * 365
    yr_load      = tot_load * 365

    # ── CAPEX / OPEX ──────────────────────────────────────────────────────────
    cap = dict(solar=solar_kw, electrolyzer=elec_kw, h2tank=h2tank_kg,
               fuelcell=fc_kw, battery=batt_kwh)
    total_capex = sum(CAPEX[k] * v for k, v in cap.items())
    ann_capex   = total_capex * CRF
    ann_opex    = sum(CAPEX[k] * v * OPEX_FRAC[k] for k, v in cap.items())
    ann_grid    = yr_grid_imp * GRID_BUY - yr_grid_exp * GRID_SELL
    ann_water   = yr_water * WATER_COST
    ann_total   = ann_capex + ann_opex + ann_grid + ann_water

    # ── KPIs ─────────────────────────────────────────────────────────────────
    lcoe = (ann_total / yr_load * 100) if yr_load > 0 else 9999   # ct/kWh
    re_frac = min(1.0, (tot_solar_used / tot_load)) if tot_load > 0 else 0.0

    return dict(
        lcoe=lcoe,
        re_frac=re_frac,
        ann_total=ann_total,
        total_capex=total_capex,
        yr_h2=yr_h2,
        yr_grid_imp=yr_grid_imp,
    )


# ── Main optimiser ────────────────────────────────────────────────────────────
def optimise(buildings: Dict, storage_mode: str = "h2",
             target_re: float = 0.5, ghi: float = GHI_REF) -> Dict:
    """
    Parametric sweep to find minimum-LCOE sizing that meets target_re.

    storage_mode: 'h2' → size electrolyzer/h2tank/fuelcell, battery=0
                  'battery' → size battery, electrolyzer/h2tank/fuelcell=0
    target_re:    minimum RE fraction required (0–1)
    ghi:          site GHI kWh/m²/yr
    """
    load = build_load(buildings)
    peak = float(load.max())
    total_e = float(load.sum())   # kWh/day

    if peak < 0.01:
        return _zeros()

    ghi_scale = ghi / GHI_REF

    best_lcoe = 1e9
    best = None

    # Solar sweep: 0.3x to 5x peak load
    solar_mults = np.linspace(0.3, 5.0, 30)

    for sm in solar_mults:
        solar_kw = peak * sm
        pv = SOLAR_PROFILE * solar_kw * ghi_scale
        surplus_arr = np.maximum(0, pv - load)
        deficit_arr = np.maximum(0, load - pv)
        tot_surplus = float(surplus_arr.sum())
        tot_deficit = float(deficit_arr.sum())
        peak_surplus = float(surplus_arr.max()) if surplus_arr.max() > 0 else 1.0
        peak_deficit = float(deficit_arr.max()) if deficit_arr.max() > 0 else 1.0

        if storage_mode == "h2":
            # Sweep storage ratio: how much surplus goes to H2 vs grid
            for stor_ratio in np.linspace(0.1, 1.0, 10):
                elec_kw   = peak_surplus * stor_ratio
                h2_per_day = min(tot_surplus * stor_ratio, elec_kw * 10) / ELEC_EFF
                h2tank_kg  = h2_per_day * 1.5   # 1.5 days buffer
                fc_kw      = peak_deficit * stor_ratio
                batt_kwh   = 0.0

                res = dispatch(load, solar_kw, elec_kw, h2tank_kg, fc_kw, batt_kwh, ghi_scale)

                if res["re_frac"] < target_re - 0.02:
                    continue   # doesn't meet RE target

                if res["lcoe"] < best_lcoe:
                    best_lcoe = res["lcoe"]
                    best = dict(
                        solar_kw=round(solar_kw, 1),
                        electrolyzer_kw=round(elec_kw, 1),
                        h2tank_kg=round(h2tank_kg, 1),
                        fuelcell_kw=round(fc_kw, 1),
                        battery_kwh=0.0,
                        actual_re=round(res["re_frac"] * 100, 1),
                        lcoe=round(res["lcoe"], 2),
                        estimated_annual_cost_eur=round(res["ann_total"], 0),
                    )

        else:  # battery
            for stor_ratio in np.linspace(0.1, 1.0, 10):
                batt_kwh  = tot_surplus * stor_ratio * 1.5
                elec_kw   = 0.0
                h2tank_kg = 0.0
                fc_kw     = 0.0

                res = dispatch(load, solar_kw, elec_kw, h2tank_kg, fc_kw, batt_kwh, ghi_scale)

                if res["re_frac"] < target_re - 0.02:
                    continue

                if res["lcoe"] < best_lcoe:
                    best_lcoe = res["lcoe"]
                    best = dict(
                        solar_kw=round(solar_kw, 1),
                        electrolyzer_kw=0.0,
                        h2tank_kg=0.0,
                        fuelcell_kw=0.0,
                        battery_kwh=round(batt_kwh, 1),
                        actual_re=round(res["re_frac"] * 100, 1),
                        lcoe=round(res["lcoe"], 2),
                        estimated_annual_cost_eur=round(res["ann_total"], 0),
                    )

    # If no solution meets the RE target, relax and return best available
    if best is None:
        best = _fallback(load, peak, ghi_scale, storage_mode)

    return best


def _zeros():
    return dict(solar_kw=0, electrolyzer_kw=0, h2tank_kg=0,
                fuelcell_kw=0, battery_kwh=0, actual_re=0.0,
                lcoe=0.0, estimated_annual_cost_eur=0.0)


def _fallback(load, peak, ghi_scale, storage_mode):
    """Best effort sizing when RE constraint can't be met."""
    solar_kw = peak * 2.0
    pv = SOLAR_PROFILE * solar_kw * ghi_scale
    surplus = np.maximum(0, pv - load)

    if storage_mode == "h2":
        elec_kw   = float(surplus.max()) * 0.8
        h2tank_kg = float(surplus.sum()) / ELEC_EFF * 1.0
        fc_kw     = peak * 0.5
        batt_kwh  = 0.0
    else:
        elec_kw = h2tank_kg = fc_kw = 0.0
        batt_kwh = float(surplus.sum()) * 1.0

    res = dispatch(load, solar_kw, elec_kw, h2tank_kg, fc_kw, batt_kwh, ghi_scale)
    return dict(
        solar_kw=round(solar_kw, 1),
        electrolyzer_kw=round(elec_kw, 1),
        h2tank_kg=round(h2tank_kg, 1),
        fuelcell_kw=round(fc_kw, 1),
        battery_kwh=round(batt_kwh, 1),
        actual_re=round(res["re_frac"] * 100, 1),
        lcoe=round(res["lcoe"], 2),
        estimated_annual_cost_eur=round(res["ann_total"], 0),
    )
