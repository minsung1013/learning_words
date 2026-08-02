#!/usr/bin/env python3
"""단어를 words.json에 안전하게 누적한다 (중복은 갱신).

사용:
  python3 add_word.py '{"word":"salient","pos":"adj.","ipa":"/ˈseɪliənt/",
    "meaning":"두드러진","example":"...","exampleKo":"..."}'
또는 여러 개:
  python3 add_word.py words='[ {...}, {...} ]'
"""
import json, sys, datetime, pathlib, urllib.request, urllib.parse, subprocess, shutil

DB = pathlib.Path(__file__).parent / "words.json"
VOICE = "en-US-AriaNeural"   # edge-tts 뉴럴 영어 음성

def slug(w):
    return "".join(c for c in w.lower().strip() if c.isalnum() or c in " -").replace(" ", "-")

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
AUDIO_DIR = DB.parent / "audio"

def _edge_tts(word, dest):
    """edge-tts(Microsoft 뉴럴, 무료) 음성 생성. 성공 시 True."""
    if not shutil.which("edge-tts"):
        return False
    try:
        subprocess.run(
            ["edge-tts", "--voice", VOICE, "--text", word, "--write-media", str(dest)],
            check=True, capture_output=True, timeout=30)
        return dest.exists() and dest.stat().st_size > 500
    except Exception:
        return False

def _google_tts(word, dest):
    """폴백: Google translate TTS."""
    q = urllib.parse.urlencode({"ie": "UTF-8", "client": "tw-ob", "tl": "en", "q": word})
    try:
        req = urllib.request.Request("https://translate.google.com/translate_tts?" + q, headers=UA)
        with urllib.request.urlopen(req, timeout=10) as r:
            blob = r.read()
        if len(blob) < 500:
            return False
        dest.write_bytes(blob)
        return True
    except Exception:
        return False

def fetch_audio(word, wid):
    """발음 mp3를 audio/<id>.mp3에 저장하고 상대경로 반환(실패 시 '').
    ① edge-tts 뉴럴 음성 우선 → ② 실패 시 Google TTS.
    재생 시점엔 저장소 내부 파일만 쓰므로 외부 의존이 없다(안정적·오프라인 캐시 가능)."""
    AUDIO_DIR.mkdir(exist_ok=True)
    dest = AUDIO_DIR / f"{wid}.mp3"
    if _edge_tts(word, dest) or _google_tts(word, dest):
        return f"audio/{wid}.mp3"
    return ""

def load():
    return json.loads(DB.read_text(encoding="utf-8")) if DB.exists() else {"version": 1, "words": []}

def add(db, entry):
    entry = {k: (v.strip() if isinstance(v, str) else v) for k, v in entry.items()}
    wid = entry.get("id") or slug(entry["word"])
    entry["id"] = wid
    entry.setdefault("added", datetime.date.today().isoformat())
    if not entry.get("audioUrl"):            # 발음 mp3 미리 확보(있으면)
        au = fetch_audio(entry["word"], wid)
        if au:
            entry["audioUrl"] = au
    words = db["words"]
    for i, w in enumerate(words):
        if w["id"] == wid:            # 중복 → 갱신
            words[i] = {**w, **entry}
            return "updated"
    words.append(entry)
    return "added"

def main():
    arg = sys.argv[1]
    payload = arg[len("words="):] if arg.startswith("words=") else arg
    data = json.loads(payload)
    entries = data if isinstance(data, list) else [data]
    db = load()
    for e in entries:
        status = add(db, e)
        print(f"{status}: {e['word']}")
    DB.write_text(json.dumps(db, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"총 {len(db['words'])}개 단어")

if __name__ == "__main__":
    main()
