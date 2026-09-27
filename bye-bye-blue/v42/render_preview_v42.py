import sys,subprocess,json,bisect
from pathlib import Path
from PIL import Image,ImageEnhance
import render_preview_v38 as base
P=Path(__file__).resolve().parent
base.CUTS=json.loads((P/'revised/cuts-v39.json').read_text());base.starts=[c['start'] for c in base.CUTS]
base.LYRICS=json.loads((P/'revised/timing-v39.json').read_text())
W,H,FPS=960,540,30

def smooth_frame(t):
 ci=max(0,bisect.bisect_right(base.starts,t)-1);cut=base.CUTS[ci]
 im=base.IMAGES['window_evening'] if cut['cut']==16 else base.IMAGES[cut['source_id']]
 dur=max(.1,cut['end']-cut['start']);u=max(0,min(1,(t-cut['start'])/dur))
 span=0 if dur<3 or 160.10<=t<177.70 else min(dur*1.2,W*.012)
 cw,ch=W*1.025,H*1.025
 dx=(im.width-cw)/2+(u-.5)*span
 dy=(im.height-ch)/2
 bg=im.transform((W,H),Image.Transform.EXTENT,(dx,dy,dx+cw,dy+ch),Image.Resampling.BILINEAR)
 if cut['cut']==39:
  bg=ImageEnhance.Color(bg).enhance(.66)
  bg=Image.blend(bg,Image.new('RGB',(W,H),'white'),.10)
 return bg,cut

def render(a,b,out):
 frames=round((b-a)*FPS)
 node=subprocess.Popen(['node','jizura_overlay_v42.js',str(W),str(H),str(a),str(b)],cwd=P,stdout=subprocess.PIPE)
 ff=subprocess.Popen(['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate','30','-i','-','-ss',str(a),'-t',str(b-a),'-i',str(P/'downloads/bye bye BLUE-2.mp3'),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
 for i in range(frames):
  t=a+i/FPS;bg,cut=smooth_frame(t);raw=node.stdout.read(W*H*4)
  if len(raw)!=W*H*4:raise RuntimeError('overlay stream ended at '+str(t))
  overlay=Image.frombytes('RGBA',(W,H),raw);im=Image.alpha_composite(bg.convert('RGBA'),overlay).convert('RGB')
  ff.stdin.write(im.tobytes())
  if i%300==0:print(f'{a}-{b}: {t:.1f}',flush=True)
 ff.stdin.close();node.stdout.close()
 if ff.wait() or node.wait():raise RuntimeError('encoder or overlay failed')
 print(out,flush=True)
if __name__=='__main__':
 for a,b in [(55,80)]:render(a,b,P/'revised'/f'ByeByeBLUE_v42_motion_timing_{a}-{b}_540p.mp4')

