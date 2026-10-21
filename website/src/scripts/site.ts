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
  happy: "把这份小小的开心，存成一颗星。",
  calm: "平静的日子，也有温柔的光。",
  sad: "难过也可以，今天先抱抱自己。",
  tired: "已经很努力了，允许自己慢一点。",
  excited: "把这份雀跃，留给未来的自己。",
};
document.querySelectorAll<HTMLButtonElement>("[data-mood]").forEach((button) =>
  button.addEventListener("click", () => {
    document
      .querySelectorAll("[data-mood]")
      .forEach((el) => el.setAttribute("aria-pressed", String(el === button)));
    const message = document.querySelector("#mood-message");
    if (message)
      message.textContent = moodMessages[button.dataset.mood || "happy"];
  }),
);
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
