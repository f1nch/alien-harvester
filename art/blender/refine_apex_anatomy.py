"""Second separate Apex study: layered skull, shoulder roots, anatomical fibers.

Reuses the first study's bake/export pipeline, preserving both earlier variants.
"""
import bpy, math, json, sys
from types import SimpleNamespace
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'art/alien/tendon-stalker'
stage=sys.argv[sys.argv.index('--stage')+1] if '--stage' in sys.argv else 'apex'
assert stage in ('hatchling','juvenile','adult','apex')
OUT=BASE/'concept-study-v2/apex' if stage=='apex' else BASE/'lineage-study'/stage
features='--features' in sys.argv
if features:OUT=BASE/'feature-anatomy'/stage
OUT.mkdir(parents=True,exist_ok=True)
native='tendon-stalker-rigged.blend' if stage=='hatchling' else f'tendon-stalker-{stage}.blend'
sourcefile=BASE/'concept-study/apex/apex-concept-study.blend' if stage=='apex' else BASE/'organic'/stage/native
bpy.ops.wm.open_mainfile(filepath=str(sourcefile))
scene=bpy.context.scene; rig=bpy.data.objects['Creature']; rig.data.pose_position='REST'
scene.frame_set(1)
if stage=='apex':
    oldlow=bpy.data.objects['StalkerBody']; bpy.data.objects.remove(oldlow,do_unlink=True)
    high=bpy.data.objects['Apex anatomical sculpt']
else:
    high=bpy.data.objects['StalkerBody'];high.name='Apex anatomical sculpt'
    for modifier in list(high.modifiers):high.modifiers.remove(modifier)
high.hide_set(False); high.hide_render=False

def active(obj):
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True)
    bpy.context.view_layer.objects.active=obj

# Construct common anatomy in the same reference space, then return geometry
# to its stage's original proportions. The real skeleton and actions are never
# scaled or rewritten, so each original gait retains its bone bases and timing.
sx,sy,sz,lift={'hatchling':(1.45,.85,1.25,0),'juvenile':(1.6,.95,1.07,.45),'adult':(1.8,1.05,1.12,.9),'apex':(1.95,1.12,1.16,1.05)}[stage]
def to_template(point):
    p=Vector(point)
    if stage=='apex':return p
    z=p.z/sz
    if z>.08:z=(z+lift*.08)/(1+lift)
    return Vector((p.x*1.95/sx,p.y*1.12/sy,(z+1.05*max(0,z-.08))*1.16))
def from_template(point):
    p=Vector(point)
    if stage=='apex':return p
    z=p.z/1.16
    if z>.08:z=(z+1.05*.08)/2.05
    return Vector((p.x*sx/1.95,p.y*sy/1.12,(z+lift*max(0,z-.08))*sz))
work_bones={b.name:SimpleNamespace(name=b.name,head_local=to_template(b.head_local),tail_local=to_template(b.tail_local)) for b in rig.data.bones}
if stage!='apex':
    for vertex in high.data.vertices:vertex.co=to_template(vertex.co)
    active(high)
    sub=high.modifiers.new('Study sculpt density','SUBSURF');sub.levels=1;sub.render_levels=1
    bpy.ops.object.modifier_apply(modifier=sub.name)

# Keep exactly four intentional material slots. Archived material slots from
# previous source scenes must not influence new exports or shader generation.
used={p.material_index for p in high.data.polygons}
oldmats=list(high.data.materials)
names=['Tissue','Chitin','Hooks','Core']
mats=[]
for name in names:
    mat=bpy.data.materials.new('Anatomy_'+name); mat.use_nodes=True
    p=mat.node_tree.nodes.get('Principled BSDF')
    if name=='Core':
        p.inputs['Base Color'].default_value=(.06,.42,.25,1)
        p.inputs['Emission Color'].default_value=(.1,.8,.48,1)
        p.inputs['Emission Strength'].default_value=.65
    mats.append(mat)
