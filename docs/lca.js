const state = {
  operations: {
    crop_protection: [],
    sowing: [],
    fertilisation: [],
  },
  impacts: {},
  factorSingle: {}, // crop protection single-score factors
  factorChara: {}, // crop protection characterisation factors
  filters: {
    season: "all",
    farmer: "all",
    operation: "all",
    substance: "all",
    product: "all",
    basis: "ha",
    dataset: defaultDataset(),
    score: "single",
  },
};

function defaultDataset() {
  const val = document.body?.dataset?.defaultDataset;
  if (val === "sowing" || val === "crop_protection") return val;
  return "crop_protection";
}

const elements = {
  season: document.getElementById("season-filter"),
  farmer: document.getElementById("farmer-filter"),
  operation: document.getElementById("operation-filter"),
  substance: document.getElementById("substance-filter"),
  product: document.getElementById("product-filter"),
  dataset: document.getElementById("dataset-filter"),
  basis: document.getElementById("basis-filter"),
  score: document.getElementById("score-filter"),
  reset: document.getElementById("reset-filters"),
  activeFilters: document.getElementById("active-filters"),
  statGrid: document.getElementById("stat-grid"),
  impactBars: document.getElementById("impact-bars"),
  impactCount: document.getElementById("impact-count"),
  detailTable: document.getElementById("detail-table"),
  detailCount: document.getElementById("detail-count"),
};

const palette = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f97316",
  "#10b981",
  "#0ea5e9",
  "#8b5cf6",
  "#e11d48",
  "#14b8a6",
  "#94a3b8",
  "#475569",
];

init();

async function init() {
  state.filters.dataset = defaultDataset();
  state.filters.product = state.filters.dataset === "sowing" ? "Seeds" : "all";
  const [ops, sow, fert, singlescore, chara] = await Promise.all([
    loadOperations(),
    loadSowing(),
    loadFertilisation(),
    loadSinglescore(),
    loadChara(),
  ]);
  state.operations.crop_protection = ops;
  state.operations.sowing = sow;
  state.operations.fertilisation = fert;
  state.impacts = buildImpactMap(singlescore);
  const { single, chara: charaMap } = buildCropFactors(singlescore, chara);
  state.factorSingle = single;
  state.factorChara = charaMap;
  hydrateFilters();
  attachEvents();
  render();
}

async function loadOperations() {
  const res = await fetch(`./data/operations.json?ts=${Date.now()}`);
  if (!res.ok) throw new Error("Unable to load operations data");
  const data = await res.json();
  return data;
}

async function loadSinglescore() {
  const res = await fetch(`./data/singlescore.json?ts=${Date.now()}`);
  if (!res.ok) throw new Error("Unable to load singlescore data");
  return res.json();
}

async function loadChara() {
  const res = await fetch(`./data/characterisation.json?ts=${Date.now()}`);
  if (!res.ok) throw new Error("Unable to load characterisation data");
  return res.json();
}

async function loadFertilisation() {
  const res = await fetch(`./data/fertilisation.json?ts=${Date.now()}`);
  if (!res.ok) throw new Error("Unable to load fertilisation data");
  return res.json();
}

async function loadSowing() {
  const res = await fetch(`./data/sowing.json?ts=${Date.now()}`);
  if (!res.ok) throw new Error("Unable to load sowing data");
  return res.json();
}

function buildImpactMap(records) {
  const map = {};
  const fertFactors = {};
  records.forEach((rec) => {
    const catMap = {};
    rec.categories.forEach((cat) => {
      catMap[cat.impact_category] = { total: cat.total || 0, unit: cat.unit || "" };
    });
    const key = mapKey(rec);
    map[key] = catMap;
    if (rec.functional_unit && rec.functional_unit.toLowerCase().includes("seed")) {
      map["seeds"] = catMap;
    }
    if (rec.product_id === "singlescore_8_1") fertFactors.N = catMap;
    if (rec.product_id === "singlescore_9_1") fertFactors.P = catMap;
    if (rec.product_id === "singlescore_10_1") fertFactors.K = catMap;
  });
  map.__fertFactors = fertFactors;
  return map;
}

