"""Refine and rig a separate runtime hatchling, keeping the approved blockout."""
import bpy, math, json, os
from pathlib import Path
from mathutils import Vector, Matrix
out=Path('D:/Projects/alien-evolve/art/alien/tendon-stalker')
src=bpy.data.collections['Tendon_Stalker_Hatchling']
name='Stalker_Runtime'
old=bpy.data.collections.get(name)
if old:
    previous_actions=set()
    for o in old.objects:
        if o.animation_data:
            if o.animation_data.action: previous_actions.add(o.animation_data.action)
            for tr in o.animation_data.nla_tracks:
                for strip in tr.strips:
                    if strip.action: previous_actions.add(strip.action)
    for o in list(old.objects): bpy.data.objects.remove(o,do_unlink=True)
    for action in previous_actions: bpy.data.actions.remove(action)
    bpy.data.collections.remove(old)
col=bpy.data.collections.new(name)
scene=bpy.data.scenes.new('Stalker_Rig_Studio'); scene.collection.children.link(col)
bpy.context.window.scene=scene; scene.render.fps=30; scene.frame_start=1; scene.frame_end=60
S=Matrix.Diagonal((1.45,.85,1.25,1))
def v(p): return S @ Vector(p)
def material(name,color,rough,glow=0):
    m=bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes=True
    m.diffuse_color=(*color,1)
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=0
    p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=glow
    return m
mats=[material('Stalker_Tissue',(.065,.029,.05),.72),material('Stalker_Chitin',(.12,.105,.14),.62),material('Stalker_Hooks',(.55,.48,.34),.58),material('Stalker_Core',(.12,.85,.51),.5,1.4)]
mats.append(material('Stalker_Tendon',(.15,.069,.108),.84))
armdata=bpy.data.armatures.new('Stalker skeleton'); rig=bpy.data.objects.new('Creature',armdata); col.objects.link(rig)
bpy.context.view_layer.objects.active=rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
chains={}; allsegments={}
def bone(n,a,b,parent=None):
    eb=armdata.edit_bones.new(n); eb.head=v(a); eb.tail=v(b)
    if parent: eb.parent=armdata.edit_bones[parent]
    allsegments[n]=(eb.head.copy(),eb.tail.copy())
    return eb
bone('root',(0,0,0),(0,0,.12))
bone('body',(0,.12,.49),(0,.12,.74),'root')
bone('mantle',(0,.18,.62),(0,.64,.5),'body')
bone('head',(0,-.3,.7),(0,-.69,.84),'body')
bone('jaw',(0,-.52,.68),(0,-.8,.48),'head')
for side in [-1,1]:
    tag='L' if side<0 else 'R'
    for idx,(y,z) in enumerate([(-.05,.57),(.53,.43)]):
        pts=[(side*.19,y,z),(side*.37,y-.13,z-.1),(side*.45,y+.03,.25),(side*.43,y-.12,.075)]
        prefix='leg.'+str((0 if side<0 else 2)+idx)
        names=[]
        for j in range(3):
            n=prefix+'.'+['a','b','c'][j]; bone(n,pts[j],pts[j+1], 'body' if j==0 else names[-1]); names.append(n)
        chains['Leg_'+tag+'_'+str(idx)]=names
    pts=[(side*.22,-.3,.69),(side*.43,-.42,.54),(side*.49,-.69,.31),(side*.65,-1.18,.14)]
    names=[]
    for j in range(3):
        n='capture.'+tag+'.'+str(j); bone(n,pts[j],pts[j+1],'body' if j==0 else names[-1]); names.append(n)
    chains['Capture_'+tag]=names
tail=[(0,.72,.38),(0,1.05,.33),(0,1.39,.5),(0,1.46,.72),(0,1.23,.99)]
for j in range(4): bone('tail.'+str(j),tail[j],tail[j+1],'mantle' if j==0 else 'tail.'+str(j-1))
bpy.ops.object.mode_set(mode='OBJECT')

def dist(p,a,b):
    d=b-a; t=max(0,min(1,(p-a).dot(d)/d.length_squared)); return (p-(a+t*d)).length
