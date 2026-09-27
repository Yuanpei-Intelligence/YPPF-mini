# 微信开发者工具排障

2026-09-09/10 联调课表与设计系统时踩过的坑，按「症状 → 原因 → 处理」记录。下文的 `cli` 指 macOS 上的 `/Applications/wechatwebdevtools.app/Contents/MacOS/cli`。

## 预览没有变化：开发者工具仍在跑旧编译产物

**症状**：改了代码、重新构建后预览不变，例如页面表里没有新页面、新样式不出现。

**先确认打开的目录**。两个命令输出到不同目录，互不覆盖：

| 命令 | 输出目录 |
|---|---|
| `pnpm dev:mp` | `dist/dev/mp-weixin` |
| `pnpm build:mp` | `dist/build/mp-weixin` |

开着 `dist/dev` 却跑了 `build:mp`（或反过来），预览自然不会变。

**目录没错仍是旧的**：开发者工具沿用了上一次加载的编译结果。`cli close --project <dir>` 之后再 `cli auto` 或 `cli open`，仍可能加载旧代码；要彻底退出再打开才会刷新：

```bash
cli quit
cli open --project "$PWD/dist/build/mp-weixin"
```

## 改了代码不再增量编译：`dev:mp` 的 watcher 被杀掉

**症状**：`pnpm dev:mp` 不再输出新的编译日志，或进程已经退出，预览停在旧代码。

**原因**：内存紧张时（同时开着开发者工具、后端容器和别的构建），系统会杀掉 watcher 进程。

**处理**：改用一次性构建 `pnpm build:mp`，在开发者工具里打开 `dist/build/mp-weixin`；每次改完重新构建，再按上一节 `cli quit` 后重新打开。同一时间只跑一个构建。开发者工具里的 `envVersion` 是 `develop`，所以生产构建同样请求 `http://localhost:8000`（见 `src/utils/index.ts#getEnvBaseUrl`）。

## 第一次构建缺分包优化或 `lazyCodeLoading`：读到了上一次生成的 `pages.json` / `manifest.json`

**症状**：新 clone 之后，或刚改完分包（`vite.config.ts` 里的 `UniPages({ subPackages })`、把页面移进分包目录）、`manifest.config.ts` 之后，第一次 `pnpm build:mp` 的产物与配置不符：

- 构建日志里是 `[optimization] 分包优化开启状态: false`；
- 只被分包页面使用的模块（例如 `utils/poster-themes.js`）仍留在主包，分包目录下没有 `common/vendor.js`；
- `manifest.config.ts` 里新加的配置（例如 `lazyCodeLoading`）没有写进 `app.json`。

同一份代码再构建一次就正常。

**原因**：`src/pages.json` 和 `src/manifest.json` 由 Vite 插件在构建过程中重新生成，而 bundle-optimizer 和 uni 读取的是构建开始时磁盘上已有的那一份：新 clone 时是 `pnpm install` 通过 `init-baseFiles` 写入的占位文件（`manifest.json` 是空对象，`pages.json` 里没有分包），改过配置后则是上一次构建留下的旧文件。`pnpm init-baseFiles` 只在这两个文件缺失或为空时写占位内容，不会刷新旧文件，单独运行它解决不了这个问题。

**处理**：测量包体积或出发布包之前，先构建一次（产物可以丢弃）让这两个文件刷新，再正式构建。一次性构建可以用 `UNI_OUTPUT_DIR=<目录> pnpm build:mp` 输出到别处。正式产物确认三点：

- 构建日志里是 `分包优化开启状态: true`；
- `dist/build/mp-weixin/app.json` 含预期的 `subPackages`、`preloadRule`、`lazyCodeLoading`；
- 有模块只被某个分包使用时，该分包目录下有 `common/vendor.js`。

## 「服务器返回了无法识别的错误」或反复跳绑定页：开发用 JWT 过期

**症状**：连本地后端调试一段时间后，页面显示「服务器返回了无法识别的错误」，或反复跳到绑定页。

**原因**：JWT 过期。有效期由后端配置 `token_expire_minutes` 决定，默认 120 分钟。过期后请求返回 401，前端重新走 `wx.login`，本地环境登录走不通时就表现为上面两种情况。这不代表后端故障。

**处理**：重新登录即可。本地没有可用的微信登录时，在后端 `python manage.py shell` 里为测试账号重签 JWT（`api.auth.views._issue_jwt_for_user`），再按下一节注入。

## 自动化测试（miniprogram-automator）

**启动**：开发者工具已登录即可，不必手动打开服务端口。

```bash
cli auto --project "$PWD/dist/build/mp-weixin" --auto-port 9420
```

脚本里用 `automator.connect({ wsEndpoint: 'ws://localhost:9420' })` 连接。连接被关闭或页面表不对时，先 `cli quit` 再重新 `cli auto`。

**注入 JWT**（绕过本地走不通的微信登录）：

```js
await mp.evaluate((token) => {
  getApp().$vm.$pinia._s.get('token').setTokenInfo({ token, expiresIn: 7000 })
}, jwt)
```

**自定义组件内部的元素选不到**：uni-app 以 `virtualHost` 方式编译的自定义组件（例如各页面的底部弹层组件），其内部元素用 `page.$$()` 和 `>>>` 选择器都选不到。改为通过页面实例的 `$refs` 触发组件事件，直接驱动页面逻辑：

```js
await mp.evaluate(() => {
  const page = getCurrentPages().at(-1)
  // 页面模板里 <SomeSheet ref="detailSheet" @action="..." />
  page.$vm.$refs.detailSheet.$emit('action', 'cancel_once')
})
```

`uv-popup` 插槽里的内容属于页面本身，`page.$$()` 能选到。

**原生弹窗点不到**：`uni.showModal`、`uni.showActionSheet` 由原生层渲染，automator 无法点击。在 AppService 里替换对应的 `wx.*` 让它自动确认：

```js
await mp.evaluate(() => {
  Object.defineProperty(wx, 'showModal', {
    configurable: true,
    value: o => setTimeout(() => o.success && o.success({ confirm: true, cancel: false })),
  })
  Object.defineProperty(wx, 'showActionSheet', {
    configurable: true,
    value: o => setTimeout(() => o.success && o.success({ tapIndex: 0 })),
  })
})
```

**按文本找元素**：同一段文字会同时匹配外层容器和内层节点，取文本最短（最内层）的匹配再 `tap()`，否则点到外层容器不会触发事件。
