import sys
sys.path.insert(0, 'android-offline-spike/python_libs')
import blake3

h = blake3.blake3(b'').hexdigest()
print("BLAKE3 empty hash:", h)
assert h == "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262"
print("BLAKE3 specification verified successfully!")

