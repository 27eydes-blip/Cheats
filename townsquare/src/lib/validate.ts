import { BEATS, isAccent, MAX_BEATS, type Beat } from "./profile-theme";
import { z } from "zod";
import { LIMITS } from "@/config";
import { cleanText, safeHttpUrl } from "./text";

const RESERVED = new Set([
  "admin", "api", "app", "auth", "bookmarks", "communities", "explore", "help", "home", "legal",
  "live", "login", "logout", "me", "mod", "moderator", "news", "notifications", "p", "post",
  "root", "search", "settings", "signup", "support", "system", "u", "staff", "official",
]);

export const handleSchema = z
  .string()
  .trim()
  .min(3, "Handle must be at least 3 characters.")
  .max(20, "Handle can be at most 20 characters.")
  .regex(/^[A-Za-z0-9_]+$/, "Handle can use letters, numbers, and underscores only.")
  .refine((h) => !RESERVED.has(h.toLowerCase()), "That handle is reserved.");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(200, "Password is too long.");

export const displayNameSchema = z
  .string()
  .transform(cleanText)
  .pipe(
    z.string().min(1, "Display name is required.").max(LIMITS.displayNameChars, `Display name can be at most ${LIMITS.displayNameChars} characters.`),
  );

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  handle: handleSchema,
  displayName: displayNameSchema,
  ageConfirmed: z.literal(true, { errorMap: () => ({ message: "You must be 13 or older to join." }) }),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: "Please accept the Terms and Community Guidelines." }) }),
});

export const linkSchema = z.object({
  label: z.string().transform(cleanText).pipe(z.string().max(30)),
  url: z
    .string()
    .trim()
    .max(300)
    .transform((u, ctx) => {
      const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
      const safe = safeHttpUrl(withScheme);
      if (!safe) ctx.addIssue({ code: "custom", message: "Links must be valid web addresses." });
      return safe ?? "";
    }),
});

export const profileSchema = z.object({
  displayName: displayNameSchema,
  bio: z.string().transform(cleanText).pipe(z.string().max(LIMITS.bioChars, `Bio can be at most ${LIMITS.bioChars} characters.`)),
  links: z.array(linkSchema).max(LIMITS.links),
  location: z.string().transform(cleanText).pipe(z.string().max(60, "Location can be at most 60 characters.")).optional().default(""),
  beats: z.array(z.string()).optional().default([]).transform((b) => [...new Set(b.filter((x): x is Beat => x in BEATS))].slice(0, MAX_BEATS)),
  accent: z.string().optional().default("blue").transform((a) => (isAccent(a) ? a : "blue")),
});

export const pollSchema = z.object({
  options: z
    .array(z.string().transform(cleanText).pipe(z.string().min(1, "Poll options can't be empty.").max(LIMITS.pollOptions.chars)))
    .min(LIMITS.pollOptions.min, "A poll needs at least 2 options.")
    .max(LIMITS.pollOptions.max, "A poll can have at most 4 options."),
  durationHours: z.number().int().min(1).max(24 * 7),
});

export const REPORT_REASONS = {
  spam: "Spam or scam",
  harassment: "Harassment or bullying",
  threat: "Threats or violence",
  hate: "Hateful conduct",
  doxxing: "Sharing private information",
  sexual_minor: "Sexual content involving a minor",
  illegal: "Illegal goods or services",
  impersonation: "Impersonation",
  self_harm: "Self-harm or suicide",
  other: "Something else",
} as const;

export const reportSchema = z.object({
  targetType: z.enum(["post", "user"]),
  targetId: z.string().min(1).max(64),
  reason: z.enum(Object.keys(REPORT_REASONS) as [keyof typeof REPORT_REASONS, ...(keyof typeof REPORT_REASONS)[]]),
  details: z.string().transform(cleanText).pipe(z.string().max(1000)),
});
