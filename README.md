# 📡 VPS 雷达

免费服务器情报聚合 + AI 真实性审核。全部本机运行，数据存本地 SQLite。

## 快速开始

双击 **`启动.bat`**，浏览器打开 **http://127.0.0.1:8090**

## 核心能力

### 1. AI 真实审核（关键）

不是简单关键词匹配，而是**让 DeepSeek 逐条去读原文**，回答两个问题：

| 字段 | 含义 |
|---|---|
| `is_server` | **这是不是一台机器？**（VPS/容器/PaaS/沙盒 vs 数据库/消息队列/CDN/工具） |
| `is_free` | **是不是真免费？**（vs 低价促销/优惠码/二手交易） |
| `confidence` | 置信度 0-100，低于 65 不进"真免费"列表 |
| `real_free` | 到底免费什么、有什么限制 |
| `cost` | 实际成本（完全免费/需绑卡/$5.99月付/需购买） |
| `risks` | 风险提示（封号风险/需绑卡/跑路风险） |

**自动剔除的典型陷阱：**
- ✅ 正确识别 `SNS/SQS/DynamoDB` → "非服务器，是消息队列/数据库"
- ✅ 正确识别 `GitHub Actions 跑 VNC` → "蹭额度hack，违反条款随时封号"
- ✅ 正确识别 `$12/年 + $50抽奖` → "服务器需付费，仅抽奖送$50"
- ✅ 正确识别 `30% OFF 优惠码` → "低价促销，非免费"

### 2. 三分类数据源（30+ 个）

| 分类 | 来源 | 说明 |
|---|---|---|
| 🟦 **低价 VPS** | LowEndTalk / LowEndBox / V2EX / NodeSeek / LowEndSpirit / 3个TG频道 | 低价商机、补货、黑五 |
| 🟩 **免费云** | Oracle/GCP/AWS/Azure/IBM/Koyeb/Neon/Upstash/Deno/Netlify/Codespaces/Gitpod + **free-for-dev 大全** | 官方免费层 |
| 🟨 **羊毛资讯** | GitHub 3个主题搜索 / HackerNews 3个查询 / DEV.to / Lobsters / ServeTheHome / awesome-selfhosted | 社区动态 |

**金矿数据源：**
- `ripienaar/free-for-dev` —— GitHub 14 万星免费服务大全，只取 Major Cloud/IaaS/PaaS/Web Hosting/Tunneling 五个章节
- `awesome-selfhosted` —— 只取 Virtualization/Containers/Control Panels/Tunneling 子章节
- Telegram 公开频道（`t.me/s/xxx`）—— **免登录**，替代已被封锁的推特

### 3. 网页功能

- 分类切换、关键词搜索、✅仅真免费、未读、收藏
- 卡片直接显示 AI 结论（真免费 / 是服务不是机器 / 需付费 / 蹭额度hack）
- 每 30 分钟自动抓取 + 自动审核

## 文件结构

```
vps-radar/
├── 启动.bat          双击启动
├── .env              API key 配置（勿外传）
├── server.js         Web 服务 + API + 定时任务
├── crawler.js        抓取编排 + AI 审核调度
├── fetcher.js        多类型解析（RSS/GitHub/HN/页面/MD/TG）
├── sources.js        30+ 数据源配置
├── ai-review.js      DeepSeek 审核核心（提示词在这里）
├── md-source.js      Markdown 仓库解析
├── tg-source.js      Telegram 频道解析
├── filter.js         粗筛规则（AI 前的一道过滤）
├── db.js             SQLite 数据层
├── ui.js             网页界面
└── data/radar.db     数据库
```

## 常用命令

```bash
# 抓取
bun run crawler.js        # 全部源 + 自动审核
bun run crawler.js A      # 只抓低价VPS

# 只跑 AI 审核（不抓取）
bun --env-file=.env -e "const {runAiReview}=await import('./crawler.js'); await runAiReview({max:100})"

# 改抓取频率（默认30分钟）
set AUTO_CRAWL_MIN=60 && bun --env-file=.env run server.js

# 关闭 AI 审核（省 token）
set AI_REVIEW_ENABLED=0 && bun --env-file=.env run server.js
```

## 配置说明（.env）

```ini
DEEPSEEK_API_KEY=sk-xxx      # 必需
DEEPSEEK_MODEL=deepseek-chat
AI_REVIEW_ENABLED=1          # 0=关闭审核
AI_MAX_PER_ROUND=40          # 每轮最多审多少条（控制成本）
AI_MAX_CONTENT_CHARS=6000    # 单条原文截断长度
```

**成本参考**：336 条全量审核约消耗 37 万 tokens ≈ **¥0.3**（DeepSeek 极便宜）

## 添加数据源

编辑 `sources.js`：

```js
{
  id: "唯一ID",
  name: "显示名",
  cat: "A",                         // A/B/C
  kind: "rss",                      // rss|github|hn|page|md|telegram
  url: "https://...",
  // md 类型额外参数：
  sections: ["Major Cloud Providers"],   // 只取这些 ## 章节
  subsections: ["Virtualization"],       // 只取这些 ### 子章节
  // telegram 类型额外参数：
  channel: "vpsdance",
}
```

## 调整 AI 判断标准

编辑 `ai-review.js` 的 `SYSTEM_PROMPT`。里面明确列出了：

- **什么算"机器"**：VPS/容器/PaaS/沙盒IDE/免费层实例
- **什么不算**：消息队列/数据库/CDN/存储/CI流水线/SaaS工具/静态托管
- **什么算"蹭额度hack"**：GitHub Actions 跑 VNC、白嫖 CI 额度等

## 已知限制

| 限制 | 说明 |
|---|---|
| ❌ 推特（X） | 已完全无法抓取：SPA 页面 + Nitter 全挂 + API $200/月 |
| ⚠️ Reddit | 返回 403 Blocked，已用 Telegram/DEV.to/Lobsters 替代 |
| ⚠️ 部分论坛 | NodeSeek/V2EX 需登录才能看正文，AI 只能依据摘要判断（会标注置信度） |
| ⚠️ 免费额度会变 | Oracle/Koyeb 等政策随时调整，AI 判断基于抓取当时的信息 |

## 安全提醒

- 服务只监听 `127.0.0.1`，外网访问不到
- `.env` 里有 API key，**不要提交到 git 或发给他人**
- 论坛里的转卖信息有诈骗风险，AI 会标"二手交易"但你自己仍要判断
