/* =========================================================
 * 介面：頂部資訊列、武器面板、資訊面板、波次預告、提示訊息、覆蓋畫面
 * ========================================================= */
(function (g) {
  const SD = g.SD;
  const $ = id => document.getElementById(id);
  const EFF_COLORS = { Infantry: '#9ac45a', LightArmor: '#d6c35a', MediumArmor: '#e09b45', HeavyArmor: '#d9663f', Aircraft: '#6fb6e0' };

  function iconCanvas(w, h, draw) {
    const c = document.createElement('canvas');
    const dpr = Math.min(2, g.devicePixelRatio || 1);
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr); draw(ctx);
    return c;
  }
  const fmt = n => (Math.round(n * 100) / 100).toString();

  const UI = {
    init(game) {
      this.game = game; this.world = game.world;
      this.cache = {}; this.panelKey = ''; this.panelTimer = 0; this.lastSupply = null;
      this.buildWeaponList();
      this.bind();
      this.world.on((type, data) => this.onEvent(type, data));
    },

    buildWeaponList() {
      const list = $('weaponList'); list.innerHTML = '';
      this.cards = {};
      SD.TOWER_ORDER.forEach((k, i) => {
        const d = SD.TOWERS[k];
        const card = document.createElement('div');
        card.className = 'wcard'; card.dataset.key = k;
        card.appendChild(iconCanvas(50, 50, ctx => SD.drawTowerIcon(ctx, k, 25, 25, 1.05)));
        card.insertAdjacentHTML('beforeend', `<div class="name">${d.short}</div><div class="role">${d.role}</div>
          <div class="cost">⛁ ${d.cost}<span class="lock"></span></div><div class="hk">${i + 1}</div>`);
        card.addEventListener('click', () => this.game.selectBuild(k));
        card.title = d.name + '\n' + d.desc;
        list.appendChild(card);
        this.cards[k] = card;
      });
    },

    bind() {
      const G = this.game, W = this.world, A = SD.Audio;
      $('btnNewGame').onclick = () => { A.init(); G.newGame(); };
      $('btnRestart').onclick = () => { A.init(); G.newGame(); };
      $('btnHelp').onclick = $('btnHelp2').onclick = () => $('help').classList.remove('hidden');
      $('btnCloseHelp').onclick = () => $('help').classList.add('hidden');
      $('btnPause').onclick = () => G.togglePause();
      $('btnSpeed').onclick = () => G.toggleSpeed();
      $('btnStartWave').onclick = () => { A.init(); W.startWave(); };
      $('btnRepairAll').onclick = () => G.repairAll();
      $('btnSound').onclick = () => { A.init(); A.setEnabled(!A.enabled); };
      $('btnMusic').onclick = () => { A.init(); A.setMusic(!A.musicOn); };
      $('volume').oninput = e => { A.init(); A.setVolume(+e.target.value); };
      // 使用 pointerdown：面板會定時刷新，避免 click 在重繪間遺失
      $('infoPanel').addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
        G.panelAction(b.dataset.act);
      });
    },

    onEvent(type, data) {
      if (type === 'toast') this.toast(data);
      if (type === 'waveStart') { const d = SD.WAVES[data - 1]; this.banner(`第 ${data} 波：${d.title}`, '敵軍來襲！', false, 2.2); }
      if (type === 'airWarning') this.banner('⚠ 空襲警告', '紅色標記為敵機轟炸目標，部署 Bofors 攔截！', true, 1.8);
      if (type === 'unlock') { const d = SD.TOWERS[data]; this.cards[data].classList.add('new'); this.toast(`新武器解鎖：${d.name}`); }
      if (type === 'end') setTimeout(() => this.showEnd(data), 1300);
      if (type === 'state') { this.panelKey = ''; }
    },

    toast(msg, err) {
      const el = document.createElement('div'); el.className = 'toast' + (err ? ' err' : ''); el.textContent = msg;
      const box = $('toasts'); box.appendChild(el);
      while (box.children.length > 4) box.firstChild.remove();
      setTimeout(() => el.remove(), 2600);
    },

    banner(title, sub, alert, sec) {
      const b = $('banner');
      b.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
      b.className = 'show' + (alert ? ' alert' : '');
      clearTimeout(this.bannerT);
      this.bannerT = setTimeout(() => b.className = alert ? 'alert' : '', sec * 1000);
    },

    set(id, val) { if (this.cache[id] !== val) { this.cache[id] = val; $(id).textContent = val; } },

    /** 每幀呼叫：只在數值改變時更新 DOM */
    refresh(dt) {
      const W = this.world, G = this.game;
      this.set('sWave', `${Math.min(W.currentWave, SD.WAVES.length)} / ${SD.WAVES.length}`);
      this.set('sSupply', W.supply);
      this.set('sHq', `${W.hq} / ${W.maxHq}`);
      this.set('sKills', W.stats.kills);
      const hqEl = $('sHq').parentElement;
      hqEl.classList.toggle('danger', W.hq <= 5 && W.state !== 'MENU');
      if (this.lastHq != null && W.hq < this.lastHq) { hqEl.classList.remove('flash'); void hqEl.offsetWidth; hqEl.classList.add('flash'); }
      this.lastHq = W.hq;
      this.set('btnPause', W.state === 'PAUSED' ? '▶ 繼續' : '⏸ 暫停');
      $('btnPause').classList.toggle('on', W.state === 'PAUSED');
      this.set('btnSpeed', G.speed + '×');
      $('btnSpeed').classList.toggle('on', G.speed === 2);
      this.set('btnSound', SD.Audio.enabled ? '🔊' : '🔇');
      $('btnMusic').classList.toggle('on', SD.Audio.musicOn);

      // 武器卡片狀態
      for (const k of SD.TOWER_ORDER) {
        const c = this.cards[k], d = SD.TOWERS[k], un = W.isUnlocked(k);
        const state = `${un}|${W.supply >= d.cost}|${G.buildKey === k}`;
        if (c._s === state) continue; c._s = state;
        c.classList.toggle('locked', !un);
        c.classList.toggle('poor', un && W.supply < d.cost);
        c.classList.toggle('selected', G.buildKey === k);
        c.querySelector('.lock').textContent = un ? '' : `　🔒 第 ${d.unlockWave} 波`;
        if (G.buildKey === k) c.classList.remove('new');
      }

      // 開波按鈕 / 預告
      const prep = W.state === 'PREPARATION' || (W.state === 'PAUSED' && W.prevState === 'PREPARATION');
      const btn = $('btnStartWave');
      btn.disabled = W.state !== 'PREPARATION';
      let label;
      if (prep) {
        const bonus = W.earlyBonus();
        label = isFinite(W.prepTimer) ? `▶ 開始第 ${W.currentWave} 波（+${bonus}）· ${Math.ceil(W.prepTimer)}s` : `▶ 開始第 ${W.currentWave} 波`;
      } else if (W.state === 'PLAYING' || W.state === 'PAUSED') label = `交戰中 · 剩餘 ${W.spawner ? W.spawner.remaining + W.enemies.length + W.airWarnings.length : 0} 敵`;
      else label = '—';
      this.set('btnStartWave', label);
      const rc = W.repairAllCost();
      $('btnRepairAll').classList.toggle('hidden', !(prep && rc > 0));
      this.set('btnRepairAll', `🔧 全部修復（${rc}）`);
      const pk = `${W.currentWave}|${prep}`;
      if (this.previewKey !== pk) { this.previewKey = pk; this.renderPreview(prep); }

      // 右側面板（節流）
      this.panelTimer -= dt;
      const key = (G.selected ? 't' + G.selected.id : G.buildKey ? 'b' + G.buildKey : 'none') + W.state;
      if (key !== this.panelKey || this.panelTimer <= 0) { this.panelKey = key; this.panelTimer = 0.15; this.renderPanel(); }
    },

    renderPreview(prep) {
      const W = this.world, box = $('wavePreview');
      const s = SD.waveSummary(W.currentWave - 1);
      box.innerHTML = '';
      if (!s || W.state === 'MENU') return;
      box.insertAdjacentHTML('beforeend', `<span class="wtitle">${prep ? '下一波預告' : '本波敵軍'} · Wave ${W.currentWave}「${s.title}」</span>`);
      for (const [type, n] of Object.entries(s.counts)) {
        const u = document.createElement('span'); u.className = 'unit'; u.title = SD.ENEMIES[type].name;
        u.appendChild(iconCanvas(34, 26, ctx => SD.drawUnitIcon(ctx, type, 17, 13, type === 'ju87' ? 0.5 : type === 'tiger' || type === 'panther' ? 0.5 : type === 'infantry' || type === 'mg42' ? 1.1 : 0.62)));
        u.insertAdjacentHTML('beforeend', `<span>${SD.ENEMIES[type].name.replace(/^Sd\.Kfz\. 251 /, '')} ×${n}</span>`);
        box.appendChild(u);
      }
      if (s.hasAir) box.insertAdjacentHTML('beforeend', '<span class="tag">⚠ 空襲</span>');
      if (s.hasHeavy) box.insertAdjacentHTML('beforeend', '<span class="tag heavy">重裝甲</span>');
      box.insertAdjacentHTML('beforeend', `<div class="tip">💡 ${s.tip}</div>`);
    },

    effBars(key) {
      const t = SD.DAMAGE_TABLE[key];
      return `<div class="eff"><h4>對各目標效果（傷害倍率）</h4>` + SD.ARMOR_ORDER.map(a => {
        const v = t[a];
        return `<div class="eff-row"><span>${SD.ARMOR_TYPES[a]}</span><div class="b"><i style="width:${Math.min(100, v / 1.8 * 100)}%;background:${EFF_COLORS[a]}"></i></div><em>${v === 0 ? '無效' : '×' + v}</em></div>`;
      }).join('') + '</div>';
    },

    statRows(def, s, n) {
      const row = (label, cur, next, unit = '', lowerBetter) => {
        const changed = n && next != null && next !== cur;
        return `<span>${label}</span><span>${fmt(cur)}${unit}${changed ? ` <b class="up">→ ${fmt(next)}${unit}</b>` : ''}</span>`;
      };
      let h = row('攻擊力', s.damage, n && n.damage) + row('射程', s.range, n && n.range) + row('射擊間隔', s.interval, n && n.interval, ' 秒');
      if (s.mag) h += row('彈鏈/彈夾', s.mag, n && n.mag, ' 發') + row('換彈停火', s.reload, n && n.reload, ' 秒');
      if (s.radius) h += row('爆炸半徑', s.radius, n && n.radius) + row('落點散布', s.scatter, n && n.scatter);
      if (def.minRange) h += `<span>最小射程</span><span>${def.minRange}</span>`;
      h += row('陣地耐久', s.hp, n && n.hp);
      h += `<span>傷害類型</span><span>${SD.DAMAGE_TYPES[def.damageType]}</span>`;
      h += `<span>對空能力</span><span>${def.targetsAir ? '✔ 可攻擊飛機' : '✘ 不可對空'}</span>`;
      return h;
    },

    renderPanel() {
      const G = this.game, W = this.world, box = $('infoPanel');
      let html = '';
      const head = (key, title, lv, role) => `<div class="info-head"><canvas data-icon="${key}"></canvas><div><h3>${title}</h3><div class="lv">${lv}</div><div class="role">${role}</div></div></div>`;
      if (G.selected) {
        const t = G.selected, d = t.def, s = t.stats, n = t.nextStats;
        const prep = W.state === 'PREPARATION' || (W.state === 'PAUSED' && W.prevState === 'PREPARATION');
        html += head(t.key, d.name, `Lv.${t.level + 1} / 3`, d.role);
        const hpR = t.hp / t.maxHp;
        html += `<div class="kv"><span>陣地狀態</span><span>${t.disabled ? '<b style="color:#ff8a6a">失能</b>' : t.suppressT > 0 ? '<b style="color:#ffb070">遭壓制</b>' : '正常'} · ${Math.ceil(t.hp)}/${t.maxHp}
          <div class="bar"><i style="width:${hpR * 100}%;background:${hpR > .5 ? '#8cc152' : hpR > .25 ? '#e8b04a' : '#d9442f'}"></i></div></span>
          ${this.statRows(d, s, n)}
          <span>累積擊毀</span><span><b>${t.kills}</b></span>
          <span>累積傷害</span><span>${Math.round(t.damageDealt)}</span></div>`;
        if (n) html += `<div class="note">升級 Lv.${t.level + 2}：${n.note}</div>
          <button class="btn primary full" data-act="upgrade" ${W.supply < n.upCost ? 'disabled' : ''}>⬆ 升級（⛁ ${n.upCost}）</button>`;
        else html += `<div class="note">已達最高等級：${s.note}</div>`;
        if (t.repairCost > 0) html += `<button class="btn secondary full" data-act="repair" ${!prep || W.supply < t.repairCost ? 'disabled' : ''}>🔧 修復（⛁ ${t.repairCost}）${prep ? '' : '· 僅準備階段'}</button>`;
        html += `<button class="btn danger full" data-act="sell">✖ 拆除（退還 ⛁ ${t.sellValue}）</button>`;
        html += this.effBars(t.key);
      } else if (G.buildKey) {
        const k = G.buildKey, d = SD.TOWERS[k];
        html += head(k, d.name, `建造費用 ⛁ ${d.cost}`, d.role);
        html += `<div class="desc">${d.desc}</div><div class="kv">${this.statRows(d, d.levels[0], null)}</div>`;
        html += `<div class="note">部署模式：將滑鼠移到<b style="color:#4c9a3a">綠色部署格</b>上點擊建造。右鍵或 Esc 取消。</div>`;
        html += this.effBars(k);
      } else {
        html += `<h2>戰情簡報</h2><div class="desc">選擇左側武器後點擊道路旁的部署格建造；點選已建陣地可升級、拆除或修復。</div>`;
        html += `<div class="info-section"><h4>敵軍情報</h4>`;
        const seen = new Set();
        for (let i = 0; i < Math.min(SD.WAVES.length, W.currentWave); i++) for (const gr of SD.WAVES[i].groups) seen.add(gr.type);
        for (const type of Object.keys(SD.ENEMIES)) {
          if (!seen.has(type)) continue;
          const e = SD.ENEMIES[type];
          html += `<div class="intel"><canvas data-unit="${type}"></canvas><div><b>${e.name}</b><small>${SD.ARMOR_TYPES[e.armor]} · 耐久 ${e.hp} · 速度 ${e.speed}${e.suppress ? ' · 壓制射擊' : ''}${e.isAir ? ' · 空襲' : ''}</small></div></div>`;
        }
        html += `</div>`;
      }
      if (box._html !== html) {
        box._html = html; box.innerHTML = html;
        box.querySelectorAll('canvas[data-icon]').forEach(c => { const k = c.dataset.icon; c.replaceWith(iconCanvas(56, 56, ctx => SD.drawTowerIcon(ctx, k, 28, 28, 1.2))); });
        box.querySelectorAll('canvas[data-unit]').forEach(c => { const k = c.dataset.unit; const s = { infantry: 1.3, mg42: 1.1, halftrack: 0.75, panzer4: 0.62, panther: 0.55, tiger: 0.5, ju87: 0.6 }[k]; c.replaceWith(iconCanvas(44, 32, ctx => SD.drawUnitIcon(ctx, k, 22, 16, s))); });
      }
    },

    showEnd(win) {
      const W = this.world, s = W.stats;
      $('endTitle').textContent = win ? '防線守住了！' : '指揮部遭到突破！';
      $('endTitle').style.color = win ? '#2f5a1e' : '#8a2a18';
      $('endSub').textContent = win ? '德軍攻勢已被粉碎，諾曼第防線屹立不搖。' : `防線在第 ${W.currentWave} 波失守。重整部署，再戰一次！`;
      const rows = [
        ['生存波次', `${W.wavesCleared} / ${SD.WAVES.length}`],
        ['擊毀步兵', s.infantry], ['擊毀裝甲車輛', s.vehicles], ['擊落飛機', s.aircraft],
        ['指揮部剩餘耐久', `${W.hq} / ${W.maxHq}`],
      ];
      $('endStats').innerHTML = rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('') + `<tr class="total"><td>總分</td><td>${W.finalScore().toLocaleString()}</td></tr>`;
      $('endScreen').classList.remove('hidden');
    },
  };

  SD.UI = UI;
})(typeof window !== 'undefined' ? window : globalThis);
