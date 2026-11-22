/* ボカロ曲当て — 質問エンジン（ブラウザ/Node共用） */
(function (root) {
  'use strict';

  // ボーカル名の表示名
  var VOCAL_NAME = {
    'ミク': '初音ミク', 'リン': '鏡音リン', 'レン': '鏡音レン', 'GUMI': 'GUMI', 'IA': 'IA', 'flower': 'v flower（フラワー）',
    'ルカ': '巡音ルカ', 'KAITO': 'KAITO', 'MEIKO': 'MEIKO', 'ゆかり': '結月ゆかり', 'ウナ': '音街ウナ', 'テト': '重音テト',
    'ユキ': '歌愛ユキ', 'がくぽ': '神威がくぽ', '可不': '可不（カフ）', '星界': '星界（ステラ）'
  };

  function kind(ch) {
    if (/[ぁ-ゖ]/.test(ch)) return 'ひ';
    if (/[ァ-ヺー]/.test(ch)) return 'カ';
    if (/[一-鿿㐀-䶿々〆㋰]/.test(ch)) return '漢';
    if (/[A-Za-zＡ-Ｚａ-ｚ]/.test(ch)) return '英';
    if (/[0-9０-９]/.test(ch)) return '数';
    return '記';
  }

  // 並べ替え・表示用の「基本の曲名」（後から付けた区別用の（…）を除く）
  function baseTitle(t) { return t.replace(/（[^）]*）$/, ''); }

  function prepare(raw) {
    return raw.map(function (r, i) {
      var bt = baseTitle(r.t);
      var chars = Array.from(bt.replace(/\s/g, ''));
      var set = {}, kinds = {};
      chars.forEach(function (c) { set[c] = 1; kinds[kind(c)] = 1; });
      var first = chars[0] || '', last = chars[chars.length - 1] || '';
      var vset = {}; r.v.forEach(function (x) { vset[x] = 1; });
      var fset = {}; r.f.forEach(function (x) { fset[x] = 1; });
      return {
        i: i, id: r.i, t: r.t, bt: bt, y: r.y, m: r.m, v: r.v, p: r.p, myth: !!r.h,
        vset: vset, fset: fset, len: chars.length, chars: set, kinds: kinds,
        first: first, last: last, fk: first ? kind(first) : ''
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
    function addCmp(id, text, sub, w, val, n, labels, group) {
      qs.push({ id: id, text: text, sub: sub, w: w, group: group,
        choices: [{ k: 'gt', label: labels[0] }, { k: 'lt', label: labels[1] }, { k: 'eq', label: labels[2] }],
        cat: function (p) { var v = val(p); return v > n ? 'gt' : v < n ? 'lt' : 'eq'; } });
    }
    function count(fn) { var c = {}; items.forEach(function (p) { fn(p).forEach(function (k) { c[k] = (c[k] || 0) + 1; }); }); return c; }

    // ボーカル
    var vc = count(function (p) { return p.v; });
    Object.keys(vc).forEach(function (v) {
      if (vc[v] >= 6) {
        add('v:' + v, '「' + (VOCAL_NAME[v] || v) + '」が歌っていますか？', 'デュエットや合唱で、歌っている人の中に含まれていれば「はい」', 0.03,
          function (p) { return !!p.vset[v]; }, 'vocal');
      }
    });
    add('v:multi', '2人以上のボーカルが歌っていますか？', 'デュエット、ミク＆GUMI など複数で歌う曲', 0.06,
      function (p) { return p.v.length >= 2; }, 'vocal');

    // 作者（投稿者）
    var pc = count(function (p) { return p.p ? [p.p] : []; });
    Object.keys(pc).forEach(function (a) {
      if (pc[a] >= 5) {
        add('p:' + a, '「' + a + '」さんの曲ですか？', 'ボカロP（ニコニコ動画の投稿者）の名前', 0.02,
          function (p) { return p.p === a; }, 'maker');
      }
    });
    add('p:known', '同じ作者の曲が、他にもこのリストに何曲も入っていますか？', 'DECO*27、ピノキオピー、MARETU など、ヒット曲が多い作者', 0.07,
      function (p) { return !!p.p && pc[p.p] >= 5; }, 'maker');

    // 投稿年
    for (var y = 2008; y <= 2025; y++) {
      (function (y) {
        addCmp('y:' + y, y + '年より、ニコニコ動画への投稿は前ですか？後ですか？', '原曲が投稿された年。ぴったり' + y + '年なら「同じ」', 0.05,
          function (p) { return p.y; }, y, ['後（新しい）', '前（古い）', '同じ（' + y + '年）'], 'year');
      })(y);
    }
    // 再生数
    [60, 80, 110, 150, 200, 300, 500, 1000].forEach(function (m) {
      add('m:' + m, 'ニコニコ動画の再生数は、' + (m >= 1000 ? '1000万回' : m + '万回') + 'を超えていますか？', '全曲100万回以上。おおよそで大丈夫です', 0.09,
        function (p) { return p.m > m; }, 'views');
    });

    // 曲名の長さ
    for (var n = 2; n <= 16; n++) {
      (function (n) {
        addCmp('len:' + n, '曲名は、' + n + '文字より長いですか？短いですか？', '「！」「？」などの記号もふくめて数えます（空白は数えません）。ぴったり' + n + '文字なら「同じ」', 0.04,
          function (p) { return p.len; }, n, ['長い', '短い', '同じ（' + n + '文字）'], 'len');
      })(n);
    }

    // 文字種
    add('k:漢', '曲名に漢字が含まれていますか？', null, 0.01, function (p) { return !!p.kinds['漢']; }, 'script');
    add('k:ひ', '曲名にひらがなが含まれていますか？', null, 0.01, function (p) { return !!p.kinds['ひ']; }, 'script');
    add('k:カ', '曲名にカタカナが含まれていますか？', '長音「ー」だけでもカタカナ扱いです', 0.01, function (p) { return !!p.kinds['カ']; }, 'script');
    add('k:英', '曲名にアルファベットが含まれていますか？', null, 0.01, function (p) { return !!p.kinds['英']; }, 'script');
    add('k:数', '曲名に数字が含まれていますか？', null, 0.01, function (p) { return !!p.kinds['数']; }, 'script');
    add('k:記', '曲名に記号が含まれていますか？', '「！」「？」「。」「、」「・」「♪」「☆」「＊」など', 0.02, function (p) { return !!p.kinds['記']; }, 'script');
    add('f:漢', '曲名は漢字で始まりますか？', null, 0.01, function (p) { return p.fk === '漢'; }, 'first');
    add('f:ひ', '曲名はひらがなで始まりますか？', null, 0.01, function (p) { return p.fk === 'ひ'; }, 'first');
    add('f:カ', '曲名はカタカナで始まりますか？', null, 0.01, function (p) { return p.fk === 'カ'; }, 'first');
    add('f:英', '曲名はアルファベットか数字で始まりますか？', null, 0.01, function (p) { return p.fk === '英' || p.fk === '数'; }, 'first');
    add('allkata', '曲名は、ほぼカタカナだけで書かれていますか？', '例：「ヒビカセ」「ビバハピ」', 0.03,
      function (p) { return !p.kinds['漢'] && !p.kinds['ひ'] && !p.kinds['英'] && !p.kinds['数'] && !!p.kinds['カ']; }, 'script');

    // 特定の文字
    var cc = count(function (p) { return Object.keys(p.chars); });
    Object.keys(cc).forEach(function (c) {
      if (cc[c] >= 12 && /[^\s]/.test(c)) {
        add('c:' + c, '曲名に「' + c + '」の文字が含まれていますか？', null, 0.02, function (p) { return !!p.chars[c]; }, 'char');
      }
    });
    var fc = count(function (p) { return p.first ? [p.first] : []; });
    Object.keys(fc).forEach(function (c) {
      if (fc[c] >= 8) {
        add('f1:' + c, '曲名は「' + c + '」で始まりますか？', null, 0.02, function (p) { return p.first === c; }, 'char');
      }
    });
    var lc = count(function (p) { return p.last ? [p.last] : []; });
    Object.keys(lc).forEach(function (c) {
      if (lc[c] >= 10) {
        add('l1:' + c, '曲名は「' + c + '」で終わりますか？', null, 0.02, function (p) { return p.last === c; }, 'char');
      }
    });

    // 曲の雰囲気・タグ（ニコニコ動画のタグをもとにした目安）
    add('f:pjsk', 'スマホゲーム「プロジェクトセカイ」に収録されていますか？', 'プロセカ。カバー版でなく、この曲自体が収録されていれば「はい」', 0.05, function (p) { return !!p.fset.pjsk; }, 'tag');
    add('f:compass', 'スマホゲーム「#コンパス」と関わりのある曲ですか？', 'キャラクターソングなど', 0.06, function (p) { return !!p.fset.compass; }, 'tag');
    add('f:dam', 'カラオケ（DAM・JOYSOUND）で歌えますか？', '分からなければ「わからない」でOK', 0.09, function (p) { return !!p.fset.dam; }, 'tag');
    add('f:summer', '夏っぽい曲ですか？', 'ニコニコ動画で「夏曲」と呼ばれているもの', 0.07, function (p) { return !!p.fset.summer; }, 'tag');
    add('f:wafu', '和風（和の雰囲気）の曲ですか？', null, 0.07, function (p) { return !!p.fset.wafu; }, 'tag');
    add('f:dark', '歌詞や雰囲気がダーク・暗めの曲ですか？', 'ニコニコ動画で「ダークなぼかうた」と呼ばれているもの', 0.08, function (p) { return !!p.fset.dark; }, 'tag');
    add('f:rock', 'ロック（バンドサウンド）っぽい曲ですか？', 'ニコニコ動画で「VOCAROCK」と呼ばれているもの', 0.08, function (p) { return !!p.fset.rock; }, 'tag');
    add('f:duet', 'デュエット曲（2人で掛け合い）ですか？', null, 0.07, function (p) { return !!p.fset.duet; }, 'tag');
    add('f:myth', '再生数が1000万回を超える、超メガヒット曲ですか？', 'ニコニコ動画の「神話入り」', 0.06, function (p) { return p.myth; }, 'views');
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

  // 1問目の「舐めプ質問」（曲名）
  var BAIT = ['千本桜', 'メルト', 'カゲロウデイズ', 'シャルル', 'ドラマツルギー', 'ロキ', '春嵐', 'KING', 'ヴァンパイア', '乙女解剖', 'ダーリンダンス', 'ワールドイズマイン', '脳漿炸裂ガール'];

  root.VocaEngine = { prepare: prepare, buildQuestions: buildQuestions, pickQuestion: pickQuestion, BAIT: BAIT, VOCAL_NAME: VOCAL_NAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.VocaEngine;
})(typeof window !== 'undefined' ? window : globalThis);
