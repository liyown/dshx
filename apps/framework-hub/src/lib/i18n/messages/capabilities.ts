/**
 * capabilities
 *
 * The home page's capability carousel. The component owns which capabilities
 * exist, their order and their demos; the words are here.
 */

const en = {
  "home.capabilities.title": "Host, Client, build and runtime tooling",
  "home.capabilities.body":
    "The left column explains each capability and its constraints. The right panel shows the matching source or runtime output.",
  "home.capabilities.contributions.title": "Unified Host contribution model",
  "home.capabilities.contributions.body":
    "A single Host definition registers typed Tools, Commands, Prompts, Settings and APIs in a fixed order.",
  "home.capabilities.contributions.bullet1": "Fixed, inspectable contribution order",
  "home.capabilities.contributions.bullet2":
    "Providers are injected only when a contribution uses them",
  "home.capabilities.contributions.bullet3":
    "Native DeepSeek Harness registries still own lifecycle",
  "home.capabilities.contributions.status": "loader-ready Host module · no private runtime import",
  "home.capabilities.hmr.title": "Client HMR and automatic Host restart",
  "home.capabilities.hmr.body":
    "React and CSS updates use native Client HMR while the Host keeps running. Successful Host rebuilds restart automatically and restore registered contributions.",
  "home.capabilities.hmr.bullet1": "Client TSX and CSS update in place",
  "home.capabilities.hmr.bullet2": "One plugin-owned style without stale copies",
  "home.capabilities.hmr.bullet3": "An invalid config leaves the last-good session running",
  "home.capabilities.hmr.status": "Client stays live · Host restart is serialized",
  "home.capabilities.react.title": "React components and typed Hooks",
  "home.capabilities.react.body":
    "Author DeepSeek Harness UI with TSX components, Hooks and typed official Slot props. Browser-safe React libraries can be included when they satisfy the Client bundle contract.",
  "home.capabilities.react.bullet1": "React 18 and 19 peer range",
  "home.capabilities.react.bullet2": "Typed Slot, API and Settings Hooks",
  "home.capabilities.react.bullet3": "Official Client Fiber owns cleanup",
  "home.capabilities.react.status": "React component · official DeepSeek Harness Slot",
  "home.capabilities.tailwind.title": "Tailwind and the Vite ecosystem",
  "home.capabilities.tailwind.body":
    "DSHX processes CSS Modules, PostCSS, Tailwind v4 and build-capable Vite plugins through a bounded pipeline.",
  "home.capabilities.tailwind.bullet1": "Tailwind is optional",
  "home.capabilities.tailwind.bullet2": "dshx: prefix and no Preflight by default",
  "home.capabilities.tailwind.bullet3": "Images, fonts and SVG are inlined",
  "home.capabilities.tailwind.status": "Client output: one script, one owned style, assets inlined",
  "home.capabilities.inspect.title": "Live Runtime Inspect",
  "home.capabilities.inspect.body":
    "Read the active Composition through the selected adapter. Inspect runtime Slots, services and events with human-readable or JSON output.",
  "home.capabilities.inspect.bullet1": "Read-only, runtime-backed results",
  "home.capabilities.inspect.bullet2": "Focused Slot trees with --root",
  "home.capabilities.inspect.bullet3": "JSON output for agents and tooling",
  "home.capabilities.inspect.status": "active Composition · runtime-backed data",
  "home.capabilities.add.title": "Transactional source generation",
  "home.capabilities.add.body":
    "Generate typed UI, Tool, Command or Hook code. Preview the patch, validate the project and roll back failed writes.",
  "home.capabilities.add.bullet1": "ui · tool · command · hook",
  "home.capabilities.add.bullet2": "--dry-run before touching files",
  "home.capabilities.add.bullet3": "Transactional project validation",
  "home.capabilities.add.status": "inspect → generate → validate → commit",
  "home.capabilities.api.title": "Typed Host–Client API",
  "home.capabilities.api.body":
    "One browser-safe contract types React Client calls and requires the Host to implement its exact method keys. Standard Schema validation runs once at the Host boundary.",
  "home.capabilities.api.bullet1": "Standard Schema input and output transforms",
  "home.capabilities.api.bullet2": "Strict query states and cancellation",
  "home.capabilities.api.bullet3": "Capability wiring inferred after tree-shaking",
  "home.capabilities.api.status": "shared types · schemas run once at the Host boundary",
} as const;