def candidates(n):
    for key,chain in chains.items():
        if n.startswith(key): return chain
    side='L' if '-1' in n else 'R'
    if n.startswith(('Capture hook','Capture opposing','Capture tendon')): return chains['Capture_'+side]
    if n.startswith('Capture shoulder'): return ['capture.'+side+'.0']
    if n.startswith(('Foot claw','Shin chitin','Leg armor')):
        tokens=n.split(); idx=int(tokens[-1] if not n.startswith('Foot') else tokens[-2]); s=-1 if '-1' in n else 1
        chain=chains['Leg_'+('L' if s<0 else 'R')+'_'+str(idx)]
        return chain if n.startswith('Shin') else [chain[-1] if n.startswith('Foot') else chain[0]]
    if n.startswith('Tail'): return ['tail.'+str(i) for i in range(4)]
    if n.startswith('Jaw | split'): return ['jaw']
    if n.startswith(('Head','Forehead','Eye','Tooth','Jaw | dark')): return ['head']
    if n.startswith(('Dorsal','Flank')): return ['mantle','body']
    return ['body']

parts=[]
for original in src.objects:
    if original.type!='MESH': continue
    obj=bpy.data.objects.new(original.name+' Runtime',original.data.copy()); col.objects.link(obj)
    # Inactive source scenes can have stale world matrices; source root is identity.
    obj.data.transform(S @ original.matrix_basis)
    n=original.name
    oldmat=original.data.materials[0].name
    matidx=3 if 'mint' in oldmat else 2 if 'ivory' in oldmat else 1 if 'chitin' in oldmat or 'ridges' in oldmat else 0
    obj.data.materials.clear(); obj.data.materials.append(mats[matidx])
    # Soften large armor edges while keeping the silhouette angular.
    if matidx==1 and any(t in n for t in ['armor','blade','Head |','temple','chitin']):
        bpy.context.view_layer.objects.active=obj
        bevel=obj.modifiers.new('Chitin edge refinement','BEVEL'); bevel.width=.009; bevel.segments=1
        bpy.ops.object.modifier_apply(modifier=bevel.name)
    ns=candidates(n)
    groups={bn:obj.vertex_groups.new(name=bn) for bn in ns}
    for vert in obj.data.vertices:
        ranked=sorted([(dist(vert.co,*allsegments[bn]),bn) for bn in ns])[:2]
        if len(ranked)==1: groups[ranked[0][1]].add([vert.index],1,'REPLACE')
        else:
            ds=[1/(d+.018)**4 for d,bn in ranked]; total=sum(ds)
            for (d,bn),w in zip(ranked,ds): groups[bn].add([vert.index],w/total,'REPLACE')
    parts.append(obj)

def tendon(name,points,radii,ns):
    """Raised, dry fiber bundles: real geometry, no per-frame procedural work."""
    vertices=[]; faces=[]
    centers=[v(p) for p in points]
    for i,p in enumerate(centers):
        tangent=(centers[min(i+1,len(centers)-1)]-centers[max(i-1,0)]).normalized()
        axis=tangent.cross(Vector((0,0,1)))
        if axis.length<.01: axis=tangent.cross(Vector((0,1,0)))
        axis.normalize(); other=tangent.cross(axis).normalized()
        for j in range(4):
            angle=j*math.tau/4
            vertices.append(p+radii[i]*(axis*math.cos(angle)+other*.65*math.sin(angle)))
    for i in range(len(centers)-1):
        for j in range(4): faces.append((i*4+j,i*4+(j+1)%4,(i+1)*4+(j+1)%4,(i+1)*4+j))
    faces.extend([tuple(reversed(range(4))),tuple((len(centers)-1)*4+j for j in range(4))])
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces); mesh.materials.append(mats[4])
    obj=bpy.data.objects.new(name,mesh); col.objects.link(obj)
    groups={bn:obj.vertex_groups.new(name=bn) for bn in ns}
    for vertex in mesh.vertices:
        ranked=sorted((dist(vertex.co,*allsegments[bn]),bn) for bn in ns)[:2]
        ws=[1/(d+.018)**4 for d,bn in ranked]; total=sum(ws)
        for (d,bn),w in zip(ranked,ws): groups[bn].add([vertex.index],w/total,'REPLACE')
    parts.append(obj)

