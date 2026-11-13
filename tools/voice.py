"""Record the broadcast booth: every line in tools/commentary.json, spoken by an open speech model on this machine.

Nothing here is downloaded at run time. It needs, once:
  python3.12 -m venv .voice/venv && .voice/venv/bin/pip install kokoro-onnx==0.6.1
  the model files kokoro-v1.0.onnx and voices-v1.0.bin (github.com/thewh1teagle/kokoro-onnx, release model-files-v1.0;
  the Kokoro-82M weights are Apache 2.0) in .voice/model/
and macOS for afconvert, which encodes the clips. The .voice folder is not part of the repository.

Run:  .voice/venv/bin/python -I tools/voice.py            record what is new or changed, then rebuild the pack
      .voice/venv/bin/python -I tools/voice.py --force    record everything again
      .voice/venv/bin/python -I tools/voice.py --reel     also write .voice/booth-sample.m4a, a minute of both voices

What it does to each line after the model has spoken it:
  trims the silence at both ends;
  for the worked-up calls (effort over 0.4) plays it up to 7% faster and higher, tips the spectrum toward the top the
  way a raised voice does, and makes it louder: the model itself has no "shout", so this is where the lift comes from;
  cuts the rumble (under 85 Hz, higher for a deep voice), evens the level with a compressor, sets the loudness (calm lines about -21 dB RMS, the
  biggest calls about -17), and holds the peaks under full scale;
  encodes it as 40 kbit/s AAC (a couple of seconds is about 10 kB).
The one- and two-word shouts ("Touchdown!") are spoken slower before all that, so the word is held the way a real
call holds it. Each clip is then checked against its words: the syllables that can be counted in the sound against
the syllables in the text, to catch a line the model swallowed part of.
The clips are kept one by one in .voice/clips/ so a later run only records what changed. What the game loads is
audio/vo.pack, all of them end to end in one file, and js/vo.js, the index: for every call, its clips as
[id, offset in the pack, bytes, seconds], and the words of each clip."""
import hashlib
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import wave

import numpy as np
from kokoro_onnx import Kokoro

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
MODEL = os.path.join(ROOT, '.voice', 'model')
CLIPS = os.path.join(ROOT, '.voice', 'clips')
SR = 24000
MASTER = 3  # raise this when the processing below changes, so every clip is made again


def trim(x, sr, floor=0.012):
    """drop the silence at both ends, keeping a breath of it"""
    n = int(sr * 0.01)
    env = np.sqrt(np.convolve(x * x, np.ones(n) / n, 'same'))
    on = np.nonzero(env > floor)[0]
    if not len(on):
        return x
    return x[max(0, on[0] - int(sr * 0.015)):min(len(x), on[-1] + int(sr * 0.07))]


def resample(x, r):
    """play it r times as fast: shorter and higher together, as an excited voice is. Done on the spectrum, so
    nothing above the new top frequency folds back."""
    if abs(r - 1) < 1e-3:
        return x
    n = int(len(x) / r)
    return (np.fft.irfft(np.fft.rfft(x), n) * (n / len(x))).astype(np.float32)


def shape(x, sr, low=85.0, shelf_hz=2000.0, shelf_db=0.0):
    """a second-order high-pass at `low`, and the top of the spectrum up by shelf_db: a raised voice has more of it"""
    pad = int(sr * 0.05)
    X = np.fft.rfft(np.concatenate([x, np.zeros(pad, dtype=x.dtype)]))
    f = np.fft.rfftfreq(len(x) + pad, 1 / sr)
    r = f / low
    gain = r * r / np.sqrt(1 + r ** 4)  # Butterworth, magnitude only: no ringing either side
    if abs(shelf_db) > 0.05:
        k = (f / shelf_hz) ** 2
        gain = gain * 10 ** (shelf_db / 20 * k / (1 + k))
    return np.fft.irfft(X * gain, len(x) + pad)[:len(x)].astype(np.float32)


def compress(x, sr, thresh_db=-24.0, ratio=3.0, attack=0.004, release=0.12):
    """even the level out, the way a broadcast chain does"""
    ka, kr = float(np.exp(-1 / (sr * attack))), float(np.exp(-1 / (sr * release)))
    env, out, t, k = 0.0, [], 10 ** (thresh_db / 20), 1 - 1 / ratio
    for v in x.tolist():
        a = abs(v)
        env = ka * env + (1 - ka) * a if a > env else kr * env + (1 - kr) * a
        out.append(v * (env / t) ** -k if env > t else v)
    return np.array(out, dtype=np.float32)


