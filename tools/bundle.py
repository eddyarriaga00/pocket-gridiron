"""Build pocket-gridiron.html: the whole game inlined into one file (no doctype), for hosts that want a single page.
The commentators' clips (audio/vo.pack and audio/vo/*.pack) go in too, as base64 text, since one file cannot fetch another.
Run: python3 tools/bundle.py"""
import base64
import os
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
rd = lambda p: open(os.path.join(root, p), encoding='utf-8').read()
import json
vo = rd('js/vo.js')
PACKS = [(n, v[0]) for n, v in json.loads(vo[vo.index('{'):vo.rindex('}') + 1])['packs'].items()]  # the common pack and one for each team
out = ('<title>Pocket Gridiron</title>\n'
       '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap">\n'
       '<style>\n' + rd('css/game.css') + '</style>\n<div id="app"></div>\n'
       '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.159.0/three.min.js"></script>\n' +
       ''.join('<script>\n' + rd(f) + '</script>\n' for f in ('js/data.js', 'js/vo.js', 'js/game.js', 'js/shaders.js', 'js/render3d.js', 'js/audio.js', 'js/league.js', 'js/media.js', 'js/career.js', 'js/season.js', 'js/camp.js', 'js/milestones.js', 'js/online.js')) +
       '<script>PG.VO.b64 = {' + ','.join('"%s":"%s"' % (n, base64.b64encode(open(os.path.join(root, f), 'rb').read()).decode('ascii')) for n, f in PACKS) + '};</script>\n'
       '<script>PG.boot();</script>\n')
open(os.path.join(root, 'pocket-gridiron.html'), 'w', encoding='utf-8').write(out)
print('wrote pocket-gridiron.html', len(out), 'bytes')
