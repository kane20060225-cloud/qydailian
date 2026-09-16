# B21 登录设备与活动弹窗发布记录

站点：https://wotbqydailian.vip

2026-09-17 02:07（北京时间）完成生产部署，运行源码提交 `5c8c8394b50614ae72b228037c5d169347714f6f`。登录设备历史归并、标识恢复、最新登录时间与地点展示，以及标题后的活动入口、单列活动弹窗和居中下单布局已上线。

发布五个运行文件：`backend/lib/login-devices.js`、`public/index.html`、`public/script.js`、`public/service-content.js`、`public/service-content.css`。已有设备标识列与唯一索引验证通过，无数据库迁移。后端 PM2 `my-backend` 重启后 PID 为 `306397`。四个公网前端文件 HTTP 200，规范换行后的 SHA256 与提交一致；健康接口 200；未登录访问设备、管理员活动配置和管理员订单接口均 401。环境文件哈希及服务器 Git 元数据核对一致。

发布目录 `/root/b21-devices-activities-release-5c8c8394b5` 权限 0700；归档 SHA256 为 `3d8ad8b8e562d2365124ea5adae3231939a245fe8eb853ea430c4f9e8d3c595d`。站点备份 `backup/site-before.tar.gz` 为 17,710,191 字节；本批运行文件备份 `backup/runtime-before.tar` 为 307,200 字节；备份及验证记录权限 0600。部署工具验证失败时自动恢复本批运行文件并重启旧版本。

238 项本地后端测试通过。活动单列铺满、空态、失败重试、长列表滚动和固定关闭入口在深浅主题 1920/1440/768/390 宽度验证通过。生产只读浏览器验收在深浅主题 1440/390 宽度通过，确认居中下单、对称留白、活动弹窗、Escape 关闭、无横向溢出和无脚本错误；仅允许本站 GET/HEAD 请求。

云同步沿用已配置 GitHub 仓库 `kane20060225-cloud/qydailian`，目标分支 `main` 与 `codex/b7-ux-foundation`，使用原子快进推送。GitHub SSH 登录账号验证为 `kane20060225-cloud`，与仓库所有者一致。
