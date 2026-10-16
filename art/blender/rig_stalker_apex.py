"""Bind the apex silhouette to the proven adult rig and six in-place clips.

Run with Blender --background --python this_file. The editable blockout and
adult sources stay unchanged; runtime outputs have their own names.
"""
import bpy
import json
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'art/alien/tendon-stalker/apex'
SOURCE = OUT / 'apex-runtime-source.blend'
if not SOURCE.exists():
    SOURCE = OUT / 'tendon-stalker-apex-blockout.blend'
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
source_scene = bpy.data.scenes['Tendon_Stalker_Apex_Blockout']
bpy.context.window.scene = source_scene
foundation = next(obj for obj in source_scene.objects if 'anatomical foundation' in obj.name)
with bpy.data.libraries.load(str(ROOT / 'art/alien/tendon-stalker/adult/tendon-stalker-adult.blend'), link=False) as (_, loaded):
    loaded.objects = ['Creature', 'StalkerBody']
rig, adult = loaded.objects
assert rig.type == 'ARMATURE' and adult.type == 'MESH'
assert rig.name == 'Creature', 'A clean background process is required for canonical export names'
assert len(foundation.data.vertices) == len(adult.data.vertices), 'Adult vertex groups must match the baked foundation'

scene = bpy.data.scenes.new('Tendon_Stalker_Apex_Runtime')
bpy.context.window.scene = scene
collection = bpy.data.collections.new('Apex_Runtime')
scene.collection.children.link(collection)
collection.objects.link(rig)
rig.animation_data.action = bpy.data.actions.get('idle') or rig.animation_data.action
scene.frame_start = 1
scene.frame_end = 60
scene.render.fps = 30
scene.frame_set(1)
for bone in rig.pose.bones:
    bone.location = (0, 0, 0)
    bone.rotation_euler = (0, 0, 0)
    bone.scale = (1, 1, 1)
bpy.context.view_layer.update()

# Preserve the foundation's already authored adult skin weights by vertex index.
# Its silhouette morph leaves the stance feet unchanged; the rig and baked gait
# remain at the proven adult rest coordinates and speed.
body = adult.copy()
body.data = foundation.data.copy()
body.name = 'ApexBody'
body.parent = rig
body.matrix_world = foundation.matrix_world.copy()
collection.objects.link(body)
for modifier in body.modifiers:
    if modifier.type == 'ARMATURE':
        modifier.object = rig
parts = [body]

def segment_distance(point, bone):
    a, b = bone.head_local, bone.tail_local
    direction = b - a
    t = max(0, min(1, (point - a).dot(direction) / direction.length_squared))
    return (point - (a + direction * t)).length

def attachment(name):
    if 'jaw guard' in name:
        return ['jaw']
    if 'forearm blade' in name:
        side = 'L' if name.endswith('L') else 'R'
        return [f'capture.{side}.0', f'capture.{side}.1']
    if 'mantle' in name or 'carapace' in name:
        return ['mantle', 'body']
    return ['body']

for original in list(source_scene.objects):
    if original.type != 'MESH' or original == foundation or 'dorsal tail plate' in original.name:
        continue
    obj = bpy.data.objects.new(original.name, original.data.copy())
    obj.data.transform(original.matrix_world)
    obj.parent = rig
    collection.objects.link(obj)
    candidates = attachment(original.name)
    groups = {name: obj.vertex_groups.new(name=name) for name in candidates}
    for vertex in obj.data.vertices:
        weights = [(1 / (segment_distance(vertex.co, rig.data.bones[name]) + 0.025) ** 4, name) for name in candidates]
        total = sum(weight for weight, _ in weights)
        for weight, name in weights:
            groups[name].add([vertex.index], weight / total, 'REPLACE')
    parts.append(obj)

# Seat the dorsal plates on the curled tail rather than leaving blockout tips floating.
chitin = next(mat for mat in body.data.materials if 'chitin' in mat.name.lower())
def morph(point):
    p = Vector(point)
    rise = max(0, min(1, (p.z - 0.25) / 1.8))
    p.x *= 1 + 0.12 * rise
    p.z += 0.30 * rise
    return p

for index in range(4):
    bone = rig.data.bones[f'tail.{index}']
    a, b = morph(bone.head_local), morph(bone.tail_local)
    middle = (a + b) / 2
    vertices = [a + Vector((-0.1, 0, 0)), a + Vector((0.1, 0, 0)),
                middle + Vector((0, 0, 0.20)), b + Vector((0, 0, 0.025))]
    mesh = bpy.data.meshes.new(f'Apex tail plate {index}')
    mesh.from_pydata(vertices, [], [(0, 1, 2), (1, 3, 2), (3, 0, 2), (0, 3, 1)])
    mesh.materials.append(chitin)
    obj = bpy.data.objects.new(f'Apex tail plate {index}', mesh)
    collection.objects.link(obj)
    obj.parent = rig
    obj.vertex_groups.new(name=bone.name).add(list(range(4)), 1, 'REPLACE')
    parts.append(obj)

