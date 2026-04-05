(function () {
  if (typeof firebase === "undefined" || !window.FIREBASE_WEB_CONFIG) return;
  if (firebase.apps && firebase.apps.length) return;
  firebase.initializeApp(window.FIREBASE_WEB_CONFIG);
})();
