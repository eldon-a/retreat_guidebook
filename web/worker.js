const ALLOWED_SHEETS = new Set(['기본정보', '일정', '방배정', '연락처', '공지']);
const SHEET_ID_PATTERN = /^[A-Za-z0-9_-]{20,}$/;
const ONESIGNAL_SDK_FILES = {
  '/vendor/onesignal/OneSignalSDK.page.es6.js':
    'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.es6.js?v=160607',
  '/vendor/onesignal/OneSignalSDK.sw.js':
    'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js?v=160607',
};

async function proxyOneSignalSdk(requestUrl) {
  const sdkUrl = ONESIGNAL_SDK_FILES[requestUrl.pathname];
  if (!sdkUrl) return new Response('Not Found', { status: 404 });

  try {
    const response = await fetch(sdkUrl, { redirect: 'follow' });
    if (!response.ok) {
      return new Response(`OneSignal SDK upstream error: ${response.status}`, { status: 502 });
    }

    const origin = requestUrl.origin;
    const source = (await response.text())
      .replaceAll('https://api.onesignal.com/', `${origin}/vendor/onesignal/api/`)
      .replaceAll('https://onesignal.com/api/v1/', `${origin}/vendor/onesignal/legacy-api/`);

    return new Response(source, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    return new Response(error?.message || 'OneSignal SDK proxy failed', { status: 502 });
  }
}

async function proxyOneSignalApi(request, requestUrl) {
  const isLegacy = requestUrl.pathname.startsWith('/vendor/onesignal/legacy-api/');
  const prefix = isLegacy ? '/vendor/onesignal/legacy-api/' : '/vendor/onesignal/api/';
  const upstreamBase = isLegacy ? 'https://onesignal.com/api/v1/' : 'https://api.onesignal.com/';
  const upstreamUrl = new URL(requestUrl.pathname.slice(prefix.length) + requestUrl.search, upstreamBase);
  const headers = new Headers(request.headers);
  headers.set('Origin', requestUrl.origin);
  headers.delete('Host');

  try {
    const response = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'follow',
    });
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Cache-Control', 'no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return Response.json(
      { errors: [error?.message || 'OneSignal API proxy failed'] },
      { status: 502 }
    );
  }
}

async function proxyGoogleSheet(requestUrl) {
  const sheetId = String(requestUrl.searchParams.get('id') || '').trim();
  const sheetName = String(requestUrl.searchParams.get('sheet') || '').trim();

  if (!SHEET_ID_PATTERN.test(sheetId) || !ALLOWED_SHEETS.has(sheetName)) {
    return Response.json({ ok: false, message: '잘못된 Sheet 요청입니다.' }, { status: 400 });
  }

  const googleUrl = new URL(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq`);
  googleUrl.searchParams.set('tqx', 'out:csv');
  googleUrl.searchParams.set('sheet', sheetName);
  googleUrl.searchParams.set('headers', '1');

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

    if (ONESIGNAL_SDK_FILES[url.pathname]) {
      return proxyOneSignalSdk(url);
    }

    if (
      url.pathname.startsWith('/vendor/onesignal/api/') ||
      url.pathname.startsWith('/vendor/onesignal/legacy-api/')
    ) {
      return proxyOneSignalApi(request, url);
    }

    if (url.pathname === '/api/sheets') {
      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      return proxyGoogleSheet(url);
    }

    return env.ASSETS.fetch(request);
  },
};
