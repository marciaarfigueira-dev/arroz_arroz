const state = {
  data: [],
  selected: null,
};

const elements = {
  product: document.getElementById("product-filter"),
  productMeta: document.getElementById("product-meta"),
  barChart: document.getElementById("bar-chart"),
  categoryTable: document.getElementById("category-table"),
  categoryCount: document.getElementById("category-count"),
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
  const data = await loadData();
  state.data = data;
  state.selected = data[0]?.product_id || null;
  hydrateProducts();
  render();
  bindAbout();
}

async function loadData() {
  const res = await fetch("./data/characterisation.json");
  if (!res.ok) throw new Error("Unable to load characterisation data");
  return res.json();
}

function hydrateProducts() {
  elements.product.innerHTML = "";
  state.data.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.product_id;
    option.textContent = label(item);
    elements.product.appendChild(option);
  });
  elements.product.value = state.selected;
  elements.product.addEventListener("change", () => {
    state.selected = elements.product.value;
    render();
  });
}

function render() {
  const item = state.data.find((d) => d.product_id === state.selected);
  if (!item) return;
  elements.productMeta.textContent = item.product_name || item.product_id;
  renderBars(item.categories);
  renderTable(item.categories);
}

function renderBars(categories) {
  // chart removed; table only
}

function renderTable(categories) {
  elements.categoryCount.textContent = `${categories.length} categories`;
  if (!categories?.length) {
    elements.categoryTable.innerHTML = `<p class="empty">No categories to show.</p>`;
    return;
  }
  const rows = categories
    .map(
      (cat) => `
        <tr>
          <td>${cat.impact_category}</td>
          <td>${cat.unit || ""}</td>
          <td>${cat.total == null ? "—" : formatNumber(cat.total, 6)}</td>
        </tr>
      `
    )
    .join("");
  elements.categoryTable.innerHTML = `
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

function label(item) {
  let name = item.product_name || item.product_id;
  name = name.replace(/m2/gi, "ha");
  return name.length > 80 ? name.slice(0, 80) + "…" : name;
}

function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function bindAbout() {
  const btn = document.getElementById("about-btn");
  if (btn) {
    btn.onclick = () => (window.location.href = "./about.html");
  }
}
