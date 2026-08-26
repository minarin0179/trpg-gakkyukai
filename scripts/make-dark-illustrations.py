"""ライト用イラストからダークテーマ用を生成する。

- 無彩色(線・白塗り・グレー)は輝度を反転(黒線→明るい線、白塗り→暗い塗り)
- 黄色アクセントは色をそのまま維持(反転させると濁るため)
- アルファは保持(アンチエイリアスが崩れない)
"""

import colorsys
import os
from PIL import Image

SRC = "public/illustrations"

for name in sorted(os.listdir(SRC)):
    if not name.endswith(".png") or name.endswith("-dark.png"):
        continue
    img = Image.open(os.path.join(SRC, name)).convert("RGBA")
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if s > 0.25 and 0.08 < h < 0.20:  # 黄色系アクセントは維持
                continue
            inv = 1.0 - l
            # 真っ白な線にせず、ほんの少し暖色寄りのオフホワイトに
            nr = int(inv * 235)
            ng = int(inv * 231)
            nb = int(inv * 224)
            px[x, y] = (nr, ng, nb, a)
    out = name.replace(".png", "-dark.png")
    img.save(os.path.join(SRC, out))
    print(out)
