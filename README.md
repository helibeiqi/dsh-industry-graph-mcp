# dsh-industry-graph-mcp

> 零依赖 · 本地优先的 **A股 产业链 / 申万行业 / 概念板块 知识图谱** MCP server。
> 无需 API key、无需联网，纯 Node.js（ESM）读取内置精选种子数据，供 DeepSeek Harness (dsh) 在对话中直接调用。

---

## 为什么做这个（定位）

在 dsh 插件生态里，办公文档生成（docx / pdf / pptx / excel）已是**红海**（竞品 30–215 个不等）；
而 **A股 领域知识 / 产业链 / 合规本地化** 是**蓝海**（竞品 0–1 个）。

本插件不比拼"再生成一个文档"，而是把**A股 实体关系的领域知识**做成可被大模型实时查询的本地图谱：
当策略研究 / 投研对话中需要"这只票属于什么行业、和谁同业、处在产业链哪一环、沾哪些题材"时，
agent 不再靠记忆硬猜，而是调用本 server 拿到结构化、可追溯的答案。

## 数据规模（v0.1.0 种子）

| 维度 | 数量 |
|------|------|
| 申万一级行业 | 31（完整一级） |
| 概念板块 | 52 |
| 产业链 | 14（含上/中/下游节点） |
| 覆盖个股 | 181（去重） |

数据为**人工精选种子**，刻意小而准，覆盖主流赛道；设计为可扩展（见下文"扩展数据"）。

---

## 工具清单（7 个）

| 工具 | 说明 | 关键参数 |
|------|------|----------|
| `industry_of_stock` | 查个股所属申万一级行业 + 关联概念 + 所在产业链 | `stock`（代码或名称） |
| `peers` | 同行业竞品（同业可比标的），可剔除自身 | `stock`, `exclude_self` |
| `chain_view` | 查看产业链上下游结构，可高亮某股票所在环节与上下游 | `chain`（id/名称）, `stock` |
| `concept_members` | 查询某概念板块成分股 | `concept` |
| `concept_intersect` | 两个概念的交集成分股（概念交叉选股） | `a`, `b` |
| `stock_search` | 按代码/名称子串模糊搜索覆盖标的 | `query` |
| `graph_stats` | 数据集规模概览 | — |

所有工具返回 **UTF-8 JSON 文本**，便于 agent 二次推理或直接呈现。

### 调用示例（dsh 对话）

- "宁德时代在哪个产业链、处在哪一环？上下游都有谁？"
  → `chain_view({chain:"锂电池产业链", stock:"300750"})`
- "白酒板块有哪些票？"
  → `concept_members({concept:"白酒"})`
- "同时沾半导体和 CPO 的票有哪些？"
  → `concept_intersect({a:"半导体", b:"CPO"})`
- "隆基绿能的同业竞品是谁？"
  → `peers({stock:"601012"})`

---

## 安装 / 接入 dsh

本仓库是一个 **dsh bundle**。把 `cordis.patch.yml` 合并进你的 dsh profile 即可注册为一个 mcp server。

`cordis.patch.yml` 中的关键路径（部署时改成你本机实际路径）：

```yaml
- insert:
    - path: plugins.mcp-servers
      items:
        - id: mcp-industry-graph
          name: A股产业链知识图谱
          transport: stdio
          command: !!js process.env.QUANT_MCP_NODE || process.execPath
          args:
            - "C:\\Users\\helib\\dsh-industry-graph-mcp\\industry-graph-mcp-server.mjs"
          cwd: "C:\\Users\\helib\\dsh-industry-graph-mcp"
          enabled: true
```

`command` 使用 `!!js process.env.QUANT_MCP_NODE || process.execPath` 的硬核写法，
可免疫本机 Node 版本目录漂移（如 `22.22.2` → `22.22.2-2`）。

### 本地独立验证（不依赖 dsh）

```bash
# 1) 生成数据（已生成可跳过）
python gen_graph.py

# 2) 自测 MCP 握手与各工具
python _selftest.py
```

---

## 扩展数据

种子数据集中在 `gen_graph.py`，三个列表即可扩展：

- `industries`：申万一级行业 → 代表性成分 `(code, name, [(code,name), ...])`
- `concepts`：概念板块 → 成分 `[(name, [(code,name), ...])]`
- `chains`：产业链 → 上/中/下游节点 `{id, name, nodes:[{stage, desc, members}]}`

改完运行 `python gen_graph.py` 重新生成 `data/industry-graph.json`，server 自动加载，无需改任何代码。

> 后续可导入用户自有清单（如自建题材池、自定义产业链），做到"本地优先 + 个人知识沉淀"。

---

## 架构要点

- **零依赖**：纯 Node ESM + `fs`，无 `npm install`，免疫 managed-node 漂移。
- **本地优先**：数据来自内置 `data/industry-graph.json`，不触网、不依赖第三方 API。
- **标准 MCP stdio**：`initialize → notifications/initialized → tools/list → tools/call`，协议版本 `2024-11-05`，NDJSON 行协议。

## License

MIT © helibeiqi
