/* 性能补丁：旧项目在软件渲染的 Electron 里默认按 60fps 重绘，
   这里把 requestAnimationFrame 限制到约 30fps，界面与功能不变。 */
(function () {
  const raf = window.requestAnimationFrame.bind(window);
  let last = 0;
  window.requestAnimationFrame = function (callback) {
    return raf(function tick(time) {
      if (time - last >= 32) {
        last = time;
        callback(time);
      } else {
        raf(tick);
      }
    });
  };
})();
