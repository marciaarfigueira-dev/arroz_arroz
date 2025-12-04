const state = {
  data: [],
  filters: { season: "all", farmer: "all", basis: "tonne", score: "single" },
  factors: { single: [], chara: [] },
};

const elements = {
  season: document.getElementById("season-filter"),
  farmer: document.getElementById("farmer-filter"),
  basis: document.getElementById("basis-filter"),
  score: document.getElementById("score-filter"),
  reset: document.getElementById("reset-filters"),
  active: document.getElementById("active-filters"),
  statGrid: document.getElementById("stat-grid"),
  impactBars: document.getElementById("impact-bars"),
  impactCount: document.getElementById("impact-count"),
  detailTable: document.getElementById("detail-table"),
  detailCount: document.getElementById("detail-count"),
};

const palette = ["#0ea5e9", "#22c55e", "#f59e0b", "#6366f1", "#ef4444"];

init();

async function init() {
  const [water, singlescore, chara] = await Promise.all([
    loadJson("./data/water.json"),
    loadJson("./data/singlescore.json"),
    loadJson("./data/characterisation.json"),
  ]);
  state.factors = buildFactors(singlescore, chara);
  state.data = water.map(enrichRow).map((r) => addImpacts(r, state.filters, state.factors));
  hydrateFilters();
  attachEvents();
  render();
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Unable to load ${path}`);
  return res.json();
}

function buildFactors(singleRecords, charaRecords) {
  const singleCats = singleRecords.find((r) => r.product_id === "singlescore_18_1")?.categories || [];
  const charaCats = charaRecords.find((r) => r.product_id === "18_chara")?.categories || [];
  const normalize = (cats) =>
    cats.map((c) => ({
      impact_category: c.impact_category,
      total: toNum(c.total) || 0,
      unit: c.unit || "",
    }));
  return { single: normalize(singleCats), chara: normalize(charaCats) };
}

function enrichRow(row) {
  const dmu = row.DMU_ID || row.dmu_id || "";
  const [farmer_id, seasonStr] = dmu.split("_");
  const season = seasonStr || row.season || row.year || "—";
  return {
    ...row,
    farmer_id: farmer_id || dmu || "—",
    season,
    area_ha: toNum(row["SUM of area_ha"]),
    prod: toNum(row["Productivity (t/ha)"]),
    water_ha: toNum(row["Water m3/ha"]),
    water_t: toNum(row["Water M3/t"]),
  };
}

function addImpacts(row, filters, factors) {
  const cats = filters.score === "chara" ? factors.chara : factors.single;
  const impacts_t = {};
  const impacts_ha = {};
  cats.forEach((c) => {
    const valT = row.water_t != null ? row.water_t * (c.total || 0) : null;
    const valHa = row.water_ha != null ? row.water_ha * (c.total || 0) : null;
    impacts_t[c.impact_category] = valT;
    impacts_ha[c.impact_category] = valHa;
  });
  const total_t = impacts_t["Total"] != null ? impacts_t["Total"] : sumValues(impacts_t);
  const total_ha = impacts_ha["Total"] != null ? impacts_ha["Total"] : sumValues(impacts_ha);
  return { ...row, impacts_t, impacts_ha, total_t, total_ha };
}

function hydrateFilters() {
  fillSelect(elements.season, uniqueValues(state.data, "season").sort((a, b) => b - a), "Season");
  fillSelect(elements.farmer, uniqueValues(state.data, "farmer_id").sort(), "Farmer");
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
  elements.farmer.addEventListener("change", () => {
    state.filters.farmer = elements.farmer.value;
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
    state.filters = { season: "all", farmer: "all", basis: "tonne", score: "single" };
    elements.season.value = "all";
    elements.farmer.value = "all";
    elements.basis.value = "tonne";
    elements.score.value = "single";
    render();
  });
  const about = document.getElementById("about-btn");
  if (about) about.onclick = () => (window.location.href = "./about.html");
}

function render() {
  const enriched = state.data.map((r) => addImpacts(r, state.filters, state.factors));
  const filtered = enriched.filter((r) => {
    if (state.filters.season !== "all" && `${r.season}` !== state.filters.season) return false;
    if (state.filters.farmer !== "all" && r.farmer_id !== state.filters.farmer) return false;
    return true;
  });
  renderActive(filtered.length);
  renderStats(filtered);
  renderImpacts(filtered);
  renderDetail(filtered);
}

function renderActive(count) {
  const parts = [];
  if (state.filters.season !== "all") parts.push(`Season ${state.filters.season}`);
  if (state.filters.farmer !== "all") parts.push(`Farmer ${state.filters.farmer}`);
  parts.push(state.filters.basis === "tonne" ? "Basis: m³/t" : "Basis: m³/ha");
  parts.push(state.filters.score === "chara" ? "Impact: Characterisation" : "Impact: Single score");
  elements.active.textContent = parts.length ? `${parts.join(" • ")} — ${count} rows` : `No filters applied — ${count} rows`;
}

function renderStats(rows) {
  if (!rows.length) {
    elements.statGrid.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
  // use area-weighted and production-weighted averages to avoid overcounting
  const totalArea = rows.reduce((s, r) => s + (r.area_ha || 0), 0);
  const totalProd = rows.reduce((s, r) => s + (r.area_ha && r.prod ? r.area_ha * r.prod : 0), 0);
  const totalAbsHa = rows.reduce((s, r) => s + (r.total_ha != null ? r.total_ha * (r.area_ha || 0) : 0), 0);
  const totalAbsT = rows.reduce((s, r) => s + (r.total_t != null && r.area_ha && r.prod ? r.total_t * r.area_ha * r.prod : 0), 0);
  const avgHa = totalArea ? totalAbsHa / totalArea : null;
  const avgT = totalProd ? totalAbsT / totalProd : null;
  const stats = [
    { label: "Rows", value: formatNumber(rows.length, 0) },
    {
      label: `Avg (${unitLabel(false)})`,
      value: state.filters.score === "single" ? (avgHa == null ? "—" : formatNumber(avgHa, 2)) : "—",
    },
    {
      label: `Avg (${unitLabel(true)})`,
      value: state.filters.score === "single" ? (avgT == null ? "—" : formatNumber(avgT, 2)) : "—",
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
  const unit = state.filters.score === "chara" ? "m³" : unitLabel(state.filters.basis === "tonne");
  const denom =
    state.filters.basis === "tonne"
      ? rows.reduce((s, r) => s + (r.area_ha && r.prod ? r.area_ha * r.prod : 0), 0)
      : rows.reduce((s, r) => s + (r.area_ha || 0), 0);
  const agg = {};
  rows.forEach((r) => {
    const source = state.filters.basis === "tonne" ? r.impacts_t : r.impacts_ha;
    const scalar =
      state.filters.basis === "tonne"
        ? r.area_ha && r.prod
          ? r.area_ha * r.prod
          : 0
        : r.area_ha || 0;
    if (!scalar) return;
    if (!source) return;
    Object.entries(source).forEach(([cat, val]) => {
      if (cat === "Total") return;
      if (val == null) return;
      agg[cat] = (agg[cat] || 0) + val * scalar;
    });
  });
  const entries = Object.entries(agg)
    .map(([cat, value]) => ({ cat, value: denom ? value / denom : value }))
    .sort((a, b) => b.value - a.value);
  elements.impactCount.textContent = `${entries.length} categories`;
  if (!entries.length) {
    elements.impactBars.innerHTML = `<p class="empty">No impacts to show.</p>`;
    return;
  }
  // Characterisation: table only
  if (state.filters.score === "chara") {
    const rowsTable = entries
      .map((entry) => `<tr><td>${entry.cat}</td><td>${unit}</td><td>${formatNumberSci(entry.value, 2)}</td></tr>`)
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

  const maxVal = Math.max(...entries.map((e) => e.value), 1);
  elements.impactBars.innerHTML = entries
    .map((entry, idx) => {
      const color = palette[idx % palette.length];
      const total = entries.reduce((s, e) => s + e.value, 0);
      const pct = total ? (entry.value / total) * 100 : 0;
      return `
        <div class="bar-row">
          <div class="bar-label">
            <div>${entry.cat}</div>
            <small>${formatNumber(entry.value, 2)} ${unit}</small>
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
  const impactUnit = state.filters.basis === "tonne" ? unitLabel(true) : unitLabel(false);
  const table = `
    <table>
      <thead>
        <tr>
          <th>Season</th>
          <th>Farmer</th>
          <th>Area (ha)</th>
          <th>Productivity (t/ha)</th>
          <th>Water (m³/ha)</th>
          <th>Water (m³/t)</th>
          <th>Impact (${impactUnit})</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const impactVal = state.filters.basis === "tonne" ? r.total_t : r.total_ha;
            return `
              <tr>
                <td>${r.season}</td>
                <td>${r.farmer_id}</td>
                <td>${r.area_ha == null ? "—" : formatNumber(r.area_ha, 2)}</td>
                <td>${r.prod == null ? "—" : formatNumber(r.prod, 2)}</td>
                <td>${r.water_ha == null ? "—" : formatNumber(r.water_ha, 2)}</td>
                <td>${r.water_t == null ? "—" : formatNumber(r.water_t, 2)}</td>
                <td>${formatNumber(impactVal, 2)}</td>
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
function toNum(val) {
  if (val === null || val === undefined || val === "") return null;
  let s = String(val).trim().replace(/\s+/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/,/g, "");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  const num = Number(s);
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

function sumValues(obj) {
  return Object.entries(obj)
    .filter(([k, v]) => k !== "Total" && v != null && isFinite(v))
    .reduce((s, [, v]) => s + v, 0);
}

function unitLabel(isPerTonne) {
  const basis = isPerTonne ? "/t" : "/ha";
  return state.filters.score === "chara" ? `m³${basis}` : `µPt${basis}`;
}
