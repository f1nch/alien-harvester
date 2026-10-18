"""Anatomical surface study on the validated, connected Apex geometry.

Preserves v2 and the runtime mesh/skin; writes concept-study-v3/apex.
"""
import bpy,math,json,bmesh,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'art/alien/tendon-stalker'
stage=sys.argv[sys.argv.index('--stage')+1] if '--stage' in sys.argv else 'apex'
assert stage in ('hatchling','juvenile','adult','apex')
OUT=BASE/'concept-study-v3/apex' if stage=='apex' else BASE/'surface-lineage'/stage
OUT.mkdir(parents=True,exist_ok=True)
source_dir=BASE/'concept-study-v2/apex' if stage=='apex' else BASE/'lineage-study'/stage
native='apex-concept-study.blend' if stage=='apex' else 'creature-study.blend'
if '--features' in sys.argv:
    OUT=BASE/'feature-lineage'/stage;OUT.mkdir(parents=True,exist_ok=True)
    source_dir=BASE/'feature-anatomy'/stage;native='creature-study.blend'
bpy.ops.wm.open_mainfile(filepath=str(source_dir/native))
scene=bpy.context.scene;rig=bpy.data.objects['Creature'];body=bpy.data.objects['StalkerBody']
high=bpy.data.objects['Apex anatomical sculpt'];high.hide_set(False)
rig.data.pose_position='REST';scene.frame_set(1)
def active(obj):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj

# Add broad, connected tendon relief only to the sculpt. Joint ends taper to
# zero displacement; the validated game geometry and skin are left unchanged.
flesh={v for p in high.data.polygons if 'Tissue' in high.data.materials[p.material_index].name for v in p.vertices}
anatomy=high.data.attributes['anatomy'];shade=high.data.attributes['tissueShade']
offsets=[]
for vertex in high.data.vertices:
    if vertex.index not in flesh or shade.data[vertex.index].value<.8:continue
    p=vertex.co
    if not (abs(p.x)>.45 and (p.y<-.30 or p.z<1.15)):continue
    uv=anatomy.data[vertex.index].vector;t=uv.y;angle=uv.x*math.tau
    envelope=max(0,math.sin(math.pi*t))**1.1
    relief=.0065*min(1,rig.data.bones['body'].head_local.z/1.06778)*math.cos(10*angle+1.4*math.sin(3*t))*envelope
    offsets.append((vertex.index,vertex.normal.copy()*relief))
for index,offset in offsets:high.data.vertices[index].co+=offset
high.data.update()
check=bmesh.new();check.from_mesh(high.data)
assert sum(f.calc_area()<1e-12 for f in check.faces)<16
check.free()

def mathnode(nodes,links,operation,a,b=None):
    node=nodes.new('ShaderNodeMath');node.operation=operation
    if isinstance(a,(float,int)):node.inputs[0].default_value=a
    else:links.new(a,node.inputs[0])
    if b is not None:
        if isinstance(b,(float,int)):node.inputs[1].default_value=b
        else:links.new(b,node.inputs[1])
    return node.outputs[0]
def noise(nodes,links,vector,scale,detail=3):
    node=nodes.new('ShaderNodeTexNoise');node.inputs['Scale'].default_value=scale;node.inputs['Detail'].default_value=detail
    links.new(vector,node.inputs['Vector']);return node.outputs['Fac']
def ramp(nodes,links,factor,stops):
    node=nodes.new('ShaderNodeValToRGB');colors=node.color_ramp
    colors.elements.remove(colors.elements[1])
    for i,(position,color) in enumerate(stops):
        element=colors.elements[0] if i==0 else colors.elements.new(position)
        element.position=position;element.color=color
    links.new(factor,node.inputs[0]);return node.outputs['Color']

