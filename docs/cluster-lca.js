const state = {
  data: [], // farmer-season inventories with impacts
  filters: { season: "all", cluster: "all", basis: "ha" },
};

const elements = {
  season: document.getElementById("season-filter"),
  cluster: document.getElementById("cluster-filter"),
  basis: document.getElementById("basis-filter"),
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

init();

async function init() {
  const [ops, sow, fert, machines, ch4, n2o, singlescore] = await Promise.all([
    loadJson("./data/operations.json"),
    loadJson("./data/sowing.json"),
    loadJson("./data/fertilisation.json"),
    loadJson("./data/machines.json"),
    loadJson("./data/ch4.json"),
    loadJson("./data/n2o.json"),
    loadJson("./data/singlescore.json"),
  ]);
  const factors = buildFactors(singlescore);
  const clusterMap = computeClusters(ops, fert, sow, machines);
  const obs = buildInventories(ops, sow, fert, machines, ch4, n2o, factors);
  state.data = obs.map((r) => ({
    ...r,
    cluster:
      clusterMap.get(r.dmu_id) ??
      clusterMap.get(`${r.farmer_id}_${r.season}`) ??
      clusterMap.get(`${r.farmer_id || "—"}_${r.season}`) ??
      null,
  }));
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
    const total = rec.categories.find((c) => c.impact_category === "Total");
    if (!total) return;
    byId[rec.product_id] = total.total || 0;
    if (rec.product_id === "Herbicide") byId["herbicide"] = total.total || 0;
    if (rec.product_id === "Fungicide") byId["fungicide"] = total.total || 0;
    if (rec.product_id === "Insecticide") byId["insecticide"] = total.total || 0;
  });
  return {
    cropProt: {
      herbicide: byId["herbicide"] ?? byId["singlescore_2_1"] ?? 0,
      insecticide: byId["insecticide"] ?? byId["singlescore_4_1"] ?? 0,
      fungicide: byId["fungicide"] ?? byId["singlescore_6_1"] ?? 0,
    },
    seed: byId["singlescore_1_1"] || 0,
    fert: {
      N: byId["singlescore_8_1"] || 0,
      P: byId["singlescore_9_1"] || 0,
      K: byId["singlescore_10_1"] || 0,
    },
    machines: {
      disk_harrow: byId["singlescore_11_1"] || 0,
      laser_leveler: byId["singlescore_12_1"] || 0,
      centrifugal_spreader: byId["singlescore_13_1"] || 0,
      rotary_tiller: byId["singlescore_14_1"] || 0,
      sprayer: byId["singlescore_15_1"] || 0,
      combine_harvester: byId["singlescore_16_1"] || 0,
      seeder: byId["singlescore_17_1"] || 0,
    },
    methaneFactor: 2.601e-5, // µPt per kg CO2e
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
        impacts: { crop_protection: 0, sowing: 0, fertilisation: 0, machines: 0, methane: 0, n2o: 0 },
      });
    }
    return map.get(key);
  };

  // helper for tonnes from ops
  const computeTonnes = (row, area) => {
    if (row.area_per_tonne && row.area_per_tonne > 0) return area / row.area_per_tonne;
    const prod = toNum(row.productivity) || toNum(row.productivity_weighted);
    if (prod && prod > 0) return area * prod;
    return null;
  };

  // Fertilisation: impacts + N rate
  fert.forEach((r) => {
    const area = toNum(r.covered_area) || toNum(r.area_TOTAL) || toNum(r.area_ha) || 0;
    const tonnes = computeTonnes(r, area) || 0;
    const obj = ensure(r);
    obj.area += area;
    obj.tonnes += tonnes;
    const addNutrient = (nutrient, load) => {
      if (load == null) return;
      const ef = factors.fert[nutrient] || 0;
      obj.impacts.fertilisation += load * area * ef;
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
    const ef = factors.cropProt[type] || 0;
    if (doseHa != null) obj.impacts.crop_protection += doseHa * area * ef;
    else if (doseT != null && tonnes) obj.impacts.crop_protection += doseT * tonnes * ef;
    if (doseHa != null) {
      obj.Pesticide_load_kg_ha = (obj.Pesticide_load_kg_ha || 0) + doseHa;
    }
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
    const ef = factors.seed || 0;
    if (doseHa != null) obj.impacts.sowing += doseHa * area * ef;
    else if (doseT != null && tonnes) obj.impacts.sowing += doseT * tonnes * ef;
  });

  // Machines
  machines.forEach((r) => {
    const eq = (r.equipment || "").toLowerCase();
    const ef = factors.machines[eq];
    if (!ef) return;
    // use repetitions as normalized ha basis; fallback to total area worked
    const areaHa = toNum(r.repetitions) || toNum(r.total_area_worked) || toNum(r.area_ha) || 0;
    const tonnes = computeTonnes(r, areaHa) || 0;
    const obj = ensure(r);
    obj.area += areaHa;
    obj.tonnes += tonnes;
    obj.impacts.machines += areaHa * ef; // ef already per ha
    obj.Machinery_area_ratio = areaHa && obj.area ? areaHa / obj.area : obj.Machinery_area_ratio;
  });

  // Methane (CH₄) from flooded fields (single score)
  ch4Rows.forEach((r) => {
    const areaHa = toNum(r["SUM of area_ha"]) || toNum(r.area_ha) || 0;
    const prod = toNum(r["Productivity (t/ha)"]) || toNum(r.productivity) || null;
    const tonnes = prod && areaHa ? prod * areaHa : null;
    const obj = ensure(r);
    const areaUse = obj.area || areaHa || 0;
    const tonnesUse = obj.tonnes || tonnes || 0;
    const ch4Ha = toNum(r["C02eq(ch4)_ha"]);
    const ch4T = toNum(r["C02eq(ch4)_t"]);
    const factor = factors.methaneFactor || 0;
    let added = 0;
    if (ch4Ha != null && areaUse) {
      added = ch4Ha * areaUse * factor;
    } else if (ch4T != null && tonnesUse) {
      added = ch4T * tonnesUse * factor;
    }
    obj.impacts.methane += added;
    if (!obj.area && areaHa) obj.area = areaHa;
    if (!obj.tonnes && tonnes) obj.tonnes = tonnes;
  });

  // N₂O (single score conversion)
  n2oRows.forEach((r) => {
    const obj = ensure(r);
    const area = toNum(r.area_TOTAL) || obj.area || 0;
    const perHa = toNum(r["CO2 eq (direct emissions)"]) || 0;
    const perHaSum =
      perHa +
      (toNum(r["CO2 eq (indirect emissions VOL)"]) || 0) +
      (toNum(r["CO2 eq (indirect emissions VLEACH)"]) || 0) +
      (toNum(r["CO2 from urea"]) || 0);
    const factor = factors.methaneFactor || 0; // same µPt per kg CO2e
    const added = perHaSum * (area || 1) * factor;
    obj.impacts.n2o += added;
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
    const total = sumValues(r.impacts);
    const perHa = r.area ? total / r.area : null;
    const perT = r.tonnes ? total / r.tonnes : null;
    const dmu_id = `${r.farmer_id}_${r.season}`;
    return { ...r, dmu_id, total, perHa, perT };
  });
}

