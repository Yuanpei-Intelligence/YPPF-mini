# AGENTS.md

本文件是仓库级的开发导航和执行约束，适用于整个仓库。若以后某个子目录出现更具体的 `AGENTS.md`，则该子目录以更近的文件为准。

## 核心原则

- 先读后改：先定位页面、API、类型、状态和平台分支的现有实现，再做最小范围修改；不要凭 uni-app、Vue 或脚手架经验猜测本项目行为。
- 代码与配置是事实来源：`package.json`、`vite.config.ts`、页面中的 `definePage`、`src/router/`、`src/tabbar/` 和实际调用代码优先于可能滞后的 README。
- 保持跨端：项目同时面向 H5、微信小程序和 App。除非需求明确限定平台，否则不能只保证浏览器端可用。
- 不顺手重构、不覆盖无关改动、不编辑生成物、不提交密钥。发现邻近问题可以在交付说明中指出，但不要扩大任务范围。
- 所有规则都应能由源码、命令或目标平台行为验证。无法运行的检查必须说明原因，不能用“应该没问题”代替验证。

## 项目概览与总体架构

这是 YPPF 的 uni-app 前端，基于 Vue 3、TypeScript、Vite 和 unibest。主要目标平台为 H5、微信小程序和 App；状态使用 Pinia，样式以 UnoCSS 和 SCSS 为主，组件同时使用 Wot Design Uni 与仓库内的 uv-ui `uni_modules`。

主要运行链路：

```text
src/main.ts
  -> Pinia 持久化
  -> 路由/登录拦截器
  -> uni.request/uploadFile 拦截器
  -> App.vue 生命周期与微信自动登录
  -> App.ku.vue 全局根视图和自定义 tabbar
  -> pages -> api -> http -> YPPF 后端
```

## 文档与源码导航

- `README.md`：后端联调、各平台启动和发布入口。
- `package.json`：Node/pnpm 约束、唯一可信的脚本清单和依赖版本。
- `vite.config.ts`：页面/清单生成、自动导入、UnoCSS、分包优化、开发代理和平台插件。
- `pages.config.ts`：全局页面样式、easycom 和 tabbar 清单入口。
- `manifest.config.ts`：H5、微信小程序和 App 清单及权限。
- `uno.config.ts`：跨端 UnoCSS preset、主题、图标和安全区规则。
- `src/router/README.md`、`src/pages-auth/README.md`：登录策略背景；路由值仍须以当前源码和生成后的 `src/pages.json` 为准。
- `src/tabbar/README.md`：原生/自定义 tabbar 策略说明。
- `src/http/README.md`：脚手架提供的请求方案说明；本项目当前业务接口实际统一使用 `src/http/http.ts`。
- `src/hooks/useScroll.md`：滚动 hook 的使用约束。
- `vite-plugins/README.md`：App 原生插件资源复制机制。
- 跨仓库 API 范例：后端 `../YPPF/api/notification/`，对应前端 `src/api/types/notification.ts`、`src/api/notification.ts` 和 `src/pages/me/notifications.vue`。后端实际目录名是单数 `notification`。

## 目录职责

- `src/pages/`：主包页面。页面路由由文件位置和 `definePage` 生成。
- `src/pages-auth/`：在 `vite.config.ts` 中注册的认证分包；不要把它移动到 `src/pages/` 下。
- `src/components/`：跨页面复用的业务组件；仅页面内部使用的展示块可以留在页面 SFC 中。
- `src/api/`：手写接口函数；`src/api/types/` 存放对应的请求和响应类型。
- `src/http/`：请求实现、拦截器、响应解包和认证重试。
- `src/store/`：跨页面 Pinia 状态。`token`、`user` store 已通过 `uni` storage 持久化。
- `src/router/`：导航拦截、登录黑白名单和登录/绑定页常量。
- `src/tabbar/`：tabbar 策略、清单、渲染和当前索引。
- `src/hooks/`：可复用组合式逻辑，已配置自动导入。
- `src/utils/`：路由、后端 URL、webview、上传和跨端工具。
- `src/style/`、`src/uni.scss`、`uno.config.ts`：全局样式、uni-app 变量和原子类配置。
- `src/static/`：随包静态资源；代码中通常使用 `/static/...` 运行时路径。
- `src/uni_modules/`：签入仓库的第三方 uv-ui 代码。除非任务明确是升级或修复供应商组件，不要直接修改。
- `scripts/`、`vite-plugins/`：构建期脚本和插件，修改后必须至少验证受影响平台的构建。

