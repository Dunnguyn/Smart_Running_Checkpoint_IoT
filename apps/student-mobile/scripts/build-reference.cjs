const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { execFileSync } = require("node:child_process");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const reference = "E:/Hocccc/Project/Enhance NEU RUN UI UX";
const out = path.join(root, "test-results/reference");
fs.mkdirSync(path.join(out, "assets"), { recursive: true });
let source = fs.readFileSync(path.join(reference, "src/App.tsx"), "utf8");
// Export contains missing type-member separators. Repair only parser-identified
// semicolons in an ephemeral copy; do not alter the design or original files.
const repairs = [];
for (let pass = 0; pass < 10; pass++) {
  const parsed = ts.createSourceFile(
    "App.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  if (!parsed.parseDiagnostics.length) break;
  const diagnostics = parsed.parseDiagnostics.filter(
    (d) => d.code === 1005 && String(d.messageText).includes("';'"),
  );
  if (diagnostics.length !== parsed.parseDiagnostics.length)
    throw new Error(
      JSON.stringify(parsed.parseDiagnostics.map((d) => d.messageText)),
    );
  for (const diagnostic of [...diagnostics].sort((a, b) => b.start - a.start)) {
    repairs.push({ offset: diagnostic.start, message: diagnostic.messageText });
    source =
      source.slice(0, diagnostic.start) + "; " + source.slice(diagnostic.start);
  }
}
source +=
  '\nimport {createRoot} from "react-dom/client"; createRoot(document.getElementById("root")).render(<App/>);';
esbuild.buildSync({
  stdin: { contents: source, loader: "tsx", resolveDir: root },
  bundle: true,
  outfile: path.join(out, "app.js"),
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const css = fs.readFileSync(path.join(reference, "src/index.css"), "utf8");
fs.writeFileSync(path.join(out, "input.css"), css);
const tailwindRoot = path.dirname(
  require.resolve("@tailwindcss/cli/package.json"),
);
execFileSync(
  process.execPath,
  [
    path.join(tailwindRoot, "dist/index.mjs"),
    "-i",
    path.join(out, "input.css"),
    "-o",
    path.join(out, "style.css"),
  ],
  { cwd: root, windowsHide: true, stdio: "pipe" },
);
fs.writeFileSync(
  path.join(out, "index.html"),
  '<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>',
);
for (const asset of ["neu-run-logo.png", "neu-run-brand.jpg"])
  fs.copyFileSync(
    path.join(reference, "public/assets", asset),
    path.join(out, "assets", asset),
  );
fs.writeFileSync(
  path.join(out, "parser-repairs.json"),
  JSON.stringify(repairs, null, 2),
);
console.log(
  `Reference prepared with ${repairs.length} type-separator repairs; original unchanged.`,
);
