# QY Blitz PWA 发布与验收

本次在现有原生 HTML/JS + Express 项目内增加 PWA，无新增运行依赖、数据库迁移或业务路由。生产域名沿用 `https://wotbqydailian.vip`，启动地址和 scope 均为 `/`。不限制 orientation，允许手机横屏、平板及桌面工具正常使用。

## 文件清单

| 文件 | 作用 |
| --- | --- |
| `public/index.html`（修改） | 加入 Manifest、主题色、iOS 独立窗口与名称配置；复用现有 viewport 与 Apple Touch Icon；首页内嵌安装入口；引入 PWA JS/CSS。 |
| `backend/server.js`（修改） | 仅调整静态响应头：worker 禁止 HTTP 缓存，根 scope 允许头，Manifest 明确 MIME，入口与注册脚本重验证。认证、API、数据库逻辑未修改。 |
| `public/manifest.webmanifest` | QY Blitz 名称、中文描述、standalone、品牌色、根 scope 与图标声明。 |
| `public/service-worker.js` | 静态资源白名单、网络优先、准确版本回退、离线提示、版本更新与旧缓存清理。 |
| `public/pwa.js` | 注册与错误处理、更新检查、Android 安装事件、已安装状态与 standalone 检测、iOS Safari 帮助。 |
| `public/pwa.css` | 首页小型安装入口样式，适配现有深浅主题，不增加悬浮按钮。 |
| `public/offline.html` | 无用户数据的独立离线提示页；提醒联网核对订单后再操作。 |
| `public/icons/pwa-192.png`、`pwa-512.png` | 普通安装图标。 |
| `public/icons/pwa-maskable-192.png`、`pwa-maskable-512.png` | 不透明品牌背景及安全留白，适配 Android 图标裁切。 |
| `backend/test/pwa-http.test.js` | 实际 Express HTTP、MIME、scope 头、Manifest、PNG 尺寸、静态路径与匿名认证检查。 |
| `backend/test/pwa-worker.test.js` | worker 缓存边界、精确版本、实时网络、敏感请求绕过、错误响应与更新清理测试。 |
| `backend/scripts/verify-pwa-browser.cjs` | 真实 Edge + Service Worker 浏览器验证；业务 API 使用合成数据；不会连接生产数据库。 |
| `backend/scripts/verify-pwa-live.cjs` | HTTPS 生产只读验收，核对发布内容、响应头、图标、引用资源与匿名认证保护。 |
| `docs/PWA_RUNBOOK.md` | 本文：发布、服务器配置和手机/DevTools 测试说明。 |

图标沿用顶部品牌图片 `public/velnora-coin.png`（256×256），使用确定性的等比缩放和品牌背景生成，未重新设计标志。512 版本为平滑放大；如以后有矢量或至少 512×512 的原始品牌图，可替换得到更清晰版本，目前图标可用。现有 `public/apple-touch-icon.png` 为 180×180，保留其链接，不重复添加。

## 缓存与更新

- 当前缓存名 `qy-pwa-v1`；修改 worker、离线页或原路径图标内容时，更新 `CACHE_VERSION` 为 `qy-pwa-v2` 等。
- 只处理同源 GET 的明确白名单 CSS、JS、品牌背景和图标。发送静态网络请求时不携带认证信息，绕过 HTTP 缓存获取当前内容，只有断网/网络异常才回退 Cache Storage。
- 普通业务请求完全保持浏览器原有网络行为，不增加缓存或重试。`/api/*`、支付、后台动态接口、上传图片及其他未知路径不由 worker 接管。带 `Authorization` 或 `Range` 的请求以及 POST/PUT/PATCH/DELETE/HEAD 均不处理。
- 不缓存实际首页 HTML，不保存用户信息、订单、密码、付款凭证、二维码、支付返回页或管理数据。离线提示仅用于 `/`、`/index.html` 的无查询参数导航；含查询的返回 URL 保持原网络行为。已有 hash 路由仍有效。
- 静态缓存只接受无查询参数或唯一的 `v` 版本参数，版本必须完全匹配；新版本响应成功后清除该资源旧版本，防止无限增长。401/403/404/500、重定向、错误 MIME、`private`/`no-store`/`Vary: *` 响应不写入缓存。
- worker 安装只预缓存中性的离线页。首次访问的资源在 worker 控制页面后再次请求才缓存，这是正常行为。
- 更新设置 `updateViaCache: 'none'`；注册后、重新联网时及页面回到前台时检查更新（前台检查限每小时一次）。安装后立即激活并清理本项目旧缓存；不删除其他应用缓存，不自动刷新填单或付款页面。新首页和静态请求优先读网络，所以不会长期锁定旧资源。
- Android 按钮仅在收到 `beforeinstallprompt` 后显示；安装完成或 standalone 中隐藏。iOS 使用首页内可展开帮助，无定时弹窗，也无需推送权限。
- 桌面和 iOS 分别通过 `matchMedia('(display-mode: standalone)')`、`navigator.standalone` 检测。检测不改变 fetch、Token、Cookie 或页面跳转。