materials=[]
for index,old in enumerate(list(high.data.materials)):
    kind='Tissue' if 'Tissue' in old.name else 'Chitin' if 'Chitin' in old.name else 'Core' if 'Core' in old.name else 'Hooks'
    material=bpy.data.materials.new('Surface_'+kind);material.use_nodes=True
    nodes=material.node_tree.nodes;links=material.node_tree.links;nodes.clear()
    p=nodes.new('ShaderNodeBsdfPrincipled');output=nodes.new('ShaderNodeOutputMaterial');links.new(p.outputs[0],output.inputs['Surface'])
    coords=nodes.new('ShaderNodeTexCoord');generated=coords.outputs['Generated']
    if kind=='Core':
        p.inputs['Base Color'].default_value=(.035,.22,.13,1)
        p.inputs['Emission Color'].default_value=(.1,.8,.48,1);p.inputs['Emission Strength'].default_value=.65
        p.inputs['Roughness'].default_value=.65
    elif kind=='Tissue':
        attribute=nodes.new('ShaderNodeAttribute');attribute.attribute_name='anatomy'
        stretch=nodes.new('ShaderNodeVectorMath');stretch.operation='MULTIPLY';stretch.inputs[1].default_value=(48,2.3,3)
        links.new(attribute.outputs['Vector'],stretch.inputs[0])
        grain=noise(nodes,links,stretch.outputs[0],1,4)
        separate=nodes.new('ShaderNodeSeparateXYZ');links.new(attribute.outputs['Vector'],separate.inputs[0])
        phase=mathnode(nodes,links,'ADD',mathnode(nodes,links,'MULTIPLY',separate.outputs['X'],math.tau*38),mathnode(nodes,links,'MULTIPLY',grain,2.8))
        strands=mathnode(nodes,links,'MULTIPLY_ADD',mathnode(nodes,links,'SINE',phase),.5)
        # MULTIPLY_ADD's third socket supplies the shift into [0,1].
        strands.node.inputs[2].default_value=.5
        strands=mathnode(nodes,links,'POWER',strands,5)
        color_factor=mathnode(nodes,links,'ADD',mathnode(nodes,links,'MULTIPLY',grain,.82),mathnode(nodes,links,'MULTIPLY',strands,.18))
        color=ramp(nodes,links,color_factor,[(.05,(.025,.007,.014,1)),(.42,(.075,.024,.038,1)),(.72,(.16,.065,.085,1)),(.98,(.22,.105,.125,1))])
        shade_node=nodes.new('ShaderNodeAttribute');shade_node.attribute_name='tissueShade'
        mix=nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
        links.new(color,mix.inputs[1]);links.new(shade_node.outputs['Fac'],mix.inputs[2]);links.new(mix.outputs[0],p.inputs['Base Color'])
        roughness=mathnode(nodes,links,'SUBTRACT',.86,mathnode(nodes,links,'MULTIPLY',grain,.23))
        links.new(roughness,p.inputs['Roughness'])
        bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.65;bump.inputs['Distance'].default_value=.006
        links.new(strands,bump.inputs['Height'])
        micro=nodes.new('ShaderNodeBump');micro.inputs['Strength'].default_value=.18;micro.inputs['Distance'].default_value=.0015
        links.new(noise(nodes,links,generated,210,2),micro.inputs['Height']);links.new(bump.outputs[0],micro.inputs['Normal']);links.new(micro.outputs[0],p.inputs['Normal'])
    else:
        mottling=noise(nodes,links,generated,18,4)
        geometry=nodes.new('ShaderNodeNewGeometry')
        wear=mathnode(nodes,links,'ADD',mathnode(nodes,links,'MULTIPLY',mottling,.72),mathnode(nodes,links,'MULTIPLY',geometry.outputs['Pointiness'],.28))
        stops=[(.05,(.047,.035,.058,1)),(.45,(.12,.105,.135,1)),(.80,(.25,.235,.25,1)),(1,(.36,.34,.32,1))] if kind=='Chitin' else [(.05,(.16,.12,.075,1)),(.42,(.40,.32,.20,1)),(.80,(.68,.59,.40,1)),(1,(.82,.74,.56,1))]
        links.new(ramp(nodes,links,wear,stops),p.inputs['Base Color'])
        links.new(mathnode(nodes,links,'SUBTRACT',.78 if kind=='Chitin' else .68,mathnode(nodes,links,'MULTIPLY',mottling,.22)),p.inputs['Roughness'])
        cracks=nodes.new('ShaderNodeTexVoronoi');cracks.feature='DISTANCE_TO_EDGE';cracks.inputs['Scale'].default_value=23 if kind=='Chitin' else 32
        links.new(generated,cracks.inputs['Vector'])
        narrow=mathnode(nodes,links,'MAXIMUM',0,mathnode(nodes,links,'SUBTRACT',1,mathnode(nodes,links,'MULTIPLY',cracks.outputs['Distance'],65)))
        gate=mathnode(nodes,links,'GREATER_THAN',mottling,.57)
        height=mathnode(nodes,links,'SUBTRACT',mathnode(nodes,links,'MULTIPLY',noise(nodes,links,generated,100,3),.30),mathnode(nodes,links,'MULTIPLY',narrow,gate))
        bump=nodes.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.38;bump.inputs['Distance'].default_value=.003
        links.new(height,bump.inputs['Height']);links.new(bump.outputs[0],p.inputs['Normal'])
    high.data.materials[index]=material;body.data.materials[index]=material;materials.append(material)

