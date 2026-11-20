/** Product-wide settings. Change the name here and it updates everywhere. */
export const APP_NAME = "WorldNet News";
/** Short form for tight spots (phone masthead, home-screen label, "on WorldNet"). */
export const APP_SHORT = "WorldNet";
export const COMPANY = "Gleyde Technologies, LLC";
export const TAGLINE = "Say it. Read it. Debate it.";

export const LIMITS = {
  postChars: 500,
  /** Premium (Stage 3) will raise this. */
  premiumPostChars: 2000,
  imagesPerPost: 4,
  imageBytes: 8 * 1024 * 1024,
  editWindowMs: 15 * 60 * 1000,
  pollOptions: { min: 2, max: 4, chars: 40 },
  bioChars: 160,
  displayNameChars: 50,
  links: 4,
  altChars: 1000,
  feedPage: 20,
} as const;

/** Sliding-window rate limits: [max events, window in ms]. */
export const RATE_LIMITS = {
  post: [[5, 60_000], [60, 60 * 60_000]],
  signupPerIp: [[5, 60 * 60_000]],
  loginPerIp: [[20, 15 * 60_000]],
  report: [[20, 60 * 60_000]],
  follow: [[60, 60 * 60_000]],
  like: [[300, 60 * 60_000]],
} as const satisfies Record<string, readonly (readonly [number, number])[]>;

/**
 * Your personal logo, shown small and subtle in the site footer (a quiet
 * maker's mark). Put the file in /public/brand/ and set its path here,
 * e.g. "/brand/personal-logo.svg". null hides it.
 */
export const PERSONAL_LOGO: { src: string; alt: string; href?: string } | null = null;
