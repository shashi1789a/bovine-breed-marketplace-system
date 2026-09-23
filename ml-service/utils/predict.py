# ml-service/utils/predict.py
import os
import json
import torch
import timm
from PIL import Image
import torchvision.transforms as transforms

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

with open(os.path.join(BASE_DIR, "data", "labels.json"), "r") as f:
    CLASSES = json.load(f)

with open(os.path.join(BASE_DIR, "data", "breed_info.json"), "r") as f:
    BREED_INFO = json.load(f)

MODEL_PATH = os.path.join(BASE_DIR, "model", "best_model_final.pth")

_model = timm.create_model("resnet50", pretrained=False, num_classes=len(CLASSES))
_checkpoint = torch.load(MODEL_PATH, map_location=DEVICE)
_state_dict = _checkpoint.get("model_state_dict", _checkpoint)
_model.load_state_dict(_state_dict, strict=True)
_model.to(DEVICE)
_model.eval()

_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])


def predict_image(image_path):
    img = Image.open(image_path).convert("RGB")
    img_tensor = _transform(img).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        outputs = _model(img_tensor)
        probs = torch.softmax(outputs, dim=1)
        conf, pred = torch.max(probs, 1)

    breed = CLASSES[pred.item()]
    confidence = round(conf.item() * 100, 2)
    info = BREED_INFO.get(breed, {})

    return breed, confidence, info