def speech_rms(x, sr):
    """loudness of the parts where he is actually speaking"""
    n = int(sr * 0.02)
    fr = x[:len(x) // n * n].reshape(-1, n)
    e = np.sqrt(np.mean(fr * fr, axis=1))
    loud = e[e > 0.25 * e.max()] if len(e) else e
    return float(np.sqrt(np.mean(loud ** 2))) if len(loud) else 1e-6


def pitch(x, sr):
    """median pitch in Hz and its 10th to 90th percentile, from the autocorrelation of 40 ms frames"""
    n, hop, out = int(sr * 0.04), int(sr * 0.01), []
    lo, hi = int(sr / 340), int(sr / 60)
    win = np.hanning(n)
    for i in range(0, len(x) - n, hop):
        fr = x[i:i + n] * win
        ac = np.fft.irfft(np.abs(np.fft.rfft(fr, 2 * n)) ** 2)[:n]
        if ac[0] <= 1e-4:
            continue
        j = int(np.argmax(ac[lo:hi])) + lo
        if ac[j] / ac[0] > 0.45:
            out.append(sr / j)
    if len(out) < 4:
        return 0.0, 0.0, 0.0
    return float(np.median(out)), float(np.percentile(out, 10)), float(np.percentile(out, 90))


def master(x, sr, effort, voice):
    """voice['low'] is where his rumble is cut (a deep voice needs it higher, or it booms), voice['bright'] how many
    dB the top of his voice is lifted on every line (a dark voice needs some to be understood on a phone)"""
    lift = max(0.0, (effort - 0.4) / 0.6)
    x = trim(x.astype(np.float32), sr)
    x = resample(x, 1 + 0.07 * lift)
    x = shape(x, sr, voice.get('low', 85), 2000, voice.get('bright', 0) + 3.5 * lift)
    x = compress(x, sr)
    x = x * (10 ** ((-21 + 4 * effort) / 20) / speech_rms(x, sr))
    x = np.tanh(x * 1.15) / 1.15  # peaks rounded off instead of clipped
    peak = float(np.max(np.abs(x)))
    if peak > 0.89:
        x = x * (0.89 / peak)
    fi, fo = int(sr * 0.004), int(sr * 0.03)
    x[:fi] *= np.linspace(0, 1, fi)
    x[-fo:] *= np.linspace(1, 0, fo)
    return x


def encode(x, sr, path):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'a.wav')
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes((np.clip(x, -1, 1) * 32767).astype('<i2').tobytes())
        subprocess.run(['/usr/bin/afconvert', '-f', 'm4af', '-d', 'aac', '-b', '40000', '-q', '127', wav, path], check=True, capture_output=True)


def lean(data):
    """An .m4a as afconvert writes it carries about 3.4 kB of padding and tags, a third of a short clip. This drops
    them and moves the pointers to the sound (the stco table) back by as much."""
    atoms, off = [], 0
    while off + 8 <= len(data):
        n, kind = struct.unpack('>I4s', data[off:off + 8])
        if n < 8:
            return data
        atoms.append((kind, data[off:off + n]))
        off += n
    kinds = [k for k, _ in atoms]
    if kinds[:2] != [b'ftyp', b'moov'] or b'mdat' not in kinds:
        return data
    moov, kept, off = atoms[1][1], b'', 8
    while off + 8 <= len(moov):
        n, kind = struct.unpack('>I4s', moov[off:off + 8])
        if kind != b'udta':
            kept += moov[off:off + n]
        off += n
    moov = struct.pack('>I4s', len(kept) + 8, b'moov') + kept
    cut = sum(len(d) for k, d in atoms[:kinds.index(b'mdat')]) - len(atoms[0][1]) - len(moov)
    at = moov.find(b'stco')
    if at < 0:
        return data
    count = struct.unpack('>I', moov[at + 8:at + 12])[0]
    fixed = b''.join(struct.pack('>I', struct.unpack('>I', moov[at + 12 + 4 * i:at + 16 + 4 * i])[0] - cut) for i in range(count))
    moov = moov[:at + 12] + fixed + moov[at + 12 + 4 * count:]
    return atoms[0][1] + moov + b''.join(d for k, d in atoms[2:] if k != b'free')


def syllables(text):
    """how many syllables the words have, near enough: vowel groups, less the silent endings"""
    n = 0
    for w in re.findall(r"[a-z']+", text.lower()):
        w = re.sub(r"'(s|re|ll|d|t|ve)$", '', w)
        c = len(re.findall(r'[aeiouy]+', w))
        if c > 1 and ((w.endswith('e') and not w.endswith('le')) or (w.endswith('ed') and not re.search(r'[td]ed$', w))):
            c -= 1
        n += max(1, c)
    return n


