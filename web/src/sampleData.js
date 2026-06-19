export const eventInfo = {
  title: '2026 리더십 워크샵 안내',
  date: '2026.07.10 금 - 07.12 일',
  duration: '2박 3일',
  venue: '양평 포레스트 리트릿',
  helpDesk: '운영본부 010-9000-1122',
  helpDeskHours: '상시 운영 · 숙소 1층 로비',
};

export const scheduleDays = [
  {
    id: 'day1',
    label: '1일차',
    date: '7.10 금',
    sessions: [
      { time: '13:00', title: '등록 및 객실 키 수령', place: '로비', type: 'move', note: '조별 명찰과 웰컴키트를 함께 수령합니다.' },
      { time: '14:30', title: '오프닝 세션', place: '그랜드홀', type: 'main', note: '전체 일정 안내와 안전 공지가 진행됩니다.' },
      { time: '16:00', title: '팀 빌딩 프로그램', place: '야외 잔디광장', type: 'activity', note: '편한 신발을 착용해 주세요.' },
      { time: '18:30', title: '저녁 식사', place: '다이닝홀', type: 'meal', note: '알레르기 식단은 운영본부에 문의합니다.' },
      { time: '20:00', title: '조별 네트워킹', place: '세미나룸 A/B', type: 'main', note: '조별 지정 공간에서 진행됩니다.' },
    ],
  },
  {
    id: 'day2',
    label: '2일차',
    date: '7.11 토',
    sessions: [
      { time: '07:30', title: '아침 식사', place: '다이닝홀', type: 'meal', note: '식사는 09:00에 마감됩니다.' },
      { time: '09:30', title: '전략 워크샵', place: '그랜드홀', type: 'main', note: '부서별 사전 과제를 지참합니다.' },
      { time: '12:00', title: '점심 식사', place: '다이닝홀', type: 'meal', note: '좌석은 자유석입니다.' },
      { time: '14:00', title: '분임 토의', place: '세미나룸 1-6', type: 'activity', note: '조별 배정 회의실로 이동합니다.' },
      { time: '17:30', title: '발표 리허설', place: '그랜드홀', type: 'main', note: '발표 자료는 17:00까지 제출합니다.' },
      { time: '19:00', title: '만찬', place: '연회장', type: 'meal', note: '행사 복장은 비즈니스 캐주얼입니다.' },
    ],
  },
  {
    id: 'day3',
    label: '3일차',
    date: '7.12 일',
    sessions: [
      { time: '08:00', title: '아침 식사 및 체크아웃 준비', place: '다이닝홀', type: 'meal', note: '객실 키는 10:00 전까지 반납합니다.' },
      { time: '10:00', title: '조별 발표', place: '그랜드홀', type: 'main', note: '조별 7분 발표, 3분 질의응답입니다.' },
      { time: '12:00', title: '클로징', place: '그랜드홀', type: 'main', note: '단체 사진 촬영 후 버스 탑승 안내가 있습니다.' },
      { time: '13:00', title: '귀가 버스 출발', place: '정문 주차장', type: 'move', note: '노선별 탑승 위치를 확인해 주세요.' },
    ],
  },
];

export const rooms = [
  {
    roomNo: '501',
    building: '본관',
    floor: '5층',
    members: [
      { name: '김민수', organization: '영업본부', title: '팀장' },
      { name: '이서연', organization: '마케팅팀', title: '대리' },
      { name: '박준호', organization: '전략기획실', title: '과장' },
      { name: '최유진', organization: '재무팀', title: '매니저' },
    ],
  },
  {
    roomNo: '502',
    building: '본관',
    floor: '5층',
    members: [
      { name: '김민수', organization: '플랫폼개발팀', title: '선임' },
      { name: '정하늘', organization: '인사팀', title: '책임' },
      { name: '오지훈', organization: '운영혁신팀', title: '프로' },
      { name: '한소라', organization: '브랜드팀', title: '주임' },
    ],
  },
  {
    roomNo: 'A-301',
    building: '별관 A',
    floor: '3층',
    members: [
      { name: '장도윤', organization: '데이터팀', title: '리더' },
      { name: '윤서아', organization: '고객성공팀', title: '매니저' },
      { name: '강태오', organization: '제품기획팀', title: 'PO' },
    ],
  },
  {
    roomNo: 'A-302',
    building: '별관 A',
    floor: '3층',
    members: [
      { name: '문지아', organization: '디자인팀', title: '디자이너' },
      { name: '백승현', organization: '보안팀', title: '책임' },
      { name: '신예린', organization: '교육팀', title: '대리' },
    ],
  },
];

export const contacts = [
  {
    category: '운영',
    items: [
      { label: '운영본부', name: '로비 데스크', phone: '010-9000-1122', note: '분실물, 객실, 일정 문의' },
      { label: '프로그램', name: '김운영 매니저', phone: '010-9000-1133', note: '세션 진행, 조별 활동' },
    ],
  },
  {
    category: '안전',
    items: [
      { label: '응급 담당', name: '박안전 책임', phone: '010-9000-1199', note: '응급 처치, 병원 이동' },
      { label: '숙소 프런트', name: '포레스트 리트릿', phone: '031-770-3000', note: '시설, 객실, 야간 문의' },
    ],
  },
  {
    category: '이동',
    items: [
      { label: '버스 A', name: '서울역 노선', phone: '010-9000-2211', note: '정문 주차장 1번 구역' },
      { label: '버스 B', name: '잠실 노선', phone: '010-9000-2222', note: '정문 주차장 2번 구역' },
    ],
  },
];

export const notices = [
  {
    id: 'notice-urgent-1',
    level: '긴급',
    time: '7.11 토 15:20',
    title: '야외 프로그램 장소 변경',
    body: '우천 예보로 16:00 팀 활동은 야외 잔디광장에서 그랜드홀로 변경됩니다.',
    target: '전체 참석자',
  },
  {
    id: 'notice-2',
    level: '공지',
    time: '7.11 토 12:40',
    title: '분임 토의 회의실 안내',
    body: '1-3조는 세미나룸 1-3, 4-6조는 세미나룸 4-6을 사용합니다.',
    target: '전체 참석자',
  },
  {
    id: 'notice-3',
    level: '공지',
    time: '7.10 금 18:10',
    title: '저녁 식사 시작',
    body: '다이닝홀 입장은 18:30부터 가능합니다. 명찰을 착용해 주세요.',
    target: '전체 참석자',
  },
];

export const sampleGuidebookData = {
  eventInfo,
  scheduleDays,
  rooms,
  contacts,
  notices,
};
