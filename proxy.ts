import { NextRequest, NextResponse } from "next/server";

const DEFAULT_ADMIN_USERNAME = "scott@nextlevellifts.co.uk";
const DEFAULT_ADMIN_PASSWORD = "C00perB00ts!";

function parseBasicCredentials(header: string | null) {
  if (!header?.startsWith("Basic ")) {
    return null;
  }

  const encoded = header.slice(6).trim();
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

function isAuthorizedBasicAuth(request: NextRequest) {
  const expectedUsername = process.env.ADMIN_BASIC_AUTH_USERNAME ?? DEFAULT_ADMIN_USERNAME;
  const expectedPassword = process.env.ADMIN_BASIC_AUTH_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
  const credentials = parseBasicCredentials(request.headers.get("authorization"));

  if (!credentials) {
    return false;
  }

  return (
    credentials.username === expectedUsername &&
    credentials.password === expectedPassword
  );
}

function challengeResponse() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Admin Area"',
    },
  });
}

export function proxy(request: NextRequest) {
  if (!isAuthorizedBasicAuth(request)) {
    return challengeResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/cms/:path*",
  ],
};