## 不可破坏的架构边界

- 依赖方向保持为“UI -> 应用服务 -> 传输/契约”：页面可以调用 component、hook、store、API 和 util；反向模块不得导入具体页面。
- `src/pages/` 只负责页面编排、交互状态和渲染。它不得直接调用 `uni.request`、拼后端 base URL、写认证 header，或复制 serializer/响应解包逻辑。
- `src/components/` 默认是可复用展示组件：可依赖类型和纯 util，通过 props/emits 与页面通信；不得知道具体页面路径、后端 endpoint 或 token。确需领域容器组件时，也只能调用 `src/api`/store，不能绕过基础设施。
- `src/hooks/` 可以封装 Vue/uni-app 能力；通用 hook 不依赖页面和组件。领域 hook 可以调用 `src/api`，但不能渲染 UI 或持有页面路由常量。
- `src/api/types/` 是纯契约层，不依赖 Vue、Pinia、页面、组件或 HTTP 实现；`src/api/<domain>.ts` 只依赖本域类型和 `src/http/`，不得导入页面、组件、hook、store、router 或 tabbar，也不执行 toast、跳转等 UI 副作用。`getWxCode` 这类平台认证桥接是现有例外，不扩展到普通业务 API。
- `src/http/` 是普通 JSON API 的统一传输层，集中处理 URL、代理、认证、响应和错误。文件上传只能复用现有 upload hook/util 并继续经过全局 uploadFile 拦截器；其他代码不得新增裸 `uni.request`/`uni.uploadFile`。HTTP 层可以为认证接入 token/router 基础设施，但不得依赖业务页面或领域组件；不要扩大现有认证链路中的循环依赖。
- store 可以调用 API 完成全局动作，但不直接调用 HTTP；API 不反向操作业务 store，token 注入只由 HTTP 拦截层完成。页面临时状态不下沉到 store。
- router/tabbar 只管理全局导航不变量，不承载领域请求；页面通过 `uni.*` 和既有拦截器导航，不绕开它们另建 Vue Router。
- `src/tabbar/config.ts` 同时服务构建期和运行时，必须保持纯数据、无副作用；不得依赖 store、API、HTTP、页面或 `uni.*` 运行时状态。
- `src/utils/` 默认是底层通用工具，不成为新的跨层编排中心。当前 `utils/index.ts -> pages.json`、`utils/webview.ts -> api/login` 是具名历史例外；不要通过 barrel re-export 或新 import 继续扩大认证循环。
- 运行时配置通过 `env/`、`manifest.config.ts`、`pages.config.ts` 和已有 helper（如 `getEnvBaseUrl`）访问；页面不得散落读取/覆盖部署地址或认证配置。
- 根目录 Vite/pages/manifest/UnoCSS 文件属于构建期配置，运行时代码不得反向导入；`pages.config.ts -> src/tabbar/config.ts` 只因后者保持纯配置而允许。
- 后端 `YPPF/api/<domain>/` 是 HTTP 适配层，可依赖 serializer、model 和既有领域业务函数；领域业务函数不得反向依赖 API view/serializer，更不可能依赖前端。View 负责鉴权、权限、参数和响应，不复制已有业务规则。
- 两个仓库只通过 HTTP/OpenAPI 契约协作，不做跨仓库源码 import，也不把 Django model/业务实现复制成前端逻辑；前端只复现 wire contract 和必要的展示规则。
- 生成代码、供应商代码和业务代码边界必须保持清晰；不能为了快速完成当前功能，把业务逻辑写进 `src/uni_modules`、生成清单或根 `api/urls.py`。

## 变更规则

- 做解决需求所需的最小完整改动；只有当前功能无法正确落地时才重构邻近代码，不做顺手式全局整理。
- 默认保持后向兼容。若明确允许破坏性变更，必须在同一功能切片中同步后端 schema、前端类型/API、全部调用方、测试和迁移说明。
- 可观察的后端行为变化必须新增或更新 API tests；前端当前没有测试框架时，必须补足定向 lint、类型检查、目标平台构建和手工场景，不得用“没有测试”跳过验证。
- 配置、公开 API、路由、环境变量、构建命令或用户操作流程改变时，同步更新相应文档。
- 新增生产依赖前先说明现有能力为何不足；获准后使用各仓库既定包管理方式，并提交对应依赖清单/锁文件。不要为一个小工具引入大型依赖。
- 不手改生成文件。后端 model 变化使用 Django migration 流程并提交迁移，前端页面/清单/type 声明修改其配置源后重新生成。
- 不因历史基线失败而降低新代码标准，也不借当前任务修复所有历史债务；用定向检查证明没有新增问题，并单独报告基线失败。
- 修改 HTTP、认证、router、tabbar、store 或公共 util 前，先用 `rg` 查全调用方并按实际影响面验证，不能只检查当前页面。

