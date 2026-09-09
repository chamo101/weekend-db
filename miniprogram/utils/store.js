// 数据访问层：公司数据（本地快照）+ 腾讯文档讨论区
// 腾讯文档小程序端直连没有公开 JS SDK，讨论区读写走云函数代理（cloudbase 文档型写入为备选）
// 讨论表 sheet_id: 69CvWH，申请表 sheet_id: ucvytl（统一共建表 IFkcBKnZclOz）
const CONFIG = require('./config');

// ---------- 公司主数据（本地快照，随版本更新） ----------

/** CSV 单行解析（字段内无逗号，简化处理；带 BOM 兼容） */
function parseCsvLine(line) {
  return line.replace(/^\uFEFF/, '').split(',');
}

function loadCompanies() {
  // 内嵌快照数据，见 data/companies.csv（由 sync_smartsheet.py 周度同步生成）
  const raw = require('../data/companies_data.js');
  return raw;
}

/** 城市列表（去重排序） */
function cityList(companies) {
  const set = new Set();
  companies.forEach(c => set.add(c.city));
  return Array.from(set).filter(Boolean).sort();
}

/** 按关键词/城市/制度筛选 */
function filterCompanies(companies, { keyword = '', city = '', weekendType = '' } = {}) {
  return companies.filter(c => {
    if (city && c.city !== city) return false;
    if (weekendType && c.weekendType !== weekendType) return false;
    if (keyword) {
      const hay = (c.company + ' ' + c.industry + ' ' + c.notes).toLowerCase();
      if (hay.indexOf(keyword.toLowerCase()) === -1) return false;
    }
    return true;
  });
}

// ---------- 省市区坐标（城市/区中心点，用于估算距离） ----------
// PRD 拍板：坐标精确到省市区级别，不做门店级经纬度
const CITY_COORDS = require('./city_coords.js');

function getCityCoord(cityName) {
  return CITY_COORDS[cityName] || null;
}

/** 两点间球面距离（km），Haversine */
function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- 腾讯文档讨论区 / 申请表（经云函数代理写共建表） ----------

/** 拉取某公司的讨论列表（云函数 → 腾讯文档讨论区 sheet 69CvWH） */
function fetchDiscussions(companyName, city) {
  return wx.cloud.callFunction({
    name: 'tdocProxy',
    data: { action: 'listDiscussions', company: companyName, city: city }
  }).then(res => res.result && res.result.records || []);
}

/** 发布匿名讨论（写入讨论区 sheet） */
function postDiscussion(companyName, city, content, role) {
  return wx.cloud.callFunction({
    name: 'tdocProxy',
    data: {
      action: 'addDiscussion',
      company: companyName,
      city: city,
      content: content,
      role: role || '求职者'
    }
  }).then(res => {
    if (res.result && res.result.success) return true;
    throw new Error(res.result && res.result.message || '发布失败');
  });
}

/** 提交新增/删减公司申请（写入申请表 sheet ucvytl） */
function submitApplication(payload) {
  return wx.cloud.callFunction({
    name: 'tdocProxy',
    data: Object.assign({ action: 'addApplication' }, payload)
  }).then(res => {
    if (res.result && res.result.success) return true;
    throw new Error(res.result && res.result.message || '提交失败');
  });
}

module.exports = {
  loadCompanies,
  cityList,
  filterCompanies,
  getCityCoord,
  distanceKm,
  fetchDiscussions,
  postDiscussion,
  submitApplication
};
