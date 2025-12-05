const state = {
  data: [],
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

const inputsOrder = ["crop_protection", "sowing", "fertilisation", "machines", "water", "methane", "n2o"];
const inputLabels = {
  crop_protection: "Crop protection",
  sowing: "Sowing",
  fertilisation: "Fertilisation",
  machines: "Machines",
  water: "Water",
  methane: "Methane",
  n2o: "N₂O",
};
const palette = ["#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#0bb7a8", "#f59e0b", "#10b981"];

init();

async function init() {
  const [exports, ops, fert, sow, machines] = await Promise.all([
    loadJson("./data/lca_chara_inputs_v2.json"),
    loadJson("./data/operations.json"),
    loadJson("./data/fertilisation.json"),
    loadJson("./data/sowing.json"),
    loadJson("./data/machines.json"),
  ]);
  const clusterMap = computeClusters(ops, fert, sow, machines);
  state.data = exports.map((r) => ({
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

function hydrateFilters() {
  fillSelect(elements.season, uniqueValues(state.data, "season").sort((a, b) => `${b}`.localeCompare(`${a}`)), "Season");
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
    if (v === undefined || v === null || v === "") return;
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
  const rows = state.data.filter((r) => {
    if (state.filters.season !== "all" && `${r.season}` !== state.filters.season) return false;
    if (state.filters.cluster !== "all" && `${r.cluster}` !== state.filters.cluster) return false;
    return true;
  });
  renderActive(rows.length);
  renderStats(rows);
  renderImpacts(rows);
  renderDetail(rows);
}

function renderActive(count) {
  const parts = [];
  if (state.filters.season !== "all") parts.push(`Season ${state.filters.season}`);
  if (state.filters.cluster !== "all") parts.push(`Cluster ${Number(state.filters.cluster) + 1}`);
  parts.push(state.filters.basis === "tonne" ? "Basis: Pt/t" : "Basis: Pt/ha");
  elements.active.textContent = parts.length ? `${parts.join(" • ")} — ${count} rows` : `No filters applied — ${count} rows`;
}

function renderStats(rows) {
  if (!rows.length) {
    elements.statGrid.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
  const useT = state.filters.basis === "tonne";
  const denom = rows.reduce((s, r) => s + (useT ? r.tonnes || 0 : r.area || 0), 0);
  const totalAbs = rows.reduce((s, r) => {
    const inputs = useT ? r.perTInputs : r.perHaInputs;
    const scalar = useT ? r.tonnes || 0 : r.area || 0;
    if (!inputs || !scalar) return s;
    const sum = inputsOrder.reduce((acc, k) => acc + (inputs[k] || 0), 0);
    return s + sum * scalar;
  }, 0);
  const avg = denom ? totalAbs / denom : null;
  elements.statGrid.innerHTML = `
    <div class="stat">
      <small>Rows</small>
      <strong>${rows.length}</strong>
    </div>
    <div class="stat">
      <small>${useT ? "Impact (Pt/t)" : "Impact (Pt/ha)"}</small>
      <strong>${avg == null ? "—" : formatNumber(avg, 2)}</strong>
    </div>
    <div class="stat">
      <small>${useT ? "Total impact (Pt)" : "Field impact (Pt)"}</small>
      <strong>${totalAbs ? formatNumber(totalAbs, 2) : "—"}</strong>
    </div>
  `;
}

function renderImpacts(rows) {
  const useT = state.filters.basis === "tonne";
  const denom = rows.reduce((s, r) => s + (useT ? r.tonnes || 0 : r.area || 0), 0);
  const aggAbs = {};
  rows.forEach((r) => {
    const inputs = useT ? r.perTInputs : r.perHaInputs;
    const scalar = useT ? r.tonnes || 0 : r.area || 0;
    if (!inputs || !scalar) return;
    inputsOrder.forEach((k) => {
      if (inputs[k] == null) return;
      aggAbs[k] = (aggAbs[k] || 0) + inputs[k] * scalar;
    });
  });
  const entries = inputsOrder
    .map((k) => ({ key: k, value: denom ? (aggAbs[k] || 0) / denom : aggAbs[k] || 0 }))
    .filter((e) => e.value != null && e.value !== 0);
  elements.impactCount.textContent = `${entries.length} inputs`;
  if (!entries.length) {
    elements.impactBars.innerHTML = `<p class="empty">No impacts to show.</p>`;
    return;
  }
  const total = entries.reduce((s, e) => s + (e.value || 0), 0);
  const maxVal = Math.max(...entries.map((e) => e.value), 1);
  elements.impactBars.innerHTML = entries
    .map((entry, idx) => {
      const color = palette[idx % palette.length];
      const pct = total ? (entry.value / total) * 100 : 0;
      return `
        <div class="bar-row">
          <div class="bar-label">
            <div>${inputLabels[entry.key] || entry.key}</div>
            <small>${formatNumber(entry.value, 2)} Pt (${formatNumber(pct, 1)}%)</small>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${(entry.value / maxVal) * 100}%; background:${color}"></div>
            <span class="bar-value">${formatNumber(pct, 1)}%</span>
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
  const useT = state.filters.basis === "tonne";
  const headerInputs = inputsOrder.map((k) => `<th>${inputLabels[k] || k}</th>`).join("");
  const table = `
    <table>
      <thead>
        <tr>
          <th>Season</th>
          <th>Farmer</th>
          <th>Cluster</th>
          <th>Area (ha)</th>
          <th>Tonnes</th>
          ${headerInputs}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const inputs = useT ? r.perTInputs : r.perHaInputs;
            const cells = inputsOrder
              .map((k) => `<td>${inputs && inputs[k] != null ? formatNumber(inputs[k], 2) : "—"}</td>`)
              .join("");
            return `
              <tr>
                <td>${r.season}</td>
                <td>${r.farmer_id}</td>
                <td>${r.cluster != null ? Number(r.cluster) + 1 : "—"}</td>
                <td>${formatNumber(r.area, 2)}</td>
                <td>${formatNumber(r.tonnes, 2)}</td>
                ${cells}
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
  const useT = state.filters.basis === "tonne";
  const header = ["season", "farmer", "cluster", "area_ha", "tonnes", ...inputsOrder];
  const rows = state.data.map((r) => {
    const inputs = useT ? r.perTInputs : r.perHaInputs;
    return [
      r.season,
      r.farmer_id,
      r.cluster != null ? Number(r.cluster) + 1 : "",
      r.area,
      r.tonnes,
      ...inputsOrder.map((k) => (inputs && inputs[k] != null ? inputs[k] : "")),
    ];
  });
  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = useT ? "cluster_lca_single_pt_per_tonne.csv" : "cluster_lca_single_pt_per_ha.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// clustering reused from farmer PCA (N, pesticide, yield, mechanisation)
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

// PCA helpers
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

function uniqueValues(rows, key) {
  return Array.from(
    rows.reduce((set, row) => {
      if (row[key] !== undefined && row[key] !== null && row[key] !== "") set.add(row[key]);
      return set;
    }, new Set())
  );
}

function formatNumber(value, digits = 1) {
  if (value == null || !isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function toNum(val) {
  if (val === null || val === undefined || val === "") return null;
  const num = Number(String(val).replace(",", "."));
  return Number.isFinite(num) ? num : null;
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
