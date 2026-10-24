# mp4-muxer（可选依赖）

把 [Vanilagy/mp4-muxer](https://github.com/Vanilagy/mp4-muxer)（MIT，616★）的浏览器构建放进这个目录，
CodeMV 就会自动启用 **WebCodecs 离线逐帧编码**（比实时录制更快、画质更好）。

## 放什么

只需要一个文件：

```
vendor/mp4-muxer/mp4-muxer.min.js
```

## 怎么拿（任选一种）

```bash
# 方式 1：npm 包里取
npm pack mp4-muxer
tar -xzf mp4-muxer-*.tgz
copy package/build/mp4-muxer.min.js vendor\mp4-muxer\

# 方式 2：直接下载
curl -L https://cdn.jsdelivr.net/npm/mp4-muxer/build/mp4-muxer.min.js -o vendor/mp4-muxer/mp4-muxer.min.js
```

放好之后刷新页面，右上角状态会变成「离线编码 MP4」，导出时就会走逐帧编码而不是实时录制。

## 没有放会怎样

不会报错，CodeMV 会自动回退到 `MediaRecorder` 实时录制（Chrome / Edge 上通常也能导出 MP4，只是
需要等于是歌长的时间，且偶发掉帧）。

## 许可证

mp4-muxer 使用 MIT 协议，版权归 Vanilagy 所有。使用请保留其许可证声明。
