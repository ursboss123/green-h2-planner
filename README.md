# 🌱 Green H2 City Planner

An interactive techno-economic optimization game for sizing green hydrogen,
battery, and solar systems across multi-building districts (residential,
hospital, school).

---

## 📁 Project Structure

```
green-h2-planner/
├── frontend/                   React 18 + Vite + Recharts UI
│   ├── src/
│   │   ├── App.jsx             Main 3-step wizard UI
│   │   ├── simulation.js       Client-side dispatch + cost model
│   │   ├── main.jsx            React entry point
│   │   └── index.css           Dark theme + range slider styles
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── postcss.config.js
│
└── backend/                    Python FastAPI optimizer
    ├── main.py                 REST API with /api/optimize endpoint
    ├── optimizer.py            Physics-based least-cost sizing engine
    └── requirements.txt
```

---

## 🖥️ Local Development

### Prerequisites
- Node.js >= 18
- Python >= 3.10
- npm or yarn

### 1. Start the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
python main.py                    # starts on http://localhost:8000
```

Test it:
```bash
curl http://localhost:8000/health
# → {"status":"ok"}

curl -X POST http://localhost:8000/api/optimize \
  -H "Content-Type: application/json" \
  -d '{"buildings": {"residential": {"enabled": true, "units": 10}, "hospital": {"enabled": false, "units": 1}, "school": {"enabled": false, "units": 1}}}'
```

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev                       # starts on http://localhost:5173
```

Open http://localhost:5173 — the game is live!

---

## 🌐 Free Online Hosting (3 Options)

---

### ✅ Option A — Render.com (backend) + Vercel (frontend)  ← RECOMMENDED

#### Step 1 — Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/green-h2-planner.git
git push -u origin main
```

#### Step 2 — Deploy backend to Render.com

1. Go to https://render.com → sign up free → New → Web Service
2. Connect your GitHub repo
3. Configure:
   | Setting        | Value                                              |
   |----------------|----------------------------------------------------|
   | Root Directory | `backend`                                          |
   | Runtime        | Python 3                                           |
   | Build Command  | `pip install -r requirements.txt`                  |
   | Start Command  | `uvicorn main:app --host 0.0.0.0 --port $PORT`     |
   | Instance Type  | Free                                               |
4. Click Deploy → wait ~2 min
5. Copy your URL: `https://green-h2-api-xxxx.onrender.com`

> ⚠️ Render free tier sleeps after 15 min inactivity. First request ~30s cold start.

#### Step 3 — Deploy frontend to Vercel

1. Go to https://vercel.com → New Project → Import from GitHub
2. Configure:
   | Setting           | Value            |
   |-------------------|------------------|
   | Root Directory    | `frontend`       |
   | Framework Preset  | Vite             |
3. Add Environment Variable:
   - Key:   `VITE_API_URL`
   - Value: `https://green-h2-api-xxxx.onrender.com`   ← your Render URL
4. Deploy!

🎉 Your game is live at `https://your-project.vercel.app`

---

### Option B — GitHub Pages (frontend only, no backend)

The simulation engine runs 100% in the browser. Only the "Auto-Optimize" button
needs the backend. All sliders, charts and scoring work without it.

```bash
cd frontend
npm install
npm run build                 # creates dist/ folder

# Install gh-pages helper
npm install -D gh-pages

# Add to package.json scripts:
#   "deploy": "gh-pages -d dist"
npm run deploy
```

Or simply drag-drop the `dist/` folder into https://netlify.com/drop — instant!

---

### Option C — Railway.app (all-in-one)

Railway hosts both services in one project with a generous free tier.

1. https://railway.app → New Project → Deploy from GitHub Repo
2. Add Service → select `/backend` → Railway auto-detects Python
3. Add another Service → select `/frontend` → set as Static site
4. Set env var `VITE_API_URL` in the frontend service to the backend's Railway URL
5. Done — Railway auto-deploys on every git push

---

## ⚙️ System Model

### Building Types

| Building     | Peak Demand | Load Profile      |
|--------------|-------------|-------------------|
| Residential  | 2.5 kW/unit | Evening peak      |
| Hospital     | 80 kW/unit  | Flat (high 24/7)  |
| School       | 15 kW/unit  | Daytime only      |

Solar profile: Abu Dhabi (peak at solar noon, ~10 h/day sunshine)

### Components & Costs

| Component         | CAPEX       | O&M     | Unit   |
|-------------------|-------------|---------|--------|
| Solar PV          | €900/kW     | 1%/yr   | kW     |
| PEM Electrolyzer  | €1200/kW    | 2%/yr   | kW     |
| H2 Steel Tank     | €600/kg     | 1%/yr   | kg H2  |
| PEM Fuel Cell     | €1800/kW    | 2%/yr   | kW     |
| Li-ion Battery    | €450/kWh    | 1%/yr   | kWh    |

### Technical Parameters

| Parameter               | Value        |
|-------------------------|--------------|
| Electrolyzer efficiency | 50 kWh/kg H2 |
| Water consumption       | 9 L/kg H2    |
| Fuel cell efficiency    | 50% (HHV)    |
| H2 HHV                  | 39.4 kWh/kg  |
| Battery round-trip eff. | 90%          |
| Grid buy price          | €0.18/kWh    |
| Grid sell price         | €0.05/kWh    |
| Water cost              | €0.003/L     |
| Project lifetime        | 25 years     |
| Discount rate           | 6%           |

### Dispatch Priority (per hour)
1. Solar PV meets load directly
2. Surplus  → charge battery → run electrolyzer → export to grid
3. Deficit  → discharge battery → fuel cell (from H2) → import from grid

### Scoring System (0–1000 points)

| Criterion          | Max  | Description                        |
|--------------------|------|------------------------------------|
| Self-supply ratio  | 300  | % of load met by local generation  |
| Cost efficiency    | 250  | Lower LCOE → higher score          |
| H2 integration     | 150  | H2 fraction of total generation    |
| Battery balance    | 150  | Balanced sizing (not oversized)    |
| Grid independence  | 150  | Low grid import fraction           |

Ratings: <400 Needs Optimization · 400–599 Competent · 600–799 Expert · 800+ Master Engineer

---

## 📚 References

- IRENA (2023). Green Hydrogen Cost Reduction Roadmap.
- NREL (2022). Hydrogen Production Cost Analysis.
- IEA (2023). World Energy Outlook — Hydrogen chapter.
- Staffell et al. (2019). The role of hydrogen and fuel cells in the global energy system. Energy Environ. Sci.

---

## 📄 License

MIT — free for academic and commercial use.
