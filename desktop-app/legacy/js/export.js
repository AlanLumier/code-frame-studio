/* ==========================================================================
   Code MV · 视频导出（实时录制 / 保底方案）
   --------------------------------------------------------------------------
   用 canvas.captureStream + MediaRecorder 实时录制。
   优先 MP4（H.264 + AAC），不支持时回退 WebM。

   修复过的坑：
     • rAF 泄漏：停止 / 出错 / 完成 都会 cancelAnimationFrame
     • 轨道泄漏：录制结束会 stop 所有 MediaStreamTrack
     • 音频节点泄漏：source / gain / destination 会 disconnect
     • 可主动中止：NS.exporter.stop()
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var CANDIDATES = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];

  var active = null; /* 当前录制句柄，便于中止 */

  function pickMime() {
    if (typeof window.MediaRecorder === "undefined") return "";
    for (var i = 0; i < CANDIDATES.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(CANDIDATES[i])) return CANDIDATES[i];
      } catch (e) {
        /* ignore */
      }
    }
    return "";
  }

  function extFor(mime) {
    return mime.indexOf("mp4") >= 0 ? "mp4" : "webm";
  }

  /**
   * 录制整首歌
   * opts: { canvas, audioBuffer, fps, duration, mime, draw(t), onProgress(p) }
   * → Promise<{ blob, mime, ext }>
   */
  function capture(opts) {
    return new Promise(function (resolve, reject) {
      var mime = opts.mime || pickMime();
      if (!mime) {
        reject(new Error("当前浏览器不支持 MediaRecorder，请用 Chrome / Edge 最新版"));
        return;
      }

      var actx = NS.audio.context();
      var source = actx.createBufferSource();
      source.buffer = opts.audioBuffer;

      var dest = actx.createMediaStreamDestination();
      var gain = actx.createGain();
      gain.gain.value = 1;

      source.connect(gain);
      gain.connect(dest);

      var canvasStream = opts.canvas.captureStream(opts.fps || 30);
      var tracks = canvasStream.getVideoTracks().concat(
        dest.stream.getAudioTracks()
      );

      var stream = new MediaStream();
      tracks.forEach(function (track) {
        stream.addTrack(track);
      });

      var chunks = [];
      var recorder;
      var rafId = 0;
      var startedAt = 0;
      var stopped = false;
      var settled = false;

      function cleanup() {
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
        try {
          source.stop();
        } catch (e) {
          /* ignore */
        }
        try {
          source.disconnect();
        } catch (e) {
          /* ignore */
        }
        try {
          gain.disconnect();
        } catch (e) {
          /* ignore */
        }
        tracks.forEach(function (track) {
          try {
            track.stop();
          } catch (e) {
            /* ignore */
          }
        });
        active = null;
      }

      function fail(err) {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      }

      function succeed(result) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      }

      try {
        recorder = new MediaRecorder(stream, {
          mimeType: mime,
          videoBitsPerSecond: opts.videoBitrate || 12000000,
          audioBitsPerSecond: 192000
        });
      } catch (err) {
        cleanup();
        reject(err);
        return;
      }

      recorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onerror = function (e) {
        fail((e && e.error) || new Error("录制失败"));
      };

      recorder.onstop = function () {
        if (stopped) return;
        stopped = true;
        succeed({
          blob: new Blob(chunks, { type: mime }),
          mime: mime,
          ext: extFor(mime)
        });
      };

      function finish() {
        if (settled) return;
        try {
          opts.draw(opts.duration);
        } catch (e) {
          /* ignore */
        }
        try {
          recorder.stop();
        } catch (e) {
          /* ignore */
        }
      }

      function loop() {
        if (settled) return;

        var t = actx.currentTime - startedAt;

        if (t >= opts.duration) {
          finish();
          return;
        }

        opts.draw(t);
        if (opts.onProgress) opts.onProgress(t / opts.duration);
        rafId = window.requestAnimationFrame(loop);
      }

      /* 暴露可中止句柄 */
      active = {
        stop: function () {
          if (settled) return;
          settled = true;
          try {
            recorder.stop();
          } catch (e) {
            /* ignore */
          }
          cleanup();
          reject(new Error("导出已取消"));
        }
      };

      try {
        recorder.start(1000);
        source.start(0);
        startedAt = actx.currentTime;
        rafId = window.requestAnimationFrame(loop);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  function stop() {
    if (active) {
      try {
        active.stop();
      } catch (e) {
        /* ignore */
      }
      active = null;
      return true;
    }
    return false;
  }

  function download(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 4000);
  }

  NS.exporter = {
    pickMime: pickMime,
    capture: capture,
    stop: stop,
    download: download,
    isActive: function () {
      return !!active;
    }
  };
})(window.CodeMV);
