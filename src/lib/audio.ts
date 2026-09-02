export function playChime(type: "chime" | "pr" = "chime") {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (type === "chime") {
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.65);
      osc.start();
      osc.stop(ctx.currentTime + 0.65);
    }
  } catch {
    /* audio blocked */
  }
}

export function burstConfetti(container: HTMLElement) {
  try {
    const canvas = document.createElement("canvas");
    canvas.className = "pointer-events-none absolute inset-0 z-50";
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = container.clientWidth || 400;
    canvas.height = container.clientHeight || 640;
    const colors = ["#d3fd50", "#f59e0b", "#f5f7fa", "#34d399", "#60a5fa"];
    const particles = Array.from({ length: 42 }, () => ({
      x: canvas.width / 2,
      y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.7) * 14,
      size: Math.random() * 5 + 3,
      color: colors[Math.floor(Math.random() * colors.length)]!,
      alpha: 1,
    }));
    let frames = 0;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.35;
        p.alpha -= 0.02;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      frames++;
      if (frames < 50) requestAnimationFrame(render);
      else canvas.remove();
    };
    render();
  } catch {
    /* ignore */
  }
}