function hydrateFilters() {
  fillSelect(elements.season, uniqueValues(state.data, "season").sort((a, b) => b - a), "Season");
  if (elements.cluster) {
  const clusters = uniqueValues(state.data, "cluster")
    .filter((c) => c !== undefined && c !== null && c !== "")
    .sort((a, b) => a - b);
  elements.cluster.innerHTML = "";
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = "All clusters";
  elements.cluster.appendChild(all);
  clusters.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = `Cluster ${Number(c) + 1}`;
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
  elements.reset.addEventListener("click", () => {
    state.filters = { season: "all", cluster: "all", basis: "ha" };
    elements.season.value = "all";
    elements.cluster.value = "all";
    elements.basis.value = "ha";
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

function renderActive(count) {
  const parts = [];
  if (state.filters.season !== "all") parts.push(`Season ${state.filters.season}`);
  if (state.filters.cluster !== "all") parts.push(`Cluster ${Number(state.filters.cluster) + 1}`);
  parts.push(state.filters.basis === "tonne" ? "Basis: µPt/t" : "Basis: µPt/ha");
  elements.active.textContent = parts.length ? `${parts.join(" • ")} — ${count} rows` : `No filters applied — ${count} rows`;
}

function renderStats(rows) {
  if (!rows.length) {
    elements.statGrid.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
  const perBasis = state.filters.basis === "tonne" ? "perT" : "perHa";
  const avg = rows.reduce((s, r) => s + (r[perBasis] || 0), 0) / rows.length;
  const stats = [
    { label: "Rows", value: formatNumber(rows.length, 0) },
    { label: `Impact (${state.filters.basis === "tonne" ? "µPt/t" : "µPt/ha"})`, value: formatNumber(avg, 2) },
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
  const perBasis = state.filters.basis === "tonne" ? "perT" : "perHa";
  const agg = { crop_protection: 0, sowing: 0, fertilisation: 0, machines: 0, methane: 0, n2o: 0 };
  rows.forEach((r) => {
    const denom = state.filters.basis === "tonne" ? r.tonnes : r.area;
    if (!denom) return;
    Object.entries(r.impacts).forEach(([k, v]) => {
      agg[k] += (v || 0) / denom;
    });
  });
  const entries = Object.entries(agg)
    .filter(([, v]) => v)
    .map(([k, v]) => ({ key: k, value: v }))
    .sort((a, b) => b.value - a.value);
  elements.impactCount.textContent = `${entries.length} inputs`;
  if (!entries.length) {
    elements.impactBars.innerHTML = `<p class="empty">No impacts to show.</p>`;
    return;
  }
  const maxVal = Math.max(...entries.map((e) => e.value), 1);
  const unit = state.filters.basis === "tonne" ? "µPt/t" : "µPt/ha";
  elements.impactBars.innerHTML = entries
    .map((entry, idx) => {
      const color = palette[idx % palette.length];
      return `
        <div class="bar-row">
          <div class="bar-label">
            <div>${toTitle(entry.key)}</div>
            <small>${formatNumber(entry.value, 2)} ${unit}</small>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${(entry.value / maxVal) * 100}%; background:${color}"></div>
            <span class="bar-value">${formatNumber(entry.value, 2)}</span>
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
  const unit = state.filters.basis === "tonne" ? "µPt/t" : "µPt/ha";
  const table = `
    <table>
      <thead>
        <tr>
          <th>Season</th>
          <th>Cluster</th>
          <th>Farmer</th>
          <th>Area (ha)</th>
          <th>Prod (t)</th>
          <th>Impact (${unit})</th>
          <th>Crop prot (${unit})</th>
          <th>Sowing (${unit})</th>
          <th>Fertilisation (${unit})</th>
          <th>Machines (${unit})</th>
          <th>Methane (${unit})</th>
          <th>N₂O (${unit})</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const denom = state.filters.basis === "tonne" ? r.tonnes : r.area;
            const cp = denom ? (r.impacts.crop_protection || 0) / denom : null;
            const sow = denom ? (r.impacts.sowing || 0) / denom : null;
            const fert = denom ? (r.impacts.fertilisation || 0) / denom : null;
            const mach = denom ? (r.impacts.machines || 0) / denom : null;
            const methane = denom ? (r.impacts.methane || 0) / denom : null;
            const n2o = denom ? (r.impacts.n2o || 0) / denom : null;
            const total = denom ? (r.total || 0) / denom : null;
            return `
              <tr>
                <td>${r.season}</td>
                <td>${r.cluster + 1}</td>
                <td>${r.farmer_id}</td>
                <td>${formatNumber(r.area, 2)}</td>
        <td>${formatNumber(r.tonnes, 2)}</td>
        <td>${formatNumber(total, 2)}</td>
        <td>${formatNumber(cp, 2)}</td>
        <td>${formatNumber(sow, 2)}</td>
        <td>${formatNumber(fert, 2)}</td>
        <td>${formatNumber(mach, 2)}</td>
        <td>${formatNumber(methane, 2)}</td>
        <td>${formatNumber(n2o, 2)}</td>
      </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
  elements.detailTable.innerHTML = table;
}

function downloadCsv() {
  const rows = state.filtered || [];
  if (!rows.length) return;
  const unit = state.filters.basis === "tonne" ? "µPt/t" : "µPt/ha";
  const header = [
    "season",
    "cluster",
    "farmer_id",
    "area_ha",
    "tonnes",
    `total_${unit}`,
    `crop_protection_${unit}`,
    `sowing_${unit}`,
    `fertilisation_${unit}`,
    `machines_${unit}`,
    `methane_${unit}`,
    `n2o_${unit}`,
  ];
  const csv = [
    header.join(","),
    ...rows.map((r) => {
      const denom = state.filters.basis === "tonne" ? r.tonnes : r.area;
      const cp = denom ? (r.impacts.crop_protection || 0) / denom : null;
      const sow = denom ? (r.impacts.sowing || 0) / denom : null;
      const fert = denom ? (r.impacts.fertilisation || 0) / denom : null;
      const mach = denom ? (r.impacts.machines || 0) / denom : null;
      const methane = denom ? (r.impacts.methane || 0) / denom : null;
      const n2o = denom ? (r.impacts.n2o || 0) / denom : null;
      const total = denom ? (r.total || 0) / denom : null;
      return [
        r.season,
        r.cluster + 1,
        r.farmer_id,
        r.area,
        r.tonnes,
        total,
        cp,
        sow,
        fert,
        mach,
        methane,
        n2o,
      ]
        .map((v) => (v == null ? "" : v))
        .join(",");
    }),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "clustered_lca.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ------- math helpers (borrowed from cluster.js) -------

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
  const scores = Z.map((row) =>
    loadings.map((vec) => vec.reduce((sum, v, j) => sum + v * row[j], 0))
  );
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
    A[p][q] = A[q][p] = 0;
    const app = c * c * Ap[p] - 2 * s * c * Ap[q] + s * s * Aq[q];
    const aqq = s * s * Ap[p] + 2 * s * c * Ap[q] + c * c * Aq[q];
    A[p][p] = app;
    A[q][q] = aqq;
    const Vp = V[p].slice();
    const Vq = V[q].slice();
    for (let j = 0; j < n; j++) {
      V[p][j] = c * Vp[j] - s * Vq[j];
      V[q][j] = s * Vp[j] + c * Vq[j];
    }
    iter++;
  }
  const eigenvalues = A.map((row, i) => row[i]);
  const eigenvectors = V;
  return { eigenvalues, eigenvectors };
}

function identity(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
}

function ward(data, k) {
  const n = data.length;
  const clusters = [];
  for (let i = 0; i < n; i++) clusters.push({ idx: [i], centroid: data[i].slice() });
  const dist = (c1, c2) => {
    const n1 = c1.idx.length;
    const n2 = c2.idx.length;
    const diff = c1.centroid.map((v, i) => v - c2.centroid[i]);
    const sq = diff.reduce((s, v) => s + v * v, 0);
    return (n1 * n2) / (n1 + n2) * sq;
  };
  while (clusters.length > k) {
    let bestI = 0,
      bestJ = 1,
      bestD = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = dist(clusters[i], clusters[j]);
        if (d < bestD) {
          bestD = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const c1 = clusters[bestI];
    const c2 = clusters[bestJ];
    const mergedIdx = [...c1.idx, ...c2.idx];
    const nTot = mergedIdx.length;
    const centroid = c1.centroid.map(
      (v, i) => (c1.centroid[i] * c1.idx.length + c2.centroid[i] * c2.idx.length) / nTot
    );
    clusters.splice(bestJ, 1);
    clusters.splice(bestI, 1);
    clusters.push({ idx: mergedIdx, centroid });
  }
  const labels = Array(n).fill(0);
  clusters.forEach((c, label) => c.idx.forEach((i) => (labels[i] = label)));
  return labels;
}

// reuse clustering from farmer PCA (N, pesticide, yield, mechanisation)
function computeClusters(ops, fert, sow, machines) {
  const map = new Map();
  const keyFn = (r) => `${(r.farmer_id || r.dmu_id || "—").toString()}_${String(r.season || r.year || "—")}`;
  const ensure = (r) => {
    const key = keyFn(r);
    if (!map.has(key)) {
      map.set(key, {
        key,
        farmer_id: r.farmer_id || r.dmu_id || "—",
        season: r.season || r.year || "—",
        area_sum: 0,
        n_load: 0,
        n_area: 0,
        pest_load: 0,
        pest_area: 0,
        yield_sum: 0,
        yield_area: 0,
        mach_area: 0,
      });
    }
    return map.get(key);
  };

  fert.forEach((r) => {
    const area = toNum(r.covered_area) || toNum(r.area_TOTAL) || toNum(r.area_ha) || 0;
    const obj = ensure(r);
    if (area) obj.area_sum += area;
    const nHa = toNum(r.n_kg_ha_weight);
    if (nHa != null) {
      obj.n_load += nHa * (area || 1);
      obj.n_area += area || 1;
    }
  });

  ops.forEach((r) => {
    const op = (r.operation || "").toLowerCase();
    if (!["herbicide", "fungicide", "insecticide", "pesticide"].some((k) => op.includes(k))) return;
    const area = toNum(r.covered_area) || toNum(r.area_ha) || 0;
    const obj = ensure(r);
    if (area) obj.area_sum += area;
    const dose = toNum(r.dose_kg_ha);
    if (dose != null) {
      obj.pest_load += dose * (area || 1);
      obj.pest_area += area || 1;
    }
  });

  ops.forEach((r) => {
    const area = toNum(r.covered_area) || toNum(r.area_ha) || 0;
    const prod = toNum(r.productivity) || toNum(r.productivity_weighted);
    if (prod == null) return;
    const obj = ensure(r);
    obj.yield_sum += prod * 1000 * (area || 1);
    obj.yield_area += area || 1;
  });

  machines.forEach((r) => {
    const areaWorked = toNum(r.total_area_worked) || 0;
    const obj = ensure(r);
    obj.mach_area += areaWorked;
    if (areaWorked) obj.area_sum += toNum(r.area_ha) || 0;
  });

  const obs = Array.from(map.values()).map((r) => {
    const N_rate_kg_ha = r.n_area ? r.n_load / r.n_area : null;
    const Pesticide_load_kg_ha = r.pest_area ? r.pest_load / r.pest_area : null;
    const Yield_kg_ha = r.yield_area ? r.yield_sum / r.yield_area : null;
    const base_area = r.area_sum || r.yield_area || r.pest_area || r.n_area || 1;
    const Machinery_area_ratio = base_area ? r.mach_area / base_area : null;
    return {
      key: `${(r.farmer_id || "—").toString()}_${String(r.season)}`,
      vec: [N_rate_kg_ha, Pesticide_load_kg_ha, Yield_kg_ha, Machinery_area_ratio],
    };
  });

  const valid = obs.filter((o) => o.vec.every((v) => isFinite(v)));
  if (!valid.length) return new Map();
  const matrix = valid.map((o) => o.vec);
  const { scores } = pca(matrix, 2);
  const labels = ward(scores, 3);
  const labelMap = new Map();
  valid.forEach((o, idx) => labelMap.set(o.key, labels[idx]));
  return labelMap;
}

// helpers

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

function toTitle(str) {
  return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
