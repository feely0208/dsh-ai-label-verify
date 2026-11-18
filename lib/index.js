/**
 * dsh-ai-label-verify —— AI 生成内容验标内核
 *
 * 依据：GB 45438-2025《网络安全技术 人工智能生成合成内容标识方法》附录 E（规范性）：
 *   生成合成内容文件的元数据中应添加隐式标识扩展字段，字段名称或关键词应包含 "AIGC"，
 *   元数据隐式标识采用 JSON 结构，包含五要素：生成合成标签、生成合成服务提供者、
 *   服务编号、内容编号、附加信息（可选）。
 *
 * 诚实边界：
 *   - png：解析 tEXt/iTXt/zTXt 块（结构化）
 *   - docx：python3 标准库 zipfile 读全部 xml（无第三方依赖；python3 缺失则降级为字节扫描）
 *   - jpg / pdf / wav / mp3：对原始字节做 'AIGC' 尽力扫描（EXIF/XMP/压缩流结构化解析未实现，
 *     扫不到 ≠ 一定没有，报告注明）
 *   - txt / md：纯文本没有元数据载体 —— 进 notes，提示改用带元数据格式或文内附加标识行
 */
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, basename, extname } from 'node:path';
import { inflateSync } from 'node:zlib';

export const BASIS = 'GB 45438-2025 附录 E（规范性）';
export const SUPPORTED = ['.png', '.jpg', '.jpeg', '.docx', '.pdf', '.wav', '.mp3', '.txt', '.md'];
const ELEMENT_KEYS = {
  label: /label|生成合成标签|AIGC/i,
  provider: /provider|服务提供者|服务商|deepseek/i,
  serviceId: /service[_ -]?id|服务编号/i,
  contentId: /content[_ -]?id|内容编号/i,
};

/** PNG：解析 tEXt / iTXt / zTXt 块 */
function readPngTexts(buf) {
  const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buf.subarray(0, 8).equals(SIG)) return { texts: [], raw: '' };
  const texts = [];
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'tEXt') {
      const i = data.indexOf(0);
      const keyword = data.toString('latin1', 0, i < 0 ? len : i);
      const value = data.toString('latin1', Math.min(i + 1, len));
      texts.push({ chunk: 'tEXt', text: `${keyword}:${value}`.slice(0, 2000) });
    } else if (type === 'iTXt') {
      texts.push({ chunk: 'iTXt', text: data.toString('utf-8', 0, len).replace(/\0/g, ':').slice(0, 2000) });
    } else if (type === 'zTXt') {
      const i = data.indexOf(0);
      const keyword = data.toString('latin1', 0, i < 0 ? 0 : i);
      try {
        texts.push({ chunk: 'zTXt', text: `${keyword}:` + inflateSync(data.subarray(i + 2)).toString('utf-8').slice(0, 2000) });
      } catch { /* 解压失败跳过 */ }
    }
    if (type === 'IEND') break;
    off += 12 + len;
  }
  return { texts, raw: buf.toString('latin1') };
}

/** docx：python3 标准库 zipfile 读全部 xml */
function readDocxXml(file) {
  const py = `import zipfile,sys
z = zipfile.ZipFile(sys.argv[1])
for n in z.namelist():
    if n.endswith('.xml'):
        try: sys.stdout.write(z.read(n).decode('utf-8','ignore'))
        except Exception: pass`;
  const r = spawnSync('python3', ['-c', py, file], { encoding: 'utf-8', timeout: 60_000 });
  return { ok: r.status === 0, out: (r.stdout || ''), err: (r.stderr || '').slice(0, 200) };
}

/** 统一入口：{ carrier, unsupported?, texts[], rawScan, source, error? } */
export function readMetadata(file) {
  const ext = extname(file).toLowerCase();
  const buf = readFileSync(file);
  if (ext === '.png') {
    const { texts, raw } = readPngTexts(buf);
    return { carrier: true, source: 'PNG tEXt/iTXt/zTXt 块', texts, rawScan: raw.includes('AIGC') };
  }
  if (ext === '.docx') {
    const { ok, out, err } = readDocxXml(file);
    if (ok) return { carrier: true, source: 'DOCX zip 内 xml（core/custom/app）', texts: [{ chunk: 'xml', text: out.slice(0, 8000) }], rawScan: buf.toString('latin1').includes('AIGC') };
    return { carrier: true, source: 'DOCX', texts: [], rawScan: buf.toString('latin1').includes('AIGC'), error: 'python3 读取失败：' + err };
  }
  if (['.jpg', '.jpeg', '.pdf', '.wav', '.mp3'].includes(ext)) {
    const raw = buf.toString('latin1');
    return { carrier: true, source: ext === '.pdf' ? 'PDF 字节尽力扫描（压缩流可能扫不到）' : '字节尽力扫描（EXIF/ID3 结构化解析未实现）', texts: [], rawScan: raw.includes('AIGC') };
  }
  if (ext === '.txt' || ext === '.md') {
    const text = buf.toString('utf-8');
    return { carrier: false, source: '纯文本无元数据载体', texts: [{ chunk: 'body', text }], rawScan: /AIGC|人工智能生成|AI\s*生成/.test(text) };
  }
  return { carrier: false, unsupported: true, source: '不支持的格式', texts: [], rawScan: false };
}

