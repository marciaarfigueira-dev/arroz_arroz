const state = {
  data: [],
  filters: { season: "all", cluster: "all", basis: "ha", source: "all" },
};

const elements = {
  season: document.getElementById("season-filter"),
  cluster: document.getElementById("cluster-filter"),
  basis: document.getElementById("basis-filter"),
  source: document.getElementById("source-filter"),
  reset: document.getElementById("reset-filters"),
  active: document.getElementById("active-filters"),
  statGrid: document.getElementById("stat-grid"),
  impactBars: document.getElementById("impact-bars"),
  impactCount: document.getElementById("impact-count"),
  detailTable: document.getElementById("detail-table"),
  detailCount: document.getElementById("detail-count"),
  download: document.getElementById("download-csv"),
};

const palette = ["#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#10b981"];
const sourceColors = {
  crop_protection: "#ef4444",
  sowing: "#22c55e",
  fertilisation: "#3b82f6",
  machines: "#a855f7",
  water: "#0bb7a8",
  methane: "#f59e0b",
  n2o: "#10b981",
};
const categoryOrder = [
  "Climate change",
  "Ozone depletion",
  "Ionising radiation",
  "Photochemical ozone formation",
  "Particulate matter",
  "Human toxicity, non-cancer",
  "Human toxicity, cancer",
  "Acidification",
  "Eutrophication, freshwater",
  "Eutrophication, marine",
  "Eutrophication, terrestrial",
  "Ecotoxicity, freshwater",
  "Land use",
  "Water use",
  "Resource use, fossils",
  "Resource use, minerals and metals",
  "Climate change - Fossil",
  "Climate change - Biogenic",
  "Climate change - Land use and LU change",
  "Human toxicity, non-cancer - organics",
  "Human toxicity, non-cancer - inorganics",
  "Human toxicity, non-cancer - metals",
  "Human toxicity, cancer - organics",
  "Human toxicity, cancer - inorganics",
  "Human toxicity, cancer - metals",
  "Ecotoxicity, freshwater - organics",
  "Ecotoxicity, freshwater - inorganics",
  "Ecotoxicity, freshwater - metals",
];
const unitMap = {
  "Climate change": "kg CO₂ eq",
  "Ozone depletion": "kg CFC11 eq",
  "Ionising radiation": "kBq U-235 eq",
  "Photochemical ozone formation": "kg NMVOC eq",
  "Particulate matter": "disease inc.",
  "Human toxicity, non-cancer": "CTUh",
  "Human toxicity, cancer": "CTUh",
  "Acidification": "mol H⁺ eq",
  "Eutrophication, freshwater": "kg P eq",
  "Eutrophication, marine": "kg N eq",
  "Eutrophication, terrestrial": "mol N eq",
  "Ecotoxicity, freshwater": "CTUe",
  "Land use": "Pt",
  "Water use": "m³ depriv.",
  "Resource use, fossils": "MJ",
  "Resource use, minerals and metals": "kg Sb eq",
  "Climate change - Fossil": "kg CO₂ eq",
  "Climate change - Biogenic": "kg CO₂ eq",
  "Climate change - Land use and LU change": "kg CO₂ eq",
  "Human toxicity, non-cancer - organics": "CTUh",
  "Human toxicity, non-cancer - inorganics": "CTUh",
  "Human toxicity, non-cancer - metals": "CTUh",
  "Human toxicity, cancer - organics": "CTUh",
  "Human toxicity, cancer - inorganics": "CTUh",
  "Human toxicity, cancer - metals": "CTUh",
  "Ecotoxicity, freshwater - organics": "CTUe",
  "Ecotoxicity, freshwater - inorganics": "CTUe",
  "Ecotoxicity, freshwater - metals": "CTUe",
};

init();

