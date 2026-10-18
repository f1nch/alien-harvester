"""Render the refined native assets and measure actual loop closure.

Background Blender; writes per-stage frame strips for an animated review sheet.
"""
import bpy
import json
import math
import sys
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
variant = 'surface-lineage' if '--surface-lineage' in sys.argv else 'concept-study-v3' if '--study-v3' in sys.argv else 'concept-study-v2' if '--study-v2' in sys.argv else 'organic' if '--organic' in sys.argv else 'polished' if '--polish-v2' in sys.argv else 'refined'
OUT = ROOT / 'art/alien/tendon-stalker' / variant
if '--features' in sys.argv:
    variant='feature-lineage';OUT=ROOT/'art/alien/tendon-stalker'/variant
report_path = OUT/'animation-qa.json'
report = json.loads(report_path.read_text()) if report_path.exists() else {}
stages = [arg for arg in sys.argv[sys.argv.index('--')+1:] if not arg.startswith('--')] if '--' in sys.argv else []
stages = stages or ('hatchling','juvenile','adult','apex')
assert all(stage in ('hatchling','juvenile','adult','apex') for stage in stages)
for stage in stages:
    folder = OUT / stage
    filename = 'tendon-stalker-rigged.blend' if stage=='hatchling' else 'tendon-stalker-'+stage+'.blend'
    if variant.startswith('concept-study'):filename='apex-concept-study.blend'
    if variant=='surface-lineage':filename='creature-study.blend'
    if variant=='feature-lineage':filename='creature-study.blend'
    bpy.ops.wm.open_mainfile(filepath=str(folder / filename))
    scene = bpy.context.scene
    rig = bpy.data.objects['Creature']
    actions = {track.name: track.strips[0].action for track in rig.animation_data.nla_tracks}
    closure = {}
    for name in ('idle','move','capture'):
        action = actions[name]
        rig.animation_data.action = action
        start,end = action.frame_range
        scene.frame_set(int(start)); bpy.context.view_layer.update()
        first = {bone.name: bone.matrix.copy() for bone in rig.pose.bones}
        scene.frame_set(int(end)); bpy.context.view_layer.update()
        closure[name] = max(abs(bone.matrix[row][col]-first[bone.name][row][col])
                            for bone in rig.pose.bones for row in range(4) for col in range(4))
        assert closure[name] < 0.00001, (stage,name,closure[name])
    report[stage] = {'max_loop_matrix_error':closure,'fps':scene.render.fps,
                     'move_duration_seconds':float((actions['move'].frame_range[1]-1)/scene.render.fps)}
    rig.animation_data.action = actions['move']
    scene.camera.location = (3.2,-5.0,3.4)
    focus = Vector((0,-.05,1.08))
    scene.camera.rotation_euler = (focus-scene.camera.location).to_track_quat('-Z','Y').to_euler()
    scene.camera.data.ortho_scale = 5.2
    scene.render.resolution_x = 512 if variant in ('organic','concept-study-v2','concept-study-v3','surface-lineage','feature-lineage') else 400
    scene.render.resolution_y = scene.render.resolution_x
    scene.render.resolution_percentage = 100
    scene.cycles.samples = 8
    frames = folder/'motion-frames'; frames.mkdir(exist_ok=True)
    frame_count = 12 if variant.startswith('concept-study') or variant in ('surface-lineage','feature-lineage') else 24
    for i in range(frame_count):
        frame = 1 + i*46/frame_count
        scene.frame_set(math.floor(frame),subframe=frame%1)
        scene.render.filepath = str(frames/f'{i:02}.png')
        bpy.ops.render.render(write_still=True)
(OUT/'animation-qa.json').write_text(json.dumps(report,indent=2))
print('ANIMATION_QA',json.dumps(report))
