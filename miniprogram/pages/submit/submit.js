// 提交新增/删减公司申请（写入腾讯文档申请表 ucvytl）
const store = require('../../utils/store');
const config = require('../../utils/config');

Page({
  data: {
    type: 'add', // add | remove
    form: {
      company: '', city: '', weekendType: '',
      leaveDifficulty: '', industry: '', source: '', notes: '', reason: ''
    },
    weekendTypes: config.WEEKEND_TYPES,
    leaveLevels: ['很容易', '较容易', '一般', '较难', '很难'],
    submitting: false
  },

  onLoad(options) {
    // 从详情页跳转来 = 预填删减目标
    if (options.type === 'remove') {
      this.setData({
        type: 'remove',
        'form.company': decodeURIComponent(options.company || ''),
        'form.city': decodeURIComponent(options.city || '')
      });
    }
  },

  onTypeTap(e) {
    this.setData({ type: e.currentTarget.dataset.type });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ ['form.' + field]: e.detail.value });
  },

  onTypeChange(e) {
    this.setData({ 'form.weekendType': this.data.weekendTypes[Number(e.detail.value)] });
  },

  onLeaveChange(e) {
    this.setData({ 'form.leaveDifficulty': this.data.leaveLevels[Number(e.detail.value)] });
  },

  /** 表单校验：必填项缺失高亮拦截（FR 验收） */
  validate() {
    const f = this.data.form;
    const missing = [];
    if (this.data.type === 'add') {
      if (!f.company.trim()) missing.push('公司名');
      if (!f.city.trim()) missing.push('城市');
      if (!f.weekendType) missing.push('休息制度');
    } else {
      if (!f.company.trim()) missing.push('公司名');
      if (!f.city.trim()) missing.push('城市');
      if (!f.reason.trim()) missing.push('删减/纠错理由');
    }
    return missing;
  },

  onSubmit() {
    const missing = this.validate();
    if (missing.length) {
      wx.showToast({ title: '请填写：' + missing.join('、'), icon: 'none', duration: 2500 });
      return;
    }
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    const f = this.data.form;
    const payload = this.data.type === 'add'
      ? {
          applyType: '新增',
          company: f.company.trim(), city: f.city.trim(),
          weekendType: f.weekendType, leaveDifficulty: f.leaveDifficulty,
          industry: f.industry.trim(), reason: '',
          source: f.source.trim(), notes: f.notes.trim()
        }
      : {
          applyType: '删减/纠错',
          company: f.company.trim(), city: f.city.trim(),
          weekendType: '', leaveDifficulty: '',
          industry: '', reason: f.reason.trim(),
          source: '', notes: ''
        };

    store.submitApplication(payload)
      .then(() => {
        wx.showToast({ title: '已提交', icon: 'success' });
        this.setData({ submitting: false });
        setTimeout(() => wx.navigateBack(), 1200);
      })
      .catch(err => {
        this.setData({ submitting: false });
        wx.showModal({
          title: '提交失败',
          content: err.message || '网络异常，请稍后重试',
          showCancel: false
        });
      });
  }
});
