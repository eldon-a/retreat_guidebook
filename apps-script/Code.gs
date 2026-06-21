/**
 * 수련회 가이드북 - Google Apps Script JSON API
 *
 * Google Sheet 탭:
 * - 기본정보: key, value
 * - 일정: day_id, day_label, date, time, title, place, type, note, visible
 * - 방배정: room_no, building, floor, name, organization, title, visible
 * - 연락처: category, label, name, phone, note, sort_order, visible
 * - 공지: notice_id, level, time, title, body, target, pinned, visible, push_status
 * - 게시글: post_id, created_at, board_type, author, title, body, status, hidden_reason
 * - 댓글: comment_id, post_id, created_at, author, body, status, hidden_reason
 */

const CONFIG = {
  SPREADSHEET_ID: '1E1Im2a8NGb9JFuD5mvVYxtNbeSyDKw-YxTlMPxp5XPs',
  CACHE_SECONDS: 30,
  SHEETS: {
    BASIC: '기본정보',
    SCHEDULE: '일정',
    ROOMS: '방배정',
    CONTACTS: '연락처',
    NOTICES: '공지',
    POSTS: '게시글',
    COMMENTS: '댓글',
  },
  BOARD_TYPES: ['notice', 'free', 'lost', 'qna'],
  POST_HEADERS: ['post_id', 'created_at', 'board_type', 'author', 'title', 'body', 'status', 'hidden_reason'],
  COMMENT_HEADERS: ['comment_id', 'post_id', 'created_at', 'author', 'body', 'status', 'hidden_reason'],
  BANNED_WORDS: [
    '씨발',
    '시발',
    '병신',
    '개새끼',
    '좆',
    'fuck',
    'shit',
  ],
};

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'getGuidebook';
  return handleAction(action, e && e.parameter ? e.parameter : {});
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (error) {
    return json({ ok: false, error: 'invalid_json', message: error.message });
  }
  return handleAction(body.action || 'getGuidebook', body);
}

function handleAction(action, payload) {
  try {
    switch (action) {
      case 'getGuidebook':
        return json({ ok: true, data: getGuidebook(), updatedAt: new Date().toISOString() });
      case 'getBoard':
        return json({ ok: true, data: getBoard(), updatedAt: new Date().toISOString() });
      case 'createPost':
        return json({ ok: true, data: createPost(payload), updatedAt: new Date().toISOString() });
      case 'createComment':
        return json({ ok: true, data: createComment(payload), updatedAt: new Date().toISOString() });
      case 'ping':
        return json({ ok: true, service: 'retreat-guidebook-api', now: new Date().toISOString() });
      default:
        return json({ ok: false, error: 'unknown_action', action });
    }
  } catch (error) {
    return json({ ok: false, error: 'server_error', message: error.message, stack: error.stack });
  }
}

function getBoard() {
  ensureBoardSheets();
  const comments = getBoardComments();
  const posts = getBoardPosts();
  return { posts, comments };
}

function getBoardPosts() {
  return readObjects(CONFIG.SHEETS.POSTS)
    .filter(isBoardItemVisible)
    .map((row, index) => ({
      id: clean(row.post_id) || 'post-' + (index + 1),
      createdAt: clean(row.created_at),
      boardType: clean(row.board_type) || 'free',
      author: clean(row.author) || '익명',
      title: clean(row.title),
      body: clean(row.body),
      _index: index,
    }))
    .filter((post) => post.title && post.body)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b._index - a._index)
    .map((post) => {
      delete post._index;
      return post;
    });
}

function getBoardComments() {
  return readObjects(CONFIG.SHEETS.COMMENTS)
    .filter(isBoardItemVisible)
    .map((row, index) => ({
      id: clean(row.comment_id) || 'comment-' + (index + 1),
      postId: clean(row.post_id),
      createdAt: clean(row.created_at),
      author: clean(row.author) || '익명',
      body: clean(row.body),
      _index: index,
    }))
    .filter((comment) => comment.postId && comment.body)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a._index - b._index)
    .map((comment) => {
      delete comment._index;
      return comment;
    });
}

