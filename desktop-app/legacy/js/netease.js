/* ==========================================================================
   CodeMV · 网易云音乐（非官方接口）
   --------------------------------------------------------------------------
   说明：
   • 网易云没有官方开放 API，这里走的是社区常用的非官方接口
   • 浏览器直接请求会被 CORS 拦住，所以默认请求本地代理 server.js
   • 只做「搜歌 → 取歌词 → 取音频流」，不保存任何账号信息到远端
   • 风险：可能违反服务条款、存在账号风控与接口失效风险，仅建议个人学习使用
   ========================================================================== */

window.CodeMV = window.CodeMV || {};

(function (NS) {
  "use strict";

  var KEY_BASE = "codemv.netease.base";
  var KEY_COOKIE_SESSION = "codemv.netease.cookie";        /* 默认：只存在当前标签页 */
  var KEY_COOKIE_LOCAL = "codemv.netease.cookie.remember"; /* 可选：勾选记住才落盘 */

  function defaultBase() {
    return window.location.protocol === "file:" ? "http://127.0.0.1:8899" : "";
  }

  function base() {
    var v = window.localStorage.getItem(KEY_BASE);
    return (v || defaultBase()).replace(/\/$/, "");
  }

  function setBase(v) {
    window.localStorage.setItem(KEY_BASE, String(v || "").trim());
  }

  /**
   * Cookie 存储策略：
   *  • 默认 sessionStorage（关掉标签页就没了，降低泄露风险）
   *  • 用户勾选「记住」才写 localStorage
   *  • 只会转发给本机代理（127.0.0.1 / localhost），避免把 Cookie 发给陌生服务器
   */
  function cookie() {
    return (
      window.sessionStorage.getItem(KEY_COOKIE_SESSION) ||
      window.localStorage.getItem(KEY_COOKIE_LOCAL) ||
      ""
    );
  }

  function setCookie(v, remember) {
    var value = String(v || "").trim();

    if (remember) {
      window.localStorage.setItem(KEY_COOKIE_LOCAL, value);
      window.sessionStorage.removeItem(KEY_COOKIE_SESSION);
    } else {
      window.sessionStorage.setItem(KEY_COOKIE_SESSION, value);
      window.localStorage.removeItem(KEY_COOKIE_LOCAL);
    }
  }

  function remembersCookie() {
    return !!window.localStorage.getItem(KEY_COOKIE_LOCAL);
  }

  function request(path) {
    var b = base();
    if (!b) {
      return Promise.reject(new Error("未配置 API 地址，请先运行 node server.js"));
    }

    var headers = {};
    /* 安全边界：Cookie 只发给本机代理 */
    if (cookie() && isLocal(base())) headers["x-netease-cookie"] = cookie();

    return fetch(b + path, { headers: headers }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  /** 搜歌 → [{ id, name, artists, album, duration }] */
  function search(keywords, limit) {
    if (!keywords) return Promise.resolve([]);

    return request(
      "/api/search?keywords=" +
        encodeURIComponent(keywords) +
        "&limit=" +
        (limit || 20)
    ).then(function (data) {
      var songs =
        (data && data.result && data.result.songs) ||
        (data && data.songs) ||
        [];

      return songs.map(function (s) {
        var artists = s.artists || s.ar || [];
        var album = s.album || s.al || {};
        return {
          id: s.id || s.songId,
          name: s.name || s.title || "未知歌曲",
          artists: artists
            .map(function (a) {
              return a.name;
            })
            .join(" / "),
          album: album.name || "",
          picUrl: (s.album && s.album.picUrl) || (s.al && s.al.picUrl) || "",
          duration: Math.round((s.duration || s.dt || 0) / 1000)
        };
      });
    });
  }

  /** 取歌词 → { lrc, tlyric } */
  function lyric(id) {
    return request("/api/lyric?id=" + encodeURIComponent(id)).then(function (data) {
      var lrc = data && data.lrc && data.lrc.lyric ? data.lrc.lyric : "";
      var tlyric = data && data.tlyric && data.tlyric.lyric ? data.tlyric.lyric : "";

      if (!lrc.trim()) throw new Error("这首歌没有歌词");
      return { lrc: lrc, tlyric: tlyric };
    });
  }

  /** 音频流地址（走本地代理，避免 CORS 与防盗链） */
  function songUrl(id) {
    return base() + "/api/audio?id=" + encodeURIComponent(id);
  }

  /* 自动发现本地代理：优先同源（node server.js 托管页面时），
     再试 127.0.0.1:8899（file:// 或其它端口打开时） */
  function autoDetect() {
    var candidates = [];
    if (location.protocol === "http:" || location.protocol === "https:") {
      candidates.push(location.origin);
    }
    candidates.push("http://127.0.0.1:8899");
    var saved = base();
    if (saved) candidates.push(saved);

    var seen = {};
    candidates = candidates.filter(function (c) {
      var key = String(c).replace(/\/+$/, "");
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });

    return new Promise(function (resolve) {
      var i = 0;
      function next() {
        if (i >= candidates.length) {
          resolve(null);
          return;
        }
        var origin = String(candidates[i++]).replace(/\/+$/, "");
        var url = origin + "/api/health";
        var ctrl =
          typeof AbortController !== "undefined" ? new AbortController() : null;
        var timer = setTimeout(function () {
          if (ctrl) ctrl.abort();
        }, 1800);
        fetch(url, ctrl ? { signal: ctrl.signal } : {})
          .then(function (r) {
            return r.json();
          })
          .then(function (data) {
            clearTimeout(timer);
            if (data && data.ok) {
              setBase(origin);
              resolve(origin);
            } else {
              next();
            }
          })
          .catch(function () {
            clearTimeout(timer);
            next();
          });
      }
      next();
    });
  }

  function isLocal(url) {
    return /^(https?:\/\/)?(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(
      String(url || "")
    );
  }

  NS.netease = {
    base: base,
    setBase: setBase,
    cookie: cookie,
    setCookie: setCookie,
    autoDetect: autoDetect,
    remembersCookie: remembersCookie,
    isLocal: isLocal,
    search: search,
    lyric: lyric,
    songUrl: songUrl
  };
})(window.CodeMV);
