"""Create the minimal Cocos Creator 3.8.8 scene from its installed 2D preset."""
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRESET = Path(r"E:\ProgramData\cocos\editors\Creator\3.8.8\resources\resources\3d\engine\editor\assets\default_file_content\scene\scene-2d.scene")
SCRIPT_UUID = "7215a84d-49c3-4c57-bbd4-c00a24b684f1"
SCENE_UUID = "66ba6897-199f-4cf3-acc4-a475045cdfa8"


def meta(path: Path, importer: str, asset_uuid: str) -> None:
    data = {"ver": "4.0.23" if importer == "typescript" else "1.1.27",
            "importer": importer, "imported": True, "uuid": asset_uuid,
            "files": [] if importer == "typescript" else [".json"],
            "subMetas": {}, "userData": {}}
    path.with_name(path.name + ".meta").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


scene = json.loads(PRESET.read_text(encoding="utf-8"))
scene[0]["_name"] = scene[1]["_name"] = "Battle"
scene[1]["_id"] = SCENE_UUID
scene[2]["_lpos"]["x"] = 667
scene[2]["_lpos"]["y"] = 375
scene[2]["_components"].append({"__id__": len(scene)})
scene[5]["_contentSize"] = {"__type__": "cc.Size", "width": 1334, "height": 750}
scene.append({"__type__": SCRIPT_UUID, "_name": "", "_objFlags": 0,
              "node": {"__id__": 2}, "_enabled": True, "__prefab": None,
              "_id": "5fefb165ebd6489b9624bc21"})
scene_dir = ROOT / "assets" / "scenes"
scene_dir.mkdir(parents=True, exist_ok=True)
scene_path = scene_dir / "Battle.scene"
scene_path.write_text(json.dumps(scene, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
meta(scene_path, "scene", SCENE_UUID)
for name, asset_uuid in {"BattleView": SCRIPT_UUID,
                         "Battle": "1c37d768-4500-42fc-9e54-769259539049",
                         "config": "26115346-7415-4f32-abcb-d41283338305"}.items():
    meta(ROOT / "assets" / "scripts" / f"{name}.ts", "typescript", asset_uuid)
