#!/usr/bin/env python3
"""Sample pixel colors from a PNG at a grid of points (stdlib only)."""
import sys, zlib, struct

def decode_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos, idat, w, h, depth, ctype = 8, b'', 0, 0, 8, 2
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos+4])[0]
        typ = data[pos+4:pos+8]
        chunk = data[pos+8:pos+8+ln]
        if typ == b'IHDR':
            w, h, depth, ctype = struct.unpack('>IIBB', chunk[:10])
        elif typ == b'IDAT':
            idat += chunk
        elif typ == b'IEND':
            break
        pos += 12 + ln
    raw = zlib.decompress(idat)
    ch = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[ctype]
    stride = w * ch
    px = bytearray(h * stride)
    prev = bytearray(stride)
    ppos = 0
    for y in range(h):
        f = raw[ppos]; ppos += 1
        line = bytearray(raw[ppos:ppos+stride]); ppos += stride
        if f == 1:
            for i in range(ch, stride): line[i] = (line[i] + line[i-ch]) & 255
        elif f == 2:
            for i in range(stride): line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i-ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i-ch] if i >= ch else 0
                b = prev[i]
                c = prev[i-ch] if i >= ch else 0
                p = a + b - c
                pa, pb, pc = abs(p-a), abs(p-b), abs(p-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        px[y*stride:(y+1)*stride] = line
        prev = line
    return w, h, ch, px

path = sys.argv[1]
w, h, ch, px = decode_png(path)
print(f'{path}: {w}x{h} ch={ch}')
# sample a 5x4 grid + specific points
for fy in (0.15, 0.35, 0.5, 0.65, 0.85):
    row = []
    for fx in (0.1, 0.3, 0.5, 0.7, 0.9):
        x, y = int(fx*w), int(fy*h)
        i = (y*w + x) * ch
        row.append('#%02x%02x%02x' % (px[i], px[i+1], px[i+2]))
    print('  y=%.2f: %s' % (fy, '  '.join(row)))
