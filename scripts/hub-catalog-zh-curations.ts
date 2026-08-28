/**
 * Human-reviewed Chinese leads for catalog entries whose previous localization
 * only repeated the package name or redirected readers to the README.
 *
 * Every statement below is derived from the saved English curation or the
 * corresponding public README. Keep technical product names and identifiers
 * untranslated so that readers can verify the claims against the source.
 */
export const curatedZhPluginLeads: Readonly<Record<string, string>> = {
  '0xsline-dsh-spotlight': '面向 DeepSeek Harness Web 的键盘优先命令面板，帮助用户快速搜索并执行界面命令。',
  '1e0zj-dsh-plugin-mall-af99a934':
    '面向 DeepSeek Harness 的开放插件市场：检索带有 topic:dsh-plugin 标签的 GitHub 仓库，自动核验真实 DSH 插件，并提供一键安装与更新。',
  'aiwayds-dsh-subagent-registry':
    '将 ~/.dsh/agents/ 中的本地 Markdown Agent 注册为可按名称调用的 DSH 子 Agent。每个 Agent 使用独立人格运行；任务因错误、取消、崩溃或 token 上限中断后，下次调用可从已保存的进度继续。',
  'btspoony-mstar-harness-dsh-packages-dsh':
    '将 Morning Star 作为一等 DSH Host 嵌入运行：挂载 mstar 引擎与技能镜像，校验并保护 status.json 写入，在强制模式下拦截违规子 Agent 调度，并检查 SKILL.md 变更。',
  'chen-001-dsh-grok-tui': '让用户通过 grok-build 的终端界面使用 DSH。',
  'damonkoy-dsh-web-ui-dsh-live-stats-packages-dsh-live-stats':
    '在 DSH Web 会话状态栏实时显示输入/输出 token 估算和生成吞吐率；回复流式生成时持续更新 token 总数，并在步骤统计之后展示 TPS。',
  'dsh-float': '将 DSH Web 以透明终端式 TUI 呈现在无边框 Electron 悬浮窗口中，提供轻量、常驻的交互模式。',
  'dsh-game-studio': '面向 DeepSeek Harness 的游戏工作室套件，移植 Claude-Code-Game-Studios 的 Agent 架构，以 Cordis bundle 提供 49 个角色和 74 条命令。',
  'dsh-git': '为 DeepSeek Harness 侧边栏提供可视化 Git 面板，可暂存变更、提交、推送并切换分支。',
  'dsh-git-bundle': 'dsh-git 全套组件的 Profile 聚合包，一次安装即可接入整套 Git 功能。',
  'dsh-git-chain': '在 DeepSeek Harness 中提供 Cursor 风格的 Git 提交链图，包含 SVG 分支轨道、提交详情、diff、筛选和受保护的分支切换。',
  'dsh-mcp-admin': '通过 /mcp 查看 MCP 状态，并在设置页管理 MCP Server；配置变更写入 cordis.patch.yml。',
  'dsh-memory': 'DeepSeek Harness 的持久化长期记忆插件，提供统一记忆工具、Markdown 存储、自动会话摘要、策展治理和用户画像注入。',
  'dsh-models-radar': '为 DeepSeek Harness Web 提供模型能力雷达，集中呈现可用模型及其能力信息。',
  'dsh-periscope':
    '让文本型 DeepSeek V4-Flash/V4-Pro 继续处理普通请求，并将包含图片的请求自动路由到官方视觉模型 deepseek-v4-flash-vision-exp，无需手动切换模型。',
  'dsh-pet':
    '面向 DSH Web 的持久化养成型桌面宠物：按每个 assistant step 的 token 用量累计经验和货币，随等级进化；用户可命名宠物、上传分阶段动画图集，并购买和装备饰品及背景。',
  'dsh-plugin-05b1620f':
    '把 Plane 项目管理接入 DeepSeek Harness：Agent 可通过 Plane REST API 操作项目、工作项、评论、周期、状态和标签，并可访问其他原始接口；Web UI 同时增加设置卡和 Plane 侧边栏。',
  'dsh-plugin-agent-workflow': '面向 DSH 0.1.1 的可视化 Agent 工作流浏览器，用于查看和理解 Agent 执行流程。',
  'dsh-plugin-conjure': '让 DeepSeek Harness 在对话中直接渲染 HTML、CSS 和 JavaScript 回复，而不局限于 Markdown 展示。',
  'dsh-plugin-extension-center': 'DeepSeek Harness 社区扩展中心，可发现和管理插件、MCP 连接与 Skills，并提供签名目录、审批、回执和恢复机制；当前为开发预览版。',
  'dsh-plugin-fbd37d82':
    '面向 DeepSeek Harness 的租户隔离求职助手：维护候选人档案，通过可插拔招聘门户采集职位，完成匹配排序、申请跟踪、面试准备，并在会话顶部展示求职流程看板。',
  'dsh-plugin-shop': '集成在 DeepSeek Harness 设置页中的插件商店，可浏览 DSH 插件目录、经一次确认完成安装，并统一管理已安装项目。',
  'dsh-plugins-01f47385': '为 DeepSeek Harness Web 提供零侵入的移动端抽屉和响应式布局适配。',
  'dsh-plugins-3f6d3d95':
    'DeepSeek Harness 的跨平台本地终端插件，支持 PowerShell、CMD、Git Bash、Bash、Zsh 等原生 Shell、多标签并发、与当前工作区同步的 cwd、移动端辅助按键和悬浮入口，并会清理敏感环境变量及退出后的子进程树。',
  'dsh-plugins-bb0d1f73': '为 DeepSeek Harness 接入 dsh-market 插件目录与市场能力的扩展包。',
  'dsh-quick-phrases': '在 DeepSeek Harness 输入框上方增加快捷短语 chips，并提供由 / 触发的短语菜单，减少重复输入。',
  'dsh-reveal-explorer': '从 DeepSeek Harness 一键在系统文件管理器中打开当前工作区。',
  'dsh-serenity-plugin': '@shgroup/dsh-serenity-plugin 的 DeepSeek Harness 扩展包；当前公开仓库未提供可核验的功能说明，因此不对具体能力作推断。',
  'dsh-skin-pack': 'DeepSeek Harness 深色主题：采用深海蓝渐变、毛玻璃面板、白色主操作按钮，并在空白页展示主题标语。',
  'dsh-skin-pack-0093a7e9': 'DeepSeek Harness 深色主题，以黄昏原野和低多边形橙色奶牛作为会话背景视觉。',
  'dsh-skin-pack-0b2bd258':
    'DeepSeek Harness 夜景主题，以深蓝为底，使用日落橙、紫色和粉色营造氛围，暖黄用于按钮、天蓝用于运行状态，并在新会话页展示暮色城市主视觉。',
  'dsh-skin-pack-0d89f3c1': 'Pearl Oracle 深色主题，采用暖灰石材、珍珠白、银色和雾蓝配色，并在新会话页展示珍珠横幅。',
  'dsh-skin-pack-1b41dcd9': 'Cosmic Exploration 视觉主题，为 DeepSeek Harness Web 提供宇宙探索风格的界面皮肤和新会话视觉。',
  'dsh-skin-pack-1e65bb1e': 'DeepSeek Harness 太空主题，以深蓝为底，使用紫、蓝、青三层强调色，并在新会话页展示完整的螺旋星系封面。',
  'dsh-skin-pack-213dcf52': 'Night Swing 深色主题，采用雨夜蓝、战斗红和霓虹青配色，并在新会话页展示雨夜横幅。',
  'dsh-skin-pack-39ac3372': 'Seaside Boutique 视觉主题，为 DeepSeek Harness Web 提供海滨精品店风格的界面皮肤和新会话视觉。',
  'dsh-skin-pack-3f8bfab4': 'Blue Whale Ocean 视觉主题，为 DeepSeek Harness Web 提供蓝鲸与海洋风格的界面皮肤和新会话视觉。',
  'dsh-skin-pack-418e6ee7': 'Rose Dream 浅色主题，采用粉白、玫瑰棕和玫瑰粉配色，并在新会话页展示玫瑰横幅。',
  'dsh-skin-pack-4b8234f6': 'Qitian Cosmic Monkey 视觉主题，为 DeepSeek Harness Web 提供齐天大圣与宇宙意象结合的界面皮肤。',
  'dsh-skin-pack-4bef1aae': 'Whale Wave Banner 视觉主题，为 DeepSeek Harness Web 提供鲸鱼与海浪横幅风格的界面皮肤。',
  'dsh-skin-pack-595fcdd2': 'Black Myth Wukong · Flame Mountain 视觉主题，为 DeepSeek Harness Web 提供黑神话悟空与火焰山风格的界面皮肤。',
  'dsh-skin-pack-664434d3': 'Misty Xianxia 浅色主题，为 DeepSeek Harness Web 提供云雾仙侠风格的界面皮肤和新会话视觉。',
  'dsh-skin-pack-706c6fad': 'DeepSeek Harness 浅色主题，采用三层淡蓝、珍珠白和深海藏蓝，并在新会话页展示全幅鲸鱼女孩封面。',
  'dsh-skin-pack-8033d756': 'Whale Girl Deep Sea 视觉主题，为 DeepSeek Harness Web 提供鲸鱼女孩与深海风格的界面皮肤。',
  'dsh-skin-pack-814b4b15': 'Night Flight Companion 视觉主题，为 DeepSeek Harness Web 提供夜航陪伴风格的界面皮肤和新会话视觉。',
  'dsh-skin-pack-9f673d89': 'Emerald Megacity 视觉主题，为 DeepSeek Harness Web 提供翡翠色未来都市风格的界面皮肤。',
  'dsh-skin-pack-ad4892e5': 'DeepSeek Harness 暖色主题，以深棕为底、日落橙用于主操作、麦金色用于边框和强调、冷蓝用于运行状态，并在新会话页展示黄金时刻横幅。',
  'dsh-skin-pack-ae19c199': 'Summer Hillside 视觉主题，为 DeepSeek Harness Web 提供夏日山坡风格的界面皮肤和新会话视觉。',
  'dsh-skin-pack-ba4e2825': 'Mars Flight Deck 视觉主题，为 DeepSeek Harness Web 提供火星飞行甲板风格的界面皮肤。',
  'dsh-skin-pack-c0f1951b': 'Twin Whale Girl 视觉主题，为 DeepSeek Harness Web 提供双鲸鱼女孩风格的界面皮肤。',
  'dsh-skin-pack-d0d42ff1': 'Forest Adventure 视觉主题，为 DeepSeek Harness Web 提供森林冒险风格的界面皮肤。',
  'dsh-skin-pack-d2202419': 'Night Forest Companion 视觉主题，为 DeepSeek Harness Web 提供夜间森林陪伴风格的界面皮肤。',
  'dsh-skin-pack-d4533ccf': 'Ponyo Water Orbit 视觉主题，为 DeepSeek Harness Web 提供水世界与环游意象的界面皮肤。',
  'dsh-skin-pack-e0476fed': 'Forest Companion 视觉主题，为 DeepSeek Harness Web 提供森林陪伴风格的界面皮肤。',
  'dsh-skin-pack-f2a6d437': 'Cosmic Hero 视觉主题，为 DeepSeek Harness Web 提供宇宙英雄风格的界面皮肤。',
  'dsh-skin-pack-f6b28659': 'Ultra Team Apocalypse 视觉主题，为 DeepSeek Harness Web 提供末日英雄团队风格的界面皮肤。',
  'dsh-skin-pack-f938ddb2': 'DeepSeek Harness 东方山门主题，以黑曜石为底、青铜作边框、宣纸白作文字、朱砂作强调、玉色表示状态，并在新会话页展示全幅山门视觉。',
  'dsh-skin-pack-fa4e5b09': 'DeepSeek Harness 占卜主题，以墨青黑为底、古金用于边框和按钮、玉绿仅表示运行、朱砂仅表示危险，并在新会话页展示完整占卜主视觉。',
  'dsh-status-rotator':
    '替换 DSH Web 回合底部的默认状态文字，支持按阶段切换、打字机与彩虹动画、定时轮播、{elapsed}/{phase}/{model}/{tps} 等实时占位符、浏览器标题轮播、实时状态胶囊和按时段启用的预设。',
  'dsh-store': 'DSH STORE 是 DeepSeek Harness 的第三方插件市场和受保护的插件生命周期管理器。',
  'dsh-tauri-launcher': '为 DeepSeek Harness 提供基于 Tauri 的桌面启动器。',
  'dsh-terminal-panel': '在 DeepSeek Harness 中增加终端面板，可在当前工作区执行命令并实时查看流式输出。',
  'dsh-token-meter':
    '跟踪 DeepSeek Harness 当前会话与历史 token，提供本地预估和 API 精确统计；分词器运行在 Web Worker 中以避免阻塞界面，并支持阈值提醒、自动停止会话、中英双语和主题适配。',
  'dsh-ui-balance': '在 DeepSeek Harness 的每条回复下显示对应的 DeepSeek API 余额。',
  'dsh-web-plugins':
    'DSH Web 的 AionUI 风格右侧面板包；原文件浏览与多格式预览面板已停止维护且无法再启用，当前仅保留 Side Card 设置卡以兼容旧 Profile，官方说明计划在后续聚合包中移除。',
  'dsh-web-plugins-0beb3dd8':
    '为 DSH Web 提供对话恢复：可编辑最后一条已完成的用户消息并显式重试失败回合。两种操作都通过官方 session fork 从受影响消息之前创建子分支，原对话不会被修改。',
  'dsh-web-plugins-12439f09':
    'DSH Web 多宠物伴侣：根据等待、思考、调用工具、组织回复、完成或失败等会话状态切换动画；支持摸头、喂食和好感度成长，并通过 pet.json 与图集自动发现和切换自定义宠物。',
  'dsh-web-plugins-1a72c99e':
    'DSH Web 技能中心：按来源浏览已加载 Skills，启用或禁用模型调用，新建 SKILL.md，并将删除项移入可恢复回收站；它遵循官方技能目录和注册表语义，不改变技能加载机制。',
  'dsh-web-plugins-1f21a712':
    '为 DSH 提供“梁神模式”两阶段 Agent 预设：首个模型请求只暴露 Minimal 的 bash 与 str_replace_editor 以锚定执行轨迹，建立锚点后切换到 PTC Mode，并恢复完整工具、提示与运行时上下文。',
  'dsh-web-plugins-368eb573':
    'DeepSeek Harness Profile 的事务式救援模式：Doctor Supervisor 与透明启动器维持隔离救援环境，检测启动失败、进程崩溃、心跳超时、Web 故障和白屏，并通过快照、确定性修复、隔离健康门禁及原子发布/回滚恢复 Profile。',
  'dsh-web-plugins-633c35aa':
    'DSH 远程 SSH 运维插件，提供主机 CRUD 与导入、密钥/密码/ssh-agent/ProxyJump、持久连接池、命令执行、Web 终端、SFTP 传输、端口转发、集群并发执行和 Agent 工具。',
  'dsh-web-plugins-6bd5999f':
    'DSH Web UI 家族的一键聚合包，包含任务看板、Git 图、宠物、远程 Web、设置、皮肤中心、社区目录和右侧面板，并集成 better-sidebar、归档管理器及整套皮肤资源。',
  'dsh-web-plugins-7d301640':
    '在 DSH Web 输入区增加提示词优化按钮，使用当前会话模型（无会话模型时使用默认模型）重写草稿，使角色、目标、上下文和结构更清晰，同时保持原意和语言不变。',
  'dsh-web-plugins-7f094d30':
    '为 DeepSeek 等纯文本模型增加 describe_image 工具：读取本地路径、HTTP(S) URL 或会话附件，调用 Qwen-VL、GLM-4V、GPT-4o、Claude 风格或 Ollama 视觉端点分析图片，仅把返回文本写入对话日志。',
  'dsh-web-plugins-8099ab69':
    '为 DSH Web 增加 Git 分支选择器和提交图面板；选择器在空白会话的官方输入选择器区域显示，并在运行时缺少对应 slot 时自动回退到输入 dock。',
  'dsh-web-plugins-929ad4b1':
    'DSH Web 生态的社区插件索引数据源，以 community.json 生成 Workshop 和 dsh-market.com 目录；只保存第三方仓库链接与元数据，不内置代码，也不再提供独立设置界面。',
  'dsh-web-plugins-92b0faad':
    'DSH Web 任务看板，提供五列 Kanban、搜索、归档和运行历史；Host 持久化任务台账并执行手动或定时任务，每次运行创建独立 DSH 会话，可固定工作区、Agent 预设和权限。',
  'dsh-web-plugins-944edf74':
    '创建可双击启动 DSH 的桌面图标：若 dsh web 尚未运行则自动启动，等待 GUI 就绪后打开配置地址；支持 Windows .lnk、macOS .command 和 Linux .desktop。',
  'dsh-web-plugins-a9ef50f7': '在 DSH Web 侧边栏增加 Session ID 面板，实时列出会话标题和完整 ID，支持按标题或 ID 搜索并一键复制，不需要 Host 端组件。',
  'dsh-web-plugins-de7f1693': '在 DSH Web 设置页增加 Workshop 商店，可内嵌浏览 dsh-market.com 并一键安装皮肤、宠物和插件；已安装内容继续由各自的设置模块管理。',
  'dsh-web-plugins-f3179278': '为 DSH 设置页增加 Web UI 家族的一级设置分区，集中承载任务看板、远程 Web、图片理解等插件的启用开关与配置表单。',
  'dsh-web-plugins-f8abc82d':
    'DSH Web 插件管理器：在官方 Plugins 设置中安装 npm 或 Git 插件、查看和更新已安装项、配置下次启动启停、处理安装冲突与撤销，并把失败交给修复会话。',
  'dsh-web-plugins-fc2621bd':
    '在 DSH Web 对话标题栏和侧边栏会话菜单增加永久删除操作；它会从 Host 会话存储移除当前会话并删除持久化 JSONL 日志，而不是仅做归档隐藏。',
  'dshbase-catalog': '让用户直接在 DeepSeek Harness 内搜索 dshbase 插件目录。',
  'forrestchang-dsh-multica-runtime': '为 Multica 环境提供 DSH 运行时接入。',
  'gin-7-dsh-pet-remielle': 'DSH Web 的 Remielle（绝区零）桌面宠物，会随 Harness 的等待、思考、工具执行等工作状态切换动态贴纸表情。',
  'harness-ai-desktop': '为 DSH Web 的品牌 slots 提供 Harness AI 品牌组件，并附带青绿色中性画布主题，支持明暗模式。',
  'hellosky983-dsh-skillradar': '扫描当前会话可见的 Skills，并按它们与最近对话的相关性排序。',
  'ibm-lab-agent': '基于 DeepSeek Harness、面向中国科学技术大学 iBM 实验室场景的 Agent 插件。',
  'iccuse-dsh-premise-guard': '在上下文压缩后检测前提漂移；若摘要丢失关键字面锚点，则一次性提示模型可能遗漏的内容及恢复方式。',
  'ilharp-dsh-tool-approval': '为 DeepSeek Harness 增加工具调用人工审批，即 Manual Mode / Ask Mode。',
  'internal-skill-workshop-plugin': '只读浏览已配置 Skill Base 目录的 DeepSeek Harness Web 插件。',
  'jayden-x-l-forkprobe': '在同一任务上并行比较多个 Skills 的结果，并选择表现最佳者。',
  'jinguanghai-deepseek-harness-forge-plugins-forge-tcm-plugins-forge-tcm': 'DeepSeek Harness 中医工具包，可进行八纲辨证，并从古方语料中检索药对。',
  'jorinyang-dsh-doctor': 'DSH 环境诊断与自愈工具，检查环境、Profile、配置、bundle、挂载、端口、健康状态和磁盘，支持分级修复及一键回滚。',
  'junqingv587-mattpocock-skills-dsh': '将 Matt Pocock 的 25 个工程与生产力 Agent Skills 打包接入 DSH，涵盖需求追问、TDD、代码审查、领域建模等工作流。',
  'lonelymoon87-dsh-guardian': '为 DeepSeek Harness 增加运行时工具策略、危险命令拦截、输出脱敏和安全审查流程。',
  'lzszq-dsh-scholar': 'dsh-scholar 学术研究扩展；当前公开仓库未提供可核验的详细功能说明，因此不对检索源或工作流作额外推断。',
  'magicof2-dsh-autoload-history': '打开 DSH 会话时自动载入完整对话历史，无需再点击“加载更早消息”。',
  'michengai-dsh-codex-suite': '保留给旧版 dsh plugin add Profile 的 Codex Suite 兼容聚合包；新安装与迁移应使用轻量 installer，由它把六个成员包写为直接依赖。',
  'monotykamary-dsh-base': '作为 Profile bundle 提供共享 DSH 核心，是每个 Profile 的第一层 patch，在空 Profile 根上插入基础插件行。',
  'monotykamary-dsh-host-apiproxy': 'DSH Host API 网关，包含 ApiProxy 契约、fetch 传输对，以及向 Host 提供 ctx.apiProxy 的网关插件。',
  'monotykamary-dsh-web-app': 'DSH 浏览器端 bundle：在 dsh-base 上叠加 Web patch，并提供前端产物服务、Web surface 提示、bash 运行变量和访问 URL 等运行时胶水。',
  'nanmicoder-dsh-agent-teams': '让 DSH 会话组织持久化子 Agent 团队，把目标拆成带依赖的任务，并通过直接消息协调协作。',
  'nanmicoder-dsh-agent-teams-fc64abd7':
    '把当前 DeepSeek Harness 会话变成团队 captain：组建持久化子 Agent、将目标拆成带依赖关系的任务，并通过直接消息协调执行。',
  'nattocb-dsh-plugin-notifications': '在 DSH 设置页增加通知卡；对话回合结束时弹出系统通知，并可选择播放 Web Audio 提示音。',
  'noumena-gpt': '在 DSH 中浏览、安装、更新和移除 Skills.sh 技能的管理插件。',
  'omdsh-dev-dsh-data-agent': '让 DSH 连接数据库并通过自然语言完成数据分析：Agent 可编写 SQL、查询数据并生成可执行的业务洞察。',
  'omdsh-dev-dsh-deep-research': '基于官方工作流引擎的自适应深度研究编排器，使用控制论和信息论方法组织 DeepSeek Harness 的研究流程。',
  'omdsh-dev-dsh-notification': '为 DeepSeek Harness 回合完成提供桌面通知，可按成功或失败结果控制，并支持关键词包含/排除规则。',
  'omdsh-dev-qwen-mm-plugins': '为 Agent Harness 增加原生多模态能力的 Qwen-MM 插件集合。',
  'open-design': '让 OpenDesign 通过严格 JSONL stdio 协议驱动用户已安装的 DeepSeek Harness；该 bundle 不内置 dsh 可执行文件、Node.js、凭据或 Provider 配置。',
  'sakuraqqq-dsh-auto-paste': '在 DSH Web 输入框粘贴大段文本时，自动保存为附件文件。',
  'severuszh-dsh-plugin-subagent-director': '按子 Agent 分别选择 LLM Provider 和模型，并通过角色模板配置其职责。',
  'smelt-ai-dsh-acp-rich':
    '面向 DeepSeek Harness 的完整交互型 Agent Client Protocol Server，让 Smelt 中的 DSH 会话具备接近 Claude 或 Codex 的体验：流式文本与推理、工具卡片、内联 diff、PLAN 进度、用量统计、斜杠命令、权限询问以及会话恢复。',
  'tomowang-dsh-tui': 'DeepSeek Harness 的开源终端入口，可从 TUI 使用 DSH。',
  'tsdfy-dsh-skin-switcher': 'DSH Web 皮肤切换器，可自动发现社区皮肤并一键切换主题。',
  'txlznbzsdj-collab-dsh-session-delete': '在 DSH 侧边栏会话菜单增加带确认对话框的“删除”操作，确认后永久删除会话。',
  'vibeinging-dsh-agent-budget': '为 Harness 原生 Agent 树分配和跟踪 token 预算。',
  'vibeinging-dsh-turn-navigator': '用于在 DSH Web 中快速定位和切换对话回合的私有导航插件。',
  'william-jin-cmu-dsh-stickers': '为 DSH Web 增加用户与 Agent 之间的双向贴纸回应。',
  'xiaoshihou514-dsh-tui': '为 DeepSeek Harness 提供终端用户界面（TUI）。',
  'xiongjiamu-dsh-atomgit':
    'DeepSeek Harness 的 AtomGit bundle，包含规划和实现 Issue、审查与合并 PR、发布 CLI、镜像到 GitHub 等六个内置 Skills，并集成 ag CLI 与 AtomGit/GitCode MCP 工具。',
  'yangyongzhen-dsh-session-report': '生成逐会话成本与用量报告卡，展示 token、缓存命中率、逐回合明细、持续时间和费用估算。',
  'zseven-w-dsh-openpencil': '把 OpenPencil 接入 DeepSeek Harness，可在对话中预览、检查和编辑真实的 .op 设计文档。',
}
