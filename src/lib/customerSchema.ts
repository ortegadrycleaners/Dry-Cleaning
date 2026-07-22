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

// Teléfono EE. UU.: 10 dígitos, puede incluir código de área con paréntesis, guiones o espacios
const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/, 
    "Invalid phone number (Ex: 787-555-1234)"
  );

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
