/* =========================================================
 * 地圖：諾曼第鄉村防線 — 道路 Waypoints、部署格、背景繪製
 * ========================================================= */
(function (g) {
  const SD = g.SD;
  const C = SD.CONFIG;

  // 可重現的亂數（讓每次地圖裝飾一致）
  function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  const WAYPOINTS = [
    [-40, 150], [250, 150], [250, 540], [540, 540], [540, 230],
    [850, 230], [850, 570], [1090, 570], [1090, 340], [1170, 340],
  ];
  const HQ = { x: 1218, y: 340, r: 46 };

  // 預先計算線段
  const segs = [];
  let total = 0;
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const [x1, y1] = WAYPOINTS[i], [x2, y2] = WAYPOINTS[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    segs.push({ x1, y1, x2, y2, len, start: total, dx: (x2 - x1) / len, dy: (y2 - y1) / len });
    total += len;
  }

  /** 依沿道路距離取得座標與方向 */
  function pointAt(d) {
    if (d <= 0) { const s = segs[0]; return { x: s.x1 + s.dx * d, y: s.y1 + s.dy * d, angle: Math.atan2(s.dy, s.dx), nx: -s.dy, ny: s.dx }; }
    for (const s of segs) {
      if (d <= s.start + s.len) {
        const t = d - s.start;
        return { x: s.x1 + s.dx * t, y: s.y1 + s.dy * t, angle: Math.atan2(s.dy, s.dx), nx: -s.dy, ny: s.dx };
      }
    }
    const s = segs[segs.length - 1];
    return { x: s.x2, y: s.y2, angle: Math.atan2(s.dy, s.dx), nx: -s.dy, ny: s.dx };
  }

  /** 點到道路折線的最短距離 */
  function distToPath(x, y) {
    let best = Infinity;
    for (const s of segs) {
      let t = (x - s.x1) * s.dx + (y - s.y1) * s.dy;
      t = Math.max(0, Math.min(s.len, t));
      const px = s.x1 + s.dx * t, py = s.y1 + s.dy * t;
      best = Math.min(best, Math.hypot(x - px, y - py));
    }
    return best;
  }

  /* ---------- 預先定義部署格（沿道路兩側自動排列，固定不變） ---------- */
  const pads = [];
  (function buildPads() {
    const cand = [];
    for (let y = 46; y <= C.HEIGHT - 46; y += 22) {
      for (let x = 46; x <= 1150; x += 22) {
        const d = distToPath(x, y);
        if (d >= 60 && d <= 108 && Math.hypot(x - HQ.x, y - HQ.y) > 110) cand.push({ x, y, d });
      }
    }
    cand.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
    for (const c of cand) {
      if (pads.every(p => Math.hypot(p.x - c.x, p.y - c.y) >= 70)) pads.push({ id: pads.length, x: c.x, y: c.y });
    }
  })();

  /* ---------- 裝飾物（避開道路與部署格） ---------- */
  const decor = { fields: [], trees: [], walls: [], houses: [], sandbags: [], craters: [], bushes: [] };
  (function buildDecor() {
    const r = rng(1944);
    const free = (x, y, m) => distToPath(x, y) > C.ROAD_WIDTH / 2 + m &&
      pads.every(p => Math.hypot(p.x - x, p.y - y) > C.PAD_RADIUS + m) &&
      Math.hypot(x - HQ.x, y - HQ.y) > HQ.r + m + 20;
    // 村莊房屋（固定位置挑選可用者）
    const houseSpots = [[70, 300], [80, 420], [130, 640], [380, 60], [420, 360], [690, 390], [700, 650], [960, 80], [1000, 420], [1230, 640], [1230, 70], [660, 90]];
    for (const [x, y] of houseSpots) {
      const w = 46 + r() * 22, h = 34 + r() * 14;
      if (free(x, y, 34) && free(x - w / 2, y - h / 2, 10) && free(x + w / 2, y + h / 2, 10) && free(x + w / 2, y - h / 2, 10) && free(x - w / 2, y + h / 2, 10))
        decor.houses.push({ x, y, w, h, rot: (r() - 0.5) * 0.3, roof: r() < 0.5 ? '#8a4b38' : '#6f5a4a' });
    }
    // 農田
    for (let i = 0; i < 40 && decor.fields.length < 9; i++) {
      const x = 40 + r() * 1150, y = 30 + r() * 660, w = 80 + r() * 90, h = 60 + r() * 60;
      let ok = true;
      for (let a = 0; a <= 1; a += 0.5) for (let b = 0; b <= 1; b += 0.5) if (!free(x + w * a, y + h * b, 6)) ok = false;
      if (ok && decor.fields.every(f => x + w < f.x - 10 || x > f.x + f.w + 10 || y + h < f.y - 10 || y > f.y + f.h + 10))
        decor.fields.push({ x, y, w, h, hue: r(), rot: r() < 0.5 });
    }
    const inField = (x, y) => decor.fields.some(f => x > f.x - 6 && x < f.x + f.w + 6 && y > f.y - 6 && y < f.y + f.h + 6);
    const inHouse = (x, y) => decor.houses.some(hh => Math.abs(x - hh.x) < hh.w / 2 + 12 && Math.abs(y - hh.y) < hh.h / 2 + 12);
    // 樹木
    for (let i = 0; i < 400 && decor.trees.length < 75; i++) {
      const x = r() * C.WIDTH, y = r() * C.HEIGHT;
      if (free(x, y, 16) && !inField(x, y) && !inHouse(x, y)) decor.trees.push({ x, y, s: 10 + r() * 9, t: r() });
    }
    for (let i = 0; i < 200 && decor.bushes.length < 50; i++) {
      const x = r() * C.WIDTH, y = r() * C.HEIGHT;
      if (free(x, y, 8) && !inHouse(x, y)) decor.bushes.push({ x, y, s: 4 + r() * 4 });
    }
    // 石牆（沿田邊）
    for (const f of decor.fields) {
      if (r() < 0.7) decor.walls.push({ x1: f.x - 4, y1: f.y - 6, x2: f.x + f.w + 4, y2: f.y - 6 });
      if (r() < 0.5) decor.walls.push({ x1: f.x - 6, y1: f.y, x2: f.x - 6, y2: f.y + f.h });
    }
    // 彈坑
    for (let i = 0; i < 120 && decor.craters.length < 22; i++) {
      const x = r() * C.WIDTH, y = r() * C.HEIGHT;
      if (free(x, y, 6) && !inHouse(x, y)) decor.craters.push({ x, y, s: 6 + r() * 9 });
    }
  })();

  /* ---------- 背景預先繪製到離屏 Canvas ---------- */
  function renderBackground(doc) {
    const cv = doc.createElement('canvas');
    cv.width = C.WIDTH; cv.height = C.HEIGHT;
    const ctx = cv.getContext('2d');
    const r = rng(7);

    // 草地底色 + 斑駁
    ctx.fillStyle = '#6d8a4a';
    ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
    for (let i = 0; i < 2600; i++) {
      const x = r() * C.WIDTH, y = r() * C.HEIGHT, s = 2 + r() * 14;
      ctx.fillStyle = `rgba(${70 + r() * 60 | 0},${100 + r() * 50 | 0},${40 + r() * 30 | 0},${0.12 + r() * 0.15})`;
      ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2); ctx.fill();
    }
    // 農田
    for (const f of decor.fields) {
      ctx.save();
      const base = f.hue < 0.33 ? [176, 154, 84] : f.hue < 0.66 ? [128, 138, 66] : [150, 120, 80];
      ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.strokeStyle = `rgba(60,45,25,0.25)`; ctx.lineWidth = 2;
      ctx.beginPath();
      if (f.rot) for (let x = f.x + 6; x < f.x + f.w; x += 8) { ctx.moveTo(x, f.y + 2); ctx.lineTo(x, f.y + f.h - 2); }
      else for (let y = f.y + 6; y < f.y + f.h; y += 8) { ctx.moveTo(f.x + 2, y); ctx.lineTo(f.x + f.w - 2, y); }
      ctx.stroke();
      ctx.restore();
    }
    // 樹籬灌木
    for (const b of decor.bushes) {
      ctx.fillStyle = '#4a6a32';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.s, 0, Math.PI * 2); ctx.fill();
    }
    // 道路：外緣陰影 → 泥土 → 車轍
    const roadPath = () => {
      ctx.beginPath();
      WAYPOINTS.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.lineTo(HQ.x - 20, HQ.y);
    };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    roadPath(); ctx.strokeStyle = '#5b4a30'; ctx.lineWidth = C.ROAD_WIDTH + 8; ctx.stroke();
    roadPath(); ctx.strokeStyle = '#a58a5c'; ctx.lineWidth = C.ROAD_WIDTH; ctx.stroke();
    roadPath(); ctx.strokeStyle = '#b89c6b'; ctx.lineWidth = C.ROAD_WIDTH - 16; ctx.stroke();
    ctx.setLineDash([10, 9]);
    for (const off of [-9, 9]) {
      ctx.save();
      ctx.beginPath();
      for (let d = 0; d < total; d += 6) {
        const p = pointAt(d);
        const x = p.x + p.nx * off, y = p.y + p.ny * off;
        d ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.strokeStyle = 'rgba(90,70,40,0.45)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }
    ctx.setLineDash([]);
    // 道路碎石
    for (let i = 0; i < 500; i++) {
      const p = pointAt(r() * total);
      const o = (r() - 0.5) * C.ROAD_WIDTH * 0.9;
      ctx.fillStyle = `rgba(${90 + r() * 40 | 0},${70 + r() * 30 | 0},${45},0.5)`;
      ctx.fillRect(p.x + p.nx * o, p.y + p.ny * o, 2, 2);
    }
    // 彈坑
    for (const c of decor.craters) drawCrater(ctx, c.x, c.y, c.s, 1);
    // 石牆
    for (const w of decor.walls) {
      const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1), n = Math.floor(len / 7);
      for (let i = 0; i <= n; i++) {
        const t = i / Math.max(1, n), x = w.x1 + (w.x2 - w.x1) * t, y = w.y1 + (w.y2 - w.y1) * t;
        ctx.fillStyle = r() < 0.5 ? '#9a978a' : '#86837a';
        ctx.fillRect(x - 3.5, y - 3, 7, 6);
        ctx.strokeStyle = 'rgba(40,40,35,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(x - 3.5, y - 3, 7, 6);
      }
    }
    // 房屋
    for (const h of decor.houses) {
      ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.rot);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-h.w / 2 + 5, -h.h / 2 + 6, h.w, h.h);
      ctx.fillStyle = '#d9cfb4'; ctx.fillRect(-h.w / 2, -h.h / 2, h.w, h.h);
      ctx.fillStyle = h.roof;
      ctx.beginPath(); ctx.moveTo(-h.w / 2 - 3, -h.h / 2 - 2); ctx.lineTo(h.w / 2 + 3, -h.h / 2 - 2); ctx.lineTo(h.w / 2 + 3, 0); ctx.lineTo(-h.w / 2 - 3, 0); ctx.fill();
      ctx.fillStyle = shade(h.roof, -25);
      ctx.beginPath(); ctx.moveTo(-h.w / 2 - 3, 0); ctx.lineTo(h.w / 2 + 3, 0); ctx.lineTo(h.w / 2 + 3, h.h / 2 + 2); ctx.lineTo(-h.w / 2 - 3, h.h / 2 + 2); ctx.fill();
      ctx.strokeStyle = 'rgba(40,20,10,0.5)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-h.w / 2 - 3, 0); ctx.lineTo(h.w / 2 + 3, 0); ctx.stroke();
      ctx.fillStyle = '#7d756a'; ctx.fillRect(h.w / 4, -h.h / 2 - 6, 7, 9); // 煙囪
      ctx.restore();
    }
    // 樹木（陰影 + 樹冠）
    for (const t of decor.trees) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(t.x + 5, t.y + 6, t.s, t.s * 0.8, 0, 0, Math.PI * 2); ctx.fill();
      const col = t.t < 0.5 ? ['#3e5e2a', '#557a36', '#6e9444'] : ['#43622c', '#5c8038', '#789c4a'];
      ctx.fillStyle = col[0]; ctx.beginPath(); ctx.arc(t.x, t.y, t.s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col[1]; ctx.beginPath(); ctx.arc(t.x - t.s * 0.25, t.y - t.s * 0.25, t.s * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col[2]; ctx.beginPath(); ctx.arc(t.x - t.s * 0.4, t.y - t.s * 0.4, t.s * 0.32, 0, Math.PI * 2); ctx.fill();
    }
    // 道路邊沙包陣地（裝飾）
    const sbSpots = [[30, 105], [30, 195]];
    for (const [x, y] of sbSpots) drawSandbagLine(ctx, x, y, 40, 0);
    // 入口標示
    ctx.fillStyle = 'rgba(160,40,30,0.85)';
    ctx.font = 'bold 13px "Noto Sans TC", sans-serif';
    ctx.fillText('德軍進攻方向 ▶', 8, 194);
    // 暗角
    const vg = ctx.createRadialGradient(C.WIDTH / 2, C.HEIGHT / 2, 300, C.WIDTH / 2, C.HEIGHT / 2, 820);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,18,10,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, C.WIDTH, C.HEIGHT);
    return cv;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.max(0, Math.min(255, v + amt));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }

  function drawCrater(ctx, x, y, s, alpha) {
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(70,55,35,0.55)';
    ctx.beginPath(); ctx.ellipse(x, y, s * 1.3, s * 1.1, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(40,30,20,0.7)';
    ctx.beginPath(); ctx.ellipse(x, y, s * 0.75, s * 0.6, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawSandbagLine(ctx, x, y, len, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    for (let i = 0; i < len; i += 9) {
      ctx.fillStyle = '#b9a473'; ctx.beginPath(); ctx.ellipse(i, 0, 5.5, 3.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(70,55,30,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  /** 指揮部繪製 */
  function drawHQ(ctx, hq, maxHq, shake, time) {
    const x = HQ.x + (shake ? (Math.random() - 0.5) * shake : 0), y = HQ.y;
    ctx.save();
    // 沙包環
    for (let a = 0; a < Math.PI * 2; a += 0.33) {
      const sx = x + Math.cos(a) * 50, sy = y + Math.sin(a) * 50;
      ctx.fillStyle = '#b9a473'; ctx.beginPath(); ctx.ellipse(sx, sy, 7, 4.5, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(70,55,30,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // 掩體
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - 30, y - 22, 66, 50);
    ctx.fillStyle = '#7b7d64'; ctx.fillRect(x - 34, y - 26, 66, 50);
    ctx.fillStyle = '#5f614c'; ctx.fillRect(x - 34, y - 26, 66, 10);
    ctx.fillStyle = '#2b2c22'; ctx.fillRect(x - 24, y - 4, 44, 6);
    // 白星標誌
    ctx.fillStyle = '#eee8d2'; ctx.beginPath(); ctx.arc(x - 2, y + 13, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a5a3a'; star(ctx, x - 2, y + 13, 6, 2.6);
    // 旗桿
    ctx.strokeStyle = '#3a3a30'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 24, y - 26); ctx.lineTo(x + 24, y - 58); ctx.stroke();
    const wave = Math.sin(time * 4) * 2;
    ctx.fillStyle = '#d9d0b0';
    ctx.beginPath(); ctx.moveTo(x + 24, y - 58); ctx.lineTo(x + 46, y - 54 + wave); ctx.lineTo(x + 24, y - 46); ctx.fill();
    ctx.fillStyle = '#556b3a'; star(ctx, x + 32, y - 53, 3.5, 1.5);
    // 耐久條
    const w = 70, ratio = Math.max(0, hq / maxHq);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 2, y + 34, w + 4, 9);
    ctx.fillStyle = ratio > 0.5 ? '#7fae4c' : ratio > 0.25 ? '#e0a83a' : '#d2452f';
    ctx.fillRect(x - w / 2, y + 36, w * ratio, 5);
    ctx.fillStyle = '#efe6c8'; ctx.font = 'bold 11px "Noto Sans TC", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('盟軍指揮部', x, y + 56);
    ctx.restore();
  }

  function star(ctx, x, y, R, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
  }

  SD.MAP = { WAYPOINTS, HQ, segs, length: total, pointAt, distToPath, pads, decor, renderBackground, drawHQ, drawCrater, drawSandbagLine, star, shade };
})(typeof window !== 'undefined' ? window : globalThis);
