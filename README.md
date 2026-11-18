# @deepwhale-cn/dsh-ai-label-verify

AI 生成内容验标：按 GB 45438-2025 附录 E 验证生成文件的隐式标识——元数据 AIGC 关键词字段 + 五要素（生成合成标签/服务提供者/服务编号/内容编号）。png 结构化解析、docx python3 标准库读取、jpg/pdf/wav 字节尽力扫描。只读本机、不联网。

```bash
npx @deepwhale-cn/dsh-ai-label-verify --dir <目录> [--html 报告.html]
```

打标自查配合 dsh-cn-ai-labeling；显式标识（界面提示）需人工核对。
