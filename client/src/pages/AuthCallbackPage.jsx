import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../features/auth/auth-context";

export function AuthCallbackPage() {
  const { completeOAuthLogin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const didFinishRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function finishLogin() {
      if (didFinishRef.current) {
        return;
      }

      didFinishRef.current = true;
      const callbackError = searchParams.get("error");
      const token = searchParams.get("token");
      const serializedUser = searchParams.get("user");

      if (callbackError) {
        setError(callbackError);
        return;
      }

      if (!token) {
        setError("Google не вернул токен входа");
        return;
      }

      try {
        let callbackUser = null;

        if (serializedUser) {
          try {
            callbackUser = JSON.parse(serializedUser);
          } catch {
            callbackUser = null;
          }
        }

        await completeOAuthLogin(token, callbackUser);
        navigate("/dashboard", { replace: true });
      } catch (requestError) {
        setError(requestError.message);
      }
    }

    finishLogin();
  }, [completeOAuthLogin, navigate, searchParams]);

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">QuizRoom</p>
        <h1>Вход через Google</h1>
        {error ? (
          <>
            <p className="error-text">{error}</p>
            <Link className="primary-button" to="/login">
              Вернуться ко входу
            </Link>
          </>
        ) : (
          <p className="muted">Завершаем вход...</p>
        )}
      </section>
    </main>
  );
}
