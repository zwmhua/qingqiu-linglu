"""Make a Spine 4.2 smoke-test export with bone-local unweighted meshes."""

import json
import math
import sys
from pathlib import Path

CANVAS_HEIGHT = 768


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def compose(parent, bone):
    pa, pb, pc, pd, px, py = parent
    angle = math.radians(bone.get("rotation", 0))
    co, si = math.cos(angle), math.sin(angle)
    sx, sy = bone.get("scaleX", 1), bone.get("scaleY", 1)
    a, b, c, d = co * sx, -si * sy, si * sx, co * sy
    x, y = bone.get("x", 0), bone.get("y", 0)
    return (pa*a + pb*c, pa*b + pb*d,
            pc*a + pd*c, pc*b + pd*d,
            pa*x + pb*y + px, pc*x + pd*y + py)


def local_from_canvas(transform, canvas_x, canvas_y):
    a, b, c, d, x, y = transform
    determinant = a*d - b*c
    require(abs(determinant) > 1e-10, "singular bone transform")
    dx, dy = canvas_x - x, CANVAS_HEIGHT - canvas_y - y
    return ((d*dx - b*dy) / determinant,
            (-c*dx + a*dy) / determinant)


def main(source_dir):
    data = json.loads((source_dir / "skeleton.repaired.json").read_text(encoding="utf-8"))
    require(data["skeleton"]["spine"] == "4.0", "unexpected source version")
    require((data["skeleton"]["width"], data["skeleton"]["height"]) == (768, 768),
            "unexpected canvas size")
    bones = data["bones"]
    removed = bones[1:5]
    require([b["name"] for b in removed] ==
            ["leftElbow", "rightElbow", "leftKnee", "rightKnee"] and
            all(b.get("parent") == "root" for b in removed),
            "unexpected root-level duplicate bones")
    require({"idle", "run"} <= data["animations"].keys(),
            "export must contain idle and run")
    timeline_names = {name for animation in data["animations"].values()
                      for name in animation.get("bones", {})}
    # The run export animates leftKnee/rightKnee. The surviving knees are the
    # only ones connected to the legs and bound to the foot slots.
    require(timeline_names.intersection(b["name"] for b in removed) <=
            {"leftKnee", "rightKnee"}, "ambiguous animated duplicate")
    # No descendant names refer to the removed bones; all four later copies
    # remain under their corresponding arm or leg.
    for bone in removed:
        require(sum(b["name"] == bone["name"] for b in bones) == 2,
                f"unexpected duplicate count: {bone['name']}")
        require(all(b.get("parent") != bone["name"] for b in bones),
                f"bone has a named child: {bone['name']}")
    del bones[1:5]
    names = [b["name"] for b in bones]
    require(len(names) == len(set(names)) and len(names) == 14,
            "bone names remain ambiguous")
    require({s["name"]: s["bone"] for s in data["slots"] if s["name"] in
             ("foot_l", "foot_r")} == {"foot_l": "leftKnee", "foot_r": "rightKnee"},
            "unexpected foot bindings")
    require(all(s["bone"] in names for s in data["slots"]), "unresolved slot bone")

    world = {}
    identity = (1, 0, 0, 1, 0, 0)
    for bone in bones:
        parent = bone.get("parent")
        require(parent is None or parent in world,
                f"parent must precede child: {bone['name']}")
        world[bone["name"]] = compose(world[parent] if parent else identity, bone)

    slot_bone = {s["name"]: s["bone"] for s in data["slots"]}
    mesh_count = vertex_count = 0
    for slot, attachments in data["skins"][0]["attachments"].items():
        require(slot in slot_bone, f"unknown slot: {slot}")
        for attachment in attachments.values():
            if attachment.get("type") == "region":
                continue
            require(attachment.get("type") == "mesh", "unsupported attachment")
            vertices, uvs = attachment["vertices"], attachment["uvs"]
            require(len(vertices) == len(uvs) and len(vertices) % 2 == 0,
                    f"weighted or malformed mesh: {slot}")
            transform = world[slot_bone[slot]]
            converted = []
            for i in range(0, len(vertices), 2):
                converted.extend(local_from_canvas(transform, vertices[i], vertices[i+1]))
            require(all(math.isfinite(v) for v in converted), f"invalid vertex: {slot}")
            attachment["vertices"] = converted
            triangles = attachment["triangles"]
            require(all(isinstance(t, list) and len(t) == 3 and
                        all(isinstance(i, int) and 0 <= i < len(uvs)//2 for i in t)
                        for t in triangles), f"invalid triangles: {slot}")
            attachment["triangles"] = [i for triangle in triangles for i in triangle]
            mesh_count += 1
            vertex_count += len(vertices)//2

    data["skeleton"]["spine"] = "4.2.0"
    data["skeleton"]["referenceScale"] = 100
    output = source_dir / "skeleton.42b.json"
    output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")),
                      encoding="utf-8")
    print(f"wrote {output}: {len(bones)} unique bones, {mesh_count} meshes, "
          f"{vertex_count} converted vertices")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: convert_40_to_42b.py SOURCE_DIRECTORY")
    main(Path(sys.argv[1]))
