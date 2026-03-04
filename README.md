### Global Health Strain Index 2024

An interactive web dashboard built for a datathon to explore global health system pressure and simulate how a fixed budget could be deployed to reduce that pressure.

---

### Background

This project started from a competition dataset of global health statistics (burden of disease, health system resources, affordability, and related indicators).  
The main goal was to design a **Strain Index** that summarizes how much pressure a country’s health system is under, and then explore how a constrained budget could be allocated to reduce that strain.

The final product is an interactive world map and analytics panel that:

- **Visualizes** the computed **Strain Index** for 2024.
- **Shows** model-predicted strain **before and after** a simulated allocation plan.
- **Simulates** how a hypothetical fixed budget can be deployed across different policy levers to improve outcomes.

---

### What is the Strain Index?

The **Strain Index** is a composite score designed to capture health system pressure in each country.  
It is built from three main components (as seen in the app’s country detail view):

- **Burden score**: captures disease and demand-side pressure on the system.
- **Capacity gap**: reflects shortages in system capacity (for example, providers and infrastructure).
- **Affordability gap**: reflects economic and financial constraints for delivering care.

These components are combined into a single continuous index (higher values correspond to more strain).  
The feature engineering and model training process are documented in the notebook:

- `COLAB NOTEBOOK/FinTechJunkiesFinalExport.ipynb`

---

### Application Features

- **Interactive world map**
  - Choropleth view with multiple modes:
    - **Computed Strain (2024)** – the constructed Strain Index.
    - **Model Prediction Before** – predicted strain before any intervention.
    - **Model Prediction After** – predicted strain after the simulated allocation.
    - **Delta (After − Before)** – improvement or worsening in predicted strain.
  - Hover tooltip with:
    - Selected metric value.
    - Decomposition into burden, capacity gap, and affordability gap (for computed mode).
    - Best intervention lever where available.

- **Top 10 countries panel**
  - Ranks the top 10 countries by the currently selected map mode.
  - Compact bar visuals to compare relative values.
  - Clicking a row jumps to detailed metrics for that country.

- **Country detail panel**
  - Shows, for the selected country:
    - **Computed strain** and subcomponents.
    - **Predicted strain** before and after allocation, plus the change.
    - **What‑if scenarios**:
      - If **access** improves.
      - If **doctors** increase.
      - If **beds** increase.
      - Each scenario shows the resulting strain and “saved” strain.
    - **Best action**:
      - Recommended lever (Access / Doctors / Beds).
      - Estimated **cost**, **ROI**, and **strain improvement** for that lever.
    - Final post‑allocation values for access, doctors, and beds.

- **$100M allocation plan view**
  - Table of greedy allocation iterations stored in `allocations_2024_rf.json`.
  - For each step:
    - Country, chosen lever, and cost.
    - Predicted strain reduction from that step.
    - Remaining budget.
  - Summary strip at the top:
    - Total spent, remaining budget, number of iterations.
  - “Top recipients” chips showing where the largest total investments went.

- **Responsive layout and dark theme**
  - Dashboard layout rearranges on smaller screens.
  - Custom dark UI tuned for map and data visualization.

---

### Data and Methodology

#### Source data

The input dataset (from the datathon) contained country‑level health and economic indicators.  
Within this repository, the processed data powering the dashboard lives in:

- `src/data/strain_2024.json` – base computed Strain Index and components.
- `src/data/whatif_2024.json` – what‑if predictions for individual levers.
- `src/data/best_action_2024.json` – best lever, cost, and ROI per country.
- `src/data/allocations_2024_rf.json` – step‑by‑step allocation plan, costs, and remaining budget.
- `src/data/strain_2024_rf_after.json` – predicted strain after applying the allocation plan.

The notebook in `COLAB NOTEBOOK/FinTechJunkiesFinalExport.ipynb` contains the upstream data cleaning, feature engineering, model training, and export to these JSON files.

