const { call } = require('../../utils/cloud')

Page({
  data: { reason: '', submitting: false },

  onLoad(options) {
    this.orderId = options.orderId
  },

  onInput(e) {
    this.setData({ reason: e.detail.value })
  },

  quickReason(e) {
    this.setData({ reason: e.currentTarget.dataset.t })
  },

  async submit() {
    if (!this.data.reason.trim()) return wx.showToast({ title: '请填写退款原因', icon: 'none' })
    if (this.data.submitting) return
    this.setData({ submitting: true })
    try {
      await call('refund', 'apply', { orderId: this.orderId, reason: this.data.reason.trim() }, { loading: '提交中' })
      wx.showToast({ title: '已提交，等待商家审核', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
    } catch (e) {
      this.setData({ submitting: false })
    }
  }
})
