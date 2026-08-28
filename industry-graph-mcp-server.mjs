// dsh-industry-graph-mcp — 零依赖本地优先 A股 产业链/行业/概念 知识图谱 MCP server
// 协议: MCP stdio (NDJSON). 协议版本 2024-11-05.
// 数据: ./data/industry-graph.json (人工精选种子, 无需 API key / 网络).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, 'data', 'industry-graph.json');

const log = (...a) => process.stderr.write('[ig-mcp] ' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n');

let GRAPH = null;
let IDX = null;

function loadGraph() {
  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  GRAPH = JSON.parse(raw);
  // 构建索引
  const codeToName = new Map();      // code -> name
  const nameToCodes = new Map();     // name -> [code]
  const stockIndustries = new Map(); // code -> [{code,name}]
  const stockConcepts = new Map();   // code -> [conceptName]
  const stockChains = new Map();     // code -> [{id,name,stage}]
  const conceptIndex = new Map();    // conceptName -> {name, members}
  const chainIndex = new Map();      // chainId -> chain
  const chainNameIndex = new Map();  // chainName -> chain

  for (const ind of GRAPH.industries) {
    for (const m of ind.members) {
      codeToName.set(m.code, m.name);
      if (!nameToCodes.has(m.name)) nameToCodes.set(m.name, []);
      nameToCodes.get(m.name).push(m.code);
      if (!stockIndustries.has(m.code)) stockIndustries.set(m.code, []);
      stockIndustries.get(m.code).push({ code: ind.code, name: ind.name });
    }
  }
  for (const c of GRAPH.concepts) {
    conceptIndex.set(c.name, c);
    for (const m of c.members) {
      codeToName.set(m.code, m.name);
      if (!nameToCodes.has(m.name)) nameToCodes.set(m.name, []);
      nameToCodes.get(m.name).push(m.code);
      if (!stockConcepts.has(m.code)) stockConcepts.set(m.code, []);
      stockConcepts.get(m.code).push(c.name);
    }
  }
  for (const ch of GRAPH.chains) {
    chainIndex.set(ch.id, ch);
    chainNameIndex.set(ch.name, ch);
    for (const nd of ch.nodes) {
      for (const m of nd.members) {
        codeToName.set(m.code, m.name);
        if (!nameToCodes.has(m.name)) nameToCodes.set(m.name, []);
        nameToCodes.get(m.name).push(m.code);
        if (!stockChains.has(m.code)) stockChains.set(m.code, []);
        stockChains.get(m.code).push({ id: ch.id, name: ch.name, stage: nd.stage });
      }
    }
  }
  IDX = { codeToName, nameToCodes, stockIndustries, stockConcepts, stockChains, conceptIndex, chainIndex, chainNameIndex };
  log('loaded graph:', GRAPH.industries.length, 'industries,', GRAPH.concepts.length, 'concepts,', GRAPH.chains.length, 'chains');
}

// ---- 解析股票: 支持 6 位代码 / 名称 / 子串 ----
function resolveStock(q) {
  if (!q) return [];
  q = String(q).trim();
  const out = [];
  if (/^\d{6}$/.test(q) && IDX.codeToName.has(q)) {
    out.push({ code: q, name: IDX.codeToName.get(q), exact: true });
  }
  // 名称精确
  if (IDX.nameToCodes.has(q)) {
    for (const code of IDX.nameToCodes.get(q)) {
      out.push({ code, name: q, exact: true });
    }
  }
  if (out.length) return dedupe(out);
  // 子串匹配 (名称或代码包含 q)
  const seen = new Set();
  for (const [name, codes] of IDX.nameToCodes) {
    if (name.includes(q) || q.includes(name)) {
      for (const code of codes) {
        const k = code + name;
        if (!seen.has(k)) { seen.add(k); out.push({ code, name, exact: false }); }
      }
    }
  }
  for (const [code, name] of IDX.codeToName) {
    if (code.includes(q)) {
      const k = code + name;
      if (!seen.has(k)) { seen.add(k); out.push({ code, name, exact: false }); }
    }
  }
  return out.slice(0, 10);
}
function dedupe(arr) {
  const seen = new Set(); const out = [];
  for (const x of arr) { const k = x.code + x.name; if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out;
}

// ---- 解析概念: 精确 / 子串 ----
function resolveConcept(q) {
  q = String(q).trim();
  if (IDX.conceptIndex.has(q)) return IDX.conceptIndex.get(q);
  for (const [name, c] of IDX.conceptIndex) if (name.includes(q) || q.includes(name)) return c;
  return null;
}

// ---- 解析产业链: id 精确 / 名称 精确 / 子串 ----
function resolveChain(q) {
  q = String(q).trim();
  if (IDX.chainIndex.has(q)) return IDX.chainIndex.get(q);
  if (IDX.chainNameIndex.has(q)) return IDX.chainNameIndex.get(q);
  for (const [name, ch] of IDX.chainNameIndex) if (name.includes(q) || q.includes(name)) return ch;
  return null;
}

// ============ 工具实现 ============
const TOOLS = [
  {
    name: 'industry_of_stock',
    description: '查询某只 A股 所属的申万一级行业、关联的概念板块、以及所在产业链。输入 6 位代码或股票名称。',
    inputSchema: { type: 'object', properties: { stock: { type: 'string', description: '6 位股票代码 或 股票名称, 如 "600519" 或 "贵州茅台"' } }, required: ['stock'] }
  },
  {
    name: 'peers',
    description: '查询同申万一级行业的竞品公司（同业可比标的）。可选是否剔除自身。',
    inputSchema: { type: 'object', properties: { stock: { type: 'string', description: '6 位代码 或 名称' }, exclude_self: { type: 'boolean', description: '是否剔除输入标的自身, 默认 true', default: true } }, required: ['stock'] }
  },
  {
    name: 'chain_view',
    description: '查看某条产业链的上下游结构（上游→下游节点与成分股）。可按产业链 id/名称查询, 也可附带 stock 高亮其所在环节与上下游。',
    inputSchema: { type: 'object', properties: { chain: { type: 'string', description: '产业链 id (如 lithium) 或 名称 (如 "锂电池产业链")' }, stock: { type: 'string', description: '可选: 高亮该股票所在环节', nullable: true } }, required: ['chain'] }
  },
  {
    name: 'concept_members',
    description: '查询某概念板块的成分股。支持概念名称精确/模糊匹配。',
    inputSchema: { type: 'object', properties: { concept: { type: 'string', description: '概念名称, 如 "CPO" "半导体" "白酒"' } }, required: ['concept'] }
  },
  {
    name: 'concept_intersect',
    description: '求两个概念板块的交集成分股（概念交叉选股）。',
    inputSchema: { type: 'object', properties: { a: { type: 'string', description: '概念 A 名称' }, b: { type: 'string', description: '概念 B 名称' } }, required: ['a', 'b'] }
  },
  {
    name: 'stock_search',
    description: '按代码/名称子串模糊搜索 A股 标的（在图谱覆盖范围内）。',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: '子串, 如 "茅台" "宁德"' } }, required: ['query'] }
  },
  {
    name: 'graph_stats',
    description: '返回图谱数据集规模概览（行业/概念/产业链数量与覆盖股票数）。',
    inputSchema: { type: 'object', properties: {} }
  },
];

