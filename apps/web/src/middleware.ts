import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/', '/login', '/register', '/search', '/profiles'];
const ADMIN_PATHS = ['/admin'];

// --- i18n locale detection ---
const SUPPORTED_LOCALES = ['pt-BR', 'en-US'];
const DEFAULT_LOCALE = 'pt-BR';

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- i18n: set locale cookie if not present ---
  const hasLocaleCookie = request.cookies.has('locale');
  const locale = detectLocale(request);

  // Allow public paths and static files
  if (
    PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith('/profiles/')) ||
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

  // For admin paths, decode the JWT and check role
  if (ADMIN_PATHS.some(p => pathname.startsWith(p))) {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString('utf-8'),
      );
      if (payload.role !== 'admin' && payload.role !== 'moderator') {
        return NextResponse.redirect(new URL('/', request.url));
      }
    } catch {
      // Invalid token — redirect to login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
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
