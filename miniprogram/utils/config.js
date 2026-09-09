// 全局配置
module.exports = {
  // 腾讯文档统一共建表（主表/申请表/讨论区三表一档）
  TDOC_FILE_ID: 'IFkcBKnZclOz',
  SHEET_MAIN: 'Z9Jl0h',   // 双休公司数据主表
  SHEET_APPLY: 'ucvytl',  // 新增公司申请表
  SHEET_DISCUSS: '69CvWH',// 公司讨论区

  // 共建表链接（分享/引导用）
  TDOC_URL: 'https://docs.qq.com/smartsheet/DSUZrY0JlblpjbE96',
  GITHUB_URL: 'https://github.com/chamo101/weekend-db',

  // 数据版本（随每次 CSV 快照同步更新）
  DATA_VERSION: '2026-09-09',

  // 匿名讨论限频：同一用户每日上限（PRD 边界情况）
  DAILY_DISCUSS_LIMIT: 10,

  WEEKEND_TYPES: ['双休', '上四休三', '大小周', '单休', '其他']
};
