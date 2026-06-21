import { sampleBoardData, sampleGuidebookData } from './sampleData.js';

const GUIDEBOOK_API_URL = (import.meta.env.VITE_GUIDEBOOK_API_URL || '').trim();
const GOOGLE_SHEET_ID = (import.meta.env.VITE_GOOGLE_SHEET_ID || '').trim();
const CACHE_KEY = 'retreatGuidebook.data.v1';
const CACHE_TTL_MS = 60 * 1000;

export const BOARD_TYPES = [
  { id: 'notice', label: '공지형' },
  { id: 'free', label: '자유' },
  { id: 'lost', label: '분실물' },
  { id: 'qna', label: '질문' },
];

const SHEET_NAMES = {
  basic: '기본정보',
  schedule: '일정',
  rooms: '방배정',
  contacts: '연락처',
  notices: '공지',
};

function normalize(value) {
  return String(value ?? '').trim();
}

function isVisible(row) {
  const value = normalize(row.visible).toUpperCase();
  return !value || value === 'Y' || value === 'YES' || value === 'TRUE' || value === '1';
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map((header) => normalize(header));
  return rows.slice(1).map((row) => {
    const item = {};
    headers.forEach((header, index) => {
      if (header) item[header] = normalize(row[index]);
    });
    return item;
  });
}

async function fetchCsvSheet(sheetId, sheetName) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
  url.searchParams.set('tqx', 'out:csv');
  url.searchParams.set('sheet', sheetName);
  url.searchParams.set('cacheBust', String(Date.now()));

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error(`${sheetName} 시트 조회 실패: HTTP ${response.status}`);
  }

  return rowsToObjects(parseCsv(await response.text()));
}

async function fetchFromGoogleSheet(sheetId) {
  const [basicRows, scheduleRows, roomRows, contactRows, noticeRows] = await Promise.all([
    fetchCsvSheet(sheetId, SHEET_NAMES.basic),
    fetchCsvSheet(sheetId, SHEET_NAMES.schedule),
    fetchCsvSheet(sheetId, SHEET_NAMES.rooms),
    fetchCsvSheet(sheetId, SHEET_NAMES.contacts),
    fetchCsvSheet(sheetId, SHEET_NAMES.notices),
  ]);

  return normalizeGuidebookData({
    eventInfo: basicRows,
    scheduleRows,
    roomRows,
    contactRows,
    noticeRows,
  });
}

async function fetchFromAppsScript(apiUrl) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'getGuidebook');
  url.searchParams.set('cacheBust', String(Date.now()));

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error(`가이드북 API 조회 실패: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.ok || !data.data) {
    throw new Error(data.message || '가이드북 API 응답이 올바르지 않습니다.');
  }

  return data.data;
}

async function fetchBoardFromAppsScript(apiUrl) {
  const url = new URL(apiUrl);
  url.searchParams.set('action', 'getBoard');
  url.searchParams.set('cacheBust', String(Date.now()));

  const response = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error(`게시판 API 조회 실패: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.ok || !data.data) {
    throw new Error(data.message || '게시판 API 응답이 올바르지 않습니다.');
  }

  return normalizeBoardData(data.data);
}

function normalizeGuidebookData(raw) {
  const eventInfo = normalizeEventInfo(raw.eventInfo);
  const scheduleDays = normalizeSchedule(raw.scheduleRows);
  const rooms = normalizeRooms(raw.roomRows);
  const contacts = normalizeContacts(raw.contactRows);
  const notices = normalizeNotices(raw.noticeRows);

  return { eventInfo, scheduleDays, rooms, contacts, notices };
}

function normalizeEventInfo(rows) {
  if (!Array.isArray(rows)) return sampleGuidebookData.eventInfo;

  const info = {};
  rows.forEach((row) => {
    const key = normalize(row.key);
    if (key) info[key] = normalize(row.value);
  });

  return {
    ...sampleGuidebookData.eventInfo,
    ...info,
  };
}

function normalizeSchedule(rows) {
  if (!Array.isArray(rows)) return sampleGuidebookData.scheduleDays;

  const dayMap = new Map();
  rows.filter(isVisible).forEach((row) => {
    const id = normalize(row.day_id);
    if (!id) return;

    if (!dayMap.has(id)) {
      dayMap.set(id, {
        id,
        label: normalize(row.day_label),
        date: normalize(row.date),
        sessions: [],
      });
    }

    dayMap.get(id).sessions.push({
      time: normalize(row.time),
      title: normalize(row.title),
      place: normalize(row.place),
      type: normalize(row.type) || 'main',
      note: normalize(row.note),
    });
  });

  const scheduleDays = Array.from(dayMap.values());
  return scheduleDays.length ? scheduleDays : sampleGuidebookData.scheduleDays;
}

function normalizeRooms(rows) {
  if (!Array.isArray(rows)) return sampleGuidebookData.rooms;

  const roomMap = new Map();
  rows.filter(isVisible).forEach((row) => {
    const roomNo = normalize(row.room_no);
    const name = normalize(row.name);
    if (!roomNo || !name) return;

    if (!roomMap.has(roomNo)) {
      roomMap.set(roomNo, {
        roomNo,
        building: normalize(row.building),
        floor: normalize(row.floor),
        members: [],
      });
    }

    roomMap.get(roomNo).members.push({
      name,
      organization: normalize(row.organization),
      title: normalize(row.title),
    });
  });

  const rooms = Array.from(roomMap.values());
  return rooms.length ? rooms : sampleGuidebookData.rooms;
}

