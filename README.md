# 拾光笺

拾光笺是一款本地优先的私人日记 App。日记以“记忆星球”呈现，可以旋转、搜索和聚焦每一段记录，并通过心情颜色区分当天状态。

项目目前处于 Android 开发预览阶段，核心日记流程和本地持久化已经可用，数据不会上传到服务器。

## 下载与安装

- [前往 Releases 下载 Android 安装包](https://github.com/boringHub/diary-app/releases/latest)
- [直接下载最新 Android APK](https://github.com/boringHub/diary-app/releases/latest/download/shiguangjian-android-debug.apk)

当前提供的是调试签名 APK，仅用于开发体验和功能测试。Android 安装时可能需要允许浏览器或文件管理器“安装未知应用”。升级安装前请保留相同签名；卸载应用会同时删除应用私有目录内的日记数据。

## 当前功能

- 记忆星球时间线，以及拖动、聚焦和入场动画
- 新建、编辑、查看和软删除日记
- 五种心情状态与对应星体颜色
- 收藏日记和按日期搜索
- Web 端 LocalStorage 持久化
- Android 端 SQLite 本地持久化
- 首次启动欢迎日记、加载状态和保存失败提示

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