## 生成文件与禁止直接修改的区域

- 不直接编辑或提交 `src/pages.json`、`src/manifest.json`、`src/types/` 或 `dist/`。它们已被 `.gitignore` 排除，由启动/构建插件生成。
- 页面元数据改在页面的 `definePage` 或 `pages.config.ts`；应用清单改在 `manifest.config.ts`；组件/自动导入声明改对应 Vite 配置后重新生成。
- `scripts/create-base-files.js` 只为缺失的 `src/pages.json` 和 `src/manifest.json` 创建最小占位文件；真实内容仍由 Vite 插件生成。
- `src/service/**` 是 `pnpm openapi` 的目标目录，ESLint 也将其排除。当前 `openapi-ts-request.config.ts` 指向 unibest 示例 schema，而现有 YPPF 业务 API 是手写的；未经明确要求和 schema 核对，不要运行生成器或把生成代码混入业务层。
- 不修改 `node_modules/`。依赖修复应通过版本、配置或明确的补丁机制完成。

## 环境与安装

- 需要 Node.js `>=20`、pnpm `>=9`；仓库通过 `packageManager` 固定 pnpm `10.10.0`。
- 只能使用 pnpm。不要生成 `package-lock.json` 或 `yarn.lock`，不要手工编辑 `pnpm-lock.yaml`。
- 首次安装使用 `pnpm install`；在要求锁文件完全复现的环境使用 `pnpm install --frozen-lockfile`。
- 安装会触发 `prepare`：初始化 Husky 并创建基础清单占位文件。不要仅为了运行一个已有命令而反复安装依赖。
- 环境文件位于 `env/`。共享的变量名和非敏感默认值可以维护在已跟踪文件中；个人覆盖使用被忽略的 `env/.env.local` 或 `env/.env.<mode>.local`。
- 所有 `VITE_*` 值最终都可能进入客户端包，不能被当作服务器端秘密。
- 本地后端通常按 `README.md` 运行在 `localhost:8000`。微信小程序的 develop/trial/release 地址还会被 `src/utils/index.ts#getEnvBaseUrl` 覆盖，不能只改 `VITE_SERVER_BASEURL` 就假定所有平台一致。

## 本地执行、构建与发布

```bash
pnpm dev:h5       # H5 开发；端口来自 env/.env 的 VITE_APP_PORT
pnpm dev:mp       # 微信小程序开发；输出 dist/dev/mp-weixin
pnpm dev:app      # App 开发；输出 dist/dev/app

pnpm build:h5     # H5 生产构建；输出 dist/build/h5
pnpm build:mp     # 微信小程序生产构建；输出 dist/build/mp-weixin
pnpm build:app    # App 生产构建；输出 dist/build/app
pnpm build:h5:test     # 使用 env/.env.test 的 H5 构建
pnpm build:mp:test     # 使用 env/.env.test 的微信小程序构建
pnpm build:app:test    # 使用 env/.env.test 的 App 构建

pnpm type-check   # vue-tsc --noEmit
pnpm lint         # 全仓库 ESLint
pnpm openapi      # 仅在确认生成配置和 schema 后使用
```

注意命令副作用：

- 只有 `pnpm dev`、`pnpm dev:mp`、`pnpm dev:app` 配有对应的 pre-script，会先运行 `init-baseFiles`；`dev:h5`、`dev:mp-weixin` 和各 build 命令不能依赖这一副作用。注意 `pnpm dev` 与 `pnpm dev:h5` 都执行 `uni`（默认 H5），但 `predev` 只在 `pnpm dev` 时被 pnpm 自动触发；若使用 `pnpm dev:h5` 或任一 build 命令，基础文件缺失前需手动执行 `pnpm init-baseFiles`。
- 小程序构建插件可能尝试打开对应开发者工具；H5 production 构建会生成 bundle visualizer，并配置为自动打开。自动化环境中要记录由此产生的环境限制。
- `pnpm lint:fix` 会对整个仓库执行修复，可能触及任务外文件。优先用 `pnpm exec eslint <changed-file...>` 做定向修复，最后再运行全量 `pnpm lint`。
- 依赖变化必须同时提交 `package.json` 和 `pnpm-lock.yaml`；没有依赖变化就不要刷新锁文件。

