# 项目协作约定

## 版本与发布

- 涉及版本号、Android APK、应用内更新、Git 标签或 GitHub Release 的任务，开始前必须先阅读 `RELEASE.md` 和 `CHANGELOG.md`。
- `RELEASE.md` 是发布流程、当前版本基线、签名要求和发布历史索引的唯一维护入口。
- `CHANGELOG.md` 是功能新增、优化、修复以及数据兼容性变化的累计记录。
- 开发期间把用户可感知的变化追加到 `CHANGELOG.md` 的“未发布”部分；正式发布时将这些内容整理到新的版本标题下。
- 每次发布必须同步 Android `versionCode`、`versionName`、Web 工程版本、`WEB_VERSION`、发布 APK 和 `release/update.json`。
- 发布完成后必须更新 `RELEASE.md` 的“当前发布基线”和“发布历史索引”。
- 不得修改包名 `xyz.shiguangjian.app`，不得更换签名后声称支持覆盖升级，不得把卸载旧版作为更新步骤。
- 任何数据库结构调整都必须保留已有 SQLite 日记，并在 `CHANGELOG.md` 的“数据与兼容性”中说明迁移影响。

## 发布前最低验证

- 运行 `npm test` 和 `npm run build`。
- 运行 `npm run cap:sync`，然后在 `android` 目录执行 `.\gradlew.bat clean assembleDebug`。
- 校验最终 APK 的包名、版本号、签名证书和 SHA-256。
- 校验 GitHub Release 中的 APK 与 `update.json` 可公开访问且内容一致。
- 在保留真实日记的上一版 App 上执行覆盖安装和“升级验证”，禁止先卸载应用。

