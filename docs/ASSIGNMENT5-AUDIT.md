# Assignment 5 交付核对

核对时间：2026-11-03 13:24 CST。依据用户提供的五页 Live Data System 作业 PDF，核查了实际云端状态、真实服务测试、代码、Git 历史及 Google Classroom 提交页面。

**结论：核心系统与已提交的两个链接通过复核。同学试用已由用户确认完成。Supabase MCP 已完成真实连接查询，并通过 MCP 重发 worker、设置同一每分钟计划。已在会话完成四轮核心问答及必要澄清，覆盖数据链路、Realtime权限、新鲜度和测试/日志边界；这不是教师的正式考核或评分保证。**

## 逐项结果

| 作业项目 | 结果 | 实际证据 |
| --- | --- | --- |
| 变化的真实数据源 | 通过 | Divvy GBFS v2.3，当前 TTL 60 秒、2,079 个源站点；实现前两次采样与差异记录见 SOURCE-CHECK.md |
| 编码前高层数据流图 | 通过 | 初始规划提交 f5f755c 已含 Mermaid 流程图，业务实现位于后续提交；初始提交已有框架脚手架，不宣称仓库当时没有任何代码 |
| Supabase Edge Function | 通过 | dockside-poll 为 ACTIVE，仓库含 supabase/functions 代码；服务端使用平台提供的数据库写入凭据 |
| 持续定时运行 | 通过 | cron dockside-poll，* * * * *，active=true；过去24小时窗口有 1110 次成功运行（项目实际运行时间不足一天），失败记录 1 条 |
| 周期符合数据源 | 通过 | 60 秒对应源 TTL；PDF 第2页明确允许源变化慢/有限流时降低频率，不要求无条件每几秒重复请求 |
| 只 upsert 变化行、每次记日志 | 通过 | IS DISTINCT FROM 条件更新；真实事务验证单站变化为1、相同数据重放为0；逐次保存运行结果、读取量、变化量、缺失量、耗时 |
| 保存响应样本的 worker 测试 | 通过 | 真实 GBFS fixtures + 固定时钟；22/22 单元测试通过；数据库不变量测试验证真实持久化语义并回滚 |
| 无刷新实时更新 | 通过 | 两张表均加入 publication；真实 Postgres Changes 事件再次收到；前端生产连接使用 Realtime，断线重连后读取一致快照 |
| loading / fresh / stale / down | 通过 | 骨架与提示组件已实现；源/worker 180秒、单站300秒阈值；相关规则测试覆盖失败、旧源、单站过期及未知数据，不把缺失当零 |
| 登录、个人关注与 RLS | 通过 | 两个真实 Clerk JWT 再次验证本人读写成功，越权读取/删除与伪造归属被阻止；测试关注清理、会话撤销 |
| 指定技术栈与代码结构 | 通过 | Next.js、Tailwind、Clerk、Supabase；tsconfig 排除 supabase；网页与 worker 在同一个仓库；AGENTS.md 已读取，无项目 CLAUDE.md |
| Vercel 部署与自动发布 | 通过 | 公开页面、登录页、快照接口为200；GitHub main 触发生产部署，状态 READY |
| GitHub README 与过程提交 | 通过 | 仓库公开为200；README 有应用链接、图、设置、验证、限额说明；真实规划、采集、UI、部署、用户反馈改进提交均保留 |
| UI/UX 与迭代 | 通过 | 桌面、390px 手机布局已验；最近可用建议、跨区搜索、明确地点范围、低库存/备用站、可读性改进有回归记录 |
| 同学真人试用 | 用户确认完成 | 用户在本轮核查中确认已完成登录→收藏→无需刷新观察真实更新；具体日期与结果仍待用户补充，未由代理代填 |
| Classroom 提交 | 直接核验通过 | 页面状态 Turned in；两项附件分别为正确 Vercel 与 GitHub URL；没有撤回或修改提交 |
| 免费计划与费用保护 | 通过，见说明 | Vercel Hobby；Supabase Free、Spend cap enabled、No payment methods；本次未升级计划或添加付款方式 |
| Supabase MCP 工具连接 | 通过 | .mcp.json 与 .codex/config.toml 均限定本项目；OAuth 成功后通过实际 MCP execute_sql 返回40站、40条站况及活动计划；deploy_edge_function 发布第5版，并通过MCP设置同名每分钟cron。查询证据见 mcp-verification.json，发布/计划证据见 mcp-setup-verification.json |
| 课堂讲解 / 互动问答 | 四轮核心问答已完成 | 已逐题核对数据链路、publication/SELECT/RLS、新鲜度，以及幂等性、日志、权限与推送验证边界；对话中已澄清Cron、SQL比较位置及每轮记录日志的区别。正式课堂表现由教师评估 |

