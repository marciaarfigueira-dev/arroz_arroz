const state = {
  data: [], // now sourced from seed rate per dmu file
  seedRates: new Map(), // key: farmer|season, used for lookups if needed
  seedSingle: {}, // {impact_category: {ef, unit}}
  seedChara: {}, // {impact_category: {ef, unit}}
  filters: {
    season: "all",
    farmer: "all",
    operation: "all",
    basis: "ha",
    score: "single",
  },
};

const elements = {
  season: document.getElementById("season-filter"),
  farmer: document.getElementById("farmer-filter"),
  operation: document.getElementById("operation-filter"),
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
  try {
    const [seedRateRows, singlescore, chara] = await Promise.all([loadSeedRates(), loadSinglescore(), loadChara()]);
    state.data = normalizeSeedRateRows(seedRateRows);
    state.seedRates = buildRateMap(seedRateRows);
    state.seedSingle = extractSeedSingle(singlescore);
    state.seedChara = extractSeedChara(chara);
  } catch (err) {
    console.error("Failed to load sowing data", err);
    state.data = [];
    state.seedRates = new Map();
    state.seedSingle = {};
    state.seedChara = {};
  }
  hydrateFilters();
  attachEvents();
  render();
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

async function loadSeedRates() {
  const res = await fetch(`./data/seed_rate_per_dmu.json?ts=${Date.now()}`);
  if (!res.ok) throw new Error("Unable to load seed rates");
  return res.json();
}

function normalizeSeedRateRows(rows) {
  return rows
    .map((r) => {
      const season = r.Season || r.season || "";
      const farmer = r.dmu_id || r.farmer_id || "";
      const dmu = farmer && season ? `${farmer}_${season}` : r.dmu_id || "";
      const op = (r.operations || r.operation || "").toLowerCase().trim();
      const area = toNum(r.total_area);
      const production = toNum(r.total_prod_t);
      return {
        dmu_id: dmu,
        farmer_id: farmer || "",
        season: season || "",
        operation: op,
        operation_normalized: op,
        area_ha: area ?? null,
        covered_area: area ?? null,
        production_t: production ?? null,
        dose_kg_ha: toNum(r.kg_per_ha) ?? null,
        dose_kg_per_t: toNum(r.kg_per_t) ?? null,
        date: r.date || null,
      };
    })
    .filter((r) => r.dmu_id);
}

function buildRateMap(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const dmu = r.dmu_id || r.DMU_ID || "";
    if (!dmu) return;
    const [farmer, season] = dmu.split("_");
    if (!farmer || !season) return;
    const key = `${farmer}_${season}`;
    map.set(key, {
      kg_per_ha: toNum(r.kg_per_ha),
      kg_per_t: toNum(r.kg_per_t),
      operation: (r.operations || "").toLowerCase().trim(),
      farmer,
      season,
    });
  });
  return map;
}

function extractSeedSingle(records) {
  const seed = records.find((r) => r.product_id === "singlescore_1_1");
  if (!seed) return {};
  const map = {};
  seed.categories.forEach((cat) => {
    map[cat.impact_category] = { ef: cat.total || 0, unit: cat.unit || "µPt" };
  });
  return map;
}

function extractSeedChara(records) {
  const seed = records.find((r) => r.product_id === "1_chara");
  if (!seed) return {};
  const map = {};
  seed.categories.forEach((cat) => {
    map[cat.impact_category] = { ef: cat.total || 0, unit: cat.unit || "" };
  });
  return map;
}

function hydrateFilters() {
  fillSelect(elements.season, uniqueValues(state.data, "season").sort((a, b) => `${b}`.localeCompare(`${a}`)), "Season");
  fillSelect(elements.farmer, uniqueValues(state.data, "farmer_id").sort(), "Farmer");
  fillSelect(
    elements.operation,
    uniqueValues(state.data, "operation_normalized")
      .map((op) => ({ value: op, label: toTitle(op) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    "Operation"
  );
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
      basis: "ha",
      score: "single",
    });
    elements.season.value = "all";
    elements.farmer.value = "all";
    elements.operation.value = "all";
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
    return true;
  });
}

function enrichRow(row) {
  const area = row.covered_area || row.area_ha || 0;
  const production = row.production_t || 0;
  const rate = lookupSeedRate(row);
  const kgPerHa = rate?.kg_per_ha ?? (row.dose_kg_ha ?? null);
  const kgPerT = rate?.kg_per_t ?? (row.dose_kg_per_t ?? null);
  const opMatch = rate?.operation || "";
  const map = state.filters.score === "chara" ? state.seedChara : state.seedSingle;
  const impactHa = {};
  const impactT = {};
  Object.entries(map).forEach(([cat, obj]) => {
    const ef = obj.ef || 0;
    impactHa[cat] = kgPerHa == null ? null : ef * kgPerHa;
    impactT[cat] = kgPerT == null ? null : ef * kgPerT;
  });
  const totalHa = totalFromMap(impactHa);
  const totalT = totalFromMap(impactT);
  const fieldImpact = totalHa != null ? totalHa * area : null;
  const absImpactT = totalT != null ? totalT * production : null;
  return {
    ...row,
    impact_values_ha: impactHa,
    impact_values_t: impactT,
    total_impact_ha: totalHa,
    total_impact_t: totalT,
    field_impact: fieldImpact,
    abs_impact_t: absImpactT,
    production_t: production || null,
    rate_operation: opMatch,
    dose_kg_ha: kgPerHa,
    dose_kg_per_t: kgPerT,
  };
}