## 跨仓库 API 功能开发顺序

涉及后端 API、前端 API 和 UI 的功能，默认按下面顺序完成。YPPF 与 YPPF-mini 是两个独立 Git 工作区，动手前分别读取适用的 `AGENTS.md`（若存在）并检查状态，分别审查 diff。若任务只覆盖其中一层，不擅自扩大写入范围，但仍要读取上下游契约以避免错误假设。

1. **确认领域与现状**：在后端 YPPF 中读取 model、已有业务函数、权限规则和相邻 `api/<domain>/`；在前端确认调用页面、状态和现有 API。不要先从 UI 猜字段。
2. **实现后端 API**：在 `YPPF/api/<domain>/` 维护 `serializers.py`、`views.py`、`urls.py`、`tests.py`，并从 `YPPF/api/urls.py` 注册 `v2/<domain>/`；`boot/urls.py` 会加上 `/api/`，最终前缀为 `/api/v2/<domain>/`。根 `api/` 不放具体 endpoint 实现。
3. **固定后端契约**：serializer 明确 body/query/response 字段、枚举、nullable 和只读属性；query serializer 既用于 schema 也必须在运行时执行校验，所有 action 都用具体 response serializer；view 明确 HTTP method、状态码、认证、对象归属和副作用，领域函数的失败结果必须映射成明确 HTTP 错误，不能无条件返回 200。用 drf-spectacular `extend_schema`/serializer 保证 `/api/schema/`、`/api/docs/` 与真实响应一致。
4. **先测后端**：至少运行目标模块 `python manage.py test api.<domain>`，覆盖未认证、无权限/越权、有效/无效参数、正常响应及数据库副作用；可行时再运行 `python manage.py test`。列表接口还要覆盖过滤、排序和分页/数据量边界。
5. **根据 schema 写前端契约**：在 `src/api/types/<domain>.ts` 忠实表达字段名、枚举、required、nullable、query/body 和响应，必要时分开读模型与写入 payload；以刚生成/运行中的 schema 为准，不以数据库 model、旧 YAML、页面 mock 或记忆为准。
6. **封装前端 API**：在 `src/api/<domain>.ts` 一一映射 path（包括尾斜杠）、method、query/body 和返回类型，并统一经过 `@/http/http`。先用真实后端或 schema 验证返回是原始对象还是 `{ code, data }` envelope。
7. **最后实现 UI**：`src/pages/**` 只消费类型化 API，补齐 loading/error/empty/data、提交防重、确认操作、刷新和跨端布局；不在模板或页面函数中重建契约。
8. **端到端核对**：运行后端测试，检查 schema diff，再运行前端定向 ESLint、`pnpm type-check` 和目标平台 build/smoke；逐项核对字段、枚举、权限错误、空数据和真实交互。

`notification` 纵向切片适合作为结构参考：后端 serializer/view/url/test -> 前端 type/API/page。但不要照抄它的已知局限：当前列表没有分页，页面已提示大数据量会卡顿；PATCH 的 `status` 在后端必填、前端却标成可选，`title`/`URL` 也把“字段必有但可为 null”写成了可缺失；批量操作后端返回 `{ message, count }`，前端函数却声明为 `void`，schema 也未给出具体响应结构；query serializer 未用于运行时校验；“全部已读/删除已读”实际只处理 `NEEDREAD`，UI 文案却容易被理解为所有通知。触及该功能时应先统一领域语义、schema、测试、前端类型和文案，而不是延续不一致。

## 页面与路由工作流