sizes={'albedo':1024,'normal':2048 if stage in ('adult','apex') else 1024,'roughness':1024,'occlusion':1024}
images={};scene.render.engine='CYCLES';scene.cycles.samples=12
scene.render.bake.margin=8;scene.render.bake.cage_extrusion=.02;scene.render.bake.max_ray_distance=.06
for kind,size in sizes.items():
    print('BAKE_SURFACE',kind,size,flush=True)
    image=bpy.data.images.new('apex-surface-'+kind,width=size,height=size,alpha=False)
    image.colorspace_settings.name='sRGB' if kind=='albedo' else 'Non-Color'
    restore=[]
    for material in materials:
        nodes=material.node_tree.nodes;links=material.node_tree.links
        target=nodes.new('ShaderNodeTexImage');target.image=image;nodes.active=target
        p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED');output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
        if kind in ('roughness','occlusion'):
            emit=nodes.new('ShaderNodeEmission')
            if kind=='roughness':
                socket=p.inputs['Roughness']
                if socket.is_linked:links.new(socket.links[0].from_socket,emit.inputs['Color'])
                else:emit.inputs['Color'].default_value=(socket.default_value,)*3+(1,)
            else:
                ao=nodes.new('ShaderNodeAmbientOcclusion');ao.inputs['Distance'].default_value=.16;ao.samples=16;ao.only_local=True
                links.new(ao.outputs['AO'],emit.inputs['Color'])
            links.new(emit.outputs[0],output.inputs['Surface']);restore.append((material,p,output))
    active(body);high.hide_render=kind!='normal'
    scene.render.bake.use_selected_to_active=kind=='normal'
    if kind=='normal':high.select_set(True)
    scene.render.bake.use_pass_direct=False;scene.render.bake.use_pass_indirect=False;scene.render.bake.use_pass_color=True
    bpy.ops.object.bake(type='DIFFUSE' if kind=='albedo' else 'NORMAL' if kind=='normal' else 'EMIT')
    for material,p,output in restore:material.node_tree.links.new(p.outputs[0],output.inputs['Surface'])
    image.filepath_raw=str(OUT/f'apex-{kind}-{size}.png');image.file_format='PNG';image.save();image.pack();images[kind]=image

settings=bpy.data.node_groups.new('glTF Material Output','ShaderNodeTree')
settings.interface.new_socket(name='Occlusion',in_out='INPUT',socket_type='NodeSocketFloat')
for index,material in enumerate(materials):
    game=material.copy();body.data.materials[index]=game;nodes=game.node_tree.nodes;links=game.node_tree.links
    p=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
    textures={}
    for kind,image in images.items():
        texture=nodes.new('ShaderNodeTexImage');texture.image=image;textures[kind]=texture
    links.new(textures['albedo'].outputs['Color'],p.inputs['Base Color'])
    normal=nodes.new('ShaderNodeNormalMap');links.new(textures['normal'].outputs['Color'],normal.inputs['Color']);links.new(normal.outputs[0],p.inputs['Normal'])
    links.new(textures['roughness'].outputs['Color'],p.inputs['Roughness'])
    group=nodes.new('ShaderNodeGroup');group.node_tree=settings;links.new(textures['occlusion'].outputs['Color'],group.inputs['Occlusion'])

high.hide_render=True;high.hide_set(True);rig.data.pose_position='POSE';rig.animation_data.action=None;scene.frame_set(1)
report=json.loads((source_dir/'study-report.json').read_text())
report.update({'status':stage+' anatomical surface study; local only','stage':stage,'textures':sizes,'game_geometry':'unchanged from connected anatomy study','sculpt_relief_vertices':len(offsets)})
(OUT/'study-report.json').write_text(json.dumps(report,indent=2))
height=max(v.co.z for v in body.data.vertices)
scene.camera.location=(3.4,-5.8,3.0);focus=Vector((0,-.1,height*.45))
scene.camera.rotation_euler=(focus-scene.camera.location).to_track_quat('-Z','Y').to_euler();scene.camera.data.ortho_scale=4.6*min(1,max(.6,height/2.8))
scene.render.resolution_x=1000;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.cycles.samples=32;scene.cycles.use_denoising=True
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/native))
scene.render.filepath=str(OUT/'preview-three-quarter.png');bpy.ops.render.render(write_still=True)
scene.camera.location=(4.3,0,1.8);scene.camera.rotation_euler=(Vector((0,0,.95))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.filepath=str(OUT/'preview-side.png');bpy.ops.render.render(write_still=True)
print('SURFACE_STUDY',json.dumps(report),flush=True)
