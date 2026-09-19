# B39 PWA 桌面安装引导发布报告

2026-09-19 23:33（北京时间）发布至 `https://wotbqydailian.vip`，运行提交 `5f5f9f6562bc7393b06171a2378acd39f6ad0fd2`。服务器静态发布验收时间 `2026-09-19T15:33:59.710Z`，真实生产 Edge 浏览器验收时间 `2026-09-19T15:34:33.463Z`。

## 发布内容

首页安装入口改为浏览器模式下常驻。Chrome、Edge 与支持 `beforeinstallprompt` 的 Android 浏览器可以从页面按钮打开系统安装框；未提供该事件时，同一入口按 iPhone/iPad、Mac Safari、Android、桌面 Chrome/Edge 生成对应的安装步骤。安装完成或从 standalone 窗口打开后，入口自动隐藏。

本次生产只原子替换 `public/index.html`、`public/pwa.js`、`public/pwa.css`。没有数据库迁移、后端重启、环境变量修改或服务器 Git 操作，PM2 `my-backend` PID 保持 `325640`。发布前生产三份文件与云端基线提交 `5bc5427c31c4118cd13d0e49fa8e5856d6c2f7c4` 的规范化哈希逐项一致。

## 验收结果

- 生产健康接口 HTTP 200，匿名管理员订单接口 HTTP 401。
- HTTPS 安全上下文有效；Service Worker 已激活，scope 为 `https://wotbqydailian.vip/`。
- Manifest 解析错误和 PWA 安装条件错误均为空，4 个安装图标及 50 个静态资源通过公网检查。
- Edge 隔离测试 profile 验证 1440px/390px、深浅主题、安装入口与安装指南，无横向溢出。
- 离线页与联网恢复通过；44 个缓存路径中没有 API、上传、首页 HTML 或其他敏感业务路径。
- 公网验收无 404、页面 JavaScript 错误或在线 console error；全程匿名 GET/HEAD，没有生产业务写入。
- 本地完整测试 288 项通过；本地 Edge 额外验证 1440/390/360px、iPhone/iPad 模拟检测、standalone 隐藏及回退 worker。

Android/iOS 系统级安装仍需真机由用户确认；网页不能绕过浏览器安全确认静默创建桌面图标。

## 备份与回退

生产受保护发布目录为 `/root/b39-pwa-install-release-5f5f9f6562`，目录权限 0700，发布记录与备份权限 0600。发布归档 SHA256 为 `24e2577d61ab8794be4df0d43b5449d26044f2e4a14964ce4354921f43c587da`。

| 备份 | 字节 | SHA256 |
| --- | ---: | --- |
| `backup/public-before.tar.gz` | 8,337,884 | `1c2350aad0dbf6847854f95d3f5987b6728de9f41bfef44a6baabfecb36502c1` |
| `backup/runtime-before.tar` | 92,160 | `ee4dc7fd2fc5a106c2106c7bcfb32ed3dd0079796a8c6845d2bc24a4ef891517` |

两份备份、`before.json`、`verified.json`、清单及回退工具已复制到本地忽略目录 `artifacts/ui-preview/b39-release/` 并核对大小和哈希。生产浏览器记录与截图保存在 `artifacts/ui-preview/pwa-live/`。

如需恢复，先确认线上三份文件仍是本次版本，再在服务器执行：

```bash
cd /root/b39-pwa-install-release-5f5f9f6562
node rollback.cjs --restore-static
```

回退脚本会拒绝覆盖后续改动，只恢复本次三份静态文件；不重启后端、不修改数据库。源码回退使用 `git revert 5f5f9f6562bc7393b06171a2378acd39f6ad0fd2`，不能强制重置云端历史。

## 云同步

功能提交、受保护发布/回退工具及本报告已快进同步到 GitHub 仓库 `kane20060225-cloud/qydailian` 的 `main` 和 `codex/b7-ux-foundation`，没有强制推送。发布备份、浏览器 profile、截图和服务器私有记录均由 `.gitignore` 排除，没有同步生产环境文件或密钥。
