/**
 * Rescue Proxy 前端扩展
 * 
 * 功能：配置 API 代理设置，并在请求时注入聊天上下文
 */

const MODULE_NAME = 'rescue_proxy_ui';
const PLUGIN_API_BASE = '/api/plugins/rescue-proxy';
const PROXY_PORT = 5501;

// 日志显示状态
const PAGE_SIZE = 20;
const INITIAL_PAGES = 4;
let displayedLogs = [];
let currentPage = 0;
let totalHistoryLogs = 0;   // 历史日志总数
let hasMoreHistory = false; // 是否有更多历史日志

// 终端日志状态
let consoleLogs = [];
let consoleFollowInterval = null;
let lastConsoleTimestamp = 0;
const frontendLogBuffer = [];  // 前端日志缓冲区

// 拦截前端 console 收集日志
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function collectFrontendLog(level, args) {
    // 只收集插件相关的日志
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    if (message.includes('[RescueProxy')) {
        frontendLogBuffer.push({
            timestamp: Date.now(),
            level,
            message
        });
    }
}

console.log = function (...args) {
    collectFrontendLog('log', args);
    originalConsoleLog.apply(console, args);
};

console.error = function (...args) {
    collectFrontendLog('error', args);
    originalConsoleError.apply(console, args);
};

console.warn = function (...args) {
    collectFrontendLog('warn', args);
    originalConsoleWarn.apply(console, args);
};

/**
 * 获取当前聊天上下文
 * @returns {Object|null}
 */
function getCurrentChatContext() {
    const context = SillyTavern.getContext();
    const { characters, characterId, groupId, groups, chatMetadata } = context;

    if (groupId) {
        const group = groups.find(g => g.id === groupId);
        return {
            isGroup: true,
            groupId: groupId,
            characterName: group?.name || 'Group',
            chatFileName: chatMetadata?.file_name || groupId,
        };
    } else if (characterId !== undefined && characters[characterId]) {
        const character = characters[characterId];
        return {
            isGroup: false,
            characterName: character.name,
            avatarUrl: character.avatar,
            chatFileName: character.chat || '',
        };
    }

    return null;
}

/**
 * 更新连接状态显示
 * @param {boolean} connected 
 * @param {number} port
 */
function updateStatus(connected, port = PROXY_PORT) {
    const statusEl = document.getElementById('rescue_proxy_status');
    const textEl = statusEl?.querySelector('.rescue-proxy-status-text');

    if (statusEl) {
        statusEl.className = `rescue-proxy-status ${connected ? 'connected' : 'disconnected'}`;
    }
    if (textEl) {
        textEl.textContent = connected ? `已连接 (端口 ${port})` : '未连接';
    }
}

/**
 * 加载设置
 */
async function loadSettings() {
    try {
        const context = SillyTavern.getContext();
        const response = await fetch(`${PLUGIN_API_BASE}/settings`, {
            headers: context.getRequestHeaders(),
        });

        if (response.ok) {
            const data = await response.json();
            $('#rescue_proxy_api_url').val(data.realApiUrl || '');
            $('#rescue_proxy_api_key').val(data.realApiKey || '');
            // 更新端口和端点显示
            const port = data.proxyPort || PROXY_PORT;
            $('#rescue_proxy_port').val(port);
            $('#rescue_proxy_endpoint').text(`http://127.0.0.1:${port}/v1`);
            // 更新代理 API Key
            $('#rescue_proxy_proxy_api_key').val(data.proxyApiKey || '');
            updateStatus(true, port);
        } else {
            updateStatus(false);
        }
    } catch (error) {
        console.error('[RescueProxyUI] 加载设置失败:', error);
        updateStatus(false);
    }
}

/**
 * 加载可用配置列表
 */
