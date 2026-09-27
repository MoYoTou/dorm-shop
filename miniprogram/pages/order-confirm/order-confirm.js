const { call } = require('../../utils/cloud')
const { ensureLogin, loadSettings } = require('../../utils/auth')
const { isOpenNow, buildTimeSlots } = require('../../utils/biz')
const { fen2yuan } = require('../../utils/format')

Page({
  data: {
    items: [],
    goodsAmountText: '0.00',
    deliveryFeeText: '0.00',
    totalText: '0.00',
    dormBuilding: '',
    room: '',
    phone: '',
    remark: '',
    orderType: 'now',
    canNow: true,
    slots: [],
    slotIndex: 0,
    payModeText: '货到付款'
  },

  async onLoad() {
    await ensureLogin().catch(() => {})
    const s = await loadSettings().catch(() => null)
    const app = getApp()
    const items = app.globalData.cart
    if (!items.length) {
      wx.showToast({ title: '购物车是空的', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    const goodsAmount = items.reduce((sum, i) => sum + i.price * i.qty, 0)
    const deliveryFee = (s && s.deliveryFee) || 0
    const canNow = s ? isOpenNow(s.businessHours) : true
    const slots = s ? buildTimeSlots(s.businessHours, 2, 30) : []
    this.setData({
      items: items.map((i) => Object.assign({ priceText: fen2yuan(i.price) }, i)),
      goodsAmountText: fen2yuan(goodsAmount),
      deliveryFeeText: fen2yuan(deliveryFee),
      totalText: fen2yuan(goodsAmount + deliveryFee),
      canNow,
      orderType: canNow ? 'now' : 'booking',
      slots,
      payModeText: s && s.payMode === 'online' ? '在线支付' : '货到付款',
      dormBuilding: wx.getStorageSync('dormBuilding') || '',
      room: wx.getStorageSync('room') || '',
      phone: wx.getStorageSync('phone') || ''
    })
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.k]: e.detail.value })
  },

  switchType(e) {
    const t = e.currentTarget.dataset.t
    if (t === 'now' && !this.data.canNow) {
      return wx.showToast({ title: '当前休息中，请选择预定单', icon: 'none' })
    }
    this.setData({ orderType: t })
  },

  pickSlot(e) {
    this.setData({ slotIndex: Number(e.detail.value) })
  },

  async submit() {
    const d = this.data
    if (!d.dormBuilding || !d.room || !d.phone) {
      return wx.showToast({ title: '请填写完整配送信息', icon: 'none' })
    }
    if (d.orderType === 'booking' && !d.slots.length) {
      return wx.showToast({ title: '暂无可预定时段', icon: 'none' })
    }
    wx.setStorageSync('dormBuilding', d.dormBuilding)
    wx.setStorageSync('room', d.room)
    wx.setStorageSync('phone', d.phone)

    const slot = d.slots[d.slotIndex]
    const payload = {
      items: d.items.map((i) => ({ goodsId: i.goodsId, qty: i.qty })),
      orderType: d.orderType,
      dormBuilding: d.dormBuilding,
      room: d.room,
      phone: d.phone,
      remark: d.remark
    }
    if (d.orderType === 'booking' && slot) {
      const day = new Date()
      day.setDate(day.getDate() + slot.day)
      const hm = slot.time.split(':')
      day.setHours(Number(hm[0]), Number(hm[1]), 0, 0)
      payload.deliveryTime = day.getTime()
    }

    try {
      const r = await call('order', 'create', payload, { loading: '提交订单中' })
      getApp().globalData.cart = []
      getApp().refreshCartBadge()

      if (r.payMode === 'online') {
        // 在线支付：拉起微信支付
        try {
          const payment = await call('pay', 'unifiedOrder', { orderId: r.orderId }, { loading: '准备支付' })
          await new Promise((resolve, reject) => {
            wx.requestPayment(Object.assign({}, payment, { success: resolve, fail: reject }))
          })
          wx.showToast({ title: '支付成功', icon: 'success' })
        } catch (payErr) {
          wx.showToast({ title: '未支付，可在订单页继续支付', icon: 'none' })
        }
      } else {
        wx.showToast({ title: '下单成功，货到付款', icon: 'success' })
      }
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/order-detail/order-detail?id=' + r.orderId })
      }, 600)
    } catch (e) { /* 错误已在封装层提示 */ }
  }
})