for side in [-1,1]:
    tag='L' if side<0 else 'R'
    for idx,(y,z) in enumerate([(-.05,.57),(.53,.43)]):
        for fiber in [-1,0,1]:
            offset=fiber*.021
            tendon('Walking tendon '+tag+str(idx)+str(fiber),
                [(side*.22,y+offset,z+.04),(side*.4,y-.13+offset,z-.08),
                 (side*.48,y+.03+offset,.27),(side*.45,y-.12+offset,.1)],
                [.006,.012,.01,.004],chains['Leg_'+tag+'_'+str(idx)])
    for fiber in [-1,0,1]:
        offset=fiber*.023
        tendon('Capture fibers '+tag+str(fiber),
            [(side*.23,-.3+offset,.755),(side*.44,-.42+offset,.6),
             (side*.51,-.69+offset,.36),(side*.665,-.99+offset,.21)],
            [.007,.014,.01,.004],chains['Capture_'+tag])
    for fiber in range(3):
        x=side*(.11+fiber*.018)
        tendon('Neck fibers '+tag+str(fiber),[(x,-.14,.72),(x,-.32,.83),(x*.85,-.49,.87)],
            [.007,.011,.004],['body','head'])
    for i in range(3):
        y=.04+i*.18
        tendon('Intercostal fibers '+tag+str(i),
            [(side*.12,y-.08,.47),(side*.225,y,.55),(side*.2,y+.11,.68-i*.04)],
            [.005,.01,.004],['body','mantle'])

# Join editable parts into a single skinned mesh with four materials.
bpy.ops.object.select_all(action='DESELECT')
for obj in parts: obj.select_set(True)
bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join()
body=bpy.context.object; body.name='StalkerBody'
body.parent=rig; modifier=body.modifiers.new('Creature skin','ARMATURE'); modifier.object=rig
for i in range(8):
    a=(i/7-.5)*math.pi
    socket=bpy.data.objects.new('socket.tentacle.'+str(i),None); col.objects.link(socket)
    socket.parent=rig; socket.parent_type='BONE'; socket.parent_bone='body'
    # Bone parenting uses the tail transform; compensate explicitly.
    desired=v((math.sin(a)*.29,-.19-math.cos(a)*.13,.57))
    socket.matrix_world=Matrix.Translation(desired)
    bpy.context.view_layer.update()

rig.animation_data_create()
for pb in rig.pose.bones: pb.rotation_mode='XYZ'
def reset():
    for pb in rig.pose.bones: pb.location=(0,0,0); pb.rotation_euler=(0,0,0); pb.scale=(1,1,1)
def key(frame):
    for pb in rig.pose.bones:
        if pb.name=='root': continue
        pb.keyframe_insert(data_path='location',frame=frame)
        pb.keyframe_insert(data_path='rotation_euler',frame=frame)
        pb.keyframe_insert(data_path='scale',frame=frame)
actions={}
stride=.4*S[1][1]
gait_duration=23/30
gait_speed=2*stride/gait_duration
gait_samples=[]

def aim_bone(n,head,tail):
    rest=armdata.bones[n]
    rotation=(rest.tail_local-rest.head_local).rotation_difference(tail-head)
    rig.pose.bones[n].matrix=Matrix.Translation(head) @ rotation.to_matrix().to_4x4() @ rest.matrix_local.to_3x3().to_4x4()
    bpy.context.view_layer.update()

def plant_leg(idx,phase,bob):
    names=['leg.'+str(idx)+'.'+s for s in ['a','b','c']]
    rest=[armdata.bones[n] for n in names]
    hip=rest[0].head_local.copy()+Vector((0,0,bob))
    foot=rest[2].tail_local.copy()
    if phase<.5:
        foot.y+=stride*(2*phase-.5)
    else:
        swing=(phase-.5)*2
        foot.y+=stride*.5*math.cos(math.pi*swing)
        foot.z+=.095*math.sin(math.pi*swing)**2
    # Keep the terminal foot segment's orientation fixed on the ground.
    ankle=foot-(rest[2].tail_local-rest[2].head_local)
    delta=ankle-hip; direction=delta.normalized()
    l1=rest[0].length; l2=rest[1].length
    distance=delta.length
    if not abs(l1-l2)+.0001<distance<l1+l2-.0001:
        raise ValueError('Unreachable foot target '+str(idx)+' '+str(phase))
    along=(l1*l1-l2*l2+distance*distance)/(2*distance)
    pole=rest[0].tail_local-rest[0].head_local
    pole=(pole-direction*pole.dot(direction)).normalized()
    knee=hip+direction*along+pole*math.sqrt(max(0,l1*l1-along*along))
    aim_bone(names[0],hip,knee); aim_bone(names[1],knee,ankle); aim_bone(names[2],ankle,foot)
    actual=rig.pose.bones[names[2]].tail.copy()
    gait_samples.append({'leg':idx,'phase':phase,'target':list(foot),'actual':list(actual),
                         'error':(actual-foot).length,'stance':phase<.5})

