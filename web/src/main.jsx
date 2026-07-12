import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

async function removeConflictingAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    let removed = false;

    for (const registration of registrations) {
      const workers = [registration.active, registration.waiting, registration.installing];
      const hasAppWorker = workers.some((worker) => {
        if (!worker?.scriptURL) return false;
        return new URL(worker.scriptURL).pathname === '/service-worker.js';
      });
      const isLegacyOneSignalScope = new URL(registration.scope).pathname === '/push/onesignal/';

      if (hasAppWorker || isLegacyOneSignalScope) {
        removed = (await registration.unregister()) || removed;
      }
    }

    return removed;
  } catch (error) {
    console.warn('[service-worker] conflict cleanup failed', error);
    return false;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

const initPushNotifications = () => {
  const oneSignalAppId = import.meta.env.VITE_ONESIGNAL_APP_ID;

  if (!oneSignalAppId) {
    return;
  }

  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.__oneSignalInitStage = 'SDK 콜백 대기';
  let rejectInit;
  window.__oneSignalInitPromise = new Promise((resolve, reject) => {
    rejectInit = reject;
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`OneSignal SDK initialization timed out (${window.__oneSignalInitStage})`));
    }, 30000);

    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        window.__oneSignalInitStage = '기존 서비스 워커 정리';
        const removedConflictingWorker = await removeConflictingAppServiceWorker();
        const migrationKey = 'retreatGuidebook.oneSignalWorkerMigration.v1';

        if (removedConflictingWorker && !window.sessionStorage.getItem(migrationKey)) {
          window.sessionStorage.setItem(migrationKey, 'done');
          window.__oneSignalInitStage = '서비스 워커 전환 새로고침';
          window.location.reload();
          return;
        }

        window.sessionStorage.removeItem(migrationKey);
        window.__oneSignalInitStage = 'OneSignal 초기화';
        await OneSignal.init({
          appId: oneSignalAppId,
        });
        window.clearTimeout(timeoutId);
        window.__oneSignalInitStage = '완료';
        window.__oneSignal = OneSignal;
        resolve(OneSignal);
      } catch (error) {
        window.clearTimeout(timeoutId);
        window.__oneSignalInitError = error;
        reject(error);
      }
    });
  });

  const script = document.createElement('script');
  script.src = '/vendor/onesignal/OneSignalSDK.page.es6.js?v=160607';
  script.defer = true;
  script.onload = () => {
    if (window.__oneSignalInitStage === 'SDK 콜백 대기') {
      window.__oneSignalInitStage = 'SDK 로드 완료, 콜백 대기';
    }
  };
  script.onerror = () => {
    const error = new Error('OneSignal SDK script failed to load');
    window.__oneSignalInitError = error;
    rejectInit(error);
  };
  document.head.appendChild(script);
};

initPushNotifications();

// The current OneSignal "Typical Site" configuration owns the root scope.
// Registering the app cache worker at the same scope would replace it and
// break push initialization, especially in iOS Home Screen apps.
if ('serviceWorker' in navigator && import.meta.env.PROD && !import.meta.env.VITE_ONESIGNAL_APP_ID) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((error) => {
      console.warn('[service-worker] registration failed', error);
    });
  });
}