function callTool(name, args) {
  args = args || {};
  switch (name) {
    case 'industry_of_stock': {
      const hits = resolveStock(args.stock);
      if (!hits.length) return text(`未找到匹配 "${args.stock}" 的标的。可用 stock_search 模糊搜索。`);
      const s = hits[0];
      const industries = IDX.stockIndustries.get(s.code) || [];
      const concepts = IDX.stockConcepts.get(s.code) || [];
      const chains = IDX.stockChains.get(s.code) || [];
      const body = {
        stock: s,
        resolved_note: hits.length > 1 ? `共匹配 ${hits.length} 个标的, 此处取首个; 可用更精确代码/名称` : (s.exact ? '精确匹配' : '子串匹配'),
        industries,
        concepts,
        chains: chains.map(c => ({ id: c.id, name: c.name, stage: c.stage }))
      };
      return text(JSON.stringify(body, null, 2));
    }
    case 'peers': {
      const hits = resolveStock(args.stock);
      if (!hits.length) return text(`未找到匹配 "${args.stock}" 的标的。`);
      const s = hits[0];
      const industries = IDX.stockIndustries.get(s.code) || [];
      if (!industries.length) return text(`标的 ${s.name}(${s.code}) 未收录于任何申万一级行业。`);
      const ind = industries[0];
      const indObj = GRAPH.industries.find(i => i.code === ind.code);
      let members = indObj ? indObj.members : [];
      const excl = args.exclude_self !== false;
      if (excl) members = members.filter(m => m.code !== s.code);
      return text(JSON.stringify({ industry: ind, peer_count: members.length, peers: members }, null, 2));
    }
    case 'chain_view': {
      const ch = resolveChain(args.chain);
      if (!ch) return text(`未找到匹配 "${args.chain}" 的产业链。可用 graph_stats 查看覆盖。`);
      let focus = null;
      if (args.stock) {
        const hits = resolveStock(args.stock);
        if (hits.length) focus = hits[0];
      }
      const nodes = ch.nodes.map(nd => {
        const isFocus = focus && nd.members.some(m => m.code === focus.code);
        return { stage: nd.stage, desc: nd.desc, members: nd.members, contains_focus: isFocus || undefined };
      });
      let focusContext = null;
      if (focus) {
        const idx = nodes.findIndex(n => n.contains_focus);
        focusContext = {
          stock: focus,
          at_stage: idx >= 0 ? nodes[idx].stage : null,
          upstream: idx > 0 ? nodes.slice(0, idx).map(n => n.stage) : [],
          downstream: idx >= 0 && idx < nodes.length - 1 ? nodes.slice(idx + 1).map(n => n.stage) : []
        };
      }
      return text(JSON.stringify({ chain: { id: ch.id, name: ch.name }, focus: focusContext, nodes }, null, 2));
    }
    case 'concept_members': {
      const c = resolveConcept(args.concept);
      if (!c) return text(`未找到匹配 "${args.concept}" 的概念板块。`);
      return text(JSON.stringify({ concept: c.name, member_count: c.members.length, members: c.members }, null, 2));
    }
    case 'concept_intersect': {
      const ca = resolveConcept(args.a), cb = resolveConcept(args.b);
      if (!ca) return text(`未找到概念 A: "${args.a}"`);
      if (!cb) return text(`未找到概念 B: "${args.b}"`);
      const setB = new Set(cb.members.map(m => m.code));
      const inter = ca.members.filter(m => setB.has(m.code));
      return text(JSON.stringify({ a: ca.name, b: cb.name, intersect_count: inter.length, members: inter }, null, 2));
    }
    case 'stock_search': {
      const hits = resolveStock(args.query);
      if (!hits.length) return text(`未匹配到包含 "${args.query}" 的标的。`);
      const rows = hits.map(h => {
        const ind = (IDX.stockIndustries.get(h.code) || [])[0];
        return { code: h.code, name: h.name, industry: ind ? ind.name : null };
      });
      return text(JSON.stringify({ query: args.query, count: rows.length, results: rows }, null, 2));
    }
    case 'graph_stats': {
      const stocks = new Set();
      for (const i of GRAPH.industries) for (const m of i.members) stocks.add(m.code);
      for (const c of GRAPH.concepts) for (const m of c.members) stocks.add(m.code);
      for (const ch of GRAPH.chains) for (const nd of ch.nodes) for (const m of nd.members) stocks.add(m.code);
      return text(JSON.stringify({
        version: GRAPH.meta.version,
        source: GRAPH.meta.source,
        industries: GRAPH.industries.length,
        concepts: GRAPH.concepts.length,
        chains: GRAPH.chains.length,
        covered_stocks: stocks.size
      }, null, 2));
    }
    default:
      return text(`未知工具: ${name}`);
  }
}
function text(s) { return { content: [{ type: 'text', text: s }] }; }

// ============ MCP stdio 协议循环 ============
const SERVER_INFO = { name: 'dsh-industry-graph-mcp', version: GRAPH ? GRAPH.meta.version : '0.1.0' };
let gotInitialize = false;

function handle(msg) {
  if (!msg || typeof msg !== 'object') return;
  const id = msg.id;
  if (msg.method === 'initialize') {
    gotInitialize = true;
    return send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO
    }});
  }
  if (msg.method === 'notifications/initialized') { return; }
  if (msg.method === 'tools/list') {
    return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  }
  if (msg.method === 'tools/call') {
    try {
      const res = callTool(msg.params.name, msg.params.arguments || {});
      return send({ jsonrpc: '2.0', id, result: res });
    } catch (e) {
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '工具执行错误: ' + e.message }], isError: true } });
    }
  }
  // 其它方法忽略
}

function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    try { handle(JSON.parse(line)); } catch (e) { log('parse error:', e.message); }
  }
});
process.stdin.on('end', () => process.exit(0));

try { loadGraph(); } catch (e) { log('FATAL load graph:', e.message); process.exit(1); }
log('server ready, pid', process.pid);
