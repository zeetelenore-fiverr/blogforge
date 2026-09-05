import { NextResponse, type NextRequest } from 'next/server';

/**
 * Server components cannot read the current path directly, and the admin
 * sidebar needs it to mark the active link. Session checks stay in the pages
 * themselves (they need database access, which the edge runtime does not have).
 */
export function middleware(req: NextRequest) {
  const headers = new Headers(req.headers);
  headers.set('x-pathname', req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ['/admin/:path*'],
};
