/** auth: the CLI authorization page */

const en = {
  "auth.cli.label": "CLI authorization",
  "auth.cli.reconnect": "Reconnect GitHub",
  "auth.cli.separationNote":
    "Hub operator credentials remain separate from GitHub API credentials.",
  "auth.cli.terminalTitle": "dshx-hub — authorization",
  "auth.cli.connecting.label": "Connecting to GitHub",
  "auth.cli.connecting.title": "Complete CLI authorization",
  "auth.cli.connecting.description":
    "You are about to verify your identity with GitHub. When complete, the browser will return here and hand the operator credential to your local CLI.",
  "auth.cli.connecting.statusLabel": "Waiting for browser confirmation",
  "auth.cli.success.label": "Authorization complete",
  "auth.cli.success.title": "CLI connected securely",
  "auth.cli.success.description":
    "The operator credential is now stored in your system keychain. You can close this page and return to the terminal.",
  "auth.cli.success.statusLabel": "Connected",
  "auth.cli.expired.label": "Request expired",
  "auth.cli.expired.title": "Authorization did not complete",
  "auth.cli.expired.description":
    "The authorization link expired or its state did not match. No credential was stored; return to the terminal and start sign-in again.",
  "auth.cli.expired.statusLabel": "Not connected",
  "auth.cli.incomplete.label": "Incomplete response",
  "auth.cli.incomplete.title": "Authorization did not complete",
  "auth.cli.incomplete.description":
    "The browser did not receive a complete authorization result. No credential was stored; return to the terminal and start sign-in again.",
  "auth.cli.incomplete.statusLabel": "Not connected",
  "auth.cli.exchange.label": "Credential not stored",
  "auth.cli.exchange.title": "Authorization did not complete",
  "auth.cli.exchange.description":
    "Hub could not store the operator credential in your system keychain. Check the terminal error, then start sign-in again.",
  "auth.cli.exchange.statusLabel": "Not connected",
  "auth.cli.server.label": "Service unavailable",
  "auth.cli.server.title": "Authorization did not complete",
  "auth.cli.server.description":
    "Hub could not complete authorization right now. No credential was stored; return to the terminal and retry later.",
  "auth.cli.server.statusLabel": "Not connected",
  "auth.cli.unknown.label": "Authorization incomplete",
  "auth.cli.unknown.title": "Authorization did not complete",
  "auth.cli.unknown.description":
    "No credential was stored. Return to the terminal and run the sign-in command again.",
  "auth.cli.unknown.statusLabel": "Not connected",
} as const;

const zh: Record<keyof typeof en, string> = {
  "auth.cli.label": "CLI 授权",
  "auth.cli.reconnect": "重新连接 GitHub",
  "auth.cli.separationNote": "Hub 运营凭证与 GitHub API 凭证相互独立。",
  "auth.cli.terminalTitle": "dshx-hub — authorization",
  "auth.cli.connecting.label": "正在连接 GitHub",
  "auth.cli.connecting.title": "完成 CLI 授权",
  "auth.cli.connecting.description":
    "即将前往 GitHub 验证身份。完成后会自动回到这里，并把运营凭证交给本机 CLI。",
  "auth.cli.connecting.statusLabel": "等待浏览器确认",
  "auth.cli.success.label": "授权完成",
  "auth.cli.success.title": "CLI 已安全连接",
  "auth.cli.success.description":
    "运营凭证已经写入系统钥匙串。现在可以关闭此页面，回到终端继续操作。",
  "auth.cli.success.statusLabel": "已连接",
  "auth.cli.expired.label": "请求已失效",
  "auth.cli.expired.title": "这次授权没有完成",
  "auth.cli.expired.description":
    "授权链接已经过期或状态不匹配。没有凭证写入本机，请回到终端重新发起登录。",
  "auth.cli.expired.statusLabel": "未连接",
  "auth.cli.incomplete.label": "响应不完整",
  "auth.cli.incomplete.title": "这次授权没有完成",
  "auth.cli.incomplete.description":
    "浏览器没有收到完整的授权结果。没有凭证写入本机，请回到终端重新发起登录。",
  "auth.cli.incomplete.statusLabel": "未连接",
  "auth.cli.exchange.label": "凭证未保存",
  "auth.cli.exchange.title": "这次授权没有完成",
  "auth.cli.exchange.description":
    "Hub 无法把运营凭证安全保存到系统钥匙串。请回到终端查看错误，然后重新登录。",
  "auth.cli.exchange.statusLabel": "未连接",
  "auth.cli.server.label": "服务暂时不可用",
  "auth.cli.server.title": "这次授权没有完成",
  "auth.cli.server.description": "Hub 暂时无法完成授权。没有凭证写入本机，请稍后回到终端重试。",
  "auth.cli.server.statusLabel": "未连接",
  "auth.cli.unknown.label": "授权未完成",
  "auth.cli.unknown.title": "这次授权没有完成",
  "auth.cli.unknown.description": "没有凭证写入本机。请回到终端重新运行登录命令。",
  "auth.cli.unknown.statusLabel": "未连接",
};

export const authMessages = { en, zh };
