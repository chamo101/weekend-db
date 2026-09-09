// 云函数 tdocProxy：小程序端 ↔ 腾讯文档统一共建表（IFkcBKnZclOz）
// 腾讯文档 OpenAPI 需应用凭证，凭证经环境变量注入（不硬编码）
// action:
//   listDiscussions  { company, city } → { records: [...] }
//   addDiscussion    { company, city, content, role } → { success }
//   reportDiscussion { rowId } → { success } （举报数+1，达3自动隐藏）
//   addApplication   { applyType, company, city, ... } → { success }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 腾讯文档 OpenAPI 基础配置（凭证从环境变量读取）
const TDOC_FILE_ID = 'IFkcBKnZclOz';
const SHEET_DISCUSS = '69CvWH';
const SHEET_APPLY = 'ucvytl';
const TDOC_APP_ID = process.env.TDOC_APP_ID || '';
const TDOC_APP_SECRET = process.env.TDOC_APP_SECRET || '';

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();

  try {
    switch (event.action) {
      case 'listDiscussions':
        return await listDiscussions(event);
      case 'addDiscussion':
        return await addDiscussion(event, OPENID);
      case 'reportDiscussion':
        return await reportDiscussion(event);
      case 'addApplication':
        return await addApplication(event, OPENID);
      default:
        return { success: false, message: 'unknown action' };
    }
  } catch (err) {
    console.error('tdocProxy error:', err);
    return { success: false, message: err.message };
  }
};

// ---------- 腾讯文档 OpenAPI 调用封装 ----------
// 每日频控纪律：写操作天然低频（用户操作触发），不做高频轮询

async function tdocToken() {
  // 腾讯文档开发者凭证 → access_token（缓存 1 小时）
  const cached = await cloud.database ? null : null; // 简化：每次获取，调用频率低
  const res = await fetch('https://docs.qq.com/openapi/v2/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: TDOC_APP_ID,
      app_secret: TDOC_APP_SECRET
    })
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('获取文档凭证失败');
  return data.access_token;
}

async function tdocAddRecords(sheetId, records) {
  const token = await tdocToken();
  const res = await fetch(
    'https://docs.qq.com/openapi/v2/smart/sheet/' + TDOC_FILE_ID + '/' + sheetId + '/records',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': token
      },
      body: JSON.stringify({ records })
    }
  );
  if (!res.ok) throw new Error('写入共建表失败: ' + res.status);
  return await res.json();
}

async function tdocGetRecords(sheetId) {
  const token = await tdocToken();
  const res = await fetch(
    'https://docs.qq.com/openapi/v2/smart/sheet/' + TDOC_FILE_ID + '/' + sheetId + '/records',
    { headers: { 'Access-Token': token } }
  );
  if (!res.ok) throw new Error('读取共建表失败: ' + res.status);
  const data = await res.json();
  return data.records || [];
}

// ---------- 各 action 实现 ----------

async function listDiscussions({ company, city }) {
  const all = await tdocGetRecords(SHEET_DISCUSS);
  // 只返回该公司的、状态为「已发布」的讨论（已隐藏的不过滤到客户端）
  const records = all
    .filter(r => r.company === company && r.city === city && r.status === '已发布')
    .map(r => ({
      rowId: r.record_id,
      content: r.content,
      role: r.role,
      timestamp: r.publish_time ? new Date(r.publish_time).getTime() : null
    }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return { success: true, records };
}

async function addDiscussion({ company, city, content, role }, openid) {
  if (!content || content.length > 300) return { success: false, message: '内容不合法' };
  if (!company || !city) return { success: false, message: '缺少公司信息' };

  // 每日限频服务端兜底（前端限频可被绕过）
  const db = cloud.database();
  const today = new Date().toISOString().slice(0, 10);
  const counterId = 'disc_' + md5(openid) + '_' + today;
  try {
    const counter = db.collection('rate_limit').doc(counterId);
    const doc = await counter.get();
    if (doc.data && doc.data.count >= 10) {
      return { success: false, message: '今日发布已达上限' };
    }
    await counter.set({ data: { count: (doc.data ? doc.data.count : 0) + 1 } });
  } catch (e) {
    // 计数表不存在时初始化
    try {
      await db.collection('rate_limit').doc(counterId).set({ data: { count: 1 } });
    } catch (e2) { /* 不阻塞主流程 */ }
  }

  // 二次 PII 校验（服务端兜底，前端已拦一道）
  if (/1[3-9][0-9]{9}/.test(content) || /[0-9]{17}[0-9Xx]/.test(content)) {
    return { success: false, message: '请勿包含个人隐私信息' };
  }

  await tdocAddRecords(SHEET_DISCUSS, [{
    company, city,
    content: content.trim(),
    role: role || '求职者',
    publish_time: new Date().toISOString(),
    status: '已发布',
    report_count: 0
  }]);
  return { success: true };
}

async function reportDiscussion({ rowId }) {
  if (!rowId) return { success: false, message: '缺少记录ID' };
  const all = await tdocGetRecords(SHEET_DISCUSS);
  const target = all.find(r => r.record_id === rowId);
  if (!target) return { success: false, message: '记录不存在' };

  const newCount = (Number(target.report_count) || 0) + 1;
  const update = { report_count: newCount };
  if (newCount >= 3) update.status = '已隐藏'; // 达 3 人举报自动隐藏

  const token = await tdocToken();
  const res = await fetch(
    'https://docs.qq.com/openapi/v2/smart/sheet/' + TDOC_FILE_ID + '/' + SHEET_DISCUSS +
    '/records/' + rowId,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Access-Token': token },
      body: JSON.stringify({ record: update })
    }
  );
  if (!res.ok) throw new Error('举报失败: ' + res.status);
  return { success: true };
}

async function addApplication(payload, openid) {
  const { applyType, company, city } = payload;
  if (!company || !city) return { success: false, message: '缺少公司信息' };

  await tdocAddRecords(SHEET_APPLY, [{
    apply_type: applyType || '新增',
    company,
    city,
    weekend_type: payload.weekendType || '',
    leave_difficulty: payload.leaveDifficulty || '',
    industry: payload.industry || '',
    reason: payload.reason || '',
    source: payload.source || '',
    notes: payload.notes || '',
    status: '待审核',
    submit_time: new Date().toISOString(),
    submitter: md5(openid) // 只存 openid 哈希做防灌水，不存可读身份
  }]);
  return { success: true };
}

// openid 摘要（隐私最小化：不落明文）
function md5(str) {
  if (!str) return 'anonymous';
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}