async function loadAvailableProfiles() {
    try {
        const context = SillyTavern.getContext();
        const response = await fetch(`${PLUGIN_API_BASE}/available-profiles`, {
            headers: context.getRequestHeaders(),
        });

        if (response.ok) {
            const data = await response.json();
            const selectEl = $('#rescue_proxy_import_profile');
            selectEl.empty();
            selectEl.append('<option value="">-- 选择配置 --</option>');

            for (const profile of data.profiles || []) {
                const displayName = profile.name || '未命名配置';
                const hint = profile.model ? ` (${profile.model})` : '';
                selectEl.append(`<option value="${profile.id}">${displayName}${hint}</option>`);
            }

            console.log(`[RescueProxyUI] 已加载 ${data.profiles?.length || 0} 个可用配置`);
        }
    } catch (error) {
        console.error('[RescueProxyUI] 加载可用配置失败:', error);
    }
}

/**
 * 导入选中的配置
 */
async function importProfile() {
    const context = SillyTavern.getContext();
    const profileId = $('#rescue_proxy_import_profile').val();

    if (!profileId) {
        // @ts-ignore
        toastr.warning('请先选择要导入的配置', 'Rescue Proxy');
        return;
    }

    try {
        const response = await fetch(`${PLUGIN_API_BASE}/import-profile`, {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({ profileId }),
        });

        if (response.ok) {
            const data = await response.json();
            // @ts-ignore
            toastr.success(`已导入配置: ${data.imported.profileName}`, 'Rescue Proxy');
            // 重新加载设置以更新 UI
            await loadSettings();
        } else {
            const error = await response.json();
            throw new Error(error.error || '导入失败');
        }
    } catch (error) {
        console.error('[RescueProxyUI] 导入配置失败:', error);
        // @ts-ignore
        toastr.error('导入配置失败', 'Rescue Proxy');
    }
}

/**
 * 保存设置
 */
async function saveSettings() {
    const context = SillyTavern.getContext();
    const apiUrl = $('#rescue_proxy_api_url').val();
    const apiKey = $('#rescue_proxy_api_key').val();
    const proxyPort = $('#rescue_proxy_port').val();
    const proxyApiKey = $('#rescue_proxy_proxy_api_key').val();

    try {
        const response = await fetch(`${PLUGIN_API_BASE}/settings`, {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({
                realApiUrl: apiUrl,
                realApiKey: apiKey || undefined,
                proxyPort: proxyPort ? parseInt(String(proxyPort), 10) : undefined,
                proxyApiKey: proxyApiKey || undefined,
            }),
        });

        if (response.ok) {
            const data = await response.json();
            // @ts-ignore
            toastr.success('设置已保存', 'Rescue Proxy');
            if (data.portChanged) {
                // @ts-ignore
                toastr.warning('端口已更改，请重启 SillyTavern 以应用新端口', 'Rescue Proxy');
            }
            // 更新显示的端点
            const port = proxyPort || PROXY_PORT;
            $('#rescue_proxy_endpoint').text(`http://127.0.0.1:${port}/v1`);
        } else {
            throw new Error('保存失败');
        }
    } catch (error) {
        console.error('[RescueProxyUI] 保存设置失败:', error);
        // @ts-ignore
        toastr.error('保存失败', 'Rescue Proxy');
    }
}

/**
 * 测试连接（测试独立代理服务器）
 */
async function testConnection() {
    const resultEl = document.getElementById('rescue_proxy_test_result');
    resultEl.textContent = '测试中...';

    try {
        const response = await fetch(`http://127.0.0.1:${PROXY_PORT}/health`);
        if (response.ok) {
            const data = await response.json();
            resultEl.innerHTML = `<span style="color: #4ade80;">✓ 代理服务器连接成功 (端口 ${data.port})</span>`;
            updateStatus(true, data.port);
        } else {
            resultEl.innerHTML = `<span style="color: #f87171;">✗ 连接失败: HTTP ${response.status}</span>`;
            updateStatus(false);
        }
    } catch (error) {
        resultEl.innerHTML = `<span style="color: #f87171;">✗ 代理服务器未运行或无法连接</span>`;
        updateStatus(false);
    }
}

/**
 * 检查 GitHub 更新
 */
