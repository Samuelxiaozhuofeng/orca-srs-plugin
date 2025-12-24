var Rn = Object.defineProperty;
var $n = (e, t, r) => t in e ? Rn(e, t, { enumerable: !0, configurable: !0, writable: !0, value: r }) : e[t] = r;
var U = (e, t, r) => $n(e, typeof t != "symbol" ? t + "" : t, r);
function nr(e) {
  return e && e.replace(/#[\w/\u4e00-\u9fa5]+/g, "").trim();
}
function jn(e) {
  var r, n;
  const t = (r = e._repr) == null ? void 0 : r.type;
  return t === "srs.card" || t === "srs.cloze-card" || ((n = e.properties) == null ? void 0 : n.some((o) => o.name === "srs.isCard"));
}
function En(e) {
  var n;
  if (!(e != null && e.children) || e.children.length === 0) return "（无答案）";
  const t = e.children[0], r = (n = orca.state.blocks) == null ? void 0 : n[t];
  return (r == null ? void 0 : r.text) || "（无答案）";
}
function Bt(e) {
  var s, i;
  const t = ((s = e._repr) == null ? void 0 : s.front) ?? e.text ?? "（无题目）", r = ((i = e._repr) == null ? void 0 : i.back) ?? En(e), n = nr(t), o = nr(r);
  return { front: n, back: o };
}
function se(e) {
  return (e == null ? void 0 : e.toLowerCase()) === "card";
}
const we = "Default", Tn = "牌组", gt = /* @__PURE__ */ new Map();
function nt(e) {
  if (!e.refs || e.refs.length === 0)
    return "basic";
  const t = e.refs.find(
    (o) => o.type === 2 && // RefType.Property（标签引用）
    se(o.alias)
    // 标签名称为 "card"（大小写不敏感）
  );
  if (!t || !t.data || t.data.length === 0)
    return "basic";
  const r = t.data.find((o) => o.name === "type");
  if (!r)
    return "basic";
  const n = r.value;
  if (Array.isArray(n)) {
    if (n.length === 0 || !n[0] || typeof n[0] != "string")
      return "basic";
    const o = n[0].trim().toLowerCase();
    return o === "cloze" ? "cloze" : o === "direction" ? "direction" : "basic";
  } else if (typeof n == "string") {
    const o = n.trim().toLowerCase();
    return o === "cloze" ? "cloze" : o === "direction" ? "direction" : "basic";
  }
  return "basic";
}
async function Mt(e) {
  if (!e.refs || e.refs.length === 0)
    return we;
  const t = e.refs.find(
    (c) => c.type === 2 && // RefType.Property（标签引用）
    se(c.alias)
    // 标签名称为 "card"（大小写不敏感）
  );
  if (!t || !t.data || t.data.length === 0)
    return we;
  const r = t.data.find((c) => c.name === Tn);
  if (!r)
    return we;
  const n = r.value;
  if (!Array.isArray(n) || n.length === 0)
    return we;
  const o = Dn(n[0]);
  if (!o)
    return we;
  const s = e.refs.find((c) => c.id === o);
  if (!s)
    return we;
  const i = await In(s.to);
  return i || we;
}
function Dn(e) {
  if (typeof e == "number" && Number.isFinite(e)) return e;
  if (typeof e == "string" && e.trim() !== "") {
    const t = Number(e);
    if (Number.isFinite(t)) return t;
  }
  return null;
}
async function In(e) {
  var i, c, d;
  const t = gt.get(e);
  if (t !== void 0) return t;
  const r = (i = orca.state.blocks) == null ? void 0 : i[e], n = (c = r == null ? void 0 : r.text) == null ? void 0 : c.trim();
  if (n)
    return gt.set(e, n), n;
  const o = await orca.invokeBackend("get-block", e), s = (d = o == null ? void 0 : o.text) == null ? void 0 : d.trim();
  return s ? (gt.set(e, s), s) : null;
}
function Cr(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e) {
    const o = n.deck;
    t.has(o) || t.set(o, {
      name: o,
      totalCount: 0,
      newCount: 0,
      overdueCount: 0,
      todayCount: 0,
      futureCount: 0
    });
    const s = t.get(o);
    if (s.totalCount++, n.isNew)
      s.newCount++;
    else {
      const i = /* @__PURE__ */ new Date(), c = new Date(i.getFullYear(), i.getMonth(), i.getDate()), d = new Date(c);
      d.setDate(d.getDate() + 1), n.srs.due < c ? s.overdueCount++ : n.srs.due >= c && n.srs.due < d ? s.todayCount++ : s.futureCount++;
    }
  }
  const r = Array.from(t.values());
  return r.sort((n, o) => n.name === "Default" && o.name !== "Default" ? -1 : n.name !== "Default" && o.name === "Default" ? 1 : n.name.localeCompare(o.name)), {
    decks: r,
    totalCards: e.length,
    totalNew: e.filter((n) => n.isNew).length,
    totalOverdue: e.filter((n) => {
      if (n.isNew) return !1;
      const o = /* @__PURE__ */ new Date();
      return o.setHours(0, 0, 0, 0), n.srs.due < o;
    }).length
  };
}
var M = /* @__PURE__ */ ((e) => (e[e.New = 0] = "New", e[e.Learning = 1] = "Learning", e[e.Review = 2] = "Review", e[e.Relearning = 3] = "Relearning", e))(M || {}), m = /* @__PURE__ */ ((e) => (e[e.Manual = 0] = "Manual", e[e.Again = 1] = "Again", e[e.Hard = 2] = "Hard", e[e.Good = 3] = "Good", e[e.Easy = 4] = "Easy", e))(m || {});
class T {
  static card(t) {
    return {
      ...t,
      state: T.state(t.state),
      due: T.time(t.due),
      last_review: t.last_review ? T.time(t.last_review) : void 0
    };
  }
  static rating(t) {
    if (typeof t == "string") {
      const r = t.charAt(0).toUpperCase(), n = t.slice(1).toLowerCase(), o = m[`${r}${n}`];
      if (o === void 0)
        throw new Error(`Invalid rating:[${t}]`);
      return o;
    } else if (typeof t == "number")
      return t;
    throw new Error(`Invalid rating:[${t}]`);
  }
  static state(t) {
    if (typeof t == "string") {
      const r = t.charAt(0).toUpperCase(), n = t.slice(1).toLowerCase(), o = M[`${r}${n}`];
      if (o === void 0)
        throw new Error(`Invalid state:[${t}]`);
      return o;
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
      due: T.time(t.due),
      rating: T.rating(t.rating),
      state: T.state(t.state),
      review: T.time(t.review)
    };
  }
}
Date.prototype.scheduler = function(e, t) {
  return ue(this, e, t);
};
Date.prototype.diff = function(e, t) {
  return ze(this, e, t);
};
Date.prototype.format = function() {
  return zn(this);
};
Date.prototype.dueFormat = function(e, t, r) {
  return An(this, e, t, r);
};
function ue(e, t, r) {
  return new Date(
    r ? T.time(e).getTime() + t * 24 * 60 * 60 * 1e3 : T.time(e).getTime() + t * 60 * 1e3
  );
}
function ze(e, t, r) {
  if (!e || !t)
    throw new Error("Invalid date");
  const n = T.time(e).getTime() - T.time(t).getTime();
  let o = 0;
  switch (r) {
    case "days":
      o = Math.floor(n / (24 * 60 * 60 * 1e3));
      break;
    case "minutes":
      o = Math.floor(n / (60 * 1e3));
      break;
  }
  return o;
}
function zn(e) {
  const t = T.time(e), r = t.getFullYear(), n = t.getMonth() + 1, o = t.getDate(), s = t.getHours(), i = t.getMinutes(), c = t.getSeconds();
  return `${r}-${Fe(n)}-${Fe(o)} ${Fe(s)}:${Fe(
    i
  )}:${Fe(c)}`;
}
function Fe(e) {
  return e < 10 ? `0${e}` : `${e}`;
}
const yt = [60, 60, 24, 31, 12], mt = ["second", "min", "hour", "day", "month", "year"];
function An(e, t, r, n = mt) {
  e = T.time(e), t = T.time(t), n.length !== mt.length && (n = mt);
  let o = e.getTime() - t.getTime(), s = 0;
  for (o /= 1e3, s = 0; s < yt.length && !(o < yt[s]); s++)
    o /= yt[s];
  return `${Math.floor(o)}${r ? n[s] : ""}`;
}
const Bn = Object.freeze([
  m.Again,
  m.Hard,
  m.Good,
  m.Easy
]), Mn = [
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
function Fn(e, t, r) {
  let n = 1;
  for (const i of Mn)
    n += i.factor * Math.max(Math.min(e, i.end) - i.start, 0);
  e = Math.min(e, r);
  let o = Math.max(2, Math.round(e - n));
  const s = Math.min(Math.round(e + n), r);
  return e > t && (o = Math.max(o, t + 1)), o = Math.min(o, s), { min_ivl: o, max_ivl: s };
}
function ee(e, t, r) {
  return Math.min(Math.max(e, t), r);
}
function Pn(e, t) {
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
const On = (e) => {
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
}, Ln = (e, t, r) => {
  const n = t === M.Relearning || t === M.Review ? e.relearning_steps : e.learning_steps, o = n.length;
  if (o === 0 || r >= o) return {};
  const s = n[0], i = On, c = () => i(s), d = () => {
    if (o === 1) return Math.round(i(s) * 1.5);
    const v = n[1];
    return Math.round((i(s) + i(v)) / 2);
  }, u = (v) => v < 0 || v >= o ? null : n[v], f = (v) => i(v), p = {}, g = u(Math.max(0, r));
  if (t === M.Review)
    return p[m.Again] = {
      scheduled_minutes: i(g),
      next_step: 0
    }, p;
  {
    p[m.Again] = {
      scheduled_minutes: c(),
      next_step: 0
    }, p[m.Hard] = {
      scheduled_minutes: d(),
      next_step: r
    };
    const v = u(r + 1);
    if (v) {
      const y = f(v);
      y && (p[m.Good] = {
        scheduled_minutes: Math.round(y),
        next_step: r + 1
      });
    }
  }
  return p;
};
function Hn() {
  const e = this.review_time.getTime(), t = this.current.reps, r = this.current.difficulty * this.current.stability;
  return `${e}_${t}_${r}`;
}
var ot = /* @__PURE__ */ ((e) => (e.SCHEDULER = "Scheduler", e.LEARNING_STEPS = "LearningSteps", e.SEED = "Seed", e))(ot || {});
class _r {
  // init
  constructor(t, r, n, o) {
    U(this, "last");
    U(this, "current");
    U(this, "review_time");
    U(this, "next", /* @__PURE__ */ new Map());
    U(this, "algorithm");
    U(this, "strategies");
    U(this, "elapsed_days", 0);
    this.algorithm = n, this.last = T.card(t), this.current = T.card(t), this.review_time = T.time(r), this.strategies = o, this.init();
  }
  checkGrade(t) {
    if (!Number.isFinite(t) || t < 0 || t > 4)
      throw new Error(`Invalid grade "${t}",expected 1-4`);
  }
  init() {
    const { state: t, last_review: r } = this.current;
    let n = 0;
    t !== M.New && r && (n = Pn(r, this.review_time)), this.current.last_review = this.review_time, this.elapsed_days = n, this.current.elapsed_days = n, this.current.reps += 1;
    let o = Hn;
    if (this.strategies) {
      const s = this.strategies.get(ot.SEED);
      s && (o = s);
    }
    this.algorithm.seed = o.call(this);
  }
  preview() {
    return {
      [m.Again]: this.review(m.Again),
      [m.Hard]: this.review(m.Hard),
      [m.Good]: this.review(m.Good),
      [m.Easy]: this.review(m.Easy),
      [Symbol.iterator]: this.previewIterator.bind(this)
    };
  }
  *previewIterator() {
    for (const t of Bn)
      yield this.review(t);
  }
  review(t) {
    const { state: r } = this.last;
    let n;
    switch (this.checkGrade(t), r) {
      case M.New:
        n = this.newState(t);
        break;
      case M.Learning:
      case M.Relearning:
        n = this.learningState(t);
        break;
      case M.Review:
        n = this.reviewState(t);
        break;
    }
    return n;
  }
  buildLog(t) {
    const { last_review: r, due: n, elapsed_days: o } = this.last;
    return {
      rating: t,
      state: this.current.state,
      due: r || n,
      stability: this.current.stability,
      difficulty: this.current.difficulty,
      elapsed_days: this.elapsed_days,
      last_elapsed_days: o,
      scheduled_days: this.current.scheduled_days,
      learning_steps: this.current.learning_steps,
      review: this.review_time
    };
  }
}
class Wn {
  constructor(t) {
    U(this, "c");
    U(this, "s0");
    U(this, "s1");
    U(this, "s2");
    const r = Nn();
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
function Nn() {
  let e = 4022871197;
  return function(r) {
    r = String(r);
    for (let n = 0; n < r.length; n++) {
      e += r.charCodeAt(n);
      let o = 0.02519603282416938 * e;
      e = o >>> 0, o -= e, o *= e, e = o >>> 0, o -= e, e += o * 4294967296;
    }
    return (e >>> 0) * 23283064365386963e-26;
  };
}
function Un(e) {
  const t = new Wn(e), r = () => t.next();
  return r.int32 = () => t.next() * 4294967296 | 0, r.double = () => r() + (r() * 2097152 | 0) * 11102230246251565e-32, r.state = () => t.state, r.importState = (n) => (t.state = n, r), r;
}
const qn = 0.9, Gn = 36500, Vn = !1, st = !0, Yn = Object.freeze([
  "1m",
  "10m"
]), Kn = Object.freeze([
  "10m"
]), fe = 1e-3, Je = 100, or = 0.5, Jn = 0.1542, sr = Object.freeze([
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
  Jn
]), Xn = 2, Qn = (e, t = st) => [
  [fe, Je],
  [fe, Je],
  [fe, Je],
  [fe, Je],
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
], xt = (e, t, r = st) => {
  let n = Xn;
  if (Math.max(0, t) > 1) {
    const s = -(Math.log(e[11]) + Math.log(Math.pow(2, e[13]) - 1) + e[14] * 0.3) / t;
    n = ee(+s.toFixed(8), 0.01, 2);
  }
  return Qn(n, r).slice(
    0,
    e.length
  ).map(
    ([s, i], c) => ee(e[c] || 0, s, i)
  );
}, Ft = (e, t = 0, r = st) => {
  if (e === void 0)
    return [...sr];
  switch (e.length) {
    case 21:
      return xt(
        Array.from(e),
        t,
        r
      );
    case 19:
      return console.debug("[FSRS-6]auto fill w from 19 to 21 length"), xt(
        Array.from(e),
        t,
        r
      ).concat([0, or]);
    case 17: {
      const n = xt(
        Array.from(e),
        t,
        r
      );
      return n[4] = +(n[5] * 2 + n[4]).toFixed(8), n[5] = +(Math.log(n[5] * 3 + 1) / 3).toFixed(8), n[6] = +(n[6] + 0.5).toFixed(8), console.debug("[FSRS-6]auto fill w from 17 to 21 length"), n.concat([0, 0, 0, or]);
    }
    default:
      return console.warn("[FSRS]Invalid parameters length, using default parameters"), [...sr];
  }
}, jt = (e) => {
  const t = Array.isArray(e == null ? void 0 : e.learning_steps) ? e.learning_steps : Yn, r = Array.isArray(e == null ? void 0 : e.relearning_steps) ? e.relearning_steps : Kn, n = (e == null ? void 0 : e.enable_short_term) ?? st, o = Ft(
    e == null ? void 0 : e.w,
    r.length,
    n
  );
  return {
    request_retention: (e == null ? void 0 : e.request_retention) || qn,
    maximum_interval: (e == null ? void 0 : e.maximum_interval) || Gn,
    w: o,
    enable_fuzz: (e == null ? void 0 : e.enable_fuzz) ?? Vn,
    enable_short_term: n,
    learning_steps: t,
    relearning_steps: r
  };
};
function Ue(e, t) {
  return {
    due: e ? T.time(e) : /* @__PURE__ */ new Date(),
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 0,
    lapses: 0,
    learning_steps: 0,
    state: M.New,
    last_review: void 0
  };
}
const kr = (e) => {
  const t = typeof e == "number" ? -e : -e[20], r = Math.exp(Math.pow(t, -1) * Math.log(0.9)) - 1;
  return { decay: t, factor: +r.toFixed(8) };
};
function Et(e, t, r) {
  const { decay: n, factor: o } = kr(e);
  return +Math.pow(1 + o * t / r, n).toFixed(8);
}
class Zn {
  constructor(t) {
    U(this, "param");
    U(this, "intervalModifier");
    U(this, "_seed");
    /**
     * The formula used is :
     * $$R(t,S) = (1 + \text{FACTOR} \times \frac{t}{9 \cdot S})^{\text{DECAY}}$$
     * @param {number} elapsed_days t days since the last review
     * @param {number} stability Stability (interval when R=90%)
     * @return {number} r Retrievability (probability of recall)
     */
    U(this, "forgetting_curve");
    this.param = new Proxy(
      jt(t),
      this.params_handler_proxy()
    ), this.intervalModifier = this.calculate_interval_modifier(
      this.param.request_retention
    ), this.forgetting_curve = Et.bind(this, this.param.w);
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
    const { decay: r, factor: n } = kr(this.param.w);
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
      set: function(r, n, o) {
        return n === "request_retention" && Number.isFinite(o) ? t.intervalModifier = t.calculate_interval_modifier(
          Number(o)
        ) : n === "w" && (o = Ft(
          o,
          r.relearning_steps.length,
          r.enable_short_term
        ), t.forgetting_curve = Et.bind(this, o), t.intervalModifier = t.calculate_interval_modifier(
          Number(r.request_retention)
        )), Reflect.set(r, n, o), !0;
      }
    };
  }
  update_parameters(t) {
    const r = jt(t);
    for (const n in r) {
      const o = n;
      this.param[o] = r[o];
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
    const o = Un(this._seed)(), { min_ivl: s, max_ivl: i } = Fn(
      t,
      r,
      this.param.maximum_interval
    );
    return Math.floor(o * (i - s + 1) + s);
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
    const n = -this.param.w[6] * (r - 3), o = t + this.linear_damping(n, t);
    return ee(
      this.mean_reversion(this.init_difficulty(m.Easy), o),
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
  next_recall_stability(t, r, n, o) {
    const s = m.Hard === o ? this.param.w[15] : 1, i = m.Easy === o ? this.param.w[16] : 1;
    return +ee(
      r * (1 + Math.exp(this.param.w[8]) * (11 - t) * Math.pow(r, -this.param.w[9]) * (Math.exp((1 - n) * this.param.w[10]) - 1) * s * i),
      fe,
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
    return +ee(
      this.param.w[11] * Math.pow(t, -this.param.w[12]) * (Math.pow(r + 1, this.param.w[13]) - 1) * Math.exp((1 - n) * this.param.w[14]),
      fe,
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
    const n = Math.pow(t, -this.param.w[19]) * Math.exp(this.param.w[17] * (r - 3 + this.param.w[18])), o = r >= 3 ? Math.max(n, 1) : n;
    return +ee(t * o, fe, 36500).toFixed(8);
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
    const { difficulty: o, stability: s } = t ?? {
      difficulty: 0,
      stability: 0
    };
    if (r < 0)
      throw new Error(`Invalid delta_t "${r}"`);
    if (n < 0 || n > 4)
      throw new Error(`Invalid grade "${n}"`);
    if (o === 0 && s === 0)
      return {
        difficulty: ee(this.init_difficulty(n), 1, 10),
        stability: this.init_stability(n)
      };
    if (n === 0)
      return {
        difficulty: o,
        stability: s
      };
    if (o < 1 || s < fe)
      throw new Error(
        `Invalid memory state { difficulty: ${o}, stability: ${s} }`
      );
    const i = this.forgetting_curve(r, s), c = this.next_recall_stability(o, s, i, n), d = this.next_forget_stability(o, s, i), u = this.next_short_term_stability(s, n);
    let f = c;
    if (n === 1) {
      let [g, v] = [0, 0];
      this.param.enable_short_term && (g = this.param.w[17], v = this.param.w[18]);
      const y = s / Math.exp(g * v);
      f = ee(+y.toFixed(8), fe, d);
    }
    return r === 0 && this.param.enable_short_term && (f = u), { difficulty: this.next_difficulty(o, n), stability: f };
  }
}
class ar extends _r {
  constructor(r, n, o, s) {
    super(r, n, o, s);
    U(this, "learningStepsStrategy");
    let i = Ln;
    if (this.strategies) {
      const c = this.strategies.get(ot.LEARNING_STEPS);
      c && (i = c);
    }
    this.learningStepsStrategy = i;
  }
  getLearningInfo(r, n) {
    var d, u;
    const o = this.algorithm.parameters;
    r.learning_steps = r.learning_steps || 0;
    const s = this.learningStepsStrategy(
      o,
      r.state,
      // In the original learning steps setup (Again = 5m, Hard = 10m, Good = FSRS),
      // not adding 1 can cause slight variations in the memory state’s ds.
      this.current.state === M.Learning && n !== m.Again && n !== m.Hard ? r.learning_steps + 1 : r.learning_steps
    ), i = Math.max(
      0,
      ((d = s[n]) == null ? void 0 : d.scheduled_minutes) ?? 0
    ), c = Math.max(0, ((u = s[n]) == null ? void 0 : u.next_step) ?? 0);
    return {
      scheduled_minutes: i,
      next_steps: c
    };
  }
  /**
   * @description This function applies the learning steps based on the current card's state and grade.
   */
  applyLearningSteps(r, n, o) {
    const { scheduled_minutes: s, next_steps: i } = this.getLearningInfo(
      this.current,
      n
    );
    if (s > 0 && s < 1440)
      r.learning_steps = i, r.scheduled_days = 0, r.state = o, r.due = ue(
        this.review_time,
        Math.round(s),
        !1
        /** true:days false: minute */
      );
    else if (r.state = M.Review, s >= 1440)
      r.learning_steps = i, r.due = ue(
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
      r.scheduled_days = c, r.due = ue(this.review_time, c, !0);
    }
  }
  newState(r) {
    const n = this.next.get(r);
    if (n)
      return n;
    const o = T.card(this.current);
    o.difficulty = ee(this.algorithm.init_difficulty(r), 1, 10), o.stability = this.algorithm.init_stability(r), this.applyLearningSteps(o, r, M.Learning);
    const s = {
      card: o,
      log: this.buildLog(r)
    };
    return this.next.set(r, s), s;
  }
  learningState(r) {
    const n = this.next.get(r);
    if (n)
      return n;
    const { state: o, difficulty: s, stability: i } = this.last, c = T.card(this.current);
    c.difficulty = this.algorithm.next_difficulty(s, r), c.stability = this.algorithm.next_short_term_stability(i, r), this.applyLearningSteps(
      c,
      r,
      o
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
    const o = this.elapsed_days, { difficulty: s, stability: i } = this.last, c = this.algorithm.forgetting_curve(o, i), d = T.card(this.current), u = T.card(this.current), f = T.card(this.current), p = T.card(this.current);
    this.next_ds(
      d,
      u,
      f,
      p,
      s,
      i,
      c
    ), this.next_interval(u, f, p, o), this.next_state(u, f, p), this.applyLearningSteps(d, m.Again, M.Relearning), d.lapses += 1;
    const g = {
      card: d,
      log: this.buildLog(m.Again)
    }, v = {
      card: u,
      log: super.buildLog(m.Hard)
    }, y = {
      card: f,
      log: super.buildLog(m.Good)
    }, _ = {
      card: p,
      log: super.buildLog(m.Easy)
    };
    return this.next.set(m.Again, g), this.next.set(m.Hard, v), this.next.set(m.Good, y), this.next.set(m.Easy, _), this.next.get(r);
  }
  /**
   * Review next_ds
   */
  next_ds(r, n, o, s, i, c, d) {
    r.difficulty = this.algorithm.next_difficulty(
      i,
      m.Again
    );
    const u = c / Math.exp(
      this.algorithm.parameters.w[17] * this.algorithm.parameters.w[18]
    ), f = this.algorithm.next_forget_stability(
      i,
      c,
      d
    );
    r.stability = ee(+u.toFixed(8), fe, f), n.difficulty = this.algorithm.next_difficulty(
      i,
      m.Hard
    ), n.stability = this.algorithm.next_recall_stability(
      i,
      c,
      d,
      m.Hard
    ), o.difficulty = this.algorithm.next_difficulty(
      i,
      m.Good
    ), o.stability = this.algorithm.next_recall_stability(
      i,
      c,
      d,
      m.Good
    ), s.difficulty = this.algorithm.next_difficulty(
      i,
      m.Easy
    ), s.stability = this.algorithm.next_recall_stability(
      i,
      c,
      d,
      m.Easy
    );
  }
  /**
   * Review next_interval
   */
  next_interval(r, n, o, s) {
    let i, c;
    i = this.algorithm.next_interval(r.stability, s), c = this.algorithm.next_interval(n.stability, s), i = Math.min(i, c), c = Math.max(c, i + 1);
    const d = Math.max(
      this.algorithm.next_interval(o.stability, s),
      c + 1
    );
    r.scheduled_days = i, r.due = ue(this.review_time, i, !0), n.scheduled_days = c, n.due = ue(this.review_time, c, !0), o.scheduled_days = d, o.due = ue(this.review_time, d, !0);
  }
  /**
   * Review next_state
   */
  next_state(r, n, o) {
    r.state = M.Review, r.learning_steps = 0, n.state = M.Review, n.learning_steps = 0, o.state = M.Review, o.learning_steps = 0;
  }
}
class ir extends _r {
  newState(t) {
    const r = this.next.get(t);
    if (r)
      return r;
    this.current.scheduled_days = 0, this.current.elapsed_days = 0;
    const n = T.card(this.current), o = T.card(this.current), s = T.card(this.current), i = T.card(this.current);
    return this.init_ds(n, o, s, i), this.next_interval(
      n,
      o,
      s,
      i,
      0
    ), this.next_state(n, o, s, i), this.update_next(n, o, s, i), this.next.get(t);
  }
  init_ds(t, r, n, o) {
    t.difficulty = ee(
      this.algorithm.init_difficulty(m.Again),
      1,
      10
    ), t.stability = this.algorithm.init_stability(m.Again), r.difficulty = ee(
      this.algorithm.init_difficulty(m.Hard),
      1,
      10
    ), r.stability = this.algorithm.init_stability(m.Hard), n.difficulty = ee(
      this.algorithm.init_difficulty(m.Good),
      1,
      10
    ), n.stability = this.algorithm.init_stability(m.Good), o.difficulty = ee(
      this.algorithm.init_difficulty(m.Easy),
      1,
      10
    ), o.stability = this.algorithm.init_stability(m.Easy);
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
    const n = this.elapsed_days, { difficulty: o, stability: s } = this.last, i = this.algorithm.forgetting_curve(n, s), c = T.card(this.current), d = T.card(this.current), u = T.card(this.current), f = T.card(this.current);
    return this.next_ds(
      c,
      d,
      u,
      f,
      o,
      s,
      i
    ), this.next_interval(c, d, u, f, n), this.next_state(c, d, u, f), c.lapses += 1, this.update_next(c, d, u, f), this.next.get(t);
  }
  /**
   * Review next_ds
   */
  next_ds(t, r, n, o, s, i, c) {
    t.difficulty = this.algorithm.next_difficulty(
      s,
      m.Again
    );
    const d = this.algorithm.next_forget_stability(
      s,
      i,
      c
    );
    t.stability = ee(i, fe, d), r.difficulty = this.algorithm.next_difficulty(
      s,
      m.Hard
    ), r.stability = this.algorithm.next_recall_stability(
      s,
      i,
      c,
      m.Hard
    ), n.difficulty = this.algorithm.next_difficulty(
      s,
      m.Good
    ), n.stability = this.algorithm.next_recall_stability(
      s,
      i,
      c,
      m.Good
    ), o.difficulty = this.algorithm.next_difficulty(
      s,
      m.Easy
    ), o.stability = this.algorithm.next_recall_stability(
      s,
      i,
      c,
      m.Easy
    );
  }
  /**
   * Review/New next_interval
   */
  next_interval(t, r, n, o, s) {
    let i, c, d, u;
    i = this.algorithm.next_interval(
      t.stability,
      s
    ), c = this.algorithm.next_interval(r.stability, s), d = this.algorithm.next_interval(n.stability, s), u = this.algorithm.next_interval(o.stability, s), i = Math.min(i, c), c = Math.max(c, i + 1), d = Math.max(d, c + 1), u = Math.max(u, d + 1), t.scheduled_days = i, t.due = ue(this.review_time, i, !0), r.scheduled_days = c, r.due = ue(this.review_time, c, !0), n.scheduled_days = d, n.due = ue(this.review_time, d, !0), o.scheduled_days = u, o.due = ue(this.review_time, u, !0);
  }
  /**
   * Review/New next_state
   */
  next_state(t, r, n, o) {
    t.state = M.Review, t.learning_steps = 0, r.state = M.Review, r.learning_steps = 0, n.state = M.Review, n.learning_steps = 0, o.state = M.Review, o.learning_steps = 0;
  }
  update_next(t, r, n, o) {
    const s = {
      card: t,
      log: this.buildLog(m.Again)
    }, i = {
      card: r,
      log: super.buildLog(m.Hard)
    }, c = {
      card: n,
      log: super.buildLog(m.Good)
    }, d = {
      card: o,
      log: super.buildLog(m.Easy)
    };
    this.next.set(m.Again, s), this.next.set(m.Hard, i), this.next.set(m.Good, c), this.next.set(m.Easy, d);
  }
}
class eo {
  /**
   * Creates an instance of the `Reschedule` class.
   * @param fsrs - An instance of the FSRS class used for scheduling.
   */
  constructor(t) {
    U(this, "fsrs");
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
  handleManualRating(t, r, n, o, s, i, c) {
    if (typeof r > "u")
      throw new Error("reschedule: state is required for manual rating");
    let d, u;
    if (r === M.New)
      d = {
        rating: m.Manual,
        state: r,
        due: c ?? n,
        stability: t.stability,
        difficulty: t.difficulty,
        elapsed_days: o,
        last_elapsed_days: t.elapsed_days,
        scheduled_days: t.scheduled_days,
        learning_steps: t.learning_steps,
        review: n
      }, u = Ue(n), u.last_review = n;
    else {
      if (typeof c > "u")
        throw new Error("reschedule: due is required for manual rating");
      const f = ze(c, n, "days");
      d = {
        rating: m.Manual,
        state: t.state,
        due: t.last_review || t.due,
        stability: t.stability,
        difficulty: t.difficulty,
        elapsed_days: o,
        last_elapsed_days: t.elapsed_days,
        scheduled_days: t.scheduled_days,
        learning_steps: t.learning_steps,
        review: n
      }, u = {
        ...t,
        state: r,
        due: c,
        last_review: n,
        stability: s || t.stability,
        difficulty: i || t.difficulty,
        elapsed_days: o,
        scheduled_days: f,
        reps: t.reps + 1
      };
    }
    return { card: u, log: d };
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
    let o = Ue(t.due);
    for (const s of r) {
      let i;
      if (s.review = T.time(s.review), s.rating === m.Manual) {
        let c = 0;
        o.state !== M.New && o.last_review && (c = ze(s.review, o.last_review, "days")), i = this.handleManualRating(
          o,
          s.state,
          s.review,
          c,
          s.stability,
          s.difficulty,
          s.due ? T.time(s.due) : void 0
        );
      } else
        i = this.replay(o, s.review, s.rating);
      n.push(i), o = i.card;
    }
    return n;
  }
  calculateManualRecord(t, r, n, o) {
    if (!n)
      return null;
    const { card: s, log: i } = n, c = T.card(t);
    return c.due.getTime() === s.due.getTime() ? null : (c.scheduled_days = ze(
      s.due,
      c.due,
      "days"
    ), this.handleManualRating(
      c,
      s.state,
      T.time(r),
      i.elapsed_days,
      o ? s.stability : void 0,
      o ? s.difficulty : void 0,
      s.due
    ));
  }
}
class to extends Zn {
  constructor(r) {
    super(r);
    U(this, "strategyHandler", /* @__PURE__ */ new Map());
    U(this, "Scheduler");
    const { enable_short_term: n } = this.parameters;
    this.Scheduler = n ? ar : ir;
  }
  params_handler_proxy() {
    const r = this;
    return {
      set: function(n, o, s) {
        return o === "request_retention" && Number.isFinite(s) ? r.intervalModifier = r.calculate_interval_modifier(
          Number(s)
        ) : o === "enable_short_term" ? r.Scheduler = s === !0 ? ar : ir : o === "w" && (s = Ft(
          s,
          n.relearning_steps.length,
          n.enable_short_term
        ), r.forgetting_curve = Et.bind(this, s), r.intervalModifier = r.calculate_interval_modifier(
          Number(n.request_retention)
        )), Reflect.set(n, o, s), !0;
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
      ot.SCHEDULER
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
  repeat(r, n, o) {
    const i = this.getScheduler(r, n).preview();
    return o && typeof o == "function" ? o(i) : i;
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
  next(r, n, o, s) {
    const i = this.getScheduler(r, n), c = T.rating(o);
    if (c === m.Manual)
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
  get_retrievability(r, n, o = !0) {
    const s = T.card(r);
    n = n ? T.time(n) : /* @__PURE__ */ new Date();
    const i = s.state !== M.New ? Math.max(ze(n, s.last_review, "days"), 0) : 0, c = s.state !== M.New ? this.forgetting_curve(i, +s.stability.toFixed(8)) : 0;
    return o ? `${(c * 100).toFixed(2)}%` : c;
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
  rollback(r, n, o) {
    const s = T.card(r), i = T.review_log(n);
    if (i.rating === m.Manual)
      throw new Error("Cannot rollback a manual rating");
    let c, d, u;
    switch (i.state) {
      case M.New:
        c = i.due, d = void 0, u = 0;
        break;
      case M.Learning:
      case M.Relearning:
      case M.Review:
        c = i.review, d = i.due, u = s.lapses - (i.rating === m.Again && i.state === M.Review ? 1 : 0);
        break;
    }
    const f = {
      ...s,
      due: c,
      stability: i.stability,
      difficulty: i.difficulty,
      elapsed_days: i.last_elapsed_days,
      scheduled_days: i.scheduled_days,
      reps: Math.max(0, s.reps - 1),
      lapses: Math.max(0, u),
      learning_steps: i.learning_steps,
      state: i.state,
      last_review: d
    };
    return o && typeof o == "function" ? o(f) : f;
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
  forget(r, n, o = !1, s) {
    const i = T.card(r);
    n = T.time(n);
    const c = i.state === M.New ? 0 : ze(n, i.due, "days"), d = {
      rating: m.Manual,
      state: i.state,
      due: i.due,
      stability: i.stability,
      difficulty: i.difficulty,
      elapsed_days: 0,
      last_elapsed_days: i.elapsed_days,
      scheduled_days: c,
      learning_steps: i.learning_steps,
      review: n
    }, f = { card: {
      ...i,
      due: n,
      stability: 0,
      difficulty: 0,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: o ? 0 : i.reps,
      lapses: o ? 0 : i.lapses,
      learning_steps: 0,
      state: M.New,
      last_review: i.last_review
    }, log: d };
    return s && typeof s == "function" ? s(f) : f;
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
  reschedule(r, n = [], o = {}) {
    const {
      recordLogHandler: s,
      reviewsOrderBy: i,
      skipManual: c = !0,
      now: d = /* @__PURE__ */ new Date(),
      update_memory_state: u = !1
    } = o;
    i && typeof i == "function" && n.sort(i), c && (n = n.filter((_) => _.rating !== m.Manual));
    const f = new eo(this), p = f.reschedule(
      o.first_card || Ue(),
      n
    ), g = p.length, v = T.card(r), y = f.calculateManualRecord(
      v,
      d,
      g ? p[g - 1] : void 0,
      u
    );
    return s && typeof s == "function" ? {
      collections: p.map(s),
      reschedule_item: y ? s(y) : null
    } : {
      collections: p,
      reschedule_item: y
    };
  }
}
const ro = new to(jt({})), no = {
  again: m.Again,
  hard: m.Hard,
  good: m.Good,
  easy: m.Easy
}, Pt = () => /* @__PURE__ */ new Date(), oo = (e, t) => {
  const r = Ue(t);
  return e ? {
    ...r,
    stability: e.stability ?? r.stability,
    difficulty: e.difficulty ?? r.difficulty,
    due: e.due ?? r.due,
    last_review: e.lastReviewed ?? r.last_review,
    scheduled_days: e.interval ?? r.scheduled_days,
    reps: e.reps ?? r.reps,
    lapses: e.lapses ?? r.lapses,
    // reps 为 0 视为新卡，否则进入复习态
    state: e.reps > 0 ? M.Review : M.New
  } : r;
}, so = (e, t) => ({
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
  state: e.state
  // FSRS 内部状态（New/Learning/Review/Relearning）
}), qe = (e = Pt()) => {
  const t = Ue(e);
  return so(t, null);
}, at = (e, t, r = Pt()) => {
  const n = oo(e, r), o = ro.next(n, r, no[t]);
  return { state: {
    stability: o.card.stability,
    // 记忆稳定度，评分越高增长越快
    difficulty: o.card.difficulty,
    // 记忆难度，Again/Hard 会调高，Easy 会降低
    interval: o.card.scheduled_days,
    // 下次间隔天数，已包含 FSRS 的遗忘曲线与 fuzz
    due: o.card.due,
    // 具体下次到期时间（now + interval）
    lastReviewed: o.log.review,
    // 本次复习时间
    reps: o.card.reps,
    // 总复习次数（每次评分 +1）
    lapses: o.card.lapses,
    // 遗忘次数（Again 会累计）
    state: o.card.state
    // 当前 FSRS 状态（New/Learning/Review/Relearning）
  }, log: o.log };
}, Ot = (e, t = Pt()) => {
  const r = ["again", "hard", "good", "easy"], n = {};
  for (const o of r) {
    const { state: s } = at(e, o, t), i = s.due.getTime() - t.getTime();
    n[o] = Math.max(0, i);
  }
  return n;
}, oe = (e) => {
  const t = e / 6e4, r = e / (1e3 * 60 * 60), n = e / (1e3 * 60 * 60 * 24);
  return t < 1 ? "<1m" : t < 60 ? `${Math.round(t)}m` : r < 24 ? `${Math.round(r)}h` : n < 30 ? `${Math.round(n)}d` : n < 365 ? `${Math.round(n / 30)}mo` : `${(n / 365).toFixed(1)}y`;
}, Ae = /* @__PURE__ */ new Map(), Ge = async (e) => {
  if (Ae.has(e))
    return Ae.get(e) ?? void 0;
  const t = await orca.invokeBackend("get-block", e);
  return Ae.set(e, t ?? null), t;
}, ao = (e) => {
  Ae.delete(e);
}, Lt = (e, t) => {
  var r;
  return !!((r = e == null ? void 0 : e.properties) != null && r.some((n) => n.name.startsWith(t)));
}, _e = (e, t) => t !== void 0 ? `srs.c${t}.${e}` : `srs.${e}`, ke = (e, t) => `srs.${t}.${e}`, Rr = (e, t) => {
  var r, n;
  return (n = (r = e == null ? void 0 : e.properties) == null ? void 0 : r.find((o) => o.name === t)) == null ? void 0 : n.value;
}, he = (e, t) => {
  if (typeof e == "number") return e;
  if (typeof e == "string") {
    const r = Number(e);
    if (Number.isFinite(r)) return r;
  }
  return t;
}, tt = (e, t) => {
  if (!e) return t;
  const r = new Date(e);
  return Number.isNaN(r.getTime()) ? t : r;
}, $r = async (e, t) => {
  const n = qe(/* @__PURE__ */ new Date()), o = await Ge(e);
  if (!o)
    return n;
  const s = (i) => Rr(o, _e(i, t));
  return {
    stability: he(s("stability"), n.stability),
    difficulty: he(s("difficulty"), n.difficulty),
    interval: he(s("interval"), n.interval),
    due: tt(s("due"), n.due) ?? n.due,
    lastReviewed: tt(s("lastReviewed"), n.lastReviewed),
    reps: he(s("reps"), n.reps),
    lapses: he(s("lapses"), n.lapses),
    state: n.state
    // 状态由算法决定，读取不到时回退为初始
  };
}, jr = async (e, t, r) => {
  const n = [
    { name: _e("stability", r), value: t.stability, type: 3 },
    { name: _e("difficulty", r), value: t.difficulty, type: 3 },
    { name: _e("lastReviewed", r), value: t.lastReviewed ?? null, type: 5 },
    { name: _e("interval", r), value: t.interval, type: 3 },
    { name: _e("due", r), value: t.due, type: 5 },
    { name: _e("reps", r), value: t.reps, type: 3 },
    { name: _e("lapses", r), value: t.lapses, type: 3 }
  ];
  r === void 0 && n.unshift({ name: "srs.isCard", value: !0, type: 4 }), await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [e],
    n
  ), Ae.delete(e);
}, Er = (e) => $r(e), Tr = (e, t) => jr(e, t), Dr = async (e, t = /* @__PURE__ */ new Date()) => {
  const r = qe(t);
  return await Tr(e, r), r;
}, Ir = async (e, t) => {
  const r = await Er(e), n = at(r, t);
  return await Tr(e, n.state), n;
}, zr = (e, t) => $r(e, t), Ar = (e, t, r) => jr(e, r, t), Br = async (e, t, r = 0) => {
  const n = /* @__PURE__ */ new Date(), o = new Date(n);
  o.setDate(o.getDate() + r), o.setHours(0, 0, 0, 0);
  const s = qe(o);
  return await Ar(e, t, s), s;
}, io = async (e, t, r) => {
  const n = await zr(e, t), o = at(n, r);
  return await Ar(e, t, o.state), o;
}, Mr = async (e, t) => {
  const n = qe(/* @__PURE__ */ new Date()), o = await Ge(e);
  if (!o)
    return n;
  const s = (i) => Rr(o, ke(i, t));
  return {
    stability: he(s("stability"), n.stability),
    difficulty: he(s("difficulty"), n.difficulty),
    interval: he(s("interval"), n.interval),
    due: tt(s("due"), n.due) ?? n.due,
    lastReviewed: tt(s("lastReviewed"), n.lastReviewed),
    reps: he(s("reps"), n.reps),
    lapses: he(s("lapses"), n.lapses),
    state: n.state
  };
}, Fr = async (e, t, r) => {
  const n = [
    { name: ke("stability", t), value: r.stability, type: 3 },
    { name: ke("difficulty", t), value: r.difficulty, type: 3 },
    { name: ke("interval", t), value: r.interval, type: 3 },
    { name: ke("due", t), value: r.due, type: 5 },
    { name: ke("lastReviewed", t), value: r.lastReviewed ?? null, type: 5 },
    { name: ke("reps", t), value: r.reps, type: 3 },
    { name: ke("lapses", t), value: r.lapses, type: 3 }
  ];
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [e],
    n
  ), Ae.delete(e);
}, We = async (e, t, r = 0) => {
  const n = /* @__PURE__ */ new Date(), o = new Date(n);
  o.setDate(o.getDate() + r), o.setHours(0, 0, 0, 0);
  const s = qe(o);
  return await Fr(e, t, s), s;
}, co = async (e, t, r) => {
  const n = await Mr(e, t), o = at(n, r);
  return await Fr(e, t, o.state), o;
}, it = async (e, t = /* @__PURE__ */ new Date()) => {
  const r = await Ge(e);
  return Lt(r, "srs.") ? await Er(e) : await Dr(e, t);
}, lo = async (e, t, r = 0) => {
  const n = await Ge(e), o = `srs.c${t}.`;
  return Lt(n, o) ? await zr(e, t) : await Br(e, t, r);
}, uo = async (e, t, r = 0) => {
  const n = await Ge(e), o = `srs.${t}.`;
  return Lt(n, o) ? await Mr(e, t) : await We(e, t, r);
};
function fo(e) {
  if (!e.refs || e.refs.length === 0)
    return "normal";
  const t = e.refs.find(
    (o) => o.type === 2 && // RefType.Property（标签引用）
    se(o.alias)
    // 标签名称为 "card"（大小写不敏感）
  );
  if (!t || !t.data || t.data.length === 0)
    return "normal";
  const r = t.data.find((o) => o.name === "status");
  if (!r)
    return "normal";
  const n = r.value;
  return Array.isArray(n) ? n.length === 0 || !n[0] || typeof n[0] != "string" ? "normal" : n[0].trim().toLowerCase() === "suspend" ? "suspend" : "normal" : typeof n == "string" && n.trim().toLowerCase() === "suspend" ? "suspend" : "normal";
}
async function po(e) {
  var t;
  console.log(`[SRS] 暂停卡片 #${e}`);
  try {
    const r = orca.state.blocks[e];
    if (!r)
      throw new Error(`找不到块 #${e}`);
    const n = (t = r.refs) == null ? void 0 : t.find(
      (o) => o.type === 2 && se(o.alias)
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
function ho() {
  const e = /* @__PURE__ */ new Date();
  return e.setDate(e.getDate() + 1), e.setHours(0, 0, 0, 0), e;
}
function go(e, t) {
  return e !== void 0 ? `srs.c${e}.due` : t !== void 0 ? `srs.${t}.due` : "srs.due";
}
async function yo(e, t, r) {
  const n = t ? `Cloze c${t}` : r ? `Direction ${r}` : "Basic";
  console.log(`[SRS] 埋藏 ${n} 卡片 #${e}`);
  try {
    const o = ho(), s = go(t, r);
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [e],
      [{ name: s, type: 5, value: o }]
    ), ao(e), console.log(`[SRS] 卡片 #${e} 已埋藏，明天 ${o.toLocaleDateString()} 再复习`);
  } catch (o) {
    throw console.error("[SRS] 埋藏卡片失败:", o), o;
  }
}
const vt = {
  Text: 1,
  BlockRefs: 2
}, mo = [
  {
    name: "type",
    type: vt.Text,
    // 文本类型
    value: ""
    // 留空
  },
  {
    name: "牌组",
    type: vt.BlockRefs,
    // 块引用类型
    // 尝试使用 undefined 代替空数组，因为空数组被 Orca 静默忽略
    value: void 0
  },
  {
    name: "status",
    type: vt.Text,
    // 文本类型
    value: ""
    // 留空
  }
];
let wt = !1, Pe = !1;
async function ct(e) {
  var t;
  if (!wt && !Pe) {
    Pe = !0;
    try {
      const r = await orca.invokeBackend("get-block-by-alias", "card");
      if (!r) {
        Pe = !1;
        return;
      }
      const n = new Set(((t = r.properties) == null ? void 0 : t.map((s) => s.name)) || []), o = mo.filter(
        (s) => !n.has(s.name)
      );
      if (o.length === 0) {
        wt = !0, Pe = !1;
        return;
      }
      for (const s of o)
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
      wt = !0;
    } catch (r) {
      console.error(`[${e}] [tagPropertyInit] 初始化失败:`, r);
    } finally {
      Pe = !1;
    }
  }
}
function xo(e, t) {
  if (!e || e.length === 0)
    return 0;
  let r = 0;
  for (const n of e)
    n.t === `${t}.cloze` && typeof n.clozeNumber == "number" && n.clozeNumber > r && (r = n.clozeNumber);
  return r;
}
function Pr(e, t) {
  if (!e || e.length === 0)
    return [];
  const r = /* @__PURE__ */ new Set();
  for (const n of e)
    (n.t === `${t}.cloze` || typeof n.t == "string" && n.t.endsWith(".cloze")) && typeof n.clozeNumber == "number" && r.add(n.clozeNumber);
  return Array.from(r).sort((n, o) => n - o);
}
function vo(e, t, r, n, o) {
  const s = Math.min(t.anchor.index, t.focus.index);
  let i, c;
  if (t.anchor.index === t.focus.index)
    i = Math.min(t.anchor.offset, t.focus.offset), c = Math.max(t.anchor.offset, t.focus.offset);
  else
    return console.warn(`[${o}] 不支持跨 fragment 的选区`), e;
  const d = [];
  for (let u = 0; u < e.length; u++) {
    const f = e[u];
    if (u === s) {
      const p = f.v || "";
      if (i > 0) {
        const g = p.substring(0, i);
        d.push({
          ...f,
          v: g
        });
      }
      if (d.push({
        t: `${o}.cloze`,
        v: r,
        clozeNumber: n
      }), c < p.length) {
        const g = p.substring(c);
        d.push({
          ...f,
          v: g
        });
      }
    } else
      d.push(f);
  }
  return d;
}
async function wo(e, t) {
  var g, v, y;
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
  const o = e.anchor.index, s = n.content[o];
  if (!s || !s.v)
    return orca.notify("warn", "无法获取选中的文本片段"), null;
  const i = Math.min(e.anchor.offset, e.focus.offset), c = Math.max(e.anchor.offset, e.focus.offset), d = s.v.substring(i, c);
  if (!d || d.trim() === "")
    return orca.notify("warn", "请先选择要填空的文本"), null;
  const f = xo(n.content, t) + 1, p = !!((g = n.refs) != null && g.some(
    (_) => _.type === 2 && se(_.alias)
  ));
  try {
    const _ = vo(
      n.content,
      e,
      d,
      f,
      t
    );
    await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      e,
      [
        {
          id: r,
          content: _
        }
      ],
      !1
    );
    const I = orca.state.blocks[r];
    if ((v = I.refs) == null ? void 0 : v.some(
      (C) => C.type === 2 && se(C.alias)
    )) {
      if (!p)
        try {
          const C = (y = I.refs) == null ? void 0 : y.find(
            (k) => k.type === 2 && se(k.alias)
          );
          C && (await orca.commands.invokeEditorCommand(
            "core.editor.setRefData",
            null,
            C,
            [{ name: "type", value: "cloze" }]
          ), console.log(`[${t}] 已更新 #card 标签的 type=cloze`));
        } catch (C) {
          console.error(`[${t}] 更新 #card 标签属性失败:`, C);
        }
    } else try {
      await orca.commands.invokeEditorCommand(
        "core.editor.insertTag",
        null,
        r,
        "card",
        [
          { name: "type", value: "cloze" },
          { name: "牌组", value: [] },
          // 空数组表示未设置牌组
          { name: "status", value: "" }
          // 空字符串表示正常状态
        ]
      ), console.log(`[${t}] 已添加 #card 标签并设置 type=cloze`), await ct(t);
    } catch (C) {
      console.error(`[${t}] 添加 #card 标签失败:`, C);
    }
    try {
      const C = orca.state.blocks[r];
      C._repr = {
        type: "srs.cloze-card",
        front: n.text || "",
        back: "（填空卡）",
        cardType: "cloze"
      };
      const k = Pr(C.content, t);
      await orca.commands.invokeEditorCommand(
        "core.editor.setProperties",
        null,
        [r],
        [{ name: "srs.isCard", value: !0, type: 4 }]
      );
      for (let x = 0; x < k.length; x++) {
        const E = k[x], F = E - 1;
        await Br(r, E, F);
      }
    } catch (C) {
      console.error(`[${t}] 自动加入复习队列失败:`, C);
    }
    return orca.notify(
      "success",
      `已创建填空 c${f}: "${d}"`,
      { title: "Cloze" }
    ), { blockId: r, clozeNumber: f };
  } catch (_) {
    return console.error(`[${t}] 创建 cloze 失败:`, _), orca.notify("error", `创建 cloze 失败: ${_}`, { title: "Cloze" }), null;
  }
}
const Or = {
  forward: "→",
  backward: "←",
  bidirectional: "↔"
};
async function cr(e, t, r) {
  var y, _, I, D, C;
  if (!((y = e == null ? void 0 : e.anchor) != null && y.blockId))
    return orca.notify("error", "无法获取光标位置"), null;
  const n = e.anchor.blockId, o = orca.state.blocks[n];
  if (!o)
    return orca.notify("error", "未找到当前块"), null;
  if ((_ = o.content) == null ? void 0 : _.some(
    (k) => k.t === `${r}.direction`
  ))
    return orca.notify("warn", "当前块已有方向标记，请点击箭头切换方向"), null;
  if ((I = o.content) == null ? void 0 : I.some((k) => k.t === `${r}.cloze`))
    return orca.notify("warn", "方向卡暂不支持与填空卡混用"), null;
  const c = e.anchor.offset, d = o.text || "", u = d.substring(0, c).trim(), f = d.substring(c).trim();
  if (!u)
    return orca.notify("warn", "方向标记左侧需要有内容"), null;
  const p = Or[t], g = [
    { t: "t", v: u + " " },
    {
      t: `${r}.direction`,
      v: p,
      direction: t
    },
    { t: "t", v: " " + f }
  ], v = o.content ? [...o.content] : void 0;
  try {
    if (await orca.commands.invokeEditorCommand(
      "core.editor.setBlocksContent",
      e,
      [{ id: n, content: g }],
      !1
    ), !((D = o.refs) == null ? void 0 : D.some(
      (E) => E.type === 2 && se(E.alias)
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
      ), await ct(r);
    else {
      const E = (C = o.refs) == null ? void 0 : C.find(
        (F) => F.type === 2 && se(F.alias)
      );
      E && await orca.commands.invokeEditorCommand(
        "core.editor.setRefData",
        null,
        E,
        [{ name: "type", value: "direction" }]
      );
    }
    await orca.commands.invokeEditorCommand(
      "core.editor.setProperties",
      null,
      [n],
      [{ name: "srs.isCard", value: !0, type: 4 }]
    ), t === "bidirectional" ? (await We(n, "forward", 0), await We(n, "backward", 1)) : await We(n, t, 0);
    try {
      const E = {
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
      await orca.utils.setSelectionFromCursorData(E);
    } catch (E) {
      console.warn(`[${r}] 设置光标位置失败:`, E);
    }
    const x = t === "forward" ? "正向" : t === "backward" ? "反向" : "双向";
    return orca.notify("success", `已创建${x}卡片`, { title: "方向卡" }), { blockId: n, originalContent: v };
  } catch (k) {
    return console.error(`[${r}] 创建方向卡失败:`, k), orca.notify("error", `创建方向卡失败: ${k}`), null;
  }
}
function bo(e) {
  const t = ["forward", "backward", "bidirectional"], r = t.indexOf(e);
  return t[(r + 1) % t.length];
}
async function So(e, t, r) {
  var i;
  const n = orca.state.blocks[e];
  if (!(n != null && n.content)) return;
  const o = n.content.map((c) => c.t === `${r}.direction` ? {
    ...c,
    v: Or[t],
    direction: t
  } : c);
  await orca.commands.invokeEditorCommand(
    "core.editor.setBlocksContent",
    null,
    [{ id: e, content: o }],
    !1
  );
  const s = n;
  s._repr && (s._repr = {
    ...s._repr,
    direction: t
  }), t === "bidirectional" && ((i = n.properties) != null && i.some(
    (d) => d.name.startsWith("srs.backward.")
  ) || await We(e, "backward", 1));
}
function Lr(e, t) {
  if (!e || e.length === 0) return null;
  const r = e.findIndex((d) => d.t === `${t}.direction`);
  if (r === -1) return null;
  const n = e[r], o = e.slice(0, r), s = e.slice(r + 1), i = o.map((d) => d.v || "").join("").trim(), c = s.map((d) => d.v || "").join("").trim();
  return {
    direction: n.direction || "forward",
    leftText: i,
    rightText: c
  };
}
function Co(e) {
  return e === "bidirectional" ? ["forward", "backward"] : [e];
}
function bt(e) {
  const t = e.refs || [];
  if (t.length === 0) return [];
  const r = [], n = /* @__PURE__ */ new Set();
  for (const o of t) {
    if (o.type !== 2) continue;
    const s = (o.alias || "").trim();
    if (!s) continue;
    const i = s.toLowerCase();
    i === "card" || i.startsWith("card/") || n.has(o.to) || (n.add(o.to), r.push({
      name: s,
      blockId: o.to
    }));
  }
  return r;
}
async function _o(e = "srs-plugin") {
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
      console.log(`[${e}] collectSrsBlocks: get-all-blocks 返回了 ${i.length} 个块`), r = i.filter((c) => !c.refs || c.refs.length === 0 ? !1 : c.refs.some((u) => u.type !== 2 ? !1 : se(u.alias))), console.log(`[${e}] collectSrsBlocks: 手动过滤找到 ${r.length} 个带 #card 标签的块`);
    } catch (i) {
      console.error(`[${e}] collectSrsBlocks 备用方案失败:`, i), r = [];
    }
  }
  const o = Object.values(orca.state.blocks || {}).filter((i) => {
    var d;
    if (!i) return !1;
    const c = (d = i._repr) == null ? void 0 : d.type;
    return c === "srs.card" || c === "srs.cloze-card" || c === "srs.direction-card";
  }), s = /* @__PURE__ */ new Map();
  for (const i of [...r || [], ...o])
    i && s.set(i.id, i);
  return Array.from(s.values());
}
async function Hr(e = "srs-plugin") {
  var o;
  const t = await _o(e), r = /* @__PURE__ */ new Date(), n = [];
  for (const s of t) {
    if (!jn(s)) continue;
    if (fo(s) === "suspend") {
      console.log(`[${e}] collectReviewCards: 跳过已暂停的卡片 #${s.id}`);
      continue;
    }
    const c = nt(s), d = await Mt(s);
    if (c === "cloze") {
      const u = Pr(s.content, e);
      if (console.log(`[${e}] collectReviewCards: 发现 cloze 卡片 #${s.id}`), console.log(`  - block.content 长度: ${((o = s.content) == null ? void 0 : o.length) || 0}`), console.log(`  - 找到 cloze 编号: ${JSON.stringify(u)}`), s.content && s.content.length > 0) {
        const f = s.content.map((p) => p.t);
        console.log(`  - fragment 类型: ${JSON.stringify(f)}`);
      }
      if (u.length === 0) {
        console.log("  - 跳过：没有找到 cloze 编号");
        continue;
      }
      for (const f of u) {
        const p = await lo(s.id, f, f - 1), g = s.text || "";
        n.push({
          id: s.id,
          front: g,
          back: `（填空 c${f}）`,
          // 填空卡不需要独立的 back
          srs: p,
          isNew: !p.lastReviewed || p.reps === 0,
          deck: d,
          tags: bt(s),
          clozeNumber: f,
          // 关键：标记当前复习的填空编号
          content: s.content
          // 保存块内容用于渲染填空
        });
      }
    } else if (c === "direction") {
      const u = Lr(s.content, e);
      if (!u) {
        console.log(`[${e}] collectReviewCards: 块 ${s.id} 无法解析方向卡内容`);
        continue;
      }
      if (!u.leftText || !u.rightText) {
        console.log(
          `[${e}] collectReviewCards: 跳过未完成的方向卡 #${s.id}（left/right 为空）`
        );
        continue;
      }
      const f = Co(u.direction);
      for (let p = 0; p < f.length; p++) {
        const g = f[p], v = await uo(s.id, g, p), y = g === "forward" ? u.leftText : u.rightText, _ = g === "forward" ? u.rightText : u.leftText;
        n.push({
          id: s.id,
          front: y,
          back: _,
          srs: v,
          isNew: !v.lastReviewed || v.reps === 0,
          deck: d,
          tags: bt(s),
          directionType: g
          // 关键：标记当前复习的方向类型
        });
      }
    } else {
      const { front: u, back: f } = Bt(s), p = await it(s.id, r);
      n.push({
        id: s.id,
        front: u,
        back: f,
        srs: p,
        isNew: !p.lastReviewed || p.reps === 0,
        deck: d,
        tags: bt(s)
        // clozeNumber 和 directionType 都为 undefined（非特殊卡片）
      });
    }
  }
  return n;
}
function ko(e) {
  const t = /* @__PURE__ */ new Date(), r = new Date(t.getFullYear(), t.getMonth(), t.getDate()), n = new Date(r);
  n.setDate(n.getDate() + 1);
  const o = e.filter((u) => u.isNew ? !1 : u.srs.due.getTime() < n.getTime()), s = e.filter((u) => u.isNew ? u.srs.due.getTime() < n.getTime() : !1), i = [];
  let c = 0, d = 0;
  for (; c < o.length || d < s.length; ) {
    for (let u = 0; u < 2 && c < o.length; u++)
      i.push(o[c++]);
    d < s.length && i.push(s[d++]);
  }
  return i;
}
async function Ro(e) {
  const t = await orca.invokeBackend("get-block", e);
  return t != null && t.properties ? t.properties.filter((r) => r.name.startsWith("srs.")).map((r) => r.name) : [];
}
async function $o(e, t) {
  const r = await Ro(e);
  r.length !== 0 && (console.log(`[${t}] 清理块 #${e} 的 ${r.length} 个 SRS 属性`), await orca.commands.invokeEditorCommand(
    "core.editor.deleteProperties",
    null,
    [e],
    r
  ));
}
async function jo(e) {
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
        let u = [];
        for (const f of d)
          try {
            const p = await orca.invokeBackend("get-blocks-with-tags", [f]) || [];
            console.log(`[${e}] 标签 "${f}" 找到 ${p.length} 个块`), u = [...u, ...p];
          } catch (p) {
            console.log(`[${e}] 查询标签 "${f}" 失败:`, p);
          }
        u.length > 0 ? (n = u, console.log(`[${e}] 多标签查询找到 ${n.length} 个带 #card 标签的块`)) : (n = c.filter((f) => !f.refs || f.refs.length === 0 ? !1 : f.refs.some((g) => {
          if (g.type !== 2)
            return !1;
          const v = g.alias || "";
          return se(v);
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
    let o = 0, s = 0;
    for (const c of n) {
      const d = c, u = nt(c);
      if (u === "direction") {
        console.log(`[${e}] 跳过：块 #${c.id} 是 direction 卡片（不转换 _repr）`), s++;
        continue;
      }
      const f = u === "cloze" ? "srs.cloze-card" : "srs.card";
      if (((t = d._repr) == null ? void 0 : t.type) === f) {
        console.log(`[${e}] 跳过：块 #${c.id} 已经是 ${u} 卡片`), s++;
        continue;
      }
      const { front: p, back: g } = Bt(d), v = await Mt(c);
      d._repr = {
        type: f,
        front: p,
        back: g,
        deck: v,
        cardType: u
        // 添加 cardType 字段，方便后续使用
      }, await it(c.id), console.log(`[${e}] 已转换：块 #${c.id}`), console.log(`  卡片类型: ${u}`), console.log(`  题目: ${p}`), console.log(`  答案: ${g}`), v && console.log(`  Deck: ${v}`), o++;
    }
    const i = `转换了 ${o} 张卡片${s > 0 ? `，跳过 ${s} 张已有卡片` : ""}`;
    orca.notify("success", i, { title: "SRS 扫描完成" }), console.log(`[${e}] 扫描完成：${i}`);
  } catch (r) {
    console.error(`[${e}] 扫描失败:`, r), orca.notify("error", `扫描失败: ${r}`, { title: "SRS 扫描" });
  }
}
async function Eo(e, t) {
  var v;
  if (!e || !e.anchor || !e.anchor.blockId)
    return orca.notify("error", "无法获取光标位置"), null;
  const r = e.anchor.blockId, n = orca.state.blocks[r];
  if (!n)
    return orca.notify("error", "未找到当前块"), null;
  const o = n._repr ? { ...n._repr } : { type: "text" }, s = n.text || "", i = (v = n.refs) == null ? void 0 : v.some(
    (y) => y.type === 2 && // RefType.Property（标签引用）
    se(y.alias)
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
      ), await ct(t);
    } catch (y) {
      return console.error(`[${t}] 添加标签失败:`, y), orca.notify("error", `添加标签失败: ${y}`, { title: "SRS" }), null;
    }
  const { front: c, back: d } = Bt(n), u = orca.state.blocks[r], f = nt(u), p = f === "cloze" ? "srs.cloze-card" : "srs.card";
  n._repr = {
    type: p,
    front: c,
    back: d,
    cardType: f
  }, i ? await it(r) : (await $o(r, t), await Dr(r));
  const g = f === "cloze" ? "填空卡片" : "记忆卡片";
  return orca.notify(
    "success",
    `已添加 #card 标签并转换为 SRS ${g}`,
    { title: "SRS" }
  ), { blockId: r, originalRepr: o, originalText: s };
}
const Wr = {
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
function Nr(e) {
  var r;
  const t = (r = orca.state.plugins[e]) == null ? void 0 : r.settings;
  return {
    apiKey: (t == null ? void 0 : t["ai.apiKey"]) || "",
    apiUrl: (t == null ? void 0 : t["ai.apiUrl"]) || "https://api.openai.com/v1/chat/completions",
    model: (t == null ? void 0 : t["ai.model"]) || "gpt-3.5-turbo",
    language: (t == null ? void 0 : t["ai.language"]) || "中文",
    difficulty: (t == null ? void 0 : t["ai.difficulty"]) || "普通",
    promptTemplate: (t == null ? void 0 : t["ai.promptTemplate"]) || Wr["ai.promptTemplate"].defaultValue
  };
}
function To(e, t, r) {
  return e.replace(/\{\{content\}\}/g, t).replace(/\{\{language\}\}/g, r.language).replace(/\{\{difficulty\}\}/g, r.difficulty);
}
function Do(e) {
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
async function Io(e, t) {
  var o, s, i, c;
  const r = Nr(e);
  if (!r.apiKey)
    return {
      success: !1,
      error: { code: "NO_API_KEY", message: "请先在设置中配置 API Key" }
    };
  const n = To(r.promptTemplate, t, r);
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
      let p = `请求失败: ${d.status}`;
      try {
        p = ((o = (await d.json()).error) == null ? void 0 : o.message) || p;
      } catch {
      }
      return console.error(`[AI Service] API 错误: ${p}`), {
        success: !1,
        error: {
          code: `HTTP_${d.status}`,
          message: p
        }
      };
    }
    const f = (c = (i = (s = (await d.json()).choices) == null ? void 0 : s[0]) == null ? void 0 : i.message) == null ? void 0 : c.content;
    return f ? (console.log(`[AI Service] AI 响应: ${f}`), Do(f)) : (console.error("[AI Service] AI 返回内容为空"), {
      success: !1,
      error: { code: "EMPTY_RESPONSE", message: "AI 返回内容为空" }
    });
  } catch (d) {
    const u = d instanceof Error ? d.message : "网络错误";
    return console.error(`[AI Service] 网络错误: ${u}`), {
      success: !1,
      error: {
        code: "NETWORK_ERROR",
        message: u
      }
    };
  }
}
async function zo(e) {
  var r;
  const t = Nr(e);
  if (!t.apiKey)
    return { success: !1, message: "请先配置 API Key" };
  console.log(`[AI Service] 测试连接 - URL: ${t.apiUrl}, Model: ${t.model}`);
  try {
    const n = await fetch(t.apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t.apiKey}`
      },
      body: JSON.stringify({
        model: t.model,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 5
      })
    });
    if (n.ok) {
      const s = (await n.json()).model || t.model;
      return console.log(`[AI Service] 连接成功 - 使用模型: ${s}`), { success: !0, message: `连接成功！使用模型: ${s}` };
    } else {
      let o = `连接失败: ${n.status}`;
      try {
        o = ((r = (await n.json()).error) == null ? void 0 : r.message) || o;
      } catch {
      }
      return console.error(`[AI Service] 连接失败: ${o}`), { success: !1, message: o };
    }
  } catch (n) {
    const o = n instanceof Error ? n.message : "网络错误";
    return console.error(`[AI Service] 连接错误: ${o}`), { success: !1, message: o };
  }
}
async function Ao(e, t) {
  var d;
  if (console.log(`[${t}] ========== makeAICardFromBlock 开始执行 ==========`), !e || !e.anchor || !e.anchor.blockId)
    return orca.notify("error", "无法获取光标位置"), console.error(`[${t}] 错误：无法获取光标位置`), null;
  const r = e.anchor.blockId, n = orca.state.blocks[r];
  if (!n)
    return orca.notify("error", "未找到当前块"), console.error(`[${t}] 错误：未找到块 #${r}`), null;
  const o = (d = n.text) == null ? void 0 : d.trim();
  if (!o)
    return orca.notify("warn", "当前块内容为空，无法生成卡片", { title: "AI 卡片" }), console.warn(`[${t}] 警告：块 #${r} 内容为空`), null;
  console.log(`[${t}] 原始块 ID: ${r}`), console.log(`[${t}] 原始内容: "${o}"`), orca.notify("info", "正在调用 AI 生成卡片...", { title: "AI 卡片" });
  const s = await Io(t, o);
  if (!s.success)
    return orca.notify("error", s.error.message, { title: "AI 卡片生成失败" }), console.error(`[${t}] AI 生成失败: ${s.error.message}`), null;
  const { question: i, answer: c } = s.data;
  console.log(`[${t}] AI 生成成功`), console.log(`[${t}]   问题: "${i}"`), console.log(`[${t}]   答案: "${c}"`);
  try {
    console.log(`[${t}] 创建子块（问题）...`);
    const u = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      n,
      "lastChild",
      [{ t: "t", v: i }]
    );
    if (!u)
      return orca.notify("error", "创建子块失败", { title: "AI 卡片" }), console.error(`[${t}] 创建子块失败`), null;
    console.log(`[${t}] 子块创建成功: #${u}`);
    const f = orca.state.blocks[u];
    if (!f)
      return orca.notify("error", "无法获取子块", { title: "AI 卡片" }), console.error(`[${t}] 无法获取子块 #${u}`), null;
    console.log(`[${t}] 创建孙子块（答案）...`);
    const p = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      f,
      "lastChild",
      [{ t: "t", v: c }]
    );
    if (!p)
      return orca.notify("error", "创建孙子块失败", { title: "AI 卡片" }), console.error(`[${t}] 创建孙子块失败`), await orca.commands.invokeEditorCommand(
        "core.editor.deleteBlocks",
        null,
        [u]
      ), null;
    console.log(`[${t}] 孙子块创建成功: #${p}`), console.log(`[${t}] 添加 #card 标签到子块...`), await orca.commands.invokeEditorCommand(
      "core.editor.insertTag",
      e,
      u,
      "card",
      [
        { name: "type", value: "basic" },
        { name: "牌组", value: [] },
        // 空数组表示未设置牌组
        { name: "status", value: "" }
        // 空字符串表示正常状态
      ]
    ), console.log(`[${t}] #card 标签添加成功`), await ct(t);
    const g = orca.state.blocks[u];
    return g && (g._repr = {
      type: "srs.card",
      front: i,
      back: c,
      cardType: "basic"
    }, console.log(`[${t}] 子块 _repr 已设置为 srs.card`)), console.log(`[${t}] 初始化 SRS 状态...`), await it(u), console.log(`[${t}] ========== AI 卡片创建完成 ==========`), console.log(`[${t}] 结构：`), console.log(`[${t}]   原始块 #${r}: "${o}"`), console.log(`[${t}]     └─ 子块 #${u} [#card]: "${i}"`), console.log(`[${t}]         └─ 孙子块 #${p}: "${c}"`), orca.notify(
      "success",
      `已生成卡片
问题: ${i}
答案: ${c}`,
      { title: "AI 卡片创建成功" }
    ), {
      blockId: u,
      question: i,
      answer: c
    };
  } catch (u) {
    const f = u instanceof Error ? u.message : String(u);
    return console.error(`[${t}] AI 卡片创建异常:`, u), orca.notify("error", `创建失败: ${f}`, { title: "AI 卡片" }), null;
  }
}
function Bo(e, t) {
  const r = e;
  orca.commands.registerCommand(
    `${e}.scanCardsFromTags`,
    () => {
      console.log(`[${r}] 执行标签扫描`), jo(r);
    },
    "SRS: 扫描带标签的卡片"
  ), orca.commands.registerCommand(
    `${e}.openFlashcardHome`,
    async () => {
      console.log(`[${r}] 打开 Flashcard Home`), await t();
    },
    "SRS: 打开 Flashcard Home"
  ), orca.commands.registerEditorCommand(
    `${e}.makeCardFromBlock`,
    async (n, ...o) => {
      const [s, i, c] = n;
      if (!c)
        return orca.notify("error", "无法获取光标位置"), null;
      const d = await Eo(c, r);
      return d ? { ret: d, undoArgs: d } : null;
    },
    async (n) => {
      if (!n || !n.blockId) return;
      const o = orca.state.blocks[n.blockId];
      o && (o._repr = n.originalRepr || { type: "text" }, n.originalText !== void 0 && (o.text = n.originalText), console.log(`[${r}] 已撤销：块 #${n.blockId} 已恢复`));
    },
    {
      label: "SRS: 将块转换为记忆卡片",
      hasArgs: !1
    }
  ), orca.commands.registerEditorCommand(
    `${e}.createCloze`,
    async (n, ...o) => {
      const [s, i, c] = n;
      if (!c)
        return orca.notify("error", "无法获取光标位置"), null;
      const d = await wo(c, r);
      return d ? { ret: d, undoArgs: d } : null;
    },
    async (n) => {
      !n || !n.blockId || console.log(`[${r}] Cloze 撤销：块 #${n.blockId}，编号 c${n.clozeNumber}`);
    },
    {
      label: "SRS: 创建 Cloze 填空",
      hasArgs: !1
    }
  ), orca.commands.registerEditorCommand(
    `${e}.createDirectionForward`,
    async (n, ...o) => {
      const [s, i, c] = n;
      if (!c)
        return orca.notify("error", "无法获取光标位置"), null;
      const d = await cr(c, "forward", r);
      return d ? { ret: d, undoArgs: d } : null;
    },
    async (n) => {
      !n || !n.blockId || !orca.state.blocks[n.blockId] || n.originalContent && await orca.commands.invokeEditorCommand(
        "core.editor.setBlocksContent",
        null,
        [
          {
            id: n.blockId,
            content: n.originalContent
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
    async (n, ...o) => {
      const [s, i, c] = n;
      if (!c)
        return orca.notify("error", "无法获取光标位置"), null;
      const d = await cr(c, "backward", r);
      return d ? { ret: d, undoArgs: d } : null;
    },
    async (n) => {
      !n || !n.blockId || !orca.state.blocks[n.blockId] || n.originalContent && await orca.commands.invokeEditorCommand(
        "core.editor.setBlocksContent",
        null,
        [
          {
            id: n.blockId,
            content: n.originalContent
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
    async (n, ...o) => {
      const [s, i, c] = n;
      if (!c)
        return orca.notify("error", "无法获取光标位置"), null;
      const d = await Ao(c, r);
      return d ? { ret: d, undoArgs: d } : null;
    },
    async (n) => {
      if (!(!n || !n.blockId))
        try {
          await orca.commands.invokeEditorCommand(
            "core.editor.deleteBlocks",
            null,
            [n.blockId]
          ), console.log(`[${r}] 已撤销 AI 卡片：删除块 #${n.blockId}`);
        } catch (o) {
          console.error(`[${r}] 撤销 AI 卡片失败:`, o);
        }
    },
    {
      label: "SRS: AI 生成记忆卡片",
      hasArgs: !1
    }
  ), orca.commands.registerCommand(
    `${e}.testAIConnection`,
    async () => {
      console.log(`[${r}] 测试 AI 连接`), orca.notify("info", "正在测试 AI 连接...", { title: "AI 连接测试" });
      const n = await zo(r);
      n.success ? orca.notify("success", n.message, { title: "AI 连接测试" }) : orca.notify("error", n.message, { title: "AI 连接测试" });
    },
    "SRS: 测试 AI 连接"
  ), orca.commands.registerCommand(
    `${e}.openOldReviewPanel`,
    async () => {
      console.log(`[${r}] 打开旧复习面板`);
      const { startReviewSession: n } = await Promise.resolve().then(() => At);
      await n();
    },
    "SRS: 打开旧复习面板"
  );
}
function Mo(e) {
  orca.commands.unregisterCommand(`${e}.scanCardsFromTags`), orca.commands.unregisterCommand(`${e}.openFlashcardHome`), orca.commands.unregisterEditorCommand(`${e}.makeCardFromBlock`), orca.commands.unregisterEditorCommand(`${e}.createCloze`), orca.commands.unregisterEditorCommand(`${e}.createDirectionForward`), orca.commands.unregisterEditorCommand(`${e}.createDirectionBackward`), orca.commands.unregisterEditorCommand(`${e}.makeAICard`), orca.commands.unregisterCommand(`${e}.testAIConnection`), orca.commands.unregisterCommand(`${e}.openOldReviewPanel`);
}
var Ur = { exports: {} };
const Fo = React;
var Oe = {}, lr;
function Po() {
  if (lr) return Oe;
  lr = 1;
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
    var e = Fo, t = Symbol.for("react.element"), r = Symbol.for("react.portal"), n = Symbol.for("react.fragment"), o = Symbol.for("react.strict_mode"), s = Symbol.for("react.profiler"), i = Symbol.for("react.provider"), c = Symbol.for("react.context"), d = Symbol.for("react.forward_ref"), u = Symbol.for("react.suspense"), f = Symbol.for("react.suspense_list"), p = Symbol.for("react.memo"), g = Symbol.for("react.lazy"), v = Symbol.for("react.offscreen"), y = Symbol.iterator, _ = "@@iterator";
    function I(l) {
      if (l === null || typeof l != "object")
        return null;
      var h = y && l[y] || l[_];
      return typeof h == "function" ? h : null;
    }
    var D = e.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
    function C(l) {
      {
        for (var h = arguments.length, b = new Array(h > 1 ? h - 1 : 0), j = 1; j < h; j++)
          b[j - 1] = arguments[j];
        k("error", l, b);
      }
    }
    function k(l, h, b) {
      {
        var j = D.ReactDebugCurrentFrame, O = j.getStackAddendum();
        O !== "" && (h += "%s", b = b.concat([O]));
        var H = b.map(function(P) {
          return String(P);
        });
        H.unshift("Warning: " + h), Function.prototype.apply.call(console[l], console, H);
      }
    }
    var x = !1, E = !1, F = !1, N = !1, Q = !1, z;
    z = Symbol.for("react.module.reference");
    function Y(l) {
      return !!(typeof l == "string" || typeof l == "function" || l === n || l === s || Q || l === o || l === u || l === f || N || l === v || x || E || F || typeof l == "object" && l !== null && (l.$$typeof === g || l.$$typeof === p || l.$$typeof === i || l.$$typeof === c || l.$$typeof === d || // This needs to include all possible module reference object
      // types supported by any Flight configuration anywhere since
      // we don't know which Flight build this will end up being used
      // with.
      l.$$typeof === z || l.getModuleId !== void 0));
    }
    function J(l, h, b) {
      var j = l.displayName;
      if (j)
        return j;
      var O = h.displayName || h.name || "";
      return O !== "" ? b + "(" + O + ")" : b;
    }
    function R(l) {
      return l.displayName || "Context";
    }
    function w(l) {
      if (l == null)
        return null;
      if (typeof l.tag == "number" && C("Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."), typeof l == "function")
        return l.displayName || l.name || null;
      if (typeof l == "string")
        return l;
      switch (l) {
        case n:
          return "Fragment";
        case r:
          return "Portal";
        case s:
          return "Profiler";
        case o:
          return "StrictMode";
        case u:
          return "Suspense";
        case f:
          return "SuspenseList";
      }
      if (typeof l == "object")
        switch (l.$$typeof) {
          case c:
            var h = l;
            return R(h) + ".Consumer";
          case i:
            var b = l;
            return R(b._context) + ".Provider";
          case d:
            return J(l, l.render, "ForwardRef");
          case p:
            var j = l.displayName || null;
            return j !== null ? j : w(l.type) || "Memo";
          case g: {
            var O = l, H = O._payload, P = O._init;
            try {
              return w(P(H));
            } catch {
              return null;
            }
          }
        }
      return null;
    }
    var S = Object.assign, $ = 0, L, W, X, re, ae, ge, Be;
    function A() {
    }
    A.__reactDisabledLog = !0;
    function G() {
      {
        if ($ === 0) {
          L = console.log, W = console.info, X = console.warn, re = console.error, ae = console.group, ge = console.groupCollapsed, Be = console.groupEnd;
          var l = {
            configurable: !0,
            enumerable: !0,
            value: A,
            writable: !0
          };
          Object.defineProperties(console, {
            info: l,
            log: l,
            warn: l,
            error: l,
            group: l,
            groupCollapsed: l,
            groupEnd: l
          });
        }
        $++;
      }
    }
    function ye() {
      {
        if ($--, $ === 0) {
          var l = {
            configurable: !0,
            enumerable: !0,
            writable: !0
          };
          Object.defineProperties(console, {
            log: S({}, l, {
              value: L
            }),
            info: S({}, l, {
              value: W
            }),
            warn: S({}, l, {
              value: X
            }),
            error: S({}, l, {
              value: re
            }),
            group: S({}, l, {
              value: ae
            }),
            groupCollapsed: S({}, l, {
              value: ge
            }),
            groupEnd: S({}, l, {
              value: Be
            })
          });
        }
        $ < 0 && C("disabledDepth fell below zero. This is a bug in React. Please file an issue.");
      }
    }
    var ie = D.ReactCurrentDispatcher, ce;
    function pe(l, h, b) {
      {
        if (ce === void 0)
          try {
            throw Error();
          } catch (O) {
            var j = O.stack.trim().match(/\n( *(at )?)/);
            ce = j && j[1] || "";
          }
        return `
` + ce + l;
      }
    }
    var lt = !1, Ve;
    {
      var en = typeof WeakMap == "function" ? WeakMap : Map;
      Ve = new en();
    }
    function Wt(l, h) {
      if (!l || lt)
        return "";
      {
        var b = Ve.get(l);
        if (b !== void 0)
          return b;
      }
      var j;
      lt = !0;
      var O = Error.prepareStackTrace;
      Error.prepareStackTrace = void 0;
      var H;
      H = ie.current, ie.current = null, G();
      try {
        if (h) {
          var P = function() {
            throw Error();
          };
          if (Object.defineProperty(P.prototype, "props", {
            set: function() {
              throw Error();
            }
          }), typeof Reflect == "object" && Reflect.construct) {
            try {
              Reflect.construct(P, []);
            } catch (te) {
              j = te;
            }
            Reflect.construct(l, [], P);
          } else {
            try {
              P.call();
            } catch (te) {
              j = te;
            }
            l.call(P.prototype);
          }
        } else {
          try {
            throw Error();
          } catch (te) {
            j = te;
          }
          l();
        }
      } catch (te) {
        if (te && j && typeof te.stack == "string") {
          for (var B = te.stack.split(`
`), Z = j.stack.split(`
`), V = B.length - 1, K = Z.length - 1; V >= 1 && K >= 0 && B[V] !== Z[K]; )
            K--;
          for (; V >= 1 && K >= 0; V--, K--)
            if (B[V] !== Z[K]) {
              if (V !== 1 || K !== 1)
                do
                  if (V--, K--, K < 0 || B[V] !== Z[K]) {
                    var ne = `
` + B[V].replace(" at new ", " at ");
                    return l.displayName && ne.includes("<anonymous>") && (ne = ne.replace("<anonymous>", l.displayName)), typeof l == "function" && Ve.set(l, ne), ne;
                  }
                while (V >= 1 && K >= 0);
              break;
            }
        }
      } finally {
        lt = !1, ie.current = H, ye(), Error.prepareStackTrace = O;
      }
      var Ee = l ? l.displayName || l.name : "", Re = Ee ? pe(Ee) : "";
      return typeof l == "function" && Ve.set(l, Re), Re;
    }
    function tn(l, h, b) {
      return Wt(l, !1);
    }
    function rn(l) {
      var h = l.prototype;
      return !!(h && h.isReactComponent);
    }
    function Ye(l, h, b) {
      if (l == null)
        return "";
      if (typeof l == "function")
        return Wt(l, rn(l));
      if (typeof l == "string")
        return pe(l);
      switch (l) {
        case u:
          return pe("Suspense");
        case f:
          return pe("SuspenseList");
      }
      if (typeof l == "object")
        switch (l.$$typeof) {
          case d:
            return tn(l.render);
          case p:
            return Ye(l.type, h, b);
          case g: {
            var j = l, O = j._payload, H = j._init;
            try {
              return Ye(H(O), h, b);
            } catch {
            }
          }
        }
      return "";
    }
    var Me = Object.prototype.hasOwnProperty, Nt = {}, Ut = D.ReactDebugCurrentFrame;
    function Ke(l) {
      if (l) {
        var h = l._owner, b = Ye(l.type, l._source, h ? h.type : null);
        Ut.setExtraStackFrame(b);
      } else
        Ut.setExtraStackFrame(null);
    }
    function nn(l, h, b, j, O) {
      {
        var H = Function.call.bind(Me);
        for (var P in l)
          if (H(l, P)) {
            var B = void 0;
            try {
              if (typeof l[P] != "function") {
                var Z = Error((j || "React class") + ": " + b + " type `" + P + "` is invalid; it must be a function, usually from the `prop-types` package, but received `" + typeof l[P] + "`.This often happens because of typos such as `PropTypes.function` instead of `PropTypes.func`.");
                throw Z.name = "Invariant Violation", Z;
              }
              B = l[P](h, P, j, b, null, "SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED");
            } catch (V) {
              B = V;
            }
            B && !(B instanceof Error) && (Ke(O), C("%s: type specification of %s `%s` is invalid; the type checker function must return `null` or an `Error` but returned a %s. You may have forgotten to pass an argument to the type checker creator (arrayOf, instanceOf, objectOf, oneOf, oneOfType, and shape all require an argument).", j || "React class", b, P, typeof B), Ke(null)), B instanceof Error && !(B.message in Nt) && (Nt[B.message] = !0, Ke(O), C("Failed %s type: %s", b, B.message), Ke(null));
          }
      }
    }
    var on = Array.isArray;
    function dt(l) {
      return on(l);
    }
    function sn(l) {
      {
        var h = typeof Symbol == "function" && Symbol.toStringTag, b = h && l[Symbol.toStringTag] || l.constructor.name || "Object";
        return b;
      }
    }
    function an(l) {
      try {
        return qt(l), !1;
      } catch {
        return !0;
      }
    }
    function qt(l) {
      return "" + l;
    }
    function Gt(l) {
      if (an(l))
        return C("The provided key is an unsupported type %s. This value must be coerced to a string before before using it here.", sn(l)), qt(l);
    }
    var Vt = D.ReactCurrentOwner, cn = {
      key: !0,
      ref: !0,
      __self: !0,
      __source: !0
    }, Yt, Kt;
    function ln(l) {
      if (Me.call(l, "ref")) {
        var h = Object.getOwnPropertyDescriptor(l, "ref").get;
        if (h && h.isReactWarning)
          return !1;
      }
      return l.ref !== void 0;
    }
    function dn(l) {
      if (Me.call(l, "key")) {
        var h = Object.getOwnPropertyDescriptor(l, "key").get;
        if (h && h.isReactWarning)
          return !1;
      }
      return l.key !== void 0;
    }
    function un(l, h) {
      typeof l.ref == "string" && Vt.current;
    }
    function fn(l, h) {
      {
        var b = function() {
          Yt || (Yt = !0, C("%s: `key` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", h));
        };
        b.isReactWarning = !0, Object.defineProperty(l, "key", {
          get: b,
          configurable: !0
        });
      }
    }
    function pn(l, h) {
      {
        var b = function() {
          Kt || (Kt = !0, C("%s: `ref` is not a prop. Trying to access it will result in `undefined` being returned. If you need to access the same value within the child component, you should pass it as a different prop. (https://reactjs.org/link/special-props)", h));
        };
        b.isReactWarning = !0, Object.defineProperty(l, "ref", {
          get: b,
          configurable: !0
        });
      }
    }
    var hn = function(l, h, b, j, O, H, P) {
      var B = {
        // This tag allows us to uniquely identify this as a React Element
        $$typeof: t,
        // Built-in properties that belong on the element
        type: l,
        key: h,
        ref: b,
        props: P,
        // Record the component responsible for creating this element.
        _owner: H
      };
      return B._store = {}, Object.defineProperty(B._store, "validated", {
        configurable: !1,
        enumerable: !1,
        writable: !0,
        value: !1
      }), Object.defineProperty(B, "_self", {
        configurable: !1,
        enumerable: !1,
        writable: !1,
        value: j
      }), Object.defineProperty(B, "_source", {
        configurable: !1,
        enumerable: !1,
        writable: !1,
        value: O
      }), Object.freeze && (Object.freeze(B.props), Object.freeze(B)), B;
    };
    function gn(l, h, b, j, O) {
      {
        var H, P = {}, B = null, Z = null;
        b !== void 0 && (Gt(b), B = "" + b), dn(h) && (Gt(h.key), B = "" + h.key), ln(h) && (Z = h.ref, un(h, O));
        for (H in h)
          Me.call(h, H) && !cn.hasOwnProperty(H) && (P[H] = h[H]);
        if (l && l.defaultProps) {
          var V = l.defaultProps;
          for (H in V)
            P[H] === void 0 && (P[H] = V[H]);
        }
        if (B || Z) {
          var K = typeof l == "function" ? l.displayName || l.name || "Unknown" : l;
          B && fn(P, K), Z && pn(P, K);
        }
        return hn(l, B, Z, O, j, Vt.current, P);
      }
    }
    var ut = D.ReactCurrentOwner, Jt = D.ReactDebugCurrentFrame;
    function je(l) {
      if (l) {
        var h = l._owner, b = Ye(l.type, l._source, h ? h.type : null);
        Jt.setExtraStackFrame(b);
      } else
        Jt.setExtraStackFrame(null);
    }
    var ft;
    ft = !1;
    function pt(l) {
      return typeof l == "object" && l !== null && l.$$typeof === t;
    }
    function Xt() {
      {
        if (ut.current) {
          var l = w(ut.current.type);
          if (l)
            return `

Check the render method of \`` + l + "`.";
        }
        return "";
      }
    }
    function yn(l) {
      return "";
    }
    var Qt = {};
    function mn(l) {
      {
        var h = Xt();
        if (!h) {
          var b = typeof l == "string" ? l : l.displayName || l.name;
          b && (h = `

Check the top-level render call using <` + b + ">.");
        }
        return h;
      }
    }
    function Zt(l, h) {
      {
        if (!l._store || l._store.validated || l.key != null)
          return;
        l._store.validated = !0;
        var b = mn(h);
        if (Qt[b])
          return;
        Qt[b] = !0;
        var j = "";
        l && l._owner && l._owner !== ut.current && (j = " It was passed a child from " + w(l._owner.type) + "."), je(l), C('Each child in a list should have a unique "key" prop.%s%s See https://reactjs.org/link/warning-keys for more information.', b, j), je(null);
      }
    }
    function er(l, h) {
      {
        if (typeof l != "object")
          return;
        if (dt(l))
          for (var b = 0; b < l.length; b++) {
            var j = l[b];
            pt(j) && Zt(j, h);
          }
        else if (pt(l))
          l._store && (l._store.validated = !0);
        else if (l) {
          var O = I(l);
          if (typeof O == "function" && O !== l.entries)
            for (var H = O.call(l), P; !(P = H.next()).done; )
              pt(P.value) && Zt(P.value, h);
        }
      }
    }
    function xn(l) {
      {
        var h = l.type;
        if (h == null || typeof h == "string")
          return;
        var b;
        if (typeof h == "function")
          b = h.propTypes;
        else if (typeof h == "object" && (h.$$typeof === d || // Note: Memo only checks outer props here.
        // Inner props are checked in the reconciler.
        h.$$typeof === p))
          b = h.propTypes;
        else
          return;
        if (b) {
          var j = w(h);
          nn(b, l.props, "prop", j, l);
        } else if (h.PropTypes !== void 0 && !ft) {
          ft = !0;
          var O = w(h);
          C("Component %s declared `PropTypes` instead of `propTypes`. Did you misspell the property assignment?", O || "Unknown");
        }
        typeof h.getDefaultProps == "function" && !h.getDefaultProps.isReactClassApproved && C("getDefaultProps is only used on classic React.createClass definitions. Use a static property named `defaultProps` instead.");
      }
    }
    function vn(l) {
      {
        for (var h = Object.keys(l.props), b = 0; b < h.length; b++) {
          var j = h[b];
          if (j !== "children" && j !== "key") {
            je(l), C("Invalid prop `%s` supplied to `React.Fragment`. React.Fragment can only have `key` and `children` props.", j), je(null);
            break;
          }
        }
        l.ref !== null && (je(l), C("Invalid attribute `ref` supplied to `React.Fragment`."), je(null));
      }
    }
    var tr = {};
    function rr(l, h, b, j, O, H) {
      {
        var P = Y(l);
        if (!P) {
          var B = "";
          (l === void 0 || typeof l == "object" && l !== null && Object.keys(l).length === 0) && (B += " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.");
          var Z = yn();
          Z ? B += Z : B += Xt();
          var V;
          l === null ? V = "null" : dt(l) ? V = "array" : l !== void 0 && l.$$typeof === t ? (V = "<" + (w(l.type) || "Unknown") + " />", B = " Did you accidentally export a JSX literal instead of a component?") : V = typeof l, C("React.jsx: type is invalid -- expected a string (for built-in components) or a class/function (for composite components) but got: %s.%s", V, B);
        }
        var K = gn(l, h, b, O, H);
        if (K == null)
          return K;
        if (P) {
          var ne = h.children;
          if (ne !== void 0)
            if (j)
              if (dt(ne)) {
                for (var Ee = 0; Ee < ne.length; Ee++)
                  er(ne[Ee], l);
                Object.freeze && Object.freeze(ne);
              } else
                C("React.jsx: Static children should always be an array. You are likely explicitly calling React.jsxs or React.jsxDEV. Use the Babel transform instead.");
            else
              er(ne, l);
        }
        if (Me.call(h, "key")) {
          var Re = w(l), te = Object.keys(h).filter(function(kn) {
            return kn !== "key";
          }), ht = te.length > 0 ? "{key: someKey, " + te.join(": ..., ") + ": ...}" : "{key: someKey}";
          if (!tr[Re + ht]) {
            var _n = te.length > 0 ? "{" + te.join(": ..., ") + ": ...}" : "{}";
            C(`A props object containing a "key" prop is being spread into JSX:
  let props = %s;
  <%s {...props} />
React keys must be passed directly to JSX without using spread:
  let props = %s;
  <%s key={someKey} {...props} />`, ht, Re, _n, Re), tr[Re + ht] = !0;
          }
        }
        return l === n ? vn(K) : xn(K), K;
      }
    }
    function wn(l, h, b) {
      return rr(l, h, b, !0);
    }
    function bn(l, h, b) {
      return rr(l, h, b, !1);
    }
    var Sn = bn, Cn = wn;
    Oe.Fragment = n, Oe.jsx = Sn, Oe.jsxs = Cn;
  }(), Oe;
}
Ur.exports = Po();
var a = Ur.exports;
function Oo(e) {
  orca.headbar.registerHeadbarButton(`${e}.flashcardHomeButton`, () => /* @__PURE__ */ a.jsx(
    orca.components.Button,
    {
      variant: "plain",
      tabIndex: -1,
      onClick: () => orca.commands.invokeCommand(`${e}.openFlashcardHome`),
      title: "Flashcard Home - 卡片管理主页",
      children: /* @__PURE__ */ a.jsx("i", { className: "ti ti-cards orca-headbar-icon" })
    }
  )), orca.headbar.registerHeadbarButton(`${e}.reviewButton`, () => /* @__PURE__ */ a.jsx(
    orca.components.Button,
    {
      variant: "plain",
      tabIndex: -1,
      onClick: () => orca.commands.invokeCommand(`${e}.openOldReviewPanel`),
      title: "开始闪卡复习",
      children: /* @__PURE__ */ a.jsx("i", { className: "ti ti-brain orca-headbar-icon" })
    }
  )), orca.toolbar.registerToolbarButton(`${e}.clozeButton`, {
    icon: "ti ti-braces",
    tooltip: "创建 Cloze 填空",
    command: `${e}.createCloze`
  }), orca.slashCommands.registerSlashCommand(`${e}.makeCard`, {
    icon: "ti ti-card-plus",
    group: "SRS",
    title: "转换为记忆卡片",
    command: `${e}.makeCardFromBlock`
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
  });
}
function Lo(e) {
  orca.headbar.unregisterHeadbarButton(`${e}.flashcardHomeButton`), orca.headbar.unregisterHeadbarButton(`${e}.reviewButton`), orca.toolbar.unregisterToolbarButton(`${e}.clozeButton`), orca.slashCommands.unregisterSlashCommand(`${e}.makeCard`), orca.slashCommands.unregisterSlashCommand(`${e}.directionForward`), orca.slashCommands.unregisterSlashCommand(`${e}.directionBackward`), orca.slashCommands.unregisterSlashCommand(`${e}.aiCard`);
}
const { Component: Ho } = window.React, { Button: dr } = orca.components;
class $e extends Ho {
  constructor(r) {
    super(r);
    /**
     * 重置错误状态，尝试重新渲染子组件
     */
    U(this, "handleRetry", () => {
      this.setState({
        hasError: !1,
        error: null,
        errorInfo: null
      });
    });
    /**
     * 复制错误信息到剪贴板
     */
    U(this, "handleCopyError", async () => {
      const { error: r, errorInfo: n } = this.state, { componentName: o } = this.props, s = [
        "=== SRS 错误报告 ===",
        `组件: ${o || "未知"}`,
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
  static getDerivedStateFromError(r) {
    return { hasError: !0, error: r };
  }
  componentDidCatch(r, n) {
    const { componentName: o, onError: s } = this.props, i = o ? `[SRS Error Boundary - ${o}]` : "[SRS Error Boundary]";
    if (console.error(i, "捕获到运行时错误:"), console.error(i, "错误信息:", r.message), console.error(i, "错误堆栈:", r.stack), console.error(i, "组件堆栈:", n.componentStack), this.setState({ errorInfo: n }), s)
      try {
        s(r, n);
      } catch (c) {
        console.error(i, "错误回调执行失败:", c);
      }
    try {
      orca.notify("error", `组件运行时错误：${r.message}`, {
        title: o ? `${o} 错误` : "SRS 错误"
      });
    } catch (c) {
      console.warn(i, "发送错误通知失败:", c);
    }
  }
  render() {
    const { hasError: r, error: n } = this.state, { children: o, errorTitle: s, renderError: i } = this.props;
    return r ? i ? i(n, this.handleRetry) : /* @__PURE__ */ a.jsxs(
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
          /* @__PURE__ */ a.jsx(
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
          /* @__PURE__ */ a.jsx(
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
          /* @__PURE__ */ a.jsx(
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
          /* @__PURE__ */ a.jsxs("div", { style: { display: "flex", gap: "12px", marginTop: "8px" }, children: [
            /* @__PURE__ */ a.jsx(dr, { variant: "solid", onClick: this.handleRetry, children: "重试" }),
            /* @__PURE__ */ a.jsx(dr, { variant: "plain", onClick: this.handleCopyError, children: "复制错误信息" })
          ] })
        ]
      }
    ) : o;
  }
}
const { useState: me, useMemo: St, useEffect: ur } = window.React, { useSnapshot: Wo } = window.Valtio, { BlockShell: No, BlockChildren: Uo, Button: le } = orca.components;
function Ct({
  panelId: e,
  blockId: t,
  rndId: r,
  blockLevel: n,
  indentLevel: o,
  mirrorId: s,
  initiallyCollapsed: i,
  renderingMode: c,
  front: d,
  back: u
}) {
  const f = Wo(orca.state), p = s ?? t, g = St(() => {
    var A;
    return (A = f == null ? void 0 : f.blocks) == null ? void 0 : A[p];
  }, [f == null ? void 0 : f.blocks, p]), v = (A) => {
    var G, ye;
    return (ye = (G = g == null ? void 0 : g.properties) == null ? void 0 : G.find((ie) => ie.name === A)) == null ? void 0 : ye.value;
  };
  St(() => {
    const A = v("srs.due"), G = v("srs.lastReviewed");
    return {
      stability: v("srs.stability"),
      difficulty: v("srs.difficulty"),
      interval: v("srs.interval"),
      due: A ? new Date(A) : null,
      lastReviewed: G ? new Date(G) : null,
      reps: v("srs.reps"),
      lapses: v("srs.lapses")
    };
  }, [g == null ? void 0 : g.properties]);
  const [y, _] = me(!1), [I, D] = me(!1), [C, k] = me(!1), [x, E] = me(d), [F, N] = me(u), [Q, z] = me(d), [Y, J] = me(u), [R, w] = me(!1), [S, $] = me(!1), L = (A) => [{ t: "t", v: A ?? "" }];
  ur(() => {
    z(d), E(d), D(!1);
  }, [d]), ur(() => {
    J(u), N(u), k(!1);
  }, [u]);
  const W = async (A) => {
    console.log(`[SRS Card Block Renderer] 卡片 #${t} 评分: ${A}`);
    const G = await Ir(t, A);
    _(!1);
    const ye = (ie) => {
      const ce = ie.getMonth() + 1, pe = ie.getDate();
      return `${ce}-${pe}`;
    };
    orca.notify(
      "success",
      `评分已记录：${A}，下次 ${ye(G.state.due)}（间隔 ${G.state.interval} 天）`,
      { title: "SRS 复习" }
    );
  }, X = async () => {
    var A;
    if (!R) {
      w(!0);
      try {
        await orca.commands.invokeEditorCommand(
          "core.editor.setBlocksContent",
          null,
          [{ id: p, content: L(x) }],
          !1
        );
        const G = (A = orca.state.blocks) == null ? void 0 : A[p];
        G && (G.text = x, G._repr && (G._repr.front = x)), z(x), D(!1), orca.notify("success", "题目已保存", { title: "SRS 卡片" });
      } catch (G) {
        console.error("保存题目失败:", G), orca.notify("error", `保存失败: ${G}`);
      } finally {
        w(!1);
      }
    }
  }, re = async () => {
    var G, ye, ie;
    if (S) return;
    const A = (G = g == null ? void 0 : g.children) == null ? void 0 : G[0];
    if (A === void 0) {
      orca.notify("warn", "该卡片没有子块，无法保存答案", { title: "SRS 卡片" });
      return;
    }
    $(!0);
    try {
      await orca.commands.invokeEditorCommand(
        "core.editor.setBlocksContent",
        null,
        [{ id: A, content: L(F) }],
        !1
      );
      const ce = (ye = orca.state.blocks) == null ? void 0 : ye[A];
      ce && (ce.text = F);
      const pe = (ie = orca.state.blocks) == null ? void 0 : ie[p];
      pe && pe._repr && (pe._repr.back = F), J(F), k(!1), orca.notify("success", "答案已保存", { title: "SRS 卡片" });
    } catch (ce) {
      console.error("保存答案失败:", ce), orca.notify("error", `保存失败: ${ce}`);
    } finally {
      $(!1);
    }
  }, ae = (A) => {
    A === "front" ? (E(d), D(!1)) : (N(u), k(!1));
  }, ge = St(
    () => /* @__PURE__ */ a.jsx(
      Uo,
      {
        block: g,
        panelId: e,
        blockLevel: n,
        indentLevel: o,
        renderingMode: c
      }
    ),
    [g == null ? void 0 : g.children]
  ), Be = /* @__PURE__ */ a.jsxs(
    "div",
    {
      className: "srs-card-block-content",
      style: {
        backgroundColor: "var(--orca-color-bg-1)",
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "8px",
        padding: "16px",
        marginTop: "4px",
        marginBottom: "4px"
      },
      children: [
        /* @__PURE__ */ a.jsxs(
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
              /* @__PURE__ */ a.jsx("i", { className: "ti ti-cards", style: { fontSize: "16px" } }),
              /* @__PURE__ */ a.jsx("span", { children: "SRS 记忆卡片" })
            ]
          }
        ),
        /* @__PURE__ */ a.jsxs(
          "div",
          {
            className: "srs-card-front",
            style: {
              marginBottom: "12px",
              padding: "12px",
              backgroundColor: "var(--orca-color-bg-2)",
              borderRadius: "6px",
              fontSize: "14px",
              fontWeight: "500",
              color: "var(--orca-color-text-1)",
              display: "flex",
              flexDirection: "column",
              gap: "8px"
            },
            children: [
              /* @__PURE__ */ a.jsxs(
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
                    /* @__PURE__ */ a.jsx("span", { children: "题目：" }),
                    !I && /* @__PURE__ */ a.jsxs(
                      le,
                      {
                        variant: "soft",
                        onClick: () => D(!0),
                        style: { padding: "2px 8px", fontSize: "11px" },
                        children: [
                          /* @__PURE__ */ a.jsx("i", { className: "ti ti-edit" }),
                          " 编辑"
                        ]
                      }
                    )
                  ]
                }
              ),
              I ? /* @__PURE__ */ a.jsxs(a.Fragment, { children: [
                /* @__PURE__ */ a.jsx(
                  "textarea",
                  {
                    value: x,
                    onChange: (A) => E(A.target.value),
                    style: {
                      width: "100%",
                      minHeight: "80px",
                      padding: "8px",
                      fontSize: "14px",
                      borderRadius: "4px",
                      border: "1px solid var(--orca-color-border-1)",
                      resize: "vertical"
                    }
                  }
                ),
                /* @__PURE__ */ a.jsxs(
                  "div",
                  {
                    style: {
                      display: "flex",
                      gap: "8px",
                      justifyContent: "flex-end"
                    },
                    children: [
                      /* @__PURE__ */ a.jsx(le, { variant: "soft", onClick: () => ae("front"), children: "取消" }),
                      /* @__PURE__ */ a.jsx(le, { variant: "solid", onClick: X, children: "保存" })
                    ]
                  }
                )
              ] }) : /* @__PURE__ */ a.jsx("div", { style: { whiteSpace: "pre-wrap" }, children: Q || "（无题目）" })
            ]
          }
        ),
        y ? (
          // 已显示答案：显示答案和评分按钮
          /* @__PURE__ */ a.jsxs(a.Fragment, { children: [
            /* @__PURE__ */ a.jsxs(
              "div",
              {
                className: "srs-card-back",
                style: {
                  marginBottom: "12px",
                  padding: "12px",
                  backgroundColor: "var(--orca-color-bg-2)",
                  borderRadius: "6px",
                  borderLeft: "3px solid var(--orca-color-primary-5)",
                  fontSize: "14px",
                  color: "var(--orca-color-text-1)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px"
                },
                children: [
                  /* @__PURE__ */ a.jsxs(
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
                        /* @__PURE__ */ a.jsx("span", { children: "答案：" }),
                        !C && /* @__PURE__ */ a.jsxs(
                          le,
                          {
                            variant: "soft",
                            onClick: () => k(!0),
                            style: { padding: "2px 8px", fontSize: "11px" },
                            children: [
                              /* @__PURE__ */ a.jsx("i", { className: "ti ti-edit" }),
                              " 编辑"
                            ]
                          }
                        )
                      ]
                    }
                  ),
                  C ? /* @__PURE__ */ a.jsxs(a.Fragment, { children: [
                    /* @__PURE__ */ a.jsx(
                      "textarea",
                      {
                        value: F,
                        onChange: (A) => N(A.target.value),
                        style: {
                          width: "100%",
                          minHeight: "80px",
                          padding: "8px",
                          fontSize: "14px",
                          borderRadius: "4px",
                          border: "1px solid var(--orca-color-border-1)",
                          resize: "vertical"
                        }
                      }
                    ),
                    /* @__PURE__ */ a.jsxs(
                      "div",
                      {
                        style: {
                          display: "flex",
                          gap: "8px",
                          justifyContent: "flex-end"
                        },
                        children: [
                          /* @__PURE__ */ a.jsx(le, { variant: "soft", onClick: () => ae("back"), children: "取消" }),
                          /* @__PURE__ */ a.jsx(le, { variant: "solid", onClick: re, children: "保存" })
                        ]
                      }
                    )
                  ] }) : /* @__PURE__ */ a.jsx("div", { style: { whiteSpace: "pre-wrap" }, children: Y || "（无答案）" })
                ]
              }
            ),
            /* @__PURE__ */ a.jsxs(
              "div",
              {
                className: "srs-card-grade-buttons",
                style: {
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "8px"
                },
                children: [
                  /* @__PURE__ */ a.jsxs(
                    le,
                    {
                      variant: "dangerous",
                      onClick: () => W("again"),
                      style: {
                        padding: "8px 4px",
                        fontSize: "12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "2px"
                      },
                      children: [
                        /* @__PURE__ */ a.jsx("span", { style: { fontWeight: "600" }, children: "Again" }),
                        /* @__PURE__ */ a.jsx("span", { style: { fontSize: "10px", opacity: 0.8 }, children: "忘记" })
                      ]
                    }
                  ),
                  /* @__PURE__ */ a.jsxs(
                    le,
                    {
                      variant: "soft",
                      onClick: () => W("hard"),
                      style: {
                        padding: "8px 4px",
                        fontSize: "12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "2px"
                      },
                      children: [
                        /* @__PURE__ */ a.jsx("span", { style: { fontWeight: "600" }, children: "Hard" }),
                        /* @__PURE__ */ a.jsx("span", { style: { fontSize: "10px", opacity: 0.8 }, children: "困难" })
                      ]
                    }
                  ),
                  /* @__PURE__ */ a.jsxs(
                    le,
                    {
                      variant: "solid",
                      onClick: () => W("good"),
                      style: {
                        padding: "8px 4px",
                        fontSize: "12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "2px"
                      },
                      children: [
                        /* @__PURE__ */ a.jsx("span", { style: { fontWeight: "600" }, children: "Good" }),
                        /* @__PURE__ */ a.jsx("span", { style: { fontSize: "10px", opacity: 0.8 }, children: "良好" })
                      ]
                    }
                  ),
                  /* @__PURE__ */ a.jsxs(
                    le,
                    {
                      variant: "solid",
                      onClick: () => W("easy"),
                      style: {
                        padding: "8px 4px",
                        fontSize: "12px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "2px",
                        backgroundColor: "var(--orca-color-primary-5)",
                        opacity: 0.9
                      },
                      children: [
                        /* @__PURE__ */ a.jsx("span", { style: { fontWeight: "600" }, children: "Easy" }),
                        /* @__PURE__ */ a.jsx("span", { style: { fontSize: "10px", opacity: 0.8 }, children: "简单" })
                      ]
                    }
                  )
                ]
              }
            )
          ] })
        ) : (
          // 未显示答案：显示按钮
          /* @__PURE__ */ a.jsx("div", { style: { textAlign: "center" }, children: /* @__PURE__ */ a.jsx(
            le,
            {
              variant: "soft",
              onClick: () => _(!0),
              style: {
                padding: "6px 16px",
                fontSize: "13px"
              },
              children: "显示答案"
            }
          ) })
        )
      ]
    }
  );
  return /* @__PURE__ */ a.jsx(
    No,
    {
      panelId: e,
      blockId: t,
      rndId: r,
      mirrorId: s,
      blockLevel: n,
      indentLevel: o,
      initiallyCollapsed: i,
      renderingMode: c,
      reprClassName: "srs-repr-card",
      contentClassName: "srs-repr-card-content",
      contentAttrs: { contentEditable: !1 },
      contentJsx: /* @__PURE__ */ a.jsx($e, { componentName: "SRS卡片", errorTitle: "卡片加载出错", children: Be }),
      childrenJsx: ge
    }
  );
}
const xe = {
  CARD_GRADED: "srs.cardGraded",
  // 卡片被评分
  CARD_BURIED: "srs.cardBuried",
  // 卡片被埋藏
  CARD_SUSPENDED: "srs.cardSuspended"
  // 卡片被暂停
};
function qo(e, t) {
  orca.broadcasts.broadcast(xe.CARD_GRADED, { blockId: e, grade: t });
}
function Go(e) {
  orca.broadcasts.broadcast(xe.CARD_BURIED, { blockId: e });
}
function Vo(e) {
  orca.broadcasts.broadcast(xe.CARD_SUSPENDED, { blockId: e });
}
const { useEffect: Yo, useCallback: Ko } = window.React, Jo = {
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
  // 埋藏到明天
  s: "suspend"
  // 暂停卡片
};
function Ht({
  showAnswer: e,
  isGrading: t,
  onShowAnswer: r,
  onGrade: n,
  onBury: o,
  onSuspend: s,
  enabled: i = !0
}) {
  const c = Ko(
    (d) => {
      if (!i) return;
      const u = d.target;
      if (u.tagName === "INPUT" || u.tagName === "TEXTAREA" || u.isContentEditable)
        return;
      const f = Jo[d.key];
      f && (d.preventDefault(), d.stopPropagation(), f === "showAnswer" ? !e && !t && r() : f === "bury" ? !t && o && o() : f === "suspend" ? !t && s && s() : e && !t && n(f));
    },
    [e, t, r, n, o, s, i]
  );
  Yo(() => {
    if (i)
      return document.addEventListener("keydown", c), () => {
        document.removeEventListener("keydown", c);
      };
  }, [c, i]);
}
const { useState: Xo, useMemo: Le } = window.React, { useSnapshot: Qo } = window.Valtio, { Button: be, ModalOverlay: Zo } = orca.components;
function fr(e, t, r, n) {
  return !e || e.length === 0 ? [/* @__PURE__ */ a.jsx("span", { children: "（空白内容）" }, "empty")] : e.map((o, s) => {
    if (o.t === "t")
      return /* @__PURE__ */ a.jsx("span", { children: o.v }, s);
    if (o.t === `${r}.cloze`) {
      const i = o.clozeNumber;
      return t || !(n ? i === n : !0) ? /* @__PURE__ */ a.jsx(
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
          children: o.v
        },
        s
      ) : /* @__PURE__ */ a.jsx(
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
        s
      );
    }
    return /* @__PURE__ */ a.jsx("span", { style: { color: "var(--orca-color-text-2)" }, children: o.v }, s);
  });
}
function es({
  blockId: e,
  onGrade: t,
  onBury: r,
  onSuspend: n,
  onClose: o,
  srsInfo: s,
  isGrading: i = !1,
  onJumpToCard: c,
  inSidePanel: d = !1,
  panelId: u,
  pluginName: f,
  clozeNumber: p
}) {
  const [g, v] = Xo(!1), y = Qo(orca.state), _ = Le(() => ((y == null ? void 0 : y.blocks) ?? {})[e], [y == null ? void 0 : y.blocks, e]), I = async (F) => {
    i || (await t(F), v(!1));
  };
  Ht({
    showAnswer: g,
    isGrading: i,
    onShowAnswer: () => v(!0),
    onGrade: I,
    onBury: r,
    onSuspend: n
  });
  const D = Le(() => {
    const F = s ? {
      stability: s.stability ?? 0,
      difficulty: s.difficulty ?? 0,
      interval: s.interval ?? 0,
      due: s.due ?? /* @__PURE__ */ new Date(),
      lastReviewed: s.lastReviewed ?? null,
      reps: s.reps ?? 0,
      lapses: s.lapses ?? 0,
      state: s.state
    } : null;
    return Ot(F);
  }, [s]), C = Le(() => (_ == null ? void 0 : _.content) ?? [], [_ == null ? void 0 : _.content]), k = Le(() => fr(C, !1, f, p), [C, f, p]), x = Le(() => fr(C, !0, f, p), [C, f, p]), E = /* @__PURE__ */ a.jsxs("div", { className: "srs-cloze-card-container", style: {
    backgroundColor: "var(--orca-color-bg-1)",
    borderRadius: "12px",
    padding: "16px",
    width: d ? "100%" : "90%",
    minWidth: d ? "0" : "600px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
  }, children: [
    /* @__PURE__ */ a.jsxs("div", { style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "12px"
    }, children: [
      /* @__PURE__ */ a.jsxs("div", { style: {
        fontSize: "12px",
        fontWeight: "500",
        color: "var(--orca-color-primary-5)",
        backgroundColor: "var(--orca-color-primary-1)",
        padding: "4px 10px",
        borderRadius: "6px",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px"
      }, children: [
        /* @__PURE__ */ a.jsx("i", { className: "ti ti-braces" }),
        "填空卡 ",
        p ? `c${p}` : ""
      ] }),
      /* @__PURE__ */ a.jsxs("div", { style: { display: "flex", gap: "8px" }, children: [
        r && /* @__PURE__ */ a.jsxs(
          be,
          {
            variant: "soft",
            onClick: r,
            title: "埋藏到明天 (B)",
            style: {
              padding: "6px 12px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            },
            children: [
              /* @__PURE__ */ a.jsx("i", { className: "ti ti-calendar-pause" }),
              "埋藏"
            ]
          }
        ),
        n && /* @__PURE__ */ a.jsxs(
          be,
          {
            variant: "soft",
            onClick: n,
            title: "暂停卡片 (S)",
            style: {
              padding: "6px 12px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            },
            children: [
              /* @__PURE__ */ a.jsx("i", { className: "ti ti-player-pause" }),
              "暂停"
            ]
          }
        ),
        e && c && /* @__PURE__ */ a.jsxs(
          be,
          {
            variant: "soft",
            onClick: () => c(e),
            style: {
              padding: "6px 12px",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "4px"
            },
            children: [
              /* @__PURE__ */ a.jsx("i", { className: "ti ti-arrow-right" }),
              "跳转到卡片"
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ a.jsx("div", { className: "srs-cloze-question", style: {
      marginBottom: "16px",
      padding: "16px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      minHeight: "100px",
      fontSize: "16px",
      lineHeight: "1.8",
      color: "var(--orca-color-text-1)"
    }, children: g ? x : k }),
    g ? /* @__PURE__ */ a.jsx(a.Fragment, { children: /* @__PURE__ */ a.jsxs("div", { className: "srs-card-grade-buttons", style: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "8px",
      marginTop: "16px"
    }, children: [
      /* @__PURE__ */ a.jsxs(
        be,
        {
          variant: "dangerous",
          onClick: () => I("again"),
          style: {
            padding: "12px 8px",
            fontSize: "14px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px"
          },
          children: [
            /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 600 }, children: oe(D.again) }),
            /* @__PURE__ */ a.jsx("span", { style: { fontSize: "12px", opacity: 0.8 }, children: "忘记" })
          ]
        }
      ),
      /* @__PURE__ */ a.jsxs(
        be,
        {
          variant: "soft",
          onClick: () => I("hard"),
          style: {
            padding: "12px 8px",
            fontSize: "14px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px"
          },
          children: [
            /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 600 }, children: oe(D.hard) }),
            /* @__PURE__ */ a.jsx("span", { style: { fontSize: "12px", opacity: 0.8 }, children: "困难" })
          ]
        }
      ),
      /* @__PURE__ */ a.jsxs(
        be,
        {
          variant: "solid",
          onClick: () => I("good"),
          style: {
            padding: "12px 8px",
            fontSize: "14px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px"
          },
          children: [
            /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 600 }, children: oe(D.good) }),
            /* @__PURE__ */ a.jsx("span", { style: { fontSize: "12px", opacity: 0.8 }, children: "良好" })
          ]
        }
      ),
      /* @__PURE__ */ a.jsxs(
        be,
        {
          variant: "solid",
          onClick: () => I("easy"),
          style: {
            padding: "12px 8px",
            fontSize: "14px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "4px",
            backgroundColor: "var(--orca-color-primary-5)",
            opacity: 0.9
          },
          children: [
            /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 600 }, children: oe(D.easy) }),
            /* @__PURE__ */ a.jsx("span", { style: { fontSize: "12px", opacity: 0.8 }, children: "简单" })
          ]
        }
      )
    ] }) }) : /* @__PURE__ */ a.jsx("div", { style: { textAlign: "center", marginBottom: "12px" }, children: /* @__PURE__ */ a.jsx(
      be,
      {
        variant: "solid",
        onClick: () => v(!0),
        style: {
          padding: "12px 32px",
          fontSize: "16px"
        },
        children: "显示答案"
      }
    ) }),
    /* @__PURE__ */ a.jsx("div", { style: {
      marginTop: "16px",
      textAlign: "center",
      fontSize: "12px",
      color: "var(--orca-color-text-2)",
      opacity: 0.7
    }, children: g ? "根据记忆程度选择评分" : '点击"显示答案"查看填空内容' })
  ] });
  return d ? /* @__PURE__ */ a.jsx("div", { style: { width: "100%", display: "flex", justifyContent: "center" }, children: E }) : /* @__PURE__ */ a.jsx(
    Zo,
    {
      visible: !0,
      canClose: !0,
      onClose: o,
      className: "srs-cloze-card-modal",
      children: E
    }
  );
}
const { useState: ts, useMemo: _t } = window.React, { useSnapshot: rs } = window.Valtio, { Button: Se } = orca.components;
function ns({
  blockId: e,
  onGrade: t,
  onBury: r,
  onSuspend: n,
  onClose: o,
  srsInfo: s,
  isGrading: i = !1,
  onJumpToCard: c,
  inSidePanel: d = !1,
  panelId: u,
  pluginName: f,
  reviewDirection: p
}) {
  const [g, v] = ts(!1), y = rs(orca.state), _ = _t(() => {
    var z;
    return (z = y == null ? void 0 : y.blocks) == null ? void 0 : z[e];
  }, [y == null ? void 0 : y.blocks, e]), I = _t(() => Lr(_ == null ? void 0 : _.content, f), [_ == null ? void 0 : _.content, f]), D = async (z) => {
    i || (await t(z), v(!1));
  };
  Ht({
    showAnswer: g,
    isGrading: i,
    onShowAnswer: () => v(!0),
    onGrade: D,
    onBury: r,
    onSuspend: n
  });
  const C = _t(() => {
    const z = s ? {
      stability: s.stability ?? 0,
      difficulty: s.difficulty ?? 0,
      interval: s.interval ?? 0,
      due: s.due ?? /* @__PURE__ */ new Date(),
      lastReviewed: s.lastReviewed ?? null,
      reps: s.reps ?? 0,
      lapses: s.lapses ?? 0,
      state: s.state
    } : null;
    return Ot(z);
  }, [s]);
  if (!I)
    return /* @__PURE__ */ a.jsx("div", { style: { padding: "20px", textAlign: "center" }, children: "无法解析方向卡内容" });
  const k = p === "forward" ? I.leftText : I.rightText, x = p === "forward" ? I.rightText : I.leftText, E = p === "forward" ? "ti-arrow-right" : "ti-arrow-left", F = p === "forward" ? "正向" : "反向", N = p === "forward" ? "var(--orca-color-primary-5)" : "var(--orca-color-warning-5)", Q = p === "forward" ? "var(--orca-color-primary-1)" : "var(--orca-color-warning-1)";
  return /* @__PURE__ */ a.jsxs(
    "div",
    {
      className: "srs-direction-card-container",
      style: {
        backgroundColor: "var(--orca-color-bg-1)",
        borderRadius: "12px",
        padding: "16px",
        width: d ? "100%" : "90%",
        minWidth: d ? "0" : "600px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
      },
      children: [
        /* @__PURE__ */ a.jsxs(
          "div",
          {
            style: {
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "12px"
            },
            children: [
              /* @__PURE__ */ a.jsxs(
                "div",
                {
                  style: {
                    fontSize: "12px",
                    fontWeight: "500",
                    color: N,
                    backgroundColor: Q,
                    padding: "4px 10px",
                    borderRadius: "6px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px"
                  },
                  children: [
                    /* @__PURE__ */ a.jsx("i", { className: `ti ${E}` }),
                    "方向卡 (",
                    F,
                    ")"
                  ]
                }
              ),
              /* @__PURE__ */ a.jsxs("div", { style: { display: "flex", gap: "8px" }, children: [
                r && /* @__PURE__ */ a.jsxs(
                  Se,
                  {
                    variant: "soft",
                    onClick: r,
                    title: "埋藏到明天 (B)",
                    style: {
                      padding: "6px 12px",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    },
                    children: [
                      /* @__PURE__ */ a.jsx("i", { className: "ti ti-calendar-pause" }),
                      "埋藏"
                    ]
                  }
                ),
                n && /* @__PURE__ */ a.jsxs(
                  Se,
                  {
                    variant: "soft",
                    onClick: n,
                    title: "暂停卡片 (S)",
                    style: {
                      padding: "6px 12px",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    },
                    children: [
                      /* @__PURE__ */ a.jsx("i", { className: "ti ti-player-pause" }),
                      "暂停"
                    ]
                  }
                ),
                e && c && /* @__PURE__ */ a.jsxs(
                  Se,
                  {
                    variant: "soft",
                    onClick: () => c(e),
                    style: {
                      padding: "6px 12px",
                      fontSize: "13px",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px"
                    },
                    children: [
                      /* @__PURE__ */ a.jsx("i", { className: "ti ti-arrow-right" }),
                      "跳转到卡片"
                    ]
                  }
                )
              ] })
            ]
          }
        ),
        /* @__PURE__ */ a.jsx(
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
            children: p === "forward" ? /* @__PURE__ */ a.jsxs(a.Fragment, { children: [
              /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 500 }, children: k }),
              /* @__PURE__ */ a.jsx(
                "i",
                {
                  className: `ti ${E}`,
                  style: {
                    fontSize: "20px",
                    color: N
                  }
                }
              ),
              g ? /* @__PURE__ */ a.jsx(
                "span",
                {
                  style: {
                    fontWeight: 600,
                    color: N,
                    backgroundColor: Q,
                    padding: "4px 12px",
                    borderRadius: "6px"
                  },
                  children: x
                }
              ) : /* @__PURE__ */ a.jsx(
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
            ] }) : /* @__PURE__ */ a.jsxs(a.Fragment, { children: [
              g ? /* @__PURE__ */ a.jsx(
                "span",
                {
                  style: {
                    fontWeight: 600,
                    color: N,
                    backgroundColor: Q,
                    padding: "4px 12px",
                    borderRadius: "6px"
                  },
                  children: x
                }
              ) : /* @__PURE__ */ a.jsx(
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
              /* @__PURE__ */ a.jsx(
                "i",
                {
                  className: `ti ${E}`,
                  style: {
                    fontSize: "20px",
                    color: N
                  }
                }
              ),
              /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 500 }, children: k })
            ] })
          }
        ),
        g ? /* @__PURE__ */ a.jsxs(
          "div",
          {
            className: "srs-card-grade-buttons",
            style: {
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "8px",
              marginTop: "16px"
            },
            children: [
              /* @__PURE__ */ a.jsxs(
                Se,
                {
                  variant: "dangerous",
                  onClick: () => D("again"),
                  style: {
                    padding: "12px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px"
                  },
                  children: [
                    /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 600 }, children: oe(C.again) }),
                    /* @__PURE__ */ a.jsx("span", { style: { fontSize: "12px", opacity: 0.8 }, children: "忘记" })
                  ]
                }
              ),
              /* @__PURE__ */ a.jsxs(
                Se,
                {
                  variant: "soft",
                  onClick: () => D("hard"),
                  style: {
                    padding: "12px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px"
                  },
                  children: [
                    /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 600 }, children: oe(C.hard) }),
                    /* @__PURE__ */ a.jsx("span", { style: { fontSize: "12px", opacity: 0.8 }, children: "困难" })
                  ]
                }
              ),
              /* @__PURE__ */ a.jsxs(
                Se,
                {
                  variant: "solid",
                  onClick: () => D("good"),
                  style: {
                    padding: "12px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px"
                  },
                  children: [
                    /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 600 }, children: oe(C.good) }),
                    /* @__PURE__ */ a.jsx("span", { style: { fontSize: "12px", opacity: 0.8 }, children: "良好" })
                  ]
                }
              ),
              /* @__PURE__ */ a.jsxs(
                Se,
                {
                  variant: "solid",
                  onClick: () => D("easy"),
                  style: {
                    padding: "12px 8px",
                    fontSize: "14px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px",
                    backgroundColor: "var(--orca-color-primary-5)",
                    opacity: 0.9
                  },
                  children: [
                    /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 600 }, children: oe(C.easy) }),
                    /* @__PURE__ */ a.jsx("span", { style: { fontSize: "12px", opacity: 0.8 }, children: "简单" })
                  ]
                }
              )
            ]
          }
        ) : /* @__PURE__ */ a.jsx("div", { style: { textAlign: "center", marginBottom: "12px" }, children: /* @__PURE__ */ a.jsx(
          Se,
          {
            variant: "solid",
            onClick: () => v(!0),
            style: {
              padding: "12px 32px",
              fontSize: "16px"
            },
            children: "显示答案"
          }
        ) }),
        /* @__PURE__ */ a.jsx(
          "div",
          {
            style: {
              marginTop: "16px",
              textAlign: "center",
              fontSize: "12px",
              color: "var(--orca-color-text-2)",
              opacity: 0.7
            },
            children: g ? "根据记忆程度选择评分" : '点击"显示答案"查看内容'
          }
        )
      ]
    }
  );
}
const os = {
  "review.showSiblingBlocks": {
    label: "显示同级子块",
    type: "boolean",
    defaultValue: !1,
    description: "在卡片复习界面的答案区域显示所有同级子块（默认只显示第一个子块）"
  },
  "review.maxSiblingBlocks": {
    label: "最大显示子块数量",
    type: "number",
    defaultValue: 10,
    description: "答案区域最多显示的同级子块数量（避免子块过多影响性能）"
  }
};
function ss(e) {
  var r;
  const t = (r = orca.state.plugins[e]) == null ? void 0 : r.settings;
  return {
    showSiblingBlocks: (t == null ? void 0 : t["review.showSiblingBlocks"]) ?? !1,
    maxSiblingBlocks: (t == null ? void 0 : t["review.maxSiblingBlocks"]) ?? 10
  };
}
const { useState: as, useEffect: is, useRef: pr, useMemo: kt } = window.React, { useSnapshot: cs } = window.Valtio, { Block: ls, Button: Ce, ModalOverlay: ds } = orca.components;
function us({ blockId: e, panelId: t, fallback: r, hideChildren: n = !1, readonly: o = !1 }) {
  const s = pr(null), i = pr(null);
  is(() => {
    if (!n) return;
    const d = s.current;
    if (!d) return;
    const u = () => {
      d.querySelectorAll(`
        .orca-block-children,
        .orca-repr-children,
        [data-role='children'],
        [data-testid='children'],
        .orca-block-handle,
        .orca-block-bullet,
        .orca-repr-handle,
        .orca-block-drag-handle,
        .orca-repr-collapse,
        .orca-block-collapse-btn,
        [data-role='handle'],
        [data-role='bullet']
      `).forEach((y) => {
        y.style.display = "none", (y.classList.contains("orca-block-handle") || y.classList.contains("orca-block-bullet") || y.classList.contains("orca-repr-handle")) && (y.style.width = "0", y.style.height = "0", y.style.overflow = "hidden");
      });
    }, f = (g = 100) => {
      i.current !== null && clearTimeout(i.current), i.current = setTimeout(() => {
        u(), i.current = null;
      }, g);
    };
    u();
    const p = new MutationObserver(() => {
      f(100);
    });
    return p.observe(d, {
      childList: !0,
      subtree: !0,
      attributes: !1,
      // 不监听属性变化
      characterData: !1
      // 不监听文本变化
    }), () => {
      p.disconnect(), i.current !== null && (clearTimeout(i.current), i.current = null);
    };
  }, [n, e]);
  const c = `srs-block-container${n ? " srs-block-hide-children" : ""}`;
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      ref: s,
      className: c,
      contentEditable: o ? !1 : void 0,
      style: {
        padding: "8px",
        backgroundColor: "var(--orca-color-bg-0)",
        borderRadius: "6px",
        border: "1px solid var(--orca-color-border-1)",
        ...o ? { pointerEvents: "none", userSelect: "none", cursor: "default" } : {}
      },
      children: e && t ? /* @__PURE__ */ a.jsx(
        ls,
        {
          panelId: t,
          blockId: e,
          blockLevel: 0,
          indentLevel: 0,
          renderingMode: o ? "readonly" : n ? "simple" : void 0
        }
      ) : /* @__PURE__ */ a.jsx("div", { style: {
        fontSize: "16px",
        color: "var(--orca-color-text-1)",
        lineHeight: "1.6",
        whiteSpace: "pre-wrap"
      }, children: r })
    }
  );
}
function hr({
  front: e,
  back: t,
  onGrade: r,
  onBury: n,
  onSuspend: o,
  onClose: s,
  srsInfo: i,
  isGrading: c = !1,
  blockId: d,
  onJumpToCard: u,
  inSidePanel: f = !1,
  panelId: p,
  pluginName: g = "orca-srs",
  clozeNumber: v,
  directionType: y
}) {
  const [_, I] = as(!1), D = cs(orca.state), C = kt(() => ss(g), [g]), { questionBlock: k, answerBlockIds: x, totalChildCount: E, inferredCardType: F } = kt(() => {
    const w = (D == null ? void 0 : D.blocks) ?? {}, S = d ? w[d] : null, $ = (S == null ? void 0 : S.children) ?? [], L = S ? nt(S) : "basic";
    return {
      questionBlock: S,
      answerBlockIds: $,
      // 返回所有子块 ID
      totalChildCount: $.length,
      inferredCardType: L
    };
  }, [D == null ? void 0 : D.blocks, d]), N = F === "cloze" ? "srs.cloze-card" : F === "direction" ? "srs.direction-card" : "srs.card", Q = N === "srs.card" || N === "srs.cloze-card" && !d || N === "srs.direction-card" && (!d || !y), z = async (w) => {
    c || (console.log(`[SRS Card Demo] 用户选择评分: ${w}`), await r(w), I(!1));
  };
  Ht({
    showAnswer: _,
    isGrading: c,
    onShowAnswer: () => I(!0),
    onGrade: z,
    onBury: n,
    onSuspend: o,
    enabled: Q
    // 仅在渲染 basic 卡片时启用
  });
  const Y = kt(() => {
    const w = i ? {
      stability: i.stability ?? 0,
      difficulty: i.difficulty ?? 0,
      interval: i.interval ?? 0,
      due: i.due ?? /* @__PURE__ */ new Date(),
      lastReviewed: i.lastReviewed ?? null,
      reps: i.reps ?? 0,
      lapses: i.lapses ?? 0,
      state: i.state
    } : null;
    return Ot(w);
  }, [i]);
  if (N === "srs.cloze-card" && d)
    return /* @__PURE__ */ a.jsx($e, { componentName: "填空卡片", errorTitle: "填空卡片加载出错", children: /* @__PURE__ */ a.jsx(
      es,
      {
        blockId: d,
        onGrade: r,
        onBury: n,
        onSuspend: o,
        onClose: s,
        srsInfo: i,
        isGrading: c,
        onJumpToCard: u,
        inSidePanel: f,
        panelId: p,
        pluginName: g,
        clozeNumber: v
      }
    ) });
  if (N === "srs.direction-card" && d && y)
    return /* @__PURE__ */ a.jsx($e, { componentName: "方向卡片", errorTitle: "方向卡片加载出错", children: /* @__PURE__ */ a.jsx(
      ns,
      {
        blockId: d,
        onGrade: r,
        onBury: n,
        onSuspend: o,
        onClose: s,
        srsInfo: i,
        isGrading: c,
        onJumpToCard: u,
        inSidePanel: f,
        panelId: p,
        pluginName: g,
        reviewDirection: y
      }
    ) });
  const J = (w, S, $) => /* @__PURE__ */ a.jsx(
    us,
    {
      blockId: w,
      panelId: p,
      fallback: S,
      hideChildren: $ == null ? void 0 : $.hideChildren,
      readonly: $ == null ? void 0 : $.readonly
    }
  ), R = /* @__PURE__ */ a.jsxs("div", { className: "srs-card-container", style: {
    backgroundColor: "var(--orca-color-bg-1)",
    borderRadius: "12px",
    padding: "16px",
    width: f ? "100%" : "90%",
    minWidth: f ? "0" : "600px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)"
  }, children: [
    d && /* @__PURE__ */ a.jsxs("div", { contentEditable: !1, style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: "8px",
      marginBottom: "12px"
    }, children: [
      n && /* @__PURE__ */ a.jsxs(
        Ce,
        {
          variant: "soft",
          onClick: n,
          title: "埋藏到明天 (B)",
          style: {
            padding: "6px 12px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "4px"
          },
          children: [
            /* @__PURE__ */ a.jsx("i", { className: "ti ti-calendar-pause" }),
            "埋藏"
          ]
        }
      ),
      o && /* @__PURE__ */ a.jsxs(
        Ce,
        {
          variant: "soft",
          onClick: o,
          title: "暂停卡片 (S)",
          style: {
            padding: "6px 12px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "4px"
          },
          children: [
            /* @__PURE__ */ a.jsx("i", { className: "ti ti-player-pause" }),
            "暂停"
          ]
        }
      ),
      u && /* @__PURE__ */ a.jsxs(
        Ce,
        {
          variant: "soft",
          onClick: () => u(d),
          style: {
            padding: "6px 12px",
            fontSize: "13px",
            display: "flex",
            alignItems: "center",
            gap: "4px"
          },
          children: [
            /* @__PURE__ */ a.jsx("i", { className: "ti ti-arrow-right" }),
            "跳转到卡片"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ a.jsxs("div", { className: "srs-card-front", style: {
      marginBottom: "16px",
      padding: "12px",
      backgroundColor: "var(--orca-color-bg-2)",
      borderRadius: "8px",
      minHeight: "80px"
    }, children: [
      /* @__PURE__ */ a.jsx("div", { contentEditable: !1, style: {
        fontSize: "14px",
        fontWeight: "500",
        color: "var(--orca-color-text-2)",
        marginBottom: "12px"
      }, children: "题目" }),
      J(d, e, { hideChildren: !0, readonly: !0 })
    ] }),
    _ ? /* @__PURE__ */ a.jsxs(a.Fragment, { children: [
      /* @__PURE__ */ a.jsxs("div", { className: "srs-card-back", style: {
        marginBottom: "16px",
        padding: "12px",
        backgroundColor: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        minHeight: "80px",
        borderLeft: "4px solid var(--orca-color-primary-5)"
      }, children: [
        /* @__PURE__ */ a.jsx("div", { contentEditable: !1, style: {
          fontSize: "14px",
          color: "var(--orca-color-text-2)",
          fontWeight: "500",
          marginBottom: "12px"
        }, children: "答案：" }),
        C.showSiblingBlocks ? (
          // 显示所有同级子块（限制最大数量）
          /* @__PURE__ */ a.jsxs(a.Fragment, { children: [
            x.slice(0, C.maxSiblingBlocks).map((w, S) => /* @__PURE__ */ a.jsx(
              "div",
              {
                style: {
                  marginBottom: S < Math.min(x.length, C.maxSiblingBlocks) - 1 ? "-10px" : 0
                },
                children: J(w, t)
              },
              w
            )),
            E > C.maxSiblingBlocks && /* @__PURE__ */ a.jsxs("div", { style: {
              marginTop: "12px",
              fontSize: "13px",
              color: "var(--orca-color-text-3)",
              fontStyle: "italic",
              textAlign: "center",
              padding: "8px",
              backgroundColor: "var(--orca-color-bg-3)",
              borderRadius: "6px"
            }, children: [
              "还有 ",
              E - C.maxSiblingBlocks,
              " 个子块未显示"
            ] })
          ] })
        ) : (
          // 默认：只显示第一个子块
          J(x[0], t)
        )
      ] }),
      /* @__PURE__ */ a.jsxs("div", { contentEditable: !1, className: "srs-card-grade-buttons", style: {
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "8px"
      }, children: [
        /* @__PURE__ */ a.jsxs(
          Ce,
          {
            variant: "dangerous",
            onClick: () => z("again"),
            style: {
              padding: "12px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px"
            },
            children: [
              /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 600 }, children: oe(Y.again) }),
              /* @__PURE__ */ a.jsx("span", { style: { fontSize: "12px", opacity: 0.8 }, children: "忘记" })
            ]
          }
        ),
        /* @__PURE__ */ a.jsxs(
          Ce,
          {
            variant: "soft",
            onClick: () => z("hard"),
            style: {
              padding: "12px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px"
            },
            children: [
              /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 600 }, children: oe(Y.hard) }),
              /* @__PURE__ */ a.jsx("span", { style: { fontSize: "12px", opacity: 0.8 }, children: "困难" })
            ]
          }
        ),
        /* @__PURE__ */ a.jsxs(
          Ce,
          {
            variant: "solid",
            onClick: () => z("good"),
            style: {
              padding: "12px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px"
            },
            children: [
              /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 600 }, children: oe(Y.good) }),
              /* @__PURE__ */ a.jsx("span", { style: { fontSize: "12px", opacity: 0.8 }, children: "良好" })
            ]
          }
        ),
        /* @__PURE__ */ a.jsxs(
          Ce,
          {
            variant: "solid",
            onClick: () => z("easy"),
            style: {
              padding: "12px 8px",
              fontSize: "14px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              backgroundColor: "var(--orca-color-primary-5)",
              opacity: 0.9
            },
            children: [
              /* @__PURE__ */ a.jsx("span", { style: { fontWeight: 600 }, children: oe(Y.easy) }),
              /* @__PURE__ */ a.jsx("span", { style: { fontSize: "12px", opacity: 0.8 }, children: "简单" })
            ]
          }
        )
      ] })
    ] }) : /* @__PURE__ */ a.jsx("div", { contentEditable: !1, style: { textAlign: "center", marginBottom: "12px" }, children: /* @__PURE__ */ a.jsx(
      Ce,
      {
        variant: "solid",
        onClick: () => I(!0),
        style: {
          padding: "12px 32px",
          fontSize: "16px"
        },
        children: "显示答案"
      }
    ) }),
    /* @__PURE__ */ a.jsx("div", { contentEditable: !1, style: {
      marginTop: "16px",
      textAlign: "center",
      fontSize: "12px",
      color: "var(--orca-color-text-2)",
      opacity: 0.7
    }, children: _ ? "根据记忆程度选择评分" : '点击"显示答案"查看答案内容' })
  ] });
  return f ? /* @__PURE__ */ a.jsx($e, { componentName: "复习卡片", errorTitle: "卡片加载出错", children: /* @__PURE__ */ a.jsx("div", { style: { width: "100%", display: "flex", justifyContent: "center" }, children: R }) }) : /* @__PURE__ */ a.jsx($e, { componentName: "复习卡片", errorTitle: "卡片加载出错", children: /* @__PURE__ */ a.jsx(
    ds,
    {
      visible: !0,
      canClose: !0,
      onClose: s,
      className: "srs-card-modal",
      children: R
    }
  ) });
}
const { useEffect: fs, useMemo: ps, useRef: hs, useState: Te } = window.React, { Button: gr, ModalOverlay: yr } = orca.components;
function gs(e) {
  const t = e.getMonth() + 1, r = e.getDate();
  return `${t}-${r}`;
}
function ys({
  cards: e,
  onClose: t,
  onJumpToCard: r,
  inSidePanel: n = !1,
  panelId: o,
  pluginName: s = "orca-srs"
}) {
  const i = hs(null), [c, d] = Te(e), [u, f] = Te(0), [p, g] = Te(0), [v, y] = Te(!1), [_, I] = Te(null), [D, C] = Te(!0);
  fs(() => {
    const R = i.current;
    if (!R) return;
    const w = R.closest(".orca-block-editor");
    if (!w) return;
    const S = w.querySelector(".orca-block-editor-none-editable"), $ = w.querySelector(".orca-block-editor-go-btns"), L = w.querySelector(".orca-block-editor-sidetools"), W = w.querySelector(".orca-repr-main-none-editable"), X = w.querySelector(".orca-breadcrumb");
    return D ? (w.setAttribute("maximize", "1"), S && (S.style.display = "none"), $ && ($.style.display = "none"), L && (L.style.display = "none"), W && (W.style.display = "none"), X && (X.style.display = "none"), w.querySelectorAll(".orca-block-handle, .orca-repr-handle").forEach((A) => {
      A.style.display = "none";
    }), w.querySelectorAll('.orca-block-bullet, [data-role="bullet"]').forEach((A) => {
      A.style.display = "none";
    }), w.querySelectorAll(".orca-block-drag-handle").forEach((A) => {
      A.style.display = "none";
    }), w.querySelectorAll('.orca-repr-collapse, [class*="collapse"]').forEach((A) => {
      A.style.display = "none";
    })) : (w.removeAttribute("maximize"), S && (S.style.display = ""), $ && ($.style.display = ""), L && (L.style.display = ""), W && (W.style.display = ""), X && (X.style.display = "")), () => {
      w.removeAttribute("maximize"), S && (S.style.display = ""), $ && ($.style.display = ""), L && (L.style.display = ""), W && (W.style.display = ""), X && (X.style.display = "");
    };
  }, [D]);
  const k = c.length, x = c[u], E = u >= k, F = ps(() => {
    const R = Date.now();
    let w = 0, S = 0;
    for (const $ of c)
      $.isNew ? S += 1 : $.srs.due.getTime() <= R && (w += 1);
    return { due: w, fresh: S };
  }, [c]), N = async (R) => {
    if (!x) return;
    y(!0);
    let w;
    x.clozeNumber ? w = await io(x.id, x.clozeNumber, R) : x.directionType ? w = await co(x.id, x.directionType, R) : w = await Ir(x.id, R);
    const S = { ...x, srs: w.state, isNew: !1 }, $ = [...c];
    $[u] = S, d($);
    let L = "";
    x.clozeNumber ? L = ` [c${x.clozeNumber}]` : x.directionType && (L = ` [${x.directionType === "forward" ? "→" : "←"}]`), I(
      `评分 ${R.toUpperCase()}${L} -> 下次 ${gs(w.state.due)}，间隔 ${w.state.interval} 天`
    ), qo(x.id, R), g((W) => W + 1), y(!1), setTimeout(() => f((W) => W + 1), 250);
  }, Q = async () => {
    if (!(!x || v)) {
      y(!0);
      try {
        await yo(
          x.id,
          x.clozeNumber,
          x.directionType
        );
        let R = "";
        x.clozeNumber ? R = ` [c${x.clozeNumber}]` : x.directionType && (R = ` [${x.directionType === "forward" ? "→" : "←"}]`), I(`已埋藏${R}，明天再复习`), orca.notify("info", "卡片已埋藏，明天再复习", { title: "SRS 复习" }), Go(x.id);
      } catch (R) {
        console.error("[SRS Review Session] 埋藏卡片失败:", R), orca.notify("error", `埋藏失败: ${R}`, { title: "SRS 复习" });
      }
      y(!1), setTimeout(() => f((R) => R + 1), 250);
    }
  }, z = async () => {
    if (!(!x || v)) {
      y(!0);
      try {
        await po(x.id);
        let R = "";
        x.clozeNumber ? R = ` [c${x.clozeNumber}]` : x.directionType && (R = ` [${x.directionType === "forward" ? "→" : "←"}]`), I(`已暂停${R}`), orca.notify("info", "卡片已暂停，可在卡片浏览器中取消暂停", { title: "SRS 复习" }), Vo(x.id);
      } catch (R) {
        console.error("[SRS Review Session] 暂停卡片失败:", R), orca.notify("error", `暂停失败: ${R}`, { title: "SRS 复习" });
      }
      y(!1), setTimeout(() => f((R) => R + 1), 250);
    }
  }, Y = (R) => {
    if (r) {
      r(R);
      return;
    }
    console.log(`[SRS Review Session] 跳转到卡片 #${R}`), orca.nav.goTo("block", { blockId: R }), orca.notify(
      "info",
      "已跳转到卡片，复习界面仍然保留",
      { title: "SRS 复习" }
    );
  }, J = () => {
    console.log(`[SRS Review Session] 本次复习结束，共复习 ${p} 张卡片`), orca.notify(
      "success",
      `本次复习完成！共复习了 ${p} 张卡片`,
      { title: "SRS 复习会话" }
    ), t && t();
  };
  if (k === 0) {
    const R = /* @__PURE__ */ a.jsxs("div", { style: {
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "32px",
      maxWidth: "480px",
      width: "100%",
      textAlign: "center",
      boxShadow: "0 4px 20px rgba(0,0,0,0.08)"
    }, children: [
      /* @__PURE__ */ a.jsx("h3", { style: { marginBottom: "12px" }, children: "今天没有到期或新卡" }),
      /* @__PURE__ */ a.jsx("div", { style: { color: "var(--orca-color-text-2)", marginBottom: "20px" }, children: "请先创建或等待卡片到期，然后再次开始复习" }),
      t && /* @__PURE__ */ a.jsx(gr, { variant: "solid", onClick: t, children: "关闭" })
    ] });
    return n ? /* @__PURE__ */ a.jsx("div", { style: {
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px"
    }, children: R }) : /* @__PURE__ */ a.jsx(yr, { visible: !0, canClose: !0, onClose: t, children: R });
  }
  if (E) {
    const R = /* @__PURE__ */ a.jsxs("div", { className: "srs-session-complete-container", style: {
      backgroundColor: "var(--orca-color-bg-1)",
      borderRadius: "12px",
      padding: "48px",
      maxWidth: "500px",
      width: "100%",
      boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
      textAlign: "center"
    }, children: [
      /* @__PURE__ */ a.jsx("div", { style: {
        fontSize: "64px",
        marginBottom: "24px"
      }, children: "?" }),
      /* @__PURE__ */ a.jsx("h2", { style: {
        fontSize: "24px",
        fontWeight: "600",
        color: "var(--orca-color-text-1)",
        marginBottom: "16px"
      }, children: "本次复习结束！" }),
      /* @__PURE__ */ a.jsxs("div", { style: {
        fontSize: "16px",
        color: "var(--orca-color-text-2)",
        marginBottom: "32px",
        lineHeight: "1.6"
      }, children: [
        /* @__PURE__ */ a.jsxs("p", { children: [
          "共复习了 ",
          /* @__PURE__ */ a.jsx("strong", { style: { color: "var(--orca-color-primary-5)" }, children: p }),
          " 张卡片"
        ] }),
        /* @__PURE__ */ a.jsx("p", { style: { marginTop: "8px" }, children: "坚持复习，持续进步！" })
      ] }),
      /* @__PURE__ */ a.jsx(
        gr,
        {
          variant: "solid",
          onClick: J,
          style: {
            padding: "12px 32px",
            fontSize: "16px"
          },
          children: "完成"
        }
      )
    ] });
    return n ? /* @__PURE__ */ a.jsx("div", { style: {
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px"
    }, children: R }) : /* @__PURE__ */ a.jsx(
      yr,
      {
        visible: !0,
        canClose: !0,
        onClose: t,
        className: "srs-session-complete-modal",
        children: R
      }
    );
  }
  return n ? /* @__PURE__ */ a.jsxs(
    "div",
    {
      ref: i,
      className: `srs-review-session-panel ${D ? "orca-maximized" : ""}`,
      style: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "var(--orca-color-bg-0)"
      },
      children: [
        /* @__PURE__ */ a.jsx(
          "div",
          {
            className: "srs-review-progress-bar",
            contentEditable: !1,
            style: {
              height: "4px",
              backgroundColor: "var(--orca-color-bg-2)"
            },
            children: /* @__PURE__ */ a.jsx("div", { style: {
              height: "100%",
              width: `${u / k * 100}%`,
              backgroundColor: "var(--orca-color-primary-5)",
              transition: "width 0.3s ease"
            } })
          }
        ),
        /* @__PURE__ */ a.jsxs(
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
              /* @__PURE__ */ a.jsxs("div", { contentEditable: !1, style: { userSelect: "none" }, children: [
                /* @__PURE__ */ a.jsxs("div", { style: {
                  fontSize: "14px",
                  color: "var(--orca-color-text-2)",
                  fontWeight: 500,
                  userSelect: "none",
                  pointerEvents: "none"
                }, children: [
                  "卡片 ",
                  u + 1,
                  " / ",
                  k,
                  "（到期 ",
                  F.due,
                  " | 新卡 ",
                  F.fresh,
                  "）"
                ] }),
                _ && /* @__PURE__ */ a.jsx("div", { style: {
                  marginTop: "6px",
                  fontSize: "12px",
                  color: "var(--orca-color-text-2)",
                  opacity: 0.8
                }, children: _ })
              ] }),
              !1
            ]
          }
        ),
        /* @__PURE__ */ a.jsx("div", { style: { flex: 1, overflow: "auto", padding: "0" }, children: /* @__PURE__ */ a.jsx(
          hr,
          {
            front: x.front,
            back: x.back,
            onGrade: N,
            onBury: Q,
            onSuspend: z,
            onClose: t,
            srsInfo: x.srs,
            isGrading: v,
            blockId: x.id,
            onJumpToCard: Y,
            inSidePanel: !0,
            panelId: o,
            pluginName: s,
            clozeNumber: x.clozeNumber,
            directionType: x.directionType
          }
        ) })
      ]
    }
  ) : /* @__PURE__ */ a.jsxs("div", { className: "srs-review-session", children: [
    /* @__PURE__ */ a.jsx("div", { contentEditable: !1, style: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      height: "4px",
      backgroundColor: "var(--orca-color-bg-2)",
      zIndex: 1e4
    }, children: /* @__PURE__ */ a.jsx("div", { style: {
      height: "100%",
      width: `${u / k * 100}%`,
      backgroundColor: "var(--orca-color-primary-5)",
      transition: "width 0.3s ease"
    } }) }),
    /* @__PURE__ */ a.jsxs("div", { contentEditable: !1, style: {
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
      zIndex: 10001
    }, children: [
      "卡片 ",
      u + 1,
      " / ",
      k,
      "（到期 ",
      F.due,
      " | 新卡 ",
      F.fresh,
      "）"
    ] }),
    _ && /* @__PURE__ */ a.jsx("div", { contentEditable: !1, style: {
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
    }, children: _ }),
    /* @__PURE__ */ a.jsx(
      hr,
      {
        front: x.front,
        back: x.back,
        onGrade: N,
        onBury: Q,
        onSuspend: z,
        onClose: t,
        srsInfo: x.srs,
        isGrading: v,
        blockId: x.id,
        onJumpToCard: Y,
        panelId: o,
        pluginName: s,
        clozeNumber: x.clozeNumber,
        directionType: x.directionType
      }
    )
  ] });
}
function qr(e, t) {
  var r;
  if (!e) return null;
  if (e.type === "hsplit" && ((r = e.children) == null ? void 0 : r.length) === 2) {
    const [n, o] = e.children;
    if (Gr(o, t))
      return typeof (n == null ? void 0 : n.id) == "string" ? n.id : Vr(n);
  }
  if (e.children)
    for (const n of e.children) {
      const o = qr(n, t);
      if (o) return o;
    }
  return null;
}
function Gr(e, t) {
  return e ? e.id === t ? !0 : e.children ? e.children.some((r) => Gr(r, t)) : !1 : !1;
}
function Vr(e) {
  if (!e) return null;
  if (typeof e.id == "string") return e.id;
  if (e.children)
    for (const t of e.children) {
      const r = Vr(t);
      if (r) return r;
    }
  return null;
}
function ms(e, t) {
  setTimeout(() => {
    try {
      const r = window.innerWidth || 1200, n = Math.floor(r * 0.5), o = Math.max(600, Math.min(1200, n)), s = Math.max(600, r - o);
      orca.nav.changeSizes(e, [o, s]);
    } catch (r) {
      console.warn(`[${t}] 调整面板宽度失败:`, r);
    }
  }, 80);
}
const { useEffect: xs, useState: De } = window.React, { BlockShell: vs, Button: ws } = orca.components;
function bs(e) {
  const {
    panelId: t,
    blockId: r,
    rndId: n,
    blockLevel: o,
    indentLevel: s,
    mirrorId: i,
    initiallyCollapsed: c,
    renderingMode: d
  } = e, [u, f] = De([]), [p, g] = De(!0), [v, y] = De(null), [_, I] = De(t), [D, C] = De("orca-srs");
  xs(() => {
    k();
  }, []);
  const k = async () => {
    g(!0), y(null);
    try {
      const {
        collectReviewCards: z,
        buildReviewQueue: Y,
        getReviewHostPanelId: J,
        getPluginName: R,
        getReviewDeckFilter: w
      } = await Promise.resolve().then(() => At), S = typeof R == "function" ? R() : "orca-srs", $ = await z(S), L = typeof w == "function" ? w() : null, W = L ? $.filter((ae) => ae.deck === L) : $, X = Y(W);
      f(X);
      const re = typeof J == "function" ? J() : null;
      I(re ?? t), C(S);
    } catch (z) {
      console.error("[SRS Review Session Renderer] 加载复习队列失败:", z), y(z instanceof Error ? z.message : `${z}`), orca.notify("error", "加载复习队列失败", { title: "SRS 复习" });
    } finally {
      g(!1);
    }
  }, x = () => {
    orca.nav.close(t);
  }, [E, F] = De(null), N = async (z) => {
    try {
      const { getPluginName: Y, getReviewHostPanelId: J } = await Promise.resolve().then(() => At), R = typeof Y == "function" ? Y() : "orca-srs";
      if (E) {
        orca.nav.goTo("block", { blockId: z }, E), orca.nav.switchFocusTo(E);
        return;
      }
      const w = typeof J == "function" ? J() : null;
      if (w) {
        F(w), orca.nav.goTo("block", { blockId: z }, w), orca.nav.switchFocusTo(w);
        return;
      }
      let S = qr(orca.state.panels, t);
      S ? (F(S), orca.nav.goTo("block", { blockId: z }, S), orca.nav.switchFocusTo(S)) : (S = orca.nav.addTo(t, "left", {
        view: "block",
        viewArgs: { blockId: z },
        viewState: {}
      }), S ? (F(S), ms(S, R), orca.nav.switchFocusTo(S)) : (orca.nav.goTo("block", { blockId: z }), orca.notify("warn", "无法创建主面板，已在当前面板打开卡片", { title: "SRS 复习" })));
    } catch (Y) {
      console.error("[SRS Review Session Renderer] 跳转到卡片失败:", Y), orca.nav.goTo("block", { blockId: z });
    }
  }, Q = () => p ? /* @__PURE__ */ a.jsx("div", { style: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    fontSize: "14px",
    color: "var(--orca-color-text-2)"
  }, children: "加载复习队列中..." }) : v ? /* @__PURE__ */ a.jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "24px",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center"
  }, children: [
    /* @__PURE__ */ a.jsxs("div", { style: { color: "var(--orca-color-danger-5)" }, children: [
      "加载失败：",
      v
    ] }),
    /* @__PURE__ */ a.jsx(ws, { variant: "solid", onClick: k, children: "重试" })
  ] }) : /* @__PURE__ */ a.jsx($e, { componentName: "复习会话", errorTitle: "复习会话加载出错", children: /* @__PURE__ */ a.jsx(
    ys,
    {
      cards: u,
      onClose: x,
      onJumpToCard: N,
      inSidePanel: !0,
      panelId: _,
      pluginName: D
    }
  ) });
  return /* @__PURE__ */ a.jsx(
    vs,
    {
      panelId: t,
      blockId: r,
      rndId: n,
      mirrorId: i,
      blockLevel: o,
      indentLevel: s,
      initiallyCollapsed: c,
      renderingMode: d,
      reprClassName: "srs-repr-review-session",
      contentClassName: "srs-repr-review-session-content",
      contentJsx: Q(),
      childrenJsx: null
    }
  );
}
const { useRef: Ss } = window.React;
function Cs({
  blockId: e,
  data: t,
  index: r
}) {
  const n = Ss(null), o = t.v || "", s = t.clozeNumber || 1;
  return /* @__PURE__ */ a.jsx(
    "span",
    {
      ref: n,
      className: "orca-inline srs-cloze-inline",
      "data-cloze-number": s,
      style: {
        color: "#999",
        // 浅灰色
        borderBottom: "2px solid #4a90e2",
        // 蓝色下划线
        paddingBottom: "1px",
        cursor: "text"
      },
      title: `Cloze ${s}`,
      children: o
    }
  );
}
const { useRef: _s, useState: mr, useCallback: ks } = window.React, xr = {
  forward: "ti ti-arrow-right",
  backward: "ti ti-arrow-left",
  bidirectional: "ti ti-arrows-exchange"
}, vr = {
  forward: "var(--orca-color-primary-5)",
  backward: "var(--orca-color-warning-5)",
  bidirectional: "var(--orca-color-success-5)"
}, Rt = {
  forward: "正向",
  backward: "反向",
  bidirectional: "双向"
};
function Rs({
  blockId: e,
  data: t,
  index: r
}) {
  const n = _s(null), o = t.direction || "forward", [s, i] = mr(o), [c, d] = mr(!1), u = (t.t || "").replace(".direction", ""), f = xr[s] || xr.forward, p = vr[s] || vr.forward, g = Rt[s] || Rt.forward, v = ks(
    async (y) => {
      if (y.preventDefault(), y.stopPropagation(), !c) {
        d(!0);
        try {
          const _ = bo(s);
          i(_), await So(Number(e), _, u);
          const I = Rt[_] || "未知";
          orca.notify("info", `已切换为${I}卡片`);
        } catch (_) {
          console.error("切换方向失败:", _), i(o);
        } finally {
          d(!1);
        }
      }
    },
    [e, s, o, c, u]
  );
  return /* @__PURE__ */ a.jsx(
    "span",
    {
      ref: n,
      className: "orca-inline srs-direction-inline",
      onClick: v,
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
        color: p,
        transition: "all 0.2s ease",
        opacity: c ? 0.5 : 1
      },
      title: `方向卡 (${g}) - 点击切换`,
      children: /* @__PURE__ */ a.jsx("i", { className: f })
    }
  );
}
const { useState: $s } = window.React, { Button: js } = orca.components;
function Es({ deck: e, onViewDeck: t, onReviewDeck: r }) {
  const [n, o] = $s(!1), s = e.overdueCount + e.todayCount;
  return /* @__PURE__ */ a.jsxs(
    "div",
    {
      onClick: () => t(e.name),
      onMouseEnter: () => o(!0),
      onMouseLeave: () => o(!1),
      style: {
        borderRadius: "12px",
        padding: "16px 20px",
        backgroundColor: "var(--orca-color-bg-1)",
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        transition: "background-color 0.2s ease",
        ...n ? { backgroundColor: "var(--orca-color-bg-2)" } : {}
      },
      children: [
        /* @__PURE__ */ a.jsxs("div", { children: [
          /* @__PURE__ */ a.jsx("div", { style: { fontSize: "15px", fontWeight: 500, color: "var(--orca-color-text-1)" }, children: e.name }),
          /* @__PURE__ */ a.jsxs("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)", marginTop: "4px" }, children: [
            s > 0 ? /* @__PURE__ */ a.jsxs("span", { style: { color: "var(--orca-color-warning-6)" }, children: [
              s,
              " 待复习"
            ] }) : /* @__PURE__ */ a.jsx("span", { children: "已完成" }),
            e.newCount > 0 && /* @__PURE__ */ a.jsxs("span", { children: [
              " · ",
              e.newCount,
              " 新卡"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ a.jsx("div", { style: {
          opacity: n ? 1 : 0,
          transition: "opacity 0.2s ease",
          pointerEvents: n ? "auto" : "none"
        }, children: /* @__PURE__ */ a.jsx(
          js,
          {
            variant: "solid",
            onClick: (i) => {
              i.stopPropagation(), r(e.name);
            },
            style: {
              padding: "8px 16px",
              fontSize: "13px",
              borderRadius: "16px"
            },
            children: "复习"
          }
        ) })
      ]
    }
  );
}
const { useState: de, useEffect: Ze, useMemo: Ne, useCallback: Ie, useRef: Ts } = window.React, { Button: ve } = orca.components, $t = 10;
function Ds({ panelId: e, blockId: t }) {
  const r = Ts(null), [n, o] = de("deck-list"), [s, i] = de(null), [c, d] = de([]), [u, f] = de(null), [p, g] = de(null), [v, y] = de(!1), [_, I] = de(!1), [D, C] = de(null), [k, x] = de(() => {
    try {
      return zt();
    } catch {
      return "orca-srs";
    }
  });
  Ze(() => {
    const w = r.current;
    if (!w) return;
    const S = w.closest(".orca-block-editor");
    if (!S) return;
    S.setAttribute("maximize", "1");
    const $ = S.querySelector(".orca-block-editor-none-editable"), L = S.querySelector(".orca-block-editor-go-btns"), W = S.querySelector(".orca-block-editor-sidetools"), X = S.querySelector(".orca-repr-main-none-editable"), re = S.querySelector(".orca-breadcrumb");
    $ && ($.style.display = "none"), L && (L.style.display = "none"), W && (W.style.display = "none"), X && (X.style.display = "none"), re && (re.style.display = "none");
    const ae = "srs-flashcard-home-styles";
    if (!document.getElementById(ae)) {
      const ge = document.createElement("style");
      ge.id = ae, ge.textContent = `
        /* 隐藏 Orca 的非可编辑遮罩层，避免阻止按钮交互 */
        .orca-block[data-type="srs.flashcard-home"] .orca-repr-main-none-editable {
          display: none !important;
          pointer-events: none !important;
        }
        /* 确保 FlashcardHome 内容区域可以接收点击事件 */
        .srs-repr-flashcard-home-content {
          pointer-events: auto !important;
        }
        .orca-block-editor[maximize="1"] .orca-block-editor-main,
        .orca-block-editor[maximize="1"] .orca-block-editor-blocks,
        .orca-block-editor[maximize="1"] .orca-block[data-type="srs.flashcard-home"] {
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          flex: 1 !important;
        }
        .orca-block-editor[maximize="1"] .srs-repr-flashcard-home,
        .orca-block-editor[maximize="1"] .orca-repr-main,
        .orca-block-editor[maximize="1"] .srs-flashcard-home-content {
          height: 100% !important;
          display: flex !important;
          flex-direction: column !important;
          flex: 1 !important;
        }
      `, document.head.appendChild(ge);
    }
    return () => {
      S.removeAttribute("maximize"), $ && ($.style.display = ""), L && (L.style.display = ""), W && (W.style.display = ""), X && (X.style.display = ""), re && (re.style.display = "");
    };
  }, []);
  const E = Ie(async (w = !1) => {
    w ? y(!0) : I(!0), C(null);
    try {
      const S = zt();
      x(S);
      const $ = await Hr(S), L = Cr($);
      d($), f(L), g(Ps($));
    } catch (S) {
      console.error("[Flashcard Home] 数据加载失败:", S), C(S instanceof Error ? S.message : `${S}`), orca.notify("error", "Flashcard Home 数据加载失败，请稍后重试");
    } finally {
      y(!1), I(!1);
    }
  }, []);
  Ze(() => {
    E(!0);
  }, [E]), Ze(() => {
    const w = () => void E(!1), S = () => void E(!1), $ = () => void E(!1);
    return orca.broadcasts.registerHandler(xe.CARD_GRADED, w), orca.broadcasts.registerHandler(xe.CARD_BURIED, S), orca.broadcasts.registerHandler(xe.CARD_SUSPENDED, $), () => {
      orca.broadcasts.unregisterHandler(xe.CARD_GRADED, w), orca.broadcasts.unregisterHandler(xe.CARD_BURIED, S), orca.broadcasts.unregisterHandler(xe.CARD_SUSPENDED, $);
    };
  }, [E]);
  const F = Ie(() => {
    E(!1);
  }, [E]), N = Ie(() => {
    It(void 0, !0);
  }, []), Q = Ie((w) => {
    It(w, !0);
  }, []), z = Ie((w) => {
    i(w), o("card-list");
  }, []), Y = Ie(() => {
    i(null), o("deck-list");
  }, []), J = Ne(() => !s || !u ? null : u.decks.find((w) => w.name === s) ?? null, [u, s]), R = Ne(() => s ? c.filter((w) => w.deck === s) : [], [c, s]);
  return /* @__PURE__ */ a.jsx(
    "div",
    {
      ref: r,
      "data-panel-id": e,
      "data-block-id": String(t),
      style: {
        height: "100%",
        overflow: "auto",
        backgroundColor: "var(--orca-color-bg-0)"
      },
      children: n === "deck-list" ? /* @__PURE__ */ a.jsx(
        Is,
        {
          pluginName: k,
          deckStats: u,
          todayStats: p,
          isLoading: v,
          isRefreshing: _,
          errorMessage: D,
          onRefresh: F,
          onReviewAll: N,
          onReviewDeck: Q,
          onViewDeck: z
        }
      ) : /* @__PURE__ */ a.jsx(
        zs,
        {
          deckName: s,
          deckInfo: J,
          cards: R,
          hostPanelId: e,
          onBack: Y,
          onReviewDeck: Q,
          onRefresh: F,
          isLoading: v && R.length === 0,
          isRefreshing: _
        }
      )
    }
  );
}
function Is({
  pluginName: e,
  deckStats: t,
  todayStats: r,
  isLoading: n,
  isRefreshing: o,
  errorMessage: s,
  onRefresh: i,
  onReviewAll: c,
  onReviewDeck: d,
  onViewDeck: u
}) {
  if (n && !t)
    return /* @__PURE__ */ a.jsx("div", { style: rt, children: "正在加载 Flashcard Home..." });
  if (s && !t)
    return /* @__PURE__ */ a.jsxs("div", { style: rt, children: [
      /* @__PURE__ */ a.jsxs("div", { style: { marginBottom: "12px", color: "var(--orca-color-danger-6)" }, children: [
        "加载失败：",
        s
      ] }),
      /* @__PURE__ */ a.jsx(ve, { variant: "solid", onClick: i, children: "重试" })
    ] });
  const f = () => {
    o || i();
  };
  return /* @__PURE__ */ a.jsxs("div", { style: { padding: "32px", maxWidth: "720px", margin: "0 auto" }, children: [
    /* @__PURE__ */ a.jsxs("header", { style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "32px"
    }, children: [
      /* @__PURE__ */ a.jsx("div", { style: { fontSize: "24px", fontWeight: 500, color: "var(--orca-color-text-1)" }, children: "闪卡" }),
      /* @__PURE__ */ a.jsx(
        ve,
        {
          variant: "plain",
          onClick: f,
          style: {
            padding: "6px",
            opacity: o ? 0.5 : 1,
            pointerEvents: o ? "none" : "auto"
          },
          title: "刷新",
          children: /* @__PURE__ */ a.jsx("i", { className: `ti ${o ? "ti-loader-3" : "ti-refresh"}`, style: { fontSize: "18px" } })
        }
      )
    ] }),
    s && /* @__PURE__ */ a.jsx("div", { style: {
      backgroundColor: "var(--orca-color-danger-1)",
      border: "1px solid var(--orca-color-danger-3)",
      padding: "12px 16px",
      borderRadius: "8px",
      color: "var(--orca-color-danger-7)",
      marginBottom: "16px"
    }, children: s }),
    /* @__PURE__ */ a.jsxs("div", { style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "16px",
      marginBottom: "40px"
    }, children: [
      /* @__PURE__ */ a.jsxs("div", { style: {
        fontSize: "14px",
        color: "var(--orca-color-text-2)",
        display: "flex",
        gap: "16px"
      }, children: [
        /* @__PURE__ */ a.jsxs("span", { children: [
          /* @__PURE__ */ a.jsx("strong", { style: { color: "var(--orca-color-warning-6)" }, children: (r == null ? void 0 : r.pendingCount) ?? 0 }),
          " 待复习"
        ] }),
        /* @__PURE__ */ a.jsxs("span", { children: [
          /* @__PURE__ */ a.jsx("strong", { style: { color: "var(--orca-color-primary-6)" }, children: (r == null ? void 0 : r.newCount) ?? 0 }),
          " 新卡"
        ] }),
        /* @__PURE__ */ a.jsxs("span", { children: [
          /* @__PURE__ */ a.jsx("strong", { children: (t == null ? void 0 : t.totalCards) ?? 0 }),
          " 总计"
        ] })
      ] }),
      /* @__PURE__ */ a.jsxs(
        ve,
        {
          variant: "solid",
          onClick: () => {
            ((r == null ? void 0 : r.pendingCount) ?? 0) !== 0 && c();
          },
          style: {
            padding: "14px 48px",
            fontSize: "16px",
            borderRadius: "24px",
            fontWeight: 500,
            opacity: ((r == null ? void 0 : r.pendingCount) ?? 0) === 0 ? 0.5 : 1,
            pointerEvents: ((r == null ? void 0 : r.pendingCount) ?? 0) === 0 ? "none" : "auto"
          },
          children: [
            "开始复习 (",
            (r == null ? void 0 : r.pendingCount) ?? 0,
            ")"
          ]
        }
      )
    ] }),
    /* @__PURE__ */ a.jsxs("section", { children: [
      /* @__PURE__ */ a.jsx("div", { style: { fontSize: "13px", fontWeight: 500, color: "var(--orca-color-text-3)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }, children: "Decks" }),
      t && t.decks.length > 0 ? /* @__PURE__ */ a.jsx("div", { style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: "16px"
      }, children: t.decks.map((p) => /* @__PURE__ */ a.jsx(
        Es,
        {
          deck: p,
          onReviewDeck: d,
          onViewDeck: u
        },
        p.name
      )) }) : /* @__PURE__ */ a.jsxs("div", { style: Jr, children: [
        /* @__PURE__ */ a.jsx("div", { style: { fontSize: "18px", marginBottom: "8px" }, children: "还没有找到卡片" }),
        /* @__PURE__ */ a.jsx("div", { style: { fontSize: "13px", color: "var(--orca-color-text-3)" }, children: "使用 #card 或 #card/deck 名称标签来创建你的第一张卡片" })
      ] })
    ] })
  ] });
}
function zs({
  deckName: e,
  deckInfo: t,
  cards: r,
  hostPanelId: n,
  onBack: o,
  onReviewDeck: s,
  onRefresh: i,
  isLoading: c,
  isRefreshing: d
}) {
  const [u, f] = de("all"), [p, g] = de(1), v = ["all", "overdue", "today", "future", "new"];
  Ze(() => {
    g(1);
  }, [u]);
  const y = Ne(() => u === "all" ? r : r.filter((k) => Tt(k) === u), [r, u]), _ = Ne(() => {
    const k = (p - 1) * $t, x = k + $t;
    return y.slice(k, x);
  }, [y, p]), I = Math.ceil(y.length / $t), D = Ne(() => {
    const k = {
      all: r.length,
      overdue: 0,
      today: 0,
      future: 0,
      new: 0
    };
    for (const x of r) {
      const E = Tt(x);
      k[E]++;
    }
    return k;
  }, [r]);
  if (!e)
    return /* @__PURE__ */ a.jsx("div", { style: rt, children: "请选择一个 Deck 查看卡片列表" });
  if (c)
    return /* @__PURE__ */ a.jsxs("div", { style: rt, children: [
      "正在加载 ",
      e,
      " 的卡片..."
    ] });
  const C = () => {
    d || i();
  };
  return /* @__PURE__ */ a.jsxs("div", { style: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    backgroundColor: "var(--orca-color-bg-0)"
  }, children: [
    /* @__PURE__ */ a.jsxs("div", { style: {
      padding: "16px 24px",
      borderBottom: "1px solid var(--orca-color-border-1)",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      flexWrap: "wrap"
    }, children: [
      /* @__PURE__ */ a.jsx(ve, { variant: "plain", onClick: o, children: "← 返回" }),
      /* @__PURE__ */ a.jsx("div", { style: { fontSize: "18px", fontWeight: 600 }, children: e }),
      /* @__PURE__ */ a.jsx("div", { style: { flex: 1 } }),
      /* @__PURE__ */ a.jsx(
        ve,
        {
          variant: "plain",
          onClick: C,
          style: {
            opacity: d ? 0.5 : 1,
            pointerEvents: d ? "none" : "auto"
          },
          children: d ? "刷新中..." : "刷新"
        }
      ),
      /* @__PURE__ */ a.jsx(ve, { variant: "solid", onClick: () => s(e), children: "复习此 Deck" })
    ] }),
    /* @__PURE__ */ a.jsxs("div", { style: {
      padding: "16px 24px",
      borderBottom: "1px solid var(--orca-color-border-1)",
      display: "flex",
      gap: "16px",
      flexWrap: "wrap"
    }, children: [
      /* @__PURE__ */ a.jsx(Xe, { label: "新卡", value: (t == null ? void 0 : t.newCount) ?? 0, color: "var(--orca-color-primary-6)" }),
      /* @__PURE__ */ a.jsx(Xe, { label: "今天", value: (t == null ? void 0 : t.todayCount) ?? 0, color: "var(--orca-color-warning-6)" }),
      /* @__PURE__ */ a.jsx(Xe, { label: "已到期", value: (t == null ? void 0 : t.overdueCount) ?? 0, color: "var(--orca-color-danger-6)" }),
      /* @__PURE__ */ a.jsx(Xe, { label: "总数", value: (t == null ? void 0 : t.totalCount) ?? r.length, color: "var(--orca-color-text-2)" })
    ] }),
    /* @__PURE__ */ a.jsx("div", { style: {
      padding: "12px 24px",
      borderBottom: "1px solid var(--orca-color-border-1)",
      display: "flex",
      gap: "8px",
      flexWrap: "wrap"
    }, children: v.map((k) => /* @__PURE__ */ a.jsxs(
      ve,
      {
        variant: u === k ? "solid" : "plain",
        onClick: () => f(k),
        style: { fontSize: "12px" },
        children: [
          Kr[k],
          " ",
          k !== "all" && `(${D[k]})`
        ]
      },
      k
    )) }),
    /* @__PURE__ */ a.jsx("div", { style: { flex: 1, overflow: "auto", padding: "16px 24px" }, children: y.length === 0 ? /* @__PURE__ */ a.jsx("div", { style: Jr, children: "没有符合条件的卡片" }) : /* @__PURE__ */ a.jsxs(a.Fragment, { children: [
      /* @__PURE__ */ a.jsx("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: _.map((k) => /* @__PURE__ */ a.jsx(Ms, { card: k, hostPanelId: n }, `${k.id}-${k.clozeNumber ?? "basic"}`)) }),
      /* @__PURE__ */ a.jsx(
        As,
        {
          currentPage: p,
          totalPages: I,
          totalItems: y.length,
          onPageChange: g
        }
      )
    ] }) })
  ] });
}
function As({ currentPage: e, totalPages: t, totalItems: r, onPageChange: n }) {
  return t <= 1 ? null : /* @__PURE__ */ a.jsxs("div", { style: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "12px",
    padding: "20px 0",
    marginTop: "16px",
    borderTop: "1px solid var(--orca-color-border-1)"
  }, children: [
    /* @__PURE__ */ a.jsx(
      ve,
      {
        variant: "plain",
        onClick: () => n(e - 1),
        style: {
          opacity: e === 1 ? 0.4 : 1,
          pointerEvents: e === 1 ? "none" : "auto"
        },
        children: "← 上一页"
      }
    ),
    /* @__PURE__ */ a.jsxs("span", { style: { color: "var(--orca-color-text-2)", fontSize: "13px" }, children: [
      "第 ",
      e,
      " / ",
      t,
      " 页（共 ",
      r,
      " 张）"
    ] }),
    /* @__PURE__ */ a.jsx(
      ve,
      {
        variant: "plain",
        onClick: () => n(e + 1),
        style: {
          opacity: e === t ? 0.4 : 1,
          pointerEvents: e === t ? "none" : "auto"
        },
        children: "下一页 →"
      }
    )
  ] });
}
function Xe({ label: e, value: t, color: r }) {
  return /* @__PURE__ */ a.jsxs("div", { style: {
    borderRadius: "10px",
    padding: "10px 14px",
    backgroundColor: "var(--orca-color-bg-1)",
    border: "1px solid var(--orca-color-border-1)",
    minWidth: "110px"
  }, children: [
    /* @__PURE__ */ a.jsx("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)" }, children: e }),
    /* @__PURE__ */ a.jsx("div", { style: { fontSize: "18px", fontWeight: 600, color: r }, children: t })
  ] });
}
function Yr(e, t) {
  const r = orca.state.panels;
  let n = null;
  for (const [o, s] of Object.entries(r))
    if (s.parentId === e && s.position === "right") {
      n = o;
      break;
    }
  if (!n) {
    orca.nav.addTo(e, "right", {
      view: "block",
      viewArgs: { blockId: t },
      viewState: {}
    });
    return;
  }
  orca.nav.goTo("block", { blockId: t }, n);
}
function Bs({ name: e, blockId: t, hostPanelId: r }) {
  const n = (o) => {
    o.stopPropagation(), Yr(r, t);
  };
  return /* @__PURE__ */ a.jsxs(
    "span",
    {
      onClick: n,
      style: {
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "10px",
        backgroundColor: "var(--orca-color-primary-1)",
        color: "var(--orca-color-primary-7)",
        fontSize: "11px",
        fontWeight: 500,
        cursor: "pointer",
        transition: "background-color 0.2s ease"
      },
      onMouseEnter: (o) => {
        o.currentTarget.style.backgroundColor = "var(--orca-color-primary-2)";
      },
      onMouseLeave: (o) => {
        o.currentTarget.style.backgroundColor = "var(--orca-color-primary-1)";
      },
      children: [
        "#",
        e
      ]
    }
  );
}
function Ms({ card: e, hostPanelId: t }) {
  const r = Tt(e), n = Fs(r), o = () => {
    Yr(t, e.id);
  };
  return /* @__PURE__ */ a.jsxs(
    "div",
    {
      onClick: o,
      style: {
        border: "1px solid var(--orca-color-border-1)",
        borderRadius: "10px",
        padding: "12px 14px",
        cursor: "pointer",
        backgroundColor: "var(--orca-color-bg-1)",
        transition: "background-color 0.2s ease, border-color 0.2s ease"
      },
      onMouseEnter: (s) => {
        s.currentTarget.style.backgroundColor = "var(--orca-color-bg-2)", s.currentTarget.style.borderColor = "var(--orca-color-primary-4)";
      },
      onMouseLeave: (s) => {
        s.currentTarget.style.backgroundColor = "var(--orca-color-bg-1)", s.currentTarget.style.borderColor = "var(--orca-color-border-1)";
      },
      children: [
        /* @__PURE__ */ a.jsxs("div", { style: { fontSize: "14px", fontWeight: 500, marginBottom: "6px" }, children: [
          e.front || "(无题目)",
          " ",
          e.clozeNumber ? /* @__PURE__ */ a.jsxs("span", { style: { color: "var(--orca-color-text-3)", fontSize: "12px" }, children: [
            "#c",
            e.clozeNumber
          ] }) : null
        ] }),
        /* @__PURE__ */ a.jsxs("div", { style: { fontSize: "12px", color: "var(--orca-color-text-3)", display: "flex", flexWrap: "wrap", gap: "8px" }, children: [
          /* @__PURE__ */ a.jsxs("span", { children: [
            "上次复习：",
            wr(e.srs.lastReviewed)
          ] }),
          /* @__PURE__ */ a.jsxs("span", { style: { color: n }, children: [
            "到期：",
            wr(e.srs.due)
          ] }),
          /* @__PURE__ */ a.jsxs("span", { children: [
            "复习 ",
            e.srs.reps,
            " 次"
          ] }),
          /* @__PURE__ */ a.jsxs("span", { children: [
            "状态：",
            Kr[r]
          ] })
        ] }),
        e.tags && e.tags.length > 0 && /* @__PURE__ */ a.jsx("div", { style: { marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "6px" }, children: e.tags.map((s) => /* @__PURE__ */ a.jsx(Bs, { name: s.name, blockId: s.blockId, hostPanelId: t }, s.blockId)) })
      ]
    }
  );
}
const Kr = {
  all: "全部",
  overdue: "已到期",
  today: "今天",
  future: "未来",
  new: "新卡"
}, rt = {
  height: "100%",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  gap: "12px",
  color: "var(--orca-color-text-2)"
}, Jr = {
  border: "1px dashed var(--orca-color-border-1)",
  borderRadius: "12px",
  padding: "32px",
  textAlign: "center",
  color: "var(--orca-color-text-3)",
  backgroundColor: "var(--orca-color-bg-1)"
};
function wr(e) {
  if (!e) return "未复习";
  const t = e.getFullYear(), r = String(e.getMonth() + 1).padStart(2, "0"), n = String(e.getDate()).padStart(2, "0"), o = String(e.getHours()).padStart(2, "0"), s = String(e.getMinutes()).padStart(2, "0");
  return `${t}-${r}-${n} ${o}:${s}`;
}
function Xr() {
  const e = /* @__PURE__ */ new Date(), t = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 0, 0, 0), r = new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59);
  return { start: t, end: r };
}
function Tt(e) {
  const { start: t, end: r } = Xr();
  return e.isNew ? "new" : e.srs.due < t ? "overdue" : e.srs.due >= t && e.srs.due <= r ? "today" : "future";
}
function Fs(e) {
  switch (e) {
    case "overdue":
      return "var(--orca-color-danger-6)";
    case "today":
      return "var(--orca-color-warning-6)";
    case "new":
      return "var(--orca-color-primary-6)";
    default:
      return "var(--orca-color-text-2)";
  }
}
function Ps(e) {
  const { start: t, end: r } = Xr();
  let n = 0, o = 0, s = 0;
  for (const i of e) {
    if (i.isNew) {
      s++;
      continue;
    }
    i.srs.due <= r && n++, i.srs.due >= t && i.srs.due <= r && o++;
  }
  return {
    pendingCount: n,
    todayCount: o,
    newCount: s,
    totalCount: e.length
  };
}
const Qe = /* @__PURE__ */ new WeakMap(), et = "data-srs-hideable-display-managed";
function Os(e) {
  return e instanceof HTMLElement && e.classList.contains("orca-hideable");
}
function Dt(e, t) {
  const r = e.classList.contains("orca-hideable-hidden"), n = e.hasAttribute(et);
  if (r) {
    if (n) {
      e.style.display !== "none" && (e.style.display = "none");
      return;
    }
    if (e.style.display === "none") return;
    t.prevDisplayByEl.set(e, e.style.display), e.setAttribute(et, "1"), e.style.display = "none", t.modified.add(e);
    return;
  }
  if (!n) return;
  const o = t.prevDisplayByEl.get(e) ?? "";
  e.style.display = o, e.removeAttribute(et), t.modified.delete(e);
}
function Ls(e, t) {
  const r = Array.from(e.querySelectorAll(".orca-hideable"));
  for (const n of r) Dt(n, t);
}
function Hs(e) {
  if (!(e instanceof HTMLElement)) return [];
  const t = [];
  return e.classList.contains("orca-hideable") && t.push(e), t.push(...Array.from(e.querySelectorAll(".orca-hideable"))), t;
}
function Ws(e) {
  for (const t of e.modified) {
    const r = e.prevDisplayByEl.get(t) ?? "";
    t.style.display = r, t.removeAttribute(et);
  }
  e.modified.clear();
}
function Ns(e) {
  const t = e.closest(".orca-panel");
  if (!t) return () => {
  };
  let r = Qe.get(t);
  if (!r) {
    const n = {
      refCount: 0,
      observer: new MutationObserver((o) => {
        for (const s of o) {
          if (s.type === "attributes") {
            const i = s.target;
            Os(i) && Dt(i, n);
            continue;
          }
          if (s.type === "childList")
            for (const i of s.addedNodes) {
              const c = Hs(i);
              for (const d of c) Dt(d, n);
            }
        }
      }),
      prevDisplayByEl: /* @__PURE__ */ new WeakMap(),
      modified: /* @__PURE__ */ new Set()
    };
    n.observer.observe(t, {
      subtree: !0,
      childList: !0,
      attributes: !0,
      attributeFilter: ["class"]
    }), Qe.set(t, n), r = n;
  }
  return r.refCount += 1, Ls(t, r), () => {
    const n = Qe.get(t);
    n && (n.refCount -= 1, !(n.refCount > 0) && (n.observer.disconnect(), Ws(n), Qe.delete(t)));
  };
}
function Us(e) {
  const { panelId: t } = e, { useEffect: r, useRef: n } = window.React, o = n(null);
  return r(() => {
    const s = o.current;
    if (!s) return;
    const i = s.closest(".orca-hideable"), c = [];
    if (c.push(Ns(s)), i) {
      const d = i.style.flex, u = i.style.minWidth, f = i.style.width;
      i.style.flex = "1", i.style.minWidth = "0", i.style.width = "100%", c.push(() => {
        i.style.flex = d, i.style.minWidth = u, i.style.width = f;
      });
    }
    return () => {
      for (const d of c) d();
    };
  }, []), /* @__PURE__ */ a.jsx(
    "div",
    {
      ref: o,
      className: "srs-flashcard-home-panel",
      style: {
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        minWidth: 0
      },
      children: /* @__PURE__ */ a.jsx($e, { componentName: "闪卡主页", errorTitle: "闪卡主页加载出错", children: /* @__PURE__ */ a.jsx(Ds, { panelId: t, blockId: 0 }) })
    }
  );
}
function qs(e) {
  orca.renderers.registerBlock(
    "srs.card",
    !1,
    Ct,
    [],
    !1
  ), orca.renderers.registerBlock(
    "srs.cloze-card",
    !1,
    Ct,
    [],
    !1
  ), orca.renderers.registerBlock(
    "srs.direction-card",
    !1,
    Ct,
    [],
    !1
  ), orca.panels.registerPanel("srs.flashcard-home", Us), orca.renderers.registerBlock(
    "srs.review-session",
    !1,
    bs,
    [],
    !1
  ), orca.renderers.registerInline(
    `${e}.cloze`,
    !1,
    Cs
  ), orca.renderers.registerInline(
    `${e}.direction`,
    !1,
    Rs
  );
}
function Gs(e) {
  orca.renderers.unregisterBlock("srs.card"), orca.renderers.unregisterBlock("srs.cloze-card"), orca.renderers.unregisterBlock("srs.direction-card"), orca.panels.unregisterPanel("srs.flashcard-home"), orca.renderers.unregisterBlock("srs.review-session"), orca.renderers.unregisterInline(`${e}.cloze`), orca.renderers.unregisterInline(`${e}.direction`);
}
function Vs(e) {
  orca.converters.registerBlock(
    "plain",
    "srs.card",
    (t, r) => {
      const n = r.front || "（无题目）", o = r.back || "（无答案）";
      return `[SRS 卡片]
题目: ${n}
答案: ${o}`;
    }
  ), orca.converters.registerBlock(
    "plain",
    "srs.cloze-card",
    (t, r) => {
      const n = r.front || "（无题目）", o = r.back || "（无答案）";
      return `[SRS 填空卡片]
题目: ${n}
答案: ${o}`;
    }
  ), orca.converters.registerBlock(
    "plain",
    "srs.direction-card",
    (t, r) => {
      const n = r.front || "（左侧）", o = r.back || "（右侧）", s = r.direction || "forward";
      return `[SRS 方向卡片]
${n} ${s === "forward" ? "->" : s === "backward" ? "<-" : "<->"} ${o}`;
    }
  ), orca.converters.registerBlock(
    "plain",
    "srs.review-session",
    () => "[SRS 复习会话面板块]"
  ), orca.converters.registerBlock(
    "plain",
    "srs.flashcard-home",
    () => "[SRS Flashcard Home 面板块]"
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
function Ys(e) {
  orca.converters.unregisterBlock("plain", "srs.card"), orca.converters.unregisterBlock("plain", "srs.cloze-card"), orca.converters.unregisterBlock("plain", "srs.direction-card"), orca.converters.unregisterBlock("plain", "srs.review-session"), orca.converters.unregisterBlock("plain", "srs.flashcard-home"), orca.converters.unregisterInline("plain", `${e}.cloze`), orca.converters.unregisterInline("plain", `${e}.direction`);
}
let He = null;
const br = "reviewSessionBlockId";
async function Ks(e) {
  if (He && await Sr(He))
    return He;
  const t = await orca.plugins.getData(e, br);
  if (typeof t == "number" && await Sr(t))
    return He = t, t;
  const r = await Js(e);
  return await orca.plugins.setData(e, br, r), He = r, r;
}
async function Js(e) {
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
async function Sr(e) {
  var r;
  const t = (r = orca.state.blocks) == null ? void 0 : r[e];
  if (t) return t;
  try {
    return await orca.invokeBackend("get-block", e);
  } catch (n) {
    return console.warn("[srs] 无法从后端获取复习会话块:", n), null;
  }
}
let q, Qr = null, Zr = null;
async function Xs(e) {
  q = e, orca.state.locale;
  try {
    await orca.plugins.setSettingsSchema(q, {
      ...Wr,
      ...os
    }), console.log(`[${q}] 插件设置已注册（AI + 复习）`);
  } catch (t) {
    console.warn(`[${q}] 注册插件设置失败:`, t);
  }
  console.log(`[${q}] 插件已加载`), Bo(q, Zs), Oo(q), qs(q), Vs(q), console.log(`[${q}] 命令、UI 组件、渲染器、转换器已注册`);
}
async function Qs() {
  Mo(q), Lo(q), Gs(q), Ys(q), console.log(`[${q}] 插件已卸载`);
}
async function It(e, t = !1) {
  try {
    Qr = e ?? null;
    const r = orca.state.activePanel;
    if (!r) {
      orca.notify("warn", "当前没有可用的面板", { title: "SRS 复习" });
      return;
    }
    Zr = r;
    const n = await Ks(q);
    if (t) {
      orca.nav.goTo("block", { blockId: n }, r);
      const c = e ? `已打开 ${e} 复习会话` : "复习会话已打开";
      orca.notify("success", c, { title: "SRS 复习" }), console.log(`[${q}] 复习会话已在当前面板启动，面板ID: ${r}`);
      return;
    }
    const o = orca.state.panels;
    let s = null;
    for (const [c, d] of Object.entries(o))
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
    orca.notify("success", i, { title: "SRS 复习" }), console.log(`[${q}] 复习会话已启动，面板ID: ${s}`);
  } catch (r) {
    console.error(`[${q}] 启动复习失败:`, r), orca.notify("error", `启动复习失败: ${r}`, { title: "SRS 复习" });
  }
}
async function Zs() {
  try {
    const e = orca.state.activePanel;
    if (!e) {
      orca.notify("warn", "当前没有可用的面板", { title: "Flashcard Home" });
      return;
    }
    orca.nav.goTo("srs.flashcard-home", {}, e), orca.notify("success", "Flashcard Home 已打开", { title: "Flashcard Home" }), console.log(`[${q}] Flashcard Home opened in panel ${e}`);
  } catch (e) {
    console.error(`[${q}] 打开 Flashcard Home 失败:`, e), orca.notify("error", `无法打开 Flashcard Home: ${e}`, { title: "Flashcard Home" });
  }
}
function ea() {
  return Qr;
}
function ta() {
  return Zr;
}
function zt() {
  return q;
}
const At = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  buildReviewQueue: ko,
  calculateDeckStats: Cr,
  collectReviewCards: Hr,
  extractDeckName: Mt,
  getPluginName: zt,
  getReviewDeckFilter: ea,
  getReviewHostPanelId: ta,
  load: Xs,
  startReviewSession: It,
  unload: Qs
}, Symbol.toStringTag, { value: "Module" }));
export {
  ko as buildReviewQueue,
  Cr as calculateDeckStats,
  Hr as collectReviewCards,
  Mt as extractDeckName,
  zt as getPluginName,
  ea as getReviewDeckFilter,
  ta as getReviewHostPanelId,
  Xs as load,
  It as startReviewSession,
  Qs as unload
};
