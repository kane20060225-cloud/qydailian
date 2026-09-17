# B23 品牌名称与租号筛选发布记录

站点：https://wotbqydailian.vip

2026-09-17 14:46（北京时间）完成生产部署。运行源码提交 `218564511a1311a4c51643c25349779de605e644`，前端缓存版本 `20260917-b23`。

网站标识为 QY Blitz，浏览器标题为 QY Blitz | WOT Blitz Tools & Services，首页明确 WOT Blitz 玩家服务定位。情谊积分统一显示为 Velnora 积分，覆盖下单抵扣、个人中心、订单渠道筛选及资金流水。支付宝充值商品说明同步使用 QY Blitz。仅修改名称，不改变积分账户字段、余额或抵扣规则。

租号大厅筛选采用原生 details/summary，默认收起，可通过点击或键盘展开。收起保留已选条件和筛选结果，结果说明始终可见；展开可清空筛选。

发布六个运行文件：backend/lib/order-center.js、backend/lib/recharge-orders.js、public/index.html、public/script.js、public/order-center.js、public/customer-workflow.css。发布前核对原文件基线，先发布资源再发布首页。后端 PM2 my-backend 重启后 PID 为 309798，无数据库迁移；环境文件哈希和服务器 Git 元数据未变。

受保护发布目录 `/root/b23-branding-release-218564511a` 权限 0700。归档 SHA256：`2c21e1a0ff09a6cf8bb27f35670d13df8591f3d2c5bdd45d434f8a2afc5093ba`。备份及记录权限 0600，完整站点运行内容备份为 17,781,256 字节，本批运行文件备份为 358,400 字节；验证失败时脚本自动恢复旧文件并重启后端。

238 项测试通过。同步修正已有测试中仍要求 PNG 的背景断言，匹配此前 B22 已上线的 WebP。合成数据浏览器检查在深浅主题、1440/390 宽度下通过，覆盖筛选默认收起、展开、再次收起、条件保留、键盘操作及原业务流程。

生产匿名浏览器在深浅主题、1440/390 宽度下验收品牌、积分名称、折叠筛选、资源加载、主题切换，无横向溢出或脚本错误。生产仅允许同源 GET/HEAD 请求，没有业务写入；四个前端文件公网内容 SHA256 与运行提交一致，健康接口 200，设备及管理员受保护接口 401。截图保存在 artifacts/ui-preview/live-b23-*.png，不上传云仓库。

云同步计划沿用 GitHub kane20060225-cloud/qydailian 的 main 和 codex/b7-ux-foundation，采用原子快进推送。本次推送被自动审批拒绝：需要用户明确授权将源码发送至这个具体仓库及分支；尚未完成云同步。后续文档提交仅补充发布记录，不替换运行源码。
