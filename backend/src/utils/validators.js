const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const AADHAR_REGEX = /^\d{12}$/;
const NAME_REGEX = /^[A-Za-z]+(?: [A-Za-z]+)*$/;

/**
 * Validate email format.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Validate Indian mobile number (10 digits, starts with 6-9).
 * Accepts optional +91 / 91 prefix.
 * @param {string | number} mobile
 * @returns {boolean}
 */
export function isValidIndianMobile(mobile) {
  if (mobile === null || mobile === undefined) return false;

  let digits = String(mobile).replace(/[\s-]/g, '');

  if (digits.startsWith('+91')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  }

  return MOBILE_REGEX.test(digits);
}

/**
 * Validate PAN format (ABCDE1234F).
 * @param {string} pan
 * @returns {boolean}
 */
export function isValidPAN(pan) {
  if (typeof pan !== 'string') return false;
  return PAN_REGEX.test(pan.trim().toUpperCase());
}

/**
 * Validate Aadhar number (exactly 12 digits).
 * @param {string | number} aadhar
 * @returns {boolean}
 */
export function isValidAadhar(aadhar) {
  if (aadhar === null || aadhar === undefined) return false;
  const digits = String(aadhar).replace(/\s/g, '');
  return AADHAR_REGEX.test(digits);
}

/**
 * Validate full name (min 3 chars, alphabets + spaces only).
 * @param {string} name
 * @returns {boolean}
 */
export function isValidFullName(name) {
  if (typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 3 && NAME_REGEX.test(trimmed);
}

export const validators = {
  email: isValidEmail,
  mobile: isValidIndianMobile,
  pan: isValidPAN,
  aadhar: isValidAadhar,
  fullName: isValidFullName,
};
