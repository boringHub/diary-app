# 拾光笺 App 端开发设计文档

## 1. 目标

App 端使用 Vue 3 开发，在浏览器中完成页面和业务调试，稳定后通过 Capacitor 打包为 Android APK/AAB。

```text
Vue 3 + TypeScript + Vite
        ↓
Vue Router + Pinia
        ↓
Repository / Service
        ↓
浏览器适配器 或 Capacitor 原生适配器
        ↓
SQLite + App 私有文件 + 网络通知
```

产品数据边界沿用《总体数据架构设计.md》：日记正文、标题、图片和布局只保存在设备本地；通知 API 只接收经过允许的操作元数据。

## 1.1 基础文案与交流语气

拾光笺是写给亲密关系中的日常使用者的私人日记 App，界面文案应像熟悉的人在轻声说话，亲切、简单、有一点可爱，但不影响理解和操作。后续新增页面、按钮、空状态、Toast、弹窗和更新提示都遵循以下准则：

- 优先使用自然口语，少用“系统将”“操作失败”“确认执行”等官方、呆板的表达；可以使用“呀”“哦”“啦”“~”等轻量语气词，让界面更有陪伴感。
- 在合适的非正式场景加入少量拟声词、符号或颜文字，例如“到啦~”“好哒”“(｡･ω･｡)”，但不要每句话都卖萌，也不要让文案显得吵闹。
- 关键动作必须保持短、清楚、可扫描。删除、覆盖安装、权限、数据保存和错误提示即使语气柔和，也要明确说明后果和下一步。
- 称呼和语气保持温柔平等，不使用居高临下、过度营销或强迫用户做决定的表达。
- 文案优先描述用户此刻能感受到的结果，例如“这一天还没有星星哦，写一篇吧~”，而不是只描述内部实现。

示例：使用“没保存好，再试一次哦”替代“保存失败，请稍后重试”；使用“真的要删掉这篇吗？”搭配明确的“删掉”操作；使用“会保留本机日记，先别卸载应用哦”说明覆盖升级的实际影响。

## 2. 技术选型

### 网络请求准则与邮箱职责

- 使用者在“小提醒”中绑定的是自己的收件邮箱，用于接收面向使用者的通知；固定分享邮箱由部署者在服务端配置。两者独立，使用者未绑定、关闭或解绑邮箱均可按创建日记通知设置分享。
- 新建日记只按“通知 / 询问 / 不通知”处理正文分享，不再生成发往使用者邮箱的 `diary_created` 提醒。新版本公告的群发投递另行实现，绑定邮箱本身不代表已自动发送公告。
- 设置页移除“日记分享权限”诊断栏，进入页面只读本地状态。实际分享请求在服务端完成必要授权，以响应判断提交结果；不提前测试连接、检测设备状态或调用自动授权接口。
- 后台同步先查本地待办，空队列不联网；有待确认分享才查回执，至少五分钟一次并持久记录尝试时间。前台和网络变化合并触发，临时错误退避，永久错误停止。
- 已注册设备直接执行带签名的业务请求；仅在业务响应指出身份失效时才进入身份恢复流程。

| 层 | 初版技术 | 责任 |
| --- | --- | --- |
| 构建 | Vite | 本地开发、热更新、生产构建 |
| UI | Vue 3 + 自定义 CSS | 日记时间线、编辑、主题和设置 |
| 路由 | Vue Router | 页面导航和返回栈 |
| 状态 | Pinia | 当前日记、设置和主题状态 |
| 校验 | TypeScript，后续加入 Zod | 模型和 API 边界校验 |
| 浏览器存储 | LocalStorageAdapter | 第一阶段页面调试 |
| Android 存储 | Capacitor SQLite + Filesystem | 正式本地数据和文件 |
| 打包 | Capacitor | Android APK/AAB |
| 测试 | Vitest + Playwright | 业务单测和页面验收 |

原生适配器不直接暴露给页面组件。页面只能调用 Store、Use Case 或 Repository，保证浏览器和 Android 环境可以替换实现。

