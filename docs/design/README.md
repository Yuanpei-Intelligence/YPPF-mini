# YPPF 小程序设计实践指南

本文是 YPPF 微信小程序（本仓库）的**设计实践层**：设计令牌、页面骨架、组件选用、状态与反馈、文案、页面模板、迁移对照与自检清单。

跨端的**总则与规则库**（Apple HIG、微信小程序设计指南、Material 3、WCAG、NN/g 启发式的整理，以及市场最佳实践）维护在飞书主库：**产品团队 → 产品学习培养 → [《YPPF 设计与交互规范（主库）》](https://epu4t4i0lr.feishu.cn/docx/AFhDdqPiLoScfrxNMlecYE9snHn)**（子文档：规则库、场景模式与最佳实践、场景：反馈工单·通用交互模式、场景：预约·活动报名与签到·课表、微文案规范与页面模板）。主库是唯一真源，网页端和小程序端都是主库的实践；规则冲突时以主库为准，本文只记录小程序上的落地方式。改本文之前先看主库对应条目的编号（如 `NAV-03`）。

与 `AGENTS.md` 的关系：`AGENTS.md` 规定工程约束（分层、错误契约、验证），本文规定视觉与交互约定；两者都要遵守。

---

## 1. 视觉基调

**白色原生导航栏 + 浅灰页面底 + 白色圆角卡片 + 品牌蓝只用于强调与主操作。**

- 蓝色不再用作导航栏、页头大色块或整页背景；它出现在主按钮、选中态、链接、图标强调。
- 北大红（`brand`）是身份色，不是交互色：只在标志、品牌文字、元气值展示数字、品牌横幅这几处出现，少而准；它与错误红同色相，所以绝不进按钮、胶囊、表单。
- 一屏最多一个主按钮（`btn-primary`），其余动作用次级/文字按钮。
- 信息层级靠字号与文字颜色（`text-fg-1/2/3`）表达，不靠加粗一切、也不靠更多颜色。
- 状态用文字 + 语义色胶囊（`StatusTag`）表达，绝不只靠颜色。

## 2. 设计令牌

令牌在三处保持同值，改任何一个值要同时改另外两处：

| 层 | 文件 | 用途 |
|---|---|---|
| SCSS 变量 `$yp-*` | `src/uni.scss`（自动注入每个组件的 `<style lang="scss">`） | `<style>` 里编译期取值；同文件把 `$uv-*` 别名到 `var(--yp-*)` 桥接给 uv-ui（uv-ui 对这些变量只做文本代入，没有颜色运算，所以运行时换肤也会同步生效） |
| CSS 变量 `--yp-*` | `src/style/index.scss`（声明在 `page` 上） | 运行期取值；UnoCSS 主题只引用这些变量 |
| JS 常量 `tokens` | `src/style/tokens.ts` | 只给必须传字符串的组件 prop（`uv-tabs line-color`、`uv-switch active-color`、canvas） |

**优先级：UnoCSS class > `var(--yp-*)` > `$yp-*` > `tokens.*`。** 页面里不得再出现十六进制颜色、`bg-blue-500`、`text-gray-400` 这类 Tailwind 调色板类。

### 2.1 颜色

配色方案为「学术蓝 + 北大红点缀」（调研与对比度计算见飞书主库「品牌色板」）：交互色是比 Tailwind 蓝更深、饱和度更低的靛蓝，承担全部交互；北大红只做身份标记。所有文字/底色组合 ≥ 4.5:1。

| 语义 | 值 | UnoCSS | 用途 |
|---|---|---|---|
| primary | `#2456C9` | `text-primary` `bg-primary` `border-primary` | 主按钮、选中态、链接、tabbar 选中 |
| primary-dark / light / disabled | `#1A43A3` / `#E9EFFC` / `#A3B7E9` | `text-primary-dark` `bg-primary-light` … | 按压态与「进行中」胶囊字 / 次级按钮底、「进行中」胶囊底、课表今天列 / 禁用 |
| success / dark / light | `#15803D` / `#166534` / `#E8F8EE` | `text-success` `text-success-dark` `bg-success-light` | 完成、已签到 |
| warning / dark / light | `#B45309` / `#92400E` / `#FFF4E0` | `text-warning` `text-warning-dark` `bg-warning-light` | 待处理、临近截止 |
| error / dark / light | `#CF2222` / `#A81B1B` / `#FDECEC` | `text-error` `text-error-dark` `bg-error-light` | 失败、违约、字段错误、`btn-danger` |
| info / dark / light | `#5B6B82` / `#475569` / `#EFF2F6` | `text-info` `bg-info-light` | 中性说明、「已结束」 |
| brand / brand-light | `#9A0000` / `#F9F2E8` | `text-brand` `bg-brand` `bg-brand-light` | **只用于**标志、品牌文字、元气值展示数字、品牌横幅底；**不进**按钮、胶囊、表单、错误（与 error 同色相） |
| 文字 1/2/3/4 | `#1F2329` / `#4E5969` / `#666E7A` / `#C9CDD4` | `text-fg-1` … `text-fg-4` | 标题正文 / 次要 / 说明占位 / 禁用 |
| 页面底 / 卡片 / 填充 / 填充按压 | `#F5F6F8` / `#FFFFFF` / `#F2F3F5` / `#E5E6EB` | `bg-page` `bg-card` `bg-fill` `bg-fill-active` | |
| 边框 / 浅边框 | `#E5E6EB` / `#F2F3F5` | `border-line` `border-line-light` | |
| 遮罩 | `rgba(0,0,0,.45)` | `bg-mask` | 弹层背景 |

### 2.2 字号（rpx，2rpx ≈ 1pt）

| 类 | 字号 / 行高 | 用途 |
|---|---|---|
| `text-2xs` | 22 / 30 | tabbar 文字、角标；**最小可用字号**，不得再小 |
| `text-xs` | 24 / 34 | 说明、时间戳、胶囊 |
| `text-sm` | 28 / 40 | 次要文字、表单标签、列表副标题 |
| `text-base` | 30 / 44 | 正文、输入框、按钮 |
| `text-lg` | 34 / 48 | 列表主文字、卡片标题、区块标题 |
| `text-xl` | 40 / 56 | 页面级大标题（少用） |
| `text-2xl` / `text-3xl` | 48 / 56 | 展示型数字（信用分、元气值） |

字体族已在 `page` 上设定为系统字体栈，页面不要再设 `font-family`。

### 2.3 圆角、间距、阴影

- 圆角：`rounded-sm` 8rpx（胶囊、小按钮）、`rounded-md`/`rounded` 16rpx（按钮、输入框）、`rounded-lg` 24rpx（卡片）、`rounded-xl` 32rpx（底部弹层顶角）、`rounded-full`。
- 间距：页面左右留白 `px-4`（32rpx）；卡片内边距 `p-4`；卡片之间 `mt-3`（24rpx）；区块之间 `mt-6`（48rpx）；列表行最小高 104rpx。
- 阴影只有两档：`shadow-card`（卡片，可省略）与 `shadow-float`（固定底栏、浮层）。不要用 `shadow-lg/xl`。
- 安全区：只用 `pb-safe` / `pt-safe`（`uno.config.ts` 里的规则），页面里不得重定义 `.pb-safe`。

## 3. 页面骨架

### 3.1 导航栏

- **所有页面使用原生导航栏**，样式由 `pages.config.ts` 的 `globalStyle` 统一（白底黑字）。页面的 `definePage` 只写 `navigationBarTitleText`，**禁止**再写 `navigationBarBackgroundColor` / `navigationBarTextStyle`。
- 只有需要在导航栏内放内容（如筛选、分段控件）的页面才用 `navigationStyle: 'custom'` + `uv-navbar`（`:safe-area-inset-top` `:placeholder` `bg-color="#FFFFFF"`，非 tab 页 `auto-back`）。目前允许的是首页与预约 tab；新增 custom 页要先在 PR 里说明理由。
- 标题 = 入口名 = 页面 `definePage` 标题（如入口叫「元气商城」，页面标题也叫「元气商城」）。标题要能回答「我在哪」，不写口号。
- 顶部不得再放第二个大标题区块重复导航栏标题。

### 3.2 容器与布局

```html
<view class="yp-page px-4 py-3">        <!-- 页面：浅灰底 + 左右留白 -->
  <view class="yp-card">…</view>         <!-- 卡片：白底 24rpx 圆角 -->
  <view class="yp-card mt-3">…</view>
</view>
```

- 需要贴边的列表（设置页、「我的」菜单）用 `yp-list-item` 行 + `yp-divider`，外层不加 `px-4`。
- 固定底部操作栏：`fixed bottom-0 left-0 right-0 bg-card shadow-float px-4 pt-3 pb-safe-3`（`pb-safe-3` = 24rpx + 安全区，一个声明搞定；不要把 `py-*` 和 `pb-safe` 写在同一元素上，两者都设 padding-bottom，谁生效取决于生成顺序）；页面内容底部加等高 padding。
- tab 页内容底部已由自定义 tabbar 占位（`h-50px pb-safe`），不要再手动留白。
- 使用 `rpx` 表达随屏幕缩放的尺寸；图标与固定布局用 px 类（`h-22px`）。

### 3.3 Tabbar

四项：首页 / 预约 / 应用 / 我的。图标用 `i-carbon-*`（登记在 `uno.config.ts#safelist`），选中色 primary、未选中 `text-fg-3`，白底、浅色上边线。不要在页面内做第二个 tabbar 形态的底栏。

## 4. 组件选用

uv-ui 是唯一的组件库（`src/uni_modules/uv-*`），`wd-*`（wot-design-uni）不再使用；`src/components/` 里的共享组件优先于手写。

| 场景 | 用什么 | 备注 |
|---|---|---|
| 按钮 | 原生 `<button>` / `<view>` + `btn-primary` `btn-secondary` `btn-outline` `btn-danger` `btn-ghost` `btn-text`（可叠 `btn-sm` `btn-block`） | 一屏一个 `btn-primary`；`uv-button` 只在需要 loading 态时用，颜色走默认主题 |
| 状态胶囊 | `StatusTag`（`type: success / processing / warning / error / default`） | 替代各页手写 badge |
| 加载 / 空 / 错误 | `PageState`（`loading` `error` `empty` + `@retry`） | 见 §5 |
| 表单行 | `FormField` + 原生 `input` / `textarea` / `picker`（class `yp-input`） | 字段错误通过 `messages` 传入；密码框写 `<input type="text" password>`（微信小程序没有 `type="password"`） |
| 开关 / 复选 | `uv-switch`（`:active-color="tokens.primary"`）、`uv-checkbox` | |
| 标签页 | `uv-tabs`（`:line-color="tokens.primary"` `:active-style` 用 `tokens.text1`） / `uv-subsection` | tab ≤ 4 个，标签 2–4 字 |
| 列表 | `view` + `yp-list-item`；长列表分页 + `uv-load-more` | 不用 z-paging |
| 下拉刷新 | 页面 `enablePullDownRefresh` + `onPullDownRefresh` | 列表页默认开启；不要用「刷新」按钮替代 |
| 底部弹层 | `uv-popup mode="bottom"` `:round="16"`（uv 的尺寸 prop 默认单位是 px，16px ≈ 32rpx） | 选择、筛选、详情速览 |
| 操作菜单 | `uv-action-sheet` | ≤ 5 项 |
| 确认 | `useConfirm().confirm({...})` | 破坏性操作 `danger: true`；不用 `uni.showModal`、不再各页放 `uv-modal` |
| 轻提示 | `useApiException(toastRef).showMessage()` + `<uv-toast ref="toastRef" />` | 成功提示只在结果不自明时出现一次 |
| 页内提示条 | `uv-alert` | 表单顶部的非字段错误、政策提示 |
| 骨架屏 | `uv-skeleton` | 首屏卡片类内容；列表类用 `PageState loading` |
| 图标 | `i-carbon-*` | 同一含义全局同一图标；点击目标 ≥ 88rpx（外扩 padding） |
| 图片 | `image` + `mode="aspectFill"` + 固定比例容器 + `bg-fill` 占位 | |

## 5. 状态与反馈

### 5.1 数据页四态

每个拉数据的页面/区块必须实现 loading、data、empty、error 四态，并用 `PageState` 渲染：

```vue
<PageState :loading="loading" :error="loadError" :empty="items.length === 0" empty-text="还没有预约记录" @retry="load">
  <template #action><button class="btn-secondary btn-sm mt-4" @click="goCreate">去预约</button></template>
  <!-- data -->
</PageState>
```

- 首屏失败：`loadError = handleApiException(e, { showToast: false }).message`，只显示页内错误 + 重试；**不要再 toast**。
- 已有数据时的后台刷新失败：保留数据，只 toast 一次。
- 空态：图标 + 一句话（「暂无 X」或「还没有 X」二选一，全局统一用「还没有 X」；不加「！」「~」）+ 可选一个行动按钮。
- 加载期间不能显示空态文案（先 `loading` 再判断 `empty`）。

### 5.2 错误面只有一个

按 `AGENTS.md`「Frontend error normalization and presentation」执行：toast / 弹窗 / 内联三选一。表单字段错误只用 `FormField messages`（内部是 `ApiFieldError`），不叠加 toast。

### 5.3 确认与成功

- 破坏性、不可逆、消耗额度的操作先 `confirm`，按钮文案写动作本身：「取消预约 / 保留预约」「解除绑定 / 暂不解除」，不用「确定 / 取消」。
- 成功后优先靠导航或状态变化表达（返回上一页、卡片变为「已报名」）；需要提示时 `showMessage('已保存', 'success')`，随后 `navigateBack` 延时 ≤ 800ms。
- 提交按钮在请求期间禁用并显示 loading，防重复提交。

## 6. 文案

- 按钮：动词或动宾，2–4 字：「预约」「去签到」「保存」「取消预约」；不用「点击」「确定」作主按钮。
- 标题：名词短语，不带标点；导航标题与入口同名。
- 错误：说清发生了什么 + 怎么办：「网络连接失败，请检查网络后重试」；直接展示后端 `message`，不要改写成「加载失败」。
- toast 不带句尾句号；一句话不超过 20 字。
- 日期时间统一用 `src/utils/format.ts`：`formatSmartDateTime` →「今天 14:00」「明天 09:30」「9月12日 周五 14:00」；范围 `formatTimeRange` →「14:00–15:30」；相对时间 `formatRelativeTime` →「5 分钟前」「昨天 14:00」。不出现英文星期、`toDateString()`。
- 中文与英文、数字之间加空格：「第 3 周」「B104 研讨室」「剩余 2 人」；单位紧跟数字不空格：「30 分钟」「3 小时」按空格规则，「2h」不用。
- 全角标点；省略号统一「…」；范围用「–」。
- 数字用阿拉伯数字；金额/积分用 `formatNumber` 加千分位。

## 7. 页面模板

| 模板 | 区块顺序 | 关键组件 |
|---|---|---|
| 列表页（我的预约、通知、反馈） | 顶部筛选（`uv-tabs`/`uv-subsection`，可选）→ 列表卡片/行 → 分页加载 → 空态 | `PageState`、`StatusTag`、`uv-load-more`、下拉刷新 |
| 详情页（活动、预约、通知） | 封面/标题 → 关键信息行（时间、地点、人数）→ 正文 → 相关操作 → 固定底部主按钮 | `StatusTag`、固定底栏 |
| 表单页（预约信息、反馈、绑定） | 说明条（可选 `uv-alert`）→ 分组卡片内 `FormField` → 协议勾选 → 固定底部提交按钮 | `FormField`、`yp-input`、`useApiException` |
| 结果页（签到成功、提交成功） | 大图标 + 结果标题 → 摘要信息 → 主操作（返回/查看）→ 次操作 | 成功用 `text-success`，失败用 `text-error`，不是 toast |
| 设置/菜单页（我的） | 头像卡（可点击整块）→ 分组列表行 → 危险操作单独放最底部（`btn-danger`） | `yp-list-item`、`useConfirm` |
| 网格菜单页（应用） | 搜索/常用（可选）→ 分组标题 + 网格（每行 4 个，图标 48rpx + 文字 `text-xs`） | 图标同一风格，标签 ≤ 4 字 |
| 周视图（课表） | 周选择器 → 网格（左轴节次/时间）→ 底部主操作（≤ 3 个） | 见课表页现有实现 |

## 8. 迁移对照

改到某个页面时，把下面左列的写法换成右列；不要复制邻近页面的旧写法。

| 旧写法 | 新写法 |
|---|---|
| `bg-blue-500` / `bg-blue-600` / `#2563eb` / `#1b55e2` | `bg-primary`（按钮用 `btn-primary`） |
| `text-blue-500` / `text-blue-600` | `text-primary` |
| `text-gray-900` / `text-gray-800` | `text-fg-1` |
| `text-gray-600` / `text-gray-500` | `text-fg-2` |
| `text-gray-400` / `text-gray-300` | `text-fg-3` / `text-fg-4` |
| `bg-gray-50` / `bg-gray-100` | `bg-page` / `bg-fill` |
| `border-gray-100` / `border-gray-200` | `border-line-light` / `border-line` |
| `text-red-500` / `#f56c6c` / `#dc2626` | `text-error` |
| `text-green-600` / `bg-green-50` 等状态胶囊 | `StatusTag` |
| `rounded-xl` / `rounded-2xl` 卡片 + `shadow-lg` | `yp-card` |
| `text-3xs` / `text-[10px]` / `16rpx` 文字 | 至少 `text-2xs` |
| 页面内 `.pb-safe {}` / `button::after {}` / `.line-clamp-2` | 删除；用 `pb-safe`、全局重置、`line-clamp-2` |
| `definePage` 里的 `navigationBarBackgroundColor` / `navigationBarTextStyle` | 删除 |
| `uni.showModal` / `confirmModal()` / 页内 `<uv-modal>` 确认 | `useConfirm().confirm()`（`confirmModal` 已代理到同一实现，可保留调用） |
| `uni.showToast` | `showMessage()`（来自 `useApiException`） |
| 手写 loading/空态/错误块 | `PageState` |
| `wd-tabs` `wd-tag` `wd-switch` | `uv-tabs` `StatusTag` `uv-switch` |
| `<div>` / `cursor-pointer` / `hover-class="none"` | `<view>` / 删除 / `active:opacity-70` 或 `active:bg-fill` |
| 各页自写的日期格式化 | `src/utils/format.ts` |
| 英文星期 `Mon` / `toDateString()` | `weekdayLabel()` / `formatSmartDateTime()` |

## 9. PR 自检清单

- [ ] 页面没有十六进制颜色、Tailwind 调色板类（`blue-500`、`gray-400`…）
- [ ] `definePage` 只含标题（及必要的 `enablePullDownRefresh`）
- [ ] 数据页有 loading / empty / error + 重试，且同一失败只出现一个提示面
- [ ] 破坏性操作走 `useConfirm`，按钮文案是动作本身
- [ ] 点击目标 ≥ 88rpx，最小字号 `text-2xs`
- [ ] 日期时间经 `utils/format.ts`；中英文数字间空格；toast 无句号
- [ ] 入口名 = 导航标题
- [ ] `pnpm exec eslint <files>`、`pnpm type-check`（仅允许已知基线错误）、`pnpm build:mp` 通过，并在 DevTools 里看过真机比例截图
