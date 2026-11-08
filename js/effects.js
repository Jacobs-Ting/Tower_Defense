/* =========================================================
 * 視覺特效：粒子（數量上限控制）、曳光、浮動文字、彈坑、殘骸
 * ========================================================= */
(function (g) {
  const SD = g.SD;
  const C = SD.CONFIG;
  const R = Math.random;

  class Effects {
    constructor() { this.clear(); }
    clear() {
      this.parts = []; this.tracers = []; this.texts = []; this.decals = [];
      this.rings = []; this.wrecks = []; this.fallers = []; this.flashes = [];
    }
    _p(p) { if (this.parts.length < C.MAX_PARTICLES) this.parts.push(p); }

    smoke(x, y, n, life, col) {
      for (let i = 0; i < n; i++) this._p({ x: x + (R() - 0.5) * 6, y: y + (R() - 0.5) * 6, vx: (R() - 0.5) * 14, vy: (R() - 0.5) * 14 - 6,
        life: life * (0.6 + R() * 0.6), max: life, size: 3 + R() * 4, grow: 9, col: col || 'rgba(120,115,105,', a: 0.5, kind: 'smoke' });
    }
    fire(x, y, n) {
      for (let i = 0; i < n; i++) this._p({ x: x + (R() - 0.5) * 8, y: y + (R() - 0.5) * 8, vx: (R() - 0.5) * 10, vy: -10 - R() * 14,
        life: 0.3 + R() * 0.35, max: 0.6, size: 2 + R() * 3, grow: -2, col: R() < 0.5 ? 'rgba(255,170,60,' : 'rgba(255,110,40,', a: 0.9, kind: 'fire' });
    }
    sparks(x, y, n, col) {
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, s = 60 + R() * 140;
        this._p({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.15 + R() * 0.2, max: 0.35, size: 1.4, grow: 0, col: col || 'rgba(255,230,140,', a: 1, kind: 'spark' });
      }
    }
    tracer(x1, y1, x2, y2, color, life) { if (this.tracers.length < 220) this.tracers.push({ x1, y1, x2, y2, color, life, max: life }); }
    muzzle(x, y, ang, size) { this.flashes.push({ x, y, ang, size, life: 0.06 }); }
    text(x, y, str, color, life = 0.9, big) {
      if (this.texts.length > 40) this.texts.shift();
      this.texts.push({ x, y, str, color, life, max: life, big });
    }
    dust(x, y) { this.smoke(x, y, 3, 0.6, 'rgba(160,140,100,'); }
    flakBurst(x, y, s = 1) {
      this.rings.push({ x, y, r: 3, max: 16 * s, life: 0.3, total: 0.3, col: 'rgba(255,210,120,' });
      this.smoke(x, y, 3, 1.1, 'rgba(50,50,50,');
    }
    explosion(x, y, radius, crater) {
      this.rings.push({ x, y, r: 4, max: radius, life: 0.35, total: 0.35, col: 'rgba(255,190,90,' });
      this.fire(x, y, 8);
      this.smoke(x, y, 7, 1.6, 'rgba(110,100,85,');
      for (let i = 0; i < 6; i++) {
        const a = R() * Math.PI * 2, s = 40 + R() * 90;
        this._p({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + R() * 0.3, max: 0.7, size: 1.8, grow: 0, col: 'rgba(80,60,35,', a: 1, kind: 'debris' });
      }
      if (crater) this.crater(x, y, radius * 0.22);
    }
    crater(x, y, s) {
      this.decals.push({ x, y, s, life: 22, max: 22 });
      if (this.decals.length > 45) this.decals.shift();
    }
    wreck(e) {
      // 車輛擊毀：殘骸燃燒冒煙後逐漸消失
      this.wrecks.push({ x: e.x, y: e.y, angle: e.angle, L: e.radius * 1.9, W: e.radius * 1.2, life: 9, max: 9, emit: 0 });
      this.explosion(e.x, e.y, e.radius * 2.2, true);
    }
    infantryDown(e) {
      // 非血腥：倒地淡出
      this.fallers.push({ x: e.x, y: e.y, angle: e.angle, life: 0.8, max: 0.8, kind: 'inf' });
      this.dust(e.x, e.y);
    }
    planeDown(e) {
      this.fallers.push({ x: e.x, y: e.y, vx: e.vx * 0.7, vy: e.vy * 0.7, angle: e.angle, spin: (R() - 0.5) * 3, life: 1.8, max: 1.8, kind: 'plane' });
      this.flakBurst(e.x, e.y, 1.6);
    }

    update(dt) {
      for (const p of this.parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.size = Math.max(0.3, p.size + p.grow * dt); }
      this.parts = this.parts.filter(p => p.life > 0);
      for (const t of this.tracers) t.life -= dt; this.tracers = this.tracers.filter(t => t.life > 0);
      for (const t of this.texts) { t.life -= dt; t.y -= 22 * dt; } this.texts = this.texts.filter(t => t.life > 0);
      for (const d of this.decals) d.life -= dt; this.decals = this.decals.filter(d => d.life > 0);
      for (const r of this.rings) { r.life -= dt; r.r += (r.max - r.r) * Math.min(1, dt * 14); } this.rings = this.rings.filter(r => r.life > 0);
      for (const f of this.flashes) f.life -= dt; this.flashes = this.flashes.filter(f => f.life > 0);
      for (const w of this.wrecks) {
        w.life -= dt; w.emit -= dt;
        if (w.emit <= 0 && w.life > 1.5) { w.emit = 0.12; this.smoke(w.x, w.y, 1, 2.2, 'rgba(45,42,38,'); if (w.life > 4) this.fire(w.x, w.y, 1); }
      }
      this.wrecks = this.wrecks.filter(w => w.life > 0);
      for (const f of this.fallers) {
        f.life -= dt;
        if (f.kind === 'plane') { f.x += f.vx * dt; f.y += f.vy * dt; f.angle += f.spin * dt; if (R() < 0.6) this.smoke(f.x, f.y, 1, 1.4, 'rgba(40,40,40,'); if (f.life <= 0) this.explosion(f.x + 20, f.y + 24, 30, true); }
      }
      this.fallers = this.fallers.filter(f => f.life > 0);
    }

    drawGround(ctx) {
      for (const d of this.decals) SD.MAP.drawCrater(ctx, d.x, d.y, d.s, Math.min(1, d.life / 4));
      for (const w of this.wrecks) {
        ctx.save(); ctx.globalAlpha = Math.min(1, w.life / 2);
        ctx.translate(w.x, w.y); ctx.rotate(w.angle);
        ctx.fillStyle = '#2b2924'; ctx.fillRect(-w.L / 2, -w.W / 2, w.L, w.W);
        ctx.fillStyle = '#3c3830'; ctx.beginPath(); ctx.arc(-2, 0, w.W * 0.33, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#1c1b18'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(w.L * 0.45, w.W * 0.3); ctx.stroke();
        ctx.restore();
      }
      for (const f of this.fallers) {
        if (f.kind !== 'inf') continue;
        ctx.save(); ctx.globalAlpha = f.life / f.max; ctx.translate(f.x, f.y); ctx.rotate(f.angle + (1 - f.life / f.max) * 1.2);
        ctx.fillStyle = '#5f6656'; ctx.beginPath(); ctx.ellipse(0, 0, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4d5446'; ctx.beginPath(); ctx.arc(4, 0, 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    drawAir(ctx) {
      for (const t of this.tracers) {
        ctx.globalAlpha = Math.max(0, t.life / t.max);
        ctx.strokeStyle = t.color; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const f of this.flashes) {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang);
        ctx.fillStyle = 'rgba(255,220,120,0.95)';
        ctx.beginPath(); ctx.moveTo(0, -3 * f.size); ctx.lineTo(10 * f.size, 0); ctx.lineTo(0, 3 * f.size); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,220,0.95)'; ctx.beginPath(); ctx.arc(0, 0, 2.5 * f.size, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      for (const p of this.parts) {
        const a = Math.max(0, p.a * (p.life / p.max));
        ctx.fillStyle = p.col + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      for (const r of this.rings) {
        const a = r.life / r.total;
        ctx.strokeStyle = r.col + (a * 0.9).toFixed(3) + ')'; ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = r.col + (a * 0.35).toFixed(3) + ')'; ctx.fill();
      }
      for (const f of this.fallers) {
        if (f.kind !== 'plane') continue;
        ctx.save(); ctx.globalAlpha = Math.min(1, f.life); ctx.translate(f.x, f.y); ctx.rotate(f.angle); ctx.scale(0.6 + 0.4 * f.life / f.max, 0.6 + 0.4 * f.life / f.max);
        ctx.fillStyle = '#3a3e34'; ctx.fillRect(-14, -3, 28, 6); ctx.fillRect(-3, -20, 7, 40);
        ctx.restore();
      }
      ctx.textAlign = 'center';
      for (const t of this.texts) {
        ctx.globalAlpha = Math.min(1, t.life / t.max * 1.6);
        ctx.font = `bold ${t.big ? 16 : 12}px "Noto Sans TC", sans-serif`;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,18,12,0.85)'; ctx.strokeText(t.str, t.x, t.y);
        ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  SD.Effects = Effects;
})(typeof window !== 'undefined' ? window : globalThis);