mapping={i:next(k for k,name in enumerate(names) if name in oldmats[i].name) for i in used}
indices=[mapping[p.material_index] for p in high.data.polygons]
high.data.materials.clear()
for mat in mats: high.data.materials.append(mat)
for p,index in zip(high.data.polygons,indices):p.material_index=index
active(high)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
parts=[o for o in scene.objects if o.type=='MESH' and o.parent==rig and not o.hide_render]
shell=next(o for o in parts if o.data.materials[o.data.polygons[0].material_index]==mats[1])
active(shell)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
hooks=next(o for o in parts if o.data.materials[o.data.polygons[0].material_index]==mats[2])
active(hooks)
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE');bpy.ops.object.mode_set(mode='OBJECT')
parts=[o for o in scene.objects if o.type=='MESH' and o.parent==rig and not o.hide_render]
for obj in parts:
    if obj.data.materials[obj.data.polygons[0].material_index]!=mats[0]:continue
    for vertex in obj.data.vertices:
        if abs(vertex.co.x)<.30 and vertex.co.y<-.68 and .97<vertex.co.z<1.84:
            vertex.co.x*=.72
            vertex.co.y=-.78+(vertex.co.y+.8)*.9
            vertex.co.z=1.5+(vertex.co.z-1.5)*.7
for obj in list(parts):
    if obj.data.materials[obj.data.polygons[0].material_index]!=mats[1]:continue
    lo=Vector(tuple(min(v.co[i] for v in obj.data.vertices) for i in range(3)))
    hi=Vector(tuple(max(v.co[i] for v in obj.data.vertices) for i in range(3)))
    # Replace the broad facial shield and full-length arm strips. Preserve the
    # large head horns, low swept back pair, walking feet and tail spike.
    skull=lo.x<-.3 and hi.x>.3 and hi.y<-.35 and hi.z>2.3
    armstrip=lo.y<-1.2 and hi.z>1.5 and hi.z-lo.z>1
    cranial_horn=lo.z>1.95 and hi.z>2.7
    back_horn=lo.y>0 and hi.y>1.3 and hi.z>2
    floating_shoulder=lo.z>1.55 and hi.z<1.95 and hi.y<-.15
    chest_bar=lo.y>-.36 and hi.y<-.18 and lo.z>.98 and hi.z<1.55 and max(abs(lo.x),abs(hi.x))<.36
    if skull or armstrip or cranial_horn or back_horn or floating_shoulder or chest_bar:
        parts.remove(obj); bpy.data.objects.remove(obj,do_unlink=True)
    elif lo.z>1.2 and hi.z<2.05 and hi.y>-.35:
        # Seat small back plates in the body instead of leaving floating trim.
        for vertex in obj.data.vertices:vertex.co.x*=.93;vertex.co.z-=.065

# Remove the old rounded U-shaped jaw hooks; replace them below with sharp,
# tapered mandibles anchored inside the face rather than on its surface.
for obj in list(parts):
    if obj.data.materials[obj.data.polygons[0].material_index]!=mats[2]:continue
    lo=Vector(tuple(min(v.co[i] for v in obj.data.vertices) for i in range(3)))
    hi=Vector(tuple(max(v.co[i] for v in obj.data.vertices) for i in range(3)))
    old_jaw=lo.z>.9 and hi.z<1.7 and hi.y<-.5
    old_front_claw=hi.z<.8 and hi.y<-1.25
    if old_jaw or old_front_claw:
        parts.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)

def meshpart(name,vertices,faces,material,weights):
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vertices,[],faces); mesh.materials.append(material)
    obj=bpy.data.objects.new(name,mesh); scene.collection.objects.link(obj); obj.parent=rig
    for bone,weight in weights.items():
        obj.vertex_groups.new(name=bone).add(list(range(len(vertices))),weight,'REPLACE')
    for p in mesh.polygons:p.use_smooth=True
    parts.append(obj)
    return obj

def sample(points,t):
    """Catmull-Rom interpolation, with safe duplicated endpoints."""
    t=max(0,min(.999999,t)); pos=t*(len(points)-1); i=int(pos); f=pos-i
    p0=Vector(points[max(0,i-1)]);p1=Vector(points[i]);p2=Vector(points[min(len(points)-1,i+1)]);p3=Vector(points[min(len(points)-1,i+2)])
    return .5*((2*p1)+(-p0+p2)*f+(2*p0-5*p1+4*p2-p3)*f*f+(-p0+3*p1-3*p2+p3)*f*f*f)