1. 新主包页面放入 `src/pages/<domain>/<name>.vue`；只有认证分包页面放入 `src/pages-auth/`。
2. 页面使用 `<script setup lang="ts">`，并通过 `definePage` 声明标题、导航栏和其他页面元数据。只有真正的首页设置 `type: 'home'`。
3. 路由使用以 `/` 开头、与生成清单一致的 uni-app 路径，不使用 Vue Router 的浏览器路由 API。
4. tabbar 页面使用 `uni.switchTab`，普通页面使用 `uni.navigateTo`/`redirectTo`/`reLaunch`；全局拦截器会同步 tabbar 索引和登录逻辑。
5. 增删 tabbar 项只改 `src/tabbar/config.ts`，同时核对图标、页面文件和自定义 tabbar 渲染。该配置变化后需要重启开发进程，确保重新生成 `pages.json`。
6. 页面参数在 `onLoad` 中读取并显式校验/解码；返回缓存页时需要刷新数据的逻辑放在 `onShow`，或复用 `usePageRefresh`。
7. 跳转路径、查询参数和页面栈行为都要在目标平台验证，特别是 tabbar、webview 回调和小程序分享直达场景。

当前认证路由存在脚手架历史命名：`src/router/config.ts`、`src/pages-auth/*.vue` 与部分 README 中的登录页路径不完全一致。任何认证或路由任务都应先检查生成后的 `src/pages.json`，统一相关常量并做实际导航验证；不要照抄旧文档中的路径。

## 登录、状态与生命周期

- `src/main.ts` 必须继续安装 Pinia、路由拦截器和请求拦截器；三者是认证与请求链路的前提。
- 微信小程序在 `App.vue#onLaunch` 中尝试 `tokenStore.wxLogin()`。`LOGIN_PAGE_ENABLE_IN_MP` 为 `false` 时，小程序绕过 H5 登录页拦截；不要再在每个页面重复实现同一层登录守卫。
- 登录改动必须同时考虑未绑定微信、切换主/子账号、单 token/双 token、401 重试、退出和持久化过期时间。
- 获取有效 token 使用 `tokenStore.updateNowTime().validToken` 或 store 已提供的方法，不要从 storage 复制一套过期判断。
- 页面瞬时状态用 `ref`/`reactive`；只有跨页面、需持久化或属于全局会话的状态才进入 Pinia。
- 解构 Pinia 响应式状态时使用 `storeToRefs`，动作可以直接从 store 调用。
- tabbar 当前索引由 `src/tabbar/store.ts` 管理并持久化；不要在页面中另建第二份索引状态。
- `App.ku.vue` 是 `@uni-ku/root` 注入的全局模板根，用于 `KuRootView` 与自定义 tabbar；全局 UI 应先评估是否属于这里，而不是塞进每个页面。

## API 与请求 Provider 规则

- 当前业务 API 的标准链路是 `src/api/*.ts` -> `src/http/http.ts` -> `uni.request`。页面和组件不得直接拼 base URL 或重复实现认证 header。
- 请求/响应类型放在 `src/api/types/<domain>.ts`，接口函数放在同域 `src/api/<domain>.ts`。字段名忠实后端契约（包括已有的 snake_case 和领域缩写），优先使用具体类型，避免为图省事扩大 `any`。
- GET 查询参数传第二个参数；POST/PUT body 传第二个参数、query 传第三个参数。PATCH 目前使用 `http<T>({ method: 'PATCH', ... })`，不要假设存在 `http.patch`。
- API 路径一般使用以 `/` 开头的相对路径。`src/http/interceptor.ts` 会处理 H5 代理、非 H5 base URL、60 秒超时和 `Authorization: Bearer ...`。
- `http<T>` 返回的是已经解包的业务 `data`；它还兼容无 `code/data` 包装的响应。写调用方前先确认实际后端 envelope，不要再机械访问 `.data`。
- 非 2xx 和网络错误由请求层统一 toast/reject；页面只在需要领域化提示时补充 UI，避免同一个错误连续弹两次。注意当前 2xx 业务错误会 toast 后返回 `data`，改动此语义会影响全部调用方，必须单独评估。
- 401 处理会在微信小程序尝试重新登录，在双 token 模式使用刷新队列。认证端点必须避免进入无限重试；修改时至少验证成功、过期、未绑定和刷新失败路径。
- `src/http/alova.ts` 是未被当前业务 API 使用的脚手架实现；不要在一个功能中混用两套请求 provider。若要迁移，需作为独立任务统一认证、错误和返回类型语义。
- 后端媒体地址使用 `toBackendURL`；需要登录的后端网页使用 `openWebview` 获取 ticket，不要在页面里复制 ticket 拼接逻辑。新代码直接从 `@/utils/webview` 导入，不要从 `@/utils` barrel re-export；后者会进一步扩大现有认证循环。

## Vue、TypeScript 与命名约定

