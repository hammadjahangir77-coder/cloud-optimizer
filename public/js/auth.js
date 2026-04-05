(function () {
  var TOKEN_KEY = "finnura_token";
  var USER_KEY = "finnura_user_json";

  function apiUrl(path) {
    var base =
      typeof window !== "undefined" && window.API_BASE_URL
        ? String(window.API_BASE_URL).trim().replace(/\/$/, "")
        : "";
    path = path.charAt(0) === "/" ? path : "/" + path;
    return base ? base + path : path;
  }

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function setSession(token, user) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch (e) {}
  }

  var API_UNAVAILABLE =
    "No API at this address. Static hosting (e.g. Firebase) cannot run /api. In the project folder run npm start, then open the login URL from the terminal (usually http://localhost:3000/login.html).";

  function parseJsonResponse(r) {
    return r.text().then(function (body) {
      var s = (body || "").trim();
      if (!s) {
        throw new Error(API_UNAVAILABLE);
      }
      if (s.charAt(0) === "<") {
        throw new Error(API_UNAVAILABLE);
      }
      try {
        return JSON.parse(s);
      } catch (e) {
        throw new Error(API_UNAVAILABLE);
      }
    });
  }

  window.CloudResearchAuth = {
    apiUrl: apiUrl,
    getToken: getToken,
    parseJsonResponse: parseJsonResponse,
    getUser: function () {
      try {
        var raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },
    isLoggedIn: function () {
      return !!getToken();
    },
    setSession: setSession,
    logout: function () {
      setSession(null, null);
      window.location.href = "login.html";
    },
    validateSession: function () {
      var t = getToken();
      if (!t) return Promise.resolve(false);
      return fetch(apiUrl("/api/auth/me"), {
        headers: { Authorization: "Bearer " + t },
      })
        .then(function (r) {
          return parseJsonResponse(r).then(function (data) {
            if (!r.ok) {
              setSession(null, null);
              return false;
            }
            try {
              localStorage.setItem(
                USER_KEY,
                JSON.stringify({ id: data.id, username: data.username })
              );
            } catch (e) {}
            return true;
          });
        })
        .catch(function () {
          setSession(null, null);
          return false;
        });
    },
    apiFetch: function (path, options) {
      options = options || {};
      var headers = Object.assign({}, options.headers || {});
      var tok = getToken();
      if (tok) headers.Authorization = "Bearer " + tok;
      if (
        options.body &&
        typeof options.body === "string" &&
        !headers["Content-Type"]
      ) {
        headers["Content-Type"] = "application/json";
      }
      return fetch(apiUrl(path), Object.assign({}, options, { headers: headers }));
    },
  };
})();
