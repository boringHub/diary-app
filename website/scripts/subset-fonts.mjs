import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
async function content(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) =>
        entry.isDirectory()
          ? content(join(dir, entry.name))
          : /\.(astro|ts)$/.test(entry.name)
            ? readFile(join(dir, entry.name), "utf8")
            : "",
      ),
    )
  ).join("");
}
// Mood names are imported from the App rather than duplicated in the site.
const source = (await content(join(root, "src"))) +
  (await readFile(join(root, "../src/types/diary.ts"), "utf8"));
const chinese = [
  ...new Set(source.match(/[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/g)),
].join("");
const latin =
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") +
  "©·×↑↗→✦✧✳◡‿⌢ᴗ–";
const families = [
  {
    name: "DM Sans",
    query: "DM+Sans:wght@400..600",
    text: latin,
    license: "dmsans",
  },
  {
    name: "Noto Sans SC",
    query: "Noto+Sans+SC:wght@400..600",
    text: chinese + latin,
    license: "notosanssc",
  },
  {
    name: "Noto Serif SC",
    query: "Noto+Serif+SC:wght@500",
    text: chinese + latin,
    license: "notoserifsc",
  },
];
await mkdir(join(root, "public/fonts"), { recursive: true });
await mkdir(join(root, "src/assets/fonts"), { recursive: true });
const output = [
  "/* Self-hosted, page-specific Google Fonts subsets. Run npm run fonts after copy changes. */",
];
for (const family of families) {
  const response = await fetch(
    `https://fonts.googleapis.com/css2?family=${family.query}&display=swap&text=${encodeURIComponent(family.text)}`,
    {
      signal: AbortSignal.timeout(30000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
    },
  );
  if (!response.ok)
    throw new Error(`Font CSS ${family.name}: ${response.status}`);
  let css = await response.text();
  const urls = [
    ...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1])),
  ];
  for (let i = 0; i < urls.length; i++) {
    const file = `${family.license}-${i}.woff2`;
    const fontResponse = await fetch(urls[i], {
      signal: AbortSignal.timeout(30000),
    });
    if (!fontResponse.ok) throw new Error(`Font file: ${fontResponse.status}`);
    const data = Buffer.from(await fontResponse.arrayBuffer());
    // Some user agents receive TTF; the browser identifies the real format from the header.
    const format =
      data.subarray(0, 4).toString() === "wOF2"
        ? "woff2"
        : data.subarray(0, 4).toString() === "wOFF"
          ? "woff"
          : "truetype";
    await writeFile(join(root, "src/assets/fonts", file), data);
    css = css
      .replaceAll(
        `url(${urls[i]}) format('woff2')`,
        `url('../assets/fonts/${file}') format('${format}')`,
      )
      .replaceAll(
        `url(${urls[i]}) format('truetype')`,
        `url('../assets/fonts/${file}') format('${format}')`,
      );
    console.log(
      `${family.name}: ${file}, ${Math.round(data.length / 1024)} KB`,
    );
  }
  output.push(css);
  const license = await fetch(
    `https://raw.githubusercontent.com/google/fonts/main/ofl/${family.license}/OFL.txt`,
    { signal: AbortSignal.timeout(30000) },
  );
  if (!license.ok) throw new Error(`Font license: ${license.status}`);
  await writeFile(
    join(root, "public/fonts", `OFL-${family.license}.txt`),
    await license.text(),
  );
}
await writeFile(join(root, "src/styles/fonts.css"), output.join("\n"));
console.log("Self-hosted font subsets and licenses ready.");