function buildCropFactors(singleRecords, charaRecords) {
  const singleIds = {
    herbicide: ["Herbicide"],
    insecticide: ["Insecticide"],
    fungicide: ["Fungicide"],
  };
  const charaIds = {
    herbicide: ["2_chara", "3_chara"],
    insecticide: ["4_chara", "5_chara"],
    fungicide: ["6_chara", "7_chara"],
  };
  const single = aggregateFactors(singleRecords, singleIds);
  const chara = aggregateFactors(charaRecords, charaIds);
  return { single, chara };
}

function aggregateFactors(records, idMap) {
  const lookup = records.reduce((acc, rec) => {
    acc[rec.product_id] = rec;
    return acc;
  }, {});
  const result = {};
  Object.entries(idMap).forEach(([key, ids]) => {
    const cats = {};
    ids.forEach((id) => {
      const rec = lookup[id];
      if (!rec || !rec.categories) return;
      rec.categories.forEach((cat) => {
        const name = cat.impact_category;
        const ef = cat.total || 0;
        if (ef == null) return;
        cats[name] = {
          total: (cats[name]?.total || 0) + ef,
          unit: cat.unit || cats[name]?.unit || "",
        };
      });
    });
    result[key] = cats;
  });
  return result;
}

function mapKey(rec) {
  const pid = (rec.product_id || "").toLowerCase();
  if (pid === "singlescore_1_1") return "seeds";
  return pid;
}

