// 全站 baseURL 唯一来源（见 utils/env.js），不再维护第二套逻辑
const { resolveBaseUrl } = require('./env');
// 请求头与 api.js 保持一致：上传同样带设备标识，便于后端排查与限流
const { getAuthToken, getDeviceId } = require('./api');
// 相册/相机属微信隐私接口，调用前必须先取得授权
const { ensurePrivacy } = require('./privacy');

function isCancel(err) {
  return !!(err && err.errMsg && /cancel/i.test(err.errMsg));
}

function chooseImage(count) {
  return new Promise((resolve) => {
    // 全站相册入口：菜谱封面、头像、反馈截图、导入图片都走这里，授权收在这一处即可
    ensurePrivacy(() => {
      wx.chooseMedia({
        count: count || 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        sizeType: ['compressed'],
        success(res) {
          const paths = (res.tempFiles || []).map((f) => f.tempFilePath);
          resolve(paths);
        },
        fail(err) {
          if (!isCancel(err)) {
            wx.showToast({ title: '选图失败', icon: 'none' });
          }
          resolve([]);
        }
      });
    }, () => resolve([]));
  });
}

function uploadFile(tempFilePath) {
  return new Promise((resolve) => {
    const token = getAuthToken();
    wx.uploadFile({
      url: `${resolveBaseUrl()}/api/upload`,
      filePath: tempFilePath,
      name: 'file',
      header: {
        'X-Auth-Token': token,
        'X-Device-Id': getDeviceId()
      },
      timeout: 30000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const data = JSON.parse(res.data);
            const url = data.url || '';
            resolve(url.indexOf('http') === 0 ? url : `${resolveBaseUrl()}${url}`);
          } catch (e) {
            // 解析失败说明服务端没给出可用 URL，返回空串而非本地临时路径
            resolve('');
          }
        } else {
          resolve('');
        }
      },
      // 失败返回空串：调用方按「未上传」处理，避免把 wxfile:// 临时路径写库后裂图
      fail() { resolve(''); }
    });
  });
}

function chooseAndUpload(count) {
  return chooseImage(count).then((paths) => {
    if (!paths.length) return [];
    return Promise.all(paths.map((p) => uploadFile(p)));
  });
}

function chooseVideo() {
  return new Promise((resolve) => {
    ensurePrivacy(() => {
      wx.chooseMedia({
        count: 1,
        mediaType: ['video'],
        sourceType: ['album', 'camera'],
        maxDuration: 60,
        success(res) {
          const file = (res.tempFiles || [])[0];
          resolve(file ? file.tempFilePath : '');
        },
        fail(err) {
          if (!isCancel(err)) {
            wx.showToast({ title: '选视频失败', icon: 'none' });
          }
          resolve('');
        }
      });
    }, () => resolve(''));
  });
}

function chooseAndUploadVideo() {
  return chooseVideo().then((path) => {
    if (!path) return '';
    return uploadFile(path);
  });
}

module.exports = { chooseImage, uploadFile, chooseAndUpload, chooseVideo, chooseAndUploadVideo };
