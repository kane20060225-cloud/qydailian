# 移除联赛功能

删除联赛入口、榜单、新闻、管理页面、前端处理代码、后台 CRUD 和建表初始化。商城使用独立的 shop-items-grid 样式。现有用户角色仍为 user、booster、admin。

用户已明确要求彻底删除联赛相关板块及相应内容。数据库清理仅删除 league_scores、league_points_rules、league_seasons、league_teams、league_news 五张专用表，按外键依赖顺序执行；不关闭外键检查，不删除其他业务表。有其他业务表引用联赛表或存在未审核的 league_ 表时，清理脚本停止。

发布前备份数据库、站点，在无生产 .env 的独立目录运行回归测试。先运行 `npm run migration:b10:remove-league -- --plan` 核对范围，再发布移除后的运行代码并重启，最后运行 `npm run migration:b10:remove-league -- --apply --confirm=REMOVE-LEAGUE-CONTENT --backup=/root/<release>/backup/database.sql`。脚本检查备份包含五张表的定义。DDL 不能事务回滚；中断后可重试尚未删除的专用表。

核查旧的 /api/admin/leagues、/api/admin/teams、/api/league/:id/rankings、/api/league-news 及联赛新闻管理接口均为 404，页面无联赛入口，五张表已不存在，健康接口与订单中心正常。

生产数据预检：1 个赛季、32 支队伍、1 篇联赛新闻，无成绩和积分规则；联赛新闻未引用 /uploads 图片，公告和游戏新闻未引用联赛。预检只是发布时的范围证据，执行前仍运行实时计划。备份存放于现有服务器的 root 私有目录，不对外发布。
