import { VALIDATION, VALIDATION_MESSAGES } from '../constants/validation';

export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!VALIDATION.EMAIL_REGEX.test(email)) {
    return { valid: false, error: VALIDATION_MESSAGES.EMAIL_INVALID };
  }
  return { valid: true };
}

export function validateUsername(username: string): { valid: boolean; error?: string } {
  if (!VALIDATION.USERNAME_REGEX.test(username)) {
    return { valid: false, error: VALIDATION_MESSAGES.USERNAME_INVALID };
  }
  return { valid: true };
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < VALIDATION.PASSWORD_MIN_LENGTH) {
    return { valid: false, error: VALIDATION_MESSAGES.PASSWORD_SHORT };
  }
  if (password.length > VALIDATION.PASSWORD_MAX_LENGTH) {
    return { valid: false, error: VALIDATION_MESSAGES.PASSWORD_LONG };
  }
  return { valid: true };
}
