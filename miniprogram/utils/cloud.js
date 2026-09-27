// 统一云函数调用封装：call(name, action, data, opts)
// 云函数统一返回 { code: 0, data } 或 { code: 非0, message }

// 把常见云端报错翻译成人话，避免只显示「网络异常」让人无从下手
const humanError = (err, name) => {
  const msg = (err && (err.errMsg || err.message)) || ''
  const code = err && err.errCode
  if (msg.indexOf('FunctionName') >= 0 || code === -501000) return '云函数「' + name + '」未部署'
  if (msg.indexOf('env') >= 0 || msg.indexOf('environment') >= 0) return '云环境未配置：app.js 填环境ID'
  if (msg.indexOf('init') >= 0 || msg.indexOf('not been enabled') >= 0) return '云开发未开通或未初始化'
  if (code === -504003 || msg.indexOf('timeout') >= 0) return '云函数执行超时，请重试'
  return '请求失败(' + (code || '未知') + ')，看控制台日志'
}

const call = (name, action, data = {}, opts = {}) => {
  if (opts.loading) wx.showLoading({ title: opts.loading === true ? '加载中' : opts.loading, mask: true })
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      // 必须是 { action, data } 嵌套结构：云函数统一用 const { action, data } = event 取值
      // 早期写成 Object.assign({ action }, data) 会把参数摊平，导致云函数里 data 恒为空
      data: { action, data },
      success: (res) => {
        if (opts.loading) wx.hideLoading()
        const r = res.result || {}
        if (r.code === 0) {
          resolve(r.data)
        } else {
          if (!opts.silent) wx.showToast({ title: r.message || '操作失败', icon: 'none' })
          reject(r)
        }
      },
      fail: (err) => {
        if (opts.loading) wx.hideLoading()
        // 真实错误打到控制台，方便在开发者工具 Console 里定位
        console.error('[cloud] 调用失败', { name, action, err })
        if (!opts.silent) {
          wx.showToast({ title: humanError(err, name), icon: 'none', duration: 2500 })
        }
        reject(err)
      }
    })
  })
}
module.exports = { call }
