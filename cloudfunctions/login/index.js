const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ok = (data) => ({ code: 0, data })

// 登录：返回 openid 与管理员身份；首次登录自动建档
exports.main = async () => {
  const { OPENID } = cloud.getWXContext()

  let adminOpenids = []
  try {
    const s = await db.collection('settings').doc('global').get()
    adminOpenids = (s.data && s.data.adminOpenids) || []
  } catch (e) { /* 未初始化时视为非管理员 */ }

  const users = db.collection('users')
  const exist = await users.where({ _openid: OPENID }).count()
  if (!exist.total) {
    await users.add({
      data: { _openid: OPENID, nickName: '', dormBuilding: '', room: '', phone: '', createdAt: Date.now() }
    })
  }

  return ok({ openid: OPENID, isAdmin: adminOpenids.includes(OPENID) })
}
