import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { scrypt } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha256.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { ApiError, selectOne, supabaseFetch } from './supabase.js';

const COOKIE_NAME = 'stoktakip_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function requireSession(request, env) {
  const session = await readSession(request, env);
  if (!session?.is_admin && !session?.sube_id) {
    throw new ApiError('Giriş gerekli', 401);
  }
  if (session?.sube_id) {
    const sube = await selectOne(env, `/subeler?id=eq.${encodeURIComponent(session.sube_id)}&limit=1`);
    checkSubeAccess(sube);

    const calisanlar = await supabaseFetch(
      env,
      `/calisanlar?sube_id=eq.${encodeURIComponent(session.sube_id)}&aktif=eq.true&select=id&limit=1`
    );
    if (calisanlar.length > 0 && !session.calisan_id) {
      throw new ApiError('Çalışan şifresi gerekli', 401, { employee_login_required: true });
    }
    if (session.calisan_id) {
      const calisan = await selectOne(
        env,
        `/calisanlar?id=eq.${encodeURIComponent(session.calisan_id)}&sube_id=eq.${encodeURIComponent(session.sube_id)}&aktif=eq.true&limit=1`
      );
      if (!calisan) {
        throw new ApiError('Çalışan şifresi gerekli', 401, { employee_login_required: true });
      }
    }
  }
  return session;
}

export async function requireAdmin(request, env) {
  const session = await requireSession(request, env);
  if (!session.is_admin) {
    throw new ApiError('Bu işlem için admin girişi gerekli', 403);
  }
  return session;
}

export async function readSession(request, env) {
  const value = cookieValue(request, COOKIE_NAME);
  if (!value) return null;
  const [payloadB64, signature] = value.split('.');
  if (!payloadB64 || !signature) return null;
  const expected = await sign(payloadB64, env);
  if (!timingSafeEqual(signature, expected)) return null;
  const payload = JSON.parse(base64UrlDecode(payloadB64));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export async function sessionCookie(session, env) {
  const payload = {
    ...session,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = await sign(payloadB64, env);
  return `${COOKIE_NAME}=${payloadB64}.${signature}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=None`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`;
}

export async function verifyWerkzeugHash(storedHash, password) {
  if (!storedHash || !password) return false;
  const parts = String(storedHash).split('$');
  if (parts.length !== 3) return false;
  const [method, salt, expectedHex] = parts;
  const passwordBytes = utf8ToBytes(String(password));
  const saltBytes = utf8ToBytes(salt);
  let actualHex = '';

  if (method.startsWith('scrypt:')) {
    const [, nText, rText, pText] = method.split(':');
    actualHex = bytesToHex(scrypt(passwordBytes, saltBytes, {
      N: Number(nText),
      r: Number(rText),
      p: Number(pText),
      dkLen: expectedHex.length / 2,
    }));
  } else if (method.startsWith('pbkdf2:sha256:')) {
    const iterations = Number(method.split(':')[2]);
    actualHex = bytesToHex(pbkdf2(sha256, passwordBytes, saltBytes, {
      c: iterations,
      dkLen: expectedHex.length / 2,
    }));
  } else {
    return false;
  }

  return timingSafeEqual(actualHex, expectedHex);
}

export function generateWerkzeugHash(password) {
  const salt = randomSalt(16);
  const passwordBytes = utf8ToBytes(String(password));
  const saltBytes = utf8ToBytes(salt);
  const method = 'scrypt:32768:8:1';
  const hashHex = bytesToHex(scrypt(passwordBytes, saltBytes, {
    N: 32768,
    r: 8,
    p: 1,
    dkLen: 64,
  }));
  return `${method}$${salt}$${hashHex}`;
}

export function checkSubeAccess(sube) {
  if (!sube) throw new ApiError('Şube bulunamadı', 404);
  if (sube.aktif === false) throw new ApiError('Bu şube geçici olarak bloke edilmiştir.', 403);
  if (sube.bloke_bitis) {
    const until = new Date(sube.bloke_bitis);
    if (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()) {
      throw new ApiError(`Bu şube ${formatDateTR(sube.bloke_bitis)} tarihine kadar bloke edilmiştir.`, 403);
    }
  }
}

export async function allowedBranchId(request, env, requestedSubeId = null) {
  const session = await requireSession(request, env);
  const requested = asInt(requestedSubeId);
  if (session.is_admin) return requested;
  const active = asInt(session.sube_id);
  if (!active) throw new ApiError('Giriş gerekli', 401);
  if (requested && requested !== active) throw new ApiError('Bu şube için yetkiniz yok', 403);
  const sube = await selectOne(env, `/subeler?id=eq.${encodeURIComponent(active)}&limit=1`);
  checkSubeAccess(sube);
  return active;
}

function asInt(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function formatDateTR(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul' }).format(d);
}

async function sign(payloadB64, env) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SESSION_SECRET || ''),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function cookieValue(request, name) {
  const cookie = request.headers.get('cookie') || '';
  return cookie.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || '';
}

function base64UrlEncode(text) {
  return base64UrlEncodeBytes(new TextEncoder().encode(text));
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(text) {
  const normalized = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function timingSafeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function randomSalt(length) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = '';
  for (const byte of bytes) result += alphabet[byte % alphabet.length];
  return result;
}
