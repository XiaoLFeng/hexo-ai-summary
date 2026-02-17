# hexo-ai-summary

为 Hexo 文章页添加一个可点击的 AI 摘要 Card。

点击 Card 后，插件会把文章正文发送到你配置的 AI 接口，支持流式输出并在 Card 内实时展示摘要内容。

摘要结果会按文章 URL 缓存在浏览器 `localStorage` 24 小时。缓存有效期内再次点击，不会重复请求 AI 接口。

## 安装

```bash
npm install hexo-xlf-ai-summary
```

## Hexo 配置

在 Hexo 根目录 `_config.yml` 中添加：

```yaml
ai_summary:
  enabled: true
  api_key: "YOUR_API_KEY"
  api_url: "https://api.openai.com/v1"
  model: "gpt-4o-mini"

  # 可选
  content_selector: ".article-entry, .post-content, article"
  max_input_length: 200000
  max_summary_length: 4096
```

## 功能说明

- 单 Card 交互：无按钮分栏，点击 Card 即触发生成。
- 状态文案：
  - 初始：`此方来给你生成一个摘要`
  - 生成中：`此方祈祷中`
  - 生成后：标题为 `此方的摘要`，正文在下方显示。
- 流式输出：支持 SSE 增量返回，并带打字机缓入效果。
- 折叠能力：已有摘要后，Card 可点击折叠/展开。
- 深浅色适配：支持 Hexo 常见黑白主题切换（含系统深色模式兜底）。

## 注意事项

- 插件运行在浏览器端，`api_key` 会暴露给访问者。
- `api_url` 可填写基础路径（例如 `https://api.openai.com/v1`），插件会自动拼接 `/chat/completions`。
- 缓存规则：每篇文章一次成功结果缓存 24 小时。