for name,length in [('idle',60),('move',24),('capture',30),('gulp',10),('hurt',10),('evolve',18)]:
    act=bpy.data.actions.new(name); act.use_fake_user=True; rig.animation_data.action=act; actions[name]=act
    for f in range(1,length+1):
        reset(); t=(f-1)/(length-1); s=math.sin(2*math.pi*t); pulse=math.sin(math.pi*t)**2
        b=rig.pose.bones['body']; h=rig.pose.bones['head']; jaw=rig.pose.bones['jaw']
        if name=='idle':
            b.location.y=.02*(1-math.cos(2*math.pi*t)); h.rotation_euler.x=.035*s
            rig.pose.bones['mantle'].rotation_euler.x=.025*s
            for i in range(4): rig.pose.bones['tail.'+str(i)].rotation_euler.z=.045*s
        elif name=='move':
            bob=.006*(1-math.cos(4*math.pi*t)); b.location.y=bob
            bpy.context.view_layer.update()
            for idx in range(4):
                phase=(t+(.5 if idx in [1,2] else 0))%1
                plant_leg(idx,phase,bob)
            for side in ['L','R']: rig.pose.bones['capture.'+side+'.0'].rotation_euler.x=.07*s
            for i in range(4): rig.pose.bones['tail.'+str(i)].rotation_euler.z=.05*s
        elif name=='capture':
            b.rotation_euler.x=.06*pulse; jaw.rotation_euler.x=.18*pulse
            for side in ['L','R']: rig.pose.bones['capture.'+side+'.1'].rotation_euler.x=-.12*pulse
        elif name=='gulp': b.scale=(1+.1*pulse,1-.08*pulse,1+.06*pulse); jaw.rotation_euler.x=-.1*pulse
        elif name=='hurt': b.rotation_euler.x=-.13*pulse; h.rotation_euler.x=.12*pulse
        elif name=='evolve':
            b.scale=(1+.15*pulse,1+.12*pulse,1+.15*pulse)
            rig.pose.bones['mantle'].rotation_euler.x=.14*pulse
        key(f)
    # Actions also live on muted NLA tracks so ACTIONS mode exports every clip.
    tr=rig.animation_data.nla_tracks.new(); tr.name=name; tr.mute=True
    tr.strips.new(name,1,act)
rig.animation_data.action=actions['idle']; scene.frame_set(1); reset(); bpy.context.view_layer.update()

bpy.ops.object.select_all(action='DESELECT')
for o in col.objects: o.select_set(True)
bpy.context.view_layer.objects.active=rig
dest=str(out/'creature_larval.glb')
rig['gaitSpeedMps']=gait_speed
bpy.ops.export_scene.gltf(filepath=dest,export_format='GLB',use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='ACTIONS',export_force_sampling=True,export_def_bones=True,export_extras=True)

body.data.calc_loop_triangles()
unweighted=sum(not vert.groups for vert in body.data.vertices)
report={'triangles':len(body.data.loop_triangles),'bones':len(armdata.bones),'materials':len(set(m.name for m in body.data.materials)),'unweighted_vertices':unweighted,'animations':list(actions),'sockets':8,'rigged':True,'stage':'hatchling','gait_speed_mps':gait_speed,'stride_m':stride,'gait_duration_s':gait_duration,'max_foot_target_error_m':max(s['error'] for s in gait_samples),'tentacles':'Game procedural capture tubes; two authored resting capture limbs remain on body.'}
(out/'rig-report.json').write_text(json.dumps(report,indent=2))
(out/'gait-samples.json').write_text(json.dumps(gait_samples,indent=2))

# Studio reused from the approved blockout for comparable lighting and camera.
studio=bpy.data.scenes['Stalker_Hatchling_Studio']; scene.world=studio.world
for original in studio.objects:
    if original.type in ['LIGHT','CAMERA']:
        copy=original.copy(); copy.data=original.data.copy(); scene.collection.objects.link(copy)
        if original.type=='CAMERA': scene.camera=copy
cam=scene.camera; cam.location=(2.8,-4.1,2.6); cam.rotation_euler=(Vector((0,-.12,.6))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.ortho_scale=3.5
scene.render.engine='CYCLES'; scene.cycles.samples=24
scene.render.resolution_x=900; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.render.filepath=str(out/'preview-rigged.png')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'tendon-stalker-rigged.blend'))
bpy.ops.render.render(write_still=True)
rig.animation_data.action=actions['move']; scene.frame_set(5)
scene.render.filepath=str(out/'preview-walk-pose.png'); bpy.ops.render.render(write_still=True)
rig.animation_data.action=actions['idle']; scene.frame_set(1)
print('Rigged hatchling exported: '+json.dumps(report))
