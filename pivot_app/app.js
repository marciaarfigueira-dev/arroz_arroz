const state = {
  data: [],
  filters: {
    season: "all",
    farmer: "all",
    operation: "all",
    substance: "all",
    enemy: "all",
    search: "",
  },
};

const ENEMIES = [
  { key: "digitaria_sanguinalis", label: "Digitaria sanguinalis" },
  { key: "cyperus_esculentus", label: "Cyperus esculentus" },
  { key: "pyricularia", label: "Pyricularia" },
  { key: "wild_rice", label: "Wild Rice" },
  { key: "gramineae", label: "Gramineae" },
  { key: "broadleaves", label: "Broadleaves" },
  { key: "general_weeds", label: "General Weeds" },
  { key: "weevil", label: "Weevil" },
  { key: "aphids", label: "Aphids" },
  { key: "rice_worms", label: "Rice Worms" },
  { key: "spodoptera_frugiperda", label: "Spodoptera frugiperda" },
  { key: "heteranthera", label: "Heteranthera" },
];

const elements = {
  season: document.getElementById("season-filter"),
  farmer: document.getElementById("farmer-filter"),
  operation: document.getElementById("operation-filter"),
  substance: document.getElementById("substance-filter"),
  enemy: document.getElementById("enemy-filter"),
  search: document.getElementById("search-filter"),
  reset: document.getElementById("reset-filters"),
  activeFilters: document.getElementById("active-filters"),
  statGrid: document.getElementById("stat-grid"),
  pivotTable: document.getElementById("pivot-table"),
  pivotCount: document.getElementById("pivot-count"),
  detailTable: document.getElementById("detail-table"),
  detailCount: document.getElementById("detail-count"),
};

init();

async function init() {
  const dataset = await loadData();
  state.data = dataset.map(enrichRecord);
  hydrateFilters(state.data);
  attachEvents();
  render();
}

async function loadData() {
  const res = await fetch("./data/operations.json");
  if (!res.ok) throw new Error("Unable to load operations data");
  return res.json();
}

function enrichRecord(row) {
  const opNorm = row.operation_normalized || (row.operation || "").toLowerCase();
  const enemyTargets = ENEMIES.filter((enemy) => row[enemy.key] === 1);
  return {
    ...row,
    operation_display: toTitle(row.operation || opNorm || "Unknown"),
    operation_normalized: opNorm || "unknown",
    active_substance: row.active_substance || "Unspecified",
    product: row.product || "—",
    stage: row.stage || "—",
    enemyTargets,
    enemyLabel: enemyTargets.length ? enemyTargets.map((e) => e.label).join(", ") : "",
  };
}