function createPost(payload) {
  ensureBoardSheets();
  validateWritePassword(payload.password);

  const boardType = clean(payload.boardType || payload.board_type || 'free');
  if (CONFIG.BOARD_TYPES.indexOf(boardType) === -1) {
    throw new Error('게시판 종류가 올바르지 않습니다.');
  }

  const author = limitText(clean(payload.author) || '익명', 20, '작성자');
  const title = limitText(clean(payload.title), 80, '제목');
  const body = limitText(clean(payload.body), 1000, '내용');
  if (!title || !body) throw new Error('제목과 내용을 입력해 주세요.');
  rejectBannedWords([author, title, body]);

  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.POSTS);
  sheet.appendRow([
    makeId('post'),
    formatNow(),
    boardType,
    author,
    title,
    body,
    'visible',
    '',
  ]);

  return getBoard();
}

function createComment(payload) {
  ensureBoardSheets();
  validateWritePassword(payload.password);

  const postId = clean(payload.postId || payload.post_id);
  const author = limitText(clean(payload.author) || '익명', 20, '작성자');
  const body = limitText(clean(payload.body), 500, '댓글');
  if (!postId || !body) throw new Error('댓글 대상과 내용을 입력해 주세요.');
  rejectBannedWords([author, body]);

  const postExists = getBoardPosts().some((post) => post.id === postId);
  if (!postExists) throw new Error('댓글을 달 게시글을 찾을 수 없습니다.');

  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.COMMENTS);
  sheet.appendRow([
    makeId('comment'),
    postId,
    formatNow(),
    author,
    body,
    'visible',
    '',
  ]);

  return getBoard();
}

function getGuidebook() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('guidebook_v1');
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (error) {
      // Ignore broken cache and rebuild below.
    }
  }

  const data = {
    eventInfo: getEventInfo(),
    scheduleDays: getScheduleDays(),
    rooms: getRooms(),
    contacts: getContacts(),
    notices: getNotices(),
  };

  try {
    cache.put('guidebook_v1', JSON.stringify(data), CONFIG.CACHE_SECONDS);
  } catch (error) {
    // CacheService can reject large payloads; the API should still work.
  }

  return data;
}

function getEventInfo() {
  const rows = readObjects(CONFIG.SHEETS.BASIC);
  const info = {};
  rows.forEach((row) => {
    const key = clean(row.key);
    if (key) info[key] = clean(row.value);
  });
  return info;
}

function getScheduleDays() {
  const rows = readObjects(CONFIG.SHEETS.SCHEDULE).filter(isVisible);
  const dayMap = {};
  const order = [];

  rows.forEach((row) => {
    const id = clean(row.day_id);
    if (!id) return;
    if (!dayMap[id]) {
      dayMap[id] = {
        id,
        label: clean(row.day_label),
        date: clean(row.date),
        sessions: [],
      };
      order.push(id);
    }

    dayMap[id].sessions.push({
      time: clean(row.time),
      title: clean(row.title),
      place: clean(row.place),
      type: clean(row.type) || 'main',
      note: clean(row.note),
    });
  });

  return order.map((id) => dayMap[id]);
}

function getRooms() {
  const rows = readObjects(CONFIG.SHEETS.ROOMS).filter(isVisible);
  const roomMap = {};
  const order = [];

  rows.forEach((row) => {
    const roomNo = clean(row.room_no);
    const name = clean(row.name);
    if (!roomNo || !name) return;

    if (!roomMap[roomNo]) {
      roomMap[roomNo] = {
        roomNo,
        building: clean(row.building),
        floor: clean(row.floor),
        members: [],
      };
      order.push(roomNo);
    }

    roomMap[roomNo].members.push({
      name,
      organization: clean(row.organization),
      title: clean(row.title),
    });
  });

  return order.map((roomNo) => roomMap[roomNo]);
}

function getContacts() {
  const rows = readObjects(CONFIG.SHEETS.CONTACTS)
    .filter(isVisible)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const catA = clean(a.row.category);
      const catB = clean(b.row.category);
      if (catA !== catB) return catA.localeCompare(catB, 'ko');
      const orderA = Number(clean(a.row.sort_order)) || 9999;
      const orderB = Number(clean(b.row.sort_order)) || 9999;
      return orderA - orderB || a.index - b.index;
    });

  const categoryMap = {};
  const order = [];

  rows.forEach(({ row }) => {
    const category = clean(row.category);
    const label = clean(row.label);
    if (!category || !label) return;

    if (!categoryMap[category]) {
      categoryMap[category] = { category, items: [] };
      order.push(category);
    }

    categoryMap[category].items.push({
      label,
      name: clean(row.name),
      phone: clean(row.phone),
      note: clean(row.note),
    });
  });

  return order.map((category) => categoryMap[category]);
}

