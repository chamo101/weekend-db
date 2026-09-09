# 休着 · 双休公司查询小程序

`weekend-db` 的微信小程序端。数据与 GitHub 开源共用一套腾讯文档统一共建表（三表一档）。

## 目录结构

```
miniprogram/
├── app.js / app.json / app.wxss     # 全局入口与样式
├── project.config.json              # 开发者工具项目配置（appid 待填）
├── sitemap.json
├── data/
│   ├── companies.csv                # 数据快照副本（勿手改，由周度同步更新）
│   └── companies_data.js            # CSV 转出的内嵌数据（勿手改）
├── utils/
│   ├── config.js                    # 全局配置（sheet_id / 文档链接 / 限频参数）
│   ├── store.js                     # 数据访问层（筛选/距离/讨论读写/申请提交）
│   └── city_coords.js               # 城市/区中心坐标（省市级，估算距离用）
├── pages/
│   ├── index/                       # 首页：定位附近列表 + 城市切换 + 筛选搜索
│   ├── detail/                      # 公司详情 + 匿名讨论区（PII 拦截/举报/限频）
│   └── submit/                      # 新增/删减申请表单（写入共建表申请表）
└── cloudfunctions/
    └── tdocProxy/                   # 云函数：腾讯文档共建表代理（讨论/申请/举报）
```

## 数据链路

```
腾讯文档统一共建表 (IFkcBKnZclOz)
├── 主表 Z9Jl0h   ←→ GitHub CSV ←→ 本目录 data/companies_data.js（内嵌快照）
├── 申请表 ucvytl ←── 小程序「提交申请」
└── 讨论区 69CvWH ←→ 小程序「匿名讨论」读写
```

- 主数据：小程序读**内嵌快照**（随版本发布更新），同步脚本 `scripts/sync_smartsheet.py` 周日 23:30 拉共建表 → CSV → `scripts/csv_to_js.py` 转 JS
- 讨论/申请：经云函数 `tdocProxy` 实时写共建表，审核与数据合流都在腾讯文档完成

## 开发 / 上线步骤

1. **填 appid**：`project.config.json` 的 `appid` 换成自己的小程序 appid
2. **开通云开发**：微信开发者工具 → 云开发，创建环境
3. **部署云函数**：右键 `cloudfunctions/tdocProxy` → 上传并部署（云端安装依赖）
4. **配凭证**：云函数环境变量加 `TDOC_APP_ID` / `TDOC_APP_SECRET`（腾讯文档开放平台应用凭证）
5. **建限频集合**：云开发控制台建 `rate_limit` 集合（讨论每日限频用）
6. 预览真机测试 → 上传 → 提审（类目建议：工具 > 信息查询）

## 合规要点（PRD 拍板）

- 讨论强制匿名：不采集昵称/头像，服务端只存 openid 哈希
- 定位只做查询：坐标精确到省市级，不存储用户经纬度
- PII 双重拦截：前端正则 + 云函数兜底（手机号/身份证/邮箱）
- 每日限频：前端 localStorage + 云函数 rate_limit 双层
