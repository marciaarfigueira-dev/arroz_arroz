const ENEMIES = [
  "milha",
  "junca",
  "pyricularia",
  "wild_rice",
  "gramineae",
  "broadleaves",
  "general_weeds",
  "piolho",
  "aphids",
  "lagarta_arroz",
  "lagarta_cartuxo",
  "heteranthera",
];

const state = {
  data: [],
  filters: { season: "all", stage: "all" },
};

const elements = {
  season: document.getElementById("season-filter"),
  stage: document.getElementById("stage-filter"),
  active: document.getElementById("active-filters"),
  heatmap: document.getElementById("heatmap"),
  pivotCount: document.getElementById("pivot-count"),
  reset: document.getElementById("reset-filters"),
};

init();

async function init() {
  const ops = await loadJson("./data/operations.json");
  state.data = ops.map(enrichRow);
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
  const [farmer_id, seasonStr] = (row.dmu_id || "").split("_");
  const season = row.season || row.year || seasonStr || "—";
  const stage = row.crop_stage || row.stage || row.growth_stage || "—";
  const base = { farmer_id: farmer_id || row.dmu_id || "—", season: String(season), stage };
  ENEMIES.forEach((e) => (base[e] = toNum(row[e]) || 0));
  base.area = toNum(row.covered_area) || toNum(row.area_ha) || 0;
  return base;
}

function hydrateFilters() {
  fillSelect(elements.season, uniqueValues(state.data, "season").sort((a, b) => `${b}`.localeCompare(`${a}`)), "Season");
  fillSelect(elements.stage, uniqueValues(state.data, "stage").sort(), "Crop stage");
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
  elements.stage.addEventListener("change", () => {
    state.filters.stage = elements.stage.value;
    render();
  });
  elements.reset.addEventListener("click", () => {
    state.filters = { season: "all", stage: "all" };
    elements.season.value = "all";
    elements.stage.value = "all";
    render();
  });
}

function render() {
  const filtered = state.data.filter((r) => {
    if (state.filters.season !== "all" && `${r.season}` !== state.filters.season) return false;
    if (state.filters.stage !== "all" && `${r.stage}` !== state.filters.stage) return false;
    return true;
  });
  renderActive(filtered.length);
  renderHeatmap(filtered);
}

function renderActive(count) {
  const parts = [];
  if (state.filters.season !== "all") parts.push(`Season ${state.filters.season}`);
  if (state.filters.stage !== "all") parts.push(`Stage ${state.filters.stage}`);
  elements.active.textContent = parts.length ? `${parts.join(" • ")} — ${count} rows` : `No filters applied — ${count} rows`;
}

function renderHeatmap(rows) {
  elements.pivotCount.textContent = `${rows.length} rows`;
  if (!rows.length) {
    elements.heatmap.innerHTML = `<p class="empty">No data.</p>`;
    return;
  }
  const stages = uniqueValues(rows, "stage").sort();
  const matrix = stages.map((stage) => {
    const stageRows = rows.filter((r) => r.stage === stage);
    const entry = { stage };
    ENEMIES.forEach((e) => {
      const val = stageRows.reduce((s, r) => s + (r[e] || 0) * (r.area || 1), 0);
      entry[e] = val;
    });
    return entry;
  });
  const maxVal = Math.max(
    1,
    ...matrix.flatMap((row) => ENEMIES.map((e) => row[e] || 0))
  );
  const header = `<tr><th class="sticky col-season">Crop stage</th>${ENEMIES.map((e) => `<th>${e}</th>`).join("")}</tr>`;
  const body = matrix
    .map(
      (row) => `
      <tr>
        <td class="sticky col-season">${row.stage}</td>
        ${ENEMIES.map((e) => {
          const val = row[e] || 0;
          const pct = (val / maxVal) * 100;
          const color = pctToColor(pct);
          return `<td style="background:${color}; color:${pct > 60 ? "#0b1021" : "#fff"}">${formatNumber(val, 1)}</td>`;
        }).join("")}
      </tr>
    `
    )
    .join("");
  elements.heatmap.innerHTML = `<table class="sticky-cols">${header}${body}</table>`;
}

function pctToColor(p) {
  // scale 0-100 -> blue -> amber -> red
  const stops = [
    { pct: 0, color: [14, 165, 233] }, // #0ea5e9
    { pct: 50, color: [245, 158, 11] }, // #f59e0b
    { pct: 100, color: [225, 29, 72] }, // #e11d48
  ];
  const interp = (c1, c2, t) => c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
  if (p <= 0) return "rgb(14,165,233)";
  if (p >= 100) return "rgb(225,29,72)";
  let low = stops[0],
    high = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (p >= stops[i].pct && p <= stops[i + 1].pct) {
      low = stops[i];
      high = stops[i + 1];
      break;
    }
  }
  const t = (p - low.pct) / (high.pct - low.pct || 1);
  const [r, g, b] = interp(low.color, high.color, t);
  return `rgb(${r},${g},${b})`;
}

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
