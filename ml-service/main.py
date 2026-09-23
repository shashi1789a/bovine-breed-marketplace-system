# ml-service/main.py
from fastapi import FastAPI, File, UploadFile
from utils.predict import predict_image
import shutil, os, uuid

app = FastAPI()
os.makedirs("uploads", exist_ok=True)

@app.post("/predict")
async def predict(image: UploadFile = File(...)):
    ext = image.filename.rsplit(".", 1)[-1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    path = os.path.join("uploads", filename)
    with open(path, "wb") as f:
        shutil.copyfileobj(image.file, f)

    breed, confidence, info = predict_image(path)
    return {"breed": breed, "confidence": confidence, "info": info, "image_path": path}