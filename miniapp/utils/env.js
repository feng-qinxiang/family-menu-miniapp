/**
 * 环境配置 — 根据构建环境切换 API 地址
 * 小程序无 process.env，使用 wx.getAccountInfoSync 判断运行版本
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
    apiBaseUrl: 'http://localhost:9088'
  },
  trial: {
    // 体验版走测试服务器，按实际域名修改
    apiBaseUrl: 'https://test-api.familymenu.com'
  },
  release: {
    // 正式版走线上 HTTPS
    apiBaseUrl: 'https://api.familymenu.com'
  }
};

function resolveConfig() {
  const env = getEnv();
  return ENV_CONFIG[env] || ENV_CONFIG.develop;
}

module.exports = {
  getEnv,
  resolveConfig
};
