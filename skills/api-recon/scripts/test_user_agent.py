"""Offline regressions: python3 -m unittest discover -s skills/api-recon/scripts."""
import contextlib
import http.server
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch


SCRIPTS = Path(__file__).resolve().parent
# Keep the offline fixtures independent of the runner's outbound/recording proxy.
DIRECT_ENV = {"no_proxy": "*", "NO_PROXY": "*"}


@contextlib.contextmanager
def capture_server():
    seen = []

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            seen.append((self.path, self.headers.get("User-Agent"), self.headers.get("Cookie")))
            if self.path == "/start":
                self.send_response(302)
                self.send_header("Location", "/page")
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b'<h1>Page</h1><script src="/app.js"></script><form action="/submit"></form>')

        def log_message(self, *args):
            pass

    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server:
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}", seen
        finally:
            server.shutdown()
            thread.join()


class UserAgentTests(unittest.TestCase):
    def test_fetch_and_redirect(self):
        for name in ("harvest_static", "spider_mpa"):
            spec = importlib.util.spec_from_file_location(name, SCRIPTS / f"{name}.py")
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            for value, expected in (("", None), (" Captured-UA/1.0 ", "Captured-UA/1.0"),
                                    ("ok\r\nX-Injected: yes", None), ("客户端", None)):
                with self.subTest(script=name, value=value), capture_server() as (base, seen):
                    with patch.dict(os.environ, {**DIRECT_ENV, "ARTEX_HTTP_USER_AGENT": value}):
                        if name == "harvest_static":
                            body, status = module.fetch(base + "/start")
                            self.assertEqual(status, 200)
                        else:
                            body, _ = module.fetch(base + "/start", "session=sample")
                            self.assertTrue(all(cookie == "session=sample" for _, _, cookie in seen))
                    self.assertIn("Page", body)
                    self.assertEqual([path for path, _, _ in seen], ["/start", "/page"])
                    self.assertTrue(all(ua == expected for _, ua, _ in seen), seen)

    def test_cli_precedence_and_outputs(self):
        for name in ("harvest_static", "spider_mpa"):
            for flags, expected in (([], "Environment-UA/1.0"),
                                    (["--user-agent", "Override-UA/1.0"], "Override-UA/1.0"),
                                    (["--user-agent", ""], None)):
                with self.subTest(script=name, flags=flags), capture_server() as (base, seen):
                    with tempfile.TemporaryDirectory() as outdir:
                        env = dict(os.environ, **DIRECT_ENV, ARTEX_HTTP_USER_AGENT="Environment-UA/1.0")
                        command = [sys.executable, str(SCRIPTS / f"{name}.py"), base + "/start", outdir] + flags
                        if name == "spider_mpa":
                            command += ["--max", "1", "--delay", "0"]
                        result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=15)
                        self.assertEqual(result.returncode, 0, result.stderr)
                        self.assertGreaterEqual(len(seen), 2)
                        self.assertTrue(all(ua == expected for _, ua, _ in seen), seen)
                        artifact = "api_static.txt" if name == "harvest_static" else "forms.txt"
                        self.assertTrue((Path(outdir) / artifact).exists())


if __name__ == "__main__":
    unittest.main()
