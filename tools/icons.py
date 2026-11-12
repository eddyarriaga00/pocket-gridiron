"""Render the PNG app icons (no dependencies). Run: python3 tools/icons.py"""
import math, struct, zlib, os
def png(path, n):
    s = n / 512.0
    ca, sa = math.cos(math.radians(28)), math.sin(math.radians(28))
    rows = []
    for y in range(n):
        row = bytearray([0])
        for x in range(n):
            px, py = x / s, y / s
            c = (6, 10, 19)
            if py >= 300: c = (42, 132, 64)
            if 300 <= py < 310: c = (255, 255, 255)
            if 400 <= py < 406: c = (170, 206, 179)
            if py < 16: c = (76, 154, 255)
            dx, dy = px - 256, py - 236
            u, v = dx * ca - dy * sa, dx * sa + dy * ca   # rotate into the ball's frame
            if (u / 150) ** 2 + (v / 92) ** 2 <= 1:
                c = (138, 83, 38)
                if abs(v) <= 6 and abs(u) <= 70: c = (255, 255, 255)
                for lx in (-44, 0, 44):
                    if abs(u - lx) <= 6 and abs(v) <= 24: c = (255, 255, 255)
            row += bytes(c)
        rows.append(bytes(row))
    raw = b''.join(rows)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', n, n, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)
here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
for n in (180, 192, 512): png(os.path.join(here, 'icon-%d.png' % n), n)
