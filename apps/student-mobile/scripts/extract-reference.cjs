const fs = require("node:fs");
const path = require("node:path");
const source = "E:/Hocccc/Project/Enhance NEU RUN UI UX";
const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(source, "src/App.tsx"), "utf8");
const iconType = app.slice(
  app.indexOf("type IconName"),
  app.indexOf("\n\nconst paths"),
);
const paths = app
  .slice(app.indexOf("const paths:"), app.indexOf("\nfunction Icon"))
  .replaceAll("<path", "<Path")
  .replaceAll("<circle", "<Circle")
  .replaceAll("<rect", "<Rect");
fs.writeFileSync(
  path.join(root, "src/components/Icon.tsx"),
  `import type { ReactNode } from 'react';\nimport Svg, { Path, Circle, Rect } from 'react-native-svg';\nexport ${iconType}\n${paths}\nexport default function Icon({ name, size = 21, color = '#0b2f62' }: { name: IconName; size?: number; color?: string }) { return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">{paths[name]}</Svg>; }\n`,
);
fs.mkdirSync(path.join(root, "docs/reference"), { recursive: true });
fs.writeFileSync(
  path.join(root, "docs/reference/tokens.css"),
  fs.readFileSync(path.join(source, "src/index.css"), "utf8"),
);
const crypto = require("node:crypto");
const files = [
  "src/App.tsx",
  "src/index.css",
  "public/assets/neu-run-logo.png",
  "public/assets/neu-run-brand.jpg",
];
fs.writeFileSync(
  path.join(root, "docs/reference/manifest.json"),
  JSON.stringify(
    {
      source,
      files: files.map((file) => ({
        file,
        sha256: crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.join(source, file)))
          .digest("hex"),
      })),
    },
    null,
    2,
  ),
);
