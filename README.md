# 📖 단어장 — Vocab Flashcard PWA

논문을 읽으며 모은 영단어를 **간격 반복(SRS)** 플래시카드로 외우는 개인용 웹앱.
Claude Code가 단어를 `words.json`에 누적하고, 폰·태블릿 등 어느 기기에서든 브라우저로 학습한다.

## 특징
- 📱 **PWA** — 폰 홈화면에 앱처럼 설치, 오프라인 동작
- 🔁 **간격 반복(SM-2 lite)** — 다시 / 어려움 / 알맞음 / 쉬움 4단계 채점
- 🔊 발음 듣기(TTS), 예문·발음기호·품사 표시
- 📊 학습 통계, 단어 목록·검색
- 🔒 서버·로그인·비용 없음. 학습 진도는 기기 localStorage에 저장

## 로컬에서 미리보기
```bash
cd english_words
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```
같은 와이파이의 폰에서 보려면 `http://<맥의-IP>:8000` (단, PWA 설치/서비스워커는 https 또는 localhost에서만 완전 동작 → 실사용은 GitHub Pages 권장).

## GitHub Pages 배포 (한 번만 설정)
```bash
# 1) GitHub에 새 repo 생성 후
git init && git add -A && git commit -m "init vocab app"
git branch -M main
git remote add origin https://github.com/<사용자명>/<repo>.git
git push -u origin main
```
2) GitHub repo → **Settings → Pages → Source: Deploy from a branch → `main` / `root`** 저장
3) 몇 분 뒤 `https://<사용자명>.github.io/<repo>/` 접속 → 폰 사파리/크롬에서 **홈 화면에 추가**

이후 단어를 추가하면 `words.json`만 커밋·푸시하면 앱이 자동으로 새 단어를 받아온다.

## 단어 추가 (Claude Code 워크플로우)
논문 읽다가 Claude에게 단어를 물어보면 뜻·예문을 정리해 `words.json`에 넣는다.
직접 추가할 때:
```bash
python3 add_word.py '{"word":"salient","pos":"adj.","ipa":"/ˈseɪliənt/","meaning":"두드러진","example":"...","exampleKo":"..."}'
git add words.json && git commit -m "vocab: add salient" && git push
```

## 파일 구조
```
words.json      단어 데이터 (유일한 콘텐츠 파일)
index.html      앱 화면
app.js          플래시카드 + SRS 로직
style.css       스타일 (모바일 우선, 다크)
manifest.json   PWA 설정
sw.js           서비스워커 (오프라인)
icons/          앱 아이콘
add_word.py     단어 추가 헬퍼
CLAUDE.md       Claude Code용 작업 지침
```
