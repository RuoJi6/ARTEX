#!/usr/bin/env python3
"""
harvest_static.py <BASE_URL> <OUTDIR> [--user-agent VALUE]

参考模板 — 非通用成品。执行前须按目标站点调整，常见改动：
  - extract_endpoints 正则（endpoint 方言）
  - webpack/Vite manifest 解析逻辑
  - 微前端 publicPath、重试策略

Static SPA bundle harvester. Framework-agnostic; tuned for webpack + Vite.
  1. Fetch entry HTML, collect script/module references.
  2. Parse the runtime chunk manifest(s) and download EVERY chunk (not just the
     ones in HTML), looping until no new chunk ids appear. Handles multiple
     micro-frontend runtimes, each with its own publicPath.
  3. Extract API endpoints and route paths from all downloaded JS.

Stdlib only. TLS verification is disabled (recon against self-signed/internal hosts).
"""
import sys, os, re, ssl, secrets, json, argparse, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE
USER_AGENTS = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
)


def user_agent(value=None):
    """Explicit value > environment > random sample; explicit empty omits UA."""
    explicit = value is not None
    if value is None:
        value = os.environ.get("ARTEX_HTTP_USER_AGENT", "")
    value = value.strip(" ")
    if not all(32 <= ord(c) <= 126 for c in value):
        return secrets.choice(USER_AGENTS)
    if value or explicit:
        return value
    return secrets.choice(USER_AGENTS)


def fetch(url, binary=False, user_agent_value=None):
    try:
        ua = user_agent(user_agent_value)
        req = urllib.request.Request(url, headers={"User-Agent": ua} if ua else {})
        opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=CTX))
        opener.addheaders = []  # Do not reintroduce Python-urllib's default UA.
        with opener.open(req, timeout=25) as r:
            data = r.read()
            return (data if binary else data.decode("utf-8", "ignore")), r.status
    except Exception as e:
        code = getattr(e, "code", 0)
        return "", code

def origin_of(u):
    p = urllib.parse.urlparse(u)
    return f"{p.scheme}://{p.netloc}"

# ---- chunk manifest parsing -------------------------------------------------
def matched_block(s, end_brace_idx):
    """Walk back from a '}' index to its matching '{' and return the object body."""
    depth = 0; j = end_brace_idx
    while j >= 0:
        if s[j] == '}': depth += 1
        elif s[j] == '{':
            depth -= 1
            if depth == 0: return s[j:end_brace_idx+1]
        j -= 1
    return ""

def parse_chunk_maps(js_text):
    """Return list of (publicPath_hint, {id: hash}) for every `}[x]+".js"` map
    (webpack __webpack_require__.u) found in the text."""
    maps = []
    # publicPath hints in this file: .p="..."  or publicPath="..."
    pubs = re.findall(r'(?:\.p|publicPath)\s*=\s*"([^"]*)"', js_text)
    for m in re.finditer(r'\}\[[A-Za-z_$]\]\s*\+\s*"\.js"', js_text):
        body = matched_block(js_text, m.start())
        pairs = re.findall(r'(\d+):"([0-9a-fA-F]{6,16})"', body)
        if pairs:
            maps.append((pubs, dict(pairs)))
    # Vite style: __vite__mapDeps map of "assets/xx.js"
    for fn in re.findall(r'"(assets/[^"]+\.js)"', js_text):
        maps.append((["/"], {"__vite__": fn}))
    return maps

def chunk_urls(base, js_text):
    """Yield absolute chunk URLs reconstructable from this file's manifest(s)."""
    origin = origin_of(base)
    out = set()
    for pubs, idmap in parse_chunk_maps(js_text):
        paths = pubs or ["/assets/", "/"]
        for cid, h in idmap.items():
            if cid == "__vite__":
                fn = h  # already "assets/xx.js"
                for pp in paths:
                    out.add(urllib.parse.urljoin(origin + "/", fn))
                continue
            for pp in paths:
                if pp.startswith("http"): bareorigin = ""; prefix = pp
                else: bareorigin = origin; prefix = pp if pp.startswith("/") else "/"+pp
                if not prefix.endswith("/"): prefix += "/"
                out.add(f"{bareorigin}{prefix}{cid}.{h}.js")
    return out

# ---- endpoint / route extraction -------------------------------------------
API_HINT = re.compile(r'/(?:api|rest|service|services|gateway|graphql|v\d|web|admin|backend|open)\b', re.I)
ASSET_EXT = re.compile(r'\.(js|css|png|jpe?g|svg|gif|woff2?|ttf|ico|map|json|mp4|webp)(\?|$)', re.I)