## 发布步骤

当前仓库部署记录显示服务器目录 `/var/www/your-site`、PM2 应用 `my-backend`；实际发布前确认仍使用这些路径和名称，以及是否设置了 `PUBLIC_DIR`。如果使用自定义 `PUBLIC_DIR`，把静态文件同步到该目录，而不是上传到无效的副本。

先备份现有 `public/` 和 `backend/server.js`。同步上表两个修改文件和新增运行文件（整个 `public/icons/` 与五个 PWA 文件），先上传新增资源，最后更新 `index.html`。测试、验证脚本和本文也建议同步，方便验收。无需重新安装依赖；没有数据库迁移。不要使用旧 B36 发布脚本，它只允许发布那次的两份文件。

在服务器执行：

```bash
cd /var/www/your-site
node --check public/service-worker.js
node --check public/pwa.js
cd backend
npm run check
node --test test/pwa-http.test.js test/pwa-worker.test.js
pm2 restart my-backend
node scripts/verify-pwa-live.cjs https://wotbqydailian.vip
```

需要重启 PM2 才能让 `backend/server.js` 的新响应头生效，沿用现有进程环境即可，无需 `--update-env`。如果只更新静态文件，Express 不需要重启，但本次包含响应头修改，建议按上述步骤完整发布。

## Nginx

仓库没有 Nginx 配置文件。本次没有修改服务器 Nginx；当前环境未能访问生产域名或读取实际服务器配置，不能把建议片段视为已核对的生产配置。

先在服务器检查：

```bash
sudo nginx -T
curl -I https://wotbqydailian.vip/manifest.webmanifest
curl -I https://wotbqydailian.vip/service-worker.js
curl -I https://wotbqydailian.vip/icons/pwa-192.png
```

不要把 `nginx -T` 的完整结果公开上传。确认 worker 不重定向、不需要登录、返回 JavaScript，而不是 SPA HTML；scope 必须从 `/service-worker.js` 覆盖根 `/`，不能放在 `/public/` URL 下。

如果现有 `location /` 全部代理到 Express，Express 已设置所需 MIME 和缓存头，通常无需修改或 reload Nginx。若 Nginx 自己直接提供静态文件、设置长期缓存或 proxy cache，需在现有 HTTPS server 内按实际 public 路径采用以下两个**精确匹配**，不要新建第二个 server，也不要同时配置“直接静态”和“代理”两套 location：

```nginx
# 仅用于 Nginx 直接提供 public 文件的部署方式
location = /service-worker.js {
    root /var/www/your-site/public;
    types { application/javascript js; }
    default_type application/javascript;
    add_header Cache-Control "no-store" always;
    add_header Service-Worker-Allowed "/" always;
    try_files $uri =404;
}

location = /manifest.webmanifest {
    root /var/www/your-site/public;
    types { application/manifest+json webmanifest; }
    default_type application/manifest+json;
    add_header Cache-Control "no-cache" always;
    try_files $uri =404;
}
```

图标沿用已有静态规则，确保 `/icons/*.png` 映射到 public 且 `image/png`；不要把 icons、worker、Manifest 的 404 回退成 `index.html`。入口 HTML 和 `pwa.js` 不应配置 `immutable` 或长期不重验证的缓存；如果有 CDN，要同步排除这些路径并清除旧入口缓存。

