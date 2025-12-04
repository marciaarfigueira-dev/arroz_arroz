const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "pivot_app", "data");

function loadJson(name) {
  const full = path.join(dataDir, name);
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  let s = String(v).trim().replace(/\s+/g, "");
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/,/g, "");
  } else if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function splitDmu(dmu) {
  const [farmer, season] = (dmu || "").split("_");
  return { farmer_id: farmer || dmu || "—", season: season || "—" };
}

function sumCategories(recs, ids) {
  const out = {};
  ids.forEach((id) => {
    const rec = recs.find((r) => r.product_id === id);
    if (!rec) return;
    rec.categories.forEach((c) => {
      out[c.impact_category] = (out[c.impact_category] || 0) + (Number(c.total) || 0);
    });
  });
  return out;
}

function buildFactors(chara) {
  return {
    cropProt: {
      herbicide: sumCategories(chara, ["2_chara", "3_chara"]),
      insecticide: sumCategories(chara, ["4_chara", "5_chara"]),
      fungicide: sumCategories(chara, ["6_chara", "7_chara"]),
    },
    seed: sumCategories(chara, ["1_chara"]),
    fert: {
      N: sumCategories(chara, ["8_chara"]),
      P: sumCategories(chara, ["9_chara"]),
      K: sumCategories(chara, ["10_chara"]),
    },
    machines: {
      disk_harrow: sumCategories(chara, ["11_chara"]),
      laser_leveler: sumCategories(chara, ["12_chara"]),
      centrifugal_spreader: sumCategories(chara, ["13_chara"]),
      rotary_tiller: sumCategories(chara, ["14_chara"]),
      sprayer: sumCategories(chara, ["15_chara"]),
      combine_harvester: sumCategories(chara, ["16_chara"]),
      seeder: sumCategories(chara, ["17_chara"]),
    },
    water: sumCategories(chara, ["18_chara"]),
  };
}

function addCats(target, sourceKey, eff, amount) {
  Object.entries(eff || {}).forEach(([cat, val]) => {
    if (val == null) return;
    target.inputs[sourceKey].categories[cat] = (target.inputs[sourceKey].categories[cat] || 0) + amount * val;
  });
  const totalAdd = Object.values(eff || {}).reduce((s, v) => s + (v || 0), 0) * amount;
  target.inputs[sourceKey].total += totalAdd;
}

