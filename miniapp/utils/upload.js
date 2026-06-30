function resolveBaseUrl() {
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (app && app.globalData && app.globalData.apiBaseUrl) {
      return app.globalData.apiBaseUrl;
    }
  } catch (err) {}
  return 'http://localhost:9088';
}

function chooseImage(count) {
  return new Promise((resolve) => {
    wx.chooseMedia({
      count: count || 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success(res) {
        const paths = (res.tempFiles || []).map((f) => f.tempFilePath);
        resolve(paths);
      },
      fail() { resolve([]); }
    });
  });
}

function uploadFile(tempFilePath) {
  return new Promise((resolve) => {
    const token = wx.getStorageSync('auth_token') || '';
    wx.uploadFile({
      url: `${resolveBaseUrl()}/api/upload`,
      filePath: tempFilePath,
      name: 'file',
      header: { 'X-Auth-Token': token },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(res.data);
            const url = data.url || '';
            resolve(url.indexOf('http') === 0 ? url : `${resolveBaseUrl()}${url}`);
          } catch (e) {
            resolve(tempFilePath);
          }
        } else {
          resolve(tempFilePath);
        }
      },
      fail() { resolve(tempFilePath); }
    });
  });
}

function chooseAndUpload(count) {
  return chooseImage(count).then((paths) => {
    if (!paths.length) return [];
    return Promise.all(paths.map((p) => uploadFile(p)));
  });
}

module.exports = { chooseImage, uploadFile, chooseAndUpload };
