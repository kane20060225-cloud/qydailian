# B22 电竞背景与 WebP 发布记录

站点：https://wotbqydailian.vip

2026-09-17 10:28（北京时间）完成生产部署。运行源码提交 `11d4cb73b87218623503c37edef18118fa5d3bec`，前端缓存版本 `20260917-webp1`。

首页背景加入战场图、琥珀金及冷蓝氛围光；服务、工具、下单与订单卡片采用金属渐变、战术网格和雷达纹理，选中项加入金色内发光。深浅主题沿用共用布局，支持减少动态效果设置。

背景由 PNG 的 1,707,244 字节转为 WebP 的 65,260 字节，减少 96.2%；分辨率保持 1672 × 941。原 PNG 保留作备份，所有运行样式改为引用 WebP。生产浏览器确认首页不再请求原 PNG。

仅发布六个前端文件：`public/index.html`、`public/style.css`、`public/ui-foundation.css`、`public/esports-surfaces.css`、`public/bg.webp`、`public/images/tactical-grid.svg`。先发布资源，后发布首页。公网均 HTTP 200，文本规范换行后的 SHA256 与运行提交一致，WebP 二进制 SHA256 一致且 Content-Type 为 image/webp。

受保护发布目录 `/root/b22-esports-release-11d4cb73b8` 权限 0700；归档 SHA256 为 `1c850b81b3b84fba06aa8e3637f31613e7dd15e5c17e5bd555ea07bbdd226f69`。原前端完整备份 `backup/public-before.tar.gz` 为 3,733,688 字节，本批原有文件备份 `backup/runtime-before.tar` 为 163,840 字节；备份、基线和验证记录权限 0600。部署工具先核对原文件基线及新增文件不存在，验证失败时恢复原文件并移除本批新增文件。

没有数据库迁移或后端重启；PM2 `my-backend` PID 保持 306397，服务器环境文件哈希和 Git 元数据保持一致。健康接口 HTTP 200，匿名管理员订单中心访问 HTTP 401。

本地深浅主题各五种宽度的现有主题浏览器检查通过。生产匿名浏览器在两主题 1440/390 宽度下检查首页、下单、主题切换、实际 WebP 与纹理资源加载、无横向溢出及无页面脚本错误，全部通过。仅允许本站 GET/HEAD 请求，没有业务写入。效果图保存在 `artifacts/ui-preview/live-b22-*.png`，不发布到服务器或云仓库。

源码已原子快进推送到 GitHub `kane20060225-cloud/qydailian` 的 `main` 与 `codex/b7-ux-foundation`。本报告的后续文档提交补充验收记录，不替换运行源码。
