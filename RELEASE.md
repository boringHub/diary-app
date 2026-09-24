# Android 版本更新与发布手册

> 后续开发者或 AI 准备发布版本时，先阅读本文件，再阅读 [CHANGELOG.md](CHANGELOG.md)。
> 本文件记录固定发布流程、当前发布基线和历史发布索引；`CHANGELOG.md` 累计记录每个版本的功能、优化和修复。

## 快速发布步骤

每次发布严格按以下顺序执行，不要跳过版本、签名、数据保留或公开资源检查。

1. 确认工作区和远端基线：

   ```powershell
   git status --short
   git branch --show-current
   git pull --ff-only origin main
   ```

2. 确定新版本号。每次 Android 发布必须同时满足：

   - `versionCode` 大于所有已发布版本，必须递增，不能复用或降低。
   - `versionName` 使用语义化版本，例如 `1.2.1`、`1.3.0`、`2.0.0`。
   - Git 标签使用 `v{versionName}`，例如 `v1.3.0`。

3. 同步修改以下版本位置，四处必须一致：

   - `android/app/build.gradle`：`versionCode`、`versionName`
   - `package.json`：`version`
   - `package-lock.json`：根版本和 `packages[""]` 版本
   - `src/services/appUpdateService.ts`：`WEB_VERSION`

4. 整理 `CHANGELOG.md` 的“未发布”内容并创建本次版本标题，不覆盖历史记录。开发过程中应随功能修改持续累计到“未发布”，发布时再归入正式版本。至少按实际情况记录：

   - `新增`：新功能和新入口
   - `优化`：交互、性能、布局、兼容性和工程流程改进
   - `修复`：问题现象、影响机型或场景
   - `数据与兼容性`：数据库迁移、数据保留、最低系统要求和升级限制

5. 运行测试并同步 Android：

   ```powershell
   npm ci
   npm test
   npm run cap:sync
   ```

6. 从 Android 工程目录执行全量构建：

   ```powershell
   Push-Location android
   .\gradlew.bat clean assembleDebug
   Pop-Location
   ```

   当前发布链路使用 Debug APK，输出文件为：

   ```text
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

7. 检查最终 APK 元数据。包名必须保持 `xyz.shiguangjian.app`，内部版本必须等于本次发布版本：

   ```powershell
   $apk = Resolve-Path 'android/app/build/outputs/apk/debug/app-debug.apk'
   $aapt2 = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools" -Recurse -Filter aapt2.exe |
     Sort-Object FullName -Descending |
     Select-Object -First 1
   & $aapt2.FullName dump badging $apk | Select-String 'package:'
   ```

8. 检查签名。最终 APK 的证书 SHA-256 必须等于当前发布证书指纹：

   ```text
   c6ef39d7955b402a7bfce9e9e9ce3a1a1bbcfa87c2cca4356c29eec7e9845d01
   ```

   Windows 检查命令：

   ```powershell
   $apk = Resolve-Path 'android/app/build/outputs/apk/debug/app-debug.apk'
   $apksigner = Get-ChildItem "$env:LOCALAPPDATA\Android\Sdk\build-tools" -Recurse -Filter apksigner.bat |
     Sort-Object FullName -Descending |
     Select-Object -First 1
   & $apksigner.FullName verify --print-certs $apk
   ```

9. 生成发布文件和 SHA-256：

   ```powershell
   Copy-Item `
     'android/app/build/outputs/apk/debug/app-debug.apk' `
     'release/shiguangjian-android.apk' `
     -Force

   $sha256 = (Get-FileHash 'release/shiguangjian-android.apk' -Algorithm SHA256).Hash.ToLowerInvariant()
   $sha256
   ```

10. 更新 `release/update.json`：

    ```json
    {
      "versionCode": 4,
      "versionName": "1.3.0",
      "apk": "shiguangjian-android.apk",
      "sha256": "最终 APK 的小写 SHA-256"
    }
    ```

    `versionCode` 和 `versionName` 必须与 APK 内部值一致，`apk` 文件名不要修改。