若现有 server 配置有 HSTS、CSP 等 `add_header`，请沿用其在 location 内的配置方式；某些 Nginx 版本中新增 location 的 `add_header` 会覆盖父级继承，不能因此遗漏现有安全响应头。

若两个路径必须由 Express 提供且现有代理会缓存它们，可以使用以下精确匹配替代上述静态片段（上游端口沿用实际现有值）：

```nginx
location = /service-worker.js {
    proxy_pass http://127.0.0.1:3000;
    proxy_cache off;
}
location = /manifest.webmanifest {
    proxy_pass http://127.0.0.1:3000;
    proxy_cache off;
}
```

仅在实际修改 Nginx 后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Android 真机测试

1. 用 Chrome 或 Edge 普通窗口访问生产 HTTPS 网站，等待页面加载；隐身模式不支持常规安装。
2. 浏览器可能按安装状态、访问互动和平台策略决定何时发出安装事件；若首页出现“安装应用”，点击并确认。也可在浏览器菜单选择“安装应用”或“添加到主屏幕”。首次未出现按钮不等于配置失败。
3. 检查桌面独立图标和 QY Blitz 名称，从桌面图标打开，确认无普通地址栏。系统提供“创建快捷方式”与“安装应用”时优先选安装应用。
4. 在应用内登录，查看个人中心、订单状态、代练/租号页面；测试返回、关闭再启动、前后台切换。订单和用户数据应随网络更新。
5. 联网访问至少两次后断网关闭再启动，确认显示离线提示，不显示旧订单。恢复网络点“重新连接”；不要用真实付款来测试断网重试。

## iPhone / iPad 真机测试

1. 用 Safari 访问生产 HTTPS 网站，点击分享 → 添加到主屏幕；较新系统若提供“作为 Web App 打开”选项，保持开启。
2. 确认预览图标、名称 QY Blitz，点击添加；从主屏幕图标启动检查独立窗口。
3. 首页帮助为可展开文字，standalone 中隐藏；没有 `beforeinstallprompt` 属正常行为。
4. 在主屏幕应用内测试登录、个人中心、订单、导航与返回。Safari 与主屏幕应用的数据容器可能由系统隔离，首次从图标启动可能需要重新登录；本次不会复制 Token 或改变认证逻辑。测试退出登录、再次启动及横竖屏。
5. iPad 同时检查 Safari 请求桌面网站时的安装与主屏幕启动。断网显示提示，联网后可以返回原网站。

## Chrome / Edge DevTools

1. 访问 HTTPS 网站 → F12 → Application → Manifest：检查名称、192/512 图标、maskable 预览、`Start URL /`、`Scope /`、`Display standalone`，确认无解析或安装条件错误。
2. Application → Service Workers：应只有一个本网站注册，脚本 `/service-worker.js`，scope 为 `https://wotbqydailian.vip/`，状态 activated/running。不要把 “Bypass for network” 的勾选状态留在日常验证中。
3. 重新加载一次 → Cache Storage → `qy-pwa-v1`：只能看到离线提示和白名单静态文件，不能有 `/api/`、订单 HTML、用户资料、上传凭证或支付数据。Network 中这些业务请求应走网络。
4. 控制台可检查：

```js
await navigator.serviceWorker.getRegistrations()
window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
```

普通网页第二项为 false，安装后的应用窗口应为 true。

5. 通过 Service Workers 的 Offline 或 DevTools 网络离线功能测试：已控制页面的 CSS 可缓存回退，重新打开 `/` 显示离线提示；API 必须失败而不是返回旧业务数据。模拟离线时 `ERR_INTERNET_DISCONNECTED` 等网络错误是测试预期，恢复联网后再检查控制台。
6. 后续发布 worker v2：点击 Update 或正常重新打开页面，确认新 worker 激活、v1 cache 删除，正在填写的表单不被自动刷新。

## 本次实际验收及边界

