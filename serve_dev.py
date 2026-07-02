import http.server, socketserver, os, socket
os.chdir("/Users/linsuyi/Documents/Clude code作業フォルダ/mv-studio-site")
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, *a): pass
class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    address_family = socket.AF_INET
with S(("127.0.0.1", 8127), H) as httpd:
    print("serving mv-studio-site on 127.0.0.1:8127 (no-cache)")
    httpd.serve_forever()
