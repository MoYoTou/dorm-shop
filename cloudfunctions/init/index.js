const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ok = (data) => ({ code: 0, data })
const fail = (message) => ({ code: 1, message })

// 确保数据表可用：先 createCollection，再用「写探针」确认表真的可读写。
// 原因：新建集合后立刻读会报 -502005 database collection not exists，必须等就绪。
const ensureCollections = async () => {
  const names = ['settings', 'goods', 'orders', 'refunds', 'users']
  const created = []
  for (const n of names) {
    // 探测表是否已就绪：能成功 count 就说明可用
    let ready = false
    try {
      await db.collection(n).count()
      ready = true
    } catch (e) { ready = false }

    if (!ready) {
      try {
        await db.createCollection(n)
        created.push(n)
      } catch (e) { /* 集合已存在（并发/重跑），继续探测 */ }
    }

    // 无论新建还是已存在，都重试探测直到可用（最多 10 次 × 500ms）
    for (let i = 0; i < 10; i++) {
      try {
        await db.collection(n).count()
        break
      } catch (e) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }
  return created
}

// 初始化：写入默认营业设置 + 示例商品，并把调用者设为管理员
// 只需在首次部署后运行一次（小程序「我的」页提供按钮）
// 传 resetGoods=true 可清空商品表并重建示例商品（用于修复脏数据）
exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  // 统一约定：前端 call() 传 { action, data }，参数都在 data 里
  // 兼容老的扁平写法 event.resetGoods，避免改格式后「重置商品数据」失效
  const data = (event && event.data) || event || {}
  const resetGoods = !!(data.resetGoods || event.resetGoods)

  // 0. 先确保 5 张表都存在（自动建表）
  const created = await ensureCollections()

  // 1. 营业设置
  // 注意：doc('global').set() 的 data 里不能再写 _id，否则报 -501007 invalid parameters
  let exist = null
  try { exist = await db.collection('settings').doc('global').get() } catch (e) { /* 不存在 */ }
  if (!exist || !exist.data) {
    try {
      await db.collection('settings').doc('global').set({
        data: {
          businessHours: [{ start: '18:00', end: '23:30' }], // 默认每晚营业
          deliveryFee: 100,          // 配送费（分）
          minOrderAmount: 0,         // 起送金额（分），0 为不限
          notice: '欢迎来到宿舍小卖铺，营业时间内下单，送到宿舍门口！',
          contactPhone: '13800000000',
          contactWechat: 'xiaomapu',
          payMode: 'cod',            // cod=货到付款 online=微信支付（需商户号）
          subMchId: '',              // 微信商户号，申请下来后填写
          adminOpenids: [OPENID],
          updatedAt: Date.now()
        }
      })
    } catch (e) {
      return fail('写入营业设置失败：' + (e.message || e.errMsg || '未知错误'))
    }
  } else {
    const admins = exist.data.adminOpenids || []
    if (!admins.includes(OPENID)) {
      admins.push(OPENID)
      await db.collection('settings').doc('global').update({ data: { adminOpenids: admins } })
    }
  }

  // 2. 示例商品（仅当商品表为空时插入；resetGoods=true 时先清空重建）
  let goodsCount = 0
  try {
    goodsCount = (await db.collection('goods').count()).total
  } catch (e) {
    return fail('读取商品表失败：' + (e.message || e.errMsg || '未知错误'))
  }

  if (resetGoods) {
    let removed = 0
    let failMsg = ''
    try {
      // 云函数端批量删除（绕过前端 20 条限制）；最多 20 轮 × 100 条，避免死循环
      for (let round = 0; round < 20; round++) {
        const batch = await db.collection('goods').limit(100).get()
        if (!batch.data.length) break
        for (const doc of batch.data) {
          try {
            await db.collection('goods').doc(doc._id).remove()
            removed++
          } catch (e) {
            failMsg = e.errMsg || e.message || '未知错误'
          }
        }
        if (batch.data.length < 100) break
      }
      goodsCount = 0
    } catch (e) {
      return fail('清空商品表失败：' + (e.message || e.errMsg || '未知错误'))
    }
    if (failMsg) {
      return fail('部分商品删除失败（已删 ' + removed + ' 条）：' + failMsg +
        '。可尝试在云开发控制台手动删除 goods 集合的全部记录。')
    }
  }

  if (!goodsCount) {
    const samples = [
      { name: '红烧牛肉面', price: 450, stock: 20, category: '泡面', image: '', onSale: true },
      { name: '原味薯片', price: 650, stock: 15, category: '膨化食品', image: '', onSale: true },
      { name: '冰红茶 500ml', price: 350, stock: 30, category: '饮料', image: '', onSale: true },
      { name: '士力架', price: 500, stock: 12, category: '巧克力', image: '', onSale: true }
    ]
    try {
      for (const g of samples) {
        await db.collection('goods').add({
          data: Object.assign({ soldCount: 0, createdAt: Date.now() }, g)
        })
      }
    } catch (e) {
      return fail('写入示例商品失败：' + (e.message || e.errMsg || '未知错误'))
    }
  }

  return ok({
    initialized: true,
    adminOpenid: OPENID,
    createdCollections: created,
    goodsInserted: goodsCount ? 0 : 4
  })
}
