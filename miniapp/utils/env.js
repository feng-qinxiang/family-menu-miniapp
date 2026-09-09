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
  return ENV_CONFIG[env] || ENV_CONFIG.develop;
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
