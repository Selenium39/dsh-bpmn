# dsh-bpmn 交接文档（HANDOFF）

> 本文档面向**接手开发的 agent / 开发者**，自包含：不需要原对话上下文即可继续。
> 最后更新：2026-11-09 · 骨架脚手架阶段（v0.1.0-alpha.1）

## 1. 项目定位

DeepSeek Harness（DSH）插件 `dsh-bpmn`：在 DSH Web GUI 里提供 BPMN 2.0 可视化建模（bpmn-js）。双面板设计：**工作台**（Modeler，编辑）+ **侧边预览**（Viewer，只读，v0.2）。对标 VSCode 的 [vs-code-bpmn-io](https://github.com/bpmn-io/vs-code-bpmn-io)。

**当前状态**：骨架脚手架已完成，代码可编译路径已铺好；有 9 个编号待确认点（`handoff-1` ~ `handoff-9`，源码里已埋 TODO 注释）需要对照真实依赖源码逐一落实。v0.1 未完成，尚不可用。

## 2. 目录结构与构建链

```
dsh-bpmn/
├── package.json          # dsh manifest + peer/dev/dependencies
├── cordis.patch.yml      # bundle 插入行（id/name 必须 = 包名）
├── tsconfig.json         # src/ → lib/（js）+ lib/types/（d.ts）
├── tsdown.config.ts      # lib/client/index.js → lib/client.js 单文件 CJS factory
├── src/
│   ├── index.ts          # host 半（Node）：/bpmn-modeler loopback RPC + fs
│   └── client/
│       ├── index.ts      # client 半：locale + slots 注册（入口按钮 + 工作台）
│       ├── rpc-types.ts  # host RPC 契约的 client 侧镜像
│       ├── store.ts      # createBpmnStore 工厂 + useBpmnStore hook
│       ├── locales.ts    # zh/en 文案（NS = 'dsh-bpmn'）
│       ├── BpmnToggle.tsx      # sidebar.footer.action 入口
│       ├── BpmnWorkbench.tsx   # 工作台（文件栏+画布+状态栏+Ctrl+S）
│       ├── BpmnModeler.tsx     # bpmn-js Modeler React 封装
│       ├── virtual-modules.d.ts # virtual:bpmn-vendor-css / *.module.css 声明
│       └── styles/workbench.module.css
└── docs/HANDOFF.md       # 本文档
```

构建链（关键，别改错顺序）：

```
pnpm build = tsc -b tsconfig.json && tsdown
  1) tsc：src/**/* → lib/**/*.js + lib/types/**/*.d.ts
  2) tsdown：以 lib/client/index.js 为入口打成 lib/client.js
     - format cjs + banner `window.__ModuleLoader__.load({ id: 'dsh-bpmn', factory: (require) => {`
     - inlineDynamicImports: true（web shell 只加载一个 factory 文件）
     - 模块表 external（react/cordis/ui-slots/ui-primitives/runtime）不打包
     - bpmn-js 等 third-party 全部内联（"private copy" 规则）
     - *.module.css 经 lightningcss 编译成注入 <style> 的虚拟模块
     - virtual:bpmn-vendor-css 把 bpmn-js / properties-panel 的 4 个 css
       拼成一个注入标签（diagram-js.css、bpmn-js.css、properties-panel.css、
       element-templates.css）
```

## 3. DSH 插件机制速查（调研结论，2026-11-09 基于 0.1.1-rc.2）

### 双端模型

- **host 半**（`src/index.ts`，Node）：`export const name/inject/Config` + `apply(ctx, config)`；可 `ctx.tools.register()` 注册模型工具、`ctx.on()` 监听会话事件、经 `connection` 服务注册 RPC channel。
- **client 半**（`src/client/index.ts`，浏览器）：`export const inject` + `apply(ctx: ClientContext)`；只能通过 `ctx.slots.register/inject` 组合 UI，无模块级副作用。
- 一个 npm 包两半：`exports['.']` → host，`exports['./client']` → 浏览器（`dsh.client.platform: 'web'` 必填，缺 `./client` 导出会扫描报错）。

### package.json 的 dsh 字段

```jsonc
"dsh": {
  "bundle": { "patch": "./cordis.patch.yml" },   // 插入行；files 必须包含该文件
  "client": {
    "platform": "web",                            // 必填
    "inject": ["@deepseek-ai/dsh-client-runtime"],     // 包名级依赖信息（不控制加载顺序）
    "external": ["@deepseek-ai/dsh-client-ui-primitives"] // 非基线模块表请求
  }
}
```

### slot 体系（UI 组合唯一入口）

```ts
ctx.slots.register(
  { name: 'shell.overlay', id: 'dsh-bpmn-workbench', order: 60, locale: NS,
    store,                       // 共享 store（工厂产物）
    inject: () => ({ rpc, projectPath }) },  // 闭包业务 face（纯数据+回调）
  Component,
)
// 注入"别人声明"的 slot 用：
ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ ... }, Component))
```

已知可用 slot 名（artifact-viewer 实证）：`sidebar.footer.action`、`shell.overlay`、`conversation.message.images`。布局相关：三栏 AppFrame（sidebar/main/rightbar），全局面板占 root 作用域 `main` **keyed slot**（`conversation` 是保留 key，Plugins 页即此形态），`ctx.layout.selectPanel(id)` 切换——**keyed 注册方式未实证**（见 handoff-7）。

### 依赖声明规则（verify-client-packages 会查）

| 类型                                             | 放哪                                           |
| ------------------------------------------------ | ---------------------------------------------- |
| Cordis / dsh-client-*（client 值导入）           | `peerDependencies` + `devDependencies`（镜像） |
| react / react-dom                                | peer + dev（浏览器由 shell 模块表提供）        |
| bpmn-js、bpmn-js-properties-panel 等 third-party | `dependencies`，打进 bundle                    |
| 仅类型引用（`import type`）                      | 擦除后无请求，随便                             |
| 模块表 external（react 等 8 个）                 | 绝不能出现在 dependencies                      |

### 调试 / 加载 / 验证

```sh
dsh web --patch ./dev.cordis.yml      # 免装加载（--patch 优先级最高）
dsh plugin --profile web add ./dsh-bpmn   # 打包形态安装（走 pnpm）
dsh --profile web --dump-config       # 树里没有 row id = 组合问题（名字/打包缺失）
# row 在但无效果 = 代码问题；apply 内抛错会崩进程，解析失败只走 logger（易静默）
```

- **无热重载**：改完必须重启 dsh；资源用 `ctx.effect()` 带释放函数，避免端口/监听器泄漏。
- 发布：npm publish + GitHub 仓库打 `dsh-plugin` topic（进 Plugin Hub 发现列表）。README 需注明测试所用的 dsh rc 版本 + 访问了哪些内容（inject 列表如实写）。

### 权威参考（按优先级）

1. 官方仓库 `packages/client/AGENTS.md`（slot 纪律 / 依赖规则 / 新包 checklist）
2. [dsh-artifact-viewer 源码](https://github.com/wang-junjian/dsh-artifact-viewer)——**结构同构的实战样板**（双端+面板+RPC+文件），本骨架的 package.json / tsdown / client apply 都对齐它
3. [ssdnodes 插件开发教程](https://www.ssdnodes.com/learn/lang/zh-hans/write-your-own-dsh-plugin)（基于 0.1.0-rc.7）
4. 官方 [ui-layout README.zh.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-layout/README.zh.md)（AppFrame/panel 几何）

> 抓仓库源码用 raw：`https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>`（如 web_reader / curl）。**rc API 有漂移风险，动手当天先核对上游。**

## 4. host RPC 契约（已实现，client 依赖它）

channel `/bpmn-modeler`，`authority: 'loopback'`，信封 `{ ok: true, value } | { ok: false, error: { code, message, details } }`：

| endpoint      | payload                      | 返回                                                    |
| ------------- | ---------------------------- | ------------------------------------------------------- |
| `files/list`  | `{ projectPath }`            | `BpmnFileMeta[]`（忽略 node_modules/.git 等，上限 500） |
| `file/read`   | `{ projectPath, path }`      | `{ xml }`（utf8，≤2MB，限 .bpmn，防目录穿越）           |
| `file/write`  | `{ projectPath, path, xml }` | `null`（tmp+rename 原子写）                             |
| `file/create` | `{ projectPath, path }`      | `{ xml }`（空模板；已存在报错）                         |

## 5. 待确认点清单（handoff-1 ~ 9，源码已埋 TODO）

> ✅ **1 / 2 / 4 / 5 / 6 已解决**（1/4/5 在脚手架阶段对照类型落实；2/6 在 2026-11-09 运行时手测中落实并验证），余下 4 项交给 v0.1 收尾及 v0.2。

| #   | 位置                                  | 状态      | 问题与确认方法                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/client/index.ts` `createBpmnRpc` | ✅ 已解决 | 真实签名 `ClientConnectionRpc.call(channel, endpoint, payload, signal?)`，即 `ConnectionHandle['rpc']`（`node_modules/@deepseek-ai/dsh-client-connection/lib/types/rpc.d.ts`）。已按真类型实现，成功 payload 用 `as` 收窄                                                                                                                                                                                                                |
| 2   | `BpmnWorkbench.tsx` `projectPath`     | ✅ 已解决 | **不走 face**：`useSessions` 是 runtime 合并进 `GlobalStandardProps` 的标准 hook（每个 slot 组件都有，`shell.overlay` 也不例外），`useSessions((l) => l.byId[l.current]?.cwd ?? null)` 一步派生，与 artifact-viewer `ArtifactPanel` 同款。props 类型加 `PropsRuntime<"shell.overlay">`；无 cwd（空白新会话）时文件栏显示提示文案，状态栏显示当前路径                                                                                     |
| 3   | `rpc-types.ts`                        | ⬜        | host/client 契约双份定义。对齐 artifact-viewer 或 ui-conversation 的 `contract/` 模式统一                                                                                                                                                                                                                                                                                                                                                |
| 4   | `store.ts`                            | ✅ 已解决 | 官方引擎：`defineStore` 从 `@deepseek-ai/dsh-client-runtime/client` 导出（模块表 external，value import 合法）。actions 为 immer draft 变换（`satisfies ActionsDecl<BpmnState>`），框架烘焙后经 `PropsStore` 注入组件                                                                                                                                                                                                                    |
| 5   | `BpmnToggle/BpmnWorkbench` props      | ✅ 已解决 | 组件 props = `PropsStore<BpmnStoreHandle>`（`{ useStore, actions }`）+ inject face（`rpc`, `projectPath`）。组件声明为注入 props 的子集即可（函数参数逆变天然兼容）；`useStore((s) => s)` 取全量快照                                                                                                                                                                                                                                     |
| 6   | `BpmnModeler.tsx`                     | ✅ 已解决 | **命名导出坑**：包的 CJS 入口**无 default export**，`import x from` 拿到整个 exports 对象，塞进 `additionalModules` 后 didi 静默不渲染（无任何报错）。正确写法 `import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule }`，两个都传。`propertiesPanel.parent` 传 ref div；深色适配靠覆盖 `.bio-theme-parent` 的 `--bio-*` 变量（面板根类名 `bio-properties-panel`，旧 `bpp-` 前缀已废弃）；Name 字段渲染为 textarea 不是 input |
| 7   | `BpmnWorkbench.tsx`                   | ⬜        | `shell.overlay` → `main` keyed 全局面板迁移（更正统，selectPanel 切换）。抓官方仓库 `packages/client/ui-workspace`（或 Plugins 页所在包）的 client apply 源码看 keyed 注册写法                                                                                                                                                                                                                                                           |
| 8   | `BpmnWorkbench.tsx` `createNew`       | ⬜        | 新建文件命名 UX（现为 diagram-N.bpmn 自增）。输入框 / 快捷面板，v0.1 收尾时定                                                                                                                                                                                                                                                                                                                                                            |
| 9   | `workbench.module.css`                | ⬜        | `--dsw-*` token 实名对齐（现为兜底字面量）。抓官方仓库 `packages/client/ui-theme/src/styles/` 的 token 清单                                                                                                                                                                                                                                                                                                                              |

## 6. 任务清单

### v0.1（工作台闭环）

- [x] `pnpm install` 跑通（见 §8 环境状态）
- [x] handoff-1：RPC 调用签名已按真实类型实现（`files/list` 的运行时联通待 handoff-2 后手测）
- [x] handoff-2：接入真实 projectPath（`useSessions` 标准-hook 派生 cwd，2026-11-09 运行时验证）
- [x] handoff-5：组件 props 对齐 slot 四份额
- [x] handoff-4：store 消费模式统一
- [x] handoff-6：接入 properties-panel（命名导出 + `--bio-*` 深色适配，2026-11-09 运行时验证）
- [x] 新建 → 画布编辑 → Ctrl+S 保存 → 重开文件 全链路手测（2026-11-09 `dsh plugin --profile web add` 本地 link 形态实测通过：文件列表/打开/改属性/Ctrl+S/磁盘落盘/重开/新建/全屏）
- [x] 打包形态验证：`dsh plugin --profile web add ./dsh-bpmn` + 重启 + `--dump-config`（link: 安装，bundles 对账正常）
- [ ] `pnpm run lint` 收敛剩余 1 个 warning（BpmnWorkbench.tsx useOptionalChain，unsafe fix，改 `active?.dirty` 即可）；`test` 用例补齐（vitest + @testing-library 已在 devDeps）
- [ ] README 安装命令替换真实 npm 包名/仓库地址（package.json 里 USERNAME 占位）

### v0.2（侧边预览）

- [ ] `BpmnViewer.tsx`（bpmn-js `Viewer` 只读封装，复用 rpc-types）
- [ ] 会话内 `.bpmn` 文件链接拦截（对照 artifact-viewer 对 `.fileLink`/产物 chips/Markdown 链接的拦截手法）
- [ ] 预览浮层 + "在建模器中打开"（写 store.activePath + openPanel）
- [ ] handoff-7：若 main keyed panel 可用，工作台迁移过去

### v0.3+

- [ ] bpmnlint、属性面板汉化、dmn-js、agent 按图执行联动（画完让 DSH 按流程跑）

## 7. 已知设计决策（为什么这样做）

- **v0.1 用 `shell.overlay` 而非 main keyed panel**：overlay 有 artifact-viewer 实证可用；keyed 注册方式未实证（handoff-7），不阻塞主线。
- **bpmn-js 打包进 bundle**：第三方库 private copy 是官方规则；bundle 会胖（~1MB+），可接受，模块表 external 只有 shell 提供的 8 个。
- **host 侧做文件系统操作**：浏览器无 fs；loopback RPC + 路径穿越防护 + 原子写是 artifact-viewer 验证过的模式。
- **store 用官方 defineStore**：`@deepseek-ai/dsh-client-runtime/client` 直接导出 `defineStore`（immer draft actions，组件经 `PropsStore` 拿烘焙后的 `useStore`+`actions`）——外部插件可用，无需自写。
- **版本固定**：bpmn-js `18.31.1`、properties-panel `5.65.3`（DSH 生态审核要求固定依赖版本，防供应链漂移）。
- **TypeScript 锁 5.9.x（`~5.9.3`）**：TS 6.0 的 NodeNext 解析行为有变——无 `exports` 字段的包（bpmn-js 即是）子路径直接解析失败、且 `@types/node` 自动包含失效（TS2591）。artifact-viewer 声明 `^6.0.3` 但本骨架在 6.0.3 上实测不通，降 5.9.3 后全绿。升级 TS 6 前先验证这两点。
- **moduleResolution 用 `bundler`**：bpmn-js 的 d.ts 内部相对导入不带扩展名（为 bundler 设计），NodeNext 会挂；client 半本来就是 tsdown 打包消费，host 半 ESM 输出不受影响。

## 8. 环境状态（2026-11-09 运行时手测更新）

- 脚手架机器：macOS，Node v22.22.0，pnpm 10.30.3，**dsh CLI 0.1.0-rc.6**（node_modules 类型是 0.1.1-rc.2——实测 rc.6 运行时兼容本插件，slot/标准 hook/RPC 无漂移问题）
- `pnpm install` ✅（约 1 分钟；`--ignore-scripts` 装完再 build，避免 prepare 中途失败留下半链接）
- `pnpm run typecheck` ✅ 全绿（tsc 5.9.3，`--noEmit`）
- `pnpm run build` ✅（tsc -b → tsdown；产物 `lib/index.js` 8KB、`lib/client.js` **4.89MB** 单文件 factory——properties-panel 及其 FEEL 编辑器依赖全内联所致、`lib/types/**/*.d.ts`）
- `pnpm run lint` ⚠️ 1 warning（useOptionalChain，unsafe fix；`lint:fix` 已修 48 文件）
- **运行时联通 ✅ 已实测**（`dsh plugin --profile web add <本地路径>` → link: 安装 → `dsh web`）：toggle 出现、空态提示、projectPath 派生、files/list、file/read、file/write（磁盘落盘验证）、file/create、Ctrl+S、重开、全屏全部通过
- 踩坑记录：
  - TS 6.0.3 NodeNext 双坑（见 §7 最后两条），降 5.9.3 + bundler 解决
  - properties-panel vendor css **不在本包**：在传递依赖 `@bpmn-io/properties-panel/dist/assets/`（pnpm 隔离，顶层不可达），tsdown 需用 `createRequire` 从包根解析（已改，原路径静默缺失）；`element-templates.css` 在 5.65.3 已不存在
  - web 端"选择工作区"走 **native 目录选择器**（浏览器外系统对话框），自动化测试够不着；替代方案：`cd <项目> && dsh --profile headless "<任务>"` 产生一个 cwd=项目的 session，web 端刷新即可见（session.cwd 不依赖 workspace 注册表）
  - 用户 LLM router 偶发 `STREAM_CLOSED`，重试一次仍断即停，session 日志仍会落盘

## 9. 上游漂移预警

DSH `0.1.x-rc` 候选版本间可能重命名 slot/manifest 字段。若加载异常：先 `--dump-config` 看 row；再对照**当天**的 `packages/client/AGENTS.md` 与 `dsh-artifact-viewer` 最新源码；ssdnodes 教程基于 0.1.0-rc.7、本骨架对齐 0.1.1-rc.2（2026-08-19 发布），均已可能过时。
