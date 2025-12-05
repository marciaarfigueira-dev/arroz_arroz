const state = {
  data: [],
  filters: {
    season: "all",
    farmer: "all",
    category: "all",
    equipment: "all",
    search: "",
  },
};

const elements = {
  season: document.getElementById("season-filter"),
  farmer: document.getElementById("farmer-filter"),
  category: document.getElementById("category-filter"),
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
  const res = await fetch("./data/machines.json");
  if (!res.ok) throw new Error("Unable to load machine operations data");
  return res.json();
}

function enrichRecord(row) {
  return {
    ...row,
    operation_display: row.operation_display || toTitle(row.operation || "Unknown"),
    operation_normalized: row.operation_normalized || (row.operation || "").toLowerCase(),
    category_display: row.operation_category_display || toTitle(row.operation_category || "Unknown"),
    equipment: row.equipment || "—",
    area_ha: row.area_ha || 0,
    total_area_worked: row.total_area_worked || row.area_ha || 0,
    repetitions: row.repetitions || 0,
    area_normalized: row.total_area_worked || row.area_ha || 0,
  };
}

function hydrateFilters(data) {
  fillSelect(elements.season, uniqueValues(data, "season").sort((a, b) => b - a), "Season");
  fillSelect(elements.farmer, uniqueValues(data, "farmer_id").sort(), "Farmer");
  fillSelect(
    elements.category,
    uniqueValues(data, "operation_category")
      .map((c) => ({ value: c, label: toTitle((c || "").replace(/_/g, " ")) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    "Category"
  );
  fillSelect(
    elements.equipment,
    uniqueValues(data, "equipment").sort(),
    "Equipment"
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
  elements.category.addEventListener("change", () => {
    state.filters.category = elements.category.value;
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
      category: "all",
      equipment: "all",
      search: "",
    });
    elements.season.value = "all";
    elements.farmer.value = "all";
    elements.category.value = "all";
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
    if (filters.category !== "all" && row.operation_category !== filters.category) return false;
    if (filters.equipment !== "all" && row.equipment !== filters.equipment) return false;
    if (filters.search) {
      const term = filters.search.toLowerCase();
      const haystack = [
        row.operation_display,
        row.category_display,
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
  if (filters.category !== "all") active.push(toTitle(filters.category.replace(/_/g, " ")));
  if (filters.equipment !== "all") active.push(filters.equipment);
  if (filters.search) active.push(`Search: “${filters.search}”`);
  const label = active.length ? active.join(" • ") : "No filters applied";
  elements.activeFilters.textContent = `${label} — ${count} records`;
}

function renderStats(rows) {
  const totalWorked = sum(rows, "total_area_worked");
  const avgWorked = rows.length ? totalWorked / rows.length : null;
  const avgAreaPerT = averageWeighted(rows, "area_per_tonne");
  const stats = [
    { label: "Operations", value: formatNumber(rows.length, 0) },
    { label: "Area worked (ha)", value: formatNumber(totalWorked, 1) },
    {
      label: "Avg area worked (ha/op)",
      value: avgWorked == null ? "—" : formatNumber(avgWorked, 2),
    },
    {
      label: "Area per tonne",
      value: avgAreaPerT === null ? "—" : formatNumber(avgAreaPerT, 3),
    },
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
    elements.pivotTable.innerHTML = `<p class="empty">No machine operations match these filters.</p>`;
    elements.pivotCount.textContent = "0 groups";
    return;
  }
  const grouped = aggregateByEquipment(rows);
  elements.pivotCount.textContent = `${grouped.length} equipment`;
  const table = `
    <table>
      <thead>
        <tr>
          <th>Equipment</th>
          <th>Categories</th>
          <th>Operations</th>
          <th>Events</th>
          <th>Normalized area (ha)</th>
          <th>Area worked (ha)</th>
          <th>Repetitions</th>
          <th>Area per tonne</th>
        </tr>
      </thead>
      <tbody>
        ${grouped
          .map(
            (row) => `
              <tr>
                <td>${row.equipment}</td>
                <td>${row.categories}</td>
                <td>${row.operations}</td>
                <td>${row.count}</td>
                <td>${formatNumber(row.area, 1)}</td>
                <td>${formatNumber(row.worked, 1)}</td>
                <td>${formatNumber(row.repetitions, 0)}</td>
                <td>${row.areaPerT === null ? "—" : formatNumber(row.areaPerT, 3)}</td>
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
          <th>Category</th>
          <th>Operation</th>
          <th>Equipment</th>
          <th>Normalized area (ha)</th>
          <th>Repetitions</th>
          <th>Total area worked (ha)</th>
          <th>Area per tonne</th>
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
                <td>${row.category_display}</td>
                <td>${row.operation_display}</td>
                <td>${row.equipment}</td>
                <td>${row.area_normalized == null ? "—" : formatNumber(row.area_normalized, 2)}</td>
                <td>${row.repetitions == null ? "—" : formatNumber(row.repetitions, 0)}</td>
                <td>${row.total_area_worked == null ? "—" : formatNumber(row.total_area_worked, 2)}</td>
                <td>${row.area_per_tonne == null ? "—" : formatNumber(row.area_per_tonne, 3)}</td>
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

function aggregateByEquipment(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.equipment || "Unspecified";
    if (!map.has(key)) {
      map.set(key, {
        equipment: key,
        categories: new Set(),
        operations: new Set(),
        count: 0,
        area: 0,
        worked: 0,
        repetitions: 0,
        areaPerTTotal: 0,
        areaPerTWeight: 0,
      });
    }
    const agg = map.get(key);
    agg.count += 1;
    const area = row.area_normalized || 0;
    agg.area += area;
    agg.worked += row.total_area_worked || 0;
    agg.repetitions += row.repetitions || 0;
    agg.categories.add(row.category_display);
    agg.operations.add(row.operation_display);
    if (row.area_per_tonne != null) {
      agg.areaPerTTotal += (row.area_per_tonne || 0) * (area || 1);
      agg.areaPerTWeight += area || 1;
    }
  }
  return Array.from(map.values())
    .map((agg) => ({
      ...agg,
      categories: Array.from(agg.categories).sort().join(", "),
      operations: Array.from(agg.operations).sort().join(", "),
      areaPerT: agg.areaPerTWeight ? agg.areaPerTTotal / agg.areaPerTWeight : null,
    }))
    .sort((a, b) => b.worked - a.worked);
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

function averageWeighted(rows, key) {
  let total = 0;
  let weight = 0;
  for (const row of rows) {
    if (row[key] != null) {
      const area = row.area_normalized || 1;
      total += (row[key] || 0) * area;
      weight += area;
    }
  }
  if (!weight) return null;
  return total / weight;
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
