// 金额统一用「分」存储，展示时转元
const fen2yuan = (fen) => (Number(fen || 0) / 100).toFixed(2)

const pad = (n) => (n < 10 ? '0' + n : '' + n)

const fmtTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

const STATUS_TEXT = {
  unpaid: '待支付',
  pending_accept: '待接单',
  preparing: '备货中',
  delivering: '配送中',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款'
}

const REFUND_TEXT = {
  none: '',
  pending: '退款审核中',
  rejected: '退款被拒绝',
  refunded: '已退款'
}

module.exports = { fen2yuan, fmtTime, STATUS_TEXT, REFUND_TEXT }
