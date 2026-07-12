import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

async function removeConflictingAppServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const workers = [registration?.active, registration?.waiting, registration?.installing];
    const hasAppWorker = workers.some((worker) => {
      if (!worker?.scriptURL) return false;
      return new URL(worker.scriptURL).pathname === '/service-worker.js';
    });

    if (registration && hasAppWorker) {
      await registration.unregister();
    }
  } catch (error) {
    console.warn('[service-worker] conflict cleanup failed', error);
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
  let rejectInit;
  window.__oneSignalInitPromise = new Promise((resolve, reject) => {
    rejectInit = reject;
    const timeoutId = window.setTimeout(() => {
      reject(new Error('OneSignal SDK initialization timed out'));
    }, 30000);

    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await removeConflictingAppServiceWorker();
        await OneSignal.init({
          appId: oneSignalAppId,
        });
        window.clearTimeout(timeoutId);
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
  script.src = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
  script.defer = true;
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