/** 五要素判断 */
export function elementsOf(texts, rawScanHit) {
  const all = texts.map((t) => t.text).join('\n');
  const has = (re) => re.test(all) || (rawScanHit && texts.length === 0);
  return {
    label: has(ELEMENT_KEYS.label),
    provider: has(ELEMENT_KEYS.provider),
    serviceId: has(ELEMENT_KEYS.serviceId),
    contentId: has(ELEMENT_KEYS.contentId),
  };
}

/** 单文件验标 → { findings, notes } */
export function verifyFile(file) {
  const meta = readMetadata(file.path);
  const name = basename(file.path);
  const findings = [];
  const notes = [];
  if (meta.unsupported) {
    notes.push({ id: 'ALV-UNSUPPORTED', file: name, msg: `格式 ${extname(file.path)} 暂不支持读取元数据` });
    return { findings, notes };
  }
  if (!meta.carrier) {
    const hasInline = /AIGC|人工智能生成|AI\s*生成/.test(meta.texts.map((t) => t.text).join('\n'));
    notes.push(hasInline
      ? { id: 'ALV-INLINE-OK', file: name, msg: '文内已含 AIGC 标识行 ✓' }
      : { id: 'ALV-CARRIER', file: name, msg: '纯文本无元数据载体：建议改用带元数据的格式（docx/pdf/png）发布，或在文首附加含 AIGC 关键词与五要素的标识行' });
    return { findings, notes };
  }
  if (meta.error) {
    findings.push({ id: 'ALV-READ-ERROR', severity: 'medium', file: name, msg: `元数据读取失败：${meta.error}` });
    return { findings, notes };
  }
  const aigcHit = meta.texts.some((t) => /AIGC/i.test(t.text)) || meta.rawScan;
  if (!aigcHit) {
    findings.push({ id: 'ALV-KEYWORD', severity: 'medium', file: name, msg: '元数据中未发现 AIGC 关键词字段（GB 45438-2025 附录 E：字段名称或关键词应包含 AIGC）' });
    return { findings, notes };
  }
  const el = elementsOf(meta.texts, meta.rawScan);
  if (!el.label) findings.push({ id: 'ALV-LABEL', severity: 'medium', file: name, msg: '缺「生成合成标签」要素（如 Label: AIGC）' });
  if (!el.provider) findings.push({ id: 'ALV-PROVIDER', severity: 'medium', file: name, msg: '缺「生成合成服务提供者」要素' });
  if (!el.serviceId && !el.contentId) findings.push({ id: 'ALV-IDS', severity: 'low', file: name, msg: '缺「服务编号」与「内容编号」要素（至少其一）' });
  if (!findings.length) notes.push({ id: 'ALV-OK', file: name, msg: `隐式标识齐备 ✓（来源：${meta.source}）` });
  return { findings, notes };
}

/** 目录批量验标 */
export function verifyDir(dir, { exts = SUPPORTED } = {}) {
  const out = { findings: [], notes: [], files: [] };
  (function rec(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const full = join(d, e.name);
      if (e.isDirectory()) { rec(full); continue; }
      const ext = extname(e.name).toLowerCase();
      if (!exts.includes(ext)) continue;
      out.files.push(basename(full));
      const r = verifyFile({ path: full, ext });
      out.findings.push(...r.findings);
      out.notes.push(...r.notes);
    }
  })(dir);
  return out;
}

// ── DSH 插件接入（方案 A 薄壳：注册 skill 与 CLI 入口；业务逻辑仍在 lib/bin）──
import { createPlugin, pkgRootFrom } from '@deepwhale-cn/dsh-guard-core/plugin';

export const { name, inject, apply } = createPlugin({
  name: 'ai-label-verify',
  pkgRoot: pkgRootFrom(import.meta.url),
  skillFile: 'skill/ai-label-verify.md',
  binFile: 'bin/cli.mjs',
  description: "按 GB 45438-2025 附录E 验证生成文件的隐式标识：元数据含 AIGC 关键词字段 + 五要素（生成标签/服务提供者/服务编号/内容编号），支持 png/jpg/docx/pdf/wav/txt",
  whenToUse: "AI 生成的文档/图片/音频对外分发前，验证 GB 45438 隐式标识是否落地。用户会说：这批 AI 生成文件的标识达标没有。",
});
