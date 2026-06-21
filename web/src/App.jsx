import { useEffect, useMemo, useState } from 'react';
import {
  BOARD_TYPES,
  createBoardComment,
  createBoardPost,
  fetchBoardData,
  fetchGuidebookData,
  isBoardWritable,
  sampleBoardData,
  sampleGuidebookData,
} from './guidebookApi.js';

const tabs = [
  { id: 'schedule', label: '일정' },
  { id: 'rooms', label: '방배정' },
  { id: 'contacts', label: '연락처' },
  { id: 'notices', label: '긴급공지' },
  { id: 'board', label: '게시판' },
];

const localBannedWords = ['씨발', '시발', '병신', '개새끼', '좆', 'fuck', 'shit'];

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

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

async function getOneSignalClient() {
  if (typeof window === 'undefined' || !window.__oneSignalInitPromise) {
    throw new Error('OneSignal SDK is not configured');
  }

  return withTimeout(
    window.__oneSignalInitPromise,
    12000,
    'OneSignal SDK initialization timed out'
  );
}

function getOneSignalSubscriptionState(OneSignal) {
  const hasPermission = OneSignal.Notifications.permission;
  const optedIn = OneSignal.User.PushSubscription.optedIn;
  const subscriptionId = OneSignal.User.PushSubscription.id;
  const token = OneSignal.User.PushSubscription.token;

  return {
    hasPermission,
    optedIn,
    subscriptionId,
    token,
    isSubscribed: Boolean(hasPermission && optedIn && subscriptionId && token),
  };
}

async function waitForOneSignalSubscription(OneSignal) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 12000) {
    const state = getOneSignalSubscriptionState(OneSignal);
    if (state.isSubscribed) return state;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
  }

  return getOneSignalSubscriptionState(OneSignal);
}

