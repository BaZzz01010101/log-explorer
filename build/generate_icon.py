"""Generate checked-in platform icon assets from the app's simple vector geometry.

Requires Pillow only when regenerating; ordinary desktop builds use the assets.
"""
from pathlib import Path
from PIL import Image, ImageDraw

destination = Path(__file__).resolve().parent
scale = 4
image = Image.new('RGBA', (512 * scale, 512 * scale))
draw = ImageDraw.Draw(image)
def box(values):
    return tuple(int(value * scale) for value in values)
draw.rounded_rectangle(box((0, 0, 511, 511)), radius=112 * scale, fill='#172238')
cloud = '#718cf0'
draw.ellipse(box((78, 119, 237, 278)), fill=cloud)
draw.ellipse(box((158, 46, 361, 249)), fill=cloud)
draw.ellipse(box((279, 114, 443, 279)), fill=cloud)
draw.rectangle(box((155, 169, 362, 279)), fill=cloud)
draw.rounded_rectangle(box((144, 324, 368, 349)), radius=12 * scale, fill='#d6dfff')
draw.rounded_rectangle(box((144, 373, 312, 398)), radius=12 * scale, fill='#d6dfff')
image = image.resize((512, 512), Image.Resampling.LANCZOS)
image.save(destination / 'icon.png')
image.save(destination / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('Generated icon.png and icon.ico')
