const { fen2yuan } = require('../../utils/format')

Page({
  data: { g: null, qty: 1, priceText: '0.00' },

  onLoad() {
    const g = getApp().globalData.currentGoods
    if (!g) {
      wx.showToast({ title: '商品不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this.setData({ g, priceText: fen2yuan(g.price) })
    wx.setNavigationBarTitle({ title: g.name })
  },

  applyQty(d) {
    const q = this.data.qty + d
    if (q < 1) return false
    if (q > this.data.g.stock) {
      wx.showToast({ title: '库存只有 ' + this.data.g.stock + ' 件', icon: 'none' })
      return false
    }
    this.setData({ qty: q })
    return true
  },

  changeQty(e) {
    if (Date.now() - (this._lastPressEnd || 0) < 350) return // 长按刚结束，不再重复触发
    this.applyQty(Number(e.currentTarget.dataset.d))
  },

  // 长按连续增减
  startPress(e) {
    const dir = Number(e.currentTarget.dataset.d)
    if (!dir) return
    this.stopPress()
    this._timer = setInterval(() => { this.applyQty(dir) }, 160)
  },

  stopPress() {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
    this._lastPressEnd = Date.now()
  },

  endPress() { if (this._timer) this.stopPress() },
  onHide() { this.stopPress() },
  onUnload() { this.stopPress() },

  addToCart() {
    const app = getApp()
    const g = this.data.g
    const cart = app.globalData.cart
    const found = cart.find((i) => i.goodsId === g._id)
    if (found) found.qty = Math.min(found.qty + this.data.qty, g.stock)
    else cart.push({ goodsId: g._id, name: g.name, price: g.price, image: g.image, qty: this.data.qty })
    app.refreshCartBadge()
    wx.showToast({ title: '已加入购物车', icon: 'success' })
  },

  buyNow() {
    this.addToCart()
    wx.switchTab({ url: '/pages/cart/cart' })
  }
})
