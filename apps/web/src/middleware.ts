import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_EXACT_PATHS = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/search',
  '/profiles',
  '/categories',
];
const PUBLIC_PREFIX_PATHS = ['/profiles/', '/categories/'];
const ADMIN_PATHS = ['/admin'];

// --- i18n locale detection ---
const SUPPORTED_LOCALES = ['pt-BR', 'en-US'];
const DEFAULT_LOCALE = 'pt-BR';
const JWT_ALGORITHM = 'HS256';

type JwtPayload = {
  sub?: string;
  role?: string;
  exp?: number;
};

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function base64UrlDecode(base64Url: string): string {
  return new TextDecoder().decode(base64UrlToUint8Array(base64Url));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  }

  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function verifyJwtSignature(
  token: string,
  secret: string,
): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [headerPart, payloadPart, signaturePart] = parts;

  let header: { alg?: string };
  let payload: JwtPayload;

  try {
    header = JSON.parse(base64UrlDecode(headerPart)) as { alg?: string };
    payload = JSON.parse(base64UrlDecode(payloadPart)) as JwtPayload;
  } catch {
    return null;
  }

  if (header.alg !== JWT_ALGORITHM) {
    return null;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    toArrayBuffer(base64UrlToUint8Array(signaturePart)),
    toArrayBuffer(new TextEncoder().encode(`${headerPart}.${payloadPart}`)),
  );

  if (!isValid) {
    return null;
  }

  return payload;
}

function detectLocale(request: NextRequest): string {
  // 1. Check cookie
  const cookieLocale = request.cookies.get('locale')?.value;
  if (cookieLocale && SUPPORTED_LOCALES.includes(cookieLocale)) {
    return cookieLocale;
  }

  // 2. Parse Accept-Language header
  const acceptLang = request.headers.get('accept-language');
  if (acceptLang) {
    const languages = acceptLang
      .split(',')
      .map((part) => {
        const [lang, quality] = part.trim().split(';q=');
        return { lang: lang.trim(), q: quality ? parseFloat(quality) : 1.0 };
      })
      .sort((a, b) => b.q - a.q);

    for (const { lang } of languages) {
      if (SUPPORTED_LOCALES.includes(lang)) return lang;
      const prefix = lang.split('-')[0].toLowerCase();
      const match = SUPPORTED_LOCALES.find((l) => l.toLowerCase().startsWith(prefix));
      if (match) return match;
    }
  }

  return DEFAULT_LOCALE;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- i18n: set locale cookie if not present ---
  const hasLocaleCookie = request.cookies.has('locale');
  const locale = detectLocale(request);

  const isPublicPath =
    PUBLIC_EXACT_PATHS.includes(pathname) ||
    PUBLIC_PREFIX_PATHS.some((prefix) => pathname.startsWith(prefix));

  // Allow public paths and static files
  if (
    isPublicPath ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    // Even for public paths, set the locale cookie if missing
    if (!hasLocaleCookie) {
      const response = NextResponse.next();
      response.cookies.set('locale', locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
      return response;
    }
    return NextResponse.next();
  }

  // Check for token in cookies (stored there for SSR access)
  const token = request.cookies.get('accessToken')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    const response = NextResponse.redirect(loginUrl);
    if (!hasLocaleCookie) {
      response.cookies.set('locale', locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
    }
    return response;
  }

  // Validate JWT signature and decode payload.
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('accessToken');
    return response;
  }

  const payload = await verifyJwtSignature(token, jwtSecret);
  if (!payload) {
    // Invalid token — clear the stale cookie and redirect to login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('accessToken');
    return response;
  }

  // Check if token has expired. Allow a small buffer (30s) to account for
  // clock skew between server and client. The client-side API client will
  // handle refresh; the middleware just prevents obviously stale tokens.
  if (payload.exp && payload.exp * 1000 < Date.now() - 30_000) {
    // Token is expired — let the client-side handle the refresh.
    // Don't redirect to login here because the client may still have a valid
    // refresh token and can silently refresh on the client side.
    // We clear the cookie so subsequent middleware checks don't see a stale token.
    const response = NextResponse.next();
    response.cookies.delete('accessToken');
    return response;
  }

  // For admin paths, check role
  if (ADMIN_PATHS.some(p => pathname.startsWith(p))) {
    if (payload.role !== 'admin' && payload.role !== 'moderator') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Set locale cookie on all responses if missing
  if (!hasLocaleCookie) {
    const response = NextResponse.next();
    response.cookies.set('locale', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
