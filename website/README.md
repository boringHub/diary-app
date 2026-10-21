# 拾光笺 · 静态品牌官网

Astro + TypeScript，独立于 Android / Ionic 的构建。输出纯静态文件，没有服务端、账号系统或 API 依赖。

## 开发与构建

需要 Node.js 22.12+（推荐 Node.js 24）和 npm。

```powershell
cd website
npm ci
npm run dev
```

本地地址 `http://127.0.0.1:4321/`。

```powershell
npm run build
npm run preview
```

构建先执行 Astro / TypeScript 检查，产物为 `website/dist/`。入口包含 `/`、`/privacy/` 和 `/404.html`。

## 设计与交互

- 奶油纸色、墨绿夜空、鼠尾草绿与少量暖杏色，圆润卡片和便笺式产品插画。
- 自有 UI 组件和 CSS 设计系统，无通用 UI 库。DM Sans 搭配 Noto Sans SC / Noto Serif SC，字体子集自托管。
- 首屏错峰入场、手机与便笺漂浮、滚动渐显、心情选择、三主题实时预览、原生 FAQ。
- 导航栏提供整站深色 / 浅色切换，首次访问跟随系统，手动选择保存在本地；首页、隐私页与 404 页保持一致。
- 品牌图标与标签图标复用 Android 当前 `mipmap-xxxhdpi/ic_launcher.png`。
- Canvas 星球支持拖动、方向键、暂停与样例记忆切换。离屏、后台及减少动态效果偏好下停止持续绘制。
- 页面互动不请求业务 API；仅整站明暗偏好写入 LocalStorage，不保存心情与主题演示选择。日记内容均为虚构样例。产品画面是网站示意，不冒充实际设备截图。

## 部署

### Cloudflare Pages

在 Cloudflare 的 Workers & Pages 中创建 Pages 项目，导入 GitHub 仓库 `boringHub/diary-app`，填写：

| 配置 | 值 |
| --- | --- |
| Production branch | `main` |
| Framework preset | `Astro` |
| Root directory | `website` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| 环境变量 `NODE_VERSION` | `24`（仓库的 `.node-version` 也指定了 24） |
| 环境变量 `SITE_URL` | 实际的 HTTPS 站点地址，例如 `https://你的项目.pages.dev` 或自定义域名 |

保持 `SITE_BASE` 未设置，使用默认根路径 `/`。输出目录相对于 `website`，因此填写 `dist`。Pages 自动安装依赖和发布构建结果，此流程无需额外的 Deploy command。

首次部署可先不填 `SITE_URL`；获得 Pages 域名后补填并重新部署，启用正确的 canonical 与分享地址。绑定自定义域名后，将其更新为自定义域名并重新部署。后续推送到 `main` 会触发 Pages 自动部署。

### Vercel / Netlify

将仓库连接到平台，Root directory 选择 `website`，Build command 填 `npm run build`，Output directory 填 `dist`。Node 版本使用 24。若平台不自动安装依赖，可用 `npm ci && npm run build`。

设置 `SITE_URL=https://你的实际域名`，用于 canonical 和社交分享 URL。不要填私人服务凭据。`public/_headers` 为 Pages / Netlify 配置安全及资源缓存头，其他平台可按需映射。

### Nginx / OSS 静态托管

上传 `dist/` 中的所有内容到站点根目录，默认文档 `index.html`，错误文档 `404.html`。`/privacy/` 必须按目录加载 `privacy/index.html`。Nginx 可用 `try_files $uri $uri/ =404;`，无需单页应用回退。

### 子路径（例如 GitHub Pages）

构建时设置 `SITE_BASE=/diary-app/`、`SITE_URL=https://你的账号.github.io`。内部资源与隐私页链接会适应该前缀。

```powershell
$env:SITE_BASE = '/diary-app/'
$env:SITE_URL = 'https://你的账号.github.io'
npm run build
```

恢复根路径构建时清除这两个进程环境变量。仓库工作流 `.github/workflows/website.yml` 只校验并上传静态构建包，不自动发布。

## 内容维护

- 主页面与下载入口：`src/pages/index.astro`。默认 APK 指向 GitHub 最新正式 Release，ZIP 指向正式 `releases/latest/` 通道。
- 数据说明：`src/pages/privacy.astro`，每次产品数据行为变化需同步。
- 色彩、断点和动效：`src/styles/global.css`。
- 样例日记与交互文案：`src/scripts/site.ts`。
- Canvas：`src/scripts/galaxy.ts`。
- `public/fonts/OFL-*.txt` 保留字体许可。字体增补可运行 `node scripts/subset-fonts.mjs`，需联网访问 Google Fonts 官方字体服务。

正式域名及部署平台尚未指定，当前交付为可部署的静态构建。未经确认不添加 ICP 备案号、评分、用户量、应用商店入口或尚未实现的能力。
