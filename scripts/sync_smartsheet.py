#!/usr/bin/env python3
"""休着·双休公司信息库 - 腾讯文档共建表 → GitHub CSV 同步脚本
每周由自动化调用：拉取共建表记录 → 与本地 CSV 合并去重 → 提交推送
"""
import csv, json, re, subprocess, sys, os
from datetime import datetime

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(REPO, 'data', 'companies.csv')

def _find_tdoc_skill():
    """自动定位 tencent-docs 插件最新版本目录（勿写死版本号，插件升级后会失效）"""
    root = '/Users/admin/.workbuddy/plugins/cache/workbuddy-builtin/tencent-docs-plugin'
    try:
        cands = [d for d in os.listdir(root)
                 if os.path.isdir(os.path.join(root, d, 'skills', 'tencent-docs'))]
    except OSError:
        cands = []
    if not cands:
        return os.path.join(root, 'skills', 'tencent-docs')
    def ver(d):
        return [int(x) for x in re.findall(r'\d+', d.split('-wb')[0])]
    return os.path.join(root, sorted(cands, key=ver)[-1], 'skills', 'tencent-docs')

TDOC_SKILL = _find_tdoc_skill()
FILE_ID = 'IFkcBKnZclOz'
# 共建表分享链接（注意：ID 区分大小写，DSUZrY0J L blpjbE96 的 L 是大写）
TDOC_URL = 'https://docs.qq.com/smartsheet/DSUZrY0JLblpjbE96'
SHEET_ID = 'Z9Jl0h'          # 主数据表（双休公司数据主表）
APP_SHEET_ID = 'ucvytl'      # 新增公司申请表（审核列：申请状态）
DIS_SHEET_ID = '69CvWH'      # 公司讨论区表（小程序匿名讨论落地）
FIELD_MAP = ['公司名称','城市','区/园区','行业','规模','休息制度','请假难度','加班情况','信息来源类型','来源链接','核实时间','备注']

def tdoc_call(tool, args):
    p = subprocess.run(['python3','tencentdocs.py','tdoc_call','tencent-docs',tool,args],
                       capture_output=True, text=True, cwd=TDOC_SKILL)
    try:
        j = json.loads(p.stdout.strip())
        return json.loads(j['result']['content'][0]['text'])
    except Exception:
        return {'error': f'parse_fail: {p.stdout[:200]} {p.stderr[:200]}'}

def _flatten(field_values):
    """field_values 数组 → {字段标题: 文本}"""
    out = {}
    for f in field_values:
        title = f.get('field') or ''
        if not title:
            continue
        txt = ''
        for key in ('text_value', 'option_value'):
            items = (f.get(key) or {}).get('items') or []
            if items:
                txt = items[0].get('text') or ''
                break
        if not txt:
            txt = (f.get('computed_value') or {}).get('text') or ''
        out[title] = txt
    return out

def fetch_all():
    """拉取共建表全部记录。

    坑（2026-09-20 修）：smartsheet.list_records 不带 record_ids 全量列举时，
    返回的 field_values 一律是空数组（服务端降级，只有 total 是准的），
    照它读会"141 条全空"并静默跳过。必须先取 record_id 列表，再按 record_ids 分批读值。
    """
    ids, offset = [], 0
    for _ in range(50):  # 最多50页
        args = {'file_id': FILE_ID, 'sheet_id': SHEET_ID, 'limit': 100, 'offset': offset}
        d = tdoc_call('smartsheet.list_records', json.dumps(args, ensure_ascii=False))
        if d.get('error'):
            print(f'list_records(ids) error: {d["error"][:200]}', file=sys.stderr)
            break
        recs = d.get('records') or []
        ids += [r['record_id'] for r in recs if r.get('record_id')]
        nxt = d.get('next')
        if not nxt or not recs:
            break
        offset = nxt
    rows = []
    for i in range(0, len(ids), 40):
        args = {'file_id': FILE_ID, 'sheet_id': SHEET_ID,
                'record_ids': ids[i:i + 40], 'include_computed_values': True}
        d = tdoc_call('smartsheet.list_records', json.dumps(args, ensure_ascii=False))
        if d.get('error'):
            print(f'list_records(by_ids) error: {d["error"][:200]}', file=sys.stderr)
            continue
        for r in d.get('records') or []:
            rows.append(_flatten(r.get('field_values') or []))
    return rows

def norm_row(vals):
    """共建表记录 → CSV 行"""
    get = lambda k: str(vals.get(k, '') or '').strip()
    return {
        'company': get('公司名称'), 'city': get('城市'), 'district': get('区/园区'),
        'industry': get('行业'), 'size': get('规模'), 'weekend_type': get('休息制度'),
        'leave_difficulty': get('请假难度'), 'overtime_status': get('加班情况'),
        'source_type': get('信息来源类型') or '社区贡献', 'source_url': get('来源链接'),
        'last_verified': get('核实时间') or datetime.now().strftime('%Y-%m'),
        'notes': get('备注'),
    }

def main():
    remote = fetch_all()
    nonempty = [r for r in remote if (r.get('公司名称') or '').strip()]
    print(f'共建表记录: {len(remote)} 条（其中有值 {len(nonempty)} 条）')
    if remote and not nonempty:
        print('[警告] 拉取到记录但字段值全空——接口降级或表数据异常，本次同步结果不可信，请人工检查',
              file=sys.stderr)
    if not remote:
        print('共建表为空或拉取失败，跳过同步')
        return 0
    # 读本地CSV（BOM兼容）
    with open(CSV_PATH, encoding='utf-8-sig') as f:
        local = list(csv.DictReader(f))
    local_keys = {(r['company'].strip().lower(), r['city'].strip()) for r in local}
    # 合并：共建表新增记录（公司+城市 唯一键）
    added = 0
    for vals in remote:
        row = norm_row(vals)
        if not row['company']: continue
        key = (row['company'].lower(), row['city'])
        if key not in local_keys:
            local.append(row)
            local_keys.add(key)
            added += 1
    print(f'新增: {added} 条 (本地共 {len(local)} 条)')
    if added == 0:
        print('无新增，跳过提交')
        return 0
    # 写CSV（BOM头，Excel友好）
    with open(CSV_PATH, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELD_MAP and ['company','city','district','industry','size','weekend_type','leave_difficulty','overtime_status','source_type','source_url','last_verified','notes'])
        w.writeheader()
        w.writerows(local)
    # git 提交推送
    os.chdir(REPO)
    # 同步小程序内嵌数据快照（CSV → miniprogram/data/companies_data.js）
    subprocess.run([sys.executable, os.path.join(REPO, 'scripts', 'csv_to_js.py')], check=False)
    subprocess.run(['git','add','data/companies.csv','miniprogram/data/companies_data.js'], check=True)
    r = subprocess.run(['git','commit','-m',f'sync: 从共建表合入 {added} 条社区贡献 ({datetime.now():%Y-%m-%d})'], capture_output=True, text=True)
    if r.returncode != 0:
        print('commit 失败(可能无变更):', r.stderr[:200]); return 0
    subprocess.run(['git','push','origin','main'], check=True)
    print('已推送 GitHub')
    return 0

if __name__ == '__main__':
    sys.exit(main())
