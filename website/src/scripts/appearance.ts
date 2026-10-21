type Appearance = 'light' | 'dark';
const key = 'shiguangjian.website.appearance';
const system = window.matchMedia('(prefers-color-scheme: dark)');
let followsSystem = true;
try { followsSystem = !['light', 'dark'].includes(localStorage.getItem(key) || ''); } catch {}

function applyAppearance(appearance: Appearance) {
  document.documentElement.dataset.appearance = appearance;
  document.documentElement.style.colorScheme = appearance;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', appearance === 'dark' ? '#101d1b' : '#f7f7ef');
  document.querySelectorAll<HTMLButtonElement>('.appearance-toggle').forEach(button => {
    const label = appearance === 'dark' ? '切换为浅色主题' : '切换为深色主题';
    button.hidden = false;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(appearance === 'dark'));
    button.title = label;
    const text = button.querySelector('.appearance-label');
    if (text) text.textContent = appearance === 'dark' ? '浅色' : '深色';
  });
}

applyAppearance(document.documentElement.dataset.appearance === 'dark' ? 'dark' : 'light');
document.querySelectorAll<HTMLButtonElement>('.appearance-toggle').forEach(button => {
  button.addEventListener('click', () => {
    const appearance = document.documentElement.dataset.appearance === 'dark' ? 'light' : 'dark';
    followsSystem = false;
    applyAppearance(appearance);
    try { localStorage.setItem(key, appearance); } catch {}
  });
});
system.addEventListener('change', event => { if (followsSystem) applyAppearance(event.matches ? 'dark' : 'light'); });
window.addEventListener('storage', event => {
  if (event.key !== key && event.key !== null) return;
  const saved = event.newValue;
  followsSystem = saved !== 'light' && saved !== 'dark';
  applyAppearance(saved === 'dark' || saved === 'light' ? saved : system.matches ? 'dark' : 'light');
});
window.addEventListener('pageshow', () => {
  let saved: string | null = null;
  try { saved = localStorage.getItem(key); } catch {}
  followsSystem = saved !== 'light' && saved !== 'dark';
  applyAppearance(saved === 'dark' || saved === 'light' ? saved : followsSystem ? system.matches ? 'dark' : 'light' : document.documentElement.dataset.appearance === 'dark' ? 'dark' : 'light');
});
