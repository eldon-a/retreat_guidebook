import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

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
    }, 12000);

    window.OneSignalDeferred.push(async (OneSignal) => {
      try {
        await OneSignal.init({
          appId: oneSignalAppId,
          serviceWorkerPath: 'push/onesignal/OneSignalSDKWorker.js',
          serviceWorkerParam: { scope: '/push/onesignal/' },
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

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((error) => {
      console.warn('[service-worker] registration failed', error);
    });
  });
}
