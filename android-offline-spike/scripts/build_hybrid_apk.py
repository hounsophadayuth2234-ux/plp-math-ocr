#!/usr/bin/env python3
"""
build_hybrid_apk.py - Builder for PLP Math Hybrid Architecture APK
Pivots from pure offline UI to Hybrid Architecture:
1. Loads production website (https://math.dytcore.com) as primary UI.
2. Embeds local hybrid shell (tauri-dist/index.html) with auto-redirect when online.
3. Keeps native background services running on OnePlus Pad 3 (Snapdragon 8 Elite 7B model, SQLite WAL, OpenCV).
4. Packages with 16KB native page alignment, signs with APK Signature Scheme v2, and installs to device.
"""

import os
import sys
import io
import re
import struct
import hashlib
import base64
import zipfile
import subprocess
import random
import brotli
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from datetime import datetime, timedelta, timezone

def log(msg):
    print(f"[Hybrid APK Builder] {msg}", flush=True)

def main():
    log("Starting PLP Math Hybrid APK generation...")
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    repo_root = os.path.abspath(os.path.join(base_dir, ".."))
    spike_evidence = os.path.join(base_dir, "evidence")
    source_apk = os.path.join(spike_evidence, "app-release.apk")
    output_apk = os.path.join(spike_evidence, "app-hybrid-release.apk")

    if not os.path.exists(source_apk):
        log(f"ERROR: Base APK not found at {source_apk}")
        sys.exit(1)

    # 1. Compile tauri entry
    log("Compiling tauri entry via npm run build:tauri-entry...")
    subprocess.run(["npm", "run", "build:tauri-entry"], cwd=repo_root, shell=True, check=True)
    entry_html_path = os.path.join(repo_root, "tauri-dist", "index.html")

    with open(entry_html_path, "rb") as f:
        hybrid_html = f.read()
    log(f"Hybrid Shell HTML size: {len(hybrid_html)} bytes")

    # 2. Extract script and calculate exact CSP SHA-256 hash
    script_match = re.search(b'<script>(.*?)</script>', hybrid_html, re.DOTALL)
    if not script_match:
        raise RuntimeError("No <script> tag found in hybrid HTML!")
    script_bytes = script_match.group(1)
    script_h = base64.b64encode(hashlib.sha256(script_bytes).digest()).decode('ascii')
    new_csp_hash = f"'sha256-{script_h}'".encode('ascii')
    log(f"Computed exact CSP script hash: {new_csp_hash.decode('ascii')} ({len(new_csp_hash)} bytes)")

    # 3. Compress hybrid HTML directly into EXACTLY 4136 bytes using Brotli + post-HTML padding
    target_comp_len = 4136
    brotli_stream = None

    log(f"Compressing hybrid shell into exact {target_comp_len}-byte Brotli native slot...")
    for q in [10, 4, 5, 8, 9]:
        for pad in range(1, 400):
            for seed in range(50):
                rng = random.Random(seed)
                candidate = hybrid_html + b"\n<!-- " + rng.randbytes(pad) + b" -->\n"
                comp = brotli.compress(candidate, quality=q)
                if len(comp) == target_comp_len:
                    brotli_stream = comp
                    log(f"Found exact {target_comp_len}-byte Brotli stream (quality={q}, pad={pad}, seed={seed})")
                    break
            if brotli_stream:
                break
        if brotli_stream:
            break

    if not brotli_stream or len(brotli_stream) != target_comp_len:
        raise RuntimeError("Failed to compute exact 4136-byte Brotli stream for hybrid shell!")

    # 4. Read base APK and unpack entries
    log(f"Reading base APK from {source_apk} (size: {os.path.getsize(source_apk)} bytes)...")
    orig_compress_types = {}
    with zipfile.ZipFile(source_apk, "r") as z_in:
        entry_names = z_in.namelist()
        entries = {}
        for info in z_in.infolist():
            orig_compress_types[info.filename] = info.compress_type
            entries[info.filename] = z_in.read(info.filename)

    # 5. Patch libplp_math_hybrid_lib.so
    so_name = "lib/arm64-v8a/libplp_math_hybrid_lib.so"
    if so_name not in entries:
        raise RuntimeError(f"Missing {so_name} in base APK!")

    so_data = bytearray(entries[so_name])
    header = b"com/dytcore/plpmath/index.html"
    hdr_idx = so_data.find(header)
    if hdr_idx == -1:
        raise RuntimeError("Header com/dytcore/plpmath/index.html not found in SO binary!")
    brotli_offset = hdr_idx + len(header)
    log(f"Found embedded Brotli asset at SO offset {brotli_offset}. Injecting hybrid stream...")
    so_data[brotli_offset:brotli_offset + target_comp_len] = brotli_stream

    # Patch CSP hash in SO binary to match our exact script hash
    old_csp_hash = b"'sha256-M9IJDEZ+q0U92jwd23RapOMWvDx2xL/usi3sMfHS+2E='"
    csp_hash_pos = so_data.find(old_csp_hash)
    if csp_hash_pos != -1:
        assert len(new_csp_hash) == len(old_csp_hash)
        so_data[csp_hash_pos:csp_hash_pos + len(old_csp_hash)] = new_csp_hash
        log(f"Successfully patched CSP hash at SO offset {csp_hash_pos} to {new_csp_hash.decode('ascii')}")
    else:
        pos = so_data.find(b"'sha256-")
        if pos != -1:
            so_data[pos:pos + len(new_csp_hash)] = new_csp_hash
            log(f"Patched CSP hash at offset {pos} to {new_csp_hash.decode('ascii')}")

    entries[so_name] = bytes(so_data)

    # 6. Rebuild page-aligned ZIP container (resources.arsc=4B, .so=16KB)
    log("Rebuilding page-aligned ZIP container (resources.arsc=4B, .so=16KB)...")
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as z_out:
        sorted_keys = sorted(entries.keys(), key=lambda x: (
            0 if x == "AndroidManifest.xml" else
            1 if x.endswith(".dex") else
            2 if x.startswith("res/") else
            3 if x.startswith("lib/") else 4
        ))
        for name in sorted_keys:
            data = entries[name]
            compress_type = orig_compress_types.get(name, zipfile.ZIP_DEFLATED)
            if name == "resources.arsc":
                compress_type = zipfile.ZIP_STORED
            if compress_type == zipfile.ZIP_STORED:
                alignment = 16384 if name.endswith(".so") else 4
                current_offset = zip_buf.tell()
                fixed = current_offset + 30 + len(name)
                pad_needed = (alignment - (fixed % alignment)) % alignment
                zinfo = zipfile.ZipInfo(name)
                zinfo.date_time = (2026, 11, 1, 0, 0, 0)
                zinfo.external_attr = 0o644 << 16
                zinfo.compress_type = zipfile.ZIP_STORED
                zinfo.extra = b"\x00" * pad_needed
                z_out.writestr(zinfo, data)
            else:
                zinfo = zipfile.ZipInfo(name)
                zinfo.date_time = (2026, 11, 1, 0, 0, 0)
                zinfo.external_attr = 0o644 << 16
                zinfo.compress_type = zipfile.ZIP_DEFLATED
                z_out.writestr(zinfo, data)

    unaligned_apk_data = bytearray(zip_buf.getvalue())
    log(f"Page-aligned unsigned APK size: {len(unaligned_apk_data)} bytes")

    # 7. Apply APK Signature Scheme v2
    log("Signing APK with APK Signature Scheme v2...")
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Android"),
        x509.NameAttribute(NameOID.COMMON_NAME, "Android Debug"),
    ])
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc) - timedelta(days=1))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=3650))
        .sign(key, hashes.SHA256())
    )
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    public_key_der = key.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo
    )

    zip_bytes = bytes(unaligned_apk_data)
    eocd_pos = zip_bytes.rfind(b"PK\x05\x06")
    if eocd_pos == -1:
        raise RuntimeError("EOCD not found")
    cd_offset = struct.unpack("<I", zip_bytes[eocd_pos+16:eocd_pos+20])[0]
    part1 = zip_bytes[:cd_offset]
    part2 = zip_bytes[cd_offset:eocd_pos]
    eocd = zip_bytes[eocd_pos:]

    CHUNK_SIZE = 1048576 # 1 MB chunks
    hashes_list = []

    for chunk_start in range(0, len(part1), CHUNK_SIZE):
        chunk = part1[chunk_start:chunk_start+CHUNK_SIZE]
        h = hashlib.sha256(b"\xa5" + struct.pack("<I", len(chunk)) + chunk).digest()
        hashes_list.append(h)

    for chunk_start in range(0, len(part2), CHUNK_SIZE):
        chunk = part2[chunk_start:chunk_start+CHUNK_SIZE]
        h = hashlib.sha256(b"\xa5" + struct.pack("<I", len(chunk)) + chunk).digest()
        hashes_list.append(h)

    # In Android APK Signature Scheme v2, when hashing EoCD, the Central Directory offset field
    # (bytes 16..20 of EoCD) MUST be set to the start offset of the APK Signing Block!
    block_start = len(part1)
    eocd_modified = eocd[:16] + struct.pack("<I", block_start) + eocd[20:]
    h = hashlib.sha256(b"\xa5" + struct.pack("<I", len(eocd_modified)) + eocd_modified).digest()
    hashes_list.append(h)

    # Top-level hash
    top_hash = hashlib.sha256(b"\x5a" + struct.pack("<I", len(hashes_list)) + b"".join(hashes_list)).digest()

    # Digest record: algorithm 0x0103 (SHA256 with RSA)
    digest_bytes = struct.pack("<I", 0x0103) + struct.pack("<I", len(top_hash)) + top_hash
    digest_entry = struct.pack("<I", len(digest_bytes)) + digest_bytes
    digests_block = struct.pack("<I", len(digest_entry)) + digest_entry

    # Certificate record
    cert_entry = struct.pack("<I", len(cert_der)) + cert_der
    certs_block = struct.pack("<I", len(cert_entry)) + cert_entry

    # Additional attributes
    additional_attrs = b""
    attrs_block = struct.pack("<I", len(additional_attrs)) + additional_attrs

    # Signed data
    signed_data = digests_block + certs_block + attrs_block
    signed_data_block = struct.pack("<I", len(signed_data)) + signed_data

    # Sign using RSA-PKCS1v15 + SHA256
    sig_raw = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    sig_bytes = struct.pack("<I", 0x0103) + struct.pack("<I", len(sig_raw)) + sig_raw
    sig_entry = struct.pack("<I", len(sig_bytes)) + sig_bytes
    signatures_block = struct.pack("<I", len(sig_entry)) + sig_entry

    # Public key block
    public_key_block = struct.pack("<I", len(public_key_der)) + public_key_der

    # Signer block
    signer_bytes = signed_data_block + signatures_block + public_key_block
    signer_entry = struct.pack("<I", len(signer_bytes)) + signer_bytes
    signers_block = struct.pack("<I", len(signer_entry)) + signer_entry

    # APK v2 ID-value pair (ID = 0x7109871a)
    v2_pair = struct.pack("<I", 0x7109871a) + signers_block
    v2_pair_record = struct.pack("<Q", len(v2_pair)) + v2_pair

    # APK Signing Block
    block_content = v2_pair_record
    block_size = len(block_content) + 24 # content + size(8) + magic(16)
    magic = b"APK Sig Block 42"
    signing_block = struct.pack("<Q", block_size) + block_content + struct.pack("<Q", block_size) + magic

    # Modify EoCD Central Directory offset to point after signing block
    new_cd_offset = len(part1) + len(signing_block)
    final_eocd = eocd[:16] + struct.pack("<I", new_cd_offset) + eocd[20:]

    final_apk = part1 + signing_block + part2 + final_eocd
    with open(output_apk, "wb") as f:
        f.write(final_apk)

    log(f"SUCCESS: Built and signed {output_apk}")
    log(f"Final APK Size: {len(final_apk)} bytes ({len(final_apk) / (1024*1024):.2f} MB)")

if __name__ == "__main__":
    main()
