# 拾光笺开发指南

面向参与开发与自行部署的贡献者。项目介绍与页面展示见 [README](../README.md)。

开始前请阅读仓库 [协作约定](../AGENTS.md)；发布流程以 [RELEASE.md](../RELEASE.md) 为准。

## 技术栈

- Ionic Vue 8
- Vue 3、TypeScript、Pinia、Vue Router
- Vite 6、Vitest
- Capacitor 8
- `@capacitor-community/sqlite`
- HTML5 Canvas

## 数据存储

项目通过异步 Repository 接口隔离页面与具体存储实现：

- 浏览器开发环境使用 `LocalStorageDiaryRepository`
- Android 原生环境使用 `SQLiteDiaryRepository`
- Android 数据库文件名为 `shiguangjianSQLite.db`
- Android 数据库位于应用私有目录，通常为 `/data/user/0/xyz.shiguangjian.app/databases/`

SQLite 当前为 V5。原有日记、图片、布局、主题、设置、通知队列和分享状态表继续保留；V5 增量增加 `tarot_readings`、`tarot_drawn_cards`、`tarot_messages`、`tarot_ai_requests` 和 `tarot_cleanup_outbox`。日记、主题、塔罗与设备身份共用串行调度的原生数据库连接，事务执行期间其他读写等待。正文和图片分别保存为 `text`、`image` Block，图片文件位于 Capacitor `Directory.Data` 对应的应用私有目录，数据库只保存相对路径。V3 新增通知队列重试索引，V4 新增分享状态和首次分享快照，V5 不重建原表，迁移保留已有数据。

浏览器日记继续使用 LocalStorage；塔罗记录独立使用 `shiguangjian.tarot.v1` IndexedDB，不与 Android 数据互通。塔罗目前没有导入导出或云端备份，卸载或清除数据会丢失本机记录。

从 V1 升级到 V2 时只新增主题索引表，不删除或重建已有日记数据。自动迁移测试会先创建 V1 日记、Block、图片和布局，再执行 V2 升级并核对原数据仍可读取。浏览器中的旧版 LocalStorage 文字日记会在读取时补齐 Block 和布局结构。

图片数量上限不只由页面控制，LocalStorage 和 SQLite Repository 在写入前也会校验每篇日记最多 5 张图片，避免绕过界面写入不兼容的数据。

## 全局界面主题

主题中心可以导入 ZIP 界面主题包。ZIP 根目录必须包含 `manifest.json`，清单使用 `schemaVersion: 1`，并声明稳定的 `id`、语义化 `version` 和全局界面颜色。选择主题后，时间线、编辑器、详情页、设置页、主题中心和底部导航会立即一起变化；主题选择只保存在 App 设置中，不写入单篇日记。

- 压缩包不超过 20 MB，解压后不超过 40 MB，文件数不超过 128
- 拒绝绝对路径、Windows 路径、URL 和 `..` 等越界路径
- 文件保存在 `Directory.Data/themes/{themeId}/{version}/`，同一版本不会被覆盖
- Android 会在事务中写入 `themes` 清单索引；`theme_assets` 表暂为旧结构兼容保留
- 导入或索引失败时会回滚清单记录并删除本次新写入的主题目录

全局界面主题与日记板素材包是两个独立系统。日记保存 `boardPackId + boardPackVersion` 和只引用 `blockId`、`assetId` 的固定布局；当前版本统一使用默认日记板。后续会在写日记时加入日记板素材包选择器，用背景板、贴纸和装饰实现每篇日记的个性化，不影响 App 的全局界面主题。

## 本地开发

### 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- Android Studio 与 Android SDK（构建 Android 时需要）
- JDK 21（构建 Android 时需要）

### 启动 Web 开发环境

```bash
git clone https://github.com/boringHub/shiguangjian.git
cd shiguangjian
npm ci
npm run dev
```

Web 预览的日记使用 LocalStorage，塔罗使用 IndexedDB；不注册生产设备、不请求通知或模型 API，也不提供邮箱绑定能力。

### 可选的邮件通知接入

公开仓库不包含当前托管的通知服务端。只需要本地日记功能时，无需准备 Cloudflare 或 Resend，并保持 `VITE_NOTIFY_API_ORIGIN` 为空：

```bash
cp .env.example .env.local
```

需要邮件功能的部署者，应自行实现或部署与 App 兼容的设备签名、邮箱验证、通知设置和事件接收 API。推荐基础设施包括：

- Cloudflare Workers：提供 HTTPS API
- Cloudflare D1：保存设备、邮箱验证和投递状态
- Cloudflare Queues 与 DLQ：异步投递和失败处理
- Resend：发送验证邮件和提醒邮件
- 已在 Resend 验证的发送域名

服务端至少需要配置 `RESEND_API_KEY`、`EMAIL_VERIFICATION_PEPPER` 和 `NOTIFICATION_TOKEN_SECRET` 等 Secrets，并在 App 本地构建配置中设置：

