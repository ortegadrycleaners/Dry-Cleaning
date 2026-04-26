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
  .min(2, "El nombre es requerido")
  .regex(/^[A-Za-zÁÉÍÓÚáéíóúÑñüÜ\s'-]+$/, "Solo letras y espacios")
  .transform(val => escapeHTML(val.replace(/\s+/g, " ")));

// Permitir letras, números, espacios, acentos y puntuación básica en notas
const notesSchema = z
  .string()
  .max(500, "Máx 500 caracteres")
  .regex(/^[A-Za-zÁÉÍÓÚáéíóúÑñüÜ0-9.,:;()\-\s'"!?¿¡\n]*$/, "Caracteres no permitidos en notas")
  .transform(val => escapeHTML(val.trim()));

// Teléfono PR: 10 dígitos, puede incluir paréntesis, guiones, espacios
const phoneSchema = z
  .string()
  .trim()
  .regex(
    /^(\(787\)|787|939|\(939\))[-.\s]?\d{3}[-.\s]?\d{4}$/,
    "Teléfono inválido (Ej: 787-555-1234)"
  );

export const customerSchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  notes: notesSchema.optional(),
});
