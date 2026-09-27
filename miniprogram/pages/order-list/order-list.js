const { call } = require('../../utils/cloud')
const { fen2yuan, fmtTime, STATUS_TEXT } = require('../../utils/format')

const TABS = [
  { k: '', t: '全部' },
  { k: 'pending_accept', t: '待接单' },
  { k: 'preparing', t: '备货中' },
  { k: 'delivering', t: '配送中' },
  { k: 'completed', t: '已完成' }
]

Page({
  data: { tabs: TABS, active: '', list: [] },

  onShow() {
    this.load()
  },

  switchTab(e) {
    this.setData({ active: e.currentTarget.dataset.k })
    this.load()
  },

  async load() {
    const r = await call('order', 'list',
      this.data.active ? { status: this.data.active } : {}, { silent: true }).catch(() => null)
    const list = (r && r.list) || []
    list.forEach((o) => {
      o.totalText = fen2yuan(o.totalAmount)
      o.timeText = fmtTime(o.createdAt)
      o.statusText = STATUS_TEXT[o.status] || o.status
      o.summary = o.items.map((i) => i.name + '×' + i.qty).join('、')
    })
    this.setData({ list })
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + e.currentTarget.dataset.id })
  }
})
