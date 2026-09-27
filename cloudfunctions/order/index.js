const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const ok = (data) => ({ code: 0, data })
const fail = (message) => ({ code: 1, message })

const toMin = (s) => {
  const p = String(s).split(':')
  return Number(p[0]) * 60 + Number(p[1])
}

// 判断某个时刻是否落在任一天营业时段内（支持跨天时段）
const inHours = (hours, date) => {
  if (!hours || !hours.length) return false
  const cur = date.getHours() * 60 + date.getMinutes()
  return hours.some((p) => {
    const s = toMin(p.start)
    const e = toMin(p.end)
    return e > s ? (cur >= s && cur <= e) : (cur >= s || cur <= e)
  })
}

const isAdmin = async (openid) => {
  try {
    const s = await db.collection('settings').doc('global').get()
    return ((s.data && s.data.adminOpenids) || []).includes(openid)
  } catch (e) { return false }
}

// 回补库存（取消订单 / 退款成功时调用）
const restoreStock = async (tx, items) => {
  for (const it of items) {
    await tx.collection('goods').doc(it.goodsId).update({
      data: { stock: _.inc(it.qty), soldCount: _.inc(-it.qty) }
    })
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {} } = event
  const orders = db.collection('orders')

  // ========== 下单（事务：校验营业时间 + 原子扣库存 + 建单） ==========
  if (action === 'create') {
    const items = data.items || []
    if (!items.length) return fail('购物车为空')
    if (!data.dormBuilding || !data.room || !data.phone) return fail('请填写完整配送信息')

    let settings
    try {
      settings = (await db.collection('settings').doc('global').get()).data
    } catch (e) { return fail('商家尚未完成初始化') }

    const orderType = data.orderType === 'booking' ? 'booking' : 'now'
    if (orderType === 'now' && !inHours(settings.businessHours, new Date())) {
      return fail('当前休息中，请改下预订单')
    }
    if (orderType === 'booking') {
      if (!data.deliveryTime) return fail('请选择预定配送时间')
      const t = new Date(data.deliveryTime)
      if (isNaN(t.getTime()) || !inHours(settings.businessHours, t)) {
        return fail('配送时间不在营业时段内')
      }
    }

    try {
      const result = await db.runTransaction(async (tx) => {
        let goodsAmount = 0
        const detail = []
        for (const it of items) {
          const qty = Math.round(Number(it.qty))
          if (!(qty > 0)) throw new Error('商品数量无效')
          const g = await tx.collection('goods').doc(it.goodsId).get()
          if (!g.data || !g.data.onSale) throw new Error('有商品已下架，请返回刷新')
          if (g.data.stock < qty) throw new Error('「' + g.data.name + '」库存不足，仅剩 ' + g.data.stock + ' 件')
          await tx.collection('goods').doc(it.goodsId).update({
            data: { stock: _.inc(-qty), soldCount: _.inc(qty) }
          })
          goodsAmount += g.data.price * qty
          detail.push({
            goodsId: it.goodsId, name: g.data.name,
            price: g.data.price, qty, image: g.data.image || ''
          })
        }
        if (settings.minOrderAmount && goodsAmount < settings.minOrderAmount) {
          throw new Error('未达起送金额')
        }
        const deliveryFee = settings.deliveryFee || 0
        const payMode = settings.payMode === 'online' && settings.subMchId ? 'online' : 'cod'
        const orderNo = 'D' + Date.now() + String(Math.floor(Math.random() * 900) + 100)
        const r = await tx.collection('orders').add({
          data: {
            orderNo,
            _openid: OPENID,
            items: detail,
            goodsAmount,
            deliveryFee,
            totalAmount: goodsAmount + deliveryFee,
            orderType,
            deliveryTime: orderType === 'booking' ? data.deliveryTime : '',
            dormBuilding: data.dormBuilding,
            room: data.room,
            phone: data.phone,
            remark: data.remark || '',
            payMode,
            paid: false,
            status: payMode === 'online' ? 'unpaid' : 'pending_accept',
            refundStatus: 'none',
            statusLog: [{ status: 'created', at: Date.now() }],
            createdAt: Date.now()
          }
        })
        return { orderId: r._id, orderNo, totalAmount: goodsAmount + deliveryFee, payMode }
      })
      return ok(result)
    } catch (e) {
      return fail(e.message || '下单失败，请重试')
    }
  }

  // ========== 订单列表（用户看自己的，商家看全部） ==========
  if (action === 'list') {
    const admin = await isAdmin(OPENID)
    const where = {}
    if (!admin) where._openid = OPENID
    if (data.status) where.status = data.status
    const r = await orders.where(where).orderBy('createdAt', 'desc').limit(50).get()
    return ok({ list: r.data, isAdmin: admin })
  }

  // ========== 订单详情 ==========
  if (action === 'detail') {
    const r = await orders.doc(data.id).get().catch(() => ({ data: null }))
    const o = r.data
    if (!o) return fail('订单不存在')
    const admin = await isAdmin(OPENID)
    if (o._openid !== OPENID && !admin) return fail('无权限查看')
    return ok(o)
  }

  // ========== 用户取消订单（未支付 / 待接单阶段），回补库存 ==========
  if (action === 'cancel') {
    const r = await orders.doc(data.id).get().catch(() => ({ data: null }))
    const o = r.data
    if (!o || o._openid !== OPENID) return fail('订单不存在')
    if (!['unpaid', 'pending_accept'].includes(o.status)) return fail('当前状态不可取消，可申请退款')
    await db.runTransaction(async (tx) => {
      await restoreStock(tx, o.items)
      await tx.collection('orders').doc(o._id).update({
        data: { status: 'cancelled', statusLog: _.push([{ status: 'cancelled', at: Date.now() }]) }
      })
    })
    return ok(true)
  }

  // ========== 商家推进订单状态：接单→备货→配送→完成 ==========
  if (action === 'updateStatus') {
    if (!(await isAdmin(OPENID))) return fail('无权限')
    const flow = { pending_accept: 'preparing', preparing: 'delivering', delivering: 'completed' }
    const r = await orders.doc(data.id).get().catch(() => ({ data: null }))
    const o = r.data
    if (!o) return fail('订单不存在')
    const next = flow[o.status]
    if (!next) return fail('当前状态不可推进')
    await orders.doc(o._id).update({
      data: { status: next, statusLog: _.push([{ status: next, at: Date.now() }]) }
    })
    return ok({ status: next })
  }

  // ========== 商家看板统计 ==========
  if (action === 'stats') {
    if (!(await isAdmin(OPENID))) return fail('无权限')
    const today0 = new Date()
    today0.setHours(0, 0, 0, 0)
    const ts = today0.getTime()
    const [pending, refunding, todayList] = await Promise.all([
      orders.where({ status: 'pending_accept' }).count(),
      orders.where({ refundStatus: 'pending' }).count(),
      orders.where({ createdAt: _.gte(ts), status: _.in(['pending_accept', 'preparing', 'delivering', 'completed']) }).limit(200).get()
    ])
    const todayAmount = todayList.data.reduce((s, o) => s + (o.totalAmount || 0), 0)
    return ok({
      pendingCount: pending.total,
      refundPendingCount: refunding.total,
      todayCount: todayList.data.length,
      todayAmount
    })
  }

  return fail('未知 action: ' + action)
}