- `npm test`：277 项全部通过，包含现有认证、订单、支付、权限等回归和新增 PWA 边界测试。
- 实际 Express 测试：Manifest JSON/MIME、worker MIME/缓存头/root scope、全部白名单路径与图标尺寸有效；匿名个人中心与管理员订单接口仍为 401。
- 实际本地 Edge（独立普通测试 profile，localhost 安全上下文）：worker 注册并 activated，scope `/`；CDP Manifest 错误与安装条件错误均为空，浏览器实际发出原生安装事件。
- 验证 1440/390/360 宽度、深浅主题、安装入口、登录、用户中心、订单列表与 hash 返回；合成 API 连续读取得到新版本，POST/PUT/DELETE 送达网络。42 个安全缓存路径，在线阶段无 404、页面 JS 错误或 console error；断网提示与联网恢复正常，Token 不变。
- iPhone UA、iPad 桌面 UA/触摸检测、`navigator.standalone` 和 `display-mode: standalone` 的检测分支在 Edge 中模拟验证通过；这不是 Safari 内核或手机真机安装测试。Android/iOS 实际桌面安装、系统窗口及生产 HTTPS 注册仍需要按上述步骤验收。
- 测试输出保存在忽略提交的 `artifacts/ui-preview/pwa/verified.json` 与同目录截图。浏览器脚本需可用的 Playwright（开发环境依赖），不要求生产安装 Playwright。本环境可设置 `NODE_PATH` 到已提供的运行时依赖目录再执行 `node backend/scripts/verify-pwa-browser.cjs`。
- 当前环境访问生产 HTTPS 域名失败，尚未上传或修改生产服务器，不能报告线上注册或生产验收成功。发布后运行 `verify-pwa-live.cjs` 再进行 DevTools/手机检查。

## B37 部署与回退工具

后续已通过授权 SSH 读取实际生产配置：Nginx 1.24 直接提供 public，缺失路径回退首页，需要增加 worker、Manifest、入口、注册脚本及图标的精确静态规则。规则由 `backend/scripts/b37-nginx.cjs` 从已核对的原配置生成，既有 API、上传代理与 TLS 配置保留。部署过程备份、验证、reload Nginx，并重启原 PM2 进程。生产实际验收以 `B37_DEPLOYMENT_REPORT.md` 为准，上面的最初离线环境记录仅描述实现阶段。

`prepare-b37-release.cjs` 打包提交内容；`deploy-b37-release.cjs` 只替换明确白名单文件，核对生产基线并原子写入；`b37-runtime.cjs` 负责通用验证及恢复；`rollback-b37-release.cjs` 保留恢复未 PWA 状态的入口。所有工具副本存放在服务器独立权限 0700 的 release 目录，备份文件权限 0600。没有数据库迁移、环境更改或服务器 Git 重置。

回退要求先核对没有后续版本覆盖，然后在报告记录的 release 目录执行：

```bash
node rollback.cjs --restore-pre-pwa
```

回退恢复部署前的两份原始运行文件并移除本次新增运行资源，恢复原 Nginx 规则，保留唯一的 `/service-worker.js` 退役端点及其 MIME/no-store 规则。退役 worker 激活后删除 `qy-pwa-*` 缓存、接管旧客户端并注销自己，无 fetch、重试或自动刷新；登录存储和其他应用缓存不删除。旧离线设备要再次联网访问才能退出旧 worker，所以不能立刻删除退役端点。已安装的桌面图标无法由网站静默移除，需设备用户手动移除。

源码基线以云端 `pre-pwa-20260919` 标签保存，源码回退用 `git revert` 记录，不能强制重置远端分支；如有后续提交应仅撤销 PWA 的相关变更。服务器运行回退与源码回退需分别执行并核对，不能用云端回退替代客户端 worker 退役。

浏览器验收已包含真实升级至退役 worker，确认注册注销、PWA 缓存消失、其他缓存与 Token 保留、API 继续走网络。生产浏览器验收脚本 `verify-pwa-production-browser.cjs` 使用独立测试 profile，匿名 GET/HEAD，只读验证 HTTPS 注册、安装条件、布局和断网恢复。

参考：[Chrome 安装 Manifest 条件](https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest)、[WebKit 主屏幕 Web App 与 standalone](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)、[WebKit 主屏幕应用数据隔离](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)。
