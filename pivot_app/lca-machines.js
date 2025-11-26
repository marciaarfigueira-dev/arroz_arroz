const EQUIPMENT_MAP = {
  disk_harrow: "singlescore_11_1",
  laser_leveler: "singlescore_12_1",
  centrifugal_spreader: "singlescore_13_1",
  rotary_tiller: "singlescore_14_1",
  sprayer: "singlescore_15_1",
  combine_harvester: "singlescore_16_1",
  seeder: "singlescore_17_1",
};

const EQUIPMENT_CHARA_MAP = {
  disk_harrow: "11_chara",
  laser_leveler: "12_chara",
  centrifugal_spreader: "13_chara",
  rotary_tiller: "14_chara",
  sprayer: "15_chara",
  combine_harvester: "16_chara",
  seeder: "17_chara",
};

const state = {
  data: [],
  singleMaps: {}, // {product_id:{cat:{ef,unit}}}
  charaMaps: {}, // {product_id:{cat:{ef,unit}}}
  filters: {
    season: "all",
    farmer: "all",
    operation: "all",
    equipment: "all",
    basis: "ha",
    score: "single",
  },
};

const elements = {
  season: document.getElementById("season-filter"),
  farmer: document.getElementById("farmer-filter"),
  operation: document.getElementById("operation-filter"),
  equipment: document.getElementById("equipment-filter"),
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
  const [machines, singlescore, chara] = await Promise.all([
    loadMachines(),
    loadSinglescore(),
    loadChara(),
  ]);
  state.data = machines;
  const { singleMaps, charaMaps } = buildFactors(singlescore, chara);
  state.singleMaps = singleMaps;
  state.charaMaps = charaMaps;
  hydrateFilters();
  attachEvents();
  render();
}

async function loadMachines() {
  const res = await fetch("./data/machines.json");
  if (!res.ok) throw new Error("Unable to load machines data");
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

function buildFactors(singleRecords, charaRecords) {
  const singleMaps = {};
  singleRecords.forEach((rec) => {
    const catMap = {};
    rec.categories.forEach((cat) => {
      catMap[cat.impact_category] = { ef: cat.total || 0, unit: cat.unit || "µPt" };
    });
    singleMaps[rec.product_id] = catMap;
  });
  const charaMaps = {};
  charaRecords.forEach((rec) => {
    const catMap = {};
    rec.categories.forEach((cat) => {
      if (cat.total == null) return;
      catMap[cat.impact_category] = { ef: cat.total || 0, unit: cat.unit || "" };
    });
    charaMaps[rec.product_id] = catMap;
  });
  return { singleMaps, charaMaps };
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
  fillSelect(elements.equipment, uniqueValues(state.data, "equipment").sort(), "Equipment");
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
  elements.equipment.addEventListener("change", () => {
    state.filters.equipment = elements.equipment.value;
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
      equipment: "all",
      basis: "ha",
      score: "single",
    });
    elements.season.value = "all";
    elements.farmer.value = "all";
    elements.operation.value = "all";
    elements.equipment.value = "all";
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
    if (filters.equipment !== "all" && row.equipment !== filters.equipment) return false;
    return true;
  });
}

function enrichRow(row) {
  const eqKey = (row.equipment || "").toLowerCase();
  const factorId =
    state.filters.score === "chara" ? EQUIPMENT_CHARA_MAP[eqKey] : EQUIPMENT_MAP[eqKey];
  const mapSet = state.filters.score === "chara" ? state.charaMaps : state.singleMaps;
  const catMap = factorId ? mapSet[factorId] : null;
  const areaHa = row.total_area_worked || row.area_ha || 0;
  const areaM2 = areaHa * 10000;
  const areaPerTonneHa = row.area_per_tonne || 0;
  const areaPerTonneM2 = areaPerTonneHa * 10000;
  const impactHa = {};
  const impactT = {};
  if (catMap) {
    Object.entries(catMap).forEach(([cat, ef]) => {
      const factor = typeof ef === "object" ? ef.ef : ef;
      if (factor == null) return;
      impactHa[cat] = areaM2 ? areaM2 * factor : null;
      impactT[cat] = areaPerTonneM2 ? areaPerTonneM2 * factor : null;
    });
  }
  const totalHa = totalFromMap(impactHa);
  const totalT = totalFromMap(impactT);
  return {
    ...row,
    impact_values_ha: impactHa,
    impact_values_t: impactT,
    total_impact_ha: totalHa,
    total_impact_t: totalT,
  };
}

