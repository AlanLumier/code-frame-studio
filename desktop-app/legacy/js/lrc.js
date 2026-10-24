/* ==========================================================================
   CodeMV · LRC 歌词解析
   --------------------------------------------------------------------------
   • 支持标准 LRC：[mm:ss.xx] 歌词
   • 支持一行多个时间戳：[00:12.00][00:48.00] 副歌
   • 支持纯文本歌词（没有时间戳时按顺序均匀铺满整首歌）
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var TAG_RE = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

  /**
   * 解析 LRC 文本 → [{ time: number|null, text: string }]
   */
  function parse(text) {
    var out = [];
    if (!text) return out;

    var rows = String(text).split(/\r?\n/);

    for (var i = 0; i < rows.length; i++) {
      var raw = rows[i];

      /* 先取出这一行里的所有时间戳 */
      var times = [];
      var m;
      TAG_RE.lastIndex = 0;
      while ((m = TAG_RE.exec(raw))) {
        var min = parseInt(m[1], 10);
        var sec = parseInt(m[2], 10);
        var frac = 0;
        if (m[3]) {
          frac = parseInt(m[3], 10) / Math.pow(10, m[3].length);
        }
        times.push(min * 60 + sec + frac);
      }

      var content = raw.replace(TAG_RE, "").trim();

      /* 过滤纯标签行（如 [ar:xxx] [ti:xxx]）与空行 */
      if (!content) continue;

      if (!times.length) {
        out.push({ time: null, text: content });
      } else {
        for (var j = 0; j < times.length; j++) {
          out.push({ time: times[j], text: content });
        }
      }
    }

    /* 有时间戳的在前，无时间戳的在后 */
    out.sort(function (a, b) {
      var ta = a.time == null ? Infinity : a.time;
      var tb = b.time == null ? Infinity : b.time;
      return ta - tb;
    });

    return out;
  }

  /**
   * 补全时间轴：
   *  - 全部有时间戳 → 直接返回
   *  - 全部没有时间戳 → 按顺序均匀铺满 duration（留头尾各 2 秒）
   *  - 混合 → 丢弃无时间戳的行
   */
  function normalize(lines, duration) {
    if (!lines || !lines.length) return [];

    var timed = lines.filter(function (l) {
      return l.time != null && isFinite(l.time);
    });

    if (timed.length === lines.length) {
      timed.sort(function (a, b) {
        return a.time - b.time;
      });
      return timed;
    }

    if (timed.length === 0) {
      var start = Math.min(2, duration * 0.05);
      var end = Math.max(start + 1, duration - 2);
      var step = lines.length > 1 ? (end - start) / (lines.length - 1) : 0;
      return lines.map(function (l, i) {
        return { time: start + step * i, text: l.text };
      });
    }

    return timed.sort(function (a, b) {
      return a.time - b.time;
    });
  }

  /** 在已排序歌词里找 t 时刻正在唱的那一行（二分） */
  function indexAt(lines, t) {
    if (!lines.length) return -1;
    var lo = 0;
    var hi = lines.length - 1;
    var ans = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (lines[mid].time <= t) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  /** 秒 → mm:ss */
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return (m < 10 ? "0" + m : m) + ":" + (s < 10 ? "0" + s : s);
  }

  NS.lrc = {
    parse: parse,
    normalize: normalize,
    indexAt: indexAt,
    formatTime: formatTime
  };
})(window.CodeMV);
