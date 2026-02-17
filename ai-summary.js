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

    var roleName = typeof runtimeConfig.roleName === "string" && runtimeConfig.roleName.trim()
        ? runtimeConfig.roleName.trim()
        : "技术助手";
    var roleContent = typeof runtimeConfig.roleContent === "string" ? runtimeConfig.roleContent.trim() : "";

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
        var inlineCodes = [];

        output = output.replace(/`([^`\n]+)`/g, function (_, codeText) {
            var token = "%%AI_SUMMARY_INLINE_CODE_" + inlineCodes.length + "%%";
            inlineCodes.push(codeText);
            return token;
        });

        output = output.replace(/!\[([^\]]*)\]\(((?:https?:\/\/|\/|\.\/|\.\.\/)[^\s)]+)\)/g, function (_, alt, imageUrl) {
            return "<a class=\"ai-summary-card__image-link\" href=\"" + imageUrl + "\" target=\"_blank\" rel=\"noopener noreferrer\"><img src=\""
                + imageUrl + "\" alt=\"" + alt + "\" loading=\"lazy\" decoding=\"async\"></a>";
        });

        output = output.replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/|\.\/|\.\.\/)[^\s)]+)\)/g, function (_, label, link) {
            return "<a href=\"" + link + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + label + "</a>";
        });
        output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
        output = output.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

        output = output.replace(/%%AI_SUMMARY_INLINE_CODE_(\d+)%%/g, function (_, index) {
            return "<code>" + (inlineCodes[Number(index)] || "") + "</code>";
        });

        return output;
    };

    var markdownToHtml = function (markdown) {
        var normalized = escapeHtml(markdown).replace(/\r\n?/g, "\n");
        var codeBlocks = [];

        var splitTableCells = function (line) {
            var normalizedLine = String(line || "").trim();
            if (!normalizedLine) {
                return [];
            }
            if (normalizedLine.charAt(0) === "|") {
                normalizedLine = normalizedLine.slice(1);
            }
            if (normalizedLine.charAt(normalizedLine.length - 1) === "|") {
                normalizedLine = normalizedLine.slice(0, -1);
            }
            return normalizedLine.split("|").map(function (cell) {
                return cell.trim();
            });
        };

        var isTableDividerRow = function (cells) {
            if (!cells || !cells.length) {
                return false;
            }
            return cells.every(function (cell) {
                var normalizedCell = String(cell || "").replace(/\s+/g, "");
                return /^:?-{3,}:?$/.test(normalizedCell);
            });
        };

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

            var normalizedRule = blockText.trim();
            if (/^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(normalizedRule)) {
                return "<hr>";
            }

            var lines = blockText.split("\n");
            if (lines.length >= 2 && lines[0].indexOf("|") !== -1 && lines[1].indexOf("|") !== -1) {
                var headerCells = splitTableCells(lines[0]);
                var dividerCells = splitTableCells(lines[1]);

                if (headerCells.length > 0
                    && headerCells.length === dividerCells.length
                    && isTableDividerRow(dividerCells)) {
                    var bodyRows = [];

                    for (var rowIndex = 2; rowIndex < lines.length; rowIndex += 1) {
                        var rowText = lines[rowIndex].trim();
                        if (!rowText) {
                            continue;
                        }

                        var rowCells = splitTableCells(rowText);
                        if (!rowCells.length) {
                            continue;
                        }

                        if (rowCells.length < headerCells.length) {
                            rowCells = rowCells.concat(new Array(headerCells.length - rowCells.length).fill(""));
                        }
                        if (rowCells.length > headerCells.length) {
                            rowCells = rowCells.slice(0, headerCells.length);
                        }
                        bodyRows.push(rowCells);
                    }

                    var tableHead = "<thead><tr>" + headerCells.map(function (cell) {
                        return "<th>" + renderInlineMarkdown(cell) + "</th>";
                    }).join("") + "</tr></thead>";

                    var tableBody = bodyRows.length
                        ? "<tbody>" + bodyRows.map(function (rowCells) {
                            return "<tr>" + rowCells.map(function (cell) {
                                return "<td>" + renderInlineMarkdown(cell) + "</td>";
                            }).join("") + "</tr>";
                        }).join("") + "</tbody>"
                        : "";

                    return "<table>" + tableHead + tableBody + "</table>";
                }
            }

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
            var expired = Date.now() - parsed.createdAt > cacheTtlMs;
            return {
                summary: parsed.summary,
                createdAt: parsed.createdAt,
                expired: expired
            };
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
        var baseSystemPrompt = [
            "你是一个严谨、专业的技术文章摘要助手。",
            "请使用简体中文输出摘要。",
            "摘要总长度不要超过 " + runtimeConfig.maxSummaryLength + " 个字符。",
            "不要输出 Markdown 标题（例如 #、## 等标题类）和任何 HTML 标签。",
            "可以使用简洁的 Markdown 标记，例如加粗、列表、行内代码、代码块、表格。",
            "内容必须准确，优先保留核心结论、关键术语与可执行信息。"
        ].join("\n");

        var systemPrompt = roleContent
            ? baseSystemPrompt
                + "\n\n附加角色设定（role_name: " + roleName + "）：\n"
                + roleContent
                + "\n\n请在保持技术准确性的前提下，适度体现该附加角色的语言风格。"
            : baseSystemPrompt;

        const response = await window.fetch(endpoint, {
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
                        content: systemPrompt
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

    var bindSummaryInteraction = function (
        summaryCard,
        summaryHeader,
        summaryTitle,
        summaryContentWrap,
        summaryMeta,
        summaryContent,
        summaryCursor,
        regenerateButton
    ) {
        if (summaryCard.dataset.aiSummaryBound === "1") {
            return;
        }
        summaryCard.dataset.aiSummaryBound = "1";

        var endpoint = toEndpoint(runtimeConfig.apiUrl);
        var running = false;
        var hasSummary = false;
        var typewriter = null;
        var pendingTypewriterText = "";
        var shouldTypewriterOnExpand = false;

        var setHeaderState = function (expanded, label) {
            if (!summaryHeader) {
                return;
            }
            summaryHeader.setAttribute("aria-expanded", expanded ? "true" : "false");
            summaryHeader.setAttribute("aria-label", label);
        };

        var setCacheMeta = function (showCacheMeta) {
            if (!summaryMeta) {
                return;
            }
            if (!showCacheMeta) {
                summaryMeta.hidden = true;
                summaryMeta.textContent = "";
                return;
            }
            summaryMeta.hidden = false;
            summaryMeta.textContent = "【数据来源：缓存】";
        };

        var setRegenerateVisible = function (visible) {
            summaryCard.classList.remove("show-regenerate");
            if (visible) {
                summaryCard.classList.add("show-regenerate");
            }
        };

        var renderWithTypewriter = function (markdownText) {
            if (typewriter) {
                typewriter.cancel();
                typewriter = null;
            }

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

            typewriter.push(markdownText);
            return typewriter.complete(markdownText);
        };

        var setCardClasses = function (state) {
            summaryCard.classList.remove("is-idle", "is-generating", "is-streaming", "is-typing", "is-error");
            if (state) {
                summaryCard.classList.add(state);
            }
        };

        var showIdle = function () {
            hasSummary = false;
            pendingTypewriterText = "";
            shouldTypewriterOnExpand = false;
            setCardClasses("is-idle");
            summaryCard.classList.remove("has-summary");
            summaryCard.classList.add("is-collapsed");
            summaryTitle.textContent = roleName + "给你来生成一个摘要";
            summaryContentWrap.hidden = true;
            summaryContent.innerHTML = "";
            setCacheMeta(false);
            setRegenerateVisible(false);
            setHeaderState(false, "点击生成 AI 摘要");
        };

        var showGenerating = function () {
            pendingTypewriterText = "";
            shouldTypewriterOnExpand = false;
            setCardClasses("is-generating");
            summaryCard.classList.add("is-streaming");
            summaryCard.classList.remove("has-summary", "is-collapsed");
            summaryTitle.textContent = roleName + "思考中";
            summaryContentWrap.hidden = false;
            setCacheMeta(false);
            setRegenerateVisible(false);
            setHeaderState(true, "正在生成 AI 摘要");
        };

        var showSummary = function (markdownText, options) {
            var view = options || {};
            var collapsedByDefault = Boolean(view.collapsedByDefault);
            var fromCache = Boolean(view.fromCache);
            var expired = Boolean(view.expired);
            var useTypewriter = Boolean(view.useTypewriter);

            hasSummary = true;
            setCardClasses("");
            summaryCard.classList.add("has-summary");
            if (collapsedByDefault) {
                summaryCard.classList.add("is-collapsed");
            } else {
                summaryCard.classList.remove("is-collapsed");
            }
            summaryTitle.textContent = roleName + "的摘要";
            summaryContentWrap.hidden = false;
            setCacheMeta(fromCache);
            setRegenerateVisible(expired);
            setHeaderState(!collapsedByDefault, "点击折叠或展开 AI 摘要");

            pendingTypewriterText = "";
            shouldTypewriterOnExpand = false;

            if (useTypewriter && collapsedByDefault) {
                summaryContent.innerHTML = "";
                pendingTypewriterText = markdownText;
                shouldTypewriterOnExpand = true;
                return Promise.resolve();
            }

            if (useTypewriter) {
                return renderWithTypewriter(markdownText);
            }

            summaryContent.innerHTML = markdownToHtml(markdownText);
            return Promise.resolve();
        };

        var showError = function (text) {
            hasSummary = false;
            pendingTypewriterText = "";
            shouldTypewriterOnExpand = false;
            setCardClasses("is-error");
            summaryCard.classList.remove("has-summary", "is-collapsed");
            summaryTitle.textContent = roleName + "生成失败了";
            summaryContentWrap.hidden = false;
            summaryContent.textContent = text;
            setCacheMeta(false);
            setRegenerateVisible(false);
            setHeaderState(true, "点击重试生成 AI 摘要");
        };

        var toggleCollapse = function () {
            if (!hasSummary || running || summaryCard.classList.contains("is-typing")) {
                return;
            }

            if (summaryCard.classList.contains("is-collapsed")) {
                summaryCard.classList.remove("is-collapsed");
                setHeaderState(true, "点击折叠或展开 AI 摘要");

                if (shouldTypewriterOnExpand && pendingTypewriterText) {
                    var textToRender = pendingTypewriterText;
                    pendingTypewriterText = "";
                    shouldTypewriterOnExpand = false;
                    renderWithTypewriter(textToRender);
                }
                return;
            }

            summaryCard.classList.add("is-collapsed");
            setHeaderState(false, "点击折叠或展开 AI 摘要");
        };

        var startGeneration = async function (forceRefresh) {
            if (running) {
                return;
            }

            if (!runtimeConfig.apiKey || !endpoint || !runtimeConfig.model) {
                showError("AI Summary 配置缺失，请检查 Hexo _config.yml 的 ai_summary");
                return;
            }

            var cachedPayload = readCache();
            if (cachedPayload && !forceRefresh && !cachedPayload.expired) {
                await showSummary(cachedPayload.summary, {
                    collapsedByDefault: false,
                    fromCache: true,
                    expired: false,
                    useTypewriter: true
                });
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
                await showSummary(summary, {
                    collapsedByDefault: false,
                    fromCache: false,
                    expired: false,
                    useTypewriter: false
                });
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

        if (regenerateButton) {
            regenerateButton.addEventListener("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                if (!summaryCard.classList.contains("show-regenerate")) {
                    return;
                }
                startGeneration(true);
            });
        }

        summaryHeader.addEventListener("click", function (event) {
            if (event.target && (event.target.closest("a") || event.target.closest("button"))) {
                return;
            }

            if (hasSummary) {
                toggleCollapse();
                return;
            }

            startGeneration(false);
        });

        summaryHeader.addEventListener("keydown", function (event) {
            if (event.target && event.target.closest("button")) {
                return;
            }
            if (event.key !== "Enter" && event.key !== " ") {
                return;
            }
            event.preventDefault();

            if (hasSummary) {
                toggleCollapse();
                return;
            }

            startGeneration(false);
        });

        var cachedOnLoad = readCache();
        if (cachedOnLoad) {
            showSummary(cachedOnLoad.summary, {
                collapsedByDefault: true,
                fromCache: true,
                expired: cachedOnLoad.expired,
                useTypewriter: true
            });
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
        var summaryHeader = document.getElementById("ai-summary-card-header");
        var summaryTitle = document.getElementById("ai-summary-card-title");
        var summaryContentWrap = document.getElementById("ai-summary-card-content-wrap");
        var summaryMeta = document.getElementById("ai-summary-card-meta");
        var summaryContent = document.getElementById("ai-summary-card-content");
        var summaryCursor = document.getElementById("ai-summary-card-cursor");
        var regenerateButton = document.getElementById("ai-summary-card-regenerate");

        if (!summaryCard || !summaryHeader || !summaryTitle || !summaryContentWrap || !summaryMeta || !summaryContent || !summaryCursor || !regenerateButton) {
            return;
        }

        bindSummaryInteraction(
            summaryCard,
            summaryHeader,
            summaryTitle,
            summaryContentWrap,
            summaryMeta,
            summaryContent,
            summaryCursor,
            regenerateButton
        );
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
