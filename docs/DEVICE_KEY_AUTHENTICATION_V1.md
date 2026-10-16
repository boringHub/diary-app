# 拾光笺 App：Device Key Authentication V1

**适用仓库：** boringHub/diary-app

**对应服务：** https://api.304766.xyz

**协议版本：** device-key-auth/v1
**状态：** 实施规格；Android Keystore 插件和签名请求尚未完成

## 1. 目标与边界

App 是本地优先的私人日记应用。日记正文、标题、图片、布局和本地文件路径必须留在设备上，通知 API 只接收最小事件元数据。

本方案认证的是“持有已注册私钥的 App 实例”，不是用户账号，也不是正版 App 证明。V1 不增加用户注册、密码登录、OAuth、JWT、Refresh Token 或云端日记同步。

App 不得把 INGEST_TOKEN、ENROLLMENT_TOKEN、邮箱 API Key 或任何共享 API Secret 编译进 APK。任何 APK 内的静态 Secret 都应视为可被提取。

## 2. 现状与迁移目标

### 当前已实现

- Android/SQLite 端已有 event_queue，新建日记在本地事务中写入最小 diary_created 事件。
- 事件只包含 eventId、eventType、occurredAt、mood、deviceId。
- App 已有网络恢复、回到前台时的队列排空和指数退避。
- 当前客户端发送器使用过渡版 Bearer 凭据；凭据提供器未配置时 fail-closed，事件留在本地。
- deviceId 当前由 App 生成 UUID 并保存到 SQLite app_settings。它是标识符，不是认证凭据。

### V1 目标

将事件请求改为 Android Keystore 私钥签名：

~~~text
Android Keystore private key
        ↓ sign
canonical request payload
        ↓ HTTPS
notify-api
        ↓ verify
D1 中的 device identity public key
~~~

迁移完成后，生产 App 不再发送 Authorization: Bearer <INGEST_TOKEN>。过渡期可以保留旧发送器供本地开发或服务端调用，但不能把它配置到发布 APK。

## 3. 设备身份生命周期

### 3.1 首次启动

1. 从 SQLite app_settings 读取 device_id。
2. 如果不存在，生成 UUID v4，建议保存为 dvc_<uuid>。
3. 通过原生 Capacitor 插件在 Android Keystore 创建 P-256 ECDSA 密钥对。
4. 读取公钥的 SubjectPublicKeyInfo DER，使用标准 Base64 编码。
5. 调用 API 注册 deviceId、publicKey、platform 和 appVersion。
6. 服务器返回注册成功后，保存注册状态；私钥始终只留在 Keystore。

注册接口本身不能证明 App 来自正版发布包。当前私有 App 可以接受受限的公开注册，但必须依靠 IP/设备限流、事件额度和设备撤销降低滥用风险。

### 3.2 正常启动

读取 deviceId，确认 Keystore 中仍有对应 alias。需要认证的 API 请求按本文协议签名。可以调用 GET /v1/device/status 获取服务器时间、设备状态和最低版本。

### 3.3 私钥丢失

卸载、恢复出厂设置或 Keystore 清除后，不要尝试恢复旧私钥，也不要用同一个 deviceId 覆盖服务器公钥。

App 应：

1. 将旧本地身份标记为不可用。
2. 生成新的 deviceId 和新的 Keystore 密钥对。
3. 以新身份重新注册。
4. 对仍在队列中的旧身份事件按产品策略处理；不能用新私钥伪造旧设备签名。

## 4. Capacitor 原生插件接口

建议新增 DeviceKeyAuth 插件，页面和业务层只依赖 TypeScript 接口，不直接访问 Android Keystore：

~~~ts
interface DeviceKeyAuthPlugin {
  ensureKey(options: { alias: string }): Promise<{ publicKey: string }>
  sign(options: { alias: string; dataBase64: string }): Promise<{ signatureBase64: string }>
  hasKey(options: { alias: string }): Promise<{ exists: boolean }>
  deleteKey(options: { alias: string }): Promise<void>
}
~~~

实现约束：

- 算法为 ECDSA、曲线 P-256、摘要 SHA-256。
- 私钥使用 Android Keystore 生成，设置为不可导出。
- sign 接收 UTF-8 签名原文的 Base64，不接收或返回私钥。
- Android SHA256withECDSA 通常返回 ASN.1 DER 编码的 (r, s) 签名。协议统一规定请求头中的签名使用 DER 的 Base64；Worker 验证前转换为 Web Crypto 所需的 IEEE P1363 r || s 格式，或由插件明确转换后再发送。两端只能选择一种格式，不能依赖自动猜测。
- 插件错误必须可区分“没有 Key”“签名失败”和“Keystore 不可用”，便于队列决定是否重试。

浏览器开发环境没有 Android Keystore。浏览器端只允许使用 mock signer 做协议单元测试，不能生成可用于生产 API 的设备身份，也不能为了跑通页面而伪造生产凭据。

## 5. HTTP 请求签名协议

所有需要设备认证的请求携带：

