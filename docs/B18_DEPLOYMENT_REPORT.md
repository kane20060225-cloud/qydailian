# B18 深浅主题同步发布记录

站点：https://wotbqydailian.vip

2026-09-16 23:56（北京时间）完成文件部署；随后通过公网浏览器验收及云仓库同步。运行源码提交 `d79a2e848ab41db96854d5f4e98d2052c19052e1`，缓存版本 `20260916-b18`。

仅替换 `public/index.html`、`public/ui-foundation.css`、`public/light-theme.css`，新增 `public/theme-components.css`。深色原有配色保持，深浅主题共用布局。四个公网文件均 HTTP 200，规范换行后的 SHA256 与源码一致。

发布目录 `/root/b18-theme-parity-release-d79a2e848a` 权限 `0700`。归档 SHA256 `e743ce18d092c6516ba5f9405a39a4166449e69b1cda46595bfa7565a70b5a54`。受保护备份 `backup/public-before.tar.gz` 为 3,721,604 字节、`backup/runtime-before.tar` 为 112,640 字节，均为 `0600`；发布前核对基线，并保留 `before.json`、`verified.json`（`0600`）。回滚恢复本批原有三个文件，移除本批新增的共用组件样式。

未进行数据库写入或后端重启；环境文件哈希不变，PM2 `my-backend` PID 仍为 `304289`。健康接口 HTTP 200，未登录访问管理员订单中心 HTTP 401。

本地深浅主题各五种宽度的八个页面布局比较通过，深色原配色检查通过；桌面和手机下单流程回归通过。公网未登录浏览器在 1440×1000 和 390×844 比较两主题首页及下单布局，通过橙色强调色、主题持久化、无横向溢出和无脚本错误检查，仅允许本站 GET/HEAD 请求。

源码已经原子快进推送到 `origin/main` 和 `origin/codex/b7-ux-foundation`。GitHub 默认 SSH 连接被重置后，通过官方 `ssh.github.com:443` 入口完成核对及推送；保留远端历史。报告提交仅补充文档，不替换运行源码。
