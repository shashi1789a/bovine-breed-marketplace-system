import gc
import json
import os
import threading

import timm
import torch
import torchvision.transforms as transforms

# Render's small instances have very little RAM / CPU: keep torch lean.
torch.set_num_threads(1)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_PATH = os.path.join(BASE_DIR, "model", "best_model_slim.pth")


def _load_json(name):
    with open(os.path.join(BASE_DIR, "data", name), "r", encoding="utf-8") as file:
        return json.load(file)


CLASSES = _load_json("labels.json")
BREED_INFO = _load_json("breed_info.json")


def _load_model():
    model = timm.create_model("resnet50", pretrained=False, num_classes=len(CLASSES))

    # mmap=True: weights are read from disk lazily instead of being copied
    # fully into RAM first.
    checkpoint = torch.load(MODEL_PATH, map_location="cpu", weights_only=True, mmap=True)
    state = checkpoint.get("model_state_dict", checkpoint)

    # load_state_dict copies fp16 weights into the fp32 model (dtype is converted).
    model.load_state_dict(state, strict=True)

    # Free the checkpoint immediately.
    del state, checkpoint
    gc.collect()

    return model.to(DEVICE).eval()


_model = _load_model()
_lock = threading.Lock()

_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])


def predict_image(image):
    tensor = _transform(image.convert("RGB")).unsqueeze(0).to(DEVICE)

    # One prediction at a time, so parallel requests cannot multiply memory use.
    with _lock, torch.inference_mode():
        probs = torch.softmax(_model(tensor), dim=1)
        conf, pred = torch.max(probs, dim=1)

    breed = CLASSES[pred.item()]

    return breed, round(conf.item() * 100, 2), BREED_INFO.get(breed, {})