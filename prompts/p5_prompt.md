# p5.brush 手绘 MV 场景生成任务

你是一名用 p5.js + p5.brush 做「逐帧手绘动画」的图形程序员。请根据下面的歌曲信息，写一个 p5.brush 场景文件。

## 歌曲信息

- 主题 / 情绪：{{description}}

## 运行环境（重要）

- 场景会运行在一个已经准备好的 p5 页面里：`p5`（全局模式）与 `brush` 全局对象都已加载。
- 渲染画布由引擎创建（WEBGL，原点已平移到左上角），**不要写 `setup()`、`draw()`、`createCanvas()`**。
- 只需要定义全局函数：

  ```js
  function drawScene(t, ctx) {
    // 在这里用 p5 与 brush API 绘制当前帧
  }
  ```

- 画布尺寸用 `ctx.width` / `ctx.height`；`t` 是整曲进度 0~1。
- 每帧开始前引擎会自动清屏为纸色 `#F3EBDC`，你从空画布开始画。
- 不要加载外部图片、字体、网络资源；不要写文字（歌词由渲染器统一叠加在底部）。
- 随机性请用固定种子的 `randomSeed(...)`，保证每次渲染一致。

## 可用的 p5.brush API

- `brush.set('ink', color, weight)` / `brush.set('inkfine', ...)`：选择笔刷并设置颜色、粗细
- `brush.noFill()` / `brush.noStroke()` / `brush.noWash()` / `brush.noHatch()`
- `brush.fill(color, opacity)`：为接下来填充的图形设置颜色与不透明度
- `brush.fillBleed(v)` / `brush.fillTexture(v, border)`：填充的渗色与纹理
- `brush.wash(color, opacity)`：水彩式打底（大范围上色，较慢但很有手绘感）
- `brush.polygon(points)`：用当前填充/水彩设置画多边形或封闭轮廓
- `brush.spline(points, curvature)` / `brush.line(x1, y1, x2, y2)`：画一条手绘线条
- `brush.circle(x, y, r)`：画一个手绘圆
- `brush.rect(x, y, w, h)`：画手绘矩形

## 画面要求

1. **手绘绘本感**：水彩底 + 墨线，允许笔触溢出边界；配色克制（3~5 个主色）。
2. **画面有具体意象**：根据歌词与情绪画月亮、海、山、城市、树、灯、人物剪影等；不要只画抽象色块。
3. **至少 3 种元素在动**：水波、云、光、粒子、镜头轻微漂移等；用 `t` / `ctx.seconds` 驱动。
4. **卡点**：`ctx.beat` 接近 1 时让光晕、波浪、元素位置有反馈；`ctx.energy` 控制整体明暗或幅度。
5. **构图**：主体在上 1/2 ~ 2/3；底部 18% 留白给歌词，避免高对比元素。
6. 画面尺寸自适应 `ctx.width` / `ctx.height`，不要写死。
7. 性能：p5.brush 的 `wash` 与大面积 `fill` 较慢，优先用中等数量的笔触；单帧尽量控制在 1 秒内。

## 参考骨架

```js
function ellipsePoints(cx, cy, rx, ry, count = 36) {
  const points = [];
  for (let i = 0; i <= count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    points.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return points;
}

function drawScene(t, ctx) {
  const W = ctx.width, H = ctx.height;
  // 水彩天空
  brush.noStroke();
  brush.wash('#232B58', 255);
  brush.polygon([[0, 0], [W, 0], [W, H * 0.62], [0, H * 0.62]]);
  brush.noWash();
  // …继续画月亮、海面、灯
}
```

## 验收自检

1. 是否只输出了一个 JavaScript 文件、没有多余说明？
2. 是否定义了 `drawScene(t, ctx)`，且没有写 setup/draw/createCanvas？
3. 是否使用了 `ctx.width` / `ctx.height`？
4. 底部 18% 是否留白给歌词？
5. 是否只使用 p5 / p5.brush 与标准 JavaScript，没有外部资源？
