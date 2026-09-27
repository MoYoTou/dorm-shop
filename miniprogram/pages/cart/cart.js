const { fen2yuan } = require('../../utils/format')

Page({
  data: { cart: [], totalText: '0.00' },

  onShow() {
    this.refresh()
  },

  refresh() {
    const app = getApp()
    const cart = app.globalData.cart
    cart.forEach((i) => { i.priceText = fen2yuan(i.price) })
    const total = cart.reduce((s, i) => s + i.price * i.qty, 0)
    this.setData({ cart, totalText: fen2yuan(total) })
    app.refreshCartBadge()
  },

  changeQty(e) {
    const { id, d } = e.currentTarget.dataset
    const cart = getApp().globalData.cart
    const item = cart.find((i) => i.goodsId === id)
    if (!item) return
    item.qty += Number(d)
    if (item.qty <= 0) cart.splice(cart.indexOf(item), 1)
    this.refresh()
  },

  removeItem(e) {
    const { id } = e.currentTarget.dataset
    const cart = getApp().globalData.cart
    const idx = cart.findIndex((i) => i.goodsId === id)
    if (idx >= 0) cart.splice(idx, 1)
    this.refresh()
  },

  checkout() {
    if (!this.data.cart.length) return wx.showToast({ title: '购物车是空的', icon: 'none' })
    wx.navigateTo({ url: '/pages/order-confirm/order-confirm' })
  },

  goShopping() {
    wx.switchTab({ url: '/pages/index/index' })
  }
})
