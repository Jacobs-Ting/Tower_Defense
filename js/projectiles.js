/* =========================================================
 * 砲彈系統
 * - Shell：直射砲彈（反戰車／防空），追蹤目標並以「步長 ≥ 剩餘距離」判定命中，
 *          避免高速砲彈穿越目標造成碰撞失效。
 * - Ballistic：迫擊砲／榴彈砲拋物線砲彈，落地範圍爆炸。
 * ========================================================= */
(function (g) {
  const SD = g.SD;

  class Shell {
    constructor(world, tower, target, x, y, speed, damage, kind) {
      this.world = world; this.tower = tower; this.target = target;
      this.x = x; this.y = y; this.speed = speed; this.damage = damage; this.kind = kind;
      this.tx = target.x; this.ty = target.y;
      this.alive = true; this.trail = [];
    }
    update(dt) {
      const t = this.target;
      if (t.alive && !t.dead) { this.tx = t.x; this.ty = t.y; }
      const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
      const step = this.speed * dt;
      this.trail.push(this.x, this.y); if (this.trail.length > 8) this.trail.splice(0, 2);
      if (step >= d) {
        this.x = this.tx; this.y = this.ty; this.alive = false;
        const W = this.world;
        if (t.alive && !t.dead) W.applyDamage(t, this.damage, this.tower, false);
        else if (this.kind === 'flak') W.effects.flakBurst(this.x, this.y, 0.6);
        else W.effects.dust(this.x, this.y);
        return;
      }
      this.x += dx / d * step; this.y += dy / d * step;
    }
    draw(ctx) {
      ctx.strokeStyle = this.kind === 'flak' ? 'rgba(255,200,90,0.85)' : 'rgba(255,240,190,0.9)';
      ctx.lineWidth = this.kind === 'flak' ? 2 : 2.6;
      ctx.beginPath(); ctx.moveTo(this.trail[0] ?? this.x, this.trail[1] ?? this.y); ctx.lineTo(this.x, this.y); ctx.stroke();
      ctx.fillStyle = '#fff4c8'; ctx.beginPath(); ctx.arc(this.x, this.y, this.kind === 'flak' ? 1.8 : 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  class Ballistic {
    constructor(world, tower, x, y, tx, ty, flight, damage, radius, apex) {
      this.world = world; this.tower = tower;
      this.sx = x; this.sy = y; this.tx = tx; this.ty = ty;
      this.flight = flight; this.t = 0; this.damage = damage; this.radius = radius; this.apex = apex;
      this.alive = true; this.x = x; this.y = y; this.h = 0;
    }
    update(dt) {
      this.t += dt;
      const k = Math.min(1, this.t / this.flight);
      this.x = this.sx + (this.tx - this.sx) * k;
      this.y = this.sy + (this.ty - this.sy) * k;
      this.h = Math.sin(k * Math.PI) * this.apex;
      if (k >= 1) { this.alive = false; this.world.explode(this.tx, this.ty, this.radius, this.damage, this.tower); }
    }
    draw(ctx) {
      // 地面陰影 + 拋物線砲彈
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(this.x, this.y, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
      const s = 2.6 + this.h / 40;
      ctx.fillStyle = '#2d2f26'; ctx.beginPath(); ctx.arc(this.x, this.y - this.h, s, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,200,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
  }

  SD.Shell = Shell;
  SD.Ballistic = Ballistic;
})(typeof window !== 'undefined' ? window : globalThis);
