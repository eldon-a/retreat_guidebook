const ALLOWED_SHEETS = new Set(['기본정보', '일정', '방배정', '연락처', '공지']);
const SHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;

async function proxyGoogleSheet(requestUrl) {
  const sheetId = String(requestUrl.searchParams.get('id') || '').trim();
  const sheetName = String(requestUrl.searchParams.get('sheet') || '').trim();

  if (!SHEET_ID_PATTERN.test(sheetId) || !ALLOWED_SHEETS.has(sheetName)) {
    return Response.json({ ok: false, message: '잘못된 Sheet 요청입니다.' }, { status: 400 });
  }

  const googleUrl = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
  googleUrl.searchParams.set('tqx', 'out:csv');
  googleUrl.searchParams.set('sheet', sheetName);

  try {
    const response = await fetch(googleUrl, {
      headers: { Accept: 'text/csv' },
      redirect: 'follow',
    });

    if (!response.ok) {
      return Response.json(
        { ok: false, message: `Google Sheet 조회 실패: HTTP ${response.status}` },
        { status: 502 }
      );
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Cache-Control': 'public, max-age=30',
        'X-Guidebook-Source': 'google-sheet',
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, message: error?.message || 'Google Sheet 연결에 실패했습니다.' },
      { status: 502 }
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/sheets') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      return proxyGoogleSheet(url);
    }

    return env.ASSETS.fetch(request);
  },
};