#### Predictive model and what‑if scenarios

At a high level:

- A model predicts **strain** from country‑level features.
- For each country, counterfactual (“what‑if”) scenarios are generated:
  - Increase **access**.
  - Increase **doctors**.
  - Increase **beds**.
- For each scenario, the model estimates the resulting strain and the improvement (delta versus base).

#### Allocation algorithm

The allocation planner assumes a fixed budget (for example, **$100M**) and a per‑country, per‑lever cost curve.  
The algorithm, as encoded in `allocations_2024_rf.json` and consumed by the app:

- Iteratively selects the **country + lever** pair with the best strain reduction per unit cost (a greedy approach).
- Deducts the cost of that step from the remaining budget.
- Updates the predicted strain after each allocation step.
- Stops when the budget is nearly exhausted or no further beneficial moves are available.

This is not an exact global optimum, but a transparent, easy‑to‑explain heuristic suitable for presentation and exploration.

---

### Tech Stack

- **Frontend**
  - `React 18`
  - `Vite` (development and build tool)
  - `Ant Design` (UI components)
  - `react-simple-maps`, `topojson-client` (map rendering)
  - `d3-scale`, `d3-color`, `d3-interpolate` (color scales and gradients)
- **Data and modeling**
  - Python‑based notebook (Colab) for data preparation and model work (the notebook is included but not executed inside this repo).

---

### Project Structure

Key files and directories:

- `index.html` – Vite entry HTML.
- `vite.config.js` – Vite configuration.
- `package.json` – dependencies and scripts.
- `src/main.jsx` – React entry point.
- `src/App.jsx` – main dashboard and visualization logic:
  - Map, legend, and tooltips.
  - Top 10 table.
  - Country details.
  - Allocation panel.
- `src/index.css` – global styles and layout.
- `src/data/*.json` – processed data exports from the notebook.
- `COLAB NOTEBOOK/FinTechJunkiesFinalExport.ipynb` – full data and methodology notebook from the datathon.

---

### Getting Started

#### Prerequisites

- **Node.js** (LTS version recommended).
- **npm** (bundled with Node).

#### Install dependencies

```bash
npm install
```

#### Run the development server

```bash
npm run dev
```

Then open the printed local URL in a browser (typically `http://localhost:5173`).

#### Build for production

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

---

### Using the Dashboard

- **Switch map modes** with the segmented control:
  - “Computed Strain (2024)”, “Model Prediction Before”, “Model Prediction After”, or “Delta (After − Before)”.
- **Hover over a country** on the map to see:
  - The selected metric value.
  - Decomposed metrics (in computed mode).
  - Best lever information where available.
- **Click a country** on the map or in the tables:
  - Opens the country detail panel with full metrics and what‑if scenarios.
- **Browse the Top 10 panel**:
  - Shows the highest‑strain (or most‑improved for delta mode) countries for quick comparison.
- **Open the allocation panel**:
  - Use the “$100M Allocation Plan” button.
  - Inspect each allocation step and click rows to jump to that country’s detail view.

---

### Limitations and Caveats

- The Strain Index is a constructed metric, not a standard clinical or policy index.
- Model predictions and what‑if improvements are scenario‑based estimates and depend heavily on:
  - Feature engineering choices.
  - Model selection and training details.
  - Cost assumptions for each lever.
- The greedy allocation algorithm is a heuristic, not a guarantee of global optimality.
- The input dataset was limited to what was provided in the datathon; missing or noisy data for some countries may affect results.

---

### Competition Context and Credits

This project was built for a datathon focused on global health and resource allocation.  
The repository contains:

- The interactive dashboard for presenting results.
- The exported JSON datasets for the Strain Index, predictions, and allocation plan.
- The Colab notebook with the modeling and data preparation workflow.

You can adapt the code and methodology to new datasets, alternative definitions of strain, or different budget and lever assumptions.

