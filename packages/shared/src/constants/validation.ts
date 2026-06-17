// Validation rules and patterns

export const VALIDATION = {
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  USERNAME_REGEX: /^[a-zA-Z0-9_-]{3,20}$/,
  SLUG_REGEX: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  PASSWORD_MIN_LENGTH: 6,
  PASSWORD_MAX_LENGTH: 128,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 20,
  TITLE_MAX_LENGTH: 255,
  EXCERPT_MAX_LENGTH: 500,
} as const;

export const VALIDATION_MESSAGES = {
  EMAIL_INVALID: 'Invalid email address',
  USERNAME_INVALID: 'Username must be 3-20 characters and contain only letters, numbers, hyphens, and underscores',
  PASSWORD_SHORT: 'Password must be at least 6 characters',
  PASSWORD_LONG: 'Password must be no more than 128 characters',
  TITLE_LONG: 'Title must be no more than 255 characters',
  REQUIRED_FIELD: 'This field is required',
  SLUG_INVALID: 'Slug must contain only lowercase letters, numbers, and hyphens',
} as const;
