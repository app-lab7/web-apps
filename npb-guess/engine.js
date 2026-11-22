/* 11問でプロ野球選手当て — 質問エンジン（ブラウザ/Node共用） */
(function (root) {
  'use strict';

  var TEAMS = {
    g:  { name: '巨人',       lg: 'セ' },
    t:  { name: '阪神',       lg: 'セ' },
    db: { name: 'DeNA',       lg: 'セ' },
    c:  { name: '広島',       lg: 'セ' },
    s:  { name: 'ヤクルト',   lg: 'セ' },
    d:  { name: '中日',       lg: 'セ' },
    h:  { name: 'ソフトバンク', lg: 'パ' },
    f:  { name: '日本ハム',   lg: 'パ' },
    b:  { name: 'オリックス', lg: 'パ' },
    e:  { name: '楽天',       lg: 'パ' },
    l:  { name: '西武',       lg: 'パ' },
    m:  { name: 'ロッテ',     lg: 'パ' }
  };
  var POS = { P: '投手', C: '捕手', I: '内野手', O: '外野手' };

  var KATA = /[゠-ヿ]/;

  function surnameOf(n) {
    var i = n.indexOf(' ');
    return i < 0 ? null : n.slice(0, i);
  }

  // 選手データを整える（now: 年齢計算の基準日）
  function prepare(raw) {
    return raw.map(function (p) {
      var sn = surnameOf(p.n);
      return {
        i: p.i, n: p.n, t: p.t, p: p.p, no: p.no,
        y: p.y, m: p.m, d: p.d, h: p.h, th: p.th, bt: p.bt,
        num: parseInt(p.no, 10),
        sn: sn,
        snLen: sn ? sn.length : null,
        kata: KATA.test(p.n),
        chars: p.n.replace(/\s/g, '')
      };
    });
  }

  function ageOf(p, now) {
    var a = now.getFullYear() - p.y;
    var bm = p.m - 1, bd = p.d;
    if (now.getMonth() < bm || (now.getMonth() === bm && now.getDate() < bd)) a--;
    return a;
  }

  function team(t) { return TEAMS[t].name; }

  // 質問一覧を作る。w は「ユーザーが答えやすい度」の重み（小さいほど先に選ばれる）
  function buildQuestions(players, now) {
    var qs = [];
    var YN = [{ k: 'y', label: 'はい' }, { k: 'n', label: 'いいえ' }];
    function add(id, text, w, fn, group) {
      qs.push({ id: id, text: text, w: w, fn: fn, group: group, choices: YN,
        cat: function (p) { return fn(p) ? 'y' : 'n'; } });
    }
    // 「Nより大きいですか？小さいですか？」型（大きい／小さい／同じ の3択）
    function addCmp(id, text, sub, w, val, n, group) {
      qs.push({ id: id, text: text, sub: sub, w: w, group: group,
        choices: [{ k: 'gt', label: '大きい' }, { k: 'lt', label: '小さい' }, { k: 'eq', label: '同じ（' + n + '番）' }],
        cat: function (p) { var v = val(p); return v > n ? 'gt' : v < n ? 'lt' : 'eq'; } });
    }

    // 球団・リーグ
    Object.keys(TEAMS).forEach(function (k) {
      add('team:' + k, team(k) + 'の選手ですか？', 0, function (p) { return p.t === k; }, 'team');
    });
    add('lg:セ', 'セ・リーグの球団の選手ですか？', 0, function (p) { return TEAMS[p.t].lg === 'セ'; }, 'lg');

    // ポジション
    add('pos:P', '投手ですか？', 0, function (p) { return p.p === 'P'; }, 'pos');
    add('pos:C', '捕手ですか？', 0, function (p) { return p.p === 'C'; }, 'pos');
    add('pos:I', '内野手ですか？', 0, function (p) { return p.p === 'I'; }, 'pos');
    add('pos:O', '外野手ですか？', 0, function (p) { return p.p === 'O'; }, 'pos');

    // 投打
    add('th:右', '右投げですか？', 0, function (p) { return p.th === '右'; }, 'hand');
    add('bt:右', '右打ちですか？（両打ちは「いいえ」）', 0, function (p) { return p.bt === '右'; }, 'hand');
    add('bt:左', '左打ちですか？（両打ちは「いいえ」）', 0, function (p) { return p.bt === '左'; }, 'hand');
    add('tb:右左', '右投げ左打ちですか？', 0, function (p) { return p.th === '右' && p.bt === '左'; }, 'hand');
    add('tb:左左', '左投げ左打ちですか？', 0, function (p) { return p.th === '左' && p.bt === '左'; }, 'hand');
    add('tb:左右', '左投げ右打ちですか？', 0, function (p) { return p.th === '左' && p.bt === '右'; }, 'hand');
    add('bt:両', '両打ち（スイッチヒッター）ですか？', 0, function (p) { return p.bt === '両'; }, 'hand');

    // 生まれ年
    for (var y = 1980; y <= 2006; y++) {
      (function (y) {
        add('y:' + y, y + '年以降の生まれですか？', 0.02, function (p) { return p.y >= y; }, 'year');
      })(y);
    }
    // 年齢
    for (var a = 19; a <= 42; a++) {
      (function (a) {
        add('age:' + a, '今、' + a + '歳以上ですか？', 0.02, function (p) { return ageOf(p, now) >= a; }, 'age');
      })(a);
    }
    // 誕生月・日
    for (var m = 1; m <= 12; m++) {
      (function (m) {
        add('m:' + m, '誕生日は' + m + '月ですか？', 0.03, function (p) { return p.m === m; }, 'month');
      })(m);
    }
    [[1, 3], [4, 6], [7, 9], [10, 12], [1, 6], [1, 4], [5, 8], [9, 12], [2, 5], [6, 9], [3, 7], [8, 11]].forEach(function (r) {
      add('mr:' + r[0] + '-' + r[1], '誕生日は' + r[0] + '月〜' + r[1] + '月ですか？', 0.03,
        function (p) { return p.m >= r[0] && p.m <= r[1]; }, 'month');
    });
    [5, 10, 15, 20, 25].forEach(function (d) {
      add('d:' + d, '誕生日の「日」は' + d + '日以前ですか？（例：3月' + d + '日ならはい）', 0.05,
        function (p) { return p.d <= d; }, 'day');
    });

    // 身長
    for (var h = 165; h <= 200; h++) {
      (function (h) {
        add('h:' + h, '身長は' + h + 'cm以上ですか？', 0.04, function (p) { return p.h >= h; }, 'height');
      })(h);
    }

    // 背番号（「Nより大きい？小さい？」形式）
    [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 80, 90].forEach(function (n) {
      addCmp('no:' + n, '背番号は' + n + 'より大きいですか？小さいですか？', 'ぴったり' + n + '番なら「同じ」。0・00は0として数えます',
        0.04, function (p) { return p.num; }, n, 'number');
    });

    // 名前
    add('kata', '登録名にカタカナが入っていますか？', 0.02, function (p) { return p.kata; }, 'name');
    [2, 3].forEach(function (L) {
      add('snl:' + L, '苗字（名字）は' + L + '文字ですか？', 0.04, function (p) { return p.snLen === L; }, 'name');
    });
    add('snl:le2', '苗字（名字）は2文字以下ですか？', 0.04, function (p) { return p.snLen <= 2; }, 'name');
    // 名前の字
    var freq = {};
    players.forEach(function (p) {
      var seen = {};
      p.chars.split('').forEach(function (c) { if (!seen[c]) { seen[c] = 1; freq[c] = (freq[c] || 0) + 1; } });
    });
    Object.keys(freq).forEach(function (c) {
      if (freq[c] >= 6) {
        add('ch:' + c, '登録名に「' + c + '」の字が入っていますか？', 0.07, function (p) { return p.chars.indexOf(c) >= 0; }, 'char');
      }
    });
    return qs;
  }

  // 質問に対する、選手ごとの正解（true/false/null=判定不能）
  function truth(q, p) { return q.cat(p); }

  function applicable(q, cands) {
    for (var i = 0; i < cands.length; i++) {
      if (cands[i].snLen === null && q.id.indexOf('snl:') === 0) return false;
    }
    return true;
  }

  // 次の質問を選ぶ：候補をできるだけ半分に割り、かつ答えやすい質問を優先
  function pickQuestion(cands, questions, usedIds, rng) {
    var n = cands.length;
    var best = [];
    var bestScore = Infinity;
    for (var k = 0; k < questions.length; k++) {
      var q = questions[k];
      if (usedIds[q.id]) continue;
      if (!applicable(q, cands)) continue;
      var cnt = {}, kinds = 0;
      for (var i = 0; i < n; i++) { var kk = q.cat(cands[i]); if (!cnt[kk]) { cnt[kk] = 0; kinds++; } cnt[kk]++; }
      if (kinds < 2) continue;
      var mx = 0; for (var key in cnt) if (cnt[key] > mx) mx = cnt[key];
      var imbalance = Math.max(0, mx / n - 0.5); // 0(完全に半分)〜0.5
      var score = imbalance + q.w * (n > 8 ? 1 : 0.3);
      if (score < bestScore - 1e-9) { bestScore = score; best = [q]; }
      else if (Math.abs(score - bestScore) < 0.004) best.push(q);
    }
    if (!best.length) return null;
    return best[Math.floor((rng ? rng() : Math.random()) * best.length)];
  }

  // 1問目の「舐めプ質問」に使う、誰でも知っていそうな選手
  var BAIT = ['柳田 悠岐', '坂本 勇人', '山田 哲人', '近本 光司', '佐藤 輝明', '宮城 大弥', '森下 翔太', '牧 秀悟', '源田 壮亮', '岡林 勇希',
    '清宮 幸太郎', '周東 佑京', '平良 海馬', '田中 将大', '中村 剛也', '大野 雄大', '今宮 健太', '髙橋 宏斗', '村上 頌樹', '宗 佑磨'];

  root.NpbEngine = {
    TEAMS: TEAMS, POS: POS, prepare: prepare, buildQuestions: buildQuestions,
    pickQuestion: pickQuestion, truth: truth, ageOf: ageOf, BAIT: BAIT, team: team
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NpbEngine;
})(typeof window !== 'undefined' ? window : globalThis);
