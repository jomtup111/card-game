// เอนจินเกม (กติกา + ตัวแปลสกิล + บอท) — ยกมาจาก sim/sim.py
// ใช้ได้ทั้งในเบราว์เซอร์ (window.Engine) และ node (module.exports)
(function (root) {
  "use strict";
  const HP = 5, HAND0 = 5, FIELD = 5, DRAW = 2;   // จั่ว 2 ใบต่อเทิร์น (2026-11-17 แก้มือบอด)

  // ---------------------------------------------------------------- ชนิด (kind)
  const ALIAS = { "ไดโน": "ไดโนเสาร์", "นก": "นกล่าเหยื่อ", "ไดโนนักล่า": "นักล่า" };
  const TOKENS = {
    "ลูกหมานรก": [["นรก", "สัตว์นรก", "ลูกหมานรก"], 1, {}], "ร่างแยก": [["มนุษย์", "นินจา", "ร่างแยก"], 1, {}],
    "เฟือง": [["เครื่องจักร", "เฟือง"], 1, {}], "โดรน": [["เครื่องจักร", "โดรน"], 2, {}],
    "ต้นกล้า": [["ภูต", "ต้นไม้", "ต้นกล้า"], 1, { grow: true }], "ลูกหมาป่า": [["สัตว์", "หมาป่า", "ลูกหมาป่า"], 1, {}],
    "ตัวอ่อน": [["สัตว์", "แมลง", "ตัวอ่อน"], 1, {}], "ปลาเล็ก": [["ปลา", "ปลาเล็ก"], 1, {}],
    "ลูกมังกร": [["มังกร", "ลูกมังกร"], 1, { grow: true }], "ไข่": [["ไดโนเสาร์", "ไข่"], 0, { hatch: [2, 3, ""], noatk: true, hidden: true }],
  };
  const normKind = (w) => {
    w = w.trim();
    for (const j of ["ทุกตัว", "ตัวอื่น", "ฝั่งเรา", "มอนสเตอร์เผ่า", "เผ่า", "บนสนาม", "การ์ด"]) w = w.split(j).join("");
    w = w.trim(); return ALIAS[w] || w;
  };
  const kindMatch = (kinds, word) => word.split(/หรือ|และ|\/|, /).map(normKind).some((p) => p && kinds.has(p));

  // ---------------------------------------------------------------- การ์ด
  class Card {
    constructor(r) {
      Object.assign(this, { id: r.id, name: r.name, type: r.type, ab: r.ability, art: r.art, race: r.race });
      this.races = new Set(r.raceTh.split("+")); this.archs = new Set(r.arch.split(" · "));
      this.cost = +r.cost || 0; this.gem = +r.gem || 0; this.base = +r.power || 0;
      this.tags = new Set((r.tags || "").split(";").filter(Boolean));
      const k = new Set([...this.races, ...this.archs, "มอนสเตอร์"]);
      for (const a of this.archs) for (const p of a.split("/")) k.add(p);
      if (this.archs.has("ไดโนบิน/ทะเล")) k.add(this.tags.has("บิน") ? "ไดโนบิน" : "ไดโนทะเล");
      for (const t of ["ไข่", "ปะการัง", "ชิ้นส่วนไททัน", "ป้อม", "หัวหน้า", "อัปเกรด"]) if (this.tags.has(t)) k.add(t);
      if (this.name.includes("ราพเตอร์")) k.add("ราพเตอร์");
      this.kinds = k;
      this.elements = new Set([...this.tags].filter((t) => t.startsWith("ธาตุ:")).map((t) => t.slice(5)));
      this.parse();
    }
    parse() {
      const t = this.tags, tj = [...t].join(";");
      this.kw = {};
      for (const k of ["พรีกาย", "ซ่อนตัว", "บิน", "บดขยี้", "พิษ", "โล่แสง", "ป้อม", "เติบโต", "กินเหยื่อ", "คลั่งเลือด", "ล่ารุม", "ฟอสซิลมีชีวิต", "หลับใหล", "อัปเกรด"]) this.kw[k] = t.has(k);
      let m;
      this.armor = (m = tj.match(/เกราะ (\d+)/)) ? +m[1] : 0;
      this.shoot = (m = tj.match(/ยิง (\d+)/)) ? +m[1] : null;
      this.sac = (m = tj.match(/สังเวย (\d+)/)) ? +m[1] : 0;
      this.shoot2 = false; this.onlyone = t.has("Only One"); this.leader = t.has("หัวหน้า");
      this.double = this.noatk = this.noface = false; this.hatch = null; this.awakenGem = 0;
      Object.assign(this, { auras: [], selfcount: [], selfcond: [], costred: [], handred: [], enter: [], sot: [], ondeath: [], ondiscard: [], onkill: [], awaken: null, spell: [], spellCond: null, counter: null, grant: new Set() });
      this.offer = null; this.spellPre = null; this.h = {};
      this.segs = this.ab.split(/;\s*(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);   // ไม่ตัด ; ที่อยู่ในวงเล็บ
      this.known = 0;
      for (const s of this.segs) if (this.seg(s)) this.known++;
    }
    seg(x) {
      let m;
      const KW = ["พรีกาย", "ซ่อนตัว", "บิน", "บดขยี้", "พิษ", "โล่แสง", "ป้อม", "กินเหยื่อ", "คลั่งเลือด", "ล่ารุม", "ฟอสซิลมีชีวิต", "อัปเกรด", "ชิ้นส่วนไททัน"];
      if (KW.includes(x)) { this.kw[x] = true; return true; }
      if (x.startsWith("เติบโต")) { this.kw["เติบโต"] = true; return true; }
      if (x.startsWith("หลับใหล")) { this.kw["หลับใหล"] = true; m = x.match(/gem (\d+)/); this.awakenGem = m ? +m[1] : 0; return true; }
      if (/^(เกราะ|ยิง|สังเวย) \d+$/.test(x)) return true;
      if (x === "ยิง 1 ได้ 2 ครั้ง") { this.shoot = 1; this.shoot2 = true; return true; }
      if (x === "โจมตีไม่ได้") { this.noatk = true; return true; }
      if (x === "ตีผู้เล่นไม่ได้" || x === "ตีได้แต่มอนสเตอร์ ตีผู้เล่นไม่ได้") { this.noface = true; return true; }
      if (x === "โจมตีได้ 2 ครั้งต่อเทิร์น") { this.double = true; return true; }
      if (x.startsWith("นับเป็น") || x.startsWith("เมื่อตาย: กลับไปหลับ")) return true;
      if (x === "ไม่ตายจากเวท") { this.kw.spellproof = true; return true; }
      if ((m = x.match(/^ฟัก (\d+) → (.+)$/))) { const p = m[2].match(/power (\d+)/); this.hatch = [+m[1], p ? +p[1] : null, m[2]]; this.noatk = true; return true; }
      if ((m = x.match(/^cost ลดลง (\d+) ต่อ(.+)$/))) { this.costred.push([+m[1], m[2]]); return true; }
      if (x.startsWith("cost ลดลงตามค่าศรัทธา")) { this.costred.push([1, "สวรรค์บนสนาม"]); return true; }
      if ((m = x.match(/^การ์ด(.+?)ในมือเรา cost ลดลง (\d+).*$/))) { this.handred.push([m[1], +m[2]]); return true; }
      if ((m = x.match(/^(.+?)(ตัวอื่น)?(?:ทุกตัว)?(?:ฝั่งเรา)? power \+(\d+)(?: และได้(\S+))?$/)) && !/ถ้า|เมื่อ|ต่อ|ขณะ|ที่มี|ร่ายเวท|คอมโบ|มือเต็ม|คู่หู|ลงสนาม|ที่ถูก/.test(m[1])) { this.auras.push([m[1], !!m[2], +m[3]]); return true; }
      if ((m = x.match(/^power \+(\d+) ต่อ(.+?)(?: \(สูงสุด \+(\d+)\))?$/))) { this.selfcount.push([+m[1], m[2], m[3] ? +m[3] : 99]); return true; }
      if ((m = x.match(/^ถ้ามี(.+?)(ตัวอื่น)?(?:บนสนาม|ฝั่งเรา) power \+(\d+)$/))) { this.selfcond.push(["have", m[1], !!m[2], +m[3]]); return true; }
      if ((m = x.match(/^คู่หู: power \+(\d+)$/))) { this.selfcond.push(["have", "สัตว์หรือไดโนเสาร์หรือมังกร", true, +m[1]]); return true; }
      if ((m = x.match(/^มือเต็ม (\d+): (?:power \+(\d+)|(โจมตีได้ 2 ครั้งต่อเทิร์น))$/))) { this.selfcond.push(["hand", +m[1], m[3] ? true : false, m[2] ? +m[2] : 0]); return true; }
      if ((m = x.match(/^ขบวน (\d+): โจมตีได้ 2 ครั้งต่อเทิร์น$/))) { this.selfcond.push(["formation", +m[1], false, 0]); return true; }
      if ((m = x.match(/^เมื่อสู้กับมอนสเตอร์เผ่า(\S+) power \+(\d+)$/))) { this.selfcond.push(["vs", m[1], false, +m[2]]); return true; }
      if ((m = x.match(/^(?:ทำลายมอนสเตอร์(?:ศัตรู)?ได้เมื่อไหร่|เมื่อทำลายมอนสเตอร์ได้) (.+)$/))) { const a = this.actions(m[1]); if (a.length) { this.onkill.push(...a); return true; } }
      for (const [pre, lst] of [["ลงสนาม: ", this.enter], ["ต้นเทิร์นของเรา ", this.sot], ["เมื่อตาย: ", this.ondeath], ["ทิ้ง: ", this.ondiscard]])
        if (x.startsWith(pre)) { const a = this.actions(x.slice(pre.length)); if (a.length) { lst.push(...a); return true; } }
      if (this.type === "มอน" && (m = x.match(/^คอมโบ (\d+): (.+)$/))) { const a = this.actions(m[2]); if (a.length) { this.enter.push(["combo", +m[1], a]); return true; } }
      if ((m = x.match(/^ปลุก: (.+)$/))) { this.awaken = m[1]; return true; }
      if ((m = x.match(/^เครื่องเซ่น: (.+)$/))) {          // ทำงานเมื่อจ่าย gem เกิน cost
        if (/power \+1 ต่อ gem/.test(m[1])) { this.offer = ["powerper"]; return true; }
        if (/ทำลายมอนสเตอร์ศัตรู 1 ตัวต่อ gem/.test(m[1])) { this.offer = ["killper", 3]; return true; }
        if ((m = m[1].match(/^power \+(\d+) ถาวร$/))) { this.offer = ["power", +m[1]]; return true; }
        const a = this.actions(x.slice(13)); if (a.length) { this.offer = ["run", a]; return true; }
      }
      if ((m = x.match(/^ตัวที่ติดได้(\S+?)(?: และ.*)?$/))) { for (const g of m[1].split(/และ|,/)) this.grant.add(g.trim()); return true; }
      if (x.startsWith("ถ้าฝั่งเรามีอัลฟ่า")) return true;
      if (this.type === "มอน") { try { if (this.hook(x)) return true; } catch (err) { if (err !== 0) throw err; } }
      if (this.type !== "มอน") {
        let body = x;
        if (this.spell.length && (m = body.match(/^ถ้ามี(\S+?)ฝั่งเรา จั่วเพิ่มอีก (\d+) ใบ$/))) { this.spell.push(["draw", +m[2], m[1]]); return true; }
        if ((m = body.match(/^ถ้ามี(.+?)ฝั่งเรา (?!≥)(.+)$/))) { this.spellCond = m[1]; body = m[2]; }
        if ((m = body.match(/^(คอมโบ|ขบวน) (\d+): (.+)$/))) { this.spellPre = [m[1], +m[2]]; body = m[3]; }
        if ((m = body.match(/^ถ้าผสานธาตุ = (\d+) (.+)$/))) { this.spellPre = ["ธาตุ", +m[1]]; body = m[2]; }
        if (body.includes("ยกเลิกการโจมตี")) { const t = body.match(/ที่เป้าหมายเป็น(\S+)/); this.counter = ["attack", t ? t[1] : null, { t: "cancel" }]; return true; }
        if (body.includes('ยกเลิกสกิล "ลงสนาม"')) { this.counter = ["etb", null]; this.counterEtb = true; return true; }
        if (body.includes("ยกเลิกเวท")) { this.counter = ["spell", null]; if (body.includes('"ลงสนาม"')) this.counterEtb = true; return true; }
        if (this.counter && (m = body.match(/^ถ้าเป้าหมายเป็น(\S+?) ตัวนั้น power \+(\d+) ถาวร$/))) { this.counter[2] = { ...(this.counter[2] || { t: "cancel" }), bonus: { kind: normKind(m[1]), n: +m[2] } }; return true; }
        if (this.spell.length && /^ถ้าตัวนั้นทำลายมอนสเตอร์ได้ในเทิร์นนี้ power \+1 ถาวรเพิ่ม$/.test(body)) { const own = this.spell.find((a) => a[0] === "own"); if (own) { own[3].killBonus = 1; return true; } }
        if (this.type === "เวทสวน") { const r = this.reaction(body); if (r) { this.counter = ["attack", r.req || null, r]; return true; } }
        let a = this.actions(body);
        if (!a.length && /\(.*\)/.test(body)) a = this.actions(body.replace(/ ?\([^)]*\)/g, ""));   // ลองตัดวงเล็บอธิบายออก
        if (a.length) { this.spell.push(...a); return true; }
      }
      return false;
    }
    // สกิลมอนสเตอร์แบบออร่า / ทริกเกอร์ / กติกาพิเศษ → เก็บเป็นธงใน this.h ให้ Game ตรวจตอนเกิดเหตุการณ์
    hook(x) {
      const h = this.h, add = (k, v) => (h[k] ||= []).push(v);
      const T = (re, f) => { const m = x.match(re); if (m) { f(m); return true; } return false; };
      return (
        T(/^(?:ลูกมังกรทุกตัวฝั่งเราเติบโต|ต้นไม้ฝั่งเราที่มีสกิลเติบโต).*แทน \+1$/, () => {}) ||              // ตรวจด้วยข้อความใน startTurn
        T(/^(?:ต้นเทิร์นของเรา ไข่ทุกฟองฝั่งเรานับเวลาฟักเพิ่ม|ไข่ของเราฟักเร็วขึ้น)/, () => {}) ||          // ตรวจใน hatch()
        T(/^(\S+?)ทุกตัวฝั่งเราได้(ล่ารุม)$/, (m) => add("kwAura", { kind: m[1], kw: m[2] })) ||
        T(/^(\S+?)ตัวอื่นทุกตัวได้(ซ่อนตัว)$/, (m) => add("kwAura", { kind: m[1], kw: m[2], others: true })) ||
        T(/^(\S+?)ทุกตัวฝั่งเราได้เกราะ \+(\d+)$/, (m) => add("armorAura", { kind: m[1], n: +m[2] })) ||
        T(/^มอนสเตอร์ฝั่งเราที่มีโล่แสง power \+(\d+)$/, (m) => (h.shieldAura = +m[1])) ||
        T(/^(\S+?)ฝั่งเราไม่ตายจากเวท$/, (m) => (h.spellproofAura = [m[1], 0])) ||
        T(/^ขบวน (\d+): มอนสเตอร์ฝั่งเราไม่ตายจากเวทของศัตรู$/, (m) => (h.spellproofAura = ["มอนสเตอร์", +m[1]])) ||
        T(/^ถ้ามี(\S+?)ตัวอื่นฝั่งเรา ได้(\S+)$/, (m) => (h.condKw = { kind: m[1], kw: m[2] })) ||
        T(/^เมื่อ power ≥ (\d+) ได้(\S+?)และ(\S+)$/, (m) => (h.powKw = { n: +m[1], kws: [m[2], m[3]] })) ||
        T(/^ถ้าศัตรูไม่มีมอนสเตอร์ที่บินได้ power \+(\d+)$/, (m) => (h.noFlyBonus = +m[1])) ||
        T(/^มอนสเตอร์ศัตรูที่ power ≤ (\d+) โจมตีไม่ได้$/, (m) => (h.pacify = +m[1])) ||
        T(/^มอนสเตอร์ศัตรูทุกตัวเสียสกิลซ่อนตัว$/, () => (h.reveal = true)) ||
        T(/^ถ้าโจมตีมอนสเตอร์ที่มีเกราะหรือพรีกาย power \+(\d+)$/, (m) => (h.vsArmor = +m[1])) ||
        T(/^เวลาโจมตีมอนสเตอร์ที่มีเกราะ เกราะของมันไม่ทำงาน$/, () => (h.pierce = true)) ||
        T(/^เมื่อโจมตีมอนสเตอร์ที่ power ≤ (\d+): ตายทั้งคู่$/, (m) => (h.trade = +m[1])) ||
        T(/^มอนสเตอร์ที่สู้กับตัวนี้ตายเสมอ/, () => (this.kw["พิษ"] = true)) ||
        T(/^มอนสเตอร์ที่สู้กับตัวนี้ โจมตีไม่ได้ในเทิร์นถัดไป$/, () => (h.stun = true)) ||
        T(/^เมื่อสู้กับมอนสเตอร์ใด ตัวนั้น power −(\d+) ก่อนเทียบ$/, (m) => (h.weaken = +m[1])) ||
        T(/^เมื่อถูกโจมตี: power \+(\d+) จนจบเทิร์น$/, (m) => (h.onHitPow = +m[1])) ||
        T(/^เมื่อถูกโจมตี: (\S+?)ทุกตัวฝั่งเรา power \+(\d+) จนจบเทิร์น$/, (m) => (h.onHitTeam = { kind: m[1], n: +m[2] })) ||
        T(/^(?:เมื่อถูกโจมตี: ตัวที่โจมตี|ตัวที่โจมตีตัวนี้) power −(\d+) ถาวร$/, (m) => (h.thorns = +m[1])) ||
        T(/^ไม่ตายจากการถูกโจมตีครั้งแรกของแต่ละเทิร์น$/, () => (h.firstHit = true)) ||
        T(/^ไข่ฝั่งเราไม่ตายจากเวท และไม่ตายจากการถูกโจมตีครั้งแรกของแต่ละเทิร์น$/, () => (h.eggGuard = true)) ||
        T(/^ถ้าถูกโจมตีแล้วรอด ทำลายตัวที่โจมตี$/, () => (h.surviveKill = true)) ||
        T(/^ถ้าถูกโจมตีแล้วรอด ตัวที่โจมตี power −(\d+) ถาวร$/, (m) => (h.surviveSap = +m[1])) ||
        T(/^ทุกครั้งที่ถูกโจมตีแล้วรอด power \+(\d+) ถาวร$/, (m) => (h.surviveGrow = +m[1])) ||
        T(/^ถ้าตัวที่โจมตี\S*ชนะ ตัวนั้น power −(\d+) ถาวร$/, (m) => (h.curseKiller = +m[1])) ||
        T(/^(?:เมื่อทำลายมอนสเตอร์ได้|ทุกครั้งที่ทำลายมอนสเตอร์ได้) โจมตี(?:ต่อ|เพิ่ม)ได้อีก 1 ครั้ง( \(เทิร์นละครั้ง\))?$/, (m) => (h.cleave = m[1] ? 1 : 99)) ||
        T(/^ทำลายมอนสเตอร์ศัตรูได้เมื่อไหร่ power \+(\d+) ถาวร$/, (m) => (h.killGrow = +m[1])) ||
        T(/^พรีกาย ถ้ารับแทนแล้วชนะ จั่ว (\d+) ใบ$/, (m) => { this.kw["พรีกาย"] = true; h.guardDraw = +m[1]; }) ||
        T(/^เมื่อมอนสเตอร์ศัตรูตาย power \+(\d+) (ถาวร \(สูงสุด \+(\d+)\)|จนจบเทิร์น)$/, (m) => (h.onEnemyDie = { n: +m[1], perm: m[2].startsWith("ถาวร"), cap: +m[3] || 0 })) ||
        T(/^ทุกครั้งที่มีมอนสเตอร์ตาย \(ฝั่งไหนก็ได้\) power \+(\d+) ถาวร \(สูงสุด \+(\d+)\)$/, (m) => (h.onAnyDie = { n: +m[1], cap: +m[2] })) ||
        T(/^เมื่อ(\S+?)ฝั่งเราตาย จั่ว (\d+) ใบ \(เทิร์นละครั้ง\)$/, (m) => (h.onOwnDieDraw = { kind: m[1], n: +m[2] })) ||
        T(/^เมื่อมอนสเตอร์ที่เรายึดมาตาย จั่ว (\d+) ใบ$/, (m) => (h.onStolenDie = +m[1])) ||
        T(/^เมื่อมอนสเตอร์ที่เรายึดมาโจมตี จั่ว (\d+) ใบ/, (m) => (h.onStolenAtk = +m[1])) ||
        T(/^เมื่อ(\S+?)ตัวอื่นฝั่งเราตาย นำการ์ดใบนั้นกลับขึ้นมือ/, (m) => (h.onAllyDieReturn = m[1])) ||
        T(/^เมื่อมอนสเตอร์ศัตรูถูกส่งไปใต้เดค จั่ว (\d+) ใบ$/, (m) => (h.onBottomDraw = +m[1])) ||
        T(/^เมื่อมอนสเตอร์ฝั่งเราเสียโล่แสง จั่ว (\d+) ใบ/, (m) => (h.onShieldDraw = +m[1])) ||
        T(/^ทุกครั้งที่เราจั่วการ์ดนอกช่วงจั่วปกติ power \+(\d+) จนจบเทิร์น$/, (m) => (h.onExtraDraw = +m[1])) ||
        T(/^ทุกครั้งที่เราทิ้งการ์ด power \+(\d+) จนจบเทิร์น$/, (m) => (h.onDiscardPow = +m[1])) ||
        T(/^ทุกครั้งที่ทิ้งการ์ดตั้งแต่ 2 ใบขึ้นไปในการอัญเชิญครั้งเดียว ทำลายมอนสเตอร์ศัตรู 1 ตัวที่ power ≤ (\d+)$/, (m) => (h.bigPayKill = +m[1])) ||
        T(/^การ์ด(\S+?)ในมือเรา gem \+(\d+)$/, (m) => (h.gemAura = { kind: m[1], n: +m[2] })) ||
        T(/^ทุกครั้งที่เราใช้เวทสวน (?:power \+(\d+) ถาวร|จั่ว (\d+) ใบ)$/, (m) => (h.onCounter = { pow: +m[1] || 0, draw: +m[2] || 0 })) ||
        T(/^ร่ายเวท: power \+(\d+) (ถาวร|จนจบเทิร์น)$/, (m) => (h.onCast = { pow: +m[1], perm: m[2] === "ถาวร" })) ||
        T(/^ร่ายเวท: (.+?)(?: \(เทิร์นละครั้ง\))?$/, (m) => { const a = this.actions(m[1]); if (!a.length) throw 0; h.onCast = { acts: a, once: x.includes("เทิร์นละครั้ง") }; }) ||
        T(/^ขณะอยู่บนสนาม ใช้เวทปกติได้เทิร์นละ (\d+) ใบ$/, (m) => (h.spellCap = +m[1])) ||
        T(/^ศัตรูต้องทิ้งการ์ดเพิ่ม (\d+) ใบทุกครั้งที่ใช้เวทปกติ$/, (m) => (h.spellTax = +m[1])) ||
        T(/^เวทของศัตรูเลือกมอนสเตอร์ฝั่งเราเป็นเป้าไม่ได้ ยกเว้นตัวนี้$/, () => (h.magnet = true)) ||
        T(/^ศัตรูใช้เวทสวนกับ(\S+?)ไม่ได้$/, (m) => (h.noCounterVs = m[1])) ||
        T(/^ศัตรูอัญเชิญจากสุสานไม่ได้/, () => (h.noRaise = true)) ||
        T(/^ทุกครั้งที่มีการสังเวยมอนสเตอร์ฝั่งเรา power \+(\d+) ถาวร$/, (m) => (h.onSac = +m[1])) ||
        T(/^ฉลามตัวอื่นฝั่งเราได้ power \+2 ต่อมอนสเตอร์ที่ตาย/, () => (h.frenzy2 = true)) ||
        T(/^ตัวที่ติด power \+1 ต่ออัปเกรดที่ติดอยู่บนตัวนั้น$/, () => (h.upScale = true)) ||
        T(/^ทุกครั้งที่ตัวนี้ได้รับอัปเกรด จั่ว (\d+) ใบ$/, (m) => (h.onUpgradeDraw = +m[1])) ||
        T(/^ยิง (\d+) ได้เฉพาะมอนสเตอร์ที่บินได้$/, (m) => { this.shoot = +m[1]; h.shootFly = true; }) ||
        T(/^ต้องโจมตีทุกเทิร์นถ้าโจมตีได้$/, () => (h.mustAttack = true)) ||
        T(/^โจมตีไม่ได้ในเทิร์นที่ลงสนาม$/, () => (h.sick = true)) ||
        T(/^จบเทิร์นของเรา ถ้าตัวนี้ไม่ได้โจมตี ตาย$/, () => (h.attackOrDie = true)) ||
        T(/^ต้นเทิร์นของเรา ต้องทิ้งการ์ด (\d+) ใบ ถ้าทิ้งไม่ได้ ตัวนี้ตาย$/, (m) => (h.upkeep = +m[1])) ||
        T(/^ต้นเทิร์นของเรา ถ้ามี(\S+?)ตัวอื่นฝั่งเรา power \+(\d+) ถาวร \(สูงสุด \+(\d+)\)$/, (m) => (h.sotGrow = { kind: m[1], n: +m[2], cap: +m[3] })) ||
        T(/^ต้นเทิร์นของเรา ดูการ์ดบนสุดของเดค/, () => (h.sotScry = true)) ||
        T(/^ผ่านไป (\d+) เทิร์นของเรา กลายร่างเป็น\S+ power (\d+) ที่มี(\S+)$/, (m) => (h.morph = [+m[1], +m[2], m[3]])) ||
        T(/^เมื่อตาย: ถ้าสุสานมี(\S+?) ≥ (\d+) ใบ ตัวนี้กลับขึ้นมือ$/, (m) => (h.deathReturn = { kind: m[1], n: +m[2] })) ||
        T(/^เมื่อตาย: การ์ด(\S+?) 1 ใบในมือเรา cost ลดลง (\d+) ถาวร$/, (m) => (h.deathDiscount = { kind: m[1], n: +m[2] })) ||
        T(/^เมื่อตาย: ถ้าสนามฝั่งเราว่าง การโจมตีผู้เล่นครั้งถัดไปไม่ทำดาเมจ$/, () => (h.deathWard = true)) ||
        T(/^เมื่อเครื่องจักรฝั่งเราจะตาย ทิ้งการ์ด (\d+) ใบเพื่อให้รอดแทนได้/, (m) => (h.mechSave = +m[1])) ||
        T(/^ทำลายโทเคนเครื่องจักรฝั่งเรา 1 ตัว เพื่อให้ตัวนี้ power \+(\d+) ถาวร \(เทิร์นละไม่เกิน (\d+) ครั้ง\)$/, (m) => (h.recycle = { n: +m[1], max: +m[2] })) ||
        T(/^ฟื้นคืน: ทิ้งการ์ด (\d+) ใบ แล้วอัญเชิญตัวนี้จากสุสาน \(เทิร์นละครั้ง\)$/, (m) => (h.revive = { pay: +m[1] })) ||
        T(/^คอมโบ (\d+): (?:power \+(\d+) จนจบเทิร์น|เทิร์นนี้ตีผู้เล่นได้ 1 ครั้งแม้สนามศัตรูไม่ว่าง)$/, (m) => (h.combo = { n: +m[1], pow: +m[2] || 0, direct: !m[2] }))
      );
    }
    // เวทสวนที่ทำงานตอนศัตรูโจมตี → { t: ชนิดผล, req: เป้าหมายต้องเป็น, ... }
    reaction(x) {
      let m; x = x.replace(/^เมื่อศัตรูโจมตี: /, "");
      const who = (s) => { s = s.replace(/ฝั่งเรา|1 ตัว|ทุกตัว/g, "").trim(); return !s || s === "มอนสเตอร์" ? "มอนสเตอร์" : normKind(s); };
      if ((m = x.match(/^(.+?)ที่ถูกโจมตี ?(?:ได้)?(?:เกราะ|power) \+(\d+)(.*)$/))) {
        const r = { t: "defbuff", req: who(m[1]), n: +m[2] };
        if (m[3].includes("ต่ออัปเกรด")) r.perUpgrade = true; if (m[3].includes("ต่อหมาป่า")) r.per = "หมาป่า"; if (m[3].includes("เติบโต")) r.grow = true; return r;
      }
      if ((m = x.match(/^(.+?)ทุกตัว(?:ฝั่งเรา)?ได้เกราะ \+(\d+) จนจบเทิร์น$/))) return { t: "defbuff", req: who(m[1]), n: +m[2] };
      if ((m = x.match(/^(.+?)ที่ถูกโจมตีไม่ตายจากการโจมตีครั้งนี้$/))) return { t: "survive", req: who(m[1]) };
      if ((m = x.match(/^(.+?)ที่ถูกโจมตีกลับขึ้นมือ/))) return { t: "bounceself", req: who(m[1]) };
      if ((m = x.match(/^(.+?)ที่ถูกโจมตีฟักทันที/))) return { t: "hatch", req: who(m[1]) };
      if ((m = x.match(/^(ทิ้งการ์ด (\d+) ใบ: )?ตัวที่โจมตี power −(\d+) (ถาวร|จนจบเทิร์น)$/))) return { t: "debuff", n: +m[3], perm: m[4] === "ถาวร", pay: m[2] ? +m[2] : 0 };
      if ((m = x.match(/^(?:ถ้ามี(.+?)ฝั่งเรา )?ทำลาย(?:ตัวที่โจมตี|มอนสเตอร์ที่กำลังโจมตี) ถ้า power(?: ของมัน)? ≤ (\d+|จำนวนเครื่องจักรฝั่งเรา \+ 1)$/))) return { t: "killif", n: /\d+$/.test(m[2]) && !m[2].includes("+") ? +m[2] : "mac", have: m[1] || null };
      if ((m = x.match(/^(\S+?)ฝั่งเรา 1 ตัวทำลายตัวที่โจมตี ถ้า power ของมัน ≤ power ของ/))) return { t: "killif", n: "kind", kind: normKind(m[1]) };
      if ((m = x.match(/^ถ้าตัวที่โจมตี (power|cost) ≤ (\d+) ส่ง(ไปใต้เดค|กลับขึ้นมือ)/))) return { t: "removeif", stat: m[1], n: +m[2], where: m[3].includes("มือ") ? "hand" : "deck" };
      if ((m = x.match(/^ถ้ามี(\S+?)ฝั่งเรา ≥ (\d+) ตัว ส่งมอนสเตอร์ที่กำลังโจมตีกลับขึ้นมือ$/))) return { t: "removeif", stat: "power", n: 99, where: "hand", have: [m[1], +m[2]] };
      if ((m = x.match(/^สร้าง(\S+?) 1 ตัว.*รับการโจมตีแทน$/)) && TOKENS[normKind(m[1])]) return { t: "block", token: normKind(m[1]) };
      if ((m = x.match(/^(?:(\S+?)ฝั่งเรา 1 ตัวรับการโจมตีแทน|เปลี่ยนเป้าหมายเป็น(\S+?)ฝั่งเรา 1 ตัว|เปลี่ยนเป้าหมายการโจมตีไปเป็นมอนสเตอร์ฝั่งเราอีก 1 ตัว)(?:.*power \+(\d+))?/))) return { t: "redirect", kind: normKind(m[1] || m[2] || "มอนสเตอร์"), n: m[3] ? +m[3] : 0 };
      if ((m = x.match(/^(\S+?)ฝั่งเรา 1 ตัวสู้กับตัวที่โจมตีก่อน/))) return { t: "duel", kind: normKind(m[1]) };
      if ((m = x.match(/^อัญเชิญ(?:การ์ดเผ่า)?(\S+?) cost ≤ (\d+) จาก(สุสาน|มือ)ฟรี มารับการโจมตีแทน$/))) return { t: "summonblock", kind: normKind(m[1]), lim: +m[2], zone: m[3] };
      if (/^มอนสเตอร์ฝั่งเรา 1 ตัวได้โล่แสง/.test(x)) return { t: "shield", req: "มอนสเตอร์" };
      if (/^ถ้ามอนสเตอร์ฝั่งเราที่ถูกโจมตีรอด ทำลายตัวที่โจมตี$/.test(x)) return { t: "revenge", req: "มอนสเตอร์" };
      if ((m = x.match(/^เมื่อ(\S+?)ฝั่งเราถูกโจมตีแล้วตาย ทำลายตัวที่โจมตีด้วย$/))) return { t: "mutual", req: normKind(m[1]) };
      if (/^หลังการโจมตีนี้ ตัวที่โจมตีโจมตีไม่ได้/.test(x)) return { t: "freezeatt" };
      if (/^ป้อม 1 ตัวฝั่งเราใช้สกิลยิงได้ทันที$/.test(x)) return { t: "shoot" };
      if (/^เมื่อมอนสเตอร์ฝั่งเราจะเสียโล่แสง ให้ไม่เสียโล่ครั้งนี้$/.test(x)) return { t: "keepshield", req: "มอนสเตอร์" };
      if ((m = x.match(/^เมื่อ(\S+?)ฝั่งเราตาย อัญเชิญตัวนั้นกลับจากสุสานทันที$/))) return { t: "undying", req: normKind(m[1]) };
      if (/^เมื่อหุ่นรวมร่างจะตาย ให้แยกกลับเป็นชิ้นส่วนเดิมบนสนามแทน$/.test(x)) return { t: "split" };
      if (/^เมื่อเครื่องจักรที่มีอัปเกรดจะตาย ย้ายอัปเกรดทั้งหมดไปติดเครื่องจักรอีกตัวฝั่งเรา$/.test(x)) return { t: "eject" };
      if ((m = x.match(/^ถ้าเป้าหมายเป็น(\S+?) ส่ง\S+?ตัวนั้นกลับขึ้นมือ$/))) return { t: "bounceself", req: normKind(m[1]) };
      if ((m = x.match(/^ถ้าตัวที่โจมตี power ≤ (\d+) ยึดมาเป็นของเรา/))) return { t: "stealatt", n: +m[1] };
      if (/^มอนสเตอร์ที่โจมตีต้องเปลี่ยนไปโจมตีมอนสเตอร์ฝั่งตัวเอง 1 ตัวแทน$/.test(x)) return { t: "turncoat" };
      if ((m = x.match(/^เมื่อ(\S+?)ถูกโจมตี: ค้น(?:การ์ด)?(\S+?) cost ≥ (\d+) จากเดคขึ้นมือ/))) return { t: "tutor", req: normKind(m[1]), kind: m[2], min: +m[3] };
      return null;
    }
    // ผลกับมอนสเตอร์ฝั่งเรา: "<ชนิด> 1 ตัว|ทุกตัว power +N / ×N / ได้<คีย์เวิร์ด> / โจมตีได้ 2 ครั้ง / ตีผู้เล่นได้โดยตรง ..."
    own(x) {
      let m, long = false;
      if (x.startsWith("จนจบเทิร์นถัดไปของศัตรู ")) { long = true; x = x.slice(24); }
      x = x.replace(/^(เทิร์นนี้|จนจบเทิร์น |เลือก)/, "").replace(/ฝั่งเรา/g, "").replace(/ 1 ตัว ครั้งถัดไป/, " 1 ตัว ครั้งถัดไป").trim();
      if (x.includes("จนจบเทิร์นถัดไปของศัตรู")) { long = true; x = x.replace(/ ?จนจบเทิร์นถัดไปของศัตรู/, ""); }
      if (!(m = x.match(/^(.+?)( 1 ตัว| 2 ตัว|ทุกตัว)(?:ที่มีอัปเกรด)? ?(.+)$/)) || m[1].length > 24 || /ศัตรู|สุสาน|เดค|มือ/.test(m[1])) return null;
      const word = m[1].trim(), n = m[2].includes("ทุก") ? 5 : +m[2].trim()[0], fx = { long, kws: [], perm: false, upg: x.includes("ที่มีอัปเกรด") };
      let rest = m[3].replace(/เทิร์นนี้/g, "");
      if (/ถาวร/.test(rest)) fx.perm = true;
      rest = rest.replace(/ถาวร|จนจบเทิร์น/g, "").trim();
      for (let part of rest.split(/ และ|, | แล้ว/)) {
        part = part.trim(); if (!part) continue;
        if ((m = part.match(/^power \+(\d+)(?: ต่อ(?:จำนวน)?(.+))?$/))) { fx.pw = +m[1]; fx.per = m[2] ? normKind(m[2].replace(/ที่ตาย/, "ตาย")) : null; continue; }
        if ((m = part.match(/^power ×(\d+)$/))) { fx.mul = +m[1]; continue; }
        if ((m = part.match(/^(?:ได้)?เกราะ \+(\d+)(?: และ(.+))?$/))) { fx.armor = +m[1]; if (m[2]) fx.kws.push(...m[2].split(/ |และ/).filter(Boolean)); continue; }
        if (/^โจมตีได้ 2 ครั้ง$|^ตีได้ 2 ครั้ง$|^โจมตีได้เพิ่ม(?:อีก)? 1 ครั้ง$/.test(part)) { fx.atk = 1; continue; }
        if (/^ครั้งถัดไปที่ตัวนั้นจะตาย ให้รอดแทน$/.test(part)) { fx.save = true; continue; }
        if (/^ตีผู้เล่นได้โดยตรงแม้สนามศัตรูไม่ว่าง$/.test(part)) { fx.direct = true; continue; }
        if ((m = part.match(/^ได้(.+)$/))) {
          const ks = m[1].split(/และ| /).map((s) => s.trim().replace(/^สกิล/, "")).filter(Boolean);
          if (ks.every((k) => ["บิน", "บดขยี้", "พิษ", "โล่แสง", "กินเหยื่อ", "พรีกาย", "เติบโต"].includes(k))) { fx.kws.push(...ks); continue; }
        }
        if (["บิน", "บดขยี้", "พิษ", "โล่แสง", "กินเหยื่อ", "พรีกาย"].includes(part)) { fx.kws.push(part); continue; }
        return null;
      }
      return ["own", word, n, fx];
    }
    actions(x) {
      const whole = this.own(x); if (whole) return [whole];
      let w;
      if ((w = x.match(/^ดูมือศัตรู แล้วเลือกการ์ด (\d+) ใบให้ศัตรูทิ้ง$/))) return [["edisc", +w[1]]];
      if (/^สังเวย 1 ตัว แล้วทำลายมอนสเตอร์ศัตรู 1 ตัวที่ power ≤ power ของตัวที่สังเวย$/.test(x)) return [["sackill"]];
      if ((w = x.match(/^ค้น(\S+?) 1 ใบ และ(\S+?) cost ≤ (\d+) อีก 1 ใบ จากเดคขึ้นมือ$/))) return [["search", w[1], null, null], ["search", w[2], "≤", +w[3]]];
      if ((w = x.match(/^ทั้งสองฝ่ายทิ้งการ์ดจากมือคนละ (\d+) ใบ$/))) return [["discard", +w[1]], ["edisc", +w[1]]];
      if ((w = x.match(/^ส่งมอนสเตอร์ศัตรู 1 ตัวที่ power ≤ ค่าผสานธาตุ \+ (\d+) กลับขึ้นมือ$/))) return [["bounceelem", +w[1]]];
      if ((w = x.match(/^ถ้าผสานธาตุ ≥ (\d+) power \+(\d+) ถาวร$/))) return [["selfelem", +w[1], +w[2]]];
      const out = [];
      for (let part of x.split(/ และ(?=\S)| และ | แล้ว(?!จั่ว)| แล้ว/)) {
        part = part.trim(); if (!part) continue; let m;
        const o = this.own(part); if (o) { out.push(o); continue; }
        if ((m = part.match(/^ทำลายมอนสเตอร์(?:ศัตรู)?ทุกตัว(?:บนสนาม)?(?:ที่(ไม่ใช่|ไม่มี)(\S+?))?(?:(?:ที่ |และ )?power ≤ (\d+))? ?(ทั้งสองฝั่ง)?(?: ยกเว้น(\S+))?$/)) && (m[4] || m[1] === "ไม่มี" || part.includes("ศัตรู")))
          { out.push(["wipe", m[3] ? +m[3] : null, m[1] === "ไม่ใช่" ? m[2] : m[5] || null, m[1] === "ไม่มี" ? m[2] : null, !!m[4]]); continue; }
        if ((m = part.match(/^ยึดมอนสเตอร์ศัตรูทุกตัวที่ power ≤ (\d+) มาเป็นของเราถาวร/))) { out.push(["stealall", +m[1]]); continue; }
        if ((m = part.match(/^(?:สังเวย|ทำลายมอนสเตอร์ฝั่งเรา) (\d+) ตัว$/))) { out.push(["sacown", +m[1]]); continue; }
        if (/^ทำลายโดรนฝั่งเรา X ตัว/.test(part)) { out.push(["dronebomb"]); return out; }
        if ((m = part.match(/^(\S+?) 1 ตัวสู้กับมอนสเตอร์ศัตรู 1 ตัวทันที/))) { out.push(["fight", normKind(m[1])]); continue; }
        if ((m = part.match(/^มอนสเตอร์ศัตรู 1 ตัว power −(\d+) ต่อ(\S+?)ฝั่งเรา จนจบเทิร์น$/))) { out.push(["curseper", +m[1], normKind(m[2])]); continue; }
        if ((m = part.match(/^ดูการ์ด (\d+) ใบบนสุดของเดค/))) { out.push(["look", +m[1]]); return out; }
        if (/^เทิร์นนี้ใช้เวทปกติได้เพิ่มอีก 1 ใบ$/.test(part)) { out.push(["extraspell"]); continue; }
        if ((m = part.match(/^การอัญเชิญ(\S*?)ครั้งถัดไปในเทิร์นนี้ cost ลดลง (\d+)$/))) { out.push(["nextred", m[1] || "มอนสเตอร์", +m[2]]); continue; }
        if ((m = part.match(/^การอัญเชิญครั้งถัดไปในเทิร์นนี้นับว่าจ่ายเกิน (\d+) gem$/))) { out.push(["overnext", +m[1]]); continue; }
        if ((m = part.match(/^เทิร์นนี้การอัญเชิญทุกครั้งของเรานับว่าจ่ายเกิน (\d+) gem$/))) { out.push(["overall", +m[1]]); continue; }
        if ((m = part.match(/^เทิร์นนี้การ์ดทุกใบในมือเรานับเป็น gem (\d+)$/))) { out.push(["gemall", +m[1]]); continue; }
        if (/^มอนสเตอร์ฝั่งเราไม่ตาย$/.test(part) || /^จนจบเทิร์นถัดไปของศัตรู มอนสเตอร์ฝั่งเราไม่ตาย$/.test(part)) { out.push(["immune"]); continue; }
        if (/^เราไม่เสีย HP$/.test(part)) continue;
        if ((m = part.match(/^อัญเชิญ(.+?)จากสุสาน(?:ฟรี)?จนเต็ม(?:สนาม|ช่อง)/))) { out.push(["raise", m[1], 99, true, 5]); continue; }
        if ((m = part.match(/^เนรเทศมอนสเตอร์เผ่า(\S+?)ทุกตัว/))) { out.push(["exileall", m[1]]); continue; }
        if (/^ป้อม 1 ตัวใช้สกิลยิงได้ทันที/.test(part)) { out.push(["shootnow"]); continue; }
        if (/ฟอสซิลมีชีวิตไปแล้ว ใช้ได้อีกครั้ง$/.test(part)) { out.push(["fossilreset"]); continue; }
        if (/^วางการ์ดอัปเกรด 1 ใบจากมือซ้อนบนเครื่องจักร/.test(part)) { out.push(["freeupgrade"]); continue; }
        if (/^รวมร่างทันที$/.test(part)) continue;
        if ((m = part.match(/^เทิร์นนี้ป้อมทุกตัวฝั่งเรายิงได้แรงขึ้น \+(\d+)$/))) { out.push(["volley", +m[1]]); continue; }
        if ((m = part.match(/^ทิ้ง (\d+) ใบ$/))) { out.push(["discard", +m[1]]); continue; }
        if (/^ทำลายไข่หรือโทเคนของศัตรู 1 ตัว$/.test(part)) { out.push(["killtok"]); continue; }
        if (/^ทำลายมอนสเตอร์ศัตรู 1 ตัวต่อค่าผสานธาตุ$/.test(part)) { out.push(["kill", "elem", null, null]); continue; }
        if (/^ทิ้งการ์ด 1 ใบเพื่อจั่ว 1 ใบได้$/.test(part)) { out.push(["loot"]); continue; }
        if ((m = part.match(/^ถ้าฝั่งเรามี(\S+?)อย่างน้อย (\d+) ตัว จั่ว (\d+) ใบ$/))) { out.push(["drawif", m[1], +m[2], +m[3]]); continue; }
        if ((m = part.match(/^ถ้ามีคู่หู จั่ว (\d+) ใบ$/))) { out.push(["draw", +m[1], "สัตว์หรือไดโนเสาร์หรือมังกร"]); continue; }
        if (/^ดูการ์ดบนสุดของเดคศัตรู/.test(part)) { out.push(["scry", "enemy"]); return out; }
        if (/^ดูการ์ดบนสุดของเดคเรา$|^ดูการ์ดในมือศัตรู$/.test(part)) { out.push(["noop"]); continue; }
        if ((m = part.match(/^ยึดมอนสเตอร์ศัตรู 1 ตัวที่ power ≤ (\d+) มาเป็นของเราถาวร$/))) { out.push(["stealall", +m[1], 1]); continue; }
        if ((m = part.match(/^ถ้ามี(\S+?)ตัวอื่นฝั่งเรา power \+(\d+) ถาวร$/))) { out.push(["selfif", m[1], +m[2]]); continue; }
        if ((m = part.match(/^เนรเทศการ์ด(?: (\d+) ใบจาก|ทุกใบใน)สุสานศัตรู$/))) { out.push(["exilegrave", m[1] ? +m[1] : 99]); continue; }
        if (/^เทิร์นนี้ศัตรูใช้เวทสวนไม่ได้$/.test(part)) { out.push(["silence"]); continue; }
        if ((m = part.match(/^ดูมือศัตรู แล้วเลือกการ์ด (\d+) ใบให้ศัตรูทิ้ง$/))) { out.push(["edisc", +m[1]]); continue; }
        if ((m = part.match(/^สังเวยมอนสเตอร์ฝั่งเรา 1 ตัวเพื่อจั่ว (\d+) ใบได้/))) { out.push(["sacdraw", +m[1]]); return out; }
        if (/^นำการ์ดเวท 1 ใบจากกองสุสานกลับขึ้นมือ$/.test(part)) { out.push(["raisespell"]); continue; }
        if (/^ใช้เวทปกติจากกองสุสานได้ 1 ใบ/.test(part)) { out.push(["castgrave"]); return out; }
        if (/^อัญเชิญมอนสเตอร์ 3 เผ่านี้จากกองสุสานฟรี 1 ตัว$/.test(part)) { out.push(["raise", "สัตว์หรือไดโนเสาร์หรือมังกร", 99, true, 1]); continue; }
        if ((m = part.match(/^ทำลายมอนสเตอร์ศัตรู 1 ตัวที่ power ≤ จำนวน(\S+?)ฝั่งเรา$/))) { out.push(["killcount", m[1]]); continue; }
        if (/^รวมเฟืองทั้งหมดฝั่งเราเป็นหุ่น 1 ตัว/.test(part)) { out.push(["gearmerge"]); return out; }
        if (/^ย้ายอัปเกรดทั้งหมดบนสนามฝั่งเรามาติดที่ตัวนี้$/.test(part)) { out.push(["pullup"]); continue; }
        if (/^นำการ์ด 1 ใบที่ทิ้งเป็นค่าอัญเชิญในเทิร์นนี้กลับขึ้นมือ$/.test(part)) { out.push(["refund"]); continue; }
        if ((m = part.match(/^เทิร์นนี้ตัวนั้นโจมตีได้ (\d+) ครั้ง$/))) { out.push(["lastatk", +m[1]]); continue; }
        if (/^ฟักทันทีทั้งหมด$/.test(part)) { out.push(["hatchall"]); continue; }
        if ((m = part.match(/^ส่งมอนสเตอร์ 1 ตัว ?กลับขึ้นมือ$/))) { out.push(["bounce", 1, "power", 99]); continue; }
        if ((m = part.match(/^ค้น(\S+?)จากเดคขึ้นมือ 1 ใบ ต้องเป็นธาตุที่ยังไม่มี/))) { out.push(["search", m[1], null, null]); continue; }
        if ((m = part.match(/^(?:ถ้ามี(.+?)ฝั่งเรา )?จั่ว (\d+) ใบ$/))) { out.push(["draw", +m[2], m[1]]); continue; }
        if ((m = part.match(/^จั่วจนในมือมี (\d+) ใบ$/))) { out.push(["drawto", +m[1]]); continue; }
        if ((m = part.match(/^ทิ้งการ์ด (\d+) ใบ$/))) { out.push(["discard", +m[1]]); continue; }
        if ((m = part.match(/^(?:ถ้ามี(.+?)ฝั่งเรา )?สร้าง(?:โทเคน)?(\S+?)(?: \(.*?\))? (\d+) (?:ตัว|ฟอง)$/)) && TOKENS[normKind(m[2])]) { out.push(["token", normKind(m[2]), +m[3], m[1]]); continue; }
        if ((m = part.match(/^เติม(?:โทเคน)?(\S+?)ลงช่องว่างฝั่งเราจนเต็ม$/)) && TOKENS[m[1]]) { out.push(["token", m[1], 5, null]); continue; }
        if ((m = part.match(/^ทำลายมอนสเตอร์ศัตรู (\d+) ตัว(?:ที่ power ≤ (\d+|ค่าผสานธาตุ))?$/))) { out.push(["kill", +m[1], m[2] || null, null]); continue; }
        if ((m = part.match(/^ทำลายมอนสเตอร์ศัตรู(ทุกตัว)?(?:ที่ power ≤ (\d+))?$/))) { out.push(["kill", m[1] ? 5 : 1, m[2] || null, null]); continue; }
        if (part === "ทำลายมอนสเตอร์ศัตรู 3 ตัวที่เลือก") { out.push(["kill", 3, null, null]); continue; }
        if ((m = part.match(/^ทำลายมอนสเตอร์(?:ศัตรู)?เผ่า(\S+?)(?: 1 ตัว|ทุกตัว)(?:ที่ power ≤ (\d+))?(?:บนสนาม)?$/))) { out.push(["kill", part.includes("ทุกตัว") ? 5 : 1, m[2] || null, m[1]]); continue; }
        if ((m = part.match(/^ส่งมอนสเตอร์ศัตรู(?:ทุกตัว| (\d+) ตัว)(?:ที่ (cost|power) ≤ (\d+))? ?(กลับขึ้นมือ|ไปใต้เดค)$/))) { out.push([m[4].includes("มือ") ? "bounce" : "bottom", m[1] ? +m[1] : 5, m[2] || "power", m[3] ? +m[3] : 99]); continue; }
        if ((m = part.match(/^มอนสเตอร์ศัตรู(ทุกตัว| 1 ตัว) power −(\d+) (ถาวร|จนจบเทิร์น)$/))) { out.push(["curse", m[1].includes("ทุก") ? 5 : 1, +m[2], m[3] === "ถาวร"]); continue; }
        if ((m = part.match(/^มอนสเตอร์ศัตรู(?: 1 ตัว|ทุกตัว(?:ที่ power ≤ (\d+))?) ?โจมตีไม่ได้ในเทิร์นถัดไป$/))) { out.push(["freeze", part.includes("ทุกตัว") ? 5 : 1, m[1] ? +m[1] : 99]); continue; }
        if ((m = part.match(/^ล่อลวง (\d+)$/))) { out.push(["steal", +m[1]]); continue; }
        if ((m = part.match(/^(.+?)( 1 ตัว|ทุกตัว)(?:ฝั่งเรา)? power \+(\d+) (ถาวร|จนจบเทิร์น)$/)) && m[1].length < 25) { out.push(["buff", m[1], +m[3], m[4] === "ถาวร", m[2].includes("ทุก")]); continue; }
        if ((m = part.match(/^ค้น(.+?)(?: cost ([≤≥]) (\d+))? ?จากเดคขึ้นมือ(?: \d+ ใบ)?$/)) || (m = part.match(/^ค้น(.+?)(?: cost ([≤≥]) (\d+))?ขึ้นมือ(?: \d+ ใบ)?$/))) { out.push(["search", m[1], m[2] || null, m[3] ? +m[3] : null]); continue; }
        if ((m = part.match(/^(นำ|อัญเชิญ)(.+?)(?: cost ≤ (\d+))?(?: จาก| 1 (?:ใบ|ตัว)จาก)สุสาน(?:ฟรี|ขึ้นมือ)?(?: (\d+) ตัว)?(?: โดยไม่ต้องตรงเงื่อนไข)?$/)) && !m[2].includes("มังกรโบราณ")) { out.push(["raise", m[2], m[3] ? +m[3] : 99, m[1] === "อัญเชิญ", +(m[4] || 1)]); continue; }
        if ((m = part.match(/^ส่ง(.+?) 1 ใบจาก(?:มือหรือ)?เดคลงสุสาน$/))) { out.push(["entomb", m[1]]); continue; }
        if ((m = part.match(/^ทิ้งการ์ด (\d+) ใบบนสุดของเดคลงสุสาน$/))) { out.push(["mill", +m[1]]); continue; }
        if ((m = part.match(/^อัญเชิญ(.+?)(?: cost ≤ (\d+))?(?: 1 ตัว)? ?จาก(มือ|เดค)(?:หรือเดค)?(?:ได้)?ฟรี(?: 1 ตัว)?.*$/))) { out.push(["cheat", m[1], m[2] ? +m[2] : 99, m[3]]); continue; }
        if ((m = part.match(/^ศัตรูทิ้งการ์ดจากมือ (\d+) ใบ$|^ศัตรูทิ้งการ์ดทั้งมือ$/))) { out.push(["edisc", m[1] ? +m[1] : 99]); continue; }
        if (part.startsWith("รวมชิ้นส่วนไททัน") || part.startsWith("อัญเชิญชิ้นส่วนไททันทุกชนิด")) { out.push(["titan", part.includes("อัญเชิญ")]); continue; }
        if (/^ไข่(?:ทุกฟอง)?ฝั่งเรา(?: 1 ฟอง)?ฟักทันที.*$/.test(part)) { out.push(["hatchall"]); continue; }
        if ((m = part.match(/^(?:ปลุก|อัญเชิญ)มังกรโบราณ(ทุกตัว| 1 ตัว)จากสุสาน.*$/))) { out.push(["awakenall", m[1].includes("ทุก") ? 99 : 1]); continue; }
        return [];
      }
      return out;
    }
  }

  let UID = 0;
  class Unit {
    constructor(card, token) {
      this.uid = ++UID; this.card = card || null; this.token = token || null;
      if (card) {
        Object.assign(this, { kinds: new Set(card.kinds), power: card.base, kw: { ...card.kw }, armor: card.armor, shoot: card.shoot,
          double: card.double, noatk: card.noatk, noface: card.noface, hatch: card.hatch ? [...card.hatch] : null, elements: new Set(card.elements), name: card.name });
      } else {
        const [kinds, pw, ex] = TOKENS[token];
        Object.assign(this, { kinds: new Set([...kinds, "มอนสเตอร์"]), power: pw, kw: { "เติบโต": !!ex.grow, "ซ่อนตัว": !!ex.hidden }, armor: 0, shoot: null,
          double: false, noatk: !!ex.noatk, noface: false, hatch: ex.hatch ? [...ex.hatch] : null, elements: new Set(), name: token });
      }
      this.akw = {}; this.aarmor = 0; this.save = false; this.hitTurn = -1; this.atkd = false; this.grown = 0; this.cleaved = false; this.upScale = false;
      this.morph = card && card.h.morph ? [...card.h.morph] : null; this.permFrom = null;
      this.temp = 0; this.temp2 = 0; this.undo = []; this.direct = false; this.frozenNext = false; this.attached = []; this.frozen = false; this.stolenFrom = null; this.attacksLeft = 0; this.fresh = true;
    }
    has(k) { return !!(this.kw[k] || this.akw[k]); }
    get h() { return this.card ? this.card.h : {}; }
  }

  // ---------------------------------------------------------------- RNG มี seed
  const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const shuffle = (a, rnd) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  class Player {
    constructor(name, deck, rnd) {
      this.name = name; deck = deck.map((c) => Object.assign(Object.create(Object.getPrototypeOf(c)), c));   // การ์ดซ้ำต้องเป็นคนละใบ
      this.deck = shuffle([...deck], rnd); this.decklist = {};
      for (const c of deck) this.decklist[c.id] = (this.decklist[c.id] || 0) + 1;
      Object.assign(this, { hand: [], field: [], grave: [], hp: HP, lost: null, turns: 0, fossil: {}, reacted: false, played: 0, wolfAttacked: false, discTurn: 0, spellUsed: 0, spellMax: 1, immune: false, overAll: 0, overNext: 0, gemAll: 0, nextRed: [] });
    }
    draw(n = 1, log) { for (let i = 0; i < n; i++) { if (!this.deck.length) { this.lost = "เดคหมด"; return; } this.hand.push(this.deck.pop()); } }
  }

  const value = (c) => {
    if (c.type === "มอน") { if (c.kw["หลับใหล"]) return 0.1; if (c.ondiscard.length) return 0.3; return 1 + c.base * 0.5 + (c.kw["พรีกาย"] ? 1 : 0) + (c.enter.length ? 1.5 : 0); }
    if (c.counter) return 2.5; return c.spell.length ? 1.5 : 0.3;
  };

  // ---------------------------------------------------------------- เกม
  class Game {
    // opt: กติกาทดลอง (ค่าเริ่มต้น = กติกาปัจจุบัน) { hand0, draw, firstDiscount, loot, catchup }
    constructor(deckA, deckB, seed = Date.now(), log = () => {}, opt = {}) {
      this.opt = opt;
      this.rnd = rngOf(seed); this.log = log;
      this.P = [new Player("คุณ", deckA, this.rnd), new Player("บอท", deckB, this.rnd)];
      this.turn = 0; this.deaths = 0; this.cur = 0; this.winner = null; this.onFx = null;
      for (const p of this.P) p.draw(opt.hand0 || HAND0);
    }
    emit(e) { if (this.onFx) this.onFx(e); }
    arm(u) { return u.armor + u.aarmor; }
    fieldHas(p, key) { return p.field.some((o) => o.h[key]); }
    // คำนวณออร่าใหม่ (คีย์เวิร์ด / เกราะ / ไม่ตายจากเวท / เปิดซ่อนตัว) — เรียกหลังสนามเปลี่ยน
    refresh() {
      for (const p of this.P) for (const u of p.field) { u.akw = {}; u.aarmor = 0; }
      for (const p of this.P) {
        const e = this.other(p);
        for (const o of p.field) {
          const h = o.h;
          for (const a of h.kwAura || []) for (const u of p.field) if (!(a.others && u === o) && kindMatch(u.kinds, a.kind)) u.akw[a.kw] = true;
          for (const a of h.armorAura || []) for (const u of p.field) if (kindMatch(u.kinds, a.kind)) u.aarmor += a.n;
          if (h.condKw && this.count(p, h.condKw.kind, "field", o) > 0) o.akw[h.condKw.kw] = true;
          if (h.powKw && o.power + o.temp + o.temp2 >= h.powKw.n) for (const k of h.powKw.kws) o.akw[k] = true;
          if (h.reveal) for (const u of e.field) u.akw.revealed = true;
          if (h.spellproofAura && (!h.spellproofAura[1] || this.count(p, "อัศวิน") >= h.spellproofAura[1]))
            for (const u of p.field) if (kindMatch(u.kinds, h.spellproofAura[0])) u.akw.spellproof = true;
          if (h.eggGuard) for (const u of p.field) if (u.kinds.has("ไข่")) u.akw.spellproof = true;
        }
      }
    }                      // เหตุการณ์ให้หน้าจอเล่นอนิเมชัน
    other(p) { return p === this.P[0] ? this.P[1] : this.P[0]; }
    mulligan(p, cards) { for (const c of cards) { const i = p.hand.indexOf(c); if (i >= 0) p.hand.splice(i, 1); } p.deck.push(...cards); shuffle(p.deck, this.rnd); p.draw(cards.length); }
    botMulligan(p) {
      const out = []; let cheap = 0;
      for (const c of [...p.hand].sort((a, b) => (a.type !== "มอน") - (b.type !== "มอน") || a.cost - b.cost)) {
        const mon = c.type === "มอน" && !c.kw["หลับใหล"];
        if (mon && c.cost <= 3 && cheap < 2) cheap++; else if (!(c.gem >= 2 || c.counter || c.ondiscard.length)) out.push(c);
      }
      this.mulligan(p, out);
    }

    // ---------- power จริง
    count(p, word, scope = "field", others = null) {
      if (scope === "grave") return p.grave.filter((c) => kindMatch(c.kinds, word)).length;
      return p.field.filter((u) => u !== others && kindMatch(u.kinds, word)).length;
    }
    elem(p) { const s = new Set(); for (const u of p.field) for (const e of u.elements) s.add(e); return s.size; }
    eff(p, u, attacking = false, vs = null) {
      let pw = u.power + u.temp + u.temp2;
      for (const o of p.field) if (o.card) for (const [word, others, n] of o.card.auras) { if (others && o === u) continue; if (kindMatch(u.kinds, word)) pw += n; }
      const c = u.card;
      if (c) {
        for (const [n, spec, cap] of c.selfcount) {
          let k; let m;
          if (spec.includes("ในมือ")) { m = spec.match(/ทุก (\d+)/); k = Math.floor(p.hand.length / (m ? +m[1] : 1)); }
          else if (spec.includes("ผสานธาตุ")) k = this.elem(p);
          else if (spec.includes("ในสุสาน")) { m = spec.match(/(\S+?)ทุก (\d+) ใบในสุสาน/); k = m ? Math.floor(this.count(p, m[1], "grave") / +m[2]) : 0; }
          else if (spec.includes("อัปเกรด")) k = u.attached.length;
          else k = this.count(p, spec, "field", u);
          pw += Math.min(cap, n * k);
        }
        for (const [kind, a, others, n] of c.selfcond) {
          if (kind === "have" && this.count(p, a, "field", others ? u : null) > 0) pw += n;
          else if (kind === "hand" && p.hand.length >= a) pw += n;
          else if (kind === "vs" && vs && vs.kinds.has(a)) pw += n;
        }
      }
      if (u.has("คลั่งเลือด")) pw += this.deaths * (p.field.some((o) => o !== u && o.h.frenzy2) ? 2 : 1);
      const h = u.h;
      if (h.noFlyBonus && !this.other(p).field.some((x) => x.has("บิน"))) pw += h.noFlyBonus;
      if (attacking && vs && h.vsArmor && (this.arm(vs) > 0 || vs.has("พรีกาย"))) pw += h.vsArmor;
      if (u.upScale) pw += u.attached.length;
      if (u.has("โล่แสง")) for (const o of p.field) if (o.h.shieldAura) pw += o.h.shieldAura;
      if (u.has("ล่ารุม") && attacking && p.wolfAttacked) pw += 2;
      return pw;
    }
    attacksAllowed(p, u) {
      let n = u.double ? 2 : 1;
      if (u.card) for (const [kind, a, dbl] of u.card.selfcond) { if (kind === "formation" && this.count(p, "อัศวิน") >= a) n = 2; if (kind === "hand" && dbl && p.hand.length >= a) n = 2; }
      return n;
    }

    // ---------- ย้ายโซน
    kill(owner, u, bySpell = false) {
      if (!owner.field.includes(u)) return;
      if (bySpell && u.has("spellproof")) return;
      if (owner.immune) { this.log(`${u.name} ไม่ตาย (คุ้มครอง)`); return; }
      if (u.save) { u.save = false; this.log(`${u.name} รอดจากความตาย`); return; }
      if (u.kinds.has("เครื่องจักร") && owner.hand.length && owner.mechSaveTurn !== this.turn && owner.field.some((o) => o !== u && o.h.mechSave)) {
        owner.mechSaveTurn = this.turn; const c = [...owner.hand].sort((x, y) => value(x) - value(y))[0]; this.discard(owner, c);
        this.log(`${u.name} รอด (ทิ้ง ${c.name})`); return;
      }
      if (u.kw["โล่แสง"] && u.shieldKeep) { u.shieldKeep = false; this.log(`${u.name} โล่แสงไม่แตก`); return; }
      if (u.kw["โล่แสง"]) {
        u.kw["โล่แสง"] = false; this.log(`${u.name} โล่แสงแตก`);
        if (owner.shieldDrawTurn !== this.turn && this.fieldHas(owner, "onShieldDraw")) { owner.shieldDrawTurn = this.turn; this.extraDraw(owner, 1); }
        return;
      }
      owner.field.splice(owner.field.indexOf(u), 1); this.deaths++;
      const real = u.stolenFrom || owner; real.grave.push(...u.attached, ...(u.parts || []));
      this.log(`💀 ${u.name} ตาย`);
      this.onDie(owner, u);
      if (u.card) {
        const c = u.card;
        if (c.ab.includes("กลับไปหลับในสุสานได้ 1 ครั้ง")) { real.fossil[c.id] = (real.fossil[c.id] || 0) + 1; if (real.fossil[c.id] > real.decklist[c.id]) return; real.grave.push(c); }
        else if (c.kw["ฟอสซิลมีชีวิต"] && (real.fossil[c.id] || 0) < real.decklist[c.id]) { real.fossil[c.id] = (real.fossil[c.id] || 0) + 1; real.hand.push(c); this.log(`${c.name} กลับขึ้นมือ (ฟอสซิล)`); }
        else real.grave.push(c);
        const h = c.h;
        if (h.deathReturn && this.count(real, h.deathReturn.kind, "grave") >= h.deathReturn.n && real.grave.includes(c)) { real.grave.splice(real.grave.indexOf(c), 1); real.hand.push(c); this.log(`${c.name} กลับขึ้นมือ`); }
        if (h.deathDiscount) { const t = real.hand.find((x) => kindMatch(x.kinds, h.deathDiscount.kind)); if (t) { t.costMod = (t.costMod || 0) + h.deathDiscount.n; this.log(`${t.name} cost ลดลง ${h.deathDiscount.n}`); } }
        if (h.deathWard && !real.field.length) real.faceWard = true;
        this.run(real, c.ondeath, c);
      }
      this.refresh();
    }
    // เหตุการณ์ "มีมอนสเตอร์ตาย" → สกิลที่เฝ้าดูอยู่ทั้งสองฝั่ง
    onDie(owner, u) {
      const enemy = this.other(owner), holder = owner, real = u.stolenFrom || u.permFrom;
      for (const o of enemy.field) {
        const h = o.h.onEnemyDie; if (!h) continue;
        if (h.perm) { if (o.grown < h.cap) { o.power += h.n; o.grown += h.n; } } else o.temp += h.n;
      }
      for (const p of this.P) for (const o of p.field) if (o.h.onAnyDie && o.grown < o.h.onAnyDie.cap) { o.power += o.h.onAnyDie.n; o.grown += o.h.onAnyDie.n; }
      for (const o of owner.field) {
        const d = o.h.onOwnDieDraw;
        if (d && owner.dieDrawTurn !== this.turn && (d.kind === "โทเคนเครื่องจักร" ? !u.card && u.kinds.has("เครื่องจักร") : kindMatch(u.kinds, d.kind))) { owner.dieDrawTurn = this.turn; this.extraDraw(owner, d.n); }
        if (o.h.onAllyDieReturn && u.card && kindMatch(u.kinds, o.h.onAllyDieReturn) && owner.allyReturnTurn !== this.turn) {
          const g = (u.stolenFrom || owner).grave, i = g.indexOf(u.card);
          if (i >= 0 && !u.stolenFrom) { owner.allyReturnTurn = this.turn; g.splice(i, 1); owner.hand.push(u.card); this.log(`${u.card.name} กลับขึ้นมือ`); }
        }
      }
      if ((u.stolenFrom || u.permFrom) && this.fieldHas(holder, "onStolenDie")) this.extraDraw(holder, holder.field.find((o) => o.h.onStolenDie).h.onStolenDie);
    }
    // จั่วนอกช่วงจั่วปกติ (ใช้กับสกิลที่นับการจั่วพิเศษ)
    extraDraw(p, n) { p.draw(n); for (const o of p.field) if (o.h.onExtraDraw) o.temp += o.h.onExtraDraw; }
    sacrificed(p, n = 1) { for (const o of p.field) if (o.h.onSac) o.power += o.h.onSac * n; }
    spellCap(p) { return p.spellMax + (this.fieldHas(p, "spellCap") ? 1 : 0); }
    raiseBlocked(p) { const b = this.fieldHas(this.other(p), "noRaise"); if (b) this.log("   ศัตรูกันการอัญเชิญจากสุสาน"); return b; }
    removeTo(owner, u, where) {
      if (!owner.field.includes(u)) return;
      owner.field.splice(owner.field.indexOf(u), 1); const real = u.stolenFrom || owner; real.grave.push(...u.attached, ...(u.parts || []));
      if (u.card) { if (where === "hand") real.hand.push(u.card); else real.deck.unshift(u.card); }
      if (where === "deck") { const e = this.other(owner); for (const o of e.field) if (o.h.onBottomDraw) this.extraDraw(e, o.h.onBottomDraw); }
      this.refresh();
    }
    addToken(p, name, n = 1) { for (let i = 0; i < n; i++) { if (p.field.length >= FIELD) return; p.field.push(new Unit(null, name)); } }
    pick(e, n = 1, maxp = null, kind = null, by = "power", limit = 99) {
      let c = e.field.filter((u) => (!kind || kindMatch(u.kinds, kind)) && (maxp == null || this.eff(e, u) <= maxp));
      if (this.magnetFor === e && n < 5 && e.field.some((u) => u.h.magnet)) c = c.filter((u) => u.h.magnet);   // เวทของศัตรูเลือกได้แค่ตัวล่อเป้า
      if (by === "cost") c = c.filter((u) => (u.card ? u.card.cost : 0) <= limit); else if (limit !== 99) c = c.filter((u) => this.eff(e, u) <= limit);
      return c.sort((a, b) => this.eff(e, b) - this.eff(e, a)).slice(0, n);
    }
    place(p, c, deferEnter = false) {
      const u = new Unit(c); p.field.push(u); this.lastPlaced = u; this.refresh();
      this.emit({ t: "summon", id: c.id, by: this.P.indexOf(p) }); this.log(`✨ ${p.name} อัญเชิญ ${c.name}`);
      if (c.h.combo && p.played >= c.h.combo.n) { if (c.h.combo.pow) u.temp += c.h.combo.pow; if (c.h.combo.direct) u.direct = true; this.log(`   คอมโบ ${c.h.combo.n}!`); }
      if (!deferEnter) this.enterFx(p, c, u);
      return u;
    }
    enterFx(p, c, u) { this.run(p, c.enter, c, u); this.checkOmega(p); this.refresh(); }
    discard(p, c) {
      const i = p.hand.indexOf(c); if (i >= 0) p.hand.splice(i, 1);
      p.grave.push(c); p.discTurn++; if (c.ondiscard.length) this.run(p, c.ondiscard, c);
      for (const o of p.field) if (o.h.onDiscardPow) o.temp += o.h.onDiscardPow;
    }

    run(p, acts, src = null, self = null) {
      const e = this.other(p), spell = src && src.type !== "มอน";
      const prevMag = this.magnetFor; if (spell) this.magnetFor = e;
      try { this.runActs(p, e, acts, src, self, spell); } finally { this.magnetFor = prevMag; this.refresh(); }
    }
    runActs(p, e, acts, src, self, spell) {
      for (const a of acts) {
        if (p.lost || e.lost) return;
        const k = a[0];
        if (k === "draw") { if (a[2] && !this.count(p, a[2])) continue; this.extraDraw(p, a[1]); }
        else if (k === "drawto") this.extraDraw(p, Math.max(0, a[1] - p.hand.length));
        else if (k === "noop") {}
        else if (k === "volley") { for (const u of [...p.field]) if (u.shoot != null && p.field.includes(u)) this.shootWith(p, u, a[1]); }
        else if (k === "killtok") { const t = e.field.filter((u) => !u.card || u.kinds.has("ไข่")).sort((x, y) => this.eff(e, y) - this.eff(e, x))[0]; if (t) this.kill(e, t, spell); }
        else if (k === "loot") { const c = [...p.hand].sort((x, y) => value(x) - value(y))[0]; if (c && value(c) < 1) { this.discard(p, c); this.extraDraw(p, 1); } }
        else if (k === "drawif") { if (this.count(p, a[1]) >= a[2]) this.extraDraw(p, a[3]); }
        else if (k === "scry") { const d = a[1] === "enemy" ? e.deck : p.deck, top = d[d.length - 1]; if (top && (a[1] === "enemy" ? value(top) >= 1.5 : value(top) < 0.5)) d.unshift(d.pop()); }
        else if (k === "selfif") { if (self && this.count(p, a[1], "field", self) > 0) self.power += a[2]; }
        else if (k === "selfelem") { if (self && this.elem(p) >= a[1]) self.power += a[2]; }
        else if (k === "exilegrave") { const g = [...e.grave].sort((x, y) => value(y) - value(x)).slice(0, a[1]); e.grave = e.grave.filter((c) => !g.includes(c)); if (g.length) this.log(`   เนรเทศ ${g.length} ใบจากสุสาน ${e.name}`); }
        else if (k === "silence") { e.silencedTurn = this.turn; this.log(`   เทิร์นนี้ ${e.name} ใช้เวทสวนไม่ได้`); }
        else if (k === "sacdraw" || k === "sackill") {
          const v = p.field.filter((u) => u !== self).sort((x, y) => (!!x.card - !!y.card) || this.eff(p, x) - this.eff(p, y))[0];
          if (!v || (k === "sacdraw" && v.card && this.eff(p, v) > 2)) continue;
          if (k === "sackill" && !this.pick(e, 1, this.eff(p, v)).length) continue;
          const pw = this.eff(p, v); this.log(`   สังเวย ${v.name}`); this.kill(p, v); this.sacrificed(p);
          if (k === "sacdraw") this.extraDraw(p, a[1]); else for (const t of this.pick(e, 1, pw)) this.kill(e, t);
        }
        else if (k === "raisespell") { if (this.raiseBlocked(p)) continue; const c = p.grave.filter((c) => c.type !== "มอน").sort((x, y) => value(y) - value(x))[0]; if (c) { p.grave.splice(p.grave.indexOf(c), 1); p.hand.push(c); } }
        else if (k === "castgrave") { const c = p.grave.filter((c) => c.type === "เวทปกติ" && c.spell.length && !c.spell.some((x) => x[0] === "castgrave") && (!c.spellCond || this.count(p, c.spellCond))).sort((x, y) => value(y) - value(x))[0]; if (c) { this.log(`   ใช้ ${c.name} จากสุสาน`); this.run(p, c.spell, c); } }
        else if (k === "killcount") { for (const t of this.pick(e, 1, this.count(p, a[1]))) this.kill(e, t, spell); }
        else if (k === "bounceelem") { for (const t of this.pick(e, 1, this.elem(p) + a[1])) { this.removeTo(e, t, "hand"); this.log(`${t.name} ถูกส่งกลับมือ`); } }
        else if (k === "gearmerge") {
          const gs = p.field.filter((u) => u.name === "เฟือง"); if (gs.length < 2) continue;
          for (const g of gs) p.field.splice(p.field.indexOf(g), 1);
          const t = new Unit(null, "เฟือง"); t.name = "หุ่นเฟือง"; t.power = 2 * gs.length; p.field.push(t); this.log(`🤖 รวมเฟือง ${gs.length} ตัวเป็นหุ่น power ${t.power}`);
        }
        else if (k === "pullup") { if (self) for (const o of p.field) if (o !== self && o.attached.length) { for (const c of o.attached) { o.power -= c.base; self.power += c.base; for (const g of c.grant) self.kw[g] = true; if (c.h.upScale) self.upScale = true; } self.attached.push(...o.attached); o.attached = []; } }
        else if (k === "refund") { const c = (p.lastFodder || []).filter((c) => p.grave.includes(c)).sort((x, y) => value(y) - value(x))[0]; if (c) { p.grave.splice(p.grave.indexOf(c), 1); p.hand.push(c); this.log(`   ${c.name} กลับขึ้นมือ`); } }
        else if (k === "lastatk") { if (this.lastPlaced && p.field.includes(this.lastPlaced)) this.lastPlaced.attacksLeft = Math.max(this.lastPlaced.attacksLeft, a[1]); }
        else if (k === "discard") { for (const c of [...p.hand].sort((x, y) => value(x) - value(y)).slice(0, a[1])) this.discard(p, c); }
        else if (k === "token") { if (a[3] && !this.count(p, a[3])) continue; this.addToken(p, a[1], a[2]); }
        else if (k === "kill") { let [, n, lim, kind] = a; if (n === "elem") n = this.elem(p); if (!n) continue; const maxp = lim === "ค่าผสานธาตุ" ? this.elem(p) : lim ? +lim : null; for (const u of this.pick(e, n, maxp, kind)) this.kill(e, u, spell); }
        else if (k === "bounce" || k === "bottom") { for (const u of this.pick(e, a[1], null, null, a[2], a[3])) { this.removeTo(e, u, k === "bounce" ? "hand" : "deck"); this.log(`${u.name} ถูกส่ง${k === "bounce" ? "กลับมือ" : "ไปใต้เดค"}`); } }
        else if (k === "curse") { for (const u of this.pick(e, a[1])) { if (a[3]) u.power -= a[2]; else u.temp -= a[2]; if (this.eff(e, u) < 0) this.kill(e, u); } }
        else if (k === "freeze") { for (const u of this.pick(e, a[1], a[2])) u.frozen = true; }
        else if (k === "steal") { if (p.field.length >= FIELD) continue; const t = this.pick(e, 1, a[1]); if (t.length) { const u = t[0]; e.field.splice(e.field.indexOf(u), 1); u.stolenFrom = e; u.attacksLeft = 1; p.field.push(u); this.log(`💘 ${p.name} ยึด ${u.name}`); } }
        else if (k === "buff") { const [, word, n, perm, every] = a; let tg = p.field.filter((u) => kindMatch(u.kinds, word) || ["มอนสเตอร์", ""].includes(normKind(word))); if (!every) tg = tg.sort((x, y) => this.eff(p, y) - this.eff(p, x)).slice(0, 1); for (const u of tg) { if (perm) u.power += n; else u.temp += n; } }
        else if (k === "search") { const [, word, op, lim] = a; for (let i = p.deck.length - 1; i >= 0; i--) { const c = p.deck[i]; if (kindMatch(c.kinds, word) && (lim == null || (op === "≤" ? c.cost <= lim : c.cost >= lim))) { p.deck.splice(i, 1); p.hand.push(c); break; } } }
        else if (k === "raise") { if (this.raiseBlocked(p)) continue; const [, word, lim, toField, n] = a; for (let i = 0; i < n; i++) { const cand = p.grave.filter((c) => kindMatch(c.kinds, word) && c.cost <= lim && !c.kw["หลับใหล"]); if (!cand.length) break; const c = cand.sort((x, y) => y.base - x.base)[0]; p.grave.splice(p.grave.indexOf(c), 1); if (toField && c.type === "มอน" && p.field.length < FIELD) this.place(p, c); else p.hand.push(c); } }
        else if (k === "entomb") { for (const z of [p.deck, p.hand]) { const cand = z.filter((c) => kindMatch(c.kinds, a[1])).sort((x, y) => !!y.kw["หลับใหล"] - !!x.kw["หลับใหล"]); if (cand.length) { z.splice(z.indexOf(cand[0]), 1); p.grave.push(cand[0]); break; } } }
        else if (k === "mill") { for (let i = 0; i < a[1]; i++) if (p.deck.length) p.grave.push(p.deck.pop()); }
        else if (k === "cheat") { const [, word, lim, zone] = a; for (const z of zone === "มือ" ? [p.hand, p.deck] : [p.deck]) { const cand = z.filter((c) => c.type === "มอน" && kindMatch(c.kinds, word) && c.cost <= lim && !c.kw["หลับใหล"]); if (cand.length && p.field.length < FIELD) { const c = cand.sort((x, y) => y.base - x.base)[0]; z.splice(z.indexOf(c), 1); this.place(p, c); break; } } }
        else if (k === "edisc") { for (const c of [...e.hand].sort((x, y) => value(y) - value(x)).slice(0, a[1])) this.discard(e, c); }
        else if (k === "titan") { if (a[1]) { const seen = new Set(p.field.map((u) => u.name)); for (const c of [...p.deck]) if (c.kinds.has("ชิ้นส่วนไททัน") && !seen.has(c.name) && p.field.length < FIELD) { p.deck.splice(p.deck.indexOf(c), 1); p.field.push(new Unit(c)); seen.add(c.name); } } this.titan(p); }
        else if (k === "hatchall") { for (const u of p.field) if (u.hatch) u.hatch[0] = 1; this.hatch(p); }
        else if (k === "awakenall") { for (const c of p.grave.filter((c) => c.kw["หลับใหล"]).slice(0, a[1])) if (p.field.length < FIELD && this.payAwaken(p, c)) { p.grave.splice(p.grave.indexOf(c), 1); this.place(p, c); } }
        else if (k === "own") {
          const [, word, n, fx] = a, all = ["มอนสเตอร์", ""].includes(normKind(word));
          let tg = p.field.filter((u) => all || kindMatch(u.kinds, word));
          if (fx.upg) tg = tg.filter((u) => u.attached.length);
          if (n < 5) tg = tg.sort((x, y) => !this.canAttack(p, y) - !this.canAttack(p, x) || this.eff(p, y) - this.eff(p, x)).slice(0, n);
          const when = fx.long ? "start" : "end";
          for (const u of tg) {
            const add = (v) => { if (fx.perm) u.power += v; else if (fx.long) u.temp2 += v; else u.temp += v; };
            if (fx.pw != null) add(fx.pw * (fx.per ? (fx.per === "มอนสเตอร์ตาย" || fx.per === "ตาย" ? this.deaths : this.count(p, fx.per)) : 1));
            if (fx.mul) add(this.eff(p, u) * (fx.mul - 1));
            if (fx.armor) { u.armor += fx.armor; if (!fx.perm) { const v = fx.armor; u.undo.push([when, () => (u.armor -= v)]); } }
            for (const kw of fx.kws) if (!u.kw[kw]) { u.kw[kw] = true; if (!fx.perm) u.undo.push([when, () => (u.kw[kw] = false)]); }
            if (fx.atk) u.attacksLeft++;
            if (fx.direct) u.direct = true;
            if (fx.save) u.save = true;
            if (fx.killBonus) u.killBonusTurn = this.turn;
          }
          if (tg.length) this.log(`   ${tg.map((u) => u.name).join(", ")} ได้รับผล`);
        }
        else if (k === "wipe") {
          const [, maxp, exc, noKw, both] = a;
          for (const side of both ? [p, e] : [e]) for (const u of [...side.field]) {
            if (maxp != null && this.eff(side, u) > maxp) continue;
            if (exc && kindMatch(u.kinds, exc)) continue;
            if (noKw && u.has(noKw)) continue;
            this.kill(side, u, spell);
          }
        }
        else if (k === "stealall") { for (const u of this.pick(e, a[2] || 5, a[1])) { if (p.field.length >= FIELD) break; e.field.splice(e.field.indexOf(u), 1); u.permFrom = e; p.field.push(u); this.log(`💘 ${p.name} ยึด ${u.name} ถาวร`); } }
        else if (k === "sacown") { for (const u of [...p.field].sort((x, y) => this.eff(p, x) - this.eff(p, y)).slice(0, a[1])) { this.kill(p, u); this.sacrificed(p); } }
        else if (k === "dronebomb") { const ds = p.field.filter((u) => u.kinds.has("โดรน")); const x = ds.length; for (const u of ds) this.kill(p, u); if (x) for (const u of this.pick(e, 1, 2 * x)) this.kill(e, u, true); }
        else if (k === "fight") {
          const w = p.field.filter((u) => kindMatch(u.kinds, a[1])).sort((x, y) => this.eff(p, y) - this.eff(p, x))[0]; if (!w) continue;
          const t = e.field.filter((x) => this.eff(p, w, true, x) >= this.eff(e, x, false, w) + this.arm(x)).sort((x, y) => this.eff(e, y) - this.eff(e, x))[0] || e.field[0];
          if (t) { this.log(`   ${w.name} สู้กับ ${t.name}`); this.combat(p, w, e, t, {}); }
        }
        else if (k === "curseper") { const n = a[1] * this.count(p, a[2]); for (const u of this.pick(e, 1)) { u.temp -= n; if (this.eff(e, u) < 0) this.kill(e, u); } }
        else if (k === "look") { const top = p.deck.splice(Math.max(0, p.deck.length - a[1])); if (top.length) { const b = top.sort((x, y) => value(y) - value(x)).shift(); p.hand.push(b); p.deck.unshift(...top); } }
        else if (k === "extraspell") p.spellMax++;
        else if (k === "nextred") p.nextRed.push([a[1], a[2]]);
        else if (k === "overnext") p.overNext += a[1];
        else if (k === "overall") p.overAll += a[1];
        else if (k === "gemall") p.gemAll = a[1];
        else if (k === "immune") p.immune = true;
        else if (k === "exileall") { for (const s of [p, e]) { for (const u of [...s.field]) if (kindMatch(u.kinds, a[1])) s.field.splice(s.field.indexOf(u), 1); s.grave = s.grave.filter((c) => !kindMatch(c.kinds, a[1])); } this.log(`   เนรเทศ${a[1]}ทั้งหมด`); }
        else if (k === "shootnow") { const u = p.field.find((u) => u.shoot != null); if (u) this.shootWith(p, u); }
        else if (k === "fossilreset") p.fossil = {};
        else if (k === "freeupgrade") { const c = p.hand.find((c) => c.kw["อัปเกรด"]); if (c && p.field.some((u) => u.kinds.has("เครื่องจักร"))) { p.hand.splice(p.hand.indexOf(c), 1); this.attachUp(p, c); } }
        else if (k === "combo") { if (p.played >= a[1]) this.runActs(p, e, a[2], src, self, spell); }
      }
    }
    checkOmega(p) {
      const names = ["อัลฟ่าบอท", "เบต้าบอท", "แกมม่าบอท"], have = {};
      for (const u of p.field) if (names.includes(u.name)) have[u.name] = u;
      if (Object.keys(have).length === 3) { for (const u of Object.values(have)) p.field.splice(p.field.indexOf(u), 1); const o = new Unit(null, "โดรน"); o.name = "โอเมก้าบอท"; o.power = 7; o.parts = Object.values(have).map((u) => u.card).filter(Boolean); p.field.push(o); this.log("🤖 รวมร่างเป็นโอเมก้าบอท"); }
    }
    titan(p) {
      const parts = {};
      for (const u of p.field) if (u.kinds.has("ชิ้นส่วนไททัน") && !parts[u.name]) parts[u.name] = u;
      const hand = {};
      for (const c of p.hand) if (c.kinds.has("ชิ้นส่วนไททัน") && !parts[c.name] && !hand[c.name]) hand[c.name] = c;
      const n = Object.keys(parts).length + Object.keys(hand).length;
      if (n < 3 || (!Object.keys(parts).length && p.field.length >= FIELD)) return;
      for (const c of Object.values(hand)) p.hand.splice(p.hand.indexOf(c), 1);
      for (const u of Object.values(parts)) p.field.splice(p.field.indexOf(u), 1);
      const t = new Unit(null, "โดรน"); t.name = "ไททันเกียร์"; t.power = { 3: 7, 4: 9, 5: 11 }[Math.min(5, n)];
      t.parts = [...Object.values(hand), ...Object.values(parts).map((u) => u.card)].filter(Boolean); p.field.push(t); this.log(`🤖 รวมร่างไททันเกียร์ power ${t.power}`);
    }
    hatch(p) {
      const speed = p.field.some((o) => o.card && (o.card.ab.includes("ฟักเร็วขึ้น") || o.card.ab.includes("นับเวลาฟักเพิ่ม"))) ? 2 : 1;
      for (const u of [...p.field]) {
        if (!u.hatch) continue; u.hatch[0] -= speed; if (u.hatch[0] > 0) continue;
        const [, pw, tgt] = u.hatch; u.hatch = null; u.noatk = false; if (pw != null) u.power = pw; this.log(`🥚 ${u.name} ฟักแล้ว`);
        const m = tgt.match(/อัญเชิญ(\S+) cost ≤ (\d+)/);
        if (tgt.includes("อัญเชิญ") && m) { p.field.splice(p.field.indexOf(u), 1); this.run(p, [["cheat", m[1], +m[2], "เดค"]]); }
        if (tgt.includes("กินเหยื่อ")) u.kw["กินเหยื่อ"] = true; if (tgt.includes("บิน")) u.kw["บิน"] = true;
        const am = tgt.match(/เกราะ (\d+)/); if (am) u.armor = +am[1];
      }
    }
    awakenCheck(p) {
      for (const c of p.grave.filter((c) => c.kw["หลับใหล"] && c.awaken)) {
        const w = c.awaken; let ok = false, m;
        if ((m = w.match(/สุสานเรามีการ์ด ≥ (\d+)/))) ok = p.grave.length >= +m[1];
        else if ((m = w.match(/HP เราเหลือ ≤ (\d+)/))) ok = p.hp <= +m[1];
        else if ((m = w.match(/เทิร์นที่ (\d+) ของเรา/))) ok = p.turns >= +m[1];
        else if ((m = w.match(/มี(?:การ์ด)?(\S+?)(ตัวอื่น)? ≥ (\d+) ใบในสุสาน/))) ok = this.count(p, m[1], "grave") - (m[2] && kindMatch(c.kinds, m[1]) ? 1 : 0) >= +m[3];
        else if (w.includes("มังกรโบราณตัวอื่น")) ok = p.field.some((u) => u.kinds.has("มังกรโบราณ"));
        if (ok && p.field.length < FIELD && p.grave.includes(c) && this.payAwaken(p, c)) { p.grave.splice(p.grave.indexOf(c), 1); this.place(p, c); this.log(`🐉 ${c.name} ตื่นจากสุสาน`); }
      }
    }
    payAwaken(p, c) { const f = this.autoPay(p, c.awakenGem, null); if (f == null) return false; for (const x of f) this.discard(p, x); return true; }

    cost(p, c) {
      let red = 0;
      for (const [n, spec] of c.costred) {
        let k, m;
        if (spec.includes("ในสุสาน")) { m = spec.match(/(\S+?)ทุก (\d+) ใบในสุสาน/); k = m ? Math.floor(this.count(p, m[1], "grave") / +m[2]) : this.count(p, spec.replace(/(บนสนามและ)?ในสุสาน.*/, ""), "grave"); if (spec.includes("บนสนามและ")) k += this.count(p, spec.replace(/บนสนามและ.*/, "")); }
        else if (spec.includes("ในมือ")) k = Math.floor(p.hand.length / 2);
        else if (spec.includes("ผสานธาตุ")) k = this.elem(p);
        else if (spec.includes("ที่เล่นไปแล้ว")) k = p.played;
        else if (spec.includes("มอนสเตอร์ศัตรูที่ตาย") || spec.includes("มอนสเตอร์ที่ตาย")) k = this.deaths;
        else if (spec.includes("มอนสเตอร์ศัตรูบนสนาม")) k = this.other(p).field.length;
        else if (spec.includes("ที่เราทิ้ง")) k = p.discTurn;
        else if (spec.includes("อัปเกรด")) k = p.field.reduce((s, u) => s + u.attached.length, 0);
        else k = this.count(p, spec.replace(/บนสนาม.*|\(.*/, ""));
        red += n * k;
      }
      const seen = new Set();
      for (const o of p.field) if (o.card) for (const [word, n] of o.card.handred) { if (o.card.ab.includes("ไม่ลดซ้อน") && seen.has(o.card.id)) continue; seen.add(o.card.id); if (kindMatch(c.kinds, word)) red += n; }
      for (const [w, n] of p.nextRed) if (kindMatch(c.kinds, w)) red += n;
      red += c.costMod || 0;
      return Math.max(0, c.cost - red);
    }
    gemOf(p, c) {
      let g = p.gemAll ? Math.max(c.gem, p.gemAll) : c.gem;
      for (const o of p.field) if (o.h.gemAura && kindMatch(c.kinds, o.h.gemAura.kind)) g += o.h.gemAura.n;
      return g;
    }
    autoPay(p, cost, exclude) {
      if (cost <= 0) return [];
      const g = (c) => this.gemOf(p, c);
      const pool = p.hand.filter((c) => c !== exclude && g(c) > 0).sort((a, b) => value(a) / g(a) - value(b) / g(b));
      const out = []; let sum = 0;
      for (const c of pool) { out.push(c); sum += g(c); if (sum >= cost) break; }
      if (sum < cost) return null;
      for (const c of [...out].sort((a, b) => value(b) - value(a))) if (sum - g(c) >= cost) { out.splice(out.indexOf(c), 1); sum -= g(c); }
      return out;
    }
    canSummon(p, c) {
      if (c.type !== "มอน" || c.kw["หลับใหล"]) return "อัญเชิญจากมือไม่ได้ (หลับใหล)";
      const up = c.kw["อัปเกรด"] && p.field.some((u) => u.kinds.has("เครื่องจักร"));
      if (p.field.length >= FIELD && !up && !c.sac) return "สนามเต็ม";
      if (c.sac && p.field.length < c.sac) return `ต้องมีมอนให้สังเวย ${c.sac} ตัว`;
      return null;
    }
    attachUp(p, c) {
      const host = p.field.filter((u) => u.kinds.has("เครื่องจักร")).sort((a, b) => this.eff(p, b) - this.eff(p, a))[0];
      host.power += c.base; host.attached.push(c); for (const g of c.grant) host.kw[g] = true; if (c.h.upScale) host.upScale = true;
      this.log(`🔧 ${c.name} อัปเกรด ${host.name}`); if (host.h.onUpgradeDraw) this.extraDraw(p, host.h.onUpgradeDraw); this.refresh();
    }

    // ---------- การกระทำ (ผู้เล่นหรือบอทเรียก)
    async summon(p, c, fodder, react = null) {
      const err = this.canSummon(p, c); if (err) return err;
      const need = this.cost(p, c), have = fodder.reduce((s, x) => s + this.gemOf(p, x), 0);
      if (have < need) return `gem ไม่พอ (ต้องใช้ ${need} มี ${have})`;
      const over = have - need + p.overAll + p.overNext; p.overNext = 0;
      p.nextRed = p.nextRed.filter(([w]) => !kindMatch(c.kinds, w));
      p.hand.splice(p.hand.indexOf(c), 1);
      for (const x of fodder) this.discard(p, x);
      p.lastFodder = fodder;
      if (fodder.length >= 2) for (const o of p.field) if (o.h.bigPayKill) for (const t of this.pick(this.other(p), 1, o.h.bigPayKill)) this.kill(this.other(p), t);
      if (fodder.length) this.log(`🗑 ${p.name} ทิ้ง ${fodder.map((x) => x.name).join(", ")} (gem ${have})`);
      if (c.sac) for (const u of [...p.field].sort((a, b) => this.eff(p, a) - this.eff(p, b)).slice(0, c.sac)) { this.kill(p, u); this.sacrificed(p); }
      p.played++;
      const up = c.kw["อัปเกรด"] && p.field.some((u) => u.kinds.has("เครื่องจักร"));
      if (up) this.attachUp(p, c);
      else {
        const u = this.place(p, c, true); u.attacksLeft = this.turn === 1 || c.h.sick ? 0 : Math.max(u.attacksLeft, this.attacksAllowed(p, u));
        const e = this.other(p); let blocked = false;
        if (react && c.enter.length && !e.reacted && e.silencedTurn !== this.turn) {            // เวทสวนยกเลิกสกิล "ลงสนาม"
          const opts = e.hand.filter((x) => x.type === "เวทสวน" && x.counterEtb).map((card) => ({ kind: "counter", card }));
          const ch = opts.length ? await react(e, { opts, etb: c }) : null;
          if (ch) { this.emit({ t: "react", id: ch.card.id, by: this.P.indexOf(e) }); e.hand.splice(e.hand.indexOf(ch.card), 1); e.grave.push(ch.card); e.reacted = true; this.log(`✋ ${e.name} ใช้ ${ch.card.name} ยกเลิกสกิลลงสนามของ ${c.name}`); this.counterUsed(e); blocked = true; }
        }
        if (blocked) { this.checkOmega(p); this.refresh(); } else this.enterFx(p, c, u);
        if (c.offer && over > 0 && p.field.includes(u)) {
          const [k, a] = c.offer, e = this.other(p); this.log(`🙏 เครื่องเซ่น (จ่ายเกิน ${over} gem)`);
          if (k === "powerper") u.power += over; else if (k === "power") u.power += a;
          else if (k === "killper") for (const t of this.pick(e, Math.min(a, over))) this.kill(e, t);
          else this.run(p, a, c);
        }
      }
      this.checkEnd(); return null;
    }
    spellUsable(p, c) {
      if (c.type !== "เวทปกติ") return "ใช้ได้เฉพาะเวทปกติในเทิร์นตัวเอง";
      if (p.spellUsed >= this.spellCap(p)) return "ใช้เวทปกติครบแล้วในเทิร์นนี้";
      if (!c.spell.length) return "เวทนี้ยังไม่รองรับในต้นแบบ";
      if (c.spellCond && !this.count(p, c.spellCond)) return `ต้องมี${c.spellCond}ฝั่งเรา`;
      if (c.spellPre) {
        const [k, n] = c.spellPre;
        if (k === "คอมโบ" && p.played < n - 1) return `คอมโบ ${n}: ต้องเล่นการ์ดอื่นในเทิร์นนี้ก่อน ${n - 1} ใบ`;
        if (k === "ขบวน" && this.count(p, "อัศวิน") < n) return `ขบวน ${n}: ต้องมีอัศวินบนสนาม ${n} ตัว`;
        if (k === "ธาตุ" && this.elem(p) < n) return `ต้องมีผสานธาตุ ${n}`;
      }
      return null;
    }
    async cast(p, c, react = null) {
      const err = this.spellUsable(p, c); if (err) return err;
      p.hand.splice(p.hand.indexOf(c), 1); p.grave.push(c); p.played++; p.spellUsed++;
      this.log(`🔮 ${p.name} ใช้เวท ${c.name}`); this.emit({ t: "cast", id: c.id, by: this.P.indexOf(p) });
      const e = this.other(p);
      if (e.field.some((o) => o.h.spellTax)) { const n = e.field.find((o) => o.h.spellTax).h.spellTax; for (const x of [...p.hand].sort((a, b) => value(a) - value(b)).slice(0, n)) { this.discard(p, x); this.log(`   ${p.name} ต้องทิ้ง ${x.name}`); } }
      if (react && !e.reacted && e.silencedTurn !== this.turn) {
        const opts = e.hand.filter((x) => x.type === "เวทสวน" && x.counter && x.counter[0] === "spell").map((card) => ({ kind: "counter", card }));
        const ch = opts.length ? await react(e, { opts, spell: c }) : null;
        if (ch) { this.emit({ t: "react", id: ch.card.id, by: this.P.indexOf(e) }); e.hand.splice(e.hand.indexOf(ch.card), 1); e.grave.push(ch.card); e.reacted = true; this.log(`✋ ${e.name} ใช้เวทสวน ${ch.card.name} ยกเลิกเวท ${c.name}`); this.counterUsed(e); return null; }
      }
      this.run(p, c.spell, c);
      for (const o of [...p.field]) {                                     // ร่ายเวท: สกิลที่ทำงานเมื่อเราใช้เวท
        const h = o.h.onCast; if (!h || !p.field.includes(o)) continue;
        if (h.pow) { if (h.perm) o.power += h.pow; else o.temp += h.pow; }
        if (h.acts && !(h.once && o.castTurn === this.turn)) { o.castTurn = this.turn; this.run(p, h.acts, o.card, o); }
      }
      this.checkEnd(); return null;
    }
    // สกิลที่กดใช้เองในเทิร์นตัวเอง → [{ key, label, pay (จำนวนการ์ดที่ต้องทิ้ง), err }]
    abilities(p) {
      const out = [];
      for (const u of p.field) if (u.h.recycle) {
        const tok = p.field.some((x) => x !== u && !x.card && x.kinds.has("เครื่องจักร"));
        const used = u.recycleTurn === this.turn ? u.recycled : 0;
        out.push({ key: `recycle:${u.uid}`, label: `${u.name}: ทำลายโทเคนเครื่องจักร → power +${u.h.recycle.n}`, pay: 0,
          err: !tok ? "ไม่มีโทเคนเครื่องจักรให้ทำลาย" : used >= u.h.recycle.max ? "ใช้ครบแล้วในเทิร์นนี้" : null });
      }
      p.grave.forEach((c, i) => {
        if (!c.h.revive || out.some((a) => a.cardId === c.id)) return;
        const err = p.reviveTurn === this.turn ? "ใช้ฟื้นคืนไปแล้วในเทิร์นนี้" : p.field.length >= FIELD ? "สนามเต็ม" : p.hand.length < c.h.revive.pay ? "ไม่มีการ์ดให้ทิ้ง"
          : this.fieldHas(this.other(p), "noRaise") ? "ศัตรูกันการอัญเชิญจากสุสาน" : null;
        out.push({ key: `revive:${i}`, cardId: c.id, label: `ฟื้นคืน ${c.name} (ทิ้ง ${c.h.revive.pay} ใบ)`, pay: c.h.revive.pay, err });
      });
      return out;
    }
    useAbility(p, key, k = null) {
      const ab = this.abilities(p).find((a) => a.key === key); if (!ab) return "ใช้สกิลนี้ไม่ได้"; if (ab.err) return ab.err;
      const [kind, arg] = key.split(":");
      if (kind === "recycle") {
        const u = p.field.find((x) => x.uid === +arg), tok = p.field.filter((x) => x !== u && !x.card && x.kinds.has("เครื่องจักร")).sort((a, b) => this.eff(p, a) - this.eff(p, b))[0];
        if (u.recycleTurn !== this.turn) { u.recycleTurn = this.turn; u.recycled = 0; }
        u.recycled++; this.log(`♻ ${u.name} ทำลาย ${tok.name}`); this.kill(p, tok); u.power += u.h.recycle.n;
      } else if (kind === "revive") {
        const c = p.grave[+arg], pay = k != null && p.hand[k] ? [p.hand[k]] : [...p.hand].sort((a, b) => value(a) - value(b)).slice(0, c.h.revive.pay);
        for (const x of pay) this.discard(p, x);
        p.reviveTurn = this.turn; p.grave.splice(p.grave.indexOf(c), 1); this.log(`🧟 ${p.name} ฟื้นคืน ${c.name}`);
        const u = this.place(p, c); u.attacksLeft = this.attacksAllowed(p, u);
      }
      this.refresh(); this.checkEnd(); return null;
    }
    counterUsed(d) { for (const o of d.field) { const h = o.h.onCounter; if (!h) continue; if (h.pow) o.power += h.pow; if (h.draw) this.extraDraw(d, h.draw); } }
    mustAttackErr(p) {
      const u = p.field.find((u) => u.h.mustAttack && !this.canAttack(p, u) && this.targets(p, u).length);
      return u ? `${u.name} ต้องโจมตีก่อนจบเทิร์น` : null;
    }
    targets(p, u) {
      const e = this.other(p);
      if (!e.field.length) return u.noface ? [] : ["face"];
      const t = e.field.filter((x) => !(x.has("ซ่อนตัว") && !x.akw.revealed && e.field.length > 1));
      if (u.direct && !u.noface) t.push("face");
      return t;
    }
    canAttack(p, u) {
      if (this.turn === 1) return "เทิร์นแรกของเกมโจมตีไม่ได้";
      if (u.noatk || u.has("ป้อม")) return "ตัวนี้โจมตีไม่ได้";
      if (u.frozen) return "ถูกแช่แข็ง";
      const pac = this.other(p).field.find((o) => o.h.pacify && this.eff(p, u) <= o.h.pacify);
      if (pac) return `${pac.name}: มอนสเตอร์ power ≤ ${pac.h.pacify} โจมตีไม่ได้`;
      if (u.attacksLeft <= 0) return "โจมตีครบแล้ว";
      return null;
    }
    faceHit(e, n, why = "") { if (e.faceWard) { e.faceWard = false; this.log(`${e.name} ไม่เสีย HP (ภูตคุ้มกัน)`); return; } this.hurt(e, n, why); }
    hurt(e, n, why = "") {
      if (e.immune) { this.log(`${e.name} ไม่เสีย HP (คุ้มครอง)`); return; }
      e.hp -= n; this.log(`❤ ${e.name} เสีย ${n} HP${why} (เหลือ ${e.hp})`);
    }
    // react(defender, info) → ตัวเลือกจาก info.opts หรือ null (async ได้)
    //   info = { opts, targetIsPlayer, target, attacker }  ตอนถูกโจมตี  |  { opts, spell } ตอนศัตรูร่ายเวท
    async attack(p, u, target, react) {
      const err = this.canAttack(p, u); if (err) return err;
      const e = this.other(p); u.attacksLeft--; u.atkd = true; this.refresh();
      if (u.kinds.has("หมาป่า")) p.wolfAttacked = true;
      if ((u.stolenFrom || u.permFrom) && p.stolenAtkTurn !== this.turn && this.fieldHas(p, "onStolenAtk")) { p.stolenAtkTurn = this.turn; this.extraDraw(p, 1); }
      let t = target, o = { react };
      const bg = t === "face" ? [] : e.field.filter((x) => x.has("พรีกาย") && x !== t && !u.has("พิษ") && this.eff(e, x, false, u) + this.arm(x) > this.eff(p, u, true, x));
      this.emit({ t: "attack", a: u.uid, b: bg.length ? bg[0].uid : t === "face" ? "face" : t.uid, by: this.P.indexOf(p) });
      if (bg.length) { t = bg[0]; o.guard = true; this.log(`🛡 ${t.name} รับแทน (พรีกาย)`); }
      else {
        this.log(t === "face" ? `⚔ ${u.name} โจมตีผู้เล่น ${e.name}` : `⚔ ${u.name} โจมตี ${t.name}`);
        const r = await this.doReact(e, t === "face", t === "face" ? null : t, u, react);
        if (r) { const res = this.resolveReact(e, p, u, t, r); if (res.cancel) { this.checkEnd(); return null; } t = res.t; Object.assign(o, res); }
      }
      if (t === "face") this.faceHit(e, 1);
      else await this.combat(p, u, e, t, o);
      this.checkEnd(); return null;
    }
    async combat(p, u, e, t, o = {}) {
      const hu = u.h, ht = t.h;
      if (!o.fight) {                                                     // สกิล "เมื่อถูกโจมตี" ก่อนเทียบ power
        if (ht.onHitPow) t.temp += ht.onHitPow;
        if (ht.onHitTeam) for (const x of e.field) if (kindMatch(x.kinds, ht.onHitTeam.kind)) x.temp += ht.onHitTeam.n;
        if (ht.thorns) u.power -= ht.thorns;
      }
      if (hu.weaken) t.temp -= hu.weaken; if (ht.weaken) u.temp -= ht.weaken;
      const A = this.eff(p, u, true, t), base = this.eff(e, t, false, u), D = base + (hu.pierce ? 0 : this.arm(t)) + (o.bonus || 0);
      let attDies = t.has("พิษ") || D > A, defDies = u.has("พิษ") || A >= D;
      if (attDies && u.has("บิน") && !t.has("พิษ")) attDies = false;
      if (hu.trade != null && base <= hu.trade) attDies = defDies = true;
      if (o.survive) defDies = false;
      if (defDies && t.hitTurn !== this.turn && (ht.firstHit || (t.kinds.has("ไข่") && this.fieldHas(e, "eggGuard")))) { defDies = false; this.log(`   ${t.name} รอดจากการถูกโจมตีครั้งแรก`); }
      t.hitTurn = this.turn;
      this.log(`   ${u.name} ${A} vs ${t.name} ${D}`);
      if (defDies) this.kill(e, t);
      const killed = defDies && !e.field.includes(t);
      if (attDies) this.kill(p, u);
      if ((o.after === "revenge" && e.field.includes(t)) || (o.after === "mutual" && killed)) this.kill(p, u);
      t.shieldKeep = false;
      if (killed) this.afterDeathReact(e, t, o);
      if (e.field.includes(t) && !o.fight) {                               // สกิล "ถูกโจมตีแล้วรอด"
        if (ht.surviveKill) this.kill(p, u);
        if (ht.surviveSap && p.field.includes(u)) { u.power -= ht.surviveSap; if (this.eff(p, u) < 0) this.kill(p, u); }
        if (ht.surviveGrow) t.power += ht.surviveGrow;
        if (o.guard && ht.guardDraw && !p.field.includes(u)) this.extraDraw(e, ht.guardDraw);
      }
      if (killed && ht.curseKiller && p.field.includes(u)) u.power -= ht.curseKiller;
      if (hu.stun && e.field.includes(t)) t.frozen = true;
      if (ht.stun && p.field.includes(u)) u.frozenNext = true;
      if (killed && p.field.includes(u)) {
        if (hu.killGrow) u.power += hu.killGrow;
        if (u.killBonusTurn === this.turn) { u.power++; this.log(`   ${u.name} power +1 ถาวร (กลิ่นเลือด)`); }
        if (hu.cleave && (hu.cleave > 1 || !u.cleaved)) { u.cleaved = true; u.attacksLeft++; }
        if (u.has("กินเหยื่อ")) u.power++;
        if (u.card && u.card.onkill.length) this.run(p, u.card.onkill, u.card);
        if (u.has("บดขยี้") && !e.field.length) {
          const r = o.react ? await this.doReact(e, true, null, u, o.react) : null;
          const res = r ? this.resolveReact(e, p, u, "face", r) : null;
          if (!res || (!res.cancel && res.t === "face")) this.faceHit(e, 1, " (บดขยี้)");
          else if (!res.cancel && res.t !== "face") await this.combat(p, u, e, res.t, { ...res, react: null });
        }
      }
      return { attDies: !p.field.includes(u), killed };
    }
    // ผลของเวทสวนที่ทำงานหลังมอนสเตอร์ฝั่งเราตาย
    afterDeathReact(d, t, o) {
      const g = d.grave;
      if (o.after === "undying" && t.card && g.includes(t.card) && d.field.length < FIELD) { g.splice(g.indexOf(t.card), 1); this.log(`   ${t.card.name} กลับมาจากสุสาน`); this.place(d, t.card); }
      if (o.after === "split" && t.parts) {
        for (const c of t.parts) { if (d.field.length >= FIELD || !g.includes(c)) continue; g.splice(g.indexOf(c), 1); d.field.push(new Unit(c)); }
        this.log(`   ${t.name} แยกกลับเป็นชิ้นส่วน`); this.refresh();
      }
      if (o.after === "eject" && o.ejectCards) {
        const host = d.field.filter((x) => x.kinds.has("เครื่องจักร")).sort((a, b) => this.eff(d, b) - this.eff(d, a))[0];
        if (host) { for (const c of o.ejectCards) { if (!g.includes(c)) continue; g.splice(g.indexOf(c), 1); host.power += c.base; host.attached.push(c); for (const k of c.grant) host.kw[k] = true; if (c.h.upScale) host.upScale = true; }
          this.log(`   ย้ายอัปเกรดไปติด ${host.name}`); this.refresh(); }
      }
    }
    reactOk(d, r, req, toPlayer, target, att) {
      const a = this.other(d), ap = () => this.eff(a, att, true, target === "face" ? null : target);
      const onMon = (k) => !toPlayer && target && kindMatch(target.kinds, k || "มอนสเตอร์");
      if (req === "ผู้เล่น" && !toPlayer) return false;
      switch (r.t) {
        case "cancel": return !req || req === "ผู้เล่น" || onMon(req);
        case "defbuff": case "survive": case "bounceself": case "shield": case "revenge": case "mutual": return onMon(r.req);
        case "hatch": return onMon(r.req) && !!target.hatch;
        case "debuff": return !toPlayer && d.hand.length > r.pay;
        case "killif": {
          if (r.have && !this.count(d, r.have)) return false;
          if (r.n === "mac") return ap() <= this.count(d, "เครื่องจักร") + 1;
          if (r.n === "kind") return d.field.some((x) => kindMatch(x.kinds, r.kind) && this.eff(d, x) >= ap());
          return ap() <= r.n;
        }
        case "removeif":
          if (r.have) return this.count(d, r.have[0]) >= r.have[1];
          return (r.stat === "cost" ? (att.card ? att.card.cost : 0) : ap()) <= r.n;
        case "block": return d.field.length < FIELD;
        case "redirect": return d.field.some((x) => x !== target && kindMatch(x.kinds, r.kind));
        case "duel": return d.field.some((x) => x !== target && kindMatch(x.kinds, r.kind));
        case "summonblock": return (r.zone === "มือ" ? d.hand : d.grave).some((c) => c.type === "มอน" && kindMatch(c.kinds, r.kind) && c.cost <= r.lim) && d.field.length < FIELD;
        case "freezeatt": return true;
        case "stealatt": return ap() <= r.n && d.field.length < FIELD;
        case "turncoat": return a.field.some((x) => x !== att);
        case "tutor": return onMon(r.req);
        case "keepshield": return onMon("มอนสเตอร์") && target.kw["โล่แสง"];
        case "undying": return onMon(r.req) && !!target.card;
        case "split": return !toPlayer && !!(target && target.parts && target.parts.length);
        case "eject": return onMon("เครื่องจักร") && target.attached.length > 0 && d.field.some((x) => x !== target && x.kinds.has("เครื่องจักร"));
        case "shoot": return d.field.some((x) => x.shoot != null);
      }
      return false;
    }
    reactOptions(d, toPlayer, target, att) {
      if (d.reacted || d.silencedTurn === this.turn) return [];
      const noCounter = this.other(d).field.some((o) => o.h.noCounterVs && att && kindMatch(att.kinds, o.h.noCounterVs));
      const opts = [];
      for (const c of d.hand) {
        if (c.type !== "เวทสวน" || !c.counter || c.counter[0] !== "attack" || noCounter) continue;
        if (c.spellCond && !this.count(d, c.spellCond)) continue;
        if (this.reactOk(d, c.counter[2], c.counter[1], toPlayer, target, att)) opts.push({ kind: "counter", card: c });
      }
      if (toPlayer) for (const c of d.hand) if (c.type === "มอน" && c.kw["พรีกาย"]) opts.push({ kind: "bodyguard", card: c });
      return opts;
    }
    async doReact(d, toPlayer, target, att, react) {
      if (!react) return null;
      const opts = this.reactOptions(d, toPlayer, target, att);
      if (!opts.length) return null;
      const choice = await react(d, { opts, targetIsPlayer: toPlayer, target, attacker: att });
      if (!choice) return null;
      this.emit({ t: "react", id: choice.card.id, by: this.P.indexOf(d) });
      d.hand.splice(d.hand.indexOf(choice.card), 1); d.grave.push(choice.card); d.reacted = true;
      this.log(choice.kind === "counter" ? `✋ ${d.name} ใช้เวทสวน ${choice.card.name}` : `🛡 ${d.name} ทิ้ง ${choice.card.name} รับแทน (พรีกายจากมือ)`);
      if (choice.kind === "counter") this.counterUsed(d);
      return choice;
    }
    // ผลของเวทสวน → { cancel, t (เป้าหมายใหม่), bonus, survive, after }
    resolveReact(d, a, att, t, choice) {
      if (choice.kind === "bodyguard") return { cancel: true };
      const r = choice.card.counter[2], res = { cancel: false, t };
      const best = (k) => d.field.filter((x) => x !== t && kindMatch(x.kinds, k)).sort((x, y) => this.eff(d, y) - this.eff(d, x))[0];
      switch (r.t) {
        case "cancel":
          this.log("   ยกเลิกการโจมตี");
          if (r.bonus && t !== "face" && t && kindMatch(t.kinds, r.bonus.kind)) { t.power += r.bonus.n; this.log(`   ${t.name} power +${r.bonus.n} ถาวร`); }
          return { cancel: true };
        case "keepshield": t.shieldKeep = true; return res;
        case "undying": case "split": res.after = r.t; return res;
        case "eject": res.after = "eject"; res.ejectCards = [...t.attached]; return res;
        case "defbuff": res.bonus = r.n * (r.perUpgrade ? t.attached.length : r.per ? this.count(d, r.per, "field", t) : 1); if (r.grow) t.power++; this.log(`   ${t.name} +${res.bonus} ในการต่อสู้ครั้งนี้`); return res;
        case "survive": res.survive = true; return res;
        case "bounceself": this.removeTo(d, t, "hand"); this.log(`   ${t.name} กลับขึ้นมือ ยกเลิกการโจมตี`); return { cancel: true };
        case "hatch": { const saved = d.field.filter((x) => x !== t && x.hatch).map((x) => [x, x.hatch[0]]); t.hatch[0] = 1; this.hatch(d); for (const [x, v] of saved) if (x.hatch) x.hatch[0] = v; if (!d.field.includes(t)) return { cancel: true }; return res; }
        case "shield": t.kw["โล่แสง"] = true; return res;
        case "debuff": {
          for (const c of [...d.hand].sort((x, y) => value(x) - value(y)).slice(0, r.pay)) this.discard(d, c);
          if (r.perm) att.power -= r.n; else att.temp -= r.n; this.log(`   ${att.name} power −${r.n}`);
          if (this.eff(a, att) < 0) { this.kill(a, att); return { cancel: true }; } return res;
        }
        case "killif": this.kill(a, att); this.log(`   ทำลาย ${att.name}`); return { cancel: true };
        case "removeif": this.removeTo(a, att, r.where); this.log(`   ${att.name} ถูกส่ง${r.where === "hand" ? "กลับมือ" : "ไปใต้เดค"}`); return { cancel: true };
        case "block": this.addToken(d, r.token); res.t = d.field[d.field.length - 1]; this.log(`   ${res.t.name} รับการโจมตีแทน`); return res;
        case "redirect": res.t = best(r.kind); res.bonus = r.n; this.log(`   เปลี่ยนเป้าหมายเป็น ${res.t.name}`); return res;
        case "duel": {
          const w = best(r.kind); this.log(`   ${w.name} ออกมาสู้ก่อน`);
          const A = this.eff(d, w, true, att), D = this.eff(a, att, false, w) + this.arm(att);
          if (A >= D || w.has("พิษ")) this.kill(a, att); if (D > A || att.has("พิษ")) this.kill(d, w);
          return a.field.includes(att) ? res : { cancel: true };
        }
        case "summonblock": {
          const z = r.zone === "มือ" ? d.hand : d.grave;
          const c = z.filter((c) => c.type === "มอน" && kindMatch(c.kinds, r.kind) && c.cost <= r.lim).sort((x, y) => y.base - x.base)[0];
          z.splice(z.indexOf(c), 1); res.t = this.place(d, c); return res;
        }
        case "revenge": case "mutual": res.after = r.t; return res;
        case "freezeatt": att.frozenNext = true; return res;
        case "stealatt": a.field.splice(a.field.indexOf(att), 1); att.stolenFrom = a; d.field.push(att); this.refresh(); this.log(`💘 ${d.name} ยึด ${att.name}`); return { cancel: true };
        case "turncoat": { const ally = a.field.filter((x) => x !== att).sort((x, y) => this.eff(a, y) - this.eff(a, x))[0]; this.log(`   ${att.name} หันไปโจมตี ${ally.name}`); this.combat(a, att, a, ally, { fight: true }); return { cancel: true }; }
        case "tutor": this.run(d, [["search", r.kind, "≥", r.min]]); return res;
        case "shoot": this.shootWith(d, d.field.find((x) => x.shoot != null)); return a.field.includes(att) ? res : { cancel: true };
      }
      return res;
    }

    // ---------- เทิร์น
    startTurn() {
      this.turn++; const p = this.P[this.cur], e = this.other(p);
      e.reacted = false; p.reacted = true; p.turns++; this.deaths = 0; p.played = 0; p.wolfAttacked = false; p.discTurn = 0;
      Object.assign(p, { spellUsed: 0, spellMax: 1, immune: false, overAll: 0, overNext: 0, gemAll: 0, nextRed: [], lootUsed: false });
      if (this.opt.firstDiscount) p.nextRed.push(["มอนสเตอร์", this.opt.firstDiscount]);   // กติกาทดลอง: อัญเชิญครั้งแรกของเทิร์นถูกลง
      this.log(`—— เทิร์น ${this.turn}: ${p.name} ——`);
      for (const u of p.field) { u.temp2 = 0; u.atkd = false; u.cleaved = false; u.undo = u.undo.filter(([when, fn]) => when !== "start" || (fn(), false)); }
      for (const u of [...p.field]) {                                     // สกิลต้นเทิร์นแบบออร่า/ทริกเกอร์
        const h = u.h;
        if (h.upkeep) { if (p.hand.length >= h.upkeep) for (const c of [...p.hand].sort((x, y) => value(x) - value(y)).slice(0, h.upkeep)) this.discard(p, c); else { this.log(`${u.name} ทิ้งการ์ดไม่ได้`); this.kill(p, u); continue; } }
        if (h.sotGrow && this.count(p, h.sotGrow.kind, "field", u) > 0 && u.grown < h.sotGrow.cap) { u.power += h.sotGrow.n; u.grown += h.sotGrow.n; }
        if (h.sotScry) this.run(p, [["scry", "self"]]);
        if (u.morph && --u.morph[0] <= 0) { u.power = u.morph[1]; u.kw[u.morph[2]] = true; this.log(`🦋 ${u.name} กลายร่าง (power ${u.power}, ${u.morph[2]})`); u.morph = null; }
      }
      this.refresh();
      const fast = p.field.some((o) => o.card && o.card.ab.includes("แทน +1"));
      for (const u of p.field) { if (u.has("เติบโต")) u.power += fast ? 2 : 1; u.attacksLeft = this.attacksAllowed(p, u); }
      this.hatch(p);
      const shooters = p.field.some((u) => u.shoot != null);
      for (const u of [...p.field]) {
        if (u.shoot != null && p.field.includes(u)) this.shootWith(p, u);
        if (u.card && u.card.sot.length && p.field.includes(u)) this.run(p, u.card.sot, u.card);
      }
      if (shooters && !e.field.length) this.hurt(e, 1, " (ถูกยิง)");
      this.awakenCheck(p);
      p.draw(this.opt.draw || DRAW);
      if (this.opt.minHand && p.hand.length < this.opt.minHand && !p.lost) p.draw(this.opt.minHand - p.hand.length);   // กติกาทดลอง: เติมมือขั้นต่ำ
      if (p.lost) this.log(`${p.name} เดคหมด`);
      this.checkEnd();
    }
    shootWith(p, u, bonus = 0) {
      const e = this.other(p);
      for (let i = 0; i < (u.card && u.card.shoot2 ? 2 : 1); i++) { const t = this.pick(e, 1, u.shoot + bonus).filter((x) => !u.h.shootFly || x.has("บิน")); if (t.length) { this.log(`🔫 ${u.name} ยิง ${t[0].name}`); this.kill(e, t[0]); } }
    }
    // กติกาทดลอง: เทิร์นละครั้ง ทิ้ง 1 ใบ แล้วจั่ว 1 ใบ
    loot(p, c) {
      if (!this.opt.loot || p.lootUsed || !p.hand.includes(c)) return "ใช้ไม่ได้";
      p.lootUsed = true; this.discard(p, c); p.draw(1); this.log(`🔄 ${p.name} ทิ้ง ${c.name} แล้วจั่วใหม่`); this.checkEnd(); return null;
    }
    endTurn() {
      const p = this.P[this.cur], e = this.other(p);
      if (this.opt.catchup && p.played === 0 && !p.lost) { p.draw(1); this.log(`${p.name} ไม่ได้เล่นการ์ด จั่วเพิ่ม 1 ใบ`); }   // กติกาทดลอง
      for (const u of [...p.field]) if (u.h.attackOrDie && !u.atkd && this.turn > 1) { this.log(`${u.name} ไม่ได้โจมตี จึงตาย`); this.kill(p, u); }
      for (const u of [...p.field]) {
        u.temp = 0; u.frozen = !!u.frozenNext; u.frozenNext = false; u.direct = false;
        u.undo = u.undo.filter(([when, fn]) => when !== "end" || (fn(), false));
        if (u.stolenFrom) { p.field.splice(p.field.indexOf(u), 1); const o = u.stolenFrom; u.stolenFrom = null; if (o.field.length < FIELD) o.field.push(u); else if (u.card) o.grave.push(u.card); }
      }
      for (const u of e.field) u.temp = 0;
      this.refresh();
      this.cur = 1 - this.cur;
    }
    checkEnd() {
      if (this.winner) return true;
      for (const p of this.P) if (p.hp <= 0 || p.lost) { this.winner = this.other(p); this.log(`🏁 ${this.winner.name} ชนะ! (${p.name} ${p.hp <= 0 ? "HP หมด" : "เดคหมด"})`); }
      return !!this.winner;
    }

    // ---------- บอท
    async botTurn(react, pause = async () => {}) {
      const p = this.P[this.cur], e = this.other(p);
      for (const ab of this.abilities(p)) if (!ab.err && (ab.key.startsWith("recycle") || (ab.key.startsWith("revive") && p.hand.some((c) => value(c) < 1)))) { this.useAbility(p, ab.key); await pause(); }
      const summonPhase = async () => {
        while (!this.winner) {
          let best = null;
          for (const c of p.hand) {
            if (this.canSummon(p, c)) continue;
            const fod = this.autoPay(p, this.cost(p, c), c); if (fod == null) continue;
            const lost = fod.reduce((s, x) => s + value(x), 0) - fod.filter((x) => x.ondiscard.length).length;
            const gain = c.base + (c.enter.length ? 2 : 0) + (c.kw["พรีกาย"] ? 1 : 0) + (c.leader ? 3 : 0);
            if (lost > gain + 1) continue;
            const score = gain - lost * 0.5; if (!best || score > best[0]) best = [score, c, fod];
          }
          if (!best) break;
          await this.summon(p, best[1], best[2], react); await pause();
        }
      };
      if (this.opt.loot && p.hand.length) { const c = [...p.hand].sort((a, b) => value(a) - value(b))[0]; if (value(c) < 1) this.loot(p, c); }
      await summonPhase();
      const prio = { titan: 5, awakenall: 5, cheat: 4, kill: 3, steal: 3 };
      for (const c of p.hand.filter((c) => c.type === "เวทปกติ" && c.spell.length).sort((a, b) => (prio[b.spell[0][0]] || 0) - (prio[a.spell[0][0]] || 0) || value(b) - value(a))) {
        if (this.spellUsable(p, c)) continue;
        const k = c.spell[0][0];
        if (["kill", "bounce", "bottom", "curse", "freeze", "steal"].includes(k) && !e.field.length) continue;
        if (["draw", "drawto"].includes(k) && p.hand.length > 5) continue;
        if (k === "token" && p.field.length >= FIELD) continue;
        if ((k === "buff" || k === "own" || k === "sacown" || k === "fight") && !p.field.length) continue;
        if (k === "fight" && !e.field.length) continue;
        if (k === "wipe" && c.spell[0][4] && e.field.length <= p.field.length) continue;
        if (k === "wipe" && !e.field.length) continue;
        if (k === "stealall" && (!e.field.length || p.field.length >= FIELD)) continue;
        if (await this.cast(p, c, react)) continue;
        await pause(); break;
      }
      await summonPhase();
      for (const u of [...p.field].sort((a, b) => this.eff(p, b) - this.eff(p, a))) {
        while (!this.winner && p.field.includes(u) && !this.canAttack(p, u)) {
          const ts = this.targets(p, u); if (!ts.length) break;
          let t = ts.includes("face") ? "face" : ts[0];
          if (t !== "face") { const win = ts.filter((x) => u.has("พิษ") || this.eff(p, u, true, x) >= this.eff(e, x, false, u) + this.arm(x)); if (!win.length && !u.h.mustAttack && !(u.h.attackOrDie && !u.atkd)) break; t = win.length ? win.sort((a, b) => this.eff(e, b) - this.eff(e, a))[0] : ts.sort((a, b) => this.eff(e, a) - this.eff(e, b))[0]; }
          await this.attack(p, u, t, react); await pause();
        }
      }
    }
    botReact(d, info) {
      if (info.etb) return info.etb.leader || info.etb.enter.some((a) => ["kill", "wipe", "bounce", "bottom", "steal", "stealall", "edisc", "cheat", "raise"].includes(a[0])) ? info.opts[0] : null;
      if (info.spell) return ["kill", "wipe", "steal", "stealall", "bounce", "bottom", "curse", "edisc", "cheat", "titan"].includes(info.spell.spell[0][0]) ? info.opts[0] : null;
      if (!info.targetIsPlayer && info.target) {                     // ป้องกันชนะอยู่แล้ว ไม่ต้องเสียเวทสวน
        const a = this.other(d), A = this.eff(a, info.attacker, true, info.target), D = this.eff(d, info.target, false, info.attacker) + this.arm(info.target);
        if (D > A && !info.attacker.has("พิษ")) return null;
      }
      const important = info.targetIsPlayer || (info.target && this.eff(d, info.target) >= 3);
      if (!important) return null;
      return info.opts.find((o) => o.kind === "counter") || info.opts.find((o) => o.kind === "bodyguard") || null;
    }
  }

  // ---------------------------------------------------------------- เดค
  function buildDeck(cards, arch) {
    const pool = cards.filter((c) => c.archs.has(arch));
    const raceCount = {}; for (const c of pool) for (const r of c.races) raceCount[r] = (raceCount[r] || 0) + 1;
    const race = Object.entries(raceCount).sort((a, b) => b[1] - a[1])[0][0];
    const grunt = cards.filter((c) => c.races.has(race) && c.archs.has("พลทหาร"));
    const draw2 = cards.filter((c) => c.id === "NEU-SPL-16");
    const neutral = cards.filter((c) => c.races.has("กลาง") && !c.onlyone);
    const deck = []; for (let i = 0; i < 4; i++) deck.push(...grunt, ...draw2);
    const oo = pool.filter((c) => c.onlyone), rest = pool.filter((c) => !c.onlyone).sort((a, b) => a.cost - b.cost);
    for (const c of rest) for (let i = 0; i < 3; i++) deck.push(c);
    deck.push(...oo.slice(0, 1));
    for (const c of rest) { if (deck.length >= 50) break; deck.push(c); }
    for (let i = 0; deck.length < 50; i++) deck.push(neutral[i % neutral.length]);
    return deck.slice(0, 50);
  }
  function archetypes(cards) {
    const s = new Map();
    for (const c of cards) if (!c.races.has("กลาง")) for (const a of c.archs) if (a !== "พลทหาร" && cards.filter((x) => x.archs.has(a)).length >= 8 && !s.has(a)) s.set(a, [...c.races][0]);
    return [...s.entries()];
  }

  // ตรวจเดคที่จัดเอง (รายการรหัสการ์ด) ตามกติกา → ข้อความ error หรือ null
  const DECK = 50;
  function validateDeck(cards, ids) {
    if (!Array.isArray(ids)) return "เดคไม่ถูกต้อง";
    if (ids.length !== DECK) return `เดคต้องมี ${DECK} ใบ (ตอนนี้ ${ids.length} ใบ)`;
    const by = new Map(cards.map((c) => [c.id, c])), n = {};
    for (const id of ids) {
      const c = by.get(id); if (!c) return `ไม่รู้จักการ์ดรหัส ${String(id).slice(0, 20)}`;
      n[id] = (n[id] || 0) + 1; const lim = c.onlyone ? 1 : 4;
      if (n[id] > lim) return `${c.name} ใส่ได้ไม่เกิน ${lim} ใบ`;
    }
    return null;
  }
  // รหัสแชร์เดค: "ID*จำนวน" คั่นด้วย . แล้วเข้ารหัส base64url
  const b64 = (s) => (typeof btoa !== "undefined" ? btoa(s) : Buffer.from(s, "binary").toString("base64")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64 = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); return typeof atob !== "undefined" ? atob(s) : Buffer.from(s, "base64").toString("binary"); };
  function deckCode(ids) { const n = {}; for (const id of ids) n[id] = (n[id] || 0) + 1; return b64(Object.entries(n).map(([id, k]) => `${id}*${k}`).join(".")); }
  function parseDeckCode(code) {
    try {
      const ids = [];
      for (const part of unb64(String(code).trim()).split(".")) { const m = part.match(/^([A-Z]{3}-[A-Z0-9]+-\d+)\*(\d{1,2})$/); if (!m) return null; for (let i = 0; i < +m[2]; i++) ids.push(m[1]); }
      return ids;
    } catch { return null; }
  }

  const api = { Card, Unit, Game, buildDeck, archetypes, validateDeck, deckCode, parseDeckCode, DECK, HP, FIELD };
  if (typeof module !== "undefined") module.exports = api; else root.Engine = api;
})(typeof window !== "undefined" ? window : globalThis);