async function checkUpdate() {
    const context = SillyTavern.getContext();
    const resultEl = document.getElementById('rescue_proxy_update_result');
    const versionEl = document.getElementById('rescue_proxy_version_info');

    resultEl.textContent = '检查中...';
    versionEl.textContent = '';

    try {
        const response = await fetch(`${PLUGIN_API_BASE}/check-update`, {
            headers: context.getRequestHeaders(),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || '检查失败');
        }

        const data = await response.json();

        // 构建显示内容
        let html = '';

        for (const repo of data.repos || []) {
            const localInfo = repo.localCommit || repo.localVersion || '未知';
            const remoteInfo = repo.latestCommit || '未知';

            html += `<div style="margin-bottom: 12px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 4px;">`;
            html += `<div style="font-weight: bold; margin-bottom: 4px;">${repo.name}</div>`;
            html += `<div style="font-size: 0.85em; color: #888;">本地: ${localInfo} | 远程: ${remoteInfo}</div>`;

            if (repo.hasUpdate) {
                html += `<div style="color: #fbbf24; margin-top: 4px;">🆕 有更新可用</div>`;
                html += `<div style="font-size: 0.85em; color: #888; margin-top: 2px;">${repo.latestMessage}</div>`;
                html += `<a href="${repo.repoUrl}" target="_blank" style="color: #60a5fa; font-size: 0.85em;">前往 GitHub →</a>`;
            } else if (repo.localCommit) {
                html += `<div style="color: #4ade80; margin-top: 4px;">✓ 已是最新</div>`;
            } else {
                html += `<div style="color: #888; margin-top: 4px;">无法确定版本</div>`;
                html += `<a href="${repo.repoUrl}" target="_blank" style="color: #60a5fa; font-size: 0.85em;">查看仓库 →</a>`;
            }

            html += `</div>`;
        }

        resultEl.innerHTML = html;

        if (data.hasAnyUpdate) {
            // @ts-ignore
            toastr.info('发现新版本可用', 'Rescue Proxy');
        }
    } catch (error) {
        console.error('[RescueProxyUI] 检查更新失败:', error);
        resultEl.innerHTML = `<span style="color: #f87171;">✗ ${error.message}</span>`;
    }
}

/**
 * 注册用户上下文到服务端
 */
async function registerContext() {
    try {
        const context = SillyTavern.getContext();
        await fetch(`${PLUGIN_API_BASE}/register-context`, {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({}),
        });
        console.log('[RescueProxyUI] 用户上下文已注册');
    } catch (error) {
        console.error('[RescueProxyUI] 注册上下文失败:', error);
    }
}

/**
 * 加载日志（pending + 历史）
 * @param {boolean} loadMore - 是否加载更多（追加而非替换）
 */
async function loadLogs(loadMore = false) {
    try {
        const context = SillyTavern.getContext();

        // 获取 pending 日志
        const pendingRes = await fetch(`${PLUGIN_API_BASE}/request-logs`, {
            headers: context.getRequestHeaders(),
        });
        const pendingData = await pendingRes.json();
        const pendingLogs = pendingData.logs || [];

        // 计算要获取的历史日志数量
        const currentHistoryCount = loadMore ? (displayedLogs.length - pendingLogs.length) : 0;
        const offset = loadMore ? currentHistoryCount : 0;
        const limit = loadMore ? PAGE_SIZE : (INITIAL_PAGES * PAGE_SIZE);

        // 获取历史日志
        const historyRes = await fetch(`${PLUGIN_API_BASE}/history-logs?offset=${offset}&limit=${limit}`, {
            headers: context.getRequestHeaders(),
        });
        const historyData = await historyRes.json();
        const historyLogs = historyData.logs || [];
        totalHistoryLogs = historyData.total || 0;
        hasMoreHistory = historyData.hasMore || false;

        if (loadMore) {
            // 追加历史日志
            displayedLogs = [...pendingLogs, ...displayedLogs.slice(pendingLogs.length), ...historyLogs];
        } else {
            // 替换全部
            displayedLogs = [...pendingLogs, ...historyLogs];
            currentPage = 0;
        }

        renderLogs();
    } catch (error) {
        console.error('[RescueProxyUI] 加载日志失败:', error);
    }
}

/**
 * 清理日志显示
 */
function clearLogs() {
    displayedLogs = [];
    renderLogs();
    // @ts-ignore
    toastr.success('显示已清理', 'Rescue Proxy');
}

/**
 * 清空历史记录（永久删除日志文件）
 */
