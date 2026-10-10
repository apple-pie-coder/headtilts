import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { verifyAccessToken, JWTPayload } from '../utils/jwt';

// Module-level reference so services can push without holding the io instance.
let io: SocketIOServer | null = null;

const allowedOrigins = [
  process.env.ADMIN_URL || 'http://localhost:5173',
  process.env.WEB_URL || 'http://localhost:5173',
  'http://localhost:5174',
  ...(process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
].map((u) => { try { return new URL(u).origin; } catch { return u; } });

function isPrivateOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === 'localhost' ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname)
    );
  } catch { return false; }
}

function tokenFromSocket(socket: Socket): string | undefined {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth) return fromAuth;
  const header = socket.handshake.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

/**
 * Attach a Socket.IO server for real-time admin notifications. Each connection
 * is authenticated at the handshake (same JWT as the REST API) and joins a
 * room keyed by the user id, so notifications can be targeted per user.
 */
export function initRealtime(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: (origin, callback) => {
        // Private-network origins only in development (see CORS note in app.ts).
        const devPrivate = process.env.NODE_ENV !== 'production' && isPrivateOrigin(origin ?? '');
        if (!origin || allowedOrigins.includes(origin) || devPrivate) callback(null, true);
        else callback(new Error(`CORS: ${origin} not allowed`));
      },
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = tokenFromSocket(socket);
    if (!token) return next(new Error('UNAUTHORIZED'));
    const payload = verifyAccessToken(token);
    if (!payload) return next(new Error('UNAUTHORIZED'));
    (socket.data as { user: JWTPayload }).user = payload;
    next();
  });

  io.on('connection', (socket) => {
    const { user } = socket.data as { user: JWTPayload };
    socket.join(`user:${user.sub}`);
  });

  return io;
}

/** Push a notification to all of a user's open admin connections (if any). */
export function pushNotification(userId: string, notification: unknown): void {
  io?.to(`user:${userId}`).emit('notification', notification);
}