function renderActiveFilters(count) {
  const parts = [];
  const f = state.filters;
  if (f.season !== "all") parts.push(`Season ${f.season}`);
  if (f.farmer !== "all") parts.push(`Farmer ${f.farmer}`);
  if (f.operation !== "all") parts.push(toTitle(f.operation));
  if (f.equipment !== "all") parts.push(f.equipment);
  parts.push(f.basis === "tonne" ? "Basis: area/t" : "Basis: area worked");
  parts.push(f.score === "chara" ? "Impact: Characterisation" : "Impact: Single score");
  const label = parts.length ? parts.join(" • ") : "No filters applied";
  elements.activeFilters.textContent = `${label} — ${count} operations`;
}

function renderStats(rows) {
  const totalArea = sum(rows, "total_area_worked");
  const totalImpactHa = rows.reduce((sum, r) => sum + (r.total_impact_ha || 0), 0);
  const totalImpactT = rows.reduce((sum, r) => sum + (r.total_impact_t || 0), 0);
  const stats = [
    { label: "Operations", value: formatNumber(rows.length, 0) },
    { label: "Area worked (ha)", value: formatNumber(totalArea, 2) },
    { label: "Impact (µPt op)", value: totalImpactHa ? formatNumber(totalImpactHa, 2) : "—" },
    { label: "Impact (µPt/t)", value: totalImpactT ? formatNumber(totalImpactT, 2) : "—" },
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
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
  const totalImpact = entries.reduce((sum, e) => sum + e.value, 0);
  elements.impactCount.textContent = `${entries.length} categories`;
  if (!entries.length) {
    elements.impactBars.innerHTML = `<p class="empty">No impacts to show.</p>`;
    return;
  }
  const maxVal = Math.max(...entries.map((e) => e.value), 1);
  const defaultUnit = showBasisT ? "µPt/t" : "µPt (op)";
  const bars = entries
    .map((entry, idx) => {
      const color = palette[idx % palette.length];
      const pct = totalImpact ? (entry.value / totalImpact) * 100 : 0;
      const unit = unitMap[entry.key] || defaultUnit;
      return `
        <div class="bar-row">
          <div class="bar-label">
            <div>${entry.key}</div>
            <small>${formatNumber(entry.value, 2)} ${unit} • ${formatNumber(pct, 1)}%</small>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${(entry.value / maxVal) * 100}%; background:${color}"></div>
            <span class="bar-value">${formatNumber(entry.value, 2)}</span>
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
          <th>Equipment</th>
          <th>Area worked (ha)</th>
          <th>Area per tonne (ha/t)</th>
          <th>${state.filters.basis === "tonne" ? "Impact (µPt/t)" : "Impact (µPt op)"}</th>
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
                <td>${row.equipment}</td>
                <td>${row.total_area_worked == null ? "—" : formatNumber(row.total_area_worked, 2)}</td>
                <td>${row.area_per_tonne == null ? "—" : formatNumber(row.area_per_tonne, 3)}</td>
                <td>${
                  state.filters.basis === "tonne"
                    ? row.total_impact_t == null
                      ? "—"
                      : formatNumber(row.total_impact_t, 2)
                    : row.total_impact_ha == null
                    ? "—"
                    : formatNumber(row.total_impact_ha, 2)
                }</td>
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
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function toTitle(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}
