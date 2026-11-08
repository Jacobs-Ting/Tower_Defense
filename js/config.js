/* =========================================================
 * 鋼鐵防線：1944 — 數值設定（所有平衡參數集中於此）
 * 注意：以下皆為「遊戲平衡數值」，並非真實武器性能。
 * ========================================================= */
(function (g) {
  const SD = (g.SD = g.SD || {});

  SD.CONFIG = {
    WIDTH: 1280,
    HEIGHT: 720,
    FIXED_DT: 1 / 60,          // 固定模擬步長（確保 1×/2× 結果一致）
    START_SUPPLY: 500,
    START_HQ: 20,
    SELL_RATIO: 0.5,           // 拆除退還已投入費用的 50%
    PREP_TIME: 20,             // 波次間準備時間（秒）
    EARLY_BONUS_PER_SEC: 2,    // 提前開波：每剩餘 1 秒獎勵補給
    WAVE_CLEAR_BONUS: 60,      // 過波基本獎勵（+ 波次 × 15）
    REPAIR_RATIO: 0.4,         // 由 0 修到滿耐久 = 建造費 × 0.4
    ROAD_WIDTH: 46,
    PAD_RADIUS: 27,
    MAX_PARTICLES: 650,
    AIR_WARNING_TIME: 3.2,     // 空襲預警秒數
  };

  /* 傷害類型 / 裝甲類型 */
  SD.DAMAGE_TYPES = {
    Bullet: '機槍子彈',
    Explosive: '高爆彈',
    ArmorPiercing: '穿甲彈',
    AntiAir: '防空火力',
  };
  SD.ARMOR_TYPES = {
    Infantry: '步兵',
    LightArmor: '輕型裝甲',
    MediumArmor: '中型裝甲',
    HeavyArmor: '重型裝甲',
    Aircraft: '空中單位',
  };
  SD.ARMOR_ORDER = ['Infantry', 'LightArmor', 'MediumArmor', 'HeavyArmor', 'Aircraft'];

  /* 傷害倍率表（依任務書） */
  SD.DAMAGE_TABLE = {
    mg:       { Infantry: 1.5, LightArmor: 0.2, MediumArmor: 0,   HeavyArmor: 0,   Aircraft: 0 },
    mortar:   { Infantry: 1.5, LightArmor: 0.6, MediumArmor: 0.2, HeavyArmor: 0.1, Aircraft: 0 },
    at57:     { Infantry: 0.5, LightArmor: 1.5, MediumArmor: 1.2, HeavyArmor: 0.4, Aircraft: 0 },
    at17:     { Infantry: 0.5, LightArmor: 1.5, MediumArmor: 1.5, HeavyArmor: 1.4, Aircraft: 0 },
    bofors:   { Infantry: 0.8, LightArmor: 0.5, MediumArmor: 0.1, HeavyArmor: 0,   Aircraft: 1.8 },
    howitzer: { Infantry: 1.8, LightArmor: 1.0, MediumArmor: 0.5, HeavyArmor: 0.3, Aircraft: 0 },
  };

  /* ---------------- 盟軍防禦武器 ----------------
   * levels[i]：damage 傷害、range 射程、interval 射擊間隔(s)
   * mag/reload：彈鏈/彈夾與換彈停火時間（不需玩家管理彈藥）
   * radius：爆炸半徑；scatter：落點散布；minRange：最小射程
   * hp：陣地耐久（空襲會造成損傷）
   * ---------------------------------------------- */
  SD.TOWERS = {
    mg: {
      name: 'Browning M1919 機槍陣地', short: 'M1919 機槍', role: '反步兵',
      cost: 100, unlockWave: 1, damageType: 'Bullet', fire: 'hitscan',
      targetsAir: false, turnSpeed: 9,
      desc: '射速快、傷害低，適合壓制大量步兵；對裝甲幾乎無效，不能對空。',
      levels: [
        { damage: 7,  range: 130, interval: 0.10, mag: 20, reload: 1.8, hp: 100, upCost: 0,   note: '基本機槍陣地' },
        { damage: 8,  range: 140, interval: 0.09, mag: 30, reload: 0.9, hp: 110, upCost: 90,  note: '增加彈藥補給：彈鏈更長，換彈停火時間縮短' },
        { damage: 10, range: 150, interval: 0.08, mag: 30, reload: 0.8, hp: 170, upCost: 140, note: '增設沙包、改善操作：陣地更耐打，射擊效率提高' },
      ],
    },
    mortar: {
      name: 'M2 60mm 迫擊砲', short: 'M2 迫擊砲', role: '反集群步兵',
      cost: 180, unlockWave: 3, damageType: 'Explosive', fire: 'ballistic',
      targetsAir: false, turnSpeed: 4, flightTime: 1.1, minRange: 70,
      desc: '高拋物線彈道、範圍爆炸；有最小射程，射速較慢，對重戰車效果有限。',
      levels: [
        { damage: 38, range: 210, interval: 2.4, radius: 48, scatter: 22, hp: 110, upCost: 0,   note: '標準迫擊砲' },
        { damage: 40, range: 215, interval: 1.8, radius: 50, scatter: 18, hp: 120, upCost: 150, note: '提升砲組裝填效率' },
        { damage: 48, range: 230, interval: 1.7, radius: 58, scatter: 6,  hp: 130, upCost: 210, note: '改善前進觀測與射擊修正：落點更準、殺傷範圍更大' },
      ],
    },
    at57: {
      name: 'M1 57mm 反戰車砲', short: 'M1 57mm', role: '反輕中型裝甲',
      cost: 260, unlockWave: 5, damageType: 'ArmorPiercing', fire: 'shell',
      targetsAir: false, turnSpeed: 3.2, shellSpeed: 950,
      desc: '高穿甲、單發傷害高、射速慢；對步兵效率低，對重戰車受裝甲影響。',
      levels: [
        { damage: 85,  range: 230, interval: 1.9, hp: 130, upCost: 0,   note: '標準反戰車砲' },
        { damage: 90,  range: 235, interval: 1.5, hp: 140, upCost: 200, note: '提高砲組操作效率' },
        { damage: 115, range: 250, interval: 1.4, hp: 150, upCost: 280, note: '改善瞄準並配發 M86 APC 被帽穿甲彈' },
      ],
    },
    at17: {
      name: 'QF 17-pounder 反戰車砲', short: '17磅砲', role: '重型裝甲剋星',
      cost: 450, unlockWave: 9, damageType: 'ArmorPiercing', fire: 'shell',
      targetsAir: false, turnSpeed: 2.4, shellSpeed: 1150,
      desc: '英軍重型反戰車砲，對豹式、虎式效果佳；射速慢、費用高，適合作為後期核心火力。',
      levels: [
        { damage: 200, range: 280, interval: 2.8, hp: 150, upCost: 0,   note: '標準 17 磅砲（英軍配屬，美英聯合防禦）' },
        { damage: 210, range: 290, interval: 2.3, hp: 160, upCost: 320, note: '提高砲組操作效率' },
        { damage: 270, range: 300, interval: 2.2, hp: 170, upCost: 420, note: '配發 APDS 脫殼穿甲彈（1944 年中投入使用）' },
      ],
    },
    bofors: {
      name: 'Bofors 40mm 防空砲', short: 'Bofors 40mm', role: '對空防禦',
      cost: 320, unlockWave: 7, damageType: 'AntiAir', fire: 'flak',
      targetsAir: true, groundTargets: ['Infantry', 'LightArmor'], turnSpeed: 6, shellSpeed: 1100,
      desc: '優先攻擊敵機，射速較快；僅能有限度攻擊步兵與輕裝甲，不是反戰車武器。',
      levels: [
        { damage: 16, range: 260, interval: 0.33, mag: 8, reload: 0.7, hp: 120, upCost: 0,   note: '標準防空砲' },
        { damage: 17, range: 265, interval: 0.27, mag: 8, reload: 0.5, hp: 130, upCost: 220, note: '強化裝填手輪替，四發彈夾持續供彈' },
        { damage: 21, range: 285, interval: 0.25, mag: 8, reload: 0.5, hp: 140, upCost: 300, note: '加裝 Kerrison 機械式射擊指揮儀（二戰時期裝備）' },
      ],
    },
    howitzer: {
      name: 'M2A1 105mm 榴彈砲', short: '105mm 榴彈砲', role: '遠距火力支援',
      cost: 600, unlockWave: 8, damageType: 'Explosive', fire: 'ballistic',
      targetsAir: false, turnSpeed: 1.6, flightTime: 1.8, minRange: 110,
      desc: '遠距離、大範圍爆炸、射速低、有最小射程；不具反戰車砲的穿甲優勢。',
      levels: [
        { damage: 90,  range: 400, interval: 4.5, radius: 72, scatter: 26, hp: 150, upCost: 0,   note: '標準榴彈砲' },
        { damage: 95,  range: 410, interval: 3.6, radius: 75, scatter: 20, hp: 160, upCost: 380, note: '提升砲組裝填效率' },
        { damage: 115, range: 430, interval: 3.4, radius: 84, scatter: 10, hp: 170, upCost: 480, note: '射擊指揮所協調與前進觀測官修正' },
      ],
    },
  };
  SD.TOWER_ORDER = ['mg', 'mortar', 'at57', 'bofors', 'howitzer', 'at17'];

  /* ---------------- 德軍單位 ---------------- */
  SD.ENEMIES = {
    infantry: {
      name: '德軍步兵', hp: 45, speed: 55, armor: 'Infantry', reward: 8, damageToBase: 1,
      isAir: false, radius: 7, category: 'infantry', lane: 13,
    },
    mg42: {
      name: 'MG42 機槍班', hp: 115, speed: 42, armor: 'Infantry', reward: 18, damageToBase: 1,
      isAir: false, radius: 9, category: 'infantry', lane: 8,
      suppress: { range: 165, cooldown: 5, duration: 2.6, factor: 1.7 },
    },
    halftrack: {
      name: 'Sd.Kfz. 251 半履帶車', hp: 260, speed: 82, armor: 'LightArmor', reward: 28, damageToBase: 2,
      isAir: false, radius: 15, category: 'vehicle', lane: 0,
    },
    panzer4: {
      name: 'Panzer IV 四號戰車', hp: 650, speed: 44, armor: 'MediumArmor', reward: 60, damageToBase: 3,
      isAir: false, radius: 18, category: 'vehicle', lane: 0,
    },
    panther: {
      name: 'Panther 豹式戰車', hp: 850, speed: 46, armor: 'HeavyArmor', reward: 95, damageToBase: 4,
      isAir: false, radius: 20, category: 'vehicle', lane: 0,
    },
    tiger: {
      name: 'Tiger I 虎式戰車', hp: 2500, speed: 30, armor: 'HeavyArmor', reward: 300, damageToBase: 10,
      isAir: false, radius: 23, category: 'vehicle', lane: 0, boss: true,
    },
    ju87: {
      name: 'Ju 87 俯衝轟炸機', hp: 170, speed: 120, armor: 'Aircraft', reward: 40, damageToBase: 0,
      isAir: true, radius: 22, category: 'aircraft',
      bombHQ: 2, bombDamage: 90, bombRadius: 55,
    },
  };

  /* ---------------- 波次資料表 ----------------
   * groups: { type, count, interval(每隻間隔秒), delay(此組開始秒) }
   * ------------------------------------------- */
  SD.WAVES = [
    { title: '先遣步兵', tip: '在道路旁的部署格建造 M1919 機槍。',
      groups: [{ type: 'infantry', count: 10, interval: 1.3, delay: 0 }] },
    { title: '步兵衝鋒', tip: '敵軍數量增加，讓多座機槍的火力覆蓋重疊。',
      groups: [{ type: 'infantry', count: 14, interval: 0.8, delay: 0 },
               { type: 'infantry', count: 12, interval: 0.6, delay: 14 }] },
    { title: '機槍班壓制', tip: '已解鎖 M2 迫擊砲：範圍爆炸可清除密集步兵與 MG42 機槍班。',
      groups: [{ type: 'infantry', count: 18, interval: 0.8, delay: 0 },
               { type: 'mg42', count: 4, interval: 3.5, delay: 4 }] },
    { title: '機械化先鋒', tip: '半履帶車具輕型裝甲，機槍效果很差，以迫擊砲應對。',
      groups: [{ type: 'infantry', count: 16, interval: 0.8, delay: 0 },
               { type: 'halftrack', count: 4, interval: 4, delay: 6 }] },
    { title: '裝甲來襲', tip: '已解鎖 M1 57mm 反戰車砲：四號戰車對機槍完全免疫。',
      groups: [{ type: 'infantry', count: 10, interval: 1, delay: 0 },
               { type: 'panzer4', count: 3, interval: 7, delay: 6 }] },
    { title: '混合突擊', tip: '步兵與裝甲混編，在彎道佈置交叉火力。',
      groups: [{ type: 'infantry', count: 20, interval: 0.7, delay: 0 },
               { type: 'mg42', count: 4, interval: 4, delay: 3 },
               { type: 'halftrack', count: 6, interval: 3, delay: 8 },
               { type: 'panzer4', count: 4, interval: 6, delay: 14 }] },
    { title: '德軍空襲', tip: '已解鎖 Bofors 40mm 防空砲。紅色標記為敵機預定轟炸點！',
      groups: [{ type: 'infantry', count: 14, interval: 0.9, delay: 0 },
               { type: 'halftrack', count: 4, interval: 4, delay: 6 },
               { type: 'ju87', count: 5, interval: 5, delay: 10 }] },
    { title: '空地協同', tip: '已解鎖 105mm 榴彈砲。同時管理地面與空中威脅。',
      groups: [{ type: 'infantry', count: 22, interval: 0.7, delay: 0 },
               { type: 'mg42', count: 4, interval: 4, delay: 4 },
               { type: 'halftrack', count: 6, interval: 3, delay: 6 },
               { type: 'panzer4', count: 5, interval: 5, delay: 12 },
               { type: 'ju87', count: 6, interval: 5, delay: 8 }] },
    { title: '豹式突破', tip: '已解鎖 QF 17-pounder。豹式為重型裝甲，需集中反戰車火力。',
      groups: [{ type: 'infantry', count: 24, interval: 0.7, delay: 0 },
               { type: 'mg42', count: 4, interval: 4, delay: 5 },
               { type: 'panzer4', count: 4, interval: 5, delay: 8 },
               { type: 'panther', count: 3, interval: 8, delay: 16 },
               { type: 'ju87', count: 3, interval: 6, delay: 10 }] },
    { title: '最終決戰：虎式', tip: 'Tiger I 與裝甲縱隊！集中所有反戰車火力守住指揮部。',
      groups: [{ type: 'infantry', count: 24, interval: 0.7, delay: 0 },
               { type: 'halftrack', count: 6, interval: 3, delay: 5 },
               { type: 'panzer4', count: 4, interval: 6, delay: 10 },
               { type: 'panther', count: 2, interval: 9, delay: 22 },
               { type: 'tiger', count: 1, interval: 1, delay: 30 },
               { type: 'ju87', count: 4, interval: 6, delay: 12 }] },
  ];
})(typeof window !== 'undefined' ? window : globalThis);
