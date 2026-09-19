# B37 QY Blitz PWA 上线与未 PWA 回退基线

2026-09-19 03:12（北京时间）发布至 https://wotbqydailian.vip，运行提交 `743490bb9d17d68cbc83d4de487c7c5c441980d0`。服务端验收时间 `2026-09-18T19:12:10.468Z`，真实生产 Edge 浏览器验收时间 `2026-09-18T19:12:39.090Z`。

## 发布内容与验证

Manifest 沿用 QY Blitz 品牌，根启动地址与 scope `/`，standalone，普通/maskable 的192/512图标。现有180×180 Apple Touch Icon保留。首页安装入口只在浏览器可安装时出现，iOS提供可展开帮助；独立窗口中隐藏。原URL/hash导航、认证、订单、支付及数据库逻辑未改。

worker 缓存名 `qy-pwa-v1`，只对明确同源静态白名单采用网络优先/网络异常回退。不缓存实际页面HTML、API、认证、订单、付款或上传内容，不接管写请求。更新不自动刷新正在操作的页面。

确认生产 Nginx 1.24直接提供public，并将未知路径回退到index；因此加入worker/Manifest/入口/注册脚本/离线页/图标的最小精确静态规则，保留原TLS、API及上传代理。Manifest MIME为`application/manifest+json`，worker为`application/javascript`，worker响应`Cache-Control: no-store`和`Service-Worker-Allowed: /`；缺失图标真正返回404。

部署前生产index和server的规范化哈希分别为`8d25990633b17ae56c9c6f57cfe8cfd93eaaea83ba6574d0f618596597903ccb`和`aa579ba6e105670a7910fcb9ca494b2f613b164d6fe98dab87233ac03fec406a`，与未PWA源码基线一致。部署后分别为`ad634f2941e99961d8da021d1617e69000a792fb0c5f88be0914c411de576a27`和`123400e10376fb4b87a8ac00aa999b4a944bae0701347592fa4587bdbe57a41a`。

PM2 `my-backend`重启后PID为321478，Nginx语法检查与reload成功。健康接口200，匿名个人资料及管理员订单接口401。无数据库迁移，环境文件和服务器Git元数据保持原样；服务器旧Git HEAD不代表实际运行代码，运行版本由本发布提交及文件哈希标识。

本地277项测试全部通过。生产隔离PWA HTTP/worker测试5项通过。真实生产HTTPS Edge普通测试profile中worker注册并activated，只有一个注册，scope为`https://wotbqydailian.vip/`。CDP Manifest及安装条件错误均为空；1440/390宽度、深浅主题、主页/代练/租号/工具导航与断网恢复通过；42个安全缓存路径，没有业务敏感路径，在线阶段无404、页面JS错误或console error。

生产验收匿名且仅同源GET/HEAD，无业务写操作。登录、个人中心、订单列表、hash返回与API实时性由本地真实worker结合合成API验证；没有用真实订单、密码或付款进行线上写测试。iPhone/iPad及standalone检测为模拟验证，Android/iOS系统安装仍需用户真机检查。

## 备份与云同步

未PWA源码基线为`bf4d35c77eab40f1dd7165b6c311d9a6d4a50188`，保存为云端注释标签`pre-pwa-20260919`。源码、部署/回退工具与本报告已原子快进同步到既有GitHub仓库`kane20060225-cloud/qydailian`的`main`和`codex/b7-ux-foundation`，没有强制重写历史。推送内容检查未发现私钥/provider token，也没有跟踪.env、.pem、运行备份或artifacts。

生产独立发布目录为：

```text
/root/b37-pwa-release-743490bb9d
```

该目录及backup为0700，以下备份文件为0600：

| 文件 | 字节 | SHA256 |
| --- | ---: | --- |
| `backup/public-before.tar.gz` | 7,906,463 | `a9e6887ce1f9ebc6b2fcb1b08825d0106e60eae202d4c307cc195bcc73dbdf1f` |
| `backup/runtime-before.tar` | 235,520 | `72dc168f89e4027fb9a6899088f30dc77de0e887bde10e7fec1bf6da8fc28a2c` |
| `backup/nginx-before.conf` | 1,030 | `0572b64151905cc880fddb2bf93e55dbbb0180fc863450fafc213c4467e81ce8` |

发布包SHA256为`642a7dd8340edcbd0bec3764ad23fa2a4ea94b74b7b5db746f402ac865ba487c`。修改后Nginx配置SHA256为`666041bad933e438002e2bb1ca846faa7006afd9cfe9c36195b8b1e21e010361`。

三份生产备份已复制到本地`artifacts/ui-preview/b37-release/backup/`并逐项核对大小和SHA256；同目录保存未PWA完整版本化源码归档`pre-pwa-source-bf4d35c.tar.gz`。`before.json`、`verified.json`、Manifest和完整回退工具在服务器发布目录及本地release副本中保留，未上传环境文件、私钥或数据库。生产浏览器记录在本地`artifacts/ui-preview/pwa-live/verified.json`及截图中。

## 回到未 PWA 状态

当前只保留回退能力，没有实际回退线上PWA。服务器执行：

```bash
cd /root/b37-pwa-release-743490bb9d
node rollback.cjs --restore-pre-pwa
```

脚本先核对当前文件及Nginx仍为本发布版本；如有后续改动会拒绝覆盖，需按具体后续版本审核回退。校验备份后恢复部署前index和server的原始字节，删除本次新增运行文件，恢复原Nginx配置并仅保留worker退役端点规则，重启PM2、reload Nginx，检查健康接口及原文件哈希。不会回滚订单、账户、数据库或覆盖.env。

`/service-worker.js`退役文件必须继续提供JavaScript及no-store，不能直接删除或回退成首页HTML。旧客户端联网更新后，该worker删除`qy-pwa-*`缓存、接管客户端并注销注册，无fetch缓存、自动刷新或业务重试。真实本地浏览器已验证此升级、清理和注销流程，Token及其他应用缓存保留。已离线的旧设备须再次联网访问才能退出旧worker；系统桌面图标需用户手动移除，网站无法静默删除。

源码回退通过撤销本次发布提交记录，沿用历史：

```bash
git revert 743490bb9d17d68cbc83d4de487c7c5c441980d0
```

先执行服务器运行回退，再核对源码撤销结果并快进同步两个云分支；如有后续提交，逐项处理冲突，不能`reset --hard`或强制推送。源码恢复到未PWA功能状态后，仍保留服务器私有release目录内的退役端点和回退资料。

部署与使用详情见[PWA_RUNBOOK.md](PWA_RUNBOOK.md)。
