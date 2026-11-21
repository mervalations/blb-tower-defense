"""Pull the audio track out of an .mp4 video into a small .m4a (no re-encoding, no ffmpeg).

usage: python tools/mp4-audio.py input.mp4 output.m4a

Keeps ftyp + a moov that holds only the sound track, and rewrites mdat to contain just
that track's chunks (chunk offsets in stco/co64 are updated to match).
"""
import struct, sys


def boxes(d, start, end):
    i = start
    while i + 8 <= end:
        size, typ = struct.unpack('>I4s', d[i:i + 8])
        hdr = 8
        if size == 1:
            size = struct.unpack('>Q', d[i + 8:i + 16])[0]; hdr = 16
        elif size == 0:
            size = end - i
        yield typ.decode('latin1'), i, size, hdr
        i += size


def find(d, start, end, path):
    """First box at a /-separated path below [start, end)."""
    name, _, rest = path.partition('/')
    for typ, i, size, hdr in boxes(d, start, end):
        if typ == name:
            return (i, size, hdr) if not rest else find(d, i + hdr, i + size, rest)
    return None


def box(typ, payload):
    return struct.pack('>I4s', 8 + len(payload), typ.encode('latin1')) + payload


def main(src, dst):
    d = open(src, 'rb').read()
    moov = find(d, 0, len(d), 'moov')
    if not moov:
        raise SystemExit('no moov box')
    mi, ms, mh = moov
    sound = None
    for typ, i, size, hdr in boxes(d, mi + mh, mi + ms):
        if typ != 'trak':
            continue
        h = find(d, i + hdr, i + size, 'mdia/hdlr')
        if h and d[h[0] + h[2] + 8:h[0] + h[2] + 12] == b'soun':
            sound = (i, size, hdr)
            break
    if not sound:
        raise SystemExit('no sound track')
    ti, ts, th = sound
    trak = bytearray(d[ti:ti + ts])
    stbl = find(trak, th, len(trak), 'mdia/minf/stbl')
    si, ss, sh = stbl
    # sample-to-chunk, sample sizes, chunk offsets
    def full(name):
        r = find(trak, si + sh, si + ss, name)
        return r
    stsc = full('stsc'); stsz = full('stsz')
    stco = full('stco'); co64 = full('co64')
    p = stsc[0] + stsc[2] + 4
    n = struct.unpack('>I', trak[p:p + 4])[0]
    runs = [struct.unpack('>III', trak[p + 4 + k * 12:p + 16 + k * 12]) for k in range(n)]
    p = stsz[0] + stsz[2] + 4
    fixed, count = struct.unpack('>II', trak[p:p + 8])
    sizes = [fixed] * count if fixed else list(struct.unpack('>%dI' % count, trak[p + 8:p + 8 + 4 * count]))
    off_box = stco or co64
    p = off_box[0] + off_box[2] + 4
    nchunks = struct.unpack('>I', trak[p:p + 4])[0]
    fmt = '>%dI' % nchunks if stco else '>%dQ' % nchunks
    offsets = list(struct.unpack(fmt, trak[p + 4:p + 4 + struct.calcsize(fmt)]))
    # samples per chunk for every chunk
    per = []
    for k, (first, spc, _) in enumerate(runs):
        last = runs[k + 1][0] - 1 if k + 1 < len(runs) else nchunks
        per += [spc] * (last - first + 1)
    chunks, s = [], 0
    for c in range(nchunks):
        ln = sum(sizes[s:s + per[c]]); s += per[c]
        chunks.append(d[offsets[c]:offsets[c] + ln])
    # rebuild: ftyp, moov(mvhd + sound trak), mdat
    ftyp = find(d, 0, len(d), 'ftyp')
    ftyp_b = d[ftyp[0]:ftyp[0] + ftyp[1]]
    mvhd = find(d, mi + mh, mi + ms, 'mvhd')
    mvhd_b = d[mvhd[0]:mvhd[0] + mvhd[1]]

    def build(base):
        new, pos = [], base
        for c in chunks:
            new.append(pos); pos += len(c)
        t = bytearray(trak)
        if stco:
            struct.pack_into('>%dI' % nchunks, t, p + 4, *new)
        else:
            struct.pack_into('>%dQ' % nchunks, t, p + 4, *new)
        return box('moov', mvhd_b + bytes(t))

    moov_b = build(0)
    base = len(ftyp_b) + len(moov_b) + 8
    moov_b = build(base)
    data = b''.join(chunks)
    with open(dst, 'wb') as f:
        f.write(ftyp_b + moov_b + struct.pack('>I4s', 8 + len(data), b'mdat') + data)
    print('%s -> %s (%d KB)' % (src, dst, (len(ftyp_b) + len(moov_b) + 8 + len(data)) // 1024))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
