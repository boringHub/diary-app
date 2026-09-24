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

第一阶段实现：记忆星球首页、新建文字日记、心情、收藏、软删除、详情查看和基础设置入口。图片 Block、主题包导入、SQLite 和通知队列在后续阶段接入。

### 3.1 记忆星球首页（/timeline）

时间线不再使用普通卡片列表，改为可旋转的“记忆星球”。每篇日记对应一颗真实星星，星星以球面坐标分布，装饰星只用于填充空间，不能进入详情。

#### 核心交互

```text
进入页面 → 随机选择日记 → 球体平滑旋转 → 星星到达中心 → 展示心情气泡
拖拽星球 → 反向滚动 → 松手后轻微吸附 → 只有真实星星进入隐形聚焦范围才显示气泡
搜索日期 → 匹配本地日期 → 单篇聚焦 / 同日星群聚集 / 无结果提示
点击星星 → 第一次聚焦，第二次点击当前聚焦星进入现有详情页 → 返回时保留球体角度和聚焦对象
```

- 屏幕中心是隐形聚焦范围的参考位置，不绘制圆环、十字线或其他瞄准辅助线。
- 只有有日记的真实星星进入隐形范围且位于球体正面时，才成为聚焦对象并在星星上方渐显心情气泡；装饰星永远不会触发气泡。
- 点击星星先聚焦，点击当前星星或气泡再进入详情，避免拖拽误触。
- 未聚焦时球体中央不放置提示文字或按钮，避免遮挡星星和拖拽路径；真实日记星进入隐形聚焦范围后，保留星星上方的轻量心情气泡，用于显示心情和日期。气泡不接收指针事件，不影响拖拽。
- 同一天多篇日记进入聚集模式：星星在中心附近以小环形排列，当前星星的心情气泡和进入入口仍保持简洁；点击星群内另一颗星可切换当前心情，重复点击或入口进入详情。
- 日期搜索收纳为右上角圆形按钮，点击后在同一位置展开日期选择框；随机回望与搜索保持同尺寸，左上角不展示标题、日期、数量或说明文字。
- 搜索使用本地日期匹配。第一版以 `createdAt` 作为日记日期，`updatedAt` 只用于更新时间和排序，避免编辑旧日记后改变所属日期。
- 搜索无结果时，球体移动到空白区域并展示“这一天还没有星星”，可直接新建日记。

#### 视觉规则

- `mood` 决定星星的色相：平静为青绿、开心为暖黄、低落为蓝、疲惫为灰紫、期待为橙红。
- `isFavorite` 使用额外光环表示；每颗星额外拥有稳定的随机亮度、大小和呼吸相位，装饰星数量随日记数增加，形成更完整的星空层次。
- 星球使用深色沉浸背景、低对比轨道线和不显示的聚焦范围，文字信息使用固定 DOM 气泡承载，保证可读性和无障碍。
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
  mood, moodValue, themeId, themeVersion, layoutId
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

## 6. 主题与布局

主题至少由 `themeId + themeVersion` 标识。主题升级新增版本目录，不覆盖旧版本。布局只引用 `assetId` 或 `blockId`，不保存文件绝对路径和正文副本。

第一版采用固定模板，不做自由画布。画布逻辑尺寸为 `1080 × 1440`，元素位置使用 0~1 的相对坐标。

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

当前进度（2026-09-23）：

- 已引入 Capacitor 8 并生成 Android 工程。
- 已建立异步 `DiaryRepository` 契约；浏览器使用 LocalStorage，Android 自动使用 SQLite。
- 已建立 SQLite V1 表：`diaries`、`diary_blocks`、`diary_assets`、`diary_layouts`、`app_settings` 和 `event_queue`。
- 日记正文已在 SQLite 中按 `text` Block 保存，收藏和软删除使用结构化字段。
- 已接入 Filesystem 原生插件，为下一步图片资产保存做准备。
- 已通过 Web 生产构建、Repository 单测和 Android `assembleDebug`。

阶段二下一项：实现图片选择、复制到 App 私有目录、`diary_assets` 索引和 `image` Block 展示；之后实现主题 manifest 解析和固定布局。

### 阶段三：通知

- 本地事务保存日记并创建 `event_queue`。
- 网络可用时发送 `notify-api` 事件。
- 失败保留待发送事件，在 App 回到前台或网络恢复时重试。
- 使用 `eventId` 实现幂等；正文、标题和图片不离开设备。

### 阶段四：Android 发布

```bash
npm run build
npx cap add android
npx cap sync android
npx cap run android
```

调试 APK 用于设备安装，正式发布使用签名 APK 或 AAB。Vue 页面开发不要求 Android Studio 常驻，但最终 Android 构建需要 JDK、Android SDK 和 Gradle 环境。

## 8. 验收标准

- 浏览器执行 `npm run dev` 可以查看并操作时间线。
- 创建和编辑日记不会依赖后端或网络。
- 日记删除后默认不出现在时间线，收藏状态可保持。
- 业务层没有把日记正文发送给通知接口的路径。
- 后续切换 Capacitor 存储实现时，不修改页面组件的数据调用方式。