## 3. 页面范围

```text
/timeline       首页/日记时间线
/diary/new      新建日记
/diary/:id      日记详情
/diary/:id/edit 编辑日记
/themes         主题中心
/settings       设置
```

第一阶段已实现记忆星球首页、新建文字日记、心情、收藏、软删除、详情查看和基础设置入口。第二阶段已接入图片 Block、应用私有文件、SQLite V2、全局界面主题、ZIP 界面主题包导入、日记板数据边界和固定布局。第三阶段已完成设备身份、通知事件队列、邮箱验证、服务端异步投递和设置页管理流程。

### 3.1 记忆星球首页（/timeline）

时间线不再使用普通卡片列表，改为可旋转的“记忆星球”。每篇日记对应一颗真实星星，星星以球面坐标分布，装饰星只用于填充空间，不能进入详情。

#### 核心交互

```text
进入页面 → 随机选择日记 → 球体平滑旋转 → 星星到达中心 → 展示心情气泡
拖拽星球 → 反向滚动 → 松手后轻微吸附 → 只有真实星星进入隐形聚焦范围才显示气泡
双指张合 / 鼠标滚轮 → 在 0.65x–1.75x 范围内连续缩放 → 松手后重新寻找中心星星
搜索日期 → 匹配本地日期 → 单篇聚焦 / 同日星群聚集 / 无结果提示
点击星星 → 第一次聚焦，第二次点击当前聚焦星进入现有详情页 → 返回时保留球体角度和聚焦对象
```

- 屏幕中心是隐形聚焦范围的参考位置，不绘制圆环、十字线或其他瞄准辅助线。
- 只有有日记的真实星星进入隐形范围且位于球体正面时，才成为聚焦对象并在星星上方渐显心情气泡；装饰星永远不会触发气泡。
- 点击星星先聚焦，点击当前星星或气泡再进入详情，避免拖拽误触。
- 星球支持以画布中心为锚点的双指缩放；缩放过程中隐藏旧的聚焦气泡，避免气泡与星星位置脱节。桌面端使用鼠标滚轮或触控板滚动完成等价缩放。
- 双指手势结束后若仍有一根手指停留在画布上，应从当前角度无跳变地继续旋转；缩放倍率限制在 `0.65x–1.75x`，避免星球过小难以点击或过大完全失去方位。
- 星球不绘制封闭的球面光晕或轨道边界；星球 Canvas 舞台直接覆盖整个星球页，从页面四边铺满，不再被顶部工具栏、底部提示或固定高度的内层区域夹住。装饰星场直接覆盖整个 Canvas 的显示区域，不受圆形或固定半径边界限制。放大时按倍率逐步淡入额外装饰星，扩大视野后仍保持连续、密集的星空，不出现明显空圈。
- 未聚焦时球体中央不放置提示文字或按钮，避免遮挡星星和拖拽路径；真实日记星进入隐形聚焦范围后，保留星星上方的轻量心情气泡，用于显示心情和日期。气泡不接收指针事件，不影响拖拽。
- 同一天多篇日记进入聚集模式：星星在中心附近以小环形排列，当前星星的心情气泡和进入入口仍保持简洁；点击星群内另一颗星可切换当前心情，重复点击或入口进入详情。
- 日期搜索收纳为右上角圆形按钮，点击后在同一位置展开日期选择框；随机回望与搜索保持同尺寸，左上角不展示标题、日期、数量或说明文字。
- 搜索使用本地日期匹配。第一版以 `createdAt` 作为日记日期，`updatedAt` 只用于更新时间和排序，避免编辑旧日记后改变所属日期。
- 搜索无结果时，球体移动到空白区域并展示“这一天还没有星星”，可直接新建日记。

#### 视觉规则

- `mood` 决定星星的色相：平静为青绿、开心为暖黄、低落为蓝、疲惫为灰紫、期待为橙红。
- `isFavorite` 使用额外光环表示；每颗星额外拥有稳定的随机亮度、大小和呼吸相位，装饰星数量随日记数增加，形成更完整的星空层次。
- 星球使用深色沉浸背景、全屏装饰星场和不显示的聚焦范围，文字信息使用固定 DOM 气泡承载，保证可读性和无障碍。
- Canvas 负责星球、星星、光晕和拖拽渲染；Vue DOM 负责日期搜索、气泡、状态提示和可访问的日记列表。

