const { call } = require('../../utils/cloud')
const { ensureLogin, loadSettings } = require('../../utils/auth')

Page({
  data: {
    openidShort: '',
    isAdmin: false,
    settings: null,
    cloudOk: true
  },

  // 云端请求失败不再静默吞错：任一失败就标记 cloudOk=false，页面会给出排查提示
  async onShow() {
    const loginOk = await ensureLogin().then((g) => {
      this.setData({
        openidShort: g.openid ? '...' + g.openid.slice(-6) : '',
        isAdmin: g.isAdmin
      })
      return true
    }).catch(() => false)

    const settingsOk = await loadSettings(true).then((s) => {
      this.setData({ settings: s })
      return true
    }).catch(() => false)

    this.setData({ cloudOk: loginOk && settingsOk })
  },

  callMerchant() {
    const p = this.data.settings && this.data.settings.contactPhone
    if (p) wx.makePhoneCall({ phoneNumber: p })
    else wx.showToast({ title: '商家未留电话', icon: 'none' })
  },

  copyWechat() {
    const w = this.data.settings && this.data.settings.contactWechat
    if (!w) return wx.showToast({ title: '商家未留微信', icon: 'none' })
    wx.setClipboardData({ data: w, success: () => wx.showToast({ title: '微信号已复制', icon: 'success' }) })
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages-admin/dashboard/dashboard' })
  },

  // 首次部署后点一次：写入默认配置 + 示例商品 + 把自己设为管理员
  async initData() {
    const r = await wx.showModal({
      title: '初始化数据',
      content: '将写入默认营业设置、示例商品，并把你设为商家管理员。仅需执行一次。'
    })
    if (!r.confirm) return
    await call('init', 'init', {}, { loading: '初始化中' }).then((res) => {
      const extra = res && res.createdCollections && res.createdCollections.length
        ? '（新建表：' + res.createdCollections.join('、') + '）'
        : ''
      wx.showToast({ title: '初始化完成' + extra, icon: 'success', duration: 2500 })
      getApp().globalData.settings = null
      getApp().globalData.openid = ''
      this.onShow()
    }).catch((e) => { /* 错误已在 call 封装里提示 */ })
  },

  // 修复用：清空商品表并重建 4 个示例商品（仅管理员可执行）
  async resetGoods() {
    const r = await wx.showModal({
      title: '重置商品数据',
      content: '将删除全部商品并重建 4 个示例商品。已有的商品图片和库存会清空，确定吗？',
      confirmColor: '#e64340'
    })
    if (!r.confirm) return
    await call('init', 'init', { resetGoods: true }, { loading: '重置中' }).then((res) => {
      wx.showToast({ title: '已重置商品数据', icon: 'success', duration: 2000 })
      getApp().globalData.settings = null
      getApp().globalData.openid = ''
      this.onShow()
    }).catch((e) => { /* 错误已在 call 封装里提示 */ })
  }
})
