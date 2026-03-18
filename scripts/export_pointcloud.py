"""
Blender Python script — run in Blender's Script Editor (Scripting tab).

Samples ~10,000 points from ALL selected mesh objects, computes darkness
(trunk/terrain = dark, outer canopy = light), normalizes coordinates,
and exports as tree-pts.json.

USAGE:
  1. Select ALL mesh objects you want included (tree + terrain)
  2. Open Blender's Scripting tab
  3. Paste this script and click "Run Script"
  4. JSON file will be saved to the path below (change OUTPUT_PATH if needed)

TUNING:
  - TOTAL_SAMPLES: total points to generate (~10,000 recommended)
  - TRUNK_AXIS_RADIUS: distance from center axis considered "trunk" (in normalized coords)
  - TERRAIN_Y_THRESHOLD: y-fraction below which points are considered terrain
"""

import bpy
import bmesh
import json
import os
import random
from mathutils import Vector
import numpy as np

# ── Configuration ────────────────────────────────────────────────────────────

OUTPUT_PATH = os.path.expanduser("~/Desktop/portfolio-output/public/tree-pts.json")
TOTAL_SAMPLES = 10000
TERRAIN_Y_THRESHOLD = 0.12   # bottom 12% of bounding box = terrain
TRUNK_AXIS_RADIUS = 0.08     # normalized; points this close to center axis are trunk
CANOPY_START_Y = 0.25        # above this fraction, canopy begins

# ── Collect all selected meshes ──────────────────────────────────────────────

meshes = [obj for obj in bpy.context.selected_objects if obj.type == 'MESH']
if not meshes:
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']

if not meshes:
    raise RuntimeError("No mesh objects found. Select your tree + terrain meshes.")

print(f"Processing {len(meshes)} mesh(es): {[m.name for m in meshes]}")

# ── Sample points from mesh surfaces ─────────────────────────────────────────

def sample_mesh_surface(obj, num_samples):
    """Sample random points on the surface of a mesh using face-area weighting."""
    # Apply modifiers and get evaluated mesh
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(depsgraph)
    mesh = eval_obj.to_mesh()

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces)

    # Compute face areas for weighted sampling
    faces = list(bm.faces)
    areas = [f.calc_area() for f in faces]
    total_area = sum(areas)

    if total_area < 1e-10:
        bm.free()
        eval_obj.to_mesh_clear()
        return []

    # Weighted random sampling
    weights = [a / total_area for a in areas]
    points = []

    for _ in range(num_samples):
        # Pick a face weighted by area
        r = random.random()
        cumulative = 0
        face_idx = 0
        for i, w in enumerate(weights):
            cumulative += w
            if r <= cumulative:
                face_idx = i
                break

        face = faces[face_idx]
        verts = [v.co for v in face.verts]

        # Random point on triangle (barycentric coordinates)
        u = random.random()
        v_rand = random.random()
        if u + v_rand > 1:
            u = 1 - u
            v_rand = 1 - v_rand

        # World-space position
        local_pos = verts[0] * (1 - u - v_rand) + verts[1] * u + verts[2] * v_rand
        world_pos = obj.matrix_world @ local_pos
        points.append((world_pos.x, world_pos.y, world_pos.z))

    bm.free()
    eval_obj.to_mesh_clear()
    return points


# Distribute samples proportional to mesh surface area
all_points = []
temp_counts = []

# First pass: get total area
total_global_area = 0
mesh_areas = []
for obj in meshes:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = obj.evaluated_get(depsgraph)
    mesh = eval_obj.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    area = sum(f.calc_area() for f in bm.faces)
    mesh_areas.append(area)
    total_global_area += area
    bm.free()
    eval_obj.to_mesh_clear()

for i, obj in enumerate(meshes):
    frac = mesh_areas[i] / total_global_area if total_global_area > 0 else 1.0 / len(meshes)
    n = max(100, int(TOTAL_SAMPLES * frac))
    pts = sample_mesh_surface(obj, n)
    all_points.extend(pts)
    print(f"  {obj.name}: {len(pts)} samples (area fraction: {frac:.2f})")

print(f"Total raw samples: {len(all_points)}")

