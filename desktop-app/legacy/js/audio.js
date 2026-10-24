/* ==========================================================================
   CodeMV · 音频解码与分析
   --------------------------------------------------------------------------
   • 解码用户上传的音频 → AudioBuffer
   • 预计算「能量包络 / 低频包络 / 节拍点 / BPM」
   • 提供按时间 t 采样这些特征的纯函数（渲染时不做任何状态积累）
   • 内置一段示例音频，方便没有文件时直接体验
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var ctx = null;

  function context() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /* ---------- 解码 ---------- */

  function decodeFile(file) {
    return file.arrayBuffer().then(function (buf) {
      return context().decodeAudioData(buf);
    });
  }

  /** 从 ArrayBuffer 解码（网易云拉回来的音频走这条路） */
  function decodeArrayBuffer(buf) {
    return context().decodeAudioData(buf);
  }

  /* ---------- 示例音频（合成，无需任何素材） ---------- */

  function buildDemoBuffer(seconds) {
    var sr = 44100;
    var len = Math.floor(sr * seconds);
    var buffer = context().createBuffer(1, len, sr);
    var data = buffer.getChannelData(0);

    var bpm = 96;
    var beat = 60 / bpm;

    for (var i = 0; i < len; i++) {
      var t = i / sr;
      var v = 0;

      /* 和弦铺底（A 小调） */
      v += 0.1 * Math.sin(2 * Math.PI * 220 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.08 * t));
      v += 0.07 * Math.sin(2 * Math.PI * 261.63 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.11 * t + 1));
      v += 0.06 * Math.sin(2 * Math.PI * 329.63 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.07 * t + 2));

      /* 每拍一个底鼓 */
      var bp = t % beat;
      v += 0.55 * Math.exp(-bp * 22) * Math.sin(2 * Math.PI * 55 * bp);

      /* 反拍踩镲 */
      var hp = (t + beat / 2) % beat;
      v += 0.06 * Math.exp(-hp * 70) * (Math.random() * 2 - 1);

      data[i] = Math.tanh(v * 1.15);
    }

    return buffer;
  }

  /* ---------- 分析 ---------- */

  function analyze(buffer) {
    var sr = buffer.sampleRate;
    var channels = buffer.numberOfChannels;
    var total = buffer.length;

    /* 混成单声道 */
    var mono = new Float32Array(total);
    for (var c = 0; c < channels; c++) {
      var ch = buffer.getChannelData(c);
      for (var i = 0; i < total; i++) {
        mono[i] += ch[i] / channels;
      }
    }

    var win = 2048;
    var hop = 1024;
    var frames = Math.max(1, Math.floor((total - win) / hop) + 1);

    var energy = new Float32Array(frames);
    var bass = new Float32Array(frames);

    /* 简单一阶低通，近似 120Hz 以下的低频 */
    var alpha = 1 - Math.exp((-2 * Math.PI * 120) / sr);
    var lp = 0;

    for (var f = 0; f < frames; f++) {
      var start = f * hop;
      var sum = 0;
      var bsum = 0;

      for (var j = 0; j < win; j++) {
        var s = mono[start + j] || 0;
        lp += alpha * (s - lp);
        sum += s * s;
        bsum += lp * lp;
      }

      energy[f] = Math.sqrt(sum / win);
      bass[f] = Math.sqrt(bsum / win);
    }

    normalize(energy);
    normalize(bass);

    /* 起音点 → 节拍 */
    var onset = new Float32Array(frames);
    for (var k = 1; k < frames; k++) {
      onset[k] = Math.max(0, energy[k] - energy[k - 1]);
    }

    var mean = 0;
    for (var m = 0; m < frames; m++) mean += onset[m];
    mean /= frames || 1;

    var variance = 0;
    for (var v = 0; v < frames; v++) {
      var d = onset[v] - mean;
      variance += d * d;
    }
    var std = Math.sqrt(variance / (frames || 1));
    var threshold = mean + std * 0.9;

    var beats = [];
    var minGap = Math.floor((0.22 * sr) / hop);
    var last = -1e9;

    for (var b = 1; b < frames - 1; b++) {
      if (
        onset[b] > threshold &&
        onset[b] >= onset[b - 1] &&
        onset[b] >= onset[b + 1] &&
        b - last > minGap
      ) {
        beats.push((b * hop) / sr);
        last = b;
      }
    }

    /* BPM 估计 */
    var bpm = 0;
    if (beats.length > 3) {
      var gaps = [];
      for (var g = 1; g < beats.length; g++) {
        gaps.push(beats[g] - beats[g - 1]);
      }
      gaps.sort(function (a, b2) {
        return a - b2;
      });
      var median = gaps[Math.floor(gaps.length / 2)];
      if (median > 0.15 && median < 2) {
        bpm = Math.round(60 / median);
        while (bpm > 180) bpm = Math.round(bpm / 2);
        while (bpm > 0 && bpm < 60) bpm = Math.round(bpm * 2);
      }
    }

    return {
      duration: buffer.duration,
      sampleRate: sr,
      hop: hop,
      frames: frames,
      energy: energy,
      bass: bass,
      beats: beats,
      bpm: bpm
    };
  }

  function normalize(arr) {
    var max = 0;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i] > max) max = arr[i];
    }
    if (max <= 0) return;
    for (var j = 0; j < arr.length; j++) arr[j] /= max;
  }

  /* ---------- 按时间采样（纯函数） ---------- */

  function sampleArray(features, arr, t) {
    if (!features || !arr || !arr.length) return 0;
    var idx = (t * features.sampleRate) / features.hop;
    var i0 = Math.floor(idx);
    if (i0 < 0) return arr[0];
    if (i0 >= arr.length - 1) return arr[arr.length - 1];
    var frac = idx - i0;
    return arr[i0] * (1 - frac) + arr[i0 + 1] * frac;
  }

  function energyAt(features, t) {
    return sampleArray(features, features && features.energy, t);
  }

  function bassAt(features, t) {
    return sampleArray(features, features && features.bass, t);
  }

  /** 节拍相位：0 表示正好在拍点上，接近 1 表示下一拍快到了 */
  function beatPhase(features, t) {
    if (!features) return (t * 2) % 1;
    var beatLen = features.bpm > 0 ? 60 / features.bpm : 0.5;

    /* 如果有检测到的拍点，优先用「最近两拍」插值 */
    var beats = features.beats;
    if (beats && beats.length > 2) {
      var lo = 0;
      var hi = beats.length - 1;
      var idx = -1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        if (beats[mid] <= t) {
          idx = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (idx >= 0 && idx < beats.length - 1) {
        var span = beats[idx + 1] - beats[idx];
        if (span > 0.1 && span < 2) {
          return (t - beats[idx]) / span;
        }
      }
    }

    return (t / beatLen) % 1;
  }

  NS.audio = {
    context: context,
    decodeFile: decodeFile,
    decodeArrayBuffer: decodeArrayBuffer,
    buildDemoBuffer: buildDemoBuffer,
    analyze: analyze,
    energyAt: energyAt,
    bassAt: bassAt,
    beatPhase: beatPhase
  };
})(window.CodeMV);
