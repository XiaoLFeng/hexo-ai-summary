const fs = require("fs");
const path = require("path");

const summaryStyles = fs.readFileSync(path.join(__dirname, "ai-summary.css"), "utf8");
const summaryMarkup = fs.readFileSync(path.join(__dirname, "ai-summary.html"), "utf8");
const summaryScript = fs.readFileSync(path.join(__dirname, "ai-summary.js"), "utf8");

const rawConfig = (hexo.config && hexo.config.ai_summary) || {};
const pluginConfig = {
    enabled: Boolean(rawConfig.enabled),
    apiKey: typeof rawConfig.api_key === "string" ? rawConfig.api_key.trim() : "",
    apiUrl: typeof rawConfig.api_url === "string" ? rawConfig.api_url.trim() : "https://api.openai.com/v1",
    model: typeof rawConfig.model === "string" ? rawConfig.model.trim() : "gpt-4o-mini",
    contentSelector: typeof rawConfig.content_selector === "string" && rawConfig.content_selector.trim()
        ? rawConfig.content_selector.trim()
        : ".article-entry, .post-content, article",
    maxInputLength: Number.isFinite(rawConfig.max_input_length)
        ? Number(rawConfig.max_input_length)
        : 200000,
    maxSummaryLength: Number.isFinite(rawConfig.max_summary_length)
        ? Number(rawConfig.max_summary_length)
        : 4096
};

if (!pluginConfig.enabled) {
    return;
}

hexo.extend.injector.register(
    "head_end",
    `<style id="hexo-ai-summary-style">${summaryStyles}</style>`,
    "default"
);

hexo.extend.injector.register(
    "head_end",
    `<script>window.__HEXO_AI_SUMMARY_CONFIG__=${JSON.stringify(pluginConfig)};window.__HEXO_AI_SUMMARY_MARKUP__=${JSON.stringify(summaryMarkup)};</script>`,
    "default"
);

hexo.extend.injector.register(
    "head_end",
    `<script>${summaryScript}</script>`,
    "default"
);
