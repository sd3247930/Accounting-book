#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""风险模式静态扫描（security-audit 技能配套）。

检查：SQL 注入（字符串拼接 SQL）、命令注入（exec/spawn 拼接或 shell:true）、
XSS（innerHTML/v-html）、路径穿越（fs 动态路径）、弱加密、不安全的 Electron 配置。

用法：
    python scan_risks.py <文件或目录...> [--exclude node_modules,dist,release,packages,.git]

退出码：0（只输出报告，不修改任何文件）。
"""

import argparse
import os
import re
import sys

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8')
    except Exception:
        pass

DEFAULT_EXTS = {'.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.py'}
DEFAULT_EXCLUDE = {'node_modules', 'dist', 'release', 'packages', '.git', 'coverage', '__pycache__', '.codex'}

# 风险模式：(类别, 正则, 严重级别, 说明)
PATTERNS = [
    ('SQL 字符串拼接', re.compile(r'(?i)["\'`][^"\'`]*(?:select\s|insert\s+into|update\s+\w+\s+set|delete\s+from|where\s)[^"\'`]*["\'`]\s*\+'), '高', 'SQL 语句与变量字符串拼接，疑似注入风险'),
    ('SQL 模板拼接', re.compile(r'(?i)(?:select\s|insert\s+into|update\s+\w+\s+set|delete\s+from|where\s)[^;\n]{0,120}\$\{'), '高', 'SQL 中使用模板字符串插值，疑似注入风险'),
    ('SQL f-string', re.compile(r'(?i)f["\'`][^"\'`]*(?:select\s|insert\s+into|update\s+\w+\s+set|delete\s+from|where\s)[^"\'`]*\{'), '高', 'Python f-string 拼接 SQL，疑似注入风险'),
    ('命令执行拼接', re.compile(r'(?:exec|execSync)\([^)]*(?:\+\s*[A-Za-z_$]|\$\{|`\s*\+)'), '高', '命令执行参数含变量拼接，疑似命令注入'),
    ('shell:true', re.compile(r'shell\s*:\s*true'), '高', 'spawn/exec 开启 shell 解析，配合用户输入可导致命令注入'),
    ('eval 动态执行', re.compile(r'\beval\([^)]*(?:\+|\$\{|`\s*\+)'), '高', 'eval 执行动态拼接代码，存在代码执行风险'),
    ('new Function 拼接', re.compile(r'new\s+Function\([^)]*(?:\+|\$\{|`\s*\+)'), '高', '动态生成函数体，存在代码执行风险'),
    ('XSS: innerHTML', re.compile(r'(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\s*='), '中', '直接写入 HTML，若包含用户输入则存在 XSS 风险'),
    ('XSS: v-html', re.compile(r'v-html\s*='), '中', 'Vue v-html 渲染用户数据存在 XSS 风险'),
    ('路径穿越/动态路径', re.compile(r'\b(?:readFile(?:Sync)?|writeFile(?:Sync)?|unlink(?:Sync)?|createWriteStream|appendFile(?:Sync)?|rm(?:Sync)?|copyFile(?:Sync)?|rename(?:Sync)?|mkdir(?:Sync)?)\s*\([^)]*(?:\+|\$\{|`\s*\+)'), '中', '文件操作用动态拼接路径，若路径来自用户输入存在穿越风险'),
    ('弱加密', re.compile(r'\bmd5\s*\(|\bsha1\s*\('), '中', 'MD5/SHA1 不应用于密码存储或安全校验'),
    ('Math.random 安全用途', re.compile(r'Math\.random\s*\('), '低', 'Math.random 不可用于密钥/Token 等安全用途（复核上下文）'),
    ('contextIsolation 关闭', re.compile(r'contextIsolation\s*:\s*false'), '高', '关闭 contextIsolation 会破坏渲染进程与预加载脚本的安全隔离'),
    ('nodeIntegration 开启', re.compile(r'nodeIntegration\s*:\s*true'), '高', '渲染进程开启 nodeIntegration 会暴露 Node API，存在严重风险'),
    ('webSecurity 关闭', re.compile(r'webSecurity\s*:\s*false'), '高', '关闭 webSecurity 会禁用同源策略'),
]


def collect_files(paths, exts, excludes):
    files = []
    for p in paths:
        if os.path.isfile(p):
            files.append(p)
            continue
        for root, dirs, names in os.walk(p):
            dirs[:] = [d for d in dirs if d not in excludes]
            for n in names:
                if os.path.splitext(n)[1].lower() in exts:
                    files.append(os.path.join(root, n))
    return sorted(files)


def read_text(path):
    for enc in ('utf-8', 'gbk'):
        try:
            with open(path, 'r', encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, UnicodeError):
            continue
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        return f.read()


def scan_file(path):
    """返回命中列表 [(行号, 级别, 类别, 说明, 上下文)]，并跳过纯注释行。"""
    raw = read_text(path)
    hits = []
    in_block = False
    for i, line in enumerate(raw.splitlines(), 1):
        s = line.strip()
        if in_block:
            if '*/' in s:
                in_block = False
            continue
        if s.startswith('/*'):
            if '*/' not in s:
                in_block = True
            continue
        if s.startswith('//') or s.startswith('#'):
            continue
        for cat, pat, sev, hint in PATTERNS:
            if pat.search(line):
                hits.append((i, sev, cat, hint, s[:120]))
                break  # 一行只记一个类别，避免刷屏
    return hits


def main():
    ap = argparse.ArgumentParser(description='风险模式静态扫描（只读，不修改文件）')
    ap.add_argument('paths', nargs='*', default=['.'], help='文件或目录，默认当前目录')
    ap.add_argument('--exclude', default=','.join(sorted(DEFAULT_EXCLUDE)), help='排除的目录名（逗号分隔）')
    args = ap.parse_args()

    excludes = {e.strip() for e in args.exclude.split(',') if e.strip()}
    files = collect_files(args.paths, DEFAULT_EXTS, excludes)

    total = 0
    for f in files:
        hits = scan_file(f)
        if not hits:
            continue
        rel = os.path.relpath(f)
        print(f"文件: {rel}")
        for line, sev, cat, hint, ctx in hits:
            print(f"  [{sev}] 第 {line} 行 {cat}: {hint} | 上下文: {ctx}")
            total += 1

    if total == 0:
        print('未发现明显的风险模式。注意：脚本只是模式匹配，仍需人工复核业务逻辑与上下文。')
    else:
        print(f"\n共命中 {total} 处，请人工确认是否为真实漏洞（注意误报）。")
    return 0


if __name__ == '__main__':
    sys.exit(main())
