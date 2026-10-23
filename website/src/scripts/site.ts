import { createGalaxy } from "./galaxy";

const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
if ("IntersectionObserver" in window && !motion.matches) {
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          reveal.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.08, rootMargin: "0px 0px 35px 0px" },
  );
  document.querySelectorAll(".reveal").forEach((el) => reveal.observe(el));
  document.documentElement.classList.add("motion-ready");
}

const menuButton = document.querySelector<HTMLButtonElement>(".menu-toggle");
const mobileMenu = document.querySelector<HTMLElement>("#mobile-nav");
function closeMenu() {
  if (mobileMenu && menuButton) {
    mobileMenu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "展开导航");
  }
}
menuButton?.addEventListener("click", () => {
  if (!mobileMenu) return;
  const open = menuButton.getAttribute("aria-expanded") !== "true";
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "收起导航" : "展开导航");
  mobileMenu.hidden = !open;
});
mobileMenu
  ?.querySelectorAll("a")
  .forEach((a) => a.addEventListener("click", closeMenu));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});
window.matchMedia("(min-width: 651px)").addEventListener("change", (e) => {
  if (e.matches) closeMenu();
});

const moodMessages: Record<string, string> = {
  calm: '平静的日子，也有温柔的光。', happy: '把这份小小的开心，存成一颗星。',
  excited: '把这份雀跃，留给未来的自己。', loved: '被打动的这一刻，也值得好好收藏。',
  playful: '偶尔调皮一下，让日常轻盈一点。', proud: '今天的自己，值得一个小小的赞。',
  relaxed: '松一口气，按自己的节奏走。', touched: '那些柔软的瞬间，慢慢记下来。',
  sleepy: '困困的今天，也可以早点休息。', tired: '已经很努力了，允许自己慢一点。',
  sad: '低落也可以，今天先抱抱自己。', lonely: '一个人的时刻，也有一张笺陪着你。',
  angry: '把心里的不痛快，轻轻写在这里。', anxious: '先停一停，把思绪一件件放下来。',
  confused: '还没想明白也没关系，慢慢写就好。',
};
const moodDialog = document.querySelector<HTMLDialogElement>('#mood-dialog');
const moodEntry = document.querySelector<HTMLButtonElement>('#open-moods');
moodEntry?.addEventListener('click', () => moodDialog?.showModal());
document.querySelector('#close-moods')?.addEventListener('click', () => moodDialog?.close());
moodDialog?.addEventListener('click', event => {
  if (event.target !== moodDialog) return;
  const rect = moodDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) moodDialog.close();
});
document.querySelectorAll<HTMLButtonElement>('[data-choose-mood]').forEach(button => {
  button.addEventListener('click', () => {
    const mood = button.dataset.chooseMood || 'calm';
    const name = button.dataset.moodName || '平静';
    document.querySelectorAll('[data-choose-mood]').forEach(el => el.setAttribute('aria-pressed', String(el === button)));
    const image = document.querySelector<HTMLImageElement>('#selected-mood');
    const source = button.querySelector('img');
    if (image && source) { image.src = source.src; image.hidden = false; }
    const add = moodEntry?.querySelector<HTMLElement>('.mood-add');
    if (add) add.hidden = true;
    moodEntry?.classList.add('has-mood');
    moodEntry?.setAttribute('aria-label', `当前心情：${name}，点击更换`);
    const label = document.querySelector('#selected-mood-label');
    if (label) label.textContent = name;
    const message = document.querySelector('#mood-message');
    if (message) message.textContent = moodMessages[mood];
    moodDialog?.close();
  });
});
const themeMessages: Record<string, string> = {
  night: "在夜色里，和自己轻轻说话。",
  mist: "清晨、草木，和一张干净的纸。",
  sunset: "把今天的心事，寄给温柔晚霞。",
};
document.querySelectorAll<HTMLButtonElement>("[data-theme]").forEach((button) =>
  button.addEventListener("click", () => {
    document
      .querySelectorAll("[data-theme]")
      .forEach((el) => el.setAttribute("aria-pressed", String(el === button)));
    const theme = button.dataset.theme || "night";
    const showcase = document.querySelector<HTMLElement>(
      "[data-theme-preview]",
    );
    if (showcase) showcase.dataset.themePreview = theme;
    const label = document.querySelector("#theme-label");
    if (label) label.textContent = themeMessages[theme];
  }),
);

const memories = [
  ["2026.10.18", "开心", "晚霞不小心，落进了我的日常。"],
  ["2026.10.12", "平静", "在路边坐了一会儿，听风把树叶翻了一页。"],
  ["2026.10.06", "期待", "订好了去海边的车票，连周一都有了盼头。"],
  ["2026.09.28", "疲惫", "今天先好好睡一觉。明天的事，明天再说。"],
  ["2026.09.21", "开心", "妈妈寄来的橘子，有小时候的味道。"],
  ["2026.09.15", "难过", "虽然有点难，但我还是认真度过了今天。"],
];
let memoryIndex = 0;
let memoryTimer: ReturnType<typeof setTimeout>;
const controllers = [
  ...document.querySelectorAll<HTMLCanvasElement>("[data-galaxy]"),
].map((canvas) => createGalaxy(canvas));
document.querySelector("#random-memory")?.addEventListener("click", () => {
  memoryIndex = (memoryIndex + 1) % memories.length;
  const memory = memories[memoryIndex];
  const popover = document.querySelector(".memory-popover");
  popover?.classList.add("is-changing");
  clearTimeout(memoryTimer);
  memoryTimer = setTimeout(
    () => {
      const date = document.querySelector(".memory-date");
      const text = document.querySelector("#memory-text");
      if (date) {
        date.textContent = memory[0] + " ";
        const mood = document.createElement("span");
        mood.textContent = "· " + memory[1];
        date.append(mood);
      }
      if (text) text.textContent = memory[2];
      popover?.classList.remove("is-changing");
    },
    motion.matches ? 0 : 180,
  );
  controllers.forEach((galaxy) => galaxy?.revolve());
});
document
  .querySelector<HTMLButtonElement>(".rotation-toggle")
  ?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const paused = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(paused));
    button.setAttribute("aria-label", paused ? "继续星球旋转" : "暂停星球旋转");
    button.textContent = paused ? "继续旋转" : "暂停旋转";
    controllers.forEach((galaxy) => galaxy?.pause(paused));
  });
window.addEventListener("pagehide", (event) => {
  clearTimeout(memoryTimer);
  document.querySelector(".memory-popover")?.classList.remove("is-changing");
  if (!event.persisted) controllers.forEach((galaxy) => galaxy?.destroy());
});
