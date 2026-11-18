#!/usr/bin/env node
/**
 * dsh-ai-label-verify —— AI 生成内容验标（GB 45438-2025 附录 E）
 * 用法：
 *   dsh-ai-label-verify --dir <目录> [--json] [--html 报告.html] [--ext .png,.docx]
 * 对目录里每个生成内容文件验证隐式标识：元数据 AIGC 关键词 + 五要素。
 * 只读本机，不联网。medium/low 进 findings（退出码 1），纯提示进 notes。
 */
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { verifyDir, BASIS } from '../lib/index.js';

const args = process.argv.slice(2);
const has = (k) => args.includes('--' + k);
const val = (k, d = '') => {
  const i = args.indexOf('--' + k);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};

if (has('help') || !has('dir')) {
  console.log(`dsh-ai-label-verify —— AI 生成内容验标（${BASIS}）

用法：
  dsh-ai-label-verify --dir <目录> [--json] [--html 报告.html] [--ext .png,.docx,.pdf]

验证内容：元数据 AIGC 关键词字段 + 五要素（生成标签/服务提供者/服务编号/内容编号）。
支持：png（块解析）/ docx（python3 zipfile）/ jpg·pdf·wav·mp3（字节尽力扫描）/ txt·md（无载体，进提示）。
只读本机，不联网。退出码：有 medium 及以上 findings → 1。`);
  process.exit(0);
}

const r = verifyDir(resolve(val('dir')), { exts: (val('ext', '.png,.jpg,.jpeg,.docx,.pdf,.wav,.mp3,.txt,.md')).split(',').map((x) => x.trim()) });
const findings = r.findings;
const mediumPlus = findings.filter((f) => f.severity === 'medium' || f.severity === 'high');

if (has('json')) {
  process.stdout.write(JSON.stringify({ basis: BASIS, stats: { files: r.files.length, findings: findings.length, notes: r.notes.length }, findings, notes: r.notes, files: r.files }, null, 2) + '\n', () => { process.exitCode = mediumPlus.length ? 1 : 0; });
} else {
  console.log(`\n  深鲸 · AI 生成内容验标\n  ${'─'.repeat(60)}`);
  console.log(`  依据       ${BASIS}`);
  console.log(`  验标范围   ${resolve(val('dir'))}`);
  console.log(`             ${r.files.length} 个文件 · findings ${findings.length} · 提示 ${r.notes.length}\n`);
  for (const f of findings) console.log(`  【${f.severity}】${f.id} · ${f.file}\n      ${f.msg}\n`);
  for (const n of r.notes) console.log(`  ℹ️  [${n.id}] ${n.file ?? ''} ${n.msg}`);
  if (!r.files.length) console.log('  ⚠️ 目录里没有可验标的文件（支持：png/jpg/docx/pdf/wav/mp3/txt/md）');
  console.log('');
}

if (has('html')) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rows = findings.map((f) => `<tr><td>${f.severity}</td><td>${f.id}</td><td>${esc(f.file)}</td><td>${esc(f.msg)}</td></tr>`).join('');
  const noteRows = r.notes.map((n) => `<tr><td>ℹ️</td><td>${n.id}</td><td>${esc(n.file ?? '')}</td><td>${esc(n.msg)}</td></tr>`).join('');
  writeFileSync(val('html'), `<!doctype html><meta charset="utf-8"><title>AI 生成内容验标报告</title>
<style>body{font:14px/1.6 -apple-system,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:6px 10px;text-align:left;vertical-align:top}th{background:#f5f5f5}</style>
<h1>AI 生成内容验标报告</h1><p>依据 ${esc(BASIS)} · ${r.files.length} 个文件 · findings ${findings.length} · 提示 ${r.notes.length}</p>
<table><tr><th>级别</th><th>规则</th><th>文件</th><th>说明</th></tr>${rows}${noteRows}</table>`, 'utf-8');
  console.log(`HTML 报告已写入：${val('html')}`);
}
process.exitCode = mediumPlus.length ? 1 : 0;
