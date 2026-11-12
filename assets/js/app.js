/* ============================================================
 * 名笺 · 页面交互
 * ============================================================ */

(function () {
  const D = window.NAMEDATA;
  const Engine = window.NamingEngine;
  const API = window.NamerAPI;

  const SAVED_KEY = "namer:saved";
  const MAX_SAVED = 60;

  const STYLE_OPTIONS = [
    ["poetic", "诗意"], ["elegant", "清雅"], ["grand", "大气"], ["classic", "古风"],
    ["warm", "温润"], ["bright", "明亮"], ["modern", "现代"], ["neutral", "中性"]
  ];
  const ELEMENT_OPTIONS = ["不限", "金", "木", "水", "火", "土"];

  const state = {
    gender: "n",
    length: 2,
    styles: new Set(),
    element: "",
    offset: 0,
    list: [],
    saved: [],
    metaText: "本地词库"
  };

  const el = {
    form: document.getElementById("nameForm"),
    surname: document.getElementById("surname"),
    keywords: document.getElementById("keywords"),
    avoid: document.getElementById("avoid"),
    count: document.getElementById("count"),
    styleChips: document.getElementById("styleChips"),
    elementChips: document.getElementById("elementChips"),
    genderGroup: document.getElementById("genderGroup"),
    lengthGroup: document.getElementById("lengthGroup"),
    resultsMeta: document.getElementById("resultsMeta"),
    emptyState: document.getElementById("emptyState"),
    resultList: document.getElementById("resultList"),
    generateBtn: document.getElementById("generateBtn"),
    reroll: document.getElementById("reroll"),
    exportBtn: document.getElementById("exportBtn"),
    savedCount: document.getElementById("savedCount"),
    savedBody: document.getElementById("savedBody"),
    detailBody: document.getElementById("detailBody"),
    overlay: document.getElementById("overlay"),
    apiDot: document.getElementById("apiDot"),
    toast: document.getElementById("toast"),
    repoLink: document.getElementById("repoLink")
  };

  /* ---------- 基础工具 ---------- */
  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove("on"); }, 2400);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  /* ---------- 初始化选择控件 ---------- */
  function initChips() {
    STYLE_OPTIONS.forEach(function (pair) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = pair[1];
      btn.dataset.value = pair[0];
      btn.addEventListener("click", function () {
        const v = pair[0];
        if (state.styles.has(v)) {
          state.styles.delete(v);
          btn.classList.remove("on");
        } else {
          state.styles.add(v);
          btn.classList.add("on");
        }
      });
      el.styleChips.appendChild(btn);
    });

    ELEMENT_OPTIONS.forEach(function (name) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip element" + (name === "不限" ? " on" : "");
      btn.textContent = name;
      btn.dataset.value = name === "不限" ? "" : name;
      btn.addEventListener("click", function () {
        Array.from(el.elementChips.children).forEach(function (b) {
          b.classList.remove("on");
        });
        btn.classList.add("on");
        state.element = name === "不限" ? "" : name;
      });
      el.elementChips.appendChild(btn);
    });
  }

  function initSegments() {
    el.genderGroup.addEventListener("click", function (e) {
      const btn = e.target.closest("button");
      if (!btn) return;
      Array.from(el.genderGroup.children).forEach(function (b) { b.classList.remove("on"); });
      btn.classList.add("on");
      state.gender = btn.dataset.value;
    });

    el.lengthGroup.addEventListener("click", function (e) {
      const btn = e.target.closest("button");
      if (!btn) return;
      Array.from(el.lengthGroup.children).forEach(function (b) { b.classList.remove("on"); });
      btn.classList.add("on");
      state.length = Number(btn.dataset.value);
    });
  }

  /* ---------- 收集条件 ---------- */
  function collectOptions() {
    const surname = (el.surname.value || "").trim();
    const keywords = (el.keywords.value || "").split(/[，,、\s]+/).filter(Boolean);
    return {
      surnameInput: surname,
      gender: state.gender,
      length: state.length,
      styles: Array.from(state.styles),
      element: state.element,
      keywords: keywords,
      avoid: (el.avoid.value || "").trim(),
      count: Number(el.count.value) || 12,
      offset: state.offset
    };
  }

  /* ---------- 生成 ---------- */
  async function handleGenerate(isReroll) {
    const surname = (el.surname.value || "").trim();
    if (!surname) {
      toast("先填写姓氏");
      el.surname.focus();
      return;
    }
    if (!/^[\u4e00-\u9fa5]{1,2}$/.test(surname)) {
      toast("姓氏请填 1-2 个汉字");
      el.surname.focus();
      return;
    }

    state.offset = isReroll ? state.offset + 1 : 0;
    const opts = collectOptions();

    el.generateBtn.disabled = true;
    el.generateBtn.textContent = "正 在 起 名";
    el.resultsMeta.textContent = "正在计算音律与字义…";

    try {
      let rendered = false;

      if (API.isEnabled()) {
        const aiResult = await API.generate(opts);
        if (aiResult.ok && aiResult.list.length) {
          state.list = aiResult.list;
          renderResults("大模型生成 · 本地引擎复核");
          rendered = true;
          toast("已生成 " + aiResult.list.length + " 个候选");
        } else {
          toast(fallbackHint(aiResult.reason) + "，已用本地词库生成");
        }
      }

      if (!rendered) {
        const result = Engine.generate(opts);
        if (result.error) {
          toast(result.error);
          return;
        }
        state.list = result.list;
        renderResults("本地词库 · 共评估 " + result.total.toLocaleString() + " 种组合");
      }
    } catch (e) {
      console.error(e);
      const result = Engine.generate(opts);
      state.list = result.list || [];
      renderResults("本地词库");
      toast("大模型调用异常，已切换到本地算法");
    } finally {
      el.generateBtn.disabled = false;
      el.generateBtn.textContent = "开 始 起 名";
    }
  }

  function fallbackHint(reason) {
    return {
      "no-config": "未配置模型",
      "http": "接口返回错误",
      "parse": "模型返回格式异常",
      "timeout": "模型响应超时",
      "network": "连不上接口（可能是跨域限制）"
    }[reason] || "大模型不可用";
  }

  /* ---------- 渲染结果 ---------- */
  function meaningText(item) {
    if (item.aiMeaning) return item.aiMeaning;
    return item.chars.map(function (c) { return c.char + "：" + c.meaning; }).join("；");
  }

  function renderResults(metaText) {
    if (!state.list.length) {
      el.emptyState.style.display = "block";
      el.resultList.innerHTML = "";
      el.resultsMeta.textContent = "没有找到合适的组合，试试放宽风格或五行条件";
      return;
    }

    el.emptyState.style.display = "none";
    state.metaText = metaText;
    el.resultsMeta.textContent = metaText + " · 点击卡片查看逐字解析";

    el.resultList.innerHTML = state.list.map(function (item, idx) {
      const tags = item.chars.map(function (c) {
        return '<span class="tag gold">' + escapeHtml(c.element || "?") + "</span>";
      }).join("");
      const styleTags = (item.chars[0].tags || []).slice(0, 2).map(function (t) {
        return '<span class="tag">' + escapeHtml(D.STYLE_LABELS[t] || t) + "</span>";
      }).join("");

      const isSaved = state.saved.some(function (s) { return s.full === item.full; });

      return '' +
        '<li class="name-card" data-index="' + idx + '">' +
          '<div class="card-top">' +
            '<div class="name-block">' +
              '<span class="full-name">' + escapeHtml(item.full) + '</span>' +
              '<span class="pinyin">' + escapeHtml(item.fullPinyin || "拼音待补") + '</span>' +
            '</div>' +
            '<div class="score-badge' + (item.score >= 90 ? " top" : "") + '">' +
              '<strong>' + item.score + '</strong><span>' + escapeHtml(item.grade) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="card-body">' +
            '<p class="meaning-line">' + escapeHtml(meaningText(item)) + '</p>' +
            '<div class="tag-row">' + tags + styleTags +
              (item.source === "ai" ? '<span class="tag">大模型</span>' : "") +
            '</div>' +
          '</div>' +
          '<div class="card-foot">' +
            '<button class="mini-btn" data-act="copy" type="button">复制</button>' +
            '<button class="mini-btn" data-act="detail" type="button">逐字解析</button>' +
            '<button class="mini-btn' + (isSaved ? " saved" : "") + '" data-act="save" type="button">' +
              (isSaved ? "已收藏" : "收藏") + '</button>' +
          '</div>' +
        '</li>';
    }).join("");
  }

  /* ---------- 详情 ---------- */
  const DIM_LABELS = {
    sound: "音律", meaning: "寓意", element: "五行", strokes: "笔画", unique: "独特"
  };

  function openDetail(item) {
    const chars = item.chars.map(function (c) {
      return '' +
        '<div class="char-row">' +
          '<div class="char-box">' + escapeHtml(c.char) + '</div>' +
          '<div>' +
            '<div class="meta">' + escapeHtml(c.pinyin || "—") +
              ' · ' + escapeHtml(c.element || "五行未定") +
              ' · ' + escapeHtml(c.strokes ? c.strokes + " 画" : "笔画待考") + '</div>' +
            '<div class="desc">' + escapeHtml(c.meaning) + '</div>' +
          '</div>' +
        '</div>';
    }).join("");

    const dims = Object.keys(DIM_LABELS).map(function (k) {
      const v = item.dims[k];
      return '' +
        '<div class="dim-row">' +
          '<span class="dim-label">' + DIM_LABELS[k] + '</span>' +
          '<div class="dim-track"><div class="dim-fill" data-w="' + v + '"></div></div>' +
          '<span class="dim-val">' + v + '</span>' +
        '</div>';
    }).join("");

    const wuge = item.wuge || {};
    const wugeHtml = wuge.ren
      ? '<div class="wuge-grid">' +
          '<div><b>' + wuge.tian + '</b><span>天格</span></div>' +
          '<div><b>' + wuge.ren + '</b><span>人格</span></div>' +
          '<div><b>' + wuge.di + '</b><span>地格</span></div>' +
          '<div><b>' + wuge.zong + '</b><span>总格</span></div>' +
        '</div><p class="results-meta">五格数理：' + escapeHtml(wuge.lucky || "") + '</p>'
      : '<p class="results-meta">该姓氏笔画未收录，五格按基础分计入。</p>';

    const notes = (item.notes || []).map(function (n) {
      return "<li>" + escapeHtml(n) + "</li>";
    }).join("");

    el.detailBody.innerHTML = '' +
      '<p class="detail-name">' + escapeHtml(item.full) + '</p>' +
      '<p class="detail-pinyin">' + escapeHtml(item.fullPinyin || "") + ' · 综合 ' + item.score + ' 分（' + escapeHtml(item.grade) + '）</p>' +
      '<div class="detail-chars">' + chars + '</div>' +
      '<div class="dims">' + dims + '</div>' +
      '<h4 style="margin:18px 0 8px;font-family:var(--serif);font-size:14px;letter-spacing:.08em;color:var(--ink-soft)">五格笔画</h4>' +
      wugeHtml +
      (notes ? '<ul class="notes">' + notes + '</ul>' : "") +
      '<div class="modal-foot">' +
        '<button class="primary-btn" type="button" id="detailCopy">复制名字</button>' +
        '<button class="ghost-btn" type="button" id="detailSave">收藏</button>' +
      '</div>';

    openModal("detailModal");

    // 进度条动画
    setTimeout(function () {
      Array.from(el.detailBody.querySelectorAll(".dim-fill")).forEach(function (bar) {
        bar.style.width = bar.dataset.w + "%";
      });
    }, 60);

    document.getElementById("detailCopy").addEventListener("click", function () {
      copyText(item.full).then(function () { toast("已复制 " + item.full); })
        .catch(function () { toast("复制失败，请手动选择"); });
    });

    document.getElementById("detailSave").addEventListener("click", function () {
      saveItem(item);
      toast("已收藏 " + item.full);
      closeModal("detailModal");
    });
  }

  /* ---------- 收藏 ---------- */
  function loadSaved() {
    try {
      state.saved = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
      if (!Array.isArray(state.saved)) state.saved = [];
    } catch (e) {
      state.saved = [];
    }
    el.savedCount.textContent = state.saved.length;
  }

  function persistSaved() {
    localStorage.setItem(SAVED_KEY, JSON.stringify(state.saved));
    el.savedCount.textContent = state.saved.length;
  }

  function saveItem(item) {
    if (state.saved.some(function (s) { return s.full === item.full; })) return;
    state.saved.unshift({
      full: item.full,
      given: item.given,
      pinyin: item.fullPinyin,
      score: item.score,
      grade: item.grade,
      meaning: meaningText(item)
    });
    state.saved = state.saved.slice(0, MAX_SAVED);
    persistSaved();
    renderSaved();
    // 同步卡片按钮状态
    if (state.list.length) renderResults(state.metaText);
  }

  function removeSaved(full) {
    state.saved = state.saved.filter(function (s) { return s.full !== full; });
    persistSaved();
    renderSaved();
    if (state.list.length) renderResults(state.metaText);
  }

  function renderSaved() {
    if (!state.saved.length) {
      el.savedBody.innerHTML = '<p class="saved-empty">还没有收藏。<br />看到喜欢的名字，点一下「收藏」。</p>';
      return;
    }
    el.savedBody.innerHTML = state.saved.map(function (s) {
      return '' +
        '<div class="saved-item">' +
          '<div>' +
            '<strong>' + escapeHtml(s.full) + '</strong>' +
            '<small>' + escapeHtml(s.pinyin || "") + ' · ' + s.score + ' 分 · ' + escapeHtml(s.grade) + '</small>' +
          '</div>' +
          '<div>' +
            '<button class="mini-btn" data-copy="' + escapeHtml(s.full) + '" type="button">复制</button> ' +
            '<button class="mini-btn" data-del="' + escapeHtml(s.full) + '" type="button">移除</button>' +
          '</div>' +
        '</div>';
    }).join("");
  }

  /* ---------- 弹窗 ---------- */
  function openModal(id) {
    closeAll();
    el.overlay.classList.add("on");
    document.getElementById(id).classList.add("on");
    document.body.style.overflow = "hidden";
  }

  function closeModal(id) {
    document.getElementById(id).classList.remove("on");
    el.overlay.classList.remove("on");
    document.body.style.overflow = "";
  }

  function closeAll() {
    Array.from(document.querySelectorAll(".modal, .drawer")).forEach(function (m) {
      m.classList.remove("on");
    });
    el.overlay.classList.remove("on");
    document.body.style.overflow = "";
  }

  /* ---------- 导出 ---------- */
  function exportCsv() {
    if (!state.list.length) {
      toast("还没有可导出的结果");
      return;
    }
    const header = ["姓名", "拼音", "评分", "等级", "音律", "寓意", "五行", "笔画", "独特", "释义"];
    const rows = state.list.map(function (item) {
      return [
        item.full,
        item.fullPinyin || "",
        item.score,
        item.grade,
        item.dims.sound,
        item.dims.meaning,
        item.dims.element,
        item.dims.strokes,
        item.dims.unique,
        meaningText(item)
      ].map(function (v) {
        return '"' + String(v).replace(/"/g, '""') + '"';
      }).join(",");
    });

    const csv = "\uFEFF" + [header.join(",")].concat(rows).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const surname = (el.surname.value || "起名").trim();
    a.href = url;
    a.download = surname + "姓起名候选.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 800);
    toast("已导出 CSV");
  }

  /* ---------- API 设置 ---------- */
  function syncApiDot() {
    el.apiDot.classList.toggle("on", API.isEnabled());
  }

  function openApiModal() {
    const cfg = API.getConfig();
    document.getElementById("apiBase").value = cfg.base || "";
    document.getElementById("apiKey").value = cfg.key || "";
    document.getElementById("apiModel").value = cfg.model || "";
    openModal("apiModal");
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    el.form.addEventListener("submit", function (e) {
      e.preventDefault();
      handleGenerate(false);
    });

    el.reroll.addEventListener("click", function () {
      if (!state.list.length) { handleGenerate(false); return; }
      handleGenerate(true);
    });

    el.exportBtn.addEventListener("click", exportCsv);

    el.resultList.addEventListener("click", function (e) {
      const card = e.target.closest(".name-card");
      if (!card) return;
      const item = state.list[Number(card.dataset.index)];
      if (!item) return;

      const act = e.target.dataset.act;
      if (act === "copy") {
        copyText(item.full).then(function () { toast("已复制 " + item.full); })
          .catch(function () { toast("复制失败，请手动选择"); });
      } else if (act === "detail") {
        openDetail(item);
      } else if (act === "save") {
        if (state.saved.some(function (s) { return s.full === item.full; })) {
          removeSaved(item.full);
          toast("已取消收藏");
        } else {
          saveItem(item);
          toast("已收藏 " + item.full);
        }
      } else {
        openDetail(item);
      }
    });

    document.getElementById("openSaved").addEventListener("click", function () {
      renderSaved();
      openModal("savedDrawer");
    });

    el.savedBody.addEventListener("click", function (e) {
      const copy = e.target.dataset.copy;
      const del = e.target.dataset.del;
      if (copy) {
        copyText(copy).then(function () { toast("已复制 " + copy); }).catch(function () {});
      } else if (del) {
        removeSaved(del);
      }
    });

    document.getElementById("openApi").addEventListener("click", openApiModal);

    document.getElementById("saveApi").addEventListener("click", function () {
      const base = document.getElementById("apiBase").value.trim();
      const key = document.getElementById("apiKey").value.trim();
      const model = document.getElementById("apiModel").value.trim();
      if (!base || !key) {
        toast("接口地址和 Key 都要填，或点「清除」用本地算法");
        return;
      }
      if (!/^https?:\/\//.test(base)) {
        toast("接口地址需以 http:// 或 https:// 开头");
        return;
      }
      API.saveConfig({ base, key, model });
      syncApiDot();
      closeModal("apiModal");
      toast("已保存，下一次起名会先走大模型");
    });

    document.getElementById("clearApi").addEventListener("click", function () {
      API.clearConfig();
      document.getElementById("apiBase").value = "";
      document.getElementById("apiKey").value = "";
      document.getElementById("apiModel").value = "";
      syncApiDot();
      closeModal("apiModal");
      toast("已清除，回到本地算法");
    });

    document.querySelectorAll("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeModal(btn.dataset.close);
      });
    });

    el.overlay.addEventListener("click", closeAll);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAll();
    });
  }

  /* ---------- 启动 ---------- */
  function init() {
    initChips();
    initSegments();
    loadSaved();
    renderSaved();
    syncApiDot();
    bindEvents();

    // 若存在配置好的仓库地址则更新页脚链接
    const repo = "https://github.com/sgwhs/ai-namer";
    if (el.repoLink) el.repoLink.href = repo;

    // 首屏给一组示例，避免空白
    const demo = Engine.generate({
      surnameInput: "李", gender: "n", length: 2, styles: [], element: "",
      keywords: [], avoid: "", count: 4, offset: 0
    });
    if (demo && demo.list && demo.list.length) {
      state.list = demo.list;
      renderResults("示例结果 · 填写条件后重新生成");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
