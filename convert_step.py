#!/usr/bin/env python3
"""
STEP → DXF (三视图) + STL 转换脚本
使用 CadQuery 加载 STEP 文件，生成顶视图/前视图/侧视图 DXF 和 STL 预览。

用法:
    python convert_step.py <input.step> <output_dir>

输出 JSON 到 stdout，包含生成的文件列表。
"""

import sys
import os
import json

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "用法: python convert_step.py <input.step> <output_dir>"}))
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2]

    if not os.path.isfile(input_path):
        print(json.dumps({"error": f"文件不存在: {input_path}"}))
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    try:
        import cadquery as cq
        from cadquery import exporters
    except ImportError:
        print(json.dumps({"error": "CadQuery 未安装。请在 cad-env 虚拟环境中安装 cadquery。"}))
        sys.exit(1)

    # 加载 STEP
    try:
        body = cq.importers.importStep(input_path)
    except Exception as e:
        print(json.dumps({"error": f"无法加载 STEP 文件: {str(e)}"}))
        sys.exit(1)

    files = {}

    # 生成 STL
    stl_path = os.path.join(output_dir, "model.stl")
    try:
        exporters.export(body, stl_path, exporters.ExportTypes.STL)
        files["stl"] = "model.stl"
    except Exception as e:
        files["stl_error"] = str(e)

    # --- 三视图 DXF ---
    # 获取 bounding box 用于截面位置
    bb = body.val().BoundingBox()

    # 顶视图 (XY 平面, 从 Z 方向看下去) — 在模型中间高度截面
    try:
        z_mid = (bb.zmin + bb.zmax) / 2
        top_section = body.workplane("XY", origin=(0, 0, z_mid)).section()
        top_dxf = os.path.join(output_dir, "top_view.dxf")
        exporters.export(top_section, top_dxf, exporters.ExportTypes.DXF)
        files["dxf_top"] = "top_view.dxf"
    except Exception as e:
        # 如果截面失败，尝试投影
        try:
            top_dxf = os.path.join(output_dir, "top_view.dxf")
            exporters.export(body, top_dxf, exporters.ExportTypes.DXF)
            files["dxf_top"] = "top_view.dxf"
        except Exception as e2:
            files["dxf_top_error"] = str(e2)

    # 前视图 (XZ 平面, 从 Y 方向看) — 在 Y 中间截面
    try:
        from OCP.gp import gp_Pnt, gp_Dir, gp_Pln
        y_mid = (bb.ymin + bb.ymax) / 2
        front_plane = cq.Workplane(
            cq.Plane(origin=(0, y_mid, 0), xDir=(1, 0, 0), normal=(0, 1, 0))
        )
        front_section = front_plane.add(body).section()
        front_dxf = os.path.join(output_dir, "front_view.dxf")
        exporters.export(front_section, front_dxf, exporters.ExportTypes.DXF)
        files["dxf_front"] = "front_view.dxf"
    except Exception as e:
        files["dxf_front_error"] = str(e)

    # 侧视图 (YZ 平面, 从 X 方向看) — 在 X 中间截面
    try:
        x_mid = (bb.xmin + bb.xmax) / 2
        side_plane = cq.Workplane(
            cq.Plane(origin=(x_mid, 0, 0), xDir=(0, 1, 0), normal=(1, 0, 0))
        )
        side_section = side_plane.add(body).section()
        side_dxf = os.path.join(output_dir, "side_view.dxf")
        exporters.export(side_section, side_dxf, exporters.ExportTypes.DXF)
        files["dxf_side"] = "side_view.dxf"
    except Exception as e:
        files["dxf_side_error"] = str(e)

    print(json.dumps({"success": True, "files": files}))


if __name__ == "__main__":
    main()
