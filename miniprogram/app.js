App({
  globalData: {
    openid: '',
    isAdmin: false,
    settings: null,   // 营业设置缓存（营业时间/联系方式/配送费/收款模式）
    cart: []          // [{ goodsId, name, price, image, qty }] price 单位：分
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库过低，无法使用云能力')
      return
    }
    const ENV_ID = 'cloud1-d5gylhtqz35f9e742' // 云环境 ID（形如 shop-1g8x9y2z），不是 AppID
    if (ENV_ID === 'YOUR_ENV_ID') {
      console.error('[dorm-store] 尚未填写云环境 ID：打开 app.js 把 YOUR_ENV_ID 换成云开发控制台里的「环境 ID」')
    } else if (ENV_ID.indexOf('wx') === 0) {
      console.error('[dorm-store] 环境 ID 疑似填错：' + ENV_ID + ' 是 AppID（wx 开头）。请到云开发控制台复制「环境 ID」，形如 shop-1g8x9y2z')
    }
    wx.cloud.init({ env: ENV_ID, traceUser: true })
  },

  // 更新购物车角标
  refreshCartBadge() {
    const n = this.globalData.cart.reduce((s, i) => s + i.qty, 0)
    if (n > 0) {
      wx.setTabBarBadge({ index: 1, text: String(n) }).catch(() => {})
    } else {
      wx.removeTabBarBadge({ index: 1 }).catch(() => {})
    }
  }
})
