import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'zahid5104';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '10d';

class JWTUtils {
  static generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'resort-backend',
      audience: 'resort-admin'
    });
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET, {
        issuer: 'resort-backend',
        audience: 'resort-admin'
      });
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  static extractTokenFromHeader(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Authorization header missing or invalid');
    }
    return authHeader.substring(7);
  }
}

export default JWTUtils;