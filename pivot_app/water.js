const state = {
  data: [],
  filters: { season: "all", farmer: "all", search: "" },
};

const elements = {
  season: document.getElementById("season-filter"),
  farmer: document.getElementById("farmer-filter"),
  search: document.getElementById("search-filter"),
  reset: document.getElementById("reset-filters"),
  active: document.getElementById("active-filters"),
  statGrid: document.getElementById("stat-grid"),
  pivotTable: document.getElementById("pivot-table"),
  pivotCount: document.getElementById("pivot-count"),
  detailTable: document.getElementById("detail-table"),
  detailCount: document.getElementById("detail-count"),
};

init();

async function init() {
  const rows = await loadData();
  state.data = rows.map(enrichRow);
  hydrateFilters(state.data);
  attachEvents();
  render();
}

async function loadData() {
  const res = await fetch("./data/water.json");
  if (!res.ok) throw new Error("Unable to load water data");
  return res.json();
}

function enrichRow(row) {
  const dmu = row.DMU_ID || row.dmu_id || "";
  const [farmer_id, seasonStr] = dmu.split("_");
  const season = seasonStr || row.season || row.year || "—";
  return {
    ...row,
    dmu_id: dmu || "—",
    farmer_id: farmer_id || dmu || "—",
    season,
    area_ha: toNum(row["SUM of area_ha"]),
    productivity: toNum(row["Productivity (t/ha)"]),
    water_ha: toNum(row["Water m3/ha"]),
    water_t: toNum(row["Water M3/t"]),
  };
}

function hydrateFilters(data) {
  fillSelect(elements.season, uniqueValues(data, "season").sort((a, b) => b - a), "Season");
  fillSelect(elements.farmer, uniqueValues(data, "farmer_id").sort(), "Farmer");
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
  elements.search.addEventListener("input", (e) => {
    state.filters.search = e.target.value;
    render();
  });
  elements.reset.addEventListener("click", () => {
    state.filters = { season: "all", farmer: "all", search: "" };
    elements.season.value = "all";
    elements.farmer.value = "all";
    elements.search.value = "";
    render();
  });
}

function render() {
  const filtered = applyFilters(state.data, state.filters);
  renderActive(filtered.length);
  renderStats(filtered);
  renderPivot(filtered);
  renderDetail(filtered);
}

function applyFilters(rows, filters) {
  return rows.filter((r) => {
    if (filters.season !== "all" && `${r.season}` !== filters.season) return false;
    if (filters.farmer !== "all" && r.farmer_id !== filters.farmer) return false;
    if (filters.search) {
      const term = filters.search.toLowerCase();
      const haystack = [r.dmu_id, r.farmer_id, r.season].join(" ").toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

function renderActive(count) {
  const parts = [];
  if (state.filters.season !== "all") parts.push(`Season ${state.filters.season}`);
  if (state.filters.farmer !== "all") parts.push(`Farmer ${state.filters.farmer}`);
  if (state.filters.search) parts.push(`Search: "${state.filters.search}"`);
  elements.active.textContent = parts.length
    ? `${parts.join(" • ")} — ${count} rows`
    : `No filters applied — ${count} rows`;
}

function renderStats(rows) {
  if (!rows.length) {
    elements.statGrid.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
  const avgHa = average(rows.map((r) => r.water_ha));
  const avgT = average(rows.map((r) => r.water_t));
  const stats = [
    { label: "Rows", value: formatNumber(rows.length, 0) },
    { label: "Avg water (m³/ha)", value: avgHa == null ? "—" : formatNumber(avgHa, 2) },
    { label: "Avg water (m³/t)", value: avgT == null ? "—" : formatNumber(avgT, 2) },
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

function renderPivot(rows) {
  elements.pivotCount.textContent = `${rows.length} rows`;
  if (!rows.length) {
    elements.pivotTable.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
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
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
            <tr>
              <td>${r.season}</td>
              <td>${r.farmer_id}</td>
              <td>${r.area_ha == null ? "—" : formatNumber(r.area_ha, 2)}</td>
              <td>${r.productivity == null ? "—" : formatNumber(r.productivity, 2)}</td>
              <td>${r.water_ha == null ? "—" : formatNumber(r.water_ha, 2)}</td>
              <td>${r.water_t == null ? "—" : formatNumber(r.water_t, 2)}</td>
            </tr>
          `
          )
          .join("")}
      </tbody>
    </table>
  `;
  elements.pivotTable.innerHTML = table;
}

function renderDetail(rows) {
  elements.detailCount.textContent = `${rows.length} rows`;
  // Reuse the pivot table for detail; keep layout consistent
  elements.detailTable.innerHTML = elements.pivotTable.innerHTML || `<p class="empty">No data.</p>`;
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

function average(arr) {
  const vals = arr.filter((v) => v !== null && v !== undefined);
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function formatNumber(value, digits = 1) {
  if (value == null || !isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
