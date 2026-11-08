/* =========================================================
 * 鋼鐵防線：1944 — 進入點：主迴圈、輸入、畫面繪製
 * requestAnimationFrame + 固定步長模擬（deltaTime 累加）
 * 2× 速度 = 每幀執行兩倍的固定步長，傷害與生成計時完全一致
 * ========================================================= */
(function () {
  const SD = window.SD, C = SD.CONFIG, MAP = SD.MAP;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('canvasWrap');

  const world = new SD.World();
  const G = {
    world, speed: 1, buildKey: null, selected: null,
    mouse: { x: -999, y: -999, in: false }, hoverPad: null,

    newGame() {
      document.getElementById('menu').classList.add('hidden');
      document.getElementById('endScreen').classList.add('hidden');
      this.buildKey = null; this.selected = null; this.speed = 1;
      world.newGame();
      SD.UI.banner('準備階段', '在道路旁部署防禦武器，準備好後按「開始第 1 波」', false, 3.5);
    },
    togglePause() { if (world.canAct()) { world.togglePause(); SD.Audio.play('click'); } },
    toggleSpeed() { this.speed = this.speed === 1 ? 2 : 1; SD.Audio.play('click'); },
    selectBuild(k) {
      if (!world.canAct()) return;
      if (!world.isUnlocked(k)) { SD.UI.toast(`${SD.TOWERS[k].short}：第 ${SD.TOWERS[k].unlockWave} 波解鎖`, true); SD.Audio.play('error'); return; }
      this.buildKey = this.buildKey === k ? null : k;
      this.selected = null;
      SD.Audio.init(); SD.Audio.play('click');
    },
    cancel() { this.buildKey = null; this.selected = null; },
    panelAction(act) {
      const t = this.selected; if (!t) return;
      let r;
      if (act === 'upgrade') r = world.upgrade(t);
      if (act === 'sell') { r = world.sell(t); if (r.ok) { SD.UI.toast(`已拆除，退還補給 ${r.value}`); this.selected = null; } }
      if (act === 'repair') r = world.repair(t);
      if (r && !r.ok && r.msg) { SD.UI.toast(r.msg, true); SD.Audio.play('error'); }
    },
    repairAll() {
      let n = 0;
      for (const t of world.towers) if (t.repairCost > 0 && world.repair(t).ok) n++;
      SD.UI.toast(n ? `已修復 ${n} 座陣地` : '補給不足，無法修復', !n);
    },
  };
  SD.Game = G;

  /* ---------------- 畫面縮放：維持 16:9，點擊座標換算 ---------------- */
  function fit() {
    const w = wrap.clientWidth - 8, h = wrap.clientHeight - 8;
    const s = Math.min(w / C.WIDTH, h / C.HEIGHT);
    canvas.style.width = Math.floor(C.WIDTH * s) + 'px';
    canvas.style.height = Math.floor(C.HEIGHT * s) + 'px';
    // 高 DPI 清晰度
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const want = Math.round(C.WIDTH * Math.min(dpr, Math.max(1, s * dpr)));
    if (canvas.width !== want) { canvas.width = want; canvas.height = Math.round(want * C.HEIGHT / C.WIDTH); }
  }
  window.addEventListener('resize', fit);
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * C.WIDTH / r.width, y: (e.clientY - r.top) * C.HEIGHT / r.height };
  }
  function padAt(x, y) {
    for (const p of world.pads) if (Math.hypot(p.x - x, p.y - y) <= C.PAD_RADIUS + 4) return p;
    return null;
  }

  /* ---------------- 輸入 ---------------- */
  canvas.addEventListener('mousemove', e => {
    const p = toWorld(e); G.mouse.x = p.x; G.mouse.y = p.y; G.mouse.in = true;
    G.hoverPad = padAt(p.x, p.y);
    canvas.style.cursor = G.buildKey ? 'crosshair' : (G.hoverPad && G.hoverPad.tower ? 'pointer' : 'default');
  });
  canvas.addEventListener('mouseleave', () => { G.mouse.in = false; G.hoverPad = null; });
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); G.cancel(); });
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    SD.Audio.init();
    if (!world.canAct()) return;
    const p = toWorld(e), pad = padAt(p.x, p.y);
    if (G.buildKey) {
      if (!pad) { SD.UI.toast('此處不可部署：請選擇綠色部署格', true); SD.Audio.play('error'); return; }
      if (pad.tower) { G.selected = pad.tower; G.buildKey = null; return; }
      const r = world.build(pad.id, G.buildKey);
      if (!r.ok) { SD.UI.toast(r.msg, true); SD.Audio.play('error'); return; }
      // 一般點擊：建造後離開部署模式；按住 Shift 可連續部署
      if (!e.shiftKey || world.supply < SD.TOWERS[G.buildKey].cost) G.buildKey = null;
      G.selected = r.tower;
      return;
    }
    G.selected = pad && pad.tower ? pad.tower : null;
  });
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '6') { G.selectBuild(SD.TOWER_ORDER[+k - 1]); return; }
    if (k === 'escape') { G.cancel(); document.getElementById('help').classList.add('hidden'); }
    if (k === ' ') { e.preventDefault(); G.togglePause(); }
    if (k === 'f') G.toggleSpeed();
    if (k === 'n') { SD.Audio.init(); world.startWave(); }
    if (k === 'u') G.panelAction('upgrade');
    if (k === 'x' || k === 'delete') G.panelAction('sell');
    if (k === 'r') G.panelAction('repair');
  });
  world.on(type => {
    // 選取中的陣地被拆除或重置時清除選取
    if (type === 'state' && G.selected && !world.towers.includes(G.selected)) G.selected = null;
    if (type === 'state' && !world.canAct()) G.buildKey = null;
  });

  /* ---------------- 繪製 ---------------- */
  const bg = MAP.renderBackground(document);

  function drawRange(x, y, r, minR, ok) {
    ctx.save();
    ctx.fillStyle = ok ? 'rgba(140,220,120,0.10)' : 'rgba(230,90,70,0.10)';
    ctx.strokeStyle = ok ? 'rgba(170,240,140,0.8)' : 'rgba(255,120,100,0.8)';
    ctx.lineWidth = 1.6; ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (minR) { ctx.strokeStyle = 'rgba(255,200,120,0.7)'; ctx.beginPath(); ctx.arc(x, y, minR, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  function drawPads() {
    const building = !!G.buildKey;
    for (const p of world.pads) {
      if (p.tower) {
        if (building) { ctx.strokeStyle = 'rgba(230,80,60,0.75)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, C.PAD_RADIUS, 0, Math.PI * 2); ctx.stroke(); }
        continue;
      }
      ctx.fillStyle = building ? 'rgba(120,200,90,0.22)' : 'rgba(90,70,40,0.22)';
      ctx.beginPath(); ctx.arc(p.x, p.y, C.PAD_RADIUS - 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = building ? 'rgba(150,235,110,0.85)' : 'rgba(225,210,160,0.32)';
      ctx.lineWidth = building ? 1.8 : 1.2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(p.x, p.y, C.PAD_RADIUS - 2, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (!building) { ctx.fillStyle = 'rgba(225,210,160,0.3)'; ctx.fillRect(p.x - 4, p.y - 0.75, 8, 1.5); ctx.fillRect(p.x - 0.75, p.y - 4, 1.5, 8); }
    }
  }

  function drawAirWarnings(t) {
    for (const w of world.airWarnings) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 12);
      ctx.save();
      ctx.strokeStyle = `rgba(255,70,50,${0.5 + pulse * 0.5})`; ctx.lineWidth = 2.5;
      const r = 26 + pulse * 6;
      ctx.beginPath(); ctx.arc(w.target.x, w.target.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w.target.x - r - 8, w.target.y); ctx.lineTo(w.target.x - r + 8, w.target.y);
      ctx.moveTo(w.target.x + r - 8, w.target.y); ctx.lineTo(w.target.x + r + 8, w.target.y);
      ctx.moveTo(w.target.x, w.target.y - r - 8); ctx.lineTo(w.target.x, w.target.y - r + 8);
      ctx.moveTo(w.target.x, w.target.y + r - 8); ctx.lineTo(w.target.x, w.target.y + r + 8); ctx.stroke();
      // 航線虛線
      ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(255,90,60,0.45)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(w.entry.x, w.entry.y); ctx.lineTo(w.target.x, w.target.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#ff6a4a'; ctx.font = 'bold 13px "Noto Sans TC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`空襲目標 ${w.t.toFixed(1)}s`, w.target.x, w.target.y - r - 12);
      ctx.restore();
    }
  }

  function render() {
    const t = world.time;
    const sx = canvas.width / C.WIDTH;
    ctx.setTransform(sx, 0, 0, sx, 0, 0);
    ctx.drawImage(bg, 0, 0, C.WIDTH, C.HEIGHT);
    world.effects.drawGround(ctx);
    drawPads();
    MAP.drawHQ(ctx, world.hq, world.maxHq, world.hqShake, t);
    for (const e of world.enemies) if (!e.isAir) e.draw(ctx, t);
    for (const tw of world.towers) tw.draw(ctx, tw === G.selected, t);
    // 選取陣地的射程
    if (G.selected && world.towers.includes(G.selected)) drawRange(G.selected.x, G.selected.y, G.selected.stats.range, G.selected.def.minRange, true);
    else if (!G.buildKey && G.hoverPad && G.hoverPad.tower) { const h = G.hoverPad.tower; ctx.globalAlpha = 0.55; drawRange(h.x, h.y, h.stats.range, h.def.minRange, true); ctx.globalAlpha = 1; }
    for (const p of world.projectiles) p.draw(ctx);
    drawAirWarnings(t);
    for (const e of world.enemies) if (e.isAir) e.draw(ctx, t);
    world.effects.drawAir(ctx);

    // 部署預覽
    if (G.buildKey && G.mouse.in) {
      const d = SD.TOWERS[G.buildKey], pad = G.hoverPad;
      const ok = pad && !pad.tower && world.supply >= d.cost;
      const x = pad ? pad.x : G.mouse.x, y = pad ? pad.y : G.mouse.y;
      drawRange(x, y, d.levels[0].range, d.minRange, ok);
      ctx.globalAlpha = 0.7; SD.drawTowerIcon(ctx, G.buildKey, x, y, 1); ctx.globalAlpha = 1;
      ctx.strokeStyle = ok ? '#8fe06a' : '#ff5a44'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, C.PAD_RADIUS, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = ok ? '#bff59a' : '#ffb1a3'; ctx.font = 'bold 12px "Noto Sans TC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(ok ? `可部署 ⛁${d.cost}` : !pad ? '不可部署' : pad.tower ? '已有陣地' : '補給不足', x, y - C.PAD_RADIUS - 8);
    }

    // 狀態遮罩
    if (world.state === 'PAUSED') {
      ctx.fillStyle = 'rgba(15,15,10,0.45)'; ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
      ctx.fillStyle = '#efe6c8'; ctx.font = 'bold 44px "Noto Sans TC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('作戰暫停', C.WIDTH / 2, C.HEIGHT / 2);
      ctx.font = '16px "Noto Sans TC", sans-serif'; ctx.fillText('按空白鍵或「繼續」恢復　·　暫停期間仍可部署與升級', C.WIDTH / 2, C.HEIGHT / 2 + 34);
    } else if (world.state === 'PREPARATION' && isFinite(world.prepTimer)) {
      ctx.fillStyle = 'rgba(20,20,14,0.6)'; ctx.fillRect(C.WIDTH / 2 - 130, 10, 260, 34);
      ctx.fillStyle = '#f2d16b'; ctx.font = 'bold 17px "Noto Sans TC", sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`準備階段 · ${Math.ceil(world.prepTimer)} 秒後敵軍來襲`, C.WIDTH / 2, 33);
    }
  }

  /* ---------------- 主迴圈 ---------------- */
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (world.state !== 'PAUSED' && world.state !== 'MENU') {
      acc += dt * G.speed;
      let steps = 0;
      while (acc >= C.FIXED_DT && steps < 24) { world.update(C.FIXED_DT); acc -= C.FIXED_DT; steps++; }
      if (steps >= 24) acc = 0;
    }
    if (G.selected && !world.towers.includes(G.selected)) G.selected = null;
    render();
    SD.UI.refresh(dt);
    requestAnimationFrame(frame);
  }

  SD.UI.init(G);
  fit();
  requestAnimationFrame(frame);
})();
