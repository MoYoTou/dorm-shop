const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const ok = (data) => ({ code: 0, data })
const fail = (message) => ({ code: 1, message })

const isAdmin = async (openid) => {
  try {
    const s = await db.collection('settings').doc('global').get()
    return ((s.data && s.data.adminOpenids) || []).includes(openid)
  } catch (e) { return false }
}

// 执行实际退款动作：在线支付走微信退款；货到付款仅做标记
const doRealRefund = async (order) => {
  if (order.payMode === 'online' && order.paid) {
    const r = await cloud.callFunction({
      name: 'pay',
      data: { action: 'refund', data: { orderId: order._id } }
    })
    const res = r.result || {}
    if (res.code !== 0) throw new Error(res.message || '微信退款失败')
    return '微信原路退回'
  }
  return '货到付款订单，无需线上退款（如已收款请当面/转账退回）'
}

// 退款成功后的统一收尾：订单置已退款 + 回补库存
const settleRefund = async (order, refundId) => {
  await db.runTransaction(async (tx) => {
    for (const it of order.items) {
      await tx.collection('goods').doc(it.goodsId).update({
        data: { stock: _.inc(it.qty), soldCount: _.inc(-it.qty) }
      })
    }
    await tx.collection('orders').doc(order._id).update({
      data: {
        status: 'refunded',
        refundStatus: 'refunded',
        statusLog: _.push([{ status: 'refunded', at: Date.now() }])
      }
    })
    await tx.collection('refunds').doc(refundId).update({
      data: { status: 'approved', reviewedAt: Date.now() }
    })
  })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {} } = event
  const orders = db.collection('orders')
  const refunds = db.collection('refunds')

  // ========== 通道一：顾客申请退款（需商家审批） ==========
  if (action === 'apply') {
    const r = await orders.doc(data.orderId).get().catch(() => ({ data: null }))
    const o = r.data
    if (!o || o._openid !== OPENID) return fail('订单不存在')
    if (!['pending_accept', 'preparing'].includes(o.status)) {
      return fail('当前状态不可申请退款，请联系商家')
    }
    if (o.refundStatus === 'pending') return fail('已有退款申请在审核中')
    if (!data.reason) return fail('请填写退款原因')

    await db.runTransaction(async (tx) => {
      await tx.collection('refunds').add({
        data: {
          orderId: o._id,
          orderNo: o.orderNo,
          _openid: OPENID,
          initiator: 'user',
          reason: String(data.reason).slice(0, 200),
          amount: o.totalAmount,
          status: 'pending',
          createdAt: Date.now()
        }
      })
      await tx.collection('orders').doc(o._id).update({
        data: { refundStatus: 'pending' }
      })
    })
    return ok(true)
  }

  // ========== 商家审批顾客退款：同意=退款+回补库存；拒绝=订单继续 ==========
  if (action === 'review') {
    if (!(await isAdmin(OPENID))) return fail('无权限：仅商家可审批')
    const rr = await refunds.doc(data.refundId).get().catch(() => ({ data: null }))
    const rd = rr.data
    if (!rd || rd.status !== 'pending') return fail('退款单不存在或已处理')
    const or = await orders.doc(rd.orderId).get().catch(() => ({ data: null }))
    const o = or.data
    if (!o) return fail('关联订单不存在')

    if (data.approve) {
      const way = await doRealRefund(o)
      await settleRefund(o, rd._id)
      return ok({ refunded: true, way })
    }
    // 拒绝
    if (!data.note) return fail('拒绝退款需填写理由')
    await db.runTransaction(async (tx) => {
      await tx.collection('refunds').doc(rd._id).update({
        data: { status: 'rejected', reviewNote: String(data.note).slice(0, 200), reviewedAt: Date.now() }
      })
      await tx.collection('orders').doc(o._id).update({
        data: { refundStatus: 'rejected' }
      })
    })
    return ok({ refunded: false })
  }

  // ========== 通道二：商家一键直退（无需顾客确认，立即执行） ==========
  if (action === 'merchantRefund') {
    if (!(await isAdmin(OPENID))) return fail('无权限：仅商家可操作')
    const or = await orders.doc(data.orderId).get().catch(() => ({ data: null }))
    const o = or.data
    if (!o) return fail('订单不存在')
    if (['completed', 'cancelled', 'refunded'].includes(o.status)) return fail('该订单不可退款')
    if (o.refundStatus === 'refunded') return fail('该订单已退款')

    const rr = await refunds.add({
      data: {
        orderId: o._id,
        orderNo: o.orderNo,
        _openid: o._openid,
        initiator: 'merchant',
        reason: data.reason || '商家主动退款',
        amount: o.totalAmount,
        status: 'approved', // 商家发起，无审核环节
        createdAt: Date.now()
      }
    })
    const way = await doRealRefund(o)
    await settleRefund(o, rr._id)
    return ok({ refunded: true, way })
  }

  // ========== 退款列表：商家看待审批，顾客看自己的 ==========
  if (action === 'list') {
    const admin = await isAdmin(OPENID)
    const where = {}
    if (admin) {
      if (data.status) where.status = data.status
    } else {
      where._openid = OPENID
    }
    const r = await refunds.where(where).orderBy('createdAt', 'desc').limit(50).get()
    return ok({ list: r.data, isAdmin: admin })
  }

  return fail('未知 action: ' + action)
}
