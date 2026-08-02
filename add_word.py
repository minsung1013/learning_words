#!/usr/bin/env python3
"""단어를 words.json에 안전하게 누적한다 (중복은 갱신).

사용:
  python3 add_word.py '{"word":"salient","pos":"adj.","ipa":"/ˈseɪliənt/",
    "meaning":"두드러진","example":"...","exampleKo":"..."}'
또는 여러 개:
  python3 add_word.py words='[ {...}, {...} ]'
"""
import json, sys, datetime, pathlib

DB = pathlib.Path(__file__).parent / "words.json"

def slug(w):
    return "".join(c for c in w.lower().strip() if c.isalnum() or c in " -").replace(" ", "-")

def load():
    return json.loads(DB.read_text(encoding="utf-8")) if DB.exists() else {"version": 1, "words": []}

def add(db, entry):
    entry = {k: (v.strip() if isinstance(v, str) else v) for k, v in entry.items()}
    wid = entry.get("id") or slug(entry["word"])
    entry["id"] = wid
    entry.setdefault("added", datetime.date.today().isoformat())
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
