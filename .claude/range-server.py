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

    # Class-level default so copyfile() below can always read this attribute
    # safely. send_head()'s directory branch delegates straight to the base
    # class and returns without ever setting it on the instance -- without
    # this default, a request to a directory (e.g. a bare "GET /") crashes
    # that connection's thread with an AttributeError inside copyfile(),
    # which on a browser reusing a keep-alive connection can poison a later,
    # completely unrelated request on the same socket. Confirmed exactly this
    # way: a plain (non-Range) fetch of a large file intermittently failed
    # with "Failed to fetch" after the body's headers had already arrived
    # correctly, while an equivalent Range request for the identical bytes
    # never failed -- because only the Range code path was reliably setting
    # this attribute before every copyfile() call.
    _range_remaining = None
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
        # file_len, not None: a plain 200 response is "the range that happens
        # to be the whole file", so it goes through the exact same copyfile()
        # loop as a real Range request rather than a separate delegation to
        # the base class's own copyfile (shutil.copyfileobj). That delegation
        # used to be the plain-200 path here, and it has no protection
        # against a dropped connection mid-transfer -- confirmed as a real,
        # reproducible failure: a plain fetch().arrayBuffer() of this file
        # over the sandboxed Browser pane's fetch (but not an equivalent
        # Range request for the identical bytes, and not a real <video>
        # element load, both of which only ever hit the Range branch)
        # intermittently failed with "Failed to fetch" after headers had
        # already arrived correctly -- i.e. a mid-transfer disconnect that
        # the Range path's try/except would have absorbed silently. Unifying
        # onto one code path removes the untested, more fragile alternative
        # entirely rather than leaving a second implementation to diverge.
        self._range_remaining = file_len
        return f

    def _parse_range(self, range_header, file_len):
        range_val = range_header.strip().split('=')[1]
        start_str, end_str = range_val.split('-')
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_len - 1
        return start, min(end, file_len - 1)

    def copyfile(self, source, outputfile):
        remaining = self._range_remaining
        if remaining is None:
            return super().copyfile(source, outputfile)
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
    # Loopback only, never '' (all interfaces) -- this repo's contents,
    # including any locally-copied swing video, must never be reachable from
    # anything else on the network.
    server = http.server.ThreadingHTTPServer(('127.0.0.1', port), RangeHTTPRequestHandler)
    server.daemon_threads = True
    server.serve_forever()
