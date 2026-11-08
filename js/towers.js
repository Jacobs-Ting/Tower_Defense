/* =========================================================
 * 盟軍防禦武器：自動索敵（最前方）、射擊節奏、升級、繪製
 * ========================================================= */
(function (g) {
  const SD = g.SD;

  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  class Tower {
    constructor(world, key, pad) {
      this.world = world;
      this.id = world.nextId++;
      this.key = key;
      this.def = SD.TOWERS[key];
      this.table = SD.DAMAGE_TABLE[key];
      this.pad = pad;
      this.x = pad.x; this.y = pad.y;
      this.level = 0;
      this.invested = this.def.cost;
      this.maxHp = this.stats.hp;
      this.hp = this.maxHp;
      this.disabled = false;
      this.angle = -Math.PI / 2 + (Math.random() - 0.5);
      this.cooldown = 0.2;
      this.ammo = this.stats.mag || Infinity;
      this.reloadT = 0;
      this.kills = 0;
      this.suppressT = 0; this.suppressFactor = 1;
      this.recoil = 0;
      this.flash = 0;
      this.target = null;
      this.damageDealt = 0;
    }

    get stats() { return this.def.levels[this.level]; }
    get nextStats() { return this.def.levels[this.level + 1] || null; }
    get upgradeCost() { const n = this.nextStats; return n ? n.upCost : null; }
    get sellValue() { return Math.floor(this.invested * SD.CONFIG.SELL_RATIO); }
    get repairCost() { return this.hp >= this.maxHp ? 0 : Math.ceil((1 - this.hp / this.maxHp) * this.def.cost * SD.CONFIG.REPAIR_RATIO); }

    upgrade() {
      const n = this.nextStats; if (!n) return false;
      this.invested += n.upCost;
      this.level++;
      const gain = this.stats.hp - this.maxHp;
      this.maxHp = this.stats.hp; this.hp = Math.min(this.maxHp, this.hp + gain);
      if (this.stats.mag) this.ammo = this.stats.mag;
      return true;
    }

    /** 判斷敵軍是否為合法目標 */
    canTarget(e) {
      if (!e.alive || e.dead) return false;
      if (e.isAir && !this.def.targetsAir) return false;           // 一般地面武器不得攻擊飛機
      if (!e.isAir && this.def.groundTargets && !this.def.groundTargets.includes(e.armor)) return false;
      const dx = e.x - this.x, dy = e.y - this.y, d2 = dx * dx + dy * dy;
      const R = this.stats.range;
      if (d2 > R * R) return false;
      if (!e.isAir && this.def.minRange && d2 < this.def.minRange * this.def.minRange) return false;
      return true;
    }

    /** 索敵：先找有效目標（倍率≥0.5）中最前方者；沒有才攻擊其他目標 */
    findTarget() {
      const W = this.world, R = this.stats.range;
      let best = null, bestScore = -Infinity, fallback = null, fbScore = -Infinity;
      for (const e of W.enemies) {
        if (!this.canTarget(e)) continue;
        if (e.isAir) {
          const score = 100000 - Math.hypot(e.x - this.x, e.y - this.y); // 防空：優先最近敵機
          if (score > bestScore) { bestScore = score; best = e; }
          continue;
        }
        const eff = this.table[e.armor];
        const score = e.progress;
        if (eff >= 0.5) { if (score > bestScore) { bestScore = score; best = e; } }
        else if (score > fbScore) { fbScore = score; fallback = e; }
      }
      return best || fallback;
    }

    update(dt) {
      this.recoil = Math.max(0, this.recoil - dt * 3);
      this.flash = Math.max(0, this.flash - dt);
      if (this.suppressT > 0) this.suppressT -= dt;
      if (this.disabled) { this.target = null; return; }
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) this.ammo = this.stats.mag;
      }
      this.cooldown -= dt;
      // 重新索敵（目標失效或離開射程時）
      if (!this.target || !this.canTarget(this.target)) this.target = this.findTarget();
      else if (this.target && !this.target.isAir && this.def.targetsAir) {
        // 防空砲：有敵機時立刻轉向敵機
        const t = this.findTarget(); if (t && t.isAir) this.target = t;
      }
      const t = this.target;
      if (!t) return;
      const aimAt = this.def.fire === 'ballistic' ? t.predict(this.def.flightTime) : t;
      const want = Math.atan2(aimAt.y - this.y, aimAt.x - this.x);
      const da = angDiff(want, this.angle);
      const turn = this.def.turnSpeed * dt;
      this.angle += Math.max(-turn, Math.min(turn, da));
      if (this.reloadT > 0 || this.cooldown > 0) return;
      if (Math.abs(angDiff(want, this.angle)) > 0.2) return;
      this.fire(t);
      const supp = this.suppressT > 0 ? this.suppressFactor : 1;
      this.cooldown = this.stats.interval * supp;
      if (this.stats.mag) {
        this.ammo--;
        if (this.ammo <= 0) this.reloadT = this.stats.reload * supp;
      }
    }

    fire(t) {
      const W = this.world, s = this.stats;
      const mx = this.x + Math.cos(this.angle) * this.muzzle, my = this.y + Math.sin(this.angle) * this.muzzle;
      this.flash = 0.06; this.recoil = 1;
      switch (this.def.fire) {
        case 'hitscan': {
          // 機槍：簡化命中判定（即時命中）+ 曳光彈視覺
          const jx = (Math.random() - 0.5) * 6, jy = (Math.random() - 0.5) * 6;
          W.effects.tracer(mx, my, t.x + jx, t.y + jy, '#ffe68a', 0.07);
          W.effects.muzzle(mx, my, this.angle, 0.7);
          W.applyDamage(t, s.damage, this, false);
          W.sfx('mg');
          break;
        }
        case 'shell':
          W.projectiles.push(new SD.Shell(W, this, t, mx, my, this.def.shellSpeed, s.damage, 'ap'));
          W.effects.muzzle(mx, my, this.angle, 1.6);
          W.effects.smoke(mx, my, 6, 1.2, 'rgba(200,195,180,');
          W.sfx(this.key === 'at17' ? 'at17' : 'at');
          break;
        case 'flak':
          W.projectiles.push(new SD.Shell(W, this, t, mx, my, this.def.shellSpeed, s.damage, 'flak'));
          W.effects.muzzle(mx, my, this.angle, 1.0);
          W.sfx('flak');
          break;
        case 'ballistic': {
          const p = t.predict(this.def.flightTime);
          const sc = s.scatter;
          const tx = p.x + (Math.random() - 0.5) * 2 * sc, ty = p.y + (Math.random() - 0.5) * 2 * sc;
          W.projectiles.push(new SD.Ballistic(W, this, mx, my, tx, ty, this.def.flightTime, s.damage, s.radius, this.key === 'howitzer' ? 90 : 60));
          W.effects.muzzle(mx, my, this.angle, this.key === 'howitzer' ? 2 : 0.9);
          W.effects.smoke(mx, my, 5, 1.3, 'rgba(210,205,190,');
          W.sfx(this.key === 'howitzer' ? 'howitzer' : 'mortar');
          break;
        }
      }
    }

    get muzzle() { return { mg: 15, mortar: 8, at57: 22, at17: 27, bofors: 20, howitzer: 26 }[this.key]; }

    /* ---------------- 繪製 ---------------- */
    draw(ctx, selected, time) {
      const x = this.x, y = this.y, s = this.def;
      ctx.save(); ctx.translate(x, y);
      // 掩體底座
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(3, 4, 24, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7c6a48'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
      // 沙包環（Lv3 機槍有雙層）
      const rings = this.key === 'mg' && this.level >= 2 ? [21, 16] : [21];
      for (const R of rings) {
        const n = Math.round(R * 0.55);
        for (let i = 0; i < n; i++) {
          const a = i / n * Math.PI * 2;
          if (this.key !== 'mortar' && this.key !== 'howitzer' && Math.abs(angDiff(a, -Math.PI / 2)) < 0.01) continue;
          ctx.fillStyle = (i % 2) ? '#bba774' : '#ad9965';
          ctx.beginPath(); ctx.ellipse(Math.cos(a) * R, Math.sin(a) * R, 5.4, 3.6, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(70,55,30,0.55)'; ctx.lineWidth = 0.8; ctx.stroke();
        }
      }
      ctx.rotate(this.angle);
      const rc = -this.recoil * (this.key === 'mg' ? 1 : 4);
      switch (this.key) {
        case 'mg': drawMG(ctx, rc); break;
        case 'mortar': drawMortar(ctx, rc); break;
        case 'at57': drawATGun(ctx, rc, 20, 2.6, '#55603f', 9); break;
        case 'at17': drawATGun(ctx, rc, 26, 3.2, '#4f5a3c', 11, true); break;
        case 'bofors': drawBofors(ctx, rc); break;
        case 'howitzer': drawHowitzer(ctx, rc); break;
      }
      ctx.restore();
      // 等級星章
      for (let i = 0; i <= this.level; i++) {
        ctx.fillStyle = '#f2d16b';
        SD.MAP.star(ctx, x - 8 + i * 8, y + 20, 3.6, 1.6);
      }
      // 耐久條
      if (this.hp < this.maxHp) {
        const r = this.hp / this.maxHp;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 15, y - 30, 30, 5);
        ctx.fillStyle = r > 0.5 ? '#9ac45a' : r > 0.25 ? '#e8b04a' : '#d9442f';
        ctx.fillRect(x - 14, y - 29, 28 * r, 3);
      }
      if (this.disabled) {
        ctx.fillStyle = 'rgba(30,20,10,0.55)'; ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff9a6a'; ctx.font = 'bold 11px "Noto Sans TC", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('失能·待修復', x, y + 4);
      } else if (this.reloadT > 0) {
        ctx.strokeStyle = 'rgba(255,230,150,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, 25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - this.reloadT / this.stats.reload)); ctx.stroke();
      }
      if (this.suppressT > 0 && !this.disabled) {
        ctx.fillStyle = '#ffb070'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('⚠', x + 18, y - 16);
      }
      if (selected) {
        ctx.strokeStyle = '#f5e7b0'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(x, y, 27, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  /* ---- 武器外形 ---- */
  function crew(ctx, x, y) {
    ctx.fillStyle = '#6b6a3e'; ctx.beginPath(); ctx.ellipse(x, y, 3.6, 4.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#585a34'; ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  function drawMG(ctx, rc) {
    crew(ctx, -9, 0); crew(ctx, -6, 8);
    ctx.strokeStyle = '#2c2c26'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4, -5); ctx.moveTo(0, 0); ctx.lineTo(-4, 5); ctx.stroke(); // 三腳架
    ctx.fillStyle = '#2d2d28'; ctx.fillRect(-4 + rc, -2.2, 9, 4.4);
    ctx.fillStyle = '#3a3a33'; ctx.fillRect(4 + rc, -1.5, 11, 3); // 散熱套筒
    ctx.fillStyle = '#6a5a3a'; ctx.fillRect(-3, 3, 5, 3); // 彈藥箱
  }
  function drawMortar(ctx, rc) {
    crew(ctx, -9, -6); crew(ctx, -9, 7);
    ctx.fillStyle = '#3c4430'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); // 座鈑
    ctx.fillStyle = '#272b20'; ctx.beginPath(); ctx.arc(2 + rc * 0.3, 0, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(2 + rc * 0.3, 0, 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2c2c26'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(8, -4); ctx.moveTo(2, 0); ctx.lineTo(8, 4); ctx.stroke();
    ctx.fillStyle = '#6a5a3a'; ctx.fillRect(-3, 10, 6, 4); ctx.fillRect(4, 10, 6, 4);
  }
  function drawATGun(ctx, rc, len, w, col, shield, big) {
    // 開腳架尾
    ctx.strokeStyle = '#3b3f2c'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-16, -7); ctx.moveTo(-2, 0); ctx.lineTo(-16, 7); ctx.stroke();
    crew(ctx, -12, -11); crew(ctx, -12, 11);
    ctx.fillStyle = '#222'; ctx.fillRect(-4, -shield - 2, 6, 3); ctx.fillRect(-4, shield - 1, 6, 3); // 輪
    ctx.fillStyle = '#2f3326'; ctx.fillRect(-2 + rc, -w / 2, len + 2, w); // 砲管
    if (big) ctx.fillRect(len - 2 + rc, -w / 2 - 1.3, 5, w + 2.6); // 砲口制退器
    ctx.fillStyle = col; // 防盾
    ctx.beginPath(); ctx.moveTo(2, -shield); ctx.lineTo(5, -shield + 2); ctx.lineTo(5, shield - 2); ctx.lineTo(2, shield); ctx.lineTo(0, shield); ctx.lineTo(0, -shield); ctx.fill();
    ctx.fillStyle = MAP_SHADE(col); ctx.fillRect(-5, -4, 8, 8);
  }
  function drawBofors(ctx, rc) {
    // 四腳支架
    ctx.strokeStyle = '#3a3f2c'; ctx.lineWidth = 2.4;
    ctx.beginPath(); for (const a of [0.8, 2.35, 3.9, 5.5]) { ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17); } ctx.stroke();
    ctx.fillStyle = '#56603f'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1; ctx.stroke();
    crew(ctx, -4, -10); crew(ctx, -4, 10); crew(ctx, -11, 0);
    ctx.fillStyle = '#2b2f24'; ctx.fillRect(-3 + rc, -2, 22, 4);
    ctx.fillStyle = '#3a3e30'; ctx.fillRect(14 + rc, -2.8, 6, 5.6); // 防火帽
    ctx.fillStyle = '#c2a54a'; ctx.fillRect(-6, -3, 4, 6); // 彈夾
  }
  function drawHowitzer(ctx, rc) {
    ctx.strokeStyle = '#3a3f2c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(-20, -9); ctx.moveTo(-2, 0); ctx.lineTo(-20, 9); ctx.stroke();
    crew(ctx, -14, -13); crew(ctx, -14, 13); crew(ctx, -18, 0);
    ctx.fillStyle = '#1e1e1a'; ctx.fillRect(-5, -13, 9, 4); ctx.fillRect(-5, 9, 9, 4);
    ctx.fillStyle = '#4d5838'; ctx.fillRect(-6, -7, 14, 14);
    ctx.fillStyle = '#2c3024'; ctx.fillRect(0 + rc, -3.2, 26, 6.4);
    ctx.fillStyle = '#383c2e'; ctx.fillRect(-8 + rc, -4.5, 10, 9);
  }
  function MAP_SHADE(c) { return SD.MAP.shade(c, -15); }

  /** UI 用的武器圖示 */
  SD.drawTowerIcon = function (ctx, key, x, y, scale) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    ctx.fillStyle = '#7c6a48'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 11; i++) {
      const a = i / 11 * Math.PI * 2;
      ctx.fillStyle = (i % 2) ? '#bba774' : '#ad9965';
      ctx.beginPath(); ctx.ellipse(Math.cos(a) * 19, Math.sin(a) * 19, 5, 3.4, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.rotate(-Math.PI / 4);
    ({ mg: () => drawMG(ctx, 0), mortar: () => drawMortar(ctx, 0), at57: () => drawATGun(ctx, 0, 20, 2.6, '#55603f', 9),
       at17: () => drawATGun(ctx, 0, 26, 3.2, '#4f5a3c', 11, true), bofors: () => drawBofors(ctx, 0), howitzer: () => drawHowitzer(ctx, 0) })[key]();
    ctx.restore();
  };

  SD.Tower = Tower;
  SD.angDiff = angDiff;
})(typeof window !== 'undefined' ? window : globalThis);