def nuclei(x, sr):
    """how many syllables can be counted in the sound: peaks in the loudness of the vowel band, each standing at least
    3.5 dB above the dip before it and 70 ms after the last"""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / sr)
    X[(f < 250) | (f > 3200)] = 0
    y = np.fft.irfft(X, len(x))
    w = np.hanning(int(sr * 0.03))
    db = 20 * np.log10(np.sqrt(np.convolve(y * y, w / w.sum(), 'same'))[::int(sr * 0.005)] + 1e-5)
    keep = []
    for i in range(1, len(db) - 1):
        if not (db[i] >= db[i - 1] and db[i] > db[i + 1] and db[i] > db.max() - 22):
            continue
        if keep and (min(db[keep[-1]], db[i]) - db[keep[-1]:i + 1].min() < 3.5 or (i - keep[-1]) * 0.005 < 0.07):
            if db[i] > db[keep[-1]]:
                keep[-1] = i
            continue
        keep.append(i)
    return len(keep)


def pace(voice, ln, text):
    """how fast he says it: a little quicker when he is worked up, but a one- or two-word shout is held longer"""
    s = voice['speed'] * (1 + 0.03 * ln['e'])
    return round(s * 0.78 if ln['e'] >= 0.8 and len(text.split()) <= 2 else s, 3)


def takes(script):
    """every clip there is to record: (the call the game asks for, the clip's id, its words, its line)"""
    for key, ln in script['lines'].items():
        for i, t in enumerate(ln['t']):
            cid = f"{key.replace('.', '_')}_{i + 1}"
            if '{team}' in t:
                for ab, name in script['teams'].items():
                    yield f'{key}.{ab}', f'{cid}_{ab}', t.replace('{team}', name), ln
            elif '{n}' in t:
                for n, word in enumerate(script['nums'][:ln.get('n', 10)], 1):
                    yield f'{key}.{n}', f'{cid}_{n}', t.replace('{n}', word), ln
            else:
                yield key, cid, t, ln