# ── Normalize coordinates ────────────────────────────────────────────────────

xs = [p[0] for p in all_points]
ys = [p[1] for p in all_points]  # Blender Y or Z depending on orientation
zs = [p[2] for p in all_points]

# In Blender, Z is typically up. Detect orientation:
# If Z range > Y range, Z is up (standard Blender). Otherwise Y is up.
y_range = max(ys) - min(ys)
z_range = max(zs) - min(zs)

if z_range > y_range:
    # Z-up (Blender default): remap Z → Y (height), keep X, Y → Z (depth)
    print("Detected Z-up orientation (Blender default)")
    normalized = []
    for p in all_points:
        normalized.append((p[0], p[2], p[1]))  # x, z_as_y, y_as_z
    all_points = normalized
    xs = [p[0] for p in all_points]
    ys = [p[1] for p in all_points]
    zs = [p[2] for p in all_points]

# Find bounding box
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)
min_z, max_z = min(zs), max(zs)

# Center X and Z on the trunk axis (median of points in the trunk zone)
# trunk zone: bottom 25% of height, inner 20% of width
height_range = max_y - min_y
trunk_zone_y = min_y + height_range * 0.25

trunk_xs = [p[0] for p in all_points if p[1] < trunk_zone_y]
trunk_zs = [p[2] for p in all_points if p[1] < trunk_zone_y]

if trunk_xs:
    center_x = sum(trunk_xs) / len(trunk_xs)
    center_z = sum(trunk_zs) / len(trunk_zs)
else:
    center_x = (min_x + max_x) / 2
    center_z = (min_z + max_z) / 2

# Normalize: y → [0, 1], x/z centered and scaled to roughly [-1, 1]
scale = max(max_x - min_x, max_z - min_z) / 2  # half-extent
if scale < 1e-6:
    scale = 1

output_points = []
for p in all_points:
    nx = (p[0] - center_x) / scale
    ny = (p[1] - min_y) / height_range if height_range > 0 else 0
    nz = (p[2] - center_z) / scale

    # ── Compute darkness ─────────────────────────────────────────────────
    # Distance from vertical center axis (in normalized XZ plane)
    axis_dist = (nx ** 2 + nz ** 2) ** 0.5

    if ny < TERRAIN_Y_THRESHOLD:
        # Terrain: dark
        darkness = 0.85 + random.random() * 0.12
    elif ny < CANOPY_START_Y and axis_dist < TRUNK_AXIS_RADIUS * 3:
        # Trunk zone: very dark
        darkness = 0.78 + random.random() * 0.18
    elif axis_dist < TRUNK_AXIS_RADIUS:
        # Inner trunk at any height
        darkness = 0.75 + random.random() * 0.2
    else:
        # Canopy: darkness decreases with distance from axis and height
        # Outer canopy = lightest
        max_canopy_dist = 1.0  # normalized max
        dist_factor = min(axis_dist / max_canopy_dist, 1.0)
        height_factor = min(ny, 1.0)

        # Blend: inner canopy is darker, outer is lighter
        # Higher = lighter (canopy top catches light)
        base = 0.15 + (1 - dist_factor) * 0.35 + (1 - height_factor) * 0.15
        darkness = base + random.random() * 0.1

        # Clamp
        darkness = max(0.05, min(0.65, darkness))

    output_points.append([
        round(nx, 5),
        round(ny, 5),
        round(nz, 5),
        round(darkness, 4)
    ])

# ── Export JSON ──────────────────────────────────────────────────────────────

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

with open(OUTPUT_PATH, 'w') as f:
    json.dump(output_points, f)

print(f"\nExported {len(output_points)} points to: {OUTPUT_PATH}")
print(f"  X range: [{min(p[0] for p in output_points):.3f}, {max(p[0] for p in output_points):.3f}]")
print(f"  Y range: [{min(p[1] for p in output_points):.3f}, {max(p[1] for p in output_points):.3f}]")
print(f"  Z range: [{min(p[2] for p in output_points):.3f}, {max(p[2] for p in output_points):.3f}]")
print(f"  Darkness range: [{min(p[3] for p in output_points):.3f}, {max(p[3] for p in output_points):.3f}]")