#### 状态模型

```text
initializing → random-focusing → focused
focused → dragging → settling → focused
focused → searching → single-result / cluster-result / empty-result
```

#### 开源参考与取舍

实现参考了以下 GitHub 项目的球面粒子分布、拖拽探索和星空氛围思路，未直接复制其代码或资源：

- [zayennn/Snow-Flakes](https://github.com/zayennn/Snow-Flakes)：随机球面粒子和沉浸式星空氛围。
- [Rohitsinghwho/3d-globe-stars-threejs](https://github.com/Rohitsinghwho/3d-globe-stars-threejs)：Three.js 球体、粒子深度和轨道控制参考。
- [Avuii/SnowGlobe](https://github.com/Avuii/SnowGlobe)：轻量 3D 球体交互和移动端拖拽参考。

当前初步设计选择 2D Canvas + DOM，而不是引入 Three.js：日记数量有限、需要精确控制中心吸附和日期聚集，2D 实现更轻、更容易与 Ionic 页面生命周期和无障碍文本结合。日记数量或视觉需求明显增长后，再评估 WebGL/Three.js。

### 3.2 导航结构调整

记忆星球成为首页后，底部导航从“日记 / 新建 / 设置”调整为“星球 / 新建 / 设置”：

- 首页图标使用 `planetOutline`，文案为“星球”，强调探索入口。
- 中央新建按钮保留，作为最明确的日记创建动作。
- 设置入口保留；详情页和编辑页不显示底部导航。
- 星球页底部预留安全区，Canvas 不把可交互星星放到导航遮挡范围内。

## 4. 数据模型

初版 TypeScript 模型与 Android V1 对齐：

```text
Diary
  id, title, summary, createdAt, updatedAt
  mood, moodValue, boardPackId, boardPackVersion, layoutId
  isFavorite, isArchived, isDeleted

DiaryBlock
  id, diaryId, blockType, sortOrder, contentJson

DiaryLayout
  id, diaryId, schemaVersion, layoutJson

EventQueueItem
  id, eventType, payloadJson, createdAt, retryCount
  lastAttemptAt, sentAt, status, lastError
```

时间使用 Unix milliseconds，ID 使用应用生成的 UUID。删除使用软删除；默认时间线过滤 `isDeleted = true` 的记录。

## 5. 分层约束

```text
页面组件
  ↓
Pinia Store / Composable
  ↓
Use Case / Repository
  ↓
Storage Adapter / Notification API
```

- 页面组件不直接操作 LocalStorage、SQLite、Filesystem 或 `fetch`。
- `DiaryRepository` 负责日记和内容块的持久化。
- `SettingsRepository` 负责轻量设置。
- `NotificationService` 只发送事件元数据，禁止传递正文、标题、图片和本地路径。
- 正式 Android 适配器替换浏览器适配器时，页面和业务 Store 不改动。

## 6. 全局主题、日记板与布局

全局界面主题与单篇日记个性化必须保持独立：

- 全局界面主题由 `themeId + themeVersion` 标识，只保存在 App 设置中，切换后立即改变整个 App 的颜色和界面样式。
- 日记板素材包由 `boardPackId + boardPackVersion` 标识，保存在单篇日记中，未来在编辑器内选择背景板、贴纸和装饰。
- `DiaryLayout` 只引用日记内容的 `blockId` 和日记板素材的 `assetId`，不保存文件绝对路径和正文副本。

第一版采用固定模板，不做自由画布。画布逻辑尺寸为 `1080 × 1440`，元素位置使用 0~1 的相对坐标。

主题中心支持导入全局界面主题 ZIP 包，根目录必须有 `manifest.json`。导入边界如下：

- 压缩包不超过 20 MB，解压后不超过 40 MB，最多 128 个文件。
- manifest 只接受 `schemaVersion = 1`，主题 ID、版本和四个全局颜色字段必须通过严格校验。
- 拒绝绝对路径、Windows 路径、URL、`.` 和 `..` 路径段。
- 主题文件写入 `Directory.Data/themes/{themeId}/{version}/`，同一版本不覆盖。
- Android 在显式 SQLite 事务内写入 `themes` 清单索引；任何步骤失败都会恢复清单并递归删除本次新写入的目录。
- `theme_assets` 表为现有 SQLite V2 兼容保留，不代表全局主题拥有日记板素材。

当前版本所有日记统一使用 `plain-diary-board@1.0.0`。旧数据中的 `theme_id/theme_version` 列暂作为兼容存储位读取，旧全局主题 ID 会映射到默认日记板，不会锁定历史日记的 App 界面。未来接入真正的日记板包时，再通过非破坏迁移增加语义清晰的字段和素材索引。

## 7. 开发阶段

### 阶段一：浏览器可调试闭环

- 完成时间线、新建、详情、编辑、收藏、软删除。
- 使用 LocalStorageAdapter 模拟本地数据库。
- 建立 Design Tokens 和移动端导航结构。

### 阶段二：本地能力

- 引入 Capacitor。
- 使用 SQLite 保存结构化数据。
- 使用 Filesystem 保存照片、主题和生成素材。
- 加入图片选择和主题 manifest 解析。

当前进度（2026-09-28）：

- 已引入 Capacitor 8 并生成 Android 工程。
- 已建立异步 `DiaryRepository` 契约；浏览器使用 LocalStorage，Android 自动使用 SQLite。
- 已建立 SQLite V2 表，在 V1 基础上新增 `themes` 和 `theme_assets`，原有日记表和数据原地保留。
- 日记正文与图片分别按 `text`、`image` Block 保存，收藏和软删除使用结构化字段。
- 编辑器支持选择、预览和移除最多 5 张图片；图片文件保存在 App 私有目录，`diary_assets` 只记录相对路径和尺寸等元数据；LocalStorage 和 SQLite Repository 会再次执行数量、类型和引用校验。
- 已实现三套内置全局界面主题、ZIP 主题包导入、manifest 解析与校验和主题选择；切换后所有当前页面和历史日记详情都会立即使用新界面样式。
- 全局主题只保存在 App 设置中；日记使用独立的 `boardPackId + boardPackVersion`，当前统一回退到默认日记板。
- 已实现 `1080 × 1440` 固定布局，布局只引用 `blockId` 和日记板 `assetId`，不复制正文和本地路径。
- 旧版 LocalStorage 文字日记会在读取时补齐 Block 与布局，保存失败时会清理本次新写入的图片文件。
- 已有 V1 → V2 自动迁移回归测试：先创建 V1 日记、Block、图片、布局和设置，再升级并确认数据保留。
- 已通过 32 项单元测试、Web 生产构建、Capacitor Android 同步和 Android clean debug 构建；生成的调试 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。
- 已在 320 × 700、390 × 844 和 1280 × 900 视口检查主题中心、编辑器和详情页，没有横向溢出；全局主题即时切换和紧凑照片入口已通过浏览器验收。

阶段二功能开发与自动化验收已完成。真实 Android 设备保留 V1 数据库的覆盖安装仍是发布前验收项，不把自动迁移测试等同于真机证明。

### 阶段三：通知

- 日记先保存在本机，再根据“通知 / 询问 / 不通知”决定是否创建 V2 分享快照；新建日记不再生成旧版 `event_queue` 提醒。
- 网络可用时提交已确认的分享，实际业务响应决定成功或失败，无需连接和权限预检。
- 临时失败保留待发送快照并退避重试，永久失败停止自动重试；旧版通知队列保留兼容处理。
- 使用 `shareId` 实现分享幂等；仅确认分享的标题和纯文本正文发送到固定接收邮箱，图片和本地路径不发送。

阶段三开发链路已完成：旧版事件队列保留待处理读取、指数退避、成功标记、永久错误终止和最多 8 次临时失败停止策略。Android App 在首次需要联网操作时生成 `deviceId` 和 Android Keystore P-256 密钥，向 notify-api 注册公钥；已注册设备直接执行业务请求，仅在响应指出身份失效时恢复身份。启动、回到前台和网络恢复会合并同步触发，先查本地待办，空队列不联网。旧版事件请求严格只包含 `eventId`、`eventType`、`occurredAt`、`mood`、`deviceId`，V2 分享走独立接口，私钥不离开设备。

设置页通过设备签名请求 6 位验证码，验证码十分钟有效；本地旧邮箱只作为待验证候选。已验证邮箱和待验证新邮箱分开保存，因此更换邮箱确认前原绑定继续有效。关闭提醒会先在本机生效，网络失败时保留待同步状态；解绑会清除本地验证状态。验证码挑战保存在本机，有效期内关闭弹窗或重启后仍可继续确认。

notify-api 在 D1 中保存邮箱验证摘要、设备通知设置和唯一投递记录，Cloudflare Queue 消息只携带 `challengeId` 或 `deliveryId`。消费者重新检查设备、邮箱和开关状态后调用 Resend，仅 `diary_created` 发送中性提醒；邮件不包含日记内容。`202 accepted` 只表示服务器已持久接收并接管符合条件的投递，不代表邮件到达。代码和本地自动化验证已完成，生产 Queue、D1 migration、Worker secrets、Resend 域名确认及真实邮箱冒烟测试仍属于部署验收。

### 阶段四：Android 发布

```bash
npm run build
npx cap add android
npx cap sync android
npx cap run android
```

调试 APK 用于设备安装，正式发布使用签名 APK 或 AAB。Vue 页面开发不要求 Android Studio 常驻，但最终 Android 构建需要 JDK、Android SDK 和 Gradle 环境。

版本发布采用 GitHub + 阿里云 OSS 双源：

- 检查更新和安装包下载默认访问 GitHub；HTTP/网络明确失败时立即切换，连接或读取连续 30 秒没有响应时切换 OSS。
- OSS 公共域名为 `https://diary-app.oss-cn-hangzhou.aliyuncs.com`。默认 Endpoint 会阻止 APK 公网分发，因此备用地址使用只包含 `shiguangjian-android.apk` 的 ZIP，下载后在应用缓存目录解压。
- 下载界面显示来源、连接、下载、切换、解压、校验和安装状态；有总大小时显示百分比和字节进度。
- 两个来源最终都必须经过包名、递增 `versionCode`、预期版本、签名证书和 APK SHA-256 校验，ZIP 不改变信任边界。
- 每版发布必须运行 `scripts/publish-oss.ps1`，具体环境变量、对象路径和验证流程以 `RELEASE.md` 为准。

## 8. 验收标准

- 浏览器执行 `npm run dev` 可以查看并操作时间线。
- 创建和编辑日记不会依赖后端或网络。
- 日记删除后默认不出现在时间线，收藏状态可保持。
- 业务层没有把日记正文发送给通知接口的路径。
- 后续切换 Capacitor 存储实现时，不修改页面组件的数据调用方式。
- 可导入合法 ZIP 全局界面主题包，越界路径、超限包和重复版本会被拒绝且不会留下半安装状态。
- 切换全局主题后，当前页面、历史日记详情和之后打开的页面立即使用同一套界面样式。
- 日记板素材包与全局主题相互独立；当前日记保存默认 `boardPackId + boardPackVersion`，未来由编辑器单独选择。
- DiaryLayout 固定为 `1080 × 1440`，只引用 `blockId` 或 `assetId`，不复制正文和本地路径。
- SQLite V1 → V2 自动迁移保留原数据；发布前还必须在保留 V1 数据库的 Android 设备上完成覆盖安装验证。
- GitHub 更新接口或下载连续 30 秒无响应时会切换 OSS，下载界面能持续显示来源和进度，备用 ZIP 解压后仍通过完整 APK 安全校验。
