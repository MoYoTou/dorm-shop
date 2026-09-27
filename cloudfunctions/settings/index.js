const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ok = (data) => ({ code: 0, data })
const fail = (message) => ({ code: 1, message })
const DOC = 'global'

const isAdmin = async (openid) => {
  try {
    const s = await db.collection('settings').doc(DOC).get()
    return ((s.data && s.data.adminOpenids) || []).includes(openid)
  } catch (e) { return false }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { action, data = {} } = event

  if (action === 'get') {
    try {
      const s = await db.collection('settings').doc(DOC).get()
      const d = s.data || {}
      delete d.adminOpenids // 管理员名单不下发到前端
      return ok(d)
    } catch (e) {
      return ok(null) // 尚未初始化
    }
  }

  if (action === 'update') {
    if (!(await isAdmin(OPENID))) return fail('无权限：仅商家可修改设置')
    const allow = ['businessHours', 'deliveryFee', 'minOrderAmount', 'notice',
      'contactPhone', 'contactWechat', 'payMode', 'subMchId']
    const patch = {}
    allow.forEach((k) => { if (data[k] !== undefined) patch[k] = data[k] })
    patch.updatedAt = Date.now()
    await db.collection('settings').doc(DOC).update({ data: patch })
    return ok(true)
  }

  return fail('未知 action: ' + action)
}
