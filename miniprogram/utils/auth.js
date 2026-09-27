const { call } = require('./cloud')

let loginPromise = null

// 确保已登录：调 login 云函数换取 openid 与管理员身份，缓存到 globalData
const ensureLogin = () => {
  const app = getApp()
  if (app.globalData.openid) return Promise.resolve(app.globalData)
  if (loginPromise) return loginPromise
  loginPromise = call('login', 'login', {}, { silent: true })
    .then((data) => {
      app.globalData.openid = data.openid
      app.globalData.isAdmin = data.isAdmin
      return app.globalData
    })
    .finally(() => { loginPromise = null })
  return loginPromise
}

// 拉取并缓存营业设置
const loadSettings = (force = false) => {
  const app = getApp()
  if (app.globalData.settings && !force) return Promise.resolve(app.globalData.settings)
  return call('settings', 'get', {}, { silent: true }).then((s) => {
    app.globalData.settings = s
    return s
  })
}

module.exports = { ensureLogin, loadSettings }