async function deleteHistory() {
    // @ts-ignore
    if (!confirm('确定要永久删除所有历史记录吗？此操作不可恢复。')) {
        return;
    }

    try {
        const context = SillyTavern.getContext();
        await fetch(`${PLUGIN_API_BASE}/clear-logs`, {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({}),
        });

        await loadLogs();
        // @ts-ignore
        toastr.success('历史记录已清空', 'Rescue Proxy');
    } catch (error) {
        console.error('[RescueProxyUI] 清空历史记录失败:', error);
    }
}

/**
 * 渲染日志列表（分页显示）
 */
function renderLogs() {
    const container = $('#rescue_proxy_logs_container');
    const infoEl = $('#rescue_proxy_logs_info');

    if (!displayedLogs || displayedLogs.length === 0) {
        container.html('<div class="rescue-proxy-logs-empty">暂无请求记录</div>');
        infoEl.text('');
        return;
    }

    // 计算分页
    const totalPages = Math.ceil(displayedLogs.length / PAGE_SIZE);
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;

    const startIdx = currentPage * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, displayedLogs.length);
    const pageLogs = displayedLogs.slice(startIdx, endIdx);

    const html = pageLogs.map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const responseTime = log.responseTime ? `${(log.responseTime / 1000).toFixed(1)}s` : '-';
        const statusText = log.status === 'success' ? '成功' : log.status === 'error' ? '失败' : '进行中';

        return `
            <div class="rescue-proxy-log-item">
                <span class="rescue-proxy-log-time">${time}</span>
                <span class="rescue-proxy-log-model" title="${log.model}">${log.model}</span>
                <span class="rescue-proxy-log-character" title="${log.character}">${log.character}</span>
                <span class="rescue-proxy-log-time-value">${responseTime}</span>
                <span class="rescue-proxy-log-status ${log.status}">${statusText}</span>
            </div>
        `;
    }).join('');

    container.html(html);

    // 显示分页信息
    const pendingCount = displayedLogs.filter(l => l.status === 'pending').length;
    let info = `第 ${currentPage + 1}/${totalPages} 页，已加载 ${displayedLogs.length}/${totalHistoryLogs + pendingCount} 条`;
    if (pendingCount > 0) info += `（${pendingCount} 个进行中）`;

    infoEl.html(`
        <span>${info}</span>
        <span class="rescue-proxy-pagination">
            <button class="menu_button rescue-proxy-page-btn" ${currentPage === 0 ? 'disabled' : ''} onclick="window.rescueProxyPrevPage()">上一页</button>
            <button class="menu_button rescue-proxy-page-btn" ${currentPage >= totalPages - 1 ? 'disabled' : ''} onclick="window.rescueProxyNextPage()">下一页</button>
            ${hasMoreHistory ? '<button class="menu_button rescue-proxy-page-btn" onclick="window.rescueProxyShowMore()">显示更多</button>' : ''}
        </span>
    `);
}

// 暴露翻页函数到全局
// @ts-ignore
window.rescueProxyPrevPage = function () {
    if (currentPage > 0) {
        currentPage--;
        renderLogs();
    }
};

// @ts-ignore
window.rescueProxyNextPage = function () {
    const totalPages = Math.ceil(displayedLogs.length / PAGE_SIZE);
    if (currentPage < totalPages - 1) {
        currentPage++;
        renderLogs();
    }
};

// @ts-ignore
window.rescueProxyShowMore = function () {
    loadLogs(true);
};

/**
 * 加载终端日志
 */