# Join into one skinned mesh. Vertex groups survive the join; five materials
# retain the authored tissue/chitin/hooks/core/tendon palette.
bpy.ops.object.select_all(action='DESELECT')
for part in parts:
    part.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body = bpy.context.object
body.name = 'ApexBody'
assert any(modifier.type == 'ARMATURE' for modifier in body.modifiers)
unweighted = sum(not any(group.weight > 0 for group in vertex.groups) for vertex in body.data.vertices)
assert unweighted == 0, f'{unweighted} vertices have no skin weights'

socket_names = [f'socket.tentacle.{i}' for i in range(8)]
with bpy.data.libraries.load(str(ROOT / 'art/alien/tendon-stalker/adult/tendon-stalker-adult.blend'), link=False) as (_, loaded):
    loaded.objects = socket_names
for socket in loaded.objects:
    # Parent binds refer to the same library-loaded rig. Preserve the authored
    # bone-local offsets and matrix_parent_inverse, then explicitly rebind.
    socket.parent = rig
    collection.objects.link(socket)

rig['stage'] = 'apex'
rig['sourceRig'] = 'adult: same planted gait, 27 bones and six clips'
scene['status'] = 'rigged apex runtime asset'
scene.world = source_scene.world
for original in source_scene.objects:
    if original.type in {'LIGHT', 'CAMERA'}:
        obj = original.copy()
        obj.data = original.data.copy()
        scene.collection.objects.link(obj)
        if obj.type == 'CAMERA':
            scene.camera = obj
scene.render.engine = source_scene.render.engine
scene.cycles.samples = 24
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.view_settings.view_transform = source_scene.view_settings.view_transform
scene.view_settings.look = source_scene.view_settings.look
scene.view_settings.exposure = source_scene.view_settings.exposure
scene.view_settings.gamma = source_scene.view_settings.gamma
camera = scene.camera
focus = Vector((0, 0.15, 1.4))
camera.location = (4.5, -6, 4)
camera.rotation_euler = (focus - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.ortho_scale = 5.5

# The adult's actions and muted NLA tracks are retained, not renamed or retimed.
clips = {strip.action.name for track in rig.animation_data.nla_tracks for strip in track.strips if strip.action}
clips.add(rig.animation_data.action.name)
required = {'idle', 'move', 'capture', 'gulp', 'hurt', 'evolve'}
assert required.issubset(clips), f'Missing animations: {required - clips}'
bpy.ops.object.select_all(action='DESELECT')
for obj in collection.objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=str(OUT / 'creature_apex.glb'), export_format='GLB', use_selection=True,
                          use_active_scene=True, export_animations=True, export_animation_mode='ACTIONS',
                          export_force_sampling=True, export_def_bones=True, export_extras=True)
body.data.calc_loop_triangles()
report = {'stage': 'apex', 'triangles': len(body.data.loop_triangles), 'bones': len(rig.data.bones),
          'materials': len({mat.name for mat in body.data.materials}), 'unweighted_vertices': unweighted,
          'sockets': len(socket_names), 'animations': sorted(required), 'rigged': True,
          'gait_speed_mps': rig['gaitSpeedMps'], 'source_rig': 'adult',
          'note': 'Adult planted gait and clips reused; upper-body apex geometry is separately weighted.'}
assert report['triangles'] <= 8000
(OUT / 'rig-report.json').write_text(json.dumps(report, indent=2))
scene.render.filepath = str(OUT / 'preview-runtime.png')
bpy.ops.render.render(write_still=True)
rig.animation_data.action = next(action for action in bpy.data.actions if action.name == 'move')
scene.frame_set(5)
scene.render.filepath = str(OUT / 'preview-runtime-walk.png')
bpy.ops.render.render(write_still=True)
rig.animation_data.action = next(action for action in bpy.data.actions if action.name == 'idle')
scene.frame_set(1)
scene.render.filepath = str(OUT / 'preview-runtime.png')
for old_scene in list(bpy.data.scenes):
    if old_scene != scene:
        bpy.data.scenes.remove(old_scene)
bpy.ops.outliner.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'tendon-stalker-apex-rigged.blend'))
print('APEX_RUNTIME_REPORT ' + json.dumps(report))
