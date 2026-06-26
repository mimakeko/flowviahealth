export type EmailBrand = {
  name: string;
  legalName: string;
  logoInitial: string;
  tagline: string;
  website: string;
  infoEmail: string;
  supportEmail: string;
  accentColor: string;
};

export type EmailField = {
  label: string;
  value: string;
};

export type EmailSection = {
  label: string;
  value: string;
};

export type RenderedEmail = {
  html: string;
  text: string;
};

const colors = {
  page: "#f3f6fb",
  card: "#ffffff",
  soft: "#f8fafc",
  border: "#d9e2ec",
  text: "#1f2937",
  muted: "#526071",
  heading: "#111827",
  white: "#ffffff",
};

const fontFamily =
  "Arial, Helvetica, sans-serif";

export const ONZEON_EMAIL_BRAND: EmailBrand = {
  name: "Onzeon Holdings LLC",
  legalName: "Onzeon Holdings LLC",
  logoInitial: "O",
  tagline: "AI • Healthcare • Software • Digital Products",
  website: "https://www.onzeonholdings.com",
  infoEmail: "info@onzeonholdings.com",
  supportEmail: "support@onzeonholdings.com",
  accentColor: "#2563eb",
};

export const FLOWVIA_EMAIL_BRAND: EmailBrand = {
  name: "Flowvia Health",
  legalName: "Flowvia Health",
  logoInitial: "F",
  tagline: "Developed and operated by Onzeon Holdings LLC",
  website: "https://flowviahealth.com",
  infoEmail: "hello@flowviahealth.com",
  supportEmail: "support@flowviahealth.com",
  accentColor: "#1d4edb",
};

export function formatSubmittedAt(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  }).format(date);
}

export function buildSubmissionSubject({
  title,
  brandName,
  inquiryType,
}: {
  title: string;
  brandName: string;
  inquiryType?: string;
}) {
  return [title, brandName, inquiryType].filter(Boolean).join(" | ");
}

export function renderSubmissionEmail({
  brand,
  title,
  eyebrow,
  fields,
  sections = [],
  submittedAt,
  notice,
}: {
  brand: EmailBrand;
  title: string;
  eyebrow: string;
  fields: EmailField[];
  sections?: EmailSection[];
  submittedAt: Date;
  notice: string;
}): RenderedEmail {
  const submitted = formatSubmittedAt(submittedAt);
  const html = renderShell({
    brand,
    preheader: `${title} submitted ${submitted}`,
    body: `
      ${renderTitle(eyebrow, title, brand.accentColor)}
      ${renderFieldCards(fields)}
      ${sections.map(renderSectionCard).join("")}
      ${renderSectionCard({ label: "Submitted", value: submitted })}
      ${renderNotice(notice)}
    `,
  });

  const text = [
    title,
    "",
    ...fields.flatMap((field) => [field.label, field.value || "Not provided", ""]),
    ...sections.flatMap((section) => [section.label, section.value || "Not provided", ""]),
    "Submitted",
    submitted,
    "",
    notice,
    "",
    footerText(brand),
  ].join("\n");

  return { html, text };
}

export function renderAutoReplyEmail({
  brand,
  title,
  intro,
  paragraphs,
}: {
  brand: EmailBrand;
  title: string;
  intro: string;
  paragraphs: string[];
}): RenderedEmail {
  const html = renderShell({
    brand,
    preheader: intro,
    body: `
      ${renderTitle("Confirmation", title, brand.accentColor)}
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${colors.soft}" style="width:100%;border-collapse:separate;background-color:${colors.soft};border:1px solid ${colors.border};border-radius:14px;">
        <tr>
          <td bgcolor="${colors.soft}" style="padding:20px;background-color:${colors.soft};color:${colors.text};font-family:${fontFamily};font-size:15px;line-height:24px;border-radius:14px;">
            <p style="margin:0 0 14px 0;color:${colors.text};font-family:${fontFamily};font-size:15px;line-height:24px;">${escapeHtml(intro)}</p>
            ${paragraphs.map((paragraph) => `<p style="margin:0 0 14px 0;color:${colors.text};font-family:${fontFamily};font-size:15px;line-height:24px;">${escapeHtml(paragraph)}</p>`).join("")}
          </td>
        </tr>
      </table>
    `,
  });

  const text = [title, "", intro, "", ...paragraphs, "", footerText(brand)].join("\n");

  return { html, text };
}