async function loadConsoleLogs(since = 0) {
    try {
        const context = SillyTavern.getContext();

        // 先上传前端日志
        if (frontendLogBuffer.length > 0) {
            await fetch(`${PLUGIN_API_BASE}/console-logs`, {
                method: 'POST',
                headers: {
                    ...context.getRequestHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ logs: frontendLogBuffer })
            });
            frontendLogBuffer.length = 0;
        }

        // 获取所有日志
        const res = await fetch(`${PLUGIN_API_BASE}/console-logs?since=${since}`, {
            headers: context.getRequestHeaders(),
        });
        const data = await res.json();
        const newLogs = data.logs || [];

        if (since > 0) {
            // 追加模式
            consoleLogs = [...consoleLogs, ...newLogs];
            // 限制显示数量
            if (consoleLogs.length > 500) {
                consoleLogs = consoleLogs.slice(-500);
            }
        } else {
            // 刷新模式 - 重置并获取全部
            consoleLogs = newLogs;
            lastConsoleTimestamp = 0;
        }

        // 更新时间戳
        if (consoleLogs.length > 0) {
            lastConsoleTimestamp = consoleLogs[consoleLogs.length - 1].timestamp;
        }

        renderConsoleLogs();
    } catch (error) {
        console.error('[RescueProxyUI] 加载终端日志失败:', error);
    }
}

/**
 * 渲染终端日志
 */
function renderConsoleLogs() {
    const container = $('#rescue_proxy_console_container');

    if (!consoleLogs || consoleLogs.length === 0) {
        container.html('<div class="rescue-proxy-console-empty">暂无终端日志</div>');
        return;
    }

    const html = consoleLogs.map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        const sourceLabel = log.source === 'backend' ? '后端' : '前端';
        const levelLabel = log.level === 'error' ? 'ERR' : log.level === 'warn' ? 'WARN' : 'LOG';

        return `
            <div class="rescue-proxy-console-item">
                <span class="rescue-proxy-console-time">${time}</span>
                <span class="rescue-proxy-console-source ${log.source}">${sourceLabel}</span>
                <span class="rescue-proxy-console-level ${log.level}">${levelLabel}</span>
                <span class="rescue-proxy-console-message">${escapeHtml(log.message)}</span>
            </div>
        `;
    }).join('');

    container.html(html);

    // 如果开启追踪，滚动到底部
    if ($('#rescue_proxy_console_follow').is(':checked')) {
        container.scrollTop(container[0].scrollHeight);
    }
}

/**
 * 清理终端日志显示
 */
function clearConsoleLogs() {
    consoleLogs = [];
    lastConsoleTimestamp = 0;
    renderConsoleLogs();
}

/**
 * 开始/停止追踪
 */
