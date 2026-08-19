#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""注释覆盖率机械统计脚本（comments-check 技能配套）。

功能：
- 统计每个代码文件的注释行 / 代码行 / 注释比例（目标约 30%，20%-40% 为合格区间）
- 找出缺少前置注释的函数（函数声明上方 3 个非空行内没有注释行）

用法：
    python check_comments.py <文件或目录...> [--ext .js,.mjs,.ts,.vue,.py] [--exclude node_modules,dist,release,packages,.git]

退出码：0（只输出统计，不修改任何文件）。
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

DEFAULT_EXTS = {'.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.py', '.css', '.html'}
DEFAULT_EXCLUDE = {'node_modules', 'dist', 'release', 'packages', '.git', 'coverage', '__pycache__'}

# 函数声明正则（js 家族 / python）；返回 (函数名, 行号)
FUNC_PATTERNS = {
    'js': [
        re.compile(r'function\s+([A-Za-z_$][\w$]*)\s*\('),
        re.compile(r'(?:export\s+)?(?:async\s+)?function\s*([A-Za-z_$][\w$]*)\s*\('),
        re.compile(r'(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)'),
        re.compile(r'(?:async\s+)?([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>'),
        # 类方法 / 对象方法（缩进后的 名称(...) { ）
        re.compile(r'^\s{2,}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{'),
    ],
    'py': [
        re.compile(r'^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\('),
        re.compile(r'^\s*class\s+([A-Za-z_]\w*)\s*[:(]'),
    ],
}

# 伪匹配：这些词后面跟括号不一定是函数声明
JS_KEYWORDS = {'if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else', 'with', 'typeof'}


def collect_files(paths, exts, excludes):
    """收集待检查文件列表。"""
    files = []
    for p in paths:
        if os.path.isfile(p):
            files.append(p)
            continue
        for root, dirs, names in os.walk(p):
            dirs[:] = [d for d in dirs if d not in excludes]
            for n in names:
                if os.path.splitext(n)[1] in exts:
                    files.append(os.path.join(root, n))
    return sorted(files)


def read_text(path):
    """读取文件，优先 UTF-8，失败时退回 GBK（兼容中文 Windows 老文件）。"""
    for enc in ('utf-8', 'gbk'):
        try:
            with open(path, 'r', encoding=enc) as f:
                return f.read()
        except (UnicodeDecodeError, UnicodeError):
            continue
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        return f.read()


def classify_lines(raw):
    """把每一行分类为 comment / code / blank。"""
    lines = raw.splitlines()
    flags = []
    in_block = False
    block_style = None  # c=/* */, py=三引号, html=<!-- -->
    block_delim = None

    for line in lines:
        s = line.strip()
        if not s:
            flags.append('blank')
            continue
        if in_block:
            flags.append('comment')
            if block_style == 'c' and '*/' in s:
                in_block = False
            elif block_style == 'py' and s.endswith(block_delim):
                in_block = False
            elif block_style == 'html' and '-->' in s:
                in_block = False
            continue
        if s.startswith('"""') or s.startswith("'''"):
            flags.append('comment')
            delim = s[:3]
            if s.count(delim) < 2:  # 只有开头，说明是跨行字符串/文档字符串
                in_block = True
                block_style = 'py'
                block_delim = delim
            continue
        if s.startswith('/*'):
            flags.append('comment')
            if '*/' not in s:
                in_block = True
                block_style = 'c'
            continue
        if s.startswith('<!--'):
            flags.append('comment')
            if '-->' not in s:
                in_block = True
                block_style = 'html'
            continue
        if s.startswith('//') or s.startswith('#') or s.startswith('*'):
            flags.append('comment')
            continue
        flags.append('code')
    return lines, flags


def has_comment_above(flags, idx):
    """向上最多看 3 个非空行，只要有注释行就视为已注释。"""
    seen = 0
    j = idx - 1
    while j >= 0 and seen < 3:
        if flags[j] == 'blank':
            j -= 1
            continue
        if flags[j] == 'comment':
            return True
        seen += 1
        j -= 1
    return False


