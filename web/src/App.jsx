import { useEffect, useMemo, useState } from 'react';
import { fetchGuidebookData, sampleGuidebookData } from './guidebookApi.js';

const tabs = [
  { id: 'schedule', label: '일정' },
  { id: 'rooms', label: '방배정' },
  { id: 'contacts', label: '연락처' },
  { id: 'notices', label: '긴급공지' },
];

function cleanText(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function normalizeRoom(value) {
  return cleanText(value).replace(/호$/i, '').toUpperCase();
}

function buildRoomRows(roomList) {
  return roomList.flatMap((room) =>
    room.members.map((member) => ({
      roomNo: room.roomNo,
      building: room.building,
      floor: room.floor,
      ...member,
    }))
  );
}

async function getReadyServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;

  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((resolve) => setTimeout(() => resolve(null), 700)),
  ]);
}

function NotificationControl() {
  const [permission, setPermission] = useState(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });

  async function requestPermission() {
    if (!('Notification' in window)) {
      setPermission('unsupported');
      return;
    }

    const result = await window.Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      try {
        const registration = await getReadyServiceWorker();
        if (registration) {
          registration.showNotification('워크샵 긴급공지 알림', {
            body: '알림 수신이 켜졌습니다.',
            tag: 'workshop-notification-test',
          });
          return;
        }
      } catch (e) {
        // Fall back to the browser notification constructor below.
      }
      new window.Notification('워크샵 긴급공지 알림', {
        body: '알림 수신이 켜졌습니다.',
      });
    }
  }

  const label = {
    default: '알림 받기',
    granted: '알림 허용됨',
    denied: '알림 차단됨',
    unsupported: '알림 미지원',
  }[permission] || '알림 받기';

  return (
    <button
      className="notify-button"
      type="button"
      onClick={requestPermission}
      disabled={permission === 'granted' || permission === 'denied' || permission === 'unsupported'}
    >
      {label}
    </button>
  );
}

function TopBar({ eventInfo, notices, setActiveTab }) {
  const latestUrgent = notices.find((notice) => notice.level === '긴급');

  return (
    <>
      <header className="app-header">
        <div>
          <p className="eyebrow">{eventInfo.venue}</p>
          <h1>{eventInfo.title}</h1>
          <p className="event-meta">{eventInfo.date} · {eventInfo.duration}</p>
        </div>
        <NotificationControl />
      </header>

      {latestUrgent && (
        <button className="urgent-strip" type="button" onClick={() => setActiveTab('notices')}>
          <span>{latestUrgent.level}</span>
          <strong>{latestUrgent.title}</strong>
          <small>{latestUrgent.time}</small>
        </button>
      )}
    </>
  );
}

