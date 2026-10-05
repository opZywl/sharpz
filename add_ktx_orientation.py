"""Adiciona KTXorientation='rd' KV pair em KTX2 files que estao sem.

alktx2 nao escreve essa chave por default — three.js KTX2Loader pode
falhar/comportar errado sem ela. Cirurgia byte-level: injeta a entry no
KV section, ajusta offsets no header e no level index.
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path


def patch_orientation(src: Path, dst: Path | None = None) -> None:
    if dst is None:
        dst = src
    data = bytearray(src.read_bytes())

    # Header offsets per KTX2 spec
    levelCount = struct.unpack_from('<I', data, 40)[0]
    dfdOff = struct.unpack_from('<I', data, 48)[0]
    dfdLen = struct.unpack_from('<I', data, 52)[0]
    kvdOff = struct.unpack_from('<I', data, 56)[0]
    kvdLen = struct.unpack_from('<I', data, 60)[0]
    sgdOff = struct.unpack_from('<Q', data, 64)[0]
    sgdLen = struct.unpack_from('<Q', data, 72)[0]

    # Verifica se ja tem KTXorientation
    kv_section = bytes(data[kvdOff:kvdOff + kvdLen])
    if b'KTXorientation\x00' in kv_section:
        print(f'  {src.name}: ja tem KTXorientation, skip')
        return

    # Build KV entry: keyAndValueByteLength (uint32) + keyAndValue + padding to 4
    # keyAndValue = b'KTXorientation\x00' + b'rd\x00' (3 bytes value with NUL)
    kv_payload = b'KTXorientation\x00rd\x00'
    kv_entry = struct.pack('<I', len(kv_payload)) + kv_payload
    # Pad to 4-byte alignment
    pad = (-len(kv_entry)) & 3
    kv_entry += b'\x00' * pad
    inserted = len(kv_entry)

    # Insert at start of KV section (KTXorientation deve vir alfabeticamente
    # primeiro: o KTXwriter ja existe la). Spec exige ordem alfabetica.
    new_kvd = kv_entry + bytes(data[kvdOff:kvdOff + kvdLen])
    new_kvdLen = kvdLen + inserted

    # Verifica padding total apos KV (deve ser multiplo de 8 antes de SGD se sgdLen > 0)
    sgd_align_pad = 0
    if sgdLen > 0:
        # SGD precisa estar 8-byte aligned
        new_sgdOff = kvdOff + new_kvdLen
        sgd_align_pad = (-new_sgdOff) & 7
        if sgd_align_pad:
            new_kvd += b'\x00' * sgd_align_pad
            new_kvdLen += sgd_align_pad
            inserted += sgd_align_pad

    # Construir novo arquivo: tudo antes de KV + new_kvd + tudo depois de KV original
    new_data = bytearray()
    new_data += data[:kvdOff]
    new_data += new_kvd
    new_data += data[kvdOff + kvdLen:]

    # Atualiza header offsets
    struct.pack_into('<I', new_data, 60, new_kvdLen)
    if sgdOff > 0:
        struct.pack_into('<Q', new_data, 64, sgdOff + inserted)

    # Level index entries (20 a 23 bytes apos header — 24 bytes cada)
    # Cada entry: byteOffset (uint64), byteLength (uint64), uncompressedByteLength (uint64)
    li_start = 80
    for i in range(levelCount):
        entry_off = li_start + i * 24
        bo = struct.unpack_from('<Q', new_data, entry_off)[0]
        if bo >= kvdOff + kvdLen:
            struct.pack_into('<Q', new_data, entry_off, bo + inserted)

    dst.write_bytes(bytes(new_data))
    print(f'  {src.name}: +{inserted} bytes (KV {kvdLen}->{new_kvdLen})')


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Uso: python add_ktx_orientation.py <arquivo.ktx> [outros.ktx ...]')
        sys.exit(1)
    targets = [Path(p) for p in sys.argv[1:]]

    for t in targets:
        patch_orientation(t)
