// Keep the site's static artwork in sync with the App's original SVG faces.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const component = await readFile(new URL('../../src/components/MoodFace.vue', import.meta.url), 'utf8');
const diary = await readFile(new URL('../../src/types/diary.ts', import.meta.url), 'utf8');
const inks = Object.fromEntries([...component.matchAll(/^  (\w+): '(#[\da-f]+)',/gm)].map(m => [m[1], m[2]]));
const colorsBlock = diary.split('export const moodColors')[1].split('}')[0];
const colors = Object.fromEntries([...colorsBlock.matchAll(/(\w+): '(#[\da-f]+)'/g)].map(m => [m[1], m[2]]));
const faces = [...component.matchAll(/<template v-(?:if|else-if)="mood === '([^']+)'">([\s\S]*?)<\/template>/g)];
if (faces.length !== 15) throw new Error('Expected all 15 App moods; update this exporter when the component structure changes.');
const out = new URL('../public/moods/', import.meta.url);
await mkdir(out, { recursive: true });
for (const [, id, content] of faces) {
  const ink = inks[id], color = colors[id];
  if (!ink || !color) throw new Error(`Missing palette for ${id}`);
  const features = content.trim().replaceAll('class="mood-face-eye"', `fill="${ink}" stroke="none"`).replaceAll('class="mood-face-mouth"', 'fill="#fff" fill-opacity=".72"').replaceAll('class="mood-face-tear"', 'fill="#fff" fill-opacity=".8" stroke-width="1.2"');
  await writeFile(new URL(`${id}.svg`, out), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="33" r="26" fill="${color}" stroke="${ink}" stroke-opacity=".24" stroke-width="1.2"/><path d="M14 25A20 20 0 0 1 34 13" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="3" stroke-linecap="round"/><g fill="${ink}" opacity=".13"><ellipse cx="16.5" cy="38" rx="4" ry="2.5"/><ellipse cx="47.5" cy="38" rx="4" ry="2.5"/></g><g fill="none" stroke="${ink}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${features}</g></svg>\n`);
}
console.log('Synced 15 mood faces from MoodFace.vue.');
