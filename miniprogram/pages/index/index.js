// 首页：附近双休公司列表
const store = require('../../utils/store');
const config = require('../../utils/config');

const TAG_CLASS = {
  '双休': 'tag-weekend',
  '上四休三': 'tag-other',
  '大小周': 'tag-bizhou',
  '单休': 'tag-single'
};

// 请假难度文本 → 1-5 等级（用于难度圆点）
const LEAVE_LEVEL = {
  '很容易': 1, '较容易': 2, '一般': 3, '较难': 4, '很难': 5
};

Page({
  data: {
    list: [],
    allCount: 0,
    cityNames: [],
    currentCity: '',
    cityIndex: 0,
    keyword: '',
    activeFilter: '',
    dataVersion: config.DATA_VERSION,
    loading: true
  },

  companies: [],
  userCoord: null,

  onLoad() {
    this.companies = store.loadCompanies();
    const cities = store.cityList(this.companies);
    this.setData({
      cityNames: ['全部城市'].concat(cities),
      allCount: this.companies.length
    });
    this.initLocation();
  },

  /** 初始化定位：授权则用坐标就近推荐，拒绝则 fallback 手动选城市（PRD 边界） */
  initLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.userCoord = { lat: res.latitude, lng: res.longitude };
        this.guessCity(res.latitude, res.longitude);
        this.renderList();
      },
      fail: () => {
        // 拒绝授权/失败：不阻塞，手动选城市
        this.setData({ loading: false, currentCity: '' });
        this.renderList();
        wx.showToast({ title: '未授权定位，可手动选城市', icon: 'none' });
      }
    });
  },

  /** 按坐标估算城市：遍历内置城市坐标取最近 */
  guessCity(lat, lng) {
    const coords = require('../../utils/city_coords.js');
    let best = '', bestDist = Infinity;
    Object.keys(coords).forEach(city => {
      const d = store.distanceKm(lat, lng, coords[city].lat, coords[city].lng);
      if (d < bestDist) { bestDist = d; best = city; }
    });
    if (best && bestDist < 300) {
      this._locCity = true; // 标记：城市来自定位
      this.setData({ currentCity: best.split('/')[0] });
    }
  },

  onCityChange(e) {
    const idx = Number(e.detail.value);
    const city = idx === 0 ? '' : this.data.cityNames[idx];
    this.setData({ cityIndex: idx, currentCity: city });
    this.renderList();
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
    this.renderList();
  },

  onSearch() {
    this.renderList();
  },

  onFilterTap(e) {
    this.setData({ activeFilter: e.currentTarget.dataset.type });
    this.renderList();
  },

  /** 渲染列表：筛选 + 距离估算 + 排序 */
  renderList() {
    const { keyword, activeFilter, currentCity, cityNames, cityIndex } = this.data;
    // picker 选了"全部城市"时显示全部；定位来的城市默认生效，用户主动切到"全部城市"即清除
    const city = cityIndex === 0 ? '' : currentCity;
    let arr = store.filterCompanies(this.companies, {
      keyword, city, weekendType: activeFilter
    });

    // 有用户坐标则估算距离并按距离排序
    arr = arr.map(c => {
      const item = Object.assign({}, c, {
        tagClass: TAG_CLASS[c.weekendType] || 'tag-other',
        leaveLevel: LEAVE_LEVEL[c.leaveDifficulty] || 0,
        distance: null
      });
      if (this.userCoord) {
        const cc = store.getCityCoord(c.city);
        if (cc) {
          item.distance = Math.round(store.distanceKm(
            this.userCoord.lat, this.userCoord.lng, cc.lat, cc.lng) * 10) / 10;
        }
      }
      return item;
    });
    if (this.userCoord) {
      arr.sort((a, b) => (a.distance === null ? 99999 : a.distance) -
                         (b.distance === null ? 99999 : b.distance));
    }

    this.setData({ list: arr, loading: false });
  },

  onItemTap(e) {
    const item = e.currentTarget.dataset.item;
    wx.navigateTo({
      url: '/pages/detail/detail?company=' + encodeURIComponent(item.company) +
           '&city=' + encodeURIComponent(item.city)
    });
  },

  goSubmit() {
    wx.navigateTo({ url: '/pages/submit/submit' });
  },

  onPullDownRefresh() {
    this.renderList();
    wx.stopPullDownRefresh();
  },

  onShareAppMessage() {
    return {
      title: '休着 · 查查附近哪些公司真双休',
      path: '/pages/index/index'
    };
  }
});
