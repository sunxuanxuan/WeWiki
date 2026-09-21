# Bidding 与 Auction 内部技术资料导航

<callout emoji="🎯">
**核心判断**
1. **内部资料已形成综述、技术方案与上线评审三层结构**：新人入口、约束优化、拍卖计价、Launch Review（上线评审，简称 LR）均有可点击原始材料；三类文档解决的问题不同，混在一起阅读会降低检索效率。
2. **综述材料应先统一拍卖机制、广告链路与术语口径**：新人指引、广告生命周期、机制设计分享分别覆盖 GFP/GSP/VCG、eCPM 与出价—排序—计费链路；先建立共同语言，再进入具体算法更有效。[[1]](https://bytedance.larkoffice.com/wiki/VcFuwtHTaiHoXckB9qWcTS9znTe?from=lark_search_qa&ccm_open_type=lark_search_qa#IHPZdohZ1o3I6CxOzGVc8RTAntL)[[7]](https://bytetech.info/articles/7412558023509737524)
3. **技术方案的最高复用价值集中在约束建模与工程稳定性**：拉格朗日对偶、PID/MPC、稀疏反馈和在离线一致性贯穿 CPA、ROI、预算与多端调控；具体业务指标可变，问题定义与控制骨架更值得迁移。[[10]](https://bytedance.larkoffice.com/docx/QwXld3WLDozBeCxrDGqcVPN1nDb)[[18]](https://bytedance.larkoffice.com/wiki/wikcnzpn0YvDJbyIQefictzTsge?from=lark_search_qa&ccm_open_type=lark_search_search_qa#doxcnKq70TMibF3xB8rBJ18GfEh)
4. **上线评审材料比方案文档更完整地暴露真实边界**：BidCap、Bid2X Lite、VCG、PreConvert 与生成式出价材料同时给出指标、流量边界、容量、灰度和回滚线索；关键数字仍需回到原始 LR 核验。[[25]](https://bytedance.larkoffice.com/docx/GwmddyiuiouvobxfceCcScLSnPd?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcndoIMintlLhbEIKbRkCLLWe)[[27]](https://bytedance.larkoffice.com/wiki/wikcnAnYzbfWAsgrF8mnlLbDSYg)
5. **最短阅读路径应由角色与当前任务共同决定**：新人先读全景，算法人员沿“统一建模—控制器—原始 LR”推进，架构与评审人员沿“在线链路—一致性—规范—复盘”推进；顺序选择比扩大文档数量更重要。
</callout>

> **本地 S 级资料：** 已整理 33 篇 S 级文档的转换状态、本地 Markdown、素材数量与权限说明，详见 [S 级文档本地索引](assets/s_docs/S_DOCS_INDEX.md)。

## 一、资料全景：三类材料回答三层问题

> **本节要点**：Auction 关注“如何分配与计价”，Bidding 关注“如何在约束下出价”，LR 关注“方案能否安全上线”。本清单以原始内部链接为主，每篇文档只归入一个主类型，跨章节仅用编号回指。

### 1.1 主题边界与术语口径

**Auction（拍卖）**涵盖候选分配、排序与计价，常见机制包括 GFP（广义一价）、GSP（广义二价）与 VCG（Vickrey–Clarke–Groves，按负外部性计价）。**Bidding（出价）**侧重广告主目标在请求级的决策映射，包括预算、CPA（单次行动成本）、ROI（投入产出比）与 GMV（成交总额）约束。二者在 eCPM（千次展示期望收入）、保留价和 rank bid（排序出价）处耦合。[[3]](https://bytedance.larkoffice.com/docx/PEB3dFAhJoGt0hxF6tIcdYdYnXf?from=lark_search_qa&ccm_open_type=lark_search_qa#WgqhdRbDYowvY2xKyYpcGPZQnmg)

**技术方案**解释问题定义、算法机制与工程实现；**LR/Launch**记录实验、护栏、容量、依赖、灰度和回滚；**复盘与规范**从事故或门禁反向校验方案假设。推荐阅读时应先识别文档类型，再判断其中的指标能否迁移到当前业务。

### 1.2 文档类型与优先级

<grid>
<column width-ratio="0.333333">
<callout emoji="📚">
**综述分享**
回答“领域由哪些机制、模块与术语构成”。适合建立地图；优先读 S 级入口，再按业务补充专题。
</callout>
</column>
<column width-ratio="0.333333">
<callout emoji="💡">
**技术方案**
回答“问题如何建模、算法如何实现、系统如何承载”。适合设计、复用与方案评审。
</callout>
</column>
<column width-ratio="0.333333">
<callout emoji="🚦">
**LR 与上线材料**
回答“指标是否成立、风险如何控制、失败后如何恢复”。适合 reviewer、发布与值班人员。
</callout>
</column>
</grid>

优先级采用两档：**S 为建议优先阅读**，能够建立框架或代表关键机制；**A 为按任务补充**，适合深入特定业务、工程或风险场景。优先级表示阅读顺序，不表示文档质量高低。

---

## 二、综述分享：先统一概念与链路

> **本节要点**：综述材料的价值在于建立共同问题空间。建议先用新人材料串起请求、排序与计费，再用机制设计和系统架构材料解释为什么选择特定拍卖与出价方法。

### 2.1 Auction 机制与市场设计

| 文档 | 解决的问题 | 推荐理由 | 适合读者 |
|-|-|-|-|
| [中国广告产品与 Data 新人 Landing 指引[1]](https://bytedance.larkoffice.com/wiki/VcFuwtHTaiHoXckB9qWcTS9znTe?from=lark_search_qa&ccm_open_type=lark_search_qa#IHPZdohZ1o3I6CxOzGVc8RTAntL) [本地 Markdown](assets/s_docs/S01_中国广告产品与Data新人Landing指引.md)  <br/>综述分享 · S | 术语、RTB 时序及竞价—展示—计费链路 | 概念密度高且面向新人，是零基础首篇候选。 | 产品、数据、研发新人 |
| [5 天从入门到精通学习资料[2]](https://bytedance.larkoffice.com/wiki/wikcnPPZkFawFbuIGsZJyoMt4CA?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcn2K0ImVBZZKHMP2XsvKuGpM) [本地 Markdown](assets/s_docs/S02_5天从入门到精通学习资料.md)  <br/>资料索引 · S | 把分散的拍卖机制与论文入口串成路径 | 覆盖经典机制、一价拍卖与复杂约束，便于继续追原文。 | 需要建立领域地图的新人 |
| [广告出价、计费基础分享[3]](https://bytedance.larkoffice.com/docx/PEB3dFAhJoGt0hxF6tIcdYdYnXf?from=lark_search_qa&ccm_open_type=lark_search_qa#WgqhdRbDYowvY2xKyYpcGPZQnmg) [本地 Markdown](assets/s_docs/S03_广告出价计费基础分享.md)  <br/>综述分享 · S | 统一 GFP、GSP、VCG 与自动出价基础 | 兼具理论、业务与论文目录，可作为机制学习主入口。 | 有广告基础的产品与算法 |
| [广告分享第二期：在线广告产品逻辑[4]](https://bytedance.larkoffice.com/wiki/wikcnGosp25LTYIOjkjKhmBmdBc?from=lark_search_qa&ccm_open_type=lark_search_qa#KYMSdsqIYoai8sxOWKScz78ynXd) [本地 Markdown](assets/s_docs/S04_在线广告产品逻辑.md)  <br/>综述分享 · S | 位置拍卖、社会福利、保留价与市场设计 | 把排序问题提升到供需与机制设计层，适合形成稳定框架。 | 产品、策略、数据科学、算法 |
| [从机制设计看广告拍卖[5]](https://bytetech.info/articles/7123141266497339399) **未转换，详见 [S 级索引](assets/s_docs/S_DOCS_INDEX.md)**  <br/>专题综述 · S | 解释一价/二价、激励与平台利益结构 | 连接经典理论、站内实践与自动出价下的机制选择。 | 机制设计与商业数据科学进阶读者 |
| [中国区竞价机制及出价产品概述[6]](https://bytedance.larkoffice.com/wiki/wikcnBDVxyIbfUk9QyZWJSOoO1d?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnDoyUVS3bhTwr05idWee9wg)  <br/>业务综述 · A | 按出价、排序、计费拆解中国区机制 | 主题边界清楚，适合把理论映射到业务资源调配。 | 产品、运营、研发、算法新人 |
| [OnePage：端变现平台拍卖架构（2025）[9]](https://bytedance.larkoffice.com/wiki/FDk6wgDvYiQah0kz41JcbVrpnWh?from=lark_search_qa&ccm_open_type=lark_search_qa#Rd2Sddo9aoGJpixBN3AccEdWnMc) [本地 Markdown](assets/s_docs/S08_端变现平台拍卖架构2025.md)  <br/>架构综述 · S | 大混排、Listwise、定价与流量分配全景 | 把拍卖扩展到跨业务价值、用户体验与平台化架构。 | 资深架构、排序与拍卖平台研发 |

### 2.2 Bidding 策略与优化框架

| 文档 | 解决的问题 | 推荐理由 | 适合读者 |
|-|-|-|-|
| [一个广告的生命周期[7]](https://bytetech.info/articles/7412558023509737524) **未转换，详见 [S 级索引](assets/s_docs/S_DOCS_INDEX.md)**  <br/>综合培训 · S | 把计费、竞价、预算和多类自动出价放回完整链路 | 机制理论与系统实践衔接自然，适合作为第二篇主干阅读。 | 投放系统研发、算法、产品 |
| [竞价广告智能出价技术演进梳理[8]](https://bytedance.larkoffice.com/docx/Vz5Hd1uivoXxXMxHDHgcrTnbnRc) [本地 Markdown](assets/s_docs/S07_竞价广告智能出价技术演进梳理.md)  <br/>技术演进综述 · S | 汇总 TargetCPA、GMV Pacing、MPC、Action2X、生成式出价与 VCG | 覆盖 40 余篇方案并精读约 20 篇 Launch/LR，是进入原始材料的最完整路线图。 | 出价算法、策略负责人、架构师 |

综述中的实验数字应作为定位原始材料的线索，而非直接比较不同方案的统一基准；流量、行业、实验周期和显著性通常要回到对应 LR 核验。

---

## 三、技术方案：复用价值集中在约束与工程

> **本节要点**：可迁移的核心并非某个固定阈值，而是“约束优化—环境建模—在线控制—反馈校准—稳定性兜底”的闭环。表内优先保留原理与工程方案，标题明确为 LR/Launch 的材料统一放入下一章。

### 3.1 出价与预算控制

| 文档 | 解决的问题 | 推荐理由 | 适合读者 |
|-|-|-|-|
| [广告业务中带约束的最优化问题[10]](https://bytedance.larkoffice.com/docx/QwXld3WLDozBeCxrDGqcVPN1nDb) [本地 Markdown](assets/s_docs/S09_广告业务中带约束的最优化问题.md)  <br/>原理方案 · S | 把预算、成本、ROI 约束写成统一优化问题 | 跨业务复用价值最高，为 PID、MPC 与强化学习提供共同数学骨架。 | 算法研究员、策略建模负责人 |
| [Target-Cost Bidding via MPC[11]](https://bytedance.us.larkoffice.com/docx/TLusdmnQZoM65cxi5uKuGkHfssh) [本地 Markdown](assets/s_docs/S10_Target-Cost_Bidding_via_MPC.md)  <br/>控制方案 · S | 用滚动规划处理目标成本与历史债务 | 清楚解释预测控制相对纯反馈控制的增量，可迁移到 CPA、ROI 与 pacing。 | 控制算法、自动出价研究员 |
| [高维出价[12]](https://bytedance.larkoffice.com/docx/Gpg4dU4B8ohrb7xn41qcPeSPnyf)  <br/>组级优化 · A | 改善低预算、低转化计划的稀疏反馈 | 以计划聚合和共享对偶变量加快收敛，长尾场景复用价值直接。 | 预算控制、长尾优化算法 |
| [autobidding 服务质量提升[13]](https://bytedance.larkoffice.com/wiki/wikcnjZl4y8u7TaNOGJRiPGw8yg?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnRfg7wUl5Q2Mcal3Rgftdoc)  <br/>工程优化 · A | 衔接实时出价、全量兜底、Redis 与控制器 | 少见地把算法与服务降级放在同一文档中，适合稳定性复用。 | 出价后端、在线服务、SRE |
| [广告主角度的 MPC 定价策略[14]](https://bytetech.info/articles/7145022461816340516)  <br/>策略方案 · A | 连接精排压力、最低胜出价与成本控制 | 明确区分广告主低频定价和系统高频出价，接口关系清晰。 | 自动出价与控制算法进阶读者 |

### 3.2 排序、计价与在线链路

| 文档 | 解决的问题 | 推荐理由 | 适合读者 |
|-|-|-|-|
| [GIP 广告系统 Overview[15]](https://bytedance.larkoffice.com/docx/MTxod6hJFo6ysHxlBjAcwDJ8nxg?from=lark_search_qa&ccm_open_type=lark_search_qa#Q5Ycd2czNoJxIixLPURcRRgAnMf) [本地 Markdown](assets/s_docs/S11_GIP广告系统Overview.md)  <br/>在线链路 · S | 统一商业价值、体验效用、门槛与计价 | 排序公式、HiddenCost、阈值和 GSP 兜底均有具体实现线索。 | 排序、重排、计费、广告引擎研发 |
| [基于流量价值预估的多目标排序机制[16]](https://bytedance.larkoffice.com/docx/GxmTdo7KwoCiWQxuRAlcm64YnBg?from=lark_search_qa&ccm_open_type=lark_search_qa#UWDxdlsiPoillTxFSxocLChCnyE) [本地 Markdown](assets/s_docs/S12_基于流量价值预估的多目标排序机制.md)  <br/>排序方案 · S | 处理商业价值与相关性的多目标融合 | 同时覆盖点值融合、序融合和请求级资源分配三类思路。 | 召回粗排、搜索广告、多目标学习研发 |
| [搜索广告投放流程与核心指标[17]](https://bytedance.larkoffice.com/wiki/Lc6ew2KmIiQVAKknpRfcrAkanee?from=lark_search_qa&ccm_open_type=lark_search_qa#JwWbdJfLkoc7ijx0aFPcc21Gnah)  <br/>链路方案 · A | 串起 eCPM、质量分与后验校准 | 能够从价值排序推进到“预估—投放—反馈—校准”闭环。 | 精排、预估校准、质量治理研发 |
| [OnePage：出价架构[18]](https://bytedance.larkoffice.com/wiki/wikcnzpn0YvDJbyIQefictzTsge?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnKq70TMibF3xB8rBJ18GfEh) [本地 Markdown](<assets/s_docs/S13_OnePage - 出价架构.md>)  <br/>架构方案 · S | 定义性能、稳定性、时效、一致性与发布安全 | 直接给出出价系统 SLO 和容灾、降级、灰度建设抓手。 | 出价平台、SRE、架构师 |
| [出价服务[19]](https://bytedance.larkoffice.com/wiki/wikcnnJnunMBoPF7g70efjHIvdf?from=lark_search_qa&ccm_open_type=lark_search_qa#GckOdCa2eoy6M0xysZicCz1LnQh)  <br/>服务实现 · A | 解释在离线协同、算子编排、分发与监控 | Swivel、BiddingUnit、DAG 与消息链路较完整，适合排查数据流。 | 出价平台、数据链路、可观测性研发 |

### 3.3 实验、探索与策略基础设施

| 文档 | 解决的问题 | 推荐理由 | 适合读者 |
|-|-|-|-|
| [Marginal TAC 2026/08[20]](https://bytedance.larkoffice.com/docx/BK9wd3Q2QoMrV5xDcJplJGKNgLb?from=lark_search_qa&ccm_open_type=lark_search_qa#KwzgdhhzFoaPWpxYkZJlpNOxgEh) **权限受限，暂未转换**  <br/>离线仿真 · S | 在非平稳市场中做反事实竞价模拟 | 本轮最直接的真实环境离线拍卖仿真案例，明确处理离散保留价与分时约束。 | 拍卖仿真、调控、实验评估研发 |
| [AdsBrain AutoCreation 与 ML Infra 方案[21]](https://bytedance.larkoffice.com/docx/OKejdPmmLostIWx23fqc3AvWng5?from=lark_search_qa&ccm_open_type=lark_search_qa) [本地 Markdown](<assets/s_docs/S15_[lanuch] 自动化投放中台统一框架AutoCreation上线&UBA策略迁移.md>)  <br/>策略基础设施 · S | 解耦策略复用、模型接入与决策执行 | DAG、实时特征、Uplift/RL 与 Lagrange 能力形成跨业务底座。 | 平台架构师、策略与模型平台工程师 |
| [投放中台技术实践[22]](https://bytetech.info/articles/7528252544380829732?from=aime&to=qimequery) **权限受限，暂未转换**  <br/>运筹与工程 · S | 在配额约束下完成预算分配和计划组装 | 兼具聚类、线性规划与分钟级流式工程演进，复用边界明确。 | 运筹优化、计划组装、平台工程师 |
| [素材探索与利用策略[23]](https://bytedance.larkoffice.com/docx/VY3RdHglQocEIHxdxQwcfzCInGe?from=lark_search_qa&ccm_open_type=lark_search_qa)  <br/>策略框架 · A | 协调冷启动保障与稳态利用 | 三队列 Quota、反马太纠偏和状态流转构成端到端工程结构。 | 探索利用、素材策略、预算分配算法 |
| [MEB 素材探索出价方案[24]](https://bytedance.larkoffice.com/docx/Wjfadbst0ocOLExOcBcc7n4SnFh?from=lark_search_qa&ccm_open_type=lark_search_qa) [本地 Markdown](<assets/s_docs/S17_[LR] AdsBrain：自动化海量素材探索利用框架在UBA、直播ROI2落地.md>)  <br/>模型化探索 · S | 把素材不确定性直接映射为出价调整 | 连接 uncertainty 与 bid adjustment，代表从静态配额向模型化探索的推进。 | Bandit、素材出价、自动投放算法 |

---

## 四、LR 与上线材料：真实边界集中暴露

> **本节要点**：高价值 LR 应同时回答目标、实验、护栏、容量、依赖、灰度和回滚。算法收益只说明“可能有效”，上线材料与复盘决定“能否持续、安全地有效”。

### 4.1 典型 LR 与 Launch

| 文档 | 上线对象 | 推荐理由 | 适合读者 |
|-|-|-|-|
| [Global Brand Auction BidCap 融合出价 LR[25]](https://bytedance.larkoffice.com/docx/GwmddyiuiouvobxfceCcScLSnPd?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcndoIMintlLhbEIKbRkCLLWe) [本地 Markdown](<assets/s_docs/S18_[LR][Global] TikTok Brand Auction BidCap计划上线基于Bid2X的融合出价.md>)  <br/>LR · S | Bid2X、MPC 与开闭环融合 | 目标、双约束、冷启、非平稳流量、回退与代码固化较完整。 | 出价算法、Ads Core、稳定性评审人 |
| [Search Target-Cost Stable Bidding 与 Gimbal LR[26]](https://bytedance.larkoffice.com/docx/doxcnOhDWINCSYZDeGxB2mGfy7d?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnw86k4UQIQq0S4uMWnNVJHc) [本地 Markdown](<assets/s_docs/S19_【LR】Search Target-Cost Bidding via Stable Bidding(稳态出价) & Gimbal.md>)  <br/>LR · S | 搜索风控出价推全与持续观察 | 明确屏蔽边界、推全记录和上线后观察，适合研究 LR 后治理。 | 搜索出价、风控、产品、实验评审 |
| [Bid2X Lite：轻量、鲁棒的竞价环境模型[27]](https://bytedance.larkoffice.com/wiki/wikcnAnYzbfWAsgrF8mnlLbDSYg) [本地 Markdown](assets/s_docs/S20_【Launch】Bid2X%20Lite：轻量、鲁棒的竞价环境模型.md)  <br/>Launch · S | 以一二价比简化环境弹性建模 | 兼具理论简化、工程降复杂度和线上实验，是环境模型上线代表。 | MPC、Bid2X、在线服务工程师 |
| [AdsBrain：Action2X 模型出价决策 LR[28]](https://bytedance.larkoffice.com/docx/ItO4d5VILovih2xgnQRcCOQOn0X) [本地 Markdown](assets/s_docs/S21_【LR】AdsBrain：自动化Action2x模型在出价决策上线.md)  <br/>LR · S | 参数化 MPC 向模型化决策推进 | 同时处理环境表征、标签噪声与还债出价平滑，风险治理线索充足。 | 出价模型、控制与实验评审人员 |
| [穿山甲 TargetCost 生成式出价 LR[29]](https://bytedance.larkoffice.com/docx/LvfVdJUR2oiYkFxnRyRc7htGnIc) [本地 Markdown](<assets/s_docs/S22_[LR] 穿山甲TargetCost 生成式出价.md>)  <br/>LR · S | Decision Transformer 序列出价 | 代表高风险模型直接决策出价，应重点阅读离线偏差、约束对齐和回滚。 | 生成式决策、离线强化学习、风险评审 |
| [通投最优出价边际计费比指标 LR[30]](https://bytedance.larkoffice.com/docx/NC5JddRdDo1VHHxH7EGc72J4npb) **权限受限，暂未转换**  <br/>LR · S | 用 MPR 对齐多端边际效率 | 连接微扰实验、预算效率、MC-MPC 与 Bid Shading，是跨端调控关键材料。 | 通投出价、机制、商业指标评审 |
| [出价中台 Hybrid PreConvert 迭代 LR[31]](https://bytedance.larkoffice.com/docx/doxcn7T3mFYfG2uJ5YZ6YEjiGLh) **权限受限，暂未转换**  <br/>LR · S | 分段融合先验与延迟后验 | “近端稳、远端准”的偏差—方差折中清晰，可迁移到 CPA、ROI、GMV。 | 转化预估、风控出价、校准算法 |
| [链式 PreConvert：Temporal Decay LR[32]](https://bytedance.larkoffice.com/wiki/R5swwa9I3ir87ekJsRLcacVCnnh) **权限受限，暂未转换**  <br/>LR · S | 请求级漏斗与时延衰减建模 | 把漏斗结构和延迟反馈统一到贝叶斯校准，技术完整度高。 | CVR/PVR、时延建模、ROI 出价算法 |
| [直播 ROI2 Cali One Model LR[33]](https://bytedance.larkoffice.com/docx/DXwMdh2h3oxFrxxIpjEcjq34nYg) [本地 Markdown](assets/s_docs/S26_LR直播ROI2通投MC2X：直播ROI2_Cali_One_Model.md)  <br/>LR · S | 多端软路由与分层校准 | 从外挂分桶升级到端到端校准，包含梯度稳定与先验设计。 | 校准模型、跨端出价、风控算法 |
| [基于 VCG 算法的广告拍卖机制[34]](https://bytedance.larkoffice.com/wiki/InGxwrE5BisQh9k6ZIhcWfNYned) **权限受限，暂未转换**  <br/>Launch · S | Listwise 分配与负外部性计价 | 直接给出内部 VCG 分配、定价与激励兼容定义，是机制切换原始入口。 | 拍卖机制、混排、计费工程研发 |
| [基于 VCG 算法的广告拍卖机制 V2[35]](https://bytedance.larkoffice.com/docx/CLoCdbvUeoEkI7xAgazcj5ennwh)  <br/>Launch · A | VCG 第二版机制与工程演进 | 适合与 V1 对读，核验性能、一致性、灰度及机制差异。 | 拍卖、计费、排序、架构评审 |
| [Pangle 闭环优惠券 softplus 建模 LR[36]](https://bytedance.larkoffice.com/docx/LtTydZqFNomVwxxKjw5c9zTGnme?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnOlgRGgBcM8E0OwklQQdtnf)  <br/>LR · A | 模型改动的容量、稳定性与回滚门禁 | 容量阈值、分桶指标和回滚时效较齐全，适合作为工程化样本。 | Pangle 模型、Serving、稳定性评审 |
| [Global 出价 BidMatrix 新架构升级 LR[37]](https://bytedance.larkoffice.com/docx/BoZFdnQ0DoZHWvxo3Vrlz13hgKe?from=lark_search_qa&ccm_open_type=lark_search_qa#JqO9d2j1johbSPxAmdzlA1VMgvg) **权限受限，暂未转换**  <br/>LR · S | 原子化 OP 与可编排 DAG 架构 | 适合观察出价服务如何从业务堆叠演进为低延迟、可扩展平台。 | 出价架构、平台工程、策略研发 |

### 4.2 风险、回滚与复盘线索

| 文档 | 材料类型 | 推荐理由 | 适合读者 |
|-|-|-|-|
| [品牌竞价一期测试方案[38]](https://bytedance.larkoffice.com/wiki/wikcnIkAudtt6EH5w3vz7NNEs4b?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnZsrLjqzfKzGypp7OcCCW8b) **权限受限，暂未转换**  <br/>上线测试 · S | 正式 LR 前的质量门禁 | 明确保留“测试未覆盖”项，风险按投放、效果、策略与性能分组。 | 测试、模型、投放系统与上线负责人 |
| [Pangle minbid 模型与 Lastlook 下线 LR[39]](https://bytedance.larkoffice.com/docx/WLIMdYwmjoR9CRxkzRacFQPgn4c?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnzxq3zSiVQ1KDWroKJqklCg)  <br/>策略切换 LR · A | 新旧策略切换与配置上线 | 预算分桶、冷启动、爆量掉量、行业、出价和系统指标覆盖较全。 | Pangle 出价、实验、配置平台与值班人员 |
| [Launch Review Guidelines On Bidding[40]](https://bytedance.sg.larkoffice.com/docx/AgJnd4BbwoGW2ZxrGUKlLzs4gSg) [本地 Markdown](assets/s_docs/S30_Launch_Review_Guidelines_On_Bidding.md)  <br/>专项规范 · S | 出价策略的定位、回滚与降级闭环 | 最接近 bidding 专项 LR 规范，应作为作者与 reviewer 的共同入口。 | 策略作者、LR reviewer、发布值班、SRE |
| [穿山甲 LR 工程上线模板[41]](https://bytedance.feishu.cn/docx/doxcn6W4gwja2SNvBXUj9XiY9Ub) **权限受限，暂未转换**  <br/>上线模板 · S | 统一容量、发布、回滚与监控检查项 | 可直接用于补齐工程门禁，但现行阈值仍需向维护方确认。 | Pangle 算法、工程、SRE、审批人 |
| [穿山甲 7—8 月质量 Review 与 9—10 月保障计划[42]](https://bytedance.larkoffice.com/wiki/wikcndhIQZqyytVO2P8xY4hDopb?from=lark_search_qa&ccm_open_type=lark_search_qa#) **权限受限，暂未转换**  <br/>质量复盘 · S | 反作弊、pacing、模型停更与基础设施事故 | 能从真实故障反向提炼 LR 监控、报警和回滚要求。 | Pangle、反作弊、模型平台、质量负责人 |
| [行业变现 2025 Q1 质量 Review[43]](https://bytedance.larkoffice.com/wiki/MYEOwSpoWinaqPkW3B9covw5nMc?from=lark_search_qa&ccm_open_type=lark_search_qa#HZwGdmoxyoG4Ghx14Fncmtu9nvd) **权限受限，暂未转换**  <br/>季度复盘 · S | 模型偏差被出价放大后的发现与止损 | 包含 MTTR、报警缺口和恢复滞后，适合建立模型—出价联合预案。 | 出价、模型、Oncall、质量与风险治理 |
| [排查手册[44]](https://bytedance.larkoffice.com/wiki/wikcnuAcAEQXYxXZmwPlEmZCCGg?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnIXZC26mRNz4W2tHhV446Zc)  <br/>故障手册 · A | 按消耗、回流、预估、rank bid 与 pacing 定位故障 | 可把观测项转成故障树和回滚判据；出价章节已标记过时，需校准。 | 出价算法、值班、模型诊断人员 |

---

## 五、阅读顺序：角色决定最短路径

> **本节要点**：同一批材料不应使用统一阅读顺序。新人要先获得概念闭环，算法人员要先掌握公共建模骨架，架构与 reviewer 要优先理解在线依赖、失败模式和回滚条件。

### 5.1 新人：先全景，再机制

1. 先读新人 Landing 指引 [[1]](https://bytedance.larkoffice.com/wiki/VcFuwtHTaiHoXckB9qWcTS9znTe?from=lark_search_qa&ccm_open_type=lark_search_qa#IHPZdohZ1o3I6CxOzGVc8RTAntL)，建立参与方、请求与计费术语。
2. 再读《一个广告的生命周期》 [[7]](https://bytetech.info/articles/7412558023509737524)，把拍卖放回投放全链路。
3. 随后读基础分享 [[3]](https://bytedance.larkoffice.com/docx/PEB3dFAhJoGt0hxF6tIcdYdYnXf?from=lark_search_qa&ccm_open_type=lark_search_qa#WgqhdRbDYowvY2xKyYpcGPZQnmg) 与机制设计专题 [[5]](https://bytetech.info/articles/7123141266497339399)，理解 GFP/GSP/VCG 的适用条件。
4. 最后进入 2025 拍卖架构 [[9]](https://bytedance.larkoffice.com/wiki/FDk6wgDvYiQah0kz41JcbVrpnWh?from=lark_search_qa&ccm_open_type=lark_search_qa#Rd2Sddo9aoGJpixBN3AccEdWnMc)，观察机制如何扩展到大混排与流量分配。

### 5.2 算法：框架、控制器、原始 LR

1. 先用技术演进综述 [[8]](https://bytedance.larkoffice.com/docx/Vz5Hd1uivoXxXMxHDHgcrTnbnRc) 定位主题，不直接把汇总数字当统一基准。
2. 精读约束优化 [[10]](https://bytedance.larkoffice.com/docx/QwXld3WLDozBeCxrDGqcVPN1nDb) 与 MPC 原理 [[11]](https://bytedance.us.larkoffice.com/docx/TLusdmnQZoM65cxi5uKuGkHfssh)，建立公共问题定义。
3. 按场景选择环境模型 [[27]](https://bytedance.larkoffice.com/wiki/wikcnAnYzbfWAsgrF8mnlLbDSYg)、模型化决策 [[28]](https://bytedance.larkoffice.com/docx/ItO4d5VILovih2xgnQRcCOQOn0X) 或生成式策略 [[29]](https://bytedance.larkoffice.com/docx/LvfVdJUR2oiYkFxnRyRc7htGnIc)。
4. 涉及延迟反馈时，继续对读 Hybrid PreConvert [[31]](https://bytedance.larkoffice.com/docx/doxcn7T3mFYfG2uJ5YZ6YEjiGLh)、链式建模 [[32]](https://bytedance.larkoffice.com/wiki/R5swwa9I3ir87ekJsRLcacVCnnh) 与 Cali One Model [[33]](https://bytedance.larkoffice.com/docx/DXwMdh2h3oxFrxxIpjEcjq34nYg)。

### 5.3 架构与评审：先看失败条件

1. 从出价架构 [[18]](https://bytedance.larkoffice.com/wiki/wikcnzpn0YvDJbyIQefictzTsge?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnKq70TMibF3xB8rBJ18GfEh) 与出价服务 [[19]](https://bytedance.larkoffice.com/wiki/wikcnnJnunMBoPF7g70efjHIvdf?from=lark_search_qa&ccm_open_type=lark_search_qa#GckOdCa2eoy6M0xysZicCz1LnQh) 明确在线依赖、数据分发与 SLO。
2. 用 VCG V1/V2 [[34]](https://bytedance.larkoffice.com/wiki/InGxwrE5BisQh9k6ZIhcWfNYned)[[35]](https://bytedance.larkoffice.com/docx/CLoCdbvUeoEkI7xAgazcj5ennwh) 或 BidMatrix [[37]](https://bytedance.larkoffice.com/docx/BoZFdnQ0DoZHWvxo3Vrlz13hgKe?from=lark_search_qa&ccm_open_type=lark_search_qa#JqO9d2j1johbSPxAmdzlA1VMgvg) 检查机制与架构变更。
3. 评审前对照专项规范 [[40]](https://bytedance.sg.larkoffice.com/docx/AgJnd4BbwoGW2ZxrGUKlLzs4gSg) 和工程模板 [[41]](https://bytedance.feishu.cn/docx/doxcn6W4gwja2SNvBXUj9XiY9Ub) 补齐门禁。
4. 最后用质量复盘 [[42]](https://bytedance.larkoffice.com/wiki/wikcndhIQZqyytVO2P8xY4hDopb?from=lark_search_qa&ccm_open_type=lark_search_qa#)[[43]](https://bytedance.larkoffice.com/wiki/MYEOwSpoWinaqPkW3B9covw5nMc?from=lark_search_qa&ccm_open_type=lark_search_qa#HZwGdmoxyoG4Ghx14Fncmtu9nvd) 反向检查报警、止损和恢复假设。

---

## 六、综合判断：先读框架，再追原始 LR

<callout emoji="📌">
**综合判断：从框架综述进入原始方案，再以 LR 校验边界，是当前最稳健的阅读顺序**
这一结论来自三层证据：综述材料已经给出机制与路线图，原理文档提供可迁移的约束优化骨架，原始 LR 与质量复盘则暴露实验口径、容量、灰度、回滚和恢复成本。三层相互校验后，才能区分“可理解”“可复用”与“可上线”。
残余风险与反向信号：
1. 部分基础材料对线上主流机制的表述存在时间与业务线差异，GSP、VCG 的现状需按端和流量范围确认。
2. 汇总材料中的收益数字沿用不同实验口径，不宜直接排序或合并计算。
3. 部分模板、手册与容量阈值可能已过时，使用前应向维护方确认现行规范。
</callout>

若目标是快速形成领域认知，优先完成第 5.1 路径即可；若要设计新方案，应至少补齐第 5.2 的统一建模与一个同类 LR；若要承担上线评审，还需把第 5.3 的规范、复盘和回滚条件纳入评审清单。判断标准应从“文档数量”转为“问题定义、机制、实验与生产防线是否闭环”。

---

## 待验证与口径说明

<callout emoji="🔍">
**待验证与口径说明**（用于阅读导航，不作跨方案精确比较）：
- 多数原始 LR 的作者、创建时间、更新时间及实验周期未由检索摘要完整披露；关键数字应打开原始文档核验。
- 线上主流拍卖机制存在口径冲突：部分基础材料表述为 GSP，较新的综述与 VCG Launch 指向大混排的 VCG 演进；需按端、场景、时间和流量比例确认。[[8]](https://bytedance.larkoffice.com/docx/Vz5Hd1uivoXxXMxHDHgcrTnbnRc)[[34]](https://bytedance.larkoffice.com/wiki/InGxwrE5BisQh9k6ZIhcWfNYned)
- Bid2X Lite、Action2X、生成式出价、MPR、PreConvert 与 Cali One Model 的实验流量、周期、显著性和护栏指标需要回查各自 LR。
- 统一 Auction simulator、replay、离线策略评估的数据契约与准入流程未被完整召回；当前仅保留 Marginal TAC 作为反事实模拟案例。[[20]](https://bytedance.larkoffice.com/docx/BK9wd3Q2QoMrV5xDcJplJGKNgLb?from=lark_search_qa&ccm_open_type=lark_search_qa#KwzgdhhzFoaPWpxYkZJlpNOxgEh)
- 穿山甲模板中的容量门槛与回滚时效、旧《排查手册》的出价章节是否仍为现行口径，使用前需向规范维护方确认。[[41]](https://bytedance.feishu.cn/docx/doxcn6W4gwja2SNvBXUj9XiY9Ub)[[44]](https://bytedance.larkoffice.com/wiki/wikcnuAcAEQXYxXZmwPlEmZCCGg?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnIXZC26mRNz4W2tHhV446Zc)
</callout>

---

## 参考文献

- [1] 内部知识库，《中国广告产品&Data-中国交易与广告-新人 Landing 指引》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/VcFuwtHTaiHoXckB9qWcTS9znTe?from=lark_search_qa&ccm_open_type=lark_search_qa#IHPZdohZ1o3I6CxOzGVc8RTAntL) [本地 Markdown](assets/s_docs/S01_中国广告产品与Data新人Landing指引.md)
- [2] 内部知识库，《5 天从入门到精通-商业产品/数据科学新人学习资料》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/wikcnPPZkFawFbuIGsZJyoMt4CA?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcn2K0ImVBZZKHMP2XsvKuGpM) [本地 Markdown](assets/s_docs/S02_5天从入门到精通学习资料.md)
- [3] 内部知识库，《广告出价、计费基础分享》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/PEB3dFAhJoGt0hxF6tIcdYdYnXf?from=lark_search_qa&ccm_open_type=lark_search_qa#WgqhdRbDYowvY2xKyYpcGPZQnmg) [本地 Markdown](assets/s_docs/S03_广告出价计费基础分享.md)
- [4] 内部知识库，《广告分享第二期：在线广告产品逻辑》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/wikcnGosp25LTYIOjkjKhmBmdBc?from=lark_search_qa&ccm_open_type=lark_search_qa#KYMSdsqIYoai8sxOWKScz78ynXd) [本地 Markdown](assets/s_docs/S04_在线广告产品逻辑.md)
- [5] ByteTech，《从机制设计看广告拍卖_商业产品数据科学》，日期未披露。[原始链接](https://bytetech.info/articles/7123141266497339399) **未转换，详见 [S 级索引](assets/s_docs/S_DOCS_INDEX.md)**
- [6] 内部知识库，《中国区竞价机制及出价产品概述》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/wikcnBDVxyIbfUk9QyZWJSOoO1d?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnDoyUVS3bhTwr05idWee9wg)
- [7] ByteTech，《一个广告的生命周期》，2024-09-09。[原始链接](https://bytetech.info/articles/7412558023509737524) **未转换，详见 [S 级索引](assets/s_docs/S_DOCS_INDEX.md)**
- [8] 孙轩轩，《竞价广告智能出价技术演进梳理》，2026-07-01。[原始链接](https://bytedance.larkoffice.com/docx/Vz5Hd1uivoXxXMxHDHgcrTnbnRc) [本地 Markdown](assets/s_docs/S07_竞价广告智能出价技术演进梳理.md)
- [9] 内部知识库，《OnePage-端变现平台-拍卖架构（2025）》，2025。[原始链接](https://bytedance.larkoffice.com/wiki/FDk6wgDvYiQah0kz41JcbVrpnWh?from=lark_search_qa&ccm_open_type=lark_search_qa#Rd2Sddo9aoGJpixBN3AccEdWnMc) [本地 Markdown](assets/s_docs/S08_端变现平台拍卖架构2025.md)
- [10] 内部文档，《广告业务中带约束的最优化问题》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/QwXld3WLDozBeCxrDGqcVPN1nDb) [本地 Markdown](assets/s_docs/S09_广告业务中带约束的最优化问题.md)
- [11] 内部文档，《Target-Cost Bidding via MPC》，日期未披露。[原始链接](https://bytedance.us.larkoffice.com/docx/TLusdmnQZoM65cxi5uKuGkHfssh) [本地 Markdown](assets/s_docs/S10_Target-Cost_Bidding_via_MPC.md)
- [12] 内部文档，《高维出价》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/Gpg4dU4B8ohrb7xn41qcPeSPnyf)
- [13] 内部知识库，《autobidding 服务质量提升》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/wikcnjZl4y8u7TaNOGJRiPGw8yg?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnRfg7wUl5Q2Mcal3Rgftdoc)
- [14] ByteTech，《广告主角度的 MPC 定价策略》，2022-09-19。[原始链接](https://bytetech.info/articles/7145022461816340516)
- [15] 内部文档，《GIP 广告系统 Overview》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/MTxod6hJFo6ysHxlBjAcwDJ8nxg?from=lark_search_qa&ccm_open_type=lark_search_qa#Q5Ycd2czNoJxIixLPURcRRgAnMf) [本地 Markdown](assets/s_docs/S11_GIP广告系统Overview.md)
- [16] 内部文档，《基于流量价值预估的多目标排序机制》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/GxmTdo7KwoCiWQxuRAlcm64YnBg?from=lark_search_qa&ccm_open_type=lark_search_qa#UWDxdlsiPoillTxFSxocLChCnyE) [本地 Markdown](assets/s_docs/S12_基于流量价值预估的多目标排序机制.md)
- [17] 内部知识库，《搜索广告投放流程&核心指标》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/Lc6ew2KmIiQVAKknpRfcrAkanee?from=lark_search_qa&ccm_open_type=lark_search_qa#JwWbdJfLkoc7ijx0aFPcc21Gnah)
- [18] 内部知识库，《OnePage-出价架构》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/wikcnzpn0YvDJbyIQefictzTsge?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnKq70TMibF3xB8rBJ18GfEh) [本地 Markdown](<assets/s_docs/S13_OnePage - 出价架构.md>)
- [19] 内部知识库，《出价服务》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/wikcnnJnunMBoPF7g70efjHIvdf?from=lark_search_qa&ccm_open_type=lark_search_qa#GckOdCa2eoy6M0xysZicCz1LnQh)
- [20] 内部文档，《Marginal TAC 2026/08》，2026-08。[原始链接](https://bytedance.larkoffice.com/docx/BK9wd3Q2QoMrV5xDcJplJGKNgLb?from=lark_search_qa&ccm_open_type=lark_search_qa#KwzgdhhzFoaPWpxYkZJlpNOxgEh) **权限受限，暂未转换**
- [21] 内部文档，《AdsBrain AutoCreation + ML Infra 方案》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/OKejdPmmLostIWx23fqc3AvWng5?from=lark_search_qa&ccm_open_type=lark_search_qa) [本地 Markdown](<assets/s_docs/S15_[lanuch] 自动化投放中台统一框架AutoCreation上线&UBA策略迁移.md>)
- [22] ByteTech，《投放中台技术实践》，日期未披露。[原始链接](https://bytetech.info/articles/7528252544380829732?from=aime&to=qimequery) **权限受限，暂未转换**
- [23] 内部文档，《素材探索与利用策略》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/VY3RdHglQocEIHxdxQwcfzCInGe?from=lark_search_qa&ccm_open_type=lark_search_qa)
- [24] 内部文档，《MEB 素材探索出价方案》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/Wjfadbst0ocOLExOcBcc7n4SnFh?from=lark_search_qa&ccm_open_type=lark_search_qa) [本地 Markdown](<assets/s_docs/S17_[LR] AdsBrain：自动化海量素材探索利用框架在UBA、直播ROI2落地.md>)
- [25] 内部 LR，《Global TikTok Brand Auction BidCap 计划上线基于 Bid2X 的融合出价》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/GwmddyiuiouvobxfceCcScLSnPd?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcndoIMintlLhbEIKbRkCLLWe) [本地 Markdown](<assets/s_docs/S18_[LR][Global] TikTok Brand Auction BidCap计划上线基于Bid2X的融合出价.md>)
- [26] 内部 LR，《Search Target-Cost Bidding via Stable Bidding & Gimbal》，年份未披露。[原始链接](https://bytedance.larkoffice.com/docx/doxcnOhDWINCSYZDeGxB2mGfy7d?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnw86k4UQIQq0S4uMWnNVJHc) [本地 Markdown](<assets/s_docs/S19_【LR】Search Target-Cost Bidding via Stable Bidding(稳态出价) & Gimbal.md>)
- [27] 内部 Launch，《Bid2X Lite：轻量、鲁棒的竞价环境模型》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/wikcnAnYzbfWAsgrF8mnlLbDSYg) [本地 Markdown](assets/s_docs/S20_【Launch】Bid2X%20Lite：轻量、鲁棒的竞价环境模型.md)
- [28] 内部 LR，《AdsBrain：自动化 Action2X 模型在出价决策上线》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/ItO4d5VILovih2xgnQRcCOQOn0X) [本地 Markdown](assets/s_docs/S21_【LR】AdsBrain：自动化Action2x模型在出价决策上线.md)
- [29] 内部 LR，《穿山甲 TargetCost 生成式出价》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/LvfVdJUR2oiYkFxnRyRc7htGnIc) [本地 Markdown](<assets/s_docs/S22_[LR] 穿山甲TargetCost 生成式出价.md>)
- [30] 内部 LR，《通投最优出价边际计费比指标》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/NC5JddRdDo1VHHxH7EGc72J4npb) **权限受限，暂未转换**
- [31] 内部 LR，《出价中台 Hybrid PreConvert 迭代》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/doxcn7T3mFYfG2uJ5YZ6YEjiGLh) **权限受限，暂未转换**
- [32] 内部 LR，《链式 PreConvert: Funnel Modeling with Temporal Decay》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/R5swwa9I3ir87ekJsRLcacVCnnh) **权限受限，暂未转换**
- [33] 内部 LR，《直播 ROI2 出价中台 PreConvert One Model》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/DXwMdh2h3oxFrxxIpjEcjq34nYg) [本地 Markdown](assets/s_docs/S26_LR直播ROI2通投MC2X：直播ROI2_Cali_One_Model.md)
- [34] 内部 Launch，《基于 VCG 算法的广告拍卖机制》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/InGxwrE5BisQh9k6ZIhcWfNYned) **权限受限，暂未转换**
- [35] 内部 Launch，《基于 VCG 算法的广告拍卖机制 V2》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/CLoCdbvUeoEkI7xAgazcj5ennwh)
- [36] 内部 LR，《Pangle 闭环优惠券建模采用 softplus 激活函数》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/LtTydZqFNomVwxxKjw5c9zTGnme?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnOlgRGgBcM8E0OwklQQdtnf)
- [37] 内部 LR，《Global 出价 BidMatrix 新架构升级》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/BoZFdnQ0DoZHWvxo3Vrlz13hgKe?from=lark_search_qa&ccm_open_type=lark_search_qa#JqO9d2j1johbSPxAmdzlA1VMgvg) **权限受限，暂未转换**
- [38] 内部知识库，《品牌竞价一期测试方案》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/wikcnIkAudtt6EH5w3vz7NNEs4b?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnZsrLjqzfKzGypp7OcCCW8b) **权限受限，暂未转换**
- [39] 内部 LR，《pangle 竞价使用 minbid 模型 + Lastlook 策略下线》，日期未披露。[原始链接](https://bytedance.larkoffice.com/docx/WLIMdYwmjoR9CRxkzRacFQPgn4c?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnzxq3zSiVQ1KDWroKJqklCg)
- [40] 内部规范，《Launch Review Guidelines On Bidding》，日期未披露。[原始链接](https://bytedance.sg.larkoffice.com/docx/AgJnd4BbwoGW2ZxrGUKlLzs4gSg) [本地 Markdown](assets/s_docs/S30_Launch_Review_Guidelines_On_Bidding.md)
- [41] 内部模板，《穿山甲 LR 工程上线模板》，日期未披露。[原始链接](https://bytedance.feishu.cn/docx/doxcn6W4gwja2SNvBXUj9XiY9Ub) **权限受限，暂未转换**
- [42] 内部知识库，《穿山甲 7—8 月质量 Review 与 9—10 月质量保障计划》，年份未披露。[原始链接](https://bytedance.larkoffice.com/wiki/wikcndhIQZqyytVO2P8xY4hDopb?from=lark_search_qa&ccm_open_type=lark_search_qa#) **权限受限，暂未转换**
- [43] 内部知识库，《行业变现 2025 Q1 质量 Review》，2025 Q1。[原始链接](https://bytedance.larkoffice.com/wiki/MYEOwSpoWinaqPkW3B9covw5nMc?from=lark_search_qa&ccm_open_type=lark_search_qa#HZwGdmoxyoG4Ghx14Fncmtu9nvd) **权限受限，暂未转换**
- [44] 内部知识库，《排查手册》，日期未披露。[原始链接](https://bytedance.larkoffice.com/wiki/wikcnuAcAEQXYxXZmwPlEmZCCGg?from=lark_search_qa&ccm_open_type=lark_search_qa#doxcnIXZC26mRNz4W2tHhV446Zc)