function normalizeContacts(rows) {
  if (!Array.isArray(rows)) return sampleGuidebookData.contacts;

  const contactMap = new Map();
  rows
    .filter(isVisible)
    .map((row, index) => ({ ...row, _index: index }))
    .sort((a, b) => {
      const categoryCompare = normalize(a.category).localeCompare(normalize(b.category), 'ko');
      if (categoryCompare) return categoryCompare;
      const orderA = Number(normalize(a.sort_order)) || 9999;
      const orderB = Number(normalize(b.sort_order)) || 9999;
      return orderA - orderB || a._index - b._index;
    })
    .forEach((row) => {
      const category = normalize(row.category);
      const label = normalize(row.label);
      if (!category || !label) return;

      if (!contactMap.has(category)) {
        contactMap.set(category, { category, items: [] });
      }

      contactMap.get(category).items.push({
        label,
        name: normalize(row.name),
        phone: normalize(row.phone),
        note: normalize(row.note),
      });
    });

  const contacts = Array.from(contactMap.values());
  return contacts.length ? contacts : sampleGuidebookData.contacts;
}

function normalizeNotices(rows) {
  if (!Array.isArray(rows)) return sampleGuidebookData.notices;

  const notices = rows
    .filter(isVisible)
    .map((row, index) => ({
      id: normalize(row.notice_id) || `notice-${index + 1}`,
      level: normalize(row.level) || '공지',
      time: normalize(row.time),
      title: normalize(row.title),
      body: normalize(row.body),
      target: normalize(row.target),
      pinned: normalize(row.pinned).toUpperCase() === 'Y',
      pushStatus: normalize(row.push_status),
      _index: index,
    }))
    .filter((notice) => notice.title)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a._index - b._index)
    .map(({ _index, ...notice }) => notice);

  return notices.length ? notices : sampleGuidebookData.notices;
}

function normalizeBoardData(raw) {
  const comments = Array.isArray(raw.comments)
    ? raw.comments.map((comment, index) => ({
        id: normalize(comment.id || comment.comment_id) || `comment-${index + 1}`,
        postId: normalize(comment.postId || comment.post_id),
        createdAt: normalize(comment.createdAt || comment.created_at),
        author: normalize(comment.author) || '익명',
        body: normalize(comment.body),
      })).filter((comment) => comment.postId && comment.body)
    : sampleBoardData.comments;

  const posts = Array.isArray(raw.posts)
    ? raw.posts.map((post, index) => ({
        id: normalize(post.id || post.post_id) || `post-${index + 1}`,
        boardType: normalize(post.boardType || post.board_type) || 'free',
        createdAt: normalize(post.createdAt || post.created_at),
        author: normalize(post.author) || '익명',
        title: normalize(post.title),
        body: normalize(post.body),
      })).filter((post) => post.title && post.body)
    : sampleBoardData.posts;

  return {
    posts,
    comments,
  };
}

async function postToAppsScript(payload) {
  if (!GUIDEBOOK_API_URL) {
    throw new Error('게시판 작성은 Apps Script API 연동 후 사용할 수 있습니다.');
  }

  const response = await fetch(GUIDEBOOK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    credentials: 'omit',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`게시판 저장 실패: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.message || '게시판 저장에 실패했습니다.');
  }

  return data;
}

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.savedAt < CACHE_TTL_MS) return cached;
  } catch (e) {
    // Ignore broken cache payloads.
  }
  return null;
}

function writeCache(source, data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ source, data, savedAt: Date.now() }));
  } catch (e) {
    // Ignore storage quota or privacy-mode failures.
  }
}

export async function fetchGuidebookData({ force = false } = {}) {
  if (!force) {
    const cached = readCache();
    if (cached) {
      return { source: cached.source, data: cached.data, cached: true };
    }
  }

  if (GUIDEBOOK_API_URL) {
    const data = await fetchFromAppsScript(GUIDEBOOK_API_URL);
    writeCache('apps-script', data);
    return { source: 'apps-script', data, cached: false };
  }

  if (GOOGLE_SHEET_ID) {
    const data = await fetchFromGoogleSheet(GOOGLE_SHEET_ID);
    writeCache('google-sheet', data);
    return { source: 'google-sheet', data, cached: false };
  }

  return { source: 'sample', data: sampleGuidebookData, cached: false };
}

export async function fetchBoardData() {
  if (GUIDEBOOK_API_URL) {
    const data = await fetchBoardFromAppsScript(GUIDEBOOK_API_URL);
    return { source: 'apps-script', data };
  }

  return { source: 'sample', data: sampleBoardData };
}

export async function createBoardPost({ boardType, author, title, body, password }) {
  const result = await postToAppsScript({
    action: 'createPost',
    boardType,
    author,
    title,
    body,
    password,
  });
  return normalizeBoardData(result.data || sampleBoardData);
}

export async function createBoardComment({ postId, author, body, password }) {
  const result = await postToAppsScript({
    action: 'createComment',
    postId,
    author,
    body,
    password,
  });
  return normalizeBoardData(result.data || sampleBoardData);
}

export function isBoardWritable() {
  return Boolean(GUIDEBOOK_API_URL);
}

export { sampleBoardData, sampleGuidebookData };
