/* global Page, wx */

const API_BASE_URL_KEY = "mallbay_api_base_url";
const AUTH_TOKEN_KEY = "mallbay_access_token";
const STORE_ID_KEY = "mallbay_store_id";

Page({
  data: {
    apiBaseUrl: "",
    token: "",
    storeId: "",
    loggingIn: false
  },

  onShow() {
    this.setData({
      apiBaseUrl: wx.getStorageSync(API_BASE_URL_KEY) || "",
      token: wx.getStorageSync(AUTH_TOKEN_KEY) || "",
      storeId: wx.getStorageSync(STORE_ID_KEY) || ""
    });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [field]: event.detail.value });
  },

  saveConfig() {
    const apiBaseUrl = normalizeApiBaseUrl(this.data.apiBaseUrl);
    const token = trimValue(this.data.token);
    const storeId = trimValue(this.data.storeId);
    if (!apiBaseUrl) {
      wx.showToast({ title: "请填写 API 地址", icon: "none" });
      return;
    }
    if (!token) {
      wx.showToast({ title: "请填写 access token", icon: "none" });
      return;
    }
    if (!storeId) {
      wx.showToast({ title: "请填写门店 ID", icon: "none" });
      return;
    }
    wx.setStorageSync(API_BASE_URL_KEY, apiBaseUrl);
    wx.setStorageSync(AUTH_TOKEN_KEY, token);
    wx.setStorageSync(STORE_ID_KEY, storeId);
    this.setData({ apiBaseUrl, token, storeId });
    wx.showToast({ title: "配置已保存", icon: "success" });
  },

  async loginWithWechat() {
    const apiBaseUrl = normalizeApiBaseUrl(this.data.apiBaseUrl);
    if (!apiBaseUrl) {
      wx.showToast({ title: "请先填写 API 地址", icon: "none" });
      return;
    }

    this.setData({ loggingIn: true });
    try {
      const loginResult = await wxLogin();
      const session = await requestJson({
        url: `${apiBaseUrl}/auth/wechat-login`,
        method: "POST",
        header: { "Content-Type": "application/json" },
        data: { code: loginResult.code }
      });
      const token = session.accessToken;
      if (!token) {
        throw new Error("微信登录响应缺少 accessToken");
      }
      const profile = await requestJson({
        url: `${apiBaseUrl}/auth/me`,
        method: "GET",
        header: { Authorization: `Bearer ${token}` }
      });
      const storeId = profile && profile.storeMember && profile.storeMember.store && profile.storeMember.store.id;
      if (!storeId) {
        throw new Error("当前账号未关联门店");
      }

      wx.setStorageSync(API_BASE_URL_KEY, apiBaseUrl);
      wx.setStorageSync(AUTH_TOKEN_KEY, token);
      wx.setStorageSync(STORE_ID_KEY, storeId);
      this.setData({ apiBaseUrl, token, storeId });
      wx.showToast({ title: "微信登录成功", icon: "success" });
    } catch (error) {
      wx.showToast({ title: error.message || "微信登录失败", icon: "none" });
    } finally {
      this.setData({ loggingIn: false });
    }
  }
});

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: (result) => {
        if (result.code) {
          resolve(result);
        } else {
          reject(new Error(result.errMsg || "微信登录失败"));
        }
      },
      fail: (error) => reject(new Error(error.errMsg || "微信登录失败"))
    });
  });
}

function requestJson(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data || {});
          return;
        }
        const message = response.data && response.data.message ? response.data.message : "请求失败";
        reject(new Error(message));
      },
      fail: (error) => reject(new Error(error.errMsg || "请求失败"))
    });
  });
}

function normalizeApiBaseUrl(value) {
  return trimValue(value).replace(/\/+$/, "");
}

function trimValue(value) {
  return (value || "").trim();
}
