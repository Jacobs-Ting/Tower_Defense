/* =========================================================
 * 遊戲世界：狀態機、經濟、戰鬥結算（與 DOM 無關，可無頭測試）
 * 狀態：MENU / PREPARATION / PLAYING / PAUSED / VICTORY / DEFEAT
 * ========================================================= */
(function (g) {
  const SD = g.SD;
  const C = SD.CONFIG;

  class World {
    constructor() { this.listeners = []; this.reset(); this.state = 'MENU'; }

    on(fn) { this.listeners.push(fn); }
    emit(type, data) { for (const f of this.listeners) f(type, data); }
    sfx(name) { if (SD.Audio && !this.silent) SD.Audio.play(name); }

    reset() {
      this.state = 'MENU'; this.prevState = null;
      this.supply = C.START_SUPPLY; this.hq = C.START_HQ; this.maxHq = C.START_HQ;
      this.currentWave = 1; this.wavesCleared = 0;
      this.enemies = []; this.towers = []; this.projectiles = []; this.airWarnings = [];
      this.effects = new SD.Effects();
      this.spawner = null; this.prepTimer = Infinity; this.time = 0; this.hqShake = 0;
      this.nextId = 1;
      this.stats = { infantry: 0, vehicles: 0, aircraft: 0, kills: 0, killScore: 0, leaked: 0 };
      this.pads = SD.MAP.pads.map(p => ({ id: p.id, x: p.x, y: p.y, tower: null }));
    }

    /* ---------------- 流程 ---------------- */
    newGame() {
      this.reset();
      this.state = 'PREPARATION';
      this.prepTimer = Infinity;            // 第一波由玩家手動開始
      this.emit('state', this.state);
      this.emit('prep', 1);
    }

    setState(s) { this.state = s; this.emit('state', s); }

    togglePause() {
      if (this.state === 'PLAYING' || this.state === 'PREPARATION') { this.prevState = this.state; this.setState('PAUSED'); }
      else if (this.state === 'PAUSED') this.setState(this.prevState || 'PLAYING');
    }

    earlyBonus() { return isFinite(this.prepTimer) ? Math.floor(this.prepTimer) * C.EARLY_BONUS_PER_SEC : 0; }

    startWave() {
      if (this.state !== 'PREPARATION') return false;
      const bonus = this.earlyBonus();
      if (bonus > 0) { this.supply += bonus; this.emit('toast', `提前出擊：補給 +${bonus}`); }
      this.spawner = new SD.Spawner(this, this.currentWave - 1);
      this.prepTimer = Infinity;
      this.setState('PLAYING');
      this.sfx('alarm');
      this.emit('waveStart', this.currentWave);
      return true;
    }

    waveComplete() {
      this.wavesCleared = this.currentWave;
      const bonus = C.WAVE_CLEAR_BONUS + this.currentWave * 15;
      this.supply += bonus;
      this.projectiles = [];
      this.spawner = null;
      if (this.currentWave >= SD.WAVES.length) {
        this.setState('VICTORY'); this.sfx('victory'); this.emit('end', true);
        return;
      }
      this.currentWave++;
      this.prepTimer = C.PREP_TIME;
      this.setState('PREPARATION');
      this.emit('toast', `第 ${this.wavesCleared} 波擊退！補給 +${bonus}`);
      this.emit('prep', this.currentWave);
      for (const k of SD.TOWER_ORDER) if (SD.TOWERS[k].unlockWave === this.currentWave) this.emit('unlock', k);
    }

    /* ---------------- 主更新 ---------------- */
    update(dt) {
      if (this.state === 'PAUSED' || this.state === 'MENU') return;
      this.time += dt;
      this.hqShake = Math.max(0, this.hqShake - dt * 20);
      this.effects.update(dt);
      if (this.state === 'VICTORY' || this.state === 'DEFEAT') return;
      if (this.state === 'PREPARATION') {
        for (const t of this.towers) { t.recoil = 0; t.suppressT = 0; }
        if (isFinite(this.prepTimer)) {
          this.prepTimer -= dt;
          if (this.prepTimer <= 0) { this.prepTimer = 0; this.startWave(); }
        }
        return;
      }
      // PLAYING
      this.spawner.update(dt);
      for (const w of this.airWarnings) {
        w.t -= dt;
        if (w.t <= 0) this.enemies.push(new SD.Enemy(this, 'ju87', { entry: w.entry, target: w.target, hpMul: w.hpMul }));
      }
      this.airWarnings = this.airWarnings.filter(w => w.t > 0);
      for (const e of this.enemies) e.update(dt);
      if (this.state !== 'PLAYING') return;               // 可能在敵軍抵達時失敗
      for (const t of this.towers) t.update(dt);
      for (const p of this.projectiles) p.update(dt);
      this.projectiles = this.projectiles.filter(p => p.alive);
      this.enemies = this.enemies.filter(e => e.alive);
      if (this.spawner.done && this.enemies.length === 0 && this.airWarnings.length === 0) this.waveComplete();
    }

    /* ---------------- 生成 ---------------- */
    spawn(type, hpMul = 1) {
      const d = SD.ENEMIES[type];
      if (d.isAir) {
        // 空襲：先發出預警，標示轟炸目標點與來襲方向
        const live = this.towers.filter(t => !t.disabled);
        let target;
        if (live.length && Math.random() < 0.4) {
          const t = live[Math.floor(Math.random() * live.length)];
          target = { x: t.x, y: t.y, kind: 'tower' };
        } else target = { x: SD.MAP.HQ.x - 10, y: SD.MAP.HQ.y, kind: 'hq' };
        const ang = -Math.PI * 0.85 + Math.random() * Math.PI * 0.55; // 由左上～上方進場
        const dist = 640;
        const entry = { x: target.x + Math.cos(ang) * dist, y: target.y + Math.sin(ang) * dist };
        this.airWarnings.push({ t: C.AIR_WARNING_TIME, max: C.AIR_WARNING_TIME, target, entry, hpMul });
        this.sfx('siren');
        this.emit('airWarning');
        return;
      }
      this.enemies.push(new SD.Enemy(this, type, { hpMul }));
    }

    /* ---------------- 傷害結算 ---------------- */
    applyDamage(e, base, tower, splash) {
      if (!e.alive || e.dead) return 0;
      const mult = tower.table[e.armor];
      const fx = this.effects;
      const dtype = tower.def.damageType;
      if (mult <= 0) {
        // 無效攻擊：裝甲抵擋 / 無法穿甲
        if (e.textCd <= 0) {
          fx.text(e.x, e.y - e.radius - 6, e.armor === 'HeavyArmor' ? '無法穿甲' : '裝甲抵擋', '#c9c9c9', 0.8);
          e.textCd = 0.9;
        }
        if (!splash) { fx.sparks(e.x, e.y, 3); if (Math.random() < 0.3) this.sfx('ricochet'); }
        return 0;
      }
      const dmg = base * mult;
      e.hp -= dmg; e.hitFlash = 0.06;
      tower.damageDealt += dmg;
      if (e.isAir) fx.flakBurst(e.x + (Math.random() - 0.5) * 12, e.y + (Math.random() - 0.5) * 12, 0.8);
      else if (dtype === 'ArmorPiercing') {
        if (mult >= 1.2 && e.armor !== 'Infantry') { fx.sparks(e.x, e.y, 10, 'rgba(255,170,70,'); if (e.textCd <= 0) { fx.text(e.x, e.y - e.radius - 6, '穿甲命中！', '#ffcf6a', 0.8); e.textCd = 0.8; } }
        else if (mult < 0.5) { fx.sparks(e.x, e.y, 6); if (e.textCd <= 0) { fx.text(e.x, e.y - e.radius - 6, '跳彈', '#d9d9d9', 0.8); e.textCd = 0.8; } this.sfx('ricochet'); }
        else fx.sparks(e.x, e.y, 6);
      } else if (mult <= 0.2 && !splash) {
        fx.sparks(e.x, e.y, 2);
        if (e.textCd <= 0) { fx.text(e.x, e.y - e.radius - 6, '跳彈', '#d9d9d9', 0.7); e.textCd = 1.0; }
      }
      if (e.hp <= 0) this.kill(e, tower);
      return dmg;
    }

    kill(e, tower) {
      if (e.dead) return;                 // 獎勵只結算一次
      e.dead = true; e.alive = false; e.hp = 0;
      this.supply += e.reward;
      this.stats.kills++; this.stats.killScore += e.reward * 10;
      const cat = e.def.category;
      if (cat === 'infantry') { this.stats.infantry++; this.effects.infantryDown(e); }
      else if (cat === 'vehicle') { this.stats.vehicles++; this.effects.wreck(e); this.sfx('boom'); }
      else if (cat === 'aircraft') { this.stats.aircraft++; this.effects.planeDown(e); this.effects.text(e.x, e.y - 26, '擊落！', '#9fe0ff', 1.1, true); this.sfx('boom'); }
      if (tower) tower.kills++;
      this.effects.text(e.x, e.y - 12, `+${e.reward}`, '#f2d16b', 0.8);
    }

    /** 範圍爆炸：同一次爆炸對同一敵軍只造成一次傷害 */
    explode(x, y, radius, damage, tower) {
      this.effects.explosion(x, y, radius, true);
      this.sfx('boom');
      const hit = new Set();
      for (const e of this.enemies) {
        if (!e.alive || e.dead || e.isAir || hit.has(e.id)) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d > radius + e.radius * 0.5) continue;
        hit.add(e.id);
        const fall = 1 - 0.5 * Math.min(1, d / radius);
        this.applyDamage(e, damage * fall, tower, true);
      }
      return hit.size;
    }

    airStrike(plane) {
      const t = plane.target, d = plane.def;
      this.effects.explosion(t.x, t.y, d.bombRadius, true);
      this.effects.smoke(t.x, t.y, 8, 2.2, 'rgba(70,65,55,');
      this.sfx('bomb');
      if (t.kind === 'hq') { this.effects.text(t.x, t.y - 50, '指揮部遭到空襲！', '#ff8a6a', 1.4, true); this.hqDamage(d.bombHQ); }
      for (const tw of this.towers) {
        const dist = Math.hypot(tw.x - t.x, tw.y - t.y);
        if (dist > d.bombRadius) continue;
        tw.hp -= d.bombDamage * (1 - 0.4 * dist / d.bombRadius);
        if (tw.hp <= 0 && !tw.disabled) { tw.hp = 0; tw.disabled = true; this.effects.text(tw.x, tw.y - 30, '陣地失能！', '#ff8a6a', 1.4, true); this.emit('toast', `${tw.def.short} 遭空襲失能，請於準備階段修復`); }
      }
    }

    enemyReachedBase(e) {
      if (e.dead) return;                 // 已擊毀的敵軍不會扣血
      this.stats.leaked++;
      this.effects.text(SD.MAP.HQ.x, SD.MAP.HQ.y - 50, `-${e.damageToBase}`, '#ff6a4a', 1, true);
      this.hqDamage(e.damageToBase);
    }

    hqDamage(n) {
      if (this.state !== 'PLAYING') return;
      this.hq = Math.max(0, this.hq - n);
      this.hqShake = 8;
      this.sfx('hqHit');
      if (this.hq <= 0) { this.setState('DEFEAT'); this.sfx('defeat'); this.emit('end', false); }
    }

    /* ---------------- 玩家操作 ---------------- */
    canAct() { return ['PREPARATION', 'PLAYING', 'PAUSED'].includes(this.state); }
    isUnlocked(key) { return SD.TOWERS[key].unlockWave <= this.currentWave; }

    build(padId, key) {
      const pad = this.pads[padId], def = SD.TOWERS[key];
      if (!this.canAct()) return { ok: false, msg: '目前無法部署' };
      if (!pad) return { ok: false, msg: '此處不可部署' };
      if (pad.tower) return { ok: false, msg: '該部署格已有陣地' };
      if (!this.isUnlocked(key)) return { ok: false, msg: `第 ${def.unlockWave} 波解鎖` };
      if (this.supply < def.cost) return { ok: false, msg: '補給點數不足' };
      this.supply -= def.cost;
      const t = new SD.Tower(this, key, pad);
      pad.tower = t; this.towers.push(t);
      this.effects.smoke(pad.x, pad.y, 6, 0.9, 'rgba(170,150,110,');
      this.sfx('build');
      return { ok: true, tower: t };
    }

    upgrade(t) {
      if (!this.canAct()) return { ok: false, msg: '目前無法升級' };
      const c = t.upgradeCost;
      if (c == null) return { ok: false, msg: '已達最高等級' };
      if (this.supply < c) return { ok: false, msg: '補給點數不足' };
      this.supply -= c; t.upgrade();
      this.effects.text(t.x, t.y - 30, `升級 Lv.${t.level + 1}`, '#f2d16b', 1);
      this.effects.sparks(t.x, t.y, 12, 'rgba(255,230,140,');
      this.sfx('upgrade');
      return { ok: true };
    }

    sell(t) {
      if (!this.canAct()) return { ok: false };
      const v = t.sellValue;
      this.supply += v;
      t.pad.tower = null;
      this.towers = this.towers.filter(x => x !== t);
      this.effects.smoke(t.x, t.y, 6, 0.9, 'rgba(170,150,110,');
      this.sfx('sell');
      return { ok: true, value: v };
    }

    repair(t) {
      if (this.state !== 'PREPARATION' && !(this.state === 'PAUSED' && this.prevState === 'PREPARATION')) return { ok: false, msg: '僅能在準備階段修復' };
      const c = t.repairCost;
      if (c <= 0) return { ok: false, msg: '陣地完好' };
      if (this.supply < c) return { ok: false, msg: '補給點數不足' };
      this.supply -= c; t.hp = t.maxHp; t.disabled = false;
      this.sfx('build');
      return { ok: true, cost: c };
    }

    repairAllCost() { return this.towers.reduce((s, t) => s + t.repairCost, 0); }

    finalScore() {
      const s = this.stats;
      return s.killScore + this.wavesCleared * 500 + this.hq * 150 + (this.state === 'VICTORY' ? 5000 : 0);
    }
  }

  SD.World = World;
})(typeof window !== 'undefined' ? window : globalThis);
