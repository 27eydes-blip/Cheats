"""Local narrator: Kokoro TTS with an older British boy voice, plus word timings.

Reads a JSON job from stdin:
  { "model": "...onnx", "voices": "...bin",
    "voice": [["bm_fable", 0.7], ["bf_emma", 0.3]],     # blend of Kokoro voices
    "semitones": 0,                                     # optional pitch shift (+ younger, - older)
    "speed": 0.78,
    "lines": [ { "text": "...", "words": ["...", ...], "out": "file.wav" } ] }

Writes each line to its .wav and prints one JSON object per line:
  { "duration": 3.21, "words": [ { "start": 0.10, "end": 0.42 }, ... ] }

Kokoro does not report timestamps, so word timings are measured from the audio:
silences in the waveform are matched to punctuation, and words are spread over each
spoken stretch in proportion to their phoneme count. Accurate to roughly a syllable.
"""
import json
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

job = json.load(sys.stdin)
k = Kokoro(job["model"], job["voices"])
style = sum(w * k.get_voice_style(v) for v, w in job["voice"])
ratio = 2 ** (job.get("semitones", 0) / 12)
speed = job.get("speed", 1.0)


def resample(s, n):
    # band-limited (FFT) resampling: clean, no aliasing
    S = np.fft.rfft(s)
    m = n // 2 + 1
    S2 = np.zeros(m, complex)
    c = min(m, len(S))
    S2[:c] = S[:c]
    return (np.fft.irfft(S2, n) * n / len(s)).astype(np.float32)


def synth(text):
    s, sr = k.create(text, voice=style, speed=speed / ratio, lang="en-gb")
    if ratio != 1:
        s = resample(s, int(len(s) / ratio))
    return s, sr


def phonemes(word):
    try:
        return max(1, len(k.tokenizer.phonemize(word, "en-gb").replace(" ", "")))
    except Exception:
        return max(1, len(word))


def align(s, sr, words):
    hop = int(0.01 * sr)
    rms = np.array([np.sqrt(np.mean(s[i:i + hop] ** 2)) for i in range(0, len(s) - hop, hop)])
    if len(rms) == 0:
        return [{"start": 0.0, "end": 0.1} for _ in words]
    thr = max(0.006, 0.07 * np.percentile(rms, 95))
    speech = rms > thr
    idx = np.nonzero(speech)[0]
    first, last = (idx[0], idx[-1]) if len(idx) else (0, len(rms) - 1)
    # silent gaps inside the speech
    gaps, i = [], first
    while i <= last:
        if not speech[i]:
            j = i
            while j <= last and not speech[j]:
                j += 1
            if j - i >= 9:  # >= 90 ms
                gaps.append((i, j))
            i = j
        else:
            i += 1
    weights = [phonemes(w) + 1.5 for w in words]
    cum = np.cumsum([0] + weights)
    total = cum[-1]
    breaks = [n for n, w in enumerate(words[:-1]) if w.rstrip('"').endswith((",", ".", ";", ":", "?", "!", "…"))]
    # expected time of each punctuation break if speech were evenly paced
    span = last - first
    expect = {b: first + span * cum[b + 1] / total for b in breaks}
    anchors = {}
    for g in sorted(gaps, key=lambda g: g[0] - g[1]):  # longest gaps first
        mid = (g[0] + g[1]) / 2
        free = [b for b in breaks if b not in anchors]
        if not free:
            break
        b = min(free, key=lambda b: abs(expect[b] - mid))
        if abs(expect[b] - mid) < span * 0.35:
            anchors[b] = g
    # walk the segments between anchors
    out = [None] * len(words)
    seg_start_word, seg_start = 0, first
    for b in sorted(anchors) + [len(words) - 1]:
        end_frame = anchors[b][0] if b in anchors else last + 1
        ws = list(range(seg_start_word, b + 1))
        wsum = sum(weights[w] for w in ws) or 1
        t = seg_start
        for w in ws:
            d = (end_frame - seg_start) * weights[w] / wsum
            out[w] = {"start": round(t * hop / sr, 3), "end": round((t + d) * hop / sr, 3)}
            t += d
        if b in anchors:
            seg_start = anchors[b][1]
        seg_start_word = b + 1
    return out


for line in job["lines"]:
    s, sr = synth(line["text"])
    sf.write(line["out"], s, sr)
    words = line.get("words") or line["text"].split()
    print(json.dumps({"duration": len(s) / sr, "words": align(s, sr, words)}), flush=True)
