/* ==========================================================================
   Code MV · 词级强制对齐
   --------------------------------------------------------------------------
   问题：LRC 只有「整行时间戳」，逐字时间只能靠语义权重估算，和实际演唱对不齐。

   这里提供两条路：
     1. **按音频能量对齐**：在每句的时间范围内检测「有声段」，把词按时间比例
        分配到有声段上，得到比均匀分配更接近真实的词级时间。
     2. **导入 Whisper 词级 JSON**：如果你用 Whisper / 任何 ASR 得到
        [{word,start,end}]，直接导入即可精确对齐。

   两条路都输出同样的结构，替换 alan.rows 里的 t / dur，之后逐词投放就准了。
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var U = NS.utils;

  function cloneTok(tok, t, dur) {
    return {
      text: tok.text,
      t: t,
      dur: dur,
      concepts: (tok.concepts || []).slice(),
      mods: tok.mods || {}
    };
  }

  /** 把新时间轴写回 alan（rows + events） */
  function applyRows(alan, rows, aligned) {
    var out = {
      rows: rows,
      events: [],
      lines: alan.lines,
      duration: alan.duration,
      aligned: !!aligned
    };

    for (var li = 0; li < rows.length; li++) {
      var row = rows[li];
      for (var i = 0; i < row.length; i++) {
        var tok = row[i];
        if (tok.concepts && tok.concepts.length) {
          out.events.push({
            t: tok.t,
            dur: tok.dur,
            text: tok.text,
            concepts: tok.concepts.slice(),
            mods: tok.mods || {}
          });
        }
      }
    }

    out.events.sort(function (a, b) {
      return a.t - b.t;
    });

    return out;
  }

  /* ---------- 音频能量对齐 ---------- */

  function sampler(features) {
    var hop = features.hop;
    var sr = features.sampleRate;
    var frames = features.frames;
    var arr = features.energy;

    return function (t) {
      var idx = (t * sr) / hop;
      var i0 = Math.floor(idx);
      if (i0 < 0) return 0;
      if (i0 >= frames - 1) return arr[frames - 1] || 0;
      var k = idx - i0;
      return arr[i0] * (1 - k) + arr[i0 + 1] * k;
    };
  }

  function fromEnergy(alan, features) {
    if (!alan || !alan.rows || !features) {
      throw new Error("缺少音频分析数据");
    }

    var eAt = sampler(features);
    var rowsOut = [];

    for (var li = 0; li < alan.rows.length; li++) {
      var row = alan.rows[li];
      if (!row.length) {
        rowsOut.push([]);
        continue;
      }

      var t0 = row[0].t;
      var last = row[row.length - 1];
      var t1 = last.t + last.dur;
      var span = Math.max(0.4, t1 - t0);

      /* 1. 检测有声段（能量高于阈值且不太短） */
      var step = 0.02;
      var thr = 0.16;
      var segs = [];
      var open = -1;

      for (var t = t0; t <= t1 + 1e-6; t += step) {
        var loud = eAt(t) > thr;
        if (loud && open < 0) open = t;
        if (!loud && open >= 0) {
          if (t - open > 0.08) segs.push([open, t]);
          open = -1;
        }
      }
      if (open >= 0) segs.push([open, t1]);

      if (!segs.length) segs = [[t0, t1]];

      /* 2. 把词按字数比例分到有声段 */
      var totalChars = 0;
      for (var c = 0; c < row.length; c++) totalChars += row[c].text.length;
      totalChars = totalChars || 1;

      var voiced = 0;
      for (var s = 0; s < segs.length; s++) voiced += segs[s][1] - segs[s][0];
      if (voiced < 0.1) voiced = span;

      var out = [];
      var segIdx = 0;
      var cursor = segs[0][0];

      for (var i = 0; i < row.length; i++) {
        var tok = row[i];
        var want = (voiced * tok.text.length) / totalChars;
        var startT = cursor;
        var acc = 0;

        while (acc < want && segIdx < segs.length) {
          var seg = segs[segIdx];
          var avail = seg[1] - cursor;
          var take = Math.min(avail, want - acc);
          acc += take;
          cursor += take;
          if (cursor >= seg[1] - 1e-6) {
            segIdx += 1;
            if (segIdx < segs.length) cursor = segs[segIdx][0];
          }
        }

        out.push(cloneTok(tok, startT, Math.max(0.12, acc)));
      }

      var lastOut = out[out.length - 1];
      lastOut.dur = Math.max(0.15, t1 - lastOut.t);

      rowsOut.push(out);
    }

    return applyRows(alan, rowsOut, true);
  }

  /* ---------- 导入 Whisper 词级 JSON ---------- */

  function normalizeWords(data) {
    var words = data && (data.words || data);
    if (!Array.isArray(words) || !words.length) {
      throw new Error("JSON 里没有 words 数组");
    }

    return words
      .map(function (w) {
        var word = String(w.word || w.text || "").trim();
        var start = Number(w.start != null ? w.start : w.t);
        var end = Number(w.end != null ? w.end : start + 0.3);
        return { word: word, start: start, end: end };
      })
      .filter(function (w) {
        return w.word && isFinite(w.start) && isFinite(w.end) && w.end > w.start;
      });
  }

  function fromWhisper(alan, data) {
    var list = normalizeWords(data);
    var wi = 0;
    var rowsOut = [];

    alan.rows.forEach(function (row) {
      var out = [];
      row.forEach(function (tok) {
        if (wi >= list.length) {
          out.push(cloneTok(tok, tok.t, tok.dur));
          return;
        }
        var w = list[wi];
        wi += 1;
        out.push(cloneTok(tok, Math.max(0, w.start), Math.max(0.12, w.end - w.start)));
      });
      rowsOut.push(out);
    });

    return applyRows(alan, rowsOut, true);
  }

  /* ---------- 质量检查 ---------- */

  function quality(alan) {
    var issues = [];
    var rows = (alan && alan.rows) || [];
    var prevEnd = -1;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row.length) continue;

      if (row[0].t < prevEnd - 0.3) {
        issues.push("第 " + (i + 1) + " 句与上一句时间重叠");
      }

      var end = row[row.length - 1].t + row[row.length - 1].dur;
      if (end < row[0].t) issues.push("第 " + (i + 1) + " 句时间倒置");

      prevEnd = Math.max(prevEnd, end);
    }

    return { ok: issues.length === 0, issues: issues.slice(0, 4) };
  }

  NS.align = {
    fromEnergy: fromEnergy,
    fromWhisper: fromWhisper,
    quality: quality,
    applyRows: applyRows
  };
})(window.CodeMV);
