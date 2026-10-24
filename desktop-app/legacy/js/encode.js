/* ==========================================================================
   CodeMV · 离线逐帧编码（WebCodecs + mp4-muxer）
   --------------------------------------------------------------------------
   和「实时录制」的区别：
     实时录制  = 画布 30fps 实时播放 → MediaRecorder 抓流（时长 = 歌长，有掉帧风险）
     离线编码  = 逐帧 seek(t) → VideoEncoder 硬编码 → mp4-muxer 封装（更快、更稳、码率可控）

   依赖（浏览器内置 + 一个 31KB 的开源库）：
     • Chrome / Edge 自带的 WebCodecs：VideoEncoder / AudioEncoder
     • mp4-muxer（MIT，https://github.com/Vanilagy/mp4-muxer）
       把 build/mp4-muxer.min.js 放到 vendor/mp4-muxer/ 即可自动启用，
       没放的话会自动回退到实时录制。

   本文件在缺少依赖时不会报错，只是 available() 返回 false。
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var VIDEO_CODECS = [
    "avc1.640028", // H.264 High
    "avc1.4d0028", // H.264 Main
    "avc1.42001f" // H.264 Baseline
  ];

  var AUDIO_CODECS = ["opus", "mp4a.40.2"]; // Opus 编码更可靠；AAC 兜底

  function hasWebCodecs() {
    return (
      typeof window.VideoEncoder !== "undefined" &&
      typeof window.AudioEncoder !== "undefined" &&
      typeof window.VideoFrame !== "undefined" &&
      typeof window.AudioData !== "undefined"
    );
  }

  function hasMuxer() {
    var M = window.Mp4Muxer;
    return !!(M && (M.Muxer || M.default) && (M.ArrayBufferTarget || (M.default && M.default.ArrayBufferTarget)));
  }

  function muxerApi() {
    var M = window.Mp4Muxer || {};
    var Muxer = M.Muxer || (M.default && M.default.Muxer);
    var Target = M.ArrayBufferTarget || (M.default && M.default.ArrayBufferTarget);
    return { Muxer: Muxer, ArrayBufferTarget: Target };
  }

  function available() {
    return hasWebCodecs() && hasMuxer();
  }

  function status() {
    if (!hasWebCodecs()) {
      return {
        ok: false,
        reason: "当前浏览器不支持 WebCodecs（需要 Chrome / Edge 94+）"
      };
    }
    if (!hasMuxer()) {
      return {
        ok: false,
        reason:
          "缺少 mp4-muxer（把 mp4-muxer.min.js 放进 vendor/mp4-muxer/ 即可启用离线编码）"
      };
    }
    return { ok: true, reason: "离线逐帧编码可用" };
  }

  /** 检测当前浏览器支持哪些编码 */
  function probe(width, height, fps, audioCfg) {
    var w = width || 1920;
    var h = height || 1080;
    var fr = fps || 30;

    var result = {
      webcodecs: hasWebCodecs(),
      muxer: hasMuxer(),
      video: null,
      audio: null,
      audioSampleRate: null
    };

    if (!result.webcodecs) return Promise.resolve(result);

    var jobs = [];

    VIDEO_CODECS.forEach(function (codec) {
      jobs.push(
        window.VideoEncoder.isConfigSupported({
          codec: codec,
          width: w,
          height: h,
          bitrate: 12000000,
          framerate: fr
        })
          .then(function (res) {
            if (!result.video && res && res.supported) result.video = codec;
          })
          .catch(function () {})
      );
    });

    var audioRates = [];
    var wantRate = audioCfg && audioCfg.sampleRate ? audioCfg.sampleRate : 48000;
    [wantRate, 48000, 44100].forEach(function (r) {
      if (audioRates.indexOf(r) < 0) audioRates.push(r);
    });
    var wantChannels = audioCfg && audioCfg.numberOfChannels ? Math.min(2, audioCfg.numberOfChannels) : 2;

    AUDIO_CODECS.forEach(function (codec) {
      audioRates.forEach(function (rate) {
        jobs.push(
          window.AudioEncoder.isConfigSupported({
            codec: codec,
            sampleRate: rate,
            numberOfChannels: wantChannels,
            bitrate: 192000
          })
            .then(function (res) {
              /* 优先级：编码器顺序（Opus > AAC）× 采样率（真实 > 48k > 44.1k） */
              var codecRank = codec === "opus" ? 2 : 1;
              var rateRank = rate === wantRate ? 3 : rate === 48000 ? 2 : 1;
              var priority = codecRank * 10 + rateRank;
              if (res && res.supported) {
                if (!result.audio || priority > (result.audioPriority || 0)) {
                  result.audio = codec;
                  result.audioSampleRate = rate;
                  result.audioPriority = priority;
                }
              }
            })
            .catch(function () {})
        );
      });
    });

    return Promise.all(jobs).then(function () {
      return result;
    });
  }

  function nextTick() {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, 0);
    });
  }

  /**
   * 逐帧编码整首歌
   * opts: {
   *   canvas, audioBuffer, duration, fps, width, height, bitrate,
   *   draw(t), onProgress(p)
   * }
   */
  var cancelled = false;

  function cancel() {
    cancelled = true;
  }

  function encode(opts) {
    return new Promise(function (resolve, reject) {
      var st = status();
      if (!st.ok) {
        reject(new Error(st.reason));
        return;
      }

      var api = muxerApi();

      var W = opts.width || 1920;
      var H = opts.height || 1080;
      var fps = opts.fps || 30;
      var bitrate = opts.bitrate || 12000000;
      var duration = opts.duration;
      var totalFrames = Math.max(1, Math.round(duration * fps));

      var probeAudio = opts.audioBuffer
        ? {
            sampleRate: opts.audioBuffer.sampleRate,
            numberOfChannels: Math.min(2, opts.audioBuffer.numberOfChannels)
          }
        : undefined;

      cancelled = false;

      probe(W, H, fps, probeAudio)
        .then(function (caps) {
          if (!caps.video) {
            throw new Error("没有可用的 H.264 编码器");
          }

          var muxerOptions = {
            target: new api.ArrayBufferTarget(),
            video: { codec: "avc", width: W, height: H },
            fastStart: "in-memory"
          };

          var audioBuffer = opts.audioBuffer;
          var useAudio = !!(caps.audio && audioBuffer);

          if (useAudio) {
            muxerOptions.audio = {
              codec: caps.audio === "opus" ? "opus" : "aac",
              sampleRate: caps.audioSampleRate || audioBuffer.sampleRate,
              numberOfChannels: Math.min(2, audioBuffer.numberOfChannels)
            };
          }

          var muxer = new api.Muxer(muxerOptions);
          var encoderErrors = [];

          var videoEncoder = new window.VideoEncoder({
            output: function (chunk, meta) {
              muxer.addVideoChunk(chunk, meta);
            },
            error: function (e) {
              encoderErrors.push(e);
            }
          });

          videoEncoder.configure({
            codec: caps.video,
            width: W,
            height: H,
            bitrate: bitrate,
            framerate: fps,
            latencyMode: "quality"
          });

          var audioEncoder = null;
          if (useAudio) {
            /* Chrome 的 AAC AudioEncoder 不返回 decoderConfig.description，
               mp4-muxer 需要 AudioSpecificConfig，否则音频轨无法解码（导出无声）。 */
            var audioSampleRate = caps.audioSampleRate || audioBuffer.sampleRate;
            var audioChannels = Math.min(2, audioBuffer.numberOfChannels);
            var ascTable = { 96000: 0, 88200: 1, 64000: 2, 48000: 3, 44100: 4, 32000: 5, 24000: 6, 22050: 7, 16000: 8, 12000: 9, 11025: 10, 8000: 11 };
            var sfi = ascTable[audioSampleRate];
            if (sfi === undefined) sfi = 4;
            var asc = new Uint8Array(2);
            asc[0] = ((2 << 3) | (sfi >> 1)) & 0xff; /* AAC-LC (AOT=2) + 采样率高 3 位 */
            asc[1] = (((sfi & 1) << 7) | (audioChannels << 3)) & 0xff; /* 采样率最低位 + 声道 */

            audioEncoder = new window.AudioEncoder({
              output: function (chunk, meta) {
                var outMeta = meta || {};
                if (caps.audio && caps.audio.indexOf("mp4a") === 0) {
                  var desc = outMeta.decoderConfig && outMeta.decoderConfig.description;
                  if (!desc) {
                    outMeta.decoderConfig = {
                      codec: caps.audio,
                      sampleRate: audioSampleRate,
                      numberOfChannels: audioChannels,
                      description: asc.buffer.slice(0)
                    };
                  }
                }
                muxer.addAudioChunk(chunk, outMeta);
              },
              error: function (e) {
                encoderErrors.push(e);
              }
            });

            audioEncoder.configure({
              codec: caps.audio,
              sampleRate: caps.audioSampleRate || audioBuffer.sampleRate,
              numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
              bitrate: 192000
            });
          }

          var frameIndex = 0;

          function encodeVideoFrame() {
            if (cancelled) {
              try { videoEncoder.close(); } catch (e) {}
              if (audioEncoder) { try { audioEncoder.close(); } catch (e) {} }
              reject(new Error("导出已取消"));
              return;
            }
            if (frameIndex >= totalFrames) {
              videoEncoder
                .flush()
                .then(function () {
                  return encodeAudio();
                })
                .then(function () {
                  muxer.finalize();
                  if (encoderErrors.length) {
                    throw encoderErrors[0];
                  }
                  resolve({
                    blob: new Blob([muxer.target.buffer], { type: "video/mp4" }),
                    mime: "video/mp4",
                    ext: "mp4",
                    frames: totalFrames,
                    hasAudio: useAudio,
                    audioCodec: caps.audio || null,
                    audioSampleRate: caps.audioSampleRate || null
                  });
                })
                .catch(reject);
              return;
            }

            if (encoderErrors.length) {
              reject(encoderErrors[0]);
              return;
            }

            var t = frameIndex / fps;
            var drawn = opts.draw(t);
            if (drawn && typeof drawn.then === "function") {
              drawn.then(function () { encodeOneFrame(t); }).catch(reject);
              return;
            }
            encodeOneFrame(t);

            function encodeOneFrame(tt) {
              if (cancelled) {
                try { videoEncoder.close(); } catch (e) {}
                if (audioEncoder) { try { audioEncoder.close(); } catch (e) {} }
                reject(new Error("导出已取消"));
                return;
              }
              var frame = new window.VideoFrame(opts.canvas, {
                timestamp: Math.round((frameIndex * 1e6) / fps),
                duration: Math.round(1e6 / fps)
              });
              videoEncoder.encode(frame, { keyFrame: frameIndex % Math.round(fps * 2) === 0 });
              frame.close();
              frameIndex += 1;
              if (opts.onProgress) opts.onProgress((frameIndex / totalFrames) * 0.82);
              if (videoEncoder.encodeQueueSize > 6 || frameIndex % 6 === 0) {
                window.setTimeout(encodeVideoFrame, 0);
              } else {
                encodeVideoFrame();
              }
            }
          }

          function resampleAudio(buffer, rate) {
            if (buffer.sampleRate === rate) return Promise.resolve(buffer);
            var OfflineCtor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
            if (!OfflineCtor) return Promise.resolve(buffer);
            var channels = Math.min(2, buffer.numberOfChannels);
            var length = Math.max(1, Math.ceil(buffer.duration * rate));
            var off = new OfflineCtor(channels, length, rate);
            var src = off.createBufferSource();
            src.buffer = buffer;
            src.connect(off.destination);
            src.start(0);
            return off.startRendering().catch(function () { return buffer; });
          }

          function encodeAudio() {
            if (!audioEncoder || !audioBuffer) return Promise.resolve();

            return resampleAudio(audioBuffer, caps.audioSampleRate || audioBuffer.sampleRate).then(function (buffer) {
              audioBuffer = buffer;
              return encodeAudioBuffer();
            });
          }

          function encodeAudioBuffer() {
            var sr = audioBuffer.sampleRate;
            var channels = Math.min(2, audioBuffer.numberOfChannels);
            var length = audioBuffer.length;
            var chunk = 1024;
            var data = [];

            for (var c = 0; c < channels; c++) {
              data.push(audioBuffer.getChannelData(c));
            }

            var offset = 0;

            function pump() {
              return new Promise(function (resolve, reject) {
                function step() {
                  if (cancelled) { reject(new Error("导出已取消")); return; }
                  if (offset >= length) {
                    audioEncoder.flush().then(resolve, reject);
                    return;
                  }
                  var n = Math.min(chunk, length - offset);
                  var interleaved = new Float32Array(n * channels);
                  for (var i = 0; i < n; i++) {
                    for (var c2 = 0; c2 < channels; c2++) {
                      interleaved[i * channels + c2] = data[c2][offset + i];
                    }
                  }
                  var audioData = new window.AudioData({
                    format: "f32",
                    sampleRate: sr,
                    numberOfFrames: n,
                    numberOfChannels: channels,
                    timestamp: Math.round((offset / sr) * 1e6),
                    data: interleaved
                  });
                  audioEncoder.encode(audioData);
                  audioData.close();
                  offset += n;
                  if (opts.onProgress) opts.onProgress(0.82 + (offset / length) * 0.18);
                  if (audioEncoder.encodeQueueSize > 12 || offset % (1024 * 8) === 0) {
                    window.setTimeout(step, 0);
                  } else {
                    step();
                  }
                }
                step();
              });
            }

            return pump();
          }

          window.setTimeout(encodeVideoFrame, 0);
        })
        .catch(reject);
    });
  }

  NS.encoder = {
    available: available,
    status: status,
    probe: probe,
    encode: encode,
    cancel: cancel
  };
})(window.CodeMV);
