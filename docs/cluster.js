const state = {
  data: [],
  scores: [],
  clusters: [],
  filters: {
    season: "all",
    farmer: "all",
    cluster: "all",
  },
};

const elements = {
  season: document.getElementById("season-filter"),
  farmer: document.getElementById("farmer-filter"),
  reset: document.getElementById("reset-filters"),
  active: document.getElementById("active-filters"),
  statGrid: document.getElementById("stat-grid"),
  scatter: document.getElementById("scatter"),
  tooltip: document.getElementById("tooltip"),
  legend: document.getElementById("legend"),
  pointCount: document.getElementById("point-count"),
  detailTable: document.getElementById("detail-table"),
  detailCount: document.getElementById("detail-count"),
  download: document.getElementById("download-csv"),
  cluster: document.getElementById("cluster-filter"),
  aboutBtn: document.getElementById("about-btn"),
  aboutPanel: document.getElementById("about-panel"),
  aboutClose: document.getElementById("about-close"),
};

const palette = ["#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#10b981"];

init();

async function init() {
  const [ops, fert, sow, machines] = await Promise.all([
    loadJson("./data/operations.json"),
    loadJson("./data/fertilisation.json"),
    loadJson("./data/sowing.json"),
    loadJson("./data/machines.json"),
  ]);
  const obs = aggregateFarmYears(ops, fert, sow, machines);
  state.data = obs.filter((o) => isFinite(o.N_rate_kg_ha) && isFinite(o.Pesticide_load_kg_ha) && isFinite(o.Yield_kg_ha) && isFinite(o.Machinery_area_ratio));
  hydrateFilters();
  attachEvents();
  computePCAandClusters();
  render();
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Unable to load ${path}`);
  return res.json();
}

function aggregateFarmYears(ops, fert, sow, machines) {
  const map = new Map();
  const keyFn = (r) => `${r.farmer_id || r.dmu_id || "?"}|${r.season || r.year || "?"}`;
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

  // Fertilisation: N per ha already weighted column
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

  // Crop protection: sum herbicide/fungicide/insecticide kg/ha weighted by area
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

  // Yield: from productivity (t/ha) → kg/ha
  ops.forEach((r) => {
    const area = toNum(r.covered_area) || toNum(r.area_ha) || 0;
    const prod = toNum(r.productivity) || toNum(r.productivity_weighted);
    if (prod == null) return;
    const obj = ensure(r);
    obj.yield_sum += prod * 1000 * (area || 1); // kg/ha * area weight
    obj.yield_area += area || 1;
  });

  // Machinery: ratio of area worked to cultivated area
  machines.forEach((r) => {
    const areaWorked = toNum(r.total_area_worked) || 0;
    const obj = ensure(r);
    obj.mach_area += areaWorked;
    if (areaWorked) obj.area_sum += toNum(r.area_ha) || 0;
  });

  return Array.from(map.values()).map((r) => {
    const N_rate_kg_ha = r.n_area ? r.n_load / r.n_area : null;
    const Pesticide_load_kg_ha = r.pest_area ? r.pest_load / r.pest_area : null;
    const Yield_kg_ha = r.yield_area ? r.yield_sum / r.yield_area : null;
    const base_area = r.area_sum || r.yield_area || r.pest_area || r.n_area || 1;
    const Machinery_area_ratio = base_area ? r.mach_area / base_area : null;
    return {
      farmer_id: r.farmer_id,
      season: r.season,
      N_rate_kg_ha,
      Pesticide_load_kg_ha,
      Yield_kg_ha,
      Machinery_area_ratio,
    };
  });
}

function hydrateFilters() {
  fillSelect(elements.season, uniqueValues(state.data, "season").sort((a, b) => b - a), "Season");
  fillSelect(elements.farmer, uniqueValues(state.data, "farmer_id").sort(), "Farmer");
  if (elements.cluster) {
    elements.cluster.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "All clusters";
    elements.cluster.appendChild(all);
    for (let i = 0; i < 3; i++) {
      const opt = document.createElement("option");
      opt.value = `${i}`;
      opt.textContent = `Cluster ${i + 1}`;
      elements.cluster.appendChild(opt);
    }
  }
}

function fillSelect(select, values, label) {
  select.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "all";
  optAll.textContent = `All ${label.toLowerCase()}s`;
  select.appendChild(optAll);
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
  elements.farmer.addEventListener("change", () => {
    state.filters.farmer = elements.farmer.value;
    render();
  });
  if (elements.cluster) {
    elements.cluster.addEventListener("change", () => {
      state.filters.cluster = elements.cluster.value;
      render();
    });
  }
  elements.reset.addEventListener("click", () => {
    state.filters.season = "all";
    state.filters.farmer = "all";
    state.filters.cluster = "all";
    elements.season.value = "all";
    elements.farmer.value = "all";
    if (elements.cluster) elements.cluster.value = "all";
    render();
  });
  if (elements.aboutBtn && elements.aboutPanel) {
    elements.aboutBtn.addEventListener("click", () => {
      elements.aboutPanel.style.display = elements.aboutPanel.style.display === "none" ? "block" : "none";
    });
  }
  if (elements.aboutClose && elements.aboutPanel) {
    elements.aboutClose.addEventListener("click", () => {
      elements.aboutPanel.style.display = "none";
    });
  }
  if (elements.download) {
    elements.download.addEventListener("click", downloadCsv);
  }
}

function computePCAandClusters() {
  const dataMatrix = state.data.map((r) => [
    r.N_rate_kg_ha,
    r.Pesticide_load_kg_ha,
    r.Yield_kg_ha,
    r.Machinery_area_ratio,
  ]);
  const { scores, loadings } = pca(dataMatrix, 2);
  state.scores = scores;
  state.clusters = ward(scores, 3);
  state.loadings = loadings;
}

function render() {
  const filtered = state.data
    .map((row, idx) => ({ ...row, score: state.scores[idx], cluster: state.clusters[idx] }))
    .filter((row) => {
      if (state.filters.season !== "all" && `${row.season}` !== state.filters.season) return false;
      if (state.filters.farmer !== "all" && row.farmer_id !== state.filters.farmer) return false;
      if (state.filters.cluster !== "all" && row.cluster !== Number(state.filters.cluster)) return false;
      return true;
    });
  state.filtered = filtered;
  renderActive(filtered.length);
  renderStats(filtered);
  renderScatter(filtered);
  renderDetail(filtered);
}

function renderActive(count) {
  const parts = [];
  if (state.filters.season !== "all") parts.push(`Season ${state.filters.season}`);
  if (state.filters.farmer !== "all") parts.push(`Farmer ${state.filters.farmer}`);
  if (state.filters.cluster !== "all") parts.push(`Cluster ${Number(state.filters.cluster) + 1}`);
  parts.push("Basis: PCA (standardized)");
  elements.active.textContent = parts.length ? `${parts.join(" • ")} — ${count} records` : `No filters applied — ${count} records`;
}

function renderStats(rows) {
  if (!rows.length) {
    elements.statGrid.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
  const clusters = Array.from(new Set(rows.map((r) => r.cluster))).sort();
  const stats = clusters.map((c) => {
    const subset = rows.filter((r) => r.cluster === c);
    const avg = (key) => subset.reduce((s, r) => s + (r[key] || 0), 0) / subset.length;
    return {
      label: `Cluster ${c + 1}`,
      value: `${subset.length} farms`,
      sub: `N ${formatNumber(avg("N_rate_kg_ha"), 1)} | Pest ${formatNumber(avg("Pesticide_load_kg_ha"), 2)} | Yield ${formatNumber(avg("Yield_kg_ha"), 0)} kg/ha | Mech ${formatNumber(avg("Machinery_area_ratio"), 2)}`,
    };
  });
  elements.statGrid.innerHTML = stats
    .map(
      (s) => `
      <div class="stat">
        <small>${s.label}</small>
        <strong>${s.value}</strong>
        <small>${s.sub}</small>
      </div>
    `
    )
    .join("");
}

function renderScatter(rows) {
  elements.tooltip.style.display = "none";
  const w = elements.scatter.clientWidth || 800;
  const h = elements.scatter.clientHeight || 420;
  const padding = 30;
  const xs = rows.map((r) => r.score[0]);
  const ys = rows.map((r) => r.score[1]);
  const minX = Math.min(...xs, -1);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, -1);
  const maxY = Math.max(...ys, 1);
  const scaleX = (x) => padding + ((x - minX) / (maxX - minX || 1)) * (w - 2 * padding);
  const scaleY = (y) => h - padding - ((y - minY) / (maxY - minY || 1)) * (h - 2 * padding);
  const showLabels = state.filters.cluster !== "all";

  // rebuild svg without removing tooltip
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svgEl.setAttribute("width", w);
  svgEl.setAttribute("height", h);
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  rows.forEach((r) => {
    const color = palette[r.cluster % palette.length];
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("class", "pt");
    circle.setAttribute("cx", scaleX(r.score[0]));
    circle.setAttribute("cy", scaleY(r.score[1]));
    circle.setAttribute("r", 5);
    circle.setAttribute("fill", color);
    circle.setAttribute("opacity", "0.85");
    circle.dataset.label = `${r.farmer_id} (${r.season})`;
    circle.dataset.cluster = r.cluster + 1;
    circle.dataset.n = formatNumber(r.N_rate_kg_ha, 1);
    circle.dataset.pest = formatNumber(r.Pesticide_load_kg_ha, 2);
    circle.dataset.yield = formatNumber(r.Yield_kg_ha, 0);
    circle.dataset.mech = formatNumber(r.Machinery_area_ratio, 2);
    circle.dataset.pc1 = formatNumber(r.score[0], 2);
    circle.dataset.pc2 = formatNumber(r.score[1], 2);
    g.appendChild(circle);
    if (showLabels) {
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", scaleX(r.score[0]) + 8);
      label.setAttribute("y", scaleY(r.score[1]) - 8);
      label.setAttribute("fill", "#e2e8f0");
      label.setAttribute("font-size", "11px");
      label.setAttribute("font-family", "Inter, system-ui, sans-serif");
      label.textContent = `${r.farmer_id} ${r.season}`;
      g.appendChild(label);
    }
  });
  svgEl.appendChild(g);
  const oldSvg = elements.scatter.querySelector("svg");
  if (oldSvg) oldSvg.remove();
  const tooltipEl = elements.tooltip;
  if (tooltipEl) {
    elements.scatter.insertBefore(svgEl, tooltipEl);
  } else {
    elements.scatter.appendChild(svgEl);
  }
  bindTooltip();
  elements.pointCount.textContent = `${rows.length} points`;
  renderLegend();
}

function bindTooltip() {
  const tt = elements.tooltip;
  const svg = elements.scatter.querySelector("svg");
  if (!tt || !svg) return;
  const pts = svg.querySelectorAll(".pt");
  pts.forEach((el) => {
    el.onmouseenter = (e) => {
      const t = e.target;
      tt.style.display = "block";
      tt.innerHTML = `
        <strong>${t.dataset.label}</strong><br/>
        Cluster ${t.dataset.cluster}<br/>
        N: ${t.dataset.n} kg/ha · Pesticide: ${t.dataset.pest} kg/ha<br/>
        Yield: ${t.dataset.yield} kg/ha · Mech: ${t.dataset.mech}<br/>
        PC1: ${t.dataset.pc1} · PC2: ${t.dataset.pc2}
      `;
    };
    el.onmousemove = (e) => {
      const x = e.offsetX;
      const y = e.offsetY;
      tt.style.left = `${x + 10}px`;
      tt.style.top = `${y - 10}px`;
      tt.style.display = "block";
    };
    el.onmouseleave = () => {
      tt.style.display = "none";
    };
  });
}

function renderLegend() {
  const labels = [0, 1, 2].map((c) => `<span><span class="dot" style="background:${palette[c]}"></span>Cluster ${c + 1}</span>`);
  elements.legend.innerHTML = labels.join("");
}

function renderDetail(rows) {
  elements.detailCount.textContent = `${rows.length} records`;
  if (!rows.length) {
    elements.detailTable.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
  const table = `
    <table>
      <thead>
        <tr>
          <th>Season</th>
          <th>Farmer</th>
          <th>Cluster</th>
          <th>N rate (kg/ha)</th>
          <th>Pesticide load (kg/ha)</th>
          <th>Yield (kg/ha)</th>
          <th>Machinery area ratio</th>
          <th>PC1</th>
          <th>PC2</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
            <tr>
              <td>${r.season}</td>
              <td>${r.farmer_id}</td>
              <td>${r.cluster + 1}</td>
              <td>${formatNumber(r.N_rate_kg_ha, 1)}</td>
              <td>${formatNumber(r.Pesticide_load_kg_ha, 2)}</td>
              <td>${formatNumber(r.Yield_kg_ha, 0)}</td>
              <td>${formatNumber(r.Machinery_area_ratio, 2)}</td>
              <td>${formatNumber(r.score[0], 2)}</td>
              <td>${formatNumber(r.score[1], 2)}</td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
  elements.detailTable.innerHTML = table;
}

