const { call } = require('../../utils/cloud')
const { fen2yuan } = require('../../utils/format')

Page({
  data: {
    businessHours: [],
    deliveryFeeYuan: '',
    minOrderYuan: '',
    notice: '',
    contactPhone: '',
    contactWechat: '',
    payMode: 'cod',
    subMchId: ''
  },

  onLoad() {
    call('settings', 'get', {}, { silent: true }).then((s) => {
      if (!s) return
      this.setData({
        businessHours: s.businessHours || [{ start: '18:00', end: '23:30' }],
        deliveryFeeYuan: fen2yuan(s.deliveryFee || 0),
        minOrderYuan: fen2yuan(s.minOrderAmount || 0),
        notice: s.notice || '',
        contactPhone: s.contactPhone || '',
        contactWechat: s.contactWechat || '',
        payMode: s.payMode || 'cod',
        subMchId: s.subMchId || ''
      })
    }).catch(() => {})
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.k]: e.detail.value })
  },

  pickTime(e) {
    const { i, k } = e.currentTarget.dataset
    this.setData({ ['businessHours[' + i + '].' + k]: e.detail.value })
  },

  addPeriod() {
    const h = this.data.businessHours.concat([{ start: '12:00', end: '14:00' }])
    this.setData({ businessHours: h })
  },

  removePeriod(e) {
    const h = this.data.businessHours.slice()
    h.splice(Number(e.currentTarget.dataset.i), 1)
    this.setData({ businessHours: h })
  },

  switchPayMode(e) {
    this.setData({ payMode: e.detail.value ? 'online' : 'cod' })
  },

  async save() {
    const h = this.data.businessHours
    if (!h.length) return wx.showToast({ title: '至少保留一段营业时间', icon: 'none' })
    await call('settings', 'update', {
      businessHours: h,
      deliveryFee: Math.round(Number(this.data.deliveryFeeYuan || 0) * 100),
      minOrderAmount: Math.round(Number(this.data.minOrderYuan || 0) * 100),
      notice: this.data.notice,
      contactPhone: this.data.contactPhone,
      contactWechat: this.data.contactWechat,
      payMode: this.data.payMode,
      subMchId: this.data.subMchId.trim()
    }, { loading: '保存中' }).then(() => {
      getApp().globalData.settings = null
      wx.showToast({ title: '已保存', icon: 'success' })
    }).catch(() => {})
  }
})
