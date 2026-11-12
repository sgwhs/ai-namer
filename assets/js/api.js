/* ============================================================
 * 名笺 · 可选的大模型接入层
 * 任意 OpenAI Chat Completions 兼容接口均可
 * Key 仅保存在本机 localStorage
 * ============================================================ */

(function (root) {
  const STORAGE_KEY = "namer:api-config";
  const DEFAULTS = { base: "", key: "", model: "" };

  function getConfig() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return Object.assign({}, DEFAULTS, saved);
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      base: (cfg.base || "").trim(),
      key: (cfg.key || "").trim(),
      model: (cfg.model || "").trim()
    }));
  }

  function clearConfig() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function isEnabled() {
    const cfg = getConfig();
    return Boolean(cfg.base && cfg.key);
  }

  const STYLE_TEXT = {
    poetic: "诗意", elegant: "清雅", grand: "大气", classic: "古风",
    warm: "温润", bright: "明亮", neutral: "中性", modern: "现代"
  };

  function buildPrompt(opts) {
    const genderText = { m: "男孩", f: "女孩", n: "中性" }[opts.gender] || "中性";
    const styles = (opts.styles || []).map(function (s) { return STYLE_TEXT[s] || s; });
    const lines = [
      "请为一个中国孩子起名，姓氏为「" + opts.surname + "」。",
      "性别倾向：" + genderText,
      "名字字数：" + opts.length + " 个字（不含姓）",
      styles.length ? "风格偏好：" + styles.join("、") : "",
      opts.element ? "五行喜用：" + opts.element : "",
      (opts.keywords || []).length ? "期望寓意关键词：" + opts.keywords.join("、") : "",
      opts.avoid ? "必须避开这些字：" + opts.avoid : "",
      "",
      "要求：",
      "1. 只输出 JSON，不要任何解释或 Markdown 代码块。",
      "2. 格式为 {\"names\":[{\"given\":\"名字\",\"pinyin\":\"拼音（带声调、空格分隔）\",\"charPinyin\":[\"首字拼音\",\"次字拼音\"],\"charMeaning\":[\"首字字义\",\"次字字义\"],\"element\":[\"首字五行\",\"次字五行\"],\"strokes\":[首字笔画,次字笔画],\"meaning\":\"整体寓意，20-40字\",\"tags\":[\"风格标签\"]}]}",
      "3. 共给 " + Math.min(12, opts.count || 8) + " 个候选，名字之间不要重复用字。",
      "4. 避免生僻字、谐音不雅的字、与姓氏连读拗口的组合；声调要有起伏。",
      "5. 每个字必须是规范简体汉字；五行取「金木水火土」之一；笔画按简体常用笔画估算。",
      "6. 整体寓意要具体，不要「美好祝愿」这类空话。"
    ];
    return lines.filter(Boolean).join("\n");
  }

  const SYSTEM_PROMPT = "你是一位资深中文命名顾问，精通汉语音韵、字义训诂与传统五格剖象。你只输出严格的 JSON。";

  function extractJson(text) {
    if (!text) return null;
    let t = text.trim();
    t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    // 直接解析
    try { return JSON.parse(t); } catch (e) { /* 继续尝试截取 */ }

    // 截取第一个 { 到最后一个 }，或第一个 [ 到最后一个 ]
    const firstBrace = t.indexOf("{");
    const lastBrace = t.lastIndexOf("}");
    if (firstBrace > -1 && lastBrace > firstBrace) {
      try { return JSON.parse(t.slice(firstBrace, lastBrace + 1)); } catch (e) { /* ignore */ }
    }
    const firstBracket = t.indexOf("[");
    const lastBracket = t.lastIndexOf("]");
    if (firstBracket > -1 && lastBracket > firstBracket) {
      try { return JSON.parse(t.slice(firstBracket, lastBracket + 1)); } catch (e) { /* ignore */ }
    }
    return null;
  }

  function normalizeNames(payload) {
    if (!payload) return [];
    const raw = Array.isArray(payload) ? payload : (payload.names || payload.data || []);
    if (!Array.isArray(raw)) return [];

    return raw.map(function (item) {
      if (typeof item === "string") return { given: item.trim() };
      return {
        given: String(item.given || item.name || item.word || "").trim(),
        pinyin: item.pinyin || "",
        charPinyin: item.charPinyin || item.py || [],
        charMeaning: item.charMeaning || item.meanings || [],
        element: item.element || item.elements || [],
        strokes: item.strokes || [],
        meaning: item.meaning || item.desc || "",
        tags: item.tags || []
      };
    }).filter(function (n) { return n.given.length >= 1 && n.given.length <= 2; });
  }

  function toCharObject(ch, index, item) {
    const db = root.NAMEDATA.CHARS.find(function (c) { return c.char === ch; });
    if (db) return db;

    const pinyin = Array.isArray(item.charPinyin) ? (item.charPinyin[index] || "") : (item.pinyin || "");
    const toneMatch = pinyin.match(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/);
    const toneMap = {
      "ā": 1, "á": 2, "ǎ": 3, "à": 4, "ē": 1, "é": 2, "ě": 3, "è": 4,
      "ī": 1, "í": 2, "ǐ": 3, "ì": 4, "ō": 1, "ó": 2, "ǒ": 3, "ò": 4,
      "ū": 1, "ú": 2, "ǔ": 3, "ù": 4, "ǖ": 1, "ǘ": 2, "ǚ": 3, "ǜ": 4
    };
    const element = Array.isArray(item.element) ? (item.element[index] || "") : (item.element || "");
    const strokes = Array.isArray(item.strokes) ? Number(item.strokes[index]) || 0 : 0;

    return {
      char: ch,
      pinyin: pinyin || "",
      tone: toneMatch ? (toneMap[toneMatch[0]] || 0) : 0,
      element: element,
      strokes: strokes,
      popularity: 2,
      gender: "n",
      tags: Array.isArray(item.tags) ? item.tags : [],
      meaning: (Array.isArray(item.charMeaning) && item.charMeaning[index]) || "由大模型推荐的字"
    };
  }

  async function generate(opts) {
    const cfg = getConfig();
    if (!cfg.base || !cfg.key) {
      return { ok: false, reason: "no-config" };
    }

    const url = cfg.base.replace(/\/+$/, "") + "/chat/completions";
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 20000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + cfg.key
        },
        body: JSON.stringify({
          model: cfg.model || "gpt-4o-mini",
          temperature: 0.95,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildPrompt(opts) }
          ]
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const text = await res.text().catch(function () { return ""; });
        return { ok: false, reason: "http", status: res.status, message: text.slice(0, 160) };
      }

      const data = await res.json();
      const content = data && data.choices && data.choices[0] &&
        data.choices[0].message && data.choices[0].message.content;
      const names = normalizeNames(extractJson(content));
      if (!names.length) return { ok: false, reason: "parse" };

      const engine = root.NamingEngine;
      const list = [];

      names.forEach(function (item) {
        const given = item.given.replace(/[^\u4e00-\u9fa5]/g, "");
        if (!given) return;
        if (given.length !== opts.length) return;
        if (given.indexOf(opts.surname.replace(/[^\u4e00-\u9fa5]/g, "")) > -1) return;

        const chars = Array.from(given).map(function (ch, i) {
          return toCharObject(ch, i, item);
        });

        const scored = engine.evaluate(opts.surname, chars, {
          gender: opts.gender,
          styles: opts.styles,
          element: opts.element,
          keywords: opts.keywords
        });
        if (!scored) return;

        if (item.meaning) scored.aiMeaning = item.meaning;
        scored.source = "ai";
        list.push(scored);
      });

      if (!list.length) return { ok: false, reason: "parse" };
      list.sort(function (a, b) { return b.score - a.score; });
      return { ok: true, list: list.slice(0, opts.count || 8) };
    } catch (e) {
      const aborted = e && e.name === "AbortError";
      return {
        ok: false,
        reason: aborted ? "timeout" : "network",
        message: e && e.message ? String(e.message).slice(0, 160) : ""
      };
    } finally {
      clearTimeout(timer);
    }
  }

  root.NamerAPI = { getConfig, saveConfig, clearConfig, isEnabled, generate };
})(window);
