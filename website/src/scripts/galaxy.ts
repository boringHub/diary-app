/** A small projected sphere: no WebGL, external images, or framework runtime. */
export function createGalaxy(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const ctx = context;
  const interactive = canvas.dataset.galaxy === "interactive";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const colors = ["#bbd6a0", "#a6d4c0", "#f0d398", "#a8c9e1", "#d2b4d4"];
  const count = interactive ? 210 : 130;
  const stars = Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const angle = i * Math.PI * (3 - Math.sqrt(5));
    return {
      x: Math.cos(angle) * radius,
      y,
      z: Math.sin(angle) * radius,
      size: i % 19 === 0 ? 2.8 : i % 7 === 0 ? 1.5 : 0.65,
      color: colors[i % colors.length],
      phase: i * 1.37,
    };
  });
  let width = 0,
    height = 0,
    angle = 0.4,
    tilt = -0.15,
    targetAngle = 0.4;
  let frame = 0,
    previous = 0,
    visible = false,
    paused = false,
    destroyed = false;
  let pointerId: number | null = null,
    startX = 0,
    startY = 0,
    lastX = 0,
    lastY = 0,
    dragging = false;
  let glow: CanvasGradient | null = null;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = Math.min(width, height) * 0.43;
    glow = ctx.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      r * 1.3,
    );
    glow.addColorStop(0, "#9ecb8f0d");
    glow.addColorStop(0.7, "#91ba8305");
    glow.addColorStop(1, "#91ba8300");
    draw(0);
  }
  function draw(time: number) {
    ctx.clearRect(0, 0, width, height);
    if (!width || !height) return;
    const r = Math.min(width, height) * (interactive ? 0.43 : 0.4);
    const cx = width / 2,
      cy = height / 2;
    if (glow) {
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);
    }
    const cos = Math.cos(angle),
      sin = Math.sin(angle),
      ct = Math.cos(tilt),
      st = Math.sin(tilt);
    for (const star of stars) {
      const x = star.x * cos - star.z * sin,
        z0 = star.x * sin + star.z * cos;
      const y = star.y * ct - z0 * st,
        z = star.y * st + z0 * ct;
      const depth = (z + 1) / 2,
        scale = 0.84 + depth * 0.2;
      const px = cx + x * r * scale,
        py = cy + y * r * scale;
      const size = star.size * (0.65 + depth * 0.5);
      const pulse = reduce.matches
        ? 1
        : 0.86 + Math.sin(time * 0.0008 + star.phase) * 0.14;
      ctx.fillStyle = star.color;
      if (star.size > 2 && depth > 0.3) {
        ctx.globalAlpha = depth * 0.07;
        ctx.beginPath();
        ctx.arc(px, py, size * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = depth * 0.14;
        ctx.beginPath();
        ctx.arc(px, py, size * 2.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = (0.15 + depth * 0.85) * pulse;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
      if (star.size > 2 && depth > 0.7) {
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = star.color;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(px - 6, py);
        ctx.lineTo(px + 6, py);
        ctx.moveTo(px, py - 6);
        ctx.lineTo(px, py + 6);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  function loop(time: number) {
    frame = 0;
    if (destroyed || !visible || document.hidden || reduce.matches || paused) {
      previous = 0;
      return;
    }
    const delta = previous ? Math.min((time - previous) / 1000, 0.05) : 0;
    previous = time;
    if (pointerId === null) targetAngle += delta * 0.055;
    angle += (targetAngle - angle) * Math.min(delta * 6, 1);
    draw(time);
    frame = requestAnimationFrame(loop);
  }
  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
    if (destroyed) return;
    draw(0);
    if (visible && !document.hidden && !reduce.matches && !paused)
      frame = requestAnimationFrame(loop);
  }
  const visibility = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
      sync();
    },
    { rootMargin: "80px" },
  );
  visibility.observe(canvas);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  document.addEventListener("visibilitychange", sync);
  reduce.addEventListener("change", sync);
  function down(event: PointerEvent) {
    if (pointerId !== null) return;
    pointerId = event.pointerId;
    startX = lastX = event.clientX;
    startY = lastY = event.clientY;
    dragging = false;
  }
  function move(event: PointerEvent) {
    if (pointerId !== event.pointerId) return;
    if (!dragging) {
      if (Math.abs(event.clientX - startX) < 7) return;
      if (
        Math.abs(event.clientY - startY) >
        Math.abs(event.clientX - startX) * 1.5
      ) {
        pointerId = null;
        return;
      }
      dragging = true;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-dragging");
    }
    targetAngle += (event.clientX - lastX) * 0.008;
    tilt = Math.max(
      -0.8,
      Math.min(0.8, tilt + (event.clientY - lastY) * 0.004),
    );
    lastX = event.clientX;
    lastY = event.clientY;
    angle = targetAngle;
    draw(0);
  }
  function up(event: PointerEvent) {
    if (pointerId !== event.pointerId) return;
    pointerId = null;
    dragging = false;
    canvas.classList.remove("is-dragging");
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
  }
  function key(event: KeyboardEvent) {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    if (event.key === "ArrowLeft") targetAngle -= 0.2;
    if (event.key === "ArrowRight") targetAngle += 0.2;
    if (event.key === "ArrowUp") tilt = Math.max(-0.8, tilt - 0.1);
    if (event.key === "ArrowDown") tilt = Math.min(0.8, tilt + 0.1);
    if (reduce.matches || paused) angle = targetAngle;
    draw(0);
  }
  if (interactive) {
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    window.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("keydown", key);
  }
  resize();
  return {
    revolve() {
      targetAngle += 0.8;
      if (reduce.matches || paused) {
        angle = targetAngle;
        draw(0);
      }
    },
    pause(value: boolean) {
      paused = value;
      sync();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", sync);
      reduce.removeEventListener("change", sync);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      window.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("keydown", key);
    },
  };
}