def extract_endpoints(js_text):
    paths = set()
    # quoted ('/...'), double-quoted, and backtick template paths
    for m in re.findall(r'''["'`](/[A-Za-z0-9_\-./{}$:]+)["'`]''', js_text):
        paths.add(m)
    # concatenation heads:  "/api/x/" + var
    for m in re.findall(r'''["'](/[A-Za-z0-9_\-./]+/)["']\s*\+''', js_text):
        paths.add(m)
    api, other = set(), set()
    for p in paths:
        if ASSET_EXT.search(p): continue
        if p.count('/') < 2 and not API_HINT.search(p): continue
        (api if API_HINT.search(p) else other).add(p)
    return api, other

def extract_routes(js_text):
    r = set()
    for key in ('path', 'to', 'redirect', 'href'):
        for m in re.findall(key + r'''\s*:\s*["'](/[A-Za-z0-9_\-/:]*)["']''', js_text):
            if not ASSET_EXT.search(m) and not API_HINT.search(m):
                r.add(m)
    return r

# ---- main -------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base"); ap.add_argument("outdir")
    ap.add_argument("--user-agent", default=None, help="User-Agent override; default: ARTEX_HTTP_USER_AGENT or random browser sample")
    args = ap.parse_args()
    base, outdir = args.base, args.outdir
    ua = user_agent(args.user_agent)
    if not base.startswith("http"): base = "https://" + base
    jsdir = os.path.join(outdir, "js"); os.makedirs(jsdir, exist_ok=True)

    print(f"[*] entry: {base}")
    html, status = fetch(base, user_agent_value=ua)
    open(os.path.join(outdir, "index.html"), "w").write(html)
    origin = origin_of(base)

    # initial scripts from HTML
    srcs = set(re.findall(r'<script[^>]+src="([^"]+\.js[^"]*)"', html))
    srcs |= set(re.findall(r'(?:src|href)="([^"]*\.js)"', html))
    seed = set()
    for s in srcs:
        seed.add(s if s.startswith("http") else urllib.parse.urljoin(base, s))
    print(f"[*] {len(seed)} scripts referenced in HTML")

    have = {}  # url -> local path
    def dl(url):
        fn = os.path.basename(urllib.parse.urlparse(url).path)
        if not fn.endswith(".js"): return None
        lp = os.path.join(jsdir, fn)
        if url in have: return have[url]
        data, st = fetch(url, binary=True, user_agent_value=ua)
        if st == 200 and data and not data[:15].lstrip().startswith(b"<"):
            open(lp, "wb").write(data); have[url] = lp; return lp
        return None

    with ThreadPoolExecutor(max_workers=20) as ex:
        list(ex.map(dl, seed))

    # iteratively expand via chunk manifests (chunks reference more chunks)
    seen_urls = set(have.keys()); frontier = list(have.values())
    rounds = 0
    while frontier and rounds < 6:
        rounds += 1
        new_urls = set()
        for lp in frontier:
            try: txt = open(lp, encoding="utf-8", errors="ignore").read()
            except: continue
            for cu in chunk_urls(base, txt):
                if cu not in seen_urls: new_urls.add(cu)
        seen_urls |= new_urls
        if not new_urls: break
        print(f"[*] round {rounds}: {len(new_urls)} new chunk urls from manifest")
        before = set(have.values())
        with ThreadPoolExecutor(max_workers=24) as ex:
            list(ex.map(dl, new_urls))
        frontier = [p for p in have.values() if p not in before]

    # retry-once any manifest chunk that 404'd (transient failures are real)
    all_manifest = set()
    for lp in list(have.values()):
        try: all_manifest |= chunk_urls(base, open(lp, encoding="utf-8", errors="ignore").read())
        except: pass
    missing = [u for u in all_manifest if u not in have]
    if missing:
        with ThreadPoolExecutor(max_workers=24) as ex:
            list(ex.map(dl, missing))
        still = [u for u in all_manifest if u not in have]
        print(f"[*] manifest chunks: {len(all_manifest)} | downloaded {len(have)} | "
              f"unreachable {len(still)} (CSS-only / undeployed)")

    print(f"[+] total JS downloaded: {len(have)}")

    # extract from everything
    api, other, routes = set(), set(), set()
    for lp in have.values():
        try: txt = open(lp, encoding="utf-8", errors="ignore").read()
        except: continue
        a, o = extract_endpoints(txt); api |= a; other |= o
        routes |= extract_routes(txt)

    def dump(name, items):
        path = os.path.join(outdir, name)
        open(path, "w").write("\n".join(sorted(items)))
        return path
    dump("api_static.txt", api)
    dump("paths_other.txt", other)
    dump("routes.txt", routes)
    dump("chunkmap.txt", sorted(os.path.basename(u) for u in all_manifest))

    print(f"[+] api endpoints: {len(api)}  (api_static.txt)")
    print(f"[+] other paths:   {len(other)} (paths_other.txt)")
    print(f"[+] route paths:   {len(routes)} (routes.txt)")
    print(f"[+] outdir: {outdir}")
    print("\n[next] reverse the 3 gate facts (see reference.md), fill config.json, "
          "then: node runtime_harvest.js config.json")

if __name__ == "__main__":
    main()
