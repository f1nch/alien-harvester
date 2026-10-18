"""Validate the separate Apex study and export only its active scene."""
import bpy,json,sys,bmesh
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
variant='concept-study-v3' if '--v3' in sys.argv else 'concept-study-v2' if '--v2' in sys.argv else 'concept-study'
stage=sys.argv[sys.argv.index('--stage')+1] if '--stage' in sys.argv else 'apex'
if '--stage' in sys.argv:variant='surface-lineage' if '--surface' in sys.argv else 'lineage-study'
if '--features' in sys.argv:variant='feature-lineage' if '--surface' in sys.argv else 'feature-anatomy'
OUT=ROOT/'art/alien/tendon-stalker'/variant/stage
native='apex-concept-study.blend' if variant.startswith('concept-study') else 'creature-study.blend'
exportname={'hatchling':'creature_larval.glb','juvenile':'creature_evolved.glb','adult':'creature_adult.glb','apex':'creature_apex.glb'}[stage]
bpy.ops.wm.open_mainfile(filepath=str(OUT/native))
scene=bpy.context.scene; rig=bpy.data.objects['Creature']; body=bpy.data.objects['StalkerBody']
removed_islands=0
if '--clean-islands' in sys.argv:
    for obj in (body,bpy.data.objects['Apex anatomical sculpt']):
        bm=bmesh.new();bm.from_mesh(obj.data)
        tissue={v for face in bm.faces if 'Tissue' in obj.data.materials[face.material_index].name for v in face.verts}
        remaining=set(tissue);remove=[]
        while remaining:
            first=remaining.pop();component={first};pending=[first]
            while pending:
                for edge in pending.pop().link_edges:
                    for neighbor in edge.verts:
                        if neighbor in remaining:remaining.remove(neighbor);component.add(neighbor);pending.append(neighbor)
            if len(component)<64:remove.extend(component);removed_islands+=1
        if remove:
            bmesh.ops.delete(bm,geom=remove,context='VERTS');bm.to_mesh(obj.data);obj.data.update()
        bm.free()
actions={track.name:track.strips[0].action for track in rig.animation_data.nla_tracks}
report=json.loads((OUT/'study-report.json').read_text())
report['removed_tiny_tissue_islands']=removed_islands
body.data.calc_loop_triangles(); report['game_triangles']=len(body.data.loop_triangles)
if variant in ('concept-study-v2','concept-study-v3','lineage-study','surface-lineage','feature-anatomy','feature-lineage'):
    sculpt=bpy.data.objects['Apex anatomical sculpt']
    sculpt.data.calc_loop_triangles();report['sculpt_triangles']=len(sculpt.data.loop_triangles)
    flesh={v for p in sculpt.data.polygons if 'Tissue' in sculpt.data.materials[p.material_index].name for v in p.vertices}
    adjacency={i:set() for i in flesh}
    for edge in sculpt.data.edges:
        a,b=edge.vertices
        if a in flesh and b in flesh:adjacency[a].add(b);adjacency[b].add(a)
    remaining=set(flesh);sizes=[]
    while remaining:
        first=remaining.pop();pending=[first];count=1
        while pending:
            for neighbor in adjacency[pending.pop()] & remaining:
                remaining.remove(neighbor);pending.append(neighbor);count+=1
        sizes.append(count)
    report['tissue_components']=len(sizes)
    report['largest_tissue_component_fraction']=max(sizes)/sum(sizes)
closure={}
for name in ('idle','move','capture'):
    action=actions[name]; rig.animation_data.action=action
    start,end=action.frame_range
    scene.frame_set(int(start)); bpy.context.view_layer.update()
    first={bone.name:bone.matrix.copy() for bone in rig.pose.bones}
    scene.frame_set(int(end)); bpy.context.view_layer.update()
    closure[name]=max(abs(bone.matrix[r][c]-first[bone.name][r][c]) for bone in rig.pose.bones for r in range(4) for c in range(4))
    assert closure[name]<1e-5,(name,closure[name])
rig.animation_data.action=None; scene.frame_set(1)
if '--clean-islands' in sys.argv:bpy.ops.wm.save_as_mainfile(filepath=str(OUT/native))
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); rig.select_set(True)
for obj in scene.objects:
    if obj.name.startswith('socket.tentacle.'):obj.select_set(True)
bpy.context.view_layer.objects.active=rig
bpy.ops.export_scene.gltf(filepath=str(OUT/exportname),export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_def_bones=True,export_extras=True)
data=(OUT/exportname).read_bytes(); length=int.from_bytes(data[12:16],'little'); gltf=json.loads(data[20:20+length])
report['exported_triangles']=sum(gltf['accessors'][p['indices']]['count']//3 for mesh in gltf['meshes'] for p in mesh['primitives'])
report['exported_meshes']=len(gltf['meshes']); report['exported_clips']=[a['name'] for a in gltf['animations']]
report['exported_materials']=len(gltf['materials'])
report['exported_capture_sockets']=sum(n.get('name','').startswith('socket.tentacle.') for n in gltf['nodes'])
report['loop_matrix_error']=closure; report['file_bytes']=len(data)
assert report['exported_triangles']<=(8000 if stage=='hatchling' else 12000),report
assert len(gltf['skins'])==1 and len(gltf['skins'][0]['joints'])==27,report
assert len(gltf['animations'])==6,report
assert report['exported_capture_sockets']==8,report
assert report['exported_materials']==4,report
if variant in ('concept-study-v3','surface-lineage','feature-lineage'):
    report['textured_roughness_materials']=sum('metallicRoughnessTexture' in m.get('pbrMetallicRoughness',{}) for m in gltf['materials'])
    report['occlusion_materials']=sum('occlusionTexture' in m for m in gltf['materials'])
    assert report['textured_roughness_materials']==4 and report['occlusion_materials']==4,report
(OUT/'study-report.json').write_text(json.dumps(report,indent=2))
print('STUDY_VALIDATED',json.dumps(report),flush=True)
