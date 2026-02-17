const fs = require("fs");
const path = require("path");

const summaryStyles = fs.readFileSync(path.join(__dirname, "ai-summary.css"), "utf8");
const summaryMarkup = fs.readFileSync(path.join(__dirname, "ai-summary.html"), "utf8");
const summaryScript = fs.readFileSync(path.join(__dirname, "ai-summary.js"), "utf8");

const toSafeText = function (value, fallback) {
    if (typeof value !== "string") {
        return fallback;
    }
    const trimmed = value.trim();
    return trimmed || fallback;
};

const escapeHtmlText = function (value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
};

const rawConfig = (hexo.config && hexo.config.ai_summary) || {};
const roleName = toSafeText(rawConfig.role_name, "技术助手");
const roleContent = typeof rawConfig.role_content === "string" ? rawConfig.role_content.trim() : "";

const pluginConfig = {
    enabled: Boolean(rawConfig.enabled),
    apiKey: typeof rawConfig.api_key === "string" ? rawConfig.api_key.trim() : "",
    apiUrl: typeof rawConfig.api_url === "string" ? rawConfig.api_url.trim() : "https://api.openai.com/v1",
    model: typeof rawConfig.model === "string" ? rawConfig.model.trim() : "gpt-4o-mini",
    roleName: roleName,
    roleContent: roleContent,
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

const summaryMarkupWithRole = summaryMarkup.replace(/__ROLE_NAME__/g, escapeHtmlText(roleName));

hexo.extend.injector.register(
    "head_end",
    `<style id="hexo-ai-summary-style">${summaryStyles}</style>`,
    "default"
);

hexo.extend.injector.register(
    "head_end",
    `<script>window.__HEXO_AI_SUMMARY_CONFIG__=${JSON.stringify(pluginConfig)};window.__HEXO_AI_SUMMARY_MARKUP__=${JSON.stringify(summaryMarkupWithRole)};</script>`,
    "default"
);

hexo.extend.injector.register(
    "head_end",
    `<script>${summaryScript}</script>`,
    "default"
);
