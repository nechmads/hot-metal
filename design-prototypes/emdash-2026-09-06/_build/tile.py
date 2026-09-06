"""Slice a tall full-page screenshot into ordered, equal top-to-bottom bands.

Prototype tooling only. Reviewers are handed these files in filename order and
cannot distinguish a mis-sliced page from a badly composed one, so correctness
here matters more than speed.

`sips --cropOffset` is NOT usable for this: its offset is measured from the
image centre, and in practice it clamps so that offset 0 and offset +h/2 return
the same crop. Every band it produced was a centre crop. So the split is done
here by decoding the PNG directly; `sips` is still used for the width resample,
which is correct.
"""

import glob, math, os, struct, subprocess, sys, zlib

_BYTES_PER_PIXEL = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}


def _chunks(data):
    i = 8
    while i < len(data):
        (length,) = struct.unpack(">I", data[i:i + 4])
        ctype = data[i + 4:i + 8]
        yield ctype, data[i + 8:i + 8 + length]
        i += 8 + length + 4


def _chunk(ctype, payload):
    return (struct.pack(">I", len(payload)) + ctype + payload
            + struct.pack(">I", zlib.crc32(ctype + payload) & 0xFFFFFFFF))


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else (b if pb <= pc else c)


def _unfilter(raw, width, height, bpp):
    stride = width * bpp
    out = bytearray(stride * height)
    prev = bytearray(stride)
    pos = 0
    for y in range(height):
        ft = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos + stride]); pos += stride
        if ft == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif ft == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 0xFF
        elif ft == 3:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xFF
        elif ft == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                c = prev[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + _paeth(a, prev[i], c)) & 0xFF
        elif ft != 0:
            raise ValueError(f"unsupported PNG filter {ft}")
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return bytes(out)


def _write_png(path, pixels, width, height, bpp, depth, ctype):
    stride = width * bpp
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += pixels[y * stride:(y + 1) * stride]
    body = (_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, depth, ctype, 0, 0, 0))
            + _chunk(b"IDAT", zlib.compress(bytes(raw), 6))
            + _chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + body)


def tile(src, outbase, max_tiles=4, out_w=1000):
    for stale in glob.glob(f"{outbase}-*.png"):
        os.remove(stale)

    data = open(src, "rb").read()
    idat = b""
    width = height = depth = ctype = None
    for name, payload in _chunks(data):
        if name == b"IHDR":
            width, height, depth, ctype = struct.unpack(">IIBB", payload[:10])
        elif name == b"IDAT":
            idat += payload
    if depth != 8 or ctype not in (2, 6):
        raise ValueError(f"unsupported PNG: depth={depth} colorType={ctype}")

    bpp = _BYTES_PER_PIXEL[ctype]
    pixels = _unfilter(zlib.decompress(idat), width, height, bpp)
    stride = width * bpp

    n = max(1, min(max_tiles, math.ceil(height / (width * 1.5))))
    band = math.ceil(height / n)
    files = []
    for i in range(n):
        y0 = i * band
        rows = min(band, height - y0)
        if rows <= 0:
            break
        out = f"{outbase}-{i + 1}.png"
        _write_png(out, pixels[y0 * stride:(y0 + rows) * stride], width, rows,
                   bpp, depth, ctype)
        subprocess.run(["sips", "--resampleWidth", str(out_w), out],
                       capture_output=True, check=True)
        files.append(out)
    return files


if __name__ == "__main__":
    src, outbase = sys.argv[1], sys.argv[2]
    mt = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    print("\n".join(tile(src, outbase, mt)))
