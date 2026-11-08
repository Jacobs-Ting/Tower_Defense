// 無頭測試：載入遊戲邏輯，以自動指揮官跑完 10 波，並執行驗收單元測試
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = process.argv[2] || path.join(__dirname, '..');

function load(seed) {
  let s = seed >>> 0;
  const ctx = { console, Math: Object.create(Math), Set, Map, Infinity, isFinite };
  ctx.Math.random = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ['config', 'map', 'effects', 'enemies', 'towers', 'projectiles', 'waves', 'core'])
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
  return ctx.SD;
}

function coverage(SD, pad, range, minR) {
  let n = 0;
  for (let d = 0; d < SD.MAP.length; d += 10) {
    const p = SD.MAP.pointAt(d), dd = Math.hypot(p.x - pad.x, p.y - pad.y);
    if (dd <= range && dd >= (minR || 0)) n++;
  }
  return n;
}

function runBot(seed, opts = {}) {
  const SD = load(seed);
  const W = new SD.World(); W.silent = true;
  W.newGame();
  const allowed = opts.allowed || SD.TOWER_ORDER;
  const want = w => ({
    mg: Math.min(7, 2 + w),
    mortar: w >= 3 ? Math.min(5, 1 + Math.floor((w - 3) * 0.7)) : 0,
    at57: w >= 5 ? Math.min(8, 1 + (w - 5) * 1.4) : 0,
    bofors: w >= 7 ? (w >= 8 ? 3 : 2) : 0,
    howitzer: w >= 8 ? 1 : 0,
    at17: w >= 9 ? 2 : 0,
  });
  const cov = {};
  function bestPad(key) {
    const def = SD.TOWERS[key], r = def.levels[0].range;
    let best = null, bs = -Infinity;
    for (const p of W.pads) {
      if (p.tower) continue;
      let c = key === 'bofors' ? -Math.hypot(p.x - 900, p.y - 360) : coverage(SD, p, r, def.minRange);
      if (c > bs) { bs = c; best = p; }
    }
    return best;
  }
  function act() {
    const w = W.currentWave, wt = want(w);
    for (const t of W.towers) if (t.repairCost > 0) W.repair(t);
    let progress = true, short = false;
    while (progress) {
      progress = false; short = false;
      for (const key of (opts.order || ['bofors', 'at57', 'at17', 'mortar', 'mg', 'howitzer'])) {
        if (!allowed.includes(key) || !W.isUnlocked(key)) continue;
        const have = W.towers.filter(t => t.key === key).length;
        if (have < wt[key]) { if (W.supply >= SD.TOWERS[key].cost) { const p = bestPad(key); if (p && W.build(p.id, key).ok) { progress = true; break; } } else { short = true; break; } }
      }
    }
    if (short) return;
    // 升級
    const ups = W.towers.filter(t => t.upgradeCost != null).sort((a, b) => (/at/.test(b.key) - /at/.test(a.key)) || a.upgradeCost - b.upgradeCost);
    const reserve = SD.TOWER_ORDER.filter(k => allowed.includes(k) && SD.TOWERS[k].unlockWave === w + 1).reduce((a, k) => a + SD.TOWERS[k].cost, 0);
    for (const t of ups) if (W.supply >= t.upgradeCost + reserve) W.upgrade(t);
  }
  const dt = SD.CONFIG.FIXED_DT;
  let guard = 0, log = [];
  while (!['VICTORY', 'DEFEAT'].includes(W.state) && guard++ < 60 * 60 * 40) {
    if (W.state === 'PREPARATION') { act(); log.push(`W${W.currentWave} start: supply=${W.supply} hq=${W.hq} towers=${W.towers.map(t => t.key + (t.level + 1)).join(',')}`); W.startWave(); }
    if (guard % 120 === 0) act();
    W.update(dt * (opts.speed || 1));
  }
  return { state: W.state, wave: W.currentWave, hq: W.hq, supply: W.supply, stats: W.stats, score: W.finalScore(), log, time: W.time };
}

