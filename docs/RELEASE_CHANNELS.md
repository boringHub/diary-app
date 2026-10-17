# Android 双渠道版本管理规范

本项目长期维护两个彼此隔离的 Android 发布渠道。渠道信息、安装包、更新清单和迭代记录不得混用。

| 项目 | 正式版 | 内部测试版 |
| --- | --- | --- |
| Android 包名 | `xyz.shiguangjian.app` | `xyz.shiguangjian.app.debug` |
| App 名称 | 拾光笺 | 拾光笺 测试版 |
| 版本名 | `X.Y.Z` | `X.Y.Z-internal.YYYYMMDD.HHmmss` |
| 构建命令 | `npm run android:build:stable` | `npm run android:build:internal` |
| 发布命令 | GitHub Release + `scripts/publish-oss.ps1` | `npm run android:publish:internal` |
| 更新来源 | GitHub `releases/`，失败后 OSS `releases/` | 仅 OSS `internal/` |
| 迭代记录 | `CHANGELOG.md` | `INTERNAL_CHANGELOG.md` |
| 公告生成 | `npm run release:notes:stable -- X.Y.Z` | 发布脚本自动读取内部日志 |

## 记录边界

- `CHANGELOG.md` 只维护准备面向正式用户发布的功能、修复和兼容性变化。GitHub Release 公告只能由这里已归档的正式版本生成。
- `INTERNAL_CHANGELOG.md` 维护测试包每次迭代的测试目标、临时诊断功能、已知问题和验证结果。测试过程中的临时变化不得直接复制到 GitHub Release。
- 同一项功能可以先进入内部测试日志；确认可进入正式版后，再以面向用户的表述写入 `CHANGELOG.md` 的“未发布”部分。不要直接搬运测试过程、设备信息或临时开关。
- 正式版本号、标签和公告不得包含 `internal`；内部测试版不得创建 Git 标签或 GitHub Release。

## 正式发布防误发流程

1. 将正式变更从 `CHANGELOG.md` 的“未发布”整理到 `## X.Y.Z - YYYY-MM-DD`。
2. 执行 `npm run release:validate`，确认正式清单没有引用 `internal/`，两份日志的版本标题符合各自规则。
3. 执行 `npm run release:notes:stable -- X.Y.Z`。脚本只从 `CHANGELOG.md` 的指定正式版本提取内容，并拒绝测试包名、内部 OSS 路径或内部安装包名称。
4. 使用生成的 `release/github-release-notes.md` 创建 GitHub Release，不手工从 `INTERNAL_CHANGELOG.md` 复制公告。
5. GitHub 标签必须是 `vX.Y.Z`，上传资源只能是 `release/shiguangjian-android.apk` 和 `release/update.json`。

## 内部测试迭代流程

1. 开发或修复完成后，把本次测试目标和变更写入 `INTERNAL_CHANGELOG.md` 的“未发布”。
2. 执行 `npm run android:publish:internal`。发布脚本默认从内部日志生成更新说明，不读取正式 `CHANGELOG.md`。
3. OSS 公网产物校验成功后，脚本自动把“未发布”归档到实际的内部版本号，并重新建立空的“未发布”模板。
4. 将代码和已归档的内部日志一并提交。内部 APK、ZIP、临时公告文件继续由 `.gitignore` 排除。

## 发布前检查

- 正式版包名和证书必须匹配正式基线；测试版包名和证书必须匹配内部基线。
- 正式 `release/update.json` 只能使用 `/releases/` 地址，内部清单只能使用 `/internal/` 地址。
- 正式公告中不得出现 `xyz.shiguangjian.app.debug`、`shiguangjian-internal`、`internal/latest` 或 `internal/builds`。
- 测试版的设备数据、诊断结论和已知问题只记录在内部日志，除非它们最终成为正式用户需要了解的兼容性说明。
