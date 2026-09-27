const { call } = require('../../utils/cloud')
const { loadSettings } = require('../../utils/auth')
const { fen2yuan, fmtTime, STATUS_TEXT, REFUND_TEXT } = require('../../utils/format')

Page({
  data: { o: null, settings: null },

  onLoad(options) {
    this.id = options.id
    loadSettings().then((s) => this.setData({ settings: s })).catch(() => {})
    this.load()
  },

  async load() {
    const o = await call('order', 'detail', { id: this.id }, { silent: true }).catch(() => null)
    if (!o) {
      wx.showToast({ title: '订单不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    o.totalText = fen2yuan(o.totalAmount)
    o.goodsAmountText = fen2yuan(o.goodsAmount)
    o.deliveryFeeText = fen2yuan(o.deliveryFee)
    o.statusText = STATUS_TEXT[o.status] || o.status
    o.refundText = REFUND_TEXT[o.refundStatus] || ''
    o.timeText = fmtTime(o.createdAt)
    o.deliveryTimeText = o.deliveryTime ? fmtTime(o.deliveryTime) : ''
    o.items.forEach((i) => { i.priceText = fen2yuan(i.price) })
    this.setData({ o })
  },

  async payNow() {
    try {
      const payment = await call('pay', 'unifiedOrder', { orderId: this.id }, { loading: '准备支付' })
      await new Promise((resolve, reject) => {
        wx.requestPayment(Object.assign({}, payment, { success: resolve, fail: reject }))
      })
      wx.showToast({ title: '支付成功', icon: 'success' })
      this.load()
    } catch (e) { /* 已提示 */ }
  },

  async cancelOrder() {
    const r = await wx.showModal({ title: '取消订单', content: '确定取消这单吗？库存会退回。' })
    if (!r.confirm) return
    await call('order', 'cancel', { id: this.id }, { loading: '取消中' }).then(() => {
      wx.showToast({ title: '已取消', icon: 'success' })
      this.load()
    }).catch(() => {})
  },

  goRefund() {
    wx.navigateTo({ url: '/pages/refund-apply/refund-apply?orderId=' + this.id })
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
  }
})
