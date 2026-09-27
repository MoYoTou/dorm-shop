const { call } = require('../../utils/cloud')
const { fen2yuan, fmtTime, STATUS_TEXT } = require('../../utils/format')

const TABS = [
  { k: 'pending_accept', t: '待接单' },
  { k: 'preparing', t: '备货中' },
  { k: 'delivering', t: '配送中' },
  { k: '', t: '全部' }
]

const NEXT_TEXT = {
  pending_accept: '接单',
  preparing: '开始配送',
  delivering: '完成配送'
}

Page({
  data: {
    tabs: TABS,
    active: 'pending_accept',
    list: [],
    refunds: [],
    nextText: NEXT_TEXT,
    rejectId: '',
    rejectNote: ''
  },

  onShow() {
    this.load()
    this.loadRefunds()
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

  async loadRefunds() {
    const r = await call('refund', 'list', { status: 'pending' }, { silent: true }).catch(() => null)
    const list = (r && r.list) || []
    list.forEach((f) => {
      f.amountText = fen2yuan(f.amount)
      f.timeText = fmtTime(f.createdAt)
    })
    this.setData({ refunds: list })
  },

  async advance(e) {
    const id = e.currentTarget.dataset.id
    await call('order', 'updateStatus', { id }, { loading: '处理中' }).then(() => {
      wx.showToast({ title: '已更新', icon: 'success' })
      this.load()
    }).catch(() => {})
  },

  // 商家一键直退：无需顾客确认，立即执行
  async merchantRefund(e) {
    const id = e.currentTarget.dataset.id
    const r = await wx.showModal({
      title: '商家退款',
      content: '将立即向顾客退款并回补库存，无需顾客确认。确定继续？'
    })
    if (!r.confirm) return
    await call('refund', 'merchantRefund', { orderId: id }, { loading: '退款中' }).then((res) => {
      wx.showModal({ title: '退款完成', content: res.way || '已退款', showCancel: false })
      this.load()
    }).catch(() => {})
  },

  callUser(e) {
    wx.makePhoneCall({ phoneNumber: e.currentTarget.dataset.phone })
  },

  // ===== 退款审批 =====
  async approve(e) {
    const id = e.currentTarget.dataset.id
    const r = await wx.showModal({ title: '同意退款', content: '同意后将立即退款并回补库存，确定？' })
    if (!r.confirm) return
    await call('refund', 'review', { refundId: id, approve: true }, { loading: '退款中' }).then((res) => {
      wx.showToast({ title: '已退款', icon: 'success' })
      this.loadRefunds()
      this.load()
    }).catch(() => {})
  },

  showReject(e) {
    this.setData({ rejectId: e.currentTarget.dataset.id, rejectNote: '' })
  },

  onRejectInput(e) {
    this.setData({ rejectNote: e.detail.value })
  },

  cancelReject() {
    this.setData({ rejectId: '' })
  },

  async confirmReject() {
    if (!this.data.rejectNote.trim()) return wx.showToast({ title: '请填写拒绝理由', icon: 'none' })
    await call('refund', 'review',
      { refundId: this.data.rejectId, approve: false, note: this.data.rejectNote.trim() },
      { loading: '提交中' }).then(() => {
      wx.showToast({ title: '已拒绝', icon: 'success' })
      this.setData({ rejectId: '' })
      this.loadRefunds()
    }).catch(() => {})
  }
})
