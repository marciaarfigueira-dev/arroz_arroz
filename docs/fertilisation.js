const state = {
  data: [],
  filters: {
    season: "all",
    farmer: "all",
    operation: "all",
    equipment: "all",
    product: "all",
    search: "",
  },
};

const elements = {
  season: document.getElementById("season-filter"),
  farmer: document.getElementById("farmer-filter"),
  operation: document.getElementById("operation-filter"),
  equipment: document.getElementById("equipment-filter"),
  product: document.getElementById("product-filter"),
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
  const res = await fetch("./data/fertilisation.json");
  if (!res.ok) throw new Error("Unable to load fertilisation data");
  return res.json();
}

function enrichRecord(row) {
  return {
    ...row,
    area_ha: row.area_TOTAL ?? row.covered_area ?? 0,
    operation_display: row.operation_display || toTitle(row.operation || "Unknown"),
    operation_normalized: row.operation_normalized || (row.operation || "").toLowerCase(),
    equipment: row.equipment || "—",
    product: row.product || "—",
  };
}

function hydrateFilters(data) {
  fillSelect(elements.season, uniqueValues(data, "season").sort((a, b) => b - a), "Season");
  fillSelect(elements.farmer, uniqueValues(data, "farmer_id").sort(), "Farmer");
  fillSelect(
    elements.operation,
    uniqueValues(data, "operation_normalized")
      .map((op) => ({ value: op, label: toTitle(op) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    "Operation"
  );
  fillSelect(elements.equipment, uniqueValues(data, "equipment").sort(), "Equipment");
  fillSelect(elements.product, uniqueValues(data, "product").sort(), "Product");
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
  elements.equipment.addEventListener("change", () => {
    state.filters.equipment = elements.equipment.value;
    render();
  });
  elements.product.addEventListener("change", () => {
    state.filters.product = elements.product.value;
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
      equipment: "all",
      product: "all",
      search: "",
    });
    elements.season.value = "all";
    elements.farmer.value = "all";
    elements.operation.value = "all";
    elements.equipment.value = "all";
    elements.product.value = "all";
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
    if (filters.equipment !== "all" && row.equipment !== filters.equipment) return false;
    if (filters.product !== "all" && row.product !== filters.product) return false;
    if (filters.search) {
      const term = filters.search.toLowerCase();
      const haystack = [
        row.product,
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
  if (filters.operation !== "all") active.push(toTitle(filters.operation));
  if (filters.equipment !== "all") active.push(filters.equipment);
  if (filters.product !== "all") active.push(filters.product);
  if (filters.search) active.push(`Search: “${filters.search}”`);
  const label = active.length ? active.join(" • ") : "No filters applied";
  elements.activeFilters.textContent = `${label} — ${count} records`;
}

function renderStats(rows) {
  const totalArea = sum(rows, "area_ha");
  const avgDose = averageWeighted(rows, "dose_kg_ha");
  const nutrients = ["n", "p", "k", "so4"].map((nutrient) => {
    const keyHa = `${nutrient}_kg_ha_weight`;
    const keyT = `${nutrient}_kg_t`;
    return {
      nutrient: nutrient.toUpperCase(),
      ha: average(rows, keyHa),
      tonne: average(rows, keyT),
    };
  });
  const stats = [
    { label: "Events", value: formatNumber(rows.length, 0) },
    { label: "Area (ha)", value: formatNumber(totalArea, 1) },
    { label: "Avg dose (kg/ha)", value: avgDose === null ? "—" : formatNumber(avgDose, 1) },
  ];
  nutrients.forEach((n) => {
    stats.push({
      label: `Avg ${n.nutrient} (kg/ha)`,
      value: n.ha === null ? "—" : formatNumber(n.ha, 2),
    });
    stats.push({
      label: `Avg ${n.nutrient} (kg/t)`,
      value: n.tonne === null ? "—" : formatNumber(n.tonne, 3),
    });
  });
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
    elements.pivotTable.innerHTML = `<p class="empty">No fertilisation events match these filters.</p>`;
    elements.pivotCount.textContent = "0 products";
    return;
  }
  const grouped = aggregateByProduct(rows);
  elements.pivotCount.textContent = `${grouped.length} products`;
  const table = `
    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th>Operations</th>
          <th>Equipment</th>
          <th>Events</th>
          <th>Area (ha)</th>
          <th>Avg dose (kg/ha)</th>
          <th>N (kg/t)</th>
          <th>P (kg/t)</th>
          <th>K (kg/t)</th>
          <th>SO₄ (kg/t)</th>
          <th>N (kg/ha)</th>
          <th>P (kg/ha)</th>
          <th>K (kg/ha)</th>
          <th>SO₄ (kg/ha)</th>
        </tr>
      </thead>
      <tbody>
        ${grouped
          .map(
            (row) => `
              <tr>
                <td>${row.product}</td>
                <td>${row.operations}</td>
                <td>${row.equipment}</td>
                <td>${row.count}</td>
                <td>${formatNumber(row.area, 1)}</td>
                <td>${row.avgDose === null ? "—" : formatNumber(row.avgDose, 1)}</td>
                <td>${row.nT === null ? "—" : formatNumber(row.nT, 2)}</td>
                <td>${row.pT === null ? "—" : formatNumber(row.pT, 2)}</td>
                <td>${row.kT === null ? "—" : formatNumber(row.kT, 2)}</td>
                <td>${row.so4T === null ? "—" : formatNumber(row.so4T, 2)}</td>
                <td>${row.nHa === null ? "—" : formatNumber(row.nHa, 1)}</td>
                <td>${row.pHa === null ? "—" : formatNumber(row.pHa, 1)}</td>
                <td>${row.kHa === null ? "—" : formatNumber(row.kHa, 1)}</td>
                <td>${row.so4Ha === null ? "—" : formatNumber(row.so4Ha, 1)}</td>
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
    elements.detailTable.innerHTML = `<p class="empty">Nothing to show. Broaden filters to see fertilisation events.</p>`;
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
          <th>N (kg/ha)</th>
          <th>P (kg/ha)</th>
          <th>K (kg/ha)</th>
          <th>SO₄ (kg/ha)</th>
          <th>N (kg/t)</th>
          <th>P (kg/t)</th>
          <th>K (kg/t)</th>
          <th>SO₄ (kg/t)</th>
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
                <td>${row.variety || "—"}</td>
                <td>${row.operation_display}</td>
                <td>${row.equipment}</td>
                <td>${row.product}</td>
                <td>${row.dose_kg_ha == null ? "—" : formatNumber(row.dose_kg_ha, 1)}</td>
                <td>${row.n_kg_ha_weight == null ? "—" : formatNumber(row.n_kg_ha_weight, 1)}</td>
                <td>${row.p_kg_ha_weight == null ? "—" : formatNumber(row.p_kg_ha_weight, 1)}</td>
                <td>${row.k_kg_ha_weight == null ? "—" : formatNumber(row.k_kg_ha_weight, 1)}</td>
                <td>${row.so4_kg_ha_weight == null ? "—" : formatNumber(row.so4_kg_ha_weight, 1)}</td>
                <td>${row.n_kg_t == null ? "—" : formatNumber(row.n_kg_t, 2)}</td>
                <td>${row.p_kg_t == null ? "—" : formatNumber(row.p_kg_t, 2)}</td>
                <td>${row.k_kg_t == null ? "—" : formatNumber(row.k_kg_t, 2)}</td>
                <td>${row.so4_kg_t == null ? "—" : formatNumber(row.so4_kg_t, 2)}</td>
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

function aggregateByProduct(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.product || "Unspecified";
    if (!map.has(key)) {
      map.set(key, {
        product: key,
        operations: new Set(),
        equipment: new Set(),
        count: 0,
        area: 0,
        totalDose: 0,
        doseArea: 0,
        nHa: 0,
        pHa: 0,
        kHa: 0,
        so4Ha: 0,
        nArea: 0,
        pArea: 0,
        kArea: 0,
        so4Area: 0,
        nT: 0,
        pT: 0,
        kT: 0,
        so4T: 0,
        nTArea: 0,
        pTArea: 0,
        kTArea: 0,
        so4TArea: 0,
      });
    }
    const agg = map.get(key);
    agg.count += 1;
    const area = row.area_ha || 0;
    agg.area += area;
    agg.operations.add(row.operation_display);
    agg.equipment.add(row.equipment);
    if (row.dose_kg_ha != null) {
      agg.totalDose += (row.dose_kg_ha || 0) * (area || 1);
      agg.doseArea += area || 1;
    }
    if (row.n_kg_ha_weight != null) {
      agg.nHa += (row.n_kg_ha_weight || 0) * (area || 1);
      agg.nArea += area || 1;
    }
    if (row.p_kg_ha_weight != null) {
      agg.pHa += (row.p_kg_ha_weight || 0) * (area || 1);
      agg.pArea += area || 1;
    }
    if (row.k_kg_ha_weight != null) {
      agg.kHa += (row.k_kg_ha_weight || 0) * (area || 1);
      agg.kArea += area || 1;
    }
    if (row.so4_kg_ha_weight != null) {
      agg.so4Ha += (row.so4_kg_ha_weight || 0) * (area || 1);
      agg.so4Area += area || 1;
    }
    if (row.n_kg_t != null) {
      agg.nT += (row.n_kg_t || 0) * (area || 1);
      agg.nTArea += area || 1;
    }
    if (row.p_kg_t != null) {
      agg.pT += (row.p_kg_t || 0) * (area || 1);
      agg.pTArea += area || 1;
    }
    if (row.k_kg_t != null) {
      agg.kT += (row.k_kg_t || 0) * (area || 1);
      agg.kTArea += area || 1;
    }
    if (row.so4_kg_t != null) {
      agg.so4T += (row.so4_kg_t || 0) * (area || 1);
      agg.so4TArea += area || 1;
    }
  }
  return Array.from(map.values())
    .map((agg) => ({
      ...agg,
      operations: Array.from(agg.operations).sort().join(", "),
      equipment: Array.from(agg.equipment).sort().join(", "),
      avgDose: agg.doseArea ? agg.totalDose / agg.doseArea : null,
      nHa: agg.nArea ? agg.nHa / agg.nArea : null,
      pHa: agg.pArea ? agg.pHa / agg.pArea : null,
      kHa: agg.kArea ? agg.kHa / agg.kArea : null,
      so4Ha: agg.so4Area ? agg.so4Ha / agg.so4Area : null,
      nT: agg.nTArea ? agg.nT / agg.nTArea : null,
      pT: agg.pTArea ? agg.pT / agg.pTArea : null,
      kT: agg.kTArea ? agg.kT / agg.kTArea : null,
      so4T: agg.so4TArea ? agg.so4T / agg.so4TArea : null,
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

function averageWeighted(rows, key) {
  let total = 0;
  let weight = 0;
  for (const row of rows) {
    if (row[key] != null) {
      const area = row.area_ha || 1;
      total += (row[key] || 0) * area;
      weight += area;
    }
  }
  if (!weight) return null;
  return total / weight;
}

function sumField(rows, key) {
  return rows.reduce((total, row) => total + (row[key] || 0), 0);
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