function main() {
  const ops = loadJson("operations.json");
  const sow = loadJson("sowing.json");
  const fert = loadJson("fertilisation.json");
  const machines = loadJson("machines.json");
  const water = loadJson("water.json");
  const ch4 = loadJson("ch4.json");
  const n2o = loadJson("n2o.json");
  const chara = loadJson("characterisation.json");

  const factors = buildFactors(chara);

  const map = new Map();
  const ensure = (dmu) => {
    if (!map.has(dmu)) {
      const { farmer_id, season } = splitDmu(dmu);
      map.set(dmu, {
        dmu_id: dmu,
        farmer_id,
        season,
        area: 0,
        tonnes: 0,
        inputs: {
          crop_protection: { total: 0, categories: {} },
          sowing: { total: 0, categories: {} },
          fertilisation: { total: 0, categories: {} },
          machines: { total: 0, categories: {} },
          water: { total: 0, categories: {} },
          methane: { total: 0, categories: {} },
          n2o: { total: 0, categories: {} },
        },
      });
    }
    return map.get(dmu);
  };

  const computeTonnes = (row, area) => {
    if (row.area_per_tonne && row.area_per_tonne > 0) return area / row.area_per_tonne;
    const prod = toNum(row.productivity) || toNum(row.productivity_weighted);
    if (prod && prod > 0) return area * prod;
    return null;
  };

  // Fertilisation
  fert.forEach((r) => {
    const dmu = r.dmu_id || r.DMU_ID || "";
    if (!dmu) return;
    const area = toNum(r.covered_area) || toNum(r.area_TOTAL) || toNum(r.area_ha) || 0;
    const tonnes = computeTonnes(r, area) || 0;
    const obj = ensure(dmu);
    obj.area += area;
    obj.tonnes += tonnes;
    const addN = toNum(r.n_kg_ha_weight);
    const addP = toNum(r.p_kg_ha_weight);
    const addK = toNum(r.k_kg_ha_weight);
    if (addN != null) addCats(obj, "fertilisation", factors.fert.N, addN * area);
    if (addP != null) addCats(obj, "fertilisation", factors.fert.P, addP * area);
    if (addK != null) addCats(obj, "fertilisation", factors.fert.K, addK * area);
  });

  // Crop protection
  ops.forEach((r) => {
    const dmu = r.dmu_id || r.DMU_ID || "";
    if (!dmu) return;
    const op = (r.operation || "").toLowerCase();
    const type = op.includes("herbicide")
      ? "herbicide"
      : op.includes("fungicide")
      ? "fungicide"
      : op.includes("insecticide") || op.includes("pesticide")
      ? "insecticide"
      : null;
    if (!type) return;
    const area = toNum(r.covered_area) || toNum(r.area_ha) || 0;
    const tonnes = computeTonnes(r, area) || 0;
    const apply = toNum(r.dose_kg_ha) != null ? toNum(r.dose_kg_ha) * area : toNum(r.dose_kg_per_t) != null && tonnes ? toNum(r.dose_kg_per_t) * tonnes : null;
    if (apply == null) return;
    const obj = ensure(dmu);
    obj.area += area;
    obj.tonnes += tonnes;
    const eff = factors.cropProt[type] || {};
    addCats(obj, "crop_protection", eff, apply);
  });

  // Sowing (seeds)
  sow.forEach((r) => {
    const dmu = r.dmu_id || r.DMU_ID || "";
    if (!dmu) return;
    const area = toNum(r.covered_area) || toNum(r.area_ha) || 0;
    const tonnes = computeTonnes(r, area) || 0;
    const apply = toNum(r.dose_kg_ha) != null ? toNum(r.dose_kg_ha) * area : toNum(r.dose_kg_per_t) != null && tonnes ? toNum(r.dose_kg_per_t) * tonnes : null;
    if (apply == null) return;
    const obj = ensure(dmu);
    obj.area += area;
    obj.tonnes += tonnes;
    addCats(obj, "sowing", factors.seed, apply);
  });

  // Machines
  machines.forEach((r) => {
    const dmu = r.dmu_id || r.DMU_ID || "";
    if (!dmu) return;
    const eq = (r.equipment || "").toLowerCase();
    const eff = factors.machines[eq];
    if (!eff) return;
    const areaHa = toNum(r.repetitions) || toNum(r.total_area_worked) || toNum(r.area_ha) || 0;
    const tonnes = computeTonnes(r, areaHa) || 0;
    const obj = ensure(dmu);
    obj.area += areaHa;
    obj.tonnes += tonnes;
    addCats(obj, "machines", eff, areaHa);
  });

  // Water
  water.forEach((r) => {
    const dmu = r.DMU_ID || r.dmu_id || "";
    if (!dmu) return;
    const perHa = toNum(r["Water m3/ha"]);
    const perT = toNum(r["Water M3/t"]);
    const area = toNum(r["SUM of area_ha"]) || 0;
    const tonnes = toNum(r["Productivity (t/ha)"]) && area ? toNum(r["Productivity (t/ha)"]) * area : null;
    const obj = ensure(dmu);
    if (area) obj.area += area;
    if (tonnes) obj.tonnes += tonnes;
    if (perHa != null && area) addCats(obj, "water", factors.water, perHa * area);
    else if (perT != null && tonnes) addCats(obj, "water", factors.water, perT * tonnes);
  });

  // Methane (characterisation: kg CO2e/ha)
  ch4.forEach((r) => {
    const dmu = r.dmu_id || r.DMU_ID || "";
    if (!dmu) return;
    const area = toNum(r["SUM of area_ha"]) || 0;
    const valHa = toNum(r["C02eq(ch4)_ha"]);
    if (area && valHa != null) {
      const obj = ensure(dmu);
      obj.area += area;
      addCats(obj, "methane", { "Climate change": valHa }, area);
    }
  });

  // N2O (characterisation: kg CO2e/ha)
  n2o.forEach((r) => {
    const dmu = r.dmu_id || r.DMU_ID || "";
    if (!dmu) return;
    const area = toNum(r.area_TOTAL) || 0;
    const perHa =
      (toNum(r["CO2 eq (direct emissions)"]) || 0) +
      (toNum(r["CO2 eq (indirect emissions VOL)"]) || 0) +
      (toNum(r["CO2 eq (indirect emissions VLEACH)"]) || 0) +
      (toNum(r["CO2 from urea"]) || 0);
    if (area && perHa != null) {
      const obj = ensure(dmu);
      obj.area += area;
      addCats(obj, "n2o", { "Climate change": perHa }, area);
    }
  });

  const result = Array.from(map.values()).map((r) => {
    const perHaCats = {};
    const perTCats = {};
    const perHaCatSources = {};
    const perTCatSources = {};
    const area = r.area || 0;
    const tonnes = r.tonnes || 0;
    Object.entries(r.inputs).forEach(([src, payload]) => {
      const cats = payload.categories || {};
      Object.entries(cats).forEach(([cat, val]) => {
        const haVal = area ? val / area : null;
        const tVal = tonnes ? val / tonnes : null;
        if (haVal != null) {
          perHaCats[cat] = (perHaCats[cat] || 0) + haVal;
          if (!perHaCatSources[cat]) perHaCatSources[cat] = {};
          perHaCatSources[cat][src] = (perHaCatSources[cat][src] || 0) + haVal;
        }
        if (tVal != null) {
          perTCats[cat] = (perTCats[cat] || 0) + tVal;
          if (!perTCatSources[cat]) perTCatSources[cat] = {};
          perTCatSources[cat][src] = (perTCatSources[cat][src] || 0) + tVal;
        }
      });
    });
    const perHaInputs = {};
    const perTInputs = {};
    Object.entries(r.inputs).forEach(([src, payload]) => {
      perHaInputs[src] = area ? payload.total / area : null;
      perTInputs[src] = tonnes ? payload.total / tonnes : null;
    });
    return {
      dmu_id: r.dmu_id,
      farmer_id: r.farmer_id,
      season: r.season,
      area,
      tonnes,
      perHaInputs,
      perTInputs,
      perHaCats,
      perTCats,
      perHaCatSources,
      perTCatSources,
      totalHa: area ? sumValues(r.inputs) / area : null,
      totalT: tonnes ? sumValues(r.inputs) / tonnes : null,
    };
  });

  fs.writeFileSync(path.join(dataDir, "lca_chara_inputs.json"), JSON.stringify(result, null, 2));
  console.log(`Exported ${result.length} rows to data/lca_chara_inputs.json`);
}

function sumValues(inputs) {
  return Object.values(inputs || {}).reduce((s, payload) => s + (payload.total || 0), 0);
}

main();
