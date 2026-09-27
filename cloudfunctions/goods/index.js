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

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {} } = event
  const goods = db.collection('goods')

  // 调试：把云函数真实收到的 action 与 data 打进日志，便于定位参数问题
  console.log('[goods] 收到请求', JSON.stringify({ action, data, OPENID: OPENID.slice(-6) }))

  // 用户端商品列表（仅在售）
  if (action === 'list') {
    const where = { onSale: true }
    if (data.category) where.category = data.category
    const r = await goods.where(where).orderBy('createdAt', 'desc').limit(100).get()
    return ok(r.data)
  }

  // 分类列表
  if (action === 'categories') {
    const r = await goods.where({ onSale: true }).limit(200).get()
    const set = []
    r.data.forEach((g) => { if (g.category && !set.includes(g.category)) set.push(g.category) })
    return ok(set)
  }

  // ===== 以下均需管理员权限 =====
  if (!(await isAdmin(OPENID))) return fail('无权限：仅商家可操作')

  if (action === 'listAll') {
    const r = await goods.orderBy('createdAt', 'desc').limit(200).get()
    return ok(r.data)
  }

  if (action === 'upsert') {
    // 精确校验：分别报错，避免「请填写商品名与价格」这种让人摸不着头脑的模糊提示
    if (!data.name || !String(data.name).trim()) return fail('请填写商品名称')
    const priceFen = Math.round(Number(data.price))
    if (!isFinite(priceFen) || priceFen <= 0) return fail('请填写有效的商品价格（大于 0）')
    const stockNum = Math.round(Number(data.stock))
    if (!isFinite(stockNum) || stockNum < 0) return fail('请填写有效的库存数量（0 或以上）')

    // 只挑允许的字段，绝不透传前端对象（防止非法字段触发 -501007 invalid parameters）
    const g = {
      name: String(data.name).trim(),
      price: priceFen, // 单位：分
      stock: stockNum,
      category: String(data.category || '零食').trim() || '零食',
      image: typeof data.image === 'string' ? data.image : '', // 只接受字符串（云存储 fileID 或空）
      onSale: data.onSale !== false,
      updatedAt: Date.now()
    }

    if (data.id) {
      // 编辑：先确认该文档真实存在，避免 _id 非法时报模糊错误
      let exists = null
      try {
        exists = await goods.doc(String(data.id)).get()
      } catch (e) {
        return fail('商品不存在或已删除，请返回列表刷新后重试')
      }
      if (!exists || !exists.data) return fail('商品不存在，请返回列表刷新后重试')
      try {
        await goods.doc(String(data.id)).update({ data: g })
      } catch (e) {
        return fail('更新商品失败：' + (e.errMsg || e.message || '未知错误'))
      }
      return ok({ id: data.id })
    }

    try {
      const r = await goods.add({ data: Object.assign({ soldCount: 0, createdAt: Date.now() }, g) })
      return ok({ id: r._id })
    } catch (e) {
      return fail('新增商品失败：' + (e.errMsg || e.message || '未知错误'))
    }
  }

  if (action === 'toggle') {
    if (!data.id) return fail('商品ID缺失，请刷新页面重试')
    try {
      await goods.doc(String(data.id)).update({ data: { onSale: !!data.onSale } })
    } catch (e) {
      return fail('上下架失败：' + (e.errMsg || e.message || '未知错误'))
    }
    return ok(true)
  }

  // 库存盘点调整：delta 可正可负，原子操作防并发盘点出错
  if (action === 'adjustStock') {
    if (!data.id) return fail('商品ID缺失，请刷新页面重试')
    const delta = Math.round(Number(data.delta) || 0)
    if (!delta) return ok(true)
    // 先确认记录存在，避免对脏 _id 操作时抛出模糊的 SDK 内部异常
    // 注意：doc 变量必须声明在 try 外面，否则后续读取会报 "doc is not defined"
    let doc = null
    try {
      doc = await goods.doc(String(data.id)).get()
    } catch (e) {
      return fail('商品不存在或数据异常，请点「重置商品数据」修复')
    }
    if (!doc || !doc.data) return fail('商品不存在，请刷新页面重试')
    try {
      const cur = Number(doc.data.stock) || 0
      if (cur + delta < 0) {
        // 不允许减成负数：直接归零，避免库存出现 -1
        await goods.doc(String(data.id)).update({ data: { stock: 0, updatedAt: Date.now() } })
      } else {
        await goods.doc(String(data.id)).update({ data: { stock: _.inc(delta), updatedAt: Date.now() } })
      }
    } catch (e) {
      return fail('库存调整失败：' + (e.errMsg || e.message || '未知错误'))
    }
    return ok(true)
  }

  return fail('未知 action: ' + action)
}
