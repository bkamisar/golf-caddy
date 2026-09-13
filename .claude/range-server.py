"""Static file server with HTTP Range support, for seeking within local video
files in the Browser pane. Python's built-in http.server doesn't support
Range requests, which silently breaks video.currentTime seeking on anything
larger than what fits in initial buffering. Stdlib only, no dependencies.
"""
import http.server
import os
import sys


class RangeHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    # A stalled/aborted connection (e.g. the browser cancels a request mid-
    # stream when a <video> element re-seeks) must not hang this thread
    # forever and, since ThreadingHTTPServer gives each request its own
    # thread, must not take the rest of the server down with it either.
    timeout = 30
    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(404, "File not found")
            return None

        file_len = os.fstat(f.fileno())[6]
        range_header = self.headers.get('Range')
        if range_header:
            start, end = self._parse_range(range_header, file_len)
            self.send_response(206)
            self.send_header('Content-Range', f'bytes {start}-{end}/{file_len}')
            self.send_header('Content-Length', str(end - start + 1))
            self.send_header('Content-type', self.guess_type(path))
            self.send_header('Accept-Ranges', 'bytes')
            self.end_headers()
            f.seek(start)
            self._range_remaining = end - start + 1
            return f

        self.send_response(200)
        self.send_header('Content-type', self.guess_type(path))
        self.send_header('Content-Length', str(file_len))
        self.send_header('Accept-Ranges', 'bytes')
        self.end_headers()
        self._range_remaining = None
        return f

    def _parse_range(self, range_header, file_len):
        range_val = range_header.strip().split('=')[1]
        start_str, end_str = range_val.split('-')
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_len - 1
        return start, min(end, file_len - 1)

    def copyfile(self, source, outputfile):
        if self._range_remaining is None:
            return super().copyfile(source, outputfile)
        remaining = self._range_remaining
        bufsize = 64 * 1024
        try:
            while remaining > 0:
                chunk = source.read(min(bufsize, remaining))
                if not chunk:
                    break
                outputfile.write(chunk)
                remaining -= len(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # client (e.g. a <video> element re-seeking) dropped the connection


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8940
    # Threading, not plain TCPServer: one stalled connection must not block
    # every other request, and daemon_threads lets the process exit cleanly.
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), RangeHTTPRequestHandler)
    server.daemon_threads = True
    server.serve_forever()
