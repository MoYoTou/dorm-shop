// 营业时间工具：hours 形如 [{ start: '18:00', end: '23:30' }]，支持跨天（如 22:00-01:00）
const toMin = (s) => {
  const p = String(s).split(':')
  return Number(p[0]) * 60 + Number(p[1])
}

const pad = (n) => (n < 10 ? '0' + n : '' + n)

const isOpenNow = (hours, date = new Date()) => {
  if (!hours || !hours.length) return false
  const cur = date.getHours() * 60 + date.getMinutes()
  return hours.some((p) => {
    const s = toMin(p.start)
    const e = toMin(p.end)
    return e > s ? (cur >= s && cur <= e) : (cur >= s || cur <= e)
  })
}

// 生成可预定的配送时段（从今天起 days 天内、营业时段内、每 stepMin 分钟一档）
const buildTimeSlots = (hours, days = 2, stepMin = 30) => {
  const slots = []
  const now = new Date()
  for (let d = 0; d < days; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d)
    const label = d === 0 ? '今天' : d === 1 ? '明天' : (day.getMonth() + 1) + '月' + day.getDate() + '日'
    ;(hours || []).forEach((p) => {
      for (let t = toMin(p.start); t + stepMin <= toMin(p.end); t += stepMin) {
        const hm = pad(Math.floor(t / 60)) + ':' + pad(t % 60)
        if (d === 0 && t <= now.getHours() * 60 + now.getMinutes() + stepMin) continue
        slots.push({ label: label + ' ' + hm, day: d, time: hm })
      }
    })
  }
  return slots
}

module.exports = { toMin, isOpenNow, buildTimeSlots }
