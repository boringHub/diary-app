# 星语塔罗 · 接口与数据实施规格

设计版本：1.0　日期：2026-10-22。配套 [产品设计](README.md)。本文所有新增接口、表和配置均为待实现契约，不是当前线上能力。

## 1. 系统拓扑与隔离

~~~text
Tarot Vue pages
  → Pinia / Use Cases
      → TarotRepository → Android SQLite V5 / Browser IndexedDB
      → TarotAiClient → 共享签名传输 → notify-api /v1/tarot/*
                                      ├─ 专用 schema / prompt / catalog
                                      ├─ AI D1：请求元数据 / 额度 / 加密恢复缓存
                                      └─ 单供应商文本模型

原有 NotificationSync → 原有事件/分享/邮件路由和队列
~~~

沿用一个 Worker 的部署入口，内部按路由和模块隔离。AI 不进入邮件 Queue，不复用邮件投递状态，也不调用 Resend。建议新增独立 D1 binding TAROT，而非把回复缓存写进 EVENTS；设备公钥仍从现有身份库读取。新增 D1 是存储隔离，不是新建一个 API 项目。

D1 为共享配额与幂等提供持久状态；禁止以内存 Map 或最终一致缓存完成唯一性控制。D1 batch 可按官方事务语义提交一组语句，但带条件额度更新必须验证受影响行数并正确处理预留，不可仅因 batch 成功就认为额度已获准。[S11]

## 2. 随机与牌组引擎

引擎接收固定 catalog、是否逆位和可注入的随机源，输出不可变牌组；新建记录固定启用正逆位（includeReversals=true），界面不提供切换，字段保留以兼容已有记录。生产默认使用 Web Crypto.getRandomValues，测试使用可预测源。[S8]

~~~ts
type Orientation = 'upright' | 'reversed'
type DeckCard = { cardId: string; orientation: Orientation; originalSlot: number }

// 0 <= result < n；避免 Uint32 直接取模带来的偏差。
function randomInt(n: number): number {
  if (!Number.isInteger(n) || n <= 0 || n > 4294967296) throw new Error('invalid_n')
  const limit = Math.floor(4294967296 / n) * n
  const a = new Uint32Array(1)
  do { crypto.getRandomValues(a) } while (a[0] >= limit)
  return a[0] % n
}

// Fisher–Yates；所有 78 个稳定 cardId 恰好出现一次。
for (let i = cards.length - 1; i > 0; i--) {
  const j = randomInt(i + 1)
  ;[cards[i], cards[j]] = [cards[j], cards[i]]
}
const deck = cards.map((cardId, i) => ({
  cardId,
  orientation: includeReversals && randomInt(2) === 1 ? 'reversed' : 'upright',
  originalSlot: i,
}))
// cutIndex ∈ [1,77]；方向与 cardId 一起移动。
const cutDeck = [...deck.slice(cutIndex), ...deck.slice(0, cutIndex)]
~~~

完整牌序只在本机保存，不上传随机种子和未抽卡牌。原始槽位用于恢复与测试，不代表任何神秘意义。生产不能使用 Math.random、sort 随机比较器或让模型生成牌组。WebView 缺少 Web Crypto 时明确报错，不静默降级。

算法保证在随机源假设下的均匀洗牌，不证明占卜效力，也不提供服务端可验证抽奖公平性；服务端只能校验提交的卡牌结构，无法证明客户端确实执行了洗牌。

## 3. 本地领域模型

~~~ts
interface TarotReading {
  id: string                    // UUID
  schemaVersion: 1
  scenarioId: 'shopping' | 'choice' | 'self' | 'relationship' | 'growth' | 'guidance'
  spreadId: string
  spreadVersion: number
  deckId: string
  deckVersion: string
  catalogVersion: string
  question: string
  context: string
  options: { a: string; b: string } | null
  details: { item?: string; price?: string; currency?: string; budget?: string; alternative?: string; timeframe?: string }
  includeReversals: boolean
  stage: 'draft' | 'shuffling' | 'cutting' | 'drawing' | 'revealed'
  deckOrder: DeckCard[]           // 洗牌提交后存在
  cutIndex: number | null
  spreadSnapshot: unknown        // 牌位 ID/名称/顺序/布局
  displayTitle: string           // 可修改；不改变 question
  note: string                   // 只留本地
  isFavorite: boolean
  createdAt: number              // Unix ms
  updatedAt: number
  revealedAt: number | null
  revision: number               // 本地乐观锁
}

interface TarotDrawnCard {
  readingId: string
  positionId: string
  drawOrder: number
  cardId: string
  orientation: 'upright' | 'reversed'
  originalSlot: number
  snapshot: unknown              // 卡名/关键词/牌位/资源引用
}

interface TarotMessage {
  id: string
  readingId: string
  seq: number
  role: 'user' | 'assistant'
  kind: 'initial' | 'followup'
  content: string
  status: 'pending' | 'streaming' | 'completed' | 'failed' | 'interrupted' | 'unknown'
  requestId: string | null
  attemptOf: string | null        // 新请求替代失败尝试时引用旧 requestId
  errorCode: string | null
  createdAt: number
  completedAt: number | null
}
~~~

draft 可无 deckOrder；进入切牌必须有 78 张唯一牌，进入 drawing 必须有有效切点，进入 revealed 必须满足全部牌位唯一且完整。个人笔记、显示标题、收藏与不可变问题快照分开。

牌位稳定 ID 与抽牌顺序固定如下：purchase-4 为 need/benefit/cost/action；choice-5 为 present/a-support/a-challenge/b-support/b-challenge；reflection-3 为 present/overlooked/action；connection-3 为 self/pattern/action；growth-4 为 present/obstacle/resource/action；guidance-1 为 guidance。对应中文含义见主文档，客户端和服务端使用相同 manifest，不根据显示文本匹配。

1.1 交互修订：上面的顺序现表示稳定牌位顺序，不强制用户按这个顺序抽取。用户可点击任意空牌位；TarotDrawnCard.drawOrder 保存实际选取次序，positionId 表示目标牌位，两个概念不得混用。上传 reading.cards 时按服务端 manifest 的稳定牌位顺序排序。剩余牌的可视编号取自切牌提交时的 1–78 槽位，持久化后不因抽走卡而重排编号。任何牌位提交后锁定洗切操作；返回只查看，不使牌位重新可选。

布局快照记录每一牌位的 x/y/w/h，范围均为 0–1，另存 drawOrder。choice-5 的中心点依次为 (0.50,0.16)、(0.26,0.46)、(0.26,0.80)、(0.74,0.46)、(0.74,0.80)，左右列各对应 A/B。坐标负责展示，读取和抽牌顺序仍按稳定序号；窄屏缩放时由容器留出卡名与牌位文字空间。

### 3.1 SQLite V4 → V5 增量迁移

不重建现有表；新增以下表及索引。JSON 由 Repository 严格校验；SQLite 可加 json_valid，但须先确认 Android SQLite 编译能力，不以它代替 TypeScript 领域校验。

~~~sql
CREATE TABLE tarot_readings (
  id TEXT PRIMARY KEY NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  scenario_id TEXT NOT NULL,
  spread_id TEXT NOT NULL,
  spread_version INTEGER NOT NULL,
  deck_id TEXT NOT NULL,
  deck_version TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  question TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  options_json TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  include_reversals INTEGER NOT NULL DEFAULT 1 CHECK(include_reversals IN (0,1)),
  stage TEXT NOT NULL CHECK(stage IN ('draft','shuffling','cutting','drawing','revealed')),
  deck_order_json TEXT,
  cut_index INTEGER CHECK(cut_index IS NULL OR cut_index BETWEEN 1 AND 77),
  spread_snapshot_json TEXT NOT NULL,
  display_title TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revealed_at INTEGER
);
CREATE INDEX idx_tarot_readings_updated ON tarot_readings(updated_at DESC, id DESC);
CREATE INDEX idx_tarot_readings_filter ON tarot_readings(scenario_id, updated_at DESC, id DESC);

CREATE TABLE tarot_drawn_cards (
  reading_id TEXT NOT NULL REFERENCES tarot_readings(id) ON DELETE CASCADE,
  position_id TEXT NOT NULL,
  draw_order INTEGER NOT NULL,
  card_id TEXT NOT NULL,
  orientation TEXT NOT NULL CHECK(orientation IN ('upright','reversed')),
  original_slot INTEGER NOT NULL CHECK(original_slot BETWEEN 0 AND 77),
  snapshot_json TEXT NOT NULL,
  PRIMARY KEY(reading_id, position_id),
  UNIQUE(reading_id, card_id),
  UNIQUE(reading_id, draw_order)
);

CREATE TABLE tarot_messages (
  id TEXT PRIMARY KEY NOT NULL,
  reading_id TEXT NOT NULL REFERENCES tarot_readings(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  kind TEXT NOT NULL CHECK(kind IN ('initial','followup')),
  content TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK(status IN ('pending','streaming','completed','failed','interrupted','unknown')),
  request_id TEXT,
  attempt_of TEXT,
  error_code TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  UNIQUE(reading_id, seq)
);

CREATE TABLE tarot_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  reading_id TEXT NOT NULL REFERENCES tarot_readings(id) ON DELETE CASCADE,
  assistant_message_id TEXT NOT NULL REFERENCES tarot_messages(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  state TEXT NOT NULL,
  last_seq INTEGER NOT NULL DEFAULT 0,
  server_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(assistant_message_id)
);
CREATE UNIQUE INDEX idx_tarot_one_active_request ON tarot_requests(reading_id)
  WHERE state IN ('prepared','sending','streaming','unknown');

CREATE TABLE tarot_cache_purge_outbox (
  reading_id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
~~~

请求 payload_json 是当次完整发送快照，重试必须字节一致；它只在本机存在，不含系统提示词、供应商密钥和个人笔记。完成后可清除 payload_json 内冗余上下文，保留请求 ID、哈希与状态；unknown 解决前保留以便安全恢复。

删除阅读时在同一事务插入仅含 readingId/deviceId/到期时间的缓存清理待办，再级联删除正文；待办无外键，不能被阅读删除顺带清空。其网络清理最多 3 次并退避，到期后本地移除，因为服务端缓存已不可读。

PRAGMA foreign_keys 必须启用；迁移失败回滚，不能自动删库重建。数据库版本值由 4 改到 5，但正式实施时如基线已变化，应以最新版本追加，不覆盖他人迁移。

## 4. 认证与传输

新增接口使用现有 device-key-auth/v1：X-Device-ID、X-Timestamp、X-Nonce、X-Signature。时间头为 Unix 秒；业务时间为毫秒。签名绑定实际 method/path/query/body SHA-256；每次传输换新 nonce 与时间，业务 requestId 保持。

AI 首次真实请求时才 ensureDeviceIdentity；邮箱未绑定或通知关闭不影响 AI。浏览器开发模式采用 MockTarotAiClient，不注册生产身份、不嵌入共享 token。若未来提供 Web 真实 AI，需要单独设计浏览器身份和授权，首版不顺带开放。

塔罗路由只接受设备签名，不接受原有事件接口兼容的 INGEST_TOKEN/ENROLLMENT_TOKEN 作为模型调用授权。保持现有 Origin allowlist；若客户端需要读取 Retry-After 响应头，须通过 Access-Control-Expose-Headers 显式公开，不能为流式能力把 CORS 改为通配所有来源。

必须从现有 JSON 请求客户端抽出 signHeaders/签名规范化工具，新建独立流式传输；不要把已有 15 秒 JSON 请求超时整体放宽，也不能每次 AI 前调用 /health 或 /device/status。

Android 先验证 WebView fetch + ReadableStream 的真实行为；不用假设 CapacitorHttp 一定透传增量数据。若构建启用了会缓冲响应的全局 HTTP 补丁，塔罗需使用确认可流式的通道，必要时新增最小原生流式插件，传递 chunk/cancel，不让它影响邮件客户端。[S10]

## 5. API 契约

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | /v1/tarot/chat/stream | 首解或追问，同一 POST 返回 SSE |
| GET | /v1/tarot/requests/:requestId | 断流后按需恢复单个请求，无自动轮询 |
| POST | /v1/tarot/readings/:readingId/purge | 删除该设备该记录的短期恢复缓存，含正在生成的请求 |

不新增远端历史列表和定期状态查询。路由专属 96 KiB 请求上限；现有邮件事件的 4 KiB 限制保持。按路由在读取 body 前选定限制，不能让全局 4 KiB 先拒绝 AI，再在解析后试图放宽。

### 5.1 首次解读

~~~json
{
  "schemaVersion": 1,
  "requestCreatedAt": 1792636800000,
  "requestId": "c28b1851-1b7c-4330-8b73-ac8f463dc890",
  "assistantMessageId": "9ef3c2c2-9664-4434-90bb-b93034a4cfd9",
  "purpose": "initial",
  "consentVersion": "tarot-ai-v1",
  "locale": "zh-CN",
  "reading": {
    "id": "65fc678e-8e55-45f2-b938-b19ad091bc91",
    "scenarioId": "shopping",
    "spreadId": "purchase-4",
    "spreadVersion": 1,
    "deckId": "sgj-symbolic-rws",
    "deckVersion": "1.0.0",
    "catalogVersion": "rws-zh-v1",
    "question": "这台相机适合现在买下吗？",
    "context": "平时用手机拍照，希望记录旅行。",
    "options": null,
    "details": {"item":"相机","price":"4200","currency":"CNY","budget":"担心之后很少用"},
    "includeReversals": true,
    "cards": [
      {"positionId":"need","cardId":"major-09","orientation":"upright"},
      {"positionId":"benefit","cardId":"major-17","orientation":"upright"},
      {"positionId":"cost","cardId":"pentacles-04","orientation":"reversed"},
      {"positionId":"action","cardId":"major-14","orientation":"upright"}
    ]
  },
  "contextWindow": {"initialAssistant":null,"turns":[]},
  "message": null
}
~~~

字段为严格白名单，UUID 格式与总长度校验；scenarioId 与 spreadId 必须匹配，cards 的数量、positionId 集合、顺序必须与服务端模板一致，cardId 唯一且属于 catalog。逆位关闭时拒绝 reversed。details 仅允许主文档中的六个已知字段，各最多 200 字，不接受任意对象。

禁止接受模型调用 URL、API Key、modelId、systemPrompt、完整客户端牌义、未抽牌组、附件、日记 ID、邮箱或 tools。校验信息与字段路径可回传，但不得回显用户完整输入。

### 5.2 追问

沿用相同 reading 快照，新的 requestId/assistantMessageId，purpose 为 followup，message 为当前用户消息（含 UUID 与 content）。contextWindow.initialAssistant 为已完成的首解，turns 是从旧到新的完整 user/assistant 对，最多 6 对；只接受 role 为 user/assistant，不接受 system/developer/tool。当前用户消息不重复放入 turns。

首解未完成时不开放普通追问；用户可恢复首解或明确开始一次新的首解尝试。追问中断后若继续发新问题，不把那条不完整答复放入模型上下文，界面提示「这次会从上一次完整对话继续」。

上下文裁剪：服务端系统规则与卡牌上下文、原问题和 A/B 选项、首解、当前消息是固定部分；剩余预算从最近一对完整对话开始往前保留，最终仍按时间正序传模型。丢弃最早的轮次；首版不额外请求模型做摘要。界面显示「较早的聊天仍在本机，这次会参考最近几轮」。

目标模型输入预算 16,000 tokens，输出首解最多 2,000 tokens、追问最多 1,000。使用所选模型匹配的 tokenizer；无法可靠计数时采用更保守的 UTF-8 字节上界限制，并为服务端固定提示词预留预算。固定部分本身超限则返回 context_too_large，不能截掉原始问题或卡牌。旧首解超过允许长度时明确提示，新版不静默篡改原解读。

请求 envelope 总长仍须 ≤96 KiB；过长时客户端先去掉最早完整轮次再序列化。单条历史 content ≤8,000 码点；整个 contextWindow ≤20,000 码点，服务端随后再按 token 预算收紧。UI 的输入长度使用 Unicode 码点计数，与接口保持一致。

## 6. SSE 协议

使用 POST fetch + Response.body 读取，不使用会自动 GET/重连且无法按现有协议签名的 EventSource。Worker 透传供应商文本时映射成自有事件，不直接把供应商错误体或内部推理转发给 App。SSE 使用 UTF-8、空行分隔事件。[S10][S12]

响应头为 Content-Type: text/event-stream; charset=utf-8、Cache-Control: no-store。按实际代理验证无缓冲，不依赖某个非 Cloudflare 代理专属头来保证流式。

~~~text
event: meta
data: {"requestId":"...","messageId":"...","seq":0,"promptVersion":"tarot-v1.0","provider":"configured-provider","model":"configured-model","catalogVersion":"rws-zh-v1"}

event: delta
data: {"requestId":"...","seq":1,"text":"从这组牌看，"}

event: delta
data: {"requestId":"...","seq":2,"text":"可以先把需要和期待分开想一想。"}

event: done
data: {"requestId":"...","seq":3,"finishReason":"stop","usage":{"inputTokens":1300,"outputTokens":1000},"resultExpiresAt":1792723200000}

~~~

HTTP 200 开流后发生错误，只能发送 event:error，包含 code、retryable、requestState 与 requestId 后关闭；不得再尝试修改 HTTP 状态码。正常 EOF 不等于成功：只有收到并持久保存 done 才为 completed。finishReason=length 用完整状态加「达到本次长度上限」标签，不能伪装成网络断流；继续展开须用户再次发送。

客户端 TextDecoder 使用 stream:true，维护跨 chunk 缓冲，兼容 CRLF、UTF-8 跨字节、多行 data、心跳注释和未知事件；任何 HTTP chunk 都不一定对应完整字符或事件。每个 request 内 seq 单调递增，按 requestId+seq 去重；无上限的 data/event 必须截断拒绝。客户端响应累计上限 128 KiB、完整答复最多 8,000 码点。

模型回复按不可信文本处理：首版只支持段落、强调与列表，禁用原始 HTML、脚本、iframe、远程图片自动加载及危险链接协议。使用安全 Markdown 渲染器或转义后的纯文本，禁止直接 v-html 原始回复；外链只在用户主动点击时处理。客户端本地缓存恢复与供应商增量走同一渲染边界。

预发送先在本地事务保存请求快照和 assistant 占位；delta 在内存立即显示，每约 300ms 或累计 256 字批量落盘，停止/完成/切后台立即 flush。done 时一次事务保存最终内容、usage、请求状态、模型/提示词版本与 server_expires_at。突然断电可能损失最后 300ms 的未刷文本，仍可按请求恢复完整结果。

超时建议：等待响应头或首个实际文本最多 20 秒；两个文本 chunk 间隔最多 25 秒；总请求最多 90 秒。心跳不重置文本等待超时。AbortController 负责用户停止/页面退出/超时；三类原因分别记录。取消传递到上游只是尽力而为，可能已产生费用。

## 7. 幂等与断流恢复

业务 requestId 和 requestCreatedAt 在首次点击发送时生成并持久保存。requestCreatedAt 为 Unix 毫秒；首次受理只允许过去 24 小时至未来 5 分钟，超出窗口返回 410 request_expired。对既有 ID 先检查绑定与状态；30 天后去掉元数据时，过期时间窗仍可拦住旧原文重放，不能将它当新请求再次调用。传输重试保持原 JSON 字节和 requestId，只重新签名；UI 修改输入或上下文必须创建新 ID。服务器在设备范围内按 requestId 唯一，使用带服务端秘密的 HMAC 摘要绑定原始请求字节，避免存储可枚举的私人问题裸哈希。

| 服务端状态 | 同 ID 再次 POST | GET 请求恢复 |
| --- | --- | --- |
| 不存在且通过额度 | 原子占位后开始唯一调用 | 404 request_not_found |
| reserved / running | 409 request_in_progress，带 retryAfterSeconds | 200 state=running，无文本 |
| completed 且缓存有效 | SSE replay 完整结果，meta 标记 replayed，不扣额度 | 200 完整文本、usage、finishReason、expiresAt |
| 同 ID 不同 body | 409 request_id_conflict | 不涉及 |
| failed_before_provider | 409 request_closed，可显式建立新请求 | 200 失败原因，不自动调用 |
| interrupted / unknown | 409 request_outcome_unknown | 200 状态，说明不能保证无费用 |
| 缓存过期或已清理 | 410 result_expired / result_purged | 同左；不重新生成 |

GET 只在用户选择「取回上次回复」或恢复未确认请求时执行一次；running 显示建议等待时长和手动重试按钮，不启动周期轮询。查询本身不触发模型，也不扣模型额度。completed 恢复时替换原 assistant 的部分文本，不在后面再次追加同一答复。

服务器在调用上游前原子 claim，并使用带条件的 lease/状态更新阻止多个 Worker 同时运行。额度预留、设备并发锁、request 占位须同一逻辑原子化：D1 batch 内先 INSERT 唯一请求和设备锁，再对各额度桶 UPSERT 最坏消耗预留；额度桶必须用 CHECK 约束保证计数、used+reserved 不超过该行 limit，任何约束失败让整个 batch 回滚。不能依赖条件 UPDATE 返回零行自动触发回滚，也不能以先 SELECT 后 INSERT 代替。实施测试若无法证明全部维度的原子性，则改为集中式 Durable Object 配额仲裁（仅按设备分片仍不能独立保证全局预算），验证后再上线。

跨供应商调用与 D1 之间不能构成事务。若已发给供应商而 Worker 崩溃，lease 到期只能标记 unknown，禁止另一个 Worker 静默重调。没有供应商幂等/查询能力时不能保证 exactly-once 计费；产品必须让用户明确选择「重新请求，可能再次计入额度」，生成新 requestId 并记录 attemptOf。不能宣称「超时必定不计费」。

完成流程：收完整回复 → 加密写恢复缓存与 completed 状态 → 结算额度 → 发送 done。最后写缓存失败则不发送成功 done；保留可恢复文本的本机状态并返回持久化失败，不自动再调供应商。

## 8. 服务端表与保留期

逻辑表清单，实际迁移文件编号要在对齐生产迁移后分配，不能直接假定当前最高是 0003。

| 表 | 核心字段 | 保存原则 |
| --- | --- | --- |
| ai_requests | device_id、request_id、reading_id、body_hmac、purpose、state、lease_until、provider_request_id、model、prompt_version、input/output_tokens、created/updated_at、expires_at | 唯一键(device_id,request_id)，元数据 30 天；不保存输入正文 |
| ai_device_locks | device_id、request_id、lease_until | 每设备 1 个模型并发；异常 lease 到期转 unknown 后释放 |
| ai_quota_buckets | subject_type、subject_hmac、window_key、reserved_units、used_units、request_count | 原子额度/成本预留；设备、短期 IP 与全局维度 |
| ai_result_cache | device_id、request_id、ciphertext、iv、key_version、expires_at | 仅完整输出和必要恢复属性，AES-GCM 加密，24 小时有效 |
| ai_purge_tombstones | device_id、reading_id、created_at、expires_at | 30 天；阻止迟到请求重新写缓存，不存正文 |

缓存读取必须再次校验签名、设备归属与有效期；不是知道 UUID 就能下载。AES-GCM AAD 绑定 deviceId/requestId/catalogVersion，避免跨记录替换。密钥保存在 Worker Secret，记录 keyVersion，轮换保留旧解密密钥直至对应缓存过期。AI 密钥、缓存密钥、摘要密钥不能复用邮件密钥。

24 小时是有效读取窗口；每小时定时清除过期密文，正常物理清理最多延迟约一小时，清理失败需要告警。D1 的平台备份/Time Travel 可能保留更久的加密副本，不能向用户承诺立即从所有备份物理抹除；线上隐私说明必须写清实际配置。[S11]

purge 接口无 body，按路由参数签名；幂等返回 200 purged。先写 tombstone 再清缓存，生成任务最终落库前检查 tombstone，因此删除发生在生成中也不会产生可恢复结果。它不承诺抹除模型供应商已经处理的请求。

App 删除立即清本地；在线且该记录确实发过 AI 才请求 purge。离线写最小清理 outbox，在下一次已有同步触发时处理，不先做状态预检。purge 调用失败不阻塞本地删除；客户端明确保留「恢复缓存最多 24 小时有效」说明。未发送 AI 的记录不联网删除。

不收集问题和聊天正文作埋点；错误日志仅记录脱敏 requestId、错误码、时延、供应商状态类、token/成本。禁止 log request.text、供应商原始错误体、完整 prompt 或调试抓包持久化到生产日志。

## 9. 额度、预算与防滥用

初始配置建议值，均可服务端调节；它们是产品预算，不是 Cloudflare 或模型商的固有限额。

| 维度 | 建议默认 |
| --- | --- |
| 单设备并发 | 1 个模型调用；已完成缓存读取不占并发 |
| 单设备频率 | 6 次模型调用/分钟 |
| 单设备每日 | 10 次首解、30 次追问、合计 40 次 |
| 单设备每日 token | 输入+输出 ≤100,000，按 usage 结算并预留最坏消耗 |
| IP 兜底 | 30 次调用/分钟、200 次/日；共享网络可人工调参 |
| 全局每日预算 | 必须设置可承受金额，未配置则 AI fail-closed |
| 单会话 | 不人为限制本地历史长度；每次上下文预算固定 |

日窗口采用 Asia/Shanghai 零点，服务端计算并回传 resetAt；不要依赖客户端时钟判定可用额度。模型价格从配置读取并记录版本，预算按最坏输入+最大输出先预留，usage 到达后释放多余部分；供应商未返回 usage 时保守结算，后台人工对账。

密钥注册只证明持有私钥，不能证明是一个真实用户，攻击者可以生成新 deviceId；因此设备限额还须结合注册限流、IP 和全局预算。现阶段私用 App 可增加服务端设备 allowlist 控制 AI 开通，不要求用户绑定通知邮箱，也不把邮箱作为付费身份。

本地业务失败不消耗模型额度；已调用供应商的超时/取消可能消耗额度。429 包含 Retry-After 与 resetAt；进入历史、切换页面和返回前台不请求余额。每次模型响应附带可用额度估计，界面仅据已有响应更新。

成本估算以当日核实的价格配置计算：每日成本约为首解次数×首解平均 token 成本 + 追问次数×追问平均 token 成本。按实际 token 使用，不在方案中写死未经核实的「每次几分钱」。任何启用工具、思考 token 或供应商缓存折扣都应另行计入估算。

## 10. 错误与重试

统一预流式错误体：ok=false、error.code、error.retryable、requestId、requestState、retryAfterSeconds 可选；不透传上游授权头和错误 body。表中 HTTP 状态只适用于还未开始 SSE 的情形。

| HTTP / code | App 行为 |
| --- | --- |
| 400 invalid_request / invalid_cards | 永久错误，保留记录，不自动重试 |
| 401 unknown_device | 按现有身份恢复机制最多注册/修复一次后，仍用同业务 ID 发送 |
| 401 revoked_device / invalid_signature | 停止；不靠生成新身份绕过撤销 |
| 403 ai_not_enabled / consent_required | 显示开通/数据说明，本地牌义可用 |
| 409 request_id_conflict | 不自动换 ID掩盖问题，保存诊断错误码 |
| 409 request_in_progress | 允许按需查一次恢复，不重调模型 |
| 409 request_outcome_unknown | 明确说明结果未知；用户选择后才能建立新请求 |
| 410 result_expired / result_purged | 保留本机部分文本，提供明确的新尝试入口 |
| 413 payload_too_large / 422 context_too_large | 先裁掉最早完整对话，使用新的 payload 和新 ID；不得继续使用旧 ID |
| 422 catalog_version_unsupported | 历史可读，解读提示升级；不偷换牌义版本 |
| 429 device_limit / budget_exhausted | 显示允许恢复时间，本机结果保持 |
| 502 provider_error / 503 ai_unavailable | 根据 requestState 判断是否可同 ID 查询，禁止自动重生成 |
| 504 provider_timeout / 200 SSE error | 保留已收文本，标记未完成，可按需恢复 |

自动传输重试仅限明确未接受的请求，最多一次，退避至少 2 秒并加抖动；结果不确定先查询原 ID。取消和用户离开不自动重试。重试策略与邮件最多 8 次退避队列分开，不能套用通知的后台补发策略。

## 11. 配置与发布步骤

Secrets：TAROT_PROVIDER_API_KEY、TAROT_CACHE_ENCRYPTION_KEYS、TAROT_HMAC_KEY。公开服务器配置：TAROT_AI_ENABLED、TAROT_PROVIDER、TAROT_MODEL、TAROT_PROMPT_VERSION、TAROT_DAILY_BUDGET、额度参数。提供商基地址只在服务器 allowlist 中选择，客户端不能传入。App 复用 VITE_NOTIFY_API_ORIGIN，不新增 VITE_* 模型密钥。

1. 将实际生产邮件源码、D1 migration、Queue binding 与当前部署对应起来；先建立隔离的测试库与 Secret。
2. 新增 TAROT D1 与迁移、定时清理；现有 EVENTS 与邮件消费者保持接口兼容。
3. 本地通过 mock provider 验证请求/并发/缓存/额度，使用测试供应商账号真实流式冒烟。
4. Android WebView 验证首字、取消与断流；普通浏览器 Mock 不能证明真机可流式。
5. 先部署默认关闭的兼容 API，逐个设备开通内部测试；然后发测试通道 App。
6. 完成 V4 覆盖升级、旧邮件回归与数据说明验收后才按正式发布规范启用。

回滚时关闭 TAROT_AI_ENABLED；历史与离线抽牌保持，新增表不删除，旧邮件接口不中断。供应商故障不触发自动换卡、不把排队请求转到邮件 Queue。

## 12. 最低验收矩阵

| 范围 | 必测结果 |
| --- | --- |
| 牌组 | 始终 78 唯一 ID；禁逆位全正位；切牌只旋转不丢牌；选择不重复；测试随机源可复现 |
| 生命周期 | 每个仪式阶段杀进程、恢复同牌；提交失败不前进；抽满才可揭示；问题锁定 |
| 存储 | SQLite V4 真数据迁移保留日记/图片/分享；浏览器存储满时不假报保存成功；删除级联 |
| 认证 | 实际 body 哈希；新 nonce 重试；跨设备请求恢复被拒；撤销设备不可生成 |
| 并发幂等 | 同 ID 10 并发仅 1 次上游调用；不同 ID 同设备只 1 个并发；同 ID 不同 body 拒绝 |
| 额度 | 临界值并发不越额；供应商前失败释放预留；取消/未知不误承诺退费；零点重置 |
| 流式 | 中文 UTF-8 任意切块、多行 data、心跳、CRLF、超大事件、done 缺失、finishReason=length |
| 恢复 | 缓存只归属设备读取；恢复替换部分文本；过期不自动再调用；lease 到期转 unknown |
| 删除 | 生成时删除后 tombstone 拦截缓存；晚回包不复活本机；离线清理 outbox 到期停止 |
| 数据边界 | 未同意/仅看历史/个人笔记/抽牌零上传；日志不含问题和聊天；邮件不收塔罗数据 |
| 交互 | 320/390/430px、Android 键盘、TalkBack、减少动态效果、三套主题、离线与空历史 |
| AI 内容 | 30+ 人工案例；牌名/方向/牌位一致；购物预算与二选一明确；无额外卡牌和必然预测 |

App 验证执行 npm test、npm run build；API 执行 npm run check、npm test。涉及 APK 发布另依 RELEASE.md 完整验证；本次仅文档与独立原型，不改数据库或部署。

资料 S8–S12 的原始链接见 [产品设计资料索引](README.md#12-外部资料索引)。平台能力采用官方资料，未把建议的超时/预算当作平台实际配额。
