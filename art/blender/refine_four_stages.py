"""Rebuild a refined lineage in sibling files; original Blender sources stay intact.

Blender --background --python art/blender/refine_four_stages.py -- hatchling
Repeat with juvenile, adult, apex. Uses the existing authored source geometry.
"""
import bpy
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'art/alien/tendon-stalker'
stage = sys.argv[sys.argv.index('--') + 1]
assert stage in ('hatchling', 'juvenile', 'adult', 'apex')
POLISH_V2 = '--polish-v2' in sys.argv
output_folder = 'polished' if POLISH_V2 else 'refined'
destination = BASE / output_folder / stage
destination.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(BASE / 'tendon-stalker-rigged.blend'))

def replace_once(code, old, new):
    assert old in code, 'Source changed; recheck refinement patch: ' + old[:100]
    return code.replace(old, new, 1)

code = (ROOT / 'art/blender/rig_tendon_stalker.py').read_text()
# Bake twice as many samples while preserving every clip's original duration.
code = code.replace('scene.render.fps=30', 'scene.render.fps=60')
code = replace_once(code, "('idle',60),('move',24),('capture',30),('gulp',10),('hurt',10),('evolve',18)",
                    "('idle',119),('move',47),('capture',59),('gulp',19),('hurt',19),('evolve',35)")
code = replace_once(code, 'def plant_leg(idx,phase,bob):', 'def plant_leg(idx,phase,bob,walking=True):')
code = replace_once(code, '    if phase<.5:', '    if not walking:\n        pass\n    elif phase<.5:')
# Hermite swing matches the linear stance velocity at both ends instead of
# abruptly switching from linear travel to a cosine with zero velocity.
code = replace_once(code, 'foot.y+=stride*.5*math.cos(math.pi*swing)',
                    'foot.y+=stride*(.5+swing-6*swing**2+4*swing**3)')
code = replace_once(code, 'foot.z+=.095*math.sin(math.pi*swing)**2',
                    'foot.z+=.085*math.sin(math.pi*swing)**4')
code = replace_once(code, "gait_samples.append({'leg':idx", "if not walking: return\n    gait_samples.append({'leg':idx")
# Keep feet planted during breathing as well as locomotion.
code = replace_once(code, "b.location.y=.02*(1-math.cos(2*math.pi*t)); h.rotation_euler.x=.035*s",
                    "b.location.y=.008*(1-math.cos(2*math.pi*t)); h.rotation_euler.x=.018*s\n            bpy.context.view_layer.update()\n            for idx in range(4): plant_leg(idx,0,b.location.y,False)")
code = code.replace("rotation_euler.x=.025*s", "rotation_euler.x=.012*s")
code = code.replace("rotation_euler.z=.045*s", "rotation_euler.z=.025*math.sin(2*math.pi*t-i*.38)")
code = code.replace("rotation_euler.z=.05*s", "rotation_euler.z=.035*math.sin(2*math.pi*t-i*.38)")
code = code.replace("rotation_euler.x=.07*s", "rotation_euler.x=.04*math.sin(2*math.pi*t+(.25 if side=='L' else -.25))")
code = replace_once(code, "bob=.006*(1-math.cos(4*math.pi*t)); b.location.y=bob",
                    "bob=.004*(1-math.cos(4*math.pi*t)); b.location.y=bob\n            h.rotation_euler.x=-.012*math.sin(4*math.pi*t)")
code = replace_once(code, "    n=original.name\n    oldmat=", "    n=original.name\n    if omit_part(n):\n        bpy.data.objects.remove(obj,do_unlink=True)\n        continue\n    oldmat=")
code = replace_once(code, "    ns=candidates(n)",
                    "    # Smooth organic tubes; retain the broad chitin planes.\n    for face in obj.data.polygons:\n        face.use_smooth = matidx in (0,2,3) and not n.startswith('Head')\n    ns=candidates(n)")
code = code.replace('bevel.width=.009; bevel.segments=1', 'bevel.width=.012; bevel.segments=1')
code = replace_once(code, "rig['gaitSpeedMps']=gait_speed", "rig['gaitSpeedMps']=gait_speed\nrig['refinement']='2026-10-16: continuous swing velocity, planted idle, delayed tail, smooth tissue'\nrig['stage']=REFINED_STAGE")
code = replace_once(code, "'stage':'hatchling'", "'stage':REFINED_STAGE")
# Keep review renders inexpensive enough to repeat on every stage.
code = code.replace('scene.cycles.samples=24', 'scene.cycles.samples=16')
code = code.replace('resolution_x=900', 'resolution_x=720').replace('resolution_y=900', 'resolution_y=720')

