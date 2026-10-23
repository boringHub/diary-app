# 第三方授权说明

本项目的 Apache-2.0 许可证适用于本仓库的原创内容，不替代第三方软件、字体或其他素材的许可证。第三方组件的版权、许可及适用 NOTICE 应按其原始要求保留。

## JavaScript / TypeScript 主要直接依赖

下表依据 App 与官网工程的锁文件及已安装包的许可信息整理，是授权入口概览，不是 APK、构建产物或全部传递依赖的完整授权清单。

| 组件 | 许可证 |
| --- | --- |
| Vue、Vue Router、Pinia | MIT |
| Ionic Vue、Ionic Vue Router、Ionicons | MIT |
| Capacitor Core、Android、CLI、App、Filesystem、Network | MIT |
| `@capacitor-community/sqlite` | MIT |
| `fflate`、`sql.js`、`@types/sql.js` | MIT |
| Vite、`@vitejs/plugin-vue`、Vitest、`vue-tsc` | MIT |
| Astro、`@astrojs/check` | MIT |
| TypeScript | Apache-2.0 |
| `lucide-vue-next` | ISC；原始许可证同时注明来自 Feather 的部分版权与 MIT 来源 |

具体版权人、全文及版本以相应包中的 `LICENSE`、`NOTICE` 和其他许可文件为准；已解析版本见根目录和 `website/` 下的 `package-lock.json`。Lucide 的许可文件包含 Feather 相关归属，不应只保留包元数据中的 ISC 标识而遗漏原始声明。

分发构建产物时，还需按实际包含的传递依赖、Android 原生依赖和素材保留适用的版权及许可证文件。本概览不能替代这些组件的原始声明。

## 官网字体

官网自托管的字体及其子集继续采用 SIL Open Font License 1.1，原始版权、保留字体名称和许可全文已随字体保留：

| 字体 | 许可文件 |
| --- | --- |
| DM Sans | [OFL-dmsans.txt](website/public/fonts/OFL-dmsans.txt) |
| Noto Sans SC | [OFL-notosanssc.txt](website/public/fonts/OFL-notosanssc.txt) |
| Noto Serif SC | [OFL-notoserifsc.txt](website/public/fonts/OFL-notoserifsc.txt) |

复制、修改或重新分发字体时，应遵守对应 OFL 文件，包括适用的保留字体名称规定。

## 星语塔罗卡面

App 随包提供 RWS 1909 Roses & Lilies 全套 78 张卡面，画作者 Pamela Colman Smith，扫描来源 Saskia Jansen，取自 Wikimedia Commons。逐图元数据标记为公有领域（Public Domain Mark / PD-old-70-expired）；本项目做了尺寸缩减及 WebP 转换。

完整来源、逐图许可元数据、原始文件页与 SHA-256 见 [素材目录](public/tarot/decks/rws-1909/1.0.0/manifest.json)、[原始来源](public/tarot/decks/rws-1909/1.0.0/sources.json) 及 [素材许可说明](public/tarot/decks/rws-1909/1.0.0/LICENSE.txt)。中文牌义与卡背图形属于本项目原创内容，沿用 Apache-2.0；第三方卡面不因仓库许可而变更授权状态。

## 后续新增内容

引入新的第三方代码、字体、图片或日记板素材时，应记录其来源、版权人及许可证，并随分发保留所需声明。具有独立授权的第三方内容应在对应目录或文件中明确标注。
