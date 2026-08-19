#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""敏感信息静态扫描（security-audit 技能配套）。

检查：硬编码密码/口令、API Key、Token、私钥、数据库连接串、云厂商密钥等。
默认扫描常见代码与配置文件；加 --config-only 只扫描配置文件明文敏感信息。

用法：
    python scan_secrets.py <文件或目录...> [--exclude node_modules,dist,release,packages,.git] [--config-only]

退出码：0（只输出报告，不修改任何文件）。
"""

import argparse
import os
import re
import sys

# 统一输出为 UTF-8，避免中文 Windows 控制台按 GBK 解码导致乱码
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8')
    except Exception:
        pass

DEFAULT_EXTS = {'.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.py', '.json', '.yaml', '.yml', '.toml', '.ini', '.conf', '.env', '.properties', '.html', '.css', '.sh', '.bat'}
DEFAULT_EXCLUDE = {'node_modules', 'dist', 'release', 'packages', '.git', 'coverage', '__pycache__', '.codex'}

# 敏感信息模式：(类别, 正则, 严重级别)
PATTERNS = [
    ('私钥', re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----', re.I), '高'),
    ('AWS 访问密钥', re.compile(r'AKIA[0-9A-Z]{16}'), '高'),
    ('GitHub Token', re.compile(r'ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}'), '高'),
    ('Slack Token', re.compile(r'xox[baprs]-[A-Za-z0-9-]{10,}'), '高'),
    ('JWT Token', re.compile(r'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'), '中'),
    ('口令赋值', re.compile(r'(?i)(?:password|passwd|pwd|pass)\s*[:=]\s*["\'`]([^"\'`]{3,})["\'`]'), '高'),
    ('密钥/Token 赋值', re.compile(r'(?i)(?:secret|api[_-]?key|apikey|access[_-]?key|secret[_-]?key|client[_-]?secret|auth[_-]?token|bearer[_-]?token|private[_-]?key|refresh[_-]?token)\s*[:=]\s*["\'`]([^"\'`]{6,})["\'`]'), '高'),
    ('带口令的连接串', re.compile(r'(?i)(?:mysql|postgres(?:ql)?|mongodb(?:\+srv)?|redis|amqp|jdbc):[^\s"\'`]*(?::[^@\s"\'`/]+@)'), '高'),
]

# 占位/引用类值不算泄露（环境变量、示例、占位符等）
PLACEHOLDER = re.compile(r'(?i)(xxx+|\*\*\*+|your[_-]?|example|demo|changeme|placeholder|<[^>]+>|process\.env|os\.environ|import\.meta\.env|getenv|\.env\.|env\s*[\[\']|vite\.env|loadenv)')


def collect_files(paths, exts, excludes, config_only):
    """收集待扫描文件列表。"""
    files = []
    for p in paths:
        if os.path.isfile(p):
            files.append(p)
            continue
        for root, dirs, names in os.walk(p):
            dirs[:] = [d for d in dirs if d not in excludes]
            for n in names:
                full = os.path.join(root, n)
                if config_only and not is_config_file(n):
                    continue
                if os.path.splitext(n)[1].lower() in exts or n.startswith('.env'):
                    files.append(full)
    return sorted(files)


def is_config_file(name):
    """判断是否属于配置文件。"""
    lower = name.lower()
    if name == '.env' or name.startswith('.env.'):
        return True
    if lower in ('package.json', 'vite.config.js', 'vite.config.mjs', 'vite.config.ts', 'electron-builder.yml', 'electron-builder.yaml', 'docker-compose.yml', 'docker-compose.yaml', 'docker-compose.override.yml'):
        return True
    if 'config' in lower or 'settings' in lower or 'secret' in lower or 'credential' in lower:
        return True
    return False


def read_text(path):
    """读取文件，优先 UTF-8，失败时退回 GBK。"""
    for enc in ('utf-8', 'gbk'):
        try:
            with open(path, 'r', encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, UnicodeError):
            continue
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        return f.read()


def mask(value):
    """对命中的值打码，避免报告再次泄露。"""
    if len(value) <= 4:
        return '***'
    return value[:2] + '***' + value[-1:]


def scan_file(path):
    """扫描单个文件，返回命中列表 [(行号, 级别, 类别, 打码值, 上下文)]。"""
    raw = read_text(path)
    hits = []
    for i, line in enumerate(raw.splitlines(), 1):
        for cat, pat, sev in PATTERNS:
            m = pat.search(line)
            if not m:
                continue
            value = m.group(1) if m.lastindex else m.group(0)
            # 占位/环境变量引用不报
            if PLACEHOLDER.search(line) or not value.strip():
                continue
            hits.append((i, sev, cat, mask(value.strip()), line.strip()[:120]))
    return hits


def main():
    ap = argparse.ArgumentParser(description='敏感信息静态扫描（只读，不修改文件）')
    ap.add_argument('paths', nargs='*', default=['.'], help='文件或目录，默认当前目录')
    ap.add_argument('--exclude', default=','.join(sorted(DEFAULT_EXCLUDE)), help='排除的目录名（逗号分隔）')
    ap.add_argument('--config-only', action='store_true', help='只扫描配置文件（.env、*.config.* 等）')
    args = ap.parse_args()

    excludes = {e.strip() for e in args.exclude.split(',') if e.strip()}
    files = collect_files(args.paths, DEFAULT_EXTS, excludes, args.config_only)

    total = 0
    for f in files:
        hits = scan_file(f)
        if not hits:
            continue
        rel = os.path.relpath(f)
        print(f"文件: {rel}")
        for line, sev, cat, val, ctx in hits:
            print(f"  [{sev}] 第 {line} 行 {cat}: 值 {val} | 上下文: {ctx}")
            total += 1

    if total == 0:
        mode = '配置文件' if args.config_only else '全部范围'
        print(f"未发现明确的敏感信息（{mode}）。注意：脚本只做模式匹配，仍需人工复核占位符以外的可疑值。")
    else:
        print(f"\n共命中 {total} 处，请人工复核确认真实性与严重程度。")
    return 0


if __name__ == '__main__':
    sys.exit(main())
