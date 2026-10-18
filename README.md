# 拾光笺

拾光笺是一款本地优先的私人日记 App。日记以“记忆星球”呈现，可以旋转、搜索和聚焦每一段记录，并通过心情颜色区分当天状态。

项目目前处于 Android 开发预览阶段，核心日记流程和本地持久化已经可用。新建、查看、编辑和删除日记不依赖 API、Cloudflare、Resend 或网络连接。邮件通知属于可选增强；未配置服务端或服务暂时不可用时，日记仍会先在本机正常保存。

## 维护文档

- [Android 版本更新与发布手册](RELEASE.md)：后续发布前必须先阅读，包含版本修改、构建、签名、发布、升级验证和数据保护步骤。
- [正式版与测试版渠道规范](docs/RELEASE_CHANNELS.md)：定义包名、更新源、迭代日志和公告防误发流程。
- [更新日志](CHANGELOG.md)：累计记录每个版本的新增功能、优化、修复和兼容性变化。
- [内部测试版迭代日志](INTERNAL_CHANGELOG.md)：记录测试目标、临时诊断、已知问题和验证结果，不用于 GitHub 正式公告。

## 下载与安装

- [前往 Releases 下载 Android 安装包](https://github.com/boringHub/diary-app/releases/latest)
- [直接下载最新 Android APK](https://github.com/boringHub/diary-app/releases/latest/download/shiguangjian-android.apk)
- GitHub 下载连续 30 秒没有响应时，应用会自动切换到阿里云 OSS 备用下载；设置页会显示当前来源、下载进度、校验和安装状态。

当前提供的是调试签名 APK，仅用于开发体验和功能测试。Android 安装时可能需要允许浏览器或文件管理器“安装未知应用”。应用内支持在“设置 > 应用更新”中手动检查 GitHub Releases。

升级必须使用相同包名、相同签名和更高的 `versionCode` 进行覆盖安装。覆盖安装会保留应用私有目录中的 SQLite 日记；卸载应用会删除这些数据，因此更新流程不会提供“先卸载再安装”的降级方案。

## 当前功能

- 全屏记忆星球时间线，支持拖动、双指及滚轮缩放、聚焦和流星转场
- 从添加按钮抽出和收回的新建日记页，详情页光晕展开与返回动画
- 新建、编辑、查看和软删除日记
- 五种心情状态与对应星体颜色
- 收藏日记和按日期搜索
- Web 端 LocalStorage 持久化
- Android 端 SQLite 本地持久化
- 最多 5 张日记图片的选择、预览、私有目录保存和详情展示
- 三套内置全局界面主题、ZIP 界面主题包导入和即时全局切换
- 每篇日记独立保存固定布局和日记板素材包标识，为后续个性化日记板预留边界
- 首次启动欢迎日记、加载状态和保存失败提示
- 设置页手动检查更新、APK 下载和系统安装引导
- GitHub 优先、30 秒无响应自动切换阿里云 OSS 的双源更新下载和可视化进度
- 更新包包名、版本号、签名和可选 SHA-256 完整性校验
- 可选的单篇日记分享、发送状态、失败重试、回执同步和首次已读提示
- 独立的使用者通知邮箱验证与开关，设备公钥认证和本地待办退避重试

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

SQLite V4 包含 `diaries`、`diary_blocks`、`diary_assets`、`diary_layouts`、`themes`、`theme_assets`、`app_settings`、`event_queue` 和 `diary_share_states`。正文和图片分别保存为 `text`、`image` Block，图片文件位于 Capacitor `Directory.Data` 对应的应用私有目录，数据库只保存相对路径。V3 新增通知队列重试索引，V4 新增分享状态和首次分享快照，迁移保留已有数据。

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
git clone https://github.com/boringHub/diary-app.git
cd diary-app
npm ci
npm run dev
```

Web 预览只使用 LocalStorage，不注册设备、不请求通知 API，也不提供邮箱绑定能力。

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

### 测试与生产构建

```bash
npm test
npm run build
```

测试覆盖图片上限、旧 LocalStorage 兼容、主题 manifest、ZIP 包安全校验、SQLite 数据保留迁移、设备认证、分享状态、回执去重、请求限频和并发同步。

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

完整发布流程、当前版本基线、签名指纹和发布历史统一维护在 [RELEASE.md](RELEASE.md)。以下仅保留不可省略的发布原则。

每次准备 GitHub Release 时必须完成以下事项：

1. 保持 `applicationId` 为 `xyz.shiguangjian.app`，不得修改包名。
2. 将 `android/app/build.gradle` 中的 `versionCode` 至少增加 1，并同步增加 `versionName`。
3. 使用与上一版完全相同的签名密钥。当前公开版本为调试签名，下一次覆盖升级必须保留构建该 APK 的原始调试密钥；迁移到不同签名会被 Android 拒绝。
4. 将 APK 上传为 `shiguangjian-android.apk`，Release 标签与 `versionName` 保持一致，例如 `v1.2.0`。
5. 同时上传名为 `update.json` 的发布清单，格式参考仓库根目录的 `update.example.json`，其中 SHA-256 和大小必须由最终签名 APK 计算。
6. 运行 `scripts/publish-oss.ps1`，同步版本目录和 `releases/latest` 下的 APK、ZIP 与清单，并通过公开地址复核 ZIP 内 APK 的哈希。
7. 在保留已有日记的真机上执行覆盖安装验证，禁止通过卸载应用来解决签名或版本问题。
8. 运行 `npm run release:validate`，再用 `npm run release:notes:stable -- X.Y.Z` 生成 `release/github-release-notes.md` 作为唯一正式公告来源。

应用下载 APK 后会再次校验包名、内部 `versionCode` 和签名证书。任一项不匹配都会停止安装，以避免错误更新影响本机数据。

## 项目结构

```text
src/pages/           页面与交互
src/stores/          Pinia 状态管理
src/repositories/    Web/Android 数据适配器
src/services/        图片文件、主题和应用更新服务
src/types/           领域类型
android/             Capacitor Android 工程
```

## 开发计划

- 当前阶段：可选的设备公钥认证、邮箱验证、最小元数据事件队列和邮件投递已经完成私有环境联调；公开构建未配置 API 时保持纯本地运行
- 后续个性化：加入独立的日记板素材包安装与编辑器选择，不与全局界面主题混用
- 数据导出、导入与备份
- 正式签名的 Android Release 构建

## 说明

本仓库暂未声明开源许可证。除非后续添加许可证文件，否则源代码默认保留全部权利。
