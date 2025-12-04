const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "pivot_app", "data");
const singlescoreDir = path.join(__dirname, "..", "singlescore");

function loadJson(name) {
  const full = path.join(dataDir, name);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function loadConversion() {
  const csvPath = path.join(singlescoreDir, "singlescore - singlescore_conversion.csv");
  const raw = fs.readFileSync(csvPath, "utf8").trim();
  const lines = raw.split(/\r?\n/);
  const headers = splitCsvLine(lines.shift());
  const idxImpact = headers.findIndex((h) => h.toLowerCase().includes("impact category"));
  const idxFk = headers.findIndex((h) => h.includes("Fₖ"));
  const map = {};
  lines.forEach((line) => {
    if (!line.trim()) return;
    const cols = splitCsvLine(line);
    const cat = normalizeCat(cols[idxImpact]?.trim());
    const fk = Number((cols[idxFk] || "").replace(/,/g, ""));
    if (!cat || !Number.isFinite(fk)) return;
    map[cat] = fk;
  });
  return map;
}

function splitCsvLine(line) {
  const re = /\"([^\"]*)\"|([^,]+)/g;
  const out = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    out.push(m[1] !== undefined ? m[1] : m[2]);
  }
  return out;
}

function normalizeCat(cat) {
  if (!cat) return cat;
  return cat.replace(/\s*&\s*/g, " and ");
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function computeProduct(rec, fkMap) {
  const idBase = rec.product_id.replace("_chara", "");
  const product_id = `singlescore_${idBase}_1`;
  const categories = [];
  let totalSum = 0;
  rec.categories.forEach((c) => {
    const catKey = normalizeCat(c.impact_category);
    const fk = fkMap[catKey] || fkMap[c.impact_category] || 0;
    const val = (c.total || 0) * fk;
    totalSum += val;
    categories.push({
      impact_category: c.impact_category,
      unit: "Pt",
      total: val,
      contributors: [],
    });
  });
  categories.unshift({
    impact_category: "Total",
    unit: "Pt",
    total: totalSum,
    contributors: [],
  });
  return {
    product_id,
    product_name: rec.product_name,
    functional_unit: rec.product_name,
    categories,
  };
}

function sumProducts(name, prods) {
  const catMap = {};
  prods.forEach((p) => {
    p.categories.forEach((c) => {
      if (c.impact_category === "Total") return;
      catMap[c.impact_category] = (catMap[c.impact_category] || 0) + (c.total || 0);
    });
  });
  const categories = Object.entries(catMap).map(([impact_category, total]) => ({
    impact_category,
    unit: "Pt",
    total,
    contributors: [],
  }));
  const totalSum = categories.reduce((s, c) => s + (c.total || 0), 0);
  categories.unshift({ impact_category: "Total", unit: "Pt", total: totalSum, contributors: [] });
  return {
    product_id: name,
    product_name: name,
    functional_unit: name,
    categories,
  };
}

function main() {
  const chara = loadJson("characterisation.json");
  const fkMap = loadConversion();
  const singles = chara.map((rec) => computeProduct(rec, fkMap));

  const lookup = Object.fromEntries(singles.map((p) => [p.product_id, p]));
  const aggHerb = sumProducts("Herbicide", [lookup["singlescore_2_1"], lookup["singlescore_3_1"]].filter(Boolean));
  const aggInsect = sumProducts("Insecticide", [lookup["singlescore_4_1"], lookup["singlescore_5_1"]].filter(Boolean));
  const aggFung = sumProducts("Fungicide", [lookup["singlescore_6_1"], lookup["singlescore_7_1"]].filter(Boolean));

  // keep all except individual herbicide/insecticide/fungicide, use aggregates instead
  const skipIds = new Set(["singlescore_2_1", "singlescore_3_1", "singlescore_4_1", "singlescore_5_1", "singlescore_6_1", "singlescore_7_1"]);
  const filteredSingles = singles.filter((p) => !skipIds.has(p.product_id));

  const outputList = [...filteredSingles, aggHerb, aggInsect, aggFung];

  ensureDir(dataDir);
  ensureDir(singlescoreDir);
  // write combined
  fs.writeFileSync(path.join(dataDir, "singlescore.json"), JSON.stringify(outputList, null, 2));
  // write individual files
  filteredSingles.forEach((p) => {
    const idBase = p.product_id.replace("singlescore_", "").replace("_1", "");
    const fileName = `singlescore_${idBase}.json`;
    fs.writeFileSync(path.join(singlescoreDir, fileName), JSON.stringify(p, null, 2));
  });
  console.log(`Wrote ${outputList.length} singlescore entries (including aggregates).`);
}

main();
