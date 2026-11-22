/* 11問で漢字当て — 質問エンジン（ブラウザ/Node共用） */
(function (root) {
  'use strict';

  // 部品の呼び名（有名なもの）
  var RADICAL_NAME = {
    '氵': 'さんずい', '亻': 'にんべん', '扌': 'てへん', '艹': 'くさかんむり', '宀': 'うかんむり', '辶': 'しんにょう',
    '糹': 'いとへん', '言': 'ごんべん', '忄': 'りっしんべん', '彳': 'ぎょうにんべん', '木': 'き・きへん', '日': 'ひ・ひへん',
    '月': 'つき・にくづき', '口': 'くち', '土': 'つち・つちへん', '心': 'こころ', '貝': 'かい・かいへん', '寸': 'すん',
    '禾': 'のぎへん', '竹': 'たけかんむり', '攵': 'ぼくづくり', '刂': 'りっとう', '阝': 'こざと・おおざと', '虫': 'むしへん',
    '田': 'た', '目': 'め・めへん', '石': 'いし・いしへん', '山': 'やま', '女': 'おんな・おんなへん', '力': 'ちから',
    '金': 'かね・かねへん', '火': 'ひ・ひへん', '水': 'みず', '食': 'しょく・しょくへん', '馬': 'うま', '雨': 'あめかんむり',
    '广': 'まだれ', '厂': 'がんだれ', '尸': 'しかばね・かばね', '广': 'まだれ', '冖': 'わかんむり', '亠': 'なべぶた',
    '广': 'まだれ', '又': 'また', '大': 'だい', '小': 'しょう', '宀': 'うかんむり', '犭': 'けものへん', '礻': 'しめすへん',
    '衤': 'ころもへん', '牜': 'うしへん', '示': 'しめす', '爫': 'つめかんむり', '夂': 'ふゆがしら', '厶': 'む'
  };

  var ROW = {};
  [['あ', 'あいうえお'], ['か', 'かきくけこがぎぐげご'], ['さ', 'さしすせそざじずぜぞ'], ['た', 'たちつてとだぢづでど'],
   ['な', 'なにぬねの'], ['は', 'はひふへほばびぶべぼぱぴぷぺぽ'], ['ま', 'まみむめも'], ['や', 'やゆよ'],
   ['ら', 'らりるれろ'], ['わ', 'わをん']].forEach(function (r) {
    r[1].split('').forEach(function (c) { ROW[c] = r[0]; });
  });

  function firstRow(reading) {
    var s = String(reading).replace(/^[-.]+/, '');
    var c = s.charAt(0);
    return ROW[c] || null;
  }
  function baseKun(k) { return String(k).replace(/-/g, '').split('.')[0]; }

  function prepare(raw) {
    return raw.map(function (r, i) {
      var onRows = {}, kunRows = {};
      r.on.forEach(function (x) { var w = firstRow(x); if (w) onRows[w] = 1; });
      r.kun.forEach(function (x) { var w = firstRow(x); if (w) kunRows[w] = 1; });
      var cp = {}; (r.cp || []).forEach(function (c) { cp[c] = 1; });
      return {
        i: i, k: r.k, g: r.g, s: r.s, on: r.on, kun: r.kun, st: r.st,
        cp: cp, a: r.a || null, b: r.b || null,
        onRows: onRows, kunRows: kunRows,
        onSet: r.on.reduce(function (o, x) { o[x] = 1; return o; }, {}),
        hasOkuri: r.kun.some(function (x) { return x.indexOf('.') >= 0; })
      };
    });
  }

  var YN = [{ k: 'y', label: 'はい' }, { k: 'n', label: 'いいえ' }];

  function buildQuestions(items) {
    var qs = [];
    function add(id, text, sub, w, fn, group) {
      qs.push({ id: id, text: text, sub: sub || null, w: w, group: group, choices: YN,
        cat: function (p) { return fn(p) ? 'y' : 'n'; } });
    }
    function addCmp(id, text, sub, w, val, n, unit, group) {
      qs.push({ id: id, text: text, sub: sub, w: w, group: group,
        choices: [{ k: 'gt', label: '大きい' }, { k: 'lt', label: '小さい' }, { k: 'eq', label: '同じ（' + n + unit + '）' }],
        cat: function (p) { var v = val(p); return v > n ? 'gt' : v < n ? 'lt' : 'eq'; } });
    }
    function addCmpGrade(id, text, sub, w, n) {
      qs.push({ id: id, text: text, sub: sub, w: w, group: 'grade',
        choices: [{ k: 'gt', label: '上（高学年）' }, { k: 'lt', label: '下（低学年）' }, { k: 'eq', label: '同じ（' + n + '年）' }],
        cat: function (p) { return p.g > n ? 'gt' : p.g < n ? 'lt' : 'eq'; } });
    }

    // 形（構造）
    add('st:H', '左右に分かれた形ですか？', '「林」「明」「湖」のような、へん＋つくりの形（3つに分かれるものも含む）', 0,
      function (p) { return p.st === 'H' || p.st === 'H3'; }, 'shape');
    add('st:V', '上下に分かれた形ですか？', '「花」「学」「森」のような、かんむり＋下の部分の形（3段も含む）', 0,
      function (p) { return p.st === 'V' || p.st === 'V3'; }, 'shape');
    add('st:E', '外側が内側を囲んでいる形ですか？', '「国」「道」「家」「医」のような、くにがまえ・しんにょう・まだれなど', 0,
      function (p) { return p.st === 'E'; }, 'shape');
    add('st:S', 'これ以上分けにくい、単純な形ですか？', '「山」「人」「手」のように部品に分けない漢字', 0,
      function (p) { return p.st === 'S'; }, 'shape');

    // 部品
    var cpCount = {}, aCount = {}, bCount = {};
    items.forEach(function (p) {
      Object.keys(p.cp).forEach(function (c) { cpCount[c] = (cpCount[c] || 0) + 1; });
      if (p.a) aCount[p.a] = (aCount[p.a] || 0) + 1;
      if (p.b) bCount[p.b] = (bCount[p.b] || 0) + 1;
    });
    Object.keys(cpCount).forEach(function (c) {
      if (cpCount[c] >= 6 && cpCount[c] <= 400) {
        var nm = RADICAL_NAME[c] ? '（' + RADICAL_NAME[c] + '）' : '';
        add('cp:' + c, '「' + c + '」' + nm + 'の部分が含まれていますか？', 'どこにあってもOK（形が少し変わっていても同じ部品なら「はい」）', 0.02,
          function (p) { return !!p.cp[c]; }, 'part');
      }
    });
    Object.keys(aCount).forEach(function (c) {
      if (aCount[c] >= 8) {
        add('a:' + c, '左側（または上側）の部品は「' + c + '」ですか？', '「へん」や「かんむり」にあたる部分', 0.02,
          function (p) { return p.a === c; }, 'part');
      }
    });
    Object.keys(bCount).forEach(function (c) {
      if (bCount[c] >= 8) {
        add('b:' + c, '右側（または下側）の部品は「' + c + '」ですか？', '「つくり」や「あし」にあたる部分', 0.02,
          function (p) { return p.b === c; }, 'part');
      }
    });

    // 画数
    for (var n = 3; n <= 20; n++) {
      (function (n) {
        addCmp('s:' + n, n + '画より、画数は多いですか？少ないですか？', 'ぴったり' + n + '画なら「同じ」', 0.04,
          function (p) { return p.s; }, n, '画', 'strokes');
      })(n);
    }
    // 学年
    for (var g = 1; g <= 6; g++) {
      (function (g) {
        addCmpGrade('g:' + g, '小学' + g + '年生で習う漢字より、上の学年ですか？下の学年ですか？', '分からなければ「わからない」でOK', 0.09, g);
      })(g);
    }

    // 読み
    add('on:has', '音読み（カタカナで書く読み方）がありますか？', '例：「学」→ガク、「花」→カ', 0.03,
      function (p) { return p.on.length > 0; }, 'reading');
    add('kun:has', '訓読み（ひらがなで書く読み方）がありますか？', '例：「学」→まな(ぶ)、「花」→はな', 0.03,
      function (p) { return p.kun.length > 0; }, 'reading');
    add('on:multi', '音読みが2つ以上ありますか？', '例：「生」→セイ・ショウ', 0.04,
      function (p) { return p.on.length >= 2; }, 'reading');
    add('kun:multi', '訓読みが2つ以上ありますか？', '例：「生」→い(きる)・う(まれる)・なま…', 0.04,
      function (p) { return p.kun.length >= 2; }, 'reading');
    add('kun:okuri', '訓読みに送りがなが付きますか？', '例：「学ぶ」「明るい」「走る」の「ぶ」「るい」「る」', 0.04,
      function (p) { return p.hasOkuri; }, 'reading');
    ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ'].forEach(function (r) {
      add('onrow:' + r, '音読みのどれかが「' + r + '行」の音で始まりますか？', '例：「か行」→カ・キ・ク・ケ・コ（ガ・ギなども含む）', 0.03,
        function (p) { return !!p.onRows[r]; }, 'reading');
      add('kunrow:' + r, '訓読みのどれかが「' + r + '行」の音で始まりますか？', '例：「か行」→か・き・く・け・こ（が・ぎなども含む）', 0.03,
        function (p) { return !!p.kunRows[r]; }, 'reading');
    });
    var onCount = {};
    items.forEach(function (p) { p.on.forEach(function (x) { onCount[x] = (onCount[x] || 0) + 1; }); });
    Object.keys(onCount).forEach(function (x) {
      if (onCount[x] >= 8) {
        var kata = x.replace(/[ぁ-ん]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 96); });
        add('on:' + x, '音読みに「' + kata + '」がありますか？', null, 0.03, function (p) { return !!p.onSet[x]; }, 'reading');
      }
    });
    return qs;
  }

  function pickQuestion(cands, questions, usedIds, rng) {
    var n = cands.length, best = [], bestScore = Infinity;
    for (var k = 0; k < questions.length; k++) {
      var q = questions[k];
      if (usedIds[q.id]) continue;
      var cnt = {}, kinds = 0;
      for (var i = 0; i < n; i++) { var kk = q.cat(cands[i]); if (!cnt[kk]) { cnt[kk] = 0; kinds++; } cnt[kk]++; }
      if (kinds < 2) continue;
      var mx = 0; for (var key in cnt) if (cnt[key] > mx) mx = cnt[key];
      var imbalance = Math.max(0, mx / n - 0.5);
      var score = imbalance + q.w * (n > 8 ? 1 : 0.3);
      if (score < bestScore - 1e-9) { bestScore = score; best = [q]; }
      else if (Math.abs(score - bestScore) < 0.004) best.push(q);
    }
    if (!best.length) return null;
    return best[Math.floor((rng ? rng() : Math.random()) * best.length)];
  }

  // 1問目の「舐めプ質問」
  var BAIT = ['愛', '夢', '桜', '海', '花', '空', '森', '友', '光', '風', '龍'];

  root.KanjiEngine = { prepare: prepare, buildQuestions: buildQuestions, pickQuestion: pickQuestion, BAIT: BAIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.KanjiEngine;
})(typeof window !== 'undefined' ? window : globalThis);