11. 执行最终检查：

    ```powershell
    npm test
    npm run build
    git diff --check
    git status --short
    ```

12. 提交、打标签并推送。把示例版本替换为本次实际版本：

    ```powershell
    git add -A
    git commit -m "feat: publish v1.3.0"
    git tag -a v1.3.0 -m "拾光笺 v1.3.0"
    git push origin main
    git push origin v1.3.0
    ```

13. 在 GitHub Releases 创建与标签一致的公开 Release，并上传以下两个文件：

    - `release/shiguangjian-android.apk`
    - `release/update.json`

    Release 标题使用 `拾光笺 v{versionName}`。正文从本次 `CHANGELOG.md` 提取，并明确写明“直接覆盖安装，请勿先卸载”。

14. 发布后通过公开地址复核，不能只检查本地文件：

    ```powershell
    Invoke-RestMethod `
      'https://github.com/boringHub/diary-app/releases/latest/download/update.json' `
      -Headers @{ 'User-Agent' = 'diary-app-release-verifier' }
    ```

    同时确认最新 Release 页面包含 APK 和 `update.json`：

    ```text
    https://github.com/boringHub/diary-app/releases/latest
    ```

15. 在保留真实日记的上一版 App 上完成升级测试：

    - 更新前记录当前版本和日记数量。
    - 在“设置 > 检查更新”中发现新版本。
    - 下载并执行系统覆盖安装，全程不要卸载旧版。
    - 更新后确认版本号、App 图标、关键功能和已有日记正常。
    - 点击“设置 > 升级验证”，确认 SQLite 数据库可读取且日记数量未减少。

## 版本号规则

- 补丁版本，例如 `1.2.0 -> 1.2.1`：问题修复、小范围兼容性或文案调整。
- 次版本，例如 `1.2.0 -> 1.3.0`：向后兼容的新功能或明显功能优化。
- 主版本，例如 `1.x -> 2.0.0`：存在不兼容的数据结构、交互或产品方向变化。
- `versionCode` 与语义化版本没有数学换算关系，只要求每次 Android 发布严格递增。
- 草稿、重新构建和同版本 APK 不得覆盖已公开 Release。代码或 APK 有变化时必须使用新的 `versionCode`。

## 数据保护红线

- 永远不要把“卸载后重装”作为升级步骤。卸载会删除应用私有目录中的 SQLite 日记和设置。
- 不得修改 Android 包名 `xyz.shiguangjian.app`，否则系统会视为另一个应用。
- 不得更换签名后继续声称可以覆盖升级。Android 会拒绝不同签名的 APK，应用内更新插件也会拦截。
- 发布流程不得删除、重建或清空 `shiguangjianSQLite.db`。
- 修改 SQLite 表结构时必须使用可重复执行、向前兼容的迁移，发布记录中必须单独说明迁移和回滚风险。
- `release/update.json` 必须使用最终签名 APK 的 SHA-256，不能使用构建前文件或临时 APK 的哈希。

## 签名密钥保管

当前已发布 APK 使用本机默认 Android Debug 密钥，默认位置为：

```text
%USERPROFILE%\.android\debug.keystore
```

- 该文件没有提交到 Git 仓库，也不应该提交到公开仓库。
- 必须在受控位置保留备份。丢失或重新生成后，即使包名相同，Android 也无法覆盖安装当前用户设备上的版本。
- 换电脑或重装系统后，构建发布 APK 前必须恢复同一份密钥，并用证书 SHA-256 与本文件记录的指纹对比。
- 正式签名前需要单独制定迁移方案；不能直接用新证书覆盖当前 Debug 签名安装包。

## 当前发布基线

后续发布开始前，先以此表和 GitHub 最新 Release 交叉确认，不要仅凭记忆推断当前版本。

