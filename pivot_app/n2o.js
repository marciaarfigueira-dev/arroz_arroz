const state = {
  data: [],
  filters: { season: "all", farmer: "all", basis: "ha", score: "single" },
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

const palette = ["#ef4444", "#22c55e", "#3b82f6", "#a855f7"];
const SS_FACTOR = 1.77e3; // kg CO2e -> Pt for single score

init();

async function init() {
  const [n2o, ops] = await Promise.all([loadJson("./data/n2o.json"), loadJson("./data/operations.json")]);
  const prodMap = buildProductivityMap(ops);
  const base = n2o.map((row) => enrichRow(row, prodMap));
  state.data = addStrawRows(base);
  hydrateFilters();
  attachEvents();
  render();
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Unable to load ${path}`);
  return res.json();
}

function buildProductivityMap(ops) {
  const map = {};
  ops.forEach((r) => {
    const dmu = r.dmu_id;
    if (!dmu) return;
    const prod = toNum(r.productivity) || toNum(r.productivity_weighted);
    const area = toNum(r.area_ha) || 0;
    if (prod == null) return;
    if (!map[dmu]) map[dmu] = { total: 0, weight: 0 };
    map[dmu].total += prod * (area || 1);
    map[dmu].weight += area || 1;
  });
  const out = {};
  Object.entries(map).forEach(([k, v]) => {
    out[k] = v.weight ? v.total / v.weight : null;
  });
  return out;
}

function enrichRow(row, prodMap) {
  const dmu = row.dmu_id || "";
  const [farmer_id, seasonStr] = dmu.split("_");
  const season = row.season || row.year || seasonStr || "—";
  const area = toNum(row.area_TOTAL) || 0;
  const prod = prodMap[dmu] || null; // t/ha
  const tonnes = prod && area ? prod * area : null;

  const direct = toNum(row["CO2 eq (direct emissions)"]) || 0;
  const indirectVol = toNum(row["CO2 eq (indirect emissions VOL)"]) || 0;
  const indirectLeach = toNum(row["CO2 eq (indirect emissions VLEACH)"]) || 0;
  const co2Urea = toNum(row["CO2 from urea"]) || 0;
  const directWithStraw = direct; // straw integration removed
  const total = directWithStraw + indirectVol + indirectLeach + co2Urea; // per ha
  const perHa = total;
  const perT = prod ? total / prod : null;

  return {
    ...row,
    farmer_id: farmer_id || dmu || "—",
    season,
    area,
    tonnes,
    direct: directWithStraw,
    indirectVol,
    indirectLeach,
    co2Urea,
    total,
    perHa,
    perT,
    source: "Fertiliser",
    prod,
  };
}

function addStrawRows(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const key = `${r.farmer_id}|${r.season}`;
    if (!map.has(key)) {
      map.set(key, {
        farmer_id: r.farmer_id,
        season: r.season,
        prod: r.prod || null,
        area: r.area || 0,
      });
    } else {
      const entry = map.get(key);
      if (!entry.prod && r.prod) entry.prod = r.prod;
      entry.area += r.area || 0;
    }
  });
  const strawRows = Array.from(map.values()).map((entry) => {
    const total = 81.081; // kg CO2e per year (straw)
    const prod = entry.prod;
    const perT = prod ? total / prod : null;
    const area = entry.area || 1;
    return {
      farmer_id: entry.farmer_id,
      season: entry.season,
      area,
      tonnes: prod && area ? prod * area : null,
      prod,
      direct: total,
      indirectVol: 0,
      indirectLeach: 0,
      co2Urea: 0,
      total,
      perHa: total,
      perT,
      source: "Straw",
      area_TOTAL: area,
      dmu_id: `${entry.farmer_id}_${entry.season}`,
    };
  });
  return [...rows, ...strawRows];
}

function hydrateFilters() {
  fillSelect(elements.season, uniqueValues(state.data, "season").sort((a, b) => b - a), "Season");
  fillSelect(elements.farmer, uniqueValues(state.data, "farmer_id").sort(), "Farmer");
}

function fillSelect(select, values, label) {
  if (!select) return;
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
  elements.basis.addEventListener("change", () => {
    state.filters.basis = elements.basis.value;
    render();
  });
  elements.score.addEventListener("change", () => {
    state.filters.score = elements.score.value;
    render();
  });
  elements.reset.addEventListener("click", () => {
    state.filters = { season: "all", farmer: "all", basis: "ha", score: "single" };
    elements.season.value = "all";
    elements.farmer.value = "all";
    elements.basis.value = "ha";
    elements.score.value = "single";
    render();
  });
  const about = document.getElementById("about-btn");
  if (about) {
    about.addEventListener("click", () => (window.location.href = "./about.html"));
  }
}

function render() {
  const filtered = state.data.filter((r) => {
    if (state.filters.season !== "all" && `${r.season}` !== state.filters.season) return false;
    if (state.filters.farmer !== "all" && r.farmer_id !== state.filters.farmer) return false;
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
  if (state.filters.farmer !== "all") parts.push(`Farmer ${state.filters.farmer}`);
  parts.push(state.filters.basis === "tonne" ? `Basis: ${unitLabel(true)}` : `Basis: ${unitLabel(false)}`);
  parts.push(state.filters.score === "chara" ? "Impact: Characterisation" : "Impact: Single score");
  elements.active.textContent = parts.length ? `${parts.join(" • ")} — ${count} rows` : `No filters applied — ${count} rows`;
}

function renderStats(rows) {
  if (!rows.length) {
    elements.statGrid.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
  const totalArea = rows.reduce((s, r) => s + (r.area || 0), 0);
  const totalProd = rows.reduce((s, r) => s + (r.prod && r.area ? r.prod * r.area : 0), 0);
  const totalAbsHa = rows.reduce((s, r) => s + (r.perHa != null ? r.perHa * (r.area || 0) : 0), 0);
  const totalAbsT = rows.reduce((s, r) => s + (r.perT != null && r.prod && r.area ? r.perT * r.prod * r.area : 0), 0);
  let avgHa = totalArea ? totalAbsHa / totalArea : null;
  let avgT = totalProd ? totalAbsT / totalProd : null;
  const factor = state.filters.score === "single" ? SS_FACTOR : 1;
  avgHa = avgHa != null ? avgHa * factor : null;
  avgT = avgT != null ? avgT * factor : null;
  const totalFactor = state.filters.score === "single" ? SS_FACTOR : 1;
  const totalImpact =
    state.filters.score === "single"
      ? state.filters.basis === "tonne"
        ? totalAbsT != null
          ? totalAbsT * totalFactor
          : null
        : totalAbsHa != null
        ? totalAbsHa * totalFactor
        : null
      : null; // characterisation total not displayed
  const totalUnit = state.filters.basis === "tonne" ? unitLabel(true) : unitLabel(false);
  const stats = [
    { label: "Rows", value: formatNumber(rows.length, 0) },
    { label: `Total (${totalUnit})`, value: totalImpact == null ? "—" : formatNumberSci(totalImpact, 2) },
    {
      label: state.filters.basis === "tonne" ? `Intensity (${unitLabel(true)})` : `Intensity (${unitLabel(false)})`,
      value:
        state.filters.basis === "tonne"
          ? avgT == null
            ? "—"
            : formatNumberSci(avgT, 2)
          : avgHa == null
          ? "—"
          : formatNumberSci(avgHa, 2),
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
  const unit = state.filters.basis === "tonne" ? unitLabel(true) : unitLabel(false);
  const denom =
    state.filters.basis === "tonne"
      ? rows.reduce((s, r) => s + (r.prod && r.area ? r.prod * r.area : 0), 0)
      : rows.reduce((s, r) => s + (r.area || 0), 0);

  const factor = state.filters.score === "single" ? SS_FACTOR : 1;

  const sources = [
    { key: "total", label: "Climate change" },
    { key: "direct", label: "Direct + straw" },
    { key: "indirectVol", label: "Indirect VOL" },
    { key: "indirectLeach", label: "Indirect leach" },
    { key: "co2Urea", label: "CO₂ from urea" },
  ];

  const agg = {};
  rows.forEach((r) => {
    const area = r.area || 0;
    const prod = r.prod && area ? r.prod * area : 0;
    const scalar = state.filters.basis === "tonne" ? prod : area;
    if (!scalar) return;
    sources.forEach((s) => {
      const baseVal =
        state.filters.basis === "tonne"
          ? r.prod && r.area
            ? (r[s.key] || 0) / r.prod
            : null
          : r[s.key];
      if (baseVal == null) return;
      const abs = baseVal * scalar;
      agg[s.key] = (agg[s.key] || 0) + abs;
    });
  });

  const entries = sources
    .map((s) => {
      const val = denom ? (agg[s.key] || 0) / denom : agg[s.key] || 0;
      return { label: s.label, value: val != null ? val * factor : null };
    })
    .filter((e) => e.value != null);

  elements.impactCount.textContent = `${entries.length} categories`;
  if (!entries.length) {
    elements.impactBars.innerHTML = `<p class="empty">No impacts to show.</p>`;
    return;
  }

  if (state.filters.score === "chara") {
    // Pivot: Climate change as row, sources as columns
    const sourceEntries = entries.filter((e) => e.label !== "Climate change");
    const totalVal = sourceEntries.reduce((s, e) => s + (e.value || 0), 0);
    const cells = sourceEntries.map((e) => `<td>${formatNumber(e.value, 2)}</td>`).join("");
    elements.impactBars.innerHTML = `
      <div class="table-shell">
        <table>
          <thead>
            <tr>
              <th>Impact category (${unit})</th>
              ${sourceEntries.map((e) => `<th>${e.label}</th>`).join("")}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Climate change</td>
              ${cells}
              <td>${formatNumber(totalVal, 2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    return;
  }

  // Single score: one bar (Climate change) with stacked source contributions
  const total = entries.reduce((s, e) => s + (e.value || 0), 0);
  const segments = entries.filter((e) => e.label !== "Climate change"); // exclude total line
  const legend = segments
    .map((e, idx) => `<span style="color:${palette[idx % palette.length]}">${e.label} (${formatNumber(e.value, 2)})</span>`)
    .join(" • ");
  const stacks = segments
    .map((e, idx) => {
      const pct = total ? (e.value / total) * 100 : 0;
      return `<div style="width:${pct}%; background:${palette[idx % palette.length]}; height:100%;"></div>`;
    })
    .join("");

  elements.impactBars.innerHTML = `
    <div class="bar-row">
      <div class="bar-label">
        <div>Climate change</div>
        <small>${formatNumber(total, 2)} ${unit}</small>
      </div>
      <div class="bar-track" style="display:flex; height:12px; border-radius:6px; overflow:hidden;">
        ${stacks}
      </div>
      <div style="margin-top:4px; font-size:12px;">${legend}</div>
    </div>
  `;
}

function renderDetail(rows) {
  elements.detailCount.textContent = `${rows.length} rows`;
  if (!rows.length) {
    elements.detailTable.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
  const unit = state.filters.basis === "tonne" ? unitLabel(true) : unitLabel(false);
  const table = `
    <table>
      <thead>
        <tr>
          <th>Season</th>
          <th>Farmer</th>
          <th>Source</th>
          <th>Area (ha)</th>
          <th>Productivity (t/ha)</th>
          <th>Climate change (${unit})</th>
          <th>Direct+straw (${unit})</th>
          <th>Indirect VOL (${unit})</th>
          <th>Indirect leach (${unit})</th>
          <th>CO₂ from urea (${unit})</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const factor = state.filters.score === "single" ? SS_FACTOR : 1;
            const perHa = r.perHa != null ? r.perHa * factor : null;
            const perT = r.perT != null ? r.perT * factor : null;
            const totalVal = state.filters.basis === "tonne" ? perT : perHa;
            return `
              <tr>
          <td>${r.season}</td>
          <td>${r.farmer_id}</td>
          <td>${r.source || "Fertiliser"}</td>
          <td>${formatNumber(r.area, 2)}</td>
          <td>${formatNumber(r.prod, 2)}</td>
          <td>${formatNumber(totalVal, 2)}</td>
                <td>${formatNumber(perHa ?? perT, 2)}</td>
                <td>${formatNumber(perHa ?? perT, 2)}</td>
                <td>${formatNumber(perHa ?? perT, 2)}</td>
                <td>${formatNumber(perHa ?? perT, 2)}</td>
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

function formatNumberSci(value, digits = 2) {
  if (value == null || !isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e6 || (abs > 0 && abs < 1e-3)) {
    return value.toExponential(2);
  }
  return formatNumber(value, digits);
}

function convert(val) {
  if (val == null) return null;
  return state.filters.score === "chara" ? val : val * SS_FACTOR;
}

function unitLabel(isPerTonne) {
  const basis = isPerTonne ? "/t" : "/ha";
  return state.filters.score === "chara" ? `kg CO₂e${basis}` : `Pt${basis}`;
}
