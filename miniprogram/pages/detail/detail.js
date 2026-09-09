// 公司详情 + 匿名讨论区
const store = require('../../utils/store');
const config = require('../../utils/config');

const TAG_CLASS = {
  '双休': 'tag-weekend', '上四休三': 'tag-other',
  '大小周': 'tag-bizhou', '单休': 'tag-single'
};

// PII 拦截：手机号 / 身份证号 / 邮箱（合规三件套之一，SC-004）
const PII_PATTERNS = [
  { re: /1[3-9][0-9]{9}/, name: '手机号' },
  { re: /[0-9]{17}[0-9Xx]/, name: '身份证号' },
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, name: '邮箱' }
];

function detectPII(text) {
  for (const p of PII_PATTERNS) {
    if (p.re.test(text)) return p.name;
  }
  return null;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  const d = Math.floor(h / 24);
  if (d < 30) return d + ' 天前';
  return new Date(ts).toLocaleDateString();
}

Page({
  data: {
    company: null,
    discussions: [],
    discContent: '',
    role: '求职者',
    posting: false,
    discLoading: true
  },

  onLoad(options) {
    const companyName = decodeURIComponent(options.company || '');
    const city = decodeURIComponent(options.city || '');
    const companies = store.loadCompanies();
    const found = companies.find(c => c.company === companyName && c.city === city);

    if (!found) {
      wx.showToast({ title: '未找到该公司', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({
      company: Object.assign({}, found, {
        tagClass: TAG_CLASS[found.weekendType] || 'tag-other'
      })
    });
    wx.setNavigationBarTitle({ title: found.company });
    this.loadDiscussions();
  },

  /** 拉取讨论列表（腾讯文档讨论区 sheet，经云函数代理） */
  loadDiscussions() {
    this.setData({ discLoading: true });
    store.fetchDiscussions(this.data.company.company, this.data.company.city)
      .then(records => {
        const list = records.map(r => Object.assign({}, r, {
          timeText: r.timestamp ? timeAgo(r.timestamp) : ''
        }));
        this.setData({ discussions: list, discLoading: false });
      })
      .catch(() => {
        // 云函数不可用时静默降级：讨论区显示为空，不影响浏览
        this.setData({ discussions: [], discLoading: false });
      });
  },

  onDiscInput(e) {
    this.setData({ discContent: e.detail.value });
  },

  onRoleChange(e) {
    this.setData({ role: e.detail.value });
  },

  /** 发布匿名讨论（含 PII 拦截 + 每日限频） */
  postDisc() {
    const content = (this.data.discContent || '').trim();
    if (!content) return;

    // PII 拦截（FR/验收：发布前拦截并提示）
    const pii = detectPII(content);
    if (pii) {
      wx.showModal({
        title: '请勿包含个人隐私信息',
        content: '内容中检测到' + pii + '，为保护隐私无法发布。请删除后重试。',
        showCancel: false
      });
      return;
    }

    // 每日限频（PRD 边界：同一用户每日上限 10 条）
    const key = 'disc_count_' + this._today();
    const count = wx.getStorageSync(key) || 0;
    if (count >= config.DAILY_DISCUSS_LIMIT) {
      wx.showToast({ title: '今天发得够多啦，明天再来', icon: 'none' });
      return;
    }

    // 首次发布弹确认框（PRD 边界）
    const doPost = () => {
      this.setData({ posting: true });
      store.postDiscussion(
        this.data.company.company, this.data.company.city, content, this.data.role
      ).then(() => {
        wx.setStorageSync(key, count + 1);
        this.setData({ discContent: '', posting: false });
        wx.showToast({ title: '已发布', icon: 'success' });
        this.loadDiscussions();
      }).catch(err => {
        this.setData({ posting: false });
        wx.showToast({ title: err.message || '发布失败', icon: 'none' });
      });
    };

    if (count === 0) {
      wx.showModal({
        title: '确认匿名发布？',
        content: '发布后不显示任何身份信息，无法撤回。',
        confirmColor: '#2e7d32',
        success: (res) => { if (res.confirm) doPost(); }
      });
    } else {
      doPost();
    }
  },

  _today() {
    const d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  },

  /** 举报讨论：本地记举报 + 云端计数（达 3 自动隐藏，由云函数处理） */
  reportDisc(e) {
    const idx = e.currentTarget.dataset.index;
    const item = this.data.discussions[idx];
    wx.showModal({
      title: '举报该讨论',
      content: '举报违规内容（人身攻击/泄露隐私等）？',
      confirmColor: '#2e7d32',
      success: (res) => {
        if (!res.confirm) return;
        wx.cloud.callFunction({
          name: 'tdocProxy',
          data: { action: 'reportDiscussion', rowId: item.rowId }
        }).then(() => {
          wx.showToast({ title: '已举报，感谢', icon: 'success' });
        }).catch(() => {
          wx.showToast({ title: '举报失败', icon: 'none' });
        });
      }
    });
  },

  copySource() {
    wx.setClipboardData({ data: this.data.company.sourceUrl || '' });
  },

  goApplyAdd() {
    wx.navigateTo({
      url: '/pages/submit/submit?type=remove&company=' +
        encodeURIComponent(this.data.company.company) + '&city=' + encodeURIComponent(this.data.company.city)
    });
  },

  goHome() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    return {
      title: this.data.company ? this.data.company.company + ' 是双休吗？' : '休着',
      path: '/pages/index/index'
    };
  }
});
