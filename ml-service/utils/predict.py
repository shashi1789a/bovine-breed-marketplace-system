import json
import os

import timm
import torch
import torchvision.transforms as transforms

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def _load_json(name):
    with open(os.path.join(BASE_DIR, "data", name), "r", encoding="utf-8") as file:
        return json.load(file)


CLASSES = _load_json("labels.json")
BREED_INFO = _load_json("breed_info.json")

_model = timm.create_model("resnet50", pretrained=False, num_classes=len(CLASSES))
_checkpoint = torch.load(
    os.path.join(BASE_DIR, "model", "best_model_final.pth"),
    map_location=DEVICE,
    weights_only=True,
)
_model.load_state_dict(_checkpoint.get("model_state_dict", _checkpoint), strict=True)
_model.to(DEVICE).eval()

_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])


def predict_image(image):
    tensor = _transform(image.convert("RGB")).unsqueeze(0).to(DEVICE)

    with torch.inference_mode():
        probs = torch.softmax(_model(tensor), dim=1)
        conf, pred = torch.max(probs, dim=1)

    breed = CLASSES[pred.item()]

    return breed, round(conf.item() * 100, 2), BREED_INFO.get(breed, {})