if POLISH_V2:
    # Longer stance overlap gives four-leg support at foot exchange. Increased
    # stride avoids making the creature's cadence faster at a given world speed.
    code = replace_once(code, 'stride=.4*S[1][1]', 'stride=.46*S[1][1]\nSTANCE_DUTY=.55')
    code = replace_once(code, 'gait_speed=2*stride/gait_duration', 'gait_speed=stride/(STANCE_DUTY*gait_duration)')
    code = replace_once(code, 'elif phase<.5:', 'elif phase<STANCE_DUTY:')
    code = replace_once(code, 'foot.y+=stride*(2*phase-.5)', 'foot.y+=stride*(phase/STANCE_DUTY-.5)')
    code = replace_once(code, 'swing=(phase-.5)*2', 'swing=(phase-STANCE_DUTY)/(1-STANCE_DUTY)\n        m=(1-STANCE_DUTY)/STANCE_DUTY')
    code = replace_once(code, 'foot.y+=stride*(.5+swing-6*swing**2+4*swing**3)',
                        'foot.y+=stride*(.5+m*swing-(3+3*m)*swing**2+(2+2*m)*swing**3)')
    code = code.replace("'stance':phase<.5", "'stance':phase<STANCE_DUTY")
    code = replace_once(code, 'hip=rest[0].head_local.copy()+Vector((0,0,bob))',
                        "body_pose=rig.pose.bones['body'].matrix @ armdata.bones['body'].matrix_local.inverted()\n    hip=body_pose @ rest[0].head_local")
    code = code.replace("raise ValueError('Unreachable foot target '+str(idx)+' '+str(phase))",
                        "raise ValueError('Unreachable foot target '+str((idx,phase,distance,l1,l2,list(hip),list(foot))))")
    code = replace_once(code, 'bob=.004*(1-math.cos(4*math.pi*t)); b.location.y=bob',
                        'bob=.003*(1-math.cos(4*math.pi*t)); b.location.y=bob\n            b.location.x=.008*s\n            b.rotation_euler.x=.008*math.sin(4*math.pi*t)')
    code = code.replace("rotation_euler.x=.04*math.sin(2*math.pi*t+(.25 if side=='L' else -.25))",
                        "rotation_euler.x=.035*s*(1 if side=='L' else -1)")
    # Capture moves the head/jaw and arms without rocking the planted body.
    code = code.replace('b.rotation_euler.x=.06*pulse; jaw.rotation_euler.x=.18*pulse',
                        'h.rotation_euler.x=.025*pulse; jaw.rotation_euler.x=.16*pulse')
    code = code.replace('b.scale=(1+.1*pulse,1-.08*pulse,1+.06*pulse)',
                        'b.scale=(1+.04*pulse,1-.03*pulse,1+.025*pulse)')
    code = code.replace('b.rotation_euler.x=-.13*pulse; h.rotation_euler.x=.12*pulse',
                        'b.rotation_euler.x=-.045*pulse; h.rotation_euler.x=.08*pulse')
    code = code.replace('face.use_smooth = matidx in (0,2,3) and not n.startswith(\'Head\')',
                        'face.use_smooth = True')
    code = code.replace('bevel.width=.012; bevel.segments=1',
                        "bevel.width=.012; bevel.segments=2 if n.startswith('Head | swept wedge skull') else 1")
    code = replace_once(code, '    ns=candidates(n)', """    if matidx==1:
        obj.data.set_sharp_from_angle(angle=.65)
        bpy.context.view_layer.objects.active=obj
        normals=obj.modifiers.new('Broad shell normals','WEIGHTED_NORMAL')
        normals.keep_sharp=True; normals.weight=50
        bpy.ops.object.modifier_apply(modifier=normals.name)
    ns=candidates(n)""")
    code = code.replace("report={'triangles':", "report={'stance_duty':STANCE_DUTY,'visual_pass':'polish-v2','triangles':")
    code = code.replace("rig['refinement']='2026-10-16: continuous swing velocity, planted idle, delayed tail, smooth tissue'",
                        "rig['refinement']='2026-10-16 polish-v2: stance overlap, balanced torso, stable capture, weighted shell normals'")

def omit_part(name):
    # All stages lose tiny secondary teeth that disappear through the game camera.
    if name.startswith('Tooth '): return True
    if stage == 'adult' and name.startswith('Dorsal crown') and name.endswith(' 1'): return True
    if stage == 'apex':
        if name.startswith(('Dorsal crown', 'Dorsal shoulder blade', 'Flank layered armor',
                            'Capture opposing grown', 'Jaw | split grown', 'Head swept horn',
                            'Head | swept temple')): return True
        if name.startswith('Flank armor') and name.endswith((' 1', ' 3')): return True
    return False

REFINED_STAGE = stage
if stage == 'hatchling':
    code = code.replace("out=Path('D:/Projects/alien-evolve/art/alien/tendon-stalker')", 'out=Path('+repr(str(destination))+')')
    exec(compile(code, 'refined_hatchling', 'exec'), globals())
