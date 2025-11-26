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
  contribTable: document.getElementById("contrib-table"),
  contribCount: document.getElementById("contrib-count"),
  contribChart: document.getElementById("contrib-chart"),
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
  const res = await fetch("./data/singlescore.json");
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
    state.selectedCategory = "Total";
    render();
  });
}

function hydrateCategorySelect(categories) {
  elements.category.innerHTML = "";
  categories.forEach((cat) => {
    const option = document.createElement("option");
    option.value = cat.impact_category;
    option.textContent = cat.impact_category;
    elements.category.appendChild(option);
  });
  elements.category.value = state.selectedCategory;
  elements.category.addEventListener("change", () => {
    state.selectedCategory = elements.category.value;
    renderContributors();
  });
}

function render() {
  const product = state.data.find((item) => item.product_id === state.selectedProductId);
  if (!product) return;
  const categories = product.categories;
  if (!categories.find((c) => c.impact_category === state.selectedCategory)) {
    state.selectedCategory = categories[0]?.impact_category || "Total";
  }
  hydrateCategorySelect(categories);
  elements.functionalUnit.textContent = `${productLabel(product)} • ${product.functional_unit || ""}`;
  renderBars(categories);
  renderImpactTable(categories);
  renderContributors();
}

function renderBars(categories) {
  if (!categories.length) {
    elements.barChart.innerHTML = `<p class="empty">No categories for this product.</p>`;
    elements.barLegend.innerHTML = "";
    return;
  }
  const colorMap = new Map();
  const legendItems = new Map();
  let colorIndex = 0;

  function colorFor(name) {
    if (!colorMap.has(name)) {
      const color = palette[colorIndex % palette.length];
      colorMap.set(name, color);
      colorIndex += 1;
    }
    return colorMap.get(name);
  }

  const bars = categories
    .map((cat) => {
      const contributors = aggregateContributors(cat.contributors || [], cat.total);
      const sorted = contributors.sort((a, b) => (b.score || 0) - (a.score || 0));
      const top = sorted.slice(0, 10);
      const remainderShare =
        sorted.slice(10).reduce((sum, c) => sum + contributorShare(c, cat.total), 0) || 0;
      const segments = top.map((c) => {
        const share = contributorShare(c, cat.total);
        const color = colorFor(c.name);
        legendItems.set(c.name, color);
        return { name: c.name, share, color };
      });
      if (remainderShare > 0.001) {
        segments.push({ name: "Other", share: remainderShare, color: "#4b5563" });
        legendItems.set("Other", "#4b5563");
      }
      const fills = segments
        .map(
          (seg) => `
            <div class="stack-segment" style="width:${seg.share * 100}%; background:${seg.color}">
              <span class="stack-label">
                ${seg.share * 100 >= 3 ? formatNumber(seg.share * 100, 1) + "%" : ""}
              </span>
            </div>
          `
        )
        .join("");
      return `
        <div class="bar-row">
          <div class="bar-label">
            <div>${cat.impact_category}</div>
            <small>${formatNumber(cat.total || 0, 2)} ${cat.unit || ""}</small>
          </div>
          <div class="stack-bar-track">
            ${fills}
          </div>
        </div>
      `;
    })
    .join("");
  elements.barChart.innerHTML = bars;

  const legend = Array.from(legendItems.entries())
    .map(
      ([name, color]) => `
        <div class="legend-item">
          <span class="legend-swatch" style="background:${color}"></span>
          <span>${name}</span>
        </div>
      `
    )
    .join("");
  elements.barLegend.innerHTML = legend;
}

function renderImpactTable(categories) {
  const rows = categories
    .map(
      (cat) => `
        <tr>
          <td>${cat.impact_category}</td>
          <td>${cat.unit || ""}</td>
          <td>${formatNumber(cat.total || 0, 3)}</td>
        </tr>
      `
    )
    .join("");
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

function renderContributors() {
  const product = state.data.find((item) => item.product_id === state.selectedProductId);
  if (!product) return;
  const category = product.categories.find((c) => c.impact_category === state.selectedCategory);
  if (!category) {
    elements.contribTable.innerHTML = `<p class="empty">No contributors for this category.</p>`;
    elements.contribCount.textContent = "";
    elements.contribChart.innerHTML = `<p class="empty">No contributors for this category.</p>`;
    return;
  }
  const contributors = aggregateContributors(category.contributors || [], category.total).filter(
    (c) => c.score !== 0
  );
  renderContributorBars(contributors, category);
  elements.contribCount.textContent = `${contributors.length} items`;
  const rows = contributors
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .map(
      (c) => `
        <tr>
          <td>${c.name}</td>
          <td>${formatNumber(c.score || 0, 3)} ${category.unit || ""}</td>
          <td>${c.share == null ? "—" : formatNumber(c.share * 100, 2) + "%"}</td>
        </tr>
      `
    )
    .join("");
  elements.contribTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Contributor</th>
          <th>Score</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
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
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function productLabel(item) {
  if (!item) return "";
  const fu = item.functional_unit || "";
  const firstPart = fu.split(",")[0].trim();
  if (firstPart) return firstPart;
  return item.product_id || "Product";
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