## 费用限制说明

数据库当前约 12.94 MiB；七天运行明细保留策略已设置。每60秒一次约43,200次调用/30天，另加人工验证；运行日志记录变化量，避免重写40个库存行。Realtime 用量随访问人数与消息扇出增长，不能用这个预算推断无限制使用。

Supabase 管理页面已直接显示 Free、费用上限启用、无付款方式。Vercel API 返回 Hobby。Hobby 的独立 Spend Management 不提供可配置预算；保持免费硬额度即可，不应为设置告警而升级付费计划。参考 [Supabase 费用控制](https://supabase.com/docs/guides/platform/cost-control) 与 [Vercel Hobby](https://vercel.com/docs/plans/hobby)。本报告未将不存在的自定义预算告警标成“已设置”。

## 三次最新运行如何解释

- 13:24:01 CST：success，读 40，改 3，缺失 0，耗时 757ms。
- 13:23:00 CST：success，读 40，改 3，缺失 0，耗时 267ms。
- 13:22:46 CST：success，读 40，改 0，缺失 0，耗时 303ms。

changed_count=0 表示本次库存及服务字段没有变化，仍是一次成功检查。健康时间更新与业务字段更新分开，库存没变不等于 worker 没工作。

记录中另有一次 10:39 CST 采集失败，错误码 invalid_source_response，未取得 HTTP 状态；10:40 CST 下一轮已自动成功，读取40站并写入4条变化。保留的精简日志不足以确定根因，因此不把它定性为已证实的网络或源格式问题。该次失败未覆盖上次成功库存，后续正常运行已恢复。

## 课堂说明的四个要点

1. Divvy 发布新数据；Cron 唤起 Edge Function；函数校验并调用事务；数据库只改变化库存行，写运行日志及心跳；Realtime 通知网页，网页对账并更新数值。
2. 流程图中的站点 ID、车型字段、数据库列及订阅表必须相互匹配；缺 publication、SELECT 权限或 RLS 条件中的任何一项都会影响事件交付。
3. 新鲜度要分开看 worker 最近成功、源时间、单站上报与浏览器连接；不以“数字是否变化”判断数据新旧。
4. 样本测试验证解析与变化检测，事务测试验证真实去重和权限，真实JWT测试验证Clerk信任链，Realtime测试验证真实推送。阅读最近运行的读取量、变化量、错误码与耗时。

以上是复习材料，不是对用户已掌握内容的证明。作业明确包含课堂解释和逐题练习。

## 非作业阻塞的产品后续项

任意地址搜索、本机免登录收藏、Clerk 生产实例属于后续产品工作。PDF 要求 Clerk 登录可用，没有要求购买自定义域名或隐藏开发模式。当前身份服务仍为开发实例，这项限制已公开说明。

## 待补记录

- 同学试用的真实日期与结果；不编造姓名或反馈。
- Supabase MCP 接入、实际查询、worker 发布与计划设置已补齐。继续保持本项目限定范围，OAuth 凭据不入库。
- 四轮核心问答已在会话完成，继续用 LEARNING.md 复习。提交已成功；以上核查未撤回提交。

原始检查摘要见 audit-2026-11-03.json；最新真实服务证据见 auth-verification.json 和 realtime-verification.json。
