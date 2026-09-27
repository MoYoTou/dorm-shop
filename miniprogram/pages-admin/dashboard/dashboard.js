const { call } = require('../../utils/cloud')
const { ensureLogin } = require('../../utils/auth')
const { fen2yuan } = require('../../utils/format')

Page({
  data: {
    isAdmin: false,
    stats: { pendingCount: 0, refundPendingCount: 0, todayCount: 0, todayAmount: 0 },
    todayAmountText: '0.00'
  },

  onShow() {
    ensureLogin().then((g) => {
      this.setData({ isAdmin: g.isAdmin })
      if (g.isAdmin) this.loadStats()
    }).catch(() => {})
  },

  async loadStats() {
    const s = await call('order', 'stats', {}, { silent: true }).catch(() => null)
    if (s) this.setData({ stats: s, todayAmountText: fen2yuan(s.todayAmount) })
  },

  go(e) {
    wx.navigateTo({ url: e.currentTarget.dataset.url })
  }
})
