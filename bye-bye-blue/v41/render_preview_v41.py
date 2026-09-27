import sys,subprocess,json
from pathlib import Path
from PIL import Image
import render_preview_v38 as base
P=Path(__file__).resolve().parent
base.CUTS=json.loads((P/'revised/cuts-v39.json').read_text());base.starts=[c['start'] for c in base.CUTS]
base.LYRICS=json.loads((P/'revised/timing-v39.json').read_text())
W,H,FPS=960,540,30

def render(a,b,out):
 frames=round((b-a)*FPS)
 node=subprocess.Popen(['node','jizura_overlay_v41.js',str(W),str(H),str(a),str(b)],cwd=P,stdout=subprocess.PIPE)
 ff=subprocess.Popen(['ffmpeg','-y','-hide_banner','-loglevel','error','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}','-framerate','30','-i','-','-ss',str(a),'-t',str(b-a),'-i',str(P/'downloads/bye bye BLUE-2.mp3'),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-shortest','-movflags','+faststart',str(out)],stdin=subprocess.PIPE)
 for i in range(frames):
  t=a+i/FPS;bg,cut=base.frame(t);raw=node.stdout.read(W*H*4)
  if len(raw)!=W*H*4:raise RuntimeError('overlay stream ended at '+str(t))
  overlay=Image.frombytes('RGBA',(W,H),raw);im=Image.alpha_composite(bg.convert('RGBA'),overlay).convert('RGB')
  ff.stdin.write(im.tobytes())
  if i%300==0:print(f'{a}-{b}: {t:.1f}',flush=True)
 ff.stdin.close();node.stdout.close()
 if ff.wait() or node.wait():raise RuntimeError('encoder or overlay failed')
 print(out,flush=True)
if __name__=='__main__':
 for a,b in [(55,80)]:render(a,b,P/'revised'/f'ByeByeBLUE_v41_text_preview_{a}-{b}_540p.mp4')
