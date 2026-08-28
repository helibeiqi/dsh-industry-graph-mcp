import subprocess, json, sys

NODE = r"C:\Users\helib\.workbuddy\binaries\node\versions\22.22.2-2\node.exe"
SERVER = r"C:\Users\helib\dsh-industry-graph-mcp\industry-graph-mcp-server.mjs"

def rpc(msg):
    return json.dumps(msg, ensure_ascii=False)

def main():
    p = subprocess.Popen([NODE, SERVER], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
    out_lines = []
    def send(msg):
        p.stdin.write(rpc(msg) + "\n"); p.stdin.flush()
    def read_one():
        # read lines until a parseable JSON-RPC with matching id/method echo
        while True:
            line = p.stdout.readline()
            if not line: return None
            line = line.strip()
            if not line: continue
            try: return json.loads(line)
            except: continue

    send({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"selftest","version":"0"}}})
    r = read_one(); print("INITIALIZE:", r.get("result",{}).get("serverInfo"))
    send({"jsonrpc":"2.0","method":"notifications/initialized","params":{}})
    send({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}})
    r = read_one(); tools = [t["name"] for t in r["result"]["tools"]]; print("TOOLS:", tools)

    calls = [
        ("industry_of_stock", {"stock":"600519"}),
        ("industry_of_stock", {"stock":"贵州茅台"}),
        ("peers", {"stock":"300750"}),
        ("chain_view", {"chain":"lithium"}),
        ("chain_view", {"chain":"锂电池产业链","stock":"300750"}),
        ("concept_members", {"concept":"CPO"}),
        ("concept_intersect", {"a":"半导体","b":"CPO"}),
        ("stock_search", {"query":"宁德"}),
        ("graph_stats", {}),
    ]
    for i,(name,args) in enumerate(calls):
        cid = 10+i
        send({"jsonrpc":"2.0","id":cid,"method":"tools/call","params":{"name":name,"arguments":args}})
        r = read_one()
        res = r.get("result",{})
        txt = res.get("content",[{}])[0].get("text","")
        print(f"\n=== {name} {args} ===")
        print(txt[:700])

    p.stdin.close()
    try: p.wait(timeout=5)
    except: p.kill()
    print("\n[selftest done]")

main()