function TabBar({ activeTab, setActiveTab }) {
  return (
    <nav className="tabbar" aria-label="주요 메뉴">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={activeTab === tab.id ? 'active' : ''}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function ScheduleView({ scheduleDays }) {
  const [selectedDayId, setSelectedDayId] = useState(scheduleDays[0]?.id);
  const selectedDay = scheduleDays.find((day) => day.id === selectedDayId) || scheduleDays[0];

  useEffect(() => {
    if (!selectedDay || !scheduleDays.some((day) => day.id === selectedDayId)) {
      setSelectedDayId(scheduleDays[0]?.id);
    }
  }, [scheduleDays, selectedDay, selectedDayId]);

  if (!selectedDay) {
    return (
      <section className="view workshop-view">
        <div className="section-heading">
          <h2>스케줄</h2>
          <p>등록된 일정이 없습니다.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="view workshop-view">
      <div className="section-heading">
        <h2>스케줄</h2>
        <p>장소 변경과 긴급 공지는 상단 공지 기준으로 확인합니다.</p>
      </div>

      <div className="day-selector" role="tablist" aria-label="일자 선택">
        {scheduleDays.map((day) => (
          <button
            key={day.id}
            type="button"
            className={selectedDay.id === day.id ? 'active' : ''}
            onClick={() => setSelectedDayId(day.id)}
          >
            <strong>{day.label}</strong>
            <span>{day.date}</span>
          </button>
        ))}
      </div>

      <ol className="timeline">
        {selectedDay.sessions.map((session) => (
          <li key={`${selectedDay.id}-${session.time}-${session.title}`} className={session.type}>
            <time>{session.time}</time>
            <div>
              <div className="session-title-row">
                <h3>{session.title}</h3>
                <span>{session.place}</span>
              </div>
              <p>{session.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RoomView({ rooms }) {
  const roomRows = useMemo(() => buildRoomRows(rooms), []);
  const [mode, setMode] = useState('room');
  const [query, setQuery] = useState('');
  const [searched, setSearched] = useState(false);
  const duplicateName = useMemo(() => {
    const counts = new Map();
    roomRows.forEach((row) => counts.set(row.name, (counts.get(row.name) || 0) + 1));
    return roomRows.find((row) => counts.get(row.name) > 1)?.name || roomRows[0]?.name || '';
  }, [roomRows]);

  const results = useMemo(() => {
    const normalized = mode === 'room' ? normalizeRoom(query) : cleanText(query);
    if (!normalized) return [];

    if (mode === 'room') {
      const room = rooms.find((item) => normalizeRoom(item.roomNo) === normalized);
      return room ? room.members.map((member) => ({ ...member, roomNo: room.roomNo, building: room.building, floor: room.floor })) : [];
    }

    return roomRows.filter((row) => cleanText(row.name) === normalized);
  }, [mode, query, roomRows]);

  function submitSearch(event) {
    event.preventDefault();
    setSearched(true);
  }

  function useSample(value, nextMode) {
    setMode(nextMode);
    setQuery(value);
    setSearched(true);
  }

  const placeholder = mode === 'room' ? '예: 501 또는 A-301' : '예: 김민수';

  return (
    <section className="view workshop-view">
      <div className="section-heading">
        <h2>방배정 조회</h2>
        <p>방번호로 전체 명단을 보거나, 이름이 같은 참석자의 방번호를 확인합니다.</p>
      </div>

      <div className="segmented" role="tablist" aria-label="방배정 조회 방식">
        <button type="button" className={mode === 'room' ? 'active' : ''} onClick={() => { setMode('room'); setSearched(false); }}>
          방번호
        </button>
        <button type="button" className={mode === 'name' ? 'active' : ''} onClick={() => { setMode('name'); setSearched(false); }}>
          이름
        </button>
      </div>

      <form className="search-form" onSubmit={submitSearch}>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSearched(false);
          }}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button type="submit">조회</button>
      </form>

      <div className="sample-chips" aria-label="샘플 검색어">
        {rooms[0]?.roomNo && <button type="button" onClick={() => useSample(rooms[0].roomNo, 'room')}>{rooms[0].roomNo}</button>}
        {rooms[1]?.roomNo && <button type="button" onClick={() => useSample(rooms[1].roomNo, 'room')}>{rooms[1].roomNo}</button>}
        {duplicateName && <button type="button" onClick={() => useSample(duplicateName, 'name')}>{duplicateName}</button>}
      </div>

      <div className="result-panel">
        {!searched && (
          <p className="empty-state">조회어를 입력하면 결과가 표시됩니다.</p>
        )}

        {searched && results.length === 0 && (
          <p className="empty-state">일치하는 배정 정보가 없습니다.</p>
        )}

        {searched && results.length > 0 && mode === 'room' && (
          <>
            <div className="result-summary">
              <strong>{query}호</strong>
              <span>{results.length}명 배정</span>
            </div>
            <ul className="room-list">
              {results.map((person) => (
                <li key={`${person.roomNo}-${person.name}-${person.organization}`}>
                  <strong>{person.name}</strong>
                  <span>{person.organization} / {person.title}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {searched && results.length > 0 && mode === 'name' && (
          <ul className="name-results">
            {results.map((person) => (
              <li key={`${person.roomNo}-${person.name}-${person.organization}`}>
                <strong>{person.roomNo}호</strong>
                <span>{person.name} / {person.organization} / {person.title}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function ContactsView({ contacts }) {
  return (
    <section className="view workshop-view">
      <div className="section-heading">
        <h2>주요 연락처</h2>
        <p>응급 상황은 운영본부로 먼저 연락하고, 의료 지원이 필요한 경우 응급 담당자에게 연결합니다.</p>
      </div>

      <div className="contact-grid">
        {contacts.map((group) => (
          <section className="contact-group" key={group.category}>
            <h3>{group.category}</h3>
            <ul>
              {group.items.map((item) => (
                <li key={`${group.category}-${item.label}`}>
                  <div>
                    <strong>{item.label}</strong>
                    <span>{item.name}</span>
                    <small>{item.note}</small>
                  </div>
                  <a href={`tel:${item.phone.replace(/-/g, '')}`}>{item.phone}</a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function NoticesView({ notices }) {
  return (
    <section className="view workshop-view">
      <div className="section-heading notice-heading">
        <div>
          <h2>긴급공지</h2>
          <p>최신 공지가 위에 표시됩니다.</p>
        </div>
        <NotificationControl />
      </div>

      <ul className="notice-list">
        {notices.map((notice) => (
          <li key={notice.id} className={notice.level === '긴급' ? 'urgent' : ''}>
            <div className="notice-topline">
              <span>{notice.level}</span>
              <time>{notice.time}</time>
            </div>
            <h3>{notice.title}</h3>
            <p>{notice.body}</p>
            <small>{notice.target}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [guidebook, setGuidebook] = useState(sampleGuidebookData);
  const [dataStatus, setDataStatus] = useState({
    state: 'loading',
    message: 'Google Sheet 연결 중',
  });

  async function loadGuidebook({ force = false } = {}) {
    setDataStatus((current) => ({
      ...current,
      state: 'loading',
      message: force ? 'Google Sheet 새로고침 중' : 'Google Sheet 연결 중',
    }));

    try {
      const result = await fetchGuidebookData({ force });
      setGuidebook(result.data);
      setDataStatus({
        state: result.source === 'sample' ? 'sample' : 'ready',
        message: sourceLabel(result.source, result.cached),
      });
    } catch (error) {
      console.error('[guidebook] Google Sheet load failed:', error);
      setGuidebook(sampleGuidebookData);
      setDataStatus({
        state: 'error',
        message: 'Google Sheet 연결 실패, 샘플 데이터 표시 중',
      });
    }
  }

  useEffect(() => {
    loadGuidebook();
  }, []);

  return (
    <main className="app-shell">
      <TopBar eventInfo={guidebook.eventInfo} notices={guidebook.notices} setActiveTab={setActiveTab} />
      <TabBar activeTab={activeTab} setActiveTab={setActiveTab} />

      <DataStatus status={dataStatus} onRefresh={() => loadGuidebook({ force: true })} />

      {activeTab === 'schedule' && <ScheduleView scheduleDays={guidebook.scheduleDays} />}
      {activeTab === 'rooms' && <RoomView rooms={guidebook.rooms} />}
      {activeTab === 'contacts' && <ContactsView contacts={guidebook.contacts} />}
      {activeTab === 'notices' && <NoticesView notices={guidebook.notices} />}

      <footer className="app-footer">
        <strong>{guidebook.eventInfo.helpDesk}</strong>
        <span>{guidebook.eventInfo.helpDeskHours}</span>
      </footer>
    </main>
  );
}

function sourceLabel(source, cached) {
  const suffix = cached ? ' 캐시' : '';
  if (source === 'apps-script') return `Apps Script 연동${suffix}`;
  if (source === 'google-sheet') return `Google Sheet 연동${suffix}`;
  return '샘플 데이터';
}

function DataStatus({ status, onRefresh }) {
  return (
    <div className={`data-status ${status.state}`}>
      <span>{status.message}</span>
      <button type="button" onClick={onRefresh} disabled={status.state === 'loading'}>
        새로고침
      </button>
    </div>
  );
}
