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

SQLite V1 包含 `diaries`、`diary_blocks`、`diary_assets`、`diary_layouts`、`app_settings` 和 `event_queue`。当前正文保存为 `text` Block，后续图片功能将使用 `image` Block 和 `diary_assets`。

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

### 构建 Android APK

先让 Capacitor 同步 Web 产物和原生插件：

```bash
npm run cap:sync
```

Windows：

```powershell
cd android
.\gradlew.bat assembleDebug
```

macOS 或 Linux：

```bash
cd android
./gradlew assembleDebug
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
src/types/           领域类型
android/             Capacitor Android 工程
```

## 开发计划

- 图片选择与应用私有目录存储
- `diary_assets` 和 `image` Block 渲染
- 数据导出、导入与备份
- 主题系统和日记布局
- 正式签名的 Android Release 构建

## 说明

本仓库暂未声明开源许可证。除非后续添加许可证文件，否则源代码默认保留全部权利。