def tube(name,points,radii,material,weights,flatten=1,sides=12,rings=22):
    vertices=[];faces=[]
    for i in range(rings):
        t=i/(rings-1); center=sample(points,t)
        tangent=(sample(points,min(1,t+.002))-sample(points,max(0,t-.002))).normalized()
        axis=tangent.cross(Vector((0,0,1)))
        if axis.length<.01:axis=tangent.cross(Vector((0,1,0)))
        axis.normalize(); other=tangent.cross(axis).normalized()
        pos=t*(len(radii)-1);n=min(len(radii)-2,int(pos));f=pos-n;r=radii[n]*(1-f)+radii[n+1]*f
        for j in range(sides):
            angle=math.tau*j/sides
            vertices.append(center+r*(axis*math.cos(angle)+other*flatten*math.sin(angle)))
    for i in range(rings-1):
        for j in range(sides):
            a=i*sides+j;b=i*sides+(j+1)%sides;faces.append((a,b,b+sides,a+sides))
    faces.extend([tuple(reversed(range(sides))),tuple((rings-1)*sides+j for j in range(sides))])
    return meshpart(name,vertices,faces,material,weights)

profile=[(.0,-1.08,1.45,.009),(.22,-.985,1.67,.20),(.52,-.80,1.99,.43),(.78,-.61,2.23,.32),(1,-.43,2.42,.045)]
def envelope(t):
    for i in range(len(profile)-1):
        a,b=profile[i],profile[i+1]
        if t<=b[0]:
            f=(t-a[0])/(b[0]-a[0]); return tuple(a[k]*(1-f)+b[k]*f for k in (1,2,3))
    return profile[-1][1:]

def faceplate(side,start,end,name,flare=1,offset=0):
    # Two convex shell surfaces closed around their edges. A narrow front lip
    # and inset root make the pieces read as overlapping armor with thickness.
    vertices=[]; faces=[]; rows=23; columns=13
    for back in (False,True):
        for i in range(rows):
            t=start+(end-start)*i/(rows-1); y,z,width=envelope(t)
            for j in range(columns):
                u=j/(columns-1)
                x=side*(.018+(width*flare-.018)*u)
                arch=.095*math.sin(math.pi*u)*math.sin(math.pi*i/(rows-1))
                # Scallop the free edge gently rather than adding extra spikes.
                rim=.012*math.sin(5*math.pi*t)**2*u**6
                front=y+offset-arch+.10*u*u
                surface=front+(.052 if back else 0)+rim
                vertices.append((x,surface,z-.035*u*u))
    stride=rows*columns
    for layer in range(2):
        for i in range(rows-1):
            for j in range(columns-1):
                a=layer*stride+i*columns+j; face=(a,a+1,a+columns+1,a+columns)
                faces.append(tuple(reversed(face)) if layer else face)
    border=list(range(columns))+[i*columns+columns-1 for i in range(1,rows)]+[(rows-1)*columns+j for j in range(columns-2,-1,-1)]+[i*columns for i in range(rows-2,0,-1)]
    for a,b in zip(border,border[1:]+border[:1]):faces.append((a,b,b+stride,a+stride))
    if side<0:faces=[tuple(reversed(face)) for face in faces]
    return meshpart(name,vertices,faces,mats[1],{'head':1})

