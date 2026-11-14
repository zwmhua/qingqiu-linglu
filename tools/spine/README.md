# Stretchy 主角 Spine 测试资源

在 Stretchy 导出目录中准备同时含 `idle`、`run` 的 `skeleton.repaired.json` 和 `images/` 下的 24 张 768×768 透明 PNG。当前原始 `skeleton.json` 有双小数点错误，须先修复为 `skeleton.repaired.json`；这两份脚本不处理该语法错误。脚本需要 Python 3 和 Pillow。以下命令在项目根目录用 PowerShell 运行：

```powershell
$src = 'E:\Temp\stretchy\spine_run'
$out = 'E:\Temp\stretchy\spine_run\packed-42b' # 须为尚不存在的目录
python tools/spine/convert_40_to_42b.py $src
python tools/spine/pack_spine_atlas.py $src $out
```

第一步生成 `$src/skeleton.42b.json`，不覆盖输入；第二步生成 `$out/skeleton.json`、`$out/skeleton.atlas` 和 `$out/skeleton.png`。打包脚本会校验 24 张图的像素，图集为单张 1024×1024 RGBA PNG。将这三个文件放在同一资源目录；主角站立资源位于 `assets/town/spine/`，项目设置需启用 Spine 4.2。