~~~http
X-Device-ID: dvc_8c9f2e5b-7a31-4d1a-b0b7-xxxxxxxx
X-Timestamp: 1790000000
X-Nonce: 550e8400-e29b-41d4-a716-446655440000
X-Signature: BASE64_DER_SIGNATURE
~~~

X-Timestamp 是 Unix 秒，不是 App 事件中的毫秒时间。X-Nonce 每次请求随机生成，不能复用。所有请求只能通过 HTTPS 发送。

签名原文必须严格按以下格式拼接，每行以 \\n+ 分隔，末尾不追加换行：

~~~text
v1
METHOD
PATH_AND_QUERY
DEVICE_ID
TIMESTAMP
NONCE
BODY_SHA256
~~~

规则：

- METHOD 使用大写，例如 GET、POST。
- PATH_AND_QUERY 使用 URL 的原始路径和查询字符串，例如 /v1/events?limit=1，不包含 scheme、host 或 fragment。
- DEVICE_ID、TIMESTAMP、NONCE 必须与请求头逐字一致。
- BODY_SHA256 是实际发送的 UTF-8 请求体字节的 SHA-256 小写十六进制；空 Body 使用空字节的哈希。
- 编码统一为 UTF-8，字段大小写和换行不可变更。
- 使用设备私钥执行 ECDSA P-256 SHA-256 签名，再进行标准 Base64。

示例原文：

~~~text
v1
POST
/v1/events
dvc_demo
1790000000
550e8400-e29b-41d4-a716-446655440000
9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
~~~

## 6. 注册与 API 调用

### 注册

~~~http
POST /v1/device/register
Content-Type: application/json
~~~

~~~json
{
  "deviceId": "dvc_xxxxx",
  "publicKey": "BASE64_SPKI_DER_PUBLIC_KEY",
  "platform": "android",
  "appVersion": "1.0.0"
}
~~~

注册成功后服务器只保存公钥和设备元数据，不返回任何可替代私钥的长期共享 Secret。若 deviceId 已存在，服务器不得无条件覆盖公钥。

### 设备状态

~~~http
GET /v1/device/status
~~~

该请求也必须签名。响应至少包含 status、serverTime 和 minimumAppVersion。revoked 状态必须让 App 停止发送该设备的队列事件，并提示重新初始化身份。

### 事件

~~~http
POST /v1/events
Content-Type: application/json
~~~

事件继续使用 Unix milliseconds：

~~~json
{
  "eventId": "evt_xxxxx",
  "eventType": "diary_created",
  "occurredAt": 1790000000000,
  "mood": "happy",
  "deviceId": "dvc_xxxxx"
}
~~~

deviceId 必须与签名头一致。不得加入正文、标题、图片、文件路径、布局 JSON 或未约定字段。事件 API 的 202 accepted 只表示服务端已持久接收，不表示邮件已经送达。

## 7. 本地队列与错误处理

本地事务顺序保持不变：

~~~text
保存日记
  ↓
写入 event_queue
  ↓
UI 返回成功
  ↓
前台/网络恢复时发送
~~~

每次发送时重新生成 timestamp、nonce 和签名；重试不能复用旧 nonce。eventId 必须保持不变，以便服务端幂等。

处理规则：

- 202 accepted 或匹配 eventId 的 200 duplicate：标记队列项 sent。
- 网络错误、超时、408、429 和 5xx：保留队列，按指数退避重试。
- 400、401、403、409 event_id_conflict：标记为终止失败，避免无意义重试；鉴权失败应记录可诊断错误但不记录签名或请求正文。
- Keystore 暂时不可用：保留队列并等待下一次前台/网络恢复；确认 Key 已丢失时进入重新注册流程。
- 队列发送并发保持有界，不能阻塞本地写日记。

## 8. 测试清单

原生插件：

- Key 首次创建、重复 ensureKey、公钥稳定性。
- 私钥不可导出，签名可由测试公钥验证。
- App 卸载/Keystore 清除后的新身份流程。
- DER 签名编码和 Base64 编解码。

协议：

- 正确签名、错误签名、错误公钥、错误 deviceId。
- 修改 Method、Path、Query、Body、Timestamp、Nonce 后必须失败。
- 超出时间窗口、重复 nonce、撤销设备必须失败。
- Body 为空、Unicode JSON、查询字符串和字段顺序的规范化测试。

队列：

- 断网不影响本地保存。
- 网络恢复后排空。
- 同一 eventId 重试只生成一条服务端事件。
- 永久错误停止重试，临时错误遵循退避上限。
- 队列事件不包含日记正文、标题、图片或本地路径。

## 9. 上线前检查

- 生产构建中没有 INGEST_TOKEN、ENROLLMENT_TOKEN 或邮箱 Secret。
- Android Keystore 插件已在真实设备上验证。
- API 已部署对应 D1 migration，且注册、状态、签名事件接口通过线上烟测。
- 旧 Bearer 过渡凭据仍在使用时，不删除旧 API；确认所有生产 App 切换完成后再关闭。
- 日记正文仍只存在设备本地。
- 私钥丢失、设备撤销和重新注册有可操作的恢复路径。