function NotificationControl() {
  const oneSignalEnabled = Boolean(import.meta.env.VITE_ONESIGNAL_APP_ID);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [permission, setPermission] = useState(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return window.Notification.permission;
  });

  useEffect(() => {
    if (!oneSignalEnabled || typeof window === 'undefined') return;

    function syncSubscriptionState(OneSignal) {
      const state = getOneSignalSubscriptionState(OneSignal);

      setPermission(state.hasPermission ? 'granted' : window.Notification.permission);
      setIsSubscribed(state.isSubscribed);
      setStatusMessage(state.isSubscribed ? '푸시 구독이 등록되었습니다.' : '');

      if (state.subscriptionId || state.token) {
        console.info('[notifications] OneSignal subscription', {
          subscriptionId: state.subscriptionId,
          hasToken: Boolean(state.token),
          optedIn: state.optedIn,
        });
      }
    }

    getOneSignalClient().then((OneSignal) => {
      if (!OneSignal.Notifications.isPushSupported()) {
        setPermission('unsupported');
        return;
      }

      syncSubscriptionState(OneSignal);
      OneSignal.Notifications.addEventListener('permissionChange', (granted) => {
        setPermission(granted ? 'granted' : window.Notification.permission);
        syncSubscriptionState(OneSignal);
      });
      OneSignal.User.PushSubscription.addEventListener('change', () => {
        syncSubscriptionState(OneSignal);
      });
    }).catch((error) => {
      console.warn('[notifications] OneSignal initialization failed', error);
      setStatusMessage('알림 설정을 불러오지 못했습니다.');
    });
  }, [oneSignalEnabled]);

  async function requestPermission() {
    if (!('Notification' in window)) {
      setPermission('unsupported');
      return;
    }

    if (oneSignalEnabled) {
      setIsProcessing(true);
      setStatusMessage('');

      try {
        const OneSignal = await getOneSignalClient();

        if (!OneSignal.Notifications.isPushSupported()) {
          setPermission('unsupported');
          setStatusMessage('이 기기는 웹 푸시를 지원하지 않습니다.');
          return;
        }

        await withTimeout(
          Promise.resolve(OneSignal.User.PushSubscription.optIn()),
          15000,
          'OneSignal subscription timed out'
        );

        const state = await waitForOneSignalSubscription(OneSignal);
        setPermission(state.hasPermission ? 'granted' : window.Notification.permission);
        setIsSubscribed(state.isSubscribed);
        setStatusMessage(state.isSubscribed ? '푸시 구독이 등록되었습니다.' : '권한은 허용됐지만 구독 토큰이 아직 없습니다.');
        console.info('[notifications] OneSignal subscription', {
          subscriptionId: state.subscriptionId,
          hasToken: Boolean(state.token),
          optedIn: state.optedIn,
        });
      } catch (error) {
        console.warn('[notifications] OneSignal subscription failed', error);
        const message = error?.message ? `알림 설정 실패: ${error.message}` : '알림 설정 실패: 새로고침 후 다시 시도하세요.';
        setStatusMessage(message);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    const result = await window.Notification.requestPermission();
    setPermission(result);

    if (result === 'granted') {
      try {
        const registration = await getReadyServiceWorker();
        if (registration) {
          registration.showNotification('수련회 긴급공지 알림', {
            body: '알림 수신이 켜졌습니다.',
            tag: 'workshop-notification-test',
          });
          return;
        }
      } catch (e) {
        // Fall back to the browser notification constructor below.
      }
      new window.Notification('수련회 긴급공지 알림', {
        body: '알림 수신이 켜졌습니다.',
      });
    }
  }

  const label = isSubscribed
    ? '알림 등록됨'
    : {
        default: '알림 받기',
        granted: oneSignalEnabled ? '알림 등록하기' : '알림 허용됨',
        denied: '알림 차단됨',
        unsupported: '알림 미지원',
      }[permission] || '알림 받기';

  const disabled =
    isProcessing ||
    isSubscribed ||
    permission === 'denied' ||
    permission === 'unsupported' ||
    (!oneSignalEnabled && permission === 'granted');

  return (
    <div className="notification-control">
      <button
        className="notify-button"
        type="button"
        onClick={requestPermission}
        disabled={disabled}
      >
        {isProcessing ? '알림 설정 중' : label}
      </button>
      {statusMessage && <span className="notify-status">{statusMessage}</span>}
    </div>
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

function containsBannedWord(values) {
  const text = values.join(' ').toLowerCase();
  return localBannedWords.some((word) => text.includes(word.toLowerCase()));
}

function BoardView() {
  const writable = isBoardWritable();
  const [boardType, setBoardType] = useState('notice');
  const [board, setBoard] = useState(sampleBoardData);
  const [selectedPostId, setSelectedPostId] = useState(sampleBoardData.posts[0]?.id || '');
  const [status, setStatus] = useState({ state: 'loading', message: '게시판 불러오는 중' });
  const [password, setPassword] = useState('');
  const [postForm, setPostForm] = useState({ author: '', title: '', body: '' });
  const [commentForm, setCommentForm] = useState({ author: '', body: '' });
  const [isSaving, setIsSaving] = useState(false);

  async function loadBoard() {
    setStatus({ state: 'loading', message: '게시판 불러오는 중' });
    try {
      const result = await fetchBoardData();
      setBoard(result.data);
      setStatus({
        state: result.source === 'sample' ? 'sample' : 'ready',
        message: result.source === 'sample' ? '샘플 게시판 표시 중' : '게시판 연동 완료',
      });
    } catch (error) {
      console.error('[board] load failed:', error);
      setBoard(sampleBoardData);
      setStatus({ state: 'error', message: '게시판 연결 실패, 샘플 표시 중' });
    }
  }

  useEffect(() => {
    loadBoard();
  }, []);

  const posts = useMemo(
    () => board.posts.filter((post) => post.boardType === boardType),
    [board.posts, boardType]
  );
  const selectedPost = posts.find((post) => post.id === selectedPostId) || posts[0];
  const commentsByPost = useMemo(() => {
    const map = new Map();
    board.comments.forEach((comment) => {
      const list = map.get(comment.postId) || [];
      list.push(comment);
      map.set(comment.postId, list);
    });
    return map;
  }, [board.comments]);
  const selectedComments = selectedPost ? commentsByPost.get(selectedPost.id) || [] : [];

  useEffect(() => {
    if (!posts.length) {
      setSelectedPostId('');
      return;
    }
    if (!posts.some((post) => post.id === selectedPostId)) {
      setSelectedPostId(posts[0].id);
    }
  }, [posts, selectedPostId]);

  async function submitPost(event) {
    event.preventDefault();
    if (!writable) {
      setStatus({ state: 'error', message: '게시글 작성은 Apps Script API 연동 후 사용할 수 있습니다.' });
      return;
    }
    if (!password.trim()) {
      setStatus({ state: 'error', message: '작성 비밀번호를 입력해 주세요.' });
      return;
    }
    if (!postForm.title.trim() || !postForm.body.trim()) {
      setStatus({ state: 'error', message: '제목과 내용을 입력해 주세요.' });
      return;
    }
    if (containsBannedWord([postForm.author, postForm.title, postForm.body])) {
      setStatus({ state: 'error', message: '금칙어가 포함되어 있습니다.' });
      return;
    }

    setIsSaving(true);
    setStatus({ state: 'loading', message: '게시글 저장 중' });
    try {
      const data = await createBoardPost({
        boardType,
        author: postForm.author,
        title: postForm.title,
        body: postForm.body,
        password,
      });
      setBoard(data);
      setPostForm({ author: '', title: '', body: '' });
      setSelectedPostId(data.posts.find((post) => post.boardType === boardType)?.id || '');
      setStatus({ state: 'ready', message: '게시글을 등록했습니다.' });
    } catch (error) {
      setStatus({ state: 'error', message: error.message || '게시글 저장에 실패했습니다.' });
    } finally {
      setIsSaving(false);
    }
  }

  async function submitComment(event) {
    event.preventDefault();
    if (!selectedPost) return;
    if (!writable) {
      setStatus({ state: 'error', message: '댓글 작성은 Apps Script API 연동 후 사용할 수 있습니다.' });
      return;
    }
    if (!password.trim()) {
      setStatus({ state: 'error', message: '작성 비밀번호를 입력해 주세요.' });
      return;
    }
    if (!commentForm.body.trim()) {
      setStatus({ state: 'error', message: '댓글 내용을 입력해 주세요.' });
      return;
    }
    if (containsBannedWord([commentForm.author, commentForm.body])) {
      setStatus({ state: 'error', message: '금칙어가 포함되어 있습니다.' });
      return;
    }

    setIsSaving(true);
    setStatus({ state: 'loading', message: '댓글 저장 중' });
    try {
      const data = await createBoardComment({
        postId: selectedPost.id,
        author: commentForm.author,
        body: commentForm.body,
        password,
      });
      setBoard(data);
      setCommentForm({ author: '', body: '' });
      setStatus({ state: 'ready', message: '댓글을 등록했습니다.' });
    } catch (error) {
      setStatus({ state: 'error', message: error.message || '댓글 저장에 실패했습니다.' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="view workshop-view board-view">
      <div className="section-heading board-heading">
        <div>
          <h2>게시판</h2>
          <p>공지, 자유글, 분실물, 질문을 남기고 댓글로 답변합니다.</p>
        </div>
        <button type="button" className="secondary-button" onClick={loadBoard} disabled={status.state === 'loading'}>
          새로고침
        </button>
      </div>

      <div className={`data-status ${status.state}`}>
        <span>{status.message}</span>
        {!writable && <strong>작성 비활성</strong>}
      </div>

      <div className="board-layout">
        <section className="board-panel">
          <div className="board-type-tabs" role="tablist" aria-label="게시판 종류">
            {BOARD_TYPES.map((type) => {
              const count = board.posts.filter((post) => post.boardType === type.id).length;
              return (
                <button
                  key={type.id}
                  type="button"
                  className={boardType === type.id ? 'active' : ''}
                  onClick={() => setBoardType(type.id)}
                >
                  <span>{type.label}</span>
                  <small>{count}</small>
                </button>
              );
            })}
          </div>

          <ul className="post-list">
            {posts.length === 0 && (
              <li className="post-empty">등록된 게시글이 없습니다.</li>
            )}
            {posts.map((post) => (
              <li key={post.id}>
                <button
                  type="button"
                  className={selectedPost?.id === post.id ? 'active' : ''}
                  onClick={() => setSelectedPostId(post.id)}
                >
                  <strong>{post.title}</strong>
                  <span>{post.author} · {post.createdAt}</span>
                  <small>댓글 {commentsByPost.get(post.id)?.length || 0}</small>
                </button>
              </li>
            ))}
          </ul>

          <form className="board-form" onSubmit={submitPost}>
            <h3>게시글 작성</h3>
            <div className="form-grid">
              <input
                value={postForm.author}
                onChange={(event) => setPostForm((current) => ({ ...current, author: event.target.value }))}
                placeholder="작성자"
                maxLength={20}
              />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="작성 비밀번호"
                type="password"
                autoComplete="off"
              />
            </div>
            <input
              value={postForm.title}
              onChange={(event) => setPostForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="제목"
              maxLength={80}
            />
            <textarea
              value={postForm.body}
              onChange={(event) => setPostForm((current) => ({ ...current, body: event.target.value }))}
              placeholder="내용"
              maxLength={1000}
              rows={5}
            />
            <button type="submit" disabled={isSaving || !writable}>
              게시글 등록
            </button>
          </form>
        </section>

        <section className="post-detail">
          {!selectedPost && <p className="empty-state">게시글을 선택해 주세요.</p>}
          {selectedPost && (
            <>
              <article className="post-card">
                <div className="post-meta">
                  <span>{BOARD_TYPES.find((type) => type.id === selectedPost.boardType)?.label || '게시글'}</span>
                  <time>{selectedPost.createdAt}</time>
                </div>
                <h3>{selectedPost.title}</h3>
                <p>{selectedPost.body}</p>
                <small>{selectedPost.author}</small>
              </article>

              <div className="comments-block">
                <h3>댓글 {selectedComments.length}</h3>
                <ul className="comment-list">
                  {selectedComments.length === 0 && <li className="comment-empty">아직 댓글이 없습니다.</li>}
                  {selectedComments.map((comment) => (
                    <li key={comment.id}>
                      <div>
                        <strong>{comment.author}</strong>
                        <time>{comment.createdAt}</time>
                      </div>
                      <p>{comment.body}</p>
                    </li>
                  ))}
                </ul>

                <form className="board-form comment-form" onSubmit={submitComment}>
                  <h3>댓글 작성</h3>
                  <div className="form-grid">
                    <input
                      value={commentForm.author}
                      onChange={(event) => setCommentForm((current) => ({ ...current, author: event.target.value }))}
                      placeholder="작성자"
                      maxLength={20}
                    />
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="작성 비밀번호"
                      type="password"
                      autoComplete="off"
                    />
                  </div>
                  <textarea
                    value={commentForm.body}
                    onChange={(event) => setCommentForm((current) => ({ ...current, body: event.target.value }))}
                    placeholder="댓글 내용"
                    maxLength={500}
                    rows={4}
                  />
                  <button type="submit" disabled={isSaving || !writable}>
                    댓글 등록
                  </button>
                </form>
              </div>
            </>
          )}
        </section>
      </div>
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
      {activeTab === 'board' && <BoardView />}

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
