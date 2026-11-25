import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.join(__dirname, "../app/lib/quiz-data.ts");
const outPath = path.join(__dirname, "../../backend/app/data/quiz_seed.json");

const src = fs.readFileSync(srcPath, "utf8");
const start = src.indexOf("const QUIZZES");
const eq = src.indexOf("=", start);
let i = src.indexOf("{", eq);
let depth = 0;
let end = -1;
for (let k = i; k < src.length; k++) {
  const c = src[k];
  if (c === "{") depth++;
  else if (c === "}") {
    depth--;
    if (depth === 0) {
      end = k;
      break;
    }
  }
}
let obj = src.slice(i, end + 1);
// Keep curly apostrophes as ASCII apostrophe; map curly doubles to singles
// so nested quotes inside "..." strings stay valid JS.
obj = obj.replace(/[‘’]/g, "'").replace(/[“”]/g, "'");
const QUIZZES = eval(`(${obj})`);
const out = {};
for (const [organId, questions] of Object.entries(QUIZZES)) {
  out[organId] = questions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    choices: q.choices,
    correctIndex: q.correctIndex,
    explain: q.explain,
  }));
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(
  "organs",
  Object.keys(out).length,
  "qs",
  Object.values(out).reduce((a, b) => a + b.length, 0),
);
