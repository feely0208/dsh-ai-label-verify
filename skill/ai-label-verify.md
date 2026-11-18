# AI 生成内容验标（dsh-ai-label-verify）

**什么时候用**：AI 生成的文档/图片/音频对外分发前，验证隐式标识是否按国标落地。配合 dsh-cn-ai-labeling（打标自查）形成「打标→验标」闭环。
用户会说：「这批 AI 生成的文件标识加了吗」「GB 45438 的元数据要求达标没有」。

## 怎么用

```bash
<cli 路径> --dir <目录> [--json] [--html 报告.html] [--ext .png,.docx,.pdf]
```

## 验什么（依据 GB 45438-2025 附录 E，规范性）

| 检查 | 说明 | 级别 |
|---|---|---|
| ALV-KEYWORD | 元数据字段/关键词含 **AIGC** | medium |
| ALV-LABEL | 含「生成合成标签」要素 | medium |
| ALV-PROVIDER | 含「生成合成服务提供者」要素 | medium |
| ALV-IDS | 含「服务编号/内容编号」要素 | low |

## 边界（诚实）

- png 结构化解析 tEXt/iTXt/zTXt；docx 用 python3 标准库读 xml；jpg/pdf/wav/mp3 为**字节尽力扫描**（EXIF/XMP/压缩流未结构化解析，扫不到 ≠ 一定没有）
- txt/md 无元数据载体 → 进提示（建议换格式或文内加标识行）
- 隐式标识达标 ≠ 显式标识合规——界面提示用 dsh-cn-ai-labeling 逐条自查
