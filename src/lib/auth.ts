import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, lt } from 'drizzle-orm';
import { db, dbReady, sessions, users, type User } from '@/db';
import { randomId, verifyPassword } from './crypto';

const COOKIE = 'bf_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function signIn(email: string, password: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
  if (!user || !verifyPassword(password, user.passwordHash)) return null;

  const id = randomId(32);
  await db.insert(sessions).values({
    id,
    userId: user.id,
    expiresAt: new Date(Date.now() + MAX_AGE * 1000),
  });
  const store = await cookies();
  store.set(COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
  // Opportunistic cleanup of anything already expired.
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return user;
}

export async function signOut() {
  const store = await cookies();
  const id = store.get(COOKIE)?.value;
  if (id) await db.delete(sessions).where(eq(sessions.id, id));
  store.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  await dbReady();
  const store = await cookies();
  const id = store.get(COOKIE)?.value;
  if (!id) return null;
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id));
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return row.user;
}

/** Use at the top of every admin server component / action. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect('/admin/login');
  return user;
}

export async function hasAnyUser(): Promise<boolean> {
  await dbReady();
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return !!row;
}
