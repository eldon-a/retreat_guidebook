/**
 * 워크샵 가이드북 - Google Apps Script JSON API
 *
 * Google Sheet 탭:
 * - 기본정보: key, value
 * - 일정: day_id, day_label, date, time, title, place, type, note, visible
 * - 방배정: room_no, building, floor, name, organization, title, visible
 * - 연락처: category, label, name, phone, note, sort_order, visible
 * - 공지: notice_id, level, time, title, body, target, pinned, visible, push_status
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
  },
};

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'getGuidebook';
  return handleAction(action);
}

function doPost(e) {
  let body = {};
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (error) {
    return json({ ok: false, error: 'invalid_json', message: error.message });
  }
  return handleAction(body.action || 'getGuidebook');
}

function handleAction(action) {
  try {
    switch (action) {
      case 'getGuidebook':
        return json({ ok: true, data: getGuidebook(), updatedAt: new Date().toISOString() });
      case 'ping':
        return json({ ok: true, service: 'retreat-guidebook-api', now: new Date().toISOString() });
      default:
        return json({ ok: false, error: 'unknown_action', action });
    }
  } catch (error) {
    return json({ ok: false, error: 'server_error', message: error.message, stack: error.stack });
  }
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

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function clearGuidebookCache() {
  CacheService.getScriptCache().remove('guidebook_v1');
  SpreadsheetApp.getUi().alert('가이드북 캐시를 비웠습니다.');
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
    .addToUi();
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
