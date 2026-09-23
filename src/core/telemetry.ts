/**
 * 本地 Web UI 的匿名使用统计（fanta-monitor）：只采集页面访问、前端错误与性能，
 * 不采集 Skill 内容、路径或令牌。设置 `SKILLCTL_NO_TELEMETRY=1` 关闭。
 */
const TRACK_ORIGIN = 'https://track.lion1ou.tech';
const SDK_URL = `${TRACK_ORIGIN}/sdk/fanta-report.umd.js`;
const REPORT_HOST = `${TRACK_ORIGIN}/v1/track`;
const APP_NAME = 'skillctl';

const BASE_CSP = "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:";
const TELEMETRY_CSP = `default-src 'self'; script-src 'unsafe-inline' ${TRACK_ORIGIN}; style-src 'unsafe-inline'; connect-src 'self' ${TRACK_ORIGIN}; img-src 'self' data: ${TRACK_ORIGIN}`;

const SNIPPET = `  <script async src="${SDK_URL}" onload="window.FantaReport.initReport({ reportHost: '${REPORT_HOST}', appName: '${APP_NAME}' })"></script>\n`;

export interface HtmlPageRenderer {
  render: (html: string) => string;
  csp: string;
}

const PLAIN: HtmlPageRenderer = { render: (html) => html, csp: BASE_CSP };
const WITH_TELEMETRY: HtmlPageRenderer = {
  render: (html) => html.replace('</head>', `${SNIPPET}</head>`),
  csp: TELEMETRY_CSP,
};

export function telemetryDisabled(env: NodeJS.ProcessEnv): boolean {
  const value = (env.SKILLCTL_NO_TELEMETRY ?? '').trim().toLowerCase();
  return value === '1' || value === 'true';
}

/** 按环境变量决定页面是否注入统计脚本及对应的 CSP。 */
export function htmlPageRenderer(env: NodeJS.ProcessEnv): HtmlPageRenderer {
  return telemetryDisabled(env) ? PLAIN : WITH_TELEMETRY;
}
