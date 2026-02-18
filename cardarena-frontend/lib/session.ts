export const SESSION_TOKEN_KEY = "cardarena_token";
export const SESSION_ROLE_KEY = "cardarena_role";
export const SESSION_VIEW_ROLE_KEY = "cardarena_view_role";

export function saveSession(token: string, role: string) {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem(SESSION_ROLE_KEY, role);
  localStorage.removeItem(SESSION_VIEW_ROLE_KEY);
}

function isExpiredJwt(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) return true;
    const json = JSON.parse(atob(payload));
    const exp = Number(json.exp || 0);
    if (!exp) return true;
    return Date.now() >= exp * 1000;
  } catch {
    return true;
  }
}

export function getSession() {
  const token = localStorage.getItem(SESSION_TOKEN_KEY) || "";
  const role = localStorage.getItem(SESSION_ROLE_KEY) || "";
  const viewRole = localStorage.getItem(SESSION_VIEW_ROLE_KEY) || "";
  if (token && isExpiredJwt(token)) {
    clearSession();
    return { token: "", role: "", viewRole: "", activeRole: "" };
  }
  const activeRole =
    role === "ADMIN" && (viewRole === "ADMIN" || viewRole === "USER")
      ? viewRole
      : role;
  return { token, role, viewRole, activeRole };
}

export function clearSession() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_ROLE_KEY);
  localStorage.removeItem(SESSION_VIEW_ROLE_KEY);
}

export function setRoleView(viewRole: "ADMIN" | "USER") {
  localStorage.setItem(SESSION_VIEW_ROLE_KEY, viewRole);
}
