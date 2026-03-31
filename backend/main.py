# ============================================================
# GREEN H2 CITY PLANNER — FastAPI Backend
# ============================================================
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Optional
import logging

from optimizer import optimise

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Green H2 City Planner API",
    description="Least-cost techno-economic sizing of green hydrogen systems for multi-building districts.",
    version="1.0.0",
)

# ── CORS — allow all origins (fine for demo; restrict for production) ─────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response schemas ────────────────────────────────────────────────
class BuildingConfig(BaseModel):
    enabled: bool = True
    units: int = 1


class OptimiseRequest(BaseModel):
    buildings: Dict[str, BuildingConfig]


class OptimiseResponse(BaseModel):
    solar_kw: float
    electrolyzer_kw: float
    h2tank_kg: float
    fuelcell_kw: float
    battery_kwh: float
    estimated_annual_cost_eur: Optional[float] = None


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"message": "Green H2 City Planner API is running 🌱"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/optimize", response_model=OptimiseResponse)
def api_optimise(request: OptimiseRequest):
    """
    Run least-cost sizing optimisation for the given building configuration.

    Returns recommended component sizes that minimise annualised total cost
    (CAPEX × CRF + OPEX + grid energy + water) subject to meeting hourly
    electricity demand across all active buildings.
    """
    try:
        buildings_dict = {
            k: {"enabled": v.enabled, "units": v.units}
            for k, v in request.buildings.items()
        }
        logger.info(f"Optimising for buildings: {buildings_dict}")
        result = optimise(buildings_dict)
        logger.info(f"Optimal sizing: {result}")
        return result
    except Exception as e:
        logger.error(f"Optimisation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ── Dev entry point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