function hydrateFilters(data) {
  const ops = state.operations[state.filters.dataset];
  fillSelect(elements.season, uniqueValues(ops, "season").sort((a, b) => b - a), "Season");
  fillSelect(elements.farmer, uniqueValues(ops, "farmer_id").sort(), "Farmer");
  fillSelect(
    elements.operation,
    uniqueValues(ops, "operation_normalized")
      .map((op) => ({ value: op, label: toTitle(op) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    "Operation"
  );
  if (elements.substance) {
    fillSelect(elements.substance, uniqueValues(ops, "active_substance").sort(), "Substance");
  }
  if (state.filters.dataset === "sowing") {
    state.filters.product = "Seeds";
  } else if (elements.product) {
    const products = state.filters.dataset === "fertilisation" ? uniqueValues(ops, "product") : uniqueValues(ops, "product");
    fillSelect(elements.product, products.sort(), "Product");
    elements.product.value = state.filters.product;
  }
}

function fillSelect(select, values, label) {
  select.innerHTML = "";
  const optionAll = document.createElement("option");
  optionAll.value = "all";
  optionAll.textContent = `All ${label ? label.toLowerCase() + "s" : ""}`.trim();
  select.appendChild(optionAll);
  values.forEach((item) => {
    const option = document.createElement("option");
    if (typeof item === "object") {
      option.value = item.value;
      option.textContent = item.label;
    } else {
      option.value = item;
      option.textContent = item;
    }
    select.appendChild(option);
  });
}

function attachEvents() {
  elements.season.addEventListener("change", () => {
    state.filters.season = elements.season.value;
    render();
  });
  elements.farmer.addEventListener("change", () => {
    state.filters.farmer = elements.farmer.value;
    render();
  });
  elements.operation.addEventListener("change", () => {
    state.filters.operation = elements.operation.value;
    render();
  });
  if (elements.substance) {
    elements.substance.addEventListener("change", () => {
      state.filters.substance = elements.substance.value;
      render();
    });
  }
  if (elements.product) {
    elements.product.addEventListener("change", () => {
      state.filters.product = elements.product.value;
      render();
    });
  }
  if (elements.dataset) {
    elements.dataset.addEventListener("change", () => {
      state.filters.dataset = elements.dataset.value;
      hydrateFilters();
      render();
    });
  }
  elements.basis.addEventListener("change", () => {
    state.filters.basis = elements.basis.value;
    render();
  });
  if (elements.score) {
    elements.score.addEventListener("change", () => {
      state.filters.score = elements.score.value;
      render();
    });
  }
  elements.reset.addEventListener("click", () => {
    Object.assign(state.filters, {
      season: "all",
      farmer: "all",
      operation: "all",
      substance: "all",
      product: state.filters.dataset === "sowing" ? "Seeds" : "all",
      basis: "ha",
      dataset: defaultDataset(),
      score: "single",
    });
    elements.season.value = "all";
    elements.farmer.value = "all";
    elements.operation.value = "all";
    elements.substance.value = "all";
    if (elements.product) {
      elements.product.value = state.filters.product === "Seeds" ? "Seeds" : "all";
    }
    if (elements.dataset) elements.dataset.value = state.filters.dataset;
    elements.basis.value = "ha";
    if (elements.score) elements.score.value = "single";
    render();
  });
}

function render() {
  const data = state.operations[state.filters.dataset] || [];
  const filtered = applyFilters(data, state.filters);
  const scoped = filtered.map(enrichOperation);
  renderActiveFilters(filtered.length);
  renderStats(scoped);
  renderImpacts(scoped);
  renderDetail(scoped);
}

function applyFilters(rows, filters) {
  return rows.filter((row) => {
    if (filters.season !== "all" && `${row.season}` !== filters.season) return false;
    if (filters.farmer !== "all" && row.farmer_id !== filters.farmer) return false;
    if (filters.operation !== "all" && row.operation_normalized !== filters.operation) return false;
    if (filters.substance !== "all" && elements.substance && row.active_substance !== filters.substance)
      return false;
    if (filters.dataset !== "sowing" && filters.product !== "all" && row.product !== filters.product)
      return false;
    return true;
  });
}

function enrichOperation(row) {
  // Crop protection calculation (per kg active product)
  if (state.filters.dataset !== "crop_protection") return { ...row };
  const prodType = inferProduct(row);
  const mapSet = state.filters.score === "chara" ? state.factorChara : state.factorSingle;
  // Fallback to legacy singlescore map if aggregation missing
  const fallback = state.impacts[productKey(prodType)] || {};
  const impacts = Object.keys(mapSet[productKey(prodType)] || {}).length
    ? mapSet[productKey(prodType)]
    : fallback;
  const area = row.covered_area || row.area_ha || 0;
  const tonnes = computeTonnes(row, area);
  const kgPerHa = row.dose_kg_ha != null ? row.dose_kg_ha : null;
  const kgPerT = row.dose_kg_per_t != null ? row.dose_kg_per_t : null;
  const usingTonnes = state.filters.basis === "tonne";
  // Use the intensity doses directly (do not scale by area/production for intensity metrics)
  const kgAppliedHa = kgPerHa;
  const kgAppliedT = kgPerT;

  const impactHa = {};
  const impactT = {};
  Object.entries(impacts).forEach(([cat, info]) => {
    const ef = info.total || 0;
    impactHa[cat] = kgPerHa == null ? null : ef * kgPerHa;
    impactT[cat] = kgPerT == null ? null : ef * kgPerT;
  });
  const totalImpactHa = impactHa["Total"] ?? null;
  const totalImpactT = impactT["Total"] ?? null;
  const fieldImpact = totalImpactHa != null ? totalImpactHa * area : null;
  return {
    ...row,
    dataset: state.filters.dataset,
    lca_product: prodType,
    kg_applied: usingTonnes ? kgAppliedT : kgAppliedHa,
    kg_applied_ha: kgAppliedHa,
    kg_applied_t: kgAppliedT,
    kg_basis: usingTonnes ? "kg/t" : "kg/ha",
    tonnes: tonnes,
    impact_values_ha: impactHa,
    impact_values_t: impactT,
    total_impact_ha: totalImpactHa,
    total_impact_t: totalImpactT,
    total_field_impact: fieldImpact,
  };
}

function computeTonnes(row, area) {
  if (row.area_per_tonne && row.area_per_tonne > 0) {
    return area / row.area_per_tonne;
  }
  if (row.productivity && row.productivity > 0) {
    return area * row.productivity;
  }
  return null;
}

function combineNPK(factors, loads) {
  const impact = {};
  Object.entries(loads).forEach(([nutrient, value]) => {
    const catMap = factors[nutrient];
    if (!catMap || value == null) return;
    Object.entries(catMap).forEach(([cat, info]) => {
      impact[cat] = (impact[cat] || 0) + value * (info.total || 0);
    });
  });
  return impact;
}

function inferProduct(row) {
  const op = (row.operation || "").toLowerCase();
  if (state.filters.dataset === "sowing") return "Seeds";
  if (state.filters.dataset === "fertilisation") return "Fertiliser";
  if ((row.product || "").toLowerCase().includes("seed")) return "Seeds";
  if (op.includes("herbicide")) return "Herbicide";
  if (op.includes("fungicide")) return "Fungicide";
  if (op.includes("insecticide") || op.includes("pesticide")) return "Insecticide";
  return null;
}

function productKey(name) {
  return (name || "").toLowerCase();
}

function renderActiveFilters(count) {
  const parts = [];
  const f = state.filters;
  if (f.season !== "all") parts.push(`Season ${f.season}`);
  if (f.farmer !== "all") parts.push(`Farmer ${f.farmer}`);
  if (f.operation !== "all") parts.push(toTitle(f.operation));
  if (f.substance !== "all") parts.push(f.substance);
  if (f.product !== "all" && f.dataset !== "sowing") parts.push(f.product);
  if (f.dataset === "sowing") parts.push("Product: Seeds");
  if (f.dataset === "sowing") parts.push("Dataset: Sowing");
  else if (f.dataset === "fertilisation") parts.push("Dataset: Fertilisation");
  else parts.push("Dataset: Crop protection");
  parts.push(f.basis === "tonne" ? "Basis: impact/t" : "Basis: impact/ha");
  parts.push(f.score === "chara" ? "Impact: Characterisation" : "Impact: Single score");
  const label = parts.length ? parts.join(" • ") : "No filters applied";
  elements.activeFilters.textContent = `${label} — ${count} operations`;
}

function renderStats(rows) {
  const totalArea = sum(rows, "area_ha");
  const totalTonnes = sum(rows, "tonnes");
  const totalFieldImpact = rows.reduce((sum, r) => sum + (r.total_field_impact || 0), 0);
  const weightedHa = rows.reduce((sum, r) => sum + (r.total_impact_ha || 0) * (r.area_ha || 0), 0);
  const weightedT = rows.reduce((sum, r) => sum + (r.total_impact_t || 0) * (r.tonnes || 0), 0);
  const avgImpactHa = totalArea ? weightedHa / totalArea : null;
  const avgImpactT = totalTonnes ? weightedT / totalTonnes : null;
  const stats = [
    { label: "Operations", value: formatNumber(rows.length, 0) },
    { label: "Area (ha)", value: formatNumber(totalArea, 1) },
    { label: "Production (t)", value: totalTonnes ? formatNumber(totalTonnes, 2) : "—" },
    { label: "Avg impact (Pt/ha)", value: avgImpactHa == null || !avgImpactHa ? "—" : formatNumber(avgImpactHa, 2) },
    { label: "Avg impact (Pt/t)", value: avgImpactT == null || !avgImpactT ? "—" : formatNumber(avgImpactT, 2) },
    { label: "Field impact (Pt)", value: totalFieldImpact ? formatNumber(totalFieldImpact, 2) : "—" },
  ];
  elements.statGrid.innerHTML = stats
    .map(
      (stat) => `
        <div class="stat">
          <small>${stat.label}</small>
          <strong>${stat.value}</strong>
        </div>
      `
    )
    .join("");
}

function renderImpacts(rows) {
  const showBasisT = state.filters.basis === "tonne";
  const unitMap =
    state.filters.score === "chara"
      ? mergeUnits(state.factorChara)
      : mergeUnits(state.factorSingle);
  const denom = showBasisT ? sum(rows, "tonnes") : sum(rows, "area_ha");
  const aggAbs = {};
  rows.forEach((row) => {
    const source = showBasisT ? row.impact_values_t : row.impact_values_ha;
    const scalar = showBasisT ? row.tonnes || 0 : row.area_ha || row.covered_area || 0;
    if (!source || !scalar) return;
    Object.entries(source).forEach(([cat, value]) => {
      if (value == null || cat === "Total") return;
      aggAbs[cat] = (aggAbs[cat] || 0) + value * scalar;
    });
  });
  const agg = {};
  Object.entries(aggAbs).forEach(([cat, abs]) => {
    agg[cat] = denom ? abs / denom : abs;
  });
  const entries = Object.entries(agg)
    .map(([cat, value]) => ({ cat, value }))
    .sort((a, b) => b.value - a.value);
  const totalImpact = entries.reduce((s, e) => s + (e.value || 0), 0);
  elements.impactCount.textContent = `${entries.length} categories`;
  if (!entries.length) {
    elements.impactBars.innerHTML = `<p class="empty">No impacts to show. Check filters or ensure operations have matching dose data.</p>`;
    return;
  }
  const defaultUnit = showBasisT ? "Pt/t" : "Pt/ha";
  const basisSuffix = showBasisT ? "/t" : "/ha";

  if (state.filters.score === "chara") {
    const rowsTable = entries
      .map((entry) => {
        const rawUnit = unitMap[entry.cat];
        const unit = rawUnit ? `${rawUnit}${basisSuffix}` : defaultUnit;
        return `<tr><td>${entry.cat}</td><td>${unit}</td><td>${formatNumber(entry.value, 2)}</td></tr>`;
      })
      .join("");
    elements.impactBars.innerHTML = `
      <div class="table-shell">
        <table>
          <thead><tr><th>Impact category</th><th>Unit</th><th>Value</th></tr></thead>
          <tbody>${rowsTable}</tbody>
        </table>
      </div>
    `;
    return;
  }

  // single-score: show bars by % contribution
  const bars = entries
    .map((entry, idx) => {
      const color = palette[idx % palette.length];
      const pct = totalImpact ? (entry.value / totalImpact) * 100 : 0;
      const pctWidth = Math.max(0, Math.min(100, pct));
      const unit = defaultUnit;
      return `
        <div class="bar-row">
          <div class="bar-label">
            <div>${entry.cat}</div>
            <small>${formatNumber(entry.value, 2)} ${unit} (${formatNumber(pct, 1)}%)</small>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pctWidth}%; background:${color}"></div>
            <span class="bar-value">${formatNumber(pct, 1)}%</span>
          </div>
        </div>
      `;
    })
    .join("");
  elements.impactBars.innerHTML = bars;
}

function renderSowingImpacts(rows) {
  const showBasisT = state.filters.basis === "tonne";
  const agg = {};
  rows.forEach((row) => {
    const source = showBasisT ? row.impact_values_t : row.impact_values_ha;
    if (!source) return;
    Object.entries(source).forEach(([cat, val]) => {
      if (val == null || cat === "Total") return;
      agg[cat] = (agg[cat] || 0) + val;
    });
  });
  const entries = Object.entries(agg)
    .map(([cat, value]) => ({ cat, value }))
    .sort((a, b) => b.value - a.value);
  const maxVal = entries.length ? Math.max(...entries.map((e) => e.value), 1) : 1;
  const unitLabel = showBasisT ? "µPt/t" : "µPt/ha";
  const bars = entries
    .map((entry, idx) => {
      const color = palette[idx % palette.length];
      return `
        <div class="bar-row">
          <div class="bar-label">
            <div>${entry.cat}</div>
            <small>${formatNumber(entry.value, 2)} ${unitLabel}</small>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${(entry.value / maxVal) * 100}%; background:${color}"></div>
            <span class="bar-value">${formatNumber(entry.value, 2)}</span>
          </div>
        </div>
      `;
    })
    .join("");
  elements.impactBars.innerHTML = bars || `<p class="empty">No ${unitLabel} data.</p>`;
  elements.impactCount.textContent = `${entries.length} categories`;
}

function renderDetail(rows) {
  elements.detailCount.textContent = `${rows.length} records`;
  if (!rows.length) {
    elements.detailTable.innerHTML = `<p class="empty">No operations match these filters.</p>`;
    return;
  }
  if (state.filters.dataset === "fertilisation") {
    const table = `
      <table>
        <thead>
          <tr>
            <th>Season</th>
            <th>Farmer ID</th>
            <th>Operation</th>
            <th>Product</th>
            <th>N (kg/ha)</th>
            <th>P (kg/ha)</th>
            <th>K (kg/ha)</th>
            <th>N (kg/t)</th>
            <th>P (kg/t)</th>
            <th>K (kg/t)</th>
            <th>${state.filters.basis === "tonne" ? "Impact (µPt/t)" : "Impact (µPt/ha)"}</th>
            <th>Field impact (µPt)</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${row.season}</td>
                  <td>${row.farmer_id || row.dmu_id}</td>
                  <td>${toTitle(row.operation || "")}</td>
                  <td>${row.product || "—"}</td>
                  <td>${row.n_kg_ha_weight == null ? "—" : formatNumber(row.n_kg_ha_weight, 2)}</td>
                  <td>${row.p_kg_ha_weight == null ? "—" : formatNumber(row.p_kg_ha_weight, 2)}</td>
                  <td>${row.k_kg_ha_weight == null ? "—" : formatNumber(row.k_kg_ha_weight, 2)}</td>
                  <td>${row.n_kg_t == null ? "—" : formatNumber(row.n_kg_t, 3)}</td>
                  <td>${row.p_kg_t == null ? "—" : formatNumber(row.p_kg_t, 3)}</td>
                  <td>${row.k_kg_t == null ? "—" : formatNumber(row.k_kg_t, 3)}</td>
                  <td>${
                    state.filters.basis === "tonne"
                      ? row.total_impact_t == null
                        ? "—"
                        : formatNumber(row.total_impact_t, 2)
                      : row.total_impact_ha == null
                      ? "—"
                      : formatNumber(row.total_impact_ha, 2)
                  }</td>
                  <td>${row.total_field_impact == null ? "—" : formatNumber(row.total_field_impact, 2)}</td>
                  <td>${row.date || "—"}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    `;
    elements.detailTable.innerHTML = table;
    return;
  }
  if (state.filters.dataset === "sowing") {
    const table = `
      <table>
        <thead>
          <tr>
            <th>Season</th>
            <th>Farmer ID</th>
            <th>Operation</th>
            <th>Dose (kg/ha)</th>
            <th>Dose (kg/t)</th>
            <th>${state.filters.basis === "tonne" ? "Impact (µPt/t)" : "Impact (µPt/ha)"}</th>
            <th>Field impact (µPt)</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row) => `
                <tr>
                  <td>${row.season}</td>
                  <td>${row.farmer_id || row.dmu_id}</td>
                  <td>${toTitle(row.operation || "")}</td>
                  <td>${row.dose_kg_ha == null ? "—" : formatNumber(row.dose_kg_ha, 2)}</td>
                  <td>${row.dose_kg_per_t == null ? "—" : formatNumber(row.dose_kg_per_t, 3)}</td>
                  <td>${
                    state.filters.basis === "tonne"
                      ? row.total_impact_t == null
                        ? "—"
                        : formatNumber(row.total_impact_t, 2)
                      : row.total_impact_ha == null
                      ? "—"
                      : formatNumber(row.total_impact_ha, 2)
                  }</td>
                  <td>${row.total_field_impact == null ? "—" : formatNumber(row.total_field_impact, 2)}</td>
                  <td>${row.date || "—"}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    `;
    elements.detailTable.innerHTML = table;
    return;
  }

  const table = `
    <table>
      <thead>
        <tr>
          <th>Season</th>
          <th>Farmer ID</th>
          <th>Operation</th>
          <th>Product</th>
          <th>Dose (kg/ha)</th>
          <th>Dose (kg/t)</th>
          <th>Area (ha)</th>
          <th>Prod (t)</th>
          <th>Kg applied (ha)</th>
          <th>Kg applied (t)</th>
          <th>Kg applied</th>
          <th>Total impact (µPt)</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${row.season}</td>
                <td>${row.farmer_id || row.dmu_id}</td>
                <td>${toTitle(row.operation || "")}</td>
                <td>${row.product || "—"}</td>
                <td>${row.dose_kg_ha == null ? "—" : formatNumber(row.dose_kg_ha, 2)}</td>
                <td>${row.dose_kg_per_t == null ? "—" : formatNumber(row.dose_kg_per_t, 3)}</td>
                <td>${row.area_ha == null ? "—" : formatNumber(row.area_ha, 2)}</td>
                <td>${row.tonnes == null ? "—" : formatNumber(row.tonnes, 2)}</td>
                <td>${row.kg_applied_ha == null ? "—" : formatNumber(row.kg_applied_ha, 2)}</td>
                <td>${row.kg_applied_t == null ? "—" : formatNumber(row.kg_applied_t, 2)}</td>
                <td>${row.kg_applied == null ? "—" : formatNumber(row.kg_applied, 2)} (${row.kg_basis})</td>
                <td>${row.total_impact == null ? "—" : formatNumber(row.total_impact, 2)}</td>
                <td>${row.date || "—"}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
  elements.detailTable.innerHTML = table;
}

function uniqueValues(rows, key) {
  return Array.from(
    rows.reduce((set, row) => {
      if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
        set.add(row[key]);
      }
      return set;
    }, new Set())
  );
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (row[key] || 0), 0);
}

function mergeUnits(mapSet) {
  const units = {};
  Object.values(mapSet || {}).forEach((catMap) => {
    Object.entries(catMap || {}).forEach(([cat, obj]) => {
      if (!units[cat]) units[cat] = obj.unit || "";
    });
  });
  return units;
}

function formatNumber(value, digits = 1) {
  if (value == null || !isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e6 || (abs > 0 && abs < 1e-3)) {
    return value.toExponential(2);
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function toTitle(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}
