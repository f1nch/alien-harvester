"""Assemble native Blender motion frames into a labeled review sheet."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2] / 'art/alien/tendon-stalker/refined'
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 23)
small = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 17)
stages = ['hatchling','juvenile','adult','apex']
frames = []
for frame in range(24):
    sheet = Image.new('RGB',(840,1000),'#192128')
    draw = ImageDraw.Draw(sheet)
    draw.text((24,15),'TENDON STALKER / REFINED LINEAGE',font=font,fill='#dcf4e8')
    draw.text((24,48),'Smoother gait · softer tissue · simplified Apex',font=small,fill='#a3bdb1')
    for i,stage in enumerate(stages):
        x = 10+(i%2)*420; y = 85+(i//2)*450
        image = Image.open(root/stage/'motion-frames'/f'{frame:02}.png').convert('RGB')
        sheet.paste(image,(x,y))
        draw.text((x+14,y+403),stage.capitalize(),font=font,fill='#dcf4e8')
    frames.append(sheet)
frames[0].save(root/'lineage-review.png')
# Share one palette across frames to avoid frame-to-frame color flicker.
palette = frames[0].quantize(colors=192)
indexed = [frame.quantize(palette=palette,dither=Image.Dither.NONE) for frame in frames]
indexed[0].save(root/'lineage-motion.gif',save_all=True,append_images=indexed[1:],duration=32,loop=0,optimize=False)
print(root/'lineage-motion.gif')
