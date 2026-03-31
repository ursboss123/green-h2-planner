from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Optional
import logging

from optimizer import optimise, GHI_REF

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Green H2 City Planner API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)


class BuildingConfig(BaseModel):
    enabled: bool = True
    units: int = 1


class OptimiseRequest(BaseModel):
    buildings: Dict[str, BuildingConfig]
    storage_mode: str = "h2"          # 'h2' or 'battery'
    target_re: float = 0.5            # 0–1, minimum RE fraction required
    ghi: float = GHI_REF              # site GHI kWh/m²/yr


class OptimiseResponse(BaseModel):
    solar_kw: float
    electrolyzer_kw: float
    h2tank_kg: float
    fuelcell_kw: float
    battery_kwh: float
    actual_re: Optional[float] = None           # % achieved
    lcoe: Optional[float] = None                # ct/kWh
    estimated_annual_cost_eur: Optional[float] = None


@app.get("/")
def root():
    return {"message": "Green H2 City Planner API v2 🌱"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/optimize", response_model=OptimiseResponse)
def api_optimise(request: OptimiseRequest):
    try:
        buildings_dict = {
            k: {"enabled": v.enabled, "units": v.units}
            for k, v in request.buildings.items()
        }
        logger.info(f"Optimising: mode={request.storage_mode} RE>={request.target_re*100:.0f}% GHI={request.ghi}")
        result = optimise(
            buildings=buildings_dict,
            storage_mode=request.storage_mode,
            target_re=request.target_re,
            ghi=request.ghi,
        )
        logger.info(f"Result: LCOE={result.get('lcoe')}ct RE={result.get('actual_re')}%")
        return result
    except Exception as e:
        logger.error(f"Optimisation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
