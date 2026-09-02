// ==========================================================================
// Web Audio chimes and the confetti burst.
// ==========================================================================

class SomaAudioCelebration {
  static playSound(type = "chime") {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "chime") {
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } else if (type === "pr") {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
        osc.start();
        osc.stop(ctx.currentTime + 0.7);
      }
    } catch (e) {}
  }

  static triggerConfetti(containerEl) {
    try {
      const canvas = document.createElement("canvas");
      canvas.className = "soma-confetti-canvas";
      containerEl.appendChild(canvas);
      const ctx = canvas.getContext("2d");
      canvas.width = containerEl.clientWidth || 600;
      canvas.height = containerEl.clientHeight || 700;

      const particles = [];
      const colors = ["var(--soma-accent)", "var(--soma-warn)", "var(--soma-text)", "var(--soma-text-dim)", "#34d399", "#60a5fa"];
      for (let i = 0; i < 45; i++) {
        particles.push({
          x: canvas.width / 2,
          y: canvas.height / 2,
          vx: (Math.random() - 0.5) * 12,
          vy: (Math.random() - 0.7) * 14,
          size: Math.random() * 5 + 3,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1
        });
      }

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
    } catch (e) {}
  }
}

// ============================================================
// SECTION 4: STATE STORE & PERSISTENCE
// ============================================================

module.exports = { SomaAudioCelebration };
