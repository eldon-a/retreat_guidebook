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
 * - 첨부파일: attachment_id, post_id, comment_id, created_at, uploader, file_name, mime_type, size_bytes, drive_file_id, download_url, status, hidden_reason
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
    ATTACHMENTS: '첨부파일',
  },
  BOARD_TYPES: ['notice', 'free', 'lost', 'qna'],
  POST_HEADERS: ['post_id', 'created_at', 'board_type', 'author', 'title', 'body', 'status', 'hidden_reason'],
  COMMENT_HEADERS: ['comment_id', 'post_id', 'created_at', 'author', 'body', 'status', 'hidden_reason'],
  ATTACHMENT_HEADERS: ['attachment_id', 'post_id', 'comment_id', 'created_at', 'uploader', 'file_name', 'mime_type', 'size_bytes', 'drive_file_id', 'download_url', 'status', 'hidden_reason'],
  MAX_ATTACHMENT_BYTES: 5 * 1024 * 1024,
  ALLOWED_ATTACHMENT_EXTENSIONS: [
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'hwp',
    'hwpx',
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'txt',
    'zip',
  ],
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
  const attachments = getBoardAttachments();
  const comments = getBoardComments();
  const posts = getBoardPosts();
  return { posts, comments, attachments };
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

function getBoardAttachments() {
  return readObjects(CONFIG.SHEETS.ATTACHMENTS)
    .filter(isBoardItemVisible)
    .map((row, index) => ({
      id: clean(row.attachment_id) || 'attachment-' + (index + 1),
      postId: clean(row.post_id),
      commentId: clean(row.comment_id),
      createdAt: clean(row.created_at),
      uploader: clean(row.uploader) || '익명',
      fileName: clean(row.file_name),
      mimeType: clean(row.mime_type),
      sizeBytes: Number(clean(row.size_bytes)) || 0,
      driveFileId: clean(row.drive_file_id),
      downloadUrl: clean(row.download_url),
      _index: index,
    }))
    .filter((attachment) => attachment.fileName && attachment.downloadUrl)
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a._index - b._index)
    .map((attachment) => {
      delete attachment._index;
      return attachment;
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

  const postId = makeId('post');
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.POSTS);
  sheet.appendRow([
    postId,
    formatNow(),
    boardType,
    author,
    title,
    body,
    'visible',
    '',
  ]);

  saveAttachmentIfPresent(payload.attachment, { postId: postId, commentId: '', uploader: author });

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

  const commentId = makeId('comment');
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.COMMENTS);
  sheet.appendRow([
    commentId,
    postId,
    formatNow(),
    author,
    body,
    'visible',
    '',
  ]);

  saveAttachmentIfPresent(payload.attachment, { postId: postId, commentId: commentId, uploader: author });

  return getBoard();
}

function saveAttachmentIfPresent(attachment, context) {
  if (!attachment) return;

  ensureBoardSheets();

  const fileName = limitText(clean(attachment.fileName || attachment.file_name), 160, '첨부파일명');
  const mimeType = clean(attachment.mimeType || attachment.mime_type) || 'application/octet-stream';
  const sizeBytes = Number(attachment.sizeBytes || attachment.size_bytes) || 0;
  const base64 = clean(attachment.base64);

  if (!fileName || !base64) {
    throw new Error('첨부파일 정보가 올바르지 않습니다.');
  }
  if (sizeBytes > CONFIG.MAX_ATTACHMENT_BYTES) {
    throw new Error('첨부파일은 5MB 이하만 업로드할 수 있습니다.');
  }
  validateAttachmentExtension(fileName);

  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > CONFIG.MAX_ATTACHMENT_BYTES) {
    throw new Error('첨부파일은 5MB 이하만 업로드할 수 있습니다.');
  }

  const folder = getAttachmentFolder();
  const file = folder.createFile(Utilities.newBlob(bytes, mimeType, fileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const driveFileId = file.getId();
  const downloadUrl = 'https://drive.google.com/uc?export=download&id=' + encodeURIComponent(driveFileId);
  const sheet = getSpreadsheet().getSheetByName(CONFIG.SHEETS.ATTACHMENTS);
  sheet.appendRow([
    makeId('attachment'),
    context.postId || '',
    context.commentId || '',
    formatNow(),
    context.uploader || '익명',
    fileName,
    mimeType,
    String(bytes.length),
    driveFileId,
    downloadUrl,
    'visible',
    '',
  ]);
}

function validateAttachmentExtension(fileName) {
  const parts = fileName.toLowerCase().split('.');
  const extension = parts.length > 1 ? parts.pop() : '';
  if (CONFIG.ALLOWED_ATTACHMENT_EXTENSIONS.indexOf(extension) === -1) {
    throw new Error('허용되지 않는 첨부파일 형식입니다.');
  }
}

function getAttachmentFolder() {
  const properties = PropertiesService.getScriptProperties();
  const existingFolderId = clean(properties.getProperty('BOARD_ATTACHMENT_FOLDER_ID'));
  if (existingFolderId) {
    try {
      return DriveApp.getFolderById(existingFolderId);
    } catch (error) {
      // Fall through and create a new folder below.
    }
  }

  const folder = DriveApp.createFolder('수련회 게시판 첨부파일');
  properties.setProperty('BOARD_ATTACHMENT_FOLDER_ID', folder.getId());
  return folder;
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
  ensureSheet(CONFIG.SHEETS.ATTACHMENTS, CONFIG.ATTACHMENT_HEADERS);
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
  getAttachmentFolder();
  SpreadsheetApp.getUi().alert('게시글/댓글/첨부파일 시트와 Drive 첨부파일 폴더를 준비했습니다.');
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