- 遵循 `.editorconfig` 和 ESLint：UTF-8、LF、2 空格、文件末尾换行。现有 TS 风格为单引号、无分号、尾逗号。
- Vue SFC 块顺序由 ESLint 强制为 `script` -> `template` -> `style`；样式通常使用 `<style lang="scss" scoped>`。
- 类型导入使用 `import type`。组件为 PascalCase，组合式函数为 `useXxx`，Pinia store 为 `useXxxStore`，API 函数使用清晰的动词开头。
- Vue、uni-app API 与 `src/hooks` 已配置自动导入。修改现有文件时保持局部风格；无论显式还是自动导入，都必须通过类型检查和 ESLint，不能依赖 IDE 的隐式补全猜测。
- 复杂异步动作使用 `async/await`、`try/catch/finally`，在 `finally` 复位 loading/submitting；提交按钮要防重复触发。
- 输入、页面参数和后端可空字段要显式校验。不要用非空断言掩盖真实的空值分支。
- 数据页应覆盖 loading、数据、空/失败三态并提供重试；提交入口先做 guard，提交期间禁用并在 `finally` 复位。删除、解绑、消费积分等不可逆操作先用 `uni.showModal` 二次确认。
- 公共业务逻辑提取到 hook、store、API 或 util；只复用视觉块时提取组件。不要为了减少几行代码建立没有明确职责的抽象层。
- 保留本项目对较老 Android/小程序运行时的兼容处理；例如不要把 `getLastPage` 改回 `Array.prototype.at`，也不要随意移除 UnoCSS legacy preset。

## UI、样式与跨端约束

- 页面结构优先使用 uni-app 的 `view`、`text`、`image`、`scroll-view` 等组件和 `uni.*` API，不直接依赖 `window`、`document`、DOM 事件或仅浏览器可用的 CSS。
- 简单布局优先使用 UnoCSS；复杂、状态相关或页面专属样式使用 scoped SCSS。复用 `primary` 主题色和 `p-safe`/`pt-safe`/`pb-safe`，不要另造近似主题变量。
- 跨端尺寸优先遵循相邻代码：响应式页面通常用 `rpx`，固定图标/布局可使用项目已有的 UnoCSS `px` 类。必须检查窄屏、长文本和底部安全区。
- Wot 组件通过 `wd-*` easycom 注册；uv-ui 来自 `src/uni_modules`。同一功能优先延续所在页面已有组件体系，不为一个控件引入第三套 UI 库。
- UnoCSS 无法可靠扫描运行时拼接的动态图标类。新增动态 `i-*` 图标时，将完整类名放入静态源码注释或 `uno.config.ts#safelist`，并验证产物。
- 平台差异使用 uni-app 条件编译注释（如 `#ifdef MP-WEIXIN`、`#ifndef H5`）或 `@uni-helper/uni-env`。修改一个分支时检查其他分支仍可编译。
- 导航栏设为 `custom` 的页面延续现有 `uv-navbar` 方案，开启 `placeholder`，按页面使用 `safe-area-inset-top` 或安全区工具类，并为非首页接好返回事件；不要只看 H5 预览判断布局正确。

## 已知基线与易踩坑

本节的日期快照是某一时刻的实测结果。修复了对应问题后，必须同步更新或删除该条目，避免把历史基线当作永久豁免。

- 2026-07-14 实测：`pnpm lint` 有 65 errors / 20 warnings，主要集中在 `src/pages/appoint/arrange-by-time.vue`、`src/pages/me/my-appointments.vue`、`src/utils/globalError.ts`；不要把这些文件的遗留格式当范本。
- 同一基线下，`pnpm type-check` 在 `src/uni_modules/uv-popup/components/uv-popup/uv-popup.vue:122` 报 `TS1005`；`pnpm build:h5:test` 因多个页面从 `@/utils` 导入未被 barrel 导出的 `openWebview` 而失败。后续应重新运行确认现状，不要把这份快照当作永久豁免。
- `src/api/login.ts` 中普通 H5/App `login()`、验证码和双 token `refreshToken()` 当前会直接抛出 `Not implemented.`；可用主流程是微信登录。触及 H5/App 认证或双 token 时必须先补齐并联调真实后端契约。
- `@img` 在 `vite.config.ts` 中指向 `src/static/images`，在 `tsconfig.json` 中却指向 `src/static/*`。统一配置前不要新增 `@img` TS 导入；使用 `/static/images/...` 运行时路径或明确的 `@/static/images/...`。
- `src/hooks/useUpload.ts` 与 `src/utils/uploadFile.ts` 都提供名为 `useUpload` 的实现，而 hooks 又会自动导入。选用前先确认目标调用方式，避免自动导入和显式导入冲突；不要无需求合并两套实现。
- 当前磁盘中的生成清单可能包含旧标题或旧大小写。它只能用于一次构建后的核对，不能反向覆盖 `definePage`、`pages.config.ts` 或 `manifest.config.ts`。

