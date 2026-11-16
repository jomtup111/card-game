// เอนจินเกม (กติกา + ตัวแปลสกิล + บอท) — ยกมาจาก sim/sim.py
// ใช้ได้ทั้งในเบราว์เซอร์ (window.Engine) และ node (module.exports)
(function (root) {
  "use strict";
  const HP = 5, HAND0 = 5, FIELD = 5, DRAW = 1;

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
      this.offer = null; this.spellPre = null;
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
      if (this.type !== "มอน") {
        let body = x;
        if ((m = body.match(/^ถ้ามี(.+?)ฝั่งเรา (?!≥)(.+)$/))) { this.spellCond = m[1]; body = m[2]; }
        if ((m = body.match(/^(คอมโบ|ขบวน) (\d+): (.+)$/))) { this.spellPre = [m[1], +m[2]]; body = m[3]; }
        if ((m = body.match(/^ถ้าผสานธาตุ = (\d+) (.+)$/))) { this.spellPre = ["ธาตุ", +m[1]]; body = m[2]; }
        if (body.includes("ยกเลิกการโจมตี")) { const t = body.match(/ที่เป้าหมายเป็น(\S+)/); this.counter = ["attack", t ? t[1] : null, { t: "cancel" }]; return true; }
        if (body.includes("ยกเลิกเวท")) { this.counter = ["spell", null]; return true; }
        if (this.type === "เวทสวน") { const r = this.reaction(body); if (r) { this.counter = ["attack", r.req || null, r]; return true; } }
        let a = this.actions(body);
        if (!a.length && /\(.*\)/.test(body)) a = this.actions(body.replace(/ ?\([^)]*\)/g, ""));   // ลองตัดวงเล็บอธิบายออก
        if (a.length) { this.spell.push(...a); return true; }
      }
      return false;
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
      return null;
    }
    // ผลกับมอนสเตอร์ฝั่งเรา: "<ชนิด> 1 ตัว|ทุกตัว power +N / ×N / ได้<คีย์เวิร์ด> / โจมตีได้ 2 ครั้ง / ตีผู้เล่นได้โดยตรง ..."
    own(x) {
      let m, long = false;
      if (x.startsWith("จนจบเทิร์นถัดไปของศัตรู ")) { long = true; x = x.slice(24); }
      x = x.replace(/^(เทิร์นนี้|จนจบเทิร์น |เลือก)/, "").replace(/ฝั่งเรา/g, "").trim();
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
        if (/^โจมตีได้ 2 ครั้ง$|^ตีได้ 2 ครั้ง$|^โจมตีได้เพิ่มอีก 1 ครั้ง$/.test(part)) { fx.atk = 1; continue; }
        if (/^ตีผู้เล่นได้โดยตรงแม้สนามศัตรูไม่ว่าง$/.test(part)) { fx.direct = true; continue; }
        if ((m = part.match(/^ได้(.+)$/))) {
          const ks = m[1].split(/และ| /).map((s) => s.trim()).filter(Boolean);
          if (ks.every((k) => ["บิน", "บดขยี้", "พิษ", "โล่แสง", "กินเหยื่อ", "พรีกาย"].includes(k))) { fx.kws.push(...ks); continue; }
        }
        if (["บิน", "บดขยี้", "พิษ", "โล่แสง", "กินเหยื่อ", "พรีกาย"].includes(part)) { fx.kws.push(part); continue; }
        return null;
      }
      return ["own", word, n, fx];
    }
    actions(x) {
      const whole = this.own(x); if (whole) return [whole];
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
        if ((m = part.match(/^อัญเชิญ(.+?)(?: cost ≤ (\d+))?(?: 1 ตัว)? ?จาก(มือ|เดค)(?:หรือเดค)?ฟรี(?: 1 ตัว)?.*$/))) { out.push(["cheat", m[1], m[2] ? +m[2] : 99, m[3]]); continue; }
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
      this.temp = 0; this.temp2 = 0; this.undo = []; this.direct = false; this.frozenNext = false; this.attached = []; this.frozen = false; this.stolenFrom = null; this.attacksLeft = 0; this.fresh = true;
    }
    has(k) { return !!this.kw[k]; }
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
    constructor(deckA, deckB, seed = Date.now(), log = () => {}) {
      this.rnd = rngOf(seed); this.log = log;
      this.P = [new Player("คุณ", deckA, this.rnd), new Player("บอท", deckB, this.rnd)];
      this.turn = 0; this.deaths = 0; this.cur = 0; this.winner = null;
      for (const p of this.P) p.draw(HAND0);
    }
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
      if (u.has("คลั่งเลือด")) pw += this.deaths;
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
      if (u.has("โล่แสง")) { u.kw["โล่แสง"] = false; this.log(`${u.name} โล่แสงแตก`); return; }
      owner.field.splice(owner.field.indexOf(u), 1); this.deaths++;
      const real = u.stolenFrom || owner; real.grave.push(...u.attached);
      this.log(`💀 ${u.name} ตาย`);
      if (u.card) {
        const c = u.card;
        if (c.ab.includes("กลับไปหลับในสุสานได้ 1 ครั้ง")) { real.fossil[c.id] = (real.fossil[c.id] || 0) + 1; if (real.fossil[c.id] > real.decklist[c.id]) return; real.grave.push(c); }
        else if (c.kw["ฟอสซิลมีชีวิต"] && (real.fossil[c.id] || 0) < real.decklist[c.id]) { real.fossil[c.id] = (real.fossil[c.id] || 0) + 1; real.hand.push(c); this.log(`${c.name} กลับขึ้นมือ (ฟอสซิล)`); }
        else real.grave.push(c);
        this.run(real, c.ondeath, c);
      }
    }
    removeTo(owner, u, where) {
      if (!owner.field.includes(u)) return;
      owner.field.splice(owner.field.indexOf(u), 1); const real = u.stolenFrom || owner; real.grave.push(...u.attached);
      if (u.card) { if (where === "hand") real.hand.push(u.card); else real.deck.unshift(u.card); }
    }
    addToken(p, name, n = 1) { for (let i = 0; i < n; i++) { if (p.field.length >= FIELD) return; p.field.push(new Unit(null, name)); } }
    pick(e, n = 1, maxp = null, kind = null, by = "power", limit = 99) {
      let c = e.field.filter((u) => (!kind || kindMatch(u.kinds, kind)) && (maxp == null || this.eff(e, u) <= maxp));
      if (by === "cost") c = c.filter((u) => (u.card ? u.card.cost : 0) <= limit); else if (limit !== 99) c = c.filter((u) => this.eff(e, u) <= limit);
      return c.sort((a, b) => this.eff(e, b) - this.eff(e, a)).slice(0, n);
    }
    place(p, c) { const u = new Unit(c); p.field.push(u); this.log(`✨ ${p.name} อัญเชิญ ${c.name}`); this.run(p, c.enter, c); this.checkOmega(p); return u; }
    discard(p, c) {
      const i = p.hand.indexOf(c); if (i >= 0) p.hand.splice(i, 1);
      p.grave.push(c); p.discTurn++; if (c.ondiscard.length) this.run(p, c.ondiscard, c);
    }

    run(p, acts, src = null) {
      const e = this.other(p), spell = src && src.type !== "มอน";
      for (const a of acts) {
        if (p.lost || e.lost) return;
        const k = a[0];
        if (k === "draw") { if (a[2] && !this.count(p, a[2])) continue; p.draw(a[1]); }
        else if (k === "drawto") p.draw(Math.max(0, a[1] - p.hand.length));
        else if (k === "discard") { for (const c of [...p.hand].sort((x, y) => value(x) - value(y)).slice(0, a[1])) this.discard(p, c); }
        else if (k === "token") { if (a[3] && !this.count(p, a[3])) continue; this.addToken(p, a[1], a[2]); }
        else if (k === "kill") { let [, n, lim, kind] = a; if (n === "elem") n = this.elem(p); const maxp = lim === "ค่าผสานธาตุ" ? this.elem(p) : lim ? +lim : null; for (const u of this.pick(e, n, maxp, kind)) this.kill(e, u, spell); }
        else if (k === "bounce" || k === "bottom") { for (const u of this.pick(e, a[1], null, null, a[2], a[3])) { this.removeTo(e, u, k === "bounce" ? "hand" : "deck"); this.log(`${u.name} ถูกส่ง${k === "bounce" ? "กลับมือ" : "ไปใต้เดค"}`); } }
        else if (k === "curse") { for (const u of this.pick(e, a[1])) { if (a[3]) u.power -= a[2]; else u.temp -= a[2]; if (this.eff(e, u) < 0) this.kill(e, u); } }
        else if (k === "freeze") { for (const u of this.pick(e, a[1], a[2])) u.frozen = true; }
        else if (k === "steal") { if (p.field.length >= FIELD) continue; const t = this.pick(e, 1, a[1]); if (t.length) { const u = t[0]; e.field.splice(e.field.indexOf(u), 1); u.stolenFrom = e; u.attacksLeft = 1; p.field.push(u); this.log(`💘 ${p.name} ยึด ${u.name}`); } }
        else if (k === "buff") { const [, word, n, perm, every] = a; let tg = p.field.filter((u) => kindMatch(u.kinds, word) || ["มอนสเตอร์", ""].includes(normKind(word))); if (!every) tg = tg.sort((x, y) => this.eff(p, y) - this.eff(p, x)).slice(0, 1); for (const u of tg) { if (perm) u.power += n; else u.temp += n; } }
        else if (k === "search") { const [, word, op, lim] = a; for (let i = p.deck.length - 1; i >= 0; i--) { const c = p.deck[i]; if (kindMatch(c.kinds, word) && (lim == null || (op === "≤" ? c.cost <= lim : c.cost >= lim))) { p.deck.splice(i, 1); p.hand.push(c); break; } } }
        else if (k === "raise") { const [, word, lim, toField, n] = a; for (let i = 0; i < n; i++) { const cand = p.grave.filter((c) => kindMatch(c.kinds, word) && c.cost <= lim && !c.kw["หลับใหล"]); if (!cand.length) break; const c = cand.sort((x, y) => y.base - x.base)[0]; p.grave.splice(p.grave.indexOf(c), 1); if (toField && c.type === "มอน" && p.field.length < FIELD) this.place(p, c); else p.hand.push(c); } }
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
        else if (k === "stealall") { for (const u of this.pick(e, 5, a[1])) { if (p.field.length >= FIELD) break; e.field.splice(e.field.indexOf(u), 1); p.field.push(u); this.log(`💘 ${p.name} ยึด ${u.name} ถาวร`); } }
        else if (k === "sacown") { for (const u of [...p.field].sort((x, y) => this.eff(p, x) - this.eff(p, y)).slice(0, a[1])) this.kill(p, u); }
        else if (k === "dronebomb") { const ds = p.field.filter((u) => u.kinds.has("โดรน")); const x = ds.length; for (const u of ds) this.kill(p, u); if (x) for (const u of this.pick(e, 1, 2 * x)) this.kill(e, u, true); }
        else if (k === "fight") {
          const w = p.field.filter((u) => kindMatch(u.kinds, a[1])).sort((x, y) => this.eff(p, y) - this.eff(p, x))[0]; if (!w) continue;
          const t = e.field.filter((x) => this.eff(p, w, true, x) >= this.eff(e, x, false, w) + x.armor).sort((x, y) => this.eff(e, y) - this.eff(e, x))[0] || e.field[0];
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
        else if (k === "combo") { if (p.played >= a[1]) this.run(p, a[2], src); }
      }
    }
    checkOmega(p) {
      const names = ["อัลฟ่าบอท", "เบต้าบอท", "แกมม่าบอท"], have = {};
      for (const u of p.field) if (names.includes(u.name)) have[u.name] = u;
      if (Object.keys(have).length === 3) { for (const u of Object.values(have)) p.field.splice(p.field.indexOf(u), 1); const o = new Unit(null, "โดรน"); o.name = "โอเมก้าบอท"; o.power = 7; p.field.push(o); this.log("🤖 รวมร่างเป็นโอเมก้าบอท"); }
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
      const t = new Unit(null, "โดรน"); t.name = "ไททันเกียร์"; t.power = { 3: 7, 4: 9, 5: 11 }[Math.min(5, n)]; p.field.push(t); this.log(`🤖 รวมร่างไททันเกียร์ power ${t.power}`);
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
      return Math.max(0, c.cost - red);
    }
    gemOf(p, c) { return p.gemAll ? Math.max(c.gem, p.gemAll) : c.gem; }
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
      host.power += c.base; host.attached.push(c); for (const g of c.grant) host.kw[g] = true; this.log(`🔧 ${c.name} อัปเกรด ${host.name}`);
    }

    // ---------- การกระทำ (ผู้เล่นหรือบอทเรียก)
    summon(p, c, fodder) {
      const err = this.canSummon(p, c); if (err) return err;
      const need = this.cost(p, c), have = fodder.reduce((s, x) => s + this.gemOf(p, x), 0);
      if (have < need) return `gem ไม่พอ (ต้องใช้ ${need} มี ${have})`;
      const over = have - need + p.overAll + p.overNext; p.overNext = 0;
      p.nextRed = p.nextRed.filter(([w]) => !kindMatch(c.kinds, w));
      p.hand.splice(p.hand.indexOf(c), 1);
      for (const x of fodder) this.discard(p, x);
      if (fodder.length) this.log(`🗑 ${p.name} ทิ้ง ${fodder.map((x) => x.name).join(", ")} (gem ${have})`);
      if (c.sac) for (const u of [...p.field].sort((a, b) => this.eff(p, a) - this.eff(p, b)).slice(0, c.sac)) this.kill(p, u);
      p.played++;
      const up = c.kw["อัปเกรด"] && p.field.some((u) => u.kinds.has("เครื่องจักร"));
      if (up) this.attachUp(p, c);
      else {
        const u = this.place(p, c); u.attacksLeft = this.turn === 1 ? 0 : this.attacksAllowed(p, u);
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
      if (p.spellUsed >= p.spellMax) return "ใช้เวทปกติครบแล้วในเทิร์นนี้";
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
      this.log(`🔮 ${p.name} ใช้เวท ${c.name}`);
      const e = this.other(p);
      if (react && !e.reacted) {
        const opts = e.hand.filter((x) => x.type === "เวทสวน" && x.counter && x.counter[0] === "spell").map((card) => ({ kind: "counter", card }));
        const ch = opts.length ? await react(e, { opts, spell: c }) : null;
        if (ch) { e.hand.splice(e.hand.indexOf(ch.card), 1); e.grave.push(ch.card); e.reacted = true; this.log(`✋ ${e.name} ใช้เวทสวน ${ch.card.name} ยกเลิกเวท ${c.name}`); return null; }
      }
      this.run(p, c.spell, c); this.checkEnd(); return null;
    }
    targets(p, u) {
      const e = this.other(p);
      if (!e.field.length) return u.noface ? [] : ["face"];
      const t = e.field.filter((x) => !(x.has("ซ่อนตัว") && e.field.length > 1));
      if (u.direct && !u.noface) t.push("face");
      return t;
    }
    canAttack(p, u) {
      if (this.turn === 1) return "เทิร์นแรกของเกมโจมตีไม่ได้";
      if (u.noatk || u.has("ป้อม")) return "ตัวนี้โจมตีไม่ได้";
      if (u.frozen) return "ถูกแช่แข็ง";
      if (u.attacksLeft <= 0) return "โจมตีครบแล้ว";
      return null;
    }
    hurt(e, n, why = "") {
      if (e.immune) { this.log(`${e.name} ไม่เสีย HP (คุ้มครอง)`); return; }
      e.hp -= n; this.log(`❤ ${e.name} เสีย ${n} HP${why} (เหลือ ${e.hp})`);
    }
    // react(defender, info) → ตัวเลือกจาก info.opts หรือ null (async ได้)
    //   info = { opts, targetIsPlayer, target, attacker }  ตอนถูกโจมตี  |  { opts, spell } ตอนศัตรูร่ายเวท
    async attack(p, u, target, react) {
      const err = this.canAttack(p, u); if (err) return err;
      const e = this.other(p); u.attacksLeft--;
      if (u.kinds.has("หมาป่า")) p.wolfAttacked = true;
      let t = target, o = { react };
      const bg = t === "face" ? [] : e.field.filter((x) => x.has("พรีกาย") && x !== t && !u.has("พิษ") && this.eff(e, x, false, u) + x.armor > this.eff(p, u, true, x));
      if (bg.length) { t = bg[0]; this.log(`🛡 ${t.name} รับแทน (พรีกาย)`); }
      else {
        this.log(t === "face" ? `⚔ ${u.name} โจมตีผู้เล่น ${e.name}` : `⚔ ${u.name} โจมตี ${t.name}`);
        const r = await this.doReact(e, t === "face", t === "face" ? null : t, u, react);
        if (r) { const res = this.resolveReact(e, p, u, t, r); if (res.cancel) { this.checkEnd(); return null; } t = res.t; Object.assign(o, res); }
      }
      if (t === "face") this.hurt(e, 1);
      else await this.combat(p, u, e, t, o);
      this.checkEnd(); return null;
    }
    async combat(p, u, e, t, o = {}) {
      const A = this.eff(p, u, true, t), D = this.eff(e, t, false, u) + t.armor + (o.bonus || 0);
      let attDies = t.has("พิษ") || D > A, defDies = u.has("พิษ") || A >= D;
      if (attDies && u.has("บิน") && !t.has("พิษ")) attDies = false;
      if (o.survive) defDies = false;
      this.log(`   ${u.name} ${A} vs ${t.name} ${D}`);
      if (defDies) this.kill(e, t);
      const killed = defDies && !e.field.includes(t);
      if (attDies) this.kill(p, u);
      if ((o.after === "revenge" && e.field.includes(t)) || (o.after === "mutual" && killed)) this.kill(p, u);
      if (killed && p.field.includes(u)) {
        if (u.has("กินเหยื่อ")) u.power++;
        if (u.card && u.card.onkill.length) this.run(p, u.card.onkill, u.card);
        if (u.has("บดขยี้") && !e.field.length) {
          const r = o.react ? await this.doReact(e, true, null, u, o.react) : null;
          const res = r ? this.resolveReact(e, p, u, "face", r) : null;
          if (!res || (!res.cancel && res.t === "face")) this.hurt(e, 1, " (บดขยี้)");
          else if (!res.cancel && res.t !== "face") await this.combat(p, u, e, res.t, { ...res, react: null });
        }
      }
      return { attDies: !p.field.includes(u), killed };
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
        case "shoot": return d.field.some((x) => x.shoot != null);
      }
      return false;
    }
    reactOptions(d, toPlayer, target, att) {
      if (d.reacted) return [];
      const opts = [];
      for (const c of d.hand) {
        if (c.type !== "เวทสวน" || !c.counter || c.counter[0] !== "attack") continue;
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
      d.hand.splice(d.hand.indexOf(choice.card), 1); d.grave.push(choice.card); d.reacted = true;
      this.log(choice.kind === "counter" ? `✋ ${d.name} ใช้เวทสวน ${choice.card.name}` : `🛡 ${d.name} ทิ้ง ${choice.card.name} รับแทน (พรีกายจากมือ)`);
      return choice;
    }
    // ผลของเวทสวน → { cancel, t (เป้าหมายใหม่), bonus, survive, after }
    resolveReact(d, a, att, t, choice) {
      if (choice.kind === "bodyguard") return { cancel: true };
      const r = choice.card.counter[2], res = { cancel: false, t };
      const best = (k) => d.field.filter((x) => x !== t && kindMatch(x.kinds, k)).sort((x, y) => this.eff(d, y) - this.eff(d, x))[0];
      switch (r.t) {
        case "cancel": this.log("   ยกเลิกการโจมตี"); return { cancel: true };
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
          const A = this.eff(d, w, true, att), D = this.eff(a, att, false, w) + att.armor;
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
        case "shoot": this.shootWith(d, d.field.find((x) => x.shoot != null)); return a.field.includes(att) ? res : { cancel: true };
      }
      return res;
    }

    // ---------- เทิร์น
    startTurn() {
      this.turn++; const p = this.P[this.cur], e = this.other(p);
      e.reacted = false; p.reacted = true; p.turns++; this.deaths = 0; p.played = 0; p.wolfAttacked = false; p.discTurn = 0;
      Object.assign(p, { spellUsed: 0, spellMax: 1, immune: false, overAll: 0, overNext: 0, gemAll: 0, nextRed: [] });
      this.log(`—— เทิร์น ${this.turn}: ${p.name} ——`);
      for (const u of p.field) { u.temp2 = 0; u.undo = u.undo.filter(([when, fn]) => when !== "start" || (fn(), false)); }
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
      p.draw(DRAW);
      if (p.lost) this.log(`${p.name} เดคหมด`);
      this.checkEnd();
    }
    shootWith(p, u) {
      const e = this.other(p);
      for (let i = 0; i < (u.card && u.card.shoot2 ? 2 : 1); i++) { const t = this.pick(e, 1, u.shoot); if (t.length) { this.log(`🔫 ${u.name} ยิง ${t[0].name}`); this.kill(e, t[0]); } }
    }
    endTurn() {
      const p = this.P[this.cur], e = this.other(p);
      for (const u of [...p.field]) {
        u.temp = 0; u.frozen = !!u.frozenNext; u.frozenNext = false; u.direct = false;
        u.undo = u.undo.filter(([when, fn]) => when !== "end" || (fn(), false));
        if (u.stolenFrom) { p.field.splice(p.field.indexOf(u), 1); const o = u.stolenFrom; u.stolenFrom = null; if (o.field.length < FIELD) o.field.push(u); else if (u.card) o.grave.push(u.card); }
      }
      for (const u of e.field) u.temp = 0;
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
          this.summon(p, best[1], best[2]); await pause();
        }
      };
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
          if (t !== "face") { const win = ts.filter((x) => u.has("พิษ") || this.eff(p, u, true, x) >= this.eff(e, x, false, u) + x.armor); if (!win.length) break; t = win.sort((a, b) => this.eff(e, b) - this.eff(e, a))[0]; }
          await this.attack(p, u, t, react); await pause();
        }
      }
    }
    botReact(d, info) {
      if (info.spell) return ["kill", "wipe", "steal", "stealall", "bounce", "bottom", "curse", "edisc", "cheat", "titan"].includes(info.spell.spell[0][0]) ? info.opts[0] : null;
      if (!info.targetIsPlayer && info.target) {                     // ป้องกันชนะอยู่แล้ว ไม่ต้องเสียเวทสวน
        const a = this.other(d), A = this.eff(a, info.attacker, true, info.target), D = this.eff(d, info.target, false, info.attacker) + info.target.armor;
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

  const api = { Card, Unit, Game, buildDeck, archetypes, HP, FIELD };
  if (typeof module !== "undefined") module.exports = api; else root.Engine = api;
})(typeof window !== "undefined" ? window : globalThis);
