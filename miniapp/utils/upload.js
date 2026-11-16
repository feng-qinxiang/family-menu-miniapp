// 全站 baseURL 唯一来源（见 utils/env.js），不再维护第二套逻辑
const { resolveBaseUrl } = require('./env');
// 请求头与 api.js 保持一致：上传同样带设备标识，便于后端排查与限流
const { getAuthToken, getDeviceId } = require('./api');
// 相册/相机属微信隐私接口，调用前必须先取得授权
const { ensurePrivacy } = require('./privacy');

function isCancel(err) {
  return !!(err && err.errMsg && /cancel/i.test(err.errMsg));
}

function chooseImage(count, sourceType) {
  return new Promise((resolve) => {
    // 全站相册入口：菜谱封面、头像、反馈截图、导入图片都走这里，授权收在这一处即可
    ensurePrivacy(() => {
      wx.chooseMedia({
        count: count || 1,
        mediaType: ['image'],
        sourceType: sourceType || ['album', 'camera'],
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
          // maxDuration 只管现拍；相册里挑的在这里按同样的 60 秒、20MB（服务端上限）拦，
          // 不然传上去只会得到一句「上传失败」，重试也永远过不去
          if (file && file.duration > 60.5) {
            wx.showToast({ title: '视频超过 60 秒，剪短再传', icon: 'none' });
            resolve('');
            return;
          }
          if (file && file.size > 20 * 1024 * 1024) {
            wx.showToast({ title: '视频超过 20MB，换短一点的', icon: 'none' });
            resolve('');
            return;
          }
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