## 测试与验证

仓库当前没有业务单元测试、组件测试、端到端测试文件，也没有可直接运行的 `test` script；安装了 `uni-automator` 不等于已有自动化测试。不要声称“测试通过”而只运行了类型检查。

最低验证要求：

- 仅文档修改：检查 Markdown、路径和命令，运行 `git diff --check`，确认没有生成物或无关文件进入 diff。
- TS、store、hook、API 修改：至少运行 `pnpm type-check`、`pnpm lint`，并对改动文件做针对性行为检查。
- 页面、组件或样式修改：完成上述静态检查，并至少在受影响的主要平台运行/构建；跨端代码默认检查 H5 与微信小程序。
- 路由、登录、tabbar、清单或条件编译修改：必须运行对应平台构建，并在开发者工具/运行时手测导航、返回栈、刷新和登录状态。
- HTTP 修改：联调成功响应、业务错误、非 2xx、网络失败和 401；确认 H5 代理与微信 develop/trial/release 地址行为。
- App 专属权限、原生插件或清单修改：至少执行 App 构建，并记录需要 HBuilderX、真机或云打包才能完成的验证。
- 依赖或 Vite/UnoCSS 配置修改：运行所有静态检查和至少一个相关 production build，检查锁文件和生成包。

如果全量检查因仓库已有问题失败，先确认失败是否由本次 diff 引入；交付时列出执行过的命令、结果和最小错误摘要，不要擅自修复任务外问题。

## 安全与隐私

- 永远不要提交 App Secret、密码、私钥、真实访问/刷新 token、ticket、cookie 或生产用户数据。README 已明确 App Secret 不得进入公共仓库。
- `VITE_*`、小程序 AppID 和客户端常量都可被最终用户读取；真正秘密必须保存在后端或平台安全配置中。
- 新代码不得记录 token、ticket、密码、`signed_openid`、完整用户对象或敏感接口响应。调试日志在提交前删除或脱敏。
- 不把认证信息放进普通页面 query、全局错误字符串或长期 storage。延续现有 token store 的集中处理，退出/解绑时清理相关状态。
- webview 只通过 `openWebview` 打开；新增可变 URI 来源时需做协议/域名白名单校验，避免把用户输入直接变成外部跳转。
- URL 和查询参数使用 `encodeURIComponent`/现有解析工具；不要用字符串拼接传递未编码的重定向地址或用户内容。
- 不为“方便调试”关闭生产域名、TLS、认证或权限校验。`manifest.config.ts` 中权限、Android SDK、微信 `urlCheck` 等变化必须说明理由并做平台验证。
- `src/pages/generic/terms.vue` 是面向用户的协议与隐私文本；除非需求明确且内容已经产品/法务确认，不做顺手措辞修改。
- 上传功能必须沿用现有上传工具的大小、数量、MIME/扩展名和认证处理；客户端校验不能替代后端校验。

## Git 与交付约定

- 开始修改前运行 `git status --short --branch`，确认用户指定分支和已有改动。不要自动 reset、checkout 或删除用户工作。
- 提交消息由 commitlint 强制 Conventional Commits，例如 `feat: ...`、`fix: ...`、`docs: ...`、`refactor: ...`。
- pre-commit 会运行 lint-staged 并自动执行 ESLint fix。提交前先检查 diff，避免 hook 将无关格式化混入提交。
- 不提交 `dist/`、`src/pages.json`、`src/manifest.json`、`src/types/`、日志、IDE 文件或任何秘密。
- 最终交付前运行 `git diff --check` 和 `git status --short`，逐项阅读 diff；说明改了什么、验证了什么，以及仍需在哪个平台手测。
- 若本文未来接近 1000 行，应保持根文件为核心规则和导航，将详细架构、执行、API provider、测试与安全说明拆到 `docs/`，并从这里链接；不要继续堆成百科全书。
