// ตัวคุมเกม 1 ห้อง (รันบนเครื่องเจ้าของห้อง หรือเล่นกับบอท) — ไม่ยุ่งกับหน้าจอ
// ที่นั่ง (seat) แต่ละฝั่งเป็น "local" (คนบนเครื่องนี้) / "remote" (เพื่อนผ่านเน็ต) / "bot"
// ผู้เล่นเห็นเกมผ่าน view(i) เท่านั้น (ไม่เห็นมือ/เดคของอีกฝ่าย) และสั่งเกมผ่าน act(i, action)
//   action: { t: "mull", idx: [ตำแหน่งในมือ] } | { t: "summon", k, f: [ตำแหน่งการ์ดที่ทิ้ง] } | { t: "cast", k }
//           | { t: "attack", uid, target: uid | "face" } | { t: "end" }
(function (root) {
  "use strict";
  const E = typeof module !== "undefined" ? require("./engine.js") : root.Engine;
  const sleep = (ms) => (ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

  class Session {
    // o: { cards: [Card], decks: [สาย, สาย], names, seats, seed, onView(i, view), onLog(s), ask(i, payload) → Promise<ตำแหน่งตัวเลือก|null>, botDelay }
    constructor(o) {
      Object.assign(this, { botDelay: 600, watch: false }, o);
      this.G = new E.Game(E.buildDeck(o.cards, o.decks[0]), E.buildDeck(o.cards, o.decks[1]), o.seed, (s) => this.onLog(s));
      this.G.P.forEach((p, i) => (p.name = o.names[i]));
      this.fxq = []; this.G.onFx = (e) => this.fxq.push(e);
      this.phase = "mull"; this.mullDone = [false, false]; this.busy = false;
      this.reactFn = (d, info) => this.react(d, info);
    }
    start() {
      this.G.P.forEach((p, i) => { if (this.seats[i] === "bot") { this.G.botMulligan(p); this.mullDone[i] = true; } });
      if (this.mullDone.every(Boolean)) return this.begin();
      this.push();
    }
    begin() {                                                         // ทั้งสองฝั่ง mulligan เสร็จ → สุ่มคนเริ่ม
      const G = this.G; this.phase = "play"; G.cur = G.rnd() < 0.5 ? 0 : 1; this.onLog(`${G.P[G.cur].name} เริ่มก่อน`);
      return this.nextTurn();
    }
    push() {                                                        // ส่ง view ล่าสุด + เหตุการณ์ที่เกิดตั้งแต่ครั้งก่อน (fx) ให้ทุกคน
      const fx = this.fxq; this.fxq = [];
      for (const i of [0, 1]) if (this.seats[i] !== "bot" || (this.watch && i === 0)) this.onView(i, { ...this.view(i), fx });
    }

    // ---------- มุมมองของผู้เล่น i (ข้อมูลล้วน ส่งผ่านเน็ตได้)
    view(i) {
      const G = this.G, p = G.P[i], e = G.other(p);
      const my = this.phase === "play" && G.P[G.cur] === p && !this.busy && !G.winner;
      const status = (x) => {
        const s = [];
        if (x.frozen) s.push("❄ แช่แข็ง"); if (x.hatch) s.push(`🥚 ${x.hatch[0]}`); if (x.armor) s.push(`เกราะ ${x.armor}`);
        if (x.has("โล่แสง")) s.push("โล่แสง"); if (x.stolenFrom) s.push("ยึดมา"); if (x.attached.length) s.push(`อัปเกรด ×${x.attached.length}`);
        return s;
      };
      const unit = (owner, x, mine) => {
        const v = { uid: x.uid, id: x.card ? x.card.id : null, tok: x.card ? null : { name: x.name, kinds: [...x.kinds], power: x.power },
          power: mine && my ? G.eff(owner, x, true) : G.eff(owner, x), status: status(x), atkErr: "ยังไม่ใช่ตาคุณ", targets: [], pred: {} };
        if (mine && my) {
          const ts = G.canAttack(p, x) ? [] : G.targets(p, x);
          v.atkErr = G.canAttack(p, x) || (ts.length ? null : "ไม่มีเป้าหมายที่ตีได้");
          for (const t of ts) {
            if (t === "face") { v.targets.push("face"); continue; }
            v.targets.push(t.uid);
            const A = G.eff(p, x, true, t), D = G.eff(e, t, false, x) + t.armor;     // ผลที่คาดไว้ (ใช้ power ตอนสู้จริง)
            const win = x.has("พิษ") || A >= D, lose = t.has("พิษ") || (D > A && !x.has("บิน"));
            v.pred[t.uid] = `${A} vs ${D}: ${win && lose ? "ตายทั้งคู่" : win ? "ชนะ" : lose ? "ตัวเราตาย" : "ไม่มีใครตาย"}`;
          }
        }
        return v;
      };
      const hand = p.hand.map((c) => {
        const mon = c.type === "มอน";
        let err = my ? null : "ยังไม่ใช่ตาคุณ";
        if (!err) err = mon ? G.canSummon(p, c) : c.type === "เวทสวน" ? "เวทสวนใช้ตอนถูกโจมตีหรือศัตรูร่ายเวท — เกมจะถามเอง" : G.spellUsable(p, c);
        return { id: c.id, gem: G.gemOf(p, c), costNow: mon ? G.cost(p, c) : null, err, dead: !mon && !c.spell.length && !c.counter,
          auto: mon && my && !err ? (G.autoPay(p, G.cost(p, c), c) || []).map((x) => p.hand.indexOf(x)) : [] };
      });
      return {
        seat: i, phase: this.phase, mullDone: this.mullDone[i], turn: G.turn, myTurn: my, busy: this.busy,
        whoseTurn: G.P[G.cur].name, winner: G.winner ? (G.winner === p ? "me" : "opp") : null,
        me: { name: p.name, arch: this.decks[i], hp: p.hp, deck: p.deck.length, grave: p.grave.map((c) => c.name), hand,
              field: p.field.map((x) => unit(p, x, true)), spellUsed: p.spellUsed, spellMax: p.spellMax },
        opp: { name: e.name, arch: this.decks[1 - i], hp: e.hp, deck: e.deck.length, grave: e.grave.map((c) => c.name), handCount: e.hand.length,
               field: e.field.map((x) => unit(e, x, false)) },
      };
    }

    // ---------- คำสั่งจากผู้เล่น i → ข้อความ error หรือ null
    async act(i, a) {
      const G = this.G, p = G.P[i], e = G.other(p);
      if (!a || typeof a !== "object") return "คำสั่งไม่ถูกต้อง";
      if (this.phase === "mull") {
        if (a.t !== "mull" || this.mullDone[i]) return "รออีกฝ่ายเลือก mulligan";
        const cards = [...new Set(a.idx || [])].map((k) => p.hand[k]).filter(Boolean);
        G.mulligan(p, cards); this.mullDone[i] = true; this.onLog(`${p.name} เปลี่ยนการ์ด ${cards.length} ใบ`);
        if (this.mullDone.every(Boolean)) await this.begin(); else this.push();
        return null;
      }
      if (this.phase !== "play" || G.P[G.cur] !== p || this.busy || G.winner) return "ยังไม่ใช่ตาคุณ";
      if (a.t === "end") { G.endTurn(); await this.nextTurn(); return null; }
      this.busy = true; this.push();
      let err = null;
      try {
        if (a.t === "summon") {
          const c = p.hand[a.k], ks = [...new Set(a.f || [])];
          if (!c || ks.includes(a.k) || ks.some((k) => !p.hand[k])) err = "เลือกการ์ดไม่ถูกต้อง";
          else err = G.summon(p, c, ks.map((k) => p.hand[k]));
        } else if (a.t === "cast") {
          const c = p.hand[a.k];
          err = c ? await G.cast(p, c, this.reactFn) : "เลือกการ์ดไม่ถูกต้อง";
        } else if (a.t === "attack") {
          const u = p.field.find((x) => x.uid === a.uid), t = a.target === "face" ? "face" : e.field.find((x) => x.uid === a.target);
          if (!u || !t) err = "เป้าหมายไม่ถูกต้อง";
          else if (G.canAttack(p, u)) err = G.canAttack(p, u);
          else if (!G.targets(p, u).includes(t)) err = "ตีเป้าหมายนี้ไม่ได้";
          else err = await G.attack(p, u, t, this.reactFn);
        } else err = "คำสั่งไม่ถูกต้อง";
      } finally { this.busy = false; }
      if (G.winner) this.phase = "over";
      this.push();
      return err;
    }

    async nextTurn() {
      const G = this.G;
      if (!G.winner) G.startTurn();
      if (G.winner) { this.phase = "over"; return this.push(); }
      if (this.seats[G.cur] === "bot") {
        this.busy = true; this.push(); await sleep(this.botDelay);
        await G.botTurn(this.reactFn, async () => { this.push(); await sleep(this.botDelay); });
        this.busy = false;
        if (G.winner) { this.phase = "over"; return this.push(); }
        G.endTurn(); return this.nextTurn();
      }
      this.push();
    }

    // ฝ่ายรับเลือกตอบโต้ (เวทสวน / พรีกายจากมือ)
    async react(d, info) {
      const i = this.G.P.indexOf(d), a = this.G.other(d);
      if (this.seats[i] === "bot") return this.G.botReact(d, info);
      this.push();
      const payload = {
        head: info.spell ? `${a.name} ร่ายเวท ${info.spell.name}` : `${info.attacker.name} โจมตี ${info.targetIsPlayer ? "คุณ (ผู้เล่น)" : info.target.name}`,
        sub: info.spell ? info.spell.ab : "เลือกเวทสวนเพื่อตอบโต้ หรือทิ้งมอนพรีกายจากมือรับแทน",
        opts: info.opts.map((o) => ({ id: o.card.id, kind: o.kind })),
      };
      const k = await this.ask(i, payload);
      return Number.isInteger(k) && info.opts[k] ? info.opts[k] : null;
    }
  }

  if (typeof module !== "undefined") module.exports = { Session }; else root.Session = Session;
})(typeof window !== "undefined" ? window : globalThis);