else:
    refined_rig_source = code
    evolution = (ROOT / 'art/blender/create_stalker_evolutions.py').read_text()
    evolution = replace_once(evolution, "rig_source = (root/'art/blender/rig_tendon_stalker.py').read_text()", 'rig_source = refined_rig_source')
    evolution = replace_once(evolution, "for stage in ['juvenile', 'adult']:", 'for build_stage in [REFINED_STAGE]:\n    stage = build_stage')
    evolution = replace_once(evolution, "adult = stage == 'adult'", "adult = stage in ('adult','apex')")
    evolution = replace_once(evolution, "destination = root/'art/alien/tendon-stalker'/stage", "destination = root/'art/alien/tendon-stalker'/output_folder/stage")
    evolution = replace_once(evolution, "    # Rise the thorax", """    if stage == 'apex':
        # Increase arm cross-section around the existing joint centerline so
        # the proven rig, reach and skin deformation stay aligned.
        for obj in list(evolved.objects):
            part_name = obj.get('source_name',obj.name)
            if part_name.startswith(('Capture hook','Capture opposing digit','Jaw | split mandible')):
                bpy.data.objects.remove(obj,do_unlink=True)
                continue
            if part_name.startswith(('Capture_L','Capture_R','Capture tendon')):
                side = -1 if part_name.startswith('Capture_L') or '-1' in part_name else 1
                centerline = [Vector(p) for p in [(side*.22,-.3,.69),(side*.43,-.42,.54),
                              (side*.49,-.69,.31),(side*.64,-.96,.18),(side*.65,-1.18,.14)]]
                for vertex in obj.data.vertices:
                    candidates = []
                    for a,b in zip(centerline,centerline[1:]):
                        delta = b-a
                        t = max(0,min(1,(vertex.co-a).dot(delta)/delta.length_squared))
                        point = a+delta*t
                        candidates.append(((vertex.co-point).length_squared,point))
                    center = min(candidates,key=lambda entry:entry[0])[1]
                    vertex.co = center+(vertex.co-center)*1.5

        # One broad swept pair replaces all stacked adult shoulder/crown blades.
        # Curves sweep rearward, leaving clear air around the wedge skull.
        for side in [-1,1]:
            # Broad roots taper into narrow hooked cutting points.
            ribbon('Capture hook apex '+str(side),
                [(side*.65,-1.18,.14),(side*.76,-1.35,.11),
                 (side*.64,-1.55,.10),(side*.40,-1.54,.27)],
                [.075,.065,.042,.001],ivory)
            ribbon('Capture opposing apex '+str(side),
                [(side*.65,-1.18,.14),(side*.56,-1.29,.24),(side*.50,-1.46,.33)],
                [.055,.042,.001],ivory)
            ribbon('Jaw | split apex '+str(side),
                [(side*.16,-.52,.72),(side*.22,-.73,.56),
                 (side*.12,-.95,.42),(side*.02,-1.02,.55)],
                [.085,.075,.045,.001],ivory)
            ribbon('Dorsal apex mantle '+str(side),
                [(side*.19,.03,.72),(side*.39,.32,.88),
                 (side*.58,.79,.97),(side*.64,1.23,.77)],
                [.15,.17,.12,.006],chitin)
            # Larger skull horns read separately from the lower swept back pair.
            ribbon('Head refined horn '+str(side),
                [(side*.16,-.50,.88),(side*.24,-.30,1.12),
                 (side*.31,-.02,1.23),(side*.33,.23,1.14)],
                [.085,.075,.045,.003],chitin)
            ribbon('Flank apex shield '+str(side),
                [(side*.20,.21,.55),(side*.40,.37,.67),(side*.47,.77,.55)],
                [.14,.16,.005],chitin)
        ribbon('Tail | terminal spike',
            [(0,1.22,.99),(0,1.10,.95),(0,.89,1.05),(0,.70,1.15)],
            [.045,.065,.045,.001],ivory)

    # Rise the thorax""")
    evolution = evolution.replace('lift = .9 if adult else .45', "lift = 1.05 if stage=='apex' else .9 if adult else .45")
    evolution = evolution.replace("scale = '(1.8,1.05,1.12,1)' if adult else '(1.6,.95,1.07,1)'",
                                  "scale = '(1.95,1.12,1.16,1)' if stage=='apex' else '(1.8,1.05,1.12,1)' if adult else '(1.6,.95,1.07,1)'")
    if stage == 'apex':
        evolution = evolution.replace("code = code.replace('cam.data.ortho_scale=3.5', 'cam.data.ortho_scale=4.4')",
                                      "code = code.replace('cam.data.ortho_scale=3.5', 'cam.data.ortho_scale=5.5')")
    evolution = evolution.replace("root = Path('D:/Projects/alien-evolve')", 'root = Path('+repr(str(ROOT))+')')
    exec(compile(evolution, 'refined_evolution', 'exec'), globals())

print('REFINED_STAGE_COMPLETE', REFINED_STAGE)
