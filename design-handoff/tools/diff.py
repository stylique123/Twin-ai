# python3 -I diff.py board.png app.png out.png  -> prints % of pixels that differ
import sys
from PIL import Image, ImageChops, ImageDraw
a=Image.open(sys.argv[1]).convert('RGB'); b=Image.open(sys.argv[2]).convert('RGB')
W=max(a.width,b.width); H=max(a.height,b.height)
A=Image.new('RGB',(W,H),(255,0,255)); A.paste(a,(0,0)); B=Image.new('RGB',(W,H),(255,0,255)); B.paste(b,(0,0))
d=ImageChops.difference(A,B).convert('L')
mask=d.point(lambda v:255 if v>24 else 0)
n=sum(1 for v in mask.get_flattened_data() if v); pct=100*n/(W*H)
heat=Image.composite(Image.new('RGB',(W,H),(255,40,90)),A.point(lambda v:v//3),mask)
lab=28; out=Image.new('RGB',(W*3+40,H+lab),(30,30,34)); dr=ImageDraw.Draw(out)
for i,(img,t) in enumerate([(A,'Board'),(B,'App'),(heat,'Difference %.2f%%'%pct)]):
  out.paste(img,(i*(W+20),lab)); dr.text((i*(W+20)+6,7),t,fill=(240,240,240))
out.save(sys.argv[3]); print('%s %.2f%% (%dx%d vs %dx%d)'%(sys.argv[3].split('/')[-1],pct,a.width,a.height,b.width,b.height))
