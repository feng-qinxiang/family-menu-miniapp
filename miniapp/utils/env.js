/**
 * 环境配置 — 根据构建环境切换 API 地址
 * 小程序无 process.env，使用 wx.getAccountInfoSync 判断运行版本
 *
 * ⚠️ 上线前必须替换 trial / release 的占位域名（见 spec/LAUNCH-CHECKLIST.md）。
 * 全站 baseURL 只由本文件提供（resolveBaseUrl），不要在别处再写第二套。
 */

function getEnv() {
  try {
    const info = wx.getAccountInfoSync();
    // develop | trial | release
    return (info && info.miniProgram && info.miniProgram.envVersion) || 'develop';
  } catch (e) {
    return 'develop';
  }
}

const ENV_CONFIG = {
  develop: {
    // 开发者工具走本机后端（最快最稳）；真机体验请用体验版。
    apiBaseUrl: 'http://localhost:9088'
  },
  trial: {
    // 体验版：换成你的体验环境域名（HTTPS）。
    // 占位值：https://test-api.example.com
    apiBaseUrl: 'https://test-api.example.com'
  },
  release: {
    // 正式版：换成你的备案域名（HTTPS）。
    // 占位值：https://api.example.com
    apiBaseUrl: 'https://api.example.com'
  }
};

function resolveConfig() {
  const env = getEnv();
  const config = ENV_CONFIG[env] || ENV_CONFIG.develop;
  let resolved = config;
  // 真机开发版（预览二维码/真机调试）连不上上面的 localhost——它指的是手机自己。
  // 这类运行时改走电脑的局域网地址（DEV_LAN_BASE 定义在下方哨兵区之后）。
  if (env === 'develop' && !isDevtools()) {
    if (DEV_LAN_BASE) {
      resolved = { apiBaseUrl: DEV_LAN_BASE };
      console.log('[env] 真机开发版走局域网后端: ' + DEV_LAN_BASE);
    } else {
      console.error(
        '[env] 真机开发版还没配 DEV_LAN_BASE（utils/env.js）: 填电脑的局域网 IP，' +
        '例如 http://192.168.1.5:9088；手机和电脑须同一 Wi-Fi，并在手机端打开调试后重启小程序。'
      );
    }
  }
  assertNotPlaceholder(env, resolved);
  return resolved;
}

// 拿运行平台：devtools=开发者工具；ios/android=真机。拿不到按开发工具处理，保持旧行为。
function isDevtools() {
  try {
    const info = wx.getSystemInfoSync();
    return !info || !info.platform || info.platform === 'devtools';
  } catch (e) {
    return true;
  }
}

// 占位域名哨兵：体验版/正式版仍指向 example.com 时，全站接口会静默失败，
// 排查成本很高。这里在解析配置时打一条醒目的 error（每个环境只打一次）。
const PLACEHOLDER_PATTERN = /example\.com/i;
const warnedEnvs = {};

// 真机开发版专用：电脑的局域网地址。Mac 查法：`ipconfig getifaddr en0`。
// 手机和电脑连同一个 Wi-Fi；IP 变了这里要跟着改。填错/不填只影响真机开发版
// （会打一条上面的 error 提示），开发者工具与体验版/正式版都不受影响。
const DEV_LAN_BASE = 'http://192.168.1.83:9088';

function assertNotPlaceholder(env, config) {
  if (env === 'develop' || warnedEnvs[env]) return;
  if (!config || !PLACEHOLDER_PATTERN.test(config.apiBaseUrl || '')) return;
  warnedEnvs[env] = true;
  console.error(
    `[env] ${env} 环境的 apiBaseUrl 仍是占位域名（${config.apiBaseUrl}）。` +
    '请替换为真实 HTTPS 域名，并同步微信后台 request 合法域名，否则该版本所有接口都会失败。' +
    '清单见 spec/LAUNCH-CHECKLIST.md。'
  );
}

/**
 * 全站唯一的 API 基址解析入口。
 * 优先级：app.globalData.apiBaseUrl（可运行时覆盖） > 环境配置 > 开发地址。
 */
function resolveBaseUrl() {
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (app && app.globalData && app.globalData.apiBaseUrl) {
      return app.globalData.apiBaseUrl;
    }
  } catch (e) {
    // getApp 在 App() 执行前可能抛错，落到环境配置
  }
  return resolveConfig().apiBaseUrl;
}

module.exports = {
  getEnv,
  resolveConfig,
  resolveBaseUrl
};
