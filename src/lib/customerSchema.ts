import { z } from "zod";

// Escape básico para evitar inyección HTML
export const escapeHTML = (str: string) =>
  str.replace(/[&<>"'`=\\/]/g, s =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "`": "&#96;",
      "=": "&#61;",
      "/": "&#47;",
      "\\": "&#92;",
    }[s] || s)
  );

// Permitir solo letras, espacios y acentos básicos en nombre
const nameSchema = z
  .string()
  .trim()
  .min(2, "Name is required")
  .regex(/^[A-Za-zÁÉÍÓÚáéíóúÑñüÜ\s'-]+$/, "Only letters and spaces allowed")
  .transform(val => escapeHTML(val.replace(/\s+/g, " ")));

// Permitir letras, números, espacios, acentos y puntuación básica en notas
const notesSchema = z
  .string()
  .max(500, "Max 500 characters")
  .regex(/^[A-Za-zÁÉÍÓÚáéíóúÑñüÜ0-9.,:;()\-\s'"!?¿¡\n]*$/, "Invalid characters in notes")
  .transform(val => escapeHTML(val.trim()));

// Teléfono EE. UU.: exactamente 10 dígitos locales (sin código de país).
// Validación escalonada para mensajes de error específicos y accionables.
const phoneSchema = z
  .string()
  .trim()
  .superRefine((val, ctx) => {
    const raw = val.trim();

    // Detectar si incluyeron el código de país +1 o 1-
    const hasCountryCode = /^\+1[\s\-.]?/.test(raw) || /^1[\s\-.]?\(?\d{3}\)?/.test(raw);
    const digits = raw.replace(/\D/g, '');

    if (hasCountryCode && digits.length === 11) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Don\'t include the country code (+1). Enter only the 10-digit local number (Ex: 787-555-1234).',
      });
      return;
    }

    if (digits.length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Too few digits — enter exactly 10 digits (you entered ${digits.length}).`,
      });
      return;
    }

    if (digits.length > 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Too many digits — enter exactly 10 digits (you entered ${digits.length}).`,
      });
      return;
    }

    // Validar código de área: no puede empezar en 0 ni 1
    const areaCode = digits.slice(0, 3);
    if (areaCode[0] === '0' || areaCode[0] === '1') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `"${areaCode}" is not a valid US area code. Area codes cannot start with 0 or 1.`,
      });
      return;
    }
  });

export const customerSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  notes: notesSchema.optional(),
  smsConsent: z.boolean().refine(val => val === true, "You must accept the consent"),
  termsConsent: z.boolean().refine(val => val === true, "You must accept the Terms and Privacy Policy"),
});

export const customerDraftSchema = customerSchema.omit({
  smsConsent: true,
  termsConsent: true,
});
