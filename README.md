# 워크샵 안내 앱

300명 규모의 2박 3일 워크샵 참석자가 공통 QR 링크로 접속해 일정, 방배정, 주요 연락처, 긴급공지를 확인하는 모바일 웹/PWA입니다.

현재 앱은 아래 Google Sheet를 데이터 원본으로 읽습니다.

https://docs.google.com/spreadsheets/d/1E1Im2a8NGb9JFuD5mvVYxtNbeSyDKw-YxTlMPxp5XPs/edit

## 주요 기능

- 스케줄 조회: 1일차/2일차/3일차 탭으로 일정 확인
- 방배정 조회:
  - 방번호 입력 시 해당 방 전체 명단 출력
  - 이름 입력 시 같은 이름의 모든 결과를 `방번호 : 이름 / 소속 / 직책` 형식으로 출력
- 주요 연락처 조회: 운영, 안전, 이동 연락처와 전화 연결
- 긴급공지: 상단 고정 긴급 배너와 공지 목록
- 알림 받기: 브라우저 알림 권한 요청 및 테스트 알림
- PWA 기본 구성: manifest, 아이콘, service worker 포함

## Google Sheet 구조

필수 탭:

- `기본정보`
- `일정`
- `방배정`
- `연락처`
- `공지`

### 기본정보

| key | value |
|---|---|
| title | 2026 리더십 워크샵 안내 |
| date | 2026.07.10 금 - 07.12 일 |
| duration | 2박 3일 |
| venue | 양평 포레스트 리트릿 |
| helpDesk | 운영본부 010-9000-1122 |
| helpDeskHours | 상시 운영 · 숙소 1층 로비 |

### 일정

| day_id | day_label | date | time | title | place | type | note | visible |
|---|---|---|---|---|---|---|---|---|

`type` 예시: `main`, `meal`, `move`, `activity`

### 방배정

| room_no | building | floor | name | organization | title | visible |
|---|---|---|---|---|---|---|

### 연락처

| category | label | name | phone | note | sort_order | visible |
|---|---|---|---|---|---|---|

### 공지

| notice_id | level | time | title | body | target | pinned | visible | push_status |
|---|---|---|---|---|---|---|---|---|

`pinned`가 `Y`인 공지는 긴급공지 상단 배너 후보가 됩니다.

## 데이터 연동 방식

기본값은 공개 Google Sheet CSV 조회입니다.

[web/.env.local](/Users/hkim/Project/yangwoo_tool/yangwoo_tool/retreat_guidebook/web/.env.local):

```env
VITE_GOOGLE_SHEET_ID=1E1Im2a8NGb9JFuD5mvVYxtNbeSyDKw-YxTlMPxp5XPs
VITE_GUIDEBOOK_API_URL=
```

나중에 Apps Script API를 배포하면 `VITE_GUIDEBOOK_API_URL`에 배포 URL을 넣으면 됩니다. 이 값이 있으면 앱은 Apps Script API를 우선 사용하고, 없으면 Google Sheet CSV를 직접 읽습니다.

Apps Script 코드는 [apps-script/Code.gs](/Users/hkim/Project/yangwoo_tool/yangwoo_tool/retreat_guidebook/apps-script/Code.gs)에 있습니다.

## 실행

```bash
cd web
npm install
npm run dev
```

기본 로컬 주소:

```text
http://localhost:5173
```

프로덕션 빌드:

```bash
cd web
npm run build
```

빌드 결과는 `web/dist/`에 생성됩니다.

## 개인정보 운영 메모

- 이름 검색은 부분 검색이 아니라 정확히 일치하는 이름만 조회합니다.
- 방번호 조회는 해당 방에 배정된 명단 전체를 보여줍니다.
- 전화번호, 생년월일, 성별 같은 민감 정보는 방배정 데이터에 넣지 않는 편이 안전합니다.
- 공지 확인 여부 추적과 개인별 푸시는 현재 범위에서 제외했습니다.
# retreat_guidebook