async function init() {
  const [exports, water] = await Promise.all([loadJson("./data/lca_chara_inputs_v2.json"), loadJson("./data/water.json")]);
  state.water = water;
  const obs = exports.map((r) => ({
    ...r,
    // placeholders to avoid NaN in PCA; clustering not meaningful but keeps UI consistent
    N_rate_kg_ha: 0,
    Pesticide_load_kg_ha: 0,
    Yield_kg_ha: 0,
    Machinery_area_ratio: 0,
  }));
  const rowsForPca = obs.map((r) => [r.N_rate_kg_ha, r.Pesticide_load_kg_ha, r.Yield_kg_ha, r.Machinery_area_ratio]);
  const { scores } = pca(rowsForPca, 2);
  const labels = ward(scores, 3);
  state.data = obs.map((r, idx) => ({ ...r, cluster: labels[idx] }));
  hydrateFilters();
  attachEvents();
  render();
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Unable to load ${path}`);
  return res.json();
}

function buildFactors(chara) {
  const mapCats = (id) => {
    const rec = chara.find((r) => r.product_id === id);
    if (!rec) return {};
    const out = {};
    rec.categories.forEach((c) => {
      out[c.impact_category] = (out[c.impact_category] || 0) + (Number(c.total) || 0);
    });
    return out;
  };
  const mergeCats = (...objs) => {
    const out = {};
    objs.forEach((o) => {
      Object.entries(o || {}).forEach(([cat, val]) => {
        out[cat] = (out[cat] || 0) + (val || 0);
      });
    });
    return out;
  };
  const herbicide = mergeCats(mapCats("2_chara"), mapCats("3_chara"));
  const insecticide = mergeCats(mapCats("4_chara"), mapCats("5_chara"));
  const fungicide = mergeCats(mapCats("6_chara"), mapCats("7_chara"));
  return {
    cropProt: { herbicide, insecticide, fungicide },
    seed: mapCats("1_chara"),
    fert: {
      N: mapCats("8_chara"),
      P: mapCats("9_chara"),
      K: mapCats("10_chara"),
    },
    machines: {
      disk_harrow: mapCats("11_chara"),
      laser_leveler: mapCats("12_chara"),
      centrifugal_spreader: mapCats("13_chara"),
      rotary_tiller: mapCats("14_chara"),
      sprayer: mapCats("15_chara"),
      combine_harvester: mapCats("16_chara"),
      seeder: mapCats("17_chara"),
    },
    water: mapCats("18_chara"),
  };
}

function buildInventories(ops, sow, fert, machines, ch4Rows, n2oRows, factors) {
  const map = new Map();
  const keyFn = (r) => `${r.farmer_id || r.dmu_id || "?"}|${r.season || r.year || "?"}`;
  const ensure = (r) => {
    const key = keyFn(r);
    if (!map.has(key)) {
      map.set(key, {
        key,
        farmer_id: r.farmer_id || r.dmu_id || "—",
        season: r.season || r.year || "—",
        area: 0,
        tonnes: 0,
        N_rate_kg_ha: null,
        Pesticide_load_kg_ha: null,
        Yield_kg_ha: null,
        Machinery_area_ratio: null,
        impacts: { crop_protection: 0, sowing: 0, fertilisation: 0, machines: 0, water: 0, methane: 0, n2o: 0 },
        catBySource: {
          crop_protection: {},
          sowing: {},
          fertilisation: {},
          machines: {},
          water: {},
          methane: {},
          n2o: {},
        },
        impactsCat: {},
      });
    }
    return map.get(key);
  };

  const computeTonnes = (row, area) => {
    if (row.area_per_tonne && row.area_per_tonne > 0) return area / row.area_per_tonne;
    const prod = toNum(row.productivity) || toNum(row.productivity_weighted);
    if (prod && prod > 0) return area * prod;
    return null;
  };

  // Fertilisation
  fert.forEach((r) => {
    const area = toNum(r.covered_area) || toNum(r.area_TOTAL) || toNum(r.area_ha) || 0;
    const tonnes = computeTonnes(r, area) || 0;
    const obj = ensure(r);
    obj.area += area;
    obj.tonnes += tonnes;
    const addNutrient = (nutrient, load) => {
      if (load == null) return;
      const eff = factors.fert[nutrient] || {};
      addCats(obj, "fertilisation", eff, load * area);
    };
    addNutrient("N", toNum(r.n_kg_ha_weight));
    addNutrient("P", toNum(r.p_kg_ha_weight));
    addNutrient("K", toNum(r.k_kg_ha_weight));
    if (toNum(r.n_kg_ha_weight) != null) obj.N_rate_kg_ha = toNum(r.n_kg_ha_weight);
  });

  // Crop protection
  ops.forEach((r) => {
    const op = (r.operation || "").toLowerCase();
    const type = op.includes("herbicide")
      ? "herbicide"
      : op.includes("fungicide")
      ? "fungicide"
      : op.includes("insecticide") || op.includes("pesticide")
      ? "insecticide"
      : null;
    if (!type) return;
    const area = toNum(r.covered_area) || toNum(r.area_ha) || 0;
    const tonnes = computeTonnes(r, area) || 0;
    const obj = ensure(r);
    obj.area += area;
    obj.tonnes += tonnes;
    const doseHa = toNum(r.dose_kg_ha);
    const doseT = toNum(r.dose_kg_per_t);
    const eff = factors.cropProt[type] || {};
    const apply = doseHa != null ? doseHa * area : doseT != null && tonnes ? doseT * tonnes : null;
    if (apply != null) addCats(obj, "crop_protection", eff, apply);
    if (doseHa != null) obj.Pesticide_load_kg_ha = (obj.Pesticide_load_kg_ha || 0) + doseHa;
  });

  // Sowing
  sow.forEach((r) => {
    const area = toNum(r.covered_area) || toNum(r.area_ha) || 0;
    const tonnes = computeTonnes(r, area) || 0;
    const obj = ensure(r);
    obj.area += area;
    obj.tonnes += tonnes;
    const doseHa = toNum(r.dose_kg_ha);
    const doseT = toNum(r.dose_kg_per_t);
    const eff = factors.seed || {};
    const apply = doseHa != null ? doseHa * area : doseT != null && tonnes ? doseT * tonnes : null;
    if (apply != null) addCats(obj, "sowing", eff, apply);
  });

  // Machines
  machines.forEach((r) => {
    const eq = (r.equipment || "").toLowerCase();
    const ef = factors.machines[eq];
    if (!ef) return;
    const areaHa = toNum(r.repetitions) || toNum(r.total_area_worked) || toNum(r.area_ha) || 0;
    const tonnes = computeTonnes(r, areaHa) || 0;
    const obj = ensure(r);
    obj.area += areaHa;
    obj.tonnes += tonnes;
    addCats(obj, "machines", ef, areaHa);
    obj.Machinery_area_ratio = areaHa && obj.area ? areaHa / obj.area : obj.Machinery_area_ratio;
  });

  // Water
  if (state.water) {
    state.water.forEach((r) => {
      const obj = ensure(r);
      const area = toNum(r["SUM of area_ha"]) || obj.area || 0;
      const perHa = toNum(r["Water m3/ha"]);
      const perT = toNum(r["Water M3/t"]);
      const tonnes = obj.tonnes || (toNum(r["Productivity (t/ha)"]) && area ? toNum(r["Productivity (t/ha)"]) * area : 0);
      if (perHa != null && area) addCats(obj, "water", factors.water, perHa * area);
      else if (perT != null && tonnes) addCats(obj, "water", factors.water, perT * tonnes);
    });
  }

  // Methane (characterisation: kg CO2e)
  ch4Rows.forEach((r) => {
    const obj = ensure(r);
    const area = obj.area || toNum(r["SUM of area_ha"]) || 0;
    const ch4Ha = toNum(r["C02eq(ch4)_ha"]);
    if (ch4Ha != null && area) {
      const eff = { "Climate change": ch4Ha };
      addCats(obj, "methane", eff, area);
    }
  });

  // N2O (characterisation: kg CO2e)
  n2oRows.forEach((r) => {
    const obj = ensure(r);
    const area = toNum(r.area_TOTAL) || obj.area || 0;
    const perHa =
      (toNum(r["CO2 eq (direct emissions)"]) || 0) +
      (toNum(r["CO2 eq (indirect emissions VOL)"]) || 0) +
      (toNum(r["CO2 eq (indirect emissions VLEACH)"]) || 0) +
      (toNum(r["CO2 from urea"]) || 0);
    if (area) {
      const eff = { "Climate change": perHa };
      addCats(obj, "n2o", eff, area);
    }
    if (!obj.area && area) obj.area = area;
  });

  // Yield and finalize rates
  ops.forEach((r) => {
    const area = toNum(r.covered_area) || toNum(r.area_ha) || 0;
    const prod = toNum(r.productivity) || toNum(r.productivity_weighted);
    if (prod == null) return;
    const obj = ensure(r);
    if (!obj.area) obj.area += area;
    if (area) obj.Yield_kg_ha = prod * 1000;
  });

  return Array.from(map.values()).map((r) => {
    const total = sumValues(r.impactsCat);
    const perHa = r.area ? total / r.area : null;
    const perT = r.tonnes ? total / r.tonnes : null;
    return { ...r, total, perHa, perT };
  });
}

function addCats(obj, source, eff, amount) {
  const sum = Object.values(eff || {}).reduce((s, v) => s + (v || 0), 0);
  obj.impacts[source] += (amount || 0) * sum;
  Object.entries(eff || {}).forEach(([cat, val]) => {
    if (val == null) return;
    obj.impactsCat[cat] = (obj.impactsCat[cat] || 0) + (amount || 0) * val;
    obj.catBySource[source][cat] = (obj.catBySource[source][cat] || 0) + (amount || 0) * val;
  });
}

function hydrateFilters() {
  fillSelect(elements.season, uniqueValues(state.data, "season").sort((a, b) => b - a), "Season");
  if (elements.cluster) {
    elements.cluster.innerHTML = "";
    ["all", "0", "1", "2"].forEach((val) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val === "all" ? "All clusters" : `Cluster ${Number(val) + 1}`;
      elements.cluster.appendChild(opt);
    });
  }
}

function fillSelect(select, values, label) {
  if (!select) return;
  select.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "all";
  opt.textContent = `All ${label.toLowerCase()}s`;
  select.appendChild(opt);
  values.forEach((v) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
}

function attachEvents() {
  elements.season.addEventListener("change", () => {
    state.filters.season = elements.season.value;
    render();
  });
  elements.cluster.addEventListener("change", () => {
    state.filters.cluster = elements.cluster.value;
    render();
  });
  elements.basis.addEventListener("change", () => {
    state.filters.basis = elements.basis.value;
    render();
  });
  elements.source.addEventListener("change", () => {
    state.filters.source = elements.source.value;
    render();
  });
  elements.reset.addEventListener("click", () => {
    state.filters = { season: "all", cluster: "all", basis: "ha", source: "all" };
    elements.season.value = "all";
    elements.cluster.value = "all";
    elements.basis.value = "ha";
    elements.source.value = "all";
    render();
  });
  if (elements.download) {
    elements.download.addEventListener("click", downloadCsv);
  }
}

function render() {
  const filtered = state.data.filter((r) => {
    if (state.filters.season !== "all" && `${r.season}` !== state.filters.season) return false;
    if (state.filters.cluster !== "all" && r.cluster !== Number(state.filters.cluster)) return false;
    return true;
  });
  state.filtered = filtered;
  renderActive(filtered.length);
  renderStats(filtered);
  renderImpacts(filtered);
  renderDetail(filtered);
}

function collectCategories(rows) {
  const catsSet = new Set();
  rows.forEach((r) => {
    const srcCats = state.filters.basis === "tonne" ? r.perTCatSources : r.perHaCatSources;
    const allCats = state.filters.basis === "tonne" ? r.perTCats : r.perHaCats;
    const keys =
      state.filters.source === "all"
        ? Object.keys(allCats || {})
        : Object.keys(srcCats || {}).filter((cat) => srcCats && srcCats[cat] && srcCats[cat][state.filters.source] != null);
    keys.forEach((c) => catsSet.add(c));
  });
  const ordered = categoryOrder.filter((c) => catsSet.has(c));
  const leftovers = Array.from(catsSet).filter((c) => !categoryOrder.includes(c)).sort();
  return [...ordered, ...leftovers];
}

function downloadCsv() {
  const rows = state.filtered || [];
  if (!rows.length) return;
  const cats = collectCategories(rows);
  const unit = state.filters.basis === "tonne" ? "impact/t" : "impact/ha";
  const header = ["season", "cluster", "farmer", ...cats.map((c) => `${c} (${unitMap[c] || unit})`)];
  const body = rows.map((r) => {
    const catTotals = state.filters.basis === "tonne" ? r.perTCats : r.perHaCats;
    const catSources = state.filters.basis === "tonne" ? r.perTCatSources : r.perHaCatSources;
    const filtered = {};
    cats.forEach((cat) => {
      if (state.filters.source === "all") {
        filtered[cat] = catTotals ? catTotals[cat] : null;
      } else {
        filtered[cat] =
          catSources && catSources[cat] && catSources[cat][state.filters.source] != null
            ? catSources[cat][state.filters.source]
            : null;
      }
    });
    const totalVal = Object.values(filtered).reduce((s, v) => (v != null ? s + v : s), 0);
    const cells = cats.map((cat) => {
      const val = filtered[cat];
      const pct = totalVal ? ((val || 0) / totalVal) * 100 : null;
      return val == null ? "" : `${val},${pct == null ? "" : pct}`;
    });
    return [r.season, r.cluster + 1, r.farmer_id, ...cells].join(",");
  });
  const csv = [header.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "clustered_lca_characterisation.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderActive(count) {
  const parts = [];
  if (state.filters.season !== "all") parts.push(`Season ${state.filters.season}`);
  if (state.filters.cluster !== "all") parts.push(`Cluster ${Number(state.filters.cluster) + 1}`);
  parts.push(state.filters.basis === "tonne" ? "Basis: impact/t" : "Basis: impact/ha");
  if (state.filters.source !== "all") parts.push(`Input: ${toTitle(state.filters.source)}`);
  elements.active.textContent = parts.length ? `${parts.join(" • ")} — ${count} rows` : `No filters applied — ${count} rows`;
}

function renderStats(rows) {
  if (!rows.length) {
    elements.statGrid.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
  const useTonnes = state.filters.basis === "tonne";
  const denom = useTonnes ? rows.reduce((s, r) => s + (r.tonnes || 0), 0) : rows.reduce((s, r) => s + (r.area || 0), 0);
  let totalAbs = 0;
  rows.forEach((r) => {
    const scalar = useTonnes ? r.tonnes || 0 : r.area || 0;
    const val = useTonnes ? r.perT : r.perHa;
    if (val != null && scalar) totalAbs += val * scalar;
  });
  const avg = denom ? totalAbs / denom : null;
  const stats = [
    { label: "Rows", value: formatNumber(rows.length, 0) },
    {
      label: `Impact (${state.filters.basis === "tonne" ? "impact/t" : "impact/ha"})`,
      value: avg == null ? "—" : formatNumber(avg, 2),
    },
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
  const useTonnes = state.filters.basis === "tonne";
  const denomTotal = useTonnes ? rows.reduce((s, r) => s + (r.tonnes || 0), 0) : rows.reduce((s, r) => s + (r.area || 0), 0);
  const catAggAbs = {};
  const sourceAggAbs = {};
  rows.forEach((r) => {
    const cats = useTonnes ? r.perTCats : r.perHaCats;
    const bySource = useTonnes ? r.perTCatSources : r.perHaCatSources;
    const scalar = useTonnes ? r.tonnes || 0 : r.area || 0;
    if (!scalar) return;
    Object.entries(cats || {}).forEach(([cat, val]) => {
      if (val == null) return;
      catAggAbs[cat] = (catAggAbs[cat] || 0) + val * scalar;
    });
    Object.entries(bySource || {}).forEach(([cat, sources]) => {
      Object.entries(sources || {}).forEach(([src, val]) => {
        if (state.filters.source !== "all" && state.filters.source !== src) return;
        if (val == null) return;
        if (!sourceAggAbs[cat]) sourceAggAbs[cat] = {};
        sourceAggAbs[cat][src] = (sourceAggAbs[cat][src] || 0) + val * scalar;
      });
    });
  });
  const catAgg = {};
  const sourceAgg = {};
  Object.entries(catAggAbs).forEach(([cat, abs]) => {
    catAgg[cat] = denomTotal ? abs / denomTotal : abs;
  });
  Object.entries(sourceAggAbs).forEach(([cat, srcs]) => {
    sourceAgg[cat] = {};
    Object.entries(srcs).forEach(([src, abs]) => {
      sourceAgg[cat][src] = denomTotal ? abs / denomTotal : abs;
    });
  });
  const entries = Object.entries(catAgg)
    .filter(([, v]) => v)
    .map(([cat, value]) => ({ cat, value, sources: sourceAgg[cat] || {} }))
    .sort((a, b) => {
      const ia = categoryOrder.indexOf(a.cat);
      const ib = categoryOrder.indexOf(b.cat);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return b.value - a.value;
    });
  elements.impactCount.textContent = `${entries.length} categories`;
  if (!entries.length) {
    elements.impactBars.innerHTML = `<p class="empty">No impacts to show.</p>`;
    return;
  }
  const unit = state.filters.basis === "tonne" ? "impact/t" : "impact/ha";
  const sourceOrder = ["crop_protection", "sowing", "fertilisation", "machines", "water", "methane", "n2o"].filter(
    (s) => state.filters.source === "all" || state.filters.source === s
  );
  elements.impactBars.innerHTML = entries
    .map((entry) => {
      const unitLabel =
        unitMap[entry.cat] ? `${unitMap[entry.cat]} · ${state.filters.basis === "tonne" ? "per t" : "per ha"}` : state.filters.basis === "tonne" ? "impact/t" : "impact/ha";
      const segments = sourceOrder
        .map((src, idx) => {
          const val = entry.sources[src] || 0;
          const pct = entry.value ? (val / entry.value) * 100 : 0;
          return { src, val, pct, color: sourceColors[src] || palette[idx % palette.length] };
        })
        .filter((s) => s.val > 0);
      let offset = 0;
      const segmentDivs = segments
        .map((s) => {
          const left = offset;
          offset += s.pct;
          return `
            <div class="bar-fill" style="left:${left}%; width:${s.pct}%; background:${s.color}" title="${toTitle(s.src)} · ${formatNumber(s.val, 2)} ${unit} (${formatNumber(s.pct, 1)}%)">
              <span class="segment-value">${formatNumber(s.pct, 1)}%</span>
            </div>
          `;
        })
        .join("");
      return `
        <div class="bar-row">
          <div class="bar-label">
            <div>${entry.cat}</div>
            <small>${formatNumber(entry.value, 2)} ${unitLabel}</small>
          </div>
          <div class="bar-track stacked with-values">
            ${segmentDivs}
          </div>
        </div>
      `;
    })
    .join("");
}

function renderDetail(rows) {
  elements.detailCount.textContent = `${rows.length} rows`;
  if (!rows.length) {
    elements.detailTable.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
  const unit = state.filters.basis === "tonne" ? "impact/t" : "impact/ha";
  const catsSet = new Set();
  rows.forEach((r) => {
    const srcCats = state.filters.basis === "tonne" ? r.perTCatSources : r.perHaCatSources;
    const allCats = state.filters.basis === "tonne" ? r.perTCats : r.perHaCats;
    Object.keys(state.filters.source === "all" ? allCats || {} : (srcCats && Object.keys(srcCats)) || {}).forEach((c) =>
      catsSet.add(c)
    );
  });
  const cats = Array.from(catsSet);
  const table = `
    <table class="sticky-cols">
      <thead>
        <tr>
          <th class="sticky col-season">Season</th>
          <th class="sticky col-cluster">Cluster</th>
          <th class="sticky col-farmer">Farmer</th>
          ${cats.map((c) => `<th>${c}<br/><small>${unitMap[c] || unit}</small></th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const catTotals = state.filters.basis === "tonne" ? r.perTCats : r.perHaCats;
            const catSources = state.filters.basis === "tonne" ? r.perTCatSources : r.perHaCatSources;
            const filteredCats = {};
            cats.forEach((cat) => {
              if (state.filters.source === "all") {
                filteredCats[cat] = catTotals ? catTotals[cat] : null;
              } else {
                filteredCats[cat] =
                  catSources && catSources[cat] && catSources[cat][state.filters.source] != null
                    ? catSources[cat][state.filters.source]
                    : null;
              }
            });
            const totalVal = Object.values(filteredCats).reduce((s, v) => (v != null ? s + v : s), 0);
            return `
              <tr>
                <td class="sticky col-season">${r.season}</td>
                <td class="sticky col-cluster">${r.cluster + 1}</td>
                <td class="sticky col-farmer">${r.farmer_id}</td>
                ${cats
                  .map((cat) => {
                    const val = filteredCats[cat];
                    const pct = totalVal ? (val || 0) / totalVal * 100 : null;
                    return `<td>${val == null ? "—" : `${formatNumber(val, 2)} (${formatNumber(pct, 1)}%)`}</td>`;
                  })
                  .join("")}
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
  elements.detailTable.innerHTML = table;
}

// helpers
function uniqueValues(rows, key) {
  return Array.from(
    rows.reduce((set, row) => {
      if (row[key] !== undefined && row[key] !== null && row[key] !== "") set.add(row[key]);
      return set;
    }, new Set())
  );
}

function toNum(val) {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(String(val).replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

function formatNumber(value, digits = 1) {
  if (value == null || !isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function sumValues(obj) {
  return Object.entries(obj)
    .filter(([k, v]) => v != null && isFinite(v))
    .reduce((s, [, v]) => s + v, 0);
}

function toTitle(str) {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ------- math helpers (borrowed from cluster.js) -------
// ... (same PCA/ward helpers as cluster-lca.js)

function pca(matrix, k) {
  const n = matrix.length;
  const p = matrix[0].length;
  const mean = Array(p).fill(0);
  matrix.forEach((row) => row.forEach((v, j) => (mean[j] += v)));
  for (let j = 0; j < p; j++) mean[j] /= n;
  const std = Array(p).fill(0);
  matrix.forEach((row) => row.forEach((v, j) => (std[j] += (v - mean[j]) ** 2)));
  for (let j = 0; j < p; j++) std[j] = Math.sqrt(std[j] / (n - 1)) || 1;
  const Z = matrix.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  const cov = Array.from({ length: p }, () => Array(p).fill(0));
  Z.forEach((row) => {
    for (let i = 0; i < p; i++) {
      for (let j = i; j < p; j++) {
        cov[i][j] += row[i] * row[j];
      }
    }
  });
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      cov[i][j] /= n - 1;
      cov[j][i] = cov[i][j];
    }
  }
  const { eigenvalues, eigenvectors } = jacobiEigen(cov);
  const order = eigenvalues.map((v, idx) => ({ v, idx })).sort((a, b) => b.v - a.v);
  const loadings = order.slice(0, k).map((o) => eigenvectors[o.idx]);
  const scores = Z.map((row) => loadings.map((vec) => vec.reduce((sum, v, j) => sum + v * row[j], 0)));
  return { scores, loadings };
}

function jacobiEigen(A, tol = 1e-8, maxIter = 100) {
  const n = A.length;
  let V = identity(n);
  let iter = 0;
  while (iter < maxIter) {
    let p = 0,
      q = 1,
      max = Math.abs(A[0][1]);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const val = Math.abs(A[i][j]);
        if (val > max) {
          max = val;
          p = i;
          q = j;
        }
      }
    }
    if (max < tol) break;
    const theta = 0.5 * Math.atan2(2 * A[p][q], A[q][q] - A[p][p]);
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const Ap = A[p].slice();
    const Aq = A[q].slice();
    for (let j = 0; j < n; j++) {
      A[p][j] = c * Ap[j] - s * Aq[j];
      A[q][j] = s * Ap[j] + c * Aq[j];
    }
    for (let i = 0; i < n; i++) {
      const aip = A[i][p];
      const aiq = A[i][q];
      A[i][p] = c * aip - s * aiq;
      A[i][q] = s * aip + c * aiq;
    }
    const App = c * c * Ap[p] - 2 * s * c * Ap[q] + s * s * Aq[q];
    const Aqq = s * s * Ap[p] + 2 * s * c * Ap[q] + c * c * Aq[q];
    A[p][p] = App;
    A[q][q] = Aqq;
    A[p][q] = A[q][p] = 0;
    for (let i = 0; i < n; i++) {
      if (i !== p && i !== q) {
        const Aip = c * A[i][p] - s * A[i][q];
        const Aiq = s * A[i][p] + c * A[i][q];
        A[i][p] = A[p][i] = Aip;
        A[i][q] = A[q][i] = Aiq;
      }
    }
    for (let i = 0; i < n; i++) {
      const vip = V[i][p];
      const viq = V[i][q];
      V[i][p] = c * vip - s * viq;
      V[i][q] = s * vip + c * viq;
    }
    iter++;
  }
  const eigenvalues = Array(n)
    .fill(0)
    .map((_, i) => A[i][i]);
  const eigenvectors = Array(n)
    .fill(0)
    .map((_, i) => V.map((row) => row[i]));
  return { eigenvalues, eigenvectors };
}

function identity(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
}

function ward(data, k) {
  const n = data.length;
  let clusters = data.map((row, idx) => ({ points: [idx], centroid: row.slice(), size: 1 }));
  const dist = (a, b) => {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
    return s;
  };
  while (clusters.length > k) {
    let bestI = 0,
      bestJ = 1,
      bestDist = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const mergedSize = clusters[i].size + clusters[j].size;
        const mergedCentroid = clusters[i].centroid.map(
          (v, idx) =>
            (v * clusters[i].size + clusters[j].centroid[idx] * clusters[j].size) / mergedSize
        );
        const d =
          (clusters[i].size * dist(clusters[i].centroid, mergedCentroid) +
            clusters[j].size * dist(clusters[j].centroid, mergedCentroid)) /
          mergedSize;
        if (d < bestDist) {
          bestDist = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const merged = {
      points: [...clusters[bestI].points, ...clusters[bestJ].points],
      size: clusters[bestI].size + clusters[bestJ].size,
      centroid: clusters[bestI].centroid.map(
        (v, idx) =>
          (v * clusters[bestI].size + clusters[bestJ].centroid[idx] * clusters[bestJ].size) /
          (clusters[bestI].size + clusters[bestJ].size)
      ),
    };
    clusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ);
    clusters.push(merged);
  }
  const labels = Array(n).fill(0);
  clusters.forEach((c, idx) => c.points.forEach((p) => (labels[p] = idx)));
  return labels;
}
