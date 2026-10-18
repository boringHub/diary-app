# 项目协作约定

## 网络请求与邮箱职责

- Cloudflare 请求额度有限。新增网络行为前必须检查触发频率和必要性，优先使用业务请求本身的成功或失败响应，不额外发送健康检查、设备状态预检或授权测试请求。
- 进入设置、切换页面和读取本地设置不得触发连通性检测；测试阶段的诊断栏目在链路验收后移除。
- 后台同步必须先检查本地待办，空队列不得注册设备或查询远端；并发触发应合并，失败重试必须退避，永久失败停止自动重试。
- 回执仅在本地存在待确认分享时查询，查询间隔至少五分钟；尝试时间保存在本机，重启、切换前台或网络变化不得绕过间隔。
- “小提醒 / 我的收件邮箱”仅用于使用者接收通知。绑定、关闭、更换或解绑该邮箱不得影响向服务端固定分享邮箱发送日记。
- 创建日记只由“通知 / 询问 / 不通知”决定分享，默认询问；拒绝分享不产生网络发送。不得顺带向使用者邮箱发送旧版创建提醒。

## 版本与发布

- 涉及版本号、Android APK、应用内更新、Git 标签或 GitHub Release 的任务，开始前必须先阅读 `RELEASE.md`、`docs/RELEASE_CHANNELS.md`、`CHANGELOG.md` 和 `INTERNAL_CHANGELOG.md`。
- `RELEASE.md` 是发布流程、当前版本基线、签名要求和发布历史索引的唯一维护入口。
- `CHANGELOG.md` 是功能新增、优化、修复以及数据兼容性变化的累计记录。
- `INTERNAL_CHANGELOG.md` 只记录测试版测试目标、临时诊断、已知问题和验证结果，不得作为 GitHub 正式版公告来源。
- 开发期间把用户可感知的变化追加到 `CHANGELOG.md` 的“未发布”部分；正式发布时将这些内容整理到新的版本标题下。
- 每次发布必须同步 Android `versionCode`、`versionName`、Web 工程版本、`WEB_VERSION`、发布 APK 和 `release/update.json`。
- 每次发布必须同时创建 GitHub Release 并运行 `scripts/publish-oss.ps1` 同步阿里云 OSS；任何一侧未上传或未完成公开下载校验都不算发布完成。
- OSS 凭据优先从 Windows 用户级环境变量读取，位置为 `HKCU\Environment`；发布脚本也兼容系统级 `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment`。禁止把 AccessKey 写入仓库、`.env`、日志、命令历史或文档。
- 默认 OSS Endpoint 禁止公网直接分发 APK，因此应用备用下载使用只包含一个 APK 的 `shiguangjian-android.zip`；脚本仍同步 APK 对象，供未来配置自定义 CNAME 后使用。
- 更新检查和下载必须保持 GitHub 优先；GitHub 明确失败时立即切换，连接或读取连续 30 秒无响应时切换 OSS。不得在未更新文档和测试的情况下改变此策略。
- 发布完成后必须更新 `RELEASE.md` 的“当前发布基线”和“发布历史索引”。
- 不得修改包名 `xyz.shiguangjian.app`，不得更换签名后声称支持覆盖升级，不得把卸载旧版作为更新步骤。
- 正式版构建必须通过 `STABLE_KEYSTORE_FILE` 使用证书 SHA-256 为 `c6ef39d7955b402a7bfce9e9e9ce3a1a1bbcfa87c2cca4356c29eec7e9845d01` 的历史密钥；当前默认 Debug 密钥不能用于正式版。
- 本机历史正式密钥已恢复至 `%USERPROFILE%\.android\diary-stable.keystore`，用户级 `STABLE_KEYSTORE_FILE` 已指向该文件；后续正式版本沿用此私钥，不得删除、重新生成或提交仓库。
- 测试版固定使用包名 `xyz.shiguangjian.app.debug` 和 OSS `internal/` 更新通道；不得把测试清单或 APK 发布到正式版 `releases/` 路径。
- 测试版当前签名证书 SHA-256 固定为 `a490f52e123093f27b88d3c53b4a363798868f5d9808f366b134d1d13a29553c`，更换开发设备时必须恢复同一测试密钥。
- 测试版签名密钥默认路径为 `%USERPROFILE%\.android\diary-internal.keystore`，不得删除、重新生成或提交仓库。
- 内部测试发布使用 `scripts/publish-internal.ps1` 自动生成递增构建号，禁止手工复用已安装测试版的 `versionCode`。
- 正式发布前必须运行 `npm run release:validate`，并用 `npm run release:notes:stable -- X.Y.Z` 从指定正式版本生成 GitHub 公告；禁止手工从内部测试日志拼接公告。
- 内部发布默认从 `INTERNAL_CHANGELOG.md` 的“未发布”生成更新说明，OSS 校验成功后自动按实际内部版本归档。
- 任何数据库结构调整都必须保留已有 SQLite 日记，并在 `CHANGELOG.md` 的“数据与兼容性”中说明迁移影响。

## 发布前最低验证

- 运行 `npm test` 和 `npm run build`。
- 运行 `npm run release:validate`，确认正式与测试日志、清单和资源路径没有串用。
- 运行 `npm run cap:sync`，然后分别验证 `.\gradlew.bat assembleRelease` 与带内部版本参数的 `assembleDebug`。
- 校验最终 APK 的包名、版本号、签名证书和 SHA-256。
- 校验 GitHub Release 中的 APK 与 `update.json` 可公开访问且内容一致。
- 校验 OSS `releases/latest/update.json` 和 ZIP 可公开下载，解压后 APK 的 SHA-256 与清单一致。
- 在保留真实日记的上一版 App 上执行覆盖安装和“升级验证”，禁止先卸载应用。
