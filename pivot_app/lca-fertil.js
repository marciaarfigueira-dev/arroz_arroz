const state = {
  data: [],
  singleTotals: {}, // {N|P|K: {ef, unit}}
  singleMaps: {}, // {N|P|K: {cat:{ef,unit}}} for rendering bars
  charaMaps: {}, // {N|P|K: {cat:{ef,unit}}}
  filters: {
    season: "all",
    farmer: "all",
    operation: "all",
    product: "all",
    basis: "ha",
    score: "single",
  },
};

const elements = {
  season: document.getElementById("season-filter"),
  farmer: document.getElementById("farmer-filter"),
  operation: document.getElementById("operation-filter"),
  product: document.getElementById("product-filter"),
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
  const [fert, singlescore, chara] = await Promise.all([
    loadFertilisation(),
    loadSinglescore(),
    loadChara(),
  ]);
  state.data = fert;
  const { totals, singleMaps, charaMaps } = buildFactorMaps(singlescore, chara);
  state.singleTotals = totals;
  state.singleMaps = singleMaps;
  state.charaMaps = charaMaps;
  hydrateFilters();
  attachEvents();
  render();
}

async function loadFertilisation() {
  const res = await fetch("./data/fertilisation.json");
  if (!res.ok) throw new Error("Unable to load fertilisation data");
  return res.json();
}

async function loadSinglescore() {
  const res = await fetch("./data/singlescore.json");
  if (!res.ok) throw new Error("Unable to load singlescore data");
  return res.json();
}

async function loadChara() {
  const res = await fetch("./data/characterisation.json");
  if (!res.ok) throw new Error("Unable to load characterisation data");
  return res.json();
}

function buildFactorMaps(singleRecords, charaRecords) {
  const idsSingle = { N: "singlescore_8_1", P: "singlescore_9_1", K: "singlescore_10_1" };
  const idsChara = { N: "8_chara", P: "9_chara", K: "10_chara" };
  const totals = {};
  const singleMaps = {};
  const charaMaps = {};

  Object.entries(idsSingle).forEach(([nutrient, pid]) => {
    const rec = singleRecords.find((r) => r.product_id === pid);
    if (!rec) return;
    const cats = {};
    rec.categories.forEach((cat) => {
      cats[cat.impact_category] = { ef: cat.total || 0, unit: cat.unit || "" };
    });
    singleMaps[nutrient] = cats;
    const total = cats["Total"];
    const ef = total ? total.ef || 0 : 0;
    const unit = total ? total.unit || "Pt" : "Pt";
    totals[nutrient] = { ef, unit };
  });

  Object.entries(idsChara).forEach(([nutrient, pid]) => {
    const rec = charaRecords.find((r) => r.product_id === pid);
    if (!rec) return;
    const cats = {};
    rec.categories.forEach((cat) => {
      cats[cat.impact_category] = { ef: cat.total || 0, unit: cat.unit || "" };
    });
    charaMaps[nutrient] = cats;
  });

  return { totals, singleMaps, charaMaps };
}

