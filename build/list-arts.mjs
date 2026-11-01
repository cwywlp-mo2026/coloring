import { ARTWORKS } from "../js/art.js";
import { CATEGORY_MAP } from "../js/data.js";

const byCat = new Map();
for (const a of ARTWORKS) {
  if (!byCat.has(a.category)) byCat.set(a.category, []);
  byCat.get(a.category).push(a);
}

let i = 0;
for (const [cat, list] of byCat) {
  const name = CATEGORY_MAP[cat]?.name || cat;
  console.log(`\n【${name}】(${list.length} 张)`);
  for (const a of list) {
    i++;
    const regions = (a.shapes || []).filter((s) => s.t !== "l").length;
    console.log(
      `  ${String(i).padStart(2)}. ${a.id.padEnd(14)} ${a.name.padEnd(6)} 可涂色区域 ${regions} 个`
    );
  }
}
console.log(`\n合计 ${ARTWORKS.length} 张`);
