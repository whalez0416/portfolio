# 최희준 — 포트폴리오

의료 마케팅 도메인에서 AEO(답변엔진 최적화) 측정 · 생산 · 감시 도구를 직접 개발해 운영한 기록.

**https://whalez0416.github.io/portfolio/**

## 구성

정적 HTML 한 장입니다. 빌드 과정도, 의존성도, CI도 없습니다.

```
index.html    전부 — 마크업 · CSS · 스크롤 리빌 스크립트
```

폰트는 Google Fonts(Space Grotesk · Space Mono)와 jsDelivr(Pretendard)에서 받아오고,
차단된 환경에서는 시스템 폰트로 폴백합니다.

## 로컬에서 보기

```bash
python -m http.server 8000
# http://localhost:8000
```

파일을 브라우저로 바로 열어도 됩니다.

## 배포

`main` 브랜치에 푸시하면 GitHub Pages가 자동 반영합니다.
(Settings → Pages → Source: `main` / `/root`)

## 수치에 대하여

본문 수치는 각 프로젝트 저장소의 커밋 이력과 산출물에서 2026년 8월 기준으로 인용했습니다.
서버 접속정보와 클라이언트 내부 실적 수치는 포함하지 않았습니다.
