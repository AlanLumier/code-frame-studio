/* Lemo 参考风格：保留 59 个真实风格素材，但不再伪装成旧 CodeMV 的参数化风格。
   旧风格只保留 10 个精选 + 逐字生成，减少雷同。 */
(function (NS) {
  if (!NS.styleLibrary || !NS.styleLibrary.list) return;

  var featured = NS.styleLibrary.FEATURED || [];
  NS.styleLibrary.list = NS.styleLibrary.list.filter(function (s) {
    return featured.indexOf(s.id) >= 0;
  });
  NS.styleLibrary.CATEGORIES.length = 0;
  NS.styleLibrary.CATEGORIES.push(
    { id: "scene", name: "逐字生成", desc: "按歌词内容实时渲染（内置引擎）" },
    { id: "featured", name: "精选主题", desc: "10 套最有辨识度的旧主题" }
  );

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function init() {
    var panel = document.querySelector('[data-panel="style"]');
    if (!panel || document.getElementById("lemoRefBlock")) return;

    var section = el("section", "block block--flat");
    section.id = "lemoRefBlock";
    var head = el("h2", null, "Lemo 参考风格 ");
    var chip = el("span", "chip", "59");
    head.appendChild(chip);
    section.appendChild(head);
    section.appendChild(el("p", "tip", "这些是 Lemo-Opuscar 的电影风格实拍卡，不是旧 CodeMV 的参数化预设。点选后用于 AI 生成提示词；不会把 59 种硬套成旧渲染器的换色。"));

    var grid = el("div");
    grid.id = "lemoRefGrid";
    grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:320px;overflow:auto;margin:8px 0";
    section.appendChild(grid);

    var selected = el("div", "tip");
    selected.id = "lemoRefSelected";
    selected.textContent = "未选择 Lemo 参考风格";
    section.appendChild(selected);

    var preview = el("div");
    preview.id = "lemoRefPreview";
    preview.style.cssText = "display:none;margin-top:8px;border:1px solid rgba(255,255,255,.1);border-radius:8px;overflow:hidden";
    section.appendChild(preview);

    panel.insertBefore(section, panel.firstChild);

    fetch("/style-library/catalog.json").then(function (r) { return r.json(); }).then(function (list) {
      grid.innerHTML = "";
      list.forEach(function (style) {
        var card = el("button");
        card.type = "button";
        card.title = style.line_cn || style.en;
        card.style.cssText = "padding:0;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(255,255,255,.03);overflow:hidden;cursor:pointer;text-align:left;color:inherit";
        var img = el("img");
        img.src = "/style-library/img/" + style.slug + "_0.jpg";
        img.alt = style.cn;
        img.style.cssText = "width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#111";
        var label = el("span", null, style.cn);
        label.style.cssText = "display:block;padding:5px 6px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
        card.appendChild(img);
        card.appendChild(label);
        card.addEventListener("click", function () {
          window.LEMO_REF = {
            slug: style.slug, cn: style.cn, en: style.en, cat: style.cat,
            uses: style.uses, image: "/style-library/img/" + style.slug + "_0.jpg", md: ""
          };
          Array.prototype.forEach.call(grid.children, function (c) { c.style.outline = "none"; });
          card.style.outline = "2px solid #ffb35c";
          selected.textContent = "已选择 Lemo 参考：" + style.cn + " · " + style.en;
          preview.style.display = "block";
          preview.innerHTML = "";
          var big = el("img");
          big.src = window.LEMO_REF.image;
          big.style.cssText = "width:100%;display:block";
          preview.appendChild(big);
          var desc = el("p", "tip", (style.line_cn || "") + (style.uses ? " · " + style.uses.join(" / ") : ""));
          desc.style.cssText = "padding:8px;margin:0";
          preview.appendChild(desc);
          fetch("/style-library/lemo/" + style.slug + ".md").then(function (r) {
            return r.ok ? r.text() : "";
          }).then(function (md) {
            window.LEMO_REF.md = md;
          }).catch(function () {});
          if (NS.utils && NS.utils.toast) NS.utils.toast("已选 Lemo 参考：" + style.cn, "ok");
        });
        grid.appendChild(card);
      });
    }).catch(function (error) {
      section.appendChild(el("p", "tip", "Lemo 素材加载失败：" + error.message));
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(init, 600); });
  } else {
    setTimeout(init, 600);
  }
})(window.CodeMV);
