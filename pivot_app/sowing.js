const state = {
  data: [],
  filters: {
    season: "all",
    farmer: "all",
    variety: "all",
    operation: "all",
    equipment: "all",
    search: "",
  },
};

const elements = {
  season: document.getElementById("season-filter"),
  farmer: document.getElementById("farmer-filter"),
  variety: document.getElementById("variety-filter"),
  operation: document.getElementById("operation-filter"),
  equipment: document.getElementById("equipment-filter"),
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
  const res = await fetch("./data/sowing.json");
  if (!res.ok) throw new Error("Unable to load sowing data");
  return res.json();
}

function enrichRecord(row) {
  return {
    ...row,
    operation_display: row.operation_display || toTitle(row.operation || "Unknown"),
    operation_normalized: row.operation_normalized || (row.operation || "").toLowerCase(),
    product: row.product || "—",
    equipment: row.equipment || "—",
    variety: row.variety || "Unspecified",
  };
}

function hydrateFilters(data) {
  fillSelect(elements.season, uniqueValues(data, "season").sort((a, b) => b - a), "Season");
  fillSelect(elements.farmer, uniqueValues(data, "farmer_id").sort(), "Farmer");
  fillSelect(elements.variety, uniqueValues(data, "variety").sort(), "Variety");
  fillSelect(
    elements.operation,
    uniqueValues(data, "operation_normalized")
      .map((op) => ({ value: op, label: toTitle(op) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    "Operation"
  );
  fillSelect(elements.equipment, uniqueValues(data, "equipment").sort(), "Equipment");
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
  elements.variety.addEventListener("change", () => {
    state.filters.variety = elements.variety.value;
    render();
  });
  elements.operation.addEventListener("change", () => {
    state.filters.operation = elements.operation.value;
    render();
  });
  elements.equipment.addEventListener("change", () => {
    state.filters.equipment = elements.equipment.value;
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
      variety: "all",
      operation: "all",
      equipment: "all",
      search: "",
    });
    elements.season.value = "all";
    elements.farmer.value = "all";
    elements.variety.value = "all";
    elements.operation.value = "all";
    elements.equipment.value = "all";
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
    if (filters.variety !== "all" && row.variety !== filters.variety) return false;
    if (filters.operation !== "all" && row.operation_normalized !== filters.operation) return false;
    if (filters.equipment !== "all" && row.equipment !== filters.equipment) return false;
    if (filters.search) {
      const term = filters.search.toLowerCase();
      const haystack = [
        row.product,
        row.variety,
        row.operation_display,
        row.equipment,
        row.dmu_id,
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
  if (filters.variety !== "all") active.push(filters.variety);
  if (filters.operation !== "all") active.push(toTitle(filters.operation));
  if (filters.equipment !== "all") active.push(filters.equipment);
  if (filters.search) active.push(`Search: “${filters.search}”`);
  const label = active.length ? active.join(" • ") : "No filters applied";
  elements.activeFilters.textContent = `${label} — ${count} records`;
}

function renderStats(rows) {
  const totalArea = sum(rows, "area_ha");
  const uniqueVarieties = uniqueValues(rows, "variety").length;
  const uniqueEquip = uniqueValues(rows, "equipment").length;
  const avgDoseHa = average(rows, "dose_kg_ha");
  const avgDoseT = average(rows, "dose_kg_per_t");
  const stats = [
    { label: "Sowing events", value: formatNumber(rows.length, 0) },
    { label: "Area (ha)", value: formatNumber(totalArea, 1) },
    { label: "Varieties", value: formatNumber(uniqueVarieties, 0) },
    { label: "Equipment", value: formatNumber(uniqueEquip, 0) },
    { label: "Avg seed rate (kg/ha)", value: avgDoseHa === null ? "—" : formatNumber(avgDoseHa, 1) },
    { label: "Avg seed rate (kg/t)", value: avgDoseT === null ? "—" : formatNumber(avgDoseT, 2) },
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
    elements.pivotTable.innerHTML = `<p class="empty">No sowing events match these filters.</p>`;
    elements.pivotCount.textContent = "0 groups";
    return;
  }
  const grouped = aggregateByVariety(rows);
  elements.pivotCount.textContent = `${grouped.length} varieties`;
  const table = `
    <table>
      <thead>
        <tr>
          <th>Variety</th>
          <th>Operations</th>
          <th>Equipment</th>
          <th>Events</th>
          <th>Area (ha)</th>
          <th>Avg seed rate (kg/ha)</th>
          <th>Avg seed rate (kg/t)</th>
        </tr>
      </thead>
      <tbody>
        ${grouped
          .map(
            (row) => `
              <tr>
                <td>${row.variety}</td>
                <td>${row.operations}</td>
                <td>${row.equipment}</td>
                <td>${row.count}</td>
                <td>${formatNumber(row.area, 1)}</td>
                <td>${row.avgDoseHa === null ? "—" : formatNumber(row.avgDoseHa, 1)}</td>
                <td>${row.avgDoseT === null ? "—" : formatNumber(row.avgDoseT, 2)}</td>
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
    elements.detailTable.innerHTML = `<p class="empty">Nothing to show. Broaden filters to see sowing events.</p>`;
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
          <th>Equipment</th>
          <th>Product</th>
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
                <td>${row.equipment}</td>
                <td>${row.product}</td>
                <td>${row.dose_kg_ha == null ? "—" : formatNumber(row.dose_kg_ha, 1)}</td>
                <td>${row.dose_kg_per_t == null ? "—" : formatNumber(row.dose_kg_per_t, 2)}</td>
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

function aggregateByVariety(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.variety || "Unspecified";
    if (!map.has(key)) {
      map.set(key, {
        variety: key,
        operations: new Set(),
        equipment: new Set(),
        count: 0,
        area: 0,
        totalDoseHa: 0,
        doseHaArea: 0,
        totalDoseT: 0,
        doseTArea: 0,
      });
    }
    const agg = map.get(key);
    agg.count += 1;
    agg.area += row.area_ha || 0;
    agg.operations.add(row.operation_display);
    agg.equipment.add(row.equipment);
    if (row.dose_kg_ha != null) {
      agg.totalDoseHa += (row.dose_kg_ha || 0) * (row.area_ha || 1);
      agg.doseHaArea += row.area_ha || 1;
    }
    if (row.dose_kg_per_t != null) {
      agg.totalDoseT += (row.dose_kg_per_t || 0) * (row.area_ha || 1);
      agg.doseTArea += row.area_ha || 1;
    }
  }
  return Array.from(map.values())
    .map((agg) => ({
      ...agg,
      operations: Array.from(agg.operations).sort().join(", "),
      equipment: Array.from(agg.equipment).sort().join(", "),
      avgDoseHa: agg.doseHaArea ? agg.totalDoseHa / agg.doseHaArea : null,
      avgDoseT: agg.doseTArea ? agg.totalDoseT / agg.doseTArea : null,
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