function downloadCsv() {
  const rows = state.filtered || [];
  if (!rows.length) return;
  const header = [
    "season",
    "farmer_id",
    "cluster",
    "N_rate_kg_ha",
    "Pesticide_load_kg_ha",
    "Yield_kg_ha",
    "Machinery_area_ratio",
    "PC1",
    "PC2",
  ];
  const csv = [
    header.join(","),
    ...rows.map((r) =>
      [
        r.season,
        r.farmer_id,
        r.cluster + 1,
        r.N_rate_kg_ha,
        r.Pesticide_load_kg_ha,
        r.Yield_kg_ha,
        r.Machinery_area_ratio,
        r.score[0],
        r.score[1],
      ]
        .map((v) => (v == null ? "" : v))
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "clustering_results.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ---------- PCA & clustering utilities ----------

function pca(matrix, k) {
  const n = matrix.length;
  const p = matrix[0].length;
  // standardize
  const mean = Array(p).fill(0);
  matrix.forEach((row) => row.forEach((v, j) => (mean[j] += v)));
  for (let j = 0; j < p; j++) mean[j] /= n;
  const std = Array(p).fill(0);
  matrix.forEach((row) => row.forEach((v, j) => (std[j] += (v - mean[j]) ** 2)));
  for (let j = 0; j < p; j++) std[j] = Math.sqrt(std[j] / (n - 1)) || 1;
  const Z = matrix.map((row) => row.map((v, j) => (v - mean[j]) / std[j]));
  // covariance
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
    const centroidDiff = c1.centroid.map((v, i) => v - c2.centroid[i]);
    const sq = centroidDiff.reduce((s, v) => s + v * v, 0);
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
    const centroid = c1.centroid.map((v, i) => (c1.centroid[i] * c1.idx.length + c2.centroid[i] * c2.idx.length) / nTot);
    clusters.splice(bestJ, 1);
    clusters.splice(bestI, 1);
    clusters.push({ idx: mergedIdx, centroid });
  }
  const labels = Array(n).fill(0);
  clusters.forEach((c, label) => c.idx.forEach((i) => (labels[i] = label)));
  return labels;
}

// ---------- helpers ----------

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
  if (val === null || val === undefined) return null;
  if (typeof val === "string") {
    const cleaned = val.replace(",", ".").trim();
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}