function toggleConsoleFollow(enable) {
    if (enable) {
        // 每 2 秒刷新一次
        consoleFollowInterval = setInterval(() => {
            loadConsoleLogs(lastConsoleTimestamp);
        }, 2000);
        // 立即加载一次
        loadConsoleLogs(0);
    } else {
        if (consoleFollowInterval) {
            clearInterval(consoleFollowInterval);
            consoleFollowInterval = null;
        }
    }
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 注入聊天上下文到请求 header（用于测试连接等场景）
 */
function setupAjaxPrefilter() {
    $.ajaxPrefilter((options, originalOptions, xhr) => {
        // 处理发往代理服务器的请求
        if (options.url && options.url.includes(`127.0.0.1:${PROXY_PORT}`)) {
            const chatContext = getCurrentChatContext();
            if (chatContext) {
                xhr.setRequestHeader('X-Chat-Context', JSON.stringify(chatContext));
                xhr.setRequestHeader('X-User-Handle', 'default');
                console.log('[RescueProxyUI] 已注入聊天上下文:', chatContext.characterName);
            }
        }
    });

    // 同时拦截 fetch 请求
    const originalFetch = window.fetch;
    window.fetch = function (url, options = {}) {
        if (typeof url === 'string' && url.includes(`127.0.0.1:${PROXY_PORT}`)) {
            const chatContext = getCurrentChatContext();
            if (chatContext) {
                options.headers = options.headers || {};
                if (options.headers instanceof Headers) {
                    options.headers.set('X-Chat-Context', JSON.stringify(chatContext));
                    options.headers.set('X-User-Handle', 'default');
                } else {
                    options.headers['X-Chat-Context'] = JSON.stringify(chatContext);
                    options.headers['X-User-Handle'] = 'default';
                }
                console.log('[RescueProxyUI] (fetch) 已注入聊天上下文:', chatContext.characterName);
            }
        }
        return originalFetch.call(this, url, options);
    };
}

/**
 * 设置聊天上下文到服务端（在发送消息前调用）
 * 用于 SillyTavern 后端发出的请求（不经过浏览器）
 */
async function setChatContext() {
    const chatContext = getCurrentChatContext();
    if (!chatContext) {
        console.warn('[RescueProxyUI] 无法获取聊天上下文');
        return;
    }

    try {
        const context = SillyTavern.getContext();
        await fetch(`${PLUGIN_API_BASE}/set-chat-context`, {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify(chatContext),
        });
        console.log('[RescueProxyUI] 已设置聊天上下文:', chatContext.characterName);
    } catch (error) {
        console.error('[RescueProxyUI] 设置聊天上下文失败:', error);
    }
}

/**
 * 确认已收到消息（通知服务端取消延迟保存）
 */
async function confirmReceived() {
    try {
        const context = SillyTavern.getContext();
        await fetch(`${PLUGIN_API_BASE}/confirm-received`, {
            method: 'POST',
            headers: context.getRequestHeaders(),
            body: JSON.stringify({}),
        });
        console.log('[RescueProxyUI] 已确认收到消息');
    } catch (error) {
        console.error('[RescueProxyUI] 确认收到消息失败:', error);
    }
}

/**
 * 初始化扩展
 */
async function init() {
    console.log('[RescueProxyUI] 初始化中...');

    const context = SillyTavern.getContext();
    const { renderExtensionTemplateAsync, eventSource, event_types } = context;

    // 加载设置面板
    try {
        const settingsHtml = await renderExtensionTemplateAsync(
            'third-party/rescue-proxy-ui',
            'settings'
        );
        $('#extensions_settings').append(settingsHtml);
    } catch (error) {
        console.error('[RescueProxyUI] 加载设置面板失败:', error);
        return;
    }

    // 绑定事件
    $('#rescue_proxy_save_settings').on('click', saveSettings);
    $('#rescue_proxy_test').on('click', testConnection);
    $('#rescue_proxy_import_btn').on('click', importProfile);
    $('#rescue_proxy_check_update').on('click', checkUpdate);
    $('#rescue_proxy_refresh_logs').on('click', () => loadLogs());
    $('#rescue_proxy_clear_logs').on('click', clearLogs);
    $('#rescue_proxy_delete_history').on('click', deleteHistory);

    // 终端日志事件
    $('#rescue_proxy_refresh_console').on('click', () => loadConsoleLogs(0));
    $('#rescue_proxy_clear_console').on('click', clearConsoleLogs);
    $('#rescue_proxy_console_follow').on('change', function () {
        toggleConsoleFollow($(this).is(':checked'));
    });

    // 标签页切换
    $('.rescue-proxy-tab').on('click', function () {
        const tabName = $(this).data('tab');
        $('.rescue-proxy-tab').removeClass('active');
        $(this).addClass('active');
        $('.rescue-proxy-tab-content').removeClass('active');
        $(`.rescue-proxy-tab-content[data-tab-content="${tabName}"]`).addClass('active');
    });

    // 可折叠区块
    $('.rescue-proxy-collapsible-header').on('click', function () {
        $(this).closest('.rescue-proxy-collapsible').toggleClass('collapsed');
    });

    // 监听消息发送事件 - 在发送消息前同步聊天上下文到后端
    eventSource.on(event_types.MESSAGE_SENT, setChatContext);
    eventSource.on(event_types.USER_MESSAGE_RENDERED, setChatContext);

    // 监听消息接收完成事件 - 通知服务端取消延迟保存
    eventSource.on(event_types.MESSAGE_RECEIVED, confirmReceived);
    console.log('[RescueProxyUI] 已注册消息事件监听');

    // 设置请求拦截器（注入上下文）
    setupAjaxPrefilter();

    // 注册用户目录
    await registerContext();

    // 加载设置
    await loadSettings();

    // 加载可导入的配置列表
    await loadAvailableProfiles();

    // 加载请求日志
    await loadLogs();

    console.log('[RescueProxyUI] 初始化完成');
    console.log(`[RescueProxyUI] 代理服务器地址: http://127.0.0.1:${PROXY_PORT}/v1`);
}

// 当应用准备好时初始化
const context = SillyTavern.getContext();
context.eventSource.on(context.event_types.APP_READY, init);
