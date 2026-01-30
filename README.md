# Rescue Proxy UI

SillyTavern 前端扩展 —— Rescue Proxy 配置界面

## 功能

- ⚙️ **配置管理** — 设置真实 API 地址和密钥
- 📥 **一键导入** — 从 SillyTavern 现有配置导入
- 🔗 **状态监控** — 显示代理服务器连接状态
- ✅ **消息确认** — 通知后端浏览器已收到 AI 回复

## 依赖

需配合后端插件 [rescue-proxy](https://github.com/fishundbug/rescue-proxy) 使用。

## 安装

```bash
cd SillyTavern/public/scripts/extensions/third-party
git clone https://github.com/fishundbug/rescue-proxy-ui.git
```

刷新 SillyTavern 页面，扩展会自动加载。

## 设置面板

在扩展设置中找到 **Rescue Proxy** 面板：

### 真实 API 配置
- **从 SillyTavern 导入** — 选择已有配置一键导入
- **API 地址** — 真实 AI API 端点
- **API Key** — 真实 API 密钥

### 代理端点配置
- **代理端口** — 本地代理端口（默认 5501）
- **代理 API Key** — 可选，防止其他程序调用

## 许可证

MIT
