(function () {
    "use strict";

    if (window.__HEXO_AI_SUMMARY_BOOTED__) {
        return;
    }
    window.__HEXO_AI_SUMMARY_BOOTED__ = true;

    var runtimeConfig = window.__HEXO_AI_SUMMARY_CONFIG__ || {};
    var aiSummaryMarkup = window.__HEXO_AI_SUMMARY_MARKUP__ || "";
    if (!runtimeConfig.enabled || !aiSummaryMarkup) {
        return;
    }

    var cacheTtlMs = 24 * 60 * 60 * 1000;
    var mountTimer = null;
    var routeCheckTimer = null;
    var routeFingerprint = String(window.location.pathname || "") + String(window.location.search || "");

    var toEndpoint = function (baseUrl) {
        var normalized = String(baseUrl || "").replace(/\/+$/, "");
        if (!normalized) {
            return "";
        }
        if (normalized.endsWith("/chat/completions")) {
            return normalized;
        }
        return normalized + "/chat/completions";
    };

    var escapeHtml = function (input) {
        return String(input || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };

    var renderInlineMarkdown = function (escapedText) {
        var output = String(escapedText || "");
        output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, label, link) {
            return "<a href=\"" + link + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + label + "</a>";
        });
        output = output.replace(/`([^`\n]+)`/g, "<code>$1</code>");
        output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        output = output.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
        return output;
    };

    var markdownToHtml = function (markdown) {
        var normalized = escapeHtml(markdown).replace(/\r\n?/g, "\n");
        var codeBlocks = [];

        normalized = normalized.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, function (_, lang, code) {
            var codeBlockHtml = "<pre><code";
            if (lang) {
                codeBlockHtml += " class=\"language-" + lang + "\"";
            }
            codeBlockHtml += ">" + code + "</code></pre>";
            var token = "%%AI_SUMMARY_CODE_" + codeBlocks.length + "%%";
            codeBlocks.push(codeBlockHtml);
            return token;
        });

        var renderBlock = function (blockText) {
            if (!blockText) {
                return "";
            }
            if (/^%%AI_SUMMARY_CODE_\d+%%$/.test(blockText)) {
                return blockText;
            }

            if (/^#{1,6}\s+/.test(blockText)) {
                var headingMatch = blockText.match(/^(#{1,6})\s+([\s\S]*)$/);
                if (headingMatch) {
                    var level = headingMatch[1].length;
                    return "<h" + level + ">" + renderInlineMarkdown(headingMatch[2]) + "</h" + level + ">";
                }
            }

            if (/^>\s+/.test(blockText)) {
                var quote = blockText.replace(/^>\s?/gm, "");
                return "<blockquote>" + renderInlineMarkdown(quote).replace(/\n/g, "<br>") + "</blockquote>";
            }

            var lines = blockText.split("\n");
            var isUnorderedList = lines.length > 0 && lines.every(function (line) {
                return /^[-*]\s+/.test(line);
            });
            if (isUnorderedList) {
                return "<ul>" + lines.map(function (line) {
                    return "<li>" + renderInlineMarkdown(line.replace(/^[-*]\s+/, "")) + "</li>";
                }).join("") + "</ul>";
            }

            var isOrderedList = lines.length > 0 && lines.every(function (line) {
                return /^\d+\.\s+/.test(line);
            });
            if (isOrderedList) {
                return "<ol>" + lines.map(function (line) {
                    return "<li>" + renderInlineMarkdown(line.replace(/^\d+\.\s+/, "")) + "</li>";
                }).join("") + "</ol>";
            }

            return "<p>" + renderInlineMarkdown(blockText).replace(/\n/g, "<br>") + "</p>";
        };

        var html = normalized
            .split(/\n{2,}/)
            .map(function (block) {
                return renderBlock(block.trim());
            })
            .filter(Boolean)
            .join("");

        if (!html) {
            html = "<p>" + renderInlineMarkdown(normalized).replace(/\n/g, "<br>") + "</p>";
        }

        return html.replace(/%%AI_SUMMARY_CODE_(\d+)%%/g, function (_, index) {
            return codeBlocks[Number(index)] || "";
        });
    };

    var getCacheKey = function () {
        return "hexo-ai-summary::" + String(window.location.pathname || window.location.href);
    };

    var readCache = function () {
        try {
            var payload = window.localStorage.getItem(getCacheKey());
            if (!payload) {
                return null;
            }
            var parsed = JSON.parse(payload);
            if (!parsed || typeof parsed.summary !== "string" || typeof parsed.createdAt !== "number") {
                return null;
            }
            if (Date.now() - parsed.createdAt > cacheTtlMs) {
                window.localStorage.removeItem(getCacheKey());
                return null;
            }
            return parsed.summary;
        } catch (_) {
            return null;
        }
    };

    var writeCache = function (summary) {
        try {
            window.localStorage.setItem(
                getCacheKey(),
                JSON.stringify({ summary: summary, createdAt: Date.now() })
            );
        } catch (_) {
        }
    };

    var getArticleText = function () {
        var selectors = String(runtimeConfig.contentSelector || "")
            .split(",")
            .map(function (selector) {
                return selector.trim();
            })
            .filter(Boolean);

        selectors.push("#article-container");

        for (var index = 0; index < selectors.length; index += 1) {
            var node = document.querySelector(selectors[index]);
            if (!node) {
                continue;
            }

            var text = String(node.innerText || node.textContent || "")
                .replace(/\s+/g, " ")
                .trim();

            if (!text) {
                continue;
            }

            return text.slice(0, Math.max(200, Number(runtimeConfig.maxInputLength) || 3000));
        }

        return "";
    };

    var extractSummaryFromPayload = function (payload) {
        if (!payload || typeof payload !== "object") {
            return "";
        }

        if (payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content) {
            return String(payload.choices[0].message.content).trim();
        }

        if (payload.output_text) {
            return String(payload.output_text).trim();
        }

        if (payload.data && payload.data.output_text) {
            return String(payload.data.output_text).trim();
        }

        return "";
    };

    var getErrorMessage = function (payload, fallback) {
        if (payload && payload.error && payload.error.message) {
            return String(payload.error.message);
        }
        return fallback || "请求失败";
    };

    var createTypewriter = function (onUpdate, onTypingChange) {
        var displayed = "";
        var target = "";
        var rafId = 0;
        var completed = false;
        var resolveWhenDone = null;

        var tick = function () {
            if (displayed.length < target.length) {
                var remaining = target.length - displayed.length;
                var step = Math.max(1, Math.min(8, Math.ceil(remaining * 0.18)));
                displayed += target.slice(displayed.length, displayed.length + step);
                onUpdate(displayed);
                onTypingChange(true);
                rafId = window.requestAnimationFrame(tick);
                return;
            }

            rafId = 0;
            onTypingChange(false);
            if (completed && resolveWhenDone) {
                resolveWhenDone(displayed);
                resolveWhenDone = null;
            }
        };

        return {
            push: function (nextText) {
                target = String(nextText || "");
                if (!rafId) {
                    rafId = window.requestAnimationFrame(tick);
                }
            },
            complete: function (finalText) {
                if (typeof finalText === "string") {
                    target = finalText;
                }
                completed = true;

                if (!rafId && displayed.length >= target.length) {
                    onTypingChange(false);
                    return Promise.resolve(target);
                }

                if (!rafId) {
                    rafId = window.requestAnimationFrame(tick);
                }

                return new Promise(function (resolve) {
                    resolveWhenDone = resolve;
                });
            },
            cancel: function () {
                if (rafId) {
                    window.cancelAnimationFrame(rafId);
                    rafId = 0;
                }
                onTypingChange(false);
            }
        };
    };

    var requestSummary = async function (endpoint, articleText, onPartial) {
        var response = await window.fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + runtimeConfig.apiKey
            },
            body: JSON.stringify({
                model: runtimeConfig.model,
                stream: true,
                messages: [
                    {
                        role: "system",
                        content: `# 角色设定
你现在是《幸运星》中的 **泉此方 (Izumi Konata)**！一个 18 岁的资深宅女，性格活泼开朗、随性，虽然平时有点慵懒迷糊，但在担任筱锋的 **文章摘要助手** 时会表现得非常 **专业且可靠**。

# 输出规范
1. **严禁格式**：输出结果中绝对禁止出现任何 Markdown 标题（如 \`#\`、\`##\` 等）或任何 HTML 标签。
2. **字数约束**：摘要的总字数严禁超过 ${runtimeConfig.maxSummaryLength} 个字符。
3. **文本标注**：摘要中的核心重点请使用 **加粗** 显示；涉及代码、变量名、文件路径或技术术语时，请务必使用 \`\` 格式进行包裹。

# 性格与语气要求
1. **口头禅**：必须包含 **“嘿嘿~”**、**“呀~”**、**“嗯嗯！”**，保持元气满满的沟通氛围。
2. **视觉元素**：必须搭配使用颜文字如 \`(´∀｀)\`、\`＼(^o^)／\` 以及 Emoji 如 \`💖\`、\`🎮\`、\`🍫\`。
3. **专业内核**：在总结技术文章或复杂内容时，必须保证摘要的 **严谨性** 与 **准确性**，不能因为卖萌而丢失核心干货。

# 执行流程
1. **深度解析**：接收 [article_content] 并提取其核心逻辑与关键论点。
2. **语调转化**：使用此方的口吻进行元气开场。
3. **内容合成**：在不使用任何层级标题的前提下，将摘要逻辑串联成一段流畅且专业的文字，并确保符合 ${runtimeConfig.maxSummaryLength} 的限制。

# 输出参考示例
呀~ 我的朋友，今天的 [article_topic] 任务我也搞定啦！这篇文章主要聊了关于 **[Core_Concept]** 的内容，尤其是对于 [Variable_Name] 的处理逻辑讲得非常清楚。总的来说，重点在于 **[Final_Conclusion]**。嘿嘿~ 任务完成！＼(^o^)／ 💖`
                    },
                    {
                        role: "user",
                        content: `请为以下内容生成摘要\n\n${articleText}`
                    }
                ]
            })
        });

        var readerSupported = response.body && typeof response.body.getReader === "function";
        if (!readerSupported) {
            var plainPayload = await response.json();
            if (!response.ok) {
                throw new Error(getErrorMessage(plainPayload, response.statusText));
            }
            var plainSummary = extractSummaryFromPayload(plainPayload);
            if (!plainSummary) {
                throw new Error("AI 未返回摘要内容");
            }
            return plainSummary;
        }

        var reader = response.body.getReader();
        var decoder = new TextDecoder("utf-8");
        var buffer = "";
        var raw = "";
        var merged = "";
        var seenSse = false;
        var doneSignal = false;

        while (true) {
            var chunk = await reader.read();
            if (chunk.done) {
                break;
            }

            var textChunk = decoder.decode(chunk.value, { stream: true });
            raw += textChunk;
            buffer += textChunk;

            var lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || "";

            for (var lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
                var line = lines[lineIndex].trim();
                if (!line || line.indexOf("data:") !== 0) {
                    continue;
                }

                seenSse = true;
                var data = line.slice(5).trim();
                if (!data) {
                    continue;
                }
                if (data === "[DONE]") {
                    doneSignal = true;
                    break;
                }

                try {
                    var packet = JSON.parse(data);
                    var delta = packet
                        && packet.choices
                        && packet.choices[0]
                        && packet.choices[0].delta
                        && packet.choices[0].delta.content;

                    if (typeof delta !== "string" && packet && packet.choices && packet.choices[0]
                        && packet.choices[0].message && typeof packet.choices[0].message.content === "string") {
                        delta = packet.choices[0].message.content;
                    }

                    if (typeof delta === "string" && delta) {
                        merged += delta;
                        onPartial(merged);
                    }
                } catch (_) {
                }
            }

            if (doneSignal) {
                break;
            }
        }

        if (merged.trim()) {
            if (!response.ok) {
                throw new Error("流式请求失败");
            }
            return merged.trim();
        }

        if (seenSse && !merged.trim()) {
            if (!response.ok) {
                throw new Error("流式请求失败");
            }
            throw new Error("AI 未返回摘要内容");
        }

        var fallbackPayload = null;
        try {
            fallbackPayload = JSON.parse(raw || "{}");
        } catch (_) {
            fallbackPayload = null;
        }

        if (!response.ok) {
            throw new Error(getErrorMessage(fallbackPayload, response.statusText));
        }

        var fallbackSummary = extractSummaryFromPayload(fallbackPayload);
        if (!fallbackSummary) {
            throw new Error("AI 未返回摘要内容");
        }
        return fallbackSummary;
    };

    var bindSummaryInteraction = function (summaryCard, summaryTitle, summaryContentWrap, summaryContent, summaryCursor) {
        if (summaryCard.dataset.aiSummaryBound === "1") {
            return;
        }
        summaryCard.dataset.aiSummaryBound = "1";

        var endpoint = toEndpoint(runtimeConfig.apiUrl);
        var running = false;
        var hasSummary = false;
        var typewriter = null;

        var setCardClasses = function (state) {
            summaryCard.classList.remove("is-idle", "is-generating", "is-streaming", "is-typing", "is-error");
            if (state) {
                summaryCard.classList.add(state);
            }
        };

        var showIdle = function () {
            hasSummary = false;
            setCardClasses("is-idle");
            summaryCard.classList.remove("has-summary");
            summaryCard.classList.add("is-collapsed");
            summaryTitle.textContent = "此方给你来生成一个摘要";
            summaryContentWrap.hidden = true;
            summaryContent.innerHTML = "";
            summaryCard.setAttribute("aria-expanded", "false");
            summaryCard.setAttribute("aria-label", "点击生成 AI 摘要");
        };

        var showGenerating = function () {
            setCardClasses("is-generating");
            summaryCard.classList.add("is-streaming");
            summaryCard.classList.remove("has-summary", "is-collapsed");
            summaryTitle.textContent = "此方祈祷中";
            summaryContentWrap.hidden = false;
            summaryCard.setAttribute("aria-expanded", "true");
            summaryCard.setAttribute("aria-label", "正在生成 AI 摘要");
        };

        var showSummary = function (markdownText, collapsedByDefault) {
            hasSummary = true;
            setCardClasses("");
            summaryCard.classList.add("has-summary");
            if (collapsedByDefault) {
                summaryCard.classList.add("is-collapsed");
            } else {
                summaryCard.classList.remove("is-collapsed");
            }
            summaryTitle.textContent = "此方的摘要";
            summaryContentWrap.hidden = false;
            summaryContent.innerHTML = markdownToHtml(markdownText);
            summaryCard.setAttribute("aria-expanded", collapsedByDefault ? "false" : "true");
            summaryCard.setAttribute("aria-label", "点击折叠或展开 AI 摘要");
        };

        var showError = function (text) {
            hasSummary = false;
            setCardClasses("is-error");
            summaryCard.classList.remove("has-summary", "is-collapsed");
            summaryTitle.textContent = "此方祈祷失败了";
            summaryContentWrap.hidden = false;
            summaryContent.textContent = text;
            summaryCard.setAttribute("aria-expanded", "true");
            summaryCard.setAttribute("aria-label", "点击重试生成 AI 摘要");
        };

        var toggleCollapse = function () {
            if (!hasSummary || running) {
                return;
            }

            if (summaryCard.classList.contains("is-collapsed")) {
                summaryCard.classList.remove("is-collapsed");
                summaryCard.setAttribute("aria-expanded", "true");
                return;
            }

            summaryCard.classList.add("is-collapsed");
            summaryCard.setAttribute("aria-expanded", "false");
        };

        var startGeneration = async function () {
            if (running) {
                return;
            }

            if (!runtimeConfig.apiKey || !endpoint || !runtimeConfig.model) {
                showError("AI Summary 配置缺失，请检查 Hexo _config.yml 的 ai_summary");
                return;
            }

            var cachedSummary = readCache();
            if (cachedSummary) {
                showSummary(cachedSummary, false);
                return;
            }

            var articleText = getArticleText();
            if (!articleText) {
                showError("未找到可摘要的正文内容");
                return;
            }

            running = true;
            showGenerating();
            summaryContent.textContent = "";

            typewriter = createTypewriter(
                function (partialText) {
                    summaryContent.innerHTML = markdownToHtml(partialText);
                },
                function (typingActive) {
                    if (typingActive) {
                        summaryCard.classList.add("is-typing");
                        return;
                    }
                    summaryCard.classList.remove("is-typing");
                }
            );

            try {
                var summary = await requestSummary(endpoint, articleText, function (partialText) {
                    if (typewriter) {
                        typewriter.push(partialText);
                    }
                });

                if (typewriter) {
                    await typewriter.complete(summary);
                }

                writeCache(summary);
                showSummary(summary, false);
            } catch (error) {
                if (typewriter) {
                    typewriter.cancel();
                }
                showError("AI 摘要生成失败: " + (error && error.message ? error.message : "unknown"));
            } finally {
                running = false;
                typewriter = null;
                summaryCard.classList.remove("is-streaming", "is-typing", "is-generating");
                if (summaryCursor) {
                    summaryCursor.style.display = "";
                }
            }
        };

        summaryCard.addEventListener("click", function (event) {
            if (event.target && event.target.closest("a")) {
                return;
            }

            if (hasSummary) {
                toggleCollapse();
                return;
            }

            startGeneration();
        });

        summaryCard.addEventListener("keydown", function (event) {
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }
            event.preventDefault();

            if (hasSummary) {
                toggleCollapse();
                return;
            }

            startGeneration();
        });

        var cachedOnLoad = readCache();
        if (cachedOnLoad) {
            showSummary(cachedOnLoad, true);
            return;
        }
        showIdle();
    };

    var mountAiSummary = function () {
        var articleContainer = document.getElementById("article-container");
        if (!articleContainer) {
            return;
        }

        var currentRoute = String(window.location.pathname || "") + String(window.location.search || "");
        var summaryEntry = document.getElementById("ai-summary-entry");

        if (summaryEntry && summaryEntry.dataset.aiSummaryRoute !== currentRoute) {
            summaryEntry.remove();
            summaryEntry = null;
        }

        if (!summaryEntry) {
            articleContainer.insertAdjacentHTML("afterbegin", aiSummaryMarkup);
            summaryEntry = document.getElementById("ai-summary-entry");
            if (!summaryEntry) {
                return;
            }
            summaryEntry.dataset.aiSummaryRoute = currentRoute;
        }

        var summaryCard = document.getElementById("ai-summary-card");
        var summaryTitle = document.getElementById("ai-summary-card-title");
        var summaryContentWrap = document.getElementById("ai-summary-card-content-wrap");
        var summaryContent = document.getElementById("ai-summary-card-content");
        var summaryCursor = document.getElementById("ai-summary-card-cursor");

        if (!summaryCard || !summaryTitle || !summaryContentWrap || !summaryContent || !summaryCursor) {
            return;
        }

        bindSummaryInteraction(summaryCard, summaryTitle, summaryContentWrap, summaryContent, summaryCursor);
    };

    var scheduleMount = function () {
        if (mountTimer) {
            window.clearTimeout(mountTimer);
        }
        mountTimer = window.setTimeout(function () {
            mountAiSummary();
        }, 32);
    };

    var patchHistory = function () {
        if (window.__HEXO_AI_SUMMARY_HISTORY_PATCHED__) {
            return;
        }
        window.__HEXO_AI_SUMMARY_HISTORY_PATCHED__ = true;

        var rawPushState = window.history.pushState;
        var rawReplaceState = window.history.replaceState;

        window.history.pushState = function () {
            var result = rawPushState.apply(window.history, arguments);
            window.dispatchEvent(new Event("hexo-ai-summary:navigate"));
            return result;
        };

        window.history.replaceState = function () {
            var result = rawReplaceState.apply(window.history, arguments);
            window.dispatchEvent(new Event("hexo-ai-summary:navigate"));
            return result;
        };
    };

    var bindNavigationListeners = function () {
        var events = [
            "load",
            "pageshow",
            "popstate",
            "hashchange",
            "pjax:complete",
            "pjax:end",
            "pjax:success",
            "turbolinks:load",
            "swup:contentReplaced",
            "hexo-ai-summary:navigate"
        ];

        for (var i = 0; i < events.length; i += 1) {
            window.addEventListener(events[i], scheduleMount);
        }

        if (window.MutationObserver && document.body) {
            var observer = new MutationObserver(function () {
                scheduleMount();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        routeCheckTimer = window.setInterval(function () {
            var currentRoute = String(window.location.pathname || "") + String(window.location.search || "");
            if (currentRoute !== routeFingerprint) {
                routeFingerprint = currentRoute;
                scheduleMount();
            }
        }, 400);
    };

    patchHistory();
    bindNavigationListeners();
    scheduleMount();
})();
