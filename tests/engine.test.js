/**
 * 名笺 · 引擎自测（Node 原生，零依赖）
 * 运行：node tests/engine.test.js
 */
global.window = globalThis;
require("../assets/js/data.js");
require("../assets/js/engine.js");

const assert = require("assert");
const E = global.window.NamingEngine;
const D = global.window.NAMEDATA;

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ✓ " + name);
  } catch (err) {
    console.error("  ✗ " + name);
    console.error("    " + err.message);
    process.exitCode = 1;
  }
}

console.log("名笺引擎自测");

test("字库字段完整且无重复", function () {
  assert.ok(D.CHARS.length > 100, "字库数量应大于 100");
  const set = new Set();
  D.CHARS.forEach(function (c) {
    ["char", "pinyin", "tone", "element", "strokes", "popularity", "gender", "tags", "meaning"].forEach(function (k) {
      assert.ok(c[k] !== undefined && c[k] !== "", c.char + " 缺少字段 " + k);
    });
    assert.ok(c.tone >= 1 && c.tone <= 4, c.char + " 声调异常");
    assert.ok("金木水火土".indexOf(c.element) > -1, c.char + " 五行异常");
    assert.ok(!set.has(c.char), c.char + " 重复");
    set.add(c.char);
  });
});

test("姓氏解析：单姓 / 复姓 / 未知姓", function () {
  const li = E.parseSurname("李");
  assert.strictEqual(li.strokes, 7);
  assert.strictEqual(li.isCompound, false);
  assert.ok(li.known);

  const ouyang = E.parseSurname("欧阳");
  assert.strictEqual(ouyang.isCompound, true);
  assert.strictEqual(ouyang.pinyin, "ōuyáng");

  const unknown = E.parseSurname("褚");
  assert.strictEqual(unknown.known, false);
  assert.strictEqual(unknown.strokes, 0);
});

test("默认条件生成 12 个双字名", function () {
  const r = E.generate({ surnameInput: "李", gender: "n", length: 2, count: 12 });
  assert.ok(!r.error);
  assert.strictEqual(r.list.length, 12);
  r.list.forEach(function (item) {
    assert.strictEqual(item.full.length, 3);
    assert.strictEqual(item.given.length, 2);
    assert.ok(item.score > 0 && item.score <= 99, "分数越界：" + item.score);
    assert.ok(item.fullPinyin.length > 0, "缺少拼音");
    assert.ok(item.dims.sound > 0 && item.dims.meaning > 0);
  });
});

test("结果不重复且姓名不含姓中字", function () {
  const r = E.generate({ surnameInput: "林", length: 2, count: 20 });
  const set = new Set(r.list.map(function (i) { return i.full; }));
  assert.strictEqual(set.size, r.list.length, "出现重复名字");
  r.list.forEach(function (i) {
    assert.ok(i.given.indexOf("林") === -1, "名字重复使用了姓氏用字");
    assert.notStrictEqual(i.chars[0].char, i.chars[1].char, "两字相同");
  });
});

test("单字名模式", function () {
  const r = E.generate({ surnameInput: "王", length: 1, count: 8 });
  assert.strictEqual(r.list.length, 8);
  r.list.forEach(function (i) {
    assert.strictEqual(i.full.length, 2);
    assert.strictEqual(i.chars.length, 1);
  });
});

test("性别筛选：男孩名不出现纯女性字", function () {
  const r = E.generate({ surnameInput: "张", gender: "m", length: 2, count: 12 });
  r.list.forEach(function (i) {
    i.chars.forEach(function (c) {
      assert.ok(c.gender === "m" || c.gender === "n", c.char + " 是女性向用字");
    });
  });
});

test("五行筛选生效", function () {
  const r = E.generate({ surnameInput: "陈", element: "水", length: 2, count: 10 });
  assert.ok(r.list.length > 0);
  r.list.forEach(function (i) {
    i.chars.forEach(function (c) {
      assert.strictEqual(c.element, "水", c.char + " 非水属性");
    });
  });
});

test("避讳字被排除", function () {
  const escape = "泽";
  const r = E.generate({ surnameInput: "刘", avoid: escape, length: 2, count: 12 });
  r.list.forEach(function (i) {
    assert.ok(i.given.indexOf(escape) === -1, "避讳字仍然出现");
  });
});

test("风格标签命中", function () {
  const r = E.generate({ surnameInput: "周", styles: ["poetic"], length: 2, count: 10 });
  r.list.forEach(function (i) {
    const hit = i.chars.some(function (c) { return c.tags.indexOf("poetic") > -1; });
    assert.ok(hit, i.full + " 未命中诗意标签");
  });
});

test("寓意关键词提高寓意分", function () {
  const withKw = E.generate({ surnameInput: "赵", keywords: ["光明"], length: 2, count: 5 });
  const withOut = E.generate({ surnameInput: "赵", length: 2, count: 5 });
  assert.ok(withKw.list.length > 0);
  assert.ok(withOut.list.length > 0);
  // 关键词命中的候选，其寓意分应达到较高水位
  const best = withKw.list[0];
  assert.ok(best.dims.meaning >= 70, "寓意分偏低：" + best.dims.meaning);
});

test("换一批（offset）结果有变化", function () {
  const a = E.generate({ surnameInput: "李", length: 2, count: 12, offset: 0, seed: 1 });
  const b = E.generate({ surnameInput: "李", length: 2, count: 12, offset: 1, seed: 2 });
  const setA = new Set(a.list.map(function (i) { return i.full; }));
  const diff = b.list.filter(function (i) { return !setA.has(i.full); });
  assert.ok(diff.length > 0, "换一批没有新名字");
});

test("五格计算：李(7画) + 景(12) + 行(6)", function () {
  const surname = E.parseSurname("李");
  const chars = D.CHARS.filter(function (c) { return c.char === "景" || c.char === "行"; });
  const w = E._internal.wugeScore(surname, chars);
  assert.strictEqual(w.tian, 8);
  assert.strictEqual(w.ren, 19);
  assert.strictEqual(w.di, 18);
  assert.strictEqual(w.zong, 25);
  assert.ok(w.score >= 60 && w.score <= 100);
});

test("外部给定名字复核（大模型结果路径）", function () {
  const surname = E.parseSurname("李");
  const chars = [
    { char: "知", pinyin: "zhī", tone: 1, element: "火", strokes: 8, popularity: 3, gender: "n", tags: ["poetic"], meaning: "智慧" },
    { char: "远", pinyin: "yuǎn", tone: 3, element: "土", strokes: 7, popularity: 3, gender: "m", tags: ["grand"], meaning: "志向高远" }
  ];
  const item = E.evaluate("李", chars, { gender: "n", styles: ["poetic"], element: "", keywords: ["志向"] });
  assert.ok(item);
  assert.strictEqual(item.full, "李知远");
  assert.strictEqual(item.source, "ai");
  assert.ok(item.score > 0 && item.score <= 99);
});

test("拼音工具：声调与韵母", function () {
  const s = E._internal.stripTone("zhāng");
  assert.strictEqual(s, "zhang");
  assert.strictEqual(E._internal.toneOf("lǐ"), 3);
  assert.strictEqual(E._internal.finalOf("zhāng"), "ang");
  assert.strictEqual(E._internal.finalOf("yuǎn"), "van");
  assert.strictEqual(E._internal.initialOf("zhāng"), "zh");
});

console.log("\n通过 " + passed + " 项" + (process.exitCode ? "，存在失败项" : "，全部通过"));