// ---------- 驗收單元測試 ----------
function assert(c, m) { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) process.exitCode = 1; }
function unit() {
  const SD = load(1);
  console.log('== 單元測試 ==');
  console.log('  部署格數量:', SD.MAP.pads.length, ' 道路長度:', SD.MAP.length.toFixed(0));
  assert(SD.MAP.pads.every(p => SD.MAP.distToPath(p.x, p.y) > SD.CONFIG.ROAD_WIDTH / 2 + SD.CONFIG.PAD_RADIUS), '部署格不與道路重疊');
  assert(SD.MAP.pads.every(p => SD.MAP.pads.every(q => q === p || Math.hypot(p.x - q.x, p.y - q.y) >= 2 * SD.CONFIG.PAD_RADIUS)), '部署格互不重疊');
  let W = new SD.World(); W.silent = true; W.newGame();
  assert(W.build(0, 'mg').ok && W.supply === 400, '建造機槍扣 100 補給');
  assert(!W.build(0, 'mg').ok, '不能重複放在同一格');
  assert(!W.build(1, 'mortar').ok, '未解鎖武器不能建造');
  W.supply = 50; assert(!W.build(2, 'mg').ok, '補給不足不能建造');
  W.supply = 1000; const t = W.pads[0].tower; W.upgrade(t); W.upgrade(t);
  assert(t.level === 2 && t.invested === 100 + 90 + 140, '升級兩次，投入 330');
  const before = W.supply; W.sell(t); assert(W.supply - before === 165 && !W.pads[0].tower, '拆除退還 50%（165）並釋放部署格');
  // 傷害測試
  W = new SD.World(); W.silent = true; W.newGame(); W.currentWave = 10; W.supply = 99999; W.state = 'PLAYING'; W.spawner = { update() {}, done: true };
  const mg = W.build(0, 'mg').tower, tiger = new SD.Enemy(W, 'tiger');
  W.applyDamage(tiger, 1000, mg, false); assert(tiger.hp === tiger.maxHp, '機槍對 Tiger I 無效');
  const inf = new SD.Enemy(W, 'infantry'); W.applyDamage(inf, 10, mg, false); assert(inf.hp === inf.maxHp - 15, '機槍對步兵 ×1.5');
  const plane = new SD.Enemy(W, 'ju87', { entry: { x: mg.x - 50, y: mg.y }, target: { x: 2000, y: mg.y, kind: 'hq' } });
  W.enemies = [plane];
  assert(!mg.canTarget(plane), '機槍不能攻擊飛機');
  for (const k of ['mortar', 'at57', 'at17', 'howitzer']) { const tw = new SD.Tower(W, k, W.pads[5]); assert(!tw.canTarget(plane) && tw.table.Aircraft === 0, `${k} 不能攻擊飛機`); }
  const bof = new SD.Tower(W, 'bofors', { x: mg.x, y: mg.y }); assert(bof.canTarget(plane), 'Bofors 可攻擊飛機');
  // 獎勵只結算一次
  const e2 = new SD.Enemy(W, 'infantry'); W.enemies = [e2]; const s0 = W.supply;
  W.applyDamage(e2, 999, mg, false); W.applyDamage(e2, 999, mg, false); W.kill(e2, mg);
  assert(W.supply - s0 === e2.reward && W.stats.kills === 1, '獎勵只結算一次');
  const hq0 = W.hq; W.enemyReachedBase(e2); assert(W.hq === hq0, '已擊毀敵軍不扣指揮部耐久');
  // 範圍爆炸不重複
  const grp = [0, 1, 2].map(() => new SD.Enemy(W, 'infantry')); grp.forEach(e => { e.dist = 300; e.lane = 0; e.updatePos(); });
  W.enemies = grp; const mo = new SD.Tower(W, 'mortar', W.pads[3]);
  const n = W.explode(grp[0].x, grp[0].y, 50, 20, mo);
  assert(n === 3 && grp.every(e => Math.abs(e.hp - (45 - 30)) < 0.01), '迫擊砲同時命中多名步兵，每人僅一次');
  // 暫停
  W = new SD.World(); W.silent = true; W.newGame(); W.startWave(); for (let i = 0; i < 200; i++) W.update(1 / 60);
  const snap = JSON.stringify(W.enemies.map(e => [e.x, e.y])); W.togglePause();
  for (let i = 0; i < 300; i++) W.update(1 / 60);
  assert(snap === JSON.stringify(W.enemies.map(e => [e.x, e.y])) && W.state === 'PAUSED', '暫停後模擬完全停止');
  W.togglePause(); assert(W.state === 'PLAYING', '解除暫停回到戰鬥');
  // 失敗
  W.hq = 1; W.state = 'PLAYING'; W.hqDamage(1); assert(W.state === 'DEFEAT', '指揮部耐久歸零 → 失敗');
  W.newGame(); assert(W.towers.length === 0 && W.supply === 500 && W.hq === 20 && W.currentWave === 1 && W.enemies.length === 0, '重新開始完全重置');
}

unit();
console.log('\n== 自動指揮官模擬 ==');
const cases = [
  ['完整武器', {}],
  ['僅 57mm（無 17磅砲/105mm）', { allowed: ['mg', 'mortar', 'at57', 'bofors'] }],
  ['不建防空砲', { allowed: ['mg', 'mortar', 'at57', 'at17', 'howitzer'] }],
  ['只用機槍（應失敗）', { allowed: ['mg'] }],
];
for (const [name, o] of cases) {
  const res = [];
  for (const seed of [11, 22, 33, 44, 55]) res.push(runBot(seed, o));
  const wins = res.filter(r => r.state === 'VICTORY').length;
  console.log(`${name}: 擊落 ${res.map(r=>r.stats.aircraft).join('/')}，勝 ${wins}/5，HQ 剩餘 ${res.map(r => r.hq).join('/')}，止於波次 ${res.map(r => r.state === 'VICTORY' ? '✓' : r.wave).join('/')}，耗時 ${(res[0].time / 60).toFixed(1)} 分`);
  if (process.env.V) console.log(res[0].log.join('\n'));
}

