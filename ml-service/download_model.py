import hashlib
import os
import sys
import tempfile
import urllib.request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model", "best_model_slim.pth")
MIN_MODEL_BYTES = 1024 * 1024
CHUNK_BYTES = 1024 * 1024


def sha256_of(path):
    digest = hashlib.sha256()

    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(CHUNK_BYTES), b""):
            digest.update(chunk)

    return digest.hexdigest()


def download(url, target_path):
    request = urllib.request.Request(url, headers={"User-Agent": "bovinetra-model-downloader"})
    token = os.getenv("MODEL_TOKEN", "").strip()

    if token:
        request.add_header("Authorization", f"Bearer {token}")

    with urllib.request.urlopen(request, timeout=120) as response, open(target_path, "wb") as target:
        while True:
            chunk = response.read(CHUNK_BYTES)

            if not chunk:
                break

            target.write(chunk)


def main():
    if os.path.exists(MODEL_PATH) and os.path.getsize(MODEL_PATH) >= MIN_MODEL_BYTES:
        print("Model file already present, skipping download.")
        return

    url = os.getenv("MODEL_URL", "").strip()

    if not url:
        sys.exit("model/best_model_slim.pth is missing and MODEL_URL is not set.")

    model_dir = os.path.dirname(MODEL_PATH)
    os.makedirs(model_dir, exist_ok=True)

    handle, temp_path = tempfile.mkstemp(dir=model_dir, suffix=".part")
    os.close(handle)

    try:
        print("Downloading model...")
        download(url, temp_path)

        size = os.path.getsize(temp_path)

        if size < MIN_MODEL_BYTES:
            sys.exit(f"Downloaded file is only {size} bytes. Check that MODEL_URL points to the .pth file itself.")

        expected = os.getenv("MODEL_SHA256", "").strip().lower()

        if expected and sha256_of(temp_path) != expected:
            sys.exit("Downloaded model failed the SHA256 check.")

        os.chmod(temp_path, 0o644)
        os.replace(temp_path, MODEL_PATH)
        print(f"Model saved ({size / (1024 * 1024):.1f} MB).")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


if __name__ == "__main__":
    main()