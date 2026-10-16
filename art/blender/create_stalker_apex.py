"""Build an editable apex silhouette blockout from a baked adult reference.

Run in background Blender with --python this_file. Saves only under apex/.
This is a static design blockout, not a rigged runtime replacement.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/alien/tendon-stalker/apex'
SOURCE = ROOT / 'art/alien/tendon-stalker/adult/tendon-stalker-adult.blend'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
adult_scene = bpy.context.scene
adult_scene.frame_set(1)
bpy.context.view_layer.update()
adult_body = bpy.data.objects['StalkerBody']
evaluated = adult_body.evaluated_get(bpy.context.evaluated_depsgraph_get())
body_mesh = bpy.data.meshes.new_from_object(evaluated)
body_mesh.transform(adult_body.matrix_world)

scene = bpy.data.scenes.new('Tendon_Stalker_Apex_Blockout')
bpy.context.window.scene = scene
scene.world = adult_scene.world.copy() if adult_scene.world else None
collection = bpy.data.collections.new('Apex_Blockout')
scene.collection.children.link(collection)
root = bpy.data.objects.new('Apex_Blockout_Root', None)
collection.objects.link(root)
root['stage'] = 'apex'
root['status'] = 'static silhouette blockout; rig, weights and animation pending'

body = bpy.data.objects.new('Apex | adult-derived anatomical foundation', body_mesh)
collection.objects.link(body)
body.parent = root
for vertex in body_mesh.vertices:
    p = vertex.co
    rise = max(0.0, min(1.0, (p.z - 0.25) / 1.8))
    p.x *= 1 + 0.12 * rise
    p.z += 0.30 * rise

def material_fragment(fragment):
    return next(m for m in body_mesh.materials if fragment.lower() in m.name.lower())

chitin = material_fragment('chitin')
tissue = material_fragment('tissue')
ivory = material_fragment('hook')
mint = material_fragment('core')

def ribbon(name, points, widths, material, depth=0.45):
    """Closed tapered six-sided plates, kept individually editable."""
    vertices, faces = [], []
    for i, point in enumerate(points):
        tangent = Vector(points[min(i + 1, len(points) - 1)]) - Vector(points[max(0, i - 1)])
        tangent.normalize()
        axis = tangent.cross(Vector((0, 0, 1)))
        if axis.length < 0.01:
            axis = tangent.cross(Vector((0, 1, 0)))
        axis.normalize()
        other = tangent.cross(axis).normalized()
        for k in range(6):
            angle = k * math.tau / 6
            vertices.append(Vector(point) + widths[i] * (axis * math.cos(angle) + other * depth * math.sin(angle)))
    for i in range(len(points) - 1):
        for k in range(6):
            a, b = i * 6 + k, i * 6 + (k + 1) % 6
            faces.append((a, b, b + 6, a + 6))
    faces.append(tuple(reversed(range(6))))
    faces.append(tuple((len(points) - 1) * 6 + k for k in range(6)))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.parent = root
    obj['blockout_part'] = True
    return obj

for side, label in [(-1, 'L'), (1, 'R')]:
    # The apex's open bifurcated mantle is wider than the adult's upright crown.
    for i in range(3):
        y = 0.28 + i * 0.24
        ribbon(f'Apex | mantle arch {label}.{i}',
               [(side * 0.37, y, 1.65), (side * 0.74, y + 0.05, 2.45),
                (side * (1.02 + i * 0.10), y + 0.35, 2.95 - i * 0.10),
                (side * (1.36 + i * 0.08), y + 0.76, 2.66 - i * 0.09)],
               [0.17, 0.19, 0.13, 0.006], chitin)
        ribbon(f'Apex | mantle tendon {label}.{i}',
               [(side * 0.38, y - 0.03, 1.7), (side * 0.70, y + 0.01, 2.40),
                (side * (1.0 + i * 0.1), y + 0.32, 2.88 - i * 0.1)],
               [0.035, 0.045, 0.012], tissue)
    # Broad overlapping thoracic blades create a readable top-down silhouette.
    for i in range(4):
        y = 0.05 + i * 0.29
        ribbon(f'Apex | lateral carapace {label}.{i}',
               [(side * 0.37, y, 1.24), (side * 0.77, y + 0.07, 1.48),
                (side * 1.16, y + 0.42, 1.21)], [0.16, 0.22, 0.007], chitin)
    ribbon(f'Apex | jaw guard {label}',
           [(side * 0.30, -0.65, 1.56), (side * 0.52, -0.92, 1.30),
            (side * 0.43, -1.14, 1.02), (side * 0.22, -1.19, 1.10)],
           [0.085, 0.095, 0.055, 0.004], ivory)
    # Reinforce the two capture arms rather than adding unrelated limbs.
    ribbon(f'Apex | capture forearm blade {label}',
           [(side * 0.90, -0.84, 0.80), (side * 1.30, -1.03, 0.62),
            (side * 1.45, -1.36, 0.42)], [0.11, 0.12, 0.003], chitin)
    for i in range(4):
        z = 1.06 + i * 0.14
        ribbon(f'Apex | chest rib {label}.{i}',
               [(side * 0.36, -0.18, z + 0.05), (side * 0.22, -0.40, z),
                (side * 0.065, -0.44, z - 0.03)], [0.065, 0.05, 0.012], chitin)

# Mint organs remain recessed in the seam rather than becoming large neon plates.
for i in range(4):
    z = 1.04 + i * 0.14
    ribbon(f'Apex | sternum organ {i}', [(0, -0.41, z), (0, -0.42, z + 0.11)], [0.055, 0.04], mint)
for i in range(5):
    y = 0.55 + i * 0.30
    z = 1.48 - i * 0.19
    ribbon(f'Apex | dorsal tail plate {i}', [(0, y, z), (0, y + 0.2, z + 0.16), (0, y + 0.44, z - 0.08)],
           [0.13 - i * 0.012, 0.14 - i * 0.014, 0.004], chitin)

# Copy the authored studio lighting, never mutate the adult's scene or materials.
for original in adult_scene.objects:
    if original.type in {'LIGHT', 'CAMERA'}:
        obj = original.copy()
        obj.data = original.data.copy()
        scene.collection.objects.link(obj)
        if obj.type == 'CAMERA':
            scene.camera = obj
scene.render.engine = adult_scene.render.engine
if hasattr(scene, 'cycles'):
    scene.cycles.samples = 24
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = adult_scene.view_settings.view_transform
scene.view_settings.look = adult_scene.view_settings.look
scene.view_settings.exposure = adult_scene.view_settings.exposure
scene.view_settings.gamma = adult_scene.view_settings.gamma
camera = scene.camera
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 5.5
focus = Vector((0, 0.15, 1.4))
views = [('three-quarter', (4.5, -6.0, 4.0)), ('side', (6.0, 0, 2.5)), ('top', (0, 0.15, 8))]
for name, position in views:
    camera.location = position
    camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(OUT / f'preview-{name}.png')
    bpy.ops.render.render(write_still=True)

camera.location = views[0][1]
camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.object.select_all(action='DESELECT')
for obj in collection.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body
scene['status'] = 'APEX BLOCKOUT: static, not runtime rigged'
scene.render.filepath = str(OUT / 'preview-three-quarter.png')
bpy.ops.export_scene.gltf(filepath=str(OUT / 'tendon-stalker-apex-blockout.glb'), export_format='GLB',
                          use_selection=True, use_active_scene=True, export_animations=False, export_extras=True)
# Remove unrelated historical scenes from this new file only. Source .blend is untouched.
for old_scene in list(bpy.data.scenes):
    if old_scene != scene:
        bpy.data.scenes.remove(old_scene)
bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'tendon-stalker-apex-blockout.blend'))
meshes = [obj for obj in collection.objects if obj.type == 'MESH']
triangles = 0
for obj in meshes:
    obj.data.calc_loop_triangles()
    triangles += len(obj.data.loop_triangles)
report = {'stage': 'apex', 'status': 'static blockout', 'meshes': len(meshes), 'triangles': triangles,
          'rigged': False, 'animations': [], 'source': str(SOURCE.relative_to(ROOT)),
          'remaining': ['silhouette review', 'retopology and material refinement', 'rig and weights',
                        'six in-place clips and capture sockets', 'runtime validation and integration']}
(OUT / 'blockout-report.json').write_text(json.dumps(report, indent=2))
print('APEX_BLOCKOUT_REPORT ' + json.dumps(report))
