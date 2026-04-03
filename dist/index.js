var hc = Object.defineProperty;
var yc = (e, t, r) => t in e ? hc(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r;
var me = (e, t, r) => yc(e, typeof t != "symbol" ? t + "" : t, r);
function ve(e) {
  return (e == null ? void 0 : e.toLowerCase()) === "card";
}
function mc(e) {
  return (e == null ? void 0 : e.toLowerCase()) === "choice";
}
function vc(e) {
  return e ? e.toLowerCase() === "correct" || e === "正确" : !1;
}
function bc(e) {
  return (e == null ? void 0 : e.toLowerCase()) === "ordered";
}
function wc(e) {
  return (e == null ? void 0 : e.toLowerCase()) === "deck";
}
function Do(e) {
  return e && e.replace(/#[\w/\u4e00-\u9fa5]+/g, "").trim();
}
function Xn(e) {
  var n, a, s;
  const t = (n = e._repr) == null ? void 0 : n.type, r = ((a = e.refs) == null ? void 0 : a.some((i) => i.type === 2 && ve(i.alias))) ?? !1;
  return t === "srs.card" || t === "srs.cloze-card" || t === "srs.direction-card" || t === "srs.choice-card" || r || ((s = e.properties) == null ? void 0 : s.some((i) => i.name === "srs.isCard"));
}
function Sc(e) {
  var n;
  if (!(e != null && e.children) || e.children.length === 0) return "（无答案）";
  const t = e.children[0], r = (n = orca.state.blocks) == null ? void 0 : n[t];
  return (r == null ? void 0 : r.text) || "（无答案）";
}
function Ho(e) {
  var s, i;
  const t = ((s = e._repr) == null ? void 0 : s.front) ?? e.text ?? "（无题目）", r = ((i = e._repr) == null ? void 0 : i.back) ?? Sc(e), n = Do(t), a = Do(r);
  return { front: n, back: a };
}
const rt = "Default", Bs = "牌组";
function je(e) {
  if (!e.refs || e.refs.length === 0)
    return "basic";
  if (e.refs.some(
    (s) => s.type === 2 && // RefType.Property（标签引用）
    mc(s.alias)
    // 标签名称为 "choice"（大小写不敏感）
  ))
    return "choice";
  const r = e.refs.find(
    (s) => s.type === 2 && // RefType.Property（标签引用）
    ve(s.alias)
    // 标签名称为 "card"（大小写不敏感）
  );
  if (!r || !r.data || r.data.length === 0)
    return "basic";
  const n = r.data.find((s) => s.name === "type");
  if (!n)
    return "basic";
  const a = n.value;
  if (Array.isArray(a)) {
    if (a.length === 0 || !a[0] || typeof a[0] != "string")
      return "basic";
    const i = a[0].trim().toLowerCase();
    return i === "topic" ? "topic" : i === "extracts" ? "extracts" : i === "cloze" ? "cloze" : i === "bg" ? "bg" : i === "direction" ? "direction" : i === "list" ? "list" : i === "excerpt" ? "excerpt" : i === "choice" ? "choice" : "basic";
  } else if (typeof a == "string") {
    const i = a.trim().toLowerCase();
    return i === "topic" ? "topic" : i === "extracts" ? "extracts" : i === "cloze" ? "cloze" : i === "bg" ? "bg" : i === "direction" ? "direction" : i === "list" ? "list" : i === "excerpt" ? "excerpt" : i === "choice" ? "choice" : "basic";
  }
  return "basic";
}
async function Nr(e) {
  var r;
  const t = (r = e.refs) == null ? void 0 : r.find(
    (n) => n.type === 2 && // RefType.Property（标签引用）
    ve(n.alias)
  );
  if (t && t.data && t.data.length > 0) {
    const n = t.data.find((a) => a.name === Bs);
    if (n) {
      const a = n.value;
      if (a != null) {
        const s = String(a).trim();
        if (s)
          return s;
      }
    }
  }
  return console.log(`当前块 #${e.id} 没有有效牌组属性，开始向上遍历父块链检查 #deck 标签`), await As(e.id);
}
async function As(e, t = 0) {
  var n, a;
  if (t > 20)
    return console.error("递归超过20层，未找到具有牌组属性的块"), rt;
  try {
    let s = (n = orca.state.blocks) == null ? void 0 : n[e];
    if (s || (s = await orca.invokeBackend("get-block", e)), !s)
      return console.error(`找不到块 #${e}`), rt;
    if (!s.parent)
      return console.log(`块 #${e} 无父块，已到顶层`), rt;
    let i = (a = orca.state.blocks) == null ? void 0 : a[s.parent];
    if (i || (i = await orca.invokeBackend("get-block", s.parent)), !i)
      return console.error(`找不到父块 #${s.parent}`), rt;
    const c = await Cc(i);
    return c !== rt ? (console.log(`✅ 从父块 #${i.id} 提取到有效牌组值：${c}`), c) : (console.log(`父块 #${i.id} 没有有效牌组属性，继续向上查找`), await As(i.id, t + 1));
  } catch (s) {
    return console.error(`递归查询出错：${s instanceof Error ? s.message : String(s)}`), rt;
  }
}
async function Cc(e) {
  if (!e.refs || e.refs.length === 0)
    return rt;
  const t = e.refs.find(
    (a) => a.type === 2 && // RefType.Property（标签引用）
    wc(a.alias)
    // 标签名称为 "deck"（大小写不敏感）
  );
  if (!t)
    return console.log(`父块 #${e.id} 没有 #deck 标签，继续向上查找`), rt;
  if (!t.data || t.data.length === 0)
    return console.log(`父块 #${e.id} 的 #deck 标签没有关联数据，继续向上查找`), rt;
  const r = t.data.find((a) => a.name === Bs);
  if (!r)
    return console.log(`父块 #${e.id} 的 #deck 标签没有设置「牌组」属性，继续向上查找`), rt;
  const n = r.value;
  if (n != null) {
    const a = String(n).trim();
    if (a)
      return console.log(`✅ 从父块 #${e.id} 的 #deck 标签提取到有效牌组值：${a}`), a;
  }
  return console.log(`父块 #${e.id} 的 #deck 标签「牌组」属性值为空或无效，继续向上查找`), rt;
}
function Dt(e) {
  return e ? e.split("::").map((t) => t.trim()).filter((t) => t !== "") : [];
}
function Ps(e) {
  return e.join("::");
}
function An(e) {
  const t = Dt(e);
  return t.length <= 1 ? null : Ps(t.slice(0, -1));
}
function Ls(e) {
  const t = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Date(), n = r.getTime(), a = new Date(r.getFullYear(), r.getMonth(), r.getDate()), s = new Date(a);
  s.setDate(s.getDate() + 1);
  for (const c of e) {
    const d = c.deck;
    t.has(d) || t.set(d, {
      name: d,
      totalCount: 0,
      newCount: 0,
      overdueCount: 0,
      todayCount: 0,
      futureCount: 0
    });
    const l = t.get(d);
    l.totalCount++, c.isNew ? l.newCount++ : c.srs.due.getTime() <= n ? l.overdueCount++ : c.srs.due >= a && c.srs.due < s ? l.todayCount++ : l.futureCount++;
    let x = An(d);
    for (; x; ) {
      t.has(x) || t.set(x, {
        name: x,
        totalCount: 0,
        newCount: 0,
        overdueCount: 0,
        todayCount: 0,
        futureCount: 0
      });
      const u = t.get(x);
      u.totalCount++, c.isNew ? u.newCount++ : c.srs.due.getTime() <= n ? u.overdueCount++ : c.srs.due >= a && c.srs.due < s ? u.todayCount++ : u.futureCount++, x = An(x);
    }
  }
  const i = Array.from(t.values());
  return i.sort((c, d) => {
    if (c.name === "Default" && d.name !== "Default") return -1;
    if (c.name !== "Default" && d.name === "Default") return 1;
    const l = Dt(c.name), x = Dt(d.name);
    for (let u = 0; u < Math.min(l.length, x.length); u++) {
      const f = l[u].localeCompare(x[u]);
      if (f !== 0)
        return f;
    }
    return l.length - x.length;
  }), {
    decks: i,
    totalCards: e.length,
    totalNew: e.filter((c) => c.isNew).length,
    totalOverdue: e.filter((c) => c.isNew ? !1 : c.srs.due.getTime() <= n).length
  };
}
function kc(e) {
  const t = /* @__PURE__ */ new Date(), r = t.getTime(), n = new Date(t.getFullYear(), t.getMonth(), t.getDate()), a = new Date(n);
  a.setDate(a.getDate() + 1);
  let s = 0, i = 0, c = 0;
  const d = e.length;
  for (const l of e)
    l.isNew ? i++ : l.srs.due.getTime() <= r && (c++, l.srs.due >= n && l.srs.due < a && s++);
  return {
    todayCount: s,
    newCount: i,
    pendingCount: c,
    totalCount: d
  };
}
const Ra = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  buildDeckName: Ps,
  calculateDeckStats: Ls,
  calculateHomeStats: kc,
  extractCardType: je,
  extractDeckName: Nr,
  getParentDeckName: An,
  parseDeckHierarchy: Dt
}, Symbol.toStringTag, { value: "Module" }));
var U = /* @__PURE__ */ ((e) => (e[e.New = 0] = "New", e[e.Learning = 1] = "Learning", e[e.Review = 2] = "Review", e[e.Relearning = 3] = "Relearning", e))(U || {}), Y = /* @__PURE__ */ ((e) => (e[e.Manual = 0] = "Manual", e[e.Again = 1] = "Again", e[e.Hard = 2] = "Hard", e[e.Good = 3] = "Good", e[e.Easy = 4] = "Easy", e))(Y || {});
class re {
  static card(t) {
    return {
      ...t,
      state: re.state(t.state),
      due: re.time(t.due),
      last_review: t.last_review ? re.time(t.last_review) : void 0
    };
  }
  static rating(t) {
    if (typeof t == "string") {
      const r = t.charAt(0).toUpperCase(), n = t.slice(1).toLowerCase(), a = Y[`${r}${n}`];
      if (a === void 0)
        throw new Error(`Invalid rating:[${t}]`);
      return a;
    } else if (typeof t == "number")
      return t;
    throw new Error(`Invalid rating:[${t}]`);
  }
  static state(t) {
    if (typeof t == "string") {
      const r = t.charAt(0).toUpperCase(), n = t.slice(1).toLowerCase(), a = U[`${r}${n}`];
      if (a === void 0)
        throw new Error(`Invalid state:[${t}]`);
      return a;
    } else if (typeof t == "number")
      return t;
    throw new Error(`Invalid state:[${t}]`);
  }
  static time(t) {
    const r = new Date(t);
    if (typeof t == "object" && t !== null && !Number.isNaN(Date.parse(t) || +r))
      return r;
    if (typeof t == "string") {
      const n = Date.parse(t);
      if (Number.isNaN(n))
        throw new Error(`Invalid date:[${t}]`);
      return new Date(n);
    } else if (typeof t == "number")
      return new Date(t);
    throw new Error(`Invalid date:[${t}]`);
  }
  static review_log(t) {
    return {
      ...t,
      due: re.time(t.due),
      rating: re.rating(t.rating),
      state: re.state(t.state),
      review: re.time(t.review)
    };
  }
}
Date.prototype.scheduler = function(e, t) {
  return ot(this, e, t);
};
Date.prototype.diff = function(e, t) {
  return cr(this, e, t);
};
Date.prototype.format = function() {
  return jc(this);
};
Date.prototype.dueFormat = function(e, t, r) {
  return Rc(this, e, t, r);
};
function ot(e, t, r) {
  return new Date(
    r ? re.time(e).getTime() + t * 24 * 60 * 60 * 1e3 : re.time(e).getTime() + t * 60 * 1e3
  );
}
function cr(e, t, r) {
  if (!e || !t)
    throw new Error("Invalid date");
  const n = re.time(e).getTime() - re.time(t).getTime();
  let a = 0;
  switch (r) {
    case "days":
      a = Math.floor(n / (24 * 60 * 60 * 1e3));
      break;
    case "minutes":
      a = Math.floor(n / (60 * 1e3));
      break;
  }
  return a;
}
function jc(e) {
  const t = re.time(e), r = t.getFullYear(), n = t.getMonth() + 1, a = t.getDate(), s = t.getHours(), i = t.getMinutes(), c = t.getSeconds();
  return `${r}-${wr(n)}-${wr(a)} ${wr(s)}:${wr(
    i
  )}:${wr(c)}`;
}
function wr(e) {
  return e < 10 ? `0${e}` : `${e}`;
}
const un = [60, 60, 24, 31, 12], fn = ["second", "min", "hour", "day", "month", "year"];
function Rc(e, t, r, n = fn) {
  e = re.time(e), t = re.time(t), n.length !== fn.length && (n = fn);
  let a = e.getTime() - t.getTime(), s = 0;
  for (a /= 1e3, s = 0; s < un.length && !(a < un[s]); s++)
    a /= un[s];
  return `${Math.floor(a)}${r ? n[s] : ""}`;
}
const $c = Object.freeze([
  Y.Again,
  Y.Hard,
  Y.Good,
  Y.Easy
]), Dc = [
  {
    start: 2.5,
    end: 7,
    factor: 0.15
  },
  {
    start: 7,
    end: 20,
    factor: 0.1
  },
  {
    start: 20,
    end: 1 / 0,
    factor: 0.05
  }
];
function Tc(e, t, r) {
  let n = 1;
  for (const i of Dc)
    n += i.factor * Math.max(Math.min(e, i.end) - i.start, 0);
  e = Math.min(e, r);
  let a = Math.max(2, Math.round(e - n));
  const s = Math.min(Math.round(e + n), r);
  return e > t && (a = Math.max(a, t + 1)), a = Math.min(a, s), { min_ivl: a, max_ivl: s };
}
function We(e, t, r) {
  return Math.min(Math.max(e, t), r);
}
function Ec(e, t) {
  const r = Date.UTC(
    e.getUTCFullYear(),
    e.getUTCMonth(),
    e.getUTCDate()
  ), n = Date.UTC(
    t.getUTCFullYear(),
    t.getUTCMonth(),
    t.getUTCDate()
  );
  return Math.floor(
    (n - r) / 864e5
    /** 1000 * 60 * 60 * 24*/
  );
}
const _c = (e) => {
  const t = e.slice(-1), r = parseInt(e.slice(0, -1), 10);
  if (Number.isNaN(r) || !Number.isFinite(r) || r < 0)
    throw new Error(`Invalid step value: ${e}`);
  switch (t) {
    case "m":
      return r;
    case "h":
      return r * 60;
    case "d":
      return r * 1440;
    default:
      throw new Error(`Invalid step unit: ${e}, expected m/h/d`);
  }
}, zc = (e, t, r) => {
  const n = t === U.Relearning || t === U.Review ? e.relearning_steps : e.learning_steps, a = n.length;
  if (a === 0 || r >= a) return {};
  const s = n[0], i = _c, c = () => i(s), d = () => {
    if (a === 1) return Math.round(i(s) * 1.5);
    const p = n[1];
    return Math.round((i(s) + i(p)) / 2);
  }, l = (p) => p < 0 || p >= a ? null : n[p], x = (p) => i(p), u = {}, f = l(Math.max(0, r));
  if (t === U.Review)
    return u[Y.Again] = {
      scheduled_minutes: i(f),
      next_step: 0
    }, u;
  {
    u[Y.Again] = {
      scheduled_minutes: c(),
      next_step: 0
    }, u[Y.Hard] = {
      scheduled_minutes: d(),
      next_step: r
    };
    const p = l(r + 1);
    if (p) {
      const g = x(p);
      g && (u[Y.Good] = {
        scheduled_minutes: Math.round(g),
        next_step: r + 1
      });
    }
  }
  return u;
};
function Ic() {
  const e = this.review_time.getTime(), t = this.current.reps, r = this.current.difficulty * this.current.stability;
  return `${e}_${t}_${r}`;
}
var No = /* @__PURE__ */ ((e) => (e.SCHEDULER = "Scheduler", e.LEARNING_STEPS = "LearningSteps", e.SEED = "Seed", e))(No || {});
class Os {
  // init
  constructor(t, r, n, a) {
    me(this, "last");
    me(this, "current");
    me(this, "review_time");
    me(this, "next", /* @__PURE__ */ new Map());
    me(this, "algorithm");
    me(this, "strategies");
    me(this, "elapsed_days", 0);
    this.algorithm = n, this.last = re.card(t), this.current = re.card(t), this.review_time = re.time(r), this.strategies = a, this.init();
  }
  checkGrade(t) {
    if (!Number.isFinite(t) || t < 0 || t > 4)
      throw new Error(`Invalid grade "${t}",expected 1-4`);
  }
  init() {
    const { state: t, last_review: r } = this.current;
    let n = 0;
    t !== U.New && r && (n = Ec(r, this.review_time)), this.current.last_review = this.review_time, this.elapsed_days = n, this.current.elapsed_days = n, this.current.reps += 1;
    let a = Ic;
    if (this.strategies) {
      const s = this.strategies.get(No.SEED);
      s && (a = s);
    }
    this.algorithm.seed = a.call(this);
  }
  preview() {
    return {
      [Y.Again]: this.review(Y.Again),
      [Y.Hard]: this.review(Y.Hard),
      [Y.Good]: this.review(Y.Good),
      [Y.Easy]: this.review(Y.Easy),
      [Symbol.iterator]: this.previewIterator.bind(this)
    };
  }
  *previewIterator() {
    for (const t of $c)
      yield this.review(t);
  }
  review(t) {
    const { state: r } = this.last;
    let n;
    switch (this.checkGrade(t), r) {
      case U.New:
        n = this.newState(t);
        break;
      case U.Learning:
      case U.Relearning:
        n = this.learningState(t);
        break;
      case U.Review:
        n = this.reviewState(t);
        break;
    }
    return n;
  }
  buildLog(t) {
    const { last_review: r, due: n, elapsed_days: a } = this.last;
    return {
      rating: t,
      state: this.current.state,
      due: r || n,
      stability: this.current.stability,
      difficulty: this.current.difficulty,
      elapsed_days: this.elapsed_days,
      last_elapsed_days: a,
      scheduled_days: this.current.scheduled_days,
      learning_steps: this.current.learning_steps,
      review: this.review_time
    };
  }
}
class Mc {
  constructor(t) {
    me(this, "c");
    me(this, "s0");
    me(this, "s1");
    me(this, "s2");
    const r = Bc();
    this.c = 1, this.s0 = r(" "), this.s1 = r(" "), this.s2 = r(" "), t == null && (t = Date.now()), this.s0 -= r(t), this.s0 < 0 && (this.s0 += 1), this.s1 -= r(t), this.s1 < 0 && (this.s1 += 1), this.s2 -= r(t), this.s2 < 0 && (this.s2 += 1);
  }
  next() {
    const t = 2091639 * this.s0 + this.c * 23283064365386963e-26;
    return this.s0 = this.s1, this.s1 = this.s2, this.c = t | 0, this.s2 = t - this.c, this.s2;
  }
  set state(t) {
    this.c = t.c, this.s0 = t.s0, this.s1 = t.s1, this.s2 = t.s2;
  }
  get state() {
    return {
      c: this.c,
      s0: this.s0,
      s1: this.s1,
      s2: this.s2
    };
  }
}
function Bc() {
  let e = 4022871197;
  return function(r) {
    r = String(r);
    for (let n = 0; n < r.length; n++) {
      e += r.charCodeAt(n);
      let a = 0.02519603282416938 * e;
      e = a >>> 0, a -= e, a *= e, e = a >>> 0, a -= e, e += a * 4294967296;
    }
    return (e >>> 0) * 23283064365386963e-26;
  };
}
function Ac(e) {
  const t = new Mc(e), r = () => t.next();
  return r.int32 = () => t.next() * 4294967296 | 0, r.double = () => r() + (r() * 2097152 | 0) * 11102230246251565e-32, r.state = () => t.state, r.importState = (n) => (t.state = n, r), r;
}
const Pc = 0.9, Lc = 36500, Oc = !1, Yo = !0, Fc = Object.freeze([
  "1m",
  "10m"
]), Wc = Object.freeze([
  "10m"
]), nt = 1e-3, no = 100, $a = 0.5, Hc = 0.1542, Da = Object.freeze([
  0.212,
  1.2931,
  2.3065,
  8.2956,
  6.4133,
  0.8334,
  3.0194,
  1e-3,
  1.8722,
  0.1666,
  0.796,
  1.4835,
  0.0614,
  0.2629,
  1.6483,
  0.6014,
  1.8729,
  0.5425,
  0.0912,
  0.0658,
  Hc
]), Nc = 2, Yc = (e, t = Yo) => [
  [nt, no],
  [nt, no],
  [nt, no],
  [nt, no],
  [1, 10],
  [1e-3, 4],
  [1e-3, 4],
  [1e-3, 0.75],
  [0, 4.5],
  [0, 0.8],
  [1e-3, 3.5],
  [1e-3, 5],
  [1e-3, 0.25],
  [1e-3, 0.9],
  [0, 4],
  [0, 1],
  [1, 6],
  [0, e],
  [0, e],
  [
    t ? 0.01 : 0,
    0.8
  ],
  [0.1, 0.8]
], pn = (e, t, r = Yo) => {
  let n = Nc;
  if (Math.max(0, t) > 1) {
    const s = -(Math.log(e[11]) + Math.log(Math.pow(2, e[13]) - 1) + e[14] * 0.3) / t;
    n = We(+s.toFixed(8), 0.01, 2);
  }
  return Yc(n, r).slice(
    0,
    e.length
  ).map(
    ([s, i], c) => We(e[c] || 0, s, i)
  );
}, Zn = (e, t = 0, r = Yo) => {
  if (e === void 0)
    return [...Da];
  switch (e.length) {
    case 21:
      return pn(
        Array.from(e),
        t,
        r
      );
    case 19:
      return console.debug("[FSRS-6]auto fill w from 19 to 21 length"), pn(
        Array.from(e),
        t,
        r
      ).concat([0, $a]);
    case 17: {
      const n = pn(
        Array.from(e),
        t,
        r
      );
      return n[4] = +(n[5] * 2 + n[4]).toFixed(8), n[5] = +(Math.log(n[5] * 3 + 1) / 3).toFixed(8), n[6] = +(n[6] + 0.5).toFixed(8), console.debug("[FSRS-6]auto fill w from 17 to 21 length"), n.concat([0, 0, 0, $a]);
    }
    default:
      return console.warn("[FSRS]Invalid parameters length, using default parameters"), [...Da];
  }
}, Pn = (e) => {
  const t = Array.isArray(e == null ? void 0 : e.learning_steps) ? e.learning_steps : Fc, r = Array.isArray(e == null ? void 0 : e.relearning_steps) ? e.relearning_steps : Wc, n = (e == null ? void 0 : e.enable_short_term) ?? Yo, a = Zn(
    e == null ? void 0 : e.w,
    r.length,
    n
  );
  return {
    request_retention: (e == null ? void 0 : e.request_retention) || Pc,
    maximum_interval: (e == null ? void 0 : e.maximum_interval) || Lc,
    w: a,
    enable_fuzz: (e == null ? void 0 : e.enable_fuzz) ?? Oc,
    enable_short_term: n,
    learning_steps: t,
    relearning_steps: r
  };
};
function Lr(e, t) {
  return {
    due: e ? re.time(e) : /* @__PURE__ */ new Date(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    learning_steps: 0,
    state: U.New,
    last_review: void 0
  };
}
const Fs = (e) => {
  const t = typeof e == "number" ? -e : -e[20], r = Math.exp(Math.pow(t, -1) * Math.log(0.9)) - 1;
  return { decay: t, factor: +r.toFixed(8) };
};
function Ln(e, t, r) {
  const { decay: n, factor: a } = Fs(e);
  return +Math.pow(1 + a * t / r, n).toFixed(8);
}
class qc {
  constructor(t) {
    me(this, "param");
    me(this, "intervalModifier");
    me(this, "_seed");
    /**
     * The formula used is :
     * $$R(t,S) = (1 + \text{FACTOR} \times \frac{t}{9 \cdot S})^{\text{DECAY}}$$
     * @param {number} elapsed_days t days since the last review
     * @param {number} stability Stability (interval when R=90%)
     * @return {number} r Retrievability (probability of recall)
     */
    me(this, "forgetting_curve");
    this.param = new Proxy(
      Pn(t),
      this.params_handler_proxy()
    ), this.intervalModifier = this.calculate_interval_modifier(
      this.param.request_retention
    ), this.forgetting_curve = Ln.bind(this, this.param.w);
  }
  get interval_modifier() {
    return this.intervalModifier;
  }
  set seed(t) {
    this._seed = t;
  }
  /**
   * @see https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm#fsrs-5
   *
   * The formula used is: $$I(r,s) = (r^{\frac{1}{DECAY}} - 1) / FACTOR \times s$$
   * @param request_retention 0<request_retention<=1,Requested retention rate
   * @throws {Error} Requested retention rate should be in the range (0,1]
   */
  calculate_interval_modifier(t) {
    if (t <= 0 || t > 1)
      throw new Error("Requested retention rate should be in the range (0,1]");
    const { decay: r, factor: n } = Fs(this.param.w);
    return +((Math.pow(t, 1 / r) - 1) / n).toFixed(8);
  }
  /**
   * Get the parameters of the algorithm.
   */
  get parameters() {
    return this.param;
  }
  /**
   * Set the parameters of the algorithm.
   * @param params Partial<FSRSParameters>
   */
  set parameters(t) {
    this.update_parameters(t);
  }
  params_handler_proxy() {
    const t = this;
    return {
      set: function(r, n, a) {
        return n === "request_retention" && Number.isFinite(a) ? t.intervalModifier = t.calculate_interval_modifier(
          Number(a)
        ) : n === "w" && (a = Zn(
          a,
          r.relearning_steps.length,
          r.enable_short_term
        ), t.forgetting_curve = Ln.bind(this, a), t.intervalModifier = t.calculate_interval_modifier(
          Number(r.request_retention)
        )), Reflect.set(r, n, a), !0;
      }
    };
  }
  update_parameters(t) {
    const r = Pn(t);
    for (const n in r) {
      const a = n;
      this.param[a] = r[a];
    }
  }
  /**
     * The formula used is :
     * $$ S_0(G) = w_{G-1}$$
     * $$S_0 = \max \lbrace S_0,0.1\rbrace $$
  
     * @param g Grade (rating at Anki) [1.again,2.hard,3.good,4.easy]
     * @return Stability (interval when R=90%)
     */
  init_stability(t) {
    return Math.max(this.param.w[t - 1], 0.1);
  }
  /**
   * The formula used is :
   * $$D_0(G) = w_4 - e^{(G-1) \cdot w_5} + 1 $$
   * $$D_0 = \min \lbrace \max \lbrace D_0(G),1 \rbrace,10 \rbrace$$
   * where the $$D_0(1)=w_4$$ when the first rating is good.
   *
   * @param {Grade} g Grade (rating at Anki) [1.again,2.hard,3.good,4.easy]
   * @return {number} Difficulty $$D \in [1,10]$$
   */
  init_difficulty(t) {
    return +(this.param.w[4] - Math.exp((t - 1) * this.param.w[5]) + 1).toFixed(8);
  }
  /**
   * If fuzzing is disabled or ivl is less than 2.5, it returns the original interval.
   * @param {number} ivl - The interval to be fuzzed.
   * @param {number} elapsed_days t days since the last review
   * @return {number} - The fuzzed interval.
   **/
  apply_fuzz(t, r) {
    if (!this.param.enable_fuzz || t < 2.5) return Math.round(t);
    const a = Ac(this._seed)(), { min_ivl: s, max_ivl: i } = Tc(
      t,
      r,
      this.param.maximum_interval
    );
    return Math.floor(a * (i - s + 1) + s);
  }
  /**
   *   @see The formula used is : {@link FSRSAlgorithm.calculate_interval_modifier}
   *   @param {number} s - Stability (interval when R=90%)
   *   @param {number} elapsed_days t days since the last review
   */
  next_interval(t, r) {
    const n = Math.min(
      Math.max(1, Math.round(t * this.intervalModifier)),
      this.param.maximum_interval
    );
    return this.apply_fuzz(n, r);
  }
  /**
   * @see https://github.com/open-spaced-repetition/fsrs4anki/issues/697
   */
  linear_damping(t, r) {
    return +(t * (10 - r) / 9).toFixed(8);
  }
  /**
   * The formula used is :
   * $$\text{delta}_d = -w_6 \cdot (g - 3)$$
   * $$\text{next}_d = D + \text{linear damping}(\text{delta}_d , D)$$
   * $$D^\prime(D,R) = w_7 \cdot D_0(4) +(1 - w_7) \cdot \text{next}_d$$
   * @param {number} d Difficulty $$D \in [1,10]$$
   * @param {Grade} g Grade (rating at Anki) [1.again,2.hard,3.good,4.easy]
   * @return {number} $$\text{next}_D$$
   */
  next_difficulty(t, r) {
    const n = -this.param.w[6] * (r - 3), a = t + this.linear_damping(n, t);
    return We(
      this.mean_reversion(this.init_difficulty(Y.Easy), a),
      1,
      10
    );
  }
  /**
   * The formula used is :
   * $$w_7 \cdot \text{init} +(1 - w_7) \cdot \text{current}$$
   * @param {number} init $$w_2 : D_0(3) = w_2 + (R-2) \cdot w_3= w_2$$
   * @param {number} current $$D - w_6 \cdot (R - 2)$$
   * @return {number} difficulty
   */
  mean_reversion(t, r) {
    return +(this.param.w[7] * t + (1 - this.param.w[7]) * r).toFixed(
      8
    );
  }
  /**
   * The formula used is :
   * $$S^\prime_r(D,S,R,G) = S\cdot(e^{w_8}\cdot (11-D)\cdot S^{-w_9}\cdot(e^{w_{10}\cdot(1-R)}-1)\cdot w_{15}(\text{if} G=2) \cdot w_{16}(\text{if} G=4)+1)$$
   * @param {number} d Difficulty D \in [1,10]
   * @param {number} s Stability (interval when R=90%)
   * @param {number} r Retrievability (probability of recall)
   * @param {Grade} g Grade (Rating[0.again,1.hard,2.good,3.easy])
   * @return {number} S^\prime_r new stability after recall
   */
  next_recall_stability(t, r, n, a) {
    const s = Y.Hard === a ? this.param.w[15] : 1, i = Y.Easy === a ? this.param.w[16] : 1;
    return +We(
      r * (1 + Math.exp(this.param.w[8]) * (11 - t) * Math.pow(r, -this.param.w[9]) * (Math.exp((1 - n) * this.param.w[10]) - 1) * s * i),
      nt,
      36500
    ).toFixed(8);
  }
  /**
   * The formula used is :
   * $$S^\prime_f(D,S,R) = w_{11}\cdot D^{-w_{12}}\cdot ((S+1)^{w_{13}}-1) \cdot e^{w_{14}\cdot(1-R)}$$
   * enable_short_term = true : $$S^\prime_f \in \min \lbrace \max \lbrace S^\prime_f,0.01\rbrace, \frac{S}{e^{w_{17} \cdot w_{18}}} \rbrace$$
   * enable_short_term = false : $$S^\prime_f \in \min \lbrace \max \lbrace S^\prime_f,0.01\rbrace, S \rbrace$$
   * @param {number} d Difficulty D \in [1,10]
   * @param {number} s Stability (interval when R=90%)
   * @param {number} r Retrievability (probability of recall)
   * @return {number} S^\prime_f new stability after forgetting
   */
  next_forget_stability(t, r, n) {
    return +We(
      this.param.w[11] * Math.pow(t, -this.param.w[12]) * (Math.pow(r + 1, this.param.w[13]) - 1) * Math.exp((1 - n) * this.param.w[14]),
      nt,
      36500
    ).toFixed(8);
  }
  /**
   * The formula used is :
   * $$S^\prime_s(S,G) = S \cdot e^{w_{17} \cdot (G-3+w_{18})}$$
   * @param {number} s Stability (interval when R=90%)
   * @param {Grade} g Grade (Rating[0.again,1.hard,2.good,3.easy])
   */
  next_short_term_stability(t, r) {
    const n = Math.pow(t, -this.param.w[19]) * Math.exp(this.param.w[17] * (r - 3 + this.param.w[18])), a = r >= 3 ? Math.max(n, 1) : n;
    return +We(t * a, nt, 36500).toFixed(8);
  }
  /**
   * Calculates the next state of memory based on the current state, time elapsed, and grade.
   *
   * @param memory_state - The current state of memory, which can be null.
   * @param t - The time elapsed since the last review.
   * @param {Rating} g Grade (Rating[0.Manual,1.Again,2.Hard,3.Good,4.Easy])
   * @returns The next state of memory with updated difficulty and stability.
   */
  next_state(t, r, n) {
    const { difficulty: a, stability: s } = t ?? {
      difficulty: 0,
      stability: 0
    };
    if (r < 0)
      throw new Error(`Invalid delta_t "${r}"`);
    if (n < 0 || n > 4)
      throw new Error(`Invalid grade "${n}"`);
    if (a === 0 && s === 0)
      return {
        difficulty: We(this.init_difficulty(n), 1, 10),
        stability: this.init_stability(n)
      };
    if (n === 0)
      return {
        difficulty: a,
        stability: s
      };
    if (a < 1 || s < nt)
      throw new Error(
        `Invalid memory state { difficulty: ${a}, stability: ${s} }`
      );
    const i = this.forgetting_curve(r, s), c = this.next_recall_stability(a, s, i, n), d = this.next_forget_stability(a, s, i), l = this.next_short_term_stability(s, n);
    let x = c;
    if (n === 1) {
      let [f, p] = [0, 0];
      this.param.enable_short_term && (f = this.param.w[17], p = this.param.w[18]);
      const g = s / Math.exp(f * p);
      x = We(+g.toFixed(8), nt, d);
    }
    return r === 0 && this.param.enable_short_term && (x = l), { difficulty: this.next_difficulty(a, n), stability: x };
  }
}
class Ta extends Os {
  constructor(r, n, a, s) {
    super(r, n, a, s);
    me(this, "learningStepsStrategy");
    let i = zc;
    if (this.strategies) {
      const c = this.strategies.get(No.LEARNING_STEPS);
      c && (i = c);
    }
    this.learningStepsStrategy = i;
  }
  getLearningInfo(r, n) {
    var d, l;
    const a = this.algorithm.parameters;
    r.learning_steps = r.learning_steps || 0;
    const s = this.learningStepsStrategy(
      a,
      r.state,
      // In the original learning steps setup (Again = 5m, Hard = 10m, Good = FSRS),
      // not adding 1 can cause slight variations in the memory state’s ds.
      this.current.state === U.Learning && n !== Y.Again && n !== Y.Hard ? r.learning_steps + 1 : r.learning_steps
    ), i = Math.max(
      0,
      ((d = s[n]) == null ? void 0 : d.scheduled_minutes) ?? 0
    ), c = Math.max(0, ((l = s[n]) == null ? void 0 : l.next_step) ?? 0);
    return {
      scheduled_minutes: i,
      next_steps: c
    };
  }
  /**
   * @description This function applies the learning steps based on the current card's state and grade.
   */
  applyLearningSteps(r, n, a) {
    const { scheduled_minutes: s, next_steps: i } = this.getLearningInfo(
      this.current,
      n
    );
    if (s > 0 && s < 1440)
      r.learning_steps = i, r.scheduled_days = 0, r.state = a, r.due = ot(
        this.review_time,
        Math.round(s),
        !1
        /** true:days false: minute */
      );
    else if (r.state = U.Review, s >= 1440)
      r.learning_steps = i, r.due = ot(
        this.review_time,
        Math.round(s),
        !1
        /** true:days false: minute */
      ), r.scheduled_days = Math.floor(s / 1440);
    else {
      r.learning_steps = 0;
      const c = this.algorithm.next_interval(
        r.stability,
        this.elapsed_days
      );
      r.scheduled_days = c, r.due = ot(this.review_time, c, !0);
    }
  }
  newState(r) {
    const n = this.next.get(r);
    if (n)
      return n;
    const a = re.card(this.current);
    a.difficulty = We(this.algorithm.init_difficulty(r), 1, 10), a.stability = this.algorithm.init_stability(r), this.applyLearningSteps(a, r, U.Learning);
    const s = {
      card: a,
      log: this.buildLog(r)
    };
    return this.next.set(r, s), s;
  }
  learningState(r) {
    const n = this.next.get(r);
    if (n)
      return n;
    const { state: a, difficulty: s, stability: i } = this.last, c = re.card(this.current);
    c.difficulty = this.algorithm.next_difficulty(s, r), c.stability = this.algorithm.next_short_term_stability(i, r), this.applyLearningSteps(
      c,
      r,
      a
      /** Learning or Relearning */
    );
    const d = {
      card: c,
      log: this.buildLog(r)
    };
    return this.next.set(r, d), d;
  }
  reviewState(r) {
    const n = this.next.get(r);
    if (n)
      return n;
    const a = this.elapsed_days, { difficulty: s, stability: i } = this.last, c = this.algorithm.forgetting_curve(a, i), d = re.card(this.current), l = re.card(this.current), x = re.card(this.current), u = re.card(this.current);
    this.next_ds(
      d,
      l,
      x,
      u,
      s,
      i,
      c
    ), this.next_interval(l, x, u, a), this.next_state(l, x, u), this.applyLearningSteps(d, Y.Again, U.Relearning), d.lapses += 1;
    const f = {
      card: d,
      log: this.buildLog(Y.Again)
    }, p = {
      card: l,
      log: super.buildLog(Y.Hard)
    }, g = {
      card: x,
      log: super.buildLog(Y.Good)
    }, y = {
      card: u,
      log: super.buildLog(Y.Easy)
    };
    return this.next.set(Y.Again, f), this.next.set(Y.Hard, p), this.next.set(Y.Good, g), this.next.set(Y.Easy, y), this.next.get(r);
  }
  /**
   * Review next_ds
   */
  next_ds(r, n, a, s, i, c, d) {
    r.difficulty = this.algorithm.next_difficulty(
      i,
      Y.Again
    );
    const l = c / Math.exp(
      this.algorithm.parameters.w[17] * this.algorithm.parameters.w[18]
    ), x = this.algorithm.next_forget_stability(
      i,
      c,
      d
    );
    r.stability = We(+l.toFixed(8), nt, x), n.difficulty = this.algorithm.next_difficulty(
      i,
      Y.Hard
    ), n.stability = this.algorithm.next_recall_stability(
      i,
      c,
      d,
      Y.Hard
    ), a.difficulty = this.algorithm.next_difficulty(
      i,
      Y.Good
    ), a.stability = this.algorithm.next_recall_stability(
      i,
      c,
      d,
      Y.Good
    ), s.difficulty = this.algorithm.next_difficulty(
      i,
      Y.Easy
    ), s.stability = this.algorithm.next_recall_stability(
      i,
      c,
      d,
      Y.Easy
    );
  }
  /**
   * Review next_interval
   */
  next_interval(r, n, a, s) {
    let i, c;
    i = this.algorithm.next_interval(r.stability, s), c = this.algorithm.next_interval(n.stability, s), i = Math.min(i, c), c = Math.max(c, i + 1);
    const d = Math.max(
      this.algorithm.next_interval(a.stability, s),
      c + 1
    );
    r.scheduled_days = i, r.due = ot(this.review_time, i, !0), n.scheduled_days = c, n.due = ot(this.review_time, c, !0), a.scheduled_days = d, a.due = ot(this.review_time, d, !0);
  }
  /**
   * Review next_state
   */
  next_state(r, n, a) {
    r.state = U.Review, r.learning_steps = 0, n.state = U.Review, n.learning_steps = 0, a.state = U.Review, a.learning_steps = 0;
  }
}
class Ea extends Os {
  newState(t) {
    const r = this.next.get(t);
    if (r)
      return r;
    this.current.scheduled_days = 0, this.current.elapsed_days = 0;
    const n = re.card(this.current), a = re.card(this.current), s = re.card(this.current), i = re.card(this.current);
    return this.init_ds(n, a, s, i), this.next_interval(
      n,
      a,
      s,
      i,
      0
    ), this.next_state(n, a, s, i), this.update_next(n, a, s, i), this.next.get(t);
  }
  init_ds(t, r, n, a) {
    t.difficulty = We(
      this.algorithm.init_difficulty(Y.Again),
      1,
      10
    ), t.stability = this.algorithm.init_stability(Y.Again), r.difficulty = We(
      this.algorithm.init_difficulty(Y.Hard),
      1,
      10
    ), r.stability = this.algorithm.init_stability(Y.Hard), n.difficulty = We(
      this.algorithm.init_difficulty(Y.Good),
      1,
      10
    ), n.stability = this.algorithm.init_stability(Y.Good), a.difficulty = We(
      this.algorithm.init_difficulty(Y.Easy),
      1,
      10
    ), a.stability = this.algorithm.init_stability(Y.Easy);
  }
  /**
   * @see https://github.com/open-spaced-repetition/ts-fsrs/issues/98#issuecomment-2241923194
   */
  learningState(t) {
    return this.reviewState(t);
  }
  reviewState(t) {
    const r = this.next.get(t);
    if (r)
      return r;
    const n = this.elapsed_days, { difficulty: a, stability: s } = this.last, i = this.algorithm.forgetting_curve(n, s), c = re.card(this.current), d = re.card(this.current), l = re.card(this.current), x = re.card(this.current);
    return this.next_ds(
      c,
      d,
      l,
      x,
      a,
      s,
      i
    ), this.next_interval(c, d, l, x, n), this.next_state(c, d, l, x), c.lapses += 1, this.update_next(c, d, l, x), this.next.get(t);
  }
  /**
   * Review next_ds
   */
  next_ds(t, r, n, a, s, i, c) {
    t.difficulty = this.algorithm.next_difficulty(
      s,
      Y.Again
    );
    const d = this.algorithm.next_forget_stability(
      s,
      i,
      c
    );
    t.stability = We(i, nt, d), r.difficulty = this.algorithm.next_difficulty(
      s,
      Y.Hard
    ), r.stability = this.algorithm.next_recall_stability(
      s,
      i,
      c,
      Y.Hard
    ), n.difficulty = this.algorithm.next_difficulty(
      s,
      Y.Good
    ), n.stability = this.algorithm.next_recall_stability(
      s,
      i,
      c,
      Y.Good
    ), a.difficulty = this.algorithm.next_difficulty(
      s,
      Y.Easy
    ), a.stability = this.algorithm.next_recall_stability(
      s,
      i,
      c,
      Y.Easy
    );
  }
  /**
   * Review/New next_interval
   */
  next_interval(t, r, n, a, s) {
    let i, c, d, l;
    i = this.algorithm.next_interval(
      t.stability,
      s
    ), c = this.algorithm.next_interval(r.stability, s), d = this.algorithm.next_interval(n.stability, s), l = this.algorithm.next_interval(a.stability, s), i = Math.min(i, c), c = Math.max(c, i + 1), d = Math.max(d, c + 1), l = Math.max(l, d + 1), t.scheduled_days = i, t.due = ot(this.review_time, i, !0), r.scheduled_days = c, r.due = ot(this.review_time, c, !0), n.scheduled_days = d, n.due = ot(this.review_time, d, !0), a.scheduled_days = l, a.due = ot(this.review_time, l, !0);
  }
  /**
   * Review/New next_state
   */
  next_state(t, r, n, a) {
    t.state = U.Review, t.learning_steps = 0, r.state = U.Review, r.learning_steps = 0, n.state = U.Review, n.learning_steps = 0, a.state = U.Review, a.learning_steps = 0;
  }
  update_next(t, r, n, a) {
    const s = {
      card: t,
      log: this.buildLog(Y.Again)
    }, i = {
      card: r,
      log: super.buildLog(Y.Hard)
    }, c = {
      card: n,
      log: super.buildLog(Y.Good)
    }, d = {
      card: a,
      log: super.buildLog(Y.Easy)
    };
    this.next.set(Y.Again, s), this.next.set(Y.Hard, i), this.next.set(Y.Good, c), this.next.set(Y.Easy, d);
  }
}
class Kc {
  /**
   * Creates an instance of the `Reschedule` class.
   * @param fsrs - An instance of the FSRS class used for scheduling.
   */
  constructor(t) {
    me(this, "fsrs");
    this.fsrs = t;
  }
  /**
   * Replays a review for a card and determines the next review date based on the given rating.
   * @param card - The card being reviewed.
   * @param reviewed - The date the card was reviewed.
   * @param rating - The grade given to the card during the review.
   * @returns A `RecordLogItem` containing the updated card and review log.
   */
  replay(t, r, n) {
    return this.fsrs.next(t, r, n);
  }
  /**
   * Processes a manual review for a card, allowing for custom state, stability, difficulty, and due date.
   * @param card - The card being reviewed.
   * @param state - The state of the card after the review.
   * @param reviewed - The date the card was reviewed.
   * @param elapsed_days - The number of days since the last review.
   * @param stability - (Optional) The stability of the card.
   * @param difficulty - (Optional) The difficulty of the card.
   * @param due - (Optional) The due date for the next review.
   * @returns A `RecordLogItem` containing the updated card and review log.
   * @throws Will throw an error if the state or due date is not provided when required.
   */
  handleManualRating(t, r, n, a, s, i, c) {
    if (typeof r > "u")
      throw new Error("reschedule: state is required for manual rating");
    let d, l;
    if (r === U.New)
      d = {
        rating: Y.Manual,
        state: r,
        due: c ?? n,
        stability: t.stability,
        difficulty: t.difficulty,
        elapsed_days: a,
        last_elapsed_days: t.elapsed_days,
        scheduled_days: t.scheduled_days,
        learning_steps: t.learning_steps,
        review: n
      }, l = Lr(n), l.last_review = n;
    else {
      if (typeof c > "u")
        throw new Error("reschedule: due is required for manual rating");
      const x = cr(c, n, "days");
      d = {
        rating: Y.Manual,
        state: t.state,
        due: t.last_review || t.due,
        stability: t.stability,
        difficulty: t.difficulty,
        elapsed_days: a,
        last_elapsed_days: t.elapsed_days,
        scheduled_days: t.scheduled_days,
        learning_steps: t.learning_steps,
        review: n
      }, l = {
        ...t,
        state: r,
        due: c,
        last_review: n,
        stability: s || t.stability,
        difficulty: i || t.difficulty,
        elapsed_days: a,
        scheduled_days: x,
        reps: t.reps + 1
      };
    }
    return { card: l, log: d };
  }
  /**
   * Reschedules a card based on its review history.
   *
   * @param current_card - The card to be rescheduled.
   * @param reviews - An array of review history objects.
   * @returns An array of record log items representing the rescheduling process.
   */
  reschedule(t, r) {
    const n = [];
    let a = Lr(t.due);
    for (const s of r) {
      let i;
      if (s.review = re.time(s.review), s.rating === Y.Manual) {
        let c = 0;
        a.state !== U.New && a.last_review && (c = cr(s.review, a.last_review, "days")), i = this.handleManualRating(
          a,
          s.state,
          s.review,
          c,
          s.stability,
          s.difficulty,
          s.due ? re.time(s.due) : void 0
        );
      } else
        i = this.replay(a, s.review, s.rating);
      n.push(i), a = i.card;
    }
    return n;
  }
  calculateManualRecord(t, r, n, a) {
    if (!n)
      return null;
    const { card: s, log: i } = n, c = re.card(t);
    return c.due.getTime() === s.due.getTime() ? null : (c.scheduled_days = cr(
      s.due,
      c.due,
      "days"
    ), this.handleManualRating(
      c,
      s.state,
      re.time(r),
      i.elapsed_days,
      a ? s.stability : void 0,
      a ? s.difficulty : void 0,
      s.due
    ));
  }
}
class Uc extends qc {
  constructor(r) {
    super(r);
    me(this, "strategyHandler", /* @__PURE__ */ new Map());
    me(this, "Scheduler");
    const { enable_short_term: n } = this.parameters;
    this.Scheduler = n ? Ta : Ea;
  }
  params_handler_proxy() {
    const r = this;
    return {
      set: function(n, a, s) {
        return a === "request_retention" && Number.isFinite(s) ? r.intervalModifier = r.calculate_interval_modifier(
          Number(s)
        ) : a === "enable_short_term" ? r.Scheduler = s === !0 ? Ta : Ea : a === "w" && (s = Zn(
          s,
          n.relearning_steps.length,
          n.enable_short_term
        ), r.forgetting_curve = Ln.bind(this, s), r.intervalModifier = r.calculate_interval_modifier(
          Number(n.request_retention)
        )), Reflect.set(n, a, s), !0;
      }
    };
  }
  useStrategy(r, n) {
    return this.strategyHandler.set(r, n), this;
  }
  clearStrategy(r) {
    return r ? this.strategyHandler.delete(r) : this.strategyHandler.clear(), this;
  }
  getScheduler(r, n) {
    const s = this.strategyHandler.get(
      No.SCHEDULER
    ) || this.Scheduler;
    return new s(r, n, this, this.strategyHandler);
  }
  /**
   * Display the collection of cards and logs for the four scenarios after scheduling the card at the current time.
   * @param card Card to be processed
   * @param now Current time or scheduled time
   * @param afterHandler Convert the result to another type. (Optional)
   * @example
   * ```typescript
   * const card: Card = createEmptyCard(new Date());
   * const f = fsrs();
   * const recordLog = f.repeat(card, new Date());
   * ```
   * @example
   * ```typescript
   * interface RevLogUnchecked
   *   extends Omit<ReviewLog, "due" | "review" | "state" | "rating"> {
   *   cid: string;
   *   due: Date | number;
   *   state: StateType;
   *   review: Date | number;
   *   rating: RatingType;
   * }
   *
   * interface RepeatRecordLog {
   *   card: CardUnChecked; //see method: createEmptyCard
   *   log: RevLogUnchecked;
   * }
   *
   * function repeatAfterHandler(recordLog: RecordLog) {
   *     const record: { [key in Grade]: RepeatRecordLog } = {} as {
   *       [key in Grade]: RepeatRecordLog;
   *     };
   *     for (const grade of Grades) {
   *       record[grade] = {
   *         card: {
   *           ...(recordLog[grade].card as Card & { cid: string }),
   *           due: recordLog[grade].card.due.getTime(),
   *           state: State[recordLog[grade].card.state] as StateType,
   *           last_review: recordLog[grade].card.last_review
   *             ? recordLog[grade].card.last_review!.getTime()
   *             : null,
   *         },
   *         log: {
   *           ...recordLog[grade].log,
   *           cid: (recordLog[grade].card as Card & { cid: string }).cid,
   *           due: recordLog[grade].log.due.getTime(),
   *           review: recordLog[grade].log.review.getTime(),
   *           state: State[recordLog[grade].log.state] as StateType,
   *           rating: Rating[recordLog[grade].log.rating] as RatingType,
   *         },
   *       };
   *     }
   *     return record;
   * }
   * const card: Card = createEmptyCard(new Date(), cardAfterHandler); //see method:  createEmptyCard
   * const f = fsrs();
   * const recordLog = f.repeat(card, new Date(), repeatAfterHandler);
   * ```
   */
  repeat(r, n, a) {
    const i = this.getScheduler(r, n).preview();
    return a && typeof a == "function" ? a(i) : i;
  }
  /**
   * Display the collection of cards and logs for the card scheduled at the current time, after applying a specific grade rating.
   * @param card Card to be processed
   * @param now Current time or scheduled time
   * @param grade Rating of the review (Again, Hard, Good, Easy)
   * @param afterHandler Convert the result to another type. (Optional)
   * @example
   * ```typescript
   * const card: Card = createEmptyCard(new Date());
   * const f = fsrs();
   * const recordLogItem = f.next(card, new Date(), Rating.Again);
   * ```
   * @example
   * ```typescript
   * interface RevLogUnchecked
   *   extends Omit<ReviewLog, "due" | "review" | "state" | "rating"> {
   *   cid: string;
   *   due: Date | number;
   *   state: StateType;
   *   review: Date | number;
   *   rating: RatingType;
   * }
   *
   * interface NextRecordLog {
   *   card: CardUnChecked; //see method: createEmptyCard
   *   log: RevLogUnchecked;
   * }
   *
  function nextAfterHandler(recordLogItem: RecordLogItem) {
    const recordItem = {
      card: {
        ...(recordLogItem.card as Card & { cid: string }),
        due: recordLogItem.card.due.getTime(),
        state: State[recordLogItem.card.state] as StateType,
        last_review: recordLogItem.card.last_review
          ? recordLogItem.card.last_review!.getTime()
          : null,
      },
      log: {
        ...recordLogItem.log,
        cid: (recordLogItem.card as Card & { cid: string }).cid,
        due: recordLogItem.log.due.getTime(),
        review: recordLogItem.log.review.getTime(),
        state: State[recordLogItem.log.state] as StateType,
        rating: Rating[recordLogItem.log.rating] as RatingType,
      },
    };
    return recordItem
  }
   * const card: Card = createEmptyCard(new Date(), cardAfterHandler); //see method:  createEmptyCard
   * const f = fsrs();
   * const recordLogItem = f.repeat(card, new Date(), Rating.Again, nextAfterHandler);
   * ```
   */
  next(r, n, a, s) {
    const i = this.getScheduler(r, n), c = re.rating(a);
    if (c === Y.Manual)
      throw new Error("Cannot review a manual rating");
    const d = i.review(c);
    return s && typeof s == "function" ? s(d) : d;
  }
  /**
   * Get the retrievability of the card
   * @param card  Card to be processed
   * @param now  Current time or scheduled time
   * @param format  default:true , Convert the result to another type. (Optional)
   * @returns  The retrievability of the card,if format is true, the result is a string, otherwise it is a number
   */
  get_retrievability(r, n, a = !0) {
    const s = re.card(r);
    n = n ? re.time(n) : /* @__PURE__ */ new Date();
    const i = s.state !== U.New ? Math.max(cr(n, s.last_review, "days"), 0) : 0, c = s.state !== U.New ? this.forgetting_curve(i, +s.stability.toFixed(8)) : 0;
    return a ? `${(c * 100).toFixed(2)}%` : c;
  }
  /**
   *
   * @param card Card to be processed
   * @param log last review log
   * @param afterHandler Convert the result to another type. (Optional)
   * @example
   * ```typescript
   * const now = new Date();
   * const f = fsrs();
   * const emptyCardFormAfterHandler = createEmptyCard(now);
   * const repeatFormAfterHandler = f.repeat(emptyCardFormAfterHandler, now);
   * const { card, log } = repeatFormAfterHandler[Rating.Hard];
   * const rollbackFromAfterHandler = f.rollback(card, log);
   * ```
   *
   * @example
   * ```typescript
   * const now = new Date();
   * const f = fsrs();
   * const emptyCardFormAfterHandler = createEmptyCard(now, cardAfterHandler);  //see method: createEmptyCard
   * const repeatFormAfterHandler = f.repeat(emptyCardFormAfterHandler, now, repeatAfterHandler); //see method: fsrs.repeat()
   * const { card, log } = repeatFormAfterHandler[Rating.Hard];
   * const rollbackFromAfterHandler = f.rollback(card, log, cardAfterHandler);
   * ```
   */
  rollback(r, n, a) {
    const s = re.card(r), i = re.review_log(n);
    if (i.rating === Y.Manual)
      throw new Error("Cannot rollback a manual rating");
    let c, d, l;
    switch (i.state) {
      case U.New:
        c = i.due, d = void 0, l = 0;
        break;
      case U.Learning:
      case U.Relearning:
      case U.Review:
        c = i.review, d = i.due, l = s.lapses - (i.rating === Y.Again && i.state === U.Review ? 1 : 0);
        break;
    }
    const x = {
      ...s,
      due: c,
      stability: i.stability,
      difficulty: i.difficulty,
      elapsed_days: i.last_elapsed_days,
      scheduled_days: i.scheduled_days,
      reps: Math.max(0, s.reps - 1),
      lapses: Math.max(0, l),
      learning_steps: i.learning_steps,
      state: i.state,
      last_review: d
    };
    return a && typeof a == "function" ? a(x) : x;
  }
  /**
   *
   * @param card Card to be processed
   * @param now Current time or scheduled time
   * @param reset_count Should the review count information(reps,lapses) be reset. (Optional)
   * @param afterHandler Convert the result to another type. (Optional)
   * @example
   * ```typescript
   * const now = new Date();
   * const f = fsrs();
   * const emptyCard = createEmptyCard(now);
   * const scheduling_cards = f.repeat(emptyCard, now);
   * const { card, log } = scheduling_cards[Rating.Hard];
   * const forgetCard = f.forget(card, new Date(), true);
   * ```
   *
   * @example
   * ```typescript
   * interface RepeatRecordLog {
   *   card: CardUnChecked; //see method: createEmptyCard
   *   log: RevLogUnchecked; //see method: fsrs.repeat()
   * }
   *
   * function forgetAfterHandler(recordLogItem: RecordLogItem): RepeatRecordLog {
   *     return {
   *       card: {
   *         ...(recordLogItem.card as Card & { cid: string }),
   *         due: recordLogItem.card.due.getTime(),
   *         state: State[recordLogItem.card.state] as StateType,
   *         last_review: recordLogItem.card.last_review
   *           ? recordLogItem.card.last_review!.getTime()
   *           : null,
   *       },
   *       log: {
   *         ...recordLogItem.log,
   *         cid: (recordLogItem.card as Card & { cid: string }).cid,
   *         due: recordLogItem.log.due.getTime(),
   *         review: recordLogItem.log.review.getTime(),
   *         state: State[recordLogItem.log.state] as StateType,
   *         rating: Rating[recordLogItem.log.rating] as RatingType,
   *       },
   *     };
   * }
   * const now = new Date();
   * const f = fsrs();
   * const emptyCardFormAfterHandler = createEmptyCard(now, cardAfterHandler); //see method:  createEmptyCard
   * const repeatFormAfterHandler = f.repeat(emptyCardFormAfterHandler, now, repeatAfterHandler); //see method: fsrs.repeat()
   * const { card } = repeatFormAfterHandler[Rating.Hard];
   * const forgetFromAfterHandler = f.forget(card, date_scheduler(now, 1, true), false, forgetAfterHandler);
   * ```
   */
  forget(r, n, a = !1, s) {
    const i = re.card(r);
    n = re.time(n);
    const c = i.state === U.New ? 0 : cr(n, i.due, "days"), d = {
      rating: Y.Manual,
      state: i.state,
      due: i.due,
      stability: i.stability,
      difficulty: i.difficulty,
      elapsed_days: 0,
      last_elapsed_days: i.elapsed_days,
      scheduled_days: c,
      learning_steps: i.learning_steps,
      review: n
    }, x = { card: {
      ...i,
      due: n,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: a ? 0 : i.reps,
      lapses: a ? 0 : i.lapses,
      learning_steps: 0,
      state: U.New,
      last_review: i.last_review
    }, log: d };
    return s && typeof s == "function" ? s(x) : x;
  }
  /**
   * Reschedules the current card and returns the rescheduled collections and reschedule item.
   *
   * @template T - The type of the record log item.
   * @param {CardInput | Card} current_card - The current card to be rescheduled.
   * @param {Array<FSRSHistory>} reviews - The array of FSRSHistory objects representing the reviews.
   * @param {Partial<RescheduleOptions<T>>} options - The optional reschedule options.
   * @returns {IReschedule<T>} - The rescheduled collections and reschedule item.
   *
   * @example
   * ```typescript
   * const f = fsrs()
   * const grades: Grade[] = [Rating.Good, Rating.Good, Rating.Good, Rating.Good]
   * const reviews_at = [
   *   new Date(2024, 8, 13),
   *   new Date(2024, 8, 13),
   *   new Date(2024, 8, 17),
   *   new Date(2024, 8, 28),
   * ]
   *
   * const reviews: FSRSHistory[] = []
   * for (let i = 0; i < grades.length; i++) {
   *   reviews.push({
   *     rating: grades[i],
   *     review: reviews_at[i],
   *   })
   * }
   *
   * const results_short = scheduler.reschedule(
   *   createEmptyCard(),
   *   reviews,
   *   {
   *     skipManual: false,
   *   }
   * )
   * console.log(results_short)
   * ```
   */
  reschedule(r, n = [], a = {}) {
    const {
      recordLogHandler: s,
      reviewsOrderBy: i,
      skipManual: c = !0,
      now: d = /* @__PURE__ */ new Date(),
      update_memory_state: l = !1
    } = a;
    i && typeof i == "function" && n.sort(i), c && (n = n.filter((y) => y.rating !== Y.Manual));
    const x = new Kc(this), u = x.reschedule(
      a.first_card || Lr(),
      n
    ), f = u.length, p = re.card(r), g = x.calculateManualRecord(
      p,
      d,
      f ? u[f - 1] : void 0,
      l
    );
    return s && typeof s == "function" ? {
      collections: u.map(s),
      reschedule_item: g ? s(g) : null
    } : {
      collections: u,
      reschedule_item: g
    };
  }
}
const Yr = "0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542", Ws = 30, Hs = 200, pr = 0.9, xr = 36500, Vc = {
  "review.disableNotifications": {
    label: "关闭通知提醒",
    type: "boolean",
    defaultValue: !1,
    description: "开启后不显示任何 SRS 相关的通知提醒（评分、创建卡片等）"
  },
  "review.newCardsPerDay": {
    label: "每日新卡上限",
    type: "number",
    defaultValue: Ws,
    description: "每天最多学习的新卡数量"
  },
  "review.reviewCardsPerDay": {
    label: "每日复习卡上限",
    type: "number",
    defaultValue: Hs,
    description: "每天最多复习的旧卡数量"
  },
  "review.fsrsWeights": {
    label: "FSRS v6 算法权重",
    type: "string",
    defaultValue: Yr,
    description: "FSRS v6 算法权重参数（21个逗号分隔的数字）。默认值为 ts-fsrs 官方默认值，如需调整请使用 FSRS 优化器计算"
  },
  "review.fsrsRequestRetention": {
    label: "FSRS 目标记忆保留率",
    type: "number",
    defaultValue: pr,
    description: "期望的记忆保留率（0.7-0.99），值越高复习频率越高。推荐 0.9"
  },
  "review.fsrsMaximumInterval": {
    label: "FSRS 最大间隔天数",
    type: "number",
    defaultValue: xr,
    description: "卡片复习的最大间隔天数（默认 36500 天，约 100 年）"
  }
};
function Gc(e) {
  var r;
  const t = (r = orca.state.plugins[e]) == null ? void 0 : r.settings;
  return {
    disableNotifications: (t == null ? void 0 : t["review.disableNotifications"]) ?? !1,
    newCardsPerDay: (t == null ? void 0 : t["review.newCardsPerDay"]) ?? Ws,
    reviewCardsPerDay: (t == null ? void 0 : t["review.reviewCardsPerDay"]) ?? Hs,
    fsrsWeights: (t == null ? void 0 : t["review.fsrsWeights"]) ?? Yr,
    fsrsRequestRetention: (t == null ? void 0 : t["review.fsrsRequestRetention"]) ?? pr,
    fsrsMaximumInterval: (t == null ? void 0 : t["review.fsrsMaximumInterval"]) ?? xr
  };
}
function Ns(e) {
  try {
    const t = e.split(",").map((r) => parseFloat(r.trim()));
    if (t.length < 19 || t.length > 21 || t.some((r) => isNaN(r))) {
      console.warn("[FSRS] 权重参数格式错误，需要 19-21 个有效数字");
      return;
    }
    return t;
  } catch {
    return;
  }
}
function Nt(e, t, r, n) {
  Gc(e).disableNotifications || orca.notify(t, r, n);
}
let ao = {
  weightsStr: Yr,
  requestRetention: pr,
  maximumInterval: xr
};
const Ys = (e, t = pr, r = xr) => {
  const n = {
    request_retention: t,
    maximum_interval: r
  };
  return e && e.length >= 19 && (n.w = e), new Uc(Pn(n));
}, Jc = Ns(Yr);
let qs = Ys(Jc, pr, xr);
const Qc = (e, t, r) => {
  if (e === ao.weightsStr && t === ao.requestRetention && r === ao.maximumInterval)
    return;
  const n = Ns(e);
  qs = Ys(n, t, r), ao = { weightsStr: e, requestRetention: t, maximumInterval: r }, console.log("[FSRS] 已更新算法参数", { requestRetention: t, maximumInterval: r });
}, Xc = (e) => {
  var t;
  if (e) {
    const r = (t = orca.state.plugins[e]) == null ? void 0 : t.settings, n = (r == null ? void 0 : r["review.fsrsWeights"]) ?? Yr, a = (r == null ? void 0 : r["review.fsrsRequestRetention"]) ?? pr, s = (r == null ? void 0 : r["review.fsrsMaximumInterval"]) ?? xr;
    Qc(n, a, s);
  }
  return qs;
}, Zc = {
  again: Y.Again,
  hard: Y.Hard,
  good: Y.Good,
  easy: Y.Easy
}, qo = () => /* @__PURE__ */ new Date(), el = (e, t) => {
  const r = Lr(t);
  return e ? {
    ...r,
    stability: e.stability ?? r.stability,
    difficulty: e.difficulty ?? r.difficulty,
    due: e.due ?? r.due,
    last_review: e.lastReviewed ?? r.last_review,
    scheduled_days: e.interval ?? r.scheduled_days,
    reps: e.reps ?? r.reps,
    lapses: e.lapses ?? r.lapses,
    // 使用保存的 FSRS 状态，如果没有则根据 reps 推断
    // 注意：必须保留 Learning/Relearning 状态，否则间隔计算会出错
    state: e.state ?? (e.reps > 0 ? U.Review : U.New)
  } : r;
}, tl = (e, t, r) => ({
  stability: e.stability,
  // 记忆稳定度，越高遗忘越慢
  difficulty: e.difficulty,
  // 记忆难度，Again/Hard 提升，Easy 降低
  interval: e.scheduled_days,
  // 下次间隔天数（FSRS 计算的 scheduled_days）
  due: e.due,
  // 下次到期时间
  lastReviewed: (t == null ? void 0 : t.review) ?? e.last_review ?? null,
  // 最近复习时间
  reps: e.reps,
  // 累计复习次数
  lapses: e.lapses,
  // 遗忘次数（Again 增加）
  state: e.state,
  // FSRS 内部状态（New/Learning/Review/Relearning）
  resets: r ?? 0
  // 重置次数
}), Et = (e = qo()) => {
  const t = Lr(e);
  return tl(t, null);
}, qr = (e, t, r = qo(), n) => {
  const a = Xc(n), s = el(e, r), i = a.next(s, r, Zc[t]);
  return { state: {
    stability: i.card.stability,
    // 记忆稳定度，评分越高增长越快
    difficulty: i.card.difficulty,
    // 记忆难度，Again/Hard 会调高，Easy 会降低
    interval: i.card.scheduled_days,
    // 下次间隔天数，已包含 FSRS 的遗忘曲线与 fuzz
    due: i.card.due,
    // 具体下次到期时间（now + interval）
    lastReviewed: i.log.review,
    // 本次复习时间
    reps: i.card.reps,
    // 总复习次数（每次评分 +1）
    lapses: i.card.lapses,
    // 遗忘次数（Again 会累计）
    state: i.card.state
    // 当前 FSRS 状态（New/Learning/Review/Relearning）
  }, log: i.log };
}, Ko = (e, t = qo(), r) => {
  const n = ["again", "hard", "good", "easy"], a = {};
  for (const s of n) {
    const { state: i } = qr(e, s, t, r), c = i.due.getTime() - t.getTime();
    a[s] = Math.max(0, c);
  }
  return a;
}, Be = (e) => {
  const t = e / 6e4, r = e / (1e3 * 60 * 60), n = e / (1e3 * 60 * 60 * 24);
  return t < 1 ? "1分钟内" : t < 60 ? `${Math.round(t)}分钟后` : r < 24 ? `${Math.round(r)}小时后` : n < 30 ? `${Math.round(n)}天后` : n < 365 ? `${Math.round(n / 30)}个月后` : `${(n / 365).toFixed(1)}年后`;
}, Se = (e) => {
  const t = e.getMonth() + 1, r = e.getDate();
  return `${t}-${r}`;
}, Kr = (e, t = qo(), r) => {
  const n = ["again", "hard", "good", "easy"], a = {};
  for (const s of n) {
    const { state: i } = qr(e, s, t, r);
    a[s] = i.due;
  }
  return a;
}, wt = /* @__PURE__ */ new Map(), Qt = async (e) => {
  if (wt.has(e))
    return wt.get(e) ?? void 0;
  const t = await orca.invokeBackend("get-block", e);
  return wt.set(e, t ?? null), t;
}, ea = (e) => {
  wt.delete(e);
}, Uo = (e, t) => {
  var r;
  return !!((r = e == null ? void 0 : e.properties) != null && r.some((n) => n.name.startsWith(t)));
}, at = (e, t) => t !== void 0 ? `srs.c${t}.${e}` : `srs.${e}`, st = (e, t) => `srs.${t}.${e}`, Ks = (e, t) => {
  var r, n;
  return (n = (r = e == null ? void 0 : e.properties) == null ? void 0 : r.find((a) => a.name === t)) == null ? void 0 : n.value;
}, Ye = (e, t) => {
  if (typeof e == "number") return e;
  if (typeof e == "string") {
    const r = Number(e);
    if (Number.isFinite(r)) return r;
  }
  return t;
}, To = (e, t) => {
  if (!e) return t;
  const r = new Date(e);
  return Number.isNaN(r.getTime()) ? t : r;
}, Us = async (e, t) => {
  const n = Et(/* @__PURE__ */ new Date()), a = await Qt(e);
  if (!a)
    return n;
  const s = (i) => Ks(a, at(i, t));
  return {
    stability: Ye(s("stability"), n.stability),
    difficulty: Ye(s("difficulty"), n.difficulty),
    interval: Ye(s("interval"), n.interval),
    due: To(s("due"), n.due) ?? n.due,
    lastReviewed: To(s("lastReviewed"), n.lastReviewed),
    reps: Ye(s("reps"), n.reps),
    lapses: Ye(s("lapses"), n.lapses),
    // 读取保存的 FSRS 状态（0=New, 1=Learning, 2=Review, 3=Relearning）
    state: Ye(s("state"), n.state ?? 0),
    resets: Ye(s("resets"), 0)
  };
}, Vs = async (e, t, r) => {
  const n = [
    { name: at("stability", r), value: t.stability, type: 3 },
    { name: at("difficulty", r), value: t.difficulty, type: 3 },
    { name: at("lastReviewed", r), value: t.lastReviewed ?? null, type: 5 },
    { name: at("interval", r), value: t.interval, type: 3 },
    { name: at("due", r), value: t.due, type: 5 },
    { name: at("reps", r), value: t.reps, type: 3 },
    { name: at("lapses", r), value: t.lapses, type: 3 },
    { name: at("resets", r), value: t.resets ?? 0, type: 3 },
    // 保存 FSRS 状态（0=New, 1=Learning, 2=Review, 3=Relearning）
    { name: at("state", r), value: t.state ?? 0, type: 3 }
  ];
  r === void 0 && n.unshift({ name: "srs.isCard", value: !0, type: 4 }), await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [e],
    n
  ), wt.delete(e);
}, Vt = (e) => Us(e), Vo = (e, t) => Vs(e, t), Ur = async (e, t = /* @__PURE__ */ new Date()) => {
  const r = Et(t);
  return await Vo(e, r), r;
}, Eo = async (e, t, r) => {
  const n = await Vt(e), a = qr(n, t, /* @__PURE__ */ new Date(), r);
  return await Vo(e, a.state), a;
}, Go = (e, t) => Us(e, t), Jo = (e, t, r) => Vs(e, r, t), Vr = async (e, t, r = 0) => {
  const n = /* @__PURE__ */ new Date(), a = new Date(n);
  a.setDate(a.getDate() + r), a.setHours(0, 0, 0, 0);
  const s = Et(a);
  return await Jo(e, t, s), s;
}, Gs = async (e, t, r, n) => {
  const a = await Go(e, t), s = qr(a, r, /* @__PURE__ */ new Date(), n);
  return await Jo(e, t, s.state), s;
}, Qo = async (e, t) => {
  const n = Et(/* @__PURE__ */ new Date()), a = await Qt(e);
  if (!a)
    return n;
  const s = (i) => Ks(a, st(i, t));
  return {
    stability: Ye(s("stability"), n.stability),
    difficulty: Ye(s("difficulty"), n.difficulty),
    interval: Ye(s("interval"), n.interval),
    due: To(s("due"), n.due) ?? n.due,
    lastReviewed: To(s("lastReviewed"), n.lastReviewed),
    reps: Ye(s("reps"), n.reps),
    lapses: Ye(s("lapses"), n.lapses),
    // 读取保存的 FSRS 状态（0=New, 1=Learning, 2=Review, 3=Relearning）
    state: Ye(s("state"), n.state ?? 0),
    resets: Ye(s("resets"), 0)
  };
}, Xo = async (e, t, r) => {
  const n = [
    { name: st("stability", t), value: r.stability, type: 3 },
    { name: st("difficulty", t), value: r.difficulty, type: 3 },
    { name: st("interval", t), value: r.interval, type: 3 },
    { name: st("due", t), value: r.due, type: 5 },
    { name: st("lastReviewed", t), value: r.lastReviewed ?? null, type: 5 },
    { name: st("reps", t), value: r.reps, type: 3 },
    { name: st("lapses", t), value: r.lapses, type: 3 },
    { name: st("resets", t), value: r.resets ?? 0, type: 3 },
    // 保存 FSRS 状态（0=New, 1=Learning, 2=Review, 3=Relearning）
    { name: st("state", t), value: r.state ?? 0, type: 3 }
  ];
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [e],
    n
  ), wt.delete(e);
}, lr = async (e, t, r = 0) => {
  const n = /* @__PURE__ */ new Date(), a = new Date(n);
  a.setDate(a.getDate() + r), a.setHours(0, 0, 0, 0);
  const s = Et(a);
  return await Xo(e, t, s), s;
}, Js = async (e, t, r, n) => {
  const a = await Qo(e, t), s = qr(a, r, /* @__PURE__ */ new Date(), n);
  return await Xo(e, t, s.state), s;
}, Ze = async (e, t = /* @__PURE__ */ new Date()) => {
  const r = await Qt(e);
  return Uo(r, "srs.") ? await Vt(e) : await Ur(e, t);
}, dr = async (e, t) => {
  const r = await Qt(e);
  return Uo(r, "srs.") ? await Vt(e) : await Ur(e, t);
}, ta = async (e, t, r = 0) => {
  const n = await Qt(e), a = `srs.c${t}.`;
  return Uo(n, a) ? await Go(e, t) : await Vr(e, t, r);
}, ra = async (e, t, r = 0) => {
  const n = await Qt(e), a = `srs.${t}.`;
  return Uo(n, a) ? await Qo(e, t) : await lr(e, t, r);
}, rl = async (e) => {
  const t = await Vt(e), a = {
    ...Et(/* @__PURE__ */ new Date()),
    resets: (t.resets ?? 0) + 1
  };
  return await Vo(e, a), a;
}, ol = async (e, t) => {
  const r = await Go(e, t), s = {
    ...Et(/* @__PURE__ */ new Date()),
    resets: (r.resets ?? 0) + 1
  };
  return await Jo(e, t, s), s;
}, nl = async (e, t) => {
  const r = await Qo(e, t), s = {
    ...Et(/* @__PURE__ */ new Date()),
    resets: (r.resets ?? 0) + 1
  };
  return await Xo(e, t, s), s;
}, oa = async (e, t = "srs.") => {
  const r = await Qt(e);
  return r != null && r.properties ? r.properties.filter((n) => n.name.startsWith(t)).map((n) => n.name) : [];
}, na = async (e) => {
  const t = await oa(e, "srs.");
  t.length !== 0 && (await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [e],
    t
  ), wt.delete(e));
}, al = async (e, t) => {
  const r = `srs.c${t}.`, n = await oa(e, r);
  n.length !== 0 && (await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [e],
    n
  ), wt.delete(e));
}, sl = async (e, t) => {
  const r = `srs.${t}.`, n = await oa(e, r);
  n.length !== 0 && (await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [e],
    n
  ), wt.delete(e));
}, On = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  deleteCardSrsData: na,
  deleteClozeCardSrsData: al,
  deleteDirectionCardSrsData: sl,
  ensureCardSrsState: Ze,
  ensureCardSrsStateWithInitialDue: dr,
  ensureClozeSrsState: ta,
  ensureDirectionSrsState: ra,
  invalidateBlockCache: ea,
  loadCardSrsState: Vt,
  loadClozeSrsState: Go,
  loadDirectionSrsState: Qo,
  resetCardSrsState: rl,
  resetClozeSrsState: ol,
  resetDirectionSrsState: nl,
  saveCardSrsState: Vo,
  saveClozeSrsState: Jo,
  saveDirectionSrsState: Xo,
  updateClozeSrsState: Gs,
  updateDirectionSrsState: Js,
  updateSrsState: Eo,
  writeInitialClozeSrsState: Vr,
  writeInitialDirectionSrsState: lr,
  writeInitialSrsState: Ur
}, Symbol.toStringTag, { value: "Module" }));
function Qs(e) {
  if (!e.refs || e.refs.length === 0)
    return "normal";
  const t = e.refs.find(
    (a) => a.type === 2 && // RefType.Property（标签引用）
    ve(a.alias)
    // 标签名称为 "card"（大小写不敏感）
  );
  if (!t || !t.data || t.data.length === 0)
    return "normal";
  const r = t.data.find((a) => a.name === "status");
  if (!r)
    return "normal";
  const n = r.value;
  return Array.isArray(n) ? n.length === 0 || !n[0] || typeof n[0] != "string" ? "normal" : n[0].trim().toLowerCase() === "suspend" ? "suspend" : "normal" : typeof n == "string" && n.trim().toLowerCase() === "suspend" ? "suspend" : "normal";
}
async function il(e) {
  var t;
  console.log(`[SRS] 暂停卡片 #${e}`);
  try {
    const r = orca.state.blocks[e];
    if (!r)
      throw new Error(`找不到块 #${e}`);
    const n = (t = r.refs) == null ? void 0 : t.find(
      (a) => a.type === 2 && ve(a.alias)
    );
    if (!n)
      throw new Error(`块 #${e} 没有 #card 标签`);
    await orca.commands.invokeEditorCommand(
      "core.editor.setRefData",
      null,
      n,
      [{ name: "status", value: "suspend" }]
    ), console.log(`[SRS] 卡片 #${e} 已暂停`);
  } catch (r) {
    throw console.error("[SRS] 暂停卡片失败:", r), r;
  }
}
function cl() {
  const e = /* @__PURE__ */ new Date();
  return e.setDate(e.getDate() + 1), e.setHours(0, 0, 0, 0), e;
}
function ll(e, t) {
  return e !== void 0 ? `srs.c${e}.due` : t !== void 0 ? `srs.${t}.due` : "srs.due";
}
async function dl(e, t, r) {
  const n = t ? `Cloze c${t}` : r ? `Direction ${r}` : "Basic";
  console.log(`[SRS] 推迟 ${n} 卡片 #${e}`);
  try {
    const a = cl(), s = ll(t, r);
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [e],
      [{ name: s, type: 5, value: a }]
    ), ea(e), console.log(`[SRS] 卡片 #${e} 已推迟，明天 ${a.toLocaleDateString()} 再复习`);
  } catch (a) {
    throw console.error("[SRS] 推迟卡片失败:", a), a;
  }
}
const so = {
  Text: 1,
  BlockRefs: 2,
  Number: 3
}, ul = 50, fl = [
  {
    name: "type",
    type: so.Text,
    // 文本类型
    value: ""
    // 留空
  },
  {
    name: "牌组",
    type: so.BlockRefs,
    // 块引用类型
    // 尝试使用 undefined 代替空数组，因为空数组被 Orca 静默忽略
    value: void 0
  },
  {
    name: "status",
    type: so.Text,
    // 文本类型
    value: ""
    // 留空
  },
  {
    name: "priority",
    type: so.Number,
    // 数字类型
    value: ul
  }
];
let xn = !1, Sr = !1;
async function ut(e) {
  var t;
  if (!xn && !Sr) {
    Sr = !0;
    try {
      const r = await orca.invokeBackend("get-block-by-alias", "card");
      if (!r) {
        Sr = !1;
        return;
      }
      const n = new Set(((t = r.properties) == null ? void 0 : t.map((s) => s.name)) || []), a = fl.filter(
        (s) => !n.has(s.name)
      );
      if (a.length === 0) {
        xn = !0, Sr = !1;
        return;
      }
      for (const s of a)
        try {
          await orca.commands.invokeEditorCommand(
            "core.editor.setProperties",
            null,
            [r.id],
            [s]
          );
        } catch (i) {
          console.error(`[${e}] [tagPropertyInit] 属性 "${s.name}" 添加失败:`, i);
        }
      xn = !0;
    } catch (r) {
      console.error(`[${e}] [tagPropertyInit] 初始化失败:`, r);
    } finally {
      Sr = !1;
    }
  }
}
function aa(e, t) {
  if (!e || e.length === 0)
    return 0;
  let r = 0;
  for (const n of e)
    n.t === `${t}.cloze` && typeof n.clozeNumber == "number" && n.clozeNumber > r && (r = n.clozeNumber);
  return r;
}
function Zo(e, t) {
  if (!e || e.length === 0)
    return [];
  const r = /* @__PURE__ */ new Set();
  for (const n of e)
    (n.t === `${t}.cloze` || typeof n.t == "string" && n.t.endsWith(".cloze")) && typeof n.clozeNumber == "number" && r.add(n.clozeNumber);
  return Array.from(r).sort((n, a) => n - a);
}
async function pl(e) {
  const t = [], r = /* @__PURE__ */ new Set();
  async function n(a) {
    var i;
    if (r.has(a)) return;
    r.add(a);
    let s = (i = orca.state.blocks) == null ? void 0 : i[a];
    if (!s) {
      const c = await orca.invokeBackend("get-blocks", [a]);
      c && c.length > 0 && (s = c[0]);
    }
    if (!(!(s != null && s.children) || s.children.length === 0))
      for (const c of s.children)
        t.push(c), await n(c);
  }
  return await n(e), t;
}
async function Xs(e) {
  var r;
  let t = e;
  for (console.log(`[findTableParentBlock] 开始向上遍历，起始块 ID: ${e}`); t; ) {
    let n = (r = orca.state.blocks) == null ? void 0 : r[t];
    if (!n) {
      console.log(`[findTableParentBlock] 从后端获取块数据，块 ID: ${t}`);
      const a = await orca.invokeBackend("get-blocks", [t]);
      a && a.length > 0 && (n = a[0]);
    }
    if (n) {
      if (console.log(`[findTableParentBlock] 检查块 ID: ${t}`), console.log("[findTableParentBlock] 块 _repr:", n._repr), n.properties)
        if (console.log(`[findTableParentBlock] 块 properties 长度: ${Array.isArray(n.properties) ? n.properties.length : "未知"}`), Array.isArray(n.properties))
          for (let a = 0; a < n.properties.length; a++) {
            const s = n.properties[a];
            if (console.log(`[findTableParentBlock] 块 properties[${a}]:`, {
              name: s.name,
              type: s.type,
              value: s.value
            }), s.name === "_repr" && s.value && s.value.type === "table2")
              return console.log(`[findTableParentBlock] 找到表格块，ID: ${t}`), t;
          }
        else
          console.log("[findTableParentBlock] 块 properties 不是数组:", n.properties);
      else
        console.log("[findTableParentBlock] 块 properties: undefined");
      console.log(`[findTableParentBlock] 块父 ID: ${n.parent}`), t = n.parent;
    } else {
      console.log(`[findTableParentBlock] 无法获取块数据，块 ID: ${t}`);
      break;
    }
  }
  return console.log("[findTableParentBlock] 未找到表格块"), null;
}
async function Gr(e, t) {
  var i;
  const r = [], n = await pl(e);
  n.push(e);
  const a = [], s = /* @__PURE__ */ new Map();
  for (const c of n) {
    const d = (i = orca.state.blocks) == null ? void 0 : i[c];
    d ? s.set(c, d) : a.push(c);
  }
  if (a.length > 0) {
    const c = await orca.invokeBackend("get-blocks", a);
    if (c && c.length > 0)
      for (const d of c)
        s.set(d.id, d);
  }
  for (const c of n) {
    const d = s.get(c);
    if (d && d.content)
      for (const l of d.content)
        (l.t === `${t}.cloze` || typeof l.t == "string" && l.t.endsWith(".cloze")) && typeof l.clozeNumber == "number" && r.push({
          number: l.clozeNumber,
          content: l.v || ""
        });
  }
  return r;
}
async function Zs(e, t) {
  const r = await Gr(e, t);
  return r.length === 0 ? 0 : Math.max(...r.map((n) => n.number));
}
async function ei(e, t) {
  const r = await Gr(e, t), n = new Set(r.map((a) => a.number));
  return Array.from(n).sort((a, s) => a - s);
}
function ti(e, t, r, n, a) {
  const s = Math.min(t.anchor.index, t.focus.index);
  let i, c;
  if (t.anchor.index === t.focus.index)
    i = Math.min(t.anchor.offset, t.focus.offset), c = Math.max(t.anchor.offset, t.focus.offset);
  else
    return console.warn(`[${a}] 不支持跨 fragment 的选区`), e;
  const d = [];
  for (let l = 0; l < e.length; l++) {
    const x = e[l];
    if (l === s) {
      const u = x.v || "";
      if (i > 0) {
        const f = u.substring(0, i);
        d.push({
          ...x,
          v: f
        });
      }
      if (d.push({
        t: `${a}.cloze`,
        v: r,
        clozeNumber: n
      }), c < u.length) {
        const f = u.substring(c);
        d.push({
          ...x,
          v: f
        });
      }
    } else
      d.push(x);
  }
  return d;
}
async function xl(e, t) {
  var y, v;
  if (!e || !e.anchor || !e.anchor.blockId)
    return orca.notify("error", "无法获取光标位置"), console.error(`[${t}] 错误：无法获取光标位置`), null;
  const r = e.anchor.blockId, n = orca.state.blocks[r];
  if (!n)
    return orca.notify("error", "未找到当前块"), console.error(`[${t}] 错误：未找到块 #${r}`), null;
  if (e.anchor.blockId !== e.focus.blockId)
    return orca.notify("warn", "请在同一块内选择文本"), null;
  if (e.anchor.offset === e.focus.offset && e.anchor.index === e.focus.index)
    return orca.notify("warn", "请先选择要填空的文本"), null;
  if (e.anchor.index !== e.focus.index)
    return orca.notify("warn", "请在同一段文本内选择（不支持跨样式选区）"), null;
  if (!n.content || n.content.length === 0)
    return orca.notify("warn", "块内容为空"), null;
  const a = e.anchor.index, s = n.content[a];
  if (!s || !s.v)
    return orca.notify("warn", "无法获取选中的文本片段"), null;
  const i = Math.min(e.anchor.offset, e.focus.offset), c = Math.max(e.anchor.offset, e.focus.offset), d = s.v.substring(i, c);
  if (!d || d.trim() === "")
    return orca.notify("warn", "请先选择要填空的文本"), null;
  const l = await Xs(r), x = !!l, u = x ? l : r, f = x ? "bg" : "cloze";
  let p = aa(n.content, t);
  if (p === 0)
    try {
      const h = await Zs(u, t);
      h > 0 && (p = h);
    } catch (h) {
      console.warn(`[${t}] 尝试从块树提取 cloze 编号失败:`, h);
    }
  const g = p + 1;
  try {
    const h = ti(
      n.content,
      e,
      d,
      g,
      t
    );
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      e,
      [
        {
          id: r,
          content: h
        }
      ],
      !1
    );
    const S = orca.state.blocks[u];
    if ((y = S.refs) == null ? void 0 : y.some(
      (k) => k.type === 2 && ve(k.alias)
    ))
      try {
        const k = (v = S.refs) == null ? void 0 : v.find(
          (C) => C.type === 2 && ve(C.alias)
        );
        k && (await orca.commands.invokeEditorCommand(
          "core.editor.setRefData",
          null,
          k,
          [{ name: "type", value: f }]
        ), console.log(`[${t}] 已更新 #card 标签的 type=${f}`));
      } catch (k) {
        console.error(`[${t}] 更新 #card 标签属性失败:`, k);
      }
    else
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          null,
          u,
          "card",
          [
            { name: "type", value: f },
            { name: "牌组", value: [] },
            // 空数组表示未设置牌组
            { name: "status", value: "" }
            // 空字符串表示正常状态
          ]
        ), console.log(`[${t}] 已添加 #card 标签并设置 type=${f}`), await ut(t);
      } catch (k) {
        console.error(`[${t}] 添加 #card 标签失败:`, k);
      }
    try {
      const k = orca.state.blocks[u];
      k._repr = {
        type: "srs.cloze-card",
        front: n.text || "",
        back: "（填空卡）",
        cardType: f
      };
      const C = Zo(n.content, t);
      await orca.commands.invokeEditorCommand(
        "core.editor.setProperties",
        null,
        [u],
        [{ name: "srs.isCard", value: !0, type: 4 }]
      );
      for (let P = 0; P < C.length; P++) {
        const E = C[P], O = E - 1;
        await Vr(u, E, O);
      }
    } catch (k) {
      console.error(`[${t}] 自动加入复习队列失败:`, k);
    }
    return orca.notify(
      "success",
      `已创建填空 c${g}: "${d}"`,
      { title: "Cloze" }
    ), { blockId: r, clozeNumber: g };
  } catch (h) {
    return console.error(`[${t}] 创建 cloze 失败:`, h), orca.notify("error", `创建 cloze 失败: ${h}`, { title: "Cloze" }), null;
  }
}
async function gl(e, t) {
  var y, v;
  if (!e || !e.anchor || !e.anchor.blockId)
    return orca.notify("error", "无法获取光标位置"), console.error(`[${t}] 错误：无法获取光标位置`), null;
  const r = e.anchor.blockId, n = orca.state.blocks[r];
  if (!n)
    return orca.notify("error", "未找到当前块"), console.error(`[${t}] 错误：未找到块 #${r}`), null;
  if (e.anchor.blockId !== e.focus.blockId)
    return orca.notify("warn", "请在同一块内选择文本"), null;
  if (e.anchor.offset === e.focus.offset && e.anchor.index === e.focus.index)
    return orca.notify("warn", "请先选择要填空的文本"), null;
  if (e.anchor.index !== e.focus.index)
    return orca.notify("warn", "请在同一段文本内选择（不支持跨样式选区）"), null;
  if (!n.content || n.content.length === 0)
    return orca.notify("warn", "块内容为空"), null;
  const a = e.anchor.index, s = n.content[a];
  if (!s || !s.v)
    return orca.notify("warn", "无法获取选中的文本片段"), null;
  const i = Math.min(e.anchor.offset, e.focus.offset), c = Math.max(e.anchor.offset, e.focus.offset), d = s.v.substring(i, c);
  if (!d || d.trim() === "")
    return orca.notify("warn", "请先选择要填空的文本"), null;
  const l = await Xs(r), x = !!l, u = x ? l : r, f = x ? "bg" : "cloze";
  let p = aa(n.content, t);
  if (p === 0)
    try {
      const h = await Zs(u, t);
      h > 0 && (p = h);
    } catch (h) {
      console.warn(`[${t}] 尝试从块树提取 cloze 编号失败:`, h);
    }
  const g = p > 0 ? p : 1;
  try {
    const h = ti(
      n.content,
      e,
      d,
      g,
      t
    );
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      e,
      [
        {
          id: r,
          content: h
        }
      ],
      !1
    );
    const S = orca.state.blocks[u];
    if ((y = S.refs) == null ? void 0 : y.some(
      (k) => k.type === 2 && ve(k.alias)
    ))
      try {
        const k = (v = S.refs) == null ? void 0 : v.find(
          (C) => C.type === 2 && ve(C.alias)
        );
        k && (await orca.commands.invokeEditorCommand(
          "core.editor.setRefData",
          null,
          k,
          [{ name: "type", value: f }]
        ), console.log(`[${t}] 已更新 #card 标签的 type=${f}`));
      } catch (k) {
        console.error(`[${t}] 更新 #card 标签属性失败:`, k);
      }
    else
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          null,
          u,
          "card",
          [
            { name: "type", value: f },
            { name: "牌组", value: [] },
            // 空数组表示未设置牌组
            { name: "status", value: "" }
            // 空字符串表示正常状态
          ]
        ), console.log(`[${t}] 已添加 #card 标签到块 ${u} 并设置 type=${f}`), await ut(t);
      } catch (k) {
        console.error(`[${t}] 添加 #card 标签失败:`, k);
      }
    try {
      const k = orca.state.blocks[u];
      k._repr = {
        type: "srs.cloze-card",
        front: n.text || "",
        back: "（填空卡）",
        cardType: f
      };
      const C = Zo(n.content, t);
      await orca.commands.invokeEditorCommand(
        "core.editor.setProperties",
        null,
        [u],
        [{ name: "srs.isCard", value: !0, type: 4 }]
      );
      for (let P = 0; P < C.length; P++) {
        const E = C[P], O = E - 1;
        await Vr(u, E, O);
      }
    } catch (k) {
      console.error(`[${t}] 自动加入复习队列失败:`, k);
    }
    return orca.notify(
      "success",
      `已创建同序填空 c${g}: "${d}"`,
      { title: "Cloze" }
    ), { blockId: r, clozeNumber: g };
  } catch (h) {
    return console.error(`[${t}] 创建同序 cloze 失败:`, h), orca.notify("error", `创建同序 cloze 失败: ${h}`, { title: "Cloze" }), null;
  }
}
async function hl(e, t) {
  if (!e || !e.anchor || !e.anchor.blockId)
    return orca.notify("error", "无法获取光标位置"), console.error(`[${t}] 错误：无法获取光标位置`), null;
  const r = e.anchor.blockId, n = orca.state.blocks[r];
  if (!n)
    return orca.notify("error", "未找到当前块"), console.error(`[${t}] 错误：未找到块 #${r}`), null;
  if (!n.content || n.content.length === 0)
    return orca.notify("warn", "块内容为空"), null;
  try {
    const a = [];
    return n.content.forEach((i, c) => {
      i.t === `${t}.cloze` || typeof i.t == "string" && i.t.endsWith(".cloze") ? a.push({
        t: "t",
        v: i.v || ""
      }) : a.push(i);
    }), JSON.stringify(a) !== JSON.stringify(n.content) ? (await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      e,
      [
        {
          id: r,
          content: a
        }
      ],
      !1
    ), orca.notify(
      "success",
      "已清除挖空格式",
      { title: "Cloze" }
    ), { blockId: r }) : (orca.notify("info", "未找到需要清除的挖空格式", { title: "Cloze" }), null);
  } catch (a) {
    return console.error(`[${t}] 清除挖空格式失败:`, a), orca.notify("error", `清除挖空格式失败: ${a}`, { title: "Cloze" }), null;
  }
}
const ri = {
  forward: "→",
  backward: "←",
  bidirectional: "↔"
};
async function _a(e, t, r) {
  var g, y, v, h, S;
  if (!((g = e == null ? void 0 : e.anchor) != null && g.blockId))
    return orca.notify("error", "无法获取光标位置"), null;
  const n = e.anchor.blockId, a = orca.state.blocks[n];
  if (!a)
    return orca.notify("error", "未找到当前块"), null;
  if ((y = a.content) == null ? void 0 : y.some(
    ($) => $.t === `${r}.direction`
  ))
    return orca.notify("warn", "当前块已有方向标记，请点击箭头切换方向"), null;
  if ((v = a.content) == null ? void 0 : v.some(($) => $.t === `${r}.cloze`))
    return orca.notify("warn", "方向卡暂不支持与填空卡混用"), null;
  const c = e.anchor.offset, d = a.text || "", l = d.substring(0, c).trim(), x = d.substring(c).trim();
  if (!l)
    return orca.notify("warn", "方向标记左侧需要有内容"), null;
  const u = ri[t], f = [
    { t: "t", v: l + " " },
    {
      t: `${r}.direction`,
      v: u,
      direction: t
    },
    { t: "t", v: " " + x }
  ], p = a.content ? [...a.content] : void 0;
  try {
    if (await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      e,
      [{ id: n, content: f }],
      !1
    ), !((h = a.refs) == null ? void 0 : h.some(
      (C) => C.type === 2 && ve(C.alias)
    )))
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        e,
        n,
        "card",
        [
          { name: "type", value: "direction" },
          { name: "牌组", value: [] },
          // 空数组表示未设置牌组
          { name: "status", value: "" }
          // 空字符串表示正常状态
        ]
      ), await ut(r);
    else {
      const C = (S = a.refs) == null ? void 0 : S.find(
        (P) => P.type === 2 && ve(P.alias)
      );
      C && await orca.commands.invokeEditorCommand(
        "core.editor.setRefData",
        null,
        C,
        [{ name: "type", value: "direction" }]
      );
    }
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [n],
      [{ name: "srs.isCard", value: !0, type: 4 }]
    ), t === "bidirectional" ? (await lr(n, "forward", 0), await lr(n, "backward", 1)) : await lr(n, t, 0);
    try {
      const C = {
        ...e,
        isForward: !0,
        anchor: {
          ...e.anchor,
          blockId: n,
          isInline: !0,
          index: 2,
          offset: 1
        },
        focus: {
          ...e.focus,
          blockId: n,
          isInline: !0,
          index: 2,
          offset: 1
        }
      };
      await orca.utils.setSelectionFromCursorData(C);
    } catch (C) {
      console.warn(`[${r}] 设置光标位置失败:`, C);
    }
    const k = t === "forward" ? "正向" : t === "backward" ? "反向" : "双向";
    return orca.notify("success", `已创建${k}卡片`, { title: "方向卡" }), { blockId: n, originalContent: p };
  } catch ($) {
    return console.error(`[${r}] 创建方向卡失败:`, $), orca.notify("error", `创建方向卡失败: ${$}`), null;
  }
}
function yl(e) {
  const t = ["forward", "backward", "bidirectional"], r = t.indexOf(e);
  return t[(r + 1) % t.length];
}
async function ml(e, t, r) {
  var i;
  const n = orca.state.blocks[e];
  if (!(n != null && n.content)) return;
  const a = n.content.map((c) => c.t === `${r}.direction` ? {
    ...c,
    v: ri[t],
    direction: t
  } : c);
  await orca.commands.invokeEditorCommand(
    "core.editor.setBlocksContent",
    null,
    [{ id: e, content: a }],
    !1
  );
  const s = n;
  s._repr && (s._repr = {
    ...s._repr,
    direction: t
  }), t === "bidirectional" && ((i = n.properties) != null && i.some(
    (d) => d.name.startsWith("srs.backward.")
  ) || await lr(e, "backward", 1));
}
function sa(e, t) {
  if (!e || e.length === 0) return null;
  const r = e.findIndex((d) => d.t === `${t}.direction`);
  if (r === -1) return null;
  const n = e[r], a = e.slice(0, r), s = e.slice(r + 1), i = a.map((d) => d.v || "").join("").trim(), c = s.map((d) => d.v || "").join("").trim();
  return {
    direction: n.direction || "forward",
    leftText: i,
    rightText: c
  };
}
function oi(e) {
  return e === "bidirectional" ? ["forward", "backward"] : [e];
}
function ni() {
  const e = /* @__PURE__ */ new Date();
  return e.setHours(0, 0, 0, 0), e;
}
function vl() {
  const e = ni();
  return e.setDate(e.getDate() + 1), e;
}
function Mt(e) {
  const t = e.refs || [];
  if (t.length === 0) return [];
  const r = [], n = /* @__PURE__ */ new Set();
  for (const a of t) {
    if (a.type !== 2) continue;
    const s = (a.alias || "").trim();
    if (!s) continue;
    const i = s.toLowerCase();
    i === "card" || i.startsWith("card/") || n.has(a.to) || (n.add(a.to), r.push({
      name: s,
      blockId: a.to
    }));
  }
  return r;
}
async function ia(e = "srs-plugin") {
  const t = ["card", "Card"];
  let r = [];
  for (const i of t)
    try {
      const c = await orca.invokeBackend("get-blocks-with-tags", [i]);
      c && c.length > 0 && (r = [...r, ...c]);
    } catch (c) {
      console.log(`[${e}] collectSrsBlocks: 查询标签 "${i}" 失败:`, c);
    }
  const n = /* @__PURE__ */ new Map();
  for (const i of r)
    n.set(i.id, i);
  if (r = Array.from(n.values()), r.length === 0) {
    console.log(`[${e}] collectSrsBlocks: 直接查询无结果，使用备用方案`);
    try {
      const i = await orca.invokeBackend("get-all-blocks") || [];
      console.log(`[${e}] collectSrsBlocks: get-all-blocks 返回了 ${i.length} 个块`), r = i.filter((c) => !c.refs || c.refs.length === 0 ? !1 : c.refs.some((l) => l.type !== 2 ? !1 : ve(l.alias))), console.log(`[${e}] collectSrsBlocks: 手动过滤找到 ${r.length} 个带 #card 标签的块`);
    } catch (i) {
      console.error(`[${e}] collectSrsBlocks 备用方案失败:`, i), r = [];
    }
  }
  const a = Object.values(orca.state.blocks || {}).filter((i) => {
    var d;
    if (!i) return !1;
    const c = (d = i._repr) == null ? void 0 : d.type;
    return c === "srs.card" || c === "srs.cloze-card" || c === "srs.direction-card";
  }), s = /* @__PURE__ */ new Map();
  for (const i of [...r || [], ...a])
    i && s.set(i.id, i);
  return Array.from(s.values());
}
async function Xt(e = "srs-plugin") {
  var c, d;
  const t = await ia(e), r = /* @__PURE__ */ new Date(), n = r.getTime(), a = ni(), s = vl(), i = [];
  for (const l of t) {
    if (!Xn(l)) continue;
    if (Qs(l) === "suspend") {
      console.log(`[${e}] collectReviewCards: 跳过已暂停的卡片 #${l.id}`);
      continue;
    }
    const u = je(l);
    if (u === "extracts" || u === "topic")
      continue;
    const f = await Nr(l);
    if (u === "cloze" || u === "bg") {
      let p = Zo(l.content, e), g = [];
      if ((c = l.content) != null && c.some((y) => y.t === `${e}.cloze` || typeof y.t == "string" && y.t.endsWith(".cloze")), u === "bg")
        try {
          console.log(`[${e}] collectReviewCards: 尝试从块树提取 cloze 编号 #${l.id}`);
          const y = await ei(l.id, e);
          console.log(`[${e}] collectReviewCards: 从块树找到 cloze 编号: ${JSON.stringify(y)}`), y.length > 0 && (p = y, g = await Gr(l.id, e), console.log(`[${e}] collectReviewCards: 从块树提取到 cloze 内容: ${JSON.stringify(g)}`));
        } catch (y) {
          console.warn(`[${e}] 尝试从块树提取 cloze 编号失败:`, y);
        }
      if (console.log(`[${e}] collectReviewCards: 发现 ${u} 卡片 #${l.id}`), console.log(`  - block.content 长度: ${((d = l.content) == null ? void 0 : d.length) || 0}`), console.log(`  - 找到 cloze 编号: ${JSON.stringify(p)}`), l.content && l.content.length > 0) {
        const y = l.content.map((v) => v.t);
        console.log(`  - fragment 类型: ${JSON.stringify(y)}`), console.log(`  - block.content 内容: ${JSON.stringify(l.content)}`);
      }
      if (g.length > 0 && console.log(`  - 从块树提取的 cloze 内容: ${JSON.stringify(g)}`), p.length === 0) {
        console.log("  - 跳过：没有找到 cloze 编号");
        continue;
      }
      for (const y of p) {
        const v = await ta(l.id, y, y - 1), h = l.text || "";
        i.push({
          id: l.id,
          front: h,
          back: `（填空 c${y}）`,
          // 填空卡不需要独立的 back
          srs: v,
          isNew: !v.lastReviewed || v.reps === 0,
          deck: f,
          tags: Mt(l),
          clozeNumber: y,
          // 关键：标记当前复习的填空编号
          content: l.content,
          // 保存块内容用于渲染填空
          allClozeContent: g,
          // 保存从块树中提取的 cloze 内容，用于表格 cloze 卡片或 BG 卡片
          cardType: u
          // 保存卡片类型，用于区分 cloze 和 bg 卡片
        });
      }
    } else if (u === "direction") {
      const p = sa(l.content, e);
      if (!p) {
        console.log(`[${e}] collectReviewCards: 块 ${l.id} 无法解析方向卡内容`);
        continue;
      }
      if (!p.leftText || !p.rightText) {
        console.log(
          `[${e}] collectReviewCards: 跳过未完成的方向卡 #${l.id}（left/right 为空）`
        );
        continue;
      }
      const g = oi(p.direction);
      for (let y = 0; y < g.length; y++) {
        const v = g[y], h = await ra(l.id, v, y), S = v === "forward" ? p.leftText : p.rightText, $ = v === "forward" ? p.rightText : p.leftText;
        i.push({
          id: l.id,
          front: S,
          back: $,
          srs: h,
          isNew: !h.lastReviewed || h.reps === 0,
          deck: f,
          tags: Mt(l),
          directionType: v
          // 关键：标记当前复习的方向类型
        });
      }
    } else if (u === "excerpt") {
      const p = l.text || "", g = await Ze(l.id, r);
      i.push({
        id: l.id,
        front: p,
        // 摘录内容作为 front
        back: "",
        // 无 back
        srs: g,
        isNew: !g.lastReviewed || g.reps === 0,
        deck: f,
        tags: Mt(l)
      });
    } else if (u === "choice") {
      const p = l.text || "", g = await Ze(l.id, r);
      if (!(l.children && l.children.length > 0)) {
        console.log(`[${e}] collectReviewCards: 跳过无选项的选择题卡片 #${l.id}`);
        continue;
      }
      i.push({
        id: l.id,
        front: p,
        // 问题作为 front
        back: "",
        // 选择题不需要传统的 back，答案在选项中
        srs: g,
        isNew: !g.lastReviewed || g.reps === 0,
        deck: f,
        tags: Mt(l),
        content: l.content
        // 保存块内容用于渲染
      });
    } else if (u === "list") {
      const p = l.children ?? [];
      if (p.length === 0) {
        console.log(`[${e}] collectReviewCards: 跳过无条目的列表卡 #${l.id}`);
        continue;
      }
      let g = -1, y = null, v = null;
      for (let h = 0; h < p.length; h++) {
        const S = p[h], k = await dr(S, h === 0 ? a : s);
        if (k.due.getTime() <= n) {
          g = h + 1, y = S, v = k;
          break;
        }
      }
      if (!y || !v || g === -1)
        continue;
      i.push({
        id: l.id,
        front: l.text || "",
        back: "",
        srs: v,
        isNew: !v.lastReviewed || v.reps === 0,
        deck: f,
        tags: Mt(l),
        listItemId: y,
        listItemIndex: g,
        listItemIds: p
      });
    } else if (l.children && l.children.length > 0) {
      const { front: g, back: y } = Ho(l), v = await Ze(l.id, r);
      i.push({
        id: l.id,
        front: g,
        back: y,
        srs: v,
        isNew: !v.lastReviewed || v.reps === 0,
        deck: f,
        tags: Mt(l)
        // clozeNumber 和 directionType 都为 undefined（非特殊卡片）
      });
    } else {
      const g = l.text || "", y = await Ze(l.id, r);
      i.push({
        id: l.id,
        front: g,
        // 摘录内容作为 front
        back: "",
        // 无 back
        srs: y,
        isNew: !y.lastReviewed || y.reps === 0,
        deck: f,
        tags: Mt(l)
      });
    }
  }
  return i;
}
function ca(e) {
  const r = (/* @__PURE__ */ new Date()).getTime(), n = e.filter((d) => d.isNew ? !1 : d.srs.due.getTime() <= r), a = e.filter((d) => d.isNew ? d.srs.due.getTime() <= r : !1), s = [];
  let i = 0, c = 0;
  for (; i < n.length || c < a.length; ) {
    for (let d = 0; d < 2 && i < n.length; d++)
      s.push(n[i++]);
    c < a.length && s.push(a[c++]);
  }
  return s;
}
async function ai(e, t = "srs-plugin") {
  const r = ca(e), { collectChildCards: n, getCardKey: a } = await Promise.resolve().then(() => ru), s = [], i = /* @__PURE__ */ new Set(), c = /* @__PURE__ */ new Set();
  async function d(l, x) {
    const u = a(l);
    if (x.has(u))
      return;
    x.add(u), s.push(l), c.add(u);
    const f = await n(l.id, t);
    for (const p of f)
      await d(p, x);
  }
  for (const l of r) {
    const x = a(l);
    if (c.has(x)) {
      console.log(`[${t}] 跳过根卡片 #${l.id}，已作为子卡片出现`);
      continue;
    }
    i.add(x), await d(l, /* @__PURE__ */ new Set());
  }
  return console.log(`[${t}] buildReviewQueueWithChildren: 基础队列 ${r.length} 张，展开后 ${s.length} 张`), s;
}
const za = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  buildReviewQueue: ca,
  buildReviewQueueWithChildren: ai,
  collectReviewCards: Xt,
  collectSrsBlocks: ia
}, Symbol.toStringTag, { value: "Module" }));
async function bl(e) {
  const t = await orca.invokeBackend("get-block", e);
  return t != null && t.properties ? t.properties.filter((r) => r.name.startsWith("srs.")).map((r) => r.name) : [];
}
async function wl(e, t) {
  const r = await bl(e);
  r.length !== 0 && (console.log(`[${t}] 清理块 #${e} 的 ${r.length} 个 SRS 属性`), await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [e],
    r
  ));
}
async function Sl(e) {
  var t;
  console.log(`[${e}] 开始扫描带 #card 标签的块...`);
  try {
    const r = await orca.invokeBackend("get-blocks-with-tags", ["card"]);
    let n = r;
    if (!r || r.length === 0) {
      console.log(`[${e}] 直接查询 #card 标签无结果，尝试获取所有块并过滤`);
      try {
        const c = await orca.invokeBackend("get-all-blocks") || [];
        console.log(`[${e}] get-all-blocks 返回了 ${c.length} 个块`);
        const d = ["card"];
        let l = [];
        for (const x of d)
          try {
            const u = await orca.invokeBackend("get-blocks-with-tags", [x]) || [];
            console.log(`[${e}] 标签 "${x}" 找到 ${u.length} 个块`), l = [...l, ...u];
          } catch (u) {
            console.log(`[${e}] 查询标签 "${x}" 失败:`, u);
          }
        l.length > 0 ? (n = l, console.log(`[${e}] 多标签查询找到 ${n.length} 个带 #card 标签的块`)) : (n = c.filter((x) => !x.refs || x.refs.length === 0 ? !1 : x.refs.some((f) => {
          if (f.type !== 2)
            return !1;
          const p = f.alias || "";
          return ve(p);
        })), console.log(`[${e}] 手动过滤找到 ${n.length} 个带 #card 标签的块`));
      } catch (c) {
        console.error(`[${e}] 备用方案失败:`, c), n = [];
      }
    }
    if (!r || r.length === 0) {
      orca.notify("info", "没有找到带 #card 标签的块", { title: "SRS 扫描" }), console.log(`[${e}] 未找到任何带 #card 标签的块`);
      return;
    }
    console.log(`[${e}] 找到 ${n.length} 个带 #card 标签的块`);
    let a = 0, s = 0;
    for (const c of n) {
      const d = c, l = je(c);
      if (l === "direction" || l === "list" || l === "extracts" || l === "topic") {
        console.log(`[${e}] 跳过：块 #${c.id} 是 ${l} 卡片（不转换 _repr）`), s++;
        continue;
      }
      let x;
      if (l === "cloze" ? x = "srs.cloze-card" : l === "choice" ? x = "srs.choice-card" : x = "srs.card", ((t = d._repr) == null ? void 0 : t.type) === x) {
        console.log(`[${e}] 跳过：块 #${c.id} 已经是 ${l} 卡片`), s++;
        continue;
      }
      const { front: u, back: f } = Ho(d), p = await Nr(c);
      d._repr = {
        type: x,
        front: u,
        back: f,
        deck: p,
        cardType: l
        // 添加 cardType 字段，方便后续使用
      }, await Ze(c.id), console.log(`[${e}] 已转换：块 #${c.id}`), console.log(`  卡片类型: ${l}`), console.log(`  题目: ${u}`), console.log(`  答案: ${f}`), p && console.log(`  Deck: ${p}`), a++;
    }
    const i = `转换了 ${a} 张卡片${s > 0 ? `，跳过 ${s} 张已有卡片` : ""}`;
    orca.notify("success", i, { title: "SRS 扫描完成" }), console.log(`[${e}] 扫描完成：${i}`);
  } catch (r) {
    console.error(`[${e}] 扫描失败:`, r), orca.notify("error", `扫描失败: ${r}`, { title: "SRS 扫描" });
  }
}
async function Cl(e, t) {
  var p;
  if (!e || !e.anchor || !e.anchor.blockId)
    return orca.notify("error", "无法获取光标位置"), null;
  const r = e.anchor.blockId, n = orca.state.blocks[r];
  if (!n)
    return orca.notify("error", "未找到当前块"), null;
  const a = n._repr ? { ...n._repr } : { type: "text" }, s = n.text || "", i = (p = n.refs) == null ? void 0 : p.some(
    (g) => g.type === 2 && // RefType.Property（标签引用）
    ve(g.alias)
  );
  if (!i)
    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        e,
        r,
        "card",
        [
          { name: "type", value: "basic" },
          { name: "牌组", value: [] },
          // 空数组表示未设置牌组
          { name: "status", value: "" }
          // 空字符串表示正常状态
        ]
      ), await ut(t);
    } catch (g) {
      return console.error(`[${t}] 添加标签失败:`, g), orca.notify("error", `添加标签失败: ${g}`, { title: "SRS" }), null;
    }
  const { front: c, back: d } = Ho(n), l = orca.state.blocks[r], x = je(l);
  let u;
  x === "cloze" ? u = "srs.cloze-card" : x === "choice" ? u = "srs.choice-card" : u = "srs.card", n._repr = {
    type: u,
    front: c,
    back: d,
    cardType: x
  }, i ? await Ze(r) : (await wl(r, t), await Ur(r));
  const f = x === "cloze" ? "填空卡片" : "记忆卡片";
  return orca.notify(
    "success",
    `已添加 #card 标签并转换为 SRS ${f}`,
    { title: "SRS" }
  ), { blockId: r, originalRepr: a, originalText: s };
}
function si() {
  const e = /* @__PURE__ */ new Date();
  return e.setHours(0, 0, 0, 0), e;
}
function kl() {
  const e = si();
  return e.setDate(e.getDate() + 1), e;
}
function jl(e) {
  var t;
  return !!((t = e == null ? void 0 : e.properties) != null && t.some((r) => r.name.startsWith("srs.")));
}
async function Rl(e, t) {
  var d, l, x, u, f;
  if (!((d = e == null ? void 0 : e.anchor) != null && d.blockId))
    return orca.notify("error", "无法获取光标位置"), null;
  const r = e.anchor.blockId, n = (l = orca.state.blocks) == null ? void 0 : l[r];
  if (!n)
    return orca.notify("error", "未找到当前块"), null;
  const a = n.children ?? [], s = (x = n.refs) == null ? void 0 : x.some((p) => p.type === 2 && ve(p.alias));
  try {
    if (!s)
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        e,
        r,
        "card",
        [
          { name: "type", value: "list" },
          { name: "牌组", value: [] },
          { name: "status", value: "" }
        ]
      ), await ut(t);
    else {
      const p = (u = n.refs) == null ? void 0 : u.find((g) => g.type === 2 && ve(g.alias));
      p && await orca.commands.invokeEditorCommand(
        "core.editor.setRefData",
        null,
        p,
        [{ name: "type", value: "list" }]
      );
    }
  } catch (p) {
    return console.error(`[${t}] 创建列表卡失败（标签处理）:`, p), orca.notify("error", `创建列表卡失败: ${p}`, { title: "列表卡" }), null;
  }
  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [r],
      [{ name: "srs.isCard", value: !0, type: 4 }]
    );
  } catch (p) {
    console.warn(`[${t}] 设置 srs.isCard 失败（不影响主流程）:`, p);
  }
  const i = si(), c = kl();
  for (let p = 0; p < a.length; p++) {
    const g = a[p], y = p === 0 ? i : c;
    try {
      const v = ((f = orca.state.blocks) == null ? void 0 : f[g]) || await orca.invokeBackend("get-block", g);
      jl(v) || await Ur(g, y);
    } catch (v) {
      console.warn(`[${t}] 初始化列表条目 #${g} 失败（跳过）:`, v);
    }
  }
  return a.length === 0 ? orca.notify("success", "已创建列表卡，请在该块下添加子块作为条目", { title: "列表卡" }) : orca.notify("success", "已创建列表卡（评分将逐条解锁下一条）", { title: "列表卡" }), { blockId: r };
}
async function $l(e, t) {
  var a, s;
  const r = ((a = orca.state.blocks) == null ? void 0 : a[e]) || await orca.invokeBackend("get-block", e);
  if (!r) return;
  const n = (s = r.refs) == null ? void 0 : s.find((i) => i.type === 2 && ve(i.alias));
  n && await orca.commands.invokeEditorCommand(
    "core.editor.setRefData",
    null,
    n,
    t
  );
}
async function Dl(e, t) {
  try {
    await $l(e, [{ name: "priority", value: t }]);
  } catch (r) {
    console.warn("[IR] syncCardTagPriority failed:", { blockId: e, error: r });
  }
}
const Tl = 24 * 60 * 60 * 1e3;
function Gt(e, t) {
  return new Date(e.getTime() + t * Tl);
}
function El(e) {
  return new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
}
function _l(e) {
  let t = 2166136261;
  for (let r = 0; r < e.length; r++)
    t ^= e.charCodeAt(r), t = Math.imul(t, 16777619);
  return t >>> 0;
}
function zl(e) {
  let t = e >>> 0;
  return () => {
    t += 1831565813;
    let r = t;
    return r = Math.imul(r ^ r >>> 15, r | 1), r ^= r + Math.imul(r ^ r >>> 7, r | 61), ((r ^ r >>> 14) >>> 0) / 4294967296;
  };
}
function Il(e) {
  return e === "extracts" ? { ratio: 0.35, maxAbsDays: 3 } : { ratio: 0.2, maxAbsDays: 2 };
}
function Ml(e, t) {
  const r = Math.max(0, t * 0.5);
  return e === "topic" ? Math.min(1, r) : r;
}
function Bl(e) {
  const t = Number.isFinite(e.baseIntervalDays) ? e.baseIntervalDays : 1, r = e.seedSalt ?? "ir:dispersal", n = El(e.baseDate), a = _l(`${e.blockId}:${n}:${e.cardType}:${r}`), s = zl(a)();
  if (e.isNew) {
    const l = Ml(e.cardType, t), x = Number.isFinite(e.queueDelayDays) ? Math.max(0, e.queueDelayDays) : 0;
    return t + s * l + x;
  }
  const i = Il(e.cardType), c = Math.min(i.maxAbsDays, Math.max(0, t * i.ratio)), d = (s * 2 - 1) * c;
  return t + d;
}
const Jt = 50;
function ft(e) {
  if (!Number.isFinite(e)) return Jt;
  const t = Math.round(e);
  return t < 0 ? 0 : t > 100 ? 100 : t;
}
const Ia = (e, t) => Math.floor(Math.random() * (t - e + 1)) + e, nr = (e, t, r) => e + (t - e) * r;
function ii(e, t) {
  const r = ft(t) / 100;
  return e === "extracts" ? Math.max(1, Math.round(nr(7, 1, r))) : Math.max(1, Math.round(nr(14, 2, r)));
}
function Al(e) {
  return ii("extracts", e);
}
function la(e) {
  return ii("topic", e);
}
function Fn(e, t) {
  const n = 1 - ft(t) / 100;
  if (e === "extracts") {
    const i = Math.max(1, Math.round(nr(1, 4, n))), c = Math.max(i, Math.round(nr(2, 10, n)));
    return Ia(i, c);
  }
  const a = Math.max(1, Math.round(nr(1, 7, n))), s = Math.max(a, Math.round(nr(2, 14, n)));
  return Ia(a, s);
}
const Wn = Jt, Pl = 60, Ll = 30, Ol = 1.25, Fl = 1.35, ar = /* @__PURE__ */ new Map(), St = async (e) => {
  var r;
  if (ar.has(e))
    return ar.get(e) ?? void 0;
  const t = await orca.invokeBackend("get-block", e);
  if (!t) {
    const n = (r = orca.state.blocks) == null ? void 0 : r[e];
    if (n)
      return ar.set(e, n), n;
  }
  return ar.set(e, t ?? null), t;
}, en = (e) => {
  ar.delete(e);
}, Ie = (e, t) => (() => {
  var n, a;
  const r = (a = (n = e == null ? void 0 : e.properties) == null ? void 0 : n.find((s) => s.name === t)) == null ? void 0 : a.value;
  return Array.isArray(r) ? r.length > 0 ? r[0] : void 0 : r;
})(), Yt = (e, t) => {
  if (typeof e == "number") return e;
  if (typeof e == "string") {
    const r = Number(e);
    if (Number.isFinite(r)) return r;
  }
  return t;
}, Hn = (e) => {
  if (typeof e == "number" && Number.isFinite(e)) return e;
  if (typeof e == "string") {
    const t = Number(e);
    if (Number.isFinite(t)) return t;
  }
  return null;
}, _o = (e, t) => {
  if (typeof e == "string") {
    const r = e.trim();
    return r.length > 0 ? r : t;
  }
  return t;
}, zo = (e, t) => {
  if (!e) return t;
  const r = new Date(e);
  return Number.isNaN(r.getTime()) ? t : r;
};
function Ma(e) {
  return new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
}
function Ba(e) {
  return zo(e.created, null);
}
async function Wl(e, t, r) {
  const n = t.parent;
  if (!n) return 0;
  ar.delete(n);
  const a = await St(n);
  if (!a || je(a) !== "topic") return 0;
  const s = Ba(t);
  if (!s) return 0;
  const i = Ma(s), c = s.getTime(), d = Array.isArray(a.children) ? a.children : [];
  if (d.length === 0) return 0;
  const l = await Promise.all(
    d.map(async (f) => await St(f) ?? null)
  );
  let x = 0;
  for (const f of l) {
    if (!f || f.id === e) continue;
    const p = Ba(f);
    if (!p || Ma(p) !== i) continue;
    const g = p.getTime();
    (g < c || g === c && f.id < e) && x++;
  }
  const u = Math.min(0.5, Math.max(0.15, r * 0.2));
  return x * u;
}
function Hl(e) {
  return e === "extracts" ? Ll : Pl;
}
function _t(e, t) {
  const r = e === "extracts" ? 2 : 5, n = typeof t == "number" && Number.isFinite(t) ? t : r, a = Hl(e);
  return Math.min(a, Math.max(1, n));
}
function Or(e) {
  return e.readCount === 0 && !e.lastRead;
}
function tn(e, t, r, n, a) {
  const i = Bl({
    blockId: e,
    cardType: t === "extracts" ? "extracts" : "topic",
    baseDate: r,
    baseIntervalDays: n,
    isNew: a.isNew,
    queueDelayDays: a.queueDelayDays
  }), c = _t(t, i), d = Gt(r, c);
  return { intervalDays: c, due: d };
}
function da(e) {
  return e === "extracts" ? "extract.raw" : "topic.preview";
}
function rn(e, t) {
  const r = ft(t);
  return (e ? je(e) : "topic") === "extracts" ? Al(r) : la(r);
}
function Nl(e, t) {
  const r = Math.max(1, t);
  return _t(e, r * (e === "extracts" ? Fl : Ol));
}
const Yl = (e, t) => {
  const r = ft(e), n = "topic", a = /* @__PURE__ */ new Date(), s = _t(n, la(r));
  return {
    priority: r,
    lastRead: t,
    readCount: 0,
    due: Gt(a, s),
    intervalDays: s,
    postponeCount: 0,
    stage: da(n),
    lastAction: "init",
    position: null,
    resumeBlockId: null
  };
};
async function qe(e) {
  const t = /* @__PURE__ */ new Date(), r = Yl(Wn, null);
  try {
    const n = await St(e);
    if (!n) return r;
    const a = Yt(Ie(n, "ir.priority"), Wn), s = zo(Ie(n, "ir.lastRead"), null), i = Yt(Ie(n, "ir.readCount"), 0), c = zo(Ie(n, "ir.due"), null), d = Yt(Ie(n, "ir.intervalDays"), Number.NaN), l = Yt(Ie(n, "ir.postponeCount"), 0), x = _o(Ie(n, "ir.stage"), null), u = _o(Ie(n, "ir.lastAction"), null), f = Hn(Ie(n, "ir.position")), p = Hn(Ie(n, "ir.resumeBlockId")), g = ft(a), y = je(n), v = rn(n, g), h = _t(
      y,
      Number.isFinite(d) ? d : v
    ), S = c ?? Gt(t, h), $ = x ?? da(y), k = u ?? "init";
    return {
      priority: g,
      lastRead: s,
      readCount: i,
      due: S,
      intervalDays: h,
      postponeCount: Math.max(0, Math.floor(l)),
      stage: $,
      lastAction: k,
      position: f,
      resumeBlockId: p
    };
  } catch (n) {
    return console.error("[IR] 读取渐进阅读状态失败:", n), orca.notify("error", "读取渐进阅读状态失败", { title: "渐进阅读" }), r;
  }
}
async function lt(e, t) {
  try {
    const r = [
      { name: "ir.priority", value: t.priority, type: 3 },
      { name: "ir.lastRead", value: t.lastRead ?? null, type: 5 },
      { name: "ir.readCount", value: t.readCount, type: 3 },
      { name: "ir.due", value: t.due, type: 5 },
      { name: "ir.intervalDays", value: t.intervalDays, type: 3 },
      { name: "ir.postponeCount", value: t.postponeCount, type: 3 },
      { name: "ir.stage", value: t.stage, type: 2 },
      { name: "ir.lastAction", value: t.lastAction, type: 2 },
      { name: "ir.position", value: t.position ?? null, type: 3 },
      { name: "ir.resumeBlockId", value: t.resumeBlockId ?? null, type: 3 }
    ];
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [e],
      r
    ), en(e), await Dl(e, t.priority);
  } catch (r) {
    throw console.error("[IR] 保存渐进阅读状态失败:", r), orca.notify("error", "保存渐进阅读状态失败", { title: "渐进阅读" }), r;
  }
}
async function on(e) {
  var t;
  try {
    const r = await St(e), n = ((t = r == null ? void 0 : r.properties) == null ? void 0 : t.filter((a) => a.name.startsWith("ir.")).map((a) => a.name)) ?? [];
    if (n.length === 0)
      return;
    await orca.commands.invokeEditorCommand(
      "core.editor.deleteProperties",
      null,
      [e],
      n
    ), en(e);
  } catch (r) {
    throw console.error("[IR] 删除渐进阅读状态失败:", r), orca.notify("error", "删除渐进阅读状态失败", { title: "渐进阅读" }), r;
  }
}
async function Jr(e) {
  try {
    const t = /* @__PURE__ */ new Date(), r = await St(e), n = await qe(e), a = (r == null ? void 0 : r.properties) ?? [], s = a.some((_) => _.name === "ir.priority"), i = a.some((_) => _.name === "ir.lastRead"), c = a.some((_) => _.name === "ir.readCount"), d = a.some((_) => _.name === "ir.due"), l = a.some((_) => _.name === "ir.intervalDays"), x = a.some((_) => _.name === "ir.postponeCount"), u = a.some((_) => _.name === "ir.stage"), f = a.some((_) => _.name === "ir.lastAction"), p = a.some((_) => _.name === "ir.position"), g = a.some((_) => _.name === "ir.resumeBlockId"), y = r ? je(r) : "basic", v = y === "topic", h = Yt(Ie(r, "ir.priority"), Wn), S = ft(h), $ = zo(Ie(r, "ir.due"), null), k = Hn(Ie(r, "ir.position")), C = Yt(Ie(r, "ir.intervalDays"), Number.NaN), P = Yt(Ie(r, "ir.postponeCount"), Number.NaN), E = _o(Ie(r, "ir.stage"), null), O = _o(Ie(r, "ir.lastAction"), null), j = !l, B = rn(r, S), z = _t(
      y,
      Number.isFinite(C) ? C : j ? B : n.intervalDays
    ), M = !!(j && $ && n.readCount === 0 && !n.lastRead), A = !M && (j || !$) ? tn(e, y, t, z, { isNew: Or(n) }) : null, T = M ? $ : (A == null ? void 0 : A.due) ?? $ ?? Gt(t, z), w = (A == null ? void 0 : A.intervalDays) ?? z, N = Math.max(
      0,
      Math.floor(Number.isFinite(P) ? P : n.postponeCount)
    ), F = E ?? n.stage ?? da(y), D = j ? "migrate" : O ?? n.lastAction ?? "init";
    if (!s || !i || !c || !d || !l || !x || !u || !f || !g || v && !p || h !== S || !$ || v && k === null || !Number.isFinite(C) || !Number.isFinite(P)) {
      const _ = v ? k ?? n.position ?? Date.now() : n.position, G = {
        priority: S,
        lastRead: n.lastRead,
        readCount: n.readCount,
        intervalDays: w,
        postponeCount: N,
        stage: F,
        lastAction: D,
        // 迁移：直接按新规则立刻重算 due（避免旧规则导致的长期高频/排序失真）
        due: T,
        position: _,
        resumeBlockId: n.resumeBlockId
      };
      return await lt(e, G), G;
    }
    return n;
  } catch (t) {
    throw console.error("[IR] 初始化渐进阅读状态失败:", t), orca.notify("error", "初始化渐进阅读状态失败", { title: "渐进阅读" }), t;
  }
}
async function ci(e) {
  try {
    const t = await qe(e), r = /* @__PURE__ */ new Date(), n = await St(e), a = n ? je(n) : "topic", s = Nl(a, t.intervalDays), i = tn(e, a, r, s, { isNew: Or(t) }), c = {
      priority: t.priority,
      lastRead: r,
      readCount: t.readCount + 1,
      intervalDays: i.intervalDays,
      postponeCount: t.postponeCount,
      stage: t.stage,
      lastAction: "read",
      due: i.due,
      position: t.position,
      resumeBlockId: t.resumeBlockId
    };
    return await lt(e, c), c;
  } catch (t) {
    throw console.error("[IR] 标记已读失败:", t), orca.notify("error", "标记已读失败", { title: "渐进阅读" }), t;
  }
}
async function li(e, t) {
  try {
    const r = await qe(e), n = /* @__PURE__ */ new Date(), a = await St(e), s = ft(t), i = a ? je(a) : "topic", c = _t(
      i,
      rn(a, s)
    ), d = tn(e, i, n, c, { isNew: Or(r) }), l = {
      priority: s,
      lastRead: n,
      readCount: r.readCount + 1,
      intervalDays: d.intervalDays,
      postponeCount: r.postponeCount,
      stage: r.stage,
      lastAction: "priority",
      due: d.due,
      position: r.position,
      resumeBlockId: r.resumeBlockId
    };
    return await lt(e, l), l;
  } catch (r) {
    throw console.error("[IR] 标记已读并更新优先级失败:", r), orca.notify("error", "标记已读并更新优先级失败", { title: "渐进阅读" }), r;
  }
}
async function nn(e, t) {
  try {
    const r = await qe(e), n = /* @__PURE__ */ new Date(), a = ft(t), s = await St(e), i = s ? je(s) : "topic", c = _t(
      i,
      rn(s, a)
    ), l = !!(s && i === "extracts" && Or(r) && (r.lastAction === "init" || r.lastAction === "migrate")) ? await Wl(e, s, c) : 0, x = tn(e, i, n, c, {
      isNew: Or(r),
      queueDelayDays: l
    }), u = {
      priority: a,
      lastRead: r.lastRead,
      readCount: r.readCount,
      intervalDays: x.intervalDays,
      postponeCount: r.postponeCount,
      stage: r.stage,
      lastAction: "priority",
      due: x.due,
      position: r.position,
      resumeBlockId: r.resumeBlockId
    };
    return await lt(e, u), u;
  } catch (r) {
    throw console.error("[IR] 更新优先级失败:", r), orca.notify("error", "更新优先级失败", { title: "渐进阅读" }), r;
  }
}
async function Nn(e, t) {
  try {
    const n = {
      ...await qe(e),
      resumeBlockId: t
    };
    return await lt(e, n), n;
  } catch (r) {
    throw console.error("[IR] 更新阅读进度失败:", r), orca.notify("error", "更新阅读进度失败", { title: "渐进阅读" }), r;
  }
}
async function di(e) {
  try {
    const t = await qe(e), r = /* @__PURE__ */ new Date(), n = await St(e), a = n ? je(n) : "topic", i = Fn(a === "extracts" ? "extracts" : "topic", t.priority), c = _t(a, i), d = {
      ...t,
      intervalDays: c,
      postponeCount: t.postponeCount + 1,
      lastAction: "postpone",
      due: Gt(r, c)
    };
    return await lt(e, d), { state: d, days: i };
  } catch (t) {
    throw console.error("[IR] 推后失败:", t), orca.notify("error", "推后失败", { title: "渐进阅读" }), t;
  }
}
async function ui(e, t = {}) {
  try {
    const r = await qe(e), n = t.now ?? /* @__PURE__ */ new Date(), a = new Date(n.getFullYear(), n.getMonth(), n.getDate()), s = {
      ...r,
      due: a
    };
    return await lt(e, s), s;
  } catch (r) {
    throw console.error("[IR] advanceDueToToday failed:", r), orca.notify("error", "提前学失败（写入排期失败）", { title: "渐进阅读" }), r;
  }
}
const ql = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  advanceDueToToday: ui,
  deleteIRState: on,
  ensureIRState: Jr,
  invalidateIrBlockCache: en,
  loadIRState: qe,
  markAsRead: ci,
  markAsReadWithPriority: li,
  postpone: di,
  saveIRState: lt,
  updatePriority: nn,
  updateResumeBlockId: Nn
}, Symbol.toStringTag, { value: "Module" }));
async function Kl(e, t) {
  var s, i, c, d;
  if (!((s = e == null ? void 0 : e.anchor) != null && s.blockId))
    return orca.notify("error", "无法获取光标位置"), null;
  const r = e.anchor.blockId, n = (i = orca.state.blocks) == null ? void 0 : i[r];
  if (!n)
    return orca.notify("error", "未找到当前块"), null;
  const a = (c = n.refs) == null ? void 0 : c.some((l) => l.type === 2 && ve(l.alias));
  try {
    if (!a)
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        e,
        r,
        "card",
        [
          { name: "type", value: "topic" },
          { name: "牌组", value: [] },
          { name: "status", value: "" }
        ]
      ), await ut(t);
    else {
      const l = (d = n.refs) == null ? void 0 : d.find((x) => x.type === 2 && ve(x.alias));
      l && await orca.commands.invokeEditorCommand(
        "core.editor.setRefData",
        null,
        l,
        [{ name: "type", value: "topic" }]
      );
    }
  } catch (l) {
    return console.error(`[${t}] 创建 Topic 卡片失败（标签处理）:`, l), orca.notify("error", `创建 Topic 卡片失败: ${l}`, { title: "渐进阅读" }), null;
  }
  try {
    await Jr(r);
  } catch (l) {
    return console.error(`[${t}] 初始化渐进阅读状态失败:`, l), orca.notify("error", `初始化渐进阅读状态失败: ${l}`, { title: "渐进阅读" }), null;
  }
  return orca.notify("success", "已创建 Topic 卡片", { title: "渐进阅读" }), { blockId: r };
}
const Ul = (e) => {
  var n;
  let t = e, r = 0;
  for (; t && r < 100; ) {
    if (je(t) === "topic")
      return t;
    const a = t.parent;
    if (!a) return null;
    t = (n = orca.state.blocks) == null ? void 0 : n[a], r += 1;
  }
  return null;
}, Vl = async (e) => {
  const t = Ul(e);
  if (!t) return Jt;
  try {
    const r = await qe(t.id);
    return ft(r.priority);
  } catch {
    return Jt;
  }
};
async function Gl(e, t) {
  var u, f, p, g, y;
  if (!((u = e == null ? void 0 : e.anchor) != null && u.blockId))
    return orca.notify("error", "无法获取光标位置"), console.error(`[${t}] 错误：无法获取光标位置`), null;
  const r = e.anchor.blockId, n = (f = orca.state.blocks) == null ? void 0 : f[r];
  if (!n)
    return orca.notify("error", "未找到当前块"), console.error(`[${t}] 错误：未找到块 #${r}`), null;
  if (e.anchor.blockId !== e.focus.blockId)
    return orca.notify("warn", "请在同一块内选择文本"), null;
  if (e.anchor.offset === e.focus.offset && e.anchor.index === e.focus.index)
    return orca.notify("warn", "请先选择要摘录的文本"), null;
  if (e.anchor.index !== e.focus.index)
    return orca.notify("warn", "请在同一段文本内选择（不支持跨样式选区）"), null;
  if (!n.content || n.content.length === 0)
    return orca.notify("warn", "块内容为空"), null;
  const a = e.anchor.index, s = n.content[a];
  if (!s || !s.v)
    return orca.notify("warn", "无法获取选中的文本片段"), null;
  const i = Math.min(e.anchor.offset, e.focus.offset), c = Math.max(e.anchor.offset, e.focus.offset), d = s.v.substring(i, c);
  if (!d || d.trim() === "")
    return orca.notify("warn", "请先选择要摘录的文本"), null;
  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.formatHighlightYellow",
      e
    );
  } catch (v) {
    console.warn(`[${t}] 高亮原文失败:`, v);
  }
  let l;
  try {
    const v = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      n,
      "lastChild",
      [{ t: "t", v: d }]
    );
    if (typeof v != "number")
      return orca.notify("error", "创建摘录块失败：无法获取新块 ID", { title: "渐进阅读" }), console.error(`[${t}] 创建摘录块失败：insertBlock 返回值异常`, v), null;
    l = v;
  } catch (v) {
    return console.error(`[${t}] 创建摘录块失败:`, v), orca.notify("error", `创建摘录块失败: ${v}`, { title: "渐进阅读" }), null;
  }
  const x = await Vl(n);
  try {
    const v = (p = orca.state.blocks) == null ? void 0 : p[l];
    if (!(((g = v == null ? void 0 : v.refs) == null ? void 0 : g.some((S) => S.type === 2 && ve(S.alias))) ?? !1))
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        e,
        l,
        "card",
        [
          { name: "type", value: "extracts" },
          { name: "牌组", value: [] },
          { name: "status", value: "" }
        ]
      ), await ut(t);
    else {
      const S = (y = v == null ? void 0 : v.refs) == null ? void 0 : y.find(($) => $.type === 2 && ve($.alias));
      S && await orca.commands.invokeEditorCommand(
        "core.editor.setRefData",
        null,
        S,
        [{ name: "type", value: "extracts" }]
      );
    }
  } catch (v) {
    return console.error(`[${t}] 创建 Extract 卡片失败（标签处理）:`, v), orca.notify("error", `创建 Extract 卡片失败: ${v}`, { title: "渐进阅读" }), null;
  }
  try {
    await Jr(l), await nn(l, x);
  } catch (v) {
    return console.error(`[${t}] 初始化渐进阅读状态失败:`, v), orca.notify("error", `初始化渐进阅读状态失败: ${v}`, { title: "渐进阅读" }), null;
  }
  return orca.notify("success", "已创建摘录（Extract）", { title: "渐进阅读" }), { blockId: r, extractBlockId: l };
}
const fi = {
  "ai.apiKey": {
    label: "API Key",
    type: "string",
    defaultValue: "",
    description: "OpenAI 兼容的 API Key（请妥善保管，不要泄露）"
  },
  "ai.apiUrl": {
    label: "API URL",
    type: "string",
    defaultValue: "https://api.openai.com/v1/chat/completions",
    description: "API 端点地址，支持 OpenAI 兼容的第三方服务（如 DeepSeek、Ollama 等）"
  },
  "ai.model": {
    label: "AI Model",
    type: "string",
    defaultValue: "gpt-3.5-turbo",
    description: "使用的模型名称（如 gpt-4、deepseek-chat、llama2 等）"
  },
  "ai.language": {
    label: "生成语言",
    type: "string",
    defaultValue: "中文",
    description: "AI 生成内容的语言"
  },
  "ai.difficulty": {
    label: "难度级别",
    type: "string",
    defaultValue: "普通",
    description: "生成卡片的难度级别（简单/普通/困难）"
  },
  "ai.promptTemplate": {
    label: "提示词模板",
    type: "string",
    defaultValue: `你是一个闪卡制作助手。根据用户提供的内容，生成一个问答对。

输入内容：{{content}}
语言要求：{{language}}
难度级别：{{difficulty}}

要求：
1. 根据内容生成一个问题和对应的答案
2. 问题应该清晰简洁，符合指定的难度级别
3. 答案应该准确但简短
4. 使用指定的语言输出

请严格以 JSON 格式返回，不要包含其他内容：
{"question": "问题内容", "answer": "答案内容"}`,
    description: "AI 生成卡片的提示词模板。支持变量：{{content}}（用户输入）、{{language}}（语言）、{{difficulty}}（难度）。使用命令面板搜索「SRS: 测试 AI 连接」来验证配置。"
  }
};
function gr(e) {
  var r;
  const t = (r = orca.state.plugins[e]) == null ? void 0 : r.settings;
  return {
    apiKey: (t == null ? void 0 : t["ai.apiKey"]) || "",
    apiUrl: (t == null ? void 0 : t["ai.apiUrl"]) || "https://api.openai.com/v1/chat/completions",
    model: (t == null ? void 0 : t["ai.model"]) || "gpt-3.5-turbo",
    language: (t == null ? void 0 : t["ai.language"]) || "中文",
    difficulty: (t == null ? void 0 : t["ai.difficulty"]) || "普通",
    promptTemplate: (t == null ? void 0 : t["ai.promptTemplate"]) || fi["ai.promptTemplate"].defaultValue
  };
}
function Jl(e, t, r) {
  return e.replace(/\{\{content\}\}/g, t).replace(/\{\{language\}\}/g, r.language).replace(/\{\{difficulty\}\}/g, r.difficulty);
}
function Ql(e) {
  try {
    const t = JSON.parse(e);
    if (t.question && t.answer)
      return {
        success: !0,
        data: {
          question: String(t.question).trim(),
          answer: String(t.answer).trim()
        }
      };
  } catch {
    const t = e.match(/\{[\s\S]*"question"[\s\S]*"answer"[\s\S]*\}/);
    if (t)
      try {
        const r = JSON.parse(t[0]);
        if (r.question && r.answer)
          return {
            success: !0,
            data: {
              question: String(r.question).trim(),
              answer: String(r.answer).trim()
            }
          };
      } catch {
      }
  }
  return {
    success: !1,
    error: {
      code: "PARSE_ERROR",
      message: "无法解析 AI 响应格式，请检查提示词模板"
    }
  };
}
async function Xl(e, t) {
  var a, s, i, c;
  const r = gr(e);
  if (!r.apiKey)
    return {
      success: !1,
      error: { code: "NO_API_KEY", message: "请先在设置中配置 API Key" }
    };
  const n = Jl(r.promptTemplate, t, r);
  console.log("[AI Service] 调用 AI 生成卡片"), console.log(`[AI Service] API URL: ${r.apiUrl}`), console.log(`[AI Service] Model: ${r.model}`), console.log(`[AI Service] 提示词长度: ${n.length}`);
  try {
    const d = await fetch(r.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${r.apiKey}`
      },
      body: JSON.stringify({
        model: r.model,
        messages: [
          {
            role: "system",
            content: "你是一个闪卡制作助手。你的任务是根据用户输入生成问答卡片。请严格以 JSON 格式返回结果。"
          },
          { role: "user", content: n }
        ],
        temperature: 0.7,
        max_tokens: 1e3
      })
    });
    if (!d.ok) {
      let u = `请求失败: ${d.status}`;
      try {
        u = ((a = (await d.json()).error) == null ? void 0 : a.message) || u;
      } catch {
      }
      return console.error(`[AI Service] API 错误: ${u}`), {
        success: !1,
        error: {
          code: `HTTP_${d.status}`,
          message: u
        }
      };
    }
    const x = (c = (i = (s = (await d.json()).choices) == null ? void 0 : s[0]) == null ? void 0 : i.message) == null ? void 0 : c.content;
    return x ? (console.log(`[AI Service] AI 响应: ${x}`), Ql(x)) : (console.error("[AI Service] AI 返回内容为空"), {
      success: !1,
      error: { code: "EMPTY_RESPONSE", message: "AI 返回内容为空" }
    });
  } catch (d) {
    const l = d instanceof Error ? d.message : "网络错误";
    return console.error(`[AI Service] 网络错误: ${l}`), {
      success: !1,
      error: {
        code: "NETWORK_ERROR",
        message: l
      }
    };
  }
}
async function Zl(e, t) {
  var d;
  if (console.log(`[${t}] ========== makeAICardFromBlock 开始执行 ==========`), !e || !e.anchor || !e.anchor.blockId)
    return orca.notify("error", "无法获取光标位置"), console.error(`[${t}] 错误：无法获取光标位置`), null;
  const r = e.anchor.blockId, n = orca.state.blocks[r];
  if (!n)
    return orca.notify("error", "未找到当前块"), console.error(`[${t}] 错误：未找到块 #${r}`), null;
  const a = (d = n.text) == null ? void 0 : d.trim();
  if (!a)
    return orca.notify("warn", "当前块内容为空，无法生成卡片", { title: "AI 卡片" }), console.warn(`[${t}] 警告：块 #${r} 内容为空`), null;
  console.log(`[${t}] 原始块 ID: ${r}`), console.log(`[${t}] 原始内容: "${a}"`), orca.notify("info", "正在调用 AI 生成卡片...", { title: "AI 卡片" });
  const s = await Xl(t, a);
  if (!s.success)
    return orca.notify("error", s.error.message, { title: "AI 卡片生成失败" }), console.error(`[${t}] AI 生成失败: ${s.error.message}`), null;
  const { question: i, answer: c } = s.data;
  console.log(`[${t}] AI 生成成功`), console.log(`[${t}]   问题: "${i}"`), console.log(`[${t}]   答案: "${c}"`);
  try {
    console.log(`[${t}] 创建子块（问题）...`);
    const l = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      n,
      "lastChild",
      [{ t: "t", v: i }]
    );
    if (!l)
      return orca.notify("error", "创建子块失败", { title: "AI 卡片" }), console.error(`[${t}] 创建子块失败`), null;
    console.log(`[${t}] 子块创建成功: #${l}`);
    const x = orca.state.blocks[l];
    if (!x)
      return orca.notify("error", "无法获取子块", { title: "AI 卡片" }), console.error(`[${t}] 无法获取子块 #${l}`), null;
    console.log(`[${t}] 创建孙子块（答案）...`);
    const u = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      x,
      "lastChild",
      [{ t: "t", v: c }]
    );
    if (!u)
      return orca.notify("error", "创建孙子块失败", { title: "AI 卡片" }), console.error(`[${t}] 创建孙子块失败`), await orca.commands.invokeEditorCommand(
        "core.editor.deleteBlocks",
        null,
        [l]
      ), null;
    console.log(`[${t}] 孙子块创建成功: #${u}`), console.log(`[${t}] 添加 #card 标签到子块...`), await orca.commands.invokeEditorCommand(
      "core.editor.insertTag",
      e,
      l,
      "card",
      [
        { name: "type", value: "basic" },
        { name: "牌组", value: [] },
        // 空数组表示未设置牌组
        { name: "status", value: "" }
        // 空字符串表示正常状态
      ]
    ), console.log(`[${t}] #card 标签添加成功`), await ut(t);
    const f = orca.state.blocks[l];
    return f && (f._repr = {
      type: "srs.card",
      front: i,
      back: c,
      cardType: "basic"
    }, console.log(`[${t}] 子块 _repr 已设置为 srs.card`)), console.log(`[${t}] 初始化 SRS 状态...`), await Ze(l), console.log(`[${t}] ========== AI 卡片创建完成 ==========`), console.log(`[${t}] 结构：`), console.log(`[${t}]   原始块 #${r}: "${a}"`), console.log(`[${t}]     └─ 子块 #${l} [#card]: "${i}"`), console.log(`[${t}]         └─ 孙子块 #${u}: "${c}"`), orca.notify(
      "success",
      `已生成卡片
问题: ${i}
答案: ${c}`,
      { title: "AI 卡片创建成功" }
    ), {
      blockId: l,
      question: i,
      answer: c
    };
  } catch (l) {
    const x = l instanceof Error ? l.message : String(l);
    return console.error(`[${t}] AI 卡片创建异常:`, l), orca.notify("error", `创建失败: ${x}`, { title: "AI 卡片" }), null;
  }
}
function ed(e) {
  const t = gr(e), r = [], n = [], a = [];
  if ((!t.apiKey || t.apiKey.trim() === "") && (r.push("API Key 未配置"), a.push("请在插件设置中配置 API Key")), !t.apiUrl || t.apiUrl.trim() === "")
    r.push("API URL 未配置");
  else
    try {
      const s = new URL(t.apiUrl);
      s.protocol !== "http:" && s.protocol !== "https:" && r.push(`无效的协议: ${s.protocol}，应该是 http: 或 https:`), t.apiUrl.includes("api.openai.com") ? t.apiUrl.includes("/v1/chat/completions") || (n.push("OpenAI API URL 可能不正确"), a.push("标准格式: https://api.openai.com/v1/chat/completions")) : t.apiUrl.includes("api.deepseek.com") ? t.apiUrl.includes("/chat/completions") || (n.push("DeepSeek API URL 可能不正确"), a.push("标准格式: https://api.deepseek.com/chat/completions")) : (t.apiUrl.includes("localhost") || t.apiUrl.includes("127.0.0.1")) && !t.apiUrl.includes("/v1/chat/completions") && !t.apiUrl.includes("/api/chat") && (n.push("本地 API URL 格式可能不正确"), a.push("Ollama 格式: http://localhost:11434/v1/chat/completions"));
    } catch (s) {
      r.push(`API URL 格式错误: ${s instanceof Error ? s.message : String(s)}`);
    }
  return (!t.model || t.model.trim() === "") && n.push("模型名称未配置，将使用默认值"), {
    isValid: r.length === 0,
    errors: r,
    warnings: n,
    suggestions: a
  };
}
function td() {
  return {
    OpenAI: {
      url: "https://api.openai.com/v1/chat/completions",
      model: "gpt-3.5-turbo",
      description: "OpenAI 官方 API"
    },
    "OpenAI (GPT-4)": {
      url: "https://api.openai.com/v1/chat/completions",
      model: "gpt-4",
      description: "OpenAI GPT-4 模型（需要更高权限）"
    },
    DeepSeek: {
      url: "https://api.deepseek.com/chat/completions",
      model: "deepseek-chat",
      description: "DeepSeek AI 服务"
    },
    "Ollama (本地)": {
      url: "http://localhost:11434/v1/chat/completions",
      model: "llama2",
      description: "本地 Ollama 服务（需要先启动 Ollama）"
    },
    "Azure OpenAI": {
      url: "https://YOUR-RESOURCE-NAME.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT-NAME/chat/completions?api-version=2023-05-15",
      model: "gpt-35-turbo",
      description: "Azure OpenAI 服务（需要替换 YOUR-RESOURCE-NAME 和 YOUR-DEPLOYMENT-NAME）"
    }
  };
}
function Io(e, t) {
  const r = (e == null ? void 0 : e.code) || "UNKNOWN", n = (e == null ? void 0 : e.message) || String(e);
  let a = `AI API 错误 (${r}): ${n}

`;
  if (a += `当前配置:
`, a += `- API URL: ${t.apiUrl}
`, a += `- 模型: ${t.model}
`, a += `- API Key: ${t.apiKey ? "已配置 (长度: " + t.apiKey.length + ")" : "未配置"}

`, r === "HTTP_404") {
    a += `可能的原因:
`, a += `1. API URL 配置错误
`, a += `2. 使用了错误的端点路径
`, a += `3. API 服务不支持该端点

`, a += `建议:
`;
    const s = td();
    a += `请检查 API URL 是否正确，常见配置:
`;
    for (const [i, c] of Object.entries(s))
      a += `- ${i}: ${c.url}
`;
  } else r === "HTTP_401" || r === "HTTP_403" ? (a += `可能的原因:
`, a += `1. API Key 无效或已过期
`, a += `2. API Key 权限不足
`, a += `3. API Key 格式错误

`, a += `建议:
`, a += `1. 检查 API Key 是否正确
`, a += `2. 确认 API Key 有访问该模型的权限
`, a += `3. 尝试重新生成 API Key
`) : r === "NETWORK_ERROR" && (a += `可能的原因:
`, a += `1. 网络连接问题
`, a += `2. API 服务不可达
`, a += `3. 防火墙或代理阻止

`, a += `建议:
`, a += `1. 检查网络连接
`, a += `2. 如果使用本地服务（如 Ollama），确认服务已启动
`, a += `3. 检查防火墙设置
`);
  return a;
}
async function rd(e) {
  var n;
  const t = ed(e);
  if (!t.isValid)
    return {
      success: !1,
      message: `配置验证失败:
` + t.errors.join(`
`),
      details: t
    };
  t.warnings.length > 0 && console.warn("[AI Config] 配置警告:", t.warnings);
  const r = gr(e);
  console.log("[AI Config] 测试配置:"), console.log(`- API URL: ${r.apiUrl}`), console.log(`- 模型: ${r.model}`), console.log(`- API Key: ${r.apiKey ? "已配置" : "未配置"}`);
  try {
    const a = await fetch(r.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${r.apiKey}`
      },
      body: JSON.stringify({
        model: r.model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5
      })
    });
    if (console.log(`[AI Config] 响应状态: ${a.status}`), a.ok) {
      const i = (await a.json()).model || r.model;
      return {
        success: !0,
        message: `连接成功！
使用模型: ${i}`,
        details: { status: a.status, model: i }
      };
    } else {
      const s = await a.text();
      let i;
      try {
        i = JSON.parse(s);
      } catch {
        i = { message: s };
      }
      return {
        success: !1,
        message: Io(
          { code: `HTTP_${a.status}`, message: ((n = i.error) == null ? void 0 : n.message) || i.message || `HTTP ${a.status}` },
          r
        ),
        details: { status: a.status, error: i }
      };
    }
  } catch (a) {
    return {
      success: !1,
      message: Io(
        { code: "NETWORK_ERROR", message: a instanceof Error ? a.message : String(a) },
        r
      ),
      details: { error: a }
    };
  }
}
const Ce = {
  enableAutoExtractMark: "enableAutoExtractMark",
  topicQuotaPercent: "topicQuotaPercent",
  dailyLimit: "dailyLimit",
  enableAutoDefer: "enableAutoDefer"
}, Qr = 20, Xr = 30, it = {
  [Ce.enableAutoExtractMark]: {
    label: "启用渐进阅读自动标签",
    type: "boolean",
    defaultValue: !1,
    description: "启用后自动为渐进阅读 Topic 的子块标记为 Extract"
  },
  [Ce.topicQuotaPercent]: {
    label: "Topic 配额比例（%）",
    type: "number",
    defaultValue: Qr,
    description: "渐进阅读队列中 Topic 的目标占比，默认 20%"
  },
  [Ce.dailyLimit]: {
    label: "每日渐进阅读上限",
    type: "number",
    defaultValue: Xr,
    description: "每天最多推送的渐进阅读卡片数量，设为 0 表示不限制"
  },
  [Ce.enableAutoDefer]: {
    label: "启用溢出推后按钮",
    type: "boolean",
    defaultValue: !0,
    description: "当到期卡超过每日上限时，显示“一键把溢出推后”按钮；打开面板只展示，不会自动改排期"
  }
};
function dt(e) {
  var r;
  const t = (r = orca.state.plugins[e]) == null ? void 0 : r.settings;
  return {
    enableAutoExtractMark: (t == null ? void 0 : t[Ce.enableAutoExtractMark]) ?? it[Ce.enableAutoExtractMark].defaultValue,
    topicQuotaPercent: (t == null ? void 0 : t[Ce.topicQuotaPercent]) ?? it[Ce.topicQuotaPercent].defaultValue,
    dailyLimit: (t == null ? void 0 : t[Ce.dailyLimit]) ?? it[Ce.dailyLimit].defaultValue,
    enableAutoDefer: (t == null ? void 0 : t[Ce.enableAutoDefer]) ?? it[Ce.enableAutoDefer].defaultValue
  };
}
const Aa = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  DEFAULT_IR_DAILY_LIMIT: Xr,
  DEFAULT_IR_TOPIC_QUOTA_PERCENT: Qr,
  INCREMENTAL_READING_SETTINGS_KEYS: Ce,
  getIncrementalReadingSettings: dt,
  incrementalReadingSettingsSchema: it
}, Symbol.toStringTag, { value: "Module" }));
function od(e) {
  return je(e) === "topic";
}
const Co = /* @__PURE__ */ new Set();
let ko = null;
function nd(e) {
  return je(e) === "extracts";
}
function pi(e) {
  var n;
  const t = e.parent;
  if (!t) return null;
  const r = (n = orca.state.blocks) == null ? void 0 : n[t];
  return r && od(r) ? r : null;
}
async function xi(e, t) {
  const { enableAutoExtractMark: r } = dt(t);
  if (!r || Co.has(e))
    return;
  const n = orca.state.blocks[e];
  if (!n)
    return;
  if (nd(n)) {
    Co.add(e);
    return;
  }
  const a = pi(n);
  if (!a)
    return;
  let s = Jt;
  try {
    s = (await qe(a.id)).priority;
  } catch {
    s = Jt;
  }
  console.log(`[${t}] 自动标记 Extract: 块 ${e}`);
  try {
    await orca.commands.invokeEditorCommand(
      "core.editor.insertTag",
      null,
      e,
      "card",
      [
        { name: "type", value: "extracts" },
        { name: "牌组", value: [] },
        { name: "status", value: "" }
      ]
    );
    const i = orca.state.blocks[e];
    i._repr = {
      type: "srs.extract-card",
      front: n.text || "",
      back: "(回忆/理解这段内容)",
      cardType: "extracts"
    }, await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [e],
      [{ name: "srs.isCard", value: !0, type: 4 }]
    );
    const { ensureCardSrsState: c } = await Promise.resolve().then(() => On);
    await c(e);
    const { ensureIRState: d, invalidateIrBlockCache: l } = await Promise.resolve().then(() => ql);
    await d(e), await nn(e, s), l(e), Co.add(e), console.log(`[${t}] 自动标记完成: 块 ${e}`);
  } catch (i) {
    console.error(`[${t}] 自动标记失败:`, i);
  }
}
async function Pa(e) {
  const { enableAutoExtractMark: t } = dt(e);
  if (!t)
    return;
  const r = orca.state.blocks;
  for (const n of Object.values(r))
    !n || !pi(n) || await xi(n.id, e);
}
function ua(e) {
  console.log(`[${e}] 启动渐进阅读自动标记`), Pa(e).catch((r) => {
    console.error(`[${e}] 初始扫描失败:`, r);
  });
  let t = null;
  ko = window.Valtio.subscribe(orca.state.blocks, (r) => {
    t && clearTimeout(t), t = setTimeout(() => {
      if (Array.isArray(r)) {
        const n = [];
        for (const a of r) {
          if (!a || a.type !== "set" || !Array.isArray(a.path) || a.path.length < 1) continue;
          const s = a.path[0], i = typeof s == "number" ? s : Number(String(s));
          Number.isFinite(i) && n.push(i);
        }
        if (n.length > 0) {
          Promise.allSettled(n.map((a) => xi(a, e))).catch((a) => {
            console.error(`[${e}] 自动标记失败:`, a);
          });
          return;
        }
      }
      Pa(e).catch((n) => {
        console.error(`[${e}] 自动标记失败:`, n);
      });
    }, 500);
  }), console.log(`[${e}] 渐进阅读自动标记已启动`);
}
function an(e) {
  ko && (ko(), ko = null, console.log(`[${e}] 渐进阅读自动标记已停止`)), Co.clear();
}
function ad(e) {
  const t = e;
  orca.commands.registerCommand(
    `${e}.scanCardsFromTags`,
    () => {
      console.log(`[${t}] 执行标签扫描`), Sl(t);
    },
    "SRS: 扫描带标签的卡片"
  ), orca.commands.registerEditorCommand(
    `${e}.makeCardFromBlock`,
    async (r, ...n) => {
      const [a, s, i] = r;
      if (!i)
        return orca.notify("error", "无法获取光标位置"), null;
      const c = await Cl(i, t);
      return c ? { ret: c, undoArgs: c } : null;
    },
    async (r) => {
      if (!r || !r.blockId) return;
      const n = orca.state.blocks[r.blockId];
      n && (n._repr = r.originalRepr || { type: "text" }, r.originalText !== void 0 && (n.text = r.originalText), console.log(`[${t}] 已撤销：块 #${r.blockId} 已恢复`));
    },
    {
      label: "SRS: 将块转换为记忆卡片",
      hasArgs: !1
    }
  ), orca.commands.registerEditorCommand(
    `${e}.createCloze`,
    async (r, ...n) => {
      const [a, s, i] = r;
      if (!i)
        return orca.notify("error", "无法获取光标位置"), null;
      const c = await xl(i, t);
      return c ? { ret: c, undoArgs: c } : null;
    },
    async (r) => {
      !r || !r.blockId || console.log(`[${t}] Cloze 撤销：块 #${r.blockId}，编号 c${r.clozeNumber}`);
    },
    {
      label: "SRS: 创建 Cloze 填空",
      hasArgs: !1
    }
  ), orca.commands.registerEditorCommand(
    `${e}.clearClozeFormat`,
    async (r, ...n) => {
      const [a, s, i] = r;
      if (!i)
        return orca.notify("error", "无法获取光标位置"), null;
      const c = await hl(i, t);
      return c ? { ret: c, undoArgs: c } : null;
    },
    async (r) => {
      !r || !r.blockId || console.log(`[${t}] 清除挖空格式撤销：块 #${r.blockId}`);
    },
    {
      label: "SRS: 清除挖空格式",
      hasArgs: !1
    }
  ), orca.commands.registerEditorCommand(
    `${e}.createClozeSameNumber`,
    async (r, ...n) => {
      const [a, s, i] = r;
      if (!i)
        return orca.notify("error", "无法获取光标位置"), null;
      const c = await gl(i, t);
      return c ? { ret: c, undoArgs: c } : null;
    },
    async (r) => {
      !r || !r.blockId || console.log(`[${t}] 同序 Cloze 撤销：块 #${r.blockId}，编号 c${r.clozeNumber}`);
    },
    {
      label: "SRS: 创建同序 Cloze 填空",
      hasArgs: !1
    }
  ), orca.commands.registerEditorCommand(
    `${e}.createTopicCard`,
    async (r, ...n) => {
      const [a, s, i] = r;
      if (!i)
        return orca.notify("error", "无法获取光标位置"), null;
      const c = await Kl(i, t);
      return c ? { ret: c, undoArgs: c } : null;
    },
    async (r) => {
      !r || !r.blockId || console.log(`[${t}] Topic 卡片撤销：块 #${r.blockId}`);
    },
    {
      label: "SRS: 创建 Topic 卡片",
      hasArgs: !1
    }
  ), orca.commands.registerEditorCommand(
    `${e}.createExtract`,
    async (r, ...n) => {
      const [a, s, i] = r;
      if (!i)
        return orca.notify("error", "无法获取光标位置"), null;
      const c = await Gl(i, t);
      return c ? { ret: c, undoArgs: c } : null;
    },
    async (r) => {
      if (!(!r || !r.extractBlockId))
        try {
          await orca.commands.invokeEditorCommand(
            "core.editor.deleteBlocks",
            null,
            [r.extractBlockId]
          ), console.log(`[${t}] 已撤销摘录：删除块 #${r.extractBlockId}`);
        } catch (n) {
          console.error(`[${t}] 撤销摘录失败:`, n);
        }
    },
    {
      label: "SRS: 创建摘录（Extract）",
      hasArgs: !1
    }
  ), orca.commands.registerEditorCommand(
    `${e}.createListCard`,
    async (r, ...n) => {
      const [a, s, i] = r;
      if (!i)
        return orca.notify("error", "无法获取光标位置"), null;
      const c = await Rl(i, t);
      return c ? { ret: c, undoArgs: c } : null;
    },
    async (r) => {
      !r || !r.blockId || console.log(`[${t}] 列表卡撤销：块 #${r.blockId}`);
    },
    {
      label: "SRS: 创建列表卡",
      hasArgs: !1
    }
  ), orca.commands.registerEditorCommand(
    `${e}.createDirectionForward`,
    async (r, ...n) => {
      const [a, s, i] = r;
      if (!i)
        return orca.notify("error", "无法获取光标位置"), null;
      const c = await _a(i, "forward", t);
      return c ? { ret: c, undoArgs: c } : null;
    },
    async (r) => {
      !r || !r.blockId || !orca.state.blocks[r.blockId] || r.originalContent && await orca.commands.invokeEditorCommand(
        "core.editor.setBlocksContent",
        null,
        [
          {
            id: r.blockId,
            content: r.originalContent
          }
        ],
        !1
      );
    },
    {
      label: "SRS: 创建正向方向卡 →",
      hasArgs: !1
    }
  ), orca.commands.registerEditorCommand(
    `${e}.createDirectionBackward`,
    async (r, ...n) => {
      const [a, s, i] = r;
      if (!i)
        return orca.notify("error", "无法获取光标位置"), null;
      const c = await _a(i, "backward", t);
      return c ? { ret: c, undoArgs: c } : null;
    },
    async (r) => {
      !r || !r.blockId || !orca.state.blocks[r.blockId] || r.originalContent && await orca.commands.invokeEditorCommand(
        "core.editor.setBlocksContent",
        null,
        [
          {
            id: r.blockId,
            content: r.originalContent
          }
        ],
        !1
      );
    },
    {
      label: "SRS: 创建反向方向卡 ←",
      hasArgs: !1
    }
  ), orca.commands.registerEditorCommand(
    `${e}.makeAICard`,
    async (r, ...n) => {
      const [a, s, i] = r;
      if (!i)
        return orca.notify("error", "无法获取光标位置"), null;
      const c = await Zl(i, t);
      return c ? { ret: c, undoArgs: c } : null;
    },
    async (r) => {
      if (!(!r || !r.blockId))
        try {
          await orca.commands.invokeEditorCommand(
            "core.editor.deleteBlocks",
            null,
            [r.blockId]
          ), console.log(`[${t}] 已撤销 AI 卡片：删除块 #${r.blockId}`);
        } catch (n) {
          console.error(`[${t}] 撤销 AI 卡片失败:`, n);
        }
    },
    {
      label: "SRS: AI 生成记忆卡片",
      hasArgs: !1
    }
  ), orca.commands.registerCommand(
    `${e}.testAIConnection`,
    async () => {
      console.log(`[${t}] 测试 AI 连接`), orca.notify("info", "正在测试 AI 连接...", { title: "AI 连接测试" });
      const r = await rd(t);
      r.success ? orca.notify("success", r.message, { title: "AI 连接测试" }) : (orca.notify("error", r.message, { title: "AI 连接测试失败" }), console.error("[AI 连接测试] 详细信息:", r.details));
    },
    "SRS: 测试 AI 连接"
  ), orca.commands.registerEditorCommand(
    `${e}.interactiveAICard`,
    async (r, ...n) => {
      const [a, s, i] = r;
      if (!i)
        return orca.notify("error", "无法获取光标位置"), null;
      const { startInteractiveCardCreationNew: c } = await Promise.resolve().then(() => gg);
      return await c(i, t), null;
    },
    async (r) => {
      console.log(`[${t}] AI 智能制卡撤销（暂不支持批量撤销）`);
    },
    {
      label: "SRS: AI 智能制卡（交互式）",
      hasArgs: !1
    }
  ), orca.commands.registerCommand(
    `${e}.openOldReviewPanel`,
    async () => {
      console.log(`[${t}] 打开旧复习面板`);
      const { startReviewSession: r } = await Promise.resolve().then(() => He);
      await r();
    },
    "SRS: 打开旧复习面板"
  ), orca.commands.registerCommand(
    `${e}.openFlashcardHome`,
    async () => {
      console.log(`[${t}] 打开 Flash Home`);
      const { openFlashcardHome: r } = await Promise.resolve().then(() => He);
      await r();
    },
    "SRS: 打开 Flash Home"
  ), orca.commands.registerCommand(
    `${e}.startIncrementalReadingSession`,
    async () => {
      console.log(`[${t}] 打开渐进阅读面板`);
      const { startIncrementalReadingSession: r } = await Promise.resolve().then(() => He);
      await r();
    },
    "SRS: 打开渐进阅读面板"
  ), orca.commands.registerCommand(
    `${e}.openIRManager`,
    async () => {
      console.log(`[${t}] 打开渐进阅读管理面板`);
      const { openIRManager: r } = await Promise.resolve().then(() => He);
      await r();
    },
    "SRS: 渐进阅读管理面板"
  ), orca.commands.registerCommand(
    `${e}.toggleAutoExtractMark`,
    async () => {
      const { enableAutoExtractMark: r } = dt(t), n = !r;
      try {
        await orca.plugins.setSettings("app", t, {
          [Ce.enableAutoExtractMark]: n
        }), n ? ua(t) : an(t);
        const a = n ? "启用" : "禁用";
        orca.notify("success", `渐进阅读自动标签已${a}`, { title: "渐进阅读" });
      } catch (a) {
        console.error(`[${t}] 切换渐进阅读自动标签失败:`, a), orca.notify("error", `切换渐进阅读自动标签失败: ${a}`, { title: "渐进阅读" });
      }
    },
    "SRS: 切换渐进阅读自动标签"
  ), orca.commands.registerEditorCommand(
    `${e}.irRecordProgress`,
    async (r, ...n) => {
      var f, p, g;
      const [a, s, i] = r;
      if (!i)
        return orca.notify("error", "无法获取光标位置", { title: "渐进阅读" }), null;
      const c = i.focus.blockId;
      let d = null, l = (f = orca.state.blocks) == null ? void 0 : f[c], x = 0;
      for (; l && x < 200; ) {
        if ((p = l.refs) == null ? void 0 : p.some((v) => v.type === 2 && ve(v.alias))) {
          d = l.id;
          break;
        }
        if (!l.parent) break;
        l = (g = orca.state.blocks) == null ? void 0 : g[l.parent], x += 1;
      }
      if (!d)
        return orca.notify("warn", "未找到包含 #card 的父块，无法记录渐进阅读进度", { title: "渐进阅读" }), null;
      const u = await qe(d);
      return await Nn(d, c), orca.notify("success", `已记录阅读进度：#${c}`, { title: "渐进阅读" }), {
        ret: { cardId: d, resumeBlockId: c },
        undoArgs: { cardId: d, prevResumeBlockId: u.resumeBlockId }
      };
    },
    async (r) => {
      !r || typeof r.cardId != "number" || await Nn(r.cardId, r.prevResumeBlockId ?? null);
    },
    {
      label: "IR: 记录阅读进度（ir_record）",
      hasArgs: !1
    }
  );
}
function sd(e) {
  orca.commands.unregisterCommand(`${e}.scanCardsFromTags`), orca.commands.unregisterEditorCommand(`${e}.makeCardFromBlock`), orca.commands.unregisterEditorCommand(`${e}.createCloze`), orca.commands.unregisterEditorCommand(`${e}.clearClozeFormat`), orca.commands.unregisterEditorCommand(`${e}.createClozeSameNumber`), orca.commands.unregisterEditorCommand(`${e}.createTopicCard`), orca.commands.unregisterEditorCommand(`${e}.createExtract`), orca.commands.unregisterEditorCommand(`${e}.createListCard`), orca.commands.unregisterEditorCommand(`${e}.createDirectionForward`), orca.commands.unregisterEditorCommand(`${e}.createDirectionBackward`), orca.commands.unregisterEditorCommand(`${e}.makeAICard`), orca.commands.unregisterEditorCommand(`${e}.interactiveAICard`), orca.commands.unregisterEditorCommand(`${e}.irRecordProgress`), orca.commands.unregisterCommand(`${e}.testAIConnection`), orca.commands.unregisterCommand(`${e}.openOldReviewPanel`), orca.commands.unregisterCommand(`${e}.openFlashcardHome`), orca.commands.unregisterCommand(`${e}.startIncrementalReadingSession`), orca.commands.unregisterCommand(`${e}.openIRManager`), orca.commands.unregisterCommand(`${e}.toggleAutoExtractMark`);
}
var gi = { exports: {} };
const id = React;
var Cr = {}, La;
function cd() {
  if (La) return Cr;
  La = 1;
  /**
   * @license React
   * react-jsx-runtime.development.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */
  return function() {
    var e = id, t = Symbol.for("react.element"), r = Symbol.for("react.portal"), n = Symbol.for("react.fragment"), a = Symbol.for("react.strict_mode"), s = Symbol.for("react.profiler"), i = Symbol.for("react.provider"), c = Symbol.for("react.context"), d = Symbol.for("react.forward_ref"), l = Symbol.for("react.suspense"), x = Symbol.for("react.suspense_list"), u = Symbol.for("react.memo"), f = Symbol.for("react.lazy"), p = Symbol.for("react.offscreen"), g = Symbol.iterator, y = "@@iterator";
    function v(b) {
      if (b === null || typeof b != "object")
        return null;
      var H = g && b[g] || b[y];
      return typeof H == "function" ? H : null;
    }
    var h = e.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    function S(b) {
      {
        for (var H = arguments.length, V = new Array(H > 1 ? H - 1 : 0), ee = 1; ee < H; ee++)
          V[ee - 1] = arguments[ee];
        $("error", b, V);
      }
    }
    function $(b, H, V) {
      {
        var ee = h.ReactDebugCurrentFrame, xe = ee.getStackAddendum();
        xe !== "" && (H += "%s", V = V.concat([xe]));
        var ye = V.map(function(ue) {
          return String(ue);
        });
        ye.unshift("Warning: " + H), Function.prototype.apply.call(console[b], console, ye);
      }
    }
    var k = !1, C = !1, P = !1, E = !1, O = !1, j;
    j = Symbol.for("react.module.reference");
    function B(b) {
      return !!(typeof b == "string" || typeof b == "function" || b === n || b === s || O || b === a || b === l || b === x || E || b === p || k || C || P || typeof b == "object" && b !== null && (b.$$typeof === f || b.$$typeof === u || b.$$typeof === i || b.$$typeof === c || b.$$typeof === d || // This needs to include all possible module reference object
      // types supported by any Flight configuration anywhere since
      // we don't know which Flight build this will end up being used
      // with.
      b.$$typeof === j || b.getModuleId !== void 0));
    }
    function z(b, H, V) {
      var ee = b.displayName;
      if (ee)
        return ee;
      var xe = H.displayName || H.name || "";
      return xe !== "" ? V + "(" + xe + ")" : V;
    }
    function M(b) {
      return b.displayName || "Context";
    }
    function R(b) {
      if (b == null)
        return null;
      if (typeof b.tag == "number" && S("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), typeof b == "function")
        return b.displayName || b.name || null;
      if (typeof b == "string")
        return b;
      switch (b) {
        case n:
          return "Fragment";
        case r:
          return "Portal";
        case s:
          return "Profiler";
        case a:
          return "StrictMode";
        case l:
          return "Suspense";
        case x:
          return "SuspenseList";
      }
      if (typeof b == "object")
        switch (b.$$typeof) {
          case c:
            var H = b;
            return M(H) + ".Consumer";
          case i:
            var V = b;
            return M(V._context) + ".Provider";
          case d:
            return z(b, b.render, "ForwardRef");
          case u:
            var ee = b.displayName || null;
            return ee !== null ? ee : R(b.type) || "Memo";
          case f: {
            var xe = b, ye = xe._payload, ue = xe._init;
            try {
              return R(ue(ye));
            } catch {
              return null;
            }
          }
        }
      return null;
    }
    var A = Object.assign, T = 0, w, N, F, D, m, _, G;
    function X() {
    }
    X.__reactDisabledLog = !0;
    function pe() {
      {
        if (T === 0) {
          w = console.log, N = console.info, F = console.warn, D = console.error, m = console.group, _ = console.groupCollapsed, G = console.groupEnd;
          var b = {
            configurable: !0,
            enumerable: !0,
            value: X,
            writable: !0
          };
          Object.defineProperties(console, {
            info: b,
            log: b,
            warn: b,
            error: b,
            group: b,
            groupCollapsed: b,
            groupEnd: b
          });
        }
        T++;
      }
    }
    function J() {
      {
        if (T--, T === 0) {
          var b = {
            configurable: !0,
            enumerable: !0,
            writable: !0
          };
          Object.defineProperties(console, {
            log: A({}, b, {
              value: w
            }),
            info: A({}, b, {
              value: N
            }),
            warn: A({}, b, {
              value: F
            }),
            error: A({}, b, {
              value: D
            }),
            group: A({}, b, {
              value: m
            }),
            groupCollapsed: A({}, b, {
              value: _
            }),
            groupEnd: A({}, b, {
              value: G
            })
          });
        }
        T < 0 && S("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
      }
    }
    var ae = h.ReactCurrentDispatcher, W;
    function q(b, H, V) {
      {
        if (W === void 0)
          try {
            throw Error();
          } catch (xe) {
            var ee = xe.stack.trim().match(/\n( *(at )?)/);
            W = ee && ee[1] || "";
          }
        return `
` + W + b;
      }
    }
    var Q = !1, ie;
    {
      var I = typeof WeakMap == "function" ? WeakMap : Map;
      ie = new I();
    }
    function ge(b, H) {
      if (!b || Q)
        return "";
      {
        var V = ie.get(b);
        if (V !== void 0)
          return V;
      }
      var ee;
      Q = !0;
      var xe = Error.prepareStackTrace;
      Error.prepareStackTrace = void 0;
      var ye;
      ye = ae.current, ae.current = null, pe();
      try {
        if (H) {
          var ue = function() {
            throw Error();
          };
          if (Object.defineProperty(ue.prototype, "props", {
            set: function() {
              throw Error();
            }
          }), typeof Reflect == "object" && Reflect.construct) {
            try {
              Reflect.construct(ue, []);
            } catch (Ne) {
              ee = Ne;
            }
            Reflect.construct(b, [], ue);
          } else {
            try {
              ue.call();
            } catch (Ne) {
              ee = Ne;
            }
            b.call(ue.prototype);
          }
        } else {
          try {
            throw Error();
          } catch (Ne) {
            ee = Ne;
          }
          b();
        }
      } catch (Ne) {
        if (Ne && ee && typeof Ne.stack == "string") {
          for (var le = Ne.stack.split(`
`), Pe = ee.stack.split(`
`), ke = le.length - 1, Re = Pe.length - 1; ke >= 1 && Re >= 0 && le[ke] !== Pe[Re]; )
            Re--;
          for (; ke >= 1 && Re >= 0; ke--, Re--)
            if (le[ke] !== Pe[Re]) {
              if (ke !== 1 || Re !== 1)
                do
                  if (ke--, Re--, Re < 0 || le[ke] !== Pe[Re]) {
                    var Ge = `
` + le[ke].replace(" at new ", " at ");
                    return b.displayName && Ge.includes("<anonymous>") && (Ge = Ge.replace("<anonymous>", b.displayName)), typeof b == "function" && ie.set(b, Ge), Ge;
                  }
                while (ke >= 1 && Re >= 0);
              break;
            }
        }
      } finally {
        Q = !1, ae.current = ye, J(), Error.prepareStackTrace = xe;
      }
      var tr = b ? b.displayName || b.name : "", It = tr ? q(tr) : "";
      return typeof b == "function" && ie.set(b, It), It;
    }
    function fe(b, H, V) {
      return ge(b, !1);
    }
    function Te(b) {
      var H = b.prototype;
      return !!(H && H.isReactComponent);
    }
    function $e(b, H, V) {
      if (b == null)
        return "";
      if (typeof b == "function")
        return ge(b, Te(b));
      if (typeof b == "string")
        return q(b);
      switch (b) {
        case l:
          return q("Suspense");
        case x:
          return q("SuspenseList");
      }
      if (typeof b == "object")
        switch (b.$$typeof) {
          case d:
            return fe(b.render);
          case u:
            return $e(b.type, H, V);
          case f: {
            var ee = b, xe = ee._payload, ye = ee._init;
            try {
              return $e(ye(xe), H, V);
            } catch {
            }
          }
        }
      return "";
    }
    var Ke = Object.prototype.hasOwnProperty, Ct = {}, pt = h.ReactDebugCurrentFrame;
    function Ue(b) {
      if (b) {
        var H = b._owner, V = $e(b.type, b._source, H ? H.type : null);
        pt.setExtraStackFrame(V);
      } else
        pt.setExtraStackFrame(null);
    }
    function Zt(b, H, V, ee, xe) {
      {
        var ye = Function.call.bind(Ke);
        for (var ue in b)
          if (ye(b, ue)) {
            var le = void 0;
            try {
              if (typeof b[ue] != "function") {
                var Pe = Error((ee || "React class") + ": " + V + " type `" + ue + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof b[ue] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                throw Pe.name = "Invariant Violation", Pe;
              }
              le = b[ue](H, ue, ee, V, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
            } catch (ke) {
              le = ke;
            }
            le && !(le instanceof Error) && (Ue(xe), S("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", ee || "React class", V, ue, typeof le), Ue(null)), le instanceof Error && !(le.message in Ct) && (Ct[le.message] = !0, Ue(xe), S("Failed %s type: %s", V, le.message), Ue(null));
          }
      }
    }
    var hr = Array.isArray;
    function xt(b) {
      return hr(b);
    }
    function oo(b) {
      {
        var H = typeof Symbol == "function" && Symbol.toStringTag, V = H && b[Symbol.toStringTag] || b.constructor.name || "Object";
        return V;
      }
    }
    function L(b) {
      try {
        return K(b), !1;
      } catch {
        return !0;
      }
    }
    function K(b) {
      return "" + b;
    }
    function se(b) {
      if (L(b))
        return S("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", oo(b)), K(b);
    }
    var Z = h.ReactCurrentOwner, de = {
      key: !0,
      ref: !0,
      __self: !0,
      __source: !0
    }, ne, oe;
    function ce(b) {
      if (Ke.call(b, "ref")) {
        var H = Object.getOwnPropertyDescriptor(b, "ref").get;
        if (H && H.isReactWarning)
          return !1;
      }
      return b.ref !== void 0;
    }
    function De(b) {
      if (Ke.call(b, "key")) {
        var H = Object.getOwnPropertyDescriptor(b, "key").get;
        if (H && H.isReactWarning)
          return !1;
      }
      return b.key !== void 0;
    }
    function Ve(b, H) {
      typeof b.ref == "string" && Z.current;
    }
    function zt(b, H) {
      {
        var V = function() {
          ne || (ne = !0, S("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", H));
        };
        V.isReactWarning = !0, Object.defineProperty(b, "key", {
          get: V,
          configurable: !0
        });
      }
    }
    function he(b, H) {
      {
        var V = function() {
          oe || (oe = !0, S("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", H));
        };
        V.isReactWarning = !0, Object.defineProperty(b, "ref", {
          get: V,
          configurable: !0
        });
      }
    }
    var cn = function(b, H, V, ee, xe, ye, ue) {
      var le = {
        // This tag allows us to uniquely identify this as a React Element
        $$typeof: t,
        // Built-in properties that belong on the element
        type: b,
        key: H,
        ref: V,
        props: ue,
        // Record the component responsible for creating this element.
        _owner: ye
      };
      return le._store = {}, Object.defineProperty(le._store, "validated", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: !1
      }), Object.defineProperty(le, "_self", {
        configurable: !1,
        enumerable: !1,
        writable: !1,
        value: ee
      }), Object.defineProperty(le, "_source", {
        configurable: !1,
        enumerable: !1,
        writable: !1,
        value: xe
      }), Object.freeze && (Object.freeze(le.props), Object.freeze(le)), le;
    };
    function ln(b, H, V, ee, xe) {
      {
        var ye, ue = {}, le = null, Pe = null;
        V !== void 0 && (se(V), le = "" + V), De(H) && (se(H.key), le = "" + H.key), ce(H) && (Pe = H.ref, Ve(H, xe));
        for (ye in H)
          Ke.call(H, ye) && !de.hasOwnProperty(ye) && (ue[ye] = H[ye]);
        if (b && b.defaultProps) {
          var ke = b.defaultProps;
          for (ye in ke)
            ue[ye] === void 0 && (ue[ye] = ke[ye]);
        }
        if (le || Pe) {
          var Re = typeof b == "function" ? b.displayName || b.name || "Unknown" : b;
          le && zt(ue, Re), Pe && he(ue, Re);
        }
        return cn(b, le, Pe, xe, ee, Z.current, ue);
      }
    }
    var yr = h.ReactCurrentOwner, be = h.ReactDebugCurrentFrame;
    function gt(b) {
      if (b) {
        var H = b._owner, V = $e(b.type, b._source, H ? H.type : null);
        be.setExtraStackFrame(V);
      } else
        be.setExtraStackFrame(null);
    }
    var ht;
    ht = !1;
    function er(b) {
      return typeof b == "object" && b !== null && b.$$typeof === t;
    }
    function mr() {
      {
        if (yr.current) {
          var b = R(yr.current.type);
          if (b)
            return `

Check the render method of \`` + b + "`.";
        }
        return "";
      }
    }
    function vr(b) {
      return "";
    }
    var Ee = {};
    function Ae(b) {
      {
        var H = mr();
        if (!H) {
          var V = typeof b == "string" ? b : b.displayName || b.name;
          V && (H = `

Check the top-level render call using <` + V + ">.");
        }
        return H;
      }
    }
    function kt(b, H) {
      {
        if (!b._store || b._store.validated || b.key != null)
          return;
        b._store.validated = !0;
        var V = Ae(H);
        if (Ee[V])
          return;
        Ee[V] = !0;
        var ee = "";
        b && b._owner && b._owner !== yr.current && (ee = " It was passed a child from " + R(b._owner.type) + "."), gt(b), S('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', V, ee), gt(null);
      }
    }
    function jt(b, H) {
      {
        if (typeof b != "object")
          return;
        if (xt(b))
          for (var V = 0; V < b.length; V++) {
            var ee = b[V];
            er(ee) && kt(ee, H);
          }
        else if (er(b))
          b._store && (b._store.validated = !0);
        else if (b) {
          var xe = v(b);
          if (typeof xe == "function" && xe !== b.entries)
            for (var ye = xe.call(b), ue; !(ue = ye.next()).done; )
              er(ue.value) && kt(ue.value, H);
        }
      }
    }
    function br(b) {
      {
        var H = b.type;
        if (H == null || typeof H == "string")
          return;
        var V;
        if (typeof H == "function")
          V = H.propTypes;
        else if (typeof H == "object" && (H.$$typeof === d || // Note: Memo only checks outer props here.
        // Inner props are checked in the reconciler.
        H.$$typeof === u))
          V = H.propTypes;
        else
          return;
        if (V) {
          var ee = R(H);
          Zt(V, b.props, "prop", ee, b);
        } else if (H.PropTypes !== void 0 && !ht) {
          ht = !0;
          var xe = R(H);
          S("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", xe || "Unknown");
        }
        typeof H.getDefaultProps == "function" && !H.getDefaultProps.isReactClassApproved && S("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
      }
    }
    function lc(b) {
      {
        for (var H = Object.keys(b.props), V = 0; V < H.length; V++) {
          var ee = H[V];
          if (ee !== "children" && ee !== "key") {
            gt(b), S("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", ee), gt(null);
            break;
          }
        }
        b.ref !== null && (gt(b), S("Invalid attribute `ref` supplied to `React.Fragment`."), gt(null));
      }
    }
    var ka = {};
    function ja(b, H, V, ee, xe, ye) {
      {
        var ue = B(b);
        if (!ue) {
          var le = "";
          (b === void 0 || typeof b == "object" && b !== null && Object.keys(b).length === 0) && (le += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.");
          var Pe = vr();
          Pe ? le += Pe : le += mr();
          var ke;
          b === null ? ke = "null" : xt(b) ? ke = "array" : b !== void 0 && b.$$typeof === t ? (ke = "<" + (R(b.type) || "Unknown") + " />", le = " Did you accidentally export a JSX literal instead of a component?") : ke = typeof b, S("React.jsx: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", ke, le);
        }
        var Re = ln(b, H, V, xe, ye);
        if (Re == null)
          return Re;
        if (ue) {
          var Ge = H.children;
          if (Ge !== void 0)
            if (ee)
              if (xt(Ge)) {
                for (var tr = 0; tr < Ge.length; tr++)
                  jt(Ge[tr], b);
                Object.freeze && Object.freeze(Ge);
              } else
                S("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
            else
              jt(Ge, b);
        }
        if (Ke.call(H, "key")) {
          var It = R(b), Ne = Object.keys(H).filter(function(gc) {
            return gc !== "key";
          }), dn = Ne.length > 0 ? "{key: someKey, " + Ne.join(": ..., ") + ": ...}" : "{key: someKey}";
          if (!ka[It + dn]) {
            var xc = Ne.length > 0 ? "{" + Ne.join(": ..., ") + ": ...}" : "{}";
            S(`A props object containing a "key" prop is being spread into JSX:
  let props = %s;
  <%s {...props} />
React keys must be passed directly to JSX without using spread:
  let props = %s;
  <%s key={someKey} {...props} />`, dn, It, xc, It), ka[It + dn] = !0;
          }
        }
        return b === n ? lc(Re) : br(Re), Re;
      }
    }
    function dc(b, H, V) {
      return ja(b, H, V, !0);
    }
    function uc(b, H, V) {
      return ja(b, H, V, !1);
    }
    var fc = uc, pc = dc;
    Cr.Fragment = n, Cr.jsx = fc, Cr.jsxs = pc;
  }(), Cr;
}
gi.exports = cd();
var o = gi.exports;
const { proxy: ld } = window.Valtio, vt = ld({
  isOpen: !1,
  knowledgePoints: [],
  originalContent: "",
  sourceBlockId: null
});
function dd(e, t, r) {
  vt.knowledgePoints = e, vt.originalContent = t, vt.sourceBlockId = r, vt.isOpen = !0;
}
function ud() {
  vt.isOpen = !1, setTimeout(() => {
    vt.knowledgePoints = [], vt.originalContent = "", vt.sourceBlockId = null;
  }, 300);
}
const { useState: io, useMemo: fd } = window.React;
function pd(e) {
  const { visible: t, onClose: r, knowledgePoints: n, originalContent: a, onGenerate: s } = e, { ModalOverlay: i, Checkbox: c, Button: d } = orca.components, [l, x] = io(
    new Set(n.filter((k) => k.recommended).map((k) => k.id))
  ), [u, f] = io(""), [p, g] = io("basic"), [y, v] = io(!1), h = (k, C) => {
    const P = new Set(l);
    C ? P.add(k) : P.delete(k), x(P);
  }, S = fd(() => {
    let k = l.size;
    return u.trim() && (k += 1), k;
  }, [l, u]), $ = async () => {
    if (l.size === 0 && !u.trim()) {
      orca.notify("warn", "请至少选择一个知识点或输入自定义内容");
      return;
    }
    v(!0);
    try {
      await s({
        selectedKnowledgePoints: Array.from(l),
        customInput: u.trim(),
        cardType: p
      }), r();
    } catch (k) {
      console.error("[AI Card Generation Dialog] 生成失败:", k), orca.notify("error", "生成卡片失败，请重试");
    } finally {
      v(!1);
    }
  };
  return t ? /* @__PURE__ */ o.jsx(i, { visible: t, canClose: !y, onClose: r, children: /* @__PURE__ */ o.jsxs(
    "div",
    {
      style: {
        background: "var(--orca-bg-primary, #ffffff)",
        borderRadius: "12px",
        padding: "24px",
        maxWidth: "600px",
        maxHeight: "80vh",
        overflowY: "auto",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
        border: "1px solid var(--orca-border, #e0e0e0)",
        backdropFilter: "blur(10px)"
      },
      className: "ai-card-dialog",
      children: [
        /* @__PURE__ */ o.jsx("h2", { style: {
          margin: "0 0 20px 0",
          fontSize: "20px",
          fontWeight: 600,
          color: "var(--orca-text-primary, #333)",
          borderBottom: "2px solid var(--orca-border, #e0e0e0)",
          paddingBottom: "12px"
        }, children: "🤖 AI 智能制卡" }),
        /* @__PURE__ */ o.jsxs(
          "div",
          {
            style: {
              background: "var(--orca-bg-secondary, #f5f5f5)",
              padding: "12px",
              borderRadius: "8px",
              marginBottom: "20px",
              border: "1px solid var(--orca-border, #e0e0e0)"
            },
            children: [
              /* @__PURE__ */ o.jsx("strong", { style: { fontSize: "14px", color: "var(--orca-text-primary, #333)" }, children: "原始内容：" }),
              /* @__PURE__ */ o.jsx("p", { style: { margin: "8px 0 0 0", fontSize: "14px", lineHeight: "1.5", color: "var(--orca-text-primary, #333)" }, children: a })
            ]
          }
        ),
        /* @__PURE__ */ o.jsxs("div", { style: { marginBottom: "20px" }, children: [
          /* @__PURE__ */ o.jsx("h3", { style: {
            margin: "0 0 12px 0",
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--orca-text-primary, #333)"
          }, children: "检测到的知识点：" }),
          n.length === 0 ? /* @__PURE__ */ o.jsx("p", { style: { color: "var(--orca-text-secondary)", fontSize: "14px" }, children: "未检测到知识点，请使用自定义输入" }) : /* @__PURE__ */ o.jsx("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: n.map((k) => /* @__PURE__ */ o.jsxs(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                padding: "12px",
                border: "1px solid var(--orca-border, #e0e0e0)",
                borderRadius: "8px",
                transition: "all 0.2s",
                cursor: "pointer",
                background: l.has(k.id) ? "var(--orca-bg-secondary, #f0f7ff)" : "var(--orca-bg-primary, #ffffff)"
              },
              onMouseEnter: (C) => {
                l.has(k.id) || (C.currentTarget.style.background = "var(--orca-bg-hover, #f5f5f5)");
              },
              onMouseLeave: (C) => {
                C.currentTarget.style.background = l.has(k.id) ? "var(--orca-bg-secondary, #f0f7ff)" : "var(--orca-bg-primary, #ffffff)";
              },
              onClick: () => h(k.id, !l.has(k.id)),
              children: [
                /* @__PURE__ */ o.jsx(
                  c,
                  {
                    checked: l.has(k.id),
                    onChange: ({ checked: C }) => h(k.id, C)
                  }
                ),
                /* @__PURE__ */ o.jsxs("div", { style: { flex: 1, display: "flex", flexDirection: "column", gap: "4px" }, children: [
                  /* @__PURE__ */ o.jsxs("span", { style: { fontWeight: 500, fontSize: "14px", color: "var(--orca-text-primary, #333)" }, children: [
                    k.text,
                    k.recommended && /* @__PURE__ */ o.jsx("span", { style: {
                      marginLeft: "8px",
                      fontSize: "12px",
                      color: "var(--orca-color-primary, #0066cc)",
                      fontWeight: 400
                    }, children: "(推荐)" })
                  ] }),
                  k.description && /* @__PURE__ */ o.jsx("span", { style: { fontSize: "13px", color: "var(--orca-text-secondary, #666)" }, children: k.description }),
                  /* @__PURE__ */ o.jsxs("span", { style: { fontSize: "12px", color: "var(--orca-text-tertiary, #999)" }, children: [
                    "难度: ",
                    "⭐".repeat(k.difficulty || 3)
                  ] })
                ] })
              ]
            },
            k.id
          )) })
        ] }),
        /* @__PURE__ */ o.jsxs("div", { style: { marginBottom: "20px" }, children: [
          /* @__PURE__ */ o.jsx("h3", { style: {
            margin: "0 0 8px 0",
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--orca-text-primary, #333)"
          }, children: "自定义知识点：" }),
          /* @__PURE__ */ o.jsx(
            "input",
            {
              type: "text",
              value: u,
              onChange: (k) => f(k.target.value),
              placeholder: "输入其他想要学习的内容...",
              style: {
                width: "100%",
                padding: "10px",
                fontSize: "14px",
                borderRadius: "6px",
                border: "1px solid var(--orca-border, #d0d0d0)",
                backgroundColor: "var(--orca-bg-primary, #ffffff)",
                color: "var(--orca-text-primary, #333)",
                outline: "none",
                transition: "border-color 0.2s"
              },
              onFocus: (k) => {
                k.currentTarget.style.borderColor = "var(--orca-color-primary, #0066cc)";
              },
              onBlur: (k) => {
                k.currentTarget.style.borderColor = "var(--orca-border, #d0d0d0)";
              }
            }
          )
        ] }),
        /* @__PURE__ */ o.jsxs("div", { style: { marginBottom: "20px" }, children: [
          /* @__PURE__ */ o.jsx("h3", { style: {
            margin: "0 0 12px 0",
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--orca-text-primary, #333)"
          }, children: "卡片类型：" }),
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "12px" }, children: [
            /* @__PURE__ */ o.jsx(
              d,
              {
                variant: p === "basic" ? "solid" : "outline",
                onClick: () => g("basic"),
                style: { flex: 1, fontSize: "14px" },
                children: "📝 Basic Card（问答卡）"
              }
            ),
            /* @__PURE__ */ o.jsx(
              d,
              {
                variant: p === "cloze" ? "solid" : "outline",
                onClick: () => g("cloze"),
                style: { flex: 1, fontSize: "14px" },
                children: "🔤 Cloze Card（填空卡）"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }, children: [
          /* @__PURE__ */ o.jsx(
            d,
            {
              variant: "outline",
              onClick: r,
              style: { fontSize: "14px", opacity: y ? 0.5 : 1, pointerEvents: y ? "none" : "auto" },
              children: "取消"
            }
          ),
          /* @__PURE__ */ o.jsx(
            d,
            {
              variant: "solid",
              onClick: $,
              style: {
                fontSize: "14px",
                opacity: y || l.size === 0 && !u.trim() ? 0.5 : 1,
                pointerEvents: y || l.size === 0 && !u.trim() ? "none" : "auto"
              },
              children: y ? "生成中..." : `生成 ${S} 张卡片`
            }
          )
        ] })
      ]
    }
  ) }) : null;
}
const xd = `你是闪卡制作专家。请为以下知识点生成问答卡片。

原始内容：{{originalContent}}
知识点：{{knowledgePoints}}

要求：
1. 为每个知识点生成 1-2 张卡片
2. 遵循最小知识点原则（每张卡片只测试一个概念）
3. 问题要清晰、具体、可测试
4. 答案要简洁、准确
5. 如果是语法知识点，问题应该问"如何使用"或"什么意思"
6. 如果是概念定义，问题应该问"什么是"或"如何定义"

返回 JSON 格式（不要包含其他内容）：
{
  "cards": [
    {
      "question": "问题内容",
      "answer": "答案内容"
    }
  ]
}

示例：
输入知识点：["使役形（～させる）", "ない的否定用法"]
输出：
{
  "cards": [
    {
      "question": "使役形（～させる）的基本用法是什么？",
      "answer": "表示让某人做某事，动词变形规则：五段动词词尾变あ段+せる，一段动词去る+させる"
    },
    {
      "question": "ない在动词后面表示什么意思？",
      "answer": "表示否定，即不做某事"
    }
  ]
}`, gd = `你是闪卡制作专家。请为以下知识点生成填空卡片。

原始内容：{{originalContent}}
知识点：{{knowledgePoints}}

要求：
1. 为每个知识点生成 1-2 张填空卡
2. 选择关键词进行挖空
3. 确保挖空后的句子仍然有意义
4. 可以提供提示（hint）帮助记忆
5. 挖空的词应该是核心概念或关键术语

返回 JSON 格式（不要包含其他内容）：
{
  "cards": [
    {
      "text": "完整句子",
      "clozeText": "要挖空的词",
      "hint": "提示（可选）"
    }
  ]
}

示例：
输入知识点：["使役形（～させる）", "ない的否定用法"]
输出：
{
  "cards": [
    {
      "text": "使役形（～させる）表示让某人做某事",
      "clozeText": "～させる",
      "hint": "表示使役的语法形式"
    },
    {
      "text": "动词后面加ない表示否定",
      "clozeText": "ない",
      "hint": "否定助动词"
    }
  ]
}`;
function hd(e, t) {
  return xd.replace(/\{\{originalContent\}\}/g, t).replace(/\{\{knowledgePoints\}\}/g, JSON.stringify(e));
}
function yd(e, t) {
  return gd.replace(/\{\{originalContent\}\}/g, t).replace(/\{\{knowledgePoints\}\}/g, JSON.stringify(e));
}
function md(e) {
  try {
    const t = JSON.parse(e);
    if (t.cards && Array.isArray(t.cards)) {
      const r = t.cards.filter(
        (n) => n.question && n.answer
      );
      return r.length === 0 ? {
        success: !1,
        error: {
          code: "INVALID_FORMAT",
          message: "AI 返回的卡片格式不正确"
        }
      } : {
        success: !0,
        cards: r.map((n) => ({
          question: String(n.question).trim(),
          answer: String(n.answer).trim()
        }))
      };
    }
  } catch {
    const t = e.match(/\{[\s\S]*"cards"[\s\S]*\}/);
    if (t)
      try {
        const r = JSON.parse(t[0]);
        if (r.cards && Array.isArray(r.cards)) {
          const n = r.cards.filter(
            (a) => a.question && a.answer
          );
          if (n.length > 0)
            return {
              success: !0,
              cards: n.map((a) => ({
                question: String(a.question).trim(),
                answer: String(a.answer).trim()
              }))
            };
        }
      } catch {
      }
  }
  return {
    success: !1,
    error: {
      code: "PARSE_ERROR",
      message: "无法解析 AI 响应格式"
    }
  };
}
function vd(e) {
  try {
    const t = JSON.parse(e);
    if (t.cards && Array.isArray(t.cards)) {
      const r = t.cards.filter(
        (n) => n.text && n.clozeText
      );
      return r.length === 0 ? {
        success: !1,
        error: {
          code: "INVALID_FORMAT",
          message: "AI 返回的卡片格式不正确"
        }
      } : {
        success: !0,
        cards: r.map((n) => ({
          text: String(n.text).trim(),
          clozeText: String(n.clozeText).trim(),
          hint: n.hint ? String(n.hint).trim() : void 0
        }))
      };
    }
  } catch {
    const t = e.match(/\{[\s\S]*"cards"[\s\S]*\}/);
    if (t)
      try {
        const r = JSON.parse(t[0]);
        if (r.cards && Array.isArray(r.cards)) {
          const n = r.cards.filter(
            (a) => a.text && a.clozeText
          );
          if (n.length > 0)
            return {
              success: !0,
              cards: n.map((a) => ({
                text: String(a.text).trim(),
                clozeText: String(a.clozeText).trim(),
                hint: a.hint ? String(a.hint).trim() : void 0
              }))
            };
        }
      } catch {
      }
  }
  return {
    success: !1,
    error: {
      code: "PARSE_ERROR",
      message: "无法解析 AI 响应格式"
    }
  };
}
async function bd(e, t, r) {
  var s, i, c, d;
  const n = gr(e);
  if (!n.apiKey)
    return {
      success: !1,
      error: { code: "NO_API_KEY", message: "请先在设置中配置 API Key" }
    };
  const a = hd(t, r);
  console.log("[AI Card Generator] 生成 Basic Cards"), console.log(`[AI Card Generator] 知识点数量: ${t.length}`);
  try {
    const l = await fetch(n.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${n.apiKey}`
      },
      body: JSON.stringify({
        model: n.model,
        messages: [
          {
            role: "system",
            content: "你是一个闪卡制作专家。你的任务是根据知识点生成高质量的问答卡片。请严格以 JSON 格式返回结果。"
          },
          { role: "user", content: a }
        ],
        temperature: 0.7,
        max_tokens: 2e3
      })
    });
    if (!l.ok) {
      let p = `请求失败: ${l.status}`;
      try {
        p = ((s = (await l.json()).error) == null ? void 0 : s.message) || p;
      } catch {
      }
      return {
        success: !1,
        error: {
          code: `HTTP_${l.status}`,
          message: p
        }
      };
    }
    const u = (d = (c = (i = (await l.json()).choices) == null ? void 0 : i[0]) == null ? void 0 : c.message) == null ? void 0 : d.content;
    if (!u)
      return {
        success: !1,
        error: { code: "EMPTY_RESPONSE", message: "AI 返回内容为空" }
      };
    console.log(`[AI Card Generator] AI 响应: ${u}`);
    const f = md(u);
    return f.success && console.log(`[AI Card Generator] 成功生成 ${f.cards.length} 张 Basic Cards`), f;
  } catch (l) {
    const x = l instanceof Error ? l.message : "网络错误";
    return console.error(`[AI Card Generator] 网络错误: ${x}`), {
      success: !1,
      error: {
        code: "NETWORK_ERROR",
        message: x
      }
    };
  }
}
async function wd(e, t, r) {
  var s, i, c, d;
  const n = gr(e);
  if (!n.apiKey)
    return {
      success: !1,
      error: { code: "NO_API_KEY", message: "请先在设置中配置 API Key" }
    };
  const a = yd(t, r);
  console.log("[AI Card Generator] 生成 Cloze Cards"), console.log(`[AI Card Generator] 知识点数量: ${t.length}`);
  try {
    const l = await fetch(n.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${n.apiKey}`
      },
      body: JSON.stringify({
        model: n.model,
        messages: [
          {
            role: "system",
            content: "你是一个闪卡制作专家。你的任务是根据知识点生成高质量的填空卡片。请严格以 JSON 格式返回结果。"
          },
          { role: "user", content: a }
        ],
        temperature: 0.7,
        max_tokens: 2e3
      })
    });
    if (!l.ok) {
      let p = `请求失败: ${l.status}`;
      try {
        p = ((s = (await l.json()).error) == null ? void 0 : s.message) || p;
      } catch {
      }
      return {
        success: !1,
        error: {
          code: `HTTP_${l.status}`,
          message: p
        }
      };
    }
    const u = (d = (c = (i = (await l.json()).choices) == null ? void 0 : i[0]) == null ? void 0 : c.message) == null ? void 0 : d.content;
    if (!u)
      return {
        success: !1,
        error: { code: "EMPTY_RESPONSE", message: "AI 返回内容为空" }
      };
    console.log(`[AI Card Generator] AI 响应: ${u}`);
    const f = vd(u);
    return f.success && console.log(`[AI Card Generator] 成功生成 ${f.cards.length} 张 Cloze Cards`), f;
  } catch (l) {
    const x = l instanceof Error ? l.message : "网络错误";
    return console.error(`[AI Card Generator] 网络错误: ${x}`), {
      success: !1,
      error: {
        code: "NETWORK_ERROR",
        message: x
      }
    };
  }
}
const { Valtio: Sd } = window, { useSnapshot: Cd } = Sd;
function kd({ pluginName: e }) {
  const t = Cd(vt), r = async (n) => {
    if (!t.sourceBlockId) {
      orca.notify("error", "无法找到源块");
      return;
    }
    const a = orca.state.blocks[t.sourceBlockId];
    if (!a) {
      orca.notify("error", "源块不存在");
      return;
    }
    const s = t.knowledgePoints.filter((i) => n.selectedKnowledgePoints.includes(i.id)).map((i) => i.text);
    if (n.customInput && s.push(n.customInput), s.length === 0) {
      orca.notify("warn", "请至少选择一个知识点");
      return;
    }
    orca.notify("info", `正在生成 ${s.length} 个知识点的卡片...`, { title: "智能制卡" });
    try {
      let i;
      if (n.cardType === "basic") {
        const d = await bd(e, s, t.originalContent);
        if (!d.success) {
          orca.notify("error", d.error.message, { title: "生成失败" });
          return;
        }
        i = d.cards;
      } else {
        const d = await wd(e, s, t.originalContent);
        if (!d.success) {
          orca.notify("error", d.error.message, { title: "生成失败" });
          return;
        }
        i = d.cards;
      }
      if (i.length === 0) {
        orca.notify("warn", "AI 未生成任何卡片", { title: "智能制卡" });
        return;
      }
      await ut(e);
      let c = 0;
      for (const d of i)
        try {
          n.cardType === "basic" ? (await jd(a, d, e), c++) : (await Rd(a, d, e), c++);
        } catch (l) {
          console.error("[AI Dialog Mount] 插入卡片失败:", l);
        }
      c > 0 ? orca.notify("success", `成功生成 ${c} 张卡片`, { title: "智能制卡" }) : orca.notify("error", "所有卡片插入失败", { title: "智能制卡" });
    } catch (i) {
      console.error("[AI Dialog Mount] 生成卡片失败:", i), orca.notify("error", "生成卡片失败，请重试", { title: "智能制卡" });
    }
  };
  return t.isOpen ? /* @__PURE__ */ o.jsx(
    pd,
    {
      visible: t.isOpen,
      onClose: ud,
      knowledgePoints: t.knowledgePoints,
      originalContent: t.originalContent,
      onGenerate: r
    }
  ) : null;
}
async function jd(e, t, r) {
  const n = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    e,
    "lastChild",
    [{ t: "t", v: t.question }]
  );
  if (!n)
    throw new Error("创建问题块失败");
  const a = orca.state.blocks[n];
  if (!a)
    throw new Error("无法获取问题块");
  if (!await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    a,
    "lastChild",
    [{ t: "t", v: t.answer }]
  ))
    throw await orca.commands.invokeEditorCommand(
      "core.editor.deleteBlocks",
      null,
      [n]
    ), new Error("创建答案块失败");
  await orca.commands.invokeEditorCommand(
    "core.editor.insertTag",
    null,
    n,
    "card",
    [
      { name: "type", value: "basic" },
      { name: "牌组", value: [] },
      { name: "status", value: "" }
    ]
  ), await Ze(n);
}
async function Rd(e, t, r) {
  const n = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    e,
    "lastChild",
    [{ t: "t", v: t.text }]
  );
  if (!n)
    throw new Error("创建填空卡块失败");
  const a = orca.state.blocks[n];
  if (!a)
    throw new Error("无法获取填空卡块");
  const s = t.text.indexOf(t.clozeText);
  if (s === -1)
    throw console.warn(`[AI Dialog Mount] 无法在文本中找到挖空词: "${t.clozeText}"`), await orca.commands.invokeEditorCommand(
      "core.editor.deleteBlocks",
      null,
      [n]
    ), new Error("无法定位挖空位置");
  const c = aa(a.content, r) + 1, d = t.text.substring(0, s), l = t.text.substring(s + t.clozeText.length), x = [];
  d && x.push({ t: "t", v: d }), x.push({
    t: `${r}.cloze`,
    v: t.clozeText,
    clozeNumber: c
  }), l && x.push({ t: "t", v: l }), await orca.commands.invokeEditorCommand(
    "core.editor.setBlockContent",
    null,
    n,
    x
  ), await orca.commands.invokeEditorCommand(
    "core.editor.insertTag",
    null,
    n,
    "card",
    [
      { name: "type", value: "cloze" },
      { name: "牌组", value: [] },
      { name: "status", value: "" }
    ]
  ), await Vr(n, c, 0);
}
const $d = 24 * 60 * 60 * 1e3;
function Dd() {
  const e = /* @__PURE__ */ new Date();
  return e.setHours(0, 0, 0, 0), e;
}
async function Oa(e) {
  var s;
  const t = /* @__PURE__ */ new Set(), r = [];
  function n(i) {
    const c = i.refs ?? [];
    for (const d of c) {
      if (d.type !== 1) continue;
      const l = d.to;
      typeof l == "number" && (t.has(l) || l !== e.id && (t.add(l), r.push(l)));
    }
  }
  n(e);
  const a = e.children ?? [];
  for (const i of a) {
    let c = (s = orca.state.blocks) == null ? void 0 : s[i];
    c || (c = await orca.invokeBackend("get-block", i)), c && n(c);
  }
  return r;
}
function Td(e, t) {
  if (!Number.isFinite(e) || e <= 0)
    return [];
  const r = Number.isFinite(t) ? Math.max(0, t) : 0, n = Dd(), a = e <= 1 ? 0 : r / (e - 1), s = [];
  let i = null;
  for (let c = 0; c < e; c++) {
    const d = c * a, l = Math.random() * 0.5, x = new Date(n.getTime() + (d + l) * $d);
    i && x.getTime() <= i.getTime() && x.setTime(i.getTime() + 60 * 1e3), s.push(x), i = x;
  }
  return s;
}
async function Ed(e, t, r) {
  var l, x, u;
  if (!Array.isArray(e) || e.length === 0)
    return { success: [], failed: [] };
  const n = Td(e.length, r), a = ft(
    Number.isFinite(t) ? t : Jt
  ), s = la(a), i = Date.now(), c = [], d = [];
  for (let f = 0; f < e.length; f++) {
    const p = e[f], g = n[f] ?? /* @__PURE__ */ new Date();
    try {
      const y = ((l = orca.state.blocks) == null ? void 0 : l[p]) || await orca.invokeBackend("get-block", p);
      if (!y)
        throw new Error(`未找到章节块 #${p}`);
      if (!(((x = y.refs) == null ? void 0 : x.some((h) => h.type === 2 && ve(h.alias))) ?? !1))
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          null,
          p,
          "card",
          [
            { name: "type", value: "topic" },
            { name: "牌组", value: [] },
            { name: "status", value: "" }
          ]
        );
      else {
        const h = (u = y.refs) == null ? void 0 : u.find((S) => S.type === 2 && ve(S.alias));
        h && await orca.commands.invokeEditorCommand(
          "core.editor.setRefData",
          null,
          h,
          [{ name: "type", value: "topic" }]
        );
      }
      await orca.commands.invokeEditorCommand(
        "core.editor.setProperties",
        null,
        [p],
        [
          { name: "ir.priority", value: a, type: 3 },
          { name: "ir.lastRead", value: null, type: 5 },
          { name: "ir.readCount", value: 0, type: 3 },
          { name: "ir.due", value: g, type: 5 },
          { name: "ir.intervalDays", value: s, type: 3 },
          { name: "ir.postponeCount", value: 0, type: 3 },
          { name: "ir.stage", value: "topic.preview", type: 2 },
          { name: "ir.lastAction", value: "init", type: 2 },
          // 维持章节顺序（越小越靠前），并尽量追加到现有 Topic 队列尾部
          { name: "ir.position", value: i + f, type: 3 },
          { name: "ir.resumeBlockId", value: null, type: 3 }
        ]
      ), en(p), c.push(p);
    } catch (y) {
      console.error("[BookIR] 初始化章节失败:", p, y), d.push(p);
    }
  }
  return { success: c, failed: d };
}
const { React: _d, Valtio: hi } = window, { useSnapshot: zd } = hi, { useMemo: Id, useState: gn } = _d, sr = hi.proxy({
  isOpen: !1,
  chapterIds: [],
  bookTitle: "",
  bookBlockId: null
});
function Md(e, t, r) {
  sr.isOpen = !0, sr.chapterIds = Array.isArray(e) ? e : [], sr.bookTitle = String(t ?? ""), sr.bookBlockId = typeof r == "number" ? r : null;
}
function co() {
  sr.isOpen = !1;
}
function Bd({ pluginName: e }) {
  var p;
  const t = zd(sr), { ModalOverlay: r, Button: n } = orca.components, a = ((p = t.chapterIds) == null ? void 0 : p.length) ?? 0, [s, i] = gn(50), [c, d] = gn(30), [l, x] = gn(!1), u = Id(() => `${(t.bookTitle || "未命名书籍").trim() || "未命名书籍"}（${a} 章）`, [t.bookTitle, a]), f = async () => {
    if (a === 0) {
      orca.notify("warn", "没有可处理的章节引用", { title: "渐进阅读" });
      return;
    }
    x(!0);
    try {
      await ut(e);
      const g = await Ed(t.chapterIds, s, c), y = g.success.length, v = g.failed.length;
      v === 0 ? orca.notify("success", `已初始化 ${y} 个章节`, { title: "渐进阅读" }) : orca.notify("warn", `已初始化 ${y} 个章节，失败 ${v} 个`, { title: "渐进阅读" }), co();
    } catch (g) {
      console.error("[IR Book Dialog] 批量初始化失败:", g), orca.notify("error", "批量初始化失败，请重试", { title: "渐进阅读" });
    } finally {
      x(!1);
    }
  };
  return t.isOpen ? /* @__PURE__ */ o.jsx(r, { visible: t.isOpen, canClose: !l, onClose: co, children: /* @__PURE__ */ o.jsxs(
    "div",
    {
      style: {
        background: "var(--orca-bg-primary, #ffffff)",
        borderRadius: "12px",
        padding: "20px",
        width: "min(520px, 92vw)",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
        border: "1px solid var(--orca-border, #e0e0e0)"
      },
      children: [
        /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }, children: [
          /* @__PURE__ */ o.jsxs("div", { children: [
            /* @__PURE__ */ o.jsx("div", { style: { fontSize: "18px", fontWeight: 600, color: "var(--orca-text-primary, #333)" }, children: "创建渐进阅读书籍" }),
            /* @__PURE__ */ o.jsx("div", { style: { fontSize: "13px", color: "var(--orca-text-secondary, #666)", marginTop: "4px" }, children: u })
          ] }),
          /* @__PURE__ */ o.jsx(
            n,
            {
              variant: "plain",
              "aria-disabled": l,
              onClick: () => {
                l || co();
              },
              title: "关闭",
              children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-x" })
            }
          )
        ] }),
        /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: [
          /* @__PURE__ */ o.jsxs("label", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "13px", color: "var(--orca-text-primary, #333)" }, children: "优先级（0-100）" }),
            /* @__PURE__ */ o.jsx(
              "input",
              {
                type: "number",
                min: 0,
                max: 100,
                step: 1,
                value: s,
                disabled: l,
                onChange: (g) => i(Math.min(100, Math.max(0, Number(g.target.value) || 0))),
                style: {
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid var(--orca-border, #d0d0d0)",
                  background: "var(--orca-bg-primary, #fff)",
                  color: "var(--orca-text-primary, #333)"
                }
              }
            )
          ] }),
          /* @__PURE__ */ o.jsxs("label", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "13px", color: "var(--orca-text-primary, #333)" }, children: "分散到期跨度（天）" }),
            /* @__PURE__ */ o.jsx(
              "input",
              {
                type: "number",
                min: 0,
                step: 1,
                value: c,
                disabled: l,
                onChange: (g) => d(Math.max(0, Number(g.target.value) || 0)),
                style: {
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid var(--orca-border, #d0d0d0)",
                  background: "var(--orca-bg-primary, #fff)",
                  color: "var(--orca-text-primary, #333)"
                }
              }
            )
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "6px" }, children: [
            /* @__PURE__ */ o.jsx(
              n,
              {
                variant: "plain",
                "aria-disabled": l,
                onClick: () => {
                  l || co();
                },
                children: "取消"
              }
            ),
            /* @__PURE__ */ o.jsx(
              n,
              {
                variant: "solid",
                "aria-disabled": l || a === 0,
                onClick: () => {
                  l || a === 0 || f();
                },
                children: l ? "处理中..." : "开始初始化"
              }
            )
          ] })
        ] })
      ]
    }
  ) }) : null;
}
function Ad(e) {
  orca.headbar.registerHeadbarButton(`${e}.aiDialogMount`, () => /* @__PURE__ */ o.jsx(kd, { pluginName: e })), orca.headbar.registerHeadbarButton(`${e}.irBookDialogMount`, () => /* @__PURE__ */ o.jsx(Bd, { pluginName: e })), orca.headbar.registerHeadbarButton(`${e}.reviewButton`, () => /* @__PURE__ */ o.jsx(
    orca.components.Button,
    {
      variant: "plain",
      tabIndex: -1,
      onClick: () => orca.commands.invokeCommand(`${e}.openOldReviewPanel`),
      title: "开始闪卡复习",
      children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-brain orca-headbar-icon" })
    }
  )), orca.headbar.registerHeadbarButton(`${e}.flashHomeButton`, () => /* @__PURE__ */ o.jsx(
    orca.components.Button,
    {
      variant: "plain",
      tabIndex: -1,
      onClick: () => orca.commands.invokeCommand(`${e}.openFlashcardHome`),
      title: "打开 Flash Home",
      children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-home orca-headbar-icon" })
    }
  )), orca.headbar.registerHeadbarButton(`${e}.incrementalReadingButton`, () => /* @__PURE__ */ o.jsx(
    orca.components.Button,
    {
      variant: "plain",
      tabIndex: -1,
      onClick: () => orca.commands.invokeCommand(`${e}.startIncrementalReadingSession`),
      title: "打开渐进阅读",
      children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-book-2 orca-headbar-icon" })
    }
  )), orca.toolbar.registerToolbarButton(`${e}.clozeSameNumberButton`, {
    icon: "ti ti-code-dots",
    tooltip: "创建同序 Cloze 填空",
    command: `${e}.createClozeSameNumber`
  }), orca.toolbar.registerToolbarButton(`${e}.clozeButton`, {
    icon: "ti ti-code-plus",
    tooltip: "创建 Cloze 填空",
    command: `${e}.createCloze`
  }), orca.toolbar.registerToolbarButton(`${e}.clearClozeButton`, {
    icon: "ti ti-eraser",
    tooltip: "清除挖空格式",
    command: `${e}.clearClozeFormat`
  }), orca.slashCommands.registerSlashCommand(`${e}.makeCard`, {
    icon: "ti ti-card-plus",
    group: "SRS",
    title: "转换为记忆卡片",
    command: `${e}.makeCardFromBlock`
  }), orca.slashCommands.registerSlashCommand(`${e}.listCard`, {
    icon: "ti ti-list-details",
    group: "SRS",
    title: "列表卡（子块作为条目）",
    command: `${e}.createListCard`
  }), orca.slashCommands.registerSlashCommand(`${e}.directionForward`, {
    icon: "ti ti-arrow-right",
    group: "SRS",
    title: "创建正向方向卡 → (光标位置分隔问答)",
    command: `${e}.createDirectionForward`
  }), orca.slashCommands.registerSlashCommand(`${e}.directionBackward`, {
    icon: "ti ti-arrow-left",
    group: "SRS",
    title: "创建反向方向卡 ← (光标位置分隔问答)",
    command: `${e}.createDirectionBackward`
  }), orca.slashCommands.registerSlashCommand(`${e}.aiCard`, {
    icon: "ti ti-robot",
    group: "SRS",
    title: "AI 生成记忆卡片",
    command: `${e}.makeAICard`
  }), orca.slashCommands.registerSlashCommand(`${e}.interactiveAI`, {
    icon: "ti ti-sparkles",
    group: "SRS",
    title: "AI 智能制卡（交互式）",
    command: `${e}.interactiveAICard`
  }), orca.slashCommands.registerSlashCommand(`${e}.ir`, {
    icon: "ti ti-book-2",
    group: "SRS",
    title: "IR：创建 Topic 卡片",
    command: `${e}.createTopicCard`
  }), orca.slashCommands.registerSlashCommand(`${e}.incrementalReading`, {
    icon: "ti ti-book-2",
    group: "SRS",
    title: "渐进阅读",
    command: `${e}.startIncrementalReadingSession`
  }), orca.slashCommands.registerSlashCommand(`${e}.ir_record`, {
    icon: "ti ti-bookmark",
    group: "SRS",
    title: "ir_record",
    command: `${e}.irRecordProgress`
  });
}
function Pd(e) {
  orca.headbar.unregisterHeadbarButton(`${e}.aiDialogMount`), orca.headbar.unregisterHeadbarButton(`${e}.irBookDialogMount`), orca.headbar.unregisterHeadbarButton(`${e}.reviewButton`), orca.headbar.unregisterHeadbarButton(`${e}.flashHomeButton`), orca.headbar.unregisterHeadbarButton(`${e}.incrementalReadingButton`), orca.toolbar.unregisterToolbarButton(`${e}.clozeButton`), orca.toolbar.unregisterToolbarButton(`${e}.clearClozeButton`), orca.toolbar.unregisterToolbarButton(`${e}.clozeSameNumberButton`), orca.slashCommands.unregisterSlashCommand(`${e}.makeCard`), orca.slashCommands.unregisterSlashCommand(`${e}.listCard`), orca.slashCommands.unregisterSlashCommand(`${e}.directionForward`), orca.slashCommands.unregisterSlashCommand(`${e}.directionBackward`), orca.slashCommands.unregisterSlashCommand(`${e}.aiCard`), orca.slashCommands.unregisterSlashCommand(`${e}.interactiveAI`), orca.slashCommands.unregisterSlashCommand(`${e}.ir`), orca.slashCommands.unregisterSlashCommand(`${e}.incrementalReading`), orca.slashCommands.unregisterSlashCommand(`${e}.ir_record`);
}
const { Component: Ld } = window.React, { Button: Fa } = orca.components;
class Xe extends Ld {
  constructor(r) {
    super(r);
    me(this, "_isMounted", !1);
    /**
     * 重置错误状态，尝试重新渲染子组件
     */
    me(this, "handleRetry", () => {
      this._isMounted && this.setState({
        hasError: !1,
        error: null,
        errorInfo: null
      });
    });
    /**
     * 复制错误信息到剪贴板
     */
    me(this, "handleCopyError", async () => {
      const { error: r, errorInfo: n } = this.state, { componentName: a } = this.props, s = [
        "=== SRS 错误报告 ===",
        `组件: ${a || "未知"}`,
        `时间: ${(/* @__PURE__ */ new Date()).toISOString()}`,
        "",
        `错误信息: ${(r == null ? void 0 : r.message) || "未知错误"}`,
        "",
        "错误堆栈:",
        (r == null ? void 0 : r.stack) || "无堆栈信息",
        "",
        "组件堆栈:",
        (n == null ? void 0 : n.componentStack) || "无组件堆栈信息"
      ].join(`
`);
      try {
        await navigator.clipboard.writeText(s), orca.notify("success", "错误信息已复制到剪贴板", { title: "复制成功" });
      } catch (i) {
        console.warn("[SRS Error Boundary] 复制到剪贴板失败:", i), orca.notify("warn", "复制失败，请查看控制台日志", { title: "复制失败" });
      }
    });
    this.state = {
      hasError: !1,
      error: null,
      errorInfo: null
    };
  }
  componentDidMount() {
    this._isMounted = !0;
  }
  componentWillUnmount() {
    this._isMounted = !1;
  }
  static getDerivedStateFromError(r) {
    return { hasError: !0, error: r };
  }
  componentDidCatch(r, n) {
    const { componentName: a, onError: s } = this.props, i = a ? `[SRS Error Boundary - ${a}]` : "[SRS Error Boundary]";
    if (console.error(i, "捕获到运行时错误:"), console.error(i, "错误信息:", r.message), console.error(i, "错误堆栈:", r.stack), console.error(i, "组件堆栈:", n.componentStack), this._isMounted && this.setState({ errorInfo: n }), s)
      try {
        s(r, n);
      } catch (c) {
        console.error(i, "错误回调执行失败:", c);
      }
    try {
      orca.notify("error", `组件运行时错误：${r.message}`, {
        title: a ? `${a} 错误` : "SRS 错误"
      });
    } catch (c) {
      console.warn(i, "发送错误通知失败:", c);
    }
  }
  render() {
    const { hasError: r, error: n } = this.state, { children: a, errorTitle: s, renderError: i } = this.props;
    return r ? i ? i(n, this.handleRetry) : /* @__PURE__ */ o.jsxs(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          minHeight: "120px",
          backgroundColor: "var(--orca-color-bg-1)",
          border: "1px solid var(--orca-color-danger-6)",
          borderRadius: "12px",
          gap: "16px"
        },
        children: [
          /* @__PURE__ */ o.jsx(
            "div",
            {
              style: {
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "var(--orca-color-danger-1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px"
              },
              children: "⚠️"
            }
          ),
          /* @__PURE__ */ o.jsx(
            "div",
            {
              style: {
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--orca-color-text-1)"
              },
              children: s || "组件加载出错"
            }
          ),
          /* @__PURE__ */ o.jsx(
            "div",
            {
              style: {
                fontSize: "13px",
                color: "var(--orca-color-text-3)",
                textAlign: "center",
                maxWidth: "400px",
                wordBreak: "break-word"
              },
              children: (n == null ? void 0 : n.message) || "发生未知错误，请刷新重试"
            }
          ),
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "12px", marginTop: "8px" }, children: [
            /* @__PURE__ */ o.jsx(Fa, { variant: "solid", onClick: this.handleRetry, children: "重试" }),
            /* @__PURE__ */ o.jsx(Fa, { variant: "plain", onClick: this.handleCopyError, children: "复制错误信息" })
          ] })
        ]
      }
    ) : a;
  }
}
const { useState: yt, useMemo: lo, useEffect: hn, useCallback: mt } = window.React, { useSnapshot: Od } = window.Valtio, { BlockShell: Fd, BlockChildren: Wd, Button: Le, BlockBreadcrumb: Hd } = orca.components;
function yn({
  panelId: e,
  blockId: t,
  rndId: r,
  blockLevel: n,
  indentLevel: a,
  mirrorId: s,
  initiallyCollapsed: i,
  renderingMode: c,
  front: d,
  back: l
}) {
  const x = Od(orca.state), u = s ?? t, f = lo(() => {
    var q;
    return (q = x == null ? void 0 : x.blocks) == null ? void 0 : q[u];
  }, [x == null ? void 0 : x.blocks, u]), [p, g] = yt(!1), [y, v] = yt(!1), [h, S] = yt(!1), [$, k] = yt(d), [C, P] = yt(l), [E, O] = yt(d), [j, B] = yt(l), [z, M] = yt(!1), [R, A] = yt(!1), T = (q) => [{ t: "t", v: q ?? "" }];
  hn(() => {
    g(!1), v(!1), S(!1), O(d), B(l), k(d), P(l);
  }, [t, d, l]), hn(() => {
    O(d), k(d), v(!1);
  }, [d]), hn(() => {
    B(l), P(l), S(!1);
  }, [l]);
  const w = mt(async (q) => {
    console.log(`[SRS Card Block Renderer] 卡片 #${t} 评分: ${q}`);
    const Q = await Eo(t, q, "orca-srs");
    g(!1), Nt(
      "orca-srs",
      "success",
      `评分已记录：${q}，下次 ${((I) => {
        const ge = I.getMonth() + 1, fe = I.getDate();
        return `${ge}-${fe}`;
      })(Q.state.due)}（间隔 ${Q.state.interval} 天）`,
      { title: "SRS 复习" }
    );
  }, [t]), N = mt(async () => {
    var q;
    if (!z) {
      M(!0);
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.setBlocksContent",
          null,
          [{ id: u, content: T($) }],
          !1
        );
        const Q = (q = orca.state.blocks) == null ? void 0 : q[u];
        Q && (Q.text = $, Q._repr && (Q._repr.front = $)), O($), v(!1), Nt("orca-srs", "success", "题目已保存", { title: "SRS 卡片" });
      } catch (Q) {
        console.error("保存题目失败:", Q), orca.notify("error", `保存失败: ${Q}`);
      } finally {
        M(!1);
      }
    }
  }, [u, $, z]), F = mt(async () => {
    var Q, ie, I;
    if (R) return;
    const q = (Q = f == null ? void 0 : f.children) == null ? void 0 : Q[0];
    if (q === void 0) {
      orca.notify("warn", "该卡片没有子块，无法保存答案", { title: "SRS 卡片" });
      return;
    }
    A(!0);
    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.setBlocksContent",
        null,
        [{ id: q, content: T(C) }],
        !1
      );
      const ge = (ie = orca.state.blocks) == null ? void 0 : ie[q];
      ge && (ge.text = C);
      const fe = (I = orca.state.blocks) == null ? void 0 : I[u];
      fe && fe._repr && (fe._repr.back = C), B(C), S(!1), Nt("orca-srs", "success", "答案已保存", { title: "SRS 卡片" });
    } catch (ge) {
      console.error("保存答案失败:", ge), orca.notify("error", `保存失败: ${ge}`);
    } finally {
      A(!1);
    }
  }, [f == null ? void 0 : f.children, u, C, R]), D = mt((q) => {
    q === "front" ? (k(d), v(!1)) : (P(l), S(!1));
  }, [d, l]), m = mt((q) => {
    k(q.target.value);
  }, []), _ = mt((q) => {
    P(q.target.value);
  }, []), G = mt((q) => {
    q.stopPropagation();
  }, []), X = mt((q) => {
    q.stopPropagation();
  }, []), pe = mt((q) => {
    q.ctrlKey || q.metaKey || q.stopPropagation();
  }, []), J = lo(
    () => /* @__PURE__ */ o.jsx(
      Wd,
      {
        block: f,
        panelId: e,
        blockLevel: n,
        indentLevel: a,
        renderingMode: c
      }
    ),
    [f, e, n, a, c]
  ), ae = lo(() => (f == null ? void 0 : f.children) && f.children.length > 0, [f == null ? void 0 : f.children]), W = lo(() => /* @__PURE__ */ o.jsxs(
    "div",
    {
      className: "srs-card-block-content",
      style: {
        backgroundColor: "var(--orca-color-bg-1)",
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        padding: "16px",
        marginTop: "4px",
        marginBottom: "4px",
        userSelect: "text",
        WebkitUserSelect: "text"
      },
      children: [
        /* @__PURE__ */ o.jsx("style", { children: `
        .srs-card-block-content .orca-block-folding-handle,
        .srs-card-block-content .orca-block-handle {
          opacity: 0 !important;
          transition: opacity 0.15s ease;
        }
        .srs-card-block-content .orca-block.orca-container:hover > .orca-repr > .orca-repr-main > .orca-repr-main-none-editable > .orca-block-handle,
        .srs-card-block-content .orca-block.orca-container:hover > .orca-block-folding-handle {
          opacity: 1 !important;
        }
        .srs-card-front .orca-repr-main {
          display: block !important;
        }
      ` }),
        /* @__PURE__ */ o.jsxs(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
              color: "var(--orca-color-text-2)",
              fontSize: "12px",
              fontWeight: "500"
            },
            children: [
              /* @__PURE__ */ o.jsx("i", { className: "ti ti-cards", style: { fontSize: "16px" } }),
              /* @__PURE__ */ o.jsx("span", { children: "SRS 记忆卡片" })
            ]
          }
        ),
        /* @__PURE__ */ o.jsxs(
          "div",
          {
            className: "srs-card-front",
            style: {
              marginBottom: "12px",
              padding: "12px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "6px",
              color: "var(--orca-color-text-1)",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            },
            children: [
              /* @__PURE__ */ o.jsx(Hd, { blockId: u }),
              /* @__PURE__ */ o.jsxs(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "var(--orca-color-text-2)"
                  },
                  children: [
                    /* @__PURE__ */ o.jsx("span", { children: "题目：" }),
                    !y && /* @__PURE__ */ o.jsxs(
                      Le,
                      {
                        variant: "soft",
                        onClick: () => v(!0),
                        style: { padding: "2px 8px", fontSize: "11px" },
                        children: [
                          /* @__PURE__ */ o.jsx("i", { className: "ti ti-edit" }),
                          " 编辑"
                        ]
                      }
                    )
                  ]
                }
              ),
              y ? /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
                /* @__PURE__ */ o.jsx(
                  "textarea",
                  {
                    value: $,
                    onChange: m,
                    onInput: m,
                    onMouseDown: G,
                    onClick: X,
                    onKeyDown: pe,
                    autoFocus: !0,
                    readOnly: !1,
                    disabled: !1,
                    style: {
                      width: "100%",
                      minHeight: "80px",
                      padding: "8px",
                      fontSize: "14px",
                      borderRadius: "4px",
                      border: "1px solid var(--orca-color-border-1)",
                      resize: "vertical",
                      pointerEvents: "auto",
                      userSelect: "text",
                      WebkitUserSelect: "text"
                    }
                  }
                ),
                /* @__PURE__ */ o.jsxs(
                  "div",
                  {
                    style: {
                      display: "flex",
                      gap: "8px",
                      justifyContent: "flex-end"
                    },
                    children: [
                      /* @__PURE__ */ o.jsx(Le, { variant: "soft", onClick: () => D("front"), children: "取消" }),
                      /* @__PURE__ */ o.jsx(Le, { variant: "solid", onClick: N, children: "保存" })
                    ]
                  }
                )
              ] }) : /* @__PURE__ */ o.jsx(
                "div",
                {
                  style: {
                    whiteSpace: "pre-wrap",
                    userSelect: "text",
                    WebkitUserSelect: "text",
                    cursor: "text",
                    fontSize: "20px",
                    fontWeight: "600"
                  },
                  children: E || "（无题目）"
                }
              )
            ]
          }
        ),
        ae ? (
          // 有子块：显示答案逻辑
          p ? (
            // 已显示答案：显示答案和评分按钮
            /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
              /* @__PURE__ */ o.jsxs(
                "div",
                {
                  className: "srs-card-back",
                  style: {
                    marginBottom: "12px",
                    padding: "12px",
                    backgroundColor: "var(--orca-color-bg-2)",
                    borderRadius: "6px",
                    color: "var(--orca-color-text-1)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px"
                  },
                  children: [
                    /* @__PURE__ */ o.jsxs(
                      "div",
                      {
                        style: {
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "11px",
                          color: "var(--orca-color-text-2)"
                        },
                        children: [
                          /* @__PURE__ */ o.jsx("span", { children: "答案：" }),
                          !h && /* @__PURE__ */ o.jsxs(
                            Le,
                            {
                              variant: "soft",
                              onClick: () => S(!0),
                              style: { padding: "2px 8px", fontSize: "11px" },
                              children: [
                                /* @__PURE__ */ o.jsx("i", { className: "ti ti-edit" }),
                                " 编辑"
                              ]
                            }
                          )
                        ]
                      }
                    ),
                    h ? /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
                      /* @__PURE__ */ o.jsx(
                        "textarea",
                        {
                          value: C,
                          onChange: _,
                          onInput: _,
                          onMouseDown: G,
                          onClick: X,
                          onKeyDown: pe,
                          autoFocus: !0,
                          readOnly: !1,
                          disabled: !1,
                          style: {
                            width: "100%",
                            minHeight: "80px",
                            padding: "8px",
                            fontSize: "14px",
                            borderRadius: "4px",
                            border: "1px solid var(--orca-color-border-1)",
                            resize: "vertical",
                            pointerEvents: "auto",
                            userSelect: "text",
                            WebkitUserSelect: "text"
                          }
                        }
                      ),
                      /* @__PURE__ */ o.jsxs(
                        "div",
                        {
                          style: {
                            display: "flex",
                            gap: "8px",
                            justifyContent: "flex-end"
                          },
                          children: [
                            /* @__PURE__ */ o.jsx(Le, { variant: "soft", onClick: () => D("back"), children: "取消" }),
                            /* @__PURE__ */ o.jsx(Le, { variant: "solid", onClick: F, children: "保存" })
                          ]
                        }
                      )
                    ] }) : /* @__PURE__ */ o.jsx(
                      "div",
                      {
                        style: {
                          whiteSpace: "pre-wrap",
                          userSelect: "text",
                          WebkitUserSelect: "text",
                          cursor: "text",
                          fontSize: "20px",
                          fontWeight: "600"
                        },
                        children: j || "（无答案）"
                      }
                    )
                  ]
                }
              ),
              /* @__PURE__ */ o.jsxs(
                "div",
                {
                  className: "srs-card-grade-buttons",
                  style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(4, 1fr)",
                    gap: "8px"
                  },
                  children: [
                    /* @__PURE__ */ o.jsxs(
                      Le,
                      {
                        variant: "dangerous",
                        onClick: () => w("again"),
                        style: {
                          padding: "12px 4px",
                          fontSize: "12px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "4px"
                        },
                        children: [
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", fontWeight: "500" }, children: "1m" }),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px" }, children: "😞" }),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", opacity: 0.9 }, children: "忘记" })
                        ]
                      }
                    ),
                    /* @__PURE__ */ o.jsxs(
                      Le,
                      {
                        variant: "soft",
                        onClick: () => w("hard"),
                        style: {
                          padding: "12px 4px",
                          fontSize: "12px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "4px"
                        },
                        children: [
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", fontWeight: "500" }, children: "6m" }),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px" }, children: "😐" }),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", opacity: 0.9 }, children: "困难" })
                        ]
                      }
                    ),
                    /* @__PURE__ */ o.jsxs(
                      Le,
                      {
                        variant: "solid",
                        onClick: () => w("good"),
                        style: {
                          padding: "12px 4px",
                          fontSize: "12px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "4px"
                        },
                        children: [
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", fontWeight: "500" }, children: "10m" }),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px" }, children: "😊" }),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", opacity: 0.9 }, children: "良好" })
                        ]
                      }
                    ),
                    /* @__PURE__ */ o.jsxs(
                      Le,
                      {
                        variant: "solid",
                        onClick: () => w("easy"),
                        style: {
                          padding: "12px 4px",
                          fontSize: "12px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "4px",
                          backgroundColor: "var(--orca-color-primary-5)",
                          opacity: 0.9
                        },
                        children: [
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", fontWeight: "500" }, children: "8d" }),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px" }, children: "😄" }),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", opacity: 0.9 }, children: "简单" })
                        ]
                      }
                    )
                  ]
                }
              )
            ] })
          ) : (
            // 未显示答案：显示按钮
            /* @__PURE__ */ o.jsx("div", { style: { textAlign: "center" }, children: /* @__PURE__ */ o.jsx(
              Le,
              {
                variant: "soft",
                onClick: () => g(!0),
                style: {
                  padding: "6px 16px",
                  fontSize: "13px"
                },
                children: "显示答案"
              }
            ) })
          )
        ) : (
          // 无子块（摘录卡）：直接显示评分按钮
          /* @__PURE__ */ o.jsxs(
            "div",
            {
              className: "srs-card-grade-buttons",
              style: {
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "8px"
              },
              children: [
                /* @__PURE__ */ o.jsxs(
                  Le,
                  {
                    variant: "dangerous",
                    onClick: () => w("again"),
                    style: {
                      padding: "12px 4px",
                      fontSize: "12px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px"
                    },
                    children: [
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", fontWeight: "500" }, children: "1m" }),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px" }, children: "😞" }),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", opacity: 0.9 }, children: "忘记" })
                    ]
                  }
                ),
                /* @__PURE__ */ o.jsxs(
                  Le,
                  {
                    variant: "soft",
                    onClick: () => w("hard"),
                    style: {
                      padding: "12px 4px",
                      fontSize: "12px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px"
                    },
                    children: [
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", fontWeight: "500" }, children: "6m" }),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px" }, children: "😐" }),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", opacity: 0.9 }, children: "困难" })
                    ]
                  }
                ),
                /* @__PURE__ */ o.jsxs(
                  Le,
                  {
                    variant: "solid",
                    onClick: () => w("good"),
                    style: {
                      padding: "12px 4px",
                      fontSize: "12px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px"
                    },
                    children: [
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", fontWeight: "500" }, children: "10m" }),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px" }, children: "😊" }),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", opacity: 0.9 }, children: "良好" })
                    ]
                  }
                ),
                /* @__PURE__ */ o.jsxs(
                  Le,
                  {
                    variant: "solid",
                    onClick: () => w("easy"),
                    style: {
                      padding: "12px 4px",
                      fontSize: "12px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      backgroundColor: "var(--orca-color-primary-5)",
                      opacity: 0.9
                    },
                    children: [
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", fontWeight: "500" }, children: "8d" }),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px" }, children: "😄" }),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", opacity: 0.9 }, children: "简单" })
                    ]
                  }
                )
              ]
            }
          )
        )
      ]
    }
  ), [
    ae,
    p,
    y,
    h,
    $,
    C,
    E,
    j,
    z,
    R,
    w,
    N,
    F,
    D,
    m,
    _,
    G,
    X,
    pe
  ]);
  return /* @__PURE__ */ o.jsx(
    Fd,
    {
      panelId: e,
      blockId: t,
      rndId: r,
      mirrorId: s,
      blockLevel: n,
      indentLevel: a,
      initiallyCollapsed: i,
      renderingMode: c,
      reprClassName: "srs-repr-card",
      contentClassName: "srs-repr-card-content",
      contentAttrs: { contentEditable: !1 },
      contentJsx: /* @__PURE__ */ o.jsx(Xe, { componentName: "SRS卡片", errorTitle: "卡片加载出错", children: W }),
      childrenJsx: J
    }
  );
}
const Qe = {
  CARD_GRADED: "srs.cardGraded",
  // 卡片被评分
  CARD_POSTPONED: "srs.cardPostponed",
  // 卡片被推迟
  CARD_SUSPENDED: "srs.cardSuspended"
  // 卡片被暂停
};
function Nd(e, t) {
  orca.broadcasts.broadcast(Qe.CARD_GRADED, { blockId: e, grade: t });
}
function Yd(e) {
  orca.broadcasts.broadcast(Qe.CARD_POSTPONED, { blockId: e });
}
function qd(e) {
  orca.broadcasts.broadcast(Qe.CARD_SUSPENDED, { blockId: e });
}
const Kd = 1, yi = "reviewLogs", Ir = /* @__PURE__ */ new Map();
let jo = [], qt = null;
const Ud = 1e3;
function mi(e, t) {
  const r = t.toString().padStart(2, "0");
  return `${yi}_${e}_${r}`;
}
function Vd(e) {
  const t = new Date(e);
  return mi(t.getFullYear(), t.getMonth() + 1);
}
async function fa(e, t) {
  if (Ir.has(t))
    return Ir.get(t);
  try {
    const r = await orca.plugins.getData(e, t);
    if (!r)
      return Ir.set(t, []), [];
    const a = JSON.parse(r).logs || [];
    return Ir.set(t, a), a;
  } catch (r) {
    return console.warn(`[${e}] 加载复习记录失败 (${t}):`, r), [];
  }
}
async function Gd(e, t, r) {
  const n = {
    version: Kd,
    logs: r
  };
  await orca.plugins.setData(e, t, JSON.stringify(n)), Ir.set(t, r);
}
async function vi(e) {
  if (jo.length === 0) return;
  const t = /* @__PURE__ */ new Map();
  for (const r of jo) {
    const n = Vd(r.timestamp);
    t.has(n) || t.set(n, []), t.get(n).push(r);
  }
  jo = [];
  for (const [r, n] of t) {
    const s = [...await fa(e, r), ...n];
    await Gd(e, r, s);
  }
}
function Jd(e) {
  qt && clearTimeout(qt), qt = setTimeout(async () => {
    qt = null, await vi(e);
  }, Ud);
}
async function Qd(e, t) {
  jo.push(t), Jd(e);
}
async function bi(e) {
  qt && (clearTimeout(qt), qt = null), await vi(e);
}
async function Zr(e, t, r) {
  await bi(e);
  const n = t.getTime(), a = r.getTime(), s = t.getFullYear(), i = t.getMonth() + 1, c = r.getFullYear(), d = r.getMonth() + 1, l = [];
  let x = s, u = i;
  for (; x < c || x === c && u <= d; ) {
    const f = mi(x, u), g = (await fa(e, f)).filter(
      (y) => y.timestamp >= n && y.timestamp <= a
    );
    l.push(...g), u++, u > 12 && (u = 1, x++);
  }
  return l.sort((f, p) => f.timestamp - p.timestamp);
}
async function Xd(e) {
  await bi(e);
  const r = (await orca.plugins.getDataKeys(e)).filter((a) => a.startsWith(yi)), n = [];
  for (const a of r) {
    const s = await fa(e, a);
    n.push(...s);
  }
  return n.sort((a, s) => a.timestamp - s.timestamp);
}
function Zd(e, t) {
  return `${e}_${t}`;
}
const pa = "srs-plugin";
function Br(e) {
  var r, n, a;
  if (!e) return !1;
  const t = (r = e.properties) == null ? void 0 : r.find((s) => s.name === "_repr");
  return ((n = t == null ? void 0 : t.value) == null ? void 0 : n.type) === "query" || ((a = e._repr) == null ? void 0 : a.type) === "query";
}
async function xa(e) {
  var a;
  const t = await orca.invokeBackend("get-block", e);
  if (!t)
    return console.log(`[blockCardCollector] 无法获取块 ${e}`), [];
  const r = (a = t.properties) == null ? void 0 : a.find((s) => s.name === "_repr"), n = r == null ? void 0 : r.value;
  if (!n || n.type !== "query")
    return console.log(`[blockCardCollector] 块 ${e} 不是查询块或没有 _repr`), [];
  if (!n.q)
    return console.log(`[blockCardCollector] 查询块 ${e} 没有查询语句 (repr.q)`), [];
  console.log(`[blockCardCollector] 查询块 ${e} 的查询语句:`, JSON.stringify(n.q));
  try {
    const s = await orca.invokeBackend("query", n.q);
    return !s || s.length === 0 ? (console.log(`[blockCardCollector] 查询块 ${e} 查询结果为空`), []) : (console.log(`[blockCardCollector] 查询块 ${e} 获取到 ${s.length} 个结果`), s);
  } catch (s) {
    return console.error("[blockCardCollector] 执行查询失败:", s), [];
  }
}
async function ga(e) {
  const t = [], r = /* @__PURE__ */ new Set();
  async function n(a) {
    var i;
    if (r.has(a)) return;
    r.add(a);
    let s = (i = orca.state.blocks) == null ? void 0 : i[a];
    if (s || (s = await orca.invokeBackend("get-block", a)), !(!(s != null && s.children) || s.children.length === 0))
      for (const c of s.children)
        t.push(c), await n(c);
  }
  return await n(e), t;
}
function ct(e) {
  return !(e != null && e.refs) || e.refs.length === 0 ? !1 : e.refs.some((t) => t.type === 2 && ve(t.alias));
}
function rr(e) {
  const t = e.refs || [];
  if (t.length === 0) return [];
  const r = [], n = /* @__PURE__ */ new Set();
  for (const a of t) {
    if (a.type !== 2) continue;
    const s = (a.alias || "").trim();
    if (!s) continue;
    const i = s.toLowerCase();
    i === "card" || i.startsWith("card/") || n.has(a.to) || (n.add(a.to), r.push({
      name: s,
      blockId: a.to
    }));
  }
  return r;
}
function wi() {
  const e = /* @__PURE__ */ new Date();
  return e.setHours(0, 0, 0, 0), e;
}
function eu() {
  const e = wi();
  return e.setDate(e.getDate() + 1), e;
}
async function Fr(e, t = pa) {
  var l;
  const r = [];
  if (!Xn(e) && !ct(e))
    return r;
  if (Qs(e) === "suspend")
    return console.log(`[${t}] convertBlockToReviewCards: 跳过已暂停的卡片 #${e.id}`), r;
  const a = je(e), s = await Nr(e), i = Date.now(), c = wi(), d = eu();
  if (a === "cloze" || a === "bg") {
    let x = Zo(e.content, t), u = [];
    if ((l = e.content) != null && l.some((f) => f.t === `${t}.cloze` || typeof f.t == "string" && f.t.endsWith(".cloze")), a === "bg")
      try {
        const f = await ei(e.id, t);
        f.length > 0 && (x = f, u = await Gr(e.id, t), console.log(`[${t}] convertBlockToReviewCards: 从块树提取到 cloze 内容: ${JSON.stringify(u)}`));
      } catch (f) {
        console.warn(`[${t}] 尝试从块树提取 cloze 编号失败:`, f);
      }
    if (x.length === 0)
      return r;
    for (const f of x) {
      const p = await ta(e.id, f, f - 1), g = e.text || "";
      r.push({
        id: e.id,
        front: g,
        back: `（填空 c${f}）`,
        srs: p,
        isNew: !p.lastReviewed || p.reps === 0,
        deck: s,
        tags: rr(e),
        clozeNumber: f,
        content: e.content,
        allClozeContent: u,
        // 保存从块树中提取的 cloze 内容，用于表格 cloze 卡片或 BG 卡片
        cardType: a
        // 保存卡片类型，用于区分 cloze 和 bg 卡片
      });
    }
  } else if (a === "direction") {
    const x = sa(e.content, t);
    if (!x || !x.leftText || !x.rightText)
      return r;
    const u = oi(x.direction);
    for (let f = 0; f < u.length; f++) {
      const p = u[f], g = await ra(e.id, p, f), y = p === "forward" ? x.leftText : x.rightText, v = p === "forward" ? x.rightText : x.leftText;
      r.push({
        id: e.id,
        front: y,
        back: v,
        srs: g,
        isNew: !g.lastReviewed || g.reps === 0,
        deck: s,
        tags: rr(e),
        directionType: p
      });
    }
  } else if (a === "excerpt") {
    const x = e.text || "", u = await Ze(e.id, /* @__PURE__ */ new Date());
    r.push({
      id: e.id,
      front: x,
      back: "",
      srs: u,
      isNew: !u.lastReviewed || u.reps === 0,
      deck: s,
      tags: rr(e)
    });
  } else if (a === "list") {
    const x = e.children ?? [];
    if (x.length === 0)
      return r;
    let u = -1, f = null, p = null;
    for (let g = 0; g < x.length; g++) {
      const y = x[g], h = await dr(y, g === 0 ? c : d);
      if (h.due.getTime() <= i) {
        u = g + 1, f = y, p = h;
        break;
      }
    }
    if (!f || !p || u === -1)
      return r;
    r.push({
      id: e.id,
      front: e.text || "",
      back: "",
      srs: p,
      isNew: !p.lastReviewed || p.reps === 0,
      deck: s,
      tags: rr(e),
      listItemId: f,
      listItemIndex: u,
      listItemIds: x
    });
  } else if (e.children && e.children.length > 0) {
    const { front: u, back: f } = Ho(e), p = await Ze(e.id, /* @__PURE__ */ new Date());
    r.push({
      id: e.id,
      front: u,
      back: f,
      srs: p,
      isNew: !p.lastReviewed || p.reps === 0,
      deck: s,
      tags: rr(e)
    });
  } else {
    const u = e.text || "", f = await Ze(e.id, /* @__PURE__ */ new Date());
    r.push({
      id: e.id,
      front: u,
      // 摘录内容作为 front
      back: "",
      // 无 back
      srs: f,
      isNew: !f.lastReviewed || f.reps === 0,
      deck: s,
      tags: rr(e)
    });
  }
  return r;
}
async function ha(e, t = pa) {
  var a;
  const r = [], n = await xa(e);
  if (n.length === 0)
    return r;
  for (const s of n) {
    let i = (a = orca.state.blocks) == null ? void 0 : a[s];
    if (i || (i = await orca.invokeBackend("get-block", s)), !i || !ct(i)) continue;
    const c = await Fr(i, t);
    r.push(...c);
  }
  return r;
}
async function ya(e, t = pa) {
  var s, i;
  const r = [];
  let n = (s = orca.state.blocks) == null ? void 0 : s[e];
  if (n || (n = await orca.invokeBackend("get-block", e)), n && ct(n)) {
    const c = await Fr(n, t);
    r.push(...c);
  }
  const a = await ga(e);
  for (const c of a) {
    let d = (i = orca.state.blocks) == null ? void 0 : i[c];
    if (d || (d = await orca.invokeBackend("get-block", c)), !d || !ct(d)) continue;
    const l = await Fr(d, t);
    r.push(...l);
  }
  return r;
}
async function ma(e, t) {
  var n, a, s;
  let r = 0;
  if (t) {
    const i = await xa(e);
    for (const c of i) {
      let d = (n = orca.state.blocks) == null ? void 0 : n[c];
      d || (d = await orca.invokeBackend("get-block", c)), d && ct(d) && r++;
    }
  } else {
    let i = (a = orca.state.blocks) == null ? void 0 : a[e];
    i || (i = await orca.invokeBackend("get-block", e)), i && ct(i) && r++;
    const c = await ga(e);
    for (const d of c) {
      let l = (s = orca.state.blocks) == null ? void 0 : s[d];
      l || (l = await orca.invokeBackend("get-block", d)), l && ct(l) && r++;
    }
  }
  return r;
}
const Mo = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  collectCardsFromChildren: ya,
  collectCardsFromQueryBlock: ha,
  convertBlockToReviewCards: Fr,
  estimateCardCount: ma,
  getAllDescendantIds: ga,
  getQueryResults: xa,
  hasCardTag: ct,
  isQueryBlock: Br
}, Symbol.toStringTag, { value: "Module" })), tu = "srs-plugin", Si = /* @__PURE__ */ new Set();
function Ci(e, t, r, n) {
  return n !== void 0 ? `${e}-list-${n}` : `${e}-${t || 0}-${r || "basic"}`;
}
function Ro(e, t, r, n) {
  const a = Ci(e, t, r, n);
  Si.add(a), console.log(`[orca-srs] 标记父卡片已处理: ${a}`);
}
function Yn() {
  Si.clear(), console.log("[orca-srs] 重置已处理父卡片集合");
}
async function ki(e, t = tu) {
  var i, c;
  const r = [];
  let n = (i = orca.state.blocks) == null ? void 0 : i[e];
  if (n || (n = await orca.invokeBackend("get-block", e)), !n)
    return r;
  const a = n.backRefs;
  if (!a || a.length === 0)
    return r;
  const s = /* @__PURE__ */ new Set();
  for (const d of a) {
    const l = d.from;
    if (s.has(l))
      continue;
    s.add(l);
    let x = (c = orca.state.blocks) == null ? void 0 : c[l];
    if (x || (x = await orca.invokeBackend("get-block", l)), !x || !ct(x) && !Xn(x))
      continue;
    const u = await Fr(x, t);
    r.push(...u);
  }
  return r.length > 0 && console.log(`[${t}] collectChildCards: 父卡片 #${e} 有 ${r.length} 张直接子卡片`), r;
}
async function ji(e) {
  var r, n;
  let t = (r = orca.state.blocks) == null ? void 0 : r[e];
  if (t || (t = await orca.invokeBackend("get-block", e)), !(t != null && t.backRefs) || t.backRefs.length === 0)
    return !1;
  for (const a of t.backRefs) {
    let s = (n = orca.state.blocks) == null ? void 0 : n[a.from];
    if (s || (s = await orca.invokeBackend("get-block", a.from)), s && ct(s))
      return !0;
  }
  return !1;
}
function Oe(e) {
  return e.listItemId !== void 0 ? `${e.id}-list-${e.listItemId}` : `${e.id}-${e.clozeNumber || 0}-${e.directionType || "basic"}`;
}
const ru = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  collectChildCards: ki,
  getCardKey: Oe,
  getParentCardKey: Ci,
  hasChildCards: ji,
  markParentCardProcessed: Ro,
  resetProcessedParentCards: Yn
}, Symbol.toStringTag, { value: "Module" })), ou = 60 * 1e3, Bo = 1;
function Ao() {
  return {
    version: Bo,
    sessionStartTime: Date.now(),
    gradeDistribution: {
      again: 0,
      hard: 0,
      good: 0,
      easy: 0
    },
    totalGradedCards: 0,
    effectiveReviewTime: 0,
    cardDurations: []
  };
}
function nu(e) {
  return e < 0 ? 0 : Math.min(e, ou);
}
function au(e, t, r) {
  const n = nu(r);
  return {
    ...e,
    gradeDistribution: {
      ...e.gradeDistribution,
      [t]: e.gradeDistribution[t] + 1
    },
    totalGradedCards: e.totalGradedCards + 1,
    effectiveReviewTime: e.effectiveReviewTime + n,
    cardDurations: [...e.cardDurations, n]
  };
}
function Ri(e) {
  const t = e.again + e.hard + e.good + e.easy;
  return t === 0 ? 0 : (e.hard + e.good + e.easy) / t;
}
function Wa(e) {
  e < 0 && (e = 0);
  const t = Math.floor(e / 1e3), r = Math.floor(t / 3600), n = Math.floor(t % 3600 / 60), a = t % 60, s = (i) => i.toString().padStart(2, "0");
  return `${s(r)}:${s(n)}:${s(a)}`;
}
function su(e) {
  return e < 0 && (e = 0), e > 1 && (e = 1), `${(e * 100).toFixed(1)}%`;
}
function iu(e, t) {
  const r = t - e.sessionStartTime, n = e.totalGradedCards > 0 ? e.effectiveReviewTime / e.totalGradedCards : 0, a = Ri(e.gradeDistribution);
  return {
    totalReviewed: e.totalGradedCards,
    totalSessionTime: Math.max(0, r),
    effectiveReviewTime: e.effectiveReviewTime,
    averageTimePerCard: n,
    accuracyRate: a,
    gradeDistribution: { ...e.gradeDistribution }
  };
}
function Ha(e) {
  return JSON.stringify({
    version: Bo,
    data: e
  });
}
function Na(e) {
  try {
    const t = JSON.parse(e);
    return t.version !== Bo ? (console.warn(
      `Session progress version mismatch: expected ${Bo}, got ${t.version}. Returning initial state.`
    ), Ao()) : t.data;
  } catch (t) {
    return console.warn("Failed to deserialize session progress:", t), Ao();
  }
}
const { useState: cu, useRef: lu, useMemo: du, useEffect: uu, useCallback: kr } = window.React, fu = "srs-session-progress";
function pu(e = {}) {
  const {
    autoSave: t = !0,
    storageKey: r = fu
  } = e, [n, a] = cu(() => {
    if (t)
      try {
        const f = sessionStorage.getItem(r);
        if (f)
          return Na(f);
      } catch {
      }
    return Ao();
  }), s = lu(Date.now()), i = du(
    () => Ri(n.gradeDistribution),
    [n.gradeDistribution]
  ), c = kr((f) => {
    const p = Date.now(), g = p - s.current;
    a((y) => au(y, f, g)), s.current = p;
  }, []), d = kr(() => {
    const f = Ao();
    if (a(f), s.current = Date.now(), t)
      try {
        sessionStorage.removeItem(r);
      } catch {
      }
  }, [t, r]), l = kr(() => {
    const f = Date.now(), p = iu(n, f);
    if (t)
      try {
        sessionStorage.removeItem(r);
      } catch {
      }
    return p;
  }, [n, t, r]), x = kr(() => Ha(n), [n]), u = kr((f) => {
    try {
      const p = Na(f);
      return a(p), s.current = Date.now(), !0;
    } catch {
      return !1;
    }
  }, []);
  return uu(() => {
    if (t)
      try {
        const f = Ha(n);
        sessionStorage.setItem(r, f);
      } catch {
      }
  }, [n, t, r]), {
    progressState: n,
    accuracyRate: i,
    recordGrade: c,
    resetSession: d,
    finishSession: l,
    serialize: x,
    restore: u
  };
}
const { useEffect: xu, useCallback: gu } = window.React, hu = {
  " ": "showAnswer",
  // 空格显示答案
  1: "again",
  // 忘记
  2: "hard",
  // 困难
  3: "good",
  // 良好
  4: "easy",
  // 简单
  b: "bury",
  // 推迟到明天（内部仍使用bury以保持兼容）
  s: "suspend"
  // 暂停卡片
};
function eo({
  showAnswer: e,
  isGrading: t,
  onShowAnswer: r,
  onGrade: n,
  onBury: a,
  onSuspend: s,
  enabled: i = !0,
  choiceCard: c
}) {
  const d = gu(
    (l) => {
      if (!i) return;
      const x = l.target;
      if (x.tagName === "INPUT" || x.tagName === "TEXTAREA" || x.isContentEditable)
        return;
      if (c && !e && !t) {
        const f = parseInt(l.key);
        if (f >= 1 && f <= 9 && f <= c.optionCount) {
          l.preventDefault(), l.stopPropagation(), c.onSelectOption(f - 1);
          return;
        }
        if (l.key === "Enter" && c.mode === "multiple") {
          l.preventDefault(), l.stopPropagation(), c.onSubmit();
          return;
        }
      }
      const u = hu[l.key];
      u && (l.preventDefault(), l.stopPropagation(), u === "showAnswer" ? !e && !t ? c && c.mode === "multiple" ? c.onSubmit() : r && r() : e && !t && n("good") : u === "bury" ? !t && a && a() : u === "suspend" ? !t && s && s() : e && !t && n(u));
    },
    [e, t, r, n, a, s, i, c]
  );
  xu(() => {
    if (i)
      return document.addEventListener("keydown", d), () => {
        document.removeEventListener("keydown", d);
      };
  }, [d, i]);
}
const { useState: mn, useMemo: Bt, useRef: Ya, useEffect: jr } = window.React, { useSnapshot: yu } = window.Valtio, { Button: At, ModalOverlay: mu, BlockBreadcrumb: vu, Block: bu, BlockChildren: Vg, BlockShell: Gg } = orca.components;
function wu(e) {
  if (e == null) return "新卡";
  switch (e) {
    case U.New:
      return "新卡";
    case U.Learning:
      return "学习中";
    case U.Review:
      return "复习中";
    case U.Relearning:
      return "重学中";
    default:
      return "未知";
  }
}
function qa(e) {
  if (!e) return "从未";
  const t = new Date(e), r = t.getFullYear(), n = String(t.getMonth() + 1).padStart(2, "0"), a = String(t.getDate()).padStart(2, "0"), s = String(t.getHours()).padStart(2, "0"), i = String(t.getMinutes()).padStart(2, "0");
  return `${r}-${n}-${a} ${s}:${i}`;
}
function Ka(e, t, r, n, a, s) {
  const i = e == null ? void 0 : e.some(
    (c) => c.t === `${r}.cloze` || typeof c.t == "string" && c.t.endsWith(".cloze")
  );
  return s === "bg" || !i && a && a.length > 0 ? (a == null ? void 0 : a.map((c, d) => {
    const l = n ? c.number === n : !0;
    return t || !l ? /* @__PURE__ */ o.jsx(
      "span",
      {
        style: {
          backgroundColor: "var(--orca-color-primary-1)",
          color: "var(--orca-color-primary-5)",
          fontWeight: "600",
          padding: "2px 6px",
          borderRadius: "4px",
          borderBottom: "2px solid var(--orca-color-primary-5)",
          margin: "0 2px"
        },
        children: c.content
      },
      d
    ) : /* @__PURE__ */ o.jsx(
      "span",
      {
        style: {
          color: "var(--orca-color-text-2)",
          fontWeight: "500",
          padding: "2px 6px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "4px",
          border: "1px dashed var(--orca-color-border-1)",
          margin: "0 2px"
        },
        children: "[...]"
      },
      d
    );
  })) || [/* @__PURE__ */ o.jsx("span", { children: "（空白内容）" }, "empty")] : !e || e.length === 0 ? [/* @__PURE__ */ o.jsx("span", { children: "（空白内容）" }, "empty")] : e.map((c, d) => {
    if (c.t === "t")
      return /* @__PURE__ */ o.jsx("span", { children: c.v }, d);
    if (c.t === `${r}.cloze`) {
      const l = c.clozeNumber;
      return t || !(n ? l === n : !0) ? /* @__PURE__ */ o.jsx(
        "span",
        {
          style: {
            backgroundColor: "var(--orca-color-primary-1)",
            color: "var(--orca-color-primary-5)",
            fontWeight: "600",
            padding: "2px 6px",
            borderRadius: "4px",
            borderBottom: "2px solid var(--orca-color-primary-5)"
          },
          children: c.v
        },
        d
      ) : /* @__PURE__ */ o.jsx(
        "span",
        {
          style: {
            color: "var(--orca-color-text-2)",
            fontWeight: "500",
            padding: "2px 6px",
            backgroundColor: "var(--orca-color-bg-2)",
            borderRadius: "4px",
            border: "1px dashed var(--orca-color-border-1)"
          },
          children: "[...]"
        },
        d
      );
    }
    return /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-2)" }, children: c.v }, d);
  });
}
function Su({
  blockId: e,
  onGrade: t,
  onPostpone: r,
  onSuspend: n,
  onClose: a,
  onSkip: s,
  onPrevious: i,
  canGoPrevious: c = !1,
  srsInfo: d,
  isGrading: l = !1,
  onJumpToCard: x,
  inSidePanel: u = !1,
  panelId: f,
  pluginName: p,
  clozeNumber: g,
  allClozeContent: y,
  cardType: v
}) {
  const [h, S] = mn(!1), [$, k] = mn(!1), [C, P] = mn(y || []), E = Ya(""), O = `${e}-${g ?? 0}`, j = Ya(null);
  jr(() => {
    E.current !== O && (S(!1), k(!1), E.current = O);
  }, [O]), jr(() => {
    y && (P(y), console.log(`[${p}] 从 props 接收 Cloze 内容:`, y));
  }, [y, p]), jr(() => {
    !y && v === "bg" && (async () => {
      try {
        const N = await Gr(e, p);
        P(N), console.log(`[${p}] 从块树提取到 Cloze 内容:`, N);
      } catch (N) {
        console.warn(`[${p}] 尝试从块树提取 Cloze 内容失败:`, N);
      }
    })();
  }, [e, p, y, v]), jr(() => {
    if (!j.current) return;
    const w = () => {
      j.current.querySelectorAll(".orca-repr-main-none-editable").forEach((G) => {
        const X = G;
        X.style.display = "", X.style.visibility = "", X.style.opacity = "";
      }), j.current.querySelectorAll(".orca-block-handle").forEach((G) => {
        const X = G;
        X.style.display = "", X.style.visibility = "", X.style.opacity = "";
      }), j.current.querySelectorAll(".orca-block-folding-handle").forEach((G) => {
        const X = G;
        X.style.display = "", X.style.visibility = "", X.style.opacity = "";
      });
    };
    w();
    const N = requestAnimationFrame(w), F = setTimeout(w, 100);
    return () => {
      cancelAnimationFrame(N), clearTimeout(F);
    };
  }, [e]), jr(() => {
    if (!j.current) return;
    console.log(`[${p}] 处理挖空遮盖，showAnswer: ${h}, clozeNumber: ${g}`), console.log(`[${p}] allClozeContent:`, C);
    const w = setTimeout(() => {
      if (!j.current) return;
      j.current.querySelectorAll(".srs-cloze-cover").forEach((_) => _.remove()), j.current.querySelectorAll(".orca-repr-main-none-editable").forEach((_) => {
        const G = _;
        G.style.display = "";
      }), j.current.querySelectorAll(".orca-block-handle").forEach((_) => {
        const G = _;
        G.style.display = "";
      });
      const m = j.current.querySelectorAll("[data-cloze-number]");
      console.log(`[${p}] 找到 ${m.length} 个挖空元素`), m.length > 0 && (j.current.querySelectorAll(".srs-cloze-cover").forEach((G) => G.remove()), m.forEach((G, X) => {
        const pe = parseInt(G.getAttribute("data-cloze-number") || "0"), J = G;
        if (console.log(`[${p}] 处理挖空元素 ${X}: number=${pe}, text=${J.textContent}`), !h && pe === g)
          J.getAttribute("data-original-text") || J.setAttribute("data-original-text", J.textContent || ""), J.textContent = "[...]", J.style.color = "var(--orca-color-text-2)", J.style.fontWeight = "500", J.style.border = "1px dashed var(--orca-color-border-1)", J.style.borderRadius = "4px", J.style.padding = "0 4px", J.style.backgroundColor = "var(--orca-color-bg-2)", console.log(`[${p}] 隐藏挖空元素 ${X}: ${pe}`);
        else if (h && pe === g) {
          const ae = J.getAttribute("data-original-text");
          ae && (J.textContent = ae, J.removeAttribute("data-original-text")), J.style.color = "var(--orca-color-primary-5)", J.style.borderBottom = "2px solid var(--orca-color-primary-5)", J.style.fontWeight = "600", J.style.border = "", J.style.borderRadius = "", J.style.padding = "", J.style.backgroundColor = "", console.log(`[${p}] 显示答案挖空元素 ${X}: ${pe}`);
        } else
          J.style.color = "#999", J.style.borderBottom = "2px solid #4a90e2", J.style.fontWeight = "", J.style.border = "", J.style.borderRadius = "", J.style.padding = "", J.style.backgroundColor = "", console.log(`[${p}] 保持挖空元素 ${X}: ${pe}`);
      }));
    }, 15);
    return () => clearTimeout(w);
  }, [h, e, g, C, p]);
  const B = yu(orca.state), z = Bt(() => ((B == null ? void 0 : B.blocks) ?? {})[e], [B == null ? void 0 : B.blocks, e]), M = async (w) => {
    l || (await t(w), S(!1));
  };
  eo({
    showAnswer: h,
    isGrading: l,
    onShowAnswer: () => S(!0),
    onGrade: M,
    onBury: r,
    onSuspend: n
  }), Bt(() => {
    const w = d ? {
      stability: d.stability ?? 0,
      difficulty: d.difficulty ?? 0,
      interval: d.interval ?? 0,
      due: d.due ?? /* @__PURE__ */ new Date(),
      lastReviewed: d.lastReviewed ?? null,
      reps: d.reps ?? 0,
      lapses: d.lapses ?? 0,
      state: d.state
    } : null;
    return Ko(w);
  }, [d]);
  const R = Bt(() => {
    const w = d ? {
      stability: d.stability ?? 0,
      difficulty: d.difficulty ?? 0,
      interval: d.interval ?? 0,
      due: d.due ?? /* @__PURE__ */ new Date(),
      lastReviewed: d.lastReviewed ?? null,
      reps: d.reps ?? 0,
      lapses: d.lapses ?? 0,
      state: d.state
    } : null;
    return Kr(w);
  }, [d]);
  if (!z)
    return /* @__PURE__ */ o.jsx("div", { style: {
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "32px",
      textAlign: "center",
      color: "var(--orca-color-text-2)"
    }, children: /* @__PURE__ */ o.jsx("div", { style: { fontSize: "14px", opacity: 0.75 }, children: "卡片加载中..." }) });
  const A = Bt(() => {
    const w = (z == null ? void 0 : z.content) ?? [];
    return w.some(
      (F) => F.t === `${p}.cloze` || typeof F.t == "string" && F.t.endsWith(".cloze")
    ), w;
  }, [z == null ? void 0 : z.content, p, C]);
  Bt(() => Ka(A, !1, p, g, C, v), [A, p, g, C, v]), Bt(() => Ka(A, !0, p, g, C, v), [A, p, g, C, v]), Bt(() => {
    var F, D, m;
    const w = [];
    let N = 0;
    if (!A || A.length === 0) {
      if (C && C.length > 0)
        for (const _ of C)
          (g ? _.number === g : !0) && w.push({
            start: N,
            end: N + _.content.length,
            text: _.content
          }), N += _.content.length + 4;
      return w;
    }
    for (const _ of A)
      if (_.t === `${p}.cloze`) {
        const G = _.clozeNumber;
        (g ? G === g : !0) && w.push({
          start: N,
          end: N + (((F = _.v) == null ? void 0 : F.length) || 0),
          text: _.v || ""
        }), N += ((D = _.v) == null ? void 0 : D.length) || 0;
      } else _.t === "t" && (N += ((m = _.v) == null ? void 0 : m.length) || 0);
    return w;
  }, [A, p, g, C]);
  const T = /* @__PURE__ */ o.jsxs("div", { className: "srs-cloze-card-container", style: {
    borderRadius: "12px",
    padding: "16px",
    width: u ? "100%" : "90%",
    minWidth: u ? "0" : "600px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
  }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "8px",
      opacity: 0.6,
      transition: "opacity 0.2s"
    }, onMouseEnter: (w) => w.currentTarget.style.opacity = "1", onMouseLeave: (w) => w.currentTarget.style.opacity = "0.6", children: [
      /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "4px" }, children: [
        i && /* @__PURE__ */ o.jsx(
          At,
          {
            variant: "plain",
            onClick: c ? i : void 0,
            title: "回到上一张",
            style: {
              padding: "4px 6px",
              fontSize: "14px",
              opacity: c ? 1 : 0.3,
              cursor: c ? "pointer" : "not-allowed"
            },
            children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-arrow-left" })
          }
        ),
        /* @__PURE__ */ o.jsxs("div", { style: {
          fontSize: "12px",
          fontWeight: "500",
          color: "var(--orca-color-primary-5)",
          backgroundColor: "var(--orca-color-primary-1)",
          padding: "2px 8px",
          borderRadius: "4px",
          display: "inline-flex",
          alignItems: "center",
          gap: "4px"
        }, children: [
          /* @__PURE__ */ o.jsx("i", { className: "ti ti-braces", style: { fontSize: "11px" } }),
          "c",
          g || "?"
        ] })
      ] }),
      /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "2px" }, children: [
        r && /* @__PURE__ */ o.jsx(
          At,
          {
            variant: "plain",
            onClick: r,
            title: "推迟到明天 (B)",
            style: { padding: "4px 6px", fontSize: "14px" },
            children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-calendar-pause" })
          }
        ),
        n && /* @__PURE__ */ o.jsx(
          At,
          {
            variant: "plain",
            onClick: n,
            title: "暂停卡片 (S)",
            style: { padding: "4px 6px", fontSize: "14px" },
            children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-player-pause" })
          }
        ),
        e && x && /* @__PURE__ */ o.jsx(
          At,
          {
            variant: "plain",
            onClick: (w) => x(e, w.shiftKey),
            title: "跳转到卡片 (Shift+点击在侧面板打开)",
            style: { padding: "4px 6px", fontSize: "14px" },
            children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-external-link" })
          }
        ),
        /* @__PURE__ */ o.jsx(
          At,
          {
            variant: "plain",
            onClick: () => k(!$),
            title: "卡片信息",
            style: {
              padding: "4px 6px",
              fontSize: "14px",
              color: $ ? "var(--orca-color-primary-5)" : void 0
            },
            children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-info-circle" })
          }
        )
      ] })
    ] }),
    $ && /* @__PURE__ */ o.jsx(
      "div",
      {
        contentEditable: !1,
        style: {
          marginBottom: "12px",
          padding: "12px 16px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "8px",
          fontSize: "13px",
          color: "var(--orca-color-text-2)"
        },
        children: /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
            /* @__PURE__ */ o.jsx("span", { children: "遗忘次数" }),
            /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: (d == null ? void 0 : d.lapses) ?? 0 })
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
            /* @__PURE__ */ o.jsx("span", { children: "复习次数" }),
            /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: (d == null ? void 0 : d.reps) ?? 0 })
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
            /* @__PURE__ */ o.jsx("span", { children: "卡片状态" }),
            /* @__PURE__ */ o.jsx("span", { style: {
              color: (d == null ? void 0 : d.state) === U.Review ? "var(--orca-color-success)" : (d == null ? void 0 : d.state) === U.Learning || (d == null ? void 0 : d.state) === U.Relearning ? "var(--orca-color-warning)" : "var(--orca-color-primary)"
            }, children: wu(d == null ? void 0 : d.state) })
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
            /* @__PURE__ */ o.jsx("span", { children: "最后复习" }),
            /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: qa(d == null ? void 0 : d.lastReviewed) })
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
            /* @__PURE__ */ o.jsx("span", { children: "下次到期" }),
            /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: qa(d == null ? void 0 : d.due) })
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
            /* @__PURE__ */ o.jsx("span", { children: "间隔天数" }),
            /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-text-1)" }, children: [
              (d == null ? void 0 : d.interval) ?? 0,
              " 天"
            ] })
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
            /* @__PURE__ */ o.jsx("span", { children: "稳定性" }),
            /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: ((d == null ? void 0 : d.stability) ?? 0).toFixed(2) })
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
            /* @__PURE__ */ o.jsx("span", { children: "难度" }),
            /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: ((d == null ? void 0 : d.difficulty) ?? 0).toFixed(2) })
          ] })
        ] })
      }
    ),
    e && /* @__PURE__ */ o.jsx("div", { style: {
      marginBottom: "12px",
      fontSize: "12px",
      color: "var(--orca-color-text-3)"
    }, children: /* @__PURE__ */ o.jsx(vu, { blockId: e }) }),
    /* @__PURE__ */ o.jsx("div", { style: { display: "flex", flexDirection: "column", gap: "16px" }, children: /* @__PURE__ */ o.jsx(
      "div",
      {
        className: "srs-card-front",
        style: {
          marginBottom: "16px",
          padding: "20px",
          backgroundColor: "var(--orca-color-bg-2)",
          borderRadius: "8px",
          minHeight: "80px"
        },
        children: /* @__PURE__ */ o.jsx(
          "div",
          {
            ref: j,
            className: "srs-cloze-question",
            style: {
              position: "relative"
            },
            children: /* @__PURE__ */ o.jsx(
              bu,
              {
                blockId: e,
                panelId: f || "srs-review-panel",
                blockLevel: 0,
                indentLevel: 0,
                renderingMode: "normal",
                style: {
                  border: "1px solid var(--orca-color-border-1)",
                  borderRadius: "8px"
                }
              }
            )
          }
        )
      }
    ) }),
    h ? /* @__PURE__ */ o.jsx(o.Fragment, { children: /* @__PURE__ */ o.jsxs("div", { className: "srs-card-grade-buttons", style: {
      display: "grid",
      gridTemplateColumns: s ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
      gap: "8px",
      marginTop: "20px"
    }, children: [
      s && /* @__PURE__ */ o.jsxs(
        "button",
        {
          onClick: s,
          style: {
            padding: "16px 8px",
            fontSize: "14px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            backgroundColor: "rgba(156, 163, 175, 0.12)",
            border: "1px solid rgba(156, 163, 175, 0.2)",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s"
          },
          onMouseEnter: (w) => {
            w.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.18)", w.currentTarget.style.transform = "translateY(-2px)";
          },
          onMouseLeave: (w) => {
            w.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.12)", w.currentTarget.style.transform = "translateY(0)";
          },
          children: [
            /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: "不评分" }),
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "⏭️" }),
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "跳过" })
          ]
        }
      ),
      /* @__PURE__ */ o.jsxs(
        "button",
        {
          onClick: () => M("again"),
          style: {
            padding: "16px 8px",
            fontSize: "14px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            backgroundColor: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s"
          },
          onMouseEnter: (w) => {
            w.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.18)", w.currentTarget.style.transform = "translateY(-2px)";
          },
          onMouseLeave: (w) => {
            w.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.12)", w.currentTarget.style.transform = "translateY(0)";
          },
          children: [
            /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(R.again) }),
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😞" }),
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "忘记" })
          ]
        }
      ),
      /* @__PURE__ */ o.jsxs(
        "button",
        {
          onClick: () => M("hard"),
          style: {
            padding: "16px 8px",
            fontSize: "14px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            backgroundColor: "rgba(251, 191, 36, 0.12)",
            border: "1px solid rgba(251, 191, 36, 0.2)",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s"
          },
          onMouseEnter: (w) => {
            w.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.18)", w.currentTarget.style.transform = "translateY(-2px)";
          },
          onMouseLeave: (w) => {
            w.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.12)", w.currentTarget.style.transform = "translateY(0)";
          },
          children: [
            /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(R.hard) }),
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😐" }),
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "困难" })
          ]
        }
      ),
      /* @__PURE__ */ o.jsxs(
        "button",
        {
          onClick: () => M("good"),
          style: {
            padding: "16px 8px",
            fontSize: "14px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            backgroundColor: "rgba(34, 197, 94, 0.12)",
            border: "1px solid rgba(34, 197, 94, 0.2)",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s"
          },
          onMouseEnter: (w) => {
            w.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.18)", w.currentTarget.style.transform = "translateY(-2px)";
          },
          onMouseLeave: (w) => {
            w.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.12)", w.currentTarget.style.transform = "translateY(0)";
          },
          children: [
            /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(R.good) }),
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😊" }),
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "良好" })
          ]
        }
      ),
      /* @__PURE__ */ o.jsxs(
        "button",
        {
          onClick: () => M("easy"),
          style: {
            padding: "16px 8px",
            fontSize: "14px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            backgroundColor: "rgba(59, 130, 246, 0.12)",
            border: "1px solid rgba(59, 130, 246, 0.2)",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.2s"
          },
          onMouseEnter: (w) => {
            w.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.18)", w.currentTarget.style.transform = "translateY(-2px)";
          },
          onMouseLeave: (w) => {
            w.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.12)", w.currentTarget.style.transform = "translateY(0)";
          },
          children: [
            /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(R.easy) }),
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😄" }),
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "简单" })
          ]
        }
      )
    ] }) }) : /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "center", gap: "12px", marginTop: "20px" }, children: [
      s && /* @__PURE__ */ o.jsx(
        At,
        {
          variant: "outline",
          onClick: s,
          title: "跳过当前卡片，不评分",
          style: {
            padding: "12px 24px",
            fontSize: "16px"
          },
          children: "跳过"
        }
      ),
      /* @__PURE__ */ o.jsx(
        At,
        {
          variant: "solid",
          onClick: () => S(!0),
          style: {
            padding: "12px 32px",
            fontSize: "16px"
          },
          children: "显示答案"
        }
      )
    ] })
  ] });
  return u ? /* @__PURE__ */ o.jsx("div", { style: { width: "100%", display: "flex", justifyContent: "center" }, children: T }) : /* @__PURE__ */ o.jsx(
    mu,
    {
      visible: !0,
      canClose: !0,
      onClose: a,
      className: "srs-cloze-card-modal",
      children: T
    }
  );
}
const { useState: Ua, useMemo: uo, useRef: Cu, useEffect: ku } = window.React, { useSnapshot: ju } = window.Valtio, { Button: Pt } = orca.components;
function Ru(e) {
  if (e == null) return "新卡";
  switch (e) {
    case U.New:
      return "新卡";
    case U.Learning:
      return "学习中";
    case U.Review:
      return "复习中";
    case U.Relearning:
      return "重学中";
    default:
      return "未知";
  }
}
function Va(e) {
  if (!e) return "从未";
  const t = new Date(e), r = t.getFullYear(), n = String(t.getMonth() + 1).padStart(2, "0"), a = String(t.getDate()).padStart(2, "0"), s = String(t.getHours()).padStart(2, "0"), i = String(t.getMinutes()).padStart(2, "0");
  return `${r}-${n}-${a} ${s}:${i}`;
}
function $u({
  blockId: e,
  onGrade: t,
  onPostpone: r,
  onSuspend: n,
  onClose: a,
  onSkip: s,
  onPrevious: i,
  canGoPrevious: c = !1,
  srsInfo: d,
  isGrading: l = !1,
  onJumpToCard: x,
  inSidePanel: u = !1,
  panelId: f,
  pluginName: p,
  reviewDirection: g
}) {
  const [y, v] = Ua(!1), [h, S] = Ua(!1), $ = Cu(""), k = `${e}-${g}`;
  ku(() => {
    $.current !== k && (v(!1), S(!1), $.current = k);
  }, [k]);
  const C = ju(orca.state), P = uo(() => {
    var w;
    return (w = C == null ? void 0 : C.blocks) == null ? void 0 : w[e];
  }, [C == null ? void 0 : C.blocks, e]), E = uo(() => sa(P == null ? void 0 : P.content, p), [P == null ? void 0 : P.content, p]), O = async (w) => {
    l || (await t(w), v(!1));
  };
  eo({
    showAnswer: y,
    isGrading: l,
    onShowAnswer: () => v(!0),
    onGrade: O,
    onBury: r,
    onSuspend: n
  }), uo(() => {
    const w = d ? {
      stability: d.stability ?? 0,
      difficulty: d.difficulty ?? 0,
      interval: d.interval ?? 0,
      due: d.due ?? /* @__PURE__ */ new Date(),
      lastReviewed: d.lastReviewed ?? null,
      reps: d.reps ?? 0,
      lapses: d.lapses ?? 0,
      state: d.state
    } : null;
    return Ko(w);
  }, [d]);
  const j = uo(() => {
    const w = d ? {
      stability: d.stability ?? 0,
      difficulty: d.difficulty ?? 0,
      interval: d.interval ?? 0,
      due: d.due ?? /* @__PURE__ */ new Date(),
      lastReviewed: d.lastReviewed ?? null,
      reps: d.reps ?? 0,
      lapses: d.lapses ?? 0,
      state: d.state
    } : null;
    return Kr(w);
  }, [d]);
  if (!P)
    return /* @__PURE__ */ o.jsx("div", { style: {
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "32px",
      textAlign: "center",
      color: "var(--orca-color-text-2)"
    }, children: /* @__PURE__ */ o.jsx("div", { style: { fontSize: "14px", opacity: 0.75 }, children: "卡片加载中..." }) });
  if (!E)
    return /* @__PURE__ */ o.jsx("div", { style: { padding: "20px", textAlign: "center" }, children: "无法解析方向卡内容" });
  const B = g === "forward" ? E.leftText : E.rightText, z = g === "forward" ? E.rightText : E.leftText, M = g === "forward" ? "ti-arrow-right" : "ti-arrow-left", R = g === "forward" ? "正向" : "反向", A = g === "forward" ? "var(--orca-color-primary-5)" : "var(--orca-color-warning-5)", T = g === "forward" ? "var(--orca-color-primary-1)" : "var(--orca-color-warning-1)";
  return /* @__PURE__ */ o.jsxs(
    "div",
    {
      className: "srs-direction-card-container",
      style: {
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "16px",
        width: u ? "100%" : "90%",
        minWidth: u ? "0" : "600px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
      },
      children: [
        /* @__PURE__ */ o.jsxs(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
              opacity: 0.6,
              transition: "opacity 0.2s"
            },
            onMouseEnter: (w) => w.currentTarget.style.opacity = "1",
            onMouseLeave: (w) => w.currentTarget.style.opacity = "0.6",
            children: [
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "4px" }, children: [
                i && /* @__PURE__ */ o.jsx(
                  Pt,
                  {
                    variant: "plain",
                    onClick: c ? i : void 0,
                    title: "回到上一张",
                    style: {
                      padding: "4px 6px",
                      fontSize: "14px",
                      opacity: c ? 1 : 0.3,
                      cursor: c ? "pointer" : "not-allowed"
                    },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-arrow-left" })
                  }
                ),
                /* @__PURE__ */ o.jsxs(
                  "div",
                  {
                    style: {
                      fontSize: "12px",
                      fontWeight: "500",
                      color: A,
                      backgroundColor: T,
                      padding: "2px 8px",
                      borderRadius: "4px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    },
                    children: [
                      /* @__PURE__ */ o.jsx("i", { className: `ti ${M}`, style: { fontSize: "11px" } }),
                      R
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "2px" }, children: [
                r && /* @__PURE__ */ o.jsx(
                  Pt,
                  {
                    variant: "plain",
                    onClick: r,
                    title: "推迟到明天 (B)",
                    style: { padding: "4px 6px", fontSize: "14px" },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-calendar-pause" })
                  }
                ),
                n && /* @__PURE__ */ o.jsx(
                  Pt,
                  {
                    variant: "plain",
                    onClick: n,
                    title: "暂停卡片 (S)",
                    style: { padding: "4px 6px", fontSize: "14px" },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-player-pause" })
                  }
                ),
                e && x && /* @__PURE__ */ o.jsx(
                  Pt,
                  {
                    variant: "plain",
                    onClick: (w) => x(e, w.shiftKey),
                    title: "跳转到卡片 (Shift+点击在侧面板打开)",
                    style: { padding: "4px 6px", fontSize: "14px" },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-external-link" })
                  }
                ),
                /* @__PURE__ */ o.jsx(
                  Pt,
                  {
                    variant: "plain",
                    onClick: () => S(!h),
                    title: "卡片信息",
                    style: {
                      padding: "4px 6px",
                      fontSize: "14px",
                      color: h ? "var(--orca-color-primary-5)" : void 0
                    },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-info-circle" })
                  }
                )
              ] })
            ]
          }
        ),
        h && /* @__PURE__ */ o.jsx(
          "div",
          {
            contentEditable: !1,
            style: {
              marginBottom: "12px",
              padding: "12px 16px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "8px",
              fontSize: "13px",
              color: "var(--orca-color-text-2)"
            },
            children: /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "遗忘次数" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: (d == null ? void 0 : d.lapses) ?? 0 })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "复习次数" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: (d == null ? void 0 : d.reps) ?? 0 })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "卡片状态" }),
                /* @__PURE__ */ o.jsx("span", { style: {
                  color: (d == null ? void 0 : d.state) === U.Review ? "var(--orca-color-success)" : (d == null ? void 0 : d.state) === U.Learning || (d == null ? void 0 : d.state) === U.Relearning ? "var(--orca-color-warning)" : "var(--orca-color-primary)"
                }, children: Ru(d == null ? void 0 : d.state) })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "最后复习" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: Va(d == null ? void 0 : d.lastReviewed) })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "下次到期" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: Va(d == null ? void 0 : d.due) })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "间隔天数" }),
                /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-text-1)" }, children: [
                  (d == null ? void 0 : d.interval) ?? 0,
                  " 天"
                ] })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "稳定性" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: ((d == null ? void 0 : d.stability) ?? 0).toFixed(2) })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "难度" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: ((d == null ? void 0 : d.difficulty) ?? 0).toFixed(2) })
              ] })
            ] })
          }
        ),
        /* @__PURE__ */ o.jsx(
          "div",
          {
            className: "srs-direction-question",
            style: {
              marginBottom: "16px",
              padding: "20px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "8px",
              minHeight: "100px",
              fontSize: "18px",
              lineHeight: "1.8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px"
            },
            children: g === "forward" ? /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
              /* @__PURE__ */ o.jsx("span", { style: { fontWeight: 500 }, children: B }),
              /* @__PURE__ */ o.jsx(
                "i",
                {
                  className: `ti ${M}`,
                  style: {
                    fontSize: "20px",
                    color: A
                  }
                }
              ),
              y ? /* @__PURE__ */ o.jsx(
                "span",
                {
                  style: {
                    fontWeight: 600,
                    color: A,
                    backgroundColor: T,
                    padding: "4px 12px",
                    borderRadius: "6px"
                  },
                  children: z
                }
              ) : /* @__PURE__ */ o.jsx(
                "span",
                {
                  style: {
                    color: "var(--orca-color-text-2)",
                    backgroundColor: "var(--orca-color-bg-3)",
                    padding: "4px 12px",
                    borderRadius: "6px",
                    border: "1px dashed var(--orca-color-border-1)"
                  },
                  children: "❓"
                }
              )
            ] }) : /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
              y ? /* @__PURE__ */ o.jsx(
                "span",
                {
                  style: {
                    fontWeight: 600,
                    color: A,
                    backgroundColor: T,
                    padding: "4px 12px",
                    borderRadius: "6px"
                  },
                  children: z
                }
              ) : /* @__PURE__ */ o.jsx(
                "span",
                {
                  style: {
                    color: "var(--orca-color-text-2)",
                    backgroundColor: "var(--orca-color-bg-3)",
                    padding: "4px 12px",
                    borderRadius: "6px",
                    border: "1px dashed var(--orca-color-border-1)"
                  },
                  children: "❓"
                }
              ),
              /* @__PURE__ */ o.jsx(
                "i",
                {
                  className: `ti ${M}`,
                  style: {
                    fontSize: "20px",
                    color: A
                  }
                }
              ),
              /* @__PURE__ */ o.jsx("span", { style: { fontWeight: 500 }, children: B })
            ] })
          }
        ),
        y ? /* @__PURE__ */ o.jsxs(
          "div",
          {
            className: "srs-card-grade-buttons",
            style: {
              display: "grid",
              gridTemplateColumns: s ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
              gap: "8px",
              marginTop: "16px"
            },
            children: [
              s && /* @__PURE__ */ o.jsxs(
                "button",
                {
                  onClick: s,
                  style: {
                    padding: "16px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "rgba(156, 163, 175, 0.12)",
                    border: "1px solid rgba(156, 163, 175, 0.2)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  },
                  onMouseEnter: (w) => {
                    w.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.18)", w.currentTarget.style.transform = "translateY(-2px)";
                  },
                  onMouseLeave: (w) => {
                    w.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.12)", w.currentTarget.style.transform = "translateY(0)";
                  },
                  children: [
                    /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: "不评分" }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "⏭️" }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "跳过" })
                  ]
                }
              ),
              /* @__PURE__ */ o.jsxs(
                "button",
                {
                  onClick: () => O("again"),
                  style: {
                    padding: "16px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "rgba(239, 68, 68, 0.12)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  },
                  onMouseEnter: (w) => {
                    w.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.18)", w.currentTarget.style.transform = "translateY(-2px)";
                  },
                  onMouseLeave: (w) => {
                    w.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.12)", w.currentTarget.style.transform = "translateY(0)";
                  },
                  children: [
                    /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(j.again) }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😞" }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "忘记" })
                  ]
                }
              ),
              /* @__PURE__ */ o.jsxs(
                "button",
                {
                  onClick: () => O("hard"),
                  style: {
                    padding: "16px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "rgba(251, 191, 36, 0.12)",
                    border: "1px solid rgba(251, 191, 36, 0.2)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  },
                  onMouseEnter: (w) => {
                    w.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.18)", w.currentTarget.style.transform = "translateY(-2px)";
                  },
                  onMouseLeave: (w) => {
                    w.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.12)", w.currentTarget.style.transform = "translateY(0)";
                  },
                  children: [
                    /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(j.hard) }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😐" }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "困难" })
                  ]
                }
              ),
              /* @__PURE__ */ o.jsxs(
                "button",
                {
                  onClick: () => O("good"),
                  style: {
                    padding: "16px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "rgba(34, 197, 94, 0.12)",
                    border: "1px solid rgba(34, 197, 94, 0.2)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  },
                  onMouseEnter: (w) => {
                    w.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.18)", w.currentTarget.style.transform = "translateY(-2px)";
                  },
                  onMouseLeave: (w) => {
                    w.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.12)", w.currentTarget.style.transform = "translateY(0)";
                  },
                  children: [
                    /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(j.good) }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😊" }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "良好" })
                  ]
                }
              ),
              /* @__PURE__ */ o.jsxs(
                "button",
                {
                  onClick: () => O("easy"),
                  style: {
                    padding: "16px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "rgba(59, 130, 246, 0.12)",
                    border: "1px solid rgba(59, 130, 246, 0.2)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  },
                  onMouseEnter: (w) => {
                    w.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.18)", w.currentTarget.style.transform = "translateY(-2px)";
                  },
                  onMouseLeave: (w) => {
                    w.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.12)", w.currentTarget.style.transform = "translateY(0)";
                  },
                  children: [
                    /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(j.easy) }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😄" }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "简单" })
                  ]
                }
              )
            ]
          }
        ) : /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "center", gap: "12px", marginBottom: "12px" }, children: [
          s && /* @__PURE__ */ o.jsx(
            Pt,
            {
              variant: "outline",
              onClick: s,
              title: "跳过当前卡片，不评分",
              style: {
                padding: "12px 24px",
                fontSize: "16px"
              },
              children: "跳过"
            }
          ),
          /* @__PURE__ */ o.jsx(
            Pt,
            {
              variant: "solid",
              onClick: () => v(!0),
              style: {
                padding: "12px 32px",
                fontSize: "16px"
              },
              children: "显示答案"
            }
          )
        ] })
      ]
    }
  );
}
const { useMemo: fo, useRef: Du, useEffect: Tu } = window.React, { Block: Eu } = orca.components;
function _u(e) {
  return String.fromCharCode(65 + e);
}
function zu({
  blockId: e,
  index: t,
  isSelected: r,
  isCorrect: n,
  isAnswerRevealed: a,
  mode: s,
  onClick: i,
  disabled: c = !1
}) {
  const d = Du(null), l = fo(() => `choice-option-${e}`, [e]);
  Tu(() => {
    const g = d.current;
    if (!g) return;
    const y = `choice-opt-${e}`;
    g.setAttribute("data-choice-option", y);
    const v = `style-choice-opt-${e}`;
    if (document.getElementById(v)) return;
    const h = document.createElement("style");
    return h.id = v, h.textContent = `
      [data-choice-option="${y}"] .orca-block-children,
      [data-choice-option="${y}"] .orca-repr-children {
        display: block !important;
      }
      [data-choice-option="${y}"] .orca-block-handle,
      [data-choice-option="${y}"] .orca-block-folding-handle,
      [data-choice-option="${y}"] .orca-block-drag-handle,
      [data-choice-option="${y}"] .orca-repr-main-none-editable,
      [data-choice-option="${y}"] .orca-block-editor-sidetools {
        display: none !important;
      }
      [data-choice-option="${y}"] .orca-repr-main-content {
        font-size: 14px;
        line-height: 1.6;
      }
      [data-choice-option="${y}"] .orca-block-editor {
        background: transparent !important;
      }
      [data-choice-option="${y}"] .orca-block {
        margin: 0 !important;
        padding: 0 !important;
      }
      /* 隐藏正确标记标签（答案揭晓前） */
      ${a ? "" : `
      [data-choice-option="${y}"] .orca-tag[data-tag-name="correct"],
      [data-choice-option="${y}"] .orca-tag[data-tag-name="Correct"],
      [data-choice-option="${y}"] .orca-tag[data-tag-name="CORRECT"],
      [data-choice-option="${y}"] .orca-tag[data-tag-name="正确"] {
        display: none !important;
      }
      `}
      /* 图片尺寸限制 */
      [data-choice-option="${y}"] img {
        max-width: 100%;
        max-height: 200px;
        object-fit: contain;
      }
      /* 代码块横向滚动 */
      [data-choice-option="${y}"] pre,
      [data-choice-option="${y}"] code {
        overflow-x: auto;
        max-width: 100%;
      }
    `, document.head.appendChild(h), () => {
      const S = document.getElementById(v);
      S && document.head.removeChild(S);
    };
  }, [e, a]);
  const x = fo(() => {
    const g = {
      display: "flex",
      alignItems: "flex-start",
      gap: "12px",
      padding: "12px 16px",
      borderRadius: "8px",
      cursor: c ? "default" : "pointer",
      transition: "all 0.2s ease",
      border: "2px solid transparent",
      backgroundColor: "var(--orca-color-bg-2)",
      minHeight: "48px"
    };
    return a ? n && r ? {
      ...g,
      backgroundColor: "rgba(34, 197, 94, 0.15)",
      borderColor: "rgba(34, 197, 94, 0.5)"
    } : n && !r ? {
      ...g,
      backgroundColor: "rgba(34, 197, 94, 0.08)",
      borderColor: "rgba(34, 197, 94, 0.3)"
    } : !n && r ? {
      ...g,
      backgroundColor: "rgba(239, 68, 68, 0.15)",
      borderColor: "rgba(239, 68, 68, 0.5)"
    } : g : r ? {
      ...g,
      backgroundColor: "var(--orca-color-primary-1)",
      borderColor: "var(--orca-color-primary-5)"
    } : g;
  }, [r, n, a, c]), u = fo(() => {
    const g = {
      width: "20px",
      height: "20px",
      borderRadius: s === "single" ? "50%" : "4px",
      border: "2px solid var(--orca-color-border-2)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      transition: "all 0.2s ease",
      marginTop: "2px"
    };
    if (a) {
      if (n)
        return {
          ...g,
          borderColor: "rgba(34, 197, 94, 0.8)",
          backgroundColor: r ? "rgba(34, 197, 94, 0.8)" : "transparent"
        };
      if (r)
        return {
          ...g,
          borderColor: "rgba(239, 68, 68, 0.8)",
          backgroundColor: "rgba(239, 68, 68, 0.8)"
        };
    } else if (r)
      return {
        ...g,
        borderColor: "var(--orca-color-primary-5)",
        backgroundColor: "var(--orca-color-primary-5)"
      };
    return g;
  }, [s, r, n, a]), f = {
    width: "24px",
    height: "24px",
    borderRadius: "4px",
    backgroundColor: r ? "var(--orca-color-primary-5)" : "var(--orca-color-bg-3)",
    color: r ? "white" : "var(--orca-color-text-2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 600,
    fontSize: "12px",
    flexShrink: 0,
    transition: "all 0.2s ease"
  }, p = fo(() => a ? n ? {
    ...f,
    backgroundColor: "rgba(34, 197, 94, 0.8)",
    color: "white"
  } : r ? {
    ...f,
    backgroundColor: "rgba(239, 68, 68, 0.8)",
    color: "white"
  } : f : f, [a, n, r]);
  return /* @__PURE__ */ o.jsxs(
    "div",
    {
      className: "srs-choice-option",
      style: x,
      onClick: c ? void 0 : i,
      onMouseEnter: (g) => {
        !c && !a && (g.currentTarget.style.backgroundColor = r ? "var(--orca-color-primary-2)" : "var(--orca-color-bg-3)");
      },
      onMouseLeave: (g) => {
        !c && !a && (g.currentTarget.style.backgroundColor = r ? "var(--orca-color-primary-1)" : "var(--orca-color-bg-2)");
      },
      children: [
        /* @__PURE__ */ o.jsx("div", { style: p, children: _u(t) }),
        /* @__PURE__ */ o.jsxs("div", { style: u, children: [
          r && /* @__PURE__ */ o.jsx(
            "i",
            {
              className: s === "single" ? "ti ti-circle-filled" : "ti ti-check",
              style: {
                fontSize: s === "single" ? "8px" : "12px",
                color: "white"
              }
            }
          ),
          a && n && !r && /* @__PURE__ */ o.jsx(
            "i",
            {
              className: "ti ti-check",
              style: { fontSize: "12px", color: "rgba(34, 197, 94, 0.8)" }
            }
          )
        ] }),
        /* @__PURE__ */ o.jsx(
          "div",
          {
            ref: d,
            style: {
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis"
            },
            children: /* @__PURE__ */ o.jsx(
              Eu,
              {
                panelId: l,
                blockId: e,
                blockLevel: 0,
                indentLevel: 0,
                renderingMode: "normal"
              }
            )
          }
        ),
        a && /* @__PURE__ */ o.jsxs("div", { style: { flexShrink: 0, marginLeft: "8px" }, children: [
          n && r && /* @__PURE__ */ o.jsx("i", { className: "ti ti-circle-check", style: { fontSize: "20px", color: "rgba(34, 197, 94, 0.9)" } }),
          n && !r && /* @__PURE__ */ o.jsx("i", { className: "ti ti-circle-check", style: { fontSize: "20px", color: "rgba(34, 197, 94, 0.6)" } }),
          !n && r && /* @__PURE__ */ o.jsx("i", { className: "ti ti-circle-x", style: { fontSize: "20px", color: "rgba(239, 68, 68, 0.9)" } })
        ] })
      ]
    }
  );
}
const { useRef: Iu, useEffect: Mu, useMemo: Bu } = window.React, { Block: Au } = orca.components;
function va({ blockId: e, panelId: t, cardType: r }) {
  const n = Iu(null), a = Bu(() => `block-preview-${e}`, [e]);
  return Mu(() => {
    const s = n.current;
    if (!s) return;
    const i = `preview-${e}`;
    s.setAttribute("data-block-preview", i);
    const c = `style-preview-${e}`;
    if (document.getElementById(c)) return;
    const d = document.createElement("style");
    d.id = c;
    let l = `
      [data-block-preview="${i}"] .orca-block-handle,
      [data-block-preview="${i}"] .orca-block-folding-handle,
      [data-block-preview="${i}"] .orca-block-drag-handle,
      [data-block-preview="${i}"] .orca-repr-main-none-editable,
      [data-block-preview="${i}"] .orca-block-editor-sidetools {
        display: none !important;
      }
      [data-block-preview="${i}"] .orca-repr-main-content {
        font-size: 14px;
        line-height: 1.5;
      }
      [data-block-preview="${i}"] .orca-block-editor {
        background: transparent !important;
      }
      [data-block-preview="${i}"] .orca-block {
        margin: 0 !important;
        padding: 0 !important;
      }
    `;
    return r !== "bg" && (l = `
        [data-block-preview="${i}"] .orca-block-children,
        [data-block-preview="${i}"] .orca-repr-children {
          display: none !important;
        }
        ${l}
      `), d.textContent = l, document.head.appendChild(d), () => {
      const x = document.getElementById(c);
      x && document.head.removeChild(x);
    };
  }, [e, r]), e ? /* @__PURE__ */ o.jsx("div", { ref: n, style: { minHeight: "20px" }, children: /* @__PURE__ */ o.jsx(
    Au,
    {
      panelId: a,
      blockId: e,
      blockLevel: 0,
      indentLevel: 0,
      renderingMode: "normal"
    }
  ) }) : /* @__PURE__ */ o.jsx("div", { style: { color: "var(--orca-color-text-3)", fontSize: "12px" }, children: "无效的卡片" });
}
const { useState: po, useMemo: Ga, useCallback: xo, useRef: Pu, useEffect: Lu } = window.React, { useSnapshot: Ou } = window.Valtio, { Button: Rr } = orca.components;
function Fu(e) {
  if (e == null) return "新卡";
  switch (e) {
    case U.New:
      return "新卡";
    case U.Learning:
      return "学习中";
    case U.Review:
      return "复习中";
    case U.Relearning:
      return "重学中";
    default:
      return "未知";
  }
}
function Ja(e) {
  if (!e) return "从未";
  const t = new Date(e), r = t.getFullYear(), n = String(t.getMonth() + 1).padStart(2, "0"), a = String(t.getDate()).padStart(2, "0"), s = String(t.getHours()).padStart(2, "0"), i = String(t.getMinutes()).padStart(2, "0");
  return `${r}-${n}-${a} ${s}:${i}`;
}
function Wu({
  blockId: e,
  options: t,
  mode: r,
  onGrade: n,
  onAnswer: a,
  onPostpone: s,
  onSuspend: i,
  onClose: c,
  onSkip: d,
  onPrevious: l,
  canGoPrevious: x = !1,
  srsInfo: u,
  isGrading: f = !1,
  onJumpToCard: p,
  inSidePanel: g = !1,
  panelId: y,
  suggestedGrade: v
}) {
  const [h, S] = po(/* @__PURE__ */ new Set()), [$, k] = po(!1), [C, P] = po(!1), [E, O] = po(null), j = Pu(""), B = `${e}`;
  Lu(() => {
    j.current !== B && (S(/* @__PURE__ */ new Set()), k(!1), P(!1), O(null), j.current = B);
  }, [B]), Ou(orca.state);
  const z = Ga(() => new Set(t.filter((m) => m.isCorrect).map((m) => m.blockId)), [t]), M = xo(() => {
    if (r === "undefined" || z.size === 0)
      return null;
    const m = Array.from(h), _ = m.some((X) => !z.has(X)), G = Array.from(z).every((X) => h.has(X));
    return r === "single" ? h.size === 1 && z.has(m[0]) ? "good" : "again" : _ ? "again" : G ? "good" : "hard";
  }, [h, z, r]), R = xo((m) => {
    $ || f || (r === "single" ? (S(/* @__PURE__ */ new Set([m])), setTimeout(() => {
      k(!0);
      const _ = z.has(m) ? "good" : "again";
      O(_), a == null || a([m]);
    }, 150)) : S((_) => {
      const G = new Set(_);
      return G.has(m) ? G.delete(m) : G.add(m), G;
    }));
  }, [r, $, f, z, a]), A = xo(() => {
    if ($ || f || r !== "multiple") return;
    k(!0);
    const m = M();
    O(m), a == null || a(Array.from(h));
  }, [$, f, r, h, M, a]), T = xo(async (m) => {
    f || (await n(m), S(/* @__PURE__ */ new Set()), k(!1), O(null));
  }, [f, n]), w = Ga(() => {
    const m = u ? {
      stability: u.stability ?? 0,
      difficulty: u.difficulty ?? 0,
      interval: u.interval ?? 0,
      due: u.due ?? /* @__PURE__ */ new Date(),
      lastReviewed: u.lastReviewed ?? null,
      reps: u.reps ?? 0,
      lapses: u.lapses ?? 0,
      state: u.state
    } : null;
    return Kr(m);
  }, [u]);
  eo({
    showAnswer: $,
    isGrading: f,
    onGrade: T,
    onBury: s,
    onSuspend: i,
    choiceCard: {
      mode: r,
      optionCount: t.length,
      onSelectOption: (m) => R(t[m].blockId),
      onSubmit: A
    }
  });
  const N = r === "single" ? "单选" : r === "multiple" ? "多选" : "选择", F = r === "single" ? "var(--orca-color-primary-5)" : "var(--orca-color-warning-5)", D = r === "single" ? "var(--orca-color-primary-1)" : "var(--orca-color-warning-1)";
  return /* @__PURE__ */ o.jsxs(
    "div",
    {
      className: "srs-choice-card-container",
      style: {
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "16px",
        width: g ? "100%" : "90%",
        minWidth: g ? "0" : "600px",
        maxWidth: "800px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
      },
      children: [
        /* @__PURE__ */ o.jsxs(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
              opacity: 0.6,
              transition: "opacity 0.2s"
            },
            onMouseEnter: (m) => m.currentTarget.style.opacity = "1",
            onMouseLeave: (m) => m.currentTarget.style.opacity = "0.6",
            children: [
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "4px" }, children: [
                l && /* @__PURE__ */ o.jsx(
                  Rr,
                  {
                    variant: "plain",
                    onClick: x ? l : void 0,
                    title: "回到上一张",
                    style: {
                      padding: "4px 6px",
                      fontSize: "14px",
                      opacity: x ? 1 : 0.3,
                      cursor: x ? "pointer" : "not-allowed"
                    },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-arrow-left" })
                  }
                ),
                /* @__PURE__ */ o.jsxs(
                  "div",
                  {
                    style: {
                      fontSize: "12px",
                      fontWeight: "500",
                      color: F,
                      backgroundColor: D,
                      padding: "2px 8px",
                      borderRadius: "4px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px"
                    },
                    children: [
                      /* @__PURE__ */ o.jsx("i", { className: "ti ti-list-check", style: { fontSize: "11px" } }),
                      N
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "2px" }, children: [
                s && /* @__PURE__ */ o.jsx(
                  Rr,
                  {
                    variant: "plain",
                    onClick: s,
                    title: "推迟到明天 (B)",
                    style: { padding: "4px 6px", fontSize: "14px" },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-calendar-pause" })
                  }
                ),
                i && /* @__PURE__ */ o.jsx(
                  Rr,
                  {
                    variant: "plain",
                    onClick: i,
                    title: "暂停卡片 (S)",
                    style: { padding: "4px 6px", fontSize: "14px" },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-player-pause" })
                  }
                ),
                e && p && /* @__PURE__ */ o.jsx(
                  Rr,
                  {
                    variant: "plain",
                    onClick: (m) => p(e, m.shiftKey),
                    title: "跳转到卡片 (Shift+点击在侧面板打开)",
                    style: { padding: "4px 6px", fontSize: "14px" },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-external-link" })
                  }
                ),
                /* @__PURE__ */ o.jsx(
                  Rr,
                  {
                    variant: "plain",
                    onClick: () => P(!C),
                    title: "卡片信息",
                    style: {
                      padding: "4px 6px",
                      fontSize: "14px",
                      color: C ? "var(--orca-color-primary-5)" : void 0
                    },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-info-circle" })
                  }
                )
              ] })
            ]
          }
        ),
        C && /* @__PURE__ */ o.jsx(
          "div",
          {
            contentEditable: !1,
            style: {
              marginBottom: "12px",
              padding: "12px 16px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "8px",
              fontSize: "13px",
              color: "var(--orca-color-text-2)"
            },
            children: /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "遗忘次数" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: (u == null ? void 0 : u.lapses) ?? 0 })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "复习次数" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: (u == null ? void 0 : u.reps) ?? 0 })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "卡片状态" }),
                /* @__PURE__ */ o.jsx("span", { style: {
                  color: (u == null ? void 0 : u.state) === U.Review ? "var(--orca-color-success)" : (u == null ? void 0 : u.state) === U.Learning || (u == null ? void 0 : u.state) === U.Relearning ? "var(--orca-color-warning)" : "var(--orca-color-primary)"
                }, children: Fu(u == null ? void 0 : u.state) })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "最后复习" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: Ja(u == null ? void 0 : u.lastReviewed) })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "下次到期" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: Ja(u == null ? void 0 : u.due) })
              ] })
            ] })
          }
        ),
        /* @__PURE__ */ o.jsx(
          "div",
          {
            className: "srs-choice-question",
            style: {
              marginBottom: "16px",
              padding: "16px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "8px",
              minHeight: "60px",
              fontSize: "16px",
              lineHeight: "1.8"
            },
            children: /* @__PURE__ */ o.jsx(va, { blockId: e, panelId: y || "choice-review" })
          }
        ),
        /* @__PURE__ */ o.jsx(
          "div",
          {
            className: "srs-choice-options",
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginBottom: "16px"
            },
            children: t.map((m, _) => /* @__PURE__ */ o.jsx(
              zu,
              {
                blockId: m.blockId,
                index: _,
                isSelected: h.has(m.blockId),
                isCorrect: m.isCorrect,
                isAnswerRevealed: $,
                mode: r,
                onClick: () => R(m.blockId),
                disabled: $
              },
              m.blockId
            ))
          }
        ),
        r === "multiple" && !$ && /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "center", gap: "12px", marginBottom: "12px" }, children: [
          d && /* @__PURE__ */ o.jsx(
            "button",
            {
              onClick: d,
              title: "跳过当前卡片，不评分",
              style: {
                padding: "12px 24px",
                fontSize: "16px",
                backgroundColor: "transparent",
                color: "var(--orca-color-text-2)",
                border: "1px solid var(--orca-color-border-2)",
                borderRadius: "8px",
                cursor: "pointer",
                transition: "all 0.2s"
              },
              children: "跳过"
            }
          ),
          /* @__PURE__ */ o.jsx(
            "button",
            {
              onClick: A,
              style: {
                padding: "12px 32px",
                fontSize: "16px",
                opacity: h.size === 0 ? 0.5 : 1,
                backgroundColor: "var(--orca-color-primary-5)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                cursor: h.size === 0 ? "not-allowed" : "pointer",
                transition: "all 0.2s"
              },
              children: "提交答案"
            }
          )
        ] }),
        r !== "multiple" && !$ && d && /* @__PURE__ */ o.jsx("div", { style: { display: "flex", justifyContent: "center", marginBottom: "12px" }, children: /* @__PURE__ */ o.jsx(
          "button",
          {
            onClick: d,
            title: "跳过当前卡片，不评分",
            style: {
              padding: "12px 24px",
              fontSize: "16px",
              backgroundColor: "transparent",
              color: "var(--orca-color-text-2)",
              border: "1px solid var(--orca-color-border-2)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.2s"
            },
            children: "跳过"
          }
        ) }),
        $ && /* @__PURE__ */ o.jsxs(
          "div",
          {
            className: "srs-card-grade-buttons",
            style: {
              display: "grid",
              gridTemplateColumns: d ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
              gap: "8px",
              marginTop: "16px"
            },
            children: [
              d && /* @__PURE__ */ o.jsxs(
                "button",
                {
                  onClick: d,
                  style: {
                    padding: "16px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "rgba(156, 163, 175, 0.12)",
                    border: "1px solid rgba(156, 163, 175, 0.2)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  },
                  onMouseEnter: (m) => {
                    m.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.18)", m.currentTarget.style.transform = "translateY(-2px)";
                  },
                  onMouseLeave: (m) => {
                    m.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.12)", m.currentTarget.style.transform = "translateY(0)";
                  },
                  children: [
                    /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: "不评分" }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "⏭️" }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "跳过" })
                  ]
                }
              ),
              /* @__PURE__ */ o.jsxs(
                "button",
                {
                  onClick: () => T("again"),
                  style: {
                    padding: "16px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: E === "again" ? "rgba(239, 68, 68, 0.25)" : "rgba(239, 68, 68, 0.12)",
                    border: E === "again" ? "2px solid rgba(239, 68, 68, 0.5)" : "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  },
                  onMouseEnter: (m) => {
                    m.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.18)", m.currentTarget.style.transform = "translateY(-2px)";
                  },
                  onMouseLeave: (m) => {
                    m.currentTarget.style.backgroundColor = E === "again" ? "rgba(239, 68, 68, 0.25)" : "rgba(239, 68, 68, 0.12)", m.currentTarget.style.transform = "translateY(0)";
                  },
                  children: [
                    /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(w.again) }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😞" }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "忘记" })
                  ]
                }
              ),
              /* @__PURE__ */ o.jsxs(
                "button",
                {
                  onClick: () => T("hard"),
                  style: {
                    padding: "16px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: E === "hard" ? "rgba(251, 191, 36, 0.25)" : "rgba(251, 191, 36, 0.12)",
                    border: E === "hard" ? "2px solid rgba(251, 191, 36, 0.5)" : "1px solid rgba(251, 191, 36, 0.2)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  },
                  onMouseEnter: (m) => {
                    m.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.18)", m.currentTarget.style.transform = "translateY(-2px)";
                  },
                  onMouseLeave: (m) => {
                    m.currentTarget.style.backgroundColor = E === "hard" ? "rgba(251, 191, 36, 0.25)" : "rgba(251, 191, 36, 0.12)", m.currentTarget.style.transform = "translateY(0)";
                  },
                  children: [
                    /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(w.hard) }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😐" }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "困难" })
                  ]
                }
              ),
              /* @__PURE__ */ o.jsxs(
                "button",
                {
                  onClick: () => T("good"),
                  style: {
                    padding: "16px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: E === "good" ? "rgba(34, 197, 94, 0.25)" : "rgba(34, 197, 94, 0.12)",
                    border: E === "good" ? "2px solid rgba(34, 197, 94, 0.5)" : "1px solid rgba(34, 197, 94, 0.2)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  },
                  onMouseEnter: (m) => {
                    m.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.18)", m.currentTarget.style.transform = "translateY(-2px)";
                  },
                  onMouseLeave: (m) => {
                    m.currentTarget.style.backgroundColor = E === "good" ? "rgba(34, 197, 94, 0.25)" : "rgba(34, 197, 94, 0.12)", m.currentTarget.style.transform = "translateY(0)";
                  },
                  children: [
                    /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(w.good) }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😊" }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "良好" })
                  ]
                }
              ),
              /* @__PURE__ */ o.jsxs(
                "button",
                {
                  onClick: () => T("easy"),
                  style: {
                    padding: "16px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "rgba(59, 130, 246, 0.12)",
                    border: "1px solid rgba(59, 130, 246, 0.2)",
                    borderRadius: "8px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  },
                  onMouseEnter: (m) => {
                    m.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.18)", m.currentTarget.style.transform = "translateY(-2px)";
                  },
                  onMouseLeave: (m) => {
                    m.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.12)", m.currentTarget.style.transform = "translateY(0)";
                  },
                  children: [
                    /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(w.easy) }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😄" }),
                    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "简单" })
                  ]
                }
              )
            ]
          }
        ),
        $ && E && /* @__PURE__ */ o.jsxs("div", { style: {
          marginTop: "12px",
          textAlign: "center",
          fontSize: "12px",
          color: "var(--orca-color-text-3)"
        }, children: [
          E === "good" && "✓ 全部正确！建议评分：良好",
          E === "hard" && "△ 部分正确，建议评分：困难",
          E === "again" && "✗ 答案错误，建议评分：忘记"
        ] })
      ]
    }
  );
}
const { useEffect: Hu, useMemo: $r, useRef: Nu, useState: Qa } = window.React, { useSnapshot: Yu } = window.Valtio, { Button: Lt } = orca.components;
function qu(e) {
  if (e == null) return "新卡";
  switch (e) {
    case U.New:
      return "新卡";
    case U.Learning:
      return "学习中";
    case U.Review:
      return "复习中";
    case U.Relearning:
      return "重学中";
    default:
      return "未知";
  }
}
function Xa(e) {
  if (!e) return "从未";
  const t = new Date(e), r = t.getFullYear(), n = String(t.getMonth() + 1).padStart(2, "0"), a = String(t.getDate()).padStart(2, "0"), s = String(t.getHours()).padStart(2, "0"), i = String(t.getMinutes()).padStart(2, "0");
  return `${r}-${n}-${a} ${s}:${i}`;
}
function Ku({
  blockId: e,
  listItemId: t,
  listItemIndex: r,
  listItemIds: n,
  isAuxiliaryPreview: a = !1,
  onGrade: s,
  onPostpone: i,
  onSuspend: c,
  onClose: d,
  onSkip: l,
  onPrevious: x,
  canGoPrevious: u = !1,
  srsInfo: f,
  isGrading: p = !1,
  onJumpToCard: g,
  inSidePanel: y = !1,
  panelId: v
}) {
  const [h, S] = Qa(!1), [$, k] = Qa(!1), C = Nu(""), P = `${e}-${t}`;
  Hu(() => {
    C.current !== P && (S(!1), k(!1), C.current = P);
  }, [P]);
  const E = Yu(orca.state), O = $r(() => ((E == null ? void 0 : E.blocks) ?? {})[e], [E == null ? void 0 : E.blocks, e]), j = $r(() => {
    const R = (E == null ? void 0 : E.blocks) ?? {};
    return n.map((A) => {
      const T = R[A], w = ((T == null ? void 0 : T.text) ?? "").trim();
      return w ? Do(w) : "（加载中...）";
    });
  }, [E == null ? void 0 : E.blocks, n]), B = $r(() => {
    const R = ((O == null ? void 0 : O.text) ?? "").trim();
    return R ? Do(R) : "列表卡";
  }, [O == null ? void 0 : O.text]), z = async (R) => {
    p || (await s(R), S(!1));
  };
  eo({
    showAnswer: h,
    isGrading: p,
    onShowAnswer: () => S(!0),
    onGrade: z,
    onBury: i,
    onSuspend: c
  }), $r(() => {
    const R = f ? {
      stability: f.stability ?? 0,
      difficulty: f.difficulty ?? 0,
      interval: f.interval ?? 0,
      due: f.due ?? /* @__PURE__ */ new Date(),
      lastReviewed: f.lastReviewed ?? null,
      reps: f.reps ?? 0,
      lapses: f.lapses ?? 0,
      state: f.state
    } : null;
    return Ko(R);
  }, [f]);
  const M = $r(() => {
    const R = f ? {
      stability: f.stability ?? 0,
      difficulty: f.difficulty ?? 0,
      interval: f.interval ?? 0,
      due: f.due ?? /* @__PURE__ */ new Date(),
      lastReviewed: f.lastReviewed ?? null,
      reps: f.reps ?? 0,
      lapses: f.lapses ?? 0,
      state: f.state
    } : null;
    return Kr(R);
  }, [f]);
  return O ? /* @__PURE__ */ o.jsxs("div", { style: { padding: y ? "12px" : "16px" }, children: [
    a && /* @__PURE__ */ o.jsx(
      "div",
      {
        contentEditable: !1,
        style: {
          marginBottom: "10px",
          padding: "8px 12px",
          borderRadius: "10px",
          backgroundColor: "var(--orca-color-warning-1)",
          color: "var(--orca-color-warning-6)",
          fontSize: "13px",
          fontWeight: 600
        },
        children: "辅助预览：允许评分，但不计入统计，也不会更新记忆状态"
      }
    ),
    /* @__PURE__ */ o.jsxs("div", { style: {
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "16px",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
    }, children: [
      /* @__PURE__ */ o.jsxs(
        "div",
        {
          contentEditable: !1,
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "8px",
            opacity: 0.6,
            transition: "opacity 0.2s"
          },
          onMouseEnter: (R) => R.currentTarget.style.opacity = "1",
          onMouseLeave: (R) => R.currentTarget.style.opacity = "0.6",
          children: [
            /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "4px" }, children: [
              x && /* @__PURE__ */ o.jsx(
                Lt,
                {
                  variant: "plain",
                  onClick: u ? x : void 0,
                  title: "回到上一张",
                  style: {
                    padding: "4px 6px",
                    fontSize: "14px",
                    opacity: u ? 1 : 0.3,
                    cursor: u ? "pointer" : "not-allowed"
                  },
                  children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-arrow-left" })
                }
              ),
              /* @__PURE__ */ o.jsxs(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    fontWeight: "500",
                    color: "var(--orca-color-success-5)",
                    backgroundColor: "var(--orca-color-success-1)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px"
                  },
                  children: [
                    /* @__PURE__ */ o.jsx("i", { className: "ti ti-list-numbers", style: { fontSize: "11px" } }),
                    "列表卡"
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "2px" }, children: [
              i && /* @__PURE__ */ o.jsx(
                Lt,
                {
                  variant: "plain",
                  onClick: i,
                  title: "推迟到明天 (B)",
                  style: { padding: "4px 6px", fontSize: "14px" },
                  children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-calendar-pause" })
                }
              ),
              c && /* @__PURE__ */ o.jsx(
                Lt,
                {
                  variant: "plain",
                  onClick: c,
                  title: "暂停卡片 (S)",
                  style: { padding: "4px 6px", fontSize: "14px" },
                  children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-player-pause" })
                }
              ),
              g && /* @__PURE__ */ o.jsx(
                Lt,
                {
                  variant: "plain",
                  onClick: (R) => g(e, R.shiftKey),
                  title: "跳转到卡片 (Shift+点击在侧面板打开)",
                  style: { padding: "4px 6px", fontSize: "14px" },
                  children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-external-link" })
                }
              ),
              /* @__PURE__ */ o.jsx(
                Lt,
                {
                  variant: "plain",
                  onClick: () => k(!$),
                  title: "卡片信息",
                  style: {
                    padding: "4px 6px",
                    fontSize: "14px",
                    color: $ ? "var(--orca-color-primary-5)" : void 0
                  },
                  children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-info-circle" })
                }
              )
            ] })
          ]
        }
      ),
      $ && /* @__PURE__ */ o.jsx(
        "div",
        {
          contentEditable: !1,
          style: {
            marginBottom: "12px",
            padding: "12px 16px",
            backgroundColor: "var(--orca-color-bg-2)",
            borderRadius: "8px",
            fontSize: "13px",
            color: "var(--orca-color-text-2)"
          },
          children: /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [
            /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ o.jsx("span", { children: "遗忘次数" }),
              /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: (f == null ? void 0 : f.lapses) ?? 0 })
            ] }),
            /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ o.jsx("span", { children: "复习次数" }),
              /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: (f == null ? void 0 : f.reps) ?? 0 })
            ] }),
            /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ o.jsx("span", { children: "卡片状态" }),
              /* @__PURE__ */ o.jsx("span", { style: {
                color: (f == null ? void 0 : f.state) === U.Review ? "var(--orca-color-success)" : (f == null ? void 0 : f.state) === U.Learning || (f == null ? void 0 : f.state) === U.Relearning ? "var(--orca-color-warning)" : "var(--orca-color-primary)"
              }, children: qu(f == null ? void 0 : f.state) })
            ] }),
            /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ o.jsx("span", { children: "最后复习" }),
              /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: Xa(f == null ? void 0 : f.lastReviewed) })
            ] }),
            /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ o.jsx("span", { children: "下次到期" }),
              /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: Xa(f == null ? void 0 : f.due) })
            ] }),
            /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ o.jsx("span", { children: "间隔天数" }),
              /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-text-1)" }, children: [
                (f == null ? void 0 : f.interval) ?? 0,
                " 天"
              ] })
            ] }),
            /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ o.jsx("span", { children: "稳定性" }),
              /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: ((f == null ? void 0 : f.stability) ?? 0).toFixed(2) })
            ] }),
            /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
              /* @__PURE__ */ o.jsx("span", { children: "难度" }),
              /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: ((f == null ? void 0 : f.difficulty) ?? 0).toFixed(2) })
            ] })
          ] })
        }
      ),
      /* @__PURE__ */ o.jsxs("div", { style: {
        marginBottom: "16px",
        padding: "16px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px"
      }, children: [
        /* @__PURE__ */ o.jsx("div", { style: { fontSize: "16px", fontWeight: 600, color: "var(--orca-color-text-1)", marginBottom: "8px" }, children: B }),
        /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "13px", color: "var(--orca-color-text-3)" }, children: [
          "条目 ",
          r,
          " / ",
          n.length
        ] })
      ] }),
      /* @__PURE__ */ o.jsx("ol", { style: {
        margin: 0,
        marginBottom: "16px",
        paddingLeft: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }, children: j.map((R, A) => {
        const T = A + 1 === r, w = T && !h ? "[...]" : R, N = T && h;
        return /* @__PURE__ */ o.jsx(
          "li",
          {
            style: {
              color: N ? "var(--orca-color-primary-6)" : "var(--orca-color-text-1)",
              fontWeight: N ? 700 : 500,
              backgroundColor: N ? "var(--orca-color-primary-1)" : "transparent",
              borderRadius: "8px",
              padding: N ? "8px 12px" : "4px 0",
              fontSize: "15px",
              lineHeight: "1.6"
            },
            children: w
          },
          n[A]
        );
      }) }),
      h ? /* @__PURE__ */ o.jsxs("div", { className: "srs-card-grade-buttons", style: {
        display: "grid",
        gridTemplateColumns: l ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
        gap: "8px",
        marginTop: "16px"
      }, children: [
        l && /* @__PURE__ */ o.jsxs(
          "button",
          {
            onClick: l,
            style: {
              padding: "16px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(156, 163, 175, 0.12)",
              border: "1px solid rgba(156, 163, 175, 0.2)",
              borderRadius: "8px",
              cursor: "pointer",
              transition: "all 0.2s"
            },
            onMouseEnter: (R) => {
              R.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.18)", R.currentTarget.style.transform = "translateY(-2px)";
            },
            onMouseLeave: (R) => {
              R.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.12)", R.currentTarget.style.transform = "translateY(0)";
            },
            children: [
              /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: "不评分" }),
              /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "⏭️" }),
              /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "跳过" })
            ]
          }
        ),
        /* @__PURE__ */ o.jsxs(
          "button",
          {
            onClick: () => z("again"),
            style: {
              padding: "16px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "8px",
              cursor: p ? "not-allowed" : "pointer",
              opacity: p ? 0.6 : 1,
              transition: "all 0.2s"
            },
            onMouseEnter: (R) => {
              p || (R.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.18)", R.currentTarget.style.transform = "translateY(-2px)");
            },
            onMouseLeave: (R) => {
              R.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.12)", R.currentTarget.style.transform = "translateY(0)";
            },
            children: [
              /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(M.again) }),
              /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😞" }),
              /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "忘记" })
            ]
          }
        ),
        /* @__PURE__ */ o.jsxs(
          "button",
          {
            onClick: () => z("hard"),
            style: {
              padding: "16px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(251, 191, 36, 0.12)",
              border: "1px solid rgba(251, 191, 36, 0.2)",
              borderRadius: "8px",
              cursor: p ? "not-allowed" : "pointer",
              opacity: p ? 0.6 : 1,
              transition: "all 0.2s"
            },
            onMouseEnter: (R) => {
              p || (R.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.18)", R.currentTarget.style.transform = "translateY(-2px)");
            },
            onMouseLeave: (R) => {
              R.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.12)", R.currentTarget.style.transform = "translateY(0)";
            },
            children: [
              /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(M.hard) }),
              /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😐" }),
              /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "困难" })
            ]
          }
        ),
        /* @__PURE__ */ o.jsxs(
          "button",
          {
            onClick: () => z("good"),
            style: {
              padding: "16px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(34, 197, 94, 0.12)",
              border: "1px solid rgba(34, 197, 94, 0.2)",
              borderRadius: "8px",
              cursor: p ? "not-allowed" : "pointer",
              opacity: p ? 0.6 : 1,
              transition: "all 0.2s"
            },
            onMouseEnter: (R) => {
              p || (R.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.18)", R.currentTarget.style.transform = "translateY(-2px)");
            },
            onMouseLeave: (R) => {
              R.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.12)", R.currentTarget.style.transform = "translateY(0)";
            },
            children: [
              /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(M.good) }),
              /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😊" }),
              /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "良好" })
            ]
          }
        ),
        /* @__PURE__ */ o.jsxs(
          "button",
          {
            onClick: () => z("easy"),
            style: {
              padding: "16px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "6px",
              backgroundColor: "rgba(59, 130, 246, 0.12)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
              borderRadius: "8px",
              cursor: p ? "not-allowed" : "pointer",
              opacity: p ? 0.6 : 1,
              transition: "all 0.2s"
            },
            onMouseEnter: (R) => {
              p || (R.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.18)", R.currentTarget.style.transform = "translateY(-2px)");
            },
            onMouseLeave: (R) => {
              R.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.12)", R.currentTarget.style.transform = "translateY(0)";
            },
            children: [
              /* @__PURE__ */ o.jsx("div", { style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" }, children: Se(M.easy) }),
              /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😄" }),
              /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" }, children: "简单" })
            ]
          }
        )
      ] }) : /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "center", gap: "12px", marginBottom: "12px" }, children: [
        l && /* @__PURE__ */ o.jsx(
          Lt,
          {
            variant: "outline",
            onClick: l,
            title: "跳过当前卡片，不评分",
            style: {
              padding: "12px 24px",
              fontSize: "16px"
            },
            children: "跳过"
          }
        ),
        /* @__PURE__ */ o.jsx(
          Lt,
          {
            variant: "solid",
            onClick: p ? void 0 : () => S(!0),
            style: {
              padding: "12px 32px",
              fontSize: "16px",
              opacity: p ? 0.6 : 1,
              cursor: p ? "not-allowed" : "pointer"
            },
            children: "显示答案"
          }
        )
      ] })
    ] })
  ] }) : /* @__PURE__ */ o.jsx("div", { style: {
    backgroundColor: "var(--orca-color-bg-1)",
    borderRadius: "12px",
    padding: "32px",
    textAlign: "center",
    color: "var(--orca-color-text-2)"
  }, children: /* @__PURE__ */ o.jsx("div", { style: { fontSize: "14px", opacity: 0.75 }, children: "列表卡加载中..." }) });
}
const Uu = [
  "以上",
  "皆非",
  "都是",
  "都不是",
  "all of the above",
  "none of the above",
  "all above",
  "none above"
];
function Vu(e) {
  if (!e) return !1;
  const t = e.toLowerCase();
  return Uu.some((r) => t.includes(r.toLowerCase()));
}
function $i(e) {
  var r;
  if (!e || !e.children || e.children.length === 0)
    return [];
  const t = [];
  for (const n of e.children) {
    const a = orca.state.blocks[n];
    if (!a) continue;
    const s = a.text || "", i = a.content || [], c = ((r = a.refs) == null ? void 0 : r.some(
      (l) => l.type === 2 && vc(l.alias)
    )) ?? !1, d = Vu(s);
    t.push({
      blockId: n,
      text: s,
      content: i,
      isCorrect: c,
      isAnchor: d
    });
  }
  return t;
}
function Di(e) {
  const t = e.filter((r) => r.isCorrect).length;
  return t === 0 ? "undefined" : t === 1 ? "single" : "multiple";
}
function Gu(e) {
  const t = [...e];
  for (let r = t.length - 1; r > 0; r--) {
    const n = Math.floor(Math.random() * (r + 1));
    [t[r], t[n]] = [t[n], t[r]];
  }
  return t;
}
function Ju(e, t) {
  if (t)
    return {
      options: [...e],
      shuffledOrder: e.map((i, c) => c)
    };
  const r = [], n = [];
  e.forEach((i, c) => {
    i.isAnchor ? n.push({ option: i, originalIndex: c }) : r.push({ option: i, originalIndex: c });
  });
  const s = [...Gu(r), ...n];
  return {
    options: s.map((i) => i.option),
    shuffledOrder: s.map((i) => i.originalIndex)
  };
}
const { useState: go, useEffect: ir, useRef: Po, useMemo: vn } = window.React, { useSnapshot: Qu } = window.Valtio, { Block: Lo, Button: Ot, ModalOverlay: Xu, BlockBreadcrumb: Zu } = orca.components;
function ef(e) {
  if (e == null) return "新卡";
  switch (e) {
    case U.New:
      return "新卡";
    case U.Learning:
      return "学习中";
    case U.Review:
      return "复习中";
    case U.Relearning:
      return "重学中";
    default:
      return "未知";
  }
}
function Za(e) {
  if (!e) return "从未";
  const t = new Date(e), r = t.getFullYear(), n = String(t.getMonth() + 1).padStart(2, "0"), a = String(t.getDate()).padStart(2, "0"), s = String(t.getHours()).padStart(2, "0"), i = String(t.getMinutes()).padStart(2, "0");
  return `${r}-${n}-${a} ${s}:${i}`;
}
function tf({ blockId: e, panelId: t, fallback: r }) {
  const n = Po(null);
  return ir(() => {
    const a = n.current;
    if (!a || !e) return;
    const s = () => {
      a.querySelectorAll(`
        .orca-block-children,
        .orca-repr-children,
        [data-role='children'],
        [data-testid='children']
      `).forEach((f) => {
        f.remove();
      });
    }, i = () => {
      a.querySelectorAll(".orca-repr-main-none-editable").forEach((p) => {
        const g = p;
        g.style.display = "", g.style.visibility = "", g.style.opacity = "";
      }), a.querySelectorAll(".orca-block-handle").forEach((p) => {
        const g = p;
        g.style.display = "", g.style.visibility = "", g.style.opacity = "";
      }), a.querySelectorAll(".orca-block-folding-handle").forEach((p) => {
        const g = p;
        g.style.display = "", g.style.visibility = "", g.style.opacity = "";
      });
    };
    s(), i();
    const c = new MutationObserver((x) => {
      let u = !1, f = !1;
      for (const p of x) {
        if (p.type === "childList" && p.addedNodes.length > 0) {
          for (const g of p.addedNodes)
            if (g instanceof HTMLElement && ((g.classList.contains("orca-block-children") || g.classList.contains("orca-repr-children") || g.getAttribute("data-role") === "children" || g.querySelector(
              '.orca-block-children, .orca-repr-children, [data-role="children"]'
            )) && (u = !0), (g.classList.contains("orca-repr-main-none-editable") || g.classList.contains("orca-block-handle") || g.classList.contains("orca-block-folding-handle") || g.querySelector(
              ".orca-repr-main-none-editable, .orca-block-handle, .orca-block-folding-handle"
            )) && (f = !0), u && f))
              break;
        }
        if (u && f) break;
      }
      u && s(), f && i();
    });
    c.observe(a, {
      childList: !0,
      subtree: !0,
      attributes: !1,
      characterData: !1
    });
    const d = requestAnimationFrame(i), l = setTimeout(i, 100);
    return () => {
      c.disconnect(), cancelAnimationFrame(d), clearTimeout(l);
    };
  }, [e]), !e || !t ? /* @__PURE__ */ o.jsx(
    "div",
    {
      style: {
        padding: "12px",
        fontSize: "16px",
        color: "var(--orca-color-text-1)",
        lineHeight: "1.6",
        whiteSpace: "pre-wrap"
      },
      children: r
    }
  ) : /* @__PURE__ */ o.jsx(o.Fragment, { children: /* @__PURE__ */ o.jsx(
    "div",
    {
      ref: n,
      className: "srs-question-block",
      "data-orca-block-root": "true",
      children: /* @__PURE__ */ o.jsx(
        Lo,
        {
          panelId: t,
          blockId: e,
          blockLevel: 0,
          indentLevel: 0
        }
      )
    }
  ) });
}
function rf({ blockId: e, panelId: t, fallback: r }) {
  const n = Po(null), a = Po(null);
  return ir(() => {
    const s = n.current;
    if (!s || !e) return;
    const i = (u) => {
      const f = u.getAttribute("aria-expanded");
      if (f === "false") return !0;
      if (f === "true") return !1;
      const p = u.getAttribute("data-state");
      if (p === "closed") return !0;
      if (p === "open") return !1;
      const g = u.getAttribute("data-collapsed");
      return g === "true" ? !0 : g === "false" ? !1 : u.classList.contains("collapsed") || u.classList.contains("is-collapsed") ? !0 : null;
    }, c = () => {
      const u = s.querySelector(
        ":scope > .orca-block"
      );
      if (u) {
        const p = ":scope > .orca-block-children, :scope > .orca-repr-children, :scope [data-role='children'], :scope [data-testid='children']", g = ":scope > .orca-repr > .orca-repr-collapse, :scope > .orca-repr [data-role='collapse'], :scope > .orca-repr [data-testid='collapse']", y = u.querySelector(p);
        if (y)
          y.style.display = "", y.style.visibility = "", y.hidden = !1;
        else {
          const v = u.querySelector(
            g
          );
          v && i(v) !== !1 && v.click();
        }
      }
      s.querySelectorAll(
        ".orca-block-children, .orca-repr-children, [data-role='children'], [data-testid='children']"
      ).forEach((p) => {
        p.style.display = "", p.style.visibility = "", p.hidden = !1;
      });
    }, d = () => {
      c();
      const u = s.querySelector(
        ":scope > .orca-block > .orca-repr > .orca-repr-main"
      );
      u && (u.style.display = "none"), s.querySelectorAll(`
        :scope > .orca-block > .orca-block-handle,
        :scope > .orca-block > .orca-block-bullet,
        :scope > .orca-block > .orca-repr > .orca-repr-handle,
        :scope > .orca-block > .orca-repr > .orca-repr-collapse
      `).forEach((g) => {
        g.style.display = "none", g.style.width = "0", g.style.height = "0", g.style.overflow = "hidden";
      });
    }, l = (u = 100) => {
      a.current !== null && clearTimeout(a.current), a.current = setTimeout(() => {
        d(), a.current = null;
      }, u);
    };
    d();
    const x = new MutationObserver(() => {
      l(100);
    });
    return x.observe(s, {
      childList: !0,
      subtree: !0,
      attributes: !1,
      characterData: !1
    }), () => {
      x.disconnect(), a.current !== null && (clearTimeout(a.current), a.current = null);
    };
  }, [e]), !e || !t ? /* @__PURE__ */ o.jsx(
    "div",
    {
      style: {
        padding: "12px",
        fontSize: "20px",
        fontWeight: "500",
        color: "var(--orca-color-text-1)",
        lineHeight: "1.6",
        whiteSpace: "pre-wrap"
      },
      children: r
    }
  ) : /* @__PURE__ */ o.jsx(
    "div",
    {
      ref: n,
      className: "srs-answer-block",
      style: {
        // 往前缩进一个层级以对齐
        marginLeft: "-25.6px"
      },
      "data-orca-block-root": "true",
      children: /* @__PURE__ */ o.jsx(
        Lo,
        {
          panelId: t,
          blockId: e,
          blockLevel: 0,
          indentLevel: 0,
          initiallyCollapsed: !1
        }
      )
    }
  );
}
function es({
  front: e,
  back: t,
  onGrade: r,
  onPostpone: n,
  onSuspend: a,
  onClose: s,
  onSkip: i,
  onPrevious: c,
  canGoPrevious: d = !1,
  srsInfo: l,
  isGrading: x = !1,
  blockId: u,
  nextBlockId: f,
  onJumpToCard: p,
  inSidePanel: g = !1,
  panelId: y,
  pluginName: v = "orca-srs",
  clozeNumber: h,
  directionType: S,
  listItemId: $,
  listItemIndex: k,
  listItemIds: C,
  isAuxiliaryPreview: P = !1
}) {
  var ie;
  const [E, O] = go(!1), [j, B] = go(!1), z = Po(""), M = `${u}-${h ?? 0}-${S ?? "basic"}-${$ ?? 0}`;
  ir(() => {
    z.current !== M && (O(!1), B(!1), z.current = M);
  }, [M]);
  const R = Qu(orca.state), [A, T] = go(!1), [w, N] = go(!1), { questionBlock: F, answerBlockIds: D, totalChildCount: m, inferredCardType: _ } = vn(() => {
    const I = (R == null ? void 0 : R.blocks) ?? {}, ge = u ? I[u] : null, fe = (ge == null ? void 0 : ge.children) ?? [], Te = ge ? je(ge) : "basic";
    return {
      questionBlock: ge,
      answerBlockIds: fe,
      // 返回所有子块 ID
      totalChildCount: fe.length,
      inferredCardType: Te
    };
  }, [R == null ? void 0 : R.blocks, u]);
  ir(() => {
    u && !F && !A && !w && (T(!0), orca.invokeBackend("get-block", u).then((I) => {
      I || console.log(`[SRS Card Demo] 卡片 #${u} 确实已被删除`), N(!0), T(!1);
    }).catch((I) => {
      console.warn(`[SRS Card Demo] 加载卡片 #${u} 失败:`, I), N(!0), T(!1);
    }));
  }, [u, F, A, w]), ir(() => {
    N(!1);
  }, [M]);
  const G = _ === "cloze" || _ === "bg" ? "srs.cloze-card" : _ === "direction" ? "srs.direction-card" : _ === "list" ? "srs.list-card" : _ === "excerpt" ? "srs.excerpt-card" : "srs.card", X = G === "srs.excerpt-card" || G === "srs.card" && F && m === 0, pe = G === "srs.card" && _ !== "choice" || G === "srs.cloze-card" && !u || G === "srs.direction-card" && (!u || !S) || G === "srs.list-card" && (!u || !$), J = async (I) => {
    x || (console.log(`[SRS Card Demo] 用户选择评分: ${I}`), await r(I), O(!1));
  };
  eo({
    showAnswer: E,
    isGrading: x,
    onShowAnswer: () => O(!0),
    onGrade: J,
    onBury: n,
    onSuspend: a,
    enabled: pe
    // 仅在渲染 basic 卡片时启用
  });
  const ae = vn(() => {
    const I = l ? {
      stability: l.stability ?? 0,
      difficulty: l.difficulty ?? 0,
      interval: l.interval ?? 0,
      due: l.due ?? /* @__PURE__ */ new Date(),
      lastReviewed: l.lastReviewed ?? null,
      reps: l.reps ?? 0,
      lapses: l.lapses ?? 0,
      state: l.state
    } : null;
    return Ko(I);
  }, [l]), W = vn(() => {
    const I = l ? {
      stability: l.stability ?? 0,
      difficulty: l.difficulty ?? 0,
      interval: l.interval ?? 0,
      due: l.due ?? /* @__PURE__ */ new Date(),
      lastReviewed: l.lastReviewed ?? null,
      reps: l.reps ?? 0,
      lapses: l.lapses ?? 0,
      state: l.state
    } : null;
    return Kr(I);
  }, [l]);
  if (ir(() => {
    u && !F && w && !A && i && (console.log(`[SRS Card Demo] 卡片 #${u} 已被删除，自动跳过`), i());
  }, [u, F, w, A, i]), u && !F)
    return /* @__PURE__ */ o.jsx("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "200px",
      color: "var(--orca-color-text-2)"
    }, children: "加载中..." });
  if (G === "srs.cloze-card" && u)
    return /* @__PURE__ */ o.jsx(Xe, { componentName: "填空卡片", errorTitle: "填空卡片加载出错", children: /* @__PURE__ */ o.jsx(
      Su,
      {
        blockId: u,
        onGrade: r,
        onPostpone: n,
        onSuspend: a,
        onClose: s,
        onSkip: i,
        onPrevious: c,
        canGoPrevious: d,
        srsInfo: l,
        isGrading: x,
        onJumpToCard: p,
        inSidePanel: g,
        panelId: y,
        pluginName: v,
        clozeNumber: h,
        cardType: _
      }
    ) });
  if (G === "srs.direction-card" && u && S)
    return /* @__PURE__ */ o.jsx(Xe, { componentName: "方向卡片", errorTitle: "方向卡片加载出错", children: /* @__PURE__ */ o.jsx(
      $u,
      {
        blockId: u,
        onGrade: r,
        onPostpone: n,
        onSuspend: a,
        onClose: s,
        onSkip: i,
        onPrevious: c,
        canGoPrevious: d,
        srsInfo: l,
        isGrading: x,
        onJumpToCard: p,
        inSidePanel: g,
        panelId: y,
        pluginName: v,
        reviewDirection: S
      }
    ) });
  if (G === "srs.list-card" && u && $ && k && C)
    return /* @__PURE__ */ o.jsx(Xe, { componentName: "列表卡片", errorTitle: "列表卡片加载出错", children: /* @__PURE__ */ o.jsx(
      Ku,
      {
        blockId: u,
        listItemId: $,
        listItemIndex: k,
        listItemIds: C,
        isAuxiliaryPreview: P,
        onGrade: r,
        onPostpone: n,
        onSuspend: a,
        onClose: s,
        onSkip: i,
        onPrevious: c,
        canGoPrevious: d,
        srsInfo: l,
        isGrading: x,
        onJumpToCard: p,
        inSidePanel: g,
        panelId: y
      }
    ) });
  if (_ === "choice" && u && F) {
    const I = $i(F), ge = ((ie = F.refs) == null ? void 0 : ie.some(
      ($e) => $e.type === 2 && bc($e.alias)
    )) ?? !1, { options: fe } = Ju(
      I,
      ge
    ), Te = Di(I);
    return /* @__PURE__ */ o.jsx(
      Xe,
      {
        componentName: "选择题卡片",
        errorTitle: "选择题卡片加载出错",
        children: /* @__PURE__ */ o.jsx(
          Wu,
          {
            blockId: u,
            options: fe,
            mode: Te,
            onGrade: r,
            onPostpone: n,
            onSuspend: a,
            onClose: s,
            onSkip: i,
            onPrevious: c,
            canGoPrevious: d,
            srsInfo: l,
            isGrading: x,
            onJumpToCard: p,
            inSidePanel: g,
            panelId: y
          }
        )
      }
    );
  }
  const q = /* @__PURE__ */ o.jsxs(
    "div",
    {
      className: "srs-card-container",
      style: {
        borderRadius: "12px",
        padding: "16px",
        width: g ? "100%" : "90%",
        minWidth: g ? "0" : "600px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
      },
      children: [
        u && /* @__PURE__ */ o.jsxs(
          "div",
          {
            contentEditable: !1,
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "8px",
              opacity: 0.6,
              transition: "opacity 0.2s"
            },
            onMouseEnter: (I) => I.currentTarget.style.opacity = "1",
            onMouseLeave: (I) => I.currentTarget.style.opacity = "0.6",
            children: [
              /* @__PURE__ */ o.jsx("div", { style: { display: "flex", gap: "4px" }, children: c && /* @__PURE__ */ o.jsx(
                Ot,
                {
                  variant: "plain",
                  onClick: d ? c : void 0,
                  title: "回到上一张",
                  style: {
                    padding: "4px 6px",
                    fontSize: "14px",
                    opacity: d ? 1 : 0.3,
                    cursor: d ? "pointer" : "not-allowed"
                  },
                  children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-arrow-left" })
                }
              ) }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "2px" }, children: [
                n && /* @__PURE__ */ o.jsx(
                  Ot,
                  {
                    variant: "plain",
                    onClick: n,
                    title: "推迟到明天 (B)",
                    style: { padding: "4px 6px", fontSize: "14px" },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-calendar-pause" })
                  }
                ),
                a && /* @__PURE__ */ o.jsx(
                  Ot,
                  {
                    variant: "plain",
                    onClick: a,
                    title: "暂停卡片 (S)",
                    style: { padding: "4px 6px", fontSize: "14px" },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-player-pause" })
                  }
                ),
                p && /* @__PURE__ */ o.jsx(
                  Ot,
                  {
                    variant: "plain",
                    onClick: (I) => p(u, I.shiftKey),
                    title: "跳转到卡片 (Shift+点击在侧面板打开)",
                    style: { padding: "4px 6px", fontSize: "14px" },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-external-link" })
                  }
                ),
                /* @__PURE__ */ o.jsx(
                  Ot,
                  {
                    variant: "plain",
                    onClick: () => B(!j),
                    title: "卡片信息",
                    style: {
                      padding: "4px 6px",
                      fontSize: "14px",
                      color: j ? "var(--orca-color-primary-5)" : void 0
                    },
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-info-circle" })
                  }
                )
              ] })
            ]
          }
        ),
        u && j && /* @__PURE__ */ o.jsx(
          "div",
          {
            contentEditable: !1,
            style: {
              marginBottom: "12px",
              padding: "12px 16px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "8px",
              fontSize: "13px",
              color: "var(--orca-color-text-2)"
            },
            children: /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: [
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "遗忘次数" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: (l == null ? void 0 : l.lapses) ?? 0 })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "复习次数" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: (l == null ? void 0 : l.reps) ?? 0 })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "卡片状态" }),
                /* @__PURE__ */ o.jsx(
                  "span",
                  {
                    style: {
                      color: (l == null ? void 0 : l.state) === U.Review ? "var(--orca-color-success)" : (l == null ? void 0 : l.state) === U.Learning || (l == null ? void 0 : l.state) === U.Relearning ? "var(--orca-color-warning)" : "var(--orca-color-primary)"
                    },
                    children: ef(l == null ? void 0 : l.state)
                  }
                )
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "最后复习" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: Za(l == null ? void 0 : l.lastReviewed) })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "下次到期" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: Za(l == null ? void 0 : l.due) })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "间隔天数" }),
                /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-text-1)" }, children: [
                  (l == null ? void 0 : l.interval) ?? 0,
                  " 天"
                ] })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "稳定性" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: ((l == null ? void 0 : l.stability) ?? 0).toFixed(2) })
              ] }),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                /* @__PURE__ */ o.jsx("span", { children: "难度" }),
                /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-1)" }, children: ((l == null ? void 0 : l.difficulty) ?? 0).toFixed(2) })
              ] })
            ] })
          }
        ),
        u && /* @__PURE__ */ o.jsx("div", { style: {
          marginBottom: "12px",
          fontSize: "12px",
          color: "var(--orca-color-text-3)"
        }, children: /* @__PURE__ */ o.jsx(Zu, { blockId: u }) }),
        !X && /* @__PURE__ */ o.jsx(
          "div",
          {
            className: "srs-card-front",
            style: {
              marginBottom: "16px",
              padding: "20px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "8px",
              minHeight: "80px"
            },
            children: /* @__PURE__ */ o.jsx(
              tf,
              {
                blockId: u,
                panelId: y,
                fallback: e
              },
              u
            )
          }
        ),
        X ? /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
          /* @__PURE__ */ o.jsxs(
            "div",
            {
              className: "srs-card-back",
              style: {
                marginBottom: "16px",
                padding: "20px",
                borderRadius: "8px",
                minHeight: "80px"
              },
              children: [
                /* @__PURE__ */ o.jsx("div", { contentEditable: !1, style: {
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "var(--orca-color-text-2)",
                  marginBottom: "16px",
                  textAlign: "center"
                }, children: "摘录" }),
                u && y && /* @__PURE__ */ o.jsx(
                  Lo,
                  {
                    panelId: y,
                    blockId: u,
                    blockLevel: 0,
                    indentLevel: 0
                  }
                ),
                !u && /* @__PURE__ */ o.jsx(
                  "div",
                  {
                    style: {
                      padding: "12px",
                      fontSize: "20px",
                      fontWeight: "500",
                      color: "var(--orca-color-text-1)",
                      lineHeight: "1.6",
                      whiteSpace: "pre-wrap",
                      userSelect: "text",
                      WebkitUserSelect: "text"
                    },
                    children: e
                  }
                )
              ]
            }
          ),
          /* @__PURE__ */ o.jsxs(
            "div",
            {
              contentEditable: !1,
              className: "srs-card-grade-buttons",
              style: {
                display: "grid",
                gridTemplateColumns: i ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
                gap: "8px"
              },
              children: [
                i && /* @__PURE__ */ o.jsxs(
                  "button",
                  {
                    onClick: i,
                    style: {
                      padding: "16px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px",
                      backgroundColor: "rgba(156, 163, 175, 0.12)",
                      border: "1px solid rgba(156, 163, 175, 0.2)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    },
                    onMouseEnter: (I) => {
                      I.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.18)", I.currentTarget.style.transform = "translateY(-2px)";
                    },
                    onMouseLeave: (I) => {
                      I.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.12)", I.currentTarget.style.transform = "translateY(0)";
                    },
                    children: [
                      /* @__PURE__ */ o.jsx(
                        "div",
                        {
                          style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" },
                          children: "不评分"
                        }
                      ),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "⏭️" }),
                      /* @__PURE__ */ o.jsx(
                        "span",
                        {
                          style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" },
                          children: "跳过"
                        }
                      )
                    ]
                  }
                ),
                /* @__PURE__ */ o.jsxs(
                  "button",
                  {
                    onClick: () => J("again"),
                    style: {
                      padding: "16px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px",
                      backgroundColor: "rgba(239, 68, 68, 0.12)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    },
                    onMouseEnter: (I) => {
                      I.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.18)", I.currentTarget.style.transform = "translateY(-2px)";
                    },
                    onMouseLeave: (I) => {
                      I.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.12)", I.currentTarget.style.transform = "translateY(0)";
                    },
                    children: [
                      /* @__PURE__ */ o.jsx(
                        "div",
                        {
                          style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" },
                          children: new Date(W.again).toDateString() === (/* @__PURE__ */ new Date()).toDateString() ? Be(ae.again) : `${Se(W.again)} ${Be(
                            ae.again
                          )}`
                        }
                      ),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😞" }),
                      /* @__PURE__ */ o.jsx(
                        "span",
                        {
                          style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" },
                          children: "忘记"
                        }
                      )
                    ]
                  }
                ),
                /* @__PURE__ */ o.jsxs(
                  "button",
                  {
                    onClick: () => J("hard"),
                    style: {
                      padding: "16px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px",
                      backgroundColor: "rgba(251, 191, 36, 0.12)",
                      border: "1px solid rgba(251, 191, 36, 0.2)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    },
                    onMouseEnter: (I) => {
                      I.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.18)", I.currentTarget.style.transform = "translateY(-2px)";
                    },
                    onMouseLeave: (I) => {
                      I.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.12)", I.currentTarget.style.transform = "translateY(0)";
                    },
                    children: [
                      /* @__PURE__ */ o.jsx(
                        "div",
                        {
                          style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" },
                          children: new Date(W.hard).toDateString() === (/* @__PURE__ */ new Date()).toDateString() ? Be(ae.hard) : `${Se(W.hard)} ${Be(
                            ae.hard
                          )}`
                        }
                      ),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😐" }),
                      /* @__PURE__ */ o.jsx(
                        "span",
                        {
                          style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" },
                          children: "困难"
                        }
                      )
                    ]
                  }
                ),
                /* @__PURE__ */ o.jsxs(
                  "button",
                  {
                    onClick: () => J("good"),
                    style: {
                      padding: "16px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px",
                      backgroundColor: "rgba(34, 197, 94, 0.12)",
                      border: "1px solid rgba(34, 197, 94, 0.2)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    },
                    onMouseEnter: (I) => {
                      I.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.18)", I.currentTarget.style.transform = "translateY(-2px)";
                    },
                    onMouseLeave: (I) => {
                      I.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.12)", I.currentTarget.style.transform = "translateY(0)";
                    },
                    children: [
                      /* @__PURE__ */ o.jsx(
                        "div",
                        {
                          style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" },
                          children: new Date(W.good).toDateString() === (/* @__PURE__ */ new Date()).toDateString() ? Be(ae.good) : `${Se(W.good)} ${Be(
                            ae.good
                          )}`
                        }
                      ),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😊" }),
                      /* @__PURE__ */ o.jsx(
                        "span",
                        {
                          style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" },
                          children: "良好"
                        }
                      )
                    ]
                  }
                ),
                /* @__PURE__ */ o.jsxs(
                  "button",
                  {
                    onClick: () => J("easy"),
                    style: {
                      padding: "16px 8px",
                      fontSize: "14px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "6px",
                      backgroundColor: "rgba(59, 130, 246, 0.12)",
                      border: "1px solid rgba(59, 130, 246, 0.2)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      transition: "all 0.2s"
                    },
                    onMouseEnter: (I) => {
                      I.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.18)", I.currentTarget.style.transform = "translateY(-2px)";
                    },
                    onMouseLeave: (I) => {
                      I.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.12)", I.currentTarget.style.transform = "translateY(0)";
                    },
                    children: [
                      /* @__PURE__ */ o.jsx(
                        "div",
                        {
                          style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" },
                          children: new Date(W.easy).toDateString() === (/* @__PURE__ */ new Date()).toDateString() ? Be(ae.easy) : `${Se(W.easy)} ${Be(
                            ae.easy
                          )}`
                        }
                      ),
                      /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😄" }),
                      /* @__PURE__ */ o.jsx(
                        "span",
                        {
                          style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" },
                          children: "简单"
                        }
                      )
                    ]
                  }
                )
              ]
            }
          )
        ] }) : (
          /* 普通卡片：如果没有子块（摘录卡），直接显示评分按钮；否则显示答案按钮 */
          m === 0 || E ? (
            // 摘录卡或已显示答案：显示答案区域（如果有）和评分按钮
            /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
              m > 0 && E && /* @__PURE__ */ o.jsxs(
                "div",
                {
                  className: "srs-card-back",
                  style: {
                    marginBottom: "16px",
                    padding: "20px",
                    borderRadius: "8px",
                    minHeight: "80px"
                  },
                  children: [
                    /* @__PURE__ */ o.jsx(
                      "div",
                      {
                        contentEditable: !1,
                        style: {
                          fontSize: "18px",
                          fontWeight: "600",
                          color: "var(--orca-color-text-2)",
                          marginBottom: "16px",
                          textAlign: "center"
                        },
                        children: "答案"
                      }
                    ),
                    /* @__PURE__ */ o.jsx(
                      rf,
                      {
                        blockId: u,
                        panelId: y,
                        fallback: t
                      },
                      u
                    )
                  ]
                }
              ),
              /* @__PURE__ */ o.jsxs(
                "div",
                {
                  contentEditable: !1,
                  className: "srs-card-grade-buttons",
                  style: {
                    display: "grid",
                    gridTemplateColumns: i ? "repeat(5, 1fr)" : "repeat(4, 1fr)",
                    gap: "8px"
                  },
                  children: [
                    i && /* @__PURE__ */ o.jsxs(
                      "button",
                      {
                        onClick: i,
                        style: {
                          padding: "16px 8px",
                          fontSize: "14px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "6px",
                          backgroundColor: "rgba(156, 163, 175, 0.12)",
                          border: "1px solid rgba(156, 163, 175, 0.2)",
                          borderRadius: "8px",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        },
                        onMouseEnter: (I) => {
                          I.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.18)", I.currentTarget.style.transform = "translateY(-2px)";
                        },
                        onMouseLeave: (I) => {
                          I.currentTarget.style.backgroundColor = "rgba(156, 163, 175, 0.12)", I.currentTarget.style.transform = "translateY(0)";
                        },
                        children: [
                          /* @__PURE__ */ o.jsx(
                            "div",
                            {
                              style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" },
                              children: "不评分"
                            }
                          ),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "⏭️" }),
                          /* @__PURE__ */ o.jsx(
                            "span",
                            {
                              style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" },
                              children: "跳过"
                            }
                          )
                        ]
                      }
                    ),
                    /* @__PURE__ */ o.jsxs(
                      "button",
                      {
                        onClick: () => J("again"),
                        style: {
                          padding: "16px 8px",
                          fontSize: "14px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "6px",
                          backgroundColor: "rgba(239, 68, 68, 0.12)",
                          border: "1px solid rgba(239, 68, 68, 0.2)",
                          borderRadius: "8px",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        },
                        onMouseEnter: (I) => {
                          I.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.18)", I.currentTarget.style.transform = "translateY(-2px)";
                        },
                        onMouseLeave: (I) => {
                          I.currentTarget.style.backgroundColor = "rgba(239, 68, 68, 0.12)", I.currentTarget.style.transform = "translateY(0)";
                        },
                        children: [
                          /* @__PURE__ */ o.jsx(
                            "div",
                            {
                              style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" },
                              children: new Date(W.again).toDateString() === (/* @__PURE__ */ new Date()).toDateString() ? Be(ae.again) : `${Se(W.again)} ${Be(
                                ae.again
                              )}`
                            }
                          ),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😞" }),
                          /* @__PURE__ */ o.jsx(
                            "span",
                            {
                              style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" },
                              children: "忘记"
                            }
                          )
                        ]
                      }
                    ),
                    /* @__PURE__ */ o.jsxs(
                      "button",
                      {
                        onClick: () => J("hard"),
                        style: {
                          padding: "16px 8px",
                          fontSize: "14px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "6px",
                          backgroundColor: "rgba(251, 191, 36, 0.12)",
                          border: "1px solid rgba(251, 191, 36, 0.2)",
                          borderRadius: "8px",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        },
                        onMouseEnter: (I) => {
                          I.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.18)", I.currentTarget.style.transform = "translateY(-2px)";
                        },
                        onMouseLeave: (I) => {
                          I.currentTarget.style.backgroundColor = "rgba(251, 191, 36, 0.12)", I.currentTarget.style.transform = "translateY(0)";
                        },
                        children: [
                          /* @__PURE__ */ o.jsx(
                            "div",
                            {
                              style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" },
                              children: new Date(W.hard).toDateString() === (/* @__PURE__ */ new Date()).toDateString() ? Be(ae.hard) : `${Se(W.hard)} ${Be(
                                ae.hard
                              )}`
                            }
                          ),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😐" }),
                          /* @__PURE__ */ o.jsx(
                            "span",
                            {
                              style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" },
                              children: "困难"
                            }
                          )
                        ]
                      }
                    ),
                    /* @__PURE__ */ o.jsxs(
                      "button",
                      {
                        onClick: () => J("good"),
                        style: {
                          padding: "16px 8px",
                          fontSize: "14px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "6px",
                          backgroundColor: "rgba(34, 197, 94, 0.12)",
                          border: "1px solid rgba(34, 197, 94, 0.2)",
                          borderRadius: "8px",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        },
                        onMouseEnter: (I) => {
                          I.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.18)", I.currentTarget.style.transform = "translateY(-2px)";
                        },
                        onMouseLeave: (I) => {
                          I.currentTarget.style.backgroundColor = "rgba(34, 197, 94, 0.12)", I.currentTarget.style.transform = "translateY(0)";
                        },
                        children: [
                          /* @__PURE__ */ o.jsx(
                            "div",
                            {
                              style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" },
                              children: new Date(W.good).toDateString() === (/* @__PURE__ */ new Date()).toDateString() ? Be(ae.good) : `${Se(W.good)} ${Be(
                                ae.good
                              )}`
                            }
                          ),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😊" }),
                          /* @__PURE__ */ o.jsx(
                            "span",
                            {
                              style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" },
                              children: "良好"
                            }
                          )
                        ]
                      }
                    ),
                    /* @__PURE__ */ o.jsxs(
                      "button",
                      {
                        onClick: () => J("easy"),
                        style: {
                          padding: "16px 8px",
                          fontSize: "14px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "6px",
                          backgroundColor: "rgba(59, 130, 246, 0.12)",
                          border: "1px solid rgba(59, 130, 246, 0.2)",
                          borderRadius: "8px",
                          cursor: "pointer",
                          transition: "all 0.2s"
                        },
                        onMouseEnter: (I) => {
                          I.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.18)", I.currentTarget.style.transform = "translateY(-2px)";
                        },
                        onMouseLeave: (I) => {
                          I.currentTarget.style.backgroundColor = "rgba(59, 130, 246, 0.12)", I.currentTarget.style.transform = "translateY(0)";
                        },
                        children: [
                          /* @__PURE__ */ o.jsx(
                            "div",
                            {
                              style: { fontSize: "10px", opacity: 0.7, lineHeight: "1.2" },
                              children: new Date(W.easy).toDateString() === (/* @__PURE__ */ new Date()).toDateString() ? Be(ae.easy) : `${Se(W.easy)} ${Be(
                                ae.easy
                              )}`
                            }
                          ),
                          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "32px", lineHeight: "1" }, children: "😄" }),
                          /* @__PURE__ */ o.jsx(
                            "span",
                            {
                              style: { fontSize: "12px", opacity: 0.85, fontWeight: "500" },
                              children: "简单"
                            }
                          )
                        ]
                      }
                    )
                  ]
                }
              )
            ] })
          ) : (
            // 有子块但未显示答案：显示"显示答案"按钮和跳过按钮
            /* @__PURE__ */ o.jsxs(
              "div",
              {
                contentEditable: !1,
                style: {
                  display: "flex",
                  justifyContent: "center",
                  gap: "12px",
                  marginBottom: "12px"
                },
                children: [
                  i && /* @__PURE__ */ o.jsx(
                    Ot,
                    {
                      variant: "outline",
                      onClick: i,
                      title: "跳过当前卡片，不评分",
                      style: {
                        padding: "12px 24px",
                        fontSize: "16px"
                      },
                      children: "跳过"
                    }
                  ),
                  /* @__PURE__ */ o.jsx(
                    Ot,
                    {
                      variant: "solid",
                      onClick: () => O(!0),
                      style: {
                        padding: "12px 32px",
                        fontSize: "16px"
                      },
                      children: "显示答案"
                    }
                  )
                ]
              }
            )
          )
        )
      ]
    }
  ), Q = f && y ? /* @__PURE__ */ o.jsx(
    "div",
    {
      style: {
        position: "absolute",
        left: "-9999px",
        visibility: "hidden",
        pointerEvents: "none"
      },
      children: /* @__PURE__ */ o.jsx(
        Lo,
        {
          panelId: y,
          blockId: f,
          blockLevel: 0,
          indentLevel: 0
        }
      )
    }
  ) : null;
  return g ? /* @__PURE__ */ o.jsx(Xe, { componentName: "复习卡片", errorTitle: "卡片加载出错", children: /* @__PURE__ */ o.jsxs(
    "div",
    {
      style: { width: "100%", display: "flex", justifyContent: "center" },
      children: [
        q,
        Q
      ]
    }
  ) }) : /* @__PURE__ */ o.jsx(Xe, { componentName: "复习卡片", errorTitle: "卡片加载出错", children: /* @__PURE__ */ o.jsxs(
    Xu,
    {
      visible: !0,
      canClose: !0,
      onClose: s,
      className: "srs-card-modal",
      children: [
        q,
        Q
      ]
    }
  ) });
}
const { useMemo: of } = window.React, ts = {
  again: "#ef4444",
  // 红色
  hard: "#f59e0b",
  // 黄色
  good: "#22c55e",
  // 绿色
  easy: "#3b82f6"
  // 蓝色
}, rs = {
  again: "Again",
  hard: "Hard",
  good: "Good",
  easy: "Easy"
};
function nf({
  distribution: e,
  showLabels: t = !1,
  height: r = 24
}) {
  const { total: n, percentages: a } = of(() => {
    const i = e.again + e.hard + e.good + e.easy;
    return i === 0 ? {
      total: 0,
      percentages: { again: 0, hard: 0, good: 0, easy: 0 }
    } : {
      total: i,
      percentages: {
        again: e.again / i * 100,
        hard: e.hard / i * 100,
        good: e.good / i * 100,
        easy: e.easy / i * 100
      }
    };
  }, [e]);
  if (n === 0)
    return /* @__PURE__ */ o.jsx(
      "div",
      {
        className: "srs-grade-distribution-bar",
        style: {
          display: "flex",
          height: `${r}px`,
          borderRadius: "4px",
          overflow: "hidden",
          backgroundColor: "var(--orca-color-bg-3)"
        },
        children: /* @__PURE__ */ o.jsx(
          "div",
          {
            style: {
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              color: "var(--orca-color-text-3)"
            },
            children: "暂无评分数据"
          }
        )
      }
    );
  const s = ["again", "hard", "good", "easy"];
  return /* @__PURE__ */ o.jsxs("div", { className: "srs-grade-distribution-bar", children: [
    /* @__PURE__ */ o.jsx(
      "div",
      {
        style: {
          display: "flex",
          height: `${r}px`,
          borderRadius: "4px",
          overflow: "hidden"
        },
        children: s.map((i) => {
          const c = a[i], d = e[i];
          return c === 0 ? null : /* @__PURE__ */ o.jsx(
            "div",
            {
              title: `${rs[i]}: ${d} (${c.toFixed(1)}%)`,
              style: {
                flexBasis: `${c}%`,
                backgroundColor: ts[i],
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "flex-basis 0.3s ease",
                minWidth: c > 0 ? "4px" : "0"
              },
              children: t && c >= 10 && /* @__PURE__ */ o.jsx(
                "span",
                {
                  style: {
                    color: "white",
                    fontSize: "12px",
                    fontWeight: 600,
                    textShadow: "0 1px 2px rgba(0,0,0,0.2)"
                  },
                  children: d
                }
              )
            },
            i
          );
        })
      }
    ),
    t && /* @__PURE__ */ o.jsx(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "center",
          gap: "16px",
          marginTop: "8px",
          fontSize: "12px"
        },
        children: s.map((i) => {
          const c = e[i];
          return c === 0 ? null : /* @__PURE__ */ o.jsxs(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "4px"
              },
              children: [
                /* @__PURE__ */ o.jsx(
                  "div",
                  {
                    style: {
                      width: "12px",
                      height: "12px",
                      borderRadius: "2px",
                      backgroundColor: ts[i]
                    }
                  }
                ),
                /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-text-2)" }, children: [
                  rs[i],
                  ": ",
                  c
                ] })
              ]
            },
            i
          );
        })
      }
    )
  ] });
}
const { useEffect: Ft, useMemo: af, useRef: Dr, useState: et } = window.React, { useSnapshot: sf } = window.Valtio, { Button: ho, ModalOverlay: os } = orca.components;
function cf(e) {
  const t = e.getMonth() + 1, r = e.getDate();
  return `${t}-${r}`;
}
function Ti() {
  const e = /* @__PURE__ */ new Date();
  return e.setHours(0, 0, 0, 0), e;
}
function lf() {
  const e = Ti();
  return e.setDate(e.getDate() + 1), e;
}
function df({
  cards: e,
  onClose: t,
  onJumpToCard: r,
  inSidePanel: n = !1,
  panelId: a,
  pluginName: s = "orca-srs",
  isRepeatMode: i = !1,
  currentRound: c = 1,
  onRepeatRound: d
}) {
  var xt, oo;
  const l = Dr(null), [x, u] = et(e), [f, p] = et(0), [g, y] = et(0), [v, h] = et(!1), [S, $] = et(null), [k, C] = et(!0), [P, E] = et([]), [O, j] = et(0), [B, z] = et(Date.now()), [M, R] = et(c), [A, T] = et(null), {
    recordGrade: w,
    resetSession: N,
    finishSession: F
  } = pu({ autoSave: !0 });
  Ft(() => {
    c !== M && (u([...e]), p(0), E([]), y(0), j(0), R(c), $(`开始第 ${c} 轮复习`), T(null), N(), Yn(), console.log(`[SRS Review Session] 重置队列，开始第 ${c} 轮复习，卡片数: ${e.length}`));
  }, [e, c, M, N]), Ft(() => {
    Yn(), console.log("[SRS Review Session] 会话开始，重置已处理父卡片集合");
  }, []), Ft(() => {
    const L = l.current;
    if (!L) return;
    const K = L.closest(".orca-block-editor");
    if (!K) return;
    const se = K.querySelector(".orca-block-editor-none-editable"), Z = K.querySelector(".orca-block-editor-go-btns"), de = K.querySelector(".orca-block-editor-sidetools"), ne = K.querySelector(".orca-repr-main-none-editable"), oe = K.querySelector(".orca-breadcrumb");
    return k ? (K.setAttribute("maximize", "1"), se && (se.style.display = "none"), Z && (Z.style.display = "none"), de && (de.style.display = "none"), ne && (ne.style.display = "none"), oe && (oe.style.display = "none"), K.querySelectorAll(".orca-block-handle, .orca-repr-handle").forEach((he) => {
      he.style.display = "none";
    }), K.querySelectorAll('.orca-block-bullet, [data-role="bullet"]').forEach((he) => {
      he.style.display = "none";
    }), K.querySelectorAll(".orca-block-drag-handle").forEach((he) => {
      he.style.display = "none";
    }), K.querySelectorAll('.orca-repr-collapse, [class*="collapse"]').forEach((he) => {
      he.style.display = "none";
    })) : (K.removeAttribute("maximize"), se && (se.style.display = ""), Z && (Z.style.display = ""), de && (de.style.display = ""), ne && (ne.style.display = ""), oe && (oe.style.display = ""), K.querySelectorAll(".orca-block-handle, .orca-repr-handle").forEach((he) => {
      he.style.display = "";
    }), K.querySelectorAll('.orca-block-bullet, [data-role="bullet"]').forEach((he) => {
      he.style.display = "";
    }), K.querySelectorAll(".orca-block-drag-handle").forEach((he) => {
      he.style.display = "";
    }), K.querySelectorAll('.orca-repr-collapse, [class*="collapse"]').forEach((he) => {
      he.style.display = "";
    })), () => {
      K.removeAttribute("maximize"), se && (se.style.display = ""), Z && (Z.style.display = ""), de && (de.style.display = ""), ne && (ne.style.display = ""), oe && (oe.style.display = ""), K.querySelectorAll(".orca-block-handle, .orca-repr-handle").forEach((he) => {
        he.style.display = "";
      }), K.querySelectorAll('.orca-block-bullet, [data-role="bullet"]').forEach((he) => {
        he.style.display = "";
      }), K.querySelectorAll(".orca-block-drag-handle").forEach((he) => {
        he.style.display = "";
      }), K.querySelectorAll('.orca-repr-collapse, [class*="collapse"]').forEach((he) => {
        he.style.display = "";
      });
    };
  }, [k]);
  const D = x.length, m = f < D ? x[f] : null, _ = f + 1 < D ? x[f + 1] : null, G = f >= D && D > 0, X = sf(orca.state), pe = m ? (xt = X == null ? void 0 : X.blocks) == null ? void 0 : xt[m.id] : null, J = m != null && m.listItemId ? (oo = X == null ? void 0 : X.blocks) == null ? void 0 : oo[m.listItemId] : null, ae = Dr(/* @__PURE__ */ new Set());
  Ft(() => {
    if (!m) return;
    const L = Oe(m);
    if (ae.current.has(L))
      return;
    let K = !1;
    const se = async (Z) => {
      var ne;
      if ((ne = orca.state.blocks) == null ? void 0 : ne[Z]) return !0;
      try {
        const oe = await orca.invokeBackend("get-block", Z);
        if (K || !oe) return !1;
        const ce = orca.state;
        return ce.blocks || (ce.blocks = {}), ce.blocks[Z] = oe, !0;
      } catch (oe) {
        return console.warn(`[${s}] 拉取块失败: ${Z}`, oe), !1;
      }
    };
    return (async () => {
      const Z = [m.id];
      m.listItemId && Z.push(m.listItemId);
      for (const de of Z) {
        const ne = await se(de);
        if (K) return;
        if (!ne) {
          ae.current.add(L), console.log(`[${s}] 卡片对应块不存在，自动剔除: ${L}`), u((oe) => f < 0 || f >= oe.length || Oe(oe[f]) !== L ? oe : [...oe.slice(0, f), ...oe.slice(f + 1)]), E(
            (oe) => oe.filter((ce) => ce !== f).map((ce) => ce > f ? ce - 1 : ce)
          ), $("已自动跳过不存在的卡片");
          return;
        }
      }
    })(), () => {
      K = !0;
    };
  }, [
    m == null ? void 0 : m.id,
    m == null ? void 0 : m.listItemId,
    f,
    s,
    pe,
    J
  ]), Ft(() => {
    var L;
    _ != null && _.id && ((L = orca.state.blocks) != null && L[_.id] || (async () => {
      try {
        const se = await orca.invokeBackend("get-block", _.id);
        if (!se) return;
        const Z = orca.state;
        Z.blocks || (Z.blocks = {}), Z.blocks[_.id] = se, console.log(`[SRS Review Session] 已预缓存下一张卡片: ${_.id}`);
      } catch (se) {
        console.warn(`[SRS Review Session] 预缓存失败: ${_.id}`, se);
      }
    })());
  }, [_ == null ? void 0 : _.id]), Ft(() => {
    z(Date.now());
  }, [f]);
  const W = af(() => {
    const L = Date.now();
    let K = 0, se = 0;
    for (const Z of x)
      Z.isNew ? se += 1 : Z.srs.due.getTime() <= L && (K += 1);
    return { due: K, fresh: se };
  }, [x]), q = Dr(/* @__PURE__ */ new Map()), Q = Dr(null), ie = Dr(f);
  ie.current = f;
  const I = () => {
    const L = Date.now(), K = q.current, se = [];
    console.log(`[${s}] 检查待到期卡片，当前追踪 ${K.size} 张`);
    for (const [Z, { card: de, dueTime: ne }] of K.entries())
      console.log(`[${s}] 检查卡片 ${Z}: dueTime=${ne}, now=${L}, diff=${ne - L}ms`), L >= ne && (se.push(de), K.delete(Z), console.log(`[${s}] 卡片 ${Z} 已到期，准备加入队列`));
    if (se.length > 0 && (console.log(`[${s}] ${se.length} 张短期卡片已到期，添加到复习队列`), u((Z) => {
      const de = new Set(Z.map((oe) => Oe(oe))), ne = se.filter((oe) => !de.has(Oe(oe)));
      return ne.length > 0 ? (j((oe) => oe + ne.length), $(`${ne.length} 张卡片已到期，加入队列`), orca.notify("info", `${ne.length} 张卡片已到期`, { title: "SRS 复习" }), console.log(`[${s}] 成功添加 ${ne.length} 张卡片到队列末尾`), [...Z, ...ne]) : (console.log(`[${s}] 卡片已在队列中，跳过添加`), Z);
    })), K.size > 0) {
      let Z = 1 / 0;
      for (const { dueTime: ne } of K.values())
        ne < Z && (Z = ne);
      const de = Math.max(1e3, Z - L + 500);
      console.log(`[${s}] 还有 ${K.size} 张待检查卡片，${de}ms 后再次检查`), Q.current = setTimeout(I, de);
    } else
      Q.current = null;
  }, ge = (L, K) => {
    const se = Oe(L), Z = K.getTime(), de = Date.now();
    if (Z - de <= 5 * 60 * 1e3) {
      q.current.set(se, { card: L, dueTime: Z });
      const ne = Math.round((Z - de) / 1e3);
      if (console.log(`[${s}] 追踪短期到期卡片: ${se}, 将在 ${ne} 秒后到期`), $(`卡片将在 ${ne} 秒后重新加入队列`), !Q.current) {
        const oe = Math.max(1e3, Z - de + 500);
        console.log(`[${s}] 启动定时器，${oe}ms 后检查`), Q.current = setTimeout(I, oe);
      }
    }
  };
  Ft(() => {
    let L = null;
    const K = async () => {
      try {
        const { collectReviewCards: se, buildReviewQueue: Z } = await Promise.resolve().then(() => za), de = await se(s), ne = Z(de);
        u((oe) => {
          const ce = new Set(oe.map((Ve) => Oe(Ve))), De = ne.filter((Ve) => !ce.has(Oe(Ve)));
          return De.length > 0 ? (console.log(`[${s}] 发现 ${De.length} 张新到期卡片，添加到复习队列`), j((Ve) => Ve + De.length), $(`发现 ${De.length} 张新到期卡片已加入队列`), orca.notify("info", `${De.length} 张新卡片已到期`, {
            title: "SRS 复习"
          }), [...oe, ...De]) : oe;
        });
      } catch (se) {
        console.error(`[${s}] 检查新到期卡片失败:`, se);
      }
      L = setTimeout(K, 6e4);
    };
    return L = setTimeout(K, 6e4), () => {
      L && clearTimeout(L), Q.current && (clearTimeout(Q.current), Q.current = null);
    };
  }, [s]);
  const fe = async (L) => {
    if (!m) return;
    h(!0), console.log(`[SRS Card Demo] 用户选择评分: ${L}${i ? " (专项训练模式，不更新SRS)" : ""}`);
    let K = [...x], se = m, Z = "";
    const de = !!m.listItemId && !!m.listItemIndex && !!m.listItemIds;
    if (m.clozeNumber ? Z = ` [c${m.clozeNumber}]` : m.directionType ? Z = ` [${m.directionType === "forward" ? "→" : "←"}]` : de && (Z = ` [L${m.listItemIndex}/${m.listItemIds.length}]`), i) {
      $(`评分 ${L.toUpperCase()}${Z} (专项训练，不影响复习进度)`), y((be) => be + 1), w(L), Ro(
        m.id,
        m.clozeNumber,
        m.directionType,
        m.listItemId
      ), u(K), h(!1), E((be) => [...be, f]), setTimeout(() => p((be) => be + 1), 250);
      return;
    }
    if (de && m.isAuxiliaryPreview) {
      $(`评分 ${L.toUpperCase()}${Z}（辅助预览，不计入统计）`), Ro(
        m.id,
        m.clozeNumber,
        m.directionType,
        m.listItemId
      ), u(K), h(!1), E((be) => [...be, f]), setTimeout(() => p((be) => be + 1), 250);
      return;
    }
    const ne = m.srs.interval, oe = m.isNew ? "new" : m.srs.interval < 1 ? "learning" : "review";
    let ce;
    m.clozeNumber ? ce = await Gs(m.id, m.clozeNumber, L, s) : m.directionType ? ce = await Js(m.id, m.directionType, L, s) : de ? ce = await Eo(m.listItemId, L, s) : ce = await Eo(m.id, L, s), se = { ...m, srs: ce.state, isNew: !1 }, K[f] = se;
    const De = L === "again" ? "relearning" : ce.state.interval < 1 ? "learning" : "review", Ve = Date.now() - B, zt = Date.now(), he = de ? m.listItemId : m.id, cn = {
      id: Zd(zt, he),
      cardId: he,
      deckName: m.deck,
      timestamp: zt,
      grade: L,
      duration: Ve,
      previousInterval: ne,
      newInterval: ce.state.interval,
      previousState: oe,
      newState: De
    };
    if (Qd(s, cn), $(
      `评分 ${L.toUpperCase()}${Z} -> 下次 ${cf(ce.state.due)}，间隔 ${ce.state.interval} 天`
    ), Nd(he, L), y((be) => be + 1), w(L), Ro(
      m.id,
      m.clozeNumber,
      m.directionType,
      m.listItemId
    ), de) {
      const be = m.listItemIds ?? [], gt = (m.listItemIndex ?? 1) - 1, ht = lf(), er = async (Ee, Ae) => {
        await orca.commands.invokeEditorCommand(
          "core.editor.setProperties",
          null,
          [Ee],
          [{ name: "srs.due", type: 5, value: Ae }]
        ), ea(Ee);
      }, mr = async (Ee, Ae, kt) => {
        const jt = Ae === 1 ? Ti() : ht;
        await dr(Ee, jt);
        const br = await Vt(Ee);
        return {
          id: m.id,
          front: m.front,
          back: m.back,
          srs: br,
          isNew: !br.lastReviewed || br.reps === 0,
          deck: m.deck,
          tags: m.tags,
          listItemId: Ee,
          listItemIndex: Ae,
          listItemIds: be,
          isAuxiliaryPreview: kt
        };
      }, vr = new Set(K.slice(f + 1).map(Oe));
      if (L === "good" || L === "easy") {
        const Ee = gt + 1;
        if (Ee < be.length) {
          const Ae = be[Ee];
          await dr(Ae, ht), await er(Ae, /* @__PURE__ */ new Date());
          const kt = await mr(Ae, Ee + 1, !1);
          vr.has(Oe(kt)) || K.push(kt);
        }
      } else if (L === "again" || L === "hard") {
        for (let Ee = gt + 1; Ee < be.length; Ee++) {
          const Ae = be[Ee];
          await dr(Ae, ht), (await Vt(Ae)).due.getTime() < ht.getTime() && await er(Ae, ht);
          const jt = await mr(Ae, Ee + 1, !0);
          vr.has(Oe(jt)) || (K.push(jt), vr.add(Oe(jt)));
        }
        $(`评分 ${L.toUpperCase()}${Z} -> 后续条目已安排明天，今日以辅助预览继续`);
      }
    }
    u(K);
    const ln = ce.state.due.getTime(), yr = Date.now();
    (L === "again" || L === "hard") && ln - yr <= 5 * 60 * 1e3 && ge(se, ce.state.due), h(!1), E((be) => [...be, f]), setTimeout(() => p((be) => be + 1), 250);
  }, Te = async () => {
    if (!(!m || v)) {
      h(!0);
      try {
        const L = m.listItemId ?? m.id;
        await dl(
          L,
          m.clozeNumber,
          m.directionType
        );
        let K = "";
        m.clozeNumber ? K = ` [c${m.clozeNumber}]` : m.directionType ? K = ` [${m.directionType === "forward" ? "→" : "←"}]` : m.listItemIndex && m.listItemIds && (K = ` [L${m.listItemIndex}/${m.listItemIds.length}]`), $(`已推迟${K}，明天再复习`), Nt("orca-srs", "info", "卡片已推迟，明天再复习", { title: "SRS 复习" }), Yd(L);
      } catch (L) {
        console.error("[SRS Review Session] 推迟卡片失败:", L), orca.notify("error", `推迟失败: ${L}`, { title: "SRS 复习" });
      }
      h(!1), E((L) => [...L, f]), setTimeout(() => p((L) => L + 1), 250);
    }
  }, $e = async () => {
    if (!(!m || v)) {
      h(!0);
      try {
        await il(m.id);
        let L = "";
        m.clozeNumber ? L = ` [c${m.clozeNumber}]` : m.directionType && (L = ` [${m.directionType === "forward" ? "→" : "←"}]`), $(`已暂停${L}`), Nt("orca-srs", "info", "卡片已暂停，可在卡片浏览器中取消暂停", { title: "SRS 复习" }), qd(m.id);
      } catch (L) {
        console.error("[SRS Review Session] 暂停卡片失败:", L), orca.notify("error", `暂停失败: ${L}`, { title: "SRS 复习" });
      }
      h(!1), E((L) => [...L, f]), setTimeout(() => p((L) => L + 1), 250);
    }
  }, Ke = () => {
    if (!m || v) return;
    let L = "";
    m.clozeNumber ? L = ` [c${m.clozeNumber}]` : m.directionType ? L = ` [${m.directionType === "forward" ? "→" : "←"}]` : m.listItemIndex && m.listItemIds && (L = ` [L${m.listItemIndex}/${m.listItemIds.length}]`), $(`已跳过${L}`), E((K) => [...K, f]), p((K) => K + 1);
  }, Ct = async () => {
    try {
      const { collectReviewCards: L, buildReviewQueue: K } = await Promise.resolve().then(() => za), se = await L(s), Z = K(se);
      let de = 0;
      u((ne) => {
        const oe = new Set(ne.map((De) => Oe(De))), ce = Z.filter((De) => !oe.has(Oe(De)));
        return de = ce.length, ce.length > 0 ? (console.log(`[${s}] 手动检查发现 ${ce.length} 张新到期卡片`), j((De) => De + ce.length), $(`手动检查发现 ${ce.length} 张新到期卡片已加入队列`), [...ne, ...ce]) : ne;
      }), de > 0 ? orca.notify("success", `发现 ${de} 张新到期卡片`, {
        title: "SRS 复习"
      }) : ($("暂无新到期卡片"), orca.notify("info", "暂无新到期卡片", {
        title: "SRS 复习"
      }));
    } catch (L) {
      console.error(`[${s}] 手动检查新到期卡片失败:`, L), $("检查新卡片失败"), orca.notify("error", "检查新卡片失败", { title: "SRS 复习" });
    }
  }, pt = () => {
    if (P.length === 0 || v) return;
    const L = P[P.length - 1];
    E((K) => K.slice(0, -1)), p(L), $("返回上一张");
  }, Ue = P.length > 0 && !v, Zt = (L, K) => {
    if (r) {
      r(L, K);
      return;
    }
    console.log(`[SRS Review Session] 跳转到卡片 #${L}, shiftKey: ${K}`), orca.nav.goTo("block", { blockId: L }), Nt(
      "orca-srs",
      "info",
      "已跳转到卡片，复习界面仍然保留",
      { title: "SRS 复习" }
    );
  }, hr = () => {
    const L = F();
    console.log(`[SRS Review Session] 本次复习结束，共复习 ${L.totalReviewed} 张卡片`), Nt(
      "orca-srs",
      "success",
      `本次复习完成！共复习了 ${L.totalReviewed} 张卡片`,
      { title: "SRS 复习会话" }
    ), t && t();
  };
  if (D === 0) {
    const L = /* @__PURE__ */ o.jsxs("div", { style: {
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "32px",
      maxWidth: "480px",
      width: "100%",
      textAlign: "center",
      boxShadow: "0 4px 20px rgba(0,0,0,0.08)"
    }, children: [
      /* @__PURE__ */ o.jsx("h3", { style: { marginBottom: "12px" }, children: "今天没有到期或新卡" }),
      /* @__PURE__ */ o.jsx("div", { style: { color: "var(--orca-color-text-2)", marginBottom: "20px" }, children: "请先创建或等待卡片到期，然后再次开始复习" }),
      t && /* @__PURE__ */ o.jsx(ho, { variant: "solid", onClick: t, children: "关闭" })
    ] });
    return n ? /* @__PURE__ */ o.jsx("div", { style: {
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px"
    }, children: L }) : /* @__PURE__ */ o.jsx(os, { visible: !0, canClose: !0, onClose: t, children: L });
  }
  if (G) {
    const L = A || F(), K = /* @__PURE__ */ o.jsxs("div", { className: "srs-session-complete-container", style: {
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "32px 48px",
      maxWidth: "520px",
      width: "100%",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      textAlign: "center"
    }, children: [
      /* @__PURE__ */ o.jsx("div", { style: {
        fontSize: "56px",
        marginBottom: "16px"
      }, children: "🎉" }),
      /* @__PURE__ */ o.jsx("h2", { style: {
        fontSize: "22px",
        fontWeight: "600",
        color: "var(--orca-color-text-1)",
        marginBottom: "24px"
      }, children: i ? `第 ${c} 轮复习结束！` : "本次复习结束！" }),
      /* @__PURE__ */ o.jsxs("div", { style: {
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        padding: "20px",
        marginBottom: "24px",
        textAlign: "left"
      }, children: [
        /* @__PURE__ */ o.jsxs("div", { style: {
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "16px",
          marginBottom: "20px"
        }, children: [
          /* @__PURE__ */ o.jsxs("div", { style: { textAlign: "center" }, children: [
            /* @__PURE__ */ o.jsx("div", { style: {
              fontSize: "28px",
              fontWeight: "600",
              color: "var(--orca-color-primary-5)"
            }, children: L.totalReviewed }),
            /* @__PURE__ */ o.jsx("div", { style: {
              fontSize: "12px",
              color: "var(--orca-color-text-3)",
              marginTop: "4px"
            }, children: "复习卡片" })
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { textAlign: "center" }, children: [
            /* @__PURE__ */ o.jsx("div", { style: {
              fontSize: "28px",
              fontWeight: "600",
              color: L.accuracyRate >= 0.8 ? "#22c55e" : L.accuracyRate >= 0.6 ? "#f59e0b" : "#ef4444"
            }, children: su(L.accuracyRate) }),
            /* @__PURE__ */ o.jsx("div", { style: {
              fontSize: "12px",
              color: "var(--orca-color-text-3)",
              marginTop: "4px"
            }, children: "准确率" })
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { textAlign: "center" }, children: [
            /* @__PURE__ */ o.jsx("div", { style: {
              fontSize: "28px",
              fontWeight: "600",
              color: "var(--orca-color-text-1)"
            }, children: Wa(L.totalSessionTime) }),
            /* @__PURE__ */ o.jsx("div", { style: {
              fontSize: "12px",
              color: "var(--orca-color-text-3)",
              marginTop: "4px"
            }, children: "总时长" })
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { textAlign: "center" }, children: [
            /* @__PURE__ */ o.jsx("div", { style: {
              fontSize: "28px",
              fontWeight: "600",
              color: "var(--orca-color-text-1)"
            }, children: L.totalReviewed > 0 ? `${Math.round(L.averageTimePerCard / 1e3)}s` : "0s" }),
            /* @__PURE__ */ o.jsx("div", { style: {
              fontSize: "12px",
              color: "var(--orca-color-text-3)",
              marginTop: "4px"
            }, children: "平均每卡" })
          ] })
        ] }),
        L.totalSessionTime > 0 && L.effectiveReviewTime < L.totalSessionTime * 0.9 && /* @__PURE__ */ o.jsxs("div", { style: {
          fontSize: "12px",
          color: "var(--orca-color-text-3)",
          textAlign: "center",
          marginBottom: "16px"
        }, children: [
          "有效复习时长: ",
          Wa(L.effectiveReviewTime)
        ] }),
        /* @__PURE__ */ o.jsxs("div", { children: [
          /* @__PURE__ */ o.jsx("div", { style: {
            fontSize: "13px",
            color: "var(--orca-color-text-2)",
            marginBottom: "8px",
            textAlign: "center"
          }, children: "评分分布" }),
          /* @__PURE__ */ o.jsx(
            nf,
            {
              distribution: L.gradeDistribution,
              showLabels: !0,
              height: 28
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ o.jsx("div", { style: {
        fontSize: "14px",
        color: "var(--orca-color-text-2)",
        marginBottom: "24px"
      }, children: "坚持复习，持续进步！" }),
      /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "12px", justifyContent: "center" }, children: [
        i && d && /* @__PURE__ */ o.jsx(
          ho,
          {
            variant: "outline",
            onClick: d,
            style: {
              padding: "12px 24px",
              fontSize: "16px"
            },
            children: "再复习一轮"
          }
        ),
        /* @__PURE__ */ o.jsx(
          ho,
          {
            variant: "solid",
            onClick: hr,
            style: {
              padding: "12px 32px",
              fontSize: "16px"
            },
            children: "完成"
          }
        )
      ] })
    ] });
    return n ? /* @__PURE__ */ o.jsx("div", { style: {
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px"
    }, children: K }) : /* @__PURE__ */ o.jsx(
      os,
      {
        visible: !0,
        canClose: !0,
        onClose: t,
        className: "srs-session-complete-modal",
        children: K
      }
    );
  }
  return n ? /* @__PURE__ */ o.jsxs(
    "div",
    {
      ref: l,
      className: `srs-review-session-panel ${k ? "orca-maximized" : ""}`,
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--orca-color-bg-0)"
      },
      children: [
        /* @__PURE__ */ o.jsx(
          "div",
          {
            className: "srs-review-progress-bar",
            contentEditable: !1,
            style: {
              height: "4px",
              backgroundColor: "var(--orca-color-bg-2)"
            },
            children: /* @__PURE__ */ o.jsx("div", { style: {
              height: "100%",
              width: `${f / D * 100}%`,
              backgroundColor: "var(--orca-color-primary-5)",
              transition: "width 0.3s ease"
            } })
          }
        ),
        /* @__PURE__ */ o.jsxs(
          "div",
          {
            className: "srs-review-header",
            contentEditable: !1,
            style: {
              padding: "12px 16px",
              borderBottom: "1px solid var(--orca-color-border-1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            },
            children: [
              /* @__PURE__ */ o.jsxs("div", { contentEditable: !1, style: { userSelect: "none" }, children: [
                /* @__PURE__ */ o.jsxs("div", { style: {
                  fontSize: "14px",
                  color: "var(--orca-color-text-2)",
                  fontWeight: 500,
                  userSelect: "none",
                  pointerEvents: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px"
                }, children: [
                  i && /* @__PURE__ */ o.jsxs("span", { style: {
                    backgroundColor: "var(--orca-color-warning-1)",
                    color: "var(--orca-color-warning-6)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    fontWeight: 600
                  }, children: [
                    "重复复习 · 第 ",
                    c,
                    " 轮"
                  ] }),
                  /* @__PURE__ */ o.jsxs("span", { children: [
                    "卡片 ",
                    f + 1,
                    " / ",
                    D,
                    "（到期 ",
                    W.due,
                    " | 新卡 ",
                    W.fresh,
                    "）"
                  ] }),
                  O > 0 && /* @__PURE__ */ o.jsxs("span", { style: {
                    color: "var(--orca-color-primary-6)",
                    fontSize: "12px"
                  }, children: [
                    "+",
                    O,
                    " 新增"
                  ] })
                ] }),
                S && /* @__PURE__ */ o.jsx("div", { style: {
                  marginTop: "6px",
                  fontSize: "12px",
                  color: "var(--orca-color-text-2)",
                  opacity: 0.8
                }, children: S })
              ] }),
              /* @__PURE__ */ o.jsx(
                ho,
                {
                  variant: "plain",
                  onClick: Ct,
                  title: "检查新到期卡片",
                  style: { marginLeft: "8px" },
                  children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-refresh" })
                }
              ),
              !1
            ]
          }
        ),
        /* @__PURE__ */ o.jsx("div", { style: { flex: 1, overflow: "auto", padding: "0" }, children: m ? /* @__PURE__ */ o.jsx(
          es,
          {
            front: m.front,
            back: m.back,
            onGrade: fe,
            onPostpone: Te,
            onSuspend: $e,
            onClose: t,
            onSkip: Ke,
            onPrevious: pt,
            canGoPrevious: Ue,
            srsInfo: m.srs,
            isGrading: v,
            blockId: m.id,
            nextBlockId: _ == null ? void 0 : _.id,
            onJumpToCard: Zt,
            inSidePanel: !0,
            panelId: a,
            pluginName: s,
            clozeNumber: m.clozeNumber,
            directionType: m.directionType,
            listItemId: m.listItemId,
            listItemIndex: m.listItemIndex,
            listItemIds: m.listItemIds,
            isAuxiliaryPreview: m.isAuxiliaryPreview
          }
        ) : /* @__PURE__ */ o.jsx("div", { style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--orca-color-text-2)"
        }, children: "加载中..." }) })
      ]
    }
  ) : /* @__PURE__ */ o.jsxs("div", { className: "srs-review-session", children: [
    /* @__PURE__ */ o.jsx("div", { contentEditable: !1, style: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      height: "4px",
      backgroundColor: "var(--orca-color-bg-2)",
      zIndex: 1e4
    }, children: /* @__PURE__ */ o.jsx("div", { style: {
      height: "100%",
      width: `${f / D * 100}%`,
      backgroundColor: "var(--orca-color-primary-5)",
      transition: "width 0.3s ease"
    } }) }),
    /* @__PURE__ */ o.jsxs("div", { contentEditable: !1, style: {
      position: "fixed",
      top: "12px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "8px 16px",
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "20px",
      fontSize: "14px",
      color: "var(--orca-color-text-2)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
      zIndex: 10001,
      display: "flex",
      alignItems: "center",
      gap: "8px"
    }, children: [
      i && /* @__PURE__ */ o.jsxs("span", { style: {
        backgroundColor: "var(--orca-color-warning-1)",
        color: "var(--orca-color-warning-6)",
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: 600
      }, children: [
        "重复复习 · 第 ",
        c,
        " 轮"
      ] }),
      /* @__PURE__ */ o.jsxs("span", { children: [
        "卡片 ",
        f + 1,
        " / ",
        D,
        "（到期 ",
        W.due,
        " | 新卡 ",
        W.fresh,
        "）"
      ] }),
      O > 0 && /* @__PURE__ */ o.jsxs("span", { style: {
        color: "var(--orca-color-primary-6)",
        fontSize: "12px"
      }, children: [
        "+",
        O,
        " 新增"
      ] })
    ] }),
    S && /* @__PURE__ */ o.jsx("div", { contentEditable: !1, style: {
      position: "fixed",
      top: "48px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "6px 12px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "12px",
      fontSize: "12px",
      color: "var(--orca-color-text-2)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      zIndex: 10001
    }, children: S }),
    m ? /* @__PURE__ */ o.jsx(
      es,
      {
        front: m.front,
        back: m.back,
        onGrade: fe,
        onPostpone: Te,
        onSuspend: $e,
        onClose: t,
        onSkip: Ke,
        onPrevious: pt,
        canGoPrevious: Ue,
        srsInfo: m.srs,
        isGrading: v,
        blockId: m.id,
        nextBlockId: _ == null ? void 0 : _.id,
        onJumpToCard: Zt,
        panelId: a,
        pluginName: s,
        clozeNumber: m.clozeNumber,
        directionType: m.directionType,
        listItemId: m.listItemId,
        listItemIndex: m.listItemIndex,
        listItemIds: m.listItemIds,
        isAuxiliaryPreview: m.isAuxiliaryPreview
      }
    ) : /* @__PURE__ */ o.jsx("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      color: "var(--orca-color-text-2)"
    }, children: "加载中..." })
  ] });
}
let bt = null;
function sn(e, t, r) {
  bt !== null && (console.log(`[repeatReviewManager] 清理旧的重复复习会话，来源块ID: ${bt.sourceBlockId}`), bt = null);
  const n = e.map((s) => ({ ...s })), a = {
    cards: [...e],
    originalCards: n,
    currentRound: 1,
    totalRounds: 1,
    isRepeatMode: !0,
    sourceBlockId: t,
    sourceType: r
  };
  return bt = a, console.log(`[repeatReviewManager] 创建重复复习会话，卡片数: ${e.length}, 来源: ${r}, 块ID: ${t}`), a;
}
function Ei(e) {
  const t = e.originalCards.map((n) => ({ ...n })), r = {
    ...e,
    cards: t,
    currentRound: e.currentRound + 1,
    totalRounds: e.totalRounds + 1
  };
  return bt = r, r;
}
function _i() {
  return console.log(`[repeatReviewManager] 获取重复复习会话，当前会话: ${bt ? `存在，卡片数 ${bt.cards.length}` : "不存在"}`), bt;
}
function qn() {
  console.log("[repeatReviewManager] 清除重复复习会话"), bt = null;
}
const uf = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  clearRepeatReviewSession: qn,
  createRepeatReviewSession: sn,
  getRepeatReviewSession: _i,
  resetCurrentRound: Ei
}, Symbol.toStringTag, { value: "Module" })), { useEffect: ns, useState: Wt } = window.React, { BlockShell: ff, Button: pf } = orca.components;
function xf(e) {
  const {
    panelId: t,
    blockId: r,
    rndId: n,
    blockLevel: a,
    indentLevel: s,
    mirrorId: i,
    initiallyCollapsed: c,
    renderingMode: d
  } = e, [l, x] = Wt([]), [u, f] = Wt(!0), [p, g] = Wt(null), [y, v] = Wt("orca-srs"), [h, S] = Wt(!1), [$, k] = Wt(1), [C, P] = Wt(null);
  ns(() => {
    E();
  }, [r]), ns(() => () => {
    console.log("[SRS Review Session Renderer] 组件卸载，清理重复复习会话"), qn();
  }, []);
  const E = async () => {
    f(!0), g(null);
    try {
      const { getPluginName: M } = await Promise.resolve().then(() => He), R = typeof M == "function" ? M() : "orca-srs";
      v(R);
      const A = _i();
      if (A) {
        console.log(`[SRS Review Session Renderer] 使用重复复习会话，原始卡片数: ${A.cards.length}`);
        const { buildReviewQueueWithChildren: T } = await Promise.resolve().then(() => He), w = await T(A.cards, R);
        console.log(`[SRS Review Session Renderer] 展开子卡片后卡片数: ${w.length}`), x(w), S(!0), k(A.currentRound), P({ ...A, cards: w });
      } else {
        const {
          collectReviewCards: T,
          buildReviewQueueWithChildren: w,
          getReviewDeckFilter: N
        } = await Promise.resolve().then(() => He), F = await T(R), D = typeof N == "function" ? N() : null, m = D ? F.filter((G) => G.deck === D || G.deck.startsWith(`${D}::`)) : F, _ = await w(m, R);
        x(_), S(!1), k(1), P(null);
      }
    } catch (M) {
      console.error("[SRS Review Session Renderer] 加载复习队列失败:", M), g(M instanceof Error ? M.message : `${M}`), orca.notify("error", "加载复习队列失败", { title: "SRS 复习" });
    } finally {
      f(!1);
    }
  }, O = async () => {
    if (!C) return;
    const M = Ei(C), { buildReviewQueueWithChildren: R } = await Promise.resolve().then(() => He), A = await R(M.cards, y);
    x(A), k(M.currentRound), P({ ...M, cards: A }), console.log(`[SRS Review Session Renderer] 开始第 ${M.currentRound} 轮复习，展开后卡片数: ${A.length}`);
  }, j = () => {
    h && qn(), orca.nav.close(t);
  }, B = (M, R) => {
    R ? orca.nav.openInLastPanel("block", { blockId: M }) : orca.nav.goTo("block", { blockId: M }, t);
  }, z = () => u ? /* @__PURE__ */ o.jsx("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    fontSize: "14px",
    color: "var(--orca-color-text-2)"
  }, children: "加载复习队列中..." }) : p ? /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "24px",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center"
  }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: { color: "var(--orca-color-danger-5)" }, children: [
      "加载失败：",
      p
    ] }),
    /* @__PURE__ */ o.jsx(pf, { variant: "solid", onClick: E, children: "重试" })
  ] }) : /* @__PURE__ */ o.jsx(Xe, { componentName: "复习会话", errorTitle: "复习会话加载出错", children: /* @__PURE__ */ o.jsx(
    df,
    {
      cards: l,
      onClose: j,
      onJumpToCard: B,
      inSidePanel: !0,
      panelId: t,
      pluginName: y,
      isRepeatMode: h,
      currentRound: $,
      onRepeatRound: h ? O : void 0
    }
  ) });
  return /* @__PURE__ */ o.jsx(
    ff,
    {
      panelId: t,
      blockId: r,
      rndId: n,
      mirrorId: i,
      blockLevel: a,
      indentLevel: s,
      initiallyCollapsed: c,
      renderingMode: d,
      reprClassName: "srs-repr-review-session",
      contentClassName: "srs-repr-review-session-content",
      contentJsx: z(),
      childrenJsx: null
    }
  );
}
function zi() {
  const e = /* @__PURE__ */ new Date();
  return new Date(e.getFullYear(), e.getMonth(), e.getDate());
}
function gf() {
  const e = zi(), t = new Date(e);
  return t.setDate(t.getDate() + 1), t;
}
function hf(e, t) {
  if (t === "all")
    return e;
  if (t === "new")
    return e.filter((a) => a.isNew);
  const r = zi(), n = gf();
  switch (t) {
    case "overdue":
      return e.filter((a) => a.isNew ? !1 : a.srs.due < r);
    case "today":
      return e.filter((a) => {
        if (a.isNew) return !1;
        const s = a.srs.due;
        return s >= r && s < n;
      });
    case "future":
      return e.filter((a) => a.isNew ? !1 : a.srs.due >= n);
    default:
      return e;
  }
}
const { useState: as, useMemo: ss } = window.React;
function ba({
  data: e,
  width: t = 400,
  height: r = 200,
  barColor: n = "var(--orca-color-primary-5)",
  showLabels: a = !0,
  showValues: s = !1,
  maxValue: i,
  formatValue: c = (x) => String(x),
  formatLabel: d = (x) => x,
  onBarClick: l
}) {
  const [x, u] = as(null), [f, p] = as(null), g = { top: 20, right: 20, bottom: a ? 40 : 20, left: 40 }, y = t - g.left - g.right, v = r - g.top - g.bottom, h = ss(() => {
    if (i !== void 0) return i;
    const O = Math.max(...e.map((j) => j.value), 0);
    return O === 0 ? 1 : O * 1.1;
  }, [e, i]), S = e.length, $ = Math.min(8, y / S * 0.2), k = S > 0 ? (y - $ * (S - 1)) / S : 0, C = ss(() => {
    const j = h / 5;
    return Array.from({ length: 6 }, (B, z) => Math.round(j * z));
  }, [h]), P = (O, j) => {
    var M;
    u(O);
    const B = j.target.getBoundingClientRect(), z = (M = j.currentTarget.closest("svg")) == null ? void 0 : M.getBoundingClientRect();
    z && p({
      x: B.left - z.left + B.width / 2,
      y: B.top - z.top - 10
    });
  }, E = () => {
    u(null), p(null);
  };
  return e.length === 0 ? /* @__PURE__ */ o.jsx("div", { style: {
    width: t,
    height: r,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--orca-color-text-3)",
    fontSize: "14px"
  }, children: "暂无数据" }) : /* @__PURE__ */ o.jsxs("div", { style: { position: "relative", width: t, height: r }, children: [
    /* @__PURE__ */ o.jsxs("svg", { width: t, height: r, style: { overflow: "visible" }, children: [
      /* @__PURE__ */ o.jsx(
        "line",
        {
          x1: g.left,
          y1: g.top,
          x2: g.left,
          y2: r - g.bottom,
          stroke: "var(--orca-color-border-1)",
          strokeWidth: 1
        }
      ),
      C.map((O, j) => {
        const B = r - g.bottom - O / h * v;
        return /* @__PURE__ */ o.jsxs("g", { children: [
          /* @__PURE__ */ o.jsx(
            "line",
            {
              x1: g.left - 4,
              y1: B,
              x2: g.left,
              y2: B,
              stroke: "var(--orca-color-border-1)",
              strokeWidth: 1
            }
          ),
          /* @__PURE__ */ o.jsx(
            "line",
            {
              x1: g.left,
              y1: B,
              x2: t - g.right,
              y2: B,
              stroke: "var(--orca-color-border-1)",
              strokeWidth: 1,
              strokeDasharray: "2,2",
              opacity: 0.5
            }
          ),
          /* @__PURE__ */ o.jsx(
            "text",
            {
              x: g.left - 8,
              y: B,
              textAnchor: "end",
              dominantBaseline: "middle",
              fontSize: 10,
              fill: "var(--orca-color-text-3)",
              children: O
            }
          )
        ] }, j);
      }),
      /* @__PURE__ */ o.jsx(
        "line",
        {
          x1: g.left,
          y1: r - g.bottom,
          x2: t - g.right,
          y2: r - g.bottom,
          stroke: "var(--orca-color-border-1)",
          strokeWidth: 1
        }
      ),
      e.map((O, j) => {
        const B = g.left + j * (k + $), z = O.value / h * v, M = r - g.bottom - z, R = x === j;
        return /* @__PURE__ */ o.jsxs("g", { children: [
          /* @__PURE__ */ o.jsx(
            "rect",
            {
              x: B,
              y: M,
              width: k,
              height: Math.max(z, 0),
              fill: O.color || n,
              opacity: R ? 1 : 0.8,
              rx: 2,
              ry: 2,
              className: "srs-chart-bar-animated srs-chart-bar-hover",
              style: {
                cursor: l ? "pointer" : "default",
                animationDelay: `${j * 0.05}s`
              },
              onMouseEnter: (A) => P(j, A),
              onMouseLeave: E,
              onClick: () => l == null ? void 0 : l(O, j)
            }
          ),
          a && /* @__PURE__ */ o.jsx(
            "text",
            {
              x: B + k / 2,
              y: r - g.bottom + 16,
              textAnchor: "middle",
              fontSize: 10,
              fill: "var(--orca-color-text-3)",
              style: {
                maxWidth: k,
                overflow: "hidden",
                textOverflow: "ellipsis"
              },
              children: d(O.label)
            }
          ),
          s && O.value > 0 && /* @__PURE__ */ o.jsx(
            "text",
            {
              x: B + k / 2,
              y: M - 4,
              textAnchor: "middle",
              fontSize: 10,
              fill: "var(--orca-color-text-2)",
              children: c(O.value)
            }
          )
        ] }, j);
      })
    ] }),
    x !== null && f && /* @__PURE__ */ o.jsxs(
      "div",
      {
        className: "srs-chart-tooltip-animated",
        style: {
          position: "absolute",
          left: f.x,
          top: f.y,
          transform: "translate(-50%, -100%)",
          backgroundColor: "var(--orca-color-bg-4)",
          color: "var(--orca-color-text-1)",
          padding: "6px 10px",
          borderRadius: "4px",
          fontSize: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 100
        },
        children: [
          /* @__PURE__ */ o.jsx("div", { style: { fontWeight: 500 }, children: e[x].label }),
          /* @__PURE__ */ o.jsx("div", { style: { color: "var(--orca-color-text-2)", marginTop: "2px" }, children: c(e[x].value) })
        ]
      }
    )
  ] });
}
const { useState: bn, useMemo: yo } = window.React;
function Ii({
  data: e,
  width: t = 400,
  height: r = 200,
  showLabels: n = !0,
  showLegend: a = !0,
  legendItems: s,
  maxValue: i,
  formatValue: c = (x) => String(x),
  formatLabel: d = (x) => x,
  onSegmentClick: l
}) {
  const [x, u] = bn(null), [f, p] = bn(null), [g, y] = bn(null), v = a ? 30 : 0, h = { top: 20, right: 20, bottom: n ? 40 : 20, left: 40 }, S = t - h.left - h.right, $ = r - h.top - h.bottom - v, k = yo(() => e.map((R) => R.segments.reduce((A, T) => A + T.value, 0)), [e]), C = yo(() => {
    if (i !== void 0) return i;
    const R = Math.max(...k, 0);
    return R === 0 ? 1 : R * 1.1;
  }, [k, i]), P = e.length, E = Math.min(8, S / P * 0.2), O = P > 0 ? (S - E * (P - 1)) / P : 0, j = yo(() => {
    const A = C / 5;
    return Array.from({ length: 6 }, (T, w) => Math.round(A * w));
  }, [C]), B = yo(() => {
    if (s) return s;
    const R = /* @__PURE__ */ new Map();
    return e.forEach((A) => {
      A.segments.forEach((T) => {
        R.has(T.key) || R.set(T.key, { label: T.label || T.key, color: T.color });
      });
    }), Array.from(R.entries()).map(([A, { label: T, color: w }]) => ({
      key: A,
      label: T,
      color: w
    }));
  }, [e, s]), z = (R, A, T) => {
    var F;
    u({ barIndex: R, segmentKey: A });
    const w = T.target.getBoundingClientRect(), N = (F = T.currentTarget.closest("svg")) == null ? void 0 : F.getBoundingClientRect();
    N && p({
      x: w.left - N.left + w.width / 2,
      y: w.top - N.top - 10
    }), y({
      label: e[R].label,
      segments: e[R].segments,
      total: k[R]
    });
  }, M = () => {
    u(null), p(null), y(null);
  };
  return e.length === 0 ? /* @__PURE__ */ o.jsx("div", { style: {
    width: t,
    height: r,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--orca-color-text-3)",
    fontSize: "14px"
  }, children: "暂无数据" }) : /* @__PURE__ */ o.jsxs("div", { style: { position: "relative", width: t, height: r }, children: [
    /* @__PURE__ */ o.jsxs("svg", { width: t, height: r - v, style: { overflow: "visible" }, children: [
      /* @__PURE__ */ o.jsx(
        "line",
        {
          x1: h.left,
          y1: h.top,
          x2: h.left,
          y2: r - h.bottom - v,
          stroke: "var(--orca-color-border-1)",
          strokeWidth: 1
        }
      ),
      j.map((R, A) => {
        const T = r - h.bottom - v - R / C * $;
        return /* @__PURE__ */ o.jsxs("g", { children: [
          /* @__PURE__ */ o.jsx(
            "line",
            {
              x1: h.left - 4,
              y1: T,
              x2: h.left,
              y2: T,
              stroke: "var(--orca-color-border-1)",
              strokeWidth: 1
            }
          ),
          /* @__PURE__ */ o.jsx(
            "line",
            {
              x1: h.left,
              y1: T,
              x2: t - h.right,
              y2: T,
              stroke: "var(--orca-color-border-1)",
              strokeWidth: 1,
              strokeDasharray: "2,2",
              opacity: 0.5
            }
          ),
          /* @__PURE__ */ o.jsx(
            "text",
            {
              x: h.left - 8,
              y: T,
              textAnchor: "end",
              dominantBaseline: "middle",
              fontSize: 10,
              fill: "var(--orca-color-text-3)",
              children: R
            }
          )
        ] }, A);
      }),
      /* @__PURE__ */ o.jsx(
        "line",
        {
          x1: h.left,
          y1: r - h.bottom - v,
          x2: t - h.right,
          y2: r - h.bottom - v,
          stroke: "var(--orca-color-border-1)",
          strokeWidth: 1
        }
      ),
      e.map((R, A) => {
        const T = h.left + A * (O + E);
        let w = r - h.bottom - v;
        return /* @__PURE__ */ o.jsxs("g", { children: [
          R.segments.map((N, F) => {
            const D = N.value / C * $;
            w -= D;
            const m = (x == null ? void 0 : x.barIndex) === A && (x == null ? void 0 : x.segmentKey) === N.key;
            return /* @__PURE__ */ o.jsx(
              "rect",
              {
                x: T,
                y: w,
                width: O,
                height: Math.max(D, 0),
                fill: N.color,
                opacity: m ? 1 : 0.8,
                rx: F === R.segments.length - 1 ? 2 : 0,
                ry: F === R.segments.length - 1 ? 2 : 0,
                className: "srs-chart-bar-animated srs-chart-bar-hover",
                style: {
                  cursor: l ? "pointer" : "default",
                  animationDelay: `${A * 0.03 + F * 0.02}s`
                },
                onMouseEnter: (_) => z(A, N.key, _),
                onMouseLeave: M,
                onClick: () => l == null ? void 0 : l(R, N, A)
              },
              F
            );
          }),
          n && /* @__PURE__ */ o.jsx(
            "text",
            {
              x: T + O / 2,
              y: r - h.bottom - v + 16,
              textAnchor: "middle",
              fontSize: 10,
              fill: "var(--orca-color-text-3)",
              children: d(R.label)
            }
          )
        ] }, A);
      })
    ] }),
    a && B.length > 0 && /* @__PURE__ */ o.jsx("div", { style: {
      display: "flex",
      justifyContent: "center",
      gap: "16px",
      marginTop: "8px",
      flexWrap: "wrap"
    }, children: B.map((R) => /* @__PURE__ */ o.jsxs(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "4px",
          fontSize: "12px",
          color: "var(--orca-color-text-2)"
        },
        children: [
          /* @__PURE__ */ o.jsx("div", { style: {
            width: "12px",
            height: "12px",
            backgroundColor: R.color,
            borderRadius: "2px"
          } }),
          /* @__PURE__ */ o.jsx("span", { children: R.label })
        ]
      },
      R.key
    )) }),
    g && f && /* @__PURE__ */ o.jsxs(
      "div",
      {
        className: "srs-chart-tooltip-animated",
        style: {
          position: "absolute",
          left: f.x,
          top: f.y,
          transform: "translate(-50%, -100%)",
          backgroundColor: "var(--orca-color-bg-4)",
          color: "var(--orca-color-text-1)",
          padding: "8px 12px",
          borderRadius: "4px",
          fontSize: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 100
        },
        children: [
          /* @__PURE__ */ o.jsx("div", { style: { fontWeight: 500, marginBottom: "4px" }, children: g.label }),
          g.segments.map((R) => /* @__PURE__ */ o.jsxs(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginTop: "2px"
              },
              children: [
                /* @__PURE__ */ o.jsx("div", { style: {
                  width: "8px",
                  height: "8px",
                  backgroundColor: R.color,
                  borderRadius: "2px"
                } }),
                /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-text-2)" }, children: [
                  R.label || R.key,
                  ": ",
                  c(R.value)
                ] })
              ]
            },
            R.key
          )),
          /* @__PURE__ */ o.jsxs("div", { style: {
            marginTop: "4px",
            paddingTop: "4px",
            borderTop: "1px solid var(--orca-color-border-1)",
            color: "var(--orca-color-text-2)"
          }, children: [
            "总计: ",
            c(g.total)
          ] })
        ]
      }
    )
  ] });
}
const { useState: yf, useMemo: is } = window.React;
function mf(e, t, r, n, a, s) {
  const i = Mr(e, t, r, s), c = Mr(e, t, r, a), d = Mr(e, t, n, s), l = Mr(e, t, n, a), x = s - a <= 180 ? 0 : 1;
  return n === 0 ? [
    "M",
    e,
    t,
    "L",
    c.x,
    c.y,
    "A",
    r,
    r,
    0,
    x,
    1,
    i.x,
    i.y,
    "Z"
  ].join(" ") : [
    "M",
    i.x,
    i.y,
    "A",
    r,
    r,
    0,
    x,
    0,
    c.x,
    c.y,
    "L",
    l.x,
    l.y,
    "A",
    n,
    n,
    0,
    x,
    1,
    d.x,
    d.y,
    "Z"
  ].join(" ");
}
function Mr(e, t, r, n) {
  const a = (n - 90) * Math.PI / 180;
  return {
    x: e + r * Math.cos(a),
    y: t + r * Math.sin(a)
  };
}
function Mi({
  data: e,
  width: t = 300,
  height: r = 300,
  innerRadius: n = 0,
  showLabels: a = !1,
  showLegend: s = !0,
  showPercentage: i = !0,
  formatValue: c = (l) => String(l),
  onSliceClick: d
}) {
  const [l, x] = yf(null), u = is(() => e.reduce((C, P) => C + P.value, 0), [e]), f = s ? Math.ceil(e.length / 2) * 24 + 16 : 0, p = Math.min(t, r - f), g = t / 2, y = (r - f) / 2, v = p / 2 - 20, h = n > 0 ? Math.min(n, v * 0.8) : 0, S = is(() => {
    let C = 0;
    return e.map((P, E) => {
      const O = u > 0 ? P.value / u : 0, j = O * 360, B = C, z = C + j;
      C = z;
      const M = B + j / 2, R = (v + h) / 2, A = Mr(g, y, R, M);
      return {
        ...P,
        index: E,
        startAngle: B,
        endAngle: z,
        percentage: O,
        labelPos: A
      };
    });
  }, [e, u, g, y, v, h]), $ = (C) => {
    x(C);
  }, k = () => {
    x(null);
  };
  return e.length === 0 || u === 0 ? /* @__PURE__ */ o.jsx("div", { style: {
    width: t,
    height: r,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--orca-color-text-3)",
    fontSize: "14px"
  }, children: "暂无数据" }) : /* @__PURE__ */ o.jsxs("div", { style: { position: "relative", width: t, height: r }, children: [
    /* @__PURE__ */ o.jsxs("svg", { width: t, height: r - f, style: { overflow: "visible" }, children: [
      S.map((C) => {
        const P = l === C.index, E = P ? 1.05 : 1, O = P ? `translate(${g * (1 - E)}, ${y * (1 - E)}) scale(${E})` : void 0;
        return /* @__PURE__ */ o.jsxs("g", { transform: O, style: { transformOrigin: `${g}px ${y}px` }, children: [
          /* @__PURE__ */ o.jsx(
            "path",
            {
              d: mf(
                g,
                y,
                v,
                h,
                C.startAngle,
                C.endAngle
              ),
              fill: C.color,
              opacity: P ? 1 : 0.85,
              className: "srs-chart-pie-slice srs-chart-pie-hover",
              style: {
                cursor: d ? "pointer" : "default",
                animationDelay: `${C.index * 0.1}s`
              },
              onMouseEnter: () => $(C.index),
              onMouseLeave: k,
              onClick: () => d == null ? void 0 : d(C, C.index)
            }
          ),
          a && C.percentage > 0.05 && /* @__PURE__ */ o.jsx(
            "text",
            {
              x: C.labelPos.x,
              y: C.labelPos.y,
              textAnchor: "middle",
              dominantBaseline: "middle",
              fontSize: 11,
              fill: "white",
              fontWeight: 500,
              style: { pointerEvents: "none" },
              children: i ? `${Math.round(C.percentage * 100)}%` : c(C.value)
            }
          )
        ] }, C.key);
      }),
      h > 0 && /* @__PURE__ */ o.jsxs("g", { children: [
        /* @__PURE__ */ o.jsx(
          "text",
          {
            x: g,
            y: y - 8,
            textAnchor: "middle",
            dominantBaseline: "middle",
            fontSize: 20,
            fontWeight: 600,
            fill: "var(--orca-color-text-1)",
            children: c(u)
          }
        ),
        /* @__PURE__ */ o.jsx(
          "text",
          {
            x: g,
            y: y + 12,
            textAnchor: "middle",
            dominantBaseline: "middle",
            fontSize: 12,
            fill: "var(--orca-color-text-3)",
            children: "总计"
          }
        )
      ] })
    ] }),
    s && /* @__PURE__ */ o.jsx("div", { style: {
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: "8px 16px",
      marginTop: "8px",
      padding: "0 8px"
    }, children: e.map((C, P) => {
      const E = u > 0 ? (C.value / u * 100).toFixed(1) : "0", O = l === P;
      return /* @__PURE__ */ o.jsxs(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            color: O ? "var(--orca-color-text-1)" : "var(--orca-color-text-2)",
            cursor: d ? "pointer" : "default",
            transition: "color 0.15s ease"
          },
          onMouseEnter: () => $(P),
          onMouseLeave: k,
          onClick: () => d == null ? void 0 : d(C, P),
          children: [
            /* @__PURE__ */ o.jsx("div", { style: {
              width: "12px",
              height: "12px",
              backgroundColor: C.color,
              borderRadius: "2px",
              flexShrink: 0
            } }),
            /* @__PURE__ */ o.jsx("span", { children: C.label || C.key }),
            /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-text-3)" }, children: [
              c(C.value),
              " (",
              E,
              "%)"
            ] })
          ]
        },
        C.key
      );
    }) }),
    l !== null && /* @__PURE__ */ o.jsxs(
      "div",
      {
        className: "srs-chart-tooltip-animated",
        style: {
          position: "absolute",
          left: g,
          top: y - v - 40,
          transform: "translateX(-50%)",
          backgroundColor: "var(--orca-color-bg-4)",
          color: "var(--orca-color-text-1)",
          padding: "8px 12px",
          borderRadius: "4px",
          fontSize: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 100
        },
        children: [
          /* @__PURE__ */ o.jsxs("div", { style: {
            display: "flex",
            alignItems: "center",
            gap: "6px"
          }, children: [
            /* @__PURE__ */ o.jsx("div", { style: {
              width: "10px",
              height: "10px",
              backgroundColor: e[l].color,
              borderRadius: "2px"
            } }),
            /* @__PURE__ */ o.jsx("span", { style: { fontWeight: 500 }, children: e[l].label || e[l].key })
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { marginTop: "4px", color: "var(--orca-color-text-2)" }, children: [
            c(e[l].value),
            " (",
            (e[l].value / u * 100).toFixed(1),
            "%)"
          ] })
        ]
      }
    )
  ] });
}
const { useState: cs, useMemo: Tr } = window.React;
function vf({
  data: e,
  width: t = 400,
  height: r = 200,
  lineColor: n = "var(--orca-color-primary-5)",
  fillColor: a = "var(--orca-color-primary-2)",
  showArea: s = !0,
  showDots: i = !0,
  showLabels: c = !0,
  showValues: d = !1,
  maxValue: l,
  formatValue: x = (p) => String(p),
  formatLabel: u = (p) => p,
  onPointClick: f
}) {
  const [p, g] = cs(null), [y, v] = cs(null), h = { top: 20, right: 20, bottom: c ? 40 : 20, left: 50 }, S = t - h.left - h.right, $ = r - h.top - h.bottom, k = Tr(() => {
    if (l !== void 0) return l;
    const z = Math.max(...e.map((M) => M.value), 0);
    return z === 0 ? 1 : z * 1.1;
  }, [e, l]), C = Tr(() => {
    if (e.length === 0) return [];
    const z = e.length > 1 ? S / (e.length - 1) : 0;
    return e.map((M, R) => ({
      ...M,
      x: h.left + R * z,
      y: r - h.bottom - M.value / k * $
    }));
  }, [e, S, $, k, h, r]), P = Tr(() => C.length === 0 ? "" : C.map((z, M) => `${M === 0 ? "M" : "L"} ${z.x} ${z.y}`).join(" "), [C]), E = Tr(() => {
    if (C.length === 0) return "";
    const z = r - h.bottom;
    return `${P} L ${C[C.length - 1].x} ${z} L ${C[0].x} ${z} Z`;
  }, [P, C, r, h.bottom]), O = Tr(() => {
    const M = k / 5;
    return Array.from({ length: 6 }, (R, A) => Math.round(M * A));
  }, [k]), j = (z, M) => {
    g(z);
    const R = C[z];
    v({ x: R.x, y: R.y - 10 });
  }, B = () => {
    g(null), v(null);
  };
  return e.length === 0 ? /* @__PURE__ */ o.jsx("div", { style: {
    width: t,
    height: r,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--orca-color-text-3)",
    fontSize: "14px"
  }, children: "暂无数据" }) : /* @__PURE__ */ o.jsxs("div", { style: { position: "relative", width: t, height: r }, children: [
    /* @__PURE__ */ o.jsxs("svg", { width: t, height: r, style: { overflow: "visible" }, children: [
      /* @__PURE__ */ o.jsx(
        "line",
        {
          x1: h.left,
          y1: h.top,
          x2: h.left,
          y2: r - h.bottom,
          stroke: "var(--orca-color-border-1)",
          strokeWidth: 1
        }
      ),
      O.map((z, M) => {
        const R = r - h.bottom - z / k * $;
        return /* @__PURE__ */ o.jsxs("g", { children: [
          /* @__PURE__ */ o.jsx(
            "line",
            {
              x1: h.left - 4,
              y1: R,
              x2: h.left,
              y2: R,
              stroke: "var(--orca-color-border-1)",
              strokeWidth: 1
            }
          ),
          /* @__PURE__ */ o.jsx(
            "line",
            {
              x1: h.left,
              y1: R,
              x2: t - h.right,
              y2: R,
              stroke: "var(--orca-color-border-1)",
              strokeWidth: 1,
              strokeDasharray: "2,2",
              opacity: 0.5
            }
          ),
          /* @__PURE__ */ o.jsx(
            "text",
            {
              x: h.left - 8,
              y: R,
              textAnchor: "end",
              dominantBaseline: "middle",
              fontSize: 10,
              fill: "var(--orca-color-text-3)",
              children: z
            }
          )
        ] }, M);
      }),
      /* @__PURE__ */ o.jsx(
        "line",
        {
          x1: h.left,
          y1: r - h.bottom,
          x2: t - h.right,
          y2: r - h.bottom,
          stroke: "var(--orca-color-border-1)",
          strokeWidth: 1
        }
      ),
      s && /* @__PURE__ */ o.jsx(
        "path",
        {
          d: E,
          fill: a,
          className: "srs-chart-line-area"
        }
      ),
      /* @__PURE__ */ o.jsx(
        "path",
        {
          d: P,
          fill: "none",
          stroke: n,
          strokeWidth: 2,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          className: "srs-chart-line-path"
        }
      ),
      i && C.map((z, M) => {
        const R = p === M;
        return /* @__PURE__ */ o.jsxs("g", { children: [
          /* @__PURE__ */ o.jsx(
            "circle",
            {
              cx: z.x,
              cy: z.y,
              r: R ? 6 : 4,
              fill: n,
              stroke: "var(--orca-color-bg-1)",
              strokeWidth: 2,
              className: "srs-chart-line-dot",
              style: {
                cursor: f ? "pointer" : "default",
                animationDelay: `${0.5 + M * 0.03}s`
              },
              onMouseEnter: (A) => j(M),
              onMouseLeave: B,
              onClick: () => f == null ? void 0 : f(z, M)
            }
          ),
          c && /* @__PURE__ */ o.jsx(
            "text",
            {
              x: z.x,
              y: r - h.bottom + 16,
              textAnchor: "middle",
              fontSize: 10,
              fill: "var(--orca-color-text-3)",
              children: u(z.label)
            }
          ),
          d && /* @__PURE__ */ o.jsx(
            "text",
            {
              x: z.x,
              y: z.y - 10,
              textAnchor: "middle",
              fontSize: 10,
              fill: "var(--orca-color-text-2)",
              children: x(z.value)
            }
          )
        ] }, M);
      }),
      p !== null && /* @__PURE__ */ o.jsx(
        "line",
        {
          x1: C[p].x,
          y1: h.top,
          x2: C[p].x,
          y2: r - h.bottom,
          stroke: n,
          strokeWidth: 1,
          strokeDasharray: "4,4",
          opacity: 0.5
        }
      )
    ] }),
    p !== null && y && /* @__PURE__ */ o.jsxs(
      "div",
      {
        className: "srs-chart-tooltip-animated",
        style: {
          position: "absolute",
          left: y.x,
          top: y.y,
          transform: "translate(-50%, -100%)",
          backgroundColor: "var(--orca-color-bg-4)",
          color: "var(--orca-color-text-1)",
          padding: "6px 10px",
          borderRadius: "4px",
          fontSize: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 100
        },
        children: [
          /* @__PURE__ */ o.jsx("div", { style: { fontWeight: 500 }, children: e[p].label }),
          /* @__PURE__ */ o.jsx("div", { style: { color: "var(--orca-color-text-2)", marginTop: "2px" }, children: x(e[p].value) })
        ]
      }
    )
  ] });
}
const { useState: Je, useEffect: bf, useCallback: wn, useMemo: Jg } = window.React, { Button: ls } = orca.components, wf = [
  { key: "1month", label: "1个月" },
  { key: "3months", label: "3个月" },
  { key: "1year", label: "1年" },
  { key: "all", label: "全部" }
];
function Kn(e) {
  if (e < 6e4)
    return `${Math.round(e / 1e3)}秒`;
  if (e < 36e5)
    return `${Math.round(e / 6e4)}分钟`;
  const t = Math.floor(e / 36e5), r = Math.round(e % 36e5 / 6e4);
  return r > 0 ? `${t}小时${r}分钟` : `${t}小时`;
}
function Oo(e) {
  return `${e.getMonth() + 1}/${e.getDate()}`;
}
function Sf({ value: e, onChange: t }) {
  return /* @__PURE__ */ o.jsx("div", { style: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap"
  }, children: wf.map((r) => /* @__PURE__ */ o.jsx(
    "button",
    {
      onClick: () => t(r.key),
      style: {
        padding: "6px 12px",
        borderRadius: "16px",
        border: "1px solid",
        borderColor: e === r.key ? "var(--orca-color-primary-5)" : "var(--orca-color-border-1)",
        backgroundColor: e === r.key ? "var(--orca-color-primary-1)" : "transparent",
        color: e === r.key ? "var(--orca-color-primary-6)" : "var(--orca-color-text-2)",
        fontSize: "13px",
        cursor: "pointer",
        transition: "all 0.2s ease"
      },
      children: r.label
    },
    r.key
  )) });
}
function Cf({ decks: e, selectedDeck: t, onChange: r }) {
  return /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  }, children: [
    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "13px", color: "var(--orca-color-text-2)" }, children: "牌组:" }),
    /* @__PURE__ */ o.jsxs(
      "select",
      {
        value: t || "",
        onChange: (n) => r(n.target.value || void 0),
        style: {
          padding: "6px 12px",
          borderRadius: "6px",
          border: "1px solid var(--orca-color-border-1)",
          backgroundColor: "var(--orca-color-bg-1)",
          color: "var(--orca-color-text-1)",
          fontSize: "13px",
          cursor: "pointer",
          minWidth: "120px"
        },
        children: [
          /* @__PURE__ */ o.jsx("option", { value: "", children: "全部牌组" }),
          e.map((n) => /* @__PURE__ */ o.jsx("option", { value: n.name, children: n.name }, n.name))
        ]
      }
    )
  ] });
}
function kf({ stats: e, isLoading: t }) {
  if (t)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "加载中..." });
  if (!e)
    return null;
  const { reviewedCount: r, newLearnedCount: n, relearnedCount: a, totalTime: s, gradeDistribution: i } = e;
  return /* @__PURE__ */ o.jsxs("div", { style: {
    padding: "16px",
    backgroundColor: "var(--orca-color-bg-2)",
    borderRadius: "8px"
  }, children: [
    /* @__PURE__ */ o.jsx("h3", { style: {
      margin: "0 0 12px 0",
      fontSize: "15px",
      fontWeight: 600,
      color: "var(--orca-color-text-1)"
    }, children: "今日统计" }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
      gap: "12px"
    }, children: [
      /* @__PURE__ */ o.jsx(mo, { label: "已复习", value: r, color: "var(--orca-color-primary-6)" }),
      /* @__PURE__ */ o.jsx(mo, { label: "新学", value: n, color: "var(--orca-color-success-6)" }),
      /* @__PURE__ */ o.jsx(mo, { label: "重学", value: a, color: "var(--orca-color-danger-6)" }),
      /* @__PURE__ */ o.jsx(mo, { label: "复习时间", value: Kn(s) })
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      marginTop: "16px",
      paddingTop: "12px",
      borderTop: "1px solid var(--orca-color-border-1)"
    }, children: [
      /* @__PURE__ */ o.jsx("div", { style: {
        fontSize: "13px",
        color: "var(--orca-color-text-2)",
        marginBottom: "8px"
      }, children: "评分分布" }),
      /* @__PURE__ */ o.jsxs("div", { style: {
        display: "flex",
        gap: "16px",
        flexWrap: "wrap"
      }, children: [
        /* @__PURE__ */ o.jsx(vo, { label: "Again", value: i.again, color: "#ef4444" }),
        /* @__PURE__ */ o.jsx(vo, { label: "Hard", value: i.hard, color: "#f97316" }),
        /* @__PURE__ */ o.jsx(vo, { label: "Good", value: i.good, color: "#22c55e" }),
        /* @__PURE__ */ o.jsx(vo, { label: "Easy", value: i.easy, color: "#3b82f6" })
      ] })
    ] })
  ] });
}
function mo({ label: e, value: t, color: r }) {
  return /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "8px",
    backgroundColor: "var(--orca-color-bg-1)",
    borderRadius: "6px"
  }, children: [
    /* @__PURE__ */ o.jsx("div", { style: {
      fontSize: "20px",
      fontWeight: 600,
      color: r || "var(--orca-color-text-1)"
    }, children: t }),
    /* @__PURE__ */ o.jsx("div", { style: {
      fontSize: "12px",
      color: "var(--orca-color-text-3)",
      marginTop: "4px"
    }, children: e })
  ] });
}
function vo({ label: e, value: t, color: r }) {
  return /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: "6px"
  }, children: [
    /* @__PURE__ */ o.jsx("div", { style: {
      width: "10px",
      height: "10px",
      backgroundColor: r,
      borderRadius: "2px"
    } }),
    /* @__PURE__ */ o.jsxs("span", { style: { fontSize: "13px", color: "var(--orca-color-text-2)" }, children: [
      e,
      ": ",
      t
    ] })
  ] });
}
function jf({ forecast: e, isLoading: t }) {
  if (t)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "加载中..." });
  if (!e || e.days.length === 0)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "暂无预测数据" });
  const r = e.days.map((a) => ({
    label: Oo(a.date),
    segments: [
      { key: "review", value: a.reviewDue, color: "#22c55e", label: "复习" },
      { key: "new", value: a.newAvailable, color: "#3b82f6", label: "新卡" }
    ]
  })), n = e.days.map((a) => ({
    label: Oo(a.date),
    value: a.cumulative
  }));
  return /* @__PURE__ */ o.jsxs("div", { style: {
    padding: "16px",
    backgroundColor: "var(--orca-color-bg-2)",
    borderRadius: "8px"
  }, children: [
    /* @__PURE__ */ o.jsx("h3", { style: {
      margin: "0 0 12px 0",
      fontSize: "15px",
      fontWeight: 600,
      color: "var(--orca-color-text-1)"
    }, children: "未来30天到期预测" }),
    /* @__PURE__ */ o.jsx("div", { style: { marginBottom: "16px" }, children: /* @__PURE__ */ o.jsx(
      Ii,
      {
        data: r,
        width: 600,
        height: 200,
        showLabels: !0,
        showLegend: !0,
        legendItems: [
          { key: "review", label: "复习卡", color: "#22c55e" },
          { key: "new", label: "新卡", color: "#3b82f6" }
        ]
      }
    ) }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      marginTop: "16px",
      paddingTop: "12px",
      borderTop: "1px solid var(--orca-color-border-1)"
    }, children: [
      /* @__PURE__ */ o.jsx("div", { style: {
        fontSize: "13px",
        color: "var(--orca-color-text-2)",
        marginBottom: "8px"
      }, children: "累计到期趋势" }),
      /* @__PURE__ */ o.jsx(
        vf,
        {
          data: n,
          width: 600,
          height: 150,
          lineColor: "var(--orca-color-warning-5)",
          fillColor: "var(--orca-color-warning-2)",
          showArea: !0,
          showDots: !1,
          showLabels: !1
        }
      )
    ] })
  ] });
}
function Rf({ history: e, isLoading: t }) {
  if (t)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "加载中..." });
  if (!e || e.days.length === 0)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "暂无复习历史" });
  const r = e.days.map((n) => ({
    label: Oo(n.date),
    segments: [
      { key: "again", value: n.again, color: "#ef4444", label: "Again" },
      { key: "hard", value: n.hard, color: "#f97316", label: "Hard" },
      { key: "good", value: n.good, color: "#22c55e", label: "Good" },
      { key: "easy", value: n.easy, color: "#3b82f6", label: "Easy" }
    ]
  }));
  return /* @__PURE__ */ o.jsxs("div", { style: {
    padding: "16px",
    backgroundColor: "var(--orca-color-bg-2)",
    borderRadius: "8px"
  }, children: [
    /* @__PURE__ */ o.jsx("h3", { style: {
      margin: "0 0 12px 0",
      fontSize: "15px",
      fontWeight: 600,
      color: "var(--orca-color-text-1)"
    }, children: "复习历史" }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      gap: "16px",
      marginBottom: "12px",
      fontSize: "13px",
      color: "var(--orca-color-text-2)"
    }, children: [
      /* @__PURE__ */ o.jsxs("span", { children: [
        "总复习: ",
        e.totalReviews,
        " 次"
      ] }),
      /* @__PURE__ */ o.jsxs("span", { children: [
        "日均: ",
        e.averagePerDay.toFixed(1),
        " 次"
      ] })
    ] }),
    /* @__PURE__ */ o.jsx(
      Ii,
      {
        data: r,
        width: 600,
        height: 200,
        showLabels: !0,
        showLegend: !0,
        legendItems: [
          { key: "again", label: "Again", color: "#ef4444" },
          { key: "hard", label: "Hard", color: "#f97316" },
          { key: "good", label: "Good", color: "#22c55e" },
          { key: "easy", label: "Easy", color: "#3b82f6" }
        ]
      }
    )
  ] });
}
function $f({ distribution: e, isLoading: t, onSliceClick: r }) {
  if (t)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "加载中..." });
  if (!e || e.total === 0)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "暂无卡片数据" });
  const n = [
    { key: "new", value: e.new, color: "#3b82f6", label: "新卡" },
    { key: "learning", value: e.learning, color: "#f97316", label: "学习中" },
    { key: "review", value: e.review, color: "#22c55e", label: "已掌握" },
    { key: "suspended", value: e.suspended, color: "#9ca3af", label: "暂停" }
  ].filter((a) => a.value > 0);
  return /* @__PURE__ */ o.jsxs("div", { style: {
    padding: "16px",
    backgroundColor: "var(--orca-color-bg-2)",
    borderRadius: "8px"
  }, children: [
    /* @__PURE__ */ o.jsx("h3", { style: {
      margin: "0 0 12px 0",
      fontSize: "15px",
      fontWeight: 600,
      color: "var(--orca-color-text-1)"
    }, children: "卡片状态分布" }),
    /* @__PURE__ */ o.jsx(
      Mi,
      {
        data: n,
        width: 300,
        height: 280,
        innerRadius: 50,
        showLegend: !0,
        showPercentage: !0,
        onSliceClick: r ? (a) => r(a.key) : void 0
      }
    )
  ] });
}
function Df({ stats: e, isLoading: t }) {
  if (t)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "加载中..." });
  if (!e || e.dailyTime.length === 0)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "暂无复习时间数据" });
  const r = e.dailyTime.map((n) => ({
    label: Oo(n.date),
    value: Math.round(n.time / 6e4)
    // 转换为分钟
  }));
  return /* @__PURE__ */ o.jsxs("div", { style: {
    padding: "16px",
    backgroundColor: "var(--orca-color-bg-2)",
    borderRadius: "8px"
  }, children: [
    /* @__PURE__ */ o.jsx("h3", { style: {
      margin: "0 0 12px 0",
      fontSize: "15px",
      fontWeight: 600,
      color: "var(--orca-color-text-1)"
    }, children: "复习时间统计" }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      gap: "16px",
      marginBottom: "12px",
      fontSize: "13px",
      color: "var(--orca-color-text-2)"
    }, children: [
      /* @__PURE__ */ o.jsxs("span", { children: [
        "总时间: ",
        Kn(e.totalTime)
      ] }),
      /* @__PURE__ */ o.jsxs("span", { children: [
        "日均: ",
        Kn(e.averagePerDay)
      ] })
    ] }),
    /* @__PURE__ */ o.jsx(
      ba,
      {
        data: r,
        width: 600,
        height: 180,
        barColor: "var(--orca-color-primary-5)",
        showLabels: !0,
        formatValue: (n) => `${n}分钟`
      }
    )
  ] });
}
function Tf({ distribution: e, isLoading: t }) {
  if (t)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "加载中..." });
  if (!e || e.buckets.every((n) => n.count === 0))
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "暂无间隔数据" });
  const r = e.buckets.map((n) => ({
    label: n.label,
    value: n.count
  }));
  return /* @__PURE__ */ o.jsxs("div", { style: {
    padding: "16px",
    backgroundColor: "var(--orca-color-bg-2)",
    borderRadius: "8px"
  }, children: [
    /* @__PURE__ */ o.jsx("h3", { style: {
      margin: "0 0 12px 0",
      fontSize: "15px",
      fontWeight: 600,
      color: "var(--orca-color-text-1)"
    }, children: "卡片间隔分布" }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      gap: "16px",
      marginBottom: "12px",
      fontSize: "13px",
      color: "var(--orca-color-text-2)"
    }, children: [
      /* @__PURE__ */ o.jsxs("span", { children: [
        "平均间隔: ",
        e.averageInterval.toFixed(1),
        " 天"
      ] }),
      /* @__PURE__ */ o.jsxs("span", { children: [
        "最大间隔: ",
        e.maxInterval,
        " 天"
      ] })
    ] }),
    /* @__PURE__ */ o.jsx(
      ba,
      {
        data: r,
        width: 400,
        height: 180,
        barColor: "var(--orca-color-success-5)",
        showLabels: !0,
        formatValue: (n) => `${n}张`
      }
    )
  ] });
}
function Ef({ stats: e, isLoading: t }) {
  if (t)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "加载中..." });
  if (!e || e.total === 0)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "暂无答题数据" });
  const r = [
    { key: "again", value: e.again, color: "#ef4444", label: "Again" },
    { key: "hard", value: e.hard, color: "#f97316", label: "Hard" },
    { key: "good", value: e.good, color: "#22c55e", label: "Good" },
    { key: "easy", value: e.easy, color: "#3b82f6", label: "Easy" }
  ].filter((n) => n.value > 0);
  return /* @__PURE__ */ o.jsxs("div", { style: {
    padding: "16px",
    backgroundColor: "var(--orca-color-bg-2)",
    borderRadius: "8px"
  }, children: [
    /* @__PURE__ */ o.jsx("h3", { style: {
      margin: "0 0 12px 0",
      fontSize: "15px",
      fontWeight: 600,
      color: "var(--orca-color-text-1)"
    }, children: "答题按钮统计" }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      gap: "16px",
      marginBottom: "12px",
      fontSize: "13px",
      color: "var(--orca-color-text-2)"
    }, children: [
      /* @__PURE__ */ o.jsxs("span", { children: [
        "总答题: ",
        e.total,
        " 次"
      ] }),
      /* @__PURE__ */ o.jsxs("span", { children: [
        "正确率: ",
        (e.correctRate * 100).toFixed(1),
        "%"
      ] })
    ] }),
    /* @__PURE__ */ o.jsx(
      Mi,
      {
        data: r,
        width: 300,
        height: 250,
        innerRadius: 0,
        showLegend: !0,
        showPercentage: !0
      }
    )
  ] });
}
function _f({ distribution: e, isLoading: t }) {
  if (t)
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "加载中..." });
  if (!e || e.buckets.every((n) => n.count === 0))
    return /* @__PURE__ */ o.jsx("div", { style: {
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      textAlign: "center",
      color: "var(--orca-color-text-3)"
    }, children: "暂无难度数据" });
  const r = e.buckets.map((n) => ({
    label: n.label,
    value: n.count
  }));
  return /* @__PURE__ */ o.jsxs("div", { style: {
    padding: "16px",
    backgroundColor: "var(--orca-color-bg-2)",
    borderRadius: "8px"
  }, children: [
    /* @__PURE__ */ o.jsx("h3", { style: {
      margin: "0 0 12px 0",
      fontSize: "15px",
      fontWeight: 600,
      color: "var(--orca-color-text-1)"
    }, children: "卡片难度分布" }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      gap: "16px",
      marginBottom: "12px",
      fontSize: "13px",
      color: "var(--orca-color-text-2)"
    }, children: [
      /* @__PURE__ */ o.jsxs("span", { children: [
        "平均难度: ",
        e.averageDifficulty.toFixed(2)
      ] }),
      /* @__PURE__ */ o.jsxs("span", { children: [
        "范围: ",
        e.minDifficulty.toFixed(1),
        " - ",
        e.maxDifficulty.toFixed(1)
      ] })
    ] }),
    /* @__PURE__ */ o.jsx(
      ba,
      {
        data: r,
        width: 400,
        height: 180,
        barColor: "var(--orca-color-warning-5)",
        showLabels: !0,
        formatValue: (n) => `${n}张`
      }
    )
  ] });
}
function zf({ panelId: e, pluginName: t, onBack: r, decks: n }) {
  const [a, s] = Je("1month"), [i, c] = Je(void 0), [d, l] = Je(!0), [x, u] = Je(null), [f, p] = Je(null), [g, y] = Je(null), [v, h] = Je(null), [S, $] = Je(null), [k, C] = Je(null), [P, E] = Je(null), [O, j] = Je(null), [B, z] = Je(!1), M = wn(async (T = !1) => {
    l(!0), T && z(!0);
    try {
      const {
        getTodayStatistics: w,
        getFutureForecast: N,
        getReviewHistory: F,
        getCardStateDistribution: D,
        getReviewTimeStats: m,
        getIntervalDistribution: _,
        getAnswerButtonStats: G,
        getDifficultyDistribution: X,
        getStatisticsPreferences: pe,
        saveStatisticsPreferences: J,
        clearStatisticsCache: ae
      } = await Promise.resolve().then(() => $o);
      T && ae();
      const W = await pe(t);
      s(W.timeRange), W.selectedDeck && c(W.selectedDeck);
      const [
        q,
        Q,
        ie,
        I,
        ge,
        fe,
        Te,
        $e
      ] = await Promise.all([
        w(t, i),
        N(t, 30, i),
        F(t, a, i),
        D(t, i),
        m(t, a, i),
        _(t, i),
        G(t, a, i),
        X(t, i)
      ]);
      u(q), p(Q), y(ie), h(I), $(ge), C(fe), E(Te), j($e);
    } catch (w) {
      console.error(`[${t}] 加载统计数据失败:`, w);
    } finally {
      l(!1), z(!1);
    }
  }, [t, a, i]);
  bf(() => {
    M();
  }, [M]);
  const R = wn(async (T) => {
    s(T);
    try {
      const { saveTimeRangePreference: w } = await Promise.resolve().then(() => $o);
      await w(t, T);
    } catch (w) {
      console.error(`[${t}] 保存时间范围偏好失败:`, w);
    }
  }, [t]), A = wn(async (T) => {
    c(T);
    try {
      const { saveSelectedDeckPreference: w } = await Promise.resolve().then(() => $o);
      await w(t, T);
    } catch (w) {
      console.error(`[${t}] 保存牌组偏好失败:`, w);
    }
  }, [t]);
  return /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "16px",
    height: "100%",
    overflow: "auto"
  }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      flexWrap: "wrap"
    }, children: [
      /* @__PURE__ */ o.jsx(ls, { variant: "plain", onClick: r, style: { fontSize: "13px", padding: "6px 12px" }, children: "← 返回" }),
      /* @__PURE__ */ o.jsx("div", { style: {
        fontSize: "16px",
        fontWeight: 600,
        color: "var(--orca-color-text-1)",
        flex: 1
      }, children: "学习统计" }),
      /* @__PURE__ */ o.jsxs(
        ls,
        {
          variant: "plain",
          onClick: () => !B && void M(!0),
          style: {
            fontSize: "13px",
            padding: "6px 12px",
            opacity: B ? 0.6 : 1,
            cursor: B ? "not-allowed" : "pointer"
          },
          title: "刷新数据（清除缓存）",
          children: [
            /* @__PURE__ */ o.jsx(
              "i",
              {
                className: `ti ti-refresh ${B ? "srs-refresh-spinning" : ""}`,
                style: { marginRight: "4px" }
              }
            ),
            B ? "刷新中..." : "刷新"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: "16px",
      flexWrap: "wrap",
      padding: "12px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px"
    }, children: [
      /* @__PURE__ */ o.jsx(Sf, { value: a, onChange: R }),
      /* @__PURE__ */ o.jsx("div", { style: { width: "1px", height: "24px", backgroundColor: "var(--orca-color-border-1)" } }),
      /* @__PURE__ */ o.jsx(Cf, { decks: n, selectedDeck: i, onChange: A })
    ] }),
    /* @__PURE__ */ o.jsx(kf, { stats: x, isLoading: d }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
      gap: "16px"
    }, children: [
      /* @__PURE__ */ o.jsx($f, { distribution: v, isLoading: d }),
      /* @__PURE__ */ o.jsx(Ef, { stats: P, isLoading: d })
    ] }),
    /* @__PURE__ */ o.jsx(jf, { forecast: f, isLoading: d }),
    /* @__PURE__ */ o.jsx(Rf, { history: g, isLoading: d }),
    /* @__PURE__ */ o.jsx(Df, { stats: S, isLoading: d }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))",
      gap: "16px"
    }, children: [
      /* @__PURE__ */ o.jsx(Tf, { distribution: k, isLoading: d }),
      /* @__PURE__ */ o.jsx(_f, { distribution: O, isLoading: d })
    ] })
  ] });
}
const { useState: Sn, useEffect: If, useCallback: Cn, useMemo: ds } = window.React, { Button: us } = orca.components;
function Mf(e) {
  switch (e) {
    case "high_again_rate":
      return "频繁遗忘";
    case "high_lapses":
      return "遗忘次数多";
    case "high_difficulty":
      return "难度较高";
    case "multiple":
      return "多重困难";
  }
}
function fs(e) {
  switch (e) {
    case "high_again_rate":
      return "#ef4444";
    case "high_lapses":
      return "#f59e0b";
    case "high_difficulty":
      return "#8b5cf6";
    case "multiple":
      return "#dc2626";
  }
}
function Bf(e) {
  switch (e) {
    case "high_again_rate":
      return "ti-alert-triangle";
    case "high_lapses":
      return "ti-repeat";
    case "high_difficulty":
      return "ti-flame";
    case "multiple":
      return "ti-alert-octagon";
  }
}
function Af({ info: e, panelId: t, onCardClick: r }) {
  const { card: n, reason: a, recentAgainCount: s, totalLapses: i, difficulty: c } = e, d = () => {
    r(n.id);
  };
  return /* @__PURE__ */ o.jsxs(
    "div",
    {
      style: {
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-1)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        cursor: "pointer",
        transition: "all 0.2s ease"
      },
      onClick: d,
      onMouseEnter: (l) => {
        l.currentTarget.style.backgroundColor = "var(--orca-color-bg-2)", l.currentTarget.style.borderColor = "var(--orca-color-primary-4)";
      },
      onMouseLeave: (l) => {
        l.currentTarget.style.backgroundColor = "var(--orca-color-bg-1)", l.currentTarget.style.borderColor = "var(--orca-color-border-1)";
      },
      children: [
        /* @__PURE__ */ o.jsxs("div", { style: {
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }, children: [
          /* @__PURE__ */ o.jsxs("span", { style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "4px",
            padding: "2px 8px",
            borderRadius: "12px",
            fontSize: "12px",
            fontWeight: 500,
            backgroundColor: `${fs(a)}20`,
            color: fs(a)
          }, children: [
            /* @__PURE__ */ o.jsx("i", { className: `ti ${Bf(a)}`, style: { fontSize: "12px" } }),
            Mf(a)
          ] }),
          /* @__PURE__ */ o.jsx("span", { style: {
            fontSize: "12px",
            color: "var(--orca-color-text-3)"
          }, children: n.deck })
        ] }),
        /* @__PURE__ */ o.jsx("div", { style: { minHeight: "24px" }, children: /* @__PURE__ */ o.jsx(va, { blockId: n.id, panelId: t }) }),
        /* @__PURE__ */ o.jsxs("div", { style: {
          display: "flex",
          gap: "16px",
          fontSize: "12px",
          color: "var(--orca-color-text-3)",
          borderTop: "1px solid var(--orca-color-border-1)",
          paddingTop: "8px"
        }, children: [
          /* @__PURE__ */ o.jsxs("span", { title: "最近10次复习中的Again次数", children: [
            /* @__PURE__ */ o.jsx("i", { className: "ti ti-x", style: { marginRight: "2px" } }),
            "Again: ",
            s
          ] }),
          /* @__PURE__ */ o.jsxs("span", { title: "总遗忘次数", children: [
            /* @__PURE__ */ o.jsx("i", { className: "ti ti-repeat", style: { marginRight: "2px" } }),
            "遗忘: ",
            i
          ] }),
          /* @__PURE__ */ o.jsxs("span", { title: "难度值 (1-10)", children: [
            /* @__PURE__ */ o.jsx("i", { className: "ti ti-flame", style: { marginRight: "2px" } }),
            "难度: ",
            c.toFixed(1)
          ] }),
          n.clozeNumber && /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-primary-5)" }, children: [
            "填空 c",
            n.clozeNumber
          ] }),
          n.directionType && /* @__PURE__ */ o.jsx("span", { style: { color: n.directionType === "forward" ? "var(--orca-color-primary-5)" : "var(--orca-color-warning-5)" }, children: n.directionType === "forward" ? "正向" : "反向" })
        ] })
      ]
    }
  );
}
function Pf({
  panelId: e,
  pluginName: t,
  onBack: r,
  onStartReview: n
}) {
  const [a, s] = Sn([]), [i, c] = Sn(!0), [d, l] = Sn("all"), x = Cn(async () => {
    c(!0);
    try {
      const { getDifficultCards: y } = await Promise.resolve().then(() => Fg), v = await y(t);
      s(v);
    } catch (y) {
      console.error(`[${t}] 加载困难卡片失败:`, y), orca.notify("error", "加载困难卡片失败", { title: "SRS" });
    } finally {
      c(!1);
    }
  }, [t]);
  If(() => {
    x();
  }, [x]);
  const u = ds(() => d === "all" ? a : a.filter((y) => d === "high_again_rate" ? y.reason === "high_again_rate" || y.reason === "multiple" : d === "high_lapses" ? y.reason === "high_lapses" || y.reason === "multiple" : d === "high_difficulty" ? y.reason === "high_difficulty" || y.reason === "multiple" : !0), [a, d]), f = ds(() => {
    const y = {
      all: a.length,
      high_again_rate: 0,
      high_lapses: 0,
      high_difficulty: 0
    };
    for (const v of a)
      (v.reason === "high_again_rate" || v.reason === "multiple") && y.high_again_rate++, (v.reason === "high_lapses" || v.reason === "multiple") && y.high_lapses++, (v.reason === "high_difficulty" || v.reason === "multiple") && y.high_difficulty++;
    return y;
  }, [a]), p = Cn(() => {
    const y = u.map((v) => v.card);
    if (y.length === 0) {
      orca.notify("info", "没有困难卡片需要复习", { title: "SRS" });
      return;
    }
    n(y);
  }, [u, n]), g = Cn((y) => {
    orca.nav.openInLastPanel("block", { blockId: y });
  }, []);
  return i ? /* @__PURE__ */ o.jsx("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "200px",
    color: "var(--orca-color-text-2)"
  }, children: "加载中..." }) : /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "16px" }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: "12px"
    }, children: [
      /* @__PURE__ */ o.jsx(us, { variant: "plain", onClick: r, style: { fontSize: "13px", padding: "6px 12px" }, children: "← 返回" }),
      /* @__PURE__ */ o.jsxs("div", { style: {
        fontSize: "16px",
        fontWeight: 600,
        color: "var(--orca-color-text-1)",
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: "8px"
      }, children: [
        /* @__PURE__ */ o.jsx("i", { className: "ti ti-alert-triangle", style: { color: "#ef4444" } }),
        "困难卡片",
        /* @__PURE__ */ o.jsxs("span", { style: {
          fontSize: "14px",
          fontWeight: 400,
          color: "var(--orca-color-text-3)"
        }, children: [
          "(",
          a.length,
          ")"
        ] })
      ] }),
      u.length > 0 && /* @__PURE__ */ o.jsx(
        us,
        {
          variant: "solid",
          onClick: p,
          style: { fontSize: "13px", padding: "6px 12px" },
          children: "复习困难卡片"
        }
      )
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      padding: "12px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      fontSize: "13px",
      color: "var(--orca-color-text-2)",
      lineHeight: 1.6
    }, children: [
      /* @__PURE__ */ o.jsx("p", { style: { margin: 0 }, children: "困难卡片是指经常遗忘或难度较高的卡片。系统会自动识别以下类型：" }),
      /* @__PURE__ */ o.jsxs("ul", { style: { margin: "8px 0 0 0", paddingLeft: "20px" }, children: [
        /* @__PURE__ */ o.jsxs("li", { children: [
          /* @__PURE__ */ o.jsx("span", { style: { color: "#ef4444" }, children: "频繁遗忘" }),
          "：最近10次复习中按了3次以上 Again"
        ] }),
        /* @__PURE__ */ o.jsxs("li", { children: [
          /* @__PURE__ */ o.jsx("span", { style: { color: "#f59e0b" }, children: "遗忘次数多" }),
          "：总遗忘次数达到3次以上"
        ] }),
        /* @__PURE__ */ o.jsxs("li", { children: [
          /* @__PURE__ */ o.jsx("span", { style: { color: "#8b5cf6" }, children: "难度较高" }),
          "：难度值达到7以上"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ o.jsx("div", { style: {
      display: "flex",
      gap: "8px",
      flexWrap: "wrap"
    }, children: [
      { key: "all", label: "全部", color: "var(--orca-color-text-2)" },
      { key: "high_again_rate", label: "频繁遗忘", color: "#ef4444" },
      { key: "high_lapses", label: "遗忘次数多", color: "#f59e0b" },
      { key: "high_difficulty", label: "难度较高", color: "#8b5cf6" }
    ].map((y) => /* @__PURE__ */ o.jsxs(
      "button",
      {
        onClick: () => l(y.key),
        style: {
          padding: "6px 12px",
          borderRadius: "16px",
          border: "1px solid",
          borderColor: d === y.key ? y.color : "var(--orca-color-border-1)",
          backgroundColor: d === y.key ? `${y.color}15` : "transparent",
          color: d === y.key ? y.color : "var(--orca-color-text-2)",
          fontSize: "13px",
          cursor: "pointer",
          transition: "all 0.2s ease"
        },
        children: [
          y.label,
          " (",
          f[y.key],
          ")"
        ]
      },
      y.key
    )) }),
    /* @__PURE__ */ o.jsx("div", { style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    }, children: u.length === 0 ? /* @__PURE__ */ o.jsxs("div", { style: {
      textAlign: "center",
      padding: "48px 24px",
      color: "var(--orca-color-text-3)"
    }, children: [
      /* @__PURE__ */ o.jsx("i", { className: "ti ti-mood-smile", style: { fontSize: "48px", opacity: 0.5, display: "block", marginBottom: "12px" } }),
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "15px", marginBottom: "8px" }, children: d === "all" ? "太棒了！没有困难卡片" : "没有符合条件的困难卡片" }),
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "13px", opacity: 0.7 }, children: "继续保持良好的复习习惯" })
    ] }) : u.map((y, v) => /* @__PURE__ */ o.jsx(
      Af,
      {
        info: y,
        panelId: e,
        onCardClick: g
      },
      `${y.card.id}-${y.card.clozeNumber || 0}-${y.card.directionType || "basic"}-${y.card.listItemId || 0}-${v}`
    )) })
  ] });
}
const { useMemo: Tt } = window.React, { Button: Lf } = orca.components;
function Of() {
  const e = (/* @__PURE__ */ new Date()).getHours();
  return e < 6 ? "夜深了" : e < 12 ? "早上好" : e < 14 ? "中午好" : e < 18 ? "下午好" : e < 22 ? "晚上好" : "夜深了";
}
function Ff(e, t) {
  return e === 0 && t === 0 ? "今天的学习任务已完成！" : e > 50 ? "有不少卡片等待复习，加油！" : e > 0 ? "开始今天的学习吧" : "探索新知识的时候到了";
}
function Wf({ dueCards: e, newCards: t, reviewHistory: r, onStartReview: n }) {
  const a = Of(), s = Ff(e, t), i = e + t, c = Tt(() => !r || r.days.length === 0 ? 0 : (r.days.slice(-7).reduce((f, p) => f + p.total, 0) / 7).toFixed(1), [r]), d = Tt(() => {
    const x = ["六", "日", "一", "二", "三", "四", "五"], u = /* @__PURE__ */ new Date(), f = [];
    for (let p = 6; p >= 0; p--) {
      const g = new Date(u);
      g.setDate(g.getDate() - p);
      const y = g.getDay();
      let v = 0;
      if (r) {
        const h = r.days.find((S) => new Date(S.date).toDateString() === g.toDateString());
        h && (v = h.total);
      }
      f.push({
        day: x[y],
        count: v,
        isToday: p === 0
      });
    }
    return f;
  }, [r]), l = Math.max(...d.map((x) => x.count), 1);
  return /* @__PURE__ */ o.jsxs("div", { style: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "16px"
  }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: {
      padding: "20px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "12px",
      border: "1px solid var(--orca-color-border-1)",
      userSelect: "none"
    }, children: [
      /* @__PURE__ */ o.jsx("h2", { style: {
        margin: "0 0 4px 0",
        fontSize: "20px",
        fontWeight: 600,
        color: "var(--orca-color-text-1)"
      }, children: a }),
      /* @__PURE__ */ o.jsx("p", { style: {
        margin: "0 0 20px 0",
        fontSize: "14px",
        color: "var(--orca-color-text-3)"
      }, children: s }),
      /* @__PURE__ */ o.jsx("div", { style: {
        display: "flex",
        alignItems: "flex-end",
        gap: "8px",
        height: "80px",
        marginBottom: "12px"
      }, children: d.map((x, u) => /* @__PURE__ */ o.jsxs("div", { style: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px"
      }, children: [
        /* @__PURE__ */ o.jsx("div", { style: {
          width: "100%",
          height: `${Math.max(x.count / l * 60, 4)}px`,
          backgroundColor: x.isToday ? "#6366f1" : "var(--orca-color-primary-3)",
          borderRadius: "4px 4px 0 0",
          transition: "height 0.3s ease"
        } }),
        /* @__PURE__ */ o.jsx("span", { style: {
          fontSize: "11px",
          color: x.isToday ? "#6366f1" : "var(--orca-color-text-3)"
        }, children: x.day })
      ] }, u)) }),
      /* @__PURE__ */ o.jsxs("div", { style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: "12px",
        borderTop: "1px solid var(--orca-color-border-1)"
      }, children: [
        /* @__PURE__ */ o.jsxs("div", { children: [
          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", color: "#6366f1" }, children: "日均复习" }),
          /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "18px", fontWeight: 600, color: "#6366f1" }, children: [
            c,
            " ",
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", fontWeight: 400 }, children: "张" })
          ] }),
          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "11px", color: "var(--orca-color-text-3)" }, children: "最近 7 天" })
        ] }),
        /* @__PURE__ */ o.jsxs("div", { style: { textAlign: "right" }, children: [
          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", color: "var(--orca-color-text-3)" }, children: "🎯 今日目标:" }),
          /* @__PURE__ */ o.jsxs("span", { style: { fontSize: "12px", color: "var(--orca-color-text-2)", marginLeft: "4px" }, children: [
            i,
            " 张卡片"
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ o.jsx(
      Hf,
      {
        reviewHistory: r,
        onStartReview: n,
        dueCards: e
      }
    )
  ] });
}
function Hf({ reviewHistory: e, onStartReview: t, dueCards: r }) {
  const n = Tt(() => {
    if (!e)
      return { timeStudied: 0, cardsStudied: 0, again: 0, hard: 0, good: 0, easy: 0 };
    const i = e.days.slice(-7), c = i.reduce((f, p) => f + p.total, 0), d = i.reduce((f, p) => f + p.again, 0), l = i.reduce((f, p) => f + p.hard, 0), x = i.reduce((f, p) => f + p.good, 0), u = i.reduce((f, p) => f + p.easy, 0);
    return { timeStudied: 0, cardsStudied: c, again: d, hard: l, good: x, easy: u };
  }, [e]), a = n.again + n.hard + n.good + n.easy, s = (i) => a > 0 ? Math.round(i / a * 100) : 0;
  return /* @__PURE__ */ o.jsxs("div", { style: {
    padding: "20px",
    backgroundColor: "var(--orca-color-bg-2)",
    borderRadius: "12px",
    border: "1px solid var(--orca-color-border-1)",
    userSelect: "none"
  }, children: [
    /* @__PURE__ */ o.jsx("h3", { style: {
      margin: "0 0 16px 0",
      fontSize: "16px",
      fontWeight: 600,
      color: "var(--orca-color-text-1)"
    }, children: "本周摘要" }),
    /* @__PURE__ */ o.jsx("div", { style: {
      display: "flex",
      gap: "24px",
      marginBottom: "16px"
    }, children: /* @__PURE__ */ o.jsxs("div", { children: [
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "11px", color: "var(--orca-color-text-3)" }, children: "已复习卡片" }),
      /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "24px", fontWeight: 600, color: "var(--orca-color-text-1)" }, children: [
        n.cardsStudied,
        " ",
        /* @__PURE__ */ o.jsx("span", { style: { fontSize: "14px", fontWeight: 400 }, children: "张" })
      ] })
    ] }) }),
    /* @__PURE__ */ o.jsxs("div", { style: { marginBottom: "16px" }, children: [
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "12px", color: "var(--orca-color-text-2)", marginBottom: "8px" }, children: "复习表现分布" }),
      /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [
        /* @__PURE__ */ o.jsx(bo, { icon: "❌", label: "忘记了", percent: s(n.again), color: "#ef4444" }),
        /* @__PURE__ */ o.jsx(bo, { icon: "😐", label: "有点难", percent: s(n.hard), color: "#f97316" }),
        /* @__PURE__ */ o.jsx(bo, { icon: "😊", label: "想起来了", percent: s(n.good), color: "#22c55e" }),
        /* @__PURE__ */ o.jsx(bo, { icon: "🎉", label: "很简单", percent: s(n.easy), color: "#3b82f6" })
      ] })
    ] }),
    r > 0 && /* @__PURE__ */ o.jsxs(
      Lf,
      {
        variant: "solid",
        onClick: t,
        style: {
          width: "100%",
          padding: "10px",
          fontSize: "14px",
          backgroundColor: "#6366f1",
          borderRadius: "8px"
        },
        children: [
          "开始今日复习 · ",
          r,
          " 张"
        ]
      }
    )
  ] });
}
function bo({ icon: e, label: t, percent: r, color: n }) {
  return /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: "8px"
  }, children: [
    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "14px" }, children: e }),
    /* @__PURE__ */ o.jsx("span", { style: { fontSize: "13px", color: "var(--orca-color-text-2)", flex: 1 }, children: t }),
    /* @__PURE__ */ o.jsx("div", { style: {
      width: "80px",
      height: "6px",
      backgroundColor: "var(--orca-color-bg-3)",
      borderRadius: "3px",
      overflow: "hidden"
    }, children: /* @__PURE__ */ o.jsx("div", { style: {
      width: `${r}%`,
      height: "100%",
      backgroundColor: n,
      borderRadius: "3px",
      transition: "width 0.3s ease"
    } }) }),
    /* @__PURE__ */ o.jsxs("span", { style: { fontSize: "12px", color: "var(--orca-color-text-3)", width: "40px", textAlign: "right" }, children: [
      r,
      "%"
    ] })
  ] });
}
function Nf({ reviewHistory: e }) {
  const t = Tt(() => {
    const s = /* @__PURE__ */ new Date(), i = new Date(s);
    i.setMonth(i.getMonth() - 6), i.setDate(1);
    const c = /* @__PURE__ */ new Map();
    if (e)
      for (const f of e.days) {
        const p = new Date(f.date).toDateString();
        c.set(p, f.total);
      }
    const d = [];
    let l = [];
    const x = new Date(i), u = x.getDay();
    for (let f = 0; f < u; f++)
      l.push({ date: /* @__PURE__ */ new Date(0), count: -1, level: 0 });
    for (; x <= s; ) {
      const f = c.get(x.toDateString()) || 0;
      let p = 0;
      f > 0 && (p = 1), f >= 10 && (p = 2), f >= 20 && (p = 3), f >= 30 && (p = 4), l.push({
        date: new Date(x),
        count: f,
        level: p
      }), l.length === 7 && (d.push(l), l = []), x.setDate(x.getDate() + 1);
    }
    return l.length > 0 && d.push(l), d;
  }, [e]), r = Tt(() => {
    let s = 0, i = 0, c = 0;
    const d = t.flat().filter((l) => l.count >= 0);
    for (let l = 0; l < d.length; l++)
      d[l].count > 0 ? (s++, c++, c > i && (i = c)) : c = 0;
    return { daysStudied: s, bestStreak: i };
  }, [t]), n = Tt(() => {
    const s = [];
    let i = -1;
    return t.forEach((c, d) => {
      const l = c.find((x) => x.count >= 0);
      if (l && l.date.getMonth() !== i) {
        i = l.date.getMonth();
        const x = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
        s.push({ month: x[i], weekIndex: d });
      }
    }), s;
  }, [t]), a = [
    "#ebedf0",
    // 0: 无 - 浅灰色
    "#c6e48b",
    // 1: 少
    "#7bc96f",
    // 2: 中
    "#239a3b",
    // 3: 多
    "#196127"
    // 4: 很多
  ];
  return /* @__PURE__ */ o.jsxs("div", { style: {
    padding: "20px",
    backgroundColor: "var(--orca-color-bg-2)",
    borderRadius: "12px",
    border: "1px solid var(--orca-color-border-1)",
    userSelect: "none"
  }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "16px"
    }, children: [
      /* @__PURE__ */ o.jsx("h3", { style: {
        margin: 0,
        fontSize: "16px",
        fontWeight: 600,
        color: "var(--orca-color-text-1)"
      }, children: "学习历史" }),
      /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "24px" }, children: [
        /* @__PURE__ */ o.jsxs("div", { style: { textAlign: "center" }, children: [
          /* @__PURE__ */ o.jsx("div", { style: { fontSize: "11px", color: "var(--orca-color-text-3)" }, children: "学习天数" }),
          /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "18px", fontWeight: 600, color: "var(--orca-color-text-1)" }, children: [
            r.daysStudied,
            " ",
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", fontWeight: 400 }, children: "天" })
          ] })
        ] }),
        /* @__PURE__ */ o.jsxs("div", { style: { textAlign: "center" }, children: [
          /* @__PURE__ */ o.jsx("div", { style: { fontSize: "11px", color: "var(--orca-color-text-3)" }, children: "最长连续" }),
          /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "18px", fontWeight: 600, color: "var(--orca-color-text-1)" }, children: [
            r.bestStreak,
            " ",
            /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", fontWeight: 400 }, children: "天" })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: { overflowX: "auto" }, children: [
      /* @__PURE__ */ o.jsx("div", { style: {
        display: "flex",
        marginLeft: "20px",
        marginBottom: "4px"
      }, children: n.map((s, i) => {
        var c;
        return /* @__PURE__ */ o.jsx(
          "span",
          {
            style: {
              fontSize: "11px",
              color: "var(--orca-color-text-3)",
              width: `${(((c = n[i + 1]) == null ? void 0 : c.weekIndex) || t.length) - s.weekIndex}2px`,
              minWidth: "36px"
            },
            children: s.month
          },
          i
        );
      }) }),
      /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "2px" }, children: [
        /* @__PURE__ */ o.jsx("div", { style: {
          display: "flex",
          flexDirection: "column",
          gap: "2px",
          marginRight: "4px"
        }, children: ["一", "", "三", "", "五", "", "日"].map((s, i) => /* @__PURE__ */ o.jsx(
          "div",
          {
            style: {
              width: "12px",
              height: "10px",
              fontSize: "9px",
              color: "var(--orca-color-text-3)",
              display: "flex",
              alignItems: "center"
            },
            children: s
          },
          i
        )) }),
        t.map((s, i) => /* @__PURE__ */ o.jsx(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "2px"
            },
            children: s.map((c, d) => /* @__PURE__ */ o.jsx(
              "div",
              {
                style: {
                  width: "10px",
                  height: "10px",
                  backgroundColor: c.count < 0 ? "transparent" : a[c.level],
                  borderRadius: "2px"
                },
                title: c.count >= 0 ? `${c.date.toLocaleDateString()}: ${c.count} 次复习` : ""
              },
              d
            ))
          },
          i
        ))
      ] })
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "4px",
      marginTop: "12px",
      fontSize: "11px",
      color: "var(--orca-color-text-3)"
    }, children: [
      /* @__PURE__ */ o.jsx("span", { children: "无" }),
      a.map((s, i) => /* @__PURE__ */ o.jsx(
        "div",
        {
          style: {
            width: "10px",
            height: "10px",
            backgroundColor: s,
            borderRadius: "2px"
          }
        },
        i
      )),
      /* @__PURE__ */ o.jsx("span", { children: "多" })
    ] })
  ] });
}
function Yf({ forecast: e }) {
  const t = Tt(() => e ? e.days.slice(0, 30).map((a) => ({
    date: a.date,
    count: a.reviewDue + a.newAvailable
  })) : [], [e]), r = Tt(() => t.length === 0 ? 0 : t.reduce((a, s) => a + s.count, 0), [t]), n = Math.max(...t.map((a) => a.count), 1);
  return !e || t.length === 0 ? null : /* @__PURE__ */ o.jsxs("div", { style: {
    padding: "20px",
    backgroundColor: "var(--orca-color-bg-2)",
    borderRadius: "12px",
    border: "1px solid var(--orca-color-border-1)",
    userSelect: "none"
  }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "16px"
    }, children: [
      /* @__PURE__ */ o.jsx("h3", { style: {
        margin: 0,
        fontSize: "16px",
        fontWeight: 600,
        color: "var(--orca-color-text-1)"
      }, children: "未来 30 天到期预测" }),
      /* @__PURE__ */ o.jsxs("div", { style: { textAlign: "right" }, children: [
        /* @__PURE__ */ o.jsx("div", { style: { fontSize: "11px", color: "var(--orca-color-text-3)" }, children: "总计" }),
        /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "18px", fontWeight: 600, color: "var(--orca-color-text-1)" }, children: [
          r,
          " ",
          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "12px", fontWeight: 400 }, children: "张" })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ o.jsx("div", { style: {
      display: "flex",
      alignItems: "flex-end",
      gap: "3px",
      height: "80px"
    }, children: t.map((a, s) => /* @__PURE__ */ o.jsx(
      "div",
      {
        style: {
          flex: 1,
          height: `${Math.max(a.count / n * 100, a.count > 0 ? 8 : 2)}%`,
          backgroundColor: a.count > 0 ? "#22c55e" : "#e5e7eb",
          borderRadius: "2px 2px 0 0",
          minWidth: "6px"
        },
        title: `${a.date.getMonth() + 1}/${a.date.getDate()}: ${a.count} 张卡片`
      },
      s
    )) }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      justifyContent: "space-between",
      marginTop: "8px",
      fontSize: "11px",
      color: "var(--orca-color-text-3)"
    }, children: [
      /* @__PURE__ */ o.jsx("span", { children: "今天" }),
      /* @__PURE__ */ o.jsx("span", { children: "30 天后" })
    ] })
  ] });
}
function qf({
  reviewHistory: e,
  futureForecast: t,
  newCards: r,
  dueCards: n,
  onStartReview: a,
  isLoading: s
}) {
  return s ? /* @__PURE__ */ o.jsx("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "200px",
    color: "var(--orca-color-text-3)"
  }, children: "加载中..." }) : /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    gap: "16px"
  }, children: [
    /* @__PURE__ */ o.jsx(
      Wf,
      {
        dueCards: n,
        newCards: r,
        reviewHistory: e,
        onStartReview: a
      }
    ),
    /* @__PURE__ */ o.jsx(
      Nf,
      {
        reviewHistory: e
      }
    ),
    /* @__PURE__ */ o.jsx(Yf, { forecast: t })
  ] });
}
const Kf = window.React, { useState: ze, useEffect: Ut, useCallback: _e, useMemo: ur, useRef: Wr, Fragment: Qg } = Kf, { Button: we } = orca.components, Uf = [
  { key: "all", label: "全部" },
  { key: "overdue", label: "已到期" },
  { key: "today", label: "今天" },
  { key: "future", label: "未来" },
  { key: "new", label: "新卡" }
];
function ps({ text: e, query: t }) {
  if (!t.trim())
    return /* @__PURE__ */ o.jsx(o.Fragment, { children: e });
  const r = e.split(new RegExp(`(${t})`, "gi"));
  return /* @__PURE__ */ o.jsx(o.Fragment, { children: r.map(
    (n, a) => n.toLowerCase() === t.toLowerCase() ? /* @__PURE__ */ o.jsx("span", { style: {
      backgroundColor: "var(--orca-color-warning-2)",
      color: "var(--orca-color-warning-7)",
      fontWeight: 600,
      padding: "0 2px",
      borderRadius: "2px"
    }, children: n }, a) : /* @__PURE__ */ o.jsx("span", { children: n }, a)
  ) });
}
function kn({ label: e, value: t, color: r }) {
  return /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "var(--orca-color-bg-2)",
    borderRadius: "8px",
    minWidth: "80px"
  }, children: [
    /* @__PURE__ */ o.jsx("div", { style: {
      fontSize: "24px",
      fontWeight: 600,
      color: r || "var(--orca-color-text-1)"
    }, children: t }),
    /* @__PURE__ */ o.jsx("div", { style: {
      fontSize: "12px",
      color: "var(--orca-color-text-3)",
      marginTop: "4px"
    }, children: e })
  ] });
}
function Vf({ card: e, panelId: t, onCardClick: r, onCardReset: n, onCardDelete: a }) {
  const s = (f) => {
    const p = /* @__PURE__ */ new Date(), g = new Date(p.getFullYear(), p.getMonth(), p.getDate()), y = new Date(g);
    return y.setDate(y.getDate() + 1), f < g ? `已到期 ${Math.floor((g.getTime() - f.getTime()) / 864e5)} 天` : f < y ? "今天到期" : `${Math.floor((f.getTime() - g.getTime()) / 864e5)} 天后到期`;
  }, i = (f) => {
    const p = f.getMonth() + 1, g = f.getDate();
    return `${p}月${g}日`;
  }, c = (f) => f < 1 ? "< 1天" : f < 30 ? `${Math.round(f)}天` : f < 365 ? `${Math.round(f / 30)}月` : `${(f / 365).toFixed(1)}年`, d = (f) => {
    f.stopPropagation(), r(e.id);
  }, l = (f) => {
    f.stopPropagation(), n(e);
  }, x = (f) => {
    f.stopPropagation(), a(e);
  }, u = e.srs.resets ?? 0;
  return /* @__PURE__ */ o.jsxs(
    "div",
    {
      style: {
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-1)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        transition: "all 0.2s ease"
      },
      children: [
        /* @__PURE__ */ o.jsx("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)" }, children: /* @__PURE__ */ o.jsx(orca.components.BlockBreadcrumb, { blockId: e.id }) }),
        /* @__PURE__ */ o.jsx("div", { style: { minHeight: "24px" }, children: /* @__PURE__ */ o.jsx(va, { blockId: e.id, panelId: t, cardType: e.cardType }) }),
        /* @__PURE__ */ o.jsxs("div", { style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "12px",
          color: "var(--orca-color-text-3)",
          borderTop: "1px solid var(--orca-color-border-1)",
          paddingTop: "8px"
        }, children: [
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "12px", flex: 1, flexWrap: "wrap" }, children: [
            e.isNew ? /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-primary-6)" }, children: "未学习" }) : /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
              /* @__PURE__ */ o.jsx("span", { style: {
                color: (() => {
                  const f = /* @__PURE__ */ new Date(), p = new Date(f.getFullYear(), f.getMonth(), f.getDate()), g = new Date(p);
                  return g.setDate(g.getDate() + 1), e.srs.due < p ? "var(--orca-color-success-6)" : e.srs.due < g ? "var(--orca-color-danger-6)" : "var(--orca-color-text-2)";
                })()
              }, children: s(e.srs.due) }),
              /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-text-2)" }, children: [
                "下次: ",
                i(e.srs.due)
              ] }),
              /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-text-2)" }, children: [
                "间隔: ",
                c(e.srs.interval)
              ] })
            ] }),
            e.clozeNumber && /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-primary-5)" }, children: [
              "填空 c",
              e.clozeNumber
            ] }),
            e.directionType && /* @__PURE__ */ o.jsx("span", { style: { color: e.directionType === "forward" ? "var(--orca-color-primary-5)" : "var(--orca-color-warning-5)" }, children: e.directionType === "forward" ? "正向" : "反向" }),
            u > 0 && /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-warning-6)" }, children: [
              "重置 ",
              u,
              " 次"
            ] })
          ] }),
          /* @__PURE__ */ o.jsxs(
            we,
            {
              variant: "plain",
              onClick: x,
              style: {
                fontSize: "12px",
                padding: "4px 8px",
                minWidth: "auto",
                color: "var(--orca-color-danger-6)"
              },
              title: "删除卡片（移除 Card 标记和 SRS 数据）",
              children: [
                /* @__PURE__ */ o.jsx("i", { className: "ti ti-trash", style: { marginRight: "4px" } }),
                "删除"
              ]
            }
          ),
          /* @__PURE__ */ o.jsxs(
            we,
            {
              variant: "plain",
              onClick: l,
              style: {
                fontSize: "12px",
                padding: "4px 8px",
                minWidth: "auto",
                color: "var(--orca-color-warning-6)"
              },
              title: "重置卡片为新卡状态",
              children: [
                /* @__PURE__ */ o.jsx("i", { className: "ti ti-refresh", style: { marginRight: "4px" } }),
                "重置"
              ]
            }
          ),
          /* @__PURE__ */ o.jsxs(
            we,
            {
              variant: "plain",
              onClick: d,
              style: {
                fontSize: "12px",
                padding: "4px 8px",
                minWidth: "auto"
              },
              title: "在右侧面板打开编辑",
              children: [
                /* @__PURE__ */ o.jsx("i", { className: "ti ti-external-link", style: { marginRight: "4px" } }),
                "跳转"
              ]
            }
          )
        ] })
      ]
    }
  );
}
function Gf({ deck: e, pluginName: t, searchQuery: r = "", onViewDeck: n, onReviewDeck: a, onNoteChange: s, onToggleCollapse: i, collapsedDecks: c, isChildDeck: d, getDeckLevel: l }) {
  const [x, u] = ze(!1), [f, p] = ze(e.note || ""), g = e.overdueCount + e.todayCount, y = l(e.name), v = d(e.name), h = c.has(e.name), S = () => {
    n(e.name);
  }, $ = (j) => {
    j.stopPropagation(), (g > 0 || e.newCount > 0) && a(e.name);
  }, k = (j) => {
    j.stopPropagation(), u(!0);
  }, C = async (j) => {
    j.stopPropagation();
    try {
      const { setDeckNote: B } = await Promise.resolve().then(() => Qn);
      await B(t, e.name, f), s(e.name, f), u(!1);
    } catch (B) {
      console.error(`[${t}] 保存卡组备注失败:`, B), orca.notify("error", "保存备注失败", { title: "SRS" });
    }
  }, P = (j) => {
    j.stopPropagation(), p(e.note || ""), u(!1);
  }, E = (j) => {
    p(j.target.value);
  }, O = (j) => {
    j.stopPropagation(), v && i(e.name);
  };
  return /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column" }, children: [
    /* @__PURE__ */ o.jsxs(
      "div",
      {
        onClick: S,
        style: {
          display: "flex",
          alignItems: "center",
          padding: "10px 12px",
          backgroundColor: "var(--orca-color-bg-1)",
          borderRadius: "6px",
          cursor: "pointer",
          transition: "background-color 0.15s ease"
        },
        onMouseEnter: (j) => {
          j.currentTarget.style.backgroundColor = "var(--orca-color-bg-2)";
        },
        onMouseLeave: (j) => {
          j.currentTarget.style.backgroundColor = "var(--orca-color-bg-1)";
        },
        children: [
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", alignItems: "center", marginRight: "8px" }, children: [
            /* @__PURE__ */ o.jsx("div", { style: { display: "flex", alignItems: "center" }, children: Array.from({ length: y }).map((j, B) => /* @__PURE__ */ o.jsx("div", { style: { width: "16px" } }, B)) }),
            v && /* @__PURE__ */ o.jsx(
              we,
              {
                variant: "plain",
                onClick: O,
                style: {
                  padding: "2px",
                  minWidth: "auto",
                  fontSize: "12px",
                  marginRight: "4px"
                },
                title: h ? "展开" : "折叠",
                children: /* @__PURE__ */ o.jsx("i", { className: h ? "ti ti-chevron-right" : "ti ti-chevron-down" })
              }
            ),
            !v && /* @__PURE__ */ o.jsx("div", { style: { width: "16px", marginRight: "4px" } })
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: {
            flex: 1,
            fontSize: "14px",
            color: "var(--orca-color-text-1)",
            fontWeight: 500
          }, children: [
            /* @__PURE__ */ o.jsx("div", { children: (() => {
              const j = e.name.split("::"), B = j[j.length - 1];
              return /* @__PURE__ */ o.jsx(ps, { text: B, query: r });
            })() }),
            e.note && !x && /* @__PURE__ */ o.jsx(
              "div",
              {
                style: {
                  fontSize: "12px",
                  color: "var(--orca-color-text-3)",
                  marginTop: "2px",
                  cursor: "pointer"
                },
                onClick: k,
                title: "点击编辑备注",
                children: /* @__PURE__ */ o.jsx(ps, { text: e.note, query: r })
              }
            )
          ] }),
          /* @__PURE__ */ o.jsx("div", { style: {
            width: "60px",
            textAlign: "center",
            fontSize: "14px",
            color: e.newCount > 0 ? "#3b82f6" : "#9ca3af"
          }, children: e.newCount }),
          /* @__PURE__ */ o.jsx("div", { style: {
            width: "60px",
            textAlign: "center",
            fontSize: "14px",
            color: e.todayCount > 0 ? "#ef4444" : "#9ca3af"
          }, children: e.todayCount }),
          /* @__PURE__ */ o.jsx("div", { style: {
            width: "60px",
            textAlign: "center",
            fontSize: "14px",
            color: e.overdueCount > 0 ? "#22c55e" : "#9ca3af"
          }, children: e.overdueCount }),
          /* @__PURE__ */ o.jsxs("div", { style: { width: "64px", textAlign: "center", display: "flex", gap: "4px" }, children: [
            /* @__PURE__ */ o.jsx(
              we,
              {
                variant: "plain",
                onClick: k,
                style: {
                  padding: "4px",
                  minWidth: "auto",
                  opacity: 0.7
                },
                title: e.note ? "编辑备注" : "添加备注",
                children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-note" })
              }
            ),
            /* @__PURE__ */ o.jsx(
              we,
              {
                variant: "plain",
                onClick: $,
                style: {
                  padding: "4px",
                  minWidth: "auto",
                  opacity: g > 0 || e.newCount > 0 ? 1 : 0.3
                },
                title: "开始复习",
                children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-player-play" })
              }
            )
          ] })
        ]
      }
    ),
    x && /* @__PURE__ */ o.jsx("div", { style: {
      padding: "8px 12px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "6px",
      marginTop: "4px",
      marginLeft: `${y * 16 + 24}px`
    }, children: /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "8px", alignItems: "center" }, children: [
      /* @__PURE__ */ o.jsx(
        "input",
        {
          type: "text",
          value: f,
          onChange: E,
          placeholder: "输入卡组备注...",
          style: {
            flex: 1,
            padding: "4px 8px",
            border: "1px solid var(--orca-color-border-1)",
            borderRadius: "4px",
            backgroundColor: "var(--orca-color-bg-1)",
            color: "var(--orca-color-text-1)",
            fontSize: "13px"
          },
          onClick: (j) => j.stopPropagation(),
          autoFocus: !0
        }
      ),
      /* @__PURE__ */ o.jsx(
        we,
        {
          variant: "plain",
          onClick: P,
          style: { fontSize: "12px", padding: "4px 8px" },
          children: "取消"
        }
      ),
      /* @__PURE__ */ o.jsx(
        we,
        {
          variant: "solid",
          onClick: C,
          style: { fontSize: "12px", padding: "4px 8px" },
          children: "保存"
        }
      )
    ] }) })
  ] });
}
function Jf({
  deckStats: e,
  todayStats: t,
  panelId: r,
  pluginName: n,
  onViewDeck: a,
  onReviewDeck: s,
  onStartTodayReview: i,
  onRefresh: c,
  onNoteChange: d,
  onShowStatistics: l,
  onShowDifficultCards: x
}) {
  const [u, f] = ze(""), [p, g] = ze(/* @__PURE__ */ new Set()), y = Wr(null), v = t.pendingCount > 0 || t.newCount > 0, h = 15, [S, $] = ze(h), k = Wr(null), C = _e((T) => e.decks.some((w) => w.name.split("::").slice(0, -1).join("::") === T), [e.decks]), P = _e((T) => {
    const w = Dt(T);
    return console.log(`Deck ${T} hierarchy: ${w}, level: ${w.length - 1}`), w.length - 1;
  }, [Dt]), E = _e((T) => {
    g((w) => {
      const N = new Set(w);
      return N.has(T) ? N.delete(T) : N.add(T), N;
    });
  }, []), O = _e((T) => {
    const w = Dt(T);
    console.log(`Checking if deck ${T} should show, hierarchy: ${w}`);
    for (let N = 1; N < w.length; N++) {
      const F = w.slice(0, N).join("::");
      if (console.log(`Checking parent ${F}, collapsed: ${p.has(F)}`), p.has(F))
        return console.log(`Deck ${T} should not show because parent ${F} is collapsed`), !1;
    }
    return console.log(`Deck ${T} should show`), !0;
  }, [p, Dt]), j = ur(() => {
    if (!u.trim())
      return e.decks;
    const T = u.toLowerCase().trim();
    return e.decks.filter((w) => {
      var D;
      const N = w.name.toLowerCase().includes(T), F = ((D = w.note) == null ? void 0 : D.toLowerCase().includes(T)) || !1;
      return N || F;
    });
  }, [e.decks, u]), B = ur(() => j.filter((T) => O(T.name)), [j, O]);
  Ut(() => {
    $(h);
  }, [u]), Ut(() => {
    const T = k.current;
    if (!T) return;
    const w = new IntersectionObserver(
      (N) => {
        N[0].isIntersecting && S < B.length && $((F) => Math.min(F + h, B.length));
      },
      { threshold: 0.1 }
    );
    return w.observe(T), () => w.disconnect();
  }, [S, B.length]);
  const z = B.slice(0, S), M = S < B.length, R = () => {
    var T;
    f(""), (T = y.current) == null || T.focus();
  }, A = ur(() => {
    if (!u.trim())
      return {
        deckCount: e.decks.length,
        totalCards: t.totalCount,
        newCards: t.newCount,
        pendingCards: t.pendingCount
      };
    const T = j.reduce((F, D) => F + D.totalCount, 0), w = j.reduce((F, D) => F + D.newCount, 0), N = j.reduce((F, D) => F + D.overdueCount + D.todayCount, 0);
    return {
      deckCount: j.length,
      totalCards: T,
      newCards: w,
      pendingCards: N
    };
  }, [e.decks, j, t, u]);
  return /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "16px" }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "8px"
    }, children: [
      /* @__PURE__ */ o.jsxs(
        we,
        {
          variant: "plain",
          onClick: x,
          className: "srs-difficult-cards-button",
          style: {
            fontSize: "13px",
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
            color: "var(--orca-color-danger-6)"
          },
          title: "查看困难卡片",
          children: [
            /* @__PURE__ */ o.jsx("i", { className: "ti ti-alert-triangle" }),
            "困难卡片"
          ]
        }
      ),
      /* @__PURE__ */ o.jsxs(
        we,
        {
          variant: "plain",
          onClick: l,
          className: "srs-statistics-button",
          style: {
            fontSize: "13px",
            padding: "6px 12px",
            display: "flex",
            alignItems: "center",
            gap: "4px"
          },
          title: "查看学习统计",
          children: [
            /* @__PURE__ */ o.jsx("i", { className: "ti ti-chart-bar" }),
            "统计"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      gap: "12px",
      justifyContent: "center",
      flexWrap: "wrap"
    }, children: [
      /* @__PURE__ */ o.jsx(
        kn,
        {
          label: "未学习",
          value: t.newCount,
          color: "var(--orca-color-primary-6)"
        }
      ),
      /* @__PURE__ */ o.jsx(
        kn,
        {
          label: "学习中",
          value: t.todayCount,
          color: "var(--orca-color-danger-6)"
        }
      ),
      /* @__PURE__ */ o.jsx(
        kn,
        {
          label: "待复习",
          value: t.pendingCount - t.todayCount,
          color: "var(--orca-color-success-6)"
        }
      )
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "12px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      border: "1px solid var(--orca-color-border-1)"
    }, children: [
      /* @__PURE__ */ o.jsx("i", { className: "ti ti-search", style: {
        fontSize: "16px",
        color: "var(--orca-color-text-3)"
      } }),
      /* @__PURE__ */ o.jsx(
        "input",
        {
          ref: y,
          type: "text",
          value: u,
          onChange: (T) => f(T.target.value),
          placeholder: "搜索卡组名称或备注内容...",
          style: {
            flex: 1,
            border: "none",
            outline: "none",
            backgroundColor: "transparent",
            color: "var(--orca-color-text-1)",
            fontSize: "14px",
            padding: "4px 0"
          },
          onKeyDown: (T) => {
            T.key === "Escape" && R();
          }
        }
      ),
      u && /* @__PURE__ */ o.jsx(
        we,
        {
          variant: "plain",
          onClick: R,
          style: {
            padding: "4px",
            minWidth: "auto",
            fontSize: "14px",
            color: "var(--orca-color-text-3)"
          },
          title: "清空搜索",
          children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-x" })
        }
      )
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      border: "1px solid var(--orca-color-border-1)",
      borderRadius: "8px",
      overflow: "hidden"
    }, children: [
      /* @__PURE__ */ o.jsxs("div", { style: {
        display: "flex",
        alignItems: "center",
        padding: "10px 12px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderBottom: "1px solid var(--orca-color-border-1)"
      }, children: [
        /* @__PURE__ */ o.jsx("div", { style: {
          flex: 1,
          fontSize: "13px",
          fontWeight: 600,
          color: "var(--orca-color-text-2)"
        }, children: "牌组" }),
        /* @__PURE__ */ o.jsx("div", { style: {
          width: "60px",
          textAlign: "center",
          fontSize: "13px",
          fontWeight: 600,
          color: "#3b82f6"
        }, children: "未学习" }),
        /* @__PURE__ */ o.jsx("div", { style: {
          width: "60px",
          textAlign: "center",
          fontSize: "13px",
          fontWeight: 600,
          color: "#ef4444"
        }, children: "学习中" }),
        /* @__PURE__ */ o.jsx("div", { style: {
          width: "60px",
          textAlign: "center",
          fontSize: "13px",
          fontWeight: 600,
          color: "#22c55e"
        }, children: "待复习" }),
        /* @__PURE__ */ o.jsx("div", { style: { width: "64px" } })
      ] }),
      /* @__PURE__ */ o.jsx("div", { style: { display: "flex", flexDirection: "column" }, children: e.decks.length === 0 ? /* @__PURE__ */ o.jsx("div", { style: {
        textAlign: "center",
        padding: "24px",
        color: "var(--orca-color-text-3)"
      }, children: "暂无牌组，请先创建卡片" }) : j.length === 0 ? /* @__PURE__ */ o.jsxs("div", { style: {
        textAlign: "center",
        padding: "24px",
        color: "var(--orca-color-text-3)"
      }, children: [
        /* @__PURE__ */ o.jsx("div", { style: { marginBottom: "8px" }, children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-search-off", style: { fontSize: "24px", opacity: 0.5 } }) }),
        /* @__PURE__ */ o.jsx("div", { children: "未找到匹配的卡组" }),
        /* @__PURE__ */ o.jsx("div", { style: { fontSize: "12px", marginTop: "4px", opacity: 0.7 }, children: "尝试搜索卡组名称或备注内容" })
      ] }) : /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
        z.map((T) => /* @__PURE__ */ o.jsx(
          Gf,
          {
            deck: T,
            pluginName: n,
            searchQuery: u,
            onViewDeck: a,
            onReviewDeck: s,
            onNoteChange: d,
            onToggleCollapse: E,
            collapsedDecks: p,
            isChildDeck: C,
            getDeckLevel: P
          },
          T.name
        )),
        /* @__PURE__ */ o.jsx(
          "div",
          {
            ref: k,
            style: {
              padding: M ? "12px" : "8px",
              textAlign: "center",
              color: "var(--orca-color-text-3)",
              fontSize: "13px"
            },
            children: M ? /* @__PURE__ */ o.jsxs("span", { children: [
              "加载更多... (",
              S,
              "/",
              B.length,
              ")"
            ] }) : B.length > h ? /* @__PURE__ */ o.jsxs("span", { style: { opacity: 0.6 }, children: [
              "已加载全部 ",
              B.length,
              " 个卡组"
            ] }) : null
          }
        )
      ] }) })
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "12px"
    }, children: [
      /* @__PURE__ */ o.jsx("div", { style: {
        fontSize: "13px",
        color: "var(--orca-color-text-2)",
        textAlign: "center"
      }, children: u.trim() ? /* @__PURE__ */ o.jsxs("div", { children: [
        /* @__PURE__ */ o.jsxs("div", { children: [
          "搜索结果：",
          A.deckCount,
          " 个卡组，",
          A.totalCards,
          " 张卡片"
        ] }),
        /* @__PURE__ */ o.jsxs("div", { style: { marginTop: "2px", opacity: 0.8 }, children: [
          A.newCards,
          " 张新卡，",
          A.pendingCards,
          " 张待复习"
        ] })
      ] }) : /* @__PURE__ */ o.jsxs("div", { children: [
        "共 ",
        t.totalCount,
        " 张卡片，",
        t.newCount,
        " 张新卡，",
        t.pendingCount,
        " 张待复习"
      ] }) }),
      /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "8px" }, children: [
        /* @__PURE__ */ o.jsx(
          we,
          {
            variant: "solid",
            onClick: v ? i : void 0,
            style: {
              opacity: v ? 1 : 0.5,
              cursor: v ? "pointer" : "not-allowed",
              padding: "8px 24px"
            },
            children: "开始今日复习"
          }
        ),
        /* @__PURE__ */ o.jsxs(
          we,
          {
            variant: "plain",
            onClick: c,
            style: { padding: "8px 16px" },
            title: "刷新数据",
            children: [
              /* @__PURE__ */ o.jsx("i", { className: "ti ti-refresh", style: { marginRight: "4px" } }),
              "刷新"
            ]
          }
        )
      ] })
    ] })
  ] });
}
const wo = 20;
function Qf({
  deckName: e,
  cards: t,
  allDeckCards: r,
  currentFilter: n,
  panelId: a,
  onFilterChange: s,
  onCardClick: i,
  onCardReset: c,
  onCardDelete: d,
  onBack: l,
  onReviewDeck: x
}) {
  const [u, f] = ze(wo), p = Wr(null);
  Ut(() => {
    f(wo);
  }, [n, t.length]), Ut(() => {
    const S = p.current;
    if (!S) return;
    const $ = new IntersectionObserver(
      (k) => {
        k[0].isIntersecting && u < t.length && f((C) => Math.min(C + wo, t.length));
      },
      { threshold: 0.1 }
    );
    return $.observe(S), () => $.disconnect();
  }, [u, t.length]);
  const g = ur(() => {
    const S = /* @__PURE__ */ new Date(), $ = new Date(S.getFullYear(), S.getMonth(), S.getDate()), k = new Date($);
    return k.setDate(k.getDate() + 1), {
      all: r.length,
      overdue: r.filter((C) => !C.isNew && C.srs.due < $).length,
      today: r.filter((C) => !C.isNew && C.srs.due >= $ && C.srs.due < k).length,
      future: r.filter((C) => !C.isNew && C.srs.due >= k).length,
      new: r.filter((C) => C.isNew).length
    };
  }, [r]), y = g.overdue + g.today > 0, v = t.slice(0, u), h = u < t.length;
  return /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      alignItems: "center",
      gap: "12px"
    }, children: [
      /* @__PURE__ */ o.jsx(we, { variant: "plain", onClick: l, style: { fontSize: "13px", padding: "6px 12px" }, children: "← 返回" }),
      /* @__PURE__ */ o.jsx("div", { style: {
        fontSize: "16px",
        fontWeight: 600,
        color: "var(--orca-color-text-1)",
        flex: 1
      }, children: e }),
      y && /* @__PURE__ */ o.jsx(
        we,
        {
          variant: "solid",
          onClick: () => x(e),
          style: { fontSize: "13px", padding: "6px 12px" },
          children: "复习此牌组"
        }
      )
    ] }),
    /* @__PURE__ */ o.jsx("div", { style: {
      display: "flex",
      gap: "8px",
      flexWrap: "wrap"
    }, children: Uf.map((S) => /* @__PURE__ */ o.jsxs(
      "button",
      {
        onClick: () => s(S.key),
        style: {
          padding: "6px 12px",
          borderRadius: "16px",
          border: "1px solid",
          borderColor: n === S.key ? "var(--orca-color-primary-5)" : "var(--orca-color-border-1)",
          backgroundColor: n === S.key ? "var(--orca-color-primary-1)" : "transparent",
          color: n === S.key ? "var(--orca-color-primary-6)" : "var(--orca-color-text-2)",
          fontSize: "13px",
          cursor: "pointer",
          transition: "all 0.2s ease"
        },
        children: [
          S.label,
          " (",
          g[S.key],
          ")"
        ]
      },
      S.key
    )) }),
    /* @__PURE__ */ o.jsx("div", { style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px"
    }, children: t.length === 0 ? /* @__PURE__ */ o.jsx("div", { style: {
      textAlign: "center",
      padding: "24px",
      color: "var(--orca-color-text-3)"
    }, children: "没有符合条件的卡片" }) : /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
      v.map((S, $) => /* @__PURE__ */ o.jsx(
        Vf,
        {
          card: S,
          panelId: a,
          onCardClick: i,
          onCardReset: c,
          onCardDelete: d
        },
        `${S.id}-${S.clozeNumber || 0}-${S.directionType || "basic"}-${S.listItemId || 0}-${$}`
      )),
      /* @__PURE__ */ o.jsx(
        "div",
        {
          ref: p,
          style: {
            padding: "16px",
            textAlign: "center",
            color: "var(--orca-color-text-3)",
            fontSize: "13px"
          },
          children: h ? /* @__PURE__ */ o.jsxs("span", { children: [
            "加载更多... (",
            u,
            "/",
            t.length,
            ")"
          ] }) : t.length > wo ? /* @__PURE__ */ o.jsxs("span", { children: [
            "已加载全部 ",
            t.length,
            " 张卡片"
          ] }) : null
        }
      )
    ] }) })
  ] });
}
function Xf({ panelId: e, pluginName: t, onClose: r }) {
  const [n, a] = ze("dashboard"), [s, i] = ze(null), [c, d] = ze([]), [l, x] = ze({ decks: [], totalCards: 0, totalNew: 0, totalOverdue: 0 }), [u, f] = ze({ pendingCount: 0, todayCount: 0, newCount: 0, totalCount: 0 }), [p, g] = ze(!0), [y, v] = ze(null), [h, S] = ze("all"), [$, k] = ze(null), [C, P] = ze(null), [E, O] = ze(null), j = _e(async () => {
    g(!0), v(null);
    try {
      const { collectReviewCards: W, calculateDeckStats: q } = await Promise.resolve().then(() => He), { calculateHomeStats: Q } = await Promise.resolve().then(() => Ra), { getAllDeckNotes: ie } = await Promise.resolve().then(() => Qn), {
        getReviewHistory: I,
        getFutureForecast: ge,
        getTodayStatistics: fe
      } = await Promise.resolve().then(() => $o), Te = await W(t);
      d(Te);
      const $e = q(Te), Ke = await ie(t), Ct = {
        ...$e,
        decks: $e.decks.map((xt) => ({
          ...xt,
          note: Ke[xt.name] || ""
        }))
      };
      x(Ct);
      const pt = Q(Te);
      f(pt);
      const [Ue, Zt, hr] = await Promise.all([
        I(t, "3months"),
        ge(t, 30),
        fe(t)
      ]);
      k(Ue), P(Zt), O(hr);
    } catch (W) {
      console.error(`[${t}] Flash Home 加载数据失败:`, W), v(W instanceof Error ? W.message : String(W));
    } finally {
      g(!1);
    }
  }, [t]);
  Ut(() => {
    j();
  }, [j]), Ut(() => {
    const q = setInterval(async () => {
      try {
        const { collectReviewCards: Q, calculateDeckStats: ie } = await Promise.resolve().then(() => He), { calculateHomeStats: I } = await Promise.resolve().then(() => Ra), { getAllDeckNotes: ge } = await Promise.resolve().then(() => Qn), fe = await Q(t), Te = u.pendingCount, $e = I(fe);
        $e.pendingCount > Te && console.log(`[${t}] Flash Home: 发现新到期卡片，从 ${Te} 增加到 ${$e.pendingCount}`), d(fe);
        const Ke = ie(fe), Ct = await ge(t), pt = {
          ...Ke,
          decks: Ke.decks.map((Ue) => ({
            ...Ue,
            note: Ct[Ue.name] || ""
          }))
        };
        x(pt), f($e);
      } catch (Q) {
        console.warn(`[${t}] Flash Home 自动刷新失败:`, Q);
      }
    }, 12e4);
    return () => clearInterval(q);
  }, [t, u.pendingCount]);
  const B = Wr(j);
  B.current = j;
  const z = Wr({ graded: null, postponed: null, suspended: null });
  Ut(() => {
    const W = () => {
      console.log(`[${t}] Flash Home: 收到 CARD_GRADED 事件，静默刷新`), B.current();
    }, q = () => {
      console.log(`[${t}] Flash Home: 收到 CARD_POSTPONED 事件，静默刷新`), B.current();
    }, Q = () => {
      console.log(`[${t}] Flash Home: 收到 CARD_SUSPENDED 事件，静默刷新`), B.current();
    };
    return z.current = {
      graded: W,
      postponed: q,
      suspended: Q
    }, orca.broadcasts.isHandlerRegistered(Qe.CARD_GRADED) || orca.broadcasts.registerHandler(Qe.CARD_GRADED, W), orca.broadcasts.isHandlerRegistered(Qe.CARD_POSTPONED) || orca.broadcasts.registerHandler(Qe.CARD_POSTPONED, q), orca.broadcasts.isHandlerRegistered(Qe.CARD_SUSPENDED) || orca.broadcasts.registerHandler(Qe.CARD_SUSPENDED, Q), () => {
      const ie = z.current;
      ie.graded && orca.broadcasts.unregisterHandler(Qe.CARD_GRADED, ie.graded), ie.postponed && orca.broadcasts.unregisterHandler(Qe.CARD_POSTPONED, ie.postponed), ie.suspended && orca.broadcasts.unregisterHandler(Qe.CARD_SUSPENDED, ie.suspended);
    };
  }, [t]);
  const M = ur(() => s ? c.filter((W) => W.deck === s || W.deck.startsWith(`${s}::`)) : [], [c, s]), R = ur(() => hf(M, h), [M, h]), A = _e((W) => {
    i(W), S("all"), a("card-list");
  }, []), T = _e(async (W) => {
    try {
      const { startReviewSession: q } = await Promise.resolve().then(() => He);
      await q(W);
    } catch (q) {
      console.error(`[${t}] 启动牌组复习失败:`, q), orca.notify("error", "启动复习失败", { title: "SRS 复习" });
    }
  }, [t]), w = _e(async () => {
    try {
      const { startReviewSession: W } = await Promise.resolve().then(() => He);
      await W();
    } catch (W) {
      console.error(`[${t}] 启动今日复习失败:`, W), orca.notify("error", "启动复习失败", { title: "SRS 复习" });
    }
  }, [t]), N = _e(async (W) => {
    try {
      const { resetCardSrsState: q, resetClozeSrsState: Q, resetDirectionSrsState: ie } = await Promise.resolve().then(() => On);
      let I;
      W.clozeNumber ? I = await Q(W.id, W.clozeNumber) : W.directionType ? I = await ie(W.id, W.directionType) : I = await q(W.id), d((ge) => ge.map((fe) => (W.clozeNumber ? fe.id === W.id && fe.clozeNumber === W.clozeNumber : W.directionType ? fe.id === W.id && fe.directionType === W.directionType : fe.id === W.id) ? { ...fe, srs: I, isNew: !0 } : fe)), orca.notify("success", "卡片已重置为新卡", { title: "SRS" });
    } catch (q) {
      console.error(`[${t}] 重置卡片失败:`, q), orca.notify("error", "重置卡片失败", { title: "SRS" });
    }
  }, [t]), F = _e(async (W) => {
    d((q) => q.filter((Q) => W.clozeNumber ? !(Q.id === W.id && Q.clozeNumber === W.clozeNumber) : W.directionType ? !(Q.id === W.id && Q.directionType === W.directionType) : Q.id !== W.id));
    try {
      const { deleteCardSrsData: q, deleteClozeCardSrsData: Q, deleteDirectionCardSrsData: ie } = await Promise.resolve().then(() => On);
      W.clozeNumber ? await Q(W.id, W.clozeNumber) : W.directionType ? await ie(W.id, W.directionType) : await q(W.id), await orca.commands.invokeEditorCommand(
        "core.editor.removeTag",
        null,
        W.id,
        "card"
      ), orca.notify("success", "卡片已删除", { title: "SRS" });
    } catch (q) {
      console.error(`[${t}] 删除卡片失败:`, q), orca.notify("error", "删除卡片失败", { title: "SRS" });
    }
  }, [t]), D = _e((W) => {
    orca.nav.openInLastPanel("block", { blockId: W });
  }, []), m = _e(() => {
    a("deck-list"), i(null), S("all");
  }, []), _ = _e(() => {
    a("statistics");
  }, []), G = _e(() => {
    a("difficult-cards");
  }, []), X = _e((W) => {
    S(W);
  }, []), pe = _e(async (W) => {
    try {
      const { createRepeatReviewSession: q } = await Promise.resolve().then(() => uf), { getOrCreateReviewSessionBlock: Q } = await Promise.resolve().then(() => Vi);
      q(W, 0, "children");
      const ie = await Q(t);
      orca.nav.openInLastPanel("block", { blockId: ie }), orca.notify("success", `已开始复习 ${W.length} 张困难卡片`, { title: "SRS 复习" });
    } catch (q) {
      console.error(`[${t}] 启动困难卡片复习失败:`, q), orca.notify("error", "启动复习失败", { title: "SRS 复习" });
    }
  }, [t]), J = _e(() => {
    j();
  }, [j]), ae = _e((W, q) => {
    x((Q) => ({
      ...Q,
      decks: Q.decks.map(
        (ie) => ie.name === W ? { ...ie, note: q } : ie
      )
    }));
  }, []);
  return p ? /* @__PURE__ */ o.jsx("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    minHeight: "200px",
    fontSize: "14px",
    color: "var(--orca-color-text-2)"
  }, children: "加载中..." }) : y ? /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "24px",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "200px"
  }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: { color: "var(--orca-color-danger-5)" }, children: [
      "加载失败：",
      y
    ] }),
    /* @__PURE__ */ o.jsx(we, { variant: "solid", onClick: J, children: "重试" })
  ] }) : /* @__PURE__ */ o.jsx("div", { style: {
    padding: "16px",
    height: "100%",
    overflow: "auto"
  }, children: n === "dashboard" ? /* @__PURE__ */ o.jsxs("div", { className: "srs-dashboard-view", children: [
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "16px"
    }, children: [
      /* @__PURE__ */ o.jsxs("div", { style: {
        display: "flex",
        gap: "8px"
      }, children: [
        /* @__PURE__ */ o.jsx(
          we,
          {
            variant: "solid",
            onClick: () => a("dashboard"),
            style: { fontSize: "13px", padding: "6px 12px" },
            children: "主页"
          }
        ),
        /* @__PURE__ */ o.jsx(
          we,
          {
            variant: "plain",
            onClick: () => a("deck-list"),
            style: { fontSize: "13px", padding: "6px 12px" },
            children: "卡组"
          }
        ),
        /* @__PURE__ */ o.jsx(
          we,
          {
            variant: "plain",
            onClick: _,
            style: { fontSize: "13px", padding: "6px 12px" },
            children: "统计"
          }
        )
      ] }),
      /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "8px" }, children: [
        /* @__PURE__ */ o.jsxs(
          we,
          {
            variant: "plain",
            onClick: G,
            style: { fontSize: "13px", padding: "6px 12px", color: "var(--orca-color-danger-6)" },
            children: [
              /* @__PURE__ */ o.jsx("i", { className: "ti ti-alert-triangle", style: { marginRight: "4px" } }),
              "困难卡片"
            ]
          }
        ),
        /* @__PURE__ */ o.jsx(
          we,
          {
            variant: "plain",
            onClick: J,
            style: { fontSize: "13px", padding: "6px 12px" },
            children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-refresh" })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ o.jsx(
      qf,
      {
        pluginName: t,
        todayStats: E,
        reviewHistory: $,
        futureForecast: C,
        totalCards: u.totalCount,
        newCards: u.newCount,
        dueCards: u.pendingCount,
        onStartReview: w,
        onRefresh: J,
        isLoading: p
      }
    )
  ] }) : n === "deck-list" ? /* @__PURE__ */ o.jsxs("div", { className: "srs-deck-list-view", children: [
    /* @__PURE__ */ o.jsx("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "16px"
    }, children: /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      gap: "8px"
    }, children: [
      /* @__PURE__ */ o.jsx(
        we,
        {
          variant: "plain",
          onClick: () => a("dashboard"),
          style: { fontSize: "13px", padding: "6px 12px" },
          children: "主页"
        }
      ),
      /* @__PURE__ */ o.jsx(
        we,
        {
          variant: "solid",
          onClick: () => a("deck-list"),
          style: { fontSize: "13px", padding: "6px 12px" },
          children: "卡组"
        }
      ),
      /* @__PURE__ */ o.jsx(
        we,
        {
          variant: "plain",
          onClick: _,
          style: { fontSize: "13px", padding: "6px 12px" },
          children: "统计"
        }
      )
    ] }) }),
    /* @__PURE__ */ o.jsx(
      Jf,
      {
        deckStats: l,
        todayStats: u,
        panelId: e,
        pluginName: t,
        onViewDeck: A,
        onReviewDeck: T,
        onStartTodayReview: w,
        onRefresh: J,
        onNoteChange: ae,
        onShowStatistics: _,
        onShowDifficultCards: G
      }
    )
  ] }) : n === "statistics" ? /* @__PURE__ */ o.jsx("div", { className: "srs-statistics-view", children: /* @__PURE__ */ o.jsx(
    zf,
    {
      panelId: e,
      pluginName: t,
      onBack: m,
      decks: l.decks
    }
  ) }) : n === "difficult-cards" ? /* @__PURE__ */ o.jsx("div", { className: "srs-difficult-cards-view", children: /* @__PURE__ */ o.jsx(
    Pf,
    {
      panelId: e,
      pluginName: t,
      onBack: m,
      onStartReview: pe
    }
  ) }) : /* @__PURE__ */ o.jsx("div", { className: "srs-flash-home-view", children: /* @__PURE__ */ o.jsx(
    Qf,
    {
      deckName: s || "",
      cards: R,
      allDeckCards: M,
      currentFilter: h,
      panelId: e,
      onFilterChange: X,
      onCardClick: D,
      onCardReset: N,
      onCardDelete: F,
      onBack: m,
      onReviewDeck: T
    }
  ) }) });
}
const { useState: jn, useEffect: Zf } = window.React, { BlockShell: ep, Button: tp } = orca.components;
function rp(e) {
  const {
    panelId: t,
    blockId: r,
    rndId: n,
    blockLevel: a,
    indentLevel: s,
    mirrorId: i,
    initiallyCollapsed: c,
    renderingMode: d
  } = e, [l, x] = jn("orca-srs"), [u, f] = jn(!0), [p, g] = jn(null);
  Zf(() => {
    y();
  }, []);
  const y = async () => {
    f(!0), g(null);
    try {
      const { getPluginName: $ } = await Promise.resolve().then(() => He), k = typeof $ == "function" ? $() : "orca-srs";
      x(k);
    } catch ($) {
      console.error("[SRS Flashcard Home Renderer] 加载插件名称失败:", $), g($ instanceof Error ? $.message : String($));
    } finally {
      f(!1);
    }
  }, v = () => {
    orca.nav.close(t);
  }, h = () => {
    y();
  }, S = () => u ? /* @__PURE__ */ o.jsx("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    minHeight: "200px",
    fontSize: "14px",
    color: "var(--orca-color-text-2)"
  }, children: "加载中..." }) : p ? /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "24px",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center"
  }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: { color: "var(--orca-color-danger-5)" }, children: [
      "加载失败：",
      p
    ] }),
    /* @__PURE__ */ o.jsx(tp, { variant: "solid", onClick: h, children: "重试" })
  ] }) : /* @__PURE__ */ o.jsx(
    Xe,
    {
      componentName: "Flash Home",
      errorTitle: "Flash Home 加载出错",
      children: /* @__PURE__ */ o.jsx(
        Xf,
        {
          panelId: t,
          pluginName: l,
          onClose: v
        }
      )
    }
  );
  return /* @__PURE__ */ o.jsx(
    ep,
    {
      panelId: t,
      blockId: r,
      rndId: n,
      mirrorId: i,
      blockLevel: a,
      indentLevel: s,
      initiallyCollapsed: c,
      renderingMode: d,
      reprClassName: "srs-repr-flashcard-home",
      contentClassName: "srs-repr-flashcard-home-content",
      contentJsx: S(),
      childrenJsx: null
    }
  );
}
let Rt = null;
const Fo = "incrementalReadingSessionBlockId", Wo = "incrementalReadingSessionFocusCardId", op = Wo;
async function np(e) {
  const t = await orca.plugins.getData(e, Fo);
  return typeof t == "number" ? t : null;
}
async function ap(e) {
  if (Rt && await xs(Rt))
    return Rt;
  const t = await orca.plugins.getData(e, Fo);
  if (typeof t == "number" && await xs(t))
    return Rt = t, t;
  const r = await sp(e);
  return await orca.plugins.setData(e, Fo, r), Rt = r, r;
}
async function sp(e) {
  var n;
  const t = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [{ t: "t", v: `[渐进阅读会话 - ${e}]` }],
    { type: "srs.ir-session" }
  );
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [t],
    [
      { name: "ir.isSessionBlock", value: !0, type: 4 },
      { name: "ir.pluginName", value: e, type: 2 }
    ]
  );
  const r = (n = orca.state.blocks) == null ? void 0 : n[t];
  return r && (r._repr = {
    type: "srs.ir-session"
  }), console.log(`[${e}] 创建渐进阅读会话块: #${t}`), t;
}
async function ip(e) {
  var t, r;
  if (Rt) {
    const n = (t = orca.state.blocks) == null ? void 0 : t[Rt];
    n && ((r = n._repr) == null ? void 0 : r.type) === "srs.ir-session" && delete n._repr, Rt = null;
  }
  await orca.plugins.removeData(e, Fo);
}
async function cp(e, t) {
  await orca.plugins.setData(e, Wo, t);
}
async function lp(e) {
  try {
    const t = await orca.plugins.getData(e, Wo);
    return await orca.plugins.removeData(e, Wo), typeof t == "number" ? t : null;
  } catch (t) {
    return console.warn("[IR] popNextIRSessionFocusCardId failed:", t), null;
  }
}
async function xs(e) {
  var r;
  const t = (r = orca.state.blocks) == null ? void 0 : r[e];
  if (t) return t;
  try {
    return await orca.invokeBackend("get-block", e);
  } catch (n) {
    return console.warn("[ir] 无法从后端获取渐进阅读会话块:", n), null;
  }
}
const dp = (e) => Number.isFinite(e) ? Math.min(100, Math.max(0, Math.round(e))) : 50, up = (e, t) => dp(t === "forward" ? e + 10 : e - 10);
async function gs(e) {
  try {
    await na(e), await on(e), await orca.commands.invokeEditorCommand(
      "core.editor.removeTag",
      null,
      e,
      "card"
    );
  } catch (t) {
    throw console.error("[IR] 读完处理失败:", t), orca.notify("error", "读完处理失败", { title: "渐进阅读" }), t;
  }
}
async function fp(e, t, r) {
  const n = await qe(e), a = up(n.priority, r);
  await li(e, a);
}
async function pp(e, t) {
  try {
    console.log("[IR] updatePriority start", { blockId: e, newPriority: t });
    const r = await nn(e, t);
    return console.log("[IR] updatePriority done", { blockId: e, priority: r.priority }), r;
  } catch (r) {
    throw console.error("[IR] updatePriority failed:", r), r;
  }
}
const { useEffect: xp, useState: gp } = window.React, hs = 24;
function ys(e) {
  const t = (e ?? "").replace(/\s+/g, " ").trim();
  return t.length > 0 ? t : "(无标题)";
}
function ms(e, t) {
  return e.length <= t ? e : e.substring(0, t - 3) + "...";
}
async function Un(e) {
  var r, n;
  const t = ((r = orca.state.blocks) == null ? void 0 : r[e]) ?? ((n = orca.state.blocks) == null ? void 0 : n[String(e)]);
  return t || await orca.invokeBackend("get-block", e);
}
async function hp(e, t) {
  let r = e, n, a = 0;
  for (; r && a < t; ) {
    const s = await Un(r);
    if (!s || (n = s, !s.parent)) break;
    r = s.parent, a += 1;
  }
  return n;
}
async function yp(e, t, r) {
  const n = await Un(e);
  if (!n) return [];
  let a = n;
  if ((r === "extracts" || !r && je(n) === "extracts") && n.parent) {
    const x = await Un(n.parent);
    x && (a = x);
  }
  const i = await hp(a.id, t), c = [], d = ys(i == null ? void 0 : i.text), l = ys(a.text);
  return i && i.id !== a.id && c.push({
    id: i.id,
    text: d,
    displayText: ms(d, hs)
  }), c.push({
    id: a.id,
    text: l,
    displayText: ms(l, hs)
  }), c;
}
function mp({
  blockId: e,
  panelId: t,
  cardType: r,
  maxDepth: n = 20
}) {
  const [a, s] = gp([]);
  if (xp(() => {
    let c = !1;
    return (async () => {
      try {
        const l = await yp(e, n, r);
        c || s(l);
      } catch (l) {
        console.error("[IR Breadcrumb] 读取面包屑失败:", l);
      }
    })(), () => {
      c = !0;
    };
  }, [e, r, n]), a.length === 0)
    return null;
  const i = (c, d) => {
    d ? orca.nav.openInLastPanel("block", { blockId: c }) : orca.nav.goTo("block", { blockId: c }, t);
  };
  return /* @__PURE__ */ o.jsx("div", { style: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    fontSize: "12px",
    color: "var(--orca-color-text-2)",
    flexWrap: "wrap"
  }, children: a.map((c, d) => {
    const l = d === a.length - 1;
    return /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "6px" }, children: [
      /* @__PURE__ */ o.jsx(
        "span",
        {
          onClick: (x) => i(c.id, x.shiftKey),
          style: {
            cursor: "pointer",
            color: l ? "var(--orca-color-text-1)" : "var(--orca-color-primary-6)",
            fontWeight: l ? 600 : 500
          },
          title: c.text,
          children: c.displayText
        }
      ),
      !l && /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-3)" }, children: ">" })
    ] }, c.id);
  }) });
}
const { useEffect: Rn, useRef: vs, useState: $n } = window.React, { Button: tt, Block: vp, ConfirmBox: Dn } = orca.components;
function bp(e) {
  const t = e.getMonth() + 1, r = e.getDate();
  return `${t}-${r}`;
}
function wp(e) {
  if (!Number.isFinite(e)) return "-";
  const t = Math.round(e * 100) / 100;
  return Number.isInteger(t) ? `${t}d` : `${t}d`;
}
function Ht({ label: e, value: t }) {
  return /* @__PURE__ */ o.jsxs("span", { style: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "2px 8px",
    borderRadius: "999px",
    border: "1px solid var(--orca-color-border-1)",
    background: "var(--orca-color-bg-1)",
    fontSize: "12px",
    lineHeight: 1.6,
    whiteSpace: "nowrap"
  }, children: [
    /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-3)" }, children: e }),
    /* @__PURE__ */ o.jsx("span", { style: { color: "var(--orca-color-text-2)" }, children: t })
  ] });
}
function Sp({
  cards: e,
  panelId: t,
  dailyLimit: r,
  totalDueCount: n,
  overflowCount: a,
  enableOverflowDefer: s = !0,
  onDeferOverflow: i,
  onClose: c
}) {
  const [d, l] = $n(e), [x, u] = $n(0), [f, p] = $n(!1), g = vs(null), y = vs(null), v = f ? { opacity: 0.6, pointerEvents: "none" } : void 0, h = d[x], S = (h == null ? void 0 : h.cardType) === "topic", $ = !!(!S && (h != null && h.isCardMaking));
  Rn(() => {
    h && (y.current = null);
  }, [h == null ? void 0 : h.id]), Rn(() => {
    if (!h) return;
    const D = h.resumeBlockId;
    if (!D || D === h.id || y.current === h.id) return;
    const m = g.current;
    if (!m) return;
    let _ = !1;
    const G = () => {
      const ae = [
        `#block-${D}`,
        `[data-block-id="${D}"]`,
        `[data-blockid="${D}"]`,
        `[data-id="${D}"]`,
        `[blockid="${D}"]`
      ];
      for (const W of ae) {
        const q = m.querySelector(W);
        if (q) return q;
      }
      return null;
    }, X = () => {
      const ae = G();
      return ae ? (ae.scrollIntoView({ behavior: "smooth", block: "center" }), y.current = h.id, !0) : !1;
    };
    let pe = 0;
    const J = () => {
      _ || (pe += 1, !(X() || pe >= 8) && setTimeout(J, 250));
    };
    return setTimeout(J, 50), () => {
      _ = !0;
    };
  }, [h == null ? void 0 : h.id, h == null ? void 0 : h.resumeBlockId]), Rn(() => {
    l(e), u(0);
  }, [e]);
  const k = (D) => {
    l((m) => {
      const _ = m.filter((X, pe) => pe !== D), G = _.length === 0 ? 0 : Math.min(D, _.length - 1);
      return u(G), _;
    });
  }, C = async () => {
    if (!(!h || f)) {
      p(!0);
      try {
        if ($) {
          k(x), orca.notify("success", "已完成制卡并进入下一张", { title: "渐进阅读" });
          return;
        }
        await ci(h.id), k(x), orca.notify("success", "已标记为已读", { title: "渐进阅读" });
      } catch (D) {
        console.error("[IR Session] 标记已读失败:", D), orca.notify("error", "标记已读失败", { title: "渐进阅读" });
      } finally {
        p(!1);
      }
    }
  }, P = (D) => D >= 70 ? 50 : D >= 30 ? 20 : 80, E = async () => {
    if (console.log("[IR Session] toggle priority click", {
      hasCard: !!h,
      isTopicCard: S,
      isWorking: f,
      currentIndex: x,
      cardId: h == null ? void 0 : h.id,
      priority: h == null ? void 0 : h.priority
    }), !h || !S || f) {
      console.log("[IR Session] toggle priority ignored", {
        reason: h ? f ? "working" : "not-topic" : "no-card"
      });
      return;
    }
    p(!0);
    try {
      const D = P(h.priority);
      console.log("[IR Session] toggle priority next", { cardId: h.id, from: h.priority, to: D });
      const m = await pp(h.id, D);
      console.log("[IR Session] toggle priority updated", { cardId: h.id, priority: m.priority }), l((_) => _.map(
        (G, X) => X === x ? {
          ...G,
          priority: m.priority,
          due: m.due,
          intervalDays: m.intervalDays,
          postponeCount: m.postponeCount,
          stage: m.stage,
          lastAction: m.lastAction
        } : G
      )), orca.notify("success", "已切换优先级", { title: "渐进阅读" });
    } catch (D) {
      console.error("[IR Session] 切换优先级失败:", D), orca.notify("error", "切换优先级失败", { title: "渐进阅读" });
    } finally {
      p(!1);
    }
  }, O = async (D) => {
    if (console.log("[IR Session] adjust priority click", {
      direction: D,
      hasCard: !!h,
      isWorking: f,
      currentIndex: x,
      cardId: h == null ? void 0 : h.id,
      cardType: h == null ? void 0 : h.cardType
    }), !h || f) {
      console.log("[IR Session] adjust priority ignored", {
        reason: h ? "working" : "no-card"
      });
      return;
    }
    p(!0);
    try {
      console.log("[IR Session] adjust priority updating", { cardId: h.id, direction: D }), await fp(h.id, h.cardType, D), k(x), orca.notify("success", D === "forward" ? "已提高优先级并标记已读" : "已降低优先级并标记已读", { title: "渐进阅读" });
    } catch (m) {
      console.error("[IR Session] 调整优先级失败:", m), orca.notify("error", "调整优先级失败", { title: "渐进阅读" });
    } finally {
      p(!1);
    }
  }, j = async () => {
    if (!(!h || S || $ || f)) {
      p(!0);
      try {
        await gs(h.id), l((D) => D.map(
          (m, _) => _ === x ? { ...m, isCardMaking: !0 } : m
        )), orca.notify("success", "已初始化：现在可直接编辑并使用命令制卡；完成后点“已读”进入下一张", { title: "渐进阅读" });
      } catch (D) {
        console.error("[IR Session] 制卡初始化失败:", D), orca.notify("error", "制卡初始化失败", { title: "渐进阅读" });
      } finally {
        p(!1);
      }
    }
  }, B = async () => {
    if (!(!h || $ || f)) {
      p(!0);
      try {
        const D = await di(h.id);
        k(x), orca.notify("success", `已推后 ${D.days} 天`, { title: "渐进阅读" });
      } catch (D) {
        console.error("[IR Session] 推后失败:", D), orca.notify("error", "推后失败", { title: "渐进阅读" });
      } finally {
        p(!1);
      }
    }
  }, z = async () => {
    if (!(!h || f)) {
      p(!0);
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.deleteBlocks",
          null,
          [h.id]
        ), k(x), orca.notify("success", "已删除当前块", { title: "渐进阅读" });
      } catch (D) {
        console.error("[IR Session] 删除失败:", D), orca.notify("error", "删除失败", { title: "渐进阅读" });
      } finally {
        p(!1);
      }
    }
  }, M = async () => {
    if (!(!h || $ || f)) {
      p(!0);
      try {
        await gs(h.id), k(x), orca.notify("success", "已读完并移出队列", { title: "渐进阅读" });
      } catch (D) {
        console.error("[IR Session] 读完处理失败:", D), orca.notify("error", "读完处理失败", { title: "渐进阅读" });
      } finally {
        p(!1);
      }
    }
  }, R = () => {
    c && c();
  }, A = typeof r == "number" ? r : 0, T = typeof n == "number" ? n : 0, w = typeof a == "number" ? a : 0, N = !!(s && A > 0 && w > 0 && typeof i == "function"), F = async () => {
    if (!(!N || !i || f)) {
      p(!0);
      try {
        const D = await i();
        D > 0 ? orca.notify("success", `已推后溢出 ${D} 张`, { title: "渐进阅读" }) : orca.notify("info", "当前没有需要推后的溢出卡片", { title: "渐进阅读" });
      } catch (D) {
        console.error("[IR Session] 溢出推后失败:", D), orca.notify("error", "溢出推后失败", { title: "渐进阅读" });
      } finally {
        p(!1);
      }
    }
  };
  return d.length === 0 ? /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "24px",
    alignItems: "center",
    justifyContent: "center",
    height: "100%"
  }, children: [
    /* @__PURE__ */ o.jsx("div", { style: { color: "var(--orca-color-text-2)" }, children: "暂无到期的渐进阅读卡片" }),
    c && /* @__PURE__ */ o.jsx(tt, { variant: "plain", onClick: R, children: "关闭" })
  ] }) : h ? /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    padding: "16px",
    height: "100%",
    overflow: "auto"
  }, ref: g, children: [
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "12px"
    }, children: [
      /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "13px", color: "var(--orca-color-text-2)" }, children: [
        "进度 ",
        x + 1,
        " / ",
        d.length
      ] }),
      /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }, children: [
        A > 0 ? /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
          /* @__PURE__ */ o.jsx(Ht, { label: "今日候选", value: `${T}` }),
          /* @__PURE__ */ o.jsx(Ht, { label: "上限", value: `${A}` }),
          w > 0 ? /* @__PURE__ */ o.jsx(Ht, { label: "溢出", value: `${w}` }) : null
        ] }) : null,
        N ? /* @__PURE__ */ o.jsx(
          Dn,
          {
            text: `确认把溢出（未入选今天队列）的 ${w} 张卡片推后吗？该操作会修改它们的排期。`,
            onConfirm: async (D, m) => {
              await F(), m();
            },
            children: (D) => /* @__PURE__ */ o.jsx(tt, { variant: "outline", onClick: D, style: v, children: "一键把溢出推后" })
          }
        ) : null,
        c ? /* @__PURE__ */ o.jsx(tt, { variant: "plain", onClick: R, children: "关闭" }) : null
      ] })
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      padding: "12px",
      border: "1px solid var(--orca-color-border-1)",
      borderRadius: "8px",
      background: "var(--orca-color-bg-2)"
    }, children: [
      /* @__PURE__ */ o.jsx(mp, { blockId: h.id, panelId: t, cardType: h.cardType }),
      /* @__PURE__ */ o.jsxs("div", { style: {
        display: "flex",
        gap: "12px",
        flexWrap: "wrap",
        alignItems: "center"
      }, children: [
        /* @__PURE__ */ o.jsx(Ht, { label: "类型", value: h.cardType }),
        /* @__PURE__ */ o.jsx(Ht, { label: "到期", value: bp(h.due) }),
        /* @__PURE__ */ o.jsx(
          Ht,
          {
            label: "调度",
            value: `Prio ${h.priority} · ${wp(h.intervalDays)} · 推后${h.postponeCount}`
          }
        ),
        /* @__PURE__ */ o.jsx(
          Ht,
          {
            label: "状态",
            value: `${h.stage} · ${h.lastAction}`
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      gap: "8px",
      flexWrap: "wrap"
    }, children: [
      /* @__PURE__ */ o.jsx(tt, { variant: "solid", onClick: C, style: v, children: S ? "已读" : $ ? "下一张" : "标记已读" }),
      $ ? null : /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
        /* @__PURE__ */ o.jsx(tt, { variant: "plain", onClick: () => O("forward"), style: v, children: "靠前" }),
        /* @__PURE__ */ o.jsx(tt, { variant: "plain", onClick: () => O("back"), style: v, children: "靠后" }),
        S && /* @__PURE__ */ o.jsx(tt, { variant: "plain", onClick: E, style: v, children: "优先级切换" }),
        !S && /* @__PURE__ */ o.jsx(
          Dn,
          {
            text: "确认进入制卡模式？将移除 #card 标签并清除 SRS/IR 状态，便于重新制卡。",
            onConfirm: async (D, m) => {
              await j(), m();
            },
            children: (D) => /* @__PURE__ */ o.jsx(tt, { variant: "plain", onClick: D, style: v, children: "制卡" })
          }
        ),
        /* @__PURE__ */ o.jsx(tt, { variant: "plain", onClick: B, style: v, children: "推后" }),
        /* @__PURE__ */ o.jsx(
          Dn,
          {
            text: "确认读完当前卡片？将移除 #card 标签并清除 SRS/IR 状态。",
            onConfirm: async (D, m) => {
              await M(), m();
            },
            children: (D) => /* @__PURE__ */ o.jsx(tt, { variant: "plain", onClick: D, style: v, children: "读完" })
          }
        )
      ] }),
      /* @__PURE__ */ o.jsx(tt, { variant: "plain", onClick: z, style: v, children: "删除" })
    ] }),
    /* @__PURE__ */ o.jsx("div", { style: {
      flex: 1,
      border: "1px solid var(--orca-color-border-1)",
      borderRadius: "8px",
      padding: "12px",
      background: "var(--orca-color-bg-1)"
    }, children: /* @__PURE__ */ o.jsx(
      vp,
      {
        panelId: t,
        blockId: h.id,
        blockLevel: 0,
        indentLevel: 0
      }
    ) })
  ] }) : null;
}
const { useEffect: bs, useState: Er } = window.React, { BlockShell: Cp, Button: kp } = orca.components;
function jp(e) {
  const {
    panelId: t,
    blockId: r,
    rndId: n,
    blockLevel: a,
    indentLevel: s,
    mirrorId: i,
    initiallyCollapsed: c,
    renderingMode: d
  } = e, [l, x] = Er([]), [u, f] = Er(!0), [p, g] = Er(null), [y, v] = Er("orca-srs"), [h, S] = Er({
    dailyLimit: 0,
    totalDueCount: 0,
    overflowCount: 0,
    enableOverflowDefer: !0
  });
  bs(() => {
    $();
  }, [r]), bs(() => {
    const E = (O) => {
      const j = O, B = j == null ? void 0 : j.detail;
      B != null && B.pluginName && B.pluginName !== y || $();
    };
    return window.addEventListener("orca-srs:ir-session-focus", E), () => {
      window.removeEventListener("orca-srs:ir-session-focus", E);
    };
  }, [y, r]);
  const $ = async () => {
    f(!0), g(null);
    try {
      const { getPluginName: E } = await Promise.resolve().then(() => He), O = typeof E == "function" ? E() : "orca-srs";
      v(O);
      const { collectIRCards: j, buildIRQueue: B } = await Promise.resolve().then(() => Ss), { getIncrementalReadingSettings: z } = await Promise.resolve().then(() => Aa), M = await j(O), R = z(O), A = await B(M, {
        topicQuotaPercent: R.topicQuotaPercent,
        dailyLimit: R.dailyLimit
      }), T = await lp(O), w = (() => {
        if (!T) return A;
        const N = M.find((_) => _.id === T);
        if (!N) return A;
        const F = A.filter((_) => _.id !== T), D = [N, ...F], m = R.dailyLimit;
        return typeof m == "number" && m > 0 && D.length > m ? D.slice(0, m) : D;
      })();
      x(w), S({
        dailyLimit: R.dailyLimit,
        totalDueCount: M.length,
        overflowCount: R.dailyLimit > 0 ? Math.max(0, M.length - A.length) : 0,
        enableOverflowDefer: R.enableAutoDefer
      });
    } catch (E) {
      console.error("[IR Session Renderer] 加载阅读队列失败:", E), g(E instanceof Error ? E.message : `${E}`), orca.notify("error", "加载渐进阅读队列失败", { title: "渐进阅读" });
    } finally {
      f(!1);
    }
  }, k = () => {
    orca.nav.close(t);
  }, C = async () => {
    try {
      const E = y, { collectIRCards: O, buildIRQueue: j, deferIROverflow: B } = await Promise.resolve().then(() => Ss), { getIncrementalReadingSettings: z } = await Promise.resolve().then(() => Aa), M = await O(E), R = z(E), A = await j(M, {
        topicQuotaPercent: R.topicQuotaPercent,
        dailyLimit: R.dailyLimit
      }), { deferredCount: T } = await B(M, A, { now: /* @__PURE__ */ new Date() });
      return await $(), T;
    } catch (E) {
      throw console.error("[IR Session Renderer] 溢出推后失败:", E), E;
    }
  }, P = () => u ? /* @__PURE__ */ o.jsx("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    fontSize: "14px",
    color: "var(--orca-color-text-2)"
  }, children: "加载渐进阅读队列中..." }) : p ? /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "24px",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center"
  }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: { color: "var(--orca-color-danger-5)" }, children: [
      "加载失败：",
      p
    ] }),
    /* @__PURE__ */ o.jsx(kp, { variant: "solid", onClick: $, children: "重试" })
  ] }) : /* @__PURE__ */ o.jsx(Xe, { componentName: "渐进阅读会话", errorTitle: "渐进阅读会话加载出错", children: /* @__PURE__ */ o.jsx(
    Sp,
    {
      cards: l,
      panelId: t,
      pluginName: y,
      dailyLimit: h.dailyLimit,
      totalDueCount: h.totalDueCount,
      overflowCount: h.overflowCount,
      enableOverflowDefer: h.enableOverflowDefer,
      onDeferOverflow: C,
      onClose: k
    }
  ) });
  return /* @__PURE__ */ o.jsx(
    Cp,
    {
      panelId: t,
      blockId: r,
      rndId: n,
      mirrorId: i,
      blockLevel: a,
      indentLevel: s,
      initiallyCollapsed: c,
      renderingMode: d,
      reprClassName: "srs-ir-session",
      contentClassName: "srs-ir-session-content",
      contentJsx: P(),
      childrenJsx: null
    }
  );
}
function Ar(e) {
  return new Date(e.getFullYear(), e.getMonth(), e.getDate());
}
async function Bi(e) {
  const t = ["card", "Card"];
  let r = [];
  for (const a of t)
    try {
      const s = await orca.invokeBackend("get-blocks-with-tags", [a]);
      s && s.length > 0 && (r = [...r, ...s]);
    } catch (s) {
      console.log(`[${e}] collectTaggedBlocks: 查询标签 "${a}" 失败:`, s);
    }
  const n = /* @__PURE__ */ new Map();
  for (const a of r)
    n.set(a.id, a);
  if (r = Array.from(n.values()), r.length === 0) {
    console.log(`[${e}] collectTaggedBlocks: 直接查询无结果，使用备用方案`);
    try {
      r = (await orca.invokeBackend("get-all-blocks") || []).filter((s) => !s.refs || s.refs.length === 0 ? !1 : s.refs.some((i) => i.type === 2 && ve(i.alias))), console.log(`[${e}] collectTaggedBlocks: 手动过滤找到 ${r.length} 个带 #card 标签的块`);
    } catch (a) {
      console.error(`[${e}] collectTaggedBlocks 备用方案失败:`, a), r = [];
    }
  }
  return r;
}
async function Ai(e, t = "srs-plugin") {
  const r = Ar(/* @__PURE__ */ new Date()).getTime(), n = [];
  for (const a of e) {
    const s = je(a);
    if (!(s !== "topic" && s !== "extracts"))
      try {
        await Jr(a.id);
        const i = await qe(a.id), c = !i.lastRead;
        Ar(i.due).getTime() <= r && n.push({
          id: a.id,
          cardType: s,
          priority: i.priority,
          position: i.position,
          due: i.due,
          intervalDays: i.intervalDays,
          postponeCount: i.postponeCount,
          stage: i.stage,
          lastAction: i.lastAction,
          lastRead: i.lastRead,
          readCount: i.readCount,
          isNew: c,
          resumeBlockId: i.resumeBlockId
        });
      } catch (i) {
        console.error(`[${t}] collectIRCardsFromBlocks: 处理块 #${a.id} 失败:`, i);
      }
  }
  return n;
}
async function Pi(e, t = "srs-plugin") {
  const r = [];
  for (const n of e) {
    const a = je(n);
    if (!(a !== "topic" && a !== "extracts"))
      try {
        await Jr(n.id);
        const s = await qe(n.id), i = !s.lastRead;
        r.push({
          id: n.id,
          cardType: a,
          priority: s.priority,
          position: s.position,
          due: s.due,
          intervalDays: s.intervalDays,
          postponeCount: s.postponeCount,
          stage: s.stage,
          lastAction: s.lastAction,
          lastRead: s.lastRead,
          readCount: s.readCount,
          isNew: i,
          resumeBlockId: s.resumeBlockId
        });
      } catch (s) {
        console.error(`[${t}] collectAllIRCardsFromBlocks: 处理块 #${n.id} 失败:`, s);
      }
  }
  return r;
}
async function Rp(e = "srs-plugin") {
  try {
    const t = await Bi(e);
    return await Ai(t, e);
  } catch (t) {
    return console.error(`[${e}] collectIRCards 失败:`, t), orca.notify("error", "渐进阅读卡片收集失败", { title: "渐进阅读" }), [];
  }
}
async function Li(e = "srs-plugin") {
  try {
    const t = await Bi(e);
    return await Pi(t, e);
  } catch (t) {
    return console.error(`[${e}] collectAllIRCards 失败:`, t), orca.notify("error", "渐进阅读卡片收集失败", { title: "渐进阅读" }), [];
  }
}
function $p(e, t) {
  if (e.priority !== t.priority) return t.priority - e.priority;
  const r = e.due.getTime() - t.due.getTime();
  if (r !== 0) return r;
  const n = e.position ?? Number.POSITIVE_INFINITY, a = t.position ?? Number.POSITIVE_INFINITY;
  return n !== a ? n - a : e.id - t.id;
}
function Dp(e, t) {
  const r = e.due.getTime() - t.due.getTime();
  return r !== 0 ? r : e.priority !== t.priority ? t.priority - e.priority : e.id - t.id;
}
function Oi(e) {
  return [...e].sort($p);
}
function Fi(e) {
  return [...e].sort(Dp);
}
function Tp(e, t) {
  const r = typeof e == "number" && Number.isFinite(e) ? e : t;
  return Math.min(100, Math.max(0, r));
}
function Ep(e, t) {
  const r = typeof e == "number" && Number.isFinite(e) ? e : t;
  return Math.max(0, Math.floor(r));
}
function ws(e, t, r) {
  if (r <= 0) return [...t];
  if (r >= 1) return [...e];
  const n = [];
  let a = 0, s = 0;
  for (; a < e.length || s < t.length; ) {
    if (a >= e.length) {
      n.push(t[s++]);
      continue;
    }
    if (s >= t.length) {
      n.push(e[a++]);
      continue;
    }
    a / Math.max(1, a + s) < r ? n.push(e[a++]) : n.push(t[s++]);
  }
  return n;
}
function _p(e, t) {
  let r = Number.NEGATIVE_INFINITY;
  for (const n of e)
    typeof n.position == "number" && Number.isFinite(n.position) && n.position > r && (r = n.position);
  return Number.isFinite(r) ? r : t;
}
async function zp(e, t, r, n) {
  if (e.length === 0 && t.length === 0) return;
  const a = (d, l) => Math.min(d === "extracts" ? 30 : 60, Math.max(1, l)), s = [];
  e.forEach((d, l) => {
    const x = n + l + 1, u = Fn("topic", d.priority), f = a("topic", u), p = Gt(r, f);
    s.push(lt(d.id, {
      priority: d.priority,
      lastRead: d.lastRead,
      readCount: d.readCount,
      due: p,
      intervalDays: f,
      postponeCount: d.postponeCount + 1,
      stage: d.stage,
      lastAction: "autoPostpone",
      position: x,
      resumeBlockId: d.resumeBlockId
    }));
  }), t.forEach((d) => {
    const l = Fn("extracts", d.priority), x = a("extracts", l), u = Gt(r, x);
    s.push(lt(d.id, {
      priority: d.priority,
      lastRead: d.lastRead,
      readCount: d.readCount,
      due: u,
      intervalDays: x,
      postponeCount: d.postponeCount + 1,
      stage: d.stage,
      lastAction: "autoPostpone",
      position: d.position,
      resumeBlockId: d.resumeBlockId
    }));
  });
  const c = (await Promise.allSettled(s)).filter((d) => d.status === "rejected");
  c.length > 0 && console.warn("[IR] 溢出推后失败", { failed: c.length });
}
async function Vn(e, t = {}) {
  const r = Oi(e.filter(($) => $.cardType === "topic")), n = Fi(e.filter(($) => $.cardType === "extracts")), a = Tp(
    t.topicQuotaPercent,
    Qr
  ), s = Ep(t.dailyLimit, Xr), i = a / 100;
  if (s <= 0)
    return ws(r, n, i);
  const c = r.length + n.length, d = Math.min(s, c), l = t.now ?? /* @__PURE__ */ new Date(), x = Ar(l).getTime(), u = n.filter(($) => Ar($.due).getTime() < x), f = n.filter(($) => Ar($.due).getTime() >= x), p = u.slice(0, d);
  let g = d - p.length;
  const y = Math.min(
    r.length,
    Math.max(0, Math.round(d * i))
  ), v = r.slice(0, Math.min(y, g));
  g -= v.length;
  const h = f.slice(0, g);
  if (g -= h.length, g > 0) {
    const $ = r.slice(v.length, v.length + g);
    v.push(...$), g -= $.length;
  }
  return [
    ...p,
    ...ws(v, h, i)
  ];
}
async function Wi(e, t, r = {}) {
  const n = Oi(e.filter((u) => u.cardType === "topic")), a = Fi(e.filter((u) => u.cardType === "extracts")), s = new Set(t.map((u) => u.id)), i = n.filter((u) => !s.has(u.id)), c = a.filter((u) => !s.has(u.id)), d = i.length + c.length;
  if (d === 0) return { deferredCount: 0 };
  const l = r.now ?? /* @__PURE__ */ new Date(), x = _p(n, Date.now());
  try {
    await zp(i, c, l, x);
  } catch (u) {
    console.warn("[IR] 溢出推后异常:", u);
  }
  return { deferredCount: d };
}
const Ss = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  buildIRQueue: Vn,
  collectAllIRCards: Li,
  collectAllIRCardsFromBlocks: Pi,
  collectIRCards: Rp,
  collectIRCardsFromBlocks: Ai,
  deferIROverflow: Wi
}, Symbol.toStringTag, { value: "Module" })), Cs = [
  "已逾期",
  "今天",
  "明天",
  "未来7天",
  "新卡",
  "7天后"
], Ip = {
  已逾期: !0,
  今天: !0,
  明天: !0,
  未来7天: !0,
  新卡: !0,
  "7天后": !1
}, Mp = 24 * 60 * 60 * 1e3;
function ks(e) {
  return new Date(e.getFullYear(), e.getMonth(), e.getDate());
}
function Hi(e, t = /* @__PURE__ */ new Date()) {
  if (e.isNew)
    return "新卡";
  const r = ks(t), n = ks(e.due), a = Math.floor((n.getTime() - r.getTime()) / Mp);
  return a < 0 ? "已逾期" : a === 0 ? "今天" : a === 1 ? "明天" : a <= 7 ? "未来7天" : "7天后";
}
function Bp(e, t = /* @__PURE__ */ new Date()) {
  const r = new Map(Cs.map((n) => [n, []]));
  for (const n of e) {
    const a = Hi(n, t), s = r.get(a);
    s && s.push(n);
  }
  return Cs.map((n) => {
    const a = r.get(n) ?? [];
    return a.sort((s, i) => s.due.getTime() - i.due.getTime()), {
      key: n,
      title: n,
      cards: a
    };
  }).filter((n) => n.cards.length > 0);
}
function Ap(e, t = /* @__PURE__ */ new Date()) {
  let r = 0, n = 0, a = 0, s = 0;
  for (const i of e) {
    const c = Hi(i, t);
    c === "新卡" ? r += 1 : c === "已逾期" ? n += 1 : c === "今天" ? a += 1 : (c === "明天" || c === "未来7天") && (s += 1);
  }
  return {
    total: e.length,
    newCount: r,
    overdueCount: n,
    todayCount: a,
    upcoming7Count: s
  };
}
let $t = null;
const Gn = "incrementalReadingManagerBlockId";
async function Pp(e) {
  if ($t && await js($t))
    return $t;
  const t = await orca.plugins.getData(e, Gn);
  if (typeof t == "number" && await js(t))
    return $t = t, t;
  const r = await Lp(e);
  return await orca.plugins.setData(e, Gn, r), $t = r, r;
}
async function Lp(e) {
  var n;
  const t = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [{ t: "t", v: `[渐进阅读管理面板 - ${e}]` }],
    { type: "srs.ir-manager" }
  );
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [t],
    [
      { name: "ir.isManagerBlock", value: !0, type: 4 },
      { name: "ir.pluginName", value: e, type: 2 }
    ]
  );
  const r = (n = orca.state.blocks) == null ? void 0 : n[t];
  return r && (r._repr = {
    type: "srs.ir-manager"
  }), console.log(`[${e}] 创建渐进阅读管理面板块: #${t}`), t;
}
async function Op(e) {
  var t, r;
  if ($t) {
    const n = (t = orca.state.blocks) == null ? void 0 : t[$t];
    n && ((r = n._repr) == null ? void 0 : r.type) === "srs.ir-manager" && delete n._repr, $t = null;
  }
  await orca.plugins.removeData(e, Gn);
}
async function Fp(e) {
  var t;
  try {
    const r = orca.state.activePanel;
    if (!r) {
      orca.notify("warn", "当前没有可用的面板", { title: "渐进阅读" });
      return;
    }
    const n = await Pp(e), a = orca.state.panels;
    for (const [s, i] of Object.entries(a))
      if (((t = i.viewArgs) == null ? void 0 : t.blockId) === n) {
        orca.nav.switchFocusTo(s);
        return;
      }
    orca.nav.goTo("block", { blockId: n }, r), orca.notify("success", "渐进阅读管理面板已打开", { title: "渐进阅读" });
  } catch (r) {
    console.error(`[${e}] 打开渐进阅读管理面板失败:`, r), orca.notify("error", "打开渐进阅读管理面板失败", { title: "渐进阅读" });
  }
}
async function js(e) {
  var r;
  const t = (r = orca.state.blocks) == null ? void 0 : r[e];
  if (t) return t;
  try {
    return await orca.invokeBackend("get-block", e);
  } catch (n) {
    return console.warn("[ir-manager] 无法从后端获取管理面板块:", n), null;
  }
}
const { useMemo: Wp } = window.React;
function Hp({ cards: e }) {
  const t = Wp(() => Ap(e), [e]), r = t.overdueCount + t.todayCount;
  return /* @__PURE__ */ o.jsxs("div", { style: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: "12px"
  }, children: [
    /* @__PURE__ */ o.jsxs("div", { style: {
      padding: "14px",
      borderRadius: "10px",
      border: "1px solid var(--orca-color-border-1)",
      backgroundColor: "var(--orca-color-bg-1)"
    }, children: [
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)" }, children: "总卡片数" }),
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "22px", fontWeight: 700, color: "var(--orca-color-text-1)" }, children: t.total })
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      padding: "14px",
      borderRadius: "10px",
      border: "1px solid var(--orca-color-primary-3)",
      backgroundColor: "var(--orca-color-primary-1)"
    }, children: [
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "12px", color: "var(--orca-color-primary-6)" }, children: "新卡" }),
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "22px", fontWeight: 700, color: "var(--orca-color-primary-6)" }, children: t.newCount })
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      padding: "14px",
      borderRadius: "10px",
      border: "1px solid var(--orca-color-danger-5)",
      backgroundColor: "var(--orca-color-danger-1)"
    }, children: [
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "12px", color: "var(--orca-color-danger-6)" }, children: "到期（已逾期+今天）" }),
      /* @__PURE__ */ o.jsx("div", { style: {
        fontSize: "28px",
        fontWeight: 700,
        color: "var(--orca-color-danger-6)"
      }, children: r }),
      /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)" }, children: [
        /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-danger-6)" }, children: [
          "已逾期 ",
          t.overdueCount
        ] }),
        /* @__PURE__ */ o.jsx("span", { style: { margin: "0 6px" }, children: "/" }),
        /* @__PURE__ */ o.jsxs("span", { style: { color: "var(--orca-color-warning-6)" }, children: [
          "今天 ",
          t.todayCount
        ] })
      ] })
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: {
      padding: "14px",
      borderRadius: "10px",
      border: "1px solid var(--orca-color-warning-3)",
      backgroundColor: "var(--orca-color-warning-1)"
    }, children: [
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "12px", color: "var(--orca-color-warning-6)" }, children: "未来7天到期" }),
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "22px", fontWeight: 700, color: "var(--orca-color-warning-6)" }, children: t.upcoming7Count })
    ] })
  ] });
}
const { useCallback: Rs, useEffect: Np, useMemo: Yp, useState: $s } = window.React, { Button: Tn } = orca.components, En = 20, qp = {
  已逾期: {
    borderColor: "var(--orca-color-danger-5)",
    labelColor: "var(--orca-color-danger-6)",
    labelBg: "var(--orca-color-danger-1)",
    itemBg: "var(--orca-color-bg-1)"
  },
  今天: {
    borderColor: "var(--orca-color-warning-5)",
    labelColor: "var(--orca-color-warning-6)",
    labelBg: "var(--orca-color-warning-1)",
    itemBg: "var(--orca-color-bg-1)"
  },
  明天: {
    borderColor: "var(--orca-color-warning-4)",
    labelColor: "var(--orca-color-warning-6)",
    labelBg: "var(--orca-color-warning-1)",
    itemBg: "var(--orca-color-warning-1)"
  },
  未来7天: {
    borderColor: "var(--orca-color-border-1)",
    labelColor: "var(--orca-color-text-2)",
    labelBg: "var(--orca-color-bg-2)"
  },
  新卡: {
    borderColor: "var(--orca-color-primary-4)",
    labelColor: "var(--orca-color-primary-6)",
    labelBg: "var(--orca-color-primary-1)"
  },
  "7天后": {
    borderColor: "var(--orca-color-border-1)",
    labelColor: "var(--orca-color-text-3)",
    labelBg: "var(--orca-color-bg-2)",
    itemText: "var(--orca-color-text-3)"
  }
};
function Kp(e) {
  const t = e.getMonth() + 1, r = e.getDate();
  return `${t}-${r}`;
}
function Up(e) {
  if (!Number.isFinite(e)) return "-";
  const t = Math.round(e * 100) / 100;
  return Number.isInteger(t) ? `${t}d` : `${t}d`;
}
function Vp(e, t) {
  var n;
  const r = (n = orca.state.blocks) == null ? void 0 : n[e];
  return r != null && r.text ? r.text : t[e] ?? "(无标题)";
}
function Gp(e, t) {
  return e.length <= t ? e : `${e.slice(0, t)}…`;
}
function Jp({
  cards: e,
  expandedGroups: t,
  onCardClick: r,
  onToggleGroup: n,
  onAdvanceLearn: a,
  advancingIds: s
}) {
  const [i, c] = $s({}), [d, l] = $s({}), x = Rs((p) => d[p] ?? En, [d]), u = Rs((p) => {
    l((g) => ({
      ...g,
      [p]: (g[p] ?? En) + En
    }));
  }, []);
  Np(() => {
    let p = !1;
    return (async () => {
      const y = Array.from(new Set(
        e.map((v) => v.id).filter((v) => {
          var h, S;
          return !i[v] && !((S = (h = orca.state.blocks) == null ? void 0 : h[v]) != null && S.text);
        })
      ));
      if (y.length !== 0)
        try {
          const v = [];
          for (let S = 0; S < y.length; S += 200) {
            const $ = y.slice(S, S + 200), k = await orca.invokeBackend("get-blocks", $), C = /* @__PURE__ */ new Map();
            for (const P of k ?? [])
              C.set(P.id, P);
            for (const P of $) {
              const E = C.get(P);
              v.push({ id: P, text: (E == null ? void 0 : E.text) || "(无标题)" });
            }
          }
          if (p) return;
          c((S) => {
            const $ = { ...S };
            for (const k of v)
              $[k.id] = k.text;
            return $;
          });
        } catch (v) {
          console.warn("[IR Manager] 读取块标题失败:", v);
        }
    })(), () => {
      p = !0;
    };
  }, [e, i]);
  const f = Yp(() => Bp(e), [e]);
  return f.length === 0 ? /* @__PURE__ */ o.jsx("div", { style: {
    padding: "24px",
    textAlign: "center",
    color: "var(--orca-color-text-3)"
  }, children: "暂无渐进阅读卡片" }) : /* @__PURE__ */ o.jsx("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: f.map((p) => {
    const g = qp[p.key], y = t[p.key], v = p.key === "明天" || p.key === "未来7天" || p.key === "新卡" || p.key === "7天后";
    return /* @__PURE__ */ o.jsxs(
      "div",
      {
        style: {
          border: `1px solid ${g.borderColor}`,
          borderRadius: "10px",
          padding: "12px",
          backgroundColor: "var(--orca-color-bg-1)"
        },
        children: [
          /* @__PURE__ */ o.jsxs("div", { style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px"
          }, children: [
            /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
              /* @__PURE__ */ o.jsx("span", { style: {
                padding: "2px 10px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 600,
                color: g.labelColor,
                backgroundColor: g.labelBg
              }, children: p.title }),
              /* @__PURE__ */ o.jsxs("span", { style: { fontSize: "12px", color: "var(--orca-color-text-3)" }, children: [
                p.cards.length,
                " 张"
              ] })
            ] }),
            /* @__PURE__ */ o.jsx(
              Tn,
              {
                variant: "plain",
                onClick: () => n(p.key),
                style: { padding: "2px 8px" },
                children: /* @__PURE__ */ o.jsx("i", { className: `ti ${y ? "ti-chevron-down" : "ti-chevron-right"}` })
              }
            )
          ] }),
          y && (() => {
            const h = x(p.key), S = p.cards.slice(0, h), $ = p.cards.length > h, k = p.cards.length - h;
            return /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "10px" }, children: [
              S.map((C) => {
                const P = Gp(Vp(C.id, i), 50), E = !!(a && v), O = !!(s != null && s[String(C.id)]);
                return /* @__PURE__ */ o.jsxs(
                  "div",
                  {
                    onClick: () => r(C.id),
                    style: {
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "10px",
                      border: `1px solid ${g.borderColor}`,
                      borderRadius: "8px",
                      padding: "10px",
                      backgroundColor: g.itemBg ?? "var(--orca-color-bg-1)",
                      color: g.itemText ?? "var(--orca-color-text-1)",
                      cursor: "pointer"
                    },
                    title: "点击在侧面板打开",
                    children: [
                      /* @__PURE__ */ o.jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [
                        /* @__PURE__ */ o.jsx(
                          "div",
                          {
                            style: {
                              fontSize: "14px",
                              fontWeight: 600,
                              color: g.itemText ?? "var(--orca-color-text-1)"
                            },
                            children: P
                          }
                        ),
                        /* @__PURE__ */ o.jsxs("div", { style: {
                          marginTop: "6px",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "12px",
                          fontSize: "12px",
                          color: g.itemText ?? "var(--orca-color-text-3)"
                        }, children: [
                          /* @__PURE__ */ o.jsxs("span", { children: [
                            "类型：",
                            C.cardType
                          ] }),
                          /* @__PURE__ */ o.jsxs("span", { children: [
                            "到期：",
                            Kp(C.due)
                          ] }),
                          /* @__PURE__ */ o.jsxs("span", { children: [
                            "已读：",
                            C.readCount
                          ] }),
                          /* @__PURE__ */ o.jsxs("span", { children: [
                            "调度：Prio ",
                            C.priority,
                            " · ",
                            Up(C.intervalDays),
                            " · 推后",
                            C.postponeCount
                          ] }),
                          /* @__PURE__ */ o.jsxs("span", { children: [
                            "状态：",
                            C.stage,
                            " · ",
                            C.lastAction
                          ] })
                        ] })
                      ] }),
                      E ? /* @__PURE__ */ o.jsx("div", { style: { flexShrink: 0 }, children: /* @__PURE__ */ o.jsx(
                        Tn,
                        {
                          variant: "outline",
                          onClick: (j) => {
                            j.stopPropagation(), a == null || a(C.id);
                          },
                          style: {
                            padding: "4px 10px",
                            borderRadius: "999px",
                            fontSize: "12px",
                            ...O ? { opacity: 0.6, pointerEvents: "none" } : void 0
                          },
                          children: "提前学"
                        }
                      ) }) : null
                    ]
                  },
                  C.id
                );
              }),
              $ && /* @__PURE__ */ o.jsxs(
                Tn,
                {
                  variant: "plain",
                  onClick: () => u(p.key),
                  style: {
                    width: "100%",
                    padding: "8px",
                    marginTop: "4px",
                    borderRadius: "6px",
                    border: "1px dashed var(--orca-color-border-2)",
                    color: "var(--orca-color-text-2)"
                  },
                  children: [
                    "加载更多（剩余 ",
                    k,
                    " 张）"
                  ]
                }
              )
            ] });
          })()
        ]
      },
      p.key
    );
  }) });
}
const { useCallback: fr, useEffect: Ni, useMemo: Qp, useRef: Yi, useState: Fe } = window.React, { BlockShell: Xp, Button: Kt, ConfirmBox: qi } = orca.components;
function Zp(e) {
  if (!Number.isFinite(e)) return Qr;
  const t = Math.round(e);
  return t < 0 ? 0 : t > 100 ? 100 : t;
}
function ex(e) {
  if (!Number.isFinite(e)) return Xr;
  const t = Math.round(e);
  return t < 0 ? 0 : t;
}
function So(e) {
  return new Date(e.getFullYear(), e.getMonth(), e.getDate());
}
function tx({ pluginName: e }) {
  const [t, r] = Fe(!1), [n, a] = Fe(null), [s, i] = Fe(!1), [c, d] = Fe(!1), [l, x] = Fe(!1), [u, f] = Fe(""), [p, g] = Fe(""), y = Yi(null), v = fr(async () => {
    i(!0);
    try {
      const j = dt(e);
      a(j), f(String(j.topicQuotaPercent)), g(String(j.dailyLimit)), y.current = j;
    } catch (j) {
      console.error("[IR Manager] 加载渐进阅读设置失败:", j), orca.notify("error", "加载渐进阅读设置失败", { title: "渐进阅读" });
    } finally {
      i(!1);
    }
  }, [e]);
  Ni(() => {
    t && v();
  }, [t, v]);
  const h = fr(async (j, B = {}) => {
    if (e && Object.keys(j).length !== 0) {
      d(!0);
      try {
        const z = {};
        j.enableAutoExtractMark !== void 0 && (z[Ce.enableAutoExtractMark] = j.enableAutoExtractMark), j.topicQuotaPercent !== void 0 && (z[Ce.topicQuotaPercent] = j.topicQuotaPercent), j.dailyLimit !== void 0 && (z[Ce.dailyLimit] = j.dailyLimit), j.enableAutoDefer !== void 0 && (z[Ce.enableAutoDefer] = j.enableAutoDefer), await orca.plugins.setSettings("app", e, z);
        const M = {
          ...n ?? dt(e),
          ...j
        };
        a(M), y.current = M, j.enableAutoExtractMark !== void 0 && (j.enableAutoExtractMark ? ua(e) : an(e)), B.notify && orca.notify("success", "渐进阅读设置已保存", { title: "渐进阅读" });
      } catch (z) {
        console.error("[IR Manager] 保存渐进阅读设置失败:", z), orca.notify("error", `保存渐进阅读设置失败: ${z}`, { title: "渐进阅读" });
        const M = y.current;
        M && (a(M), f(String(M.topicQuotaPercent)), g(String(M.dailyLimit)));
      } finally {
        d(!1);
      }
    }
  }, [e, n]), S = {
    border: "1px solid var(--orca-color-border-1)",
    backgroundColor: "var(--orca-color-bg-1)",
    borderRadius: "12px",
    padding: "14px",
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  }, $ = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px"
  }, k = {
    fontSize: "12px",
    color: "var(--orca-color-text-2)",
    fontWeight: 600,
    letterSpacing: "0.02em"
  }, C = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid var(--orca-color-border-1)",
    backgroundColor: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: "14px",
    outline: "none"
  }, P = c || l ? { opacity: 0.6, pointerEvents: "none" } : void 0, E = {
    enableAutoExtractMark: it[Ce.enableAutoExtractMark].defaultValue,
    topicQuotaPercent: it[Ce.topicQuotaPercent].defaultValue,
    dailyLimit: it[Ce.dailyLimit].defaultValue,
    enableAutoDefer: it[Ce.enableAutoDefer].defaultValue
  }, O = fr(async () => {
    if (e) {
      x(!0);
      try {
        const { resetIncrementalReadingData: j } = await Promise.resolve().then(() => Kg), B = await j(e, { disableAutoExtractMark: !0 });
        B.errors.length > 0 ? (orca.notify(
          "warn",
          `已清理 ${B.totalCleaned}/${B.totalFound} 个 Topic/Extracts；失败 ${B.errors.length} 个（详见控制台）`,
          { title: "渐进阅读" }
        ), console.warn("[IR Reset] errors:", B.errors)) : orca.notify(
          "success",
          `已清理 ${B.totalCleaned} 个 Topic/Extracts（#card + srs.* + ir.*）`,
          { title: "渐进阅读" }
        ), await v();
      } catch (j) {
        console.error("[IR Manager] 清空 IR 数据失败:", j), orca.notify("error", `清空 IR 数据失败: ${j}`, { title: "渐进阅读" });
      } finally {
        x(!1);
      }
    }
  }, [e, v]);
  return /* @__PURE__ */ o.jsxs("div", { style: S, children: [
    /* @__PURE__ */ o.jsxs(
      "div",
      {
        style: {
          ...$,
          cursor: "pointer",
          userSelect: "none"
        },
        onClick: () => r((j) => !j),
        children: [
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", alignItems: "center", gap: "10px" }, children: [
            /* @__PURE__ */ o.jsx(
              "i",
              {
                className: t ? "ti ti-chevron-down" : "ti ti-chevron-right",
                style: { fontSize: "16px", color: "var(--orca-color-text-3)" }
              }
            ),
            /* @__PURE__ */ o.jsxs("div", { children: [
              /* @__PURE__ */ o.jsx("div", { style: { fontSize: "15px", fontWeight: 700 }, children: "队列设置" }),
              /* @__PURE__ */ o.jsx("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)" }, children: t ? "这里修改的是插件设置（与插件 Settings 面板同步）" : "点击展开配置" })
            ] })
          ] }),
          t ? /* @__PURE__ */ o.jsxs(
            "div",
            {
              style: { display: "flex", gap: "8px", alignItems: "center" },
              onClick: (j) => j.stopPropagation(),
              children: [
                /* @__PURE__ */ o.jsx(
                  Kt,
                  {
                    variant: "outline",
                    onClick: () => h(E, { notify: !0 }),
                    style: P,
                    children: "恢复默认"
                  }
                ),
                /* @__PURE__ */ o.jsx(
                  Kt,
                  {
                    variant: "plain",
                    onClick: v,
                    style: P,
                    title: "重新读取当前设置",
                    children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-refresh" })
                  }
                )
              ]
            }
          ) : null
        ]
      }
    ),
    t ? s || !n ? /* @__PURE__ */ o.jsx("div", { style: { fontSize: "13px", color: "var(--orca-color-text-2)" }, children: "加载设置中..." }) : /* @__PURE__ */ o.jsx("div", { style: P, children: /* @__PURE__ */ o.jsxs("div", { style: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
      gap: "12px"
    }, children: [
      /* @__PURE__ */ o.jsxs("div", { style: {
        border: "1px solid var(--orca-color-border-1)",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "12px",
        padding: "12px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }, children: [
        /* @__PURE__ */ o.jsx("div", { style: k, children: "启用渐进阅读自动标签" }),
        /* @__PURE__ */ o.jsxs("label", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
          /* @__PURE__ */ o.jsx(
            "input",
            {
              type: "checkbox",
              checked: n.enableAutoExtractMark,
              onChange: (j) => {
                h({ enableAutoExtractMark: j.currentTarget.checked }, { notify: !0 });
              }
            }
          ),
          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "13px", color: "var(--orca-color-text-1)" }, children: "自动为 Topic 的子块标记为 Extract" })
        ] }),
        /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)", lineHeight: 1.4 }, children: [
          "启用后会监听块变化：Topic 的直接子块会自动补齐 ",
          /* @__PURE__ */ o.jsx("code", { children: "#card" }),
          " 并设置 ",
          /* @__PURE__ */ o.jsx("code", { children: "type=extracts" }),
          "。"
        ] })
      ] }),
      /* @__PURE__ */ o.jsxs("div", { style: {
        border: "1px solid var(--orca-color-border-1)",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "12px",
        padding: "12px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }, children: [
        /* @__PURE__ */ o.jsx("div", { style: k, children: "Topic 配额比例（%）" }),
        /* @__PURE__ */ o.jsx(
          "input",
          {
            type: "number",
            min: 0,
            max: 100,
            step: 1,
            value: u,
            onChange: (j) => {
              f(j.currentTarget.value);
            },
            onBlur: () => {
              const j = Zp(Number(u));
              f(String(j)), j !== n.topicQuotaPercent && h({ topicQuotaPercent: j });
            },
            style: C
          }
        ),
        /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)", lineHeight: 1.4 }, children: [
          "渐进阅读队列中 Topic 的目标占比（默认 ",
          Qr,
          "%）。"
        ] })
      ] }),
      /* @__PURE__ */ o.jsxs("div", { style: {
        border: "1px solid var(--orca-color-border-1)",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "12px",
        padding: "12px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }, children: [
        /* @__PURE__ */ o.jsx("div", { style: k, children: "每日渐进阅读上限" }),
        /* @__PURE__ */ o.jsx(
          "input",
          {
            type: "number",
            min: 0,
            step: 1,
            value: p,
            onChange: (j) => {
              g(j.currentTarget.value);
            },
            onBlur: () => {
              const j = ex(Number(p));
              g(String(j)), j !== n.dailyLimit && h({ dailyLimit: j });
            },
            style: C
          }
        ),
        /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)", lineHeight: 1.4 }, children: [
          "每天最多推送的渐进阅读卡片数量，设为 0 表示不限制（默认 ",
          Xr,
          "）。"
        ] })
      ] }),
      /* @__PURE__ */ o.jsxs("div", { style: {
        border: "1px solid var(--orca-color-border-1)",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "12px",
        padding: "12px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }, children: [
        /* @__PURE__ */ o.jsx("div", { style: k, children: "溢出推后按钮" }),
        /* @__PURE__ */ o.jsxs("label", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
          /* @__PURE__ */ o.jsx(
            "input",
            {
              type: "checkbox",
              checked: n.enableAutoDefer,
              onChange: (j) => {
                h({ enableAutoDefer: j.currentTarget.checked }, { notify: !0 });
              }
            }
          ),
          /* @__PURE__ */ o.jsx("span", { style: { fontSize: "13px", color: "var(--orca-color-text-1)" }, children: "显示“一键把溢出推后”" })
        ] }),
        /* @__PURE__ */ o.jsx("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)", lineHeight: 1.4 }, children: "当到期卡超过每日上限时，提供手动按钮；打开面板只展示，不会自动改排期。" })
      ] }),
      /* @__PURE__ */ o.jsxs("div", { style: {
        border: "1px solid var(--orca-color-border-1)",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "12px",
        padding: "12px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px"
      }, children: [
        /* @__PURE__ */ o.jsx("div", { style: { ...k, color: "var(--orca-color-danger-5)" }, children: "危险操作：清空 IR 数据" }),
        /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)", lineHeight: 1.4 }, children: [
          "会批量移除所有 ",
          /* @__PURE__ */ o.jsx("code", { children: "#card" }),
          " 且 ",
          /* @__PURE__ */ o.jsx("code", { children: "type=topic/extracts" }),
          " 的标签，并删除这些块上的",
          /* @__PURE__ */ o.jsx("code", { children: "srs.*" }),
          "/",
          /* @__PURE__ */ o.jsx("code", { children: "ir.*" }),
          " 属性；同时清理 IR 会话记录。不可撤销，建议先备份。"
        ] }),
        /* @__PURE__ */ o.jsx(
          qi,
          {
            text: "确认要清空所有 Topic/Extracts 的渐进阅读信息吗？这会删除 #card 标签并清理 srs.* / ir.*（不可撤销）。",
            onConfirm: async (j, B) => {
              await O(), B();
            },
            children: (j) => /* @__PURE__ */ o.jsx(
              Kt,
              {
                variant: "outline",
                onClick: j,
                style: l ? { opacity: 0.6, pointerEvents: "none" } : void 0,
                children: l ? "清理中..." : "清空 IR 数据"
              }
            )
          }
        )
      ] })
    ] }) }) : null
  ] });
}
function rx(e) {
  const {
    panelId: t,
    blockId: r,
    rndId: n,
    blockLevel: a,
    indentLevel: s,
    mirrorId: i,
    initiallyCollapsed: c,
    renderingMode: d
  } = e, [l, x] = Fe("orca-srs"), [u, f] = Fe([]), [p, g] = Fe(!0), [y, v] = Fe(null), [h, S] = Fe({
    dailyLimit: 0,
    totalDueCount: 0,
    overflowCount: 0,
    enableOverflowDefer: !0
  }), [$, k] = Fe(!1), C = Yi(/* @__PURE__ */ new Set()), [P, E] = Fe({}), [O, j] = Fe(() => ({
    ...Ip
  })), B = fr(async () => {
    const { getPluginName: F } = await Promise.resolve().then(() => He), D = typeof F == "function" ? F() : "orca-srs";
    return x(D), D;
  }, []), z = fr(async () => {
    g(!0), v(null);
    try {
      const F = await B(), D = await Li(F);
      f(D);
      const m = dt(F), _ = /* @__PURE__ */ new Date(), G = So(_).getTime(), X = D.filter((J) => J.due instanceof Date ? So(J.due).getTime() <= G : !1), pe = await Vn(X, {
        topicQuotaPercent: m.topicQuotaPercent,
        dailyLimit: m.dailyLimit,
        now: _
      });
      S({
        dailyLimit: m.dailyLimit,
        totalDueCount: X.length,
        overflowCount: m.dailyLimit > 0 ? Math.max(0, X.length - pe.length) : 0,
        enableOverflowDefer: m.enableAutoDefer
      });
    } catch (F) {
      console.error("[IR Manager] 加载卡片失败:", F), v(F instanceof Error ? F.message : String(F)), orca.notify("error", "加载渐进阅读管理面板失败", { title: "渐进阅读" });
    } finally {
      g(!1);
    }
  }, [B]);
  Ni(() => {
    z();
  }, [z]);
  const M = (F) => {
    orca.nav.openInLastPanel("block", { blockId: F });
  }, R = (F) => {
    j((D) => ({
      ...D,
      [F]: !D[F]
    }));
  }, A = fr(async (F) => {
    if (!C.current.has(F)) {
      C.current.add(F), E((D) => ({
        ...D,
        [String(F)]: !0
      }));
      try {
        await ui(F, { now: /* @__PURE__ */ new Date() }), await cp(l, F), window.dispatchEvent(new CustomEvent("orca-srs:ir-session-focus", { detail: { pluginName: l } })), await orca.commands.invokeCommand(`${l}.startIncrementalReadingSession`), await z(), orca.notify("success", "已提前到今天，并在渐进阅读会话中打开", { title: "渐进阅读" });
      } catch (D) {
        console.error("[IR Manager] 提前学失败:", D), orca.notify("error", "提前学失败", { title: "渐进阅读" });
      } finally {
        C.current.delete(F), E((D) => {
          const m = { ...D };
          return delete m[String(F)], m;
        });
      }
    }
  }, [l, z]), T = async () => {
    if (!$) {
      k(!0);
      try {
        const F = dt(l), D = /* @__PURE__ */ new Date(), m = So(D).getTime(), _ = u.filter((pe) => pe.due instanceof Date ? So(pe.due).getTime() <= m : !1), G = await Vn(_, {
          topicQuotaPercent: F.topicQuotaPercent,
          dailyLimit: F.dailyLimit,
          now: D
        }), { deferredCount: X } = await Wi(_, G, { now: D });
        await z(), X > 0 ? orca.notify("success", `已推后溢出 ${X} 张`, { title: "渐进阅读" }) : orca.notify("info", "当前没有需要推后的溢出卡片", { title: "渐进阅读" });
      } catch (F) {
        console.error("[IR Manager] 溢出推后失败:", F), orca.notify("error", "溢出推后失败", { title: "渐进阅读" });
      } finally {
        k(!1);
      }
    }
  }, w = Qp(() => /* @__PURE__ */ o.jsxs("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px"
  }, children: [
    /* @__PURE__ */ o.jsxs("div", { children: [
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "18px", fontWeight: 700 }, children: "渐进阅读管理面板" }),
      /* @__PURE__ */ o.jsx("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)" }, children: "聚焦到期与排期，浏览渐进阅读卡片" })
    ] }),
    /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "8px" }, children: [
      /* @__PURE__ */ o.jsx(Kt, { variant: "plain", onClick: z, children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-refresh" }) }),
      /* @__PURE__ */ o.jsx(Kt, { variant: "plain", onClick: () => orca.nav.close(t), children: "关闭" })
    ] })
  ] }), [z, t]), N = () => {
    const F = !!(h.enableOverflowDefer && h.dailyLimit > 0 && h.overflowCount > 0 && !p && !y), D = h.dailyLimit > 0 ? /* @__PURE__ */ o.jsx("div", { style: {
      border: "1px solid var(--orca-color-border-1)",
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "14px",
      display: "flex",
      flexDirection: "column",
      gap: "10px"
    }, children: /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }, children: [
      /* @__PURE__ */ o.jsxs("div", { children: [
        /* @__PURE__ */ o.jsx("div", { style: { fontSize: "15px", fontWeight: 700 }, children: "今日队列（只展示，不自动改排期）" }),
        /* @__PURE__ */ o.jsxs("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)" }, children: [
          "今日候选 ",
          h.totalDueCount,
          " · 上限 ",
          h.dailyLimit,
          " · 溢出 ",
          h.overflowCount
        ] })
      ] }),
      F ? /* @__PURE__ */ o.jsx(
        qi,
        {
          text: `确认把溢出（未入选今天队列）的 ${h.overflowCount} 张卡片推后吗？该操作会修改它们的排期。`,
          onConfirm: async (_, G) => {
            await T(), G();
          },
          children: (_) => /* @__PURE__ */ o.jsx(
            Kt,
            {
              variant: "outline",
              onClick: _,
              style: $ ? { opacity: 0.6, pointerEvents: "none" } : void 0,
              children: "一键把溢出推后"
            }
          )
        }
      ) : null
    ] }) }) : null, m = p ? /* @__PURE__ */ o.jsx("div", { style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "220px",
      fontSize: "14px",
      color: "var(--orca-color-text-2)"
    }, children: "加载渐进阅读卡片中..." }) : y ? /* @__PURE__ */ o.jsxs("div", { style: {
      display: "flex",
      flexDirection: "column",
      gap: "12px",
      padding: "24px",
      justifyContent: "center",
      alignItems: "center",
      textAlign: "center",
      minHeight: "220px"
    }, children: [
      /* @__PURE__ */ o.jsxs("div", { style: { color: "var(--orca-color-danger-5)" }, children: [
        "加载失败：",
        y
      ] }),
      /* @__PURE__ */ o.jsx(Kt, { variant: "solid", onClick: z, children: "重试" })
    ] }) : /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "16px" }, children: [
      D,
      /* @__PURE__ */ o.jsx(Hp, { cards: u }),
      /* @__PURE__ */ o.jsx(
        Jp,
        {
          cards: u,
          expandedGroups: O,
          onCardClick: M,
          onToggleGroup: R,
          onAdvanceLearn: A,
          advancingIds: P
        }
      )
    ] });
    return /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "16px" }, children: [
      /* @__PURE__ */ o.jsx(tx, { pluginName: l }),
      m
    ] });
  };
  return /* @__PURE__ */ o.jsx(
    Xp,
    {
      panelId: t,
      blockId: r,
      rndId: n,
      mirrorId: i,
      blockLevel: a,
      indentLevel: s,
      initiallyCollapsed: c,
      renderingMode: d,
      reprClassName: "srs-ir-manager",
      contentClassName: "srs-ir-manager-content",
      contentJsx: /* @__PURE__ */ o.jsxs("div", { style: {
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
        height: "100%",
        overflow: "auto"
      }, children: [
        w,
        /* @__PURE__ */ o.jsx(Xe, { componentName: "渐进阅读管理面板", errorTitle: "渐进阅读管理面板加载出错", children: N() })
      ] }),
      childrenJsx: null
    }
  );
}
const { useRef: ox, useState: _n } = window.React, { ModalOverlay: nx } = orca.components;
function ax({
  blockId: e,
  data: t,
  index: r
}) {
  const n = ox(null), [a, s] = _n(!1), [i, c] = _n(t.clozeNumber || 1), [d, l] = _n(t.v || ""), x = t.v || "", u = t.clozeNumber || 1, f = () => {
    c(u), l(x), s(!0);
  };
  return /* @__PURE__ */ o.jsxs(o.Fragment, { children: [
    /* @__PURE__ */ o.jsx(
      "span",
      {
        ref: n,
        className: "orca-inline srs-cloze-inline",
        "data-cloze-number": u,
        style: {
          color: "#999",
          // 浅灰色
          borderBottom: "2px solid #4a90e2",
          // 蓝色下划线
          paddingBottom: "1px",
          cursor: "text"
        },
        title: `Cloze ${u}`,
        onDoubleClick: f,
        children: x
      }
    ),
    a && /* @__PURE__ */ o.jsx(
      nx,
      {
        visible: a,
        canClose: !0,
        onClose: () => s(!1),
        className: "srs-cloze-edit-modal",
        children: /* @__PURE__ */ o.jsxs("div", { style: {
          backgroundColor: "white",
          padding: "20px",
          borderRadius: "8px",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
          minWidth: "300px"
        }, children: [
          /* @__PURE__ */ o.jsx("h3", { style: { marginBottom: "15px", fontSize: "16px" }, children: "修改填空" }),
          /* @__PURE__ */ o.jsxs("div", { style: { marginBottom: "15px" }, children: [
            /* @__PURE__ */ o.jsx("label", { style: { display: "block", marginBottom: "5px", fontSize: "14px" }, children: "序号：" }),
            /* @__PURE__ */ o.jsx(
              "input",
              {
                type: "number",
                min: "1",
                value: i,
                onChange: (p) => c(parseInt(p.target.value) || 1),
                style: {
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontSize: "14px"
                }
              }
            )
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { marginBottom: "20px" }, children: [
            /* @__PURE__ */ o.jsx("label", { style: { display: "block", marginBottom: "5px", fontSize: "14px" }, children: "填空内容：" }),
            /* @__PURE__ */ o.jsx(
              "input",
              {
                type: "text",
                value: d,
                onChange: (p) => l(p.target.value),
                style: {
                  width: "100%",
                  padding: "8px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  fontSize: "14px"
                }
              }
            )
          ] }),
          /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", gap: "10px", justifyContent: "flex-end" }, children: [
            /* @__PURE__ */ o.jsx(
              "button",
              {
                onClick: () => s(!1),
                style: {
                  padding: "8px 16px",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                  backgroundColor: "#f5f5f5",
                  cursor: "pointer",
                  fontSize: "14px"
                },
                children: "取消"
              }
            ),
            /* @__PURE__ */ o.jsx(
              "button",
              {
                onClick: async () => {
                  var p, g, y, v, h;
                  try {
                    const S = (y = (g = (p = window.orca) == null ? void 0 : p.state) == null ? void 0 : g.blocks) == null ? void 0 : y[e];
                    if (!S || !S.content) {
                      console.error("无法获取块信息");
                      return;
                    }
                    const $ = [...S.content], k = $[r];
                    k && k.t.includes(".cloze") && (k.clozeNumber = i, k.v = d, await ((h = (v = window.orca) == null ? void 0 : v.commands) == null ? void 0 : h.invokeEditorCommand(
                      "core.editor.setBlocksContent",
                      null,
                      // cursor 参数可以为 null
                      [
                        {
                          id: e,
                          content: $
                        }
                      ],
                      !1
                    )), console.log("填空已更新:", { number: i, text: d }));
                  } catch (S) {
                    console.error("更新填空失败:", S);
                  } finally {
                    s(!1);
                  }
                },
                style: {
                  padding: "8px 16px",
                  border: "1px solid #4a90e2",
                  borderRadius: "4px",
                  backgroundColor: "#4a90e2",
                  color: "white",
                  cursor: "pointer",
                  fontSize: "14px"
                },
                children: "保存"
              }
            )
          ] })
        ] })
      }
    )
  ] });
}
const { useRef: sx, useState: Ds, useCallback: ix } = window.React, Ts = {
  forward: "ti ti-arrow-right",
  backward: "ti ti-arrow-left",
  bidirectional: "ti ti-arrows-exchange"
}, Es = {
  forward: "var(--orca-color-primary-5)",
  backward: "var(--orca-color-warning-5)",
  bidirectional: "var(--orca-color-success-5)"
}, zn = {
  forward: "正向",
  backward: "反向",
  bidirectional: "双向"
};
function cx({
  blockId: e,
  data: t,
  index: r
}) {
  const n = sx(null), a = t.direction || "forward", [s, i] = Ds(a), [c, d] = Ds(!1), l = (t.t || "").replace(".direction", ""), x = Ts[s] || Ts.forward, u = Es[s] || Es.forward, f = zn[s] || zn.forward, p = ix(
    async (g) => {
      if (g.preventDefault(), g.stopPropagation(), !c) {
        d(!0);
        try {
          const y = yl(s);
          i(y), await ml(Number(e), y, l);
          const v = zn[y] || "未知";
          orca.notify("info", `已切换为${v}卡片`);
        } catch (y) {
          console.error("切换方向失败:", y), i(a);
        } finally {
          d(!1);
        }
      }
    },
    [e, s, a, c, l]
  );
  return /* @__PURE__ */ o.jsx(
    "span",
    {
      ref: n,
      className: "orca-inline srs-direction-inline",
      onClick: p,
      style: {
        cursor: c ? "wait" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "24px",
        height: "24px",
        fontSize: "16px",
        margin: "0 4px",
        borderRadius: "4px",
        backgroundColor: "var(--orca-color-bg-2)",
        color: u,
        transition: "all 0.2s ease",
        opacity: c ? 0.5 : 1
      },
      title: `方向卡 (${f}) - 点击切换`,
      children: /* @__PURE__ */ o.jsx("i", { className: x })
    }
  );
}
const lx = 1, dx = "srs.choice.statistics";
function ux(e) {
  const t = JSON.parse(e);
  if (typeof t != "object" || t === null)
    throw new Error("Invalid statistics data: not an object");
  const r = typeof t.version == "number" ? t.version : lx, n = Array.isArray(t.entries) ? t.entries.map((a) => ({
    timestamp: typeof a.timestamp == "number" ? a.timestamp : 0,
    selectedBlockIds: Array.isArray(a.selectedBlockIds) ? a.selectedBlockIds : [],
    correctBlockIds: Array.isArray(a.correctBlockIds) ? a.correctBlockIds : [],
    isCorrect: typeof a.isCorrect == "boolean" ? a.isCorrect : !1
  })) : [];
  return { version: r, entries: n };
}
async function fx(e) {
  try {
    const t = await orca.invokeBackend("get-block", e);
    if (!(t != null && t.properties))
      return [];
    const r = t.properties.find(
      (a) => a.name === dx
    );
    return r != null && r.value ? ux(String(r.value)).entries : [];
  } catch (t) {
    return console.warn(`[SRS] 加载选择统计失败 (blockId: ${e}):`, t), [];
  }
}
function px(e, t) {
  const r = /* @__PURE__ */ new Map(), n = new Set(t);
  for (const a of t)
    r.set(a, { total: 0, incorrect: 0 });
  for (const a of e) {
    const s = new Set(a.correctBlockIds);
    for (const i of a.selectedBlockIds) {
      if (!n.has(i))
        continue;
      const c = r.get(i);
      c && (c.total++, s.has(i) || c.incorrect++);
    }
  }
  return r;
}
const { useState: In, useEffect: xx, useMemo: gx } = window.React, hx = 0.3, yx = 3;
function mx({
  blockId: e,
  options: t
}) {
  const [r, n] = In(/* @__PURE__ */ new Map()), [a, s] = In(0), [i, c] = In(!0);
  xx(() => {
    let l = !0;
    async function x() {
      c(!0);
      try {
        const u = await fx(e);
        if (!l) return;
        const f = t.map((g) => g.blockId), p = px(u, f);
        n(p), s(u.length);
      } catch (u) {
        console.warn("[SRS] 加载选择统计失败:", u);
      } finally {
        l && c(!1);
      }
    }
    return x(), () => {
      l = !1;
    };
  }, [e, t]);
  const d = gx(() => t.map((l) => {
    const x = r.get(l.blockId) || { total: 0, incorrect: 0 }, u = a > 0 ? x.total / a * 100 : 0, f = x.total > 0 ? x.incorrect / x.total * 100 : 0, p = !l.isCorrect && x.total >= yx && x.incorrect / x.total >= hx;
    return {
      blockId: l.blockId,
      text: l.text,
      isCorrect: l.isCorrect,
      total: x.total,
      incorrect: x.incorrect,
      selectRate: u,
      incorrectRate: f,
      isHighFrequencyError: p
    };
  }), [t, r, a]);
  return a === 0 && !i ? null : /* @__PURE__ */ o.jsxs("div", { className: "srs-choice-statistics-indicator", style: bx, children: [
    /* @__PURE__ */ o.jsxs("div", { style: wx, children: [
      /* @__PURE__ */ o.jsx("i", { className: "ti ti-chart-bar", style: { fontSize: "14px" } }),
      /* @__PURE__ */ o.jsx("span", { children: "选择统计" }),
      /* @__PURE__ */ o.jsxs("span", { style: Sx, children: [
        "(",
        a,
        " 次复习)"
      ] })
    ] }),
    i ? /* @__PURE__ */ o.jsx("div", { style: Cx, children: "加载中..." }) : (
      /* 选项统计列表 */
      /* @__PURE__ */ o.jsx("div", { style: kx, children: d.map((l, x) => /* @__PURE__ */ o.jsx(
        vx,
        {
          index: x,
          stat: l,
          totalReviews: a
        },
        l.blockId
      )) })
    )
  ] });
}
function vx({ index: e, stat: t, totalReviews: r }) {
  const n = String.fromCharCode(65 + e), a = t.text.length > 30 ? t.text.substring(0, 30) + "..." : t.text || "(空)";
  return /* @__PURE__ */ o.jsxs("div", { style: jx, children: [
    /* @__PURE__ */ o.jsx("div", { style: {
      ...Rx,
      backgroundColor: t.isCorrect ? "rgba(34, 197, 94, 0.2)" : t.isHighFrequencyError ? "rgba(239, 68, 68, 0.2)" : "var(--orca-color-bg-3)"
    }, children: n }),
    /* @__PURE__ */ o.jsx("div", { style: $x, title: t.text, children: a }),
    /* @__PURE__ */ o.jsxs("div", { style: Dx, children: [
      /* @__PURE__ */ o.jsxs("span", { style: Tx, children: [
        t.total,
        "次"
      ] }),
      /* @__PURE__ */ o.jsx("div", { style: Ex, children: /* @__PURE__ */ o.jsx(
        "div",
        {
          style: {
            ..._x,
            width: `${Math.min(t.selectRate, 100)}%`,
            backgroundColor: t.isCorrect ? "rgba(34, 197, 94, 0.6)" : t.isHighFrequencyError ? "rgba(239, 68, 68, 0.6)" : "var(--orca-color-primary-4)"
          }
        }
      ) }),
      /* @__PURE__ */ o.jsxs("span", { style: zx, children: [
        t.selectRate.toFixed(0),
        "%"
      ] }),
      t.isHighFrequencyError && /* @__PURE__ */ o.jsx("div", { style: Ix, title: "高频错误选项：该干扰项经常被错误选择", children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-alert-triangle", style: { fontSize: "14px" } }) }),
      t.isCorrect && /* @__PURE__ */ o.jsx("div", { style: Mx, title: "正确选项", children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-check", style: { fontSize: "14px" } }) })
    ] })
  ] });
}
const bx = {
  marginTop: "12px",
  padding: "12px",
  backgroundColor: "var(--orca-color-bg-2)",
  borderRadius: "8px",
  border: "1px solid var(--orca-color-border-1)"
}, wx = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  marginBottom: "10px",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--orca-color-text-2)"
}, Sx = {
  fontSize: "12px",
  color: "var(--orca-color-text-3)",
  fontWeight: 400
}, Cx = {
  textAlign: "center",
  padding: "12px",
  color: "var(--orca-color-text-3)",
  fontSize: "12px"
}, kx = {
  display: "flex",
  flexDirection: "column",
  gap: "6px"
}, jx = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 8px",
  backgroundColor: "var(--orca-color-bg-1)",
  borderRadius: "6px",
  fontSize: "12px"
}, Rx = {
  width: "20px",
  height: "20px",
  borderRadius: "4px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 600,
  fontSize: "11px",
  flexShrink: 0,
  color: "var(--orca-color-text-1)"
}, $x = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--orca-color-text-2)",
  minWidth: 0
}, Dx = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  flexShrink: 0
}, Tx = {
  color: "var(--orca-color-text-3)",
  fontSize: "11px",
  minWidth: "28px",
  textAlign: "right"
}, Ex = {
  width: "60px",
  height: "6px",
  backgroundColor: "var(--orca-color-bg-3)",
  borderRadius: "3px",
  overflow: "hidden"
}, _x = {
  height: "100%",
  borderRadius: "3px",
  transition: "width 0.3s ease"
}, zx = {
  color: "var(--orca-color-text-2)",
  fontSize: "11px",
  minWidth: "28px",
  textAlign: "right"
}, Ix = {
  color: "rgba(239, 68, 68, 0.9)",
  display: "flex",
  alignItems: "center",
  cursor: "help"
}, Mx = {
  color: "rgba(34, 197, 94, 0.9)",
  display: "flex",
  alignItems: "center"
}, { useState: Xg, useMemo: or, useEffect: Zg, useCallback: eh } = window.React, { useSnapshot: Bx } = window.Valtio, { BlockShell: Ax, BlockChildren: Px, Block: th } = orca.components;
function Lx({
  panelId: e,
  blockId: t,
  rndId: r,
  blockLevel: n,
  indentLevel: a,
  mirrorId: s,
  initiallyCollapsed: i,
  renderingMode: c,
  front: d
}) {
  const l = Bx(orca.state), x = s ?? t, u = or(() => {
    var h;
    return (h = l == null ? void 0 : l.blocks) == null ? void 0 : h[x];
  }, [l == null ? void 0 : l.blocks, x]), f = or(() => u ? $i(u) : [], [u]), p = or(() => Di(f), [f]), g = or(() => {
    switch (p) {
      case "single":
        return "单选题";
      case "multiple":
        return "多选题";
      case "undefined":
        return "选择题（未设置正确答案）";
    }
  }, [p]), y = or(
    () => /* @__PURE__ */ o.jsx(
      Px,
      {
        block: u,
        panelId: e,
        blockLevel: n,
        indentLevel: a,
        renderingMode: c
      }
    ),
    [u, e, n, a, c]
  ), v = or(() => /* @__PURE__ */ o.jsxs(
    "div",
    {
      className: "srs-choice-card-block-content",
      style: {
        backgroundColor: "var(--orca-color-bg-1)",
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        padding: "16px",
        marginTop: "4px",
        marginBottom: "4px",
        userSelect: "text",
        WebkitUserSelect: "text"
      },
      children: [
        /* @__PURE__ */ o.jsx("style", { children: `
        .srs-choice-card-block-content .orca-block-folding-handle,
        .srs-choice-card-block-content .orca-block-handle {
          opacity: 0 !important;
          transition: opacity 0.15s ease;
        }
        .srs-choice-card-block-content .orca-block.orca-container:hover > .orca-repr > .orca-repr-main > .orca-repr-main-none-editable > .orca-block-handle,
        .srs-choice-card-block-content .orca-block.orca-container:hover > .orca-block-folding-handle {
          opacity: 1 !important;
        }
      ` }),
        /* @__PURE__ */ o.jsxs(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
              color: "var(--orca-color-text-2)",
              fontSize: "12px",
              fontWeight: "500"
            },
            children: [
              /* @__PURE__ */ o.jsx("i", { className: "ti ti-list-check", style: { fontSize: "16px" } }),
              /* @__PURE__ */ o.jsxs("span", { children: [
                "SRS ",
                g
              ] }),
              p !== "undefined" && /* @__PURE__ */ o.jsxs("span", { style: {
                marginLeft: "auto",
                padding: "2px 8px",
                backgroundColor: p === "single" ? "var(--orca-color-primary-1)" : "var(--orca-color-warning-1)",
                color: p === "single" ? "var(--orca-color-primary-6)" : "var(--orca-color-warning-6)",
                borderRadius: "4px",
                fontSize: "11px"
              }, children: [
                f.filter((h) => h.isCorrect).length,
                " 个正确答案"
              ] })
            ]
          }
        ),
        /* @__PURE__ */ o.jsxs(
          "div",
          {
            className: "srs-choice-card-front",
            style: {
              marginBottom: "12px",
              padding: "12px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "6px",
              color: "var(--orca-color-text-1)"
            },
            children: [
              /* @__PURE__ */ o.jsx(
                "div",
                {
                  style: {
                    fontSize: "11px",
                    color: "var(--orca-color-text-2)",
                    marginBottom: "8px"
                  },
                  children: "题目："
                }
              ),
              /* @__PURE__ */ o.jsx(
                "div",
                {
                  style: {
                    whiteSpace: "pre-wrap",
                    userSelect: "text",
                    WebkitUserSelect: "text",
                    cursor: "text",
                    fontSize: "16px",
                    fontWeight: "500"
                  },
                  children: d || "（无题目）"
                }
              )
            ]
          }
        ),
        /* @__PURE__ */ o.jsxs(
          "div",
          {
            style: {
              marginBottom: "12px"
            },
            children: [
              /* @__PURE__ */ o.jsxs(
                "div",
                {
                  style: {
                    fontSize: "11px",
                    color: "var(--orca-color-text-2)",
                    marginBottom: "8px"
                  },
                  children: [
                    "选项 (",
                    f.length,
                    " 个)："
                  ]
                }
              ),
              /* @__PURE__ */ o.jsxs("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [
                f.map((h, S) => /* @__PURE__ */ o.jsx(
                  Ox,
                  {
                    option: h,
                    index: S
                  },
                  h.blockId
                )),
                f.length === 0 && /* @__PURE__ */ o.jsx("div", { style: {
                  color: "var(--orca-color-text-3)",
                  fontSize: "13px",
                  fontStyle: "italic"
                }, children: "暂无选项，请添加子块作为选项" })
              ] })
            ]
          }
        ),
        f.length > 0 && /* @__PURE__ */ o.jsx(
          mx,
          {
            blockId: x,
            options: f
          }
        )
      ]
    }
  ), [d, f, p, g, x]);
  return /* @__PURE__ */ o.jsx(
    Ax,
    {
      panelId: e,
      blockId: t,
      rndId: r,
      mirrorId: s,
      blockLevel: n,
      indentLevel: a,
      initiallyCollapsed: i,
      renderingMode: c,
      reprClassName: "srs-repr-choice-card",
      contentClassName: "srs-repr-choice-card-content",
      contentAttrs: { contentEditable: !1 },
      contentJsx: /* @__PURE__ */ o.jsx(Xe, { componentName: "选择题卡片", errorTitle: "选择题卡片加载出错", children: v }),
      childrenJsx: y
    }
  );
}
function Ox({ option: e, index: t }) {
  const r = String.fromCharCode(65 + t), n = e.text.length > 50 ? e.text.substring(0, 50) + "..." : e.text || "(空)";
  return /* @__PURE__ */ o.jsxs(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 10px",
        backgroundColor: e.isCorrect ? "rgba(34, 197, 94, 0.1)" : "var(--orca-color-bg-2)",
        borderRadius: "6px",
        border: e.isCorrect ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid transparent"
      },
      children: [
        /* @__PURE__ */ o.jsx(
          "div",
          {
            style: {
              width: "22px",
              height: "22px",
              borderRadius: "4px",
              backgroundColor: e.isCorrect ? "rgba(34, 197, 94, 0.2)" : "var(--orca-color-bg-3)",
              color: e.isCorrect ? "rgba(34, 197, 94, 0.9)" : "var(--orca-color-text-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 600,
              fontSize: "11px",
              flexShrink: 0
            },
            children: r
          }
        ),
        /* @__PURE__ */ o.jsx(
          "div",
          {
            style: {
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "13px",
              color: "var(--orca-color-text-1)"
            },
            title: e.text,
            children: n
          }
        ),
        e.isCorrect && /* @__PURE__ */ o.jsxs(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: "rgba(34, 197, 94, 0.9)",
              fontSize: "11px"
            },
            children: [
              /* @__PURE__ */ o.jsx("i", { className: "ti ti-check", style: { fontSize: "14px" } }),
              /* @__PURE__ */ o.jsx("span", { children: "正确" })
            ]
          }
        ),
        e.isAnchor && /* @__PURE__ */ o.jsx(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "4px",
              color: "var(--orca-color-text-3)",
              fontSize: "11px"
            },
            title: "锚定选项：乱序时固定在末尾",
            children: /* @__PURE__ */ o.jsx("i", { className: "ti ti-anchor", style: { fontSize: "12px" } })
          }
        )
      ]
    }
  );
}
function Fx(e) {
  orca.renderers.registerBlock(
    "srs.card",
    !1,
    yn,
    [],
    !1
  ), orca.renderers.registerBlock(
    "srs.cloze-card",
    !1,
    yn,
    [],
    !1
  ), orca.renderers.registerBlock(
    "srs.direction-card",
    !1,
    yn,
    [],
    !1
  ), orca.renderers.registerBlock(
    "srs.choice-card",
    !1,
    Lx,
    [],
    !1
  ), orca.renderers.registerBlock(
    "srs.review-session",
    !1,
    xf,
    [],
    !1
  ), orca.renderers.registerBlock(
    "srs.flashcard-home",
    !1,
    rp,
    [],
    !1
  ), orca.renderers.registerBlock(
    "srs.ir-session",
    !1,
    jp,
    [],
    !1
  ), orca.renderers.registerBlock(
    "srs.ir-manager",
    !1,
    rx,
    [],
    !1
  ), orca.renderers.registerInline(
    `${e}.cloze`,
    !1,
    ax
  ), orca.renderers.registerInline(
    `${e}.direction`,
    !1,
    cx
  );
}
function Wx(e) {
  orca.renderers.unregisterBlock("srs.card"), orca.renderers.unregisterBlock("srs.cloze-card"), orca.renderers.unregisterBlock("srs.direction-card"), orca.renderers.unregisterBlock("srs.choice-card"), orca.renderers.unregisterBlock("srs.review-session"), orca.renderers.unregisterBlock("srs.flashcard-home"), orca.renderers.unregisterBlock("srs.ir-session"), orca.renderers.unregisterBlock("srs.ir-manager"), orca.renderers.unregisterInline(`${e}.cloze`), orca.renderers.unregisterInline(`${e}.direction`);
}
function Hx(e) {
  orca.converters.registerBlock(
    "plain",
    "srs.card",
    (t, r) => {
      const n = r.front || "（无题目）", a = r.back || "（无答案）";
      return `[SRS 卡片]
题目: ${n}
答案: ${a}`;
    }
  ), orca.converters.registerBlock(
    "plain",
    "srs.cloze-card",
    (t, r) => {
      const n = r.front || "（无题目）", a = r.back || "（无答案）";
      return `[SRS 填空卡片]
题目: ${n}
答案: ${a}`;
    }
  ), orca.converters.registerBlock(
    "plain",
    "srs.direction-card",
    (t, r) => {
      const n = r.front || "（左侧）", a = r.back || "（右侧）", s = r.direction || "forward";
      return `[SRS 方向卡片]
${n} ${s === "forward" ? "->" : s === "backward" ? "<-" : "<->"} ${a}`;
    }
  ), orca.converters.registerBlock(
    "plain",
    "srs.choice-card",
    (t, r) => `[SRS 选择题卡片]
题目: ${r.front || "（无题目）"}`
  ), orca.converters.registerBlock(
    "plain",
    "srs.review-session",
    () => "[SRS 复习会话面板块]"
  ), orca.converters.registerBlock(
    "plain",
    "srs.flashcard-home",
    () => "[SRS Flashcard Home 面板块]"
  ), orca.converters.registerBlock(
    "plain",
    "srs.ir-session",
    () => "[SRS 渐进阅读面板块]"
  ), orca.converters.registerBlock(
    "plain",
    "srs.ir-manager",
    () => "[SRS 渐进阅读管理面板块]"
  ), orca.converters.registerInline(
    "plain",
    `${e}.cloze`,
    (t) => t.v || ""
  ), orca.converters.registerInline(
    "plain",
    `${e}.direction`,
    (t) => {
      const r = t.direction || "forward";
      return ` ${r === "forward" ? "->" : r === "backward" ? "<-" : "<->"} `;
    }
  );
}
function Nx(e) {
  orca.converters.unregisterBlock("plain", "srs.card"), orca.converters.unregisterBlock("plain", "srs.cloze-card"), orca.converters.unregisterBlock("plain", "srs.direction-card"), orca.converters.unregisterBlock("plain", "srs.choice-card"), orca.converters.unregisterBlock("plain", "srs.review-session"), orca.converters.unregisterBlock("plain", "srs.flashcard-home"), orca.converters.unregisterBlock("plain", "srs.ir-session"), orca.converters.unregisterBlock("plain", "srs.ir-manager"), orca.converters.unregisterInline("plain", `${e}.cloze`), orca.converters.unregisterInline("plain", `${e}.direction`);
}
const Pr = [], Mn = /* @__PURE__ */ new Map();
function Ki(e, t, r, n) {
  const a = e instanceof Error ? e.message : String(e);
  if (a.includes("load") || a.includes("fetch") || a.includes("network") || a.includes("timeout")) {
    const i = Mn.get(r), c = (i == null ? void 0 : i.retryCount) ?? 0;
    c < 2 ? (Mn.set(r, { type: n, retryCount: c + 1 }), orca.notify("error", "卡片加载失败，请稍后重试", {
      title: "SRS 复习"
    })) : (Mn.delete(r), orca.notify("error", `卡片加载失败: ${a}`, { title: "SRS 复习" }));
  } else
    orca.notify("error", `启动复习失败: ${a}`, { title: "SRS 复习" });
}
function Yx(e) {
  const t = `${e}.reviewQueryResults`;
  orca.blockMenuCommands.registerBlockMenuCommand(t, {
    worksOnMultipleBlocks: !1,
    render: (a, s, i) => {
      var d;
      const c = (d = orca.state.blocks) == null ? void 0 : d[a];
      return !c || !Br(c) ? null : /* @__PURE__ */ o.jsx(
        Kx,
        {
          blockId: a,
          pluginName: e,
          close: i
        }
      );
    }
  }), Pr.push(t);
  const r = `${e}.reviewChildrenCards`;
  orca.blockMenuCommands.registerBlockMenuCommand(r, {
    worksOnMultipleBlocks: !1,
    render: (a, s, i) => {
      var d;
      const c = (d = orca.state.blocks) == null ? void 0 : d[a];
      return !c || Br(c) ? null : /* @__PURE__ */ o.jsx(
        Ux,
        {
          blockId: a,
          pluginName: e,
          close: i
        }
      );
    }
  }), Pr.push(r);
  const n = `${e}.createBookIR`;
  orca.blockMenuCommands.registerBlockMenuCommand(n, {
    worksOnMultipleBlocks: !1,
    render: (a, s, i) => {
      var d;
      const c = (d = orca.state.blocks) == null ? void 0 : d[a];
      return !c || Br(c) ? null : /* @__PURE__ */ o.jsx(
        Vx,
        {
          blockId: a,
          block: c,
          pluginName: e,
          close: i
        }
      );
    }
  }), Pr.push(n), console.log(`[${e}] 右键菜单已注册`);
}
function qx(e) {
  for (const t of Pr)
    orca.blockMenuCommands.unregisterBlockMenuCommand(t);
  Pr.length = 0, console.log(`[${e}] 右键菜单已注销`);
}
function Kx({
  blockId: e,
  pluginName: t,
  close: r
}) {
  const [n, a] = React.useState(null), [s, i] = React.useState(!0), [c, d] = React.useState(!1), [l, x] = React.useState(!1);
  React.useEffect(() => {
    let g = !1;
    async function y() {
      try {
        const { getQueryResults: v } = await Promise.resolve().then(() => Mo), h = await v(e);
        if (!g && h.length === 0) {
          x(!0), a(0), i(!1);
          return;
        }
        const S = await ma(e, !0);
        g || (a(S), i(!1));
      } catch (v) {
        console.error(`[${t}] 获取查询块卡片数量失败:`, v), g || (d(!0), a(0), i(!1));
      }
    }
    return y(), () => {
      g = !0;
    };
  }, [e, t]);
  const u = async () => {
    var g;
    r();
    try {
      if (!((g = orca.state.blocks) == null ? void 0 : g[e]) && !await orca.invokeBackend("get-block", e)) {
        orca.notify("error", "块不存在", { title: "SRS 复习" });
        return;
      }
      const { getQueryResults: v } = await Promise.resolve().then(() => Mo);
      if ((await v(e)).length === 0) {
        orca.notify("info", "查询结果为空", { title: "SRS 复习" });
        return;
      }
      const S = await ha(e, t);
      if (S.length === 0) {
        orca.notify("info", "查询结果中没有找到卡片", { title: "SRS 复习" });
        return;
      }
      sn(S, e, "query"), await Ui(t), orca.notify("success", `已开始复习 ${S.length} 张卡片`, { title: "SRS 复习" });
    } catch (y) {
      console.error(`[${t}] 启动查询块复习失败:`, y), Ki(y, t, e, "query");
    }
  }, f = orca.components.MenuText;
  let p;
  return s ? p = "复习此查询结果..." : c ? p = "复习此查询结果 (加载失败)" : l ? p = "复习此查询结果 (查询为空)" : n === 0 ? p = "复习此查询结果 (0)" : p = `复习此查询结果 (${n})`, /* @__PURE__ */ o.jsx(
    f,
    {
      preIcon: "ti ti-cards",
      title: p,
      disabled: s || n === 0 || c,
      onClick: u
    }
  );
}
function Ux({
  blockId: e,
  pluginName: t,
  close: r
}) {
  const [n, a] = React.useState(null), [s, i] = React.useState(!0), [c, d] = React.useState(!1);
  React.useEffect(() => {
    let u = !1;
    async function f() {
      try {
        const p = await ma(e, !1);
        u || (a(p), d(p > 0), i(!1));
      } catch (p) {
        console.error(`[${t}] 获取子块卡片数量失败:`, p), u || (d(!1), i(!1));
      }
    }
    return f(), () => {
      u = !0;
    };
  }, [e, t]);
  const l = async () => {
    r();
    try {
      const u = await ya(e, t);
      if (u.length === 0) {
        orca.notify("info", "子块中没有找到卡片", { title: "SRS 复习" });
        return;
      }
      sn(u, e, "children"), await Ui(t), orca.notify("success", `已开始复习 ${u.length} 张卡片`, { title: "SRS 复习" });
    } catch (u) {
      console.error(`[${t}] 启动子块复习失败:`, u), Ki(u, t, e, "children");
    }
  };
  if (s || !c)
    return null;
  const x = orca.components.MenuText;
  return /* @__PURE__ */ o.jsx(
    x,
    {
      preIcon: "ti ti-cards",
      title: `复习此块卡片 (${n})`,
      onClick: l
    }
  );
}
function Vx({
  blockId: e,
  block: t,
  pluginName: r,
  close: n
}) {
  const [a, s] = React.useState(0), [i, c] = React.useState(!0);
  React.useEffect(() => {
    let x = !1;
    async function u() {
      try {
        const f = await Oa(t);
        x || (s(f.length), c(!1));
      } catch (f) {
        console.error(`[${r}] 获取章节数量失败:`, f), x || (s(0), c(!1));
      }
    }
    return u(), () => {
      x = !0;
    };
  }, [t, r]);
  const d = async () => {
    var f;
    n();
    const x = await Oa(t);
    if (x.length === 0) {
      orca.notify("warn", "该块没有内联引用", { title: "渐进阅读" });
      return;
    }
    const u = ((f = t.text) == null ? void 0 : f.trim()) || "未命名书籍";
    Md(x, u, e);
  };
  if (i || a === 0)
    return null;
  const l = orca.components.MenuText;
  return /* @__PURE__ */ o.jsx(
    l,
    {
      preIcon: "ti ti-book",
      title: `创建渐进阅读书籍 (${a} 章)`,
      onClick: d
    }
  );
}
async function Ui(e) {
  const { getOrCreateReviewSessionBlock: t } = await Promise.resolve().then(() => Vi), r = orca.state.activePanel;
  if (!r) {
    orca.notify("warn", "当前没有可用的面板", { title: "SRS 复习" });
    return;
  }
  const n = await t(e), a = orca.state.panels;
  let s = null;
  for (const [i, c] of Object.entries(a))
    if (c.parentId === r && c.position === "right") {
      s = i;
      break;
    }
  if (s)
    orca.nav.goTo("block", { blockId: n }, s);
  else if (s = orca.nav.addTo(r, "right", {
    view: "block",
    viewArgs: { blockId: n },
    viewState: {}
  }), !s) {
    orca.notify("error", "无法创建侧边面板", { title: "SRS 复习" });
    return;
  }
  s && setTimeout(() => {
    orca.nav.switchFocusTo(s);
  }, 100), console.log(`[${e}] 重复复习会话已启动，面板ID: ${s}`);
}
let _r = null;
const _s = "reviewSessionBlockId";
async function wa(e) {
  if (_r && await zs(_r))
    return _r;
  const t = await orca.plugins.getData(e, _s);
  if (typeof t == "number" && await zs(t))
    return _r = t, t;
  const r = await Gx(e);
  return await orca.plugins.setData(e, _s, r), _r = r, r;
}
async function Gx(e) {
  var n;
  const t = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [{ t: "t", v: `[SRS 复习会话 - ${e}]` }],
    { type: "srs.review-session" }
  );
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [t],
    [
      { name: "srs.isReviewSessionBlock", value: !0, type: 4 },
      { name: "srs.pluginName", value: e, type: 2 }
    ]
  );
  const r = (n = orca.state.blocks) == null ? void 0 : n[t];
  return r && (r._repr = {
    type: "srs.review-session"
  }), console.log(`[${e}] 创建复习会话块: #${t}`), t;
}
async function zs(e) {
  var r;
  const t = (r = orca.state.blocks) == null ? void 0 : r[e];
  if (t) return t;
  try {
    return await orca.invokeBackend("get-block", e);
  } catch (n) {
    return console.warn("[srs] 无法从后端获取复习会话块:", n), null;
  }
}
const Vi = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getOrCreateReviewSessionBlock: wa
}, Symbol.toStringTag, { value: "Module" }));
let zr = null;
const Is = "flashcardHomeBlockId";
async function Jx(e) {
  if (zr && await Ms(zr))
    return zr;
  const t = await orca.plugins.getData(e, Is);
  if (typeof t == "number" && await Ms(t))
    return zr = t, t;
  const r = await Qx(e);
  return await orca.plugins.setData(e, Is, r), zr = r, r;
}
async function Qx(e) {
  var n;
  const t = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    null,
    null,
    [{ t: "t", v: `[SRS Flashcard Home - ${e}]` }],
    { type: "srs.flashcard-home" }
  );
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [t],
    [
      { name: "srs.isFlashcardHomeBlock", value: !0, type: 4 },
      { name: "srs.pluginName", value: e, type: 2 }
    ]
  );
  const r = (n = orca.state.blocks) == null ? void 0 : n[t];
  return r && (r._repr = {
    type: "srs.flashcard-home"
  }), console.log(`[${e}] 创建 Flash Home 块: #${t}`), t;
}
async function Ms(e) {
  var r;
  const t = (r = orca.state.blocks) == null ? void 0 : r[e];
  if (t) return t;
  try {
    return await orca.invokeBackend("get-block", e);
  } catch (n) {
    return console.warn("[srs] 无法从后端获取 Flash Home 块:", n), null;
  }
}
const Xx = "reviewLogs";
async function Zx(e) {
  var r;
  console.log(`[${e}] 开始扫描已删除的卡片...`);
  let t = 0;
  try {
    const n = await ia(e), a = new Set(n.map((l) => l.id));
    console.log(`[${e}] 找到 ${a.size} 个有效的 SRS 卡片块`);
    const s = await Xd(e);
    if (s.length === 0)
      return console.log(`[${e}] 没有复习日志需要清理`), 0;
    const i = /* @__PURE__ */ new Set();
    for (const l of s)
      a.has(l.cardId) || i.add(l.cardId);
    if (i.size === 0)
      return console.log(`[${e}] 没有已删除卡片的日志需要清理`), 0;
    console.log(`[${e}] 发现 ${i.size} 个已删除卡片的日志记录`);
    const d = (await orca.plugins.getDataKeys(e)).filter((l) => l.startsWith(Xx));
    for (const l of d) {
      const x = await orca.plugins.getData(e, l);
      if (x)
        try {
          const u = JSON.parse(x), f = ((r = u.logs) == null ? void 0 : r.length) || 0, p = (u.logs || []).filter(
            (y) => a.has(y.cardId)
          ), g = f - p.length;
          if (g > 0) {
            if (t += g, p.length > 0) {
              const y = {
                version: u.version || 1,
                logs: p
              };
              await orca.plugins.setData(e, l, JSON.stringify(y));
            } else
              await orca.plugins.removeData(e, l);
            console.log(`[${e}] 从 ${l} 清理了 ${g} 条记录`);
          }
        } catch (u) {
          console.warn(`[${e}] 处理 ${l} 时出错:`, u);
        }
    }
    console.log(`[${e}] 已删除卡片清理完成，共清理了 ${t} 条复习日志`);
  } catch (n) {
    console.error(`[${e}] 清理已删除卡片失败:`, n);
  }
  return t;
}
let te, Gi = null, Ji = null;
async function eg(e) {
  te = e, orca.state.locale;
  try {
    await orca.plugins.setSettingsSchema(te, {
      ...fi,
      ...Vc,
      ...it
    }), console.log(`[${te}] 插件设置已注册（AI + 复习 + 渐进阅读）`);
  } catch (t) {
    console.warn(`[${te}] 注册插件设置失败:`, t);
  }
  console.log(`[${te}] 插件已加载`), ad(te), Ad(te), Fx(te), Hx(te), Yx(te), console.log(`[${te}] 命令、UI 组件、渲染器、转换器、右键菜单已注册`);
  try {
    const { enableAutoExtractMark: t } = dt(te);
    t ? ua(te) : console.log(`[${te}] 渐进阅读自动标记已关闭`);
  } catch (t) {
    console.warn(`[${te}] 读取渐进阅读设置失败，按默认关闭处理:`, t);
  }
  setTimeout(async () => {
    try {
      await Zx(te);
    } catch (t) {
      console.warn(`[${te}] 清理已删除卡片时出错:`, t);
    }
  }, 3e3);
}
async function tg() {
  an(te), sd(te), Pd(te), Wx(te), Nx(te), qx(te), await Op(te), console.log(`[${te}] 插件已卸载`);
}
async function rg(e, t = !1) {
  try {
    Gi = e ?? null;
    const r = orca.state.activePanel;
    if (!r) {
      orca.notify("warn", "当前没有可用的面板", { title: "SRS 复习" });
      return;
    }
    Ji = r;
    const n = await wa(te);
    if (t) {
      orca.nav.goTo("block", { blockId: n }, r);
      const c = e ? `已打开 ${e} 复习会话` : "复习会话已打开";
      orca.notify("success", c, { title: "SRS 复习" }), console.log(`[${te}] 复习会话已在当前面板启动，面板ID: ${r}`);
      return;
    }
    const a = orca.state.panels;
    let s = null;
    for (const [c, d] of Object.entries(a))
      if (d.parentId === r && d.position === "right") {
        s = c;
        break;
      }
    if (s)
      orca.nav.goTo("block", { blockId: n }, s);
    else if (s = orca.nav.addTo(r, "right", {
      view: "block",
      viewArgs: { blockId: n },
      viewState: {}
    }), !s) {
      orca.notify("error", "无法创建侧边面板", { title: "SRS 复习" });
      return;
    }
    s && setTimeout(() => {
      orca.nav.switchFocusTo(s);
    }, 100);
    const i = e ? `已打开 ${e} 复习会话` : "复习会话已在右侧面板打开";
    orca.notify("success", i, { title: "SRS 复习" }), console.log(`[${te}] 复习会话已启动，面板ID: ${s}`);
  } catch (r) {
    console.error(`[${te}] 启动复习失败:`, r), orca.notify("error", `启动复习失败: ${r}`, { title: "SRS 复习" });
  }
}
function og() {
  return Gi;
}
function ng() {
  return Ji;
}
function ag() {
  return te;
}
async function sg(e = !1) {
  try {
    const t = orca.state.activePanel;
    if (!t) {
      orca.notify("warn", "当前没有可用的面板", { title: "渐进阅读" });
      return;
    }
    const r = await ap(te);
    if (e) {
      orca.nav.goTo("block", { blockId: r }, t), orca.notify("success", "渐进阅读面板已打开", { title: "渐进阅读" }), console.log(`[${te}] 渐进阅读已在当前面板启动，面板ID: ${t}`);
      return;
    }
    const n = orca.state.panels;
    let a = null;
    for (const [s, i] of Object.entries(n))
      if (i.parentId === t && i.position === "right") {
        a = s;
        break;
      }
    if (a)
      orca.nav.goTo("block", { blockId: r }, a);
    else if (a = orca.nav.addTo(t, "right", {
      view: "block",
      viewArgs: { blockId: r },
      viewState: {}
    }), !a) {
      orca.notify("error", "无法创建侧边面板", { title: "渐进阅读" });
      return;
    }
    a && setTimeout(() => {
      orca.nav.switchFocusTo(a);
    }, 100), orca.notify("success", "渐进阅读面板已在右侧打开", { title: "渐进阅读" }), console.log(`[${te}] 渐进阅读已启动，面板ID: ${a}`);
  } catch (t) {
    console.error(`[${te}] 启动渐进阅读失败:`, t), orca.notify("error", `启动渐进阅读失败: ${t}`, { title: "渐进阅读" });
  }
}
async function ig() {
  await Fp(te);
}
async function cg(e = !1) {
  var t;
  try {
    const r = orca.state.activePanel;
    if (!r) {
      orca.notify("warn", "当前没有可用的面板", { title: "Flash Home" });
      return;
    }
    const n = await Jx(te), a = orca.state.panels;
    for (const [i, c] of Object.entries(a))
      if (((t = c.viewArgs) == null ? void 0 : t.blockId) === n) {
        orca.nav.switchFocusTo(i), console.log(`[${te}] Flash Home 已存在，聚焦到面板: ${i}`);
        return;
      }
    if (e) {
      orca.nav.goTo("block", { blockId: n }, r), orca.notify("success", "Flash Home 已打开", { title: "SRS" }), console.log(`[${te}] Flash Home 已在当前面板打开，面板ID: ${r}`);
      return;
    }
    let s = null;
    for (const [i, c] of Object.entries(a))
      if (c.parentId === r && c.position === "right") {
        s = i;
        break;
      }
    if (s)
      orca.nav.goTo("block", { blockId: n }, s);
    else if (s = orca.nav.addTo(r, "right", {
      view: "block",
      viewArgs: { blockId: n },
      viewState: {}
    }), !s) {
      orca.notify("error", "无法创建侧边面板", { title: "Flash Home" });
      return;
    }
    s && setTimeout(() => {
      orca.nav.switchFocusTo(s);
    }, 100), orca.notify("success", "Flash Home 已在右侧面板打开", { title: "SRS" }), console.log(`[${te}] Flash Home 已打开，面板ID: ${s}`);
  } catch (r) {
    console.error(`[${te}] 打开 Flash Home 失败:`, r), orca.notify("error", `打开 Flash Home 失败: ${r}`, { title: "SRS" });
  }
}
async function lg(e, t = !1) {
  var r;
  try {
    const n = orca.state.activePanel;
    if (!n) {
      orca.notify("warn", "当前没有可用的面板", { title: "SRS 复习" });
      return;
    }
    let a = (r = orca.state.blocks) == null ? void 0 : r[e];
    if (a || (a = await orca.invokeBackend("get-block", e)), !a) {
      orca.notify("error", "块不存在", { title: "SRS 复习" });
      return;
    }
    let s, i;
    if (Br(a)) {
      const { getQueryResults: x } = await Promise.resolve().then(() => Mo);
      if ((await x(e)).length === 0) {
        orca.notify("info", "查询结果为空", { title: "SRS 复习" });
        return;
      }
      if (s = await ha(e, te), i = "query", s.length === 0) {
        orca.notify("info", "查询结果中没有找到卡片", { title: "SRS 复习" });
        return;
      }
    } else {
      const { getAllDescendantIds: x } = await Promise.resolve().then(() => Mo);
      if ((await x(e)).length === 0) {
        orca.notify("info", "该块没有子块", { title: "SRS 复习" });
        return;
      }
      if (s = await ya(e, te), i = "children", s.length === 0) {
        orca.notify("info", "子块中没有找到卡片", { title: "SRS 复习" });
        return;
      }
    }
    sn(s, e, i);
    const c = await wa(te);
    if (t) {
      orca.nav.goTo("block", { blockId: c }, n), orca.notify("success", `已开始复习 ${s.length} 张卡片`, { title: "SRS 复习" }), console.log(`[${te}] 重复复习会话已在当前面板启动，面板ID: ${n}`);
      return;
    }
    const d = orca.state.panels;
    let l = null;
    for (const [x, u] of Object.entries(d))
      if (u.parentId === n && u.position === "right") {
        l = x;
        break;
      }
    if (l)
      orca.nav.goTo("block", { blockId: c }, l);
    else if (l = orca.nav.addTo(n, "right", {
      view: "block",
      viewArgs: { blockId: c },
      viewState: {}
    }), !l) {
      orca.notify("error", "无法创建侧边面板", { title: "SRS 复习" });
      return;
    }
    l && setTimeout(() => {
      orca.nav.switchFocusTo(l);
    }, 100), orca.notify("success", `已开始复习 ${s.length} 张卡片`, { title: "SRS 复习" }), console.log(`[${te}] 重复复习会话已启动，面板ID: ${l}`);
  } catch (n) {
    console.error(`[${te}] 启动重复复习失败:`, n);
    const a = n instanceof Error ? n.message : String(n);
    a.includes("load") || a.includes("fetch") || a.includes("network") || a.includes("timeout") ? orca.notify("error", "卡片加载失败，请稍后重试", { title: "SRS 复习" }) : orca.notify("error", `启动复习失败: ${a}`, { title: "SRS 复习" });
  }
}
const He = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  buildReviewQueue: ca,
  buildReviewQueueWithChildren: ai,
  calculateDeckStats: Ls,
  collectChildCards: ki,
  collectReviewCards: Xt,
  extractDeckName: Nr,
  getCardKey: Oe,
  getPluginName: ag,
  getReviewDeckFilter: og,
  getReviewHostPanelId: ng,
  hasChildCards: ji,
  load: eg,
  openFlashcardHome: cg,
  openIRManager: ig,
  startIncrementalReadingSession: sg,
  startRepeatReviewSession: lg,
  startReviewSession: rg,
  unload: tg
}, Symbol.toStringTag, { value: "Module" })), dg = `你是一个知识点分析专家。请分析以下内容，提取出适合制作记忆卡片的知识点。

内容：{{content}}

要求：
1. 识别 2-5 个独立的知识点
2. 每个知识点应该是原子化的（符合最小知识点原则）
3. 评估每个知识点的难度（1-5，1最简单，5最难）
4. 标记哪些知识点最适合制作卡片（recommended: true）
5. 如果内容包含语法、概念、定义等，优先提取这些

返回 JSON 格式（不要包含其他内容）：
{
  "knowledgePoints": [
    {
      "id": "kp_1",
      "text": "知识点文本",
      "description": "简短说明（可选）",
      "difficulty": 3,
      "recommended": true
    }
  ]
}

示例：
输入："使役形（～させる）+ ない：不让/不准（某人）做某事"
输出：
{
  "knowledgePoints": [
    {
      "id": "kp_1",
      "text": "使役形（～させる）",
      "description": "表示让某人做某事的语法形式",
      "difficulty": 3,
      "recommended": true
    },
    {
      "id": "kp_2",
      "text": "ない的否定用法",
      "description": "动词否定形式",
      "difficulty": 2,
      "recommended": true
    },
    {
      "id": "kp_3",
      "text": "使役形 + ない 的组合规则",
      "description": "表示不让某人做某事",
      "difficulty": 4,
      "recommended": false
    }
  ]
}`;
function ug(e) {
  return dg.replace(/\{\{content\}\}/g, e);
}
function fg(e) {
  try {
    const t = JSON.parse(e);
    if (t.knowledgePoints && Array.isArray(t.knowledgePoints)) {
      const r = t.knowledgePoints.filter(
        (n) => n.id && n.text && typeof n.recommended == "boolean"
      );
      return r.length === 0 ? {
        success: !1,
        error: {
          code: "INVALID_FORMAT",
          message: "AI 返回的知识点格式不正确"
        }
      } : {
        success: !0,
        knowledgePoints: r.map((n) => ({
          id: n.id,
          text: n.text,
          description: n.description,
          difficulty: n.difficulty || 3,
          recommended: n.recommended
        }))
      };
    }
  } catch {
    const t = e.match(/\{[\s\S]*"knowledgePoints"[\s\S]*\}/);
    if (t)
      try {
        const r = JSON.parse(t[0]);
        if (r.knowledgePoints && Array.isArray(r.knowledgePoints)) {
          const n = r.knowledgePoints.filter(
            (a) => a.id && a.text && typeof a.recommended == "boolean"
          );
          if (n.length > 0)
            return {
              success: !0,
              knowledgePoints: n.map((a) => ({
                id: a.id,
                text: a.text,
                description: a.description,
                difficulty: a.difficulty || 3,
                recommended: a.recommended
              }))
            };
        }
      } catch {
      }
  }
  return {
    success: !1,
    error: {
      code: "PARSE_ERROR",
      message: "无法解析 AI 响应格式，请检查 AI 服务配置"
    }
  };
}
async function pg(e, t) {
  var a, s, i, c;
  const r = gr(e);
  if (!r.apiKey)
    return {
      success: !1,
      error: { code: "NO_API_KEY", message: "请先在设置中配置 API Key" }
    };
  const n = ug(t);
  console.log("[AI Knowledge Extractor] 开始提取知识点"), console.log(`[AI Knowledge Extractor] 内容长度: ${t.length}`);
  try {
    const d = await fetch(r.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${r.apiKey}`
      },
      body: JSON.stringify({
        model: r.model,
        messages: [
          {
            role: "system",
            content: "你是一个知识点分析专家。你的任务是从用户输入中提取适合制作记忆卡片的知识点。请严格以 JSON 格式返回结果。"
          },
          { role: "user", content: n }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    });
    if (!d.ok) {
      let f = `请求失败: ${d.status}`, p;
      try {
        p = await d.json(), f = ((a = p.error) == null ? void 0 : a.message) || p.message || f;
      } catch {
      }
      const g = Io(
        { code: `HTTP_${d.status}`, message: f },
        r
      );
      return console.error("[AI Knowledge Extractor] API 错误:"), console.error(g), {
        success: !1,
        error: {
          code: `HTTP_${d.status}`,
          message: g
        }
      };
    }
    const x = (c = (i = (s = (await d.json()).choices) == null ? void 0 : s[0]) == null ? void 0 : i.message) == null ? void 0 : c.content;
    if (!x)
      return console.error("[AI Knowledge Extractor] AI 返回内容为空"), {
        success: !1,
        error: { code: "EMPTY_RESPONSE", message: "AI 返回内容为空" }
      };
    console.log(`[AI Knowledge Extractor] AI 响应: ${x}`);
    const u = fg(x);
    return u.success && console.log(`[AI Knowledge Extractor] 成功提取 ${u.knowledgePoints.length} 个知识点`), u;
  } catch (d) {
    const l = d instanceof Error ? d.message : "网络错误", x = Io(
      { code: "NETWORK_ERROR", message: l },
      r
    );
    return console.error("[AI Knowledge Extractor] 网络错误:"), console.error(x), {
      success: !1,
      error: {
        code: "NETWORK_ERROR",
        message: x
      }
    };
  }
}
async function xg(e, t) {
  var i;
  if (!e || !e.anchor || !e.anchor.blockId) {
    orca.notify("warn", "请先选中一个块");
    return;
  }
  const r = e.anchor.blockId, n = orca.state.blocks[r];
  if (!n) {
    orca.notify("error", "未找到当前块");
    return;
  }
  const a = (i = n.text) == null ? void 0 : i.trim();
  if (!a) {
    orca.notify("warn", "当前块内容为空，无法生成卡片");
    return;
  }
  orca.notify("info", "AI 正在分析内容...", { title: "智能制卡" });
  const s = await pg(t, a);
  if (!s.success) {
    orca.notify("error", s.error.message, { title: "分析失败" });
    return;
  }
  s.knowledgePoints.length === 0 && orca.notify("warn", "未检测到知识点，请使用自定义输入", { title: "智能制卡" }), dd(s.knowledgePoints, a, r);
}
const gg = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  startInteractiveCardCreationNew: xg
}, Symbol.toStringTag, { value: "Module" }));
function Sa(e) {
  const t = /* @__PURE__ */ new Date();
  switch (e) {
    case "1month":
      return new Date(t.getFullYear(), t.getMonth() - 1, t.getDate());
    case "3months":
      return new Date(t.getFullYear(), t.getMonth() - 3, t.getDate());
    case "1year":
      return new Date(t.getFullYear() - 1, t.getMonth(), t.getDate());
    case "all":
      return /* @__PURE__ */ new Date(0);
  }
}
class hg {
  constructor() {
    me(this, "cache", /* @__PURE__ */ new Map());
    me(this, "defaultTTL", 3e4);
    // 默认缓存 30 秒
    me(this, "maxEntries", 100);
  }
  // 最大缓存条目数
  /**
   * 生成缓存键
   */
  generateKey(t, ...r) {
    return `${t}:${r.filter((n) => n !== void 0).join(":")}`;
  }
  /**
   * 获取缓存数据
   */
  get(t, ...r) {
    const n = this.generateKey(t, ...r), a = this.cache.get(n);
    return a ? Date.now() - a.timestamp > this.defaultTTL ? (this.cache.delete(n), null) : a.data : null;
  }
  /**
   * 设置缓存数据
   */
  set(t, r, ...n) {
    const a = this.generateKey(t, ...n);
    if (this.cache.size >= this.maxEntries) {
      const s = this.cache.keys().next().value;
      s && this.cache.delete(s);
    }
    this.cache.set(a, {
      data: r,
      timestamp: Date.now(),
      key: a
    });
  }
  /**
   * 清除特定类型的缓存
   */
  invalidate(t) {
    const r = `${t}:`;
    for (const n of this.cache.keys())
      n.startsWith(r) && this.cache.delete(n);
  }
  /**
   * 清除所有缓存
   */
  clear() {
    this.cache.clear();
  }
  /**
   * 获取缓存统计信息
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxEntries
    };
  }
}
const Me = new hg();
function yg() {
  Me.clear();
}
function Qi(e) {
  const t = new Date(e), r = /* @__PURE__ */ new Date();
  return t.getFullYear() === r.getFullYear() && t.getMonth() === r.getMonth() && t.getDate() === r.getDate();
}
function Hr(e) {
  return new Date(e.getFullYear(), e.getMonth(), e.getDate());
}
function to(e, t) {
  return t ? e.filter((r) => r.deckName === t) : e;
}
function ro(e, t) {
  return t ? e.filter((r) => r.deck === t) : e;
}
function Xi(e, t) {
  const n = to(e, t).filter((s) => Qi(s.timestamp)), a = {
    reviewedCount: n.length,
    newLearnedCount: 0,
    relearnedCount: 0,
    totalTime: 0,
    gradeDistribution: {
      again: 0,
      hard: 0,
      good: 0,
      easy: 0
    }
  };
  for (const s of n)
    a.totalTime += s.duration, a.gradeDistribution[s.grade]++, s.previousState === "new" && a.newLearnedCount++, s.grade === "again" && a.relearnedCount++;
  return a;
}
async function mg(e, t) {
  const r = Me.get("todayStats", e, t);
  if (r)
    return r;
  const a = Hr(/* @__PURE__ */ new Date()), s = new Date(a);
  s.setDate(s.getDate() + 1);
  const i = await Zr(e, a, s), c = Xi(i, t);
  return Me.set("todayStats", c, e, t), c;
}
function Zi(e, t, r) {
  const n = ro(e, r), s = Hr(/* @__PURE__ */ new Date()), i = [];
  let c = 0;
  for (let d = 0; d < t; d++) {
    const l = new Date(s);
    l.setDate(l.getDate() + d);
    const x = new Date(l);
    x.setDate(x.getDate() + 1);
    let u = 0, f = 0;
    for (const p of n) {
      const g = Hr(p.srs.due);
      g.getTime() >= l.getTime() && g.getTime() < x.getTime() && (p.isNew ? f++ : u++);
    }
    c += u + f, i.push({
      date: l,
      reviewDue: u,
      newAvailable: f,
      cumulative: c
    });
  }
  return { days: i };
}
async function vg(e, t = 30, r) {
  const n = Me.get("futureForecast", e, t, r);
  if (n)
    return n;
  const a = await Xt(e), s = Zi(a, t, r);
  return Me.set("futureForecast", s, e, t, r), s;
}
function ec(e, t, r, n) {
  const a = to(e, n), s = Hr(t), i = Hr(r), c = /* @__PURE__ */ new Map(), d = new Date(s);
  for (; d <= i; ) {
    const p = d.toISOString().split("T")[0];
    c.set(p, {
      date: new Date(d),
      again: 0,
      hard: 0,
      good: 0,
      easy: 0,
      total: 0
    }), d.setDate(d.getDate() + 1);
  }
  let l = 0;
  for (const p of a) {
    const y = new Date(p.timestamp).toISOString().split("T")[0], v = c.get(y);
    v && (v[p.grade]++, v.total++, l++);
  }
  const x = Array.from(c.values()).sort(
    (p, g) => p.date.getTime() - g.date.getTime()
  ), u = x.length || 1, f = l / u;
  return {
    days: x,
    totalReviews: l,
    averagePerDay: f
  };
}
async function bg(e, t, r) {
  const n = Me.get("reviewHistory", e, t, r);
  if (n)
    return n;
  const a = /* @__PURE__ */ new Date(), s = Sa(t), i = await Zr(e, s, a), c = ec(i, s, a, r);
  return Me.set("reviewHistory", c, e, t, r), c;
}
function tc(e, t) {
  const r = ro(e, t), n = {
    new: 0,
    learning: 0,
    review: 0,
    suspended: 0,
    total: r.length
  };
  for (const a of r)
    if (a.isNew)
      n.new++;
    else {
      const s = a.srs.state;
      s === 1 || s === 3 ? n.learning++ : n.review++;
    }
  return n;
}
async function wg(e, t) {
  const r = Me.get("cardStateDistribution", e, t);
  if (r)
    return r;
  const n = await Xt(e), a = tc(n, t);
  return Me.set("cardStateDistribution", a, e, t), a;
}
function rc(e, t, r, n) {
  const a = to(e, n), s = (y) => y.toISOString().split("T")[0], i = (y) => {
    const v = s(y);
    return /* @__PURE__ */ new Date(v + "T00:00:00.000Z");
  }, c = i(t), d = i(r), l = /* @__PURE__ */ new Map(), x = new Date(c);
  for (; x <= d; ) {
    const y = s(x);
    l.set(y, {
      date: new Date(x),
      time: 0
    }), x.setUTCDate(x.getUTCDate() + 1);
  }
  let u = 0;
  for (const y of a) {
    const v = new Date(y.timestamp), h = s(v), S = l.get(h);
    S && (S.time += y.duration, u += y.duration);
  }
  const f = Array.from(l.values()).sort(
    (y, v) => y.date.getTime() - v.date.getTime()
  ), p = f.length || 1, g = u / p;
  return {
    dailyTime: f,
    averagePerDay: g,
    totalTime: u
  };
}
async function Sg(e, t, r) {
  const n = Me.get("reviewTimeStats", e, t, r);
  if (n)
    return n;
  const a = /* @__PURE__ */ new Date(), s = Sa(t), i = await Zr(e, s, a), c = rc(i, s, a, r);
  return Me.set("reviewTimeStats", c, e, t, r), c;
}
const Cg = [
  { label: "0-1天", minDays: 0, maxDays: 1 },
  { label: "1-3天", minDays: 1, maxDays: 3 },
  { label: "3-7天", minDays: 3, maxDays: 7 },
  { label: "7-14天", minDays: 7, maxDays: 14 },
  { label: "14-30天", minDays: 14, maxDays: 30 },
  { label: "30-90天", minDays: 30, maxDays: 90 },
  { label: "90天以上", minDays: 90, maxDays: 1 / 0 }
];
function oc(e, t) {
  const r = ro(e, t), n = Cg.map((c) => ({
    label: c.label,
    minDays: c.minDays,
    maxDays: c.maxDays,
    count: 0
  }));
  let a = 0, s = 0;
  for (const c of r) {
    const d = c.srs.interval;
    a += d, d > s && (s = d);
    for (const l of n)
      if (d >= l.minDays && d < l.maxDays) {
        l.count++;
        break;
      }
  }
  const i = r.length > 0 ? a / r.length : 0;
  return {
    buckets: n,
    averageInterval: i,
    maxInterval: s
  };
}
async function kg(e, t) {
  const r = Me.get("intervalDistribution", e, t);
  if (r)
    return r;
  const n = await Xt(e), a = oc(n, t);
  return Me.set("intervalDistribution", a, e, t), a;
}
function nc(e, t) {
  const r = to(e, t), n = {
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    total: r.length,
    correctRate: 0
  };
  for (const a of r)
    n[a.grade]++;
  return n.total > 0 && (n.correctRate = (n.good + n.easy) / n.total), n;
}
async function jg(e, t, r) {
  const n = Me.get("answerButtonStats", e, t, r);
  if (n)
    return n;
  const a = /* @__PURE__ */ new Date(), s = Sa(t), i = await Zr(e, s, a), c = nc(i, r);
  return Me.set("answerButtonStats", c, e, t, r), c;
}
const Rg = [
  { label: "1-2", minValue: 1, maxValue: 2 },
  { label: "2-3", minValue: 2, maxValue: 3 },
  { label: "3-4", minValue: 3, maxValue: 4 },
  { label: "4-5", minValue: 4, maxValue: 5 },
  { label: "5-6", minValue: 5, maxValue: 6 },
  { label: "6-7", minValue: 6, maxValue: 7 },
  { label: "7-8", minValue: 7, maxValue: 8 },
  { label: "8-9", minValue: 8, maxValue: 9 },
  { label: "9-10", minValue: 9, maxValue: 10 }
];
function ac(e, t) {
  const r = ro(e, t), n = Rg.map((d) => ({
    label: d.label,
    minValue: d.minValue,
    maxValue: d.maxValue,
    count: 0
  }));
  let a = 0, s = 1 / 0, i = -1 / 0;
  for (const d of r) {
    const l = d.srs.difficulty;
    a += l, l < s && (s = l), l > i && (i = l);
    for (const x of n) {
      if (l >= x.minValue && l < x.maxValue) {
        x.count++;
        break;
      }
      if (l === 10 && x.maxValue === 10) {
        x.count++;
        break;
      }
    }
  }
  const c = r.length > 0 ? a / r.length : 0;
  return r.length === 0 && (s = 0, i = 0), {
    buckets: n,
    averageDifficulty: c,
    minDifficulty: s,
    maxDifficulty: i
  };
}
async function $g(e, t) {
  const r = Me.get("difficultyDistribution", e, t);
  if (r)
    return r;
  const n = await Xt(e), a = ac(n, t);
  return Me.set("difficultyDistribution", a, e, t), a;
}
const sc = "statisticsPreferences", Bn = {
  timeRange: "1month",
  selectedDeck: void 0
};
async function ic(e) {
  try {
    const t = await orca.plugins.getData(e, sc);
    if (!t)
      return { ...Bn };
    const r = JSON.parse(t);
    return {
      ...Bn,
      ...r
    };
  } catch (t) {
    return console.warn(`[${e}] 加载统计偏好设置失败:`, t), { ...Bn };
  }
}
async function Ca(e, t) {
  try {
    const n = {
      ...await ic(e),
      ...t
    };
    await orca.plugins.setData(e, sc, JSON.stringify(n));
  } catch (r) {
    throw console.error(`[${e}] 保存统计偏好设置失败:`, r), r;
  }
}
async function Dg(e, t) {
  await Ca(e, { timeRange: t });
}
async function Tg(e, t) {
  await Ca(e, { selectedDeck: t });
}
const $o = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  calculateAnswerButtonStats: nc,
  calculateCardStateDistribution: tc,
  calculateDifficultyDistribution: ac,
  calculateFutureForecast: Zi,
  calculateIntervalDistribution: oc,
  calculateReviewHistory: ec,
  calculateReviewTimeStats: rc,
  calculateTodayStatistics: Xi,
  clearStatisticsCache: yg,
  filterCardsByDeck: ro,
  filterLogsByDeck: to,
  getAnswerButtonStats: jg,
  getCardStateDistribution: wg,
  getDifficultyDistribution: $g,
  getFutureForecast: vg,
  getIntervalDistribution: kg,
  getReviewHistory: bg,
  getReviewTimeStats: Sg,
  getStatisticsPreferences: ic,
  getTodayStatistics: mg,
  isToday: Qi,
  saveSelectedDeckPreference: Tg,
  saveStatisticsPreferences: Ca,
  saveTimeRangePreference: Dg
}, Symbol.toStringTag, { value: "Module" })), Eg = 10, _g = 3, zg = 3, Ig = 7, Mg = 30;
function Bg(e) {
  return e.clozeNumber ? `${e.id}_cloze_${e.clozeNumber}` : e.directionType ? `${e.id}_direction_${e.directionType}` : `${e.id}_basic`;
}
function Ag(e) {
  return e.cardId.toString();
}
function Pg(e, t) {
  const r = t.filter((i) => (Ag(i), e.includes(i.cardId.toString())));
  if (r.length === 0)
    return { recentAgainCount: 0, lastReviewDate: null };
  r.sort((i, c) => c.timestamp - i.timestamp);
  const a = r.slice(0, Eg).filter((i) => i.grade === "again").length, s = new Date(r[0].timestamp);
  return { recentAgainCount: a, lastReviewDate: s };
}
function Lg(e, t) {
  const r = [];
  return t >= _g && r.push("high_again_rate"), e.srs.lapses >= zg && r.push("high_lapses"), e.srs.difficulty >= Ig && r.push("high_difficulty"), r.length === 0 ? { isDifficult: !1, reason: "high_again_rate" } : { isDifficult: !0, reason: r.length > 1 ? "multiple" : r[0] };
}
async function Og(e, t) {
  const r = await Xt(e), n = t ? r.filter((d) => d.deck === t) : r, a = /* @__PURE__ */ new Date(), s = /* @__PURE__ */ new Date();
  s.setDate(s.getDate() - Mg);
  const i = await Zr(e, s, a), c = [];
  for (const d of n) {
    if (d.isNew) continue;
    const l = Bg(d), { recentAgainCount: x, lastReviewDate: u } = Pg(l, i), { isDifficult: f, reason: p } = Lg(d, x);
    f && c.push({
      card: d,
      reason: p,
      recentAgainCount: x,
      totalLapses: d.srs.lapses,
      difficulty: d.srs.difficulty,
      lastReviewDate: u
    });
  }
  return c.sort((d, l) => {
    const x = {
      multiple: 0,
      high_again_rate: 1,
      high_lapses: 2,
      high_difficulty: 3
    }, u = x[d.reason] - x[l.reason];
    return u !== 0 ? u : l.totalLapses - d.totalLapses;
  }), c;
}
const Fg = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getDifficultCards: Og
}, Symbol.toStringTag, { value: "Module" })), Jn = "deckNotes";
async function Wg(e, t, r) {
  try {
    const n = await orca.plugins.getData(e, Jn), a = n ? JSON.parse(n) : {};
    r.trim() === "" ? delete a[t] : a[t] = r.trim(), await orca.plugins.setData(e, Jn, JSON.stringify(a));
  } catch (n) {
    throw console.error(`[${e}] 设置卡组备注失败:`, n), n;
  }
}
async function Hg(e) {
  try {
    const t = await orca.plugins.getData(e, Jn);
    return t ? JSON.parse(t) : {};
  } catch (t) {
    return console.warn(`[${e}] 获取所有卡组备注失败:`, t), {};
  }
}
const Qn = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getAllDeckNotes: Hg,
  setDeckNote: Wg
}, Symbol.toStringTag, { value: "Module" }));
function cc(e) {
  const t = [], r = [];
  for (const s of e) {
    const i = je(s);
    if (i === "topic") {
      t.push(s.id);
      continue;
    }
    i === "extracts" && r.push(s.id);
  }
  const n = [...t, ...r];
  return Array.from(new Set(n));
}
async function Ng(e) {
  const t = ["card", "Card"], r = /* @__PURE__ */ new Map();
  for (const n of t)
    try {
      const a = await orca.invokeBackend("get-blocks-with-tags", [n]);
      for (const s of a ?? [])
        r.set(s.id, s);
    } catch (a) {
      console.warn(`[IR Reset] 查询标签 "${n}" 失败:`, a);
    }
  return Array.from(r.values());
}
async function Yg(e) {
  var r;
  await na(e), await on(e), await orca.commands.invokeEditorCommand(
    "core.editor.removeTag",
    null,
    e,
    "card"
  );
  const t = (r = orca.state.blocks) == null ? void 0 : r[e];
  t && t._repr && delete t._repr;
}
async function qg(e, t = {}) {
  var l, x;
  const r = [], { disableAutoExtractMark: n = !0 } = t;
  let a = !1;
  if (n)
    try {
      const { enableAutoExtractMark: u } = dt(e);
      u && (await orca.plugins.setSettings("app", e, {
        [Ce.enableAutoExtractMark]: !1
      }), a = !0);
    } catch (u) {
      console.warn("[IR Reset] 关闭“自动标签”开关失败（将继续清理）:", u);
    } finally {
      an(e);
    }
  const s = await Ng(), i = cc(s);
  let c = 0;
  for (const u of i)
    try {
      await Yg(u), c += 1;
    } catch (f) {
      r.push({ blockId: u, error: f });
    }
  let d = null;
  try {
    if (d = await np(e), d) {
      await on(d);
      const u = (l = orca.state.blocks) == null ? void 0 : l[d];
      u && ((x = u._repr) == null ? void 0 : x.type) === "srs.ir-session" && delete u._repr;
    }
  } catch (u) {
    console.warn("[IR Reset] 清理会话块 ir.* 属性失败:", u);
  }
  try {
    await orca.plugins.removeData(e, op);
  } catch (u) {
    console.warn("[IR Reset] 清理 focusCardId 失败:", u);
  }
  try {
    await ip(e);
  } catch (u) {
    console.warn("[IR Reset] 清理会话块记录失败:", u);
  }
  return {
    totalFound: i.length,
    totalCleaned: c,
    disabledAutoExtractMark: a,
    sessionBlockId: d,
    errors: r
  };
}
const Kg = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  resetIncrementalReadingData: qg,
  selectIncrementalReadingCardIdsFromBlocks: cc
}, Symbol.toStringTag, { value: "Module" }));
export {
  ca as buildReviewQueue,
  ai as buildReviewQueueWithChildren,
  Ls as calculateDeckStats,
  ki as collectChildCards,
  Xt as collectReviewCards,
  Nr as extractDeckName,
  Oe as getCardKey,
  ag as getPluginName,
  og as getReviewDeckFilter,
  ng as getReviewHostPanelId,
  ji as hasChildCards,
  eg as load,
  cg as openFlashcardHome,
  ig as openIRManager,
  sg as startIncrementalReadingSession,
  lg as startRepeatReviewSession,
  rg as startReviewSession,
  tg as unload
};