def has_docstring_below(lines, flags, idx):
    """Python 特例：声明后紧跟的 docstring（三引号）也算文档。"""
    j = idx + 1
    while j < len(lines):
        if flags[j] == 'blank':
            j += 1
            continue
        return lines[j].strip().startswith('"""') or lines[j].strip().startswith("'''")
    return False


def find_undocumented(lines, flags, patterns, lang):
    """返回缺少前置注释的函数列表 [(函数名, 行号)]。"""
    found = []
    for i, line in enumerate(lines):
        if flags[i] != 'code':
            continue
        for pat in patterns:
            m = pat.search(line)
            if m:
                name = m.group(1)
                if name in JS_KEYWORDS:
                    continue
                documented = has_comment_above(flags, i)
                if not documented and lang == 'py':
                    documented = has_docstring_below(lines, flags, i)
                if not documented:
                    found.append((name, i + 1))
                break  # 一行只记一个函数
    return found


def language_of(path):
    """按扩展名判断代码语言：.py 走 Python 规则，其余走 JS 家族规则。"""
    ext = os.path.splitext(path)[1].lower()
    return 'py' if ext == '.py' else 'js'


def analyze(path):
    """分析单个文件，返回统计字典。"""
    raw = read_text(path)
    lines, flags = classify_lines(raw)
    comments = flags.count('comment')
    code = flags.count('code')
    total_nonblank = comments + code
    ratio = (comments / total_nonblank) if total_nonblank else 0.0
    lang = language_of(path)
    undocumented = find_undocumented(lines, flags, FUNC_PATTERNS[lang], lang)
    funcs = 0
    for i, line in enumerate(lines):
        if flags[i] != 'code':
            continue
        for pat in FUNC_PATTERNS[lang]:
            m = pat.search(line)
            if m and m.group(1) not in JS_KEYWORDS:
                funcs += 1
                break
    return {
        'path': path,
        'total': len(lines),
        'comments': comments,
        'code': code,
        'ratio': ratio,
        'funcs': funcs,
        'undocumented': undocumented,
    }


def status_of(ratio):
    """把注释比例映射为状态：20%-40% 合格区间，低于 20% 偏低，高于 40% 偏多。"""
    if 0.20 <= ratio <= 0.40:
        return '合格区间'
    if ratio < 0.20:
        return '偏低'
    return '偏多(注意有效性)'


def main():
    """命令行入口：解析参数、收集文件、逐文件统计并输出汇总。"""
    ap = argparse.ArgumentParser(description='注释覆盖率统计（只读，不修改文件）')
    ap.add_argument('paths', nargs='*', default=['.'], help='文件或目录，默认当前目录')
    ap.add_argument('--ext', default=','.join(sorted(DEFAULT_EXTS)), help='参与统计的扩展名（逗号分隔）')
    ap.add_argument('--exclude', default=','.join(sorted(DEFAULT_EXCLUDE)), help='排除的目录名（逗号分隔）')
    args = ap.parse_args()

    exts = {('.' + e.lstrip('.')).lower() for e in args.ext.split(',') if e.strip()}
    excludes = {e.strip() for e in args.exclude.split(',') if e.strip()}
    files = collect_files(args.paths, exts, excludes)

    if not files:
        print('未找到符合条件的代码文件。')
        return 0

    results = [analyze(f) for f in files]
    total_c = sum(r['comments'] for r in results)
    total_code = sum(r['code'] for r in results)
    total_undoc = sum(len(r['undocumented']) for r in results)
    total_funcs = sum(r['funcs'] for r in results)

    for r in results:
        rel = os.path.relpath(r['path'])
        print(f"文件: {rel}")
        print(f"  总行 {r['total']} | 注释 {r['comments']} | 代码 {r['code']} | 比例 {r['ratio'] * 100:.1f}% ({status_of(r['ratio'])})")
        print(f"  函数 {r['funcs']} | 缺前置注释 {len(r['undocumented'])}")
        for name, ln in r['undocumented']:
            print(f"    - 第 {ln} 行: {name}")

    overall = (total_c / (total_c + total_code) * 100) if (total_c + total_code) else 0.0
    print('\n汇总:')
    print(f"  文件 {len(results)} | 注释 {total_c} | 代码 {total_code} | 整体比例 {overall:.1f}%")
    print(f"  函数 {total_funcs} | 缺前置注释 {total_undoc}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
