const DEFAULT_ADMIN_USERNAME = "scott@nextlevellifts.co.uk";
const DEFAULT_ADMIN_PASSWORD = "C00perB00ts!";

function parseBasicAuthorization(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Basic ")) {
    return null;
  }

  const encoded = authorizationHeader.slice(6).trim();
  if (!encoded) {
    return null;
  }

  try {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

function hasValidBasicAuthorization(request: Request) {
  const expectedUsername = process.env.ADMIN_BASIC_AUTH_USERNAME ?? DEFAULT_ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_BASIC_AUTH_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  const credentials = parseBasicAuthorization(request.headers.get("authorization"));

  if (!credentials) {
    return false;
  }

  return (
    credentials.username === expectedUsername &&
    credentials.password === expectedPassword
  );
}

function hasValidAdminToken(request: Request) {
  const configuredToken = process.env.ORDER_ADMIN_TOKEN;
  if (!configuredToken) {
    return false;
  }

  const headerToken = request.headers.get("x-admin-token");
  return headerToken === configuredToken;
}

export function isAuthorizedRequest(request: Request) {
  return hasValidAdminToken(request) || hasValidBasicAuthorization(request);
}
