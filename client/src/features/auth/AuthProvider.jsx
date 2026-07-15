import { useEffect, useMemo, useState } from "react";
import { http } from "../../api/http";
import { invalidateCached } from "../../api/queryCache";
import { AuthContext } from "./auth-context";

const TOKEN_STORAGE_KEY = "quizroom_token";
const USER_STORAGE_KEY = "quizroom_user";
const currentUserRequests = new Map();

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_STORAGE_KEY)) || null;
  } catch {
    localStorage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

function storeUser(user) {
  if (user) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function loadCurrentUser(token, attempts) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const { data } = await http.get("/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });

      return data.user;
    } catch (error) {
      const canRetry = error.status >= 500 || !error.status;

      if (!canRetry || attempt === attempts) {
        throw error;
      }

      await wait(Math.min(600 * attempt, 2_000));
    }
  }

  return null;
}

function getCurrentUser(token, attempts = 2) {
  if (currentUserRequests.has(token)) {
    return currentUserRequests.get(token);
  }

  const request = loadCurrentUser(token, attempts).finally(() => {
    if (currentUserRequests.get(token) === request) {
      currentUserRequests.delete(token);
    }
  });

  currentUserRequests.set(token, request);
  return request;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readStoredUser);
  const [isLoading, setIsLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_STORAGE_KEY)) && !readStoredUser());

  useEffect(() => {
    function clearAuthState() {
      setUser(null);
      setIsLoading(false);
    }

    window.addEventListener("quizroom:auth-cleared", clearAuthState);

    async function loadUser() {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);

      if (!token) {
        storeUser(null);
        setUser(null);
        setIsLoading(false);
        return;
      }

      const storedUser = readStoredUser();

      if (storedUser) {
        setUser(storedUser);
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await getCurrentUser(token);
        storeUser(currentUser);
        setUser(currentUser);
      } catch (error) {
        if (error.status === 401 && localStorage.getItem(TOKEN_STORAGE_KEY) === token) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          storeUser(null);
          setUser(null);
        }
      } finally {
        setIsLoading(false);
      }
    }

    loadUser();

    return () => {
      window.removeEventListener("quizroom:auth-cleared", clearAuthState);
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      async login(payload) {
        const { data } = await http.post("/auth/login", payload);
        invalidateCached();
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        storeUser(data.user);
        setUser(data.user);
        return data.user;
      },
      async register(payload) {
        const { data } = await http.post("/auth/register", payload);
        invalidateCached();
        localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
        storeUser(data.user);
        setUser(data.user);
        return data.user;
      },
      async completeOAuthLogin(token, callbackUser) {
        invalidateCached();
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
        const currentUser = callbackUser || (await getCurrentUser(token));
        storeUser(currentUser);
        setUser(currentUser);
        return currentUser;
      },
      async uploadAvatar(file) {
        const formData = new FormData();
        formData.append("image", file);

        const { data } = await http.post("/uploads/avatar", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        return data.imageUrl;
      },
      async updateProfile(payload) {
        const { data } = await http.patch("/profile", payload);
        storeUser(data.user);
        setUser(data.user);
        return data.user;
      },
      async deleteAccount() {
        await http.delete("/profile");
        invalidateCached();
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        storeUser(null);
        setUser(null);
      },
      logout() {
        invalidateCached();
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        storeUser(null);
        setUser(null);
      },
    }),
    [isLoading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