```dotenv
VITE_NOTIFY_API_ORIGIN=https://your-api.example.com
```

该值只填写 API Origin，不带路径。必须使用 HTTPS。`VITE_*` 会被 Vite 打包进 APK，因此这里只能放公开的 API 地址，绝不能放 Resend API Key、Cloudflare Secret、私人收件邮箱或其他凭据。留空会生成完全不接入通知服务的本地模式构建。

邮件接入必须保持以下边界：日记先完成本地保存，API 未配置、离线或投递失败都不能使日记保存失败。创建通知默认询问，选择分享后才建立快照；也可在详情页手动确认分享。分享 V2 发送该篇标题和纯文本正文，不发送图片、布局或本地路径；旧版 V1 事件仍只允许发送 `eventId`、`eventType`、`occurredAt`、`mood` 和 `deviceId` 五项元数据。使用者通知邮箱与固定分享邮箱独立，关闭或解绑小提醒不影响日记分享。

设置页的“反馈建议”使用独立的设备签名接口 `POST /v1/feedback`，提交字段只有 `feedbackId` 和 `content`，正文为 1 至 2,000 字。收件邮箱由服务端配置，默认与日记分享接收邮箱相同，也可单独配置 `FEEDBACK_RECIPIENT_EMAIL`。服务端入队后返回 `202 accepted`，不应等待 Resend 完成投递再响应。反馈不要求绑定使用者邮箱；打开编辑器和保存本机草稿不联网，响应超时保留同一编号以便安全重试。未接入 API 的构建可以保存草稿，本地日记照常使用。

### 测试与生产构建

```bash
npm test
npm run build
```

测试覆盖图片上限、旧 LocalStorage 兼容、主题 manifest、ZIP 包安全校验、SQLite 数据保留迁移、设备认证、分享状态、回执去重、请求限频和并发同步，以及塔罗卡面校验、洗切与快照、上下文隐私、SSE、共享数据库事务和系统主题背景同步。

### 构建 Android APK

先让 Capacitor 同步 Web 产物和原生插件：

```bash
npm run cap:sync
```

Windows：

```powershell
cd android
.\gradlew.bat clean assembleDebug --no-problems-report
```

macOS 或 Linux：

```bash
cd android
./gradlew clean assembleDebug --no-problems-report
```

APK 输出位置：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Android SDK 的本地路径写在被 Git 忽略的 `android/local.properties` 中，不应提交到仓库。

## 发布 Android 更新

完整发布流程、当前版本基线、签名指纹和发布历史统一维护在 [RELEASE.md](../RELEASE.md)。以下仅保留不可省略的发布原则。

每次准备 GitHub Release 时必须完成以下事项：

1. 保持 `applicationId` 为 `xyz.shiguangjian.app`，不得修改包名。
2. 将 `android/app/build.gradle` 中的 `versionCode` 至少增加 1，并同步增加 `versionName`。
3. 使用与上一版完全相同的历史签名密钥，通过 `STABLE_KEYSTORE_FILE` 提供；当前正式渠道采用 Release 构建，证书和跨设备恢复要求以 `RELEASE.md` 为准。迁移到不同签名会被 Android 拒绝。
4. 将 APK 上传为 `shiguangjian-android.apk`，Release 标签与 `versionName` 保持一致，例如 `v1.2.0`。
5. 同时上传名为 `update.json` 的发布清单，格式参考仓库根目录的 `update.example.json`，其中 SHA-256 和大小必须由最终签名 APK 计算。
6. 运行 `scripts/publish-oss.ps1`，同步版本目录和 `releases/latest` 下的 APK、ZIP 与清单，并通过公开地址复核 ZIP 内 APK 的哈希。
7. 在保留已有日记的真机上执行覆盖安装验证，禁止通过卸载应用来解决签名或版本问题。
8. 运行 `npm run release:validate`，再用 `npm run release:notes:stable -- X.Y.Z` 生成 `release/github-release-notes.md` 作为唯一正式公告来源。

应用下载 APK 后会再次校验包名、内部 `versionCode` 和签名证书。任一项不匹配都会停止安装，以避免错误更新影响本机数据。

## 项目结构

```text
src/pages/           页面与交互
src/features/tarot/  塔罗页面、领域逻辑、存储与 AI 客户端
src/stores/          Pinia 状态管理
src/repositories/    Web/Android 数据适配器
src/services/        图片文件、主题和应用更新服务
src/types/           领域类型
android/             Capacitor Android 工程
```

## 更多维护资料

- [App 端开发设计](../App端开发设计文档.md)
- [星语塔罗设计与实现](tarot/README.md)
- [官网开发与部署](../website/README.md)
- [正式与测试渠道](RELEASE_CHANNELS.md)
- [内部测试记录](../INTERNAL_CHANGELOG.md)
