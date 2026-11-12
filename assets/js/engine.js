/* ============================================================
 * 名笺 · 起名引擎
 * 纯本地算法：音律 / 寓意 / 五行 / 五格笔画 / 独特性 五维打分
 * 无任何外部依赖，可直接在浏览器、Node 中运行
 * ============================================================ */

(function (root) {
  const D = root.NAMEDATA;

  /* ---------- 拼音工具 ---------- */
  const TONE_MARKS = {
    "ā": "a", "á": "a", "ǎ": "a", "à": "a",
    "ē": "e", "é": "e", "ě": "e", "è": "e",
    "ī": "i", "í": "i", "ǐ": "i", "ì": "i",
    "ō": "o", "ó": "o", "ǒ": "o", "ò": "o",
    "ū": "u", "ú": "u", "ǔ": "u", "ù": "u",
    "ǖ": "v", "ǘ": "v", "ǚ": "v", "ǜ": "v",
    "ń": "n", "ň": "n", "ǹ": "n"
  };
  const TONE_NUM = {
    "ā": 1, "á": 2, "ǎ": 3, "à": 4,
    "ē": 1, "é": 2, "ě": 3, "è": 4,
    "ī": 1, "í": 2, "ǐ": 3, "ì": 4,
    "ō": 1, "ó": 2, "ǒ": 3, "ò": 4,
    "ū": 1, "ú": 2, "ǔ": 3, "ù": 4,
    "ǖ": 1, "ǘ": 2, "ǚ": 3, "ǜ": 4
  };

  function stripTone(py) {
    return py.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńňǹ]/g, function (c) {
      return TONE_MARKS[c] || c;
    });
  }

  // 取最后一个音节的声调（复姓时即末字声调）
  function toneOf(py) {
    let tone = 0;
    for (const c of py) {
      if (TONE_NUM[c]) tone = TONE_NUM[c];
    }
    return tone;
  }

  function normalizePinyin(py) {
    let b = stripTone(py).toLowerCase();
    if (b.startsWith("yu")) b = "v" + b.slice(2);
    else if (b.startsWith("y")) b = "i" + b.slice(1);
    else if (b.startsWith("w")) b = "u" + b.slice(1);
    return b;
  }

  const VOWELS = "aeiouv";

  function initialOf(py) {
    const b = normalizePinyin(py);
    if (/^(zh|ch|sh)/.test(b)) return b.slice(0, 2);
    if (/[bpmfdtnlgkhjqxzcsr]/.test(b[0])) return b[0];
    return "";
  }

  function finalOf(py) {
    const b = normalizePinyin(py);
    let end = -1;
    for (let i = b.length - 1; i >= 0; i--) {
      if (VOWELS.indexOf(b[i]) > -1) { end = i; break; }
    }
    if (end < 0) return b;
    let start = end;
    while (start > 0 && VOWELS.indexOf(b[start - 1]) > -1) start--;
    let f = b.slice(start, end + 1);
    const rest = b.slice(end + 1);
    if (rest.startsWith("ng")) f += "ng";
    else if (rest.startsWith("n")) f += "n";
    else if (rest.startsWith("r")) f += "r";
    return f;
  }

  /* ---------- 姓氏解析 ---------- */
  function parseSurname(input) {
    const text = (input || "").trim().replace(/\s+/g, "");
    if (!text) return null;
    if (D.COMPOUND_SURNAMES[text]) {
      const [pinyin, strokes] = D.COMPOUND_SURNAMES[text];
      return { text, pinyin, strokes, isCompound: true, known: true };
    }
    if (D.SINGLE_SURNAMES[text]) {
      const [pinyin, strokes] = D.SINGLE_SURNAMES[text];
      return { text, pinyin, strokes, isCompound: false, known: true };
    }
    // 未知姓氏：仍可起名，音律与笔画维度降级处理
    return { text, pinyin: "", strokes: 0, isCompound: text.length > 1, known: false };
  }

  /* ---------- 五格数理 ---------- */
  function wugeScore(surname, chars) {
    if (!surname.strokes) return { score: 78, tian: 0, ren: 0, di: 0, zong: 0, lucky: "笔画未知" };
    const s = surname.strokes;
    const g1 = chars[0] ? chars[0].strokes : 0;
    const g2 = chars.length > 1 ? chars[1].strokes : 0;

    const tian = surname.isCompound ? s : s + 1;
    const ren = s + g1;
    const di = chars.length > 1 ? g1 + g2 : g1 + 1;
    const zong = s + g1 + g2;

    function scoreOf(n) {
      const reduced = ((n - 1) % 81) + 1 || 81;
      if (D.LUCKY.indexOf(reduced) > -1) return { v: 95, label: "吉" };
      if (D.HALF.indexOf(reduced) > -1) return { v: 80, label: "半吉" };
      return { v: 62, label: "平" };
    }
    const parts = [scoreOf(ren), scoreOf(di), scoreOf(zong)];
    const score = Math.round((parts[0].v * 0.4 + parts[1].v * 0.35 + parts[2].v * 0.25));
    return {
      score,
      tian, ren, di, zong,
      lucky: parts.map(function (p) { return p.label; }).join(" / ")
    };
  }

  /* ---------- 五维打分 ---------- */
  function scoreSound(surname, c1, c2) {
    const t1 = c1.tone, t2 = c2 ? c2.tone : 0;
    const st = surname.known ? toneOf(surname.pinyin) : 0;
    const f1 = finalOf(c1.pinyin), f2 = c2 ? finalOf(c2.pinyin) : "";
    const i1 = initialOf(c1.pinyin), i2 = c2 ? initialOf(c2.pinyin) : "";
    const sf = surname.known ? finalOf(surname.pinyin) : "";
    const si = surname.known ? initialOf(surname.pinyin) : "";

    let s = 62;
    const notes = [];

    if (c2) {
      if (t1 !== t2) { s += 14; } else { s -= 6; notes.push("两字声调相同，起伏偏平"); }
      if (t1 === 3 && t2 === 3) { s -= 6; notes.push("连续上声，连读略费力"); }
      if (f1 === f2) { s -= 20; notes.push("两字韵母相同，读来重复"); }
      if (i1 && i1 === i2) { s -= 14; notes.push("两字声母相同，缺少变化"); }
    }
    if (st) {
      if (t1 !== st) s += 10; else s -= 3;
      if (f1 === sf) { s -= 12; notes.push("名首字与姓押韵，衔接略黏"); }
      if (i1 && i1 === si) { s -= 8; notes.push("名首字与姓声母相同"); }
      if (c2 && f2 === sf) s -= 6;
      if (!notes.length) notes.push("声调错落，声母韵母各有变化");

      // 平仄：一、二声为平，三、四声为仄
      if (c2) {
        const flat = function (t) { return t <= 2; };
        const p1 = flat(st), p2 = flat(t1), p3 = flat(t2);
        if (p1 !== p2 && p2 !== p3) { s += 6; notes.push("平仄相间，读来有起伏"); }
        else if (p1 === p2 && p2 === p3) { s -= 6; notes.push("三字同调，语感偏平"); }
      }
    }

    s = Math.max(30, Math.min(100, s));
    return { score: Math.round(s), notes, tones: [st || null, t1, c2 ? t2 : null], finals: [sf, f1, f2].filter(Boolean) };
  }

  function scoreMeaning(opts, c1, c2) {
    const kws = opts.keywords || [];
    const styles = opts.styles || [];
    const chars = c2 ? [c1, c2] : [c1];
    let s = 58;
    const notes = [];

    chars.forEach(function (c) {
      const hitKw = kws.filter(function (k) { return k && c.meaning.indexOf(k) > -1; });
      if (hitKw.length) { s += 16 * hitKw.length; notes.push("「" + c.char + "」契合「" + hitKw[0] + "」"); }
      const hitTag = styles.filter(function (t) { return c.tags.indexOf(t) > -1; });
      if (hitTag.length) s += Math.min(12, hitTag.length * 7);
      // 字义写得越具体，说明这个字越有画面感
      s += (c.meaning || "").length >= 7 ? 4 : 2;
    });

    if (chars.length === 2) {
      const same = chars[0].tags.filter(function (t) { return chars[1].tags.indexOf(t) > -1; });
      if (same.length >= 2) { s += 5; notes.push("两字气质一致，读来统一"); }
    }
    if (!kws.length && !styles.length) { s += 9; notes.push("未设定寓意偏好，按字义端正程度评估"); }
    if (!notes.length) notes.push("字义端正，寓意中性可延展");

    return { score: Math.max(40, Math.min(100, Math.round(s))), notes };
  }

  function scoreElement(opts, c1, c2) {
    const want = opts.element;
    const chars = c2 ? [c1, c2] : [c1];
    if (!want) {
      const set = new Set(chars.map(function (c) { return c.element; }));
      return { score: set.size > 1 ? 86 : 80, notes: ["五行未指定，按字面五行分布评估"] };
    }
    const hit = chars.filter(function (c) { return c.element === want; }).length;
    const score = Math.round(45 + hit / chars.length * 55);
    const notes = hit === chars.length
      ? ["两字皆属" + want + "，与喜用一致"]
      : hit ? ["仅部分字属" + want + "，可再调整"] : ["字面五行与喜用" + want + "不合"];
    return { score, notes };
  }

  function scoreUnique(c1, c2) {
    const chars = c2 ? [c1, c2] : [c1];
    const avg = chars.reduce(function (s, c) { return s + c.popularity; }, 0) / chars.length;
    let s = 100 - (avg - 1) * 13;
    const cold = chars.filter(function (c) { return c.popularity <= 2; }).length;
    const warm = chars.filter(function (c) { return c.popularity >= 4; }).length;
    const notes = [];

    if (c2) {
      if (cold === 2) { s -= 22; notes.push("两字都偏冷僻，日常书写略生僻"); }
      else if (cold === 1 && warm === 0) { s -= 6; notes.push("有一字偏冷僻，辨识度高但略生"); }
      if (warm >= 1 && cold === 0) { s += 4; notes.push("用字常见而不俗，接受度高"); }
      if (cold === 0 && warm === 0) notes.push("用字适度，辨识度不错");
    } else {
      if (cold === 1) { s -= 10; notes.push("单字偏冷僻，注意日常使用"); }
      else notes.push("用字适度，辨识度不错");
    }

    return { score: Math.max(45, Math.min(100, Math.round(s))), notes };
  }

  /* ---------- 候选字筛选 ---------- */
  function pickPool(opts) {
    const gender = opts.gender || "n";
    const styles = opts.styles || [];
    const wanted = opts.element || "";
    const avoid = (opts.avoid || "").split(/[，,、\s]+/).filter(Boolean);
    const surnameText = opts.surname ? opts.surname.text : "";

    function baseFilter(c) {
      if (avoid.indexOf(c.char) > -1) return false;
      if (surnameText.indexOf(c.char) > -1) return false;
      if (gender !== "n" && c.gender !== "n" && c.gender !== gender) return false;
      if (wanted && c.element !== wanted) return false;
      return true;
    }

    let pool = D.CHARS.filter(function (c) {
      if (!baseFilter(c)) return false;
      if (!styles.length) return true;
      return styles.some(function (t) { return c.tags.indexOf(t) > -1; });
    });

    // 风格筛得太狠时逐步放宽，避免候选枯竭
    if (pool.length < 24) {
      pool = D.CHARS.filter(function (c) {
        if (!baseFilter(c)) return false;
        if (!styles.length) return true;
        return styles.some(function (t) {
          return c.tags.indexOf(t) > -1 || (t === "neutral" && c.tags.indexOf("modern") > -1);
        });
      });
    }
    if (pool.length < 12) pool = D.CHARS.filter(baseFilter);
    return pool;
  }

  /* ---------- 主生成函数 ---------- */
  function generate(options) {
    const opts = {
      surnameInput: "李",
      gender: "n",
      length: 2,
      styles: [],
      element: "",
      keywords: [],
      avoid: "",
      count: 12,
      offset: 0
    };
    Object.assign(opts, options || {});

    const surname = parseSurname(opts.surnameInput);
    if (!surname) return { error: "请先填写姓氏", list: [] };

    const pool = pickPool({
      surname, gender: opts.gender, styles: opts.styles,
      element: opts.element, avoid: opts.avoid
    });

    const candidates = [];
    const rand = mulberry32(opts.seed || (Date.now() % 100000) + opts.offset);

    if (opts.length === 1) {
      pool.forEach(function (c1) {
        const sound = scoreSound(surname, c1, null);
        const meaning = scoreMeaning(opts, c1, null);
        const element = scoreElement(opts, c1, null);
        const wuge = wugeScore(surname, [c1]);
        const unique = scoreUnique(c1, null);
        candidates.push(build(surname, [c1], sound, meaning, element, wuge, unique, rand));
      });
    } else {
      for (let i = 0; i < pool.length; i++) {
        for (let j = 0; j < pool.length; j++) {
          if (i === j) continue;
          const c1 = pool[i], c2 = pool[j];
          if (c1.char === c2.char) continue;
          if (stripTone(c1.pinyin) === stripTone(c2.pinyin)) continue;
          // 两字性别倾向互相打架（一男一女）时直接跳过
          if (c1.gender !== "n" && c2.gender !== "n" && c1.gender !== c2.gender) continue;
          const sound = scoreSound(surname, c1, c2);
          const meaning = scoreMeaning(opts, c1, c2);
          const element = scoreElement(opts, c1, c2);
          const wuge = wugeScore(surname, [c1, c2]);
          const unique = scoreUnique(c1, c2);
          candidates.push(build(surname, [c1, c2], sound, meaning, element, wuge, unique, rand));
        }
      }
    }

    candidates.sort(function (a, b) { return b.score - a.score; });

    // 同一批结果尽量不共用字，避免“李聿绾、李珩聿”这种同字扎堆
    const picked = [];
    const usedChars = new Set();
    for (let i = 0; i < candidates.length && picked.length < opts.count; i++) {
      const item = candidates[i];
      const clash = item.chars.some(function (c) { return usedChars.has(c.char); });
      if (clash) continue;
      picked.push(item);
      item.chars.forEach(function (c) { usedChars.add(c.char); });
    }
    // 候选不够时再放宽，补足数量
    if (picked.length < opts.count) {
      for (let i = 0; i < candidates.length && picked.length < opts.count; i++) {
        if (picked.indexOf(candidates[i]) > -1) continue;
        picked.push(candidates[i]);
      }
    }

    return {
      list: picked,
      poolSize: pool.length,
      total: candidates.length,
      surname
    };
  }

  function build(surname, chars, sound, meaning, element, wuge, unique, rand) {
    const total = Math.round(
      sound.score * 0.35 + meaning.score * 0.27 + element.score * 0.13 +
      wuge.score * 0.15 + unique.score * 0.10
    );
    // 细项协调度：书写匀称、气质层次
    let harmony = 0;
    if (chars.length > 1) {
      const diff = Math.abs(chars[0].strokes - chars[1].strokes);
      if (diff <= 3) harmony += 1;
      else if (diff >= 10) harmony -= 2;

      const tagSet = new Set();
      chars.forEach(function (c) { c.tags.forEach(function (t) { tagSet.add(t); }); });
      if (tagSet.size >= 5) harmony += 1;
    }

    // 轻微随机扰动，保证“换一批”时结果有变化，同时不打乱明显优劣
    const jitter = rand() * 5;
    const score = Math.min(99, total + harmony + Math.round(jitter));
    const fullPinyin = (surname.pinyin ? surname.pinyin + " " : "") +
      chars.map(function (c) { return c.pinyin; }).join(" ");

    return {
      full: surname.text + chars.map(function (c) { return c.char; }).join(""),
      surname: surname.text,
      given: chars.map(function (c) { return c.char; }).join(""),
      chars,
      fullPinyin,
      score,
      grade: score >= 92 ? "上上" : score >= 86 ? "上" : score >= 80 ? "中上" : score >= 74 ? "中" : "参考",
      dims: {
        sound: sound.score,
        meaning: meaning.score,
        element: element.score,
        strokes: wuge.score,
        unique: unique.score
      },
      notes: [].concat(sound.notes, meaning.notes, element.notes, unique.notes).slice(0, 4),
      wuge,
      tones: sound.tones,
      finals: sound.finals
    };
  }

  /* ---------- 外部给定名字的复核（供大模型结果使用） ---------- */
  function evaluate(surnameInput, charObjs, options) {
    const opts = Object.assign({
      gender: "n", styles: [], element: "", keywords: []
    }, options || {});
    const surname = parseSurname(surnameInput);
    if (!surname || !charObjs || !charObjs.length) return null;

    const chars = charObjs.slice(0, 2);
    const c1 = chars[0];
    const c2 = chars.length > 1 ? chars[1] : null;
    const sound = scoreSound(surname, c1, c2);
    const meaning = scoreMeaning(opts, c1, c2);
    const element = scoreElement(opts, c1, c2);
    const wuge = wugeScore(surname, chars);
    const unique = scoreUnique(c1, c2);
    const item = build(surname, chars, sound, meaning, element, wuge, unique, function () { return 0; });
    item.source = "ai";
    return item;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const api = {
    generate,
    evaluate,
    parseSurname,
    // 供测试与外部调用
    _internal: { stripTone, toneOf, initialOf, finalOf, wugeScore, scoreSound }
  };

  root.NamingEngine = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