for side in (-1,1):
    faceplate(side,0,1,'Paired facial shield '+str(side))
    # Short overlapping temporal plates sit above the broad mask; exposed
    # boundaries create readable seams without increasing the crown clutter.
    faceplate(side,.43,.80,'Overlapping temple '+str(side),flare=1.16,offset=-.035)
    tube('Recessed brow rim '+str(side),[(side*.15,-1.005,1.74),(side*.31,-.90,1.87),(side*.45,-.72,2.06)], [.018,.027,.006],mats[1],{'head':1},flatten=.7)
    # Short clavicle-to-shoulder guards replace the straight arm-length armor.
    bone=work_bones['capture.'+('L' if side<0 else 'R')+'.0']
    a=bone.head_local; b=bone.tail_local
    # Deep shoulder roots bridge torso and upper arm. Ends overlap both
    # volumes; the tissue is fused below, so these are not ornamental strips.
    tube('Connected shoulder muscle '+str(side),[(side*.12,-.18,1.43),a,a.lerp(b,.43)],[.21,.24,.17],mats[0],{'body':.25,bone.name:.75},flatten=.8)
    tube('Shoulder root plate '+str(side),[a+Vector((0,.025,.14)),a.lerp(b,.35)+Vector((side*.015,0,.15)),a.lerp(b,.76)+Vector((side*.035,0,.065))],[.12,.145,.025],mats[1],{bone.name:1},flatten=.28,sides=12)
    if stage=='apex':
        tube('Rooted cranial blade '+str(side),[(side*.23,-.75,2.04),(side*.32,-.52,2.08),(side*.47,-.27,2.58),(side*.60,.02,2.82),(side*.66,.28,2.61)],[.095,.14,.11,.055,.0005],mats[1],{'head':1},flatten=.34,sides=12,rings=34)
        tube('Rooted low mantle blade '+str(side),[(side*.22,.10,1.45),(side*.37,.035,1.62),(side*.76,.36,2.0),(side*1.13,.88,2.21),(side*1.25,1.38,1.74)],[.15,.25,.26,.14,.0005],mats[1],{'mantle':.8,'body':.2},flatten=.28,sides=12,rings=36)
    tube('Predatory mandible '+str(side),[(side*.20,-.73,1.53),(side*.33,-.89,1.33),(side*.25,-1.05,1.12),(side*.10,-1.10,1.29)],[.085,.075,.038,.0005],mats[2],{'jaw':1},flatten=.55,sides=12,rings=28)
    # Reinforce the wrist-to-claw transition with a compact bone cuff.
    bn='capture.'+('L' if side<0 else 'R')+'.2'; bone=work_bones[bn]
    a=bone.head_local;b=bone.tail_local
    if features:
        growth={'hatchling':.52,'juvenile':.72,'adult':.94,'apex':1.16}[stage]
        root=Vector((side*1.2675,-1.31,.2355))
        def digit(points):return [root+Vector((side*x*growth,y*growth,z*growth)) for x,y,z in points]
        # A stout chela palm overlaps the wrist and both finger roots. The
        # opposing fingers curve toward a shared bite, with an open gap.
        tube('Scorpion chela palm '+str(side),[a.lerp(b,.76),b,root,root+Vector((0,-.18*growth,.035*growth))],[.085,.12*growth,.19*growth,.17*growth],mats[2],{bn:1},flatten=.72,sides=16,rings=18)
        tube('Fixed scorpion finger '+str(side),digit([(.10,-.10,.02),(.24,-.28,.04),(.27,-.52,.09),(.14,-.72,.16),(.015,-.77,.19)]),[r*growth for r in (.15,.14,.105,.055,.001)],mats[2],{bn:1},flatten=.85,sides=12,rings=28)
        tube('Opposing scorpion finger '+str(side),digit([(-.10,-.11,.04),(-.24,-.27,.10),(-.23,-.49,.17),(-.12,-.65,.21),(-.045,-.69,.20)]),[r*growth for r in (.13,.125,.085,.045,.001)],mats[2],{bn:1},flatten=.85,sides=12,rings=28)
    else:
        tube('Rooted claw knuckle '+str(side),[a.lerp(b,.83),a.lerp(b,.94),b],[.075,.105,.09],mats[2],{bn:1},flatten=.8,sides=12,rings=14)
        tube('Primary raptorial claw '+str(side),[(side*1.2675,-1.31,.2355),(side*1.43,-1.47,.16),(side*1.30,-1.70,.16),(side*.92,-1.72,.40)],[.095,.08,.045,.0005],mats[2],{bn:1},flatten=.5,sides=12,rings=28)
        tube('Opposing raptorial digit '+str(side),[(side*1.2675,-1.31,.2355),(side*1.18,-1.43,.36),(side*1.04,-1.59,.53)],[.065,.04,.0005],mats[2],{bn:1},flatten=.55,sides=12,rings=24)

