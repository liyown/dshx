import { defineDocsChapter } from "../types";

export const troubleshooting = defineDocsChapter({
  slug: "troubleshooting",
  group: "runtime",
  lastVerified: "2026-08-28",
  references: [
    {
      label: "CLI reference",
      url: "https://github.com/liyown/dshx/blob/main/docs/cli-reference.md",
    },
    {
      label: "Compatibility",
      url: "https://github.com/liyown/dshx/blob/main/docs/compatibility.md",
    },
  ],
  copy: {
    en: {
      navigation: "Troubleshooting",
      eyebrow: "Diagnostics",
      title: "Troubleshoot DSHX",
      intro:
        "Start with the offline check, then add runtime validation only when the failure depends on a linked DSH Profile, Composition, bridge, Slot, service, or event.",
      description:
        "Diagnose DSHX build, Client HMR, Host restart, Profile, Composition, compatibility, and installation failures.",
      sections: [
        {
          id: "first-check",
          label: "01 / first check",
          title: "Run the smallest diagnostic first",
          blocks: [
            {
              kind: "terminal",
              title: "terminal",
              lines: [
                { text: "dshx check", kind: "cmd" },
                { text: "dshx check --runtime", kind: "cmd" },
                { text: "dshx inspect slots", kind: "cmd" },
              ],
            },
            {
              kind: "note",
              text: "Verified for @becomeopc/dshx 0.1.4-preview.0 and protocol-1 DSH boundaries 0.1.0-rc.8 and 0.1.1-rc.2. Plain check is read-only and offline. Use --runtime only after package-level checks pass and a supported DSH Composition is running.",
            },
          ],
        },
        {
          id: "client-hmr",
          label: "02 / client",
          title: "Client HMR does not update",
          blocks: [
            {
              kind: "list",
              items: [
                "Confirm the Client entry is included and its Vite build completes without diagnostics.",
                "Check required provider packages in dsh.client.inject and runtime services in defineClient({ inject }).",
                "Inspect the running Composition for the expected Slot and service names.",
                "Use a concrete dev port when the address must survive automatic Host restarts.",
              ],
            },
          ],
        },
        {
          id: "host-restart",
          label: "03 / host",
          title: "Host restart or runtime validation fails",
          blocks: [
            {
              kind: "paragraph",
              text: "Verify the linked Profile, active Composition, DSH version, bridge readiness, and plugin manifest. DSHX can diagnose these boundaries but does not replace the official runtime that owns restart and disposal.",
            },
          ],
        },
        {
          id: "compatibility",
          label: "04 / compatibility",
          title: "Version range is rejected",
          blocks: [
            {
              kind: "paragraph",
              text: "Compare the declared peer range with the verified protocol-1 boundaries. Prerelease ranges follow npm semver rules, so an rc version may need an explicit range arm instead of relying on a broad stable range.",
            },
          ],
        },
      ],
    },
    zh: {
      navigation: "故障排查",
      eyebrow: "诊断",
      title: "排查 DSHX 问题",
      intro:
        "先运行离线检查；只有当问题依赖关联的 DSH Profile、Composition、Bridge、Slot、Service 或 Event 时，再加入 Runtime 校验。",
      description:
        "诊断 DSHX 构建、Client HMR、Host 重启、Profile、Composition、兼容性与安装错误。",
      sections: [
        {
          id: "first-check",
          label: "01 / first check",
          title: "先运行最小诊断",
          blocks: [
            {
              kind: "terminal",
              title: "terminal",
              lines: [
                { text: "dshx check", kind: "cmd" },
                { text: "dshx check --runtime", kind: "cmd" },
                { text: "dshx inspect slots", kind: "cmd" },
              ],
            },
            {
              kind: "note",
              text: "本文已按 @becomeopc/dshx 0.1.4-preview.0，以及 protocol-1 的 DSH 0.1.0-rc.8 与 0.1.1-rc.2 边界验证。普通 check 只读且离线；包级检查通过并启动受支持的 DSH Composition 后，再使用 --runtime。",
            },
          ],
        },
        {
          id: "client-hmr",
          label: "02 / client",
          title: "Client HMR 没有更新",
          blocks: [
            {
              kind: "list",
              items: [
                "确认 Client Entry 已包含在构建中，且 Vite 构建没有诊断错误。",
                "检查 dsh.client.inject 中的 Provider 包，以及 defineClient({ inject }) 中的 Runtime Service。",
                "检查运行中的 Composition 是否存在预期 Slot 与 Service 名称。",
                "当地址必须跨 Host 自动重启保持不变时，使用具体开发端口。",
              ],
            },
          ],
        },
        {
          id: "host-restart",
          label: "03 / host",
          title: "Host 重启或 Runtime 校验失败",
          blocks: [
            {
              kind: "paragraph",
              text: "检查关联 Profile、活动 Composition、DSH 版本、Bridge 就绪状态和插件 Manifest。DSHX 可以诊断这些边界，但不会替代负责 Restart 与 Dispose 的官方 Runtime。",
            },
          ],
        },
        {
          id: "compatibility",
          label: "04 / compatibility",
          title: "版本范围被拒绝",
          blocks: [
            {
              kind: "paragraph",
              text: "将声明的 Peer Range 与已验证的 protocol-1 边界比较。Prerelease 范围遵循 npm semver 规则，rc 版本可能需要显式范围分支，不能只依赖宽泛稳定版范围。",
            },
          ],
        },
      ],
    },
  },
});