const zh: Record<keyof typeof en, string> = {
  "home.capabilities.title": "Host、Client、构建与 Runtime 工具",
  "home.capabilities.body": "左侧说明每项能力及其边界，右侧展示对应源码或 Runtime 输出。",
  "home.capabilities.contributions.title": "统一的 Host Contribution 模型",
  "home.capabilities.contributions.body":
    "单个 Host 定义以固定顺序注册类型化的 Tool、Command、Prompt、Settings 与 API。",
  "home.capabilities.contributions.bullet1": "固定且可检查的贡献顺序",
  "home.capabilities.contributions.bullet2": "仅当 Contribution 使用 Provider 时自动注入",
  "home.capabilities.contributions.bullet3": "生命周期仍由 DeepSeek Harness 原生 Registry 管理",
  "home.capabilities.contributions.status": "直接输出 Loader 模块 · 不保留私有 Runtime Import",
  "home.capabilities.hmr.title": "Client HMR 与 Host 自动重启",
  "home.capabilities.hmr.body":
    "React 与 CSS 修改使用原生 Client HMR，不重启 Host。Host 构建成功后自动重启并恢复已注册的 Contribution。",
  "home.capabilities.hmr.bullet1": "Client TSX 与 CSS 原地更新",
  "home.capabilities.hmr.bullet2": "每个插件保留一份 Owned Style，不产生陈旧副本",
  "home.capabilities.hmr.bullet3": "新配置无效时继续运行 Last-good Session",
  "home.capabilities.hmr.status": "Client 保持在线 · Host 重启串行执行",
  "home.capabilities.react.title": "React Component 与类型化 Hook",
  "home.capabilities.react.body":
    "使用 TSX Component、Hook 和官方 Slot Props 类型编写 DeepSeek Harness UI。满足 Client Bundle 契约的 Browser-safe React 库可以直接使用。",
  "home.capabilities.react.bullet1": "React 18 与 19 Peer Range",
  "home.capabilities.react.bullet2": "类型化 Slot、API 与 Settings Hook",
  "home.capabilities.react.bullet3": "官方 Client Fiber 负责清理",
  "home.capabilities.react.status": "React Component · 官方 DeepSeek Harness Slot",
  "home.capabilities.tailwind.title": "Tailwind 与 Vite 生态",
  "home.capabilities.tailwind.body":
    "DSHX 通过受约束的管线处理 CSS Modules、PostCSS、Tailwind v4 与支持 Build 的 Vite 插件。",
  "home.capabilities.tailwind.bullet1": "Tailwind 可选",
  "home.capabilities.tailwind.bullet2": "默认 dshx: 前缀且不启用 Preflight",
  "home.capabilities.tailwind.bullet3": "图片、字体与 SVG 全部 Inline",
  "home.capabilities.tailwind.status": "Client 输出：单脚本、单 Owned Style，资源全部 Inline",
  "home.capabilities.inspect.title": "Live Runtime Inspect",
  "home.capabilities.inspect.body":
    "通过当前 Adapter 读取活动 Composition，并以可读文本或 JSON 查看 Runtime Slot、Service 与 Event。",
  "home.capabilities.inspect.bullet1": "只读且来自真实 Runtime",
  "home.capabilities.inspect.bullet2": "使用 --root 聚焦 Slot Tree",
  "home.capabilities.inspect.bullet3": "提供适合 Agent 与 Tooling 的 JSON 输出",
  "home.capabilities.inspect.status": "活动 Composition · Runtime-backed 数据",
  "home.capabilities.add.title": "事务式源码生成",
  "home.capabilities.add.body":
    "生成类型化 UI、Tool、Command 或 Hook。支持预览 Patch、项目校验与失败回滚。",
  "home.capabilities.add.bullet1": "ui · tool · command · hook",
  "home.capabilities.add.bullet2": "--dry-run 不触碰文件",
  "home.capabilities.add.bullet3": "事务式项目校验",
  "home.capabilities.add.status": "inspect → generate → validate → commit",
  "home.capabilities.api.title": "类型化 Host–Client API",
  "home.capabilities.api.body":
    "Browser-safe 契约为 React Client 调用提供类型，并要求 Host 精确实现契约中的 Method Key。Standard Schema 校验只在 Host 边界执行一次。",
  "home.capabilities.api.bullet1": "Standard Schema 输入输出 Transform",
  "home.capabilities.api.bullet2": "严格 Query 状态与取消行为",
  "home.capabilities.api.bullet3": "Tree-shaking 后推断 Capability 接线",
  "home.capabilities.api.status": "两端共享类型 · Schema 仅在 Host 边界运行一次",
};

export const capabilitiesMessages = { en, zh };
