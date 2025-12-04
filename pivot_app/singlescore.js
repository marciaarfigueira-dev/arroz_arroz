const state = {
  data: [],
  selectedProductId: null,
  selectedCategory: "Total",
};

const elements = {
  product: document.getElementById("product-filter"),
  category: document.getElementById("category-filter"),
  functionalUnit: document.getElementById("functional-unit"),
  barChart: document.getElementById("bar-chart"),
  barLegend: document.getElementById("bar-legend"),
  impactTable: document.getElementById("impact-table"),
  contextChart: document.getElementById("context-chart"),
  contextCount: document.getElementById("context-count"),
};

const palette = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#06b6d4",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f97316",
  "#10b981",
  "#0ea5e9",
  "#8b5cf6",
  "#e11d48",
  "#14b8a6",
  "#94a3b8",
  "#475569",
];

init();

async function init() {
  const dataset = await loadData();
  state.data = dataset;
  state.selectedProductId = dataset[0]?.product_id || null;
  hydrateProductSelect(dataset);
  render();
}

async function loadData() {
  const res = await fetch(`./data/singlescore.json?ts=${Date.now()}`);
  if (!res.ok) throw new Error("Unable to load singlescore data");
  return res.json();
}

function hydrateProductSelect(data) {
  elements.product.innerHTML = "";
  data.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.product_id;
    option.textContent = productLabel(item);
    elements.product.appendChild(option);
  });
  elements.product.value = state.selectedProductId;
  elements.product.addEventListener("change", () => {
    state.selectedProductId = elements.product.value;
    render();
  });
}

function hydrateCategorySelect(categories) {
  /* category selector removed */
}

function render() {
  const product = state.data.find((item) => item.product_id === state.selectedProductId);
  if (!product) return;
  const categories = product.categories.filter((c) => c.impact_category !== "Total");
  elements.functionalUnit.textContent = `${productLabel(product)} • ${product.functional_unit || ""}`;
  renderTotalValue(categories);
  renderBars(categories);
  renderImpactTable(categories);
  renderContextBars();
  bindAbout();
}

function renderTotalValue(categories) {
  const sum = categories.reduce((acc, c) => acc + (c.total || 0), 0);
  const unit = categories[0]?.unit || "µPt";
  elements.barLegend.innerHTML = `<div class="chip muted">Total single score (sum): ${formatNumber(sum, 2)} ${unit}</div>`;
}

function renderBars(categories) {
  if (!categories.length) {
    elements.barChart.innerHTML = `<p class="empty">No categories for this product.</p>`;
    return;
  }
  const totalSum = categories.reduce((acc, c) => acc + (c.total || 0), 0) || 1;
  const bars = categories
    .map((cat, idx) => {
      const color = palette[idx % palette.length];
      const pct = ((cat.total || 0) / totalSum) * 100;
      const pctLabel = formatPercent(pct);
      const pctWidth = Math.max(0, Math.min(100, pct));
      return `
        <div class="bar-row">
          <div class="bar-label">
            <div>${cat.impact_category}</div>
            <small>${pctLabel} contribution</small>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pctWidth}%; background:${color}"></div>
            <span class="bar-value">${pctLabel}</span>
          </div>
        </div>
      `;
    })
    .join("");
  elements.barChart.innerHTML = bars;
  elements.barLegend.innerHTML = "";
}

function renderImpactTable(categories) {
  const sum = categories.reduce((acc, c) => acc + (c.total || 0), 0);
  const rows = [
    `
      <tr class="highlight">
        <td><strong>TOTAL (Sum)</strong></td>
        <td>${categories[0]?.unit || ""}</td>
        <td>${formatNumber(sum, 3)}</td>
      </tr>
    `,
    ...categories.map(
      (cat) => `
        <tr>
          <td>${cat.impact_category}</td>
          <td>${cat.unit || ""}</td>
          <td>${formatNumber(cat.total || 0, 3)}</td>
        </tr>
      `
    ),
  ].join("");
  elements.impactTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Impact category</th>
          <th>Unit</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderContextBars() {
  if (!elements.contextChart) return;
  const totals = state.data.map((item) => {
    const sum = (item.categories || []).reduce((acc, c) => {
      if (c.impact_category === "Total") return acc;
      return acc + (c.total || 0);
    }, 0);
    return { id: item.product_id, label: productLabel(item), total: sum };
  });
  const maxVal = Math.max(...totals.map((t) => t.total || 0), 1);
  const currentId = state.selectedProductId;
  elements.contextCount.textContent = `${totals.length} inputs`;
  elements.contextChart.innerHTML = totals
    .sort((a, b) => b.total - a.total)
    .map((t) => {
      const color = t.id === currentId ? "#f97316" : "#334155";
      return `
        <div class="bar-row compact">
          <div class="bar-label">${t.label}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${((t.total || 0) / maxVal) * 100}%; background:${color}"></div>
            <span class="bar-value">${formatNumber(t.total || 0, 2)}</span>
          </div>
        </div>
      `;
    })
    .join("");
}

function bindAbout() {
  const btn = document.getElementById("about-btn");
  if (btn) {
    btn.onclick = () => (window.location.href = "./about.html");
  }
}

function renderContributors() {
  // contributors removed
}

function renderContributorBars(contributors, category) {
  if (!contributors.length) {
    elements.contribChart.innerHTML = `<p class="empty">No contributors to show.</p>`;
    return;
  }
  const top = contributors
    .filter((c) => c.score > 0)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 15);
  if (!top.length) {
    elements.contribChart.innerHTML = `<p class="empty">All contributor scores are zero.</p>`;
    return;
  }
  const maxScore = Math.max(...top.map((c) => c.score || 0), 1);
  const bars = top
    .map(
      (c) => `
        <div class="bar-row compact">
          <div class="bar-label">${c.name}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${((c.score || 0) / maxScore) * 100}%"></div>
            <span class="bar-value">${formatNumber(c.score || 0, 3)} ${category.unit || ""}</span>
          </div>
        </div>
      `
    )
    .join("");
  elements.contribChart.innerHTML = bars;
}

function formatNumber(value, digits = 2) {
  if (value == null || !isFinite(value)) return "—";
  return value.toExponential(2);
}

function formatPercent(value) {
  if (value == null || !isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function productLabel(item) {
  if (!item) return "";
  let name = item.product_name || item.functional_unit || item.product_id || "Product";
  name = name.replace(/m2/gi, "ha");
  return name.length > 80 ? name.slice(0, 80) + "…" : name;
}

function contributorShare(contributor, total) {
  if (contributor.share != null) return contributor.share;
  if (!total) return 0;
  return (contributor.score || 0) / total;
}

function aggregateContributors(contributors, total) {
  const buckets = new Map();
  for (const c of contributors) {
    const name = normalizeContributorName(c.name || "");
    if (!buckets.has(name)) {
      buckets.set(name, { name, score: 0 });
    }
    buckets.get(name).score += c.score || 0;
  }
  return Array.from(buckets.values()).map((c) => ({
    ...c,
    share: total ? (c.score || 0) / total : null,
  }));
}

function normalizeContributorName(name) {
  const lowered = name.toLowerCase();
  if (lowered.includes("herbicide")) {
    return "Herbicide";
  }
  return name;
}