function hydrateFilters(data) {
  fillSelect(elements.season, uniqueValues(data, "season").sort((a, b) => b - a), "Season");
  fillSelect(elements.farmer, uniqueValues(data, "farmer_id").sort(), "Farmer ID");
  fillSelect(
    elements.operation,
    uniqueValues(data, "operation_normalized")
      .map((op) => ({ value: op, label: toTitle(op) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    "Operation"
  );
  fillSelect(elements.substance, uniqueValues(data, "active_substance").sort(), "Active substance");
  fillSelect(
    elements.enemy,
    ENEMIES.map((enemy) => ({ value: enemy.key, label: enemy.label })),
    "Target"
  );
}

function fillSelect(select, values, label) {
  select.innerHTML = "";
  const optionAll = document.createElement("option");
  optionAll.value = "all";
  optionAll.textContent = `All ${label ? label.toLowerCase() + "s" : ""}`.trim();
  select.appendChild(optionAll);
  values.forEach((item) => {
    const option = document.createElement("option");
    if (typeof item === "object") {
      option.value = item.value;
      option.textContent = item.label;
    } else {
      option.value = item;
      option.textContent = item;
    }
    select.appendChild(option);
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
  elements.operation.addEventListener("change", () => {
    state.filters.operation = elements.operation.value;
    render();
  });
  elements.substance.addEventListener("change", () => {
    state.filters.substance = elements.substance.value;
    render();
  });
  elements.enemy.addEventListener("change", () => {
    state.filters.enemy = elements.enemy.value;
    render();
  });
  elements.search.addEventListener("input", (event) => {
    state.filters.search = event.target.value;
    render();
  });
  elements.reset.addEventListener("click", () => {
    Object.assign(state.filters, {
      season: "all",
      farmer: "all",
      operation: "all",
      substance: "all",
      enemy: "all",
      search: "",
    });
    elements.season.value = "all";
    elements.farmer.value = "all";
    elements.operation.value = "all";
    elements.substance.value = "all";
    elements.enemy.value = "all";
    elements.search.value = "";
    render();
  });
}

function render() {
  const filtered = applyFilters(state.data, state.filters);
  renderActiveFilters(state.filters, filtered.length);
  renderStats(filtered);
  renderPivot(filtered);
  renderDetail(filtered);
}

function applyFilters(rows, filters) {
  return rows.filter((row) => {
    if (filters.season !== "all" && `${row.season}` !== filters.season) return false;
    if (filters.farmer !== "all" && row.farmer_id !== filters.farmer) return false;
    if (filters.operation !== "all" && row.operation_normalized !== filters.operation) return false;
    if (filters.substance !== "all" && row.active_substance !== filters.substance) return false;
    if (filters.enemy !== "all" && !row.enemyTargets.find((e) => e.key === filters.enemy)) return false;
    if (filters.search) {
      const term = filters.search.toLowerCase();
      const haystack = [
        row.product,
        row.active_substance,
        row.variety,
        row.stage,
        row.dmu_id,
        row.operation_display,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

function renderActiveFilters(filters, count) {
  const active = [];
  if (filters.season !== "all") active.push(`Season ${filters.season}`);
  if (filters.farmer !== "all") active.push(`Farmer ${filters.farmer}`);
  if (filters.operation !== "all") active.push(toTitle(filters.operation));
  if (filters.substance !== "all") active.push(filters.substance);
  if (filters.enemy !== "all") active.push(`Target: ${toTitle(filters.enemy)}`);
  if (filters.search) active.push(`Search: “${filters.search}”`);
  const label = active.length ? active.join(" • ") : "No filters applied";
  elements.activeFilters.textContent = `${label} — ${count} records`;
}

function renderStats(rows) {
  const totalArea = sum(rows, "area_ha");
  const avgDose = average(rows, "dose_kg_ha");
  const avgDosePerT = average(rows, "dose_kg_per_t");
  const uniqueSubstances = uniqueValues(rows, "active_substance").length;
    const uniqueFarmers = uniqueValues(rows, "farmer_id").length;
  const stats = [
    { label: "Operations", value: formatNumber(rows.length, 0) },
    { label: "Area (ha)", value: formatNumber(totalArea, 1) },
    { label: "Active substances", value: formatNumber(uniqueSubstances, 0) },
    { label: "Farmers", value: formatNumber(uniqueFarmers, 0) },
    { label: "Avg dose (kg/ha)", value: avgDose === null ? "—" : formatNumber(avgDose, 2) },
    { label: "Avg dose (kg/t)", value: avgDosePerT === null ? "—" : formatNumber(avgDosePerT, 3) },
  ];
  elements.statGrid.innerHTML = stats
    .map(
      (stat) => `
        <div class="stat">
          <small>${stat.label}</small>
          <strong>${stat.value}</strong>
        </div>
      `
    )
    .join("");
}

function renderPivot(rows) {
  if (!rows.length) {
    elements.pivotTable.innerHTML = `<p class="empty">No operations match these filters.</p>`;
    elements.pivotCount.textContent = "0 groups";
    return;
  }
  const grouped = aggregateBySubstance(rows);
  elements.pivotCount.textContent = `${grouped.length} groups`;
  const table = `
    <table>
      <thead>
        <tr>
          <th>Operation</th>
          <th>Active substance</th>
          <th>Targets</th>
          <th>Products</th>
          <th>Ops</th>
          <th>Area (ha)</th>
          <th>Avg dose (kg/ha)</th>
          <th>Avg dose (kg/t)</th>
        </tr>
      </thead>
      <tbody>
        ${grouped
          .map(
            (row) => `
              <tr>
                <td><span class="tag">${row.operation}</span></td>
                <td>${row.substance}</td>
                <td>${row.targets || "—"}</td>
                <td>${row.products.join(", ")}</td>
                <td>${row.count}</td>
                <td>${formatNumber(row.area, 1)}</td>
                <td>${row.avgDose === null ? "—" : formatNumber(row.avgDose, 2)}</td>
                <td>${row.avgDosePerT === null ? "—" : formatNumber(row.avgDosePerT, 3)}</td>
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
  elements.detailCount.textContent = `${rows.length} records`;
  if (!rows.length) {
    elements.detailTable.innerHTML = `<p class="empty">Nothing to show. Broaden filters to see operations.</p>`;
    return;
  }
  const table = `
    <table>
      <thead>
        <tr>
          <th>Season</th>
          <th>Farmer ID</th>
          <th>Variety</th>
          <th>Operation</th>
          <th>Active substance</th>
          <th>Targets</th>
          <th>Product</th>
          <th>Stage</th>
          <th>Dose (kg/ha)</th>
          <th>Dose (kg/t)</th>
          <th>Area (ha)</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <td>${row.season}</td>
                <td>${row.farmer_id || row.dmu_id}</td>
                <td>${row.variety}</td>
                <td>${row.operation_display}</td>
                <td>${row.active_substance}</td>
                <td>${row.enemyLabel || "—"}</td>
                <td>${row.product}</td>
                <td>${row.stage}</td>
                <td>${row.dose_kg_ha == null ? "—" : formatNumber(row.dose_kg_ha, 2)}</td>
                <td>${row.dose_kg_per_t == null ? "—" : formatNumber(row.dose_kg_per_t, 3)}</td>
                <td>${row.area_ha == null ? "—" : formatNumber(row.area_ha, 2)}</td>
                <td>${row.date || "—"}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
  elements.detailTable.innerHTML = table;
}

function aggregateBySubstance(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = `${row.operation_normalized}|${row.active_substance}`;
    if (!map.has(key)) {
      map.set(key, {
        operation: row.operation_display,
        substance: row.active_substance,
        products: new Set(),
        targets: new Set(),
        count: 0,
        area: 0,
        totalDose: 0,
        doseAreas: 0,
        totalDosePerT: 0,
        dosePerTAreas: 0,
      });
    }
    const agg = map.get(key);
    agg.count += 1;
    agg.area += row.area_ha || 0;
    if (row.dose_kg_ha != null) {
      agg.totalDose += (row.dose_kg_ha || 0) * (row.area_ha || 1);
      agg.doseAreas += row.area_ha || 1;
    }
    if (row.dose_kg_per_t != null) {
      agg.totalDosePerT += (row.dose_kg_per_t || 0) * (row.area_ha || 1);
      agg.dosePerTAreas += row.area_ha || 1;
    }
    if (row.product) agg.products.add(row.product);
    (row.enemyTargets || []).forEach((enemy) => agg.targets.add(enemy.label));
  }
  return Array.from(map.values())
    .map((agg) => ({
      ...agg,
      products: Array.from(agg.products),
      targets: Array.from(agg.targets)
        .map(toTitle)
        .sort()
        .join(", "),
      avgDose: agg.doseAreas ? agg.totalDose / agg.doseAreas : null,
      avgDosePerT: agg.dosePerTAreas ? agg.totalDosePerT / agg.dosePerTAreas : null,
    }))
    .sort((a, b) => b.area - a.area);
}

function uniqueValues(rows, key) {
  return Array.from(
    rows.reduce((set, row) => {
      if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
        set.add(row[key]);
      }
      return set;
    }, new Set())
  );
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + (row[key] || 0), 0);
}

function average(rows, key) {
  const usable = rows.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
  if (!usable.length) return null;
  const total = usable.reduce((sum, value) => sum + value, 0);
  return total / usable.length;
}

function formatNumber(value, digits = 1) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function toTitle(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}
