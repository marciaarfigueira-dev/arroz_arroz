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

const palette = ["#ef4444", "#3b82f6", "#22c55e", "#a855f7"];
// Single-score conversion for CH₄: characterisation (kg CO2e) -> Pt
const SS_FACTOR = 1.77e3;

init();

async function init() {
  const data = await loadJson("./data/ch4.json");
  state.data = data.map(enrichRow);
  hydrateFilters();
  attachEvents();
  render();
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Unable to load ${path}`);
  return res.json();
}

function enrichRow(row) {
  const [farmerRaw, seasonRaw] = (row.dmu_id || "").split("_");
  const farmerId = farmerRaw || row.farmer_id || row.dmu_id || "—";
  const seasonVal = row.season || row.year || seasonRaw || "—";
  return {
    ...row,
    farmer_id: farmerId,
    farmer_label: farmerId ? farmerId.toUpperCase() : "—",
    season: seasonVal && seasonVal !== "—" ? String(seasonVal) : "—",
    area_ha: toNum(row["SUM of area_ha"]) ?? toNum(row.area_ha) ?? 0,
    productivity: toNum(row["Productivity (t/ha)"]),
    ch4_ha: toNum(row["C02eq(ch4)_ha"]),
    ch4_t: toNum(row["C02eq(ch4)_t"]),
  };
}

function hydrateFilters() {
  fillSelect(elements.season, uniqueValues(state.data, "season").sort((a, b) => `${b}`.localeCompare(`${a}`)), "Season");
  fillSelect(elements.farmer, uniqueValues(state.data, "farmer_label").sort(), "Farmer");
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
}

function render() {
  const filtered = state.data
    .map((row) => applyImpact(row, state.filters))
    .filter((r) => {
      if (state.filters.season !== "all" && `${r.season}` !== state.filters.season) return false;
      if (state.filters.farmer !== "all" && r.farmer_label !== state.filters.farmer) return false;
      return true;
    });
  renderActive(filtered.length);
  renderStats(filtered);
  renderImpacts(filtered);
  renderDetail(filtered);
  bindAbout();
}

function renderActive(count) {
  const parts = [];
  if (state.filters.season !== "all") parts.push(`Season ${state.filters.season}`);
  if (state.filters.farmer !== "all") parts.push(`Farmer ${state.filters.farmer}`);
  parts.push(state.filters.basis === "tonne" ? "Basis: impact/t" : "Basis: impact/ha");
  parts.push(state.filters.score === "chara" ? "Impact: Characterisation" : "Impact: Single score");
  elements.active.textContent = parts.length ? `${parts.join(" • ")} — ${count} rows` : `No filters applied — ${count} rows`;
}

function renderStats(rows) {
  if (!rows.length) {
    elements.statGrid.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
  const totalArea = rows.reduce((s, r) => s + (r.area_ha || 0), 0);
  const totalProd = rows.reduce((s, r) => s + (r.area_ha && r.productivity ? r.area_ha * r.productivity : 0), 0);
  const totalAbsHa = rows.reduce((s, r) => s + (r.impact_ha != null ? r.impact_ha * (r.area_ha || 0) : 0), 0);
  const totalAbsT = rows.reduce((s, r) => s + (r.impact_t != null && r.area_ha && r.productivity ? r.impact_t * r.area_ha * r.productivity : 0), 0);
  let avgHa = totalArea ? totalAbsHa / totalArea : null;
  let avgT = totalProd ? totalAbsT / totalProd : null;
  const factor = state.filters.score === "single" ? SS_FACTOR : 1;
  avgHa = avgHa != null ? avgHa * factor : null;
  avgT = avgT != null ? avgT * factor : null;
  const stats = [
    { label: "Rows", value: formatNumber(rows.length, 0) },
    {
      label: `Avg (${unitLabel(false)})`,
      value: avgHa == null ? "—" : formatNumberSci(avgHa, 2),
    },
    {
      label: `Avg (${unitLabel(true)})`,
      value: avgT == null ? "—" : formatNumberSci(avgT, 2),
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
  const key = state.filters.basis === "tonne" ? "impact_t" : "impact_ha";
  const unit = state.filters.basis === "tonne" ? unitLabel(true) : unitLabel(false);
  const denom =
    state.filters.basis === "tonne"
      ? rows.reduce((s, r) => s + (r.area_ha && r.productivity ? r.area_ha * r.productivity : 0), 0)
      : rows.reduce((s, r) => s + (r.area_ha || 0), 0);
  const totalAbs = rows.reduce((s, r) => {
    const scalar =
      state.filters.basis === "tonne"
        ? r.area_ha && r.productivity
          ? r.area_ha * r.productivity
          : 0
        : r.area_ha || 0;
    return s + (r[key] != null ? r[key] * scalar : 0);
  }, 0);
  let total = denom ? totalAbs / denom : totalAbs;
  if (state.filters.score === "single") {
    total = total != null ? total * SS_FACTOR : total;
  }
  elements.impactCount.textContent = rows.length ? "1 category" : "0 categories";
  if (!rows.length) {
    elements.impactBars.innerHTML = `<p class="empty">No impacts to show.</p>`;
    return;
  }
  const entry = { cat: "Climate change", value: total };
  elements.impactBars.innerHTML = `
    <div class="bar-row">
      <div class="bar-label">
        <div>${entry.cat}</div>
        <small>${formatNumberSci(entry.value, 2)} ${unit}</small>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:100%; background:${palette[0]}"></div>
        <span class="bar-value">100%</span>
      </div>
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
          <th>Area (ha)</th>
          <th>Productivity (t/ha)</th>
          <th>CH₄ (${unit})</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const raw = state.filters.basis === "tonne" ? r.impact_t : r.impact_ha;
            const val = state.filters.score === "single" && raw != null ? raw * SS_FACTOR : raw;
            const season = r.season && r.season !== "—" ? r.season : (r.dmu_id || "").split("_")[1] || "—";
            const farmer = r.farmer_label || (r.dmu_id || "").split("_")[0]?.toUpperCase() || r.farmer_id;
            return `
              <tr>
                <td>${season}</td>
                <td>${farmer}</td>
                <td>${formatNumberSci(r.area_ha, 2)}</td>
                <td>${formatNumberSci(r.productivity, 2)}</td>
                <td>${formatNumberSci(val, 2)}</td>
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
  const num = Number(String(val).replace(",", "."));
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

function bindAbout() {
  const btn = document.getElementById("about-btn");
  if (btn) {
    btn.onclick = () => (window.location.href = "./about.html");
  }
}

function applyImpact(row) {
  // Store raw characterisation (kg CO2e) intensities; apply single-score factor at render time.
  return { ...row, impact_ha: row.ch4_ha, impact_t: row.ch4_t };
}

function unitLabel(isPerTonne) {
  const basis = isPerTonne ? "/t" : "/ha";
  return state.filters.score === "single" ? `Pt${basis}` : `kg CO₂e${basis}`;
}
