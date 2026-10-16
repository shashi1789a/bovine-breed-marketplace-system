import io
import os
import secrets

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from utils.predict import predict_image

IS_PRODUCTION = os.getenv("ENVIRONMENT", "development") == "production"
API_KEY = os.getenv("ML_API_KEY", "")
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 20_000_000  # a decoded image is ~3 bytes/pixel, so this caps RAM use
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

Image.MAX_IMAGE_PIXELS = MAX_PIXELS

if IS_PRODUCTION and not API_KEY:
    raise RuntimeError("ML_API_KEY must be set in production")

app = FastAPI(
    title="BoviNetra ML Service",
    docs_url=None if IS_PRODUCTION else "/docs",
    redoc_url=None,
    openapi_url=None if IS_PRODUCTION else "/openapi.json",
)


def verify_api_key(x_api_key: str = Header(default="")):
    if API_KEY and not secrets.compare_digest(x_api_key.encode(), API_KEY.encode()):
        raise HTTPException(status_code=401, detail="Invalid API key")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict", dependencies=[Depends(verify_api_key)])
def predict(image: UploadFile = File(...)):
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG or WEBP images are allowed")

    raw = image.file.read(MAX_UPLOAD_BYTES + 1)

    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large")

    try:
        pil_image = Image.open(io.BytesIO(raw))

        if pil_image.width * pil_image.height > MAX_PIXELS:
            raise HTTPException(status_code=413, detail="Image dimensions are too large")

        pil_image.load()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(status_code=422, detail="Invalid image file")

    breed, confidence, info = predict_image(pil_image)

    return {"breed": breed, "confidence": confidence, "info": info}