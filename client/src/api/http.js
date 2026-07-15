import axios from "axios";

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  timeout: 20_000,
});

function getAuthorizationHeader(headers) {
  if (!headers) {
    return "";
  }

  if (typeof headers.get === "function") {
    return headers.get("Authorization") || headers.get("authorization") || "";
  }

  return headers.Authorization || headers.authorization || "";
}

function getBearerToken(headers) {
  const authorization = getAuthorizationHeader(headers);
  const [scheme, token] = String(authorization).split(" ");

  return scheme?.toLowerCase() === "bearer" ? token : "";
}

http.interceptors.request.use((config) => {
  const token = localStorage.getItem("quizroom_token");
  const requestToken = getBearerToken(config.headers);

  if (token && !requestToken) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const failedToken = getBearerToken(error.config?.headers);
      const currentToken = localStorage.getItem("quizroom_token");

      if (failedToken && failedToken === currentToken) {
        localStorage.removeItem("quizroom_token");
        localStorage.removeItem("quizroom_user");
        window.dispatchEvent(new Event("quizroom:auth-cleared"));
      }
    }

    const message = error.response?.data?.message || error.message || "Request failed";
    const requestError = new Error(message);
    requestError.status = error.response?.status;

    return Promise.reject(requestError);
  },
);