function renderActiveFilters(count) {
  const parts = [];
  const f = state.filters;
  if (f.season !== "all") parts.push(`Season ${f.season}`);
  if (f.farmer !== "all") parts.push(`Farmer ${f.farmer}`);
  if (f.operation !== "all") parts.push(toTitle(f.operation));
  parts.push(f.basis === "tonne" ? "Basis: kg/t" : "Basis: kg/ha");
  parts.push(f.score === "chara" ? "Impact: Characterisation" : "Impact: Single score");
  const label = parts.length ? parts.join(" • ") : "No filters applied";
  elements.activeFilters.textContent = `${label} — ${count} operations`;
}

function lookupSeedRate(row) {
  const dmu = row.dmu_id || "";
  const [farmer, season] = dmu.split("_");
  if (!farmer || !season) return null;
  const key = `${farmer}_${season}`;
  return state.seedRates.get(key) || null;
}

function renderStats(rows) {
  const totalArea = sum(rows, "area_ha");
  const totalProd = sum(rows, "production_t");
  const totalAbsHa = rows.reduce((sum, r) => sum + (r.field_impact || 0), 0);
  const totalAbsT = rows.reduce((sum, r) => sum + (r.abs_impact_t || 0), 0);
  const avgHa = totalArea ? totalAbsHa / totalArea : null;
  const avgT = totalProd ? totalAbsT / totalProd : null;
  const stats = [
    { label: "Operations", value: formatNumber(rows.length, 0) },
    { label: "Area (ha)", value: formatNumber(totalArea, 2) },
    {
      label: "Impact (Pt/ha)",
      value: state.filters.score === "chara" ? "—" : avgHa != null ? formatNumberSci(avgHa, 2) : "—",
    },
    {
      label: "Impact (Pt/t)",
      value: state.filters.score === "chara" ? "—" : avgT != null ? formatNumberSci(avgT, 2) : "—",
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
  const unitMap = usingChara ? state.seedChara : state.seedSingle;
  const denom = showBasisT ? sum(rows, "production_t") : sum(rows, "area_ha");
  const aggAbs = {};
  rows.forEach((row) => {
    const source = showBasisT ? row.impact_values_t : row.impact_values_ha;
    const scalar = showBasisT ? row.production_t || 0 : row.area_ha || row.covered_area || 0;
    if (!source || !scalar) return;
    Object.entries(source).forEach(([cat, val]) => {
      if (val == null || cat === "Total") return;
      aggAbs[cat] = (aggAbs[cat] || 0) + val * scalar;
    });
  });
  const agg = {};
  Object.entries(aggAbs).forEach(([cat, abs]) => {
    agg[cat] = denom ? abs / denom : abs;
  });
  const entries = Object.entries(agg)
    .map(([cat, value]) => ({ cat, value }))
    .sort((a, b) => b.value - a.value);
  const totalImpact = entries.reduce((sum, e) => sum + e.value, 0);
  elements.impactCount.textContent = `${entries.length} categories`;
  if (!entries.length) {
    elements.impactBars.innerHTML = `<p class="empty">No impacts to show.</p>`;
    return;
  }

  // characterisation: show table only
  if (usingChara) {
    const basisSuffix = showBasisT ? "/t" : "/ha";
    const defaultUnit = showBasisT ? "impact/t" : "impact/ha";
    const rowsTable = entries
      .map((entry) => {
        const unit =
          unitMap[entry.cat] && unitMap[entry.cat].unit
            ? `${unitMap[entry.cat].unit}${basisSuffix}`
            : defaultUnit;
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

  const defaultUnit = showBasisT ? "Pt/t" : "Pt/ha";
  const bars = entries
    .map((entry, idx) => {
      const color = palette[idx % palette.length];
      const pct = totalImpact ? (entry.value / totalImpact) * 100 : 0;
      const basisSuffix = showBasisT ? "/t" : "/ha";
      const unit =
        unitMap[entry.cat] && unitMap[entry.cat].unit
          ? `${unitMap[entry.cat].unit}${basisSuffix}`
          : defaultUnit;
      return `
        <div class="bar-row">
          <div class="bar-label">
            <div>${entry.cat}</div>
            <small>${formatNumberSci(entry.value, 2)} ${unit} (${formatNumber(pct, 1)}%)</small>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%; background:${color}"></div>
            <span class="bar-value">${formatNumber(pct, 1)}%</span>
          </div>
        </div>
      `;
    })
    .join("");
  elements.impactBars.innerHTML = bars;
}

function renderDetail(rows) {
  elements.detailCount.textContent = `${rows.length} records`;
  if (!rows.length) {
    elements.detailTable.innerHTML = `<p class="empty">No operations match these filters.</p>`;
    return;
  }
  const table = `
    <table>
      <thead>
        <tr>
          <th>Season</th>
          <th>Farmer ID</th>
          <th>Operation</th>
          <th>Dose (kg/ha)</th>
          <th>Dose (kg/t)</th>
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
                <td>${row.field_impact == null ? "—" : formatNumber(row.field_impact, 2)}</td>
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

function totalFromMap(obj) {
  if (!obj) return null;
  if (obj["Total"] != null) return obj["Total"];
  const vals = Object.values(obj).filter((v) => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0);
}

function formatNumber(value, digits = 1) {
  if (value == null || !isFinite(value)) return "—";
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

function toNum(value) {
  if (value == null || value === "") return null;
  const normalized = `${value}`.replace(/,/g, ".").trim();
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}
