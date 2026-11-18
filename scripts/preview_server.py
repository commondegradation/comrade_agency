"""Local UI preview with an explicit browser fixture, never production IPC."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path in ('/', '/src/renderer/index.html'):
            html = (ROOT / 'src/renderer/index.html').read_text()
            html = html.replace('<head>', '<head><base href="/src/renderer/">')
            html = html.replace('<script src="js/util.js">', '<script src="/scripts/preview.js"></script><script src="js/util.js">')
            data = html.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        else:
            super().do_GET()
server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
print('http://127.0.0.1:%d' % server.server_address[1], flush=True)
server.serve_forever()
