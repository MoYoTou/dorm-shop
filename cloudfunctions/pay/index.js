const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const ok = (data) => ({ code: 0, data })
const fail = (message) => ({ code: 1, message })

const getSettings = async () => {
  try {
    return (await db.collection('settings').doc('global').get()).data
  } catch (e) { return null }
}

// 微信支付：unifiedOrder 下单 / 支付结果回调 / refund 退款
// 注意：无 event.action 时视为微信支付服务端回调
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {} } = event

  // ========== 支付结果回调（微信服务端调用，无需登录态） ==========
  if (!action) {
    const { outTradeNo, resultCode, transactionId } = event
    if (resultCode !== 'SUCCESS') return { errcode: 0 }
    const r = await db.collection('orders').where({ orderNo: outTradeNo }).limit(1).get()
    const o = r.data[0]
    if (o && !o.paid) {
      await db.collection('orders').doc(o._id).update({
        data: {
          paid: true,
          transactionId: transactionId || '',
          status: 'pending_accept',
          statusLog: _.push([{ status: 'paid', at: Date.now() }])
        }
      })
    }
    return { errcode: 0, errmsg: 'ok' }
  }

  // ========== 发起支付（前端调起 wx.requestPayment 用返回参数） ==========
  if (action === 'unifiedOrder') {
    const settings = await getSettings()
    if (!settings || settings.payMode !== 'online' || !settings.subMchId) {
      return fail('商家未开通在线支付')
    }
    const r = await db.collection('orders').doc(data.orderId).get().catch(() => ({ data: null }))
    const o = r.data
    if (!o || o._openid !== OPENID) return fail('订单不存在')
    if (o.paid || o.status !== 'unpaid') return fail('订单状态异常')

    const res = await cloud.cloudPay.unifiedOrder({
      body: '宿舍小卖铺-' + o.orderNo,
      outTradeNo: o.orderNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: settings.subMchId,
      totalFee: o.totalAmount,
      envId: cloud.DYNAMIC_CURRENT_ENV,
      functionName: 'pay' // 支付结果回调到本函数（无 action 分支）
    })
    return ok(res.payment)
  }

  // ========== 微信退款（供 refund 云函数内部调用） ==========
  // 注意：需要在商户平台下载 API 证书，并在云开发控制台配置后才可真实退款
  if (action === 'refund') {
    const settings = await getSettings()
    const r = await db.collection('orders').doc(data.orderId).get().catch(() => ({ data: null }))
    const o = r.data
    if (!o || !o.paid) return fail('订单未支付，无需线上退款')
    if (o.onlineRefunded) return ok(true) // 幂等：已退过直接成功

    // TODO: 生产环境接入 cloud.cloudPay.refund（需上传商户 API 证书）
    // await cloud.cloudPay.refund({
    //   outTradeNo: o.orderNo,
    //   outRefundNo: 'R' + o.orderNo,
    //   totalFee: o.totalAmount,
    //   refundFee: o.totalAmount,
    //   subMchId: settings.subMchId
    // })
    await db.collection('orders').doc(o._id).update({ data: { onlineRefunded: true } })
    return ok(true)
  }

  return fail('未知 action: ' + action)
}
