/* =========================================================
 * 敵軍：地面單位沿 Waypoints 前進；Ju 87 沿獨立空中航線飛行
 * ========================================================= */
(function (g) {
  const SD = g.SD;
  const C = SD.CONFIG;
  const MAP = SD.MAP;

  class Enemy {
    constructor(world, type, opts = {}) {
      const d = SD.ENEMIES[type];
      this.world = world;
      this.id = world.nextId++;
      this.type = type;
      this.def = d;
      this.maxHp = Math.round(d.hp * (opts.hpMul || 1));
      this.hp = this.maxHp;
      this.speed = d.speed;
      this.armor = d.armor;
      this.reward = d.reward;
      this.damageToBase = d.damageToBase;
      this.isAir = d.isAir;
      this.radius = d.radius;
      this.alive = true;       // 尚在場上
      this.dead = false;       // 是否被擊毀（獎勵只結算一次）
      this.dist = -20;         // 沿道路已走距離
      this.lane = (Math.random() * 2 - 1) * (d.lane || 0);
      this.hitFlash = 0;
      this.textCd = 0;
      this.walk = Math.random() * 10;
      this.tread = 0;
      this.turret = 0;
      this.suppressCd = d.suppress ? 2 + Math.random() * 2 : 0;
      this.x = 0; this.y = 0; this.angle = 0;
      if (this.isAir) {
        // 空中航線：入口 → 目標點 → 持續直線飛出地圖
        this.target = opts.target;           // {x,y,kind:'hq'|'tower', tower}
        this.x = opts.entry.x; this.y = opts.entry.y;
        const dx = this.target.x - this.x, dy = this.target.y - this.y, l = Math.hypot(dx, dy);
        this.vx = dx / l * this.speed; this.vy = dy / l * this.speed;
        this.angle = Math.atan2(dy, dx);
        this.bombed = false;
        this.falling = 0;
      } else {
        this.updatePos();
        this.turret = this.angle;
      }
    }

    updatePos() {
      const p = MAP.pointAt(this.dist);
      this.x = p.x + p.nx * this.lane;
      this.y = p.y + p.ny * this.lane;
      // 平滑轉向
      let da = p.angle - this.angle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.angle += da * 0.18;
    }

    /** 預測 t 秒後位置（迫擊砲／榴彈砲前置量） */
    predict(t) {
      if (this.isAir) return { x: this.x + this.vx * t, y: this.y + this.vy * t };
      const p = MAP.pointAt(Math.min(MAP.length, this.dist + this.speed * t));
      return { x: p.x + p.nx * this.lane, y: p.y + p.ny * this.lane };
    }

    /** 已行進進度（索敵「最前方」依據） */
    get progress() { return this.isAir ? 0 : this.dist; }

    update(dt) {
      if (!this.alive) return;
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.textCd = Math.max(0, this.textCd - dt);
      const W = this.world;
      if (this.isAir) {
        this.x += this.vx * dt; this.y += this.vy * dt;
        if (!this.bombed) {
          const d = Math.hypot(this.target.x - this.x, this.target.y - this.y);
          if (d < 12) { this.bombed = true; W.airStrike(this); }
        }
        // 投彈後飛離地圖即消失（不再造成任何影響）
        if (this.bombed && (this.x < -120 || this.x > C.WIDTH + 120 || this.y < -120 || this.y > C.HEIGHT + 120)) this.alive = false;
        // 引擎尾煙（受損時）
        if (this.hp < this.maxHp * 0.5 && Math.random() < 0.4) W.effects.smoke(this.x - this.vx * 0.12, this.y - this.vy * 0.12, 4, 0.8, 'rgba(60,60,60,');
        return;
      }
      this.dist += this.speed * dt;
      this.walk += dt * this.speed * 0.25;
      this.tread += this.speed * dt;
      this.updatePos();
      // 砲塔朝向：指向最近的盟軍陣地（純視覺）
      if (this.def.category === 'vehicle' && this.type !== 'halftrack') {
        let ta = this.angle, best = 220;
        for (const t of W.towers) { const d = Math.hypot(t.x - this.x, t.y - this.y); if (d < best) { best = d; ta = Math.atan2(t.y - this.y, t.x - this.x); } }
        let da = ta - this.turret;
        while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
        this.turret += Math.max(-1.5 * dt, Math.min(1.5 * dt, da));
      }
      // MG42 壓制射擊：短暫降低單一陣地射速
      const sp = this.def.suppress;
      if (sp) {
        this.suppressCd -= dt;
        if (this.suppressCd <= 0) {
          let best = null, bd = sp.range;
          for (const t of W.towers) { if (t.disabled) continue; const d = Math.hypot(t.x - this.x, t.y - this.y); if (d < bd) { bd = d; best = t; } }
          if (best) {
            best.suppressT = sp.duration; best.suppressFactor = sp.factor;
            W.effects.tracer(this.x, this.y, best.x + (Math.random() - 0.5) * 14, best.y + (Math.random() - 0.5) * 14, '#ffb070', 0.12);
            W.effects.tracer(this.x, this.y, best.x + (Math.random() - 0.5) * 14, best.y + (Math.random() - 0.5) * 14, '#ffb070', 0.18);
            W.effects.text(best.x, best.y - 30, '遭到壓制', '#ffb070', 0.9);
            this.suppressCd = sp.cooldown;
          } else this.suppressCd = 0.8;
        }
      }
      if (this.dist >= MAP.length) { this.alive = false; W.enemyReachedBase(this); }
    }

    /* ---------------- 繪製 ---------------- */
    draw(ctx, time) {
      if (!this.alive) return;
      ctx.save();
      ctx.translate(this.x, this.y);
      const flash = this.hitFlash > 0;
      switch (this.type) {
        case 'infantry': drawSoldier(ctx, this.angle, this.walk, flash, false); break;
        case 'mg42': drawMG42(ctx, this.angle, this.walk, flash); break;
        case 'halftrack': drawHalftrack(ctx, this.angle, this.tread, flash); break;
        case 'panzer4': drawTank(ctx, this, flash, TANKS.panzer4); break;
        case 'panther': drawTank(ctx, this, flash, TANKS.panther); break;
        case 'tiger': drawTank(ctx, this, flash, TANKS.tiger); break;
        case 'ju87': drawStuka(ctx, this, flash, time); break;
      }
      ctx.restore();
      // 血量條
      if (this.hp < this.maxHp || this.def.boss) {
        const w = Math.max(18, this.radius * 2), ratio = this.hp / this.maxHp;
        const yy = this.y - this.radius - (this.isAir ? 14 : 9);
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(this.x - w / 2 - 1, yy - 1, w + 2, 5);
        ctx.fillStyle = ratio > 0.5 ? '#8cc152' : ratio > 0.25 ? '#f0b13a' : '#e04a32';
        ctx.fillRect(this.x - w / 2, yy, w * ratio, 3);
      }
      if (this.def.boss) {
        ctx.fillStyle = '#ffd36b'; ctx.font = 'bold 11px "Noto Sans TC", sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('BOSS · Tiger I', this.x, this.y - this.radius - 16);
      }
    }
  }

  /* ---- 單位外形（程式繪圖） ---- */
  const FIELD_GREY = '#5f6656', FIELD_DARK = '#454a3e';

  function drawSoldier(ctx, ang, walk, flash, kneel) {
    ctx.rotate(ang);
    const step = Math.sin(walk) * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(1.5, 2, 6, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    // 腿
    ctx.fillStyle = FIELD_DARK;
    ctx.fillRect(-2 + step, -4, 4, 2.5); ctx.fillRect(-2 - step, 1.5, 4, 2.5);
    // 身體
    ctx.fillStyle = flash ? '#fff2d0' : FIELD_GREY;
    ctx.beginPath(); ctx.ellipse(0, 0, 3.6, 5.2, 0, 0, Math.PI * 2); ctx.fill();
    // 步槍
    ctx.strokeStyle = '#3b2e20'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(1, 3); ctx.lineTo(9, 3.5); ctx.stroke();
    // 鋼盔
    ctx.fillStyle = flash ? '#fff' : '#4d5446';
    ctx.beginPath(); ctx.arc(0.5, 0, 3.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  }

  function drawMG42(ctx, ang, walk, flash) {
    ctx.save(); ctx.translate(0, -5); drawSoldier(ctx, ang, walk, flash); ctx.restore();
    ctx.save(); ctx.translate(-3, 5); drawSoldier(ctx, ang, walk + 1.5, flash); ctx.restore();
    ctx.rotate(ang);
    ctx.strokeStyle = '#222'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(2, -1); ctx.lineTo(14, -1); ctx.stroke();
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(1, -3, 5, 4);
  }

  function treads(ctx, len, w, y, tread, color) {
    ctx.fillStyle = color || '#2c2b26';
    ctx.fillRect(-len / 2, y - w / 2, len, w);
    ctx.strokeStyle = 'rgba(120,115,100,0.55)'; ctx.lineWidth = 1;
    const off = tread % 4;
    ctx.beginPath();
    for (let x = -len / 2 + off; x < len / 2; x += 4) { ctx.moveTo(x, y - w / 2); ctx.lineTo(x, y + w / 2); }
    ctx.stroke();
  }

  function drawHalftrack(ctx, ang, tread, flash) {
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-15, -8, 34, 20);
    treads(ctx, 18, 5, -8, tread); treads(ctx, 18, 5, 8, tread);
    ctx.fillStyle = '#222'; ctx.fillRect(9, -10, 6, 4); ctx.fillRect(9, 6, 6, 4); // 前輪
    ctx.fillStyle = flash ? '#fff5d8' : '#8b8459';
    ctx.beginPath(); ctx.moveTo(-14, -8); ctx.lineTo(8, -8); ctx.lineTo(17, -4); ctx.lineTo(17, 4); ctx.lineTo(8, 8); ctx.lineTo(-14, 8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,35,20,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = '#4e4a34'; ctx.fillRect(-12, -5.5, 15, 11); // 敞篷乘員艙
    ctx.fillStyle = FIELD_GREY;
    for (const [x, y] of [[-9, -2.5], [-9, 2.5], [-3, -2.5], [-3, 2.5]]) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(11, 0); ctx.stroke();
    // 迷彩條紋
    ctx.strokeStyle = 'rgba(80,95,50,0.5)'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(-14, 7); ctx.lineTo(-6, -8); ctx.moveTo(5, 8); ctx.lineTo(10, -7); ctx.stroke();
  }

  const TANKS = {
    panzer4: { L: 34, W: 22, tw: 6, color: '#7f7a55', camo: 'rgba(70,90,50,0.55)', tr: 7.5, tL: 16, gun: 22, gunW: 2.6, skirts: true },
    panther: { L: 40, W: 25, tw: 7, color: '#a99a62', camo: 'rgba(110,80,50,0.55)', tr: 8, tL: 17, gun: 27, gunW: 2.8, slope: true, brake: true },
    tiger:   { L: 44, W: 30, tw: 8, color: '#8f8a66', camo: 'rgba(90,70,45,0.5)', tr: 10.5, tL: 21, gun: 26, gunW: 3.8, brake: true, boxy: true },
  };

  function drawTank(ctx, e, flash, s) {
    ctx.save();
    ctx.rotate(e.angle);
    const L = s.L, W = s.W;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-L / 2 + 4, -W / 2 + 4, L, W);
    treads(ctx, L, s.tw, -W / 2 + s.tw / 2, e.tread); treads(ctx, L, s.tw, W / 2 - s.tw / 2, e.tread);
    if (s.skirts) { ctx.fillStyle = '#6c6848'; ctx.fillRect(-L / 2 + 3, -W / 2 - 1, L - 6, 2.5); ctx.fillRect(-L / 2 + 3, W / 2 - 1.5, L - 6, 2.5); }
    ctx.fillStyle = flash ? '#fff5d8' : s.color;
    if (s.slope) {
      ctx.beginPath(); ctx.moveTo(-L / 2 + 2, -W / 2 + s.tw - 1); ctx.lineTo(L / 2 - 8, -W / 2 + s.tw - 1); ctx.lineTo(L / 2, -4); ctx.lineTo(L / 2, 4);
      ctx.lineTo(L / 2 - 8, W / 2 - s.tw + 1); ctx.lineTo(-L / 2 + 2, W / 2 - s.tw + 1); ctx.closePath(); ctx.fill();
    } else ctx.fillRect(-L / 2 + 2, -W / 2 + s.tw - 1, L - 3, W - 2 * s.tw + 2);
    ctx.strokeStyle = 'rgba(40,35,20,0.7)'; ctx.lineWidth = 1.2;
    ctx.strokeRect(-L / 2 + 2, -W / 2 + s.tw - 1, L - 3, W - 2 * s.tw + 2);
    // 引擎甲板格柵
    ctx.fillStyle = 'rgba(40,35,25,0.45)'; ctx.fillRect(-L / 2 + 4, -4, 7, 8);
    // 迷彩
    ctx.strokeStyle = s.camo; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-L / 2 + 5, W / 2 - 8); ctx.quadraticCurveTo(-4, -W / 2 + 8, 6, W / 2 - 9); ctx.stroke();
    ctx.restore();
    // 砲塔
    ctx.save();
    ctx.rotate(e.turret);
    ctx.fillStyle = '#2a2820'; ctx.fillRect(4, -s.gunW / 2, s.gun, s.gunW);
    if (s.brake) ctx.fillRect(4 + s.gun - 4, -s.gunW / 2 - 1.2, 4, s.gunW + 2.4);
    ctx.fillStyle = flash ? '#fffbe6' : MAP.shade(s.color.startsWith('#') ? s.color : '#888888', -12);
    if (s.boxy) ctx.fillRect(-s.tL / 2, -s.tr, s.tL, s.tr * 2);
    else { ctx.beginPath(); ctx.ellipse(-1, 0, s.tL / 2, s.tr, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(30,25,15,0.75)'; ctx.lineWidth = 1.2;
    if (s.boxy) ctx.strokeRect(-s.tL / 2, -s.tr, s.tL, s.tr * 2); else ctx.stroke();
    ctx.fillStyle = 'rgba(30,30,25,0.6)'; ctx.beginPath(); ctx.arc(-s.tL / 4, -s.tr / 3, 2.6, 0, Math.PI * 2); ctx.fill(); // 車長塔
    ctx.restore();
  }

  function drawStuka(ctx, e, flash, time) {
    const scale = e.bombed ? 1 : 1 + Math.max(0, 0.18 - Math.hypot(e.target.x - e.x, e.target.y - e.y) / 1200);
    // 地面陰影
    ctx.save(); ctx.translate(26, 30); ctx.rotate(e.angle); ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(-2, -18, 6, 36);
    ctx.restore();
    ctx.rotate(e.angle); ctx.scale(scale, scale);
    const body = flash ? '#fff6dc' : '#6e7660';
    // 倒鷗翼
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(4, -2); ctx.lineTo(0, -11); ctx.lineTo(3, -23); ctx.lineTo(-3, -23); ctx.lineTo(-6, -11); ctx.lineTo(-4, -2);
    ctx.lineTo(-4, 2); ctx.lineTo(-6, 11); ctx.lineTo(-3, 23); ctx.lineTo(3, 23); ctx.lineTo(0, 11); ctx.lineTo(4, 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,30,25,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    // 機身
    ctx.fillStyle = flash ? '#fff' : '#5a6250';
    ctx.beginPath(); ctx.ellipse(0, 0, 16, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    // 尾翼
    ctx.fillRect(-16, -7, 4, 14);
    // 起落架整流罩
    ctx.fillStyle = '#4b5243'; ctx.fillRect(1, -9, 6, 3); ctx.fillRect(1, 6, 6, 3);
    // 座艙
    ctx.fillStyle = '#a9c4cf'; ctx.fillRect(-4, -1.6, 7, 3.2);
    // 黃色翼尖（識別色）
    ctx.fillStyle = '#d8b43a'; ctx.fillRect(-3, -23, 6, 3); ctx.fillRect(-3, 20, 6, 3);
    // 螺旋槳
    ctx.strokeStyle = 'rgba(30,30,30,0.6)'; ctx.lineWidth = 1.5;
    const pa = time * 60;
    ctx.beginPath(); ctx.moveTo(17, Math.sin(pa) * 7); ctx.lineTo(17, -Math.sin(pa) * 7); ctx.stroke();
    if (!e.bombed) { ctx.fillStyle = '#2a2a24'; ctx.fillRect(-2, -1, 8, 2); }
  }

  SD.Enemy = Enemy;
  SD.drawUnitIcon = function (ctx, type, x, y, scale) {
    // 給 UI 圖示用的靜態繪製
    const fake = { angle: 0, turret: 0, tread: 0, walk: 0, bombed: false, target: { x: 9999, y: 9999 }, x: 0, y: 0 };
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    switch (type) {
      case 'infantry': drawSoldier(ctx, 0, 0, false); break;
      case 'mg42': drawMG42(ctx, 0, 0, false); break;
      case 'halftrack': drawHalftrack(ctx, 0, 0, false); break;
      case 'panzer4': drawTank(ctx, fake, false, TANKS.panzer4); break;
      case 'panther': drawTank(ctx, fake, false, TANKS.panther); break;
      case 'tiger': drawTank(ctx, fake, false, TANKS.tiger); break;
      case 'ju87': drawStuka(ctx, fake, false, 0); break;
    }
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
