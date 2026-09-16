# 青衣代练工具站

## 本地运行

要求 Node.js 18 或更高版本，以及一个可访问的 MySQL 实例。

1. 进入 `backend/` 并执行 `npm install`。
2. 将 `.env.example` 复制为 `.env`，只在运行环境中填写实际配置；不要提交 `.env`。
3. 执行 `npm test`。
4. 执行 `npm start`，默认访问 `http://localhost:3000`。

未设置 `ALIPAY_ENABLED=true` 时，支付宝充值接口会返回 503，其他服务仍可启动。启用支付宝前必须配置应用 ID、密钥文件路径、通知地址和返回地址。

## 部署前检查

- 建议先从当前稳定版本创建备份分支或备份提交。
- 确认阿里云服务器上的代码版本、Node.js 版本和进程启动方式。
- 确认 MySQL 使用正确的阿里云地址、账号和网络访问策略；不要把真实配置写入仓库。
- 确认 `PUBLIC_DIR`。未设置时，服务优先使用仓库根目录的 `public/`，并兼容旧的 `backend/public/` 目录。
- 支付宝配置必须先在沙箱环境验证，再单独安排生产变更。
- 数据库结构变更必须先备份并使用经审核的增量迁移；禁止直接执行破坏性操作。

## 常用命令

- `npm start`：启动服务。
- `npm run check`：检查服务端 JavaScript 语法。
- `npm test`：运行基础启动和静态页面测试。

更完整的架构和风险说明见 `PROJECT_ANALYSIS.md`。

订单取消、24小时未付款关闭及历史充值核销的部署与使用说明见 [B14_ORDER_LIFECYCLE_RUNBOOK.md](backend/migrations/B14_ORDER_LIFECYCLE_RUNBOOK.md)。发布此版本前需先执行 B14 增量迁移；超时关闭默认关闭。

三步下单、订单指引、租号筛选、删除申请与历史异常核对说明见 [B16_ORDER_DELETION_RUNBOOK.md](backend/migrations/B16_ORDER_DELETION_RUNBOOK.md)。发布此版本前需执行 B16 审核元数据增量迁移；核对删除保留原始订单及资金记录。

界面细节、文案统一及浅色主题重构说明见 [B17_UI_REDESIGN.md](docs/B17_UI_REDESIGN.md)。B17 无需数据库迁移，效果图由本地浏览器验证生成。

深浅主题共用布局见 [B18_THEME_PARITY.md](docs/B18_THEME_PARITY.md)。深色组件配色恢复、网页代练项目编辑及游戏/平台活动管理见 [B19_SERVICE_CONTENT_RUNBOOK.md](docs/B19_SERVICE_CONTENT_RUNBOOK.md)；B19 上线须先初始化新增配置表，再发布文件并重启后端。
- [B20 管理入口与登录设备](docs/B20_WORKSPACE_DEVICES_RUNBOOK.md)
