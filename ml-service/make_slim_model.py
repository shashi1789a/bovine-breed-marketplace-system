"""
One-time script. Run it LOCALLY (not on Render) from the ml-service folder:

    python make_slim_model.py

It reads model/best_model_final.pth, keeps only the model weights
(drops optimizer state etc.), stores them in float16 and writes
model/best_model_slim.pth. Upload that slim file to Hugging Face.
"""
import json
import os

import timm
import torch

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE_DIR, "model", "best_model_final.pth")
DST = os.path.join(BASE_DIR, "model", "best_model_slim.pth")

with open(os.path.join(BASE_DIR, "data", "labels.json"), "r", encoding="utf-8") as file:
    NUM_CLASSES = len(json.load(file))

checkpoint = torch.load(SRC, map_location="cpu", weights_only=True)

if isinstance(checkpoint, dict):
    print("Checkpoint keys:", list(checkpoint.keys())[:10])
    state = checkpoint.get("model_state_dict", checkpoint)
else:
    state = checkpoint

slim = {
    key: (value.half() if value.is_floating_point() else value)
    for key, value in state.items()
}

# Sanity check: weights must load into the same architecture predict.py uses.
model = timm.create_model("resnet50", pretrained=False, num_classes=NUM_CLASSES)
model.load_state_dict(slim, strict=True)

torch.save(slim, DST)

old_mb = os.path.getsize(SRC) / (1024 * 1024)
new_mb = os.path.getsize(DST) / (1024 * 1024)
print(f"Done. {old_mb:.1f} MB -> {new_mb:.1f} MB  ({DST})")