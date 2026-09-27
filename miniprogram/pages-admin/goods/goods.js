const { call } = require('../../utils/cloud')
const { fen2yuan } = require('../../utils/format')

Page({
  data: {
    list: [],
    editing: false,
    form: { id: '', name: '', priceYuan: '', stock: '', category: '零食', image: '', onSale: true }
  },

  onShow() {
    this.load()
  },

  async load() {
    try {
      const list = await call('goods', 'listAll', {}, { silent: true })
      ;(list || []).forEach((g) => { g.priceText = fen2yuan(g.price) })
      this.setData({ list: list || [] })
    } catch (e) {
      console.error('[goods] 加载商品失败', e)
      wx.showToast({ title: (e && e.message) || '加载商品失败', icon: 'none', duration: 2500 })
      this.setData({ list: [] })
    }
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh())
  },

  // ---------- 库存快捷增减 ----------
  // 关键坑：setData 时若数组元素还是同一个对象引用，微信的 diff 可能判定「无变化」而跳过渲染，
  // 表现就是「点了 + 数字纹丝不动」。所以这里必须用 Object.assign 造一个新对象。
  renderDelta(id, delta) {
    const list = this.data.list.map((g) => {
      if (g._id !== id) return g
      return Object.assign({}, g, { stock: Math.max(0, (Number(g.stock) || 0) + delta) })
    })
    this.setData({ list })
  },

  // 提交到云端：失败则提示并从服务器重新拉取回滚
  async commitStock(id, delta) {
    try {
      await call('goods', 'adjustStock', { id: String(id), delta }, { silent: true })
    } catch (err) {
      console.error('[goods] 库存调整失败', id, delta, err)
      wx.showToast({ title: (err && err.message) || '库存调整失败', icon: 'none', duration: 2500 })
      this.load()
    }
  },

  // 单击 +1 / -1 / +10
  adjust(e) {
    if (Date.now() - (this._lastPressEnd || 0) < 350) return // 长按刚结束时不再重复触发
    const { id, d } = e.currentTarget.dataset
    const delta = Number(d)
    if (!id || !delta) return wx.showToast({ title: '商品数据异常，请下拉刷新', icon: 'none' })
    this.renderDelta(id, delta)
    this.commitStock(id, delta)
  },

  // 长按连续增减：本地每 160ms 变一次，松手后一次性提交（不刷屏请求）
  startPress(e) {
    const { id, d } = e.currentTarget.dataset
    const dir = Number(d)
    if (!id || !dir) return
    this.stopPress()
    this._press = { id, total: 0 }
    this._timer = setInterval(() => {
      this._press.total += dir
      this.renderDelta(id, dir)
    }, 160)
  },

  stopPress() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
    if (!this._press) return
    const { id, total } = this._press
    this._press = null
    this._lastPressEnd = Date.now()
    if (total) this.commitStock(id, total)
  },

  endPress() {
    this.stopPress()
  },

  onHide() { this.stopPress() },
  onUnload() { this.stopPress() },

  // 点库存数字：直接输入精确库存，不用一下下戳
  async editStock(e) {
    const { id } = e.currentTarget.dataset
    const g = this.data.list.find((i) => i._id === id)
    if (!g) return
    const r = await wx.showModal({
      title: '设置「' + g.name + '」库存',
      editable: true,
      placeholderText: '输入数量，如 ' + (Number(g.stock) || 0),
      confirmText: '保存'
    }).catch(() => null)
    if (!r || !r.confirm) return
    const raw = String(r.content === undefined ? '' : r.content).trim()
    if (!raw) return wx.showToast({ title: '请输入数量', icon: 'none' })
    const target = Math.round(Number(raw))
    if (!isFinite(target) || target < 0) {
      return wx.showToast({ title: '请输入 0 或正整数', icon: 'none' })
    }
    const delta = target - (Number(g.stock) || 0)
    if (!delta) return
    this.renderDelta(id, delta)
    this.commitStock(id, delta)
  },

  async toggle(e) {
    const { id, onsale } = e.currentTarget.dataset
    try {
      await call('goods', 'toggle', { id: String(id), onSale: !onsale }, { silent: true })
      wx.showToast({ title: !onsale ? '已上架' : '已下架', icon: 'success' })
      this.load()
    } catch (err) {
      console.error('[goods] 上下架失败', id, err)
      wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none', duration: 2500 })
    }
  },

  startAdd() {
    this.setData({
      editing: true,
      form: { id: '', name: '', priceYuan: '', stock: '', category: '零食', image: '', onSale: true }
    })
  },

  startEdit(e) {
    const g = e.currentTarget.dataset.g
    console.log('[goods] 编辑商品原始数据', JSON.stringify(g))
    this.setData({
      editing: true,
      form: {
        id: String(g._id || ''),
        name: String(g.name || ''),
        priceYuan: fen2yuan(g.price || 0),
        stock: String(g.stock === undefined || g.stock === null ? 0 : g.stock),
        category: String(g.category || '零食'),
        image: typeof g.image === 'string' ? g.image : '',
        onSale: g.onSale !== false
      }
    })
  },

  onFormInput(e) {
    this.setData({ ['form.' + e.currentTarget.dataset.k]: e.detail.value })
  },

  async chooseImage() {
    try {
      const r = await wx.chooseMedia({ count: 1, mediaType: ['image'] })
      const file = r.tempFiles[0].tempFilePath
      wx.showLoading({ title: '上传中', mask: true })
      const up = await wx.cloud.uploadFile({
        cloudPath: 'goods/' + Date.now() + '.jpg',
        filePath: file
      })
      wx.hideLoading()
      this.setData({ 'form.image': up.fileID })
    } catch (e) {
      wx.hideLoading()
    }
  },

  cancelEdit() {
    this.setData({ editing: false })
  },

  async save() {
    const f = this.data.form
    console.log('[goods] 提交表单', JSON.stringify(f))

    if (!f.name || !String(f.name).trim()) return wx.showToast({ title: '请填写商品名称', icon: 'none' })
    const priceFen = Math.round(Number(f.priceYuan) * 100)
    if (!isFinite(priceFen) || priceFen <= 0) {
      return wx.showToast({ title: '请填写有效价格，如 4.5', icon: 'none', duration: 2500 })
    }
    const stockNum = Math.round(Number(f.stock))
    if (!isFinite(stockNum) || stockNum < 0 || String(f.stock) === '') {
      return wx.showToast({ title: '请填写库存数量，如 20', icon: 'none', duration: 2500 })
    }

    const payload = {
      name: String(f.name).trim(),
      price: priceFen,
      stock: stockNum,
      category: String(f.category || '').trim() || '零食',
      image: typeof f.image === 'string' ? f.image : '',
      onSale: f.onSale !== false
    }
    // 仅当是编辑（有 id）时才带上 id，新增时绝不传空 id
    if (f.id) payload.id = String(f.id)
    console.log('[goods] 提交 payload', JSON.stringify(payload))

    await call('goods', 'upsert', payload, { loading: '保存中' }).then(() => {
      wx.showToast({ title: '已保存', icon: 'success' })
      this.setData({ editing: false })
      this.load()
    }).catch((err) => {
      console.error('[goods] 保存失败', err)
    })
  }
})