function renderShell({
  brand,
  preheader,
  body,
}: {
  brand: EmailBrand;
  preheader: string;
  body: string;
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title style="color:${colors.heading};background-color:${colors.page};">${escapeHtml(brand.name)}</title>
  </head>
  <body bgcolor="${colors.page}" style="margin:0;padding:0;background-color:${colors.page};color:${colors.text};font-family:${fontFamily};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;color:${colors.page};background-color:${colors.page};font-size:1px;line-height:1px;font-family:${fontFamily};">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${colors.page}" style="width:100%;border-collapse:collapse;background-color:${colors.page};color:${colors.text};font-family:${fontFamily};">
      <tr>
        <td align="center" bgcolor="${colors.page}" style="padding:24px 12px;background-color:${colors.page};color:${colors.text};font-family:${fontFamily};">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${colors.card}" style="width:100%;max-width:680px;border-collapse:separate;background-color:${colors.card};border:1px solid ${colors.border};border-radius:18px;color:${colors.text};font-family:${fontFamily};">
            <tr>
              <td bgcolor="${colors.card}" style="padding:26px 24px 18px 24px;background-color:${colors.card};color:${colors.text};font-family:${fontFamily};border-radius:18px 18px 0 0;">
                ${renderHeader(brand)}
              </td>
            </tr>
            <tr>
              <td bgcolor="${colors.card}" style="padding:0 24px 24px 24px;background-color:${colors.card};color:${colors.text};font-family:${fontFamily};">
                ${body}
              </td>
            </tr>
            <tr>
              <td bgcolor="${colors.soft}" style="padding:22px 24px;background-color:${colors.soft};border-top:1px solid ${colors.border};color:${colors.muted};font-family:${fontFamily};border-radius:0 0 18px 18px;">
                ${renderFooter(brand)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderHeader(brand: EmailBrand) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${colors.card}" style="width:100%;border-collapse:collapse;background-color:${colors.card};color:${colors.text};font-family:${fontFamily};">
      <tr>
        <td width="44" valign="middle" bgcolor="${colors.card}" style="width:44px;background-color:${colors.card};color:${colors.white};font-family:${fontFamily};">
          <table role="presentation" width="44" height="44" cellspacing="0" cellpadding="0" border="0" bgcolor="${brand.accentColor}" style="width:44px;height:44px;border-collapse:separate;background-color:${brand.accentColor};border-radius:12px;color:${colors.white};font-family:${fontFamily};">
            <tr>
              <td align="center" valign="middle" bgcolor="${brand.accentColor}" style="background-color:${brand.accentColor};color:${colors.white};font-family:${fontFamily};font-size:22px;line-height:22px;font-weight:700;border-radius:12px;">${escapeHtml(brand.logoInitial)}</td>
            </tr>
          </table>
        </td>
        <td valign="middle" bgcolor="${colors.card}" style="padding-left:12px;background-color:${colors.card};color:${colors.heading};font-family:${fontFamily};">
          <p style="margin:0;color:${colors.heading};font-family:${fontFamily};font-size:18px;line-height:24px;font-weight:700;">${escapeHtml(brand.name)}</p>
          <p style="margin:2px 0 0 0;color:${colors.muted};font-family:${fontFamily};font-size:13px;line-height:18px;">${escapeHtml(brand.tagline)}</p>
        </td>
      </tr>
    </table>
  `;
}

function renderTitle(eyebrow: string, title: string, accentColor: string) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${colors.card}" style="width:100%;border-collapse:collapse;background-color:${colors.card};color:${colors.heading};font-family:${fontFamily};">
      <tr>
        <td bgcolor="${colors.card}" style="padding:18px 0 20px 0;background-color:${colors.card};color:${colors.heading};font-family:${fontFamily};">
          <p style="margin:0 0 8px 0;color:${accentColor};font-family:${fontFamily};font-size:12px;line-height:16px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(eyebrow)}</p>
          <h1 style="margin:0;color:${colors.heading};font-family:${fontFamily};font-size:26px;line-height:32px;font-weight:700;">${escapeHtml(title)}</h1>
        </td>
      </tr>
    </table>
  `;
}

function renderFieldCards(fields: EmailField[]) {
  return fields.map((field) => renderSectionCard(field)).join("");
}

function renderSectionCard(section: EmailSection) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${colors.card}" style="width:100%;border-collapse:collapse;background-color:${colors.card};color:${colors.text};font-family:${fontFamily};">
      <tr>
        <td bgcolor="${colors.card}" style="padding:0 0 10px 0;background-color:${colors.card};color:${colors.text};font-family:${fontFamily};">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${colors.soft}" style="width:100%;border-collapse:separate;background-color:${colors.soft};border:1px solid ${colors.border};border-radius:12px;color:${colors.text};font-family:${fontFamily};">
            <tr>
              <td bgcolor="${colors.soft}" style="padding:14px 16px;background-color:${colors.soft};color:${colors.text};font-family:${fontFamily};border-radius:12px;">
                <p style="margin:0 0 5px 0;color:${colors.muted};font-family:${fontFamily};font-size:12px;line-height:16px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;">${escapeHtml(section.label)}</p>
                <p style="margin:0;color:${colors.text};font-family:${fontFamily};font-size:16px;line-height:24px;white-space:pre-wrap;">${escapeHtml(section.value || "Not provided")}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}

function renderNotice(notice: string) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${colors.card}" style="width:100%;border-collapse:collapse;background-color:${colors.card};color:${colors.muted};font-family:${fontFamily};">
      <tr>
        <td bgcolor="${colors.card}" style="padding:6px 0 0 0;background-color:${colors.card};color:${colors.muted};font-family:${fontFamily};">
          <p style="margin:0;color:${colors.muted};font-family:${fontFamily};font-size:13px;line-height:20px;">${escapeHtml(notice)}</p>
        </td>
      </tr>
    </table>
  `;
}

function renderFooter(brand: EmailBrand) {
  return `
    <p style="margin:0 0 6px 0;color:${colors.heading};font-family:${fontFamily};font-size:14px;line-height:20px;font-weight:700;">${escapeHtml(brand.legalName)}</p>
    <p style="margin:0 0 10px 0;color:${colors.muted};font-family:${fontFamily};font-size:13px;line-height:19px;">${escapeHtml(brand.tagline)}</p>
    <p style="margin:0;color:${colors.muted};font-family:${fontFamily};font-size:13px;line-height:20px;"><a href="${escapeHtml(brand.website)}" style="color:${brand.accentColor};font-family:${fontFamily};font-size:13px;line-height:20px;text-decoration:underline;">${escapeHtml(brand.website)}</a></p>
    <p style="margin:4px 0 0 0;color:${colors.muted};font-family:${fontFamily};font-size:13px;line-height:20px;"><a href="mailto:${escapeHtml(brand.infoEmail)}" style="color:${brand.accentColor};font-family:${fontFamily};font-size:13px;line-height:20px;text-decoration:underline;">${escapeHtml(brand.infoEmail)}</a></p>
    <p style="margin:4px 0 0 0;color:${colors.muted};font-family:${fontFamily};font-size:13px;line-height:20px;"><a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:${brand.accentColor};font-family:${fontFamily};font-size:13px;line-height:20px;text-decoration:underline;">${escapeHtml(brand.supportEmail)}</a></p>
  `;
}

function footerText(brand: EmailBrand) {
  return [
    brand.legalName,
    brand.tagline,
    brand.website,
    brand.infoEmail,
    brand.supportEmail,
  ].join("\n");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