# Fuse the new shoulder roots into the old tissue and transfer spatial weights
# from the pre-fusion surface. No separately floating tendon decoration remains.
tube('Continuous throat and neck',[(0,-.29,1.51),(0,-.51,1.55),(0,-.76,1.49)],[.26,.24,.19],mats[0],{'body':.15,'head':.85},flatten=.85,sides=16,rings=22)
for index in range(4):
    bone=work_bones[f'leg.{index}.a'];side=-1 if index<2 else 1
    torso=Vector((side*.12,bone.head_local.y+.025,bone.head_local.z+.08))
    tube('Continuous hip '+str(index),[torso,bone.head_local,bone.head_local.lerp(bone.tail_local,.45)],[.19,.19,.12],mats[0],{'body':.45,bone.name:.55},flatten=.85,sides=12,rings=18)
tailbones=[work_bones[f'tail.{i}'] for i in range(4)]
tail=tube('Continuous tail tendons',[tailbones[0].head_local]+[b.tail_local for b in tailbones],[.12,.105,.08,.063,.035],mats[0],{b.name:.25 for b in tailbones},flatten=1,sides=12,rings=46)
for vertex in tail.data.vertices:
    distances=[]
    for bone in tailbones:
        delta=bone.tail_local-bone.head_local;t=max(0,min(1,(vertex.co-bone.head_local).dot(delta)/delta.length_squared))
        distances.append(((vertex.co-bone.head_local-delta*t).length,bone.name))
    ranked=sorted(distances)[:2];weights=[1/(d+.025)**4 for d,name in ranked];total=sum(weights)
    for group in tail.vertex_groups:group.remove([vertex.index])
    for (distance,name),weight in zip(ranked,weights):tail.vertex_groups[name].add([vertex.index],weight/total,'REPLACE')
tissues=[o for o in parts if o.data.materials[o.data.polygons[0].material_index]==mats[0]]
parts=[o for o in parts if o not in tissues]
active(tissues[0])
for obj in tissues:obj.select_set(True)
bpy.ops.object.join();flesh=bpy.context.object
parts.append(flesh)
reference=flesh.copy();reference.data=flesh.data.copy();scene.collection.objects.link(reference)
reference.hide_render=True
remesh=flesh.modifiers.new('Continuous shoulder anatomy','REMESH');remesh.mode='VOXEL';remesh.voxel_size=.019;remesh.use_smooth_shade=True
bpy.ops.object.modifier_apply(modifier=remesh.name)
smooth=flesh.modifiers.new('Shoulder insertion smoothing','SMOOTH');smooth.factor=.45;smooth.iterations=3
bpy.ops.object.modifier_apply(modifier=smooth.name)
flesh.vertex_groups.clear()
transfer=flesh.modifiers.new('Preserve connected tissue weights','DATA_TRANSFER');transfer.object=reference
transfer.use_vert_data=True;transfer.data_types_verts={'VGROUP_WEIGHTS'};transfer.vert_mapping='POLYINTERP_NEAREST'
bpy.ops.object.datalayout_transfer(modifier=transfer.name);bpy.ops.object.modifier_apply(modifier=transfer.name)
bpy.ops.object.vertex_group_limit_total(limit=4);bpy.ops.object.vertex_group_normalize_all(lock_active=False)
bpy.data.objects.remove(reference,do_unlink=True)

# Replace the floating geometric lightning seam with a narrow center seam
# conforming to the new facial envelope. Keep the existing sensory eye slits.
coreparts=[o for o in parts if o.data.materials[o.data.polygons[0].material_index]==mats[3]]
for obj in coreparts:
    active(obj)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts=[o for o in scene.objects if o.type=='MESH' and o.parent==rig and not o.hide_render]
for obj in list(parts):
    if obj.data.materials[obj.data.polygons[0].material_index]!=mats[3]:continue
    # Concept lighting is confined to the face; the old chest bars and the
    # old head slits belong to the earlier topology and can float above it.
    parts.remove(obj);bpy.data.objects.remove(obj,do_unlink=True)