| 项目 | 当前值 |
| --- | --- |
| 最新版本 | `1.3.0` |
| Android `versionCode` | `4` |
| Git 标签 | `v1.3.0` |
| 分支 | `main` |
| 包名 | `xyz.shiguangjian.app` |
| APK 资源名 | `shiguangjian-android.apk` |
| 更新清单名 | `update.json` |
| 签名类型 | Android Debug 签名，当前仅用于开发测试 |
| 签名证书 SHA-256 | `c6ef39d7955b402a7bfce9e9e9ce3a1a1bbcfa87c2cca4356c29eec7e9845d01` |
| v1.3.0 APK SHA-256 | `6b0bc9a16c41019460d92bc0380b5ec787167699cf2f04a3169faef96e22f031` |
| 最新 Release | <https://github.com/boringHub/diary-app/releases/latest> |

发布正式签名 APK 前必须单独设计签名迁移方案。当前已安装的 Debug 签名版本不能直接覆盖为另一证书签名的 APK。

## 发布文件职责

| 文件 | 作用 | 每次发布是否更新 |
| --- | --- | --- |
| `RELEASE.md` | 固定流程、当前基线、发布索引和维护约定 | 是，更新当前基线和发布索引 |
| `CHANGELOG.md` | 累计记录新增、优化、修复和数据兼容性 | 是，在顶部追加版本 |
| `android/app/build.gradle` | Android 内部版本和对外版本 | 是 |
| `package.json`、`package-lock.json` | Web 工程版本 | 是 |
| `src/services/appUpdateService.ts` | Web 环境回退版本 | 是 |
| `release/shiguangjian-android.apk` | GitHub Release 最终安装包 | 是 |
| `release/update.json` | 应用内更新使用的版本、APK 名称和哈希 | 是 |
| `update.example.json` | 更新清单格式示例 | 仅格式变化时更新 |

## 发布历史索引

详细功能变化以 [CHANGELOG.md](CHANGELOG.md) 为准。此表用于快速定位版本、构建编号、发布资源和升级重点。

| 版本 | versionCode | 日期 | APK SHA-256 | 主要内容 |
| --- | ---: | --- | --- | --- |
| `1.3.0` | 4 | 2026-09-24 | `6b0bc9a16c41019460d92bc0380b5ec787167699cf2f04a3169faef96e22f031` | 最多 5 张本地图片、全局界面主题、ZIP 主题导入和日记板素材包数据边界 |
| `1.2.0` | 3 | 2026-09-24 | `9642c7ab295f4c7a979a3dc95df2f299215c90e1f8fe1b6cb478d8b22516eefe` | 新 App 图标、升级验证、vivo/OriginOS 顶部启动图与安全区修复 |
| `1.1.0` | 2 | 2026-09-23 | `c9cb1eb20fa1715cb054c7ba1638ec88d34481705f9807bf7ddd8a186b9c933f` | 应用内检查更新、安全下载与覆盖安装校验、首轮图标和多机型布局优化 |
| `1.0` | 1 | 2026-09-23 | 未保留公开发布哈希 | Android 本地持久化开发预览基线 |

## 每次发布后的文档更新模板

发布完成后，在本文件中完成以下维护：

1. 更新“当前发布基线”的版本、`versionCode`、标签和 APK SHA-256。
2. 在“发布历史索引”顶部增加一行。
3. 在 `CHANGELOG.md` 顶部增加完整版本记录。
4. 确认 README 的功能描述仍与已发布版本一致。
5. 如发布步骤、签名方式、资源名或更新接口发生变化，立即修改本文件，不能只记录在对话中。

开发期间先把变化累计在“未发布”部分：

```markdown
## 未发布

### 新增

- 正在开发、尚未发布的新功能
```

正式发布时把“未发布”中的内容移入以下新版本模板，并保留一个空的“未发布”标题供后续迭代使用：

```markdown
## X.Y.Z - YYYY-MM-DD

### 新增

- 新功能

### 优化

- 性能、交互、布局或发布流程优化

### 修复

- 修复的问题和影响场景

### 数据与兼容性

- 数据迁移、数据保留、系统版本或升级注意事项
```
