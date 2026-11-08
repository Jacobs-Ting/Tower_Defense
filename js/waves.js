/* =========================================================
 * 波次生成器：依 SD.WAVES 資料表展開成時間序列
 * ========================================================= */
(function (g) {
  const SD = g.SD;

  class Spawner {
    constructor(world, waveIndex) {
      this.world = world;
      const def = SD.WAVES[waveIndex];
      this.queue = [];
      for (const gr of def.groups)
        for (let i = 0; i < gr.count; i++) this.queue.push({ time: gr.delay + i * gr.interval, type: gr.type, hpMul: gr.hpMul || 1 });
      this.queue.sort((a, b) => a.time - b.time);
      this.t = 0; this.idx = 0;
      this.total = this.queue.length;
    }
    update(dt) {
      this.t += dt;
      while (this.idx < this.queue.length && this.queue[this.idx].time <= this.t) {
        const q = this.queue[this.idx++];
        this.world.spawn(q.type, q.hpMul);
      }
    }
    get done() { return this.idx >= this.queue.length; }
    get remaining() { return this.queue.length - this.idx; }
  }

  /** 波次敵軍統計（預告用） */
  function waveSummary(i) {
    const def = SD.WAVES[i]; if (!def) return null;
    const counts = {};
    for (const gr of def.groups) counts[gr.type] = (counts[gr.type] || 0) + gr.count;
    const hasAir = !!counts.ju87;
    const hasHeavy = !!(counts.tiger || counts.panther);
    const unlocks = SD.TOWER_ORDER.filter(k => SD.TOWERS[k].unlockWave === i + 1 && i > 0);
    return { title: def.title, tip: def.tip, counts, hasAir, hasHeavy, unlocks };
  }

  SD.Spawner = Spawner;
  SD.waveSummary = waveSummary;
})(typeof window !== 'undefined' ? window : globalThis);