tube('Inset mint facial seam',[(0,envelope(t)[0]-.007,envelope(t)[1]) for t in (.18,.4,.65,.90)], [.006,.009,.009,.003],mats[3],{'head':1},flatten=.35,sides=8)
for side in (-1,1):
    if features:
        eye_t,eye_u={'hatchling':(.065,.12),'juvenile':(.085,.18),'adult':(.105,.24),'apex':(.13,.30)}[stage]
        def eye_surface(t,u,bulge=0):
            y,z,width=envelope(t)
            return (side*(.018+(width-.018)*u),y-.095*math.sin(math.pi*u)*math.sin(math.pi*t)+.10*u*u-.018-bulge,z-.035*u*u)
        vertices=[eye_surface(.38,.73,.028)];faces=[];rings=8;segments=24
        for ring in range(1,rings+1):
            r=ring/rings
            for j in range(segments):
                angle=math.tau*j/segments
                vertices.append(eye_surface(.38+eye_t*r*math.sin(angle),.73+eye_u*r*math.cos(angle),.028*(1-r*r)))
        for j in range(segments):faces.append((0,1+j,1+(j+1)%segments))
        for ring in range(rings-1):
            for j in range(segments):
                a=1+ring*segments+j;b=1+ring*segments+(j+1)%segments
                faces.append((a,a+segments,b+segments,b))
        eye=meshpart('Growing sensory eye '+str(side),vertices,faces,mats[3],{'head':1})
        contour=[eye_surface(.38+eye_t*math.sin(math.tau*j/32),.73+eye_u*math.cos(math.tau*j/32)) for j in range(33)]
        tube('Seated eye socket '+str(side),contour,[.012,.012],mats[1],{'head':1},sides=8,rings=65)
        continue
    points=[]
    for t in (.31,.36,.41):
        y,z,width=envelope(t);u=.92
        points.append((side*(.018+(width-.018)*u),y-.095*math.sin(math.pi*u)*math.sin(math.pi*t)+.10*u*u-.012,z-.035*u*u))
    tube('Recessed sensory slit '+str(side),points,[.004,.008,.004],mats[3],{'head':1},flatten=.4,sides=8,rings=14)

active(parts[0])
for obj in parts:obj.select_set(True)
bpy.ops.object.join();high=bpy.context.object;high.name='Apex anatomical sculpt'
high.data.validate(clean_customdata=False)
active(high)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode='OBJECT')
for face in high.data.polygons:face.use_smooth=True
# Per-vertex anatomical coordinates make shader fibers follow each limb.
high.data.attributes.new('anatomy',type='FLOAT_VECTOR',domain='POINT')
high.data.attributes.new('tissueShade',type='FLOAT',domain='POINT')
# Adding a custom-data layer can invalidate existing RNA layer handles. Fetch
# both only after allocation, before writing any values into either layer.
attribute=high.data.attributes['anatomy']
shade=high.data.attributes['tissueShade']
segments=[b for b in work_bones.values() if b.name.startswith(('capture.','leg.','tail.'))]
for vertex in high.data.vertices:
    # Dark recessed mouth instead of a large bright tongue-like oval.
    shade.data[vertex.index].value=.25 if abs(vertex.co.x)<.30 and vertex.co.y<-.69 and .95<vertex.co.z<1.82 else 1
    best=None
    for index,bone in enumerate(segments):
        delta=bone.tail_local-bone.head_local
        t=max(0,min(1,(vertex.co-bone.head_local).dot(delta)/delta.length_squared))
        radial=vertex.co-(bone.head_local+delta*t)
        if best is None or radial.length<best[0]:best=(radial.length,index,bone,t,radial)
    distance,index,bone,t,radial=best
    axis=(bone.tail_local-bone.head_local).normalized();u=axis.cross(Vector((0,1,0)))
    if u.length<.01:u=axis.cross(Vector((1,0,0)))
    u.normalize();w=axis.cross(u).normalized()
    attribute.data[vertex.index].vector=(math.atan2(radial.dot(w),radial.dot(u))/math.tau+.5,t,index*.17)
