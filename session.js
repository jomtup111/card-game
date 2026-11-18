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
      Object.assign(this, { botDelay: 600, watch: false, turnSec: 75, deciding: null }, o);
      // บันทึกสำหรับเล่นซ้ำ (รายงานบัค): seed + เดค + ทุกคำสั่งของผู้เล่นคน + คำตอบเวทสวน → เกมเดิมเป๊ะ
      // rules: 2 = กติกา 2026-11-18 (HP 7 · ตัวที่เพิ่งเข้าสนามตีหน้าไม่ได้ · ยิงเป้าซ่อนตัวไม่ได้) · ไม่มี = กติกาเดิม (รหัสเล่นซ้ำเก่า)
      this.rec = { rules: 2, seed: o.seed, decks: o.decks, seats: o.seats, names: o.names, levels: [], acts: [], answers: [] };
      // เดค: ชื่อสาย (จัดอัตโนมัติ) | { arch } | { name, ids: [รหัสการ์ด] } (จัดเอง ต้องผ่าน validateDeck มาแล้ว)
      const byId = new Map(o.cards.map((c) => [c.id, c]));
      const mk = (d) => (d && d.ids ? d.ids.map((id) => byId.get(id)) : E.buildDeck(o.cards, typeof d === "string" ? d : d.arch));
      this.deckNames = o.decks.map((d) => (typeof d === "string" ? d : d.arch || d.name || "เดคจัดเอง"));
      this.G = new E.Game(mk(o.decks[0]), mk(o.decks[1]), o.seed, (s) => this.onLog(s), o.rules === 1 ? { hp: 5, rush: false, shootHide: false } : {});
      this.G.P.forEach((p, i) => (p.name = o.names[i]));
      // พระเอกของแต่ละฝั่ง (รูปกลางจอ): หัวหน้าที่ cost สูงสุดในเดค ไม่มีก็พลทหารของเผ่าที่มีมากสุด
      const all = o.cards;
      this.heroes = this.G.P.map((p, i) => {
        const d = o.decks[i]; if (d && d.hero && p.decklist[d.hero]) return d.hero;     // หัวหน้าที่ผู้เล่นเลือกเอง
        const ids = Object.keys(p.decklist), cs = ids.map((id) => all.find((c) => c.id === id)).filter(Boolean);
        // หัวหน้าของสายเดคก่อน (เดคผสมคู่หู เช่น นักฝึกสัตว์+สัตว์ใหญ่ มีหัวหน้า 2 ตัว) แล้วค่อย cost สูงสุด
        const own = (c) => (c.archs && c.archs.has ? c.archs.has(this.deckNames[i]) : false);
        const lead = cs.filter((c) => c.leader).sort((a, b) => own(b) - own(a) || b.cost - a.cost)[0]; if (lead) return lead.id;
        const race = {}; for (const c of cs) if (c.type === "มอน") race[c.id.slice(0, 3)] = (race[c.id.slice(0, 3)] || 0) + 1;
        const top = Object.entries(race).sort((a, b) => b[1] - a[1])[0];
        return top ? `${top[0]}-GEN-01` : cs[0].id;
      });
      this.fxq = []; this.G.onFx = (e) => this.fxq.push(e);
      this.phase = "mull"; this.mullDone = [false, false]; this.busy = false;
      this.reactFn = (d, info) => this.react(d, info);
      // ผู้เล่นคน (local/remote) เลือกการ์ดที่จะทิ้งเอง · บอทเลือกอัตโนมัติ
      this.G.picker = (p) => this.seats[this.G.P.indexOf(p)] !== "bot";
      this.G.flushFn = () => this.drain();
    }
    start() {
      this.rec.levels = this.G.P.map((p) => [p.level || null, p.bonusDraw || 0]);
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
      const status = (x, owner) => {
        const s = [];
        if (G.opt.rush && x.born === G.turn && G.P[G.cur] === owner && !x.noface) s.push("เพิ่งลง: ตีหน้าไม่ได้");
        if (x.frozen) s.push("❄ แช่แข็ง"); if (x.hatch) s.push(`🥚 ${x.hatch[0]}`); if (x.armor) s.push(`เกราะ ${x.armor}`);
        if (x.has("โล่แสง")) s.push("โล่แสง"); if (x.stolenFrom) s.push("ยึดมา"); if (x.attached.length) s.push(`อัปเกรด ×${x.attached.length}`);
        return s;
      };
      const unit = (owner, x, mine) => {
        const v = { uid: x.uid, id: x.card ? x.card.id : null, tok: x.card ? null : { name: x.name, kinds: [...x.kinds], power: x.power },
          power: mine && my ? G.eff(owner, x, true) : G.eff(owner, x), status: status(x, owner), atkErr: "ยังไม่ใช่ตาคุณ", targets: [], pred: {},
          kws: [...new Set([...Object.keys(x.kw), ...Object.keys(x.akw)])].filter((k) => x.has(k) && !["spellproof", "revealed"].includes(k)), armor: G.arm(x) };
        if (mine && my) {
          const ts = G.canAttack(p, x) ? [] : G.targets(p, x);
          v.atkErr = G.canAttack(p, x) || (ts.length ? null : G.opt.rush && x.born === G.turn && !e.field.length ? "เพิ่งลงสนาม: ตีผู้เล่นได้ตั้งแต่เทิร์นหน้า" : "ไม่มีเป้าหมายที่ตีได้");
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
      const wakeOf = (q) => q.grave.map((c) => (c.kw["หลับใหล"] && c.awaken ? G.awakenOk(q, c) : null));   // มังกรหลับใหล: เงื่อนไขปลุกผ่านแล้วไหม
      return {
        seat: i, phase: this.phase, mullDone: this.mullDone[i], turn: G.turn, myTurn: my, busy: this.busy,
        paused: this.deciding != null && this.deciding !== G.cur, turnSec: this.turnSec, cur: G.cur,
        whoseTurn: G.P[G.cur].name, winner: G.winner ? (G.winner === p ? "me" : "opp") : null,
        me: { name: p.name, hero: this.heroes[i], arch: this.deckNames[i], hp: p.hp, deck: p.deck.length, grave: p.grave.map((c) => c.name), graveIds: p.grave.map((c) => c.id), graveWake: wakeOf(p), hand,
              field: p.field.map((x) => unit(p, x, true)), spellUsed: p.spellUsed, spellMax: G.spellCap(p),
              abilities: my ? G.abilities(p).map(({ key, label, pay, err }) => ({ key, label, pay, err })) : [] },
        opp: { name: e.name, hero: this.heroes[1 - i], arch: this.deckNames[1 - i], hp: e.hp, deck: e.deck.length, grave: e.grave.map((c) => c.name), graveIds: e.grave.map((c) => c.id), graveWake: wakeOf(e), handCount: e.hand.length,
               field: e.field.map((x) => unit(e, x, false)) },
      };
    }

    // ---------- คำสั่งจากผู้เล่น i → ข้อความ error หรือ null
    async act(i, a) {
      const G = this.G, p = G.P[i], e = G.other(p);
      if (!a || typeof a !== "object") return "คำสั่งไม่ถูกต้อง";
      if (this.rec.acts.length < 5000) this.rec.acts.push([i, a]);
      if (this.phase === "mull") {
        if (a.t !== "mull" || this.mullDone[i]) return "รออีกฝ่ายเลือก mulligan";
        const cards = [...new Set(a.idx || [])].map((k) => p.hand[k]).filter(Boolean);
        G.mulligan(p, cards); this.mullDone[i] = true; this.onLog(`${p.name} เปลี่ยนการ์ด ${cards.length} ใบ`);
        if (this.mullDone.every(Boolean)) await this.begin(); else this.push();
        return null;
      }
      if (this.phase !== "play" || G.P[G.cur] !== p || this.busy || G.winner) return "ยังไม่ใช่ตาคุณ";
      if (a.t === "end") { const must = G.mustAttackErr(p); if (must) return must; G.endTurn(); await this.nextTurn(); return null; }
      this.busy = true; this.push();
      let err = null;
      try {
        if (a.t === "summon") {
          const c = p.hand[a.k], ks = [...new Set(a.f || [])];
          if (!c || ks.includes(a.k) || ks.some((k) => !p.hand[k])) err = "เลือกการ์ดไม่ถูกต้อง";
          else err = await G.summon(p, c, ks.map((k) => p.hand[k]), this.reactFn);
        } else if (a.t === "gang") {
          const ids = Array.isArray(a.uids) ? a.uids : [], us = ids.map((id) => p.field.find((x) => x.uid === id)), t = e.field.find((x) => x.uid === a.target);
          err = us.some((u) => !u) || !t || new Set(ids).size !== ids.length ? "เลือกไม่ถูกต้อง" : await G.attackGroup(p, us, t, this.reactFn);
        } else if (a.t === "ability") {
          err = G.useAbility(p, String(a.key || ""), Number.isInteger(a.k) ? a.k : null);
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
        await this.drain();
      } finally { this.busy = false; }
      if (G.winner) this.phase = "over";
      this.push();
      return err;
    }

    async nextTurn() {
      const G = this.G;
      if (!G.winner) { G.startTurn(); if (G.pending.length) { this.busy = true; try { await this.drain(); } finally { this.busy = false; } } }
      if (G.winner) { this.phase = "over"; return this.push(); }
      if (this.seats[G.cur] === "bot") {
        this.busy = true; this.push(); await sleep(this.botDelay);
        await G.botTurn(this.reactFn, async () => { await this.drain(); this.push(); await sleep(this.botDelay); });
        await this.drain();
        this.busy = false;
        if (G.winner) { this.phase = "over"; return this.push(); }
        G.endTurn(); return this.nextTurn();
      }
      this.push();
    }

    // ผู้เล่นคนเลือกการ์ดที่จะทิ้ง (engine พักไว้ใน G.pending) → ถามทีละเรื่อง แล้วทำสกิลที่เหลือต่อ
    async drain() {
      const G = this.G;
      while (G.pending.length && !G.winner) {
        const pd = G.pending.shift(), i = G.P.indexOf(pd.chooser);
        const live = pd.cands.filter((x) => pd.valid(x)), need = Math.min(pd.n, live.length);
        let cs;
        if (!need || (!pd.optional && !pd.gem && need >= live.length)) cs = G.answerPick(pd, null);   // ไม่มีอะไรให้เลือกแล้ว
        else {
          this.deciding = i; this.push();
          const head = pd.src ? `${pd.src.name}: ${pd.why}` : pd.why;
          const payload = pd.kind === "unit"
            ? { kind: "unit", n: need, optional: !!pd.optional, head, sub: `แตะเลือก ${need} ตัว`, mine: pd.side === pd.chooser,
                uids: pd.cands.map((u) => (live.includes(u) ? u.uid : null)), src: pd.self ? pd.self.uid : null, opts: [] }
            : { kind: "discard", n: need, optional: !!pd.optional, enemy: pd.kind === "discard" && pd.victim !== pd.chooser, head,
                sub: pd.sub || (pd.gem ? `เลือกการ์ดให้ gem รวม ≥ ${pd.gem}` : pd.kind !== "discard" ? `เลือก ${need} ใบ` : pd.victim !== pd.chooser ? `เลือกการ์ดในมือ${pd.victim.name} ${need} ใบให้ทิ้ง` : pd.optional ? "เลือกการ์ดที่จะทิ้ง หรือกดไม่ทิ้ง" : `เลือกการ์ดที่จะทิ้ง ${need} ใบ`),
                cards: pd.cands.map((c) => (live.includes(c) ? c.id : null)), okLabel: pd.okLabel, skipLabel: pd.skipLabel,
                gem: pd.gem || 0, gems: pd.gem ? pd.cands.map((c) => G.gemOf(pd.chooser, c)) : null,
                opts: [] };                                                   // เครื่องเพื่อนรุ่นเก่า: เห็นเป็นหน้าต่างตอบโต้ว่าง กดผ่าน = เลือกอัตโนมัติ
          let k; try { k = await this.ask(i, payload); } finally { this.deciding = null; }
          this.rec.answers.push(k);
          cs = G.answerPick(pd, k);
        }
        const n0 = G.pending.length; pd.after(cs);
        if (pd.rest) { if (G.pending.length > n0) { const np = G.pending[G.pending.length - 1], r0 = np.rest, r1 = pd.rest; np.rest = () => { if (r0) r0(); r1(); }; } else pd.rest(); }   // ผลที่เลือกไปสร้างคำถามต่อ → สกิลที่เหลือรอหลังคำถามนั้น
        G.checkEnd();
      }
      if (G.winner) { G.pending.length = 0; this.phase = "over"; }
    }

    // ฝ่ายรับเลือกตอบโต้ (เวทสวน / พรีกายจากมือ)
    async react(d, info) {
      const i = this.G.P.indexOf(d), a = this.G.other(d);
      if (this.seats[i] === "bot") return this.G.botReact(d, info);
      // ผู้เล่นคน: ไม่ถามเวทสวนที่ใช้แล้วผลการต่อสู้ไม่เปลี่ยน · ไม่เหลือตัวเลือก = ไม่ถาม
      if (info.attacker) {
        const keep = info.opts.filter((o) => this.G.reactUseful(d, o, info));
        if (!keep.length) return null;
        info = { ...info, opts: keep };
      }
      this.deciding = i; this.push();                                   // อีกฝ่ายกำลังเลือก → เวลาเทิร์นของคนตีหยุดเดิน
      const payload = {
        head: info.etb ? `${a.name} อัญเชิญ ${info.etb.name}` : info.spell ? `${a.name} ร่ายเวท ${info.spell.name}` : `${info.attacker.name} โจมตี ${info.targetIsPlayer ? "คุณ (ผู้เล่น)" : info.target.name}`,
        sub: info.etb ? `ยกเลิกสกิลลงสนาม: ${info.etb.ab}` : info.spell ? info.spell.ab : "เลือกเวทสวนเพื่อตอบโต้ หรือทิ้งมอนพรีกายจากมือรับแทน",
        opts: info.opts.map((o) => ({ id: o.card.id, kind: o.kind })),
      };
      let k; try { k = await this.ask(i, payload); } finally { this.deciding = null; }
      this.rec.answers.push(k);
      return Number.isInteger(k) && info.opts[k] ? info.opts[k] : null;
    }
  }

  if (typeof module !== "undefined") module.exports = { Session }; else root.Session = Session;
})(typeof window !== "undefined" ? window : globalThis);
