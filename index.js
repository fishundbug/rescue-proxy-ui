/**
 * Rescue Proxy 前端扩展
 * 
 * 功能：配置 API 代理设置，并在请求时注入聊天上下文
 */

const MODULE_NAME = 'rescue_proxy_ui';
const PLUGIN_API_BASE = '/api/plugins/rescue-proxy';
const PROXY_PORT = 5501;

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
 * 注入聊天上下文到请求 header
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
 * 设置聊天上下文到服务端
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

    // 监听消息发送事件 - 在发送消息时注册聊天上下文（方案 B）
    eventSource.on(event_types.MESSAGE_SENT, setChatContext);
    // 也监听用户消息发送
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

    console.log('[RescueProxyUI] 初始化完成');
    console.log(`[RescueProxyUI] 代理服务器地址: http://127.0.0.1:${PROXY_PORT}/v1`);
}

// 当应用准备好时初始化
const context = SillyTavern.getContext();
context.eventSource.on(context.event_types.APP_READY, init);