function hydrateFilters() {
  fillSelect(elements.season, uniqueValues(state.data, "season").sort((a, b) => b - a), "Season");
  fillSelect(elements.farmer, uniqueValues(state.data, "farmer_id").sort(), "Farmer");
  fillSelect(
    elements.operation,
    uniqueValues(state.data, "operation_normalized")
      .map((op) => ({ value: op, label: toTitle(op) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    "Operation"
  );
  fillSelect(elements.product, uniqueValues(state.data, "product").sort(), "Product");
}

function fillSelect(select, values, label) {
  if (!select) return;
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
  elements.product.addEventListener("change", () => {
    state.filters.product = elements.product.value;
    render();
  });
  elements.basis.addEventListener("change", () => {
    state.filters.basis = elements.basis.value;
    render();
  });
  elements.score.addEventListener("change", () => {
    state.filters.score = elements.score.value;
    render();
  });
  elements.reset.addEventListener("click", () => {
    Object.assign(state.filters, {
      season: "all",
      farmer: "all",
      operation: "all",
      product: "all",
      basis: "ha",
      score: "single",
    });
    elements.season.value = "all";
    elements.farmer.value = "all";
    elements.operation.value = "all";
    elements.product.value = "all";
    elements.basis.value = "ha";
    elements.score.value = "single";
    render();
  });
}

function render() {
  const filtered = applyFilters(state.data, state.filters);
  const scoped = filtered.map(enrichRow);
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
    if (filters.product !== "all" && row.product !== filters.product) return false;
    return true;
  });
}

function enrichRow(row) {
  const area = row.covered_area || row.area_TOTAL || row.area_ha || 0;
  const tonnes = computeTonnes(row, area);
  const nHa = row.n_kg_ha_weight ?? null;
  const pHa = row.p_kg_ha_weight ?? null;
  const kHa = row.k_kg_ha_weight ?? null;
  const nT = row.n_kg_t ?? null;
  const pT = row.p_kg_t ?? null;
  const kT = row.k_kg_t ?? null;
  const mapSet = state.filters.score === "chara" ? state.charaMaps : state.singleMaps;
  const impactHa = {};
  const impactT = {};
  ["N", "P", "K"].forEach((nutrient) => {
    const catMap = mapSet[nutrient] || {};
    const loadHa = nutrient === "N" ? nHa : nutrient === "P" ? pHa : kHa;
    const loadT = nutrient === "N" ? nT : nutrient === "P" ? pT : kT;
    Object.entries(catMap).forEach(([cat, obj]) => {
      const ef = obj.ef || 0;
      if (loadHa != null) {
        impactHa[cat] = (impactHa[cat] || 0) + ef * loadHa;
      }
      if (loadT != null) {
        impactT[cat] = (impactT[cat] || 0) + ef * loadT;
      }
    });
  });
  const totalHa = totalFromMap(impactHa);
  const totalT = totalFromMap(impactT);
  const fieldImpact = totalHa != null ? totalHa * area : null;
  return {
    ...row,
    tonnes,
    impact_values_ha: impactHa,
    impact_values_t: impactT,
    total_impact_ha: totalHa,
    total_impact_t: totalT,
    total_field_impact: fieldImpact,
  };
}

function renderActiveFilters(count) {
  const parts = [];
  const f = state.filters;
  if (f.season !== "all") parts.push(`Season ${f.season}`);
  if (f.farmer !== "all") parts.push(`Farmer ${f.farmer}`);
  if (f.operation !== "all") parts.push(toTitle(f.operation));
  if (f.product !== "all") parts.push(f.product);
  parts.push(f.basis === "tonne" ? "Basis: kg/t" : "Basis: kg/ha");
  parts.push(f.score === "chara" ? "Impact: Characterisation" : "Impact: Single score");
  const label = parts.length ? parts.join(" • ") : "No filters applied";
  elements.activeFilters.textContent = `${label} — ${count} operations`;
}

function renderStats(rows) {
  const totalArea = sum(rows, "area_TOTAL") || sum(rows, "covered_area") || sum(rows, "area_ha");
  const totalTonnes = sum(rows, "tonnes");
  // convert to absolutes then normalise so we don't overcount when multiple ops exist
  const totalAbsHa = rows.reduce((sum, r) => sum + (r.total_field_impact || 0), 0);
  const totalAbsT = rows.reduce((sum, r) => {
    if (r.total_impact_t != null && r.tonnes) {
      return sum + r.total_impact_t * r.tonnes;
    }
    return sum;
  }, 0);
  const avgImpactHa = totalArea ? totalAbsHa / totalArea : null;
  const avgImpactT = totalTonnes ? totalAbsT / totalTonnes : null;
  const stats = [
    { label: "Operations", value: formatNumber(rows.length, 0) },
    { label: "Area (ha)", value: totalArea ? formatNumber(totalArea, 2) : "—" },
    { label: "Production (t)", value: totalTonnes ? formatNumber(totalTonnes, 2) : "—" },
    {
      label: "Impact (Pt/ha)",
      value: state.filters.score === "chara" ? "—" : avgImpactHa != null ? formatNumberSci(avgImpactHa, 2) : "—",
    },
    {
      label: "Impact (Pt/t)",
      value: state.filters.score === "chara" ? "—" : avgImpactT != null ? formatNumberSci(avgImpactT, 2) : "—",
    },
    {
      label: "Field impact (Pt)",
      value: state.filters.score === "chara" ? "—" : totalAbsHa ? formatNumberSci(totalAbsHa, 2) : "—",
    },
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
  const usingChara = state.filters.score === "chara";
  const unitMap = usingChara ? mergeUnits(state.charaMaps) : mergeUnits(state.singleMaps);
  const denom = showBasisT ? sum(rows, "tonnes") : sum(rows, "area_TOTAL") || sum(rows, "area_ha") || 0;

  // agg[nutrient][category] = intensity (normalised)
  const agg = { N: {}, P: {}, K: {} };
  rows.forEach((row) => {
    const source = showBasisT ? row.impact_values_t : row.impact_values_ha;
    const scalar = showBasisT ? row.tonnes || 0 : row.area_TOTAL || row.area_ha || row.covered_area || 0;
    if (!source || !scalar) return;
    ["N", "P", "K"].forEach((nutrient) => {
      const catMap = (usingChara ? state.charaMaps : state.singleMaps)[nutrient] || {};
      Object.keys(catMap).forEach((cat) => {
        const val = source[cat];
        if (val == null) return;
        agg[nutrient][cat] = (agg[nutrient][cat] || 0) + val * scalar;
      });
    });
  });

  // normalise
  Object.keys(agg).forEach((nutrient) => {
    Object.keys(agg[nutrient]).forEach((cat) => {
      agg[nutrient][cat] = denom ? agg[nutrient][cat] / denom : agg[nutrient][cat];
    });
  });

  // collect categories
  const categories = Array.from(
    new Set([...Object.keys(agg.N), ...Object.keys(agg.P), ...Object.keys(agg.K)]).values()
  ).sort();
  elements.impactCount.textContent = `${categories.length} categories`;
  if (!categories.length) {
    elements.impactBars.innerHTML = `<p class="empty">No impacts to show. Check filters or ensure nutrient dose data is present.</p>`;
    return;
  }

  const defaultUnit = showBasisT ? "Pt/t" : "Pt/ha";
  const basisSuffix = showBasisT ? "/t" : "/ha";

  const rowsHtml = categories
    .map((cat) => {
      const unit = unitMap[cat] ? `${unitMap[cat]}${basisSuffix}` : defaultUnit;
      return `
        <tr>
          <td>${cat}</td>
          <td>${unit}</td>
          <td>${formatNumberSci(agg.N[cat] || 0, 2)}</td>
          <td>${formatNumberSci(agg.P[cat] || 0, 2)}</td>
          <td>${formatNumberSci(agg.K[cat] || 0, 2)}</td>
        </tr>
      `;
    })
    .join("");

  elements.impactBars.innerHTML = `
    <div class="table-shell">
      <table>
        <thead>
          <tr>
            <th>Impact category</th>
            <th>Unit</th>
            <th>N</th>
            <th>P</th>
            <th>K</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

function renderDetail(rows) {
  elements.detailCount.textContent = `${rows.length} records`;
  if (!rows.length) {
    elements.detailTable.innerHTML = `<p class="empty">No operations match these filters.</p>`;
    return;
  }
  const basisLabel = state.filters.basis === "tonne" ? "Pt/t" : "Pt/ha";
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
          <th>N impact (${basisLabel})</th>
          <th>P impact (${basisLabel})</th>
          <th>K impact (${basisLabel})</th>
          <th>${state.filters.basis === "tonne" ? "Impact (Pt/t)" : "Impact (Pt/ha)"}</th>
          <th>Field impact (Pt)</th>
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
                <td>${formatNutrientImpact(row, "N")}</td>
                <td>${formatNutrientImpact(row, "P")}</td>
                <td>${formatNutrientImpact(row, "K")}</td>
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
}

function computeTonnes(row, area) {
  if (row.area_per_tonne && row.area_per_tonne > 0) {
    return area / row.area_per_tonne;
  }
  if (row.productivity_weighted && row.productivity_weighted > 0) {
    return area * row.productivity_weighted;
  }
  return null;
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

function totalFromMap(obj) {
  if (!obj) return null;
  if (obj["Total"] != null) return obj["Total"];
  const vals = Object.values(obj).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0);
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

function formatNumberSci(value, digits = 2) {
  if (value == null || !isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e6 || (abs > 0 && abs < 1e-3)) {
    return value.toExponential(2);
  }
  return formatNumber(value, digits);
}

function toTitle(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatNutrientImpact(row, nutrient) {
  const val = nutrientImpact(row, nutrient);
  if (val == null) return "—";
  const digits = Math.abs(val) < 1 ? 3 : 2;
  return formatNumber(val, digits);
}

function nutrientImpact(row, nutrient) {
  const mapSet = state.filters.score === "chara" ? state.charaMaps : state.singleMaps;
  const catMap = mapSet[nutrient] || {};
  const source = state.filters.basis === "tonne" ? row.impact_values_t : row.impact_values_ha;
  if (!source) return null;
  let total = 0;
  let seen = false;
  Object.keys(catMap).forEach((cat) => {
    if (source[cat] != null) {
      total += source[cat];
      seen = true;
    }
  });
  return seen ? total : null;
}
