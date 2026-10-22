import fs from "node:fs";
import * as yaml from "js-yaml";
const dir = process.argv[2];
for (const m of fs.readdirSync(dir)) {
  if (!m.endsWith("_rec")) continue;
  const y = yaml.load(fs.readFileSync(`${dir}/${m}/inference.yml`, "utf8"));
  const chars = y.PostProcess.character_dict;
  fs.writeFileSync(`${dir}/${m}/dict.txt`, chars.join("\n"));
  const s = new Set(chars);
  const kana = [..."あいうえおかきくけこアイウエオカキクケコっゃゅょーゞヶヮゐゑ"].filter((c) => !s.has(c));
  const kanji = [..."日本語漢字読書猫犬吾輩銀河鉄道夜宮沢賢治漱石檸檬蜘蛛糸羅生門嘘噂"].filter((c) => !s.has(c));
  console.log(m, chars.length, "missing kana:", kana.join(""), "missing kanji:", kanji.join(""));
}
