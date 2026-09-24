# 拾光笺

拾光笺是一款本地优先的私人日记 App。日记以“记忆星球”呈现，可以旋转、搜索和聚焦每一段记录，并通过心情颜色区分当天状态。

项目目前处于 Android 开发预览阶段，核心日记流程和本地持久化已经可用，数据不会上传到服务器。

## 维护文档

- [Android 版本更新与发布手册](RELEASE.md)：后续发布前必须先阅读，包含版本修改、构建、签名、发布、升级验证和数据保护步骤。
- [更新日志](CHANGELOG.md)：累计记录每个版本的新增功能、优化、修复和兼容性变化。

## 下载与安装

- [前往 Releases 下载 Android 安装包](https://github.com/boringHub/diary-app/releases/latest)
- [直接下载最新 Android APK](https://github.com/boringHub/diary-app/releases/latest/download/shiguangjian-android.apk)

当前提供的是调试签名 APK，仅用于开发体验和功能测试。Android 安装时可能需要允许浏览器或文件管理器“安装未知应用”。应用内支持在“设置 > 应用更新”中手动检查 GitHub Releases。

升级必须使用相同包名、相同签名和更高的 `versionCode` 进行覆盖安装。覆盖安装会保留应用私有目录中的 SQLite 日记；卸载应用会删除这些数据，因此更新流程不会提供“先卸载再安装”的降级方案。

## 当前功能

- 记忆星球时间线，以及拖动、聚焦和入场动画
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
- 更新包包名、版本号、签名和可选 SHA-256 完整性校验

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

SQLite V2 包含 `diaries`、`diary_blocks`、`diary_assets`、`diary_layouts`、`themes`、`theme_assets`、`app_settings` 和 `event_queue`。正文和图片分别保存为 `text`、`image` Block，图片文件位于 Capacitor `Directory.Data` 对应的应用私有目录，数据库只保存相对路径。

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

### 测试与生产构建

```bash
npm test
npm run build
```

当前阶段二验收包含 32 项 Vitest 测试，覆盖图片上限、旧 LocalStorage 兼容、主题 manifest、ZIP 包安全校验、SQLite 主题索引和 V1 → V2 数据保留迁移。

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
5. 建议同时上传名为 `update.json` 的发布清单，格式参考仓库根目录的 `update.example.json`，其中 SHA-256 必须由最终签名 APK 计算。
6. 在保留已有日记的真机上执行覆盖安装验证，禁止通过卸载应用来解决签名或版本问题。

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

- 下一阶段：日记保存事务写入 `event_queue`，仅发送允许的通知元数据，并支持失败重试与幂等
- 后续个性化：加入独立的日记板素材包安装与编辑器选择，不与全局界面主题混用
- 数据导出、导入与备份
- 正式签名的 Android Release 构建

## 说明

本仓库暂未声明开源许可证。除非后续添加许可证文件，否则源代码默认保留全部权利。