function getNotices() {
  return readObjects(CONFIG.SHEETS.NOTICES)
    .filter(isVisible)
    .map((row, index) => ({
      id: clean(row.notice_id) || 'notice-' + (index + 1),
      level: clean(row.level) || '공지',
      time: clean(row.time),
      title: clean(row.title),
      body: clean(row.body),
      target: clean(row.target),
      pinned: clean(row.pinned).toUpperCase() === 'Y',
      pushStatus: clean(row.push_status),
      _index: index,
    }))
    .filter((notice) => notice.title)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a._index - b._index)
    .map((notice) => {
      delete notice._index;
      return notice;
    });
}

function ensureBoardSheets() {
  ensureSheet(CONFIG.SHEETS.POSTS, CONFIG.POST_HEADERS);
  ensureSheet(CONFIG.SHEETS.COMMENTS, CONFIG.COMMENT_HEADERS);
}

function ensureSheet(sheetName, headers) {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const firstRow = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn() || 1)).getDisplayValues()[0];
  const hasHeaders = firstRow.some((value) => clean(value));
  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return;
  }

  const existing = firstRow.map(clean);
  headers.forEach((header) => {
    if (existing.indexOf(header) === -1) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
    }
  });
}

function readObjects(sheetName) {
  const sheet = getSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error('시트 "' + sheetName + '"를 찾을 수 없습니다.');

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0].map(clean);
  return values.slice(1).map((row) => {
    const object = {};
    headers.forEach((header, index) => {
      if (header) object[header] = clean(row[index]);
    });
    return object;
  });
}

function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function isVisible(row) {
  const value = clean(row.visible).toUpperCase();
  return !value || value === 'Y' || value === 'YES' || value === 'TRUE' || value === '1';
}

function isBoardItemVisible(row) {
  const status = clean(row.status).toLowerCase();
  const visible = clean(row.visible).toUpperCase();
  if (status === 'hidden' || status === 'deleted' || status === 'blocked') return false;
  if (visible === 'N' || visible === 'NO' || visible === 'FALSE' || visible === '0') return false;
  return true;
}

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function limitText(value, maxLength, label) {
  if (value.length > maxLength) {
    throw new Error(label + '은(는) ' + maxLength + '자 이하로 입력해 주세요.');
  }
  return value;
}

function rejectBannedWords(values) {
  const joined = values.join(' ').toLowerCase();
  const found = CONFIG.BANNED_WORDS.find((word) => joined.indexOf(String(word).toLowerCase()) !== -1);
  if (found) {
    throw new Error('금칙어가 포함되어 있습니다.');
  }
}

function validateWritePassword(input) {
  const password = PropertiesService.getScriptProperties().getProperty('BOARD_WRITE_PASSWORD');
  if (!password) {
    throw new Error('게시판 작성 비밀번호가 설정되지 않았습니다.');
  }
  if (String(input || '') !== password) {
    throw new Error('작성 비밀번호가 맞지 않습니다.');
  }
}

function makeId(prefix) {
  return prefix + '-' + Utilities.getUuid();
}

function formatNow() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy.MM.dd HH:mm');
}

function clearGuidebookCache() {
  CacheService.getScriptCache().remove('guidebook_v1');
  SpreadsheetApp.getUi().alert('가이드북 캐시를 비웠습니다.');
}

function setupBoardSheets() {
  ensureBoardSheets();
  SpreadsheetApp.getUi().alert('게시글/댓글 시트를 준비했습니다.');
}

function setBoardWritePassword() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('게시판 작성 비밀번호 설정', '참석자가 글/댓글 작성 시 입력할 비밀번호를 입력하세요.', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;

  const password = clean(response.getResponseText());
  if (!password) {
    ui.alert('비밀번호가 비어 있습니다.');
    return;
  }

  PropertiesService.getScriptProperties().setProperty('BOARD_WRITE_PASSWORD', password);
  ui.alert('게시판 작성 비밀번호를 설정했습니다.');
}

function showApiUrl() {
  const url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert(
    '가이드북 API URL\n\n' + url + '\n\n' +
    'React .env.local 에 아래처럼 등록할 수 있습니다.\n' +
    'VITE_GUIDEBOOK_API_URL=' + url
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('가이드북')
    .addItem('API URL 보기', 'showApiUrl')
    .addItem('가이드북 캐시 비우기', 'clearGuidebookCache')
    .addSeparator()
    .addItem('게시판 시트 만들기', 'setupBoardSheets')
    .addItem('게시판 작성 비밀번호 설정', 'setBoardWritePassword')
    .addToUi();
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
