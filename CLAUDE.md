# 영어 단어장 (Vocab Flashcard PWA)

논문을 읽다가 사용자가 단어를 물어보면 → 뜻·예문을 정리해 `words.json`에 **누적**한다.
웹앱(PWA)은 GitHub Pages로 배포되어 폰·다른 기기에서 플래시카드(SRS)로 학습한다.

## 사용자가 단어를 물어봤을 때 (핵심 워크플로우)
1. 단어의 뜻을 **논문 문맥에 맞게** 한국어로 해석해 답한다.
2. 아래 스크립트로 `words.json`에 추가한다 (중복 id는 자동 갱신):
   ```bash
   python3 add_word.py '{"word":"…","pos":"adj./n./v.","ipa":"/…/","meaning":"한국어 뜻","example":"논문 문맥 예문","exampleKo":"예문 번역"}'
   ```
   여러 개면 `python3 add_word.py 'words=[ {...}, {...} ]'`
   → 스크립트가 **edge-tts 뉴럴 음성**(en-US-AriaNeural, 무료·API키 불필요, 실패 시 Google TTS 폴백)으로 발음 mp3를 `audio/<id>.mp3`에 자동 저장하고 `audioUrl`을 채운다(네트워크 필요). 재생은 저장소 내부 파일만 쓰므로 앱 런타임은 외부 의존이 없다. 커밋 시 `audio/`도 함께 push할 것.
3. 커밋 & 푸시하면 폰 앱에 동기화된다:
   ```bash
   git add words.json && git commit -m "vocab: add <word>" && git push
   ```
   (사용자가 원할 때만 push. 여러 단어를 모아 한 번에 push해도 됨.)

## 단어 스키마 (words.json)
| 필드 | 필수 | 설명 |
|---|---|---|
| `word` | ✅ | 영단어 |
| `meaning` | ✅ | 한국어 뜻 |
| `pos` | | 품사 (adj./n./v./adv.) |
| `ipa` | | 발음기호 |
| `example` | | 예문 (논문 문맥) |
| `exampleKo` | | 예문 한국어 번역 |
| `detail` | | 상세 해설 배열: `[{"h":"유의어·뉘앙스","t":"…"},{"h":"어원","t":"…"},{"h":"활용","t":"…"}]`. 정답 후 피드백에 표시됨. **단어 추가 시 꼭 채울 것** |
| `id`, `added` | | 자동 생성 (건드리지 말 것) |

> `detail`은 nested JSON이라 `add_word.py` 인자에 그대로 넣기 번거로우면, add_word로 기본 필드만 넣은 뒤 별도 파이썬으로 `detail`을 채워도 됨(예: `/tmp/backfill_details.py` 패턴). 섹션 예시: 유의어·뉘앙스(비슷한 단어들과 어감 차이), 어원(라틴/그리스어 뿌리+동원어), 활용(자주 쓰는 연어·표현).

## 구조
- `words.json` — 단어 콘텐츠 (Claude가 갱신하는 유일한 데이터 파일)
- `index.html` / `app.js` / `style.css` — PWA 앱
- `manifest.json` / `sw.js` / `icons/` — PWA(설치·오프라인)
- 학습 진도(SRS 일정)는 **각 기기 localStorage**에 저장 → words.json엔 넣지 않음

## 배포
`README.md` 참고. GitHub Pages 브랜치 배포. words.json만 바꿔 push하면 앱이 자동 동기화.
