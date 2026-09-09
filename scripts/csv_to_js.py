#!/usr/bin/env python3
"""CSV → 小程序 JS 数据快照转换脚本
用法: python3 scripts/csv_to_js.py
把 ../data/companies.csv 转成 miniprogram/data/companies_data.js（小程序内嵌快照）
随周度同步一起跑（sync_smartsheet.py 同步成功后调用本脚本）
"""
import csv
import json
import os
from datetime import date

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE, 'data', 'companies.csv')
OUT_PATH = os.path.join(BASE, 'miniprogram', 'data', 'companies_data.js')

rows = []
with open(CSV_PATH, encoding='utf-8-sig') as f:
    for r in csv.DictReader(f):
        rows.append({
            'company': r['company'].strip(),
            'city': r['city'].strip(),
            'district': r['district'].strip(),
            'industry': r['industry'].strip(),
            'size': r['size'].strip(),
            'weekendType': r['weekend_type'].strip(),
            'leaveDifficulty': r['leave_difficulty'].strip(),
            'overtimeStatus': r['overtime_status'].strip(),
            'sourceType': r['source_type'].strip(),
            'sourceUrl': r['source_url'].strip(),
            'lastVerified': r['last_verified'].strip(),
            'notes': r['notes'].strip(),
        })

out = (
    '// 由 data/companies.csv 自动转换（scripts/csv_to_js.py），勿手改\n'
    f'// 生成时间: {date.today().isoformat()}，共 {len(rows)} 条\n'
    'module.exports = ' + json.dumps(rows, ensure_ascii=False) + ';\n'
)
with open(OUT_PATH, 'w', encoding='utf-8') as f:
    f.write(out)
print(f'OK: {len(rows)} records -> {OUT_PATH}')