high.data.calc_loop_triangles();high_triangles=len(high.data.loop_triangles)
import bmesh
check=bmesh.new();check.from_mesh(high.data)
zero_area=sum(face.calc_area()<1e-12 for face in check.faces);check.free()
assert zero_area<16,('Unexpected degenerate sculpt faces',zero_area)
if stage!='apex':
    for vertex in high.data.vertices:vertex.co=from_template(vertex.co)
    high.data.update()
STUDY_TRIANGLE_BUDGET=8000 if stage=='hatchling' else 12000
STUDY_TRIANGLE_TARGET=7600 if stage=='hatchling' else 11600
STUDY_BLEND_NAME='apex-concept-study.blend' if stage=='apex' else 'creature-study.blend'
if features:STUDY_BLEND_NAME='creature-study.blend'
STUDY_EXPORT_NAME={'hatchling':'creature_larval.glb','juvenile':'creature_evolved.glb','adult':'creature_adult.glb','apex':'creature_apex.glb'}[stage]

# Keep the existing, measured bake/export implementation in one place. Adapt
# its material inputs, not its validation contract or runtime source assets.
source=(ROOT/'art/blender/sculpt_apex_study.py').read_text()
marker='# Material detail follows the new sculpt; exported maps bake this high surface.'
assert source.count(marker)==1
tail=source.split(marker,1)[1]
tail=tail.replace("(.12,.052,.075,1),'shell':(.24,.215,.25,1),'bone':(.64,.56,.4,1)","(.085,.029,.046,1),'shell':(.12,.106,.126,1),'bone':(.49,.41,.29,1)")
tail=tail.replace("coords=nodes.new('ShaderNodeTexCoord')", "coords=nodes.new('ShaderNodeTexCoord')\n    if kind=='tissue':\n        coords=nodes.new('ShaderNodeAttribute'); coords.attribute_name='anatomy'")
tail=tail.replace("(110,110,17) if kind=='tissue'", "(54,3,4) if kind=='tissue'")
tail=tail.replace("coords.outputs['Generated']", "coords.outputs['Vector'] if kind=='tissue' else coords.outputs['Generated']")
tail=tail.replace("(.65,1.3)","(.40,1.55)")
tail=tail.replace("links.new(noise.outputs['Fac'],bump.inputs['Height'])", """if kind=='tissue':
        shade=nodes.new('ShaderNodeAttribute'); shade.attribute_name='tissueShade'
        mix=nodes.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1
        links.new(ramp.outputs[0],mix.inputs[1]);links.new(shade.outputs['Fac'],mix.inputs[2]);links.new(mix.outputs[0],p.inputs['Base Color'])
    links.new(noise.outputs['Fac'],bump.inputs['Height'])""")
tail=tail.replace("decimate.ratio=min(1,11200/high_triangles)","decimate.ratio=min(1,11600/high_triangles)")
tail=tail.replace("'separate Apex concept study; not installed in game'","'second Apex anatomy study; not installed in game'")
# Match the concept's lower three-quarter camera for native comparisons.
scene.camera.location=(3.4,-5.8,3.0)
focus=Vector((0,-.1,1.25));scene.camera.rotation_euler=(focus-scene.camera.location).to_track_quat('-Z','Y').to_euler()
if stage!='apex':
    focus=Vector((0,-.05,max(v.co.z for v in high.data.vertices)*.45))
    scene.camera.rotation_euler=(focus-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.camera.data.ortho_scale=4.6
exec(compile(tail,'apex_v2_bake_export','exec'),globals())
if features:
    report=json.loads((OUT/'study-report.json').read_text())
    report.update({'status':'progressive eyes and scorpion pincers; local study','stage':stage,
        'eye_template_radii':{'hatchling':[.065,.12],'juvenile':[.085,.18],'adult':[.105,.24],'apex':[.13,.30]}[stage],
        'pincer_growth':{'hatchling':.52,'juvenile':.72,'adult':.94,'apex':1.16}[stage]})
    (OUT/'study-report.json').write_text(json.dumps(report,indent=2))
