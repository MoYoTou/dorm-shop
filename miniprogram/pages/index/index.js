const { call } = require('../../utils/cloud')
const { ensureLogin, loadSettings } = require('../../utils/auth')
const { isOpenNow } = require('../../utils/biz')
const { fen2yuan } = require('../../utils/format')

Page({
  data: {
    settings: null,
    open: false,
    hoursText: '',
    categories: [],
    activeCategory: '',
    goods: [],
    isAdmin: false
  },

  onLoad() {
    ensureLogin().then((g) => this.setData({ isAdmin: g.isAdmin })).catch(() => {})
    this.refresh()
  },

  onShow() {
    getApp().refreshCartBadge()
    if (this.data.goods.length) this.loadGoods()
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh())
  },

  async refresh() {
    const s = await loadSettings(true).catch(() => null)
    if (s) {
      this.setData({
        settings: s,
        open: isOpenNow(s.businessHours),
        hoursText: (s.businessHours || []).map((p) => p.start + '-' + p.end).join(' / ')
      })
    }
    const cats = await call('goods', 'categories', {}, { silent: true }).catch(() => [])
    this.setData({ categories: cats })
    await this.loadGoods()
  },

  async loadGoods() {
    const param = this.data.activeCategory ? { category: this.data.activeCategory } : {}
    const list = await call('goods', 'list', param, { silent: true }).catch(() => [])
    list.forEach((g) => { g.priceText = fen2yuan(g.price) })
    this.setData({ goods: list })
  },

  switchCategory(e) {
    this.setData({ activeCategory: e.currentTarget.dataset.c })
    this.loadGoods()
  },

  addCart(e) {
    const g = e.currentTarget.dataset.g
    if (g.stock <= 0) return wx.showToast({ title: '补货中，敬请期待', icon: 'none' })
    const app = getApp()
    const cart = app.globalData.cart
    const found = cart.find((i) => i.goodsId === g._id)
    const inCart = found ? found.qty : 0
    if (inCart + 1 > g.stock) return wx.showToast({ title: '库存只有 ' + g.stock + ' 件', icon: 'none' })
    if (found) found.qty += 1
    else cart.push({ goodsId: g._id, name: g.name, price: g.price, image: g.image, qty: 1 })
    app.refreshCartBadge()
    wx.showToast({ title: '已加入购物车', icon: 'success' })
  },

  goDetail(e) {
    getApp().globalData.currentGoods = e.currentTarget.dataset.g
    wx.navigateTo({ url: '/pages/product-detail/product-detail' })
  },

  goAdmin() {
    wx.navigateTo({ url: '/pages-admin/dashboard/dashboard' })
  },

  onShareAppMessage() {
    return { title: '宿舍小卖铺，零食送到宿舍门口', path: '/pages/index/index' }
  },

  onShareTimeline() {
    return { title: '宿舍小卖铺，零食送到宿舍门口' }
  }
})
