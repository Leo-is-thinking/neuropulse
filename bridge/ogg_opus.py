"""Pack raw 20 ms Opus packets (16 kHz mono, as sent by the band) into an .ogg file a browser <audio> can play."""
import base64
import struct

_T = []
for _i in range(256):
    _r = _i << 24
    for _ in range(8):
        _r = ((_r << 1) ^ 0x04C11DB7) if _r & 0x80000000 else (_r << 1)
    _T.append(_r & 0xFFFFFFFF)


def _crc(b):
    c = 0
    for x in b:
        c = ((c << 8) & 0xFFFFFFFF) ^ _T[((c >> 24) ^ x) & 0xFF]
    return c


def _page(data, flag, gran, serial, seq):
    segs = []
    n = len(data)
    while n >= 255:
        segs.append(255)
        n -= 255
    segs.append(n)
    h = b"OggS" + struct.pack("<BBqIII", 0, flag, gran, serial, seq, 0) + bytes([len(segs)]) + bytes(segs)
    p = h + data
    return p[:22] + struct.pack("<I", _crc(p)) + p[26:]


def to_ogg(packets, rate=16000):
    """packets: list of Opus byte strings, one per 20 ms. Returns .ogg bytes."""
    head = b"OpusHead" + struct.pack("<BBHIhB", 1, 1, 0, rate, 0, 0)
    tags = b"OpusTags" + struct.pack("<I", 8) + b"NeuroPul" + struct.pack("<I", 0)
    out = _page(head, 2, 0, 1, 0) + _page(tags, 0, 0, 1, 1)
    seq, gran = 2, 0
    for i, p in enumerate(packets):
        gran += 960  # 20 ms at the 48 kHz Ogg-Opus clock
        out += _page(p, 4 if i == len(packets) - 1 else 0, gran, 1, seq)
        seq += 1
    return out


def b64(packets):
    return base64.b64encode(to_ogg(packets)).decode()
