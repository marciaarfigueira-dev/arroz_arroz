const state = {
  operations: [],
  sowing: [],
  fertilisation: [],
  machines: [],
  factors: {
    cp: {}, // herbicide/fungicide/insecticide
    seed: {},
    fert: {},
    machines: {},
  },
  filters: {
    season: "all",
    farmer: "all",
  },
};

const elements = {
  season: document.getElementById("season-filter"),
  farmer: document.getElementById("farmer-filter"),
  reset: document.getElementById("reset-filters"),
  activeFilters: document.getElementById("active-filters"),
  statGrid: document.getElementById("stat-grid"),
  impactBars: document.getElementById("impact-bars"),
  impactCount: document.getElementById("impact-count"),
  catBars: document.getElementById("cat-bars"),
  catCount: document.getElementById("cat-count"),
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
  const [ops, sow, fert, machines, singlescore] = await Promise.all([
    loadJson("./data/operations.json"),
    loadJson("./data/sowing.json"),
    loadJson("./data/fertilisation.json"),
    loadJson("./data/machines.json"),
    loadJson("./data/singlescore.json"),
  ]);
  state.operations = ops;
  state.sowing = sow;
  state.fertilisation = fert;
  state.machines = machines;
  state.factors = buildFactors(singlescore);
  hydrateFilters();
  attachEvents();
  render();
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Unable to load ${path}`);
  return res.json();
}

function buildFactors(records) {
  const byId = {};
  records.forEach((rec) => {
    const catMap = {};
    rec.categories.forEach((cat) => {
      catMap[cat.impact_category] = { ef: cat.total || 0, unit: cat.unit || "µPt" };
    });
    byId[rec.product_id] = catMap;
  });
  const agg = {};
  const combine = (ids) => {
    const out = {};
    ids.forEach((id) => {
      const map = byId[id];
      if (!map) return;
      Object.entries(map).forEach(([cat, obj]) => {
        out[cat] = (out[cat] || 0) + (obj.ef || 0);
      });
    });
    return out;
  };
  agg.cp = {
    herbicide: combine(["Herbicide", "singlescore_2_1", "singlescore_3_1"]),
    insecticide: combine(["Insecticide", "singlescore_4_1", "singlescore_5_1"]),
    fungicide: combine(["Fungicide", "singlescore_6_1", "singlescore_7_1"]),
  };
  agg.seed = combine(["singlescore_1_1"]);
  agg.fert = {
    N: combine(["singlescore_8_1"]),
    P: combine(["singlescore_9_1"]),
    K: combine(["singlescore_10_1"]),
  };
  agg.machines = {
    disk_harrow: combine(["singlescore_11_1"]),
    laser_leveler: combine(["singlescore_12_1"]),
    centrifugal_spreader: combine(["singlescore_13_1"]),
    rotary_tiller: combine(["singlescore_14_1"]),
    sprayer: combine(["singlescore_15_1"]),
    combine_harvester: combine(["singlescore_16_1"]),
    seeder: combine(["singlescore_17_1"]),
  };
  return agg;
}

function hydrateFilters() {
  const seasons = uniqueValues(
    [...state.operations, ...state.sowing, ...state.fertilisation, ...state.machines],
    "season"
  ).sort((a, b) => b - a);
  const farmers = uniqueValues(
    [...state.operations, ...state.sowing, ...state.fertilisation, ...state.machines],
    "farmer_id"
  ).sort();
  fillSelect(elements.season, seasons, "Season");
  fillSelect(elements.farmer, farmers, "Farmer");
}

function fillSelect(select, values, label) {
  select.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = `All ${label.toLowerCase()}s`;
  select.appendChild(all);
  values.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
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
  elements.reset.addEventListener("click", () => {
    state.filters.season = "all";
    state.filters.farmer = "all";
    elements.season.value = "all";
    elements.farmer.value = "all";
    render();
  });
}

function render() {
  const aggregates = aggregateScenarios();
  renderActiveFilters(aggregates.length);
  renderStats(aggregates);
  renderImpacts(aggregates);
  renderCategories(aggregates);
  renderDetail(aggregates);
}

function aggregateScenarios() {
  const map = new Map();
  const keyFn = (row) => `${row.farmer_id || ""}|${row.season || ""}`;
  const applyFilter = (row) => {
    if (state.filters.season !== "all" && `${row.season}` !== state.filters.season) return false;
    if (state.filters.farmer !== "all" && row.farmer_id !== state.filters.farmer) return false;
    return true;
  };

  const addImpact = (row, totalImpact, catImpact) => {
    const key = keyFn(row);
    if (!map.has(key)) {
      map.set(key, {
        farmer_id: row.farmer_id || "—",
        season: row.season || "—",
        totals: { crop_protection: 0, sowing: 0, fertilisation: 0, machines: 0 },
        categories: {},
        tonnes: 0,
      });
    }
    const target = map.get(key);
    if (totalImpact != null) {
      target.totals[catImpact.type] += totalImpact;
    }
    Object.entries(catImpact.values || {}).forEach(([cat, val]) => {
      target.categories[cat] = (target.categories[cat] || 0) + val;
    });
    if (catImpact.tonnes) {
      target.tonnes += catImpact.tonnes;
    }
  };

  // Crop protection
  state.operations.filter(applyFilter).forEach((row) => {
    const type = inferCpType(row);
    if (!type) return;
    const efMap = state.factors.cp[type];
    if (!efMap) return;
    const area = toNum(row.covered_area) || toNum(row.area_ha) || 0;
    const tonnes = computeTonnes(row, area);
    const doseHa = toNum(row.dose_kg_ha);
    const doseT = toNum(row.dose_kg_per_t);
    let fieldKg = null;
    if (doseHa != null && area) {
      fieldKg = doseHa * area;
    } else if (doseT != null && tonnes != null) {
      fieldKg = doseT * tonnes;
    }
    if (fieldKg == null) return;
    const catImpact = {};
    Object.entries(efMap).forEach(([cat, ef]) => {
      catImpact[cat] = fieldKg * ef;
    });
    const total = catImpact["Total"] ?? sumValues(catImpact);
    addImpact(row, total, { type: "crop_protection", values: catImpact, tonnes });
  });

  // Sowing
  state.sowing.filter(applyFilter).forEach((row) => {
    const efMap = state.factors.seed;
    const dose = toNum(row.dose_kg_ha);
    const area = toNum(row.covered_area) || toNum(row.area_ha) || 0;
    const tonnes = computeTonnes(row, area);
    if (dose == null || !area) return;
    const fieldKg = dose * area;
    const catImpact = {};
    Object.entries(efMap).forEach(([cat, ef]) => {
      catImpact[cat] = fieldKg * ef;
    });
    const total = catImpact["Total"] ?? sumValues(catImpact);
    addImpact(row, total, { type: "sowing", values: catImpact, tonnes });
  });

  // Fertilisation (N/P/K already weighted per ha)
  state.fertilisation.filter(applyFilter).forEach((row) => {
    const area = toNum(row.covered_area) || toNum(row.area_TOTAL) || toNum(row.area_ha) || 0;
    const tonnes = computeTonnes(row, area);
    const catImpact = {};
    const addNutrient = (nutrient, loadKgHa) => {
      if (loadKgHa == null) return;
      const efMap = state.factors.fert[nutrient];
      if (!efMap) return;
      const fieldKg = loadKgHa * area;
      Object.entries(efMap).forEach(([cat, ef]) => {
        catImpact[cat] = (catImpact[cat] || 0) + fieldKg * ef;
      });
    };
    addNutrient("N", toNum(row.n_kg_ha_weight));
    addNutrient("P", toNum(row.p_kg_ha_weight));
    addNutrient("K", toNum(row.k_kg_ha_weight));
    const total = catImpact["Total"] ?? sumValues(catImpact);
    addImpact(row, total, { type: "fertilisation", values: catImpact, tonnes });
  });

  // Machines (EF per m², area in ha)
  state.machines.filter(applyFilter).forEach((row) => {
    const eq = (row.equipment || "").toLowerCase();
    const efMap = state.factors.machines[eq];
    if (!efMap) return;
    const areaHa = toNum(row.total_area_worked) || toNum(row.area_ha) || 0;
    const tonnes = computeTonnes(row, areaHa);
    if (!areaHa) return;
    const areaM2 = areaHa * 10000;
    const catImpact = {};
    Object.entries(efMap).forEach(([cat, ef]) => {
      catImpact[cat] = areaM2 * ef;
    });
    const total = catImpact["Total"] ?? sumValues(catImpact);
    addImpact(row, total, { type: "machines", values: catImpact, tonnes });
  });

  return Array.from(map.values());
}

function renderActiveFilters(count) {
  const parts = [];
  if (state.filters.season !== "all") parts.push(`Season ${state.filters.season}`);
  if (state.filters.farmer !== "all") parts.push(`Farmer ${state.filters.farmer}`);
  parts.push("Basis: intensity (µPt/t)");
  const label = parts.length ? parts.join(" • ") : "No filters applied";
  elements.activeFilters.textContent = `${label} — ${count} farmer-seasons`;
}

function renderStats(rows) {
  const total = rows.reduce((sum, r) => sum + sumValues(r.totals), 0);
  const totalTonnes = rows.reduce((sum, r) => sum + (r.tonnes || 0), 0);
  const perT = totalTonnes ? total / totalTonnes : null;
  const stats = [
    { label: "Farmer-seasons", value: formatNumber(rows.length, 0) },
    { label: "Total impact (µPt)", value: formatNumber(total, 1) },
    { label: "Impact (µPt/t)", value: perT == null ? "—" : formatNumber(perT, 2) },
  ];
  elements.statGrid.innerHTML = stats
    .map(
      (s) => `
        <div class="stat">
          <small>${s.label}</small>
          <strong>${s.value}</strong>
        </div>
      `
    )
    .join("");
}

function renderImpacts(rows) {
  const agg = { crop_protection: 0, sowing: 0, fertilisation: 0, machines: 0 };
  const totalTonnes = rows.reduce((sum, r) => sum + (r.tonnes || 0), 0);
  rows.forEach((r) => {
    Object.entries(r.totals).forEach(([k, v]) => {
      agg[k] += v || 0;
    });
  });
  const entries = Object.entries(agg)
    .map(([k, v]) => ({ key: k, value: totalTonnes ? v / totalTonnes : 0 }))
    .filter((e) => e.value)
    .sort((a, b) => b.value - a.value);
  elements.impactCount.textContent = `${entries.length} inputs (µPt/t)`;
  if (!entries.length) {
    elements.impactBars.innerHTML = `<p class="empty">No impacts to show.</p>`;
    return;
  }
  const maxVal = Math.max(...entries.map((e) => e.value), 1);
  const bars = entries
    .map((entry, idx) => {
      const color = palette[idx % palette.length];
      return `
        <div class="bar-row">
          <div class="bar-label">
            <div>${toTitle(entry.key.replace("_", " "))}</div>
            <small>${formatNumber(entry.value, 2)} µPt/t</small>
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

function renderCategories(rows) {
  const agg = {};
  const totalTonnes = rows.reduce((sum, r) => sum + (r.tonnes || 0), 0);
  rows.forEach((r) => {
    Object.entries(r.categories || {}).forEach(([cat, val]) => {
      agg[cat] = (agg[cat] || 0) + (val || 0);
    });
  });
  const entries = Object.entries(agg)
    .filter(([, v]) => v)
    .map(([cat, value]) => ({ cat, value: totalTonnes ? value / totalTonnes : 0 }))
    .sort((a, b) => b.value - a.value);
  elements.catCount.textContent = `${entries.length} categories (µPt/t)`;
  if (!entries.length) {
    elements.catBars.innerHTML = `<p class="empty">No category impacts to show.</p>`;
    return;
  }
  const maxVal = Math.max(...entries.map((e) => e.value), 1);
  const bars = entries
    .map((entry, idx) => {
      const color = palette[idx % palette.length];
      return `
        <div class="bar-row">
          <div class="bar-label">
            <div>${entry.cat}</div>
            <small>${formatNumber(entry.value, 2)} µPt/t</small>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${(entry.value / maxVal) * 100}%; background:${color}"></div>
            <span class="bar-value">${formatNumber(entry.value, 2)}</span>
          </div>
        </div>
      `;
    })
    .join("");
  elements.catBars.innerHTML = bars;
}

function renderDetail(rows) {
  elements.detailCount.textContent = `${rows.length} farmer-seasons`;
  if (!rows.length) {
    elements.detailTable.innerHTML = `<p class="empty">No records found.</p>`;
    return;
  }
  const table = `
    <table>
      <thead>
        <tr>
          <th>Season</th>
          <th>Farmer</th>
          <th>Crop protection (µPt/t)</th>
          <th>Sowing (µPt/t)</th>
          <th>Fertilisation (µPt/t)</th>
          <th>Machines (µPt/t)</th>
          <th>Total (µPt/t)</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const total = sumValues(r.totals);
            const tonnes = r.tonnes || 0;
            const div = tonnes || null;
            return `
            <tr>
              <td>${r.season}</td>
              <td>${r.farmer_id}</td>
              <td>${div ? formatNumber((r.totals.crop_protection || 0) / div, 2) : "—"}</td>
              <td>${div ? formatNumber((r.totals.sowing || 0) / div, 2) : "—"}</td>
              <td>${div ? formatNumber((r.totals.fertilisation || 0) / div, 2) : "—"}</td>
              <td>${div ? formatNumber((r.totals.machines || 0) / div, 2) : "—"}</td>
              <td>${div ? formatNumber(total / div, 2) : "—"}</td>
            </tr>
          `;
          })
          .join("")}
      </tbody>
    </table>
  `;
  elements.detailTable.innerHTML = table;
}

function inferCpType(row) {
  const op = (row.operation || row.operation_normalized || "").toLowerCase();
  if (op.includes("herbicide")) return "herbicide";
  if (op.includes("fungicide")) return "fungicide";
  if (op.includes("insecticide") || op.includes("pesticide")) return "insecticide";
  return null;
}

function computeTonnes(row, area) {
  if (row.area_per_tonne && row.area_per_tonne > 0) {
    return area / row.area_per_tonne;
  }
  const prod = toNum(row.productivity) || toNum(row.productivity_weighted);
  if (prod && prod > 0) {
    return area * prod;
  }
  return null;
}

function toNum(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") {
    const cleaned = val.replace(",", ".").trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function uniqueValues(rows, key) {
  return Array.from(
    rows.reduce((set, row) => {
      if (row[key] !== undefined && row[key] !== null && row[key] !== "") set.add(row[key]);
      return set;
    }, new Set())
  );
}

function sumValues(obj) {
  return Object.values(obj || {}).reduce((a, b) => a + (b || 0), 0);
}

function formatNumber(value, digits = 1) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function toTitle(str) {
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