def main():
    args = sys.argv[1:]
    script = json.load(open(os.path.join(ROOT, 'tools', 'commentary.json'), encoding='utf-8'))
    os.makedirs(CLIPS, exist_ok=True)
    memo_path = os.path.join(CLIPS, 'index.json')
    memo = json.load(open(memo_path)) if os.path.exists(memo_path) and '--force' not in args else {}
    k, style, fresh, wavs = None, {}, [], {}
    todo = list(takes(script))
    for call, cid, text, ln in todo:
        voice = script['voices'][ln['v']]
        speed = pace(voice, ln, text)
        sig = hashlib.sha1(json.dumps([text, voice, speed, ln['e'], MASTER], sort_keys=True).encode()).hexdigest()[:12]
        path = os.path.join(CLIPS, cid + '.m4a')
        if memo.get(cid, {}).get('sig') == sig and os.path.exists(path):
            continue
        if k is None:
            k = Kokoro(os.path.join(MODEL, 'kokoro-v1.0.onnx'), os.path.join(MODEL, 'voices-v1.0.bin'))
            style = {v: sum(w * k.get_voice_style(name) for name, w in cfg['mix'].items()).astype(np.float32) for v, cfg in script['voices'].items()}
        x, sr = k.create(text, voice=style[ln['v']], speed=speed, lang='en-us')
        x = master(x, sr, ln['e'], voice)
        encode(x, sr, path)
        f0, lo, hi = pitch(x, sr)
        memo[cid] = {'sig': sig, 'secs': round(len(x) / sr, 2), 'f0': round(f0), 'lo': round(lo), 'hi': round(hi), 'rms': round(20 * np.log10(speech_rms(x, sr)), 1),
                     'peak': round(20 * np.log10(float(np.max(np.abs(x)))), 1), 'v': ln['v'], 'e': ln['e'], 'text': text, 'syl': syllables(text), 'heard': nuclei(x, sr)}
        fresh.append(cid)
        wavs[cid] = x
        print(f"  {cid:24s} {len(x) / sr:5.2f}s {f0:4.0f} Hz  {text}", flush=True)
    live = {cid for _, cid, _, _ in todo}
    for cid in [c for c in memo if c not in live]:  # a line that left the script
        del memo[cid]
        if os.path.exists(os.path.join(CLIPS, cid + '.m4a')):
            os.remove(os.path.join(CLIPS, cid + '.m4a'))
    json.dump(memo, open(memo_path, 'w'), indent=0, sort_keys=True)

    pack, clips, text = bytearray(), {}, {}
    for call, cid, words, ln in todo:
        data = lean(open(os.path.join(CLIPS, cid + '.m4a'), 'rb').read())
        clips.setdefault(call, []).append([cid, len(pack), len(data), memo[cid]['secs']])
        text[cid] = words
        pack += data
    os.makedirs(os.path.join(ROOT, 'audio'), exist_ok=True)
    open(os.path.join(ROOT, 'audio', 'vo.pack'), 'wb').write(pack)
    body = json.dumps({'v': hashlib.sha1(pack).hexdigest()[:10], 'pack': 'audio/vo.pack', 'bytes': len(pack), 'clips': clips, 'text': text}, ensure_ascii=False, separators=(',', ':'))
    open(os.path.join(ROOT, 'js', 'vo.js'), 'w', encoding='utf-8').write(
        '/* The broadcast booth: which recorded clips there are for each call, and where each one sits in audio/vo.pack.\n'
        '   Written by tools/voice.py from tools/commentary.json; do not edit by hand. */\n'
        'PG.VO = ' + body + ';\n')

    print(f'recorded {len(fresh)} of {len(todo)} clips this run')
    for v, name in (('p', 'play-by-play'), ('a', 'analyst'), ('r', 'referee'), ('s', 'stadium announcer')):
        rows = [m for m in memo.values() if m['v'] == v]
        if not rows:
            continue
        d = np.array([m['secs'] for m in rows])
        calm, hot = [m for m in rows if m['e'] < 0.4], [m for m in rows if m['e'] >= 0.8]
        mid = lambda ms, k: np.median([m[k] for m in ms if m[k]]) if ms else float('nan')
        print(f"{name}: {len(rows)} clips, {d.sum():.0f}s in all, {d.min():.2f} to {d.max():.2f}s each; median pitch {mid(rows, 'f0'):.0f} Hz; "
              f"calm lines {mid(calm, 'f0'):.0f} Hz at {mid(calm, 'rms'):.1f} dB RMS" + (f", biggest calls {mid(hot, 'f0'):.0f} Hz at {mid(hot, 'rms'):.1f}" if hot else '') +
              f"; highest peak {max(m['peak'] for m in rows):.1f} dB")
    rate = np.array([m['syl'] / m['secs'] for m in memo.values()])
    print(f'pace: {np.median(rate):.1f} syllables a second in the middle, {rate.max():.1f} at the quickest')
    # anything that came out oddly: far fewer syllables in the sound than in the words, too quick to be all there, or no pitch found
    for c, m in memo.items():
        if not m['f0'] or m['heard'] < 0.6 * m['syl'] or m['syl'] / m['secs'] > 7.6:
            print(f"  check {c}: {m['secs']}s, {m['heard']} syllables heard of {m['syl']}, pitch {m['f0']} Hz: {m['text']}")
    print(f'pack: audio/vo.pack {len(pack) / 1024:.0f} kB, {len(todo)} clips under {len(clips)} calls; index js/vo.js {os.path.getsize(os.path.join(ROOT, "js", "vo.js")) / 1024:.0f} kB')

    if '--reel' in args:
        if k is None:
            k = Kokoro(os.path.join(MODEL, 'kokoro-v1.0.onnx'), os.path.join(MODEL, 'voices-v1.0.bin'))
            style = {v: sum(w * k.get_voice_style(name) for name, w in cfg['mix'].items()).astype(np.float32) for v, cfg in script['voices'].items()}
        pick = ['intro_night_1', 'intro_away_1_PDX', 'intro_home_1_ATX', 'a_intro_2', 'kickoff_1', 'kick_return_2', 'down_1_1', 'run_good_1', 'down_2n_1_6', 'pass_good_1', 'first_1', 'a_first_1',
                'down_3n_1_8', 'a_third_1', 'pass_big_1', 'a_bigpass_2', 'sack_2', 'a_sack_2', 'down_3l_1', 'int_3', 'a_int_1', 'run_big_2', 'td_team_1_ATX', 'a_td_3', 'xp_good_1', 'score_lead_1',
                'final_win_1', 'a_final_1']
        by = {cid: (words, ln) for _, cid, words, ln in todo}
        parts = []
        for cid in pick:
            if cid not in by:
                print('  reel: no clip', cid)
                continue
            if cid not in wavs:
                words, ln = by[cid]
                x, sr = k.create(words, voice=style[ln['v']], speed=pace(script['voices'][ln['v']], ln, words), lang='en-us')
                wavs[cid] = master(x, sr, ln['e'], script['voices'][ln['v']])
            parts += [wavs[cid], np.zeros(int(SR * (0.3 if by[cid][1]['v'] == 'p' else 0.55)), dtype=np.float32)]
        encode(np.concatenate(parts), SR, os.path.join(ROOT, '.voice', 'booth-sample.m4a'))
        print(f'reel: .voice/booth-sample.m4a, {sum(len(p) for p in parts) / SR:.0f}s')


if __name__ == '__main__':
    main()
