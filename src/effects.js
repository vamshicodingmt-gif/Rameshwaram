// Canvas 2D particle / effects renderer.
// Draws directly over the video feed (mirrored horizontally).

export class EffectsRenderer {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.video = video;
    this.particles = [];
    this.lightnings = [];
    this.shockwaves = [];
    this.stars = [];
    this.time = 0;
    this.shake = 0;
    this.initStars();
  }

  setSize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.initStars();
  }

  initStars() {
    const w = this.canvas.width, h = this.canvas.height;
    this.stars = [];
    const count = Math.floor((w * h) / 4500);
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.6 + 0.2,
        a: Math.random() * 0.8 + 0.2,
        tw: Math.random() * Math.PI * 2,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
      });
    }
  }

  spawnParticle(x, y, color, opts = {}) {
    const {
      count = 1,
      speed = 3,
      life = 60,
      size = 3,
      gravity = null, // {x,y} for Blue implosion
      outward = false,
    } = opts;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Math.random() * speed + 0.4;
      this.particles.push({
        x, y,
        vx: outward ? Math.cos(ang) * sp : (Math.random() - 0.5) * sp,
        vy: outward ? Math.sin(ang) * sp : (Math.random() - 0.5) * sp,
        life, maxLife: life,
        size: Math.random() * size + 1,
        color,
        gravity,
      });
    }
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }

  spawnLightning(x1, y1, x2, y2, color = '#ff3b3b') {
    const segs = [];
    const steps = 14;
    let ox = x1, oy = y1;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t + (Math.random() - 0.5) * 24;
      const py = y1 + (y2 - y1) * t + (Math.random() - 0.5) * 24;
      segs.push({ x1: ox, y1: oy, x2: px, y2: py });
      ox = px; oy = py;
    }
    this.lightnings.push({ segs, life: 12, maxLife: 12, color });
  }

  spawnShockwave(x, y, color = '#ff3b3b', maxR = 260) {
    this.shockwaves.push({ x, y, r: 10, maxR, life: 40, maxLife: 40, color });
  }

  triggerShake(amount = 12) {
    this.shake = Math.max(this.shake, amount);
  }

  drawBlueOrb(x, y, strength = 1) {
    const ctx = this.ctx;
    const r = 55 + Math.sin(this.time * 0.18) * 6;
    // Outer aura
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r * 2.2);
    grad.addColorStop(0, 'rgba(180,240,255,1)');
    grad.addColorStop(0.2, 'rgba(41,211,255,0.85)');
    grad.addColorStop(0.5, 'rgba(41,211,255,0.3)');
    grad.addColorStop(1, 'rgba(0,40,80,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Implosion swirl
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.time * 0.12);
    for (let i = 0; i < 6; i++) {
      ctx.rotate((Math.PI * 2) / 6);
      ctx.strokeStyle = `rgba(150,230,255,${0.55 + Math.random() * 0.25})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.9, 0.4, Math.PI - 0.4);
      ctx.stroke();
    }
    ctx.restore();

    // Core
    const core = ctx.createRadialGradient(x, y, 0, x, y, 18);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.4, '#b8f0ff');
    core.addColorStop(1, 'rgba(41,211,255,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();

    // Distortion ring
    ctx.strokeStyle = 'rgba(80,220,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.4 + Math.sin(this.time * 0.3) * 6, 0, Math.PI * 2);
    ctx.stroke();

    // Inward sucking particles
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = r * (1.2 + Math.random() * 1.5);
      const px = x + Math.cos(ang) * dist;
      const py = y + Math.sin(ang) * dist;
      this.particles.push({
        x: px, y: py,
        vx: (x - px) / 12,
        vy: (y - py) / 12,
        life: 30, maxLife: 30,
        size: Math.random() * 2.5 + 1,
        color: '#7fe6ff',
      });
    }
  }

  drawRedOrb(x, y, strength = 1) {
    const ctx = this.ctx;
    const r = 48 + Math.sin(this.time * 0.22) * 5;
    const grad = ctx.createRadialGradient(x, y, 2, x, y, r * 2.4);
    grad.addColorStop(0, 'rgba(255,240,220,1)');
    grad.addColorStop(0.15, 'rgba(255,80,80,0.95)');
    grad.addColorStop(0.5, 'rgba(255,30,30,0.35)');
    grad.addColorStop(1, 'rgba(80,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();

    // Radiating lines
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.time * 0.06);
    ctx.strokeStyle = 'rgba(255,140,100,0.8)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      ctx.rotate((Math.PI * 2) / 10);
      ctx.beginPath();
      ctx.moveTo(r * 0.7, 0);
      ctx.lineTo(r * 1.5 + Math.random() * 10, 0);
      ctx.stroke();
    }
    ctx.restore();

    const core = ctx.createRadialGradient(x, y, 0, x, y, 22);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.3, '#ffb38a');
    core.addColorStop(1, 'rgba(255,60,60,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fill();

    // Lens flare
    ctx.fillStyle = 'rgba(255,220,180,0.25)';
    ctx.beginPath();
    ctx.ellipse(x - r, y - r * 0.6, r * 0.8, r * 0.25, -0.6, 0, Math.PI * 2);
    ctx.fill();

    // Outward particles
    for (let i = 0; i < 3; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Math.random() * 2.5 + 1.5;
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 35, maxLife: 35,
        size: Math.random() * 3 + 1,
        color: Math.random() > 0.5 ? '#ffb060' : '#ff5a5a',
      });
    }

    // Occasional lightning
    if (Math.random() < 0.08) {
      const ang = Math.random() * Math.PI * 2;
      const ex = x + Math.cos(ang) * r * 2;
      const ey = y + Math.sin(ang) * r * 2;
      this.spawnLightning(x, y, ex, ey, '#ff9060');
    }
  }

  drawPurpleBeam(x, y, power = 1) {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    // Shake screen
    this.triggerShake(14);

    // Singularity core
    const grad = ctx.createRadialGradient(x, y, 2, x, y, 120);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.2, 'rgba(220,160,255,0.95)');
    grad.addColorStop(0.5, 'rgba(138,43,226,0.7)');
    grad.addColorStop(1, 'rgba(30,0,50,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, 120, 0, Math.PI * 2);
    ctx.fill();

    // Beam across screen (horizontal)
    const beamW = 180 + Math.sin(this.time * 0.6) * 40;
    const beamGrad = ctx.createLinearGradient(0, y - beamW / 2, 0, y + beamW / 2);
    beamGrad.addColorStop(0, 'rgba(138,43,226,0)');
    beamGrad.addColorStop(0.3, 'rgba(200,120,255,0.6)');
    beamGrad.addColorStop(0.5, 'rgba(255,255,255,0.95)');
    beamGrad.addColorStop(0.7, 'rgba(200,120,255,0.6)');
    beamGrad.addColorStop(1, 'rgba(138,43,226,0)');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(0, y - beamW / 2, w, beamW);

    // Secondary jagged beam
    ctx.strokeStyle = 'rgba(230,180,255,0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let i = 0; i <= 20; i++) {
      const px = (w * i) / 20;
      const py = y + (Math.random() - 0.5) * beamW * 0.5;
      ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Outward burst particles
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = Math.random() * 8 + 2;
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 50, maxLife: 50,
        size: Math.random() * 5 + 2,
        color: Math.random() > 0.5 ? '#d896ff' : '#8a2be2',
      });
    }
  }

  drawDomainBackground(maskCanvas) {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;

    // Deep black
    ctx.fillStyle = '#000000';
    ctx.fillRect(-60, -60, w + 120, h + 120);

    // Nebula radial gradients
    const nebs = [
      { x: w * 0.2, y: h * 0.3, c: 'rgba(80,20,140,0.35)', r: w * 0.5 },
      { x: w * 0.8, y: h * 0.7, c: 'rgba(20,0,70,0.4)', r: w * 0.6 },
      { x: w * 0.5, y: h * 0.5, c: 'rgba(138,43,226,0.15)', r: w * 0.7 },
    ];
    for (const n of nebs) {
      const g = ctx.createRadialGradient(n.x, n.y, 10, n.x, n.y, n.r);
      g.addColorStop(0, n.c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Warp lines
    ctx.strokeStyle = 'rgba(160,100,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const y = (h / 12) * i + Math.sin(this.time * 0.02 + i) * 20;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y - 40, w * 0.6, y + 40, w, y);
      ctx.stroke();
    }

    // Twinkling stars
    for (const s of this.stars) {
      s.x += s.vx; s.y += s.vy; s.tw += 0.05;
      if (s.x < 0) s.x += w; if (s.x > w) s.x -= w;
      if (s.y < 0) s.y += h; if (s.y > h) s.y -= h;
      const a = s.a * (0.6 + Math.sin(s.tw) * 0.4);
      ctx.fillStyle = `rgba(230,210,255,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // User cutout from mask (if available) drawn centered
    if (maskCanvas) {
      // The mask has white for person, black elsewhere; the video is already processed.
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawDomainAura(x, y) {
    const ctx = this.ctx;
    // Dark purple/black aura around the seal hand
    for (let i = 0; i < 3; i++) {
      const r = 80 + i * 30 + Math.sin(this.time * 0.1 + i) * 8;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, `rgba(60,0,100,${0.4 - i * 0.1})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Occasional black-purple sparks
    if (Math.random() < 0.3) {
      const ang = Math.random() * Math.PI * 2;
      const d = 60 + Math.random() * 60;
      this.spawnLightning(x, y, x + Math.cos(ang) * d, y + Math.sin(ang) * d, '#5a1e9e');
    }
    // Pull particles toward hand
    for (let i = 0; i < 2; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = 150 + Math.random() * 100;
      const px = x + Math.cos(ang) * d;
      const py = y + Math.sin(ang) * d;
      this.particles.push({
        x: px, y: py,
        vx: (x - px) / 20,
        vy: (y - py) / 20,
        life: 40, maxLife: 40,
        size: Math.random() * 2 + 0.8,
        color: Math.random() > 0.5 ? '#b077ff' : '#2a0552',
      });
    }
  }

  updateAndDrawParticles() {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (p.gravity) {
        p.vx += (p.gravity.x - p.x) * 0.002;
        p.vy += (p.gravity.y - p.y) * 0.002;
      }
      p.x += p.vx; p.y += p.vy;
      p.life--;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      const a = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  updateAndDrawLightnings() {
    const ctx = this.ctx;
    for (let i = this.lightnings.length - 1; i >= 0; i--) {
      const L = this.lightnings[i];
      L.life--;
      if (L.life <= 0) { this.lightnings.splice(i, 1); continue; }
      ctx.strokeStyle = L.color;
      ctx.lineWidth = 2 + (L.life / L.maxLife) * 2;
      ctx.globalAlpha = L.life / L.maxLife;
      ctx.shadowColor = L.color;
      ctx.shadowBlur = 12;
      for (const s of L.segs) {
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  updateAndDrawShockwaves() {
    const ctx = this.ctx;
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.r += (s.maxR - s.r) * 0.08;
      s.life--;
      if (s.life <= 0) { this.shockwaves.splice(i, 1); continue; }
      const a = s.life / s.maxLife;
      ctx.strokeStyle = s.color;
      ctx.globalAlpha = a * 0.8;
      ctx.lineWidth = 4 * a + 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  beginFrame() {
    this.time++;
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0.1) {
      const sx = (Math.random() - 0.5) * this.shake;
      const sy = (Math.random() - 0.5) * this.shake;
      ctx.translate(sx, sy);
      this.shake *= 0.85;
    } else {
      this.shake = 0;
    }
    // Clear with transparent (video shows through) or black depending on domain handled outside.
    ctx.clearRect(-40, -40, this.canvas.width + 80, this.canvas.height + 80);
  }

  endFrame() {
    this.ctx.restore();
  }
}
