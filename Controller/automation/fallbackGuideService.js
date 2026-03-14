const ENABLE_FALLBACK_GUIDE = /^(1|true|yes)$/i.test(
  String(process.env.AUTOMATION_ENABLE_FALLBACK_GUIDE || "true")
);
const ENABLE_BROWSER_PDF_CAPTURE = /^(1|true|yes)$/i.test(
  String(process.env.AUTOMATION_ENABLE_BROWSER_PDF_CAPTURE || "true")
);
const GUIDE_TIMEOUT_MS = Number(process.env.AUTOMATION_FALLBACK_TIMEOUT_MS || 20000);

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const cleanText = (value) =>
  String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

const escapePdfText = (value) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const sanitizeActionValue = (action = {}) => {
  if (action?.sensitive || normalize(action?.field).includes("password")) return "[REDACTED]";
  if (action?.type === "upload_file") return action?.file_url ? "Cloudinary file attached" : "File missing";
  return cleanText(action?.value || action?.reason || "");
};

const actionToGuideLine = (action = {}, index = 0) => {
  const type = normalize(action?.type || action?.action);
  const field = cleanText(action?.field || "field");
  const value = sanitizeActionValue(action);

  if (type === "navigate") return `${index + 1}. Open: ${cleanText(action?.url || "")}`;
  if (type === "fill_input") return `${index + 1}. Fill "${field}" with example "${value}"`;
  if (type === "select_dropdown") return `${index + 1}. Select "${field}" as "${value}"`;
  if (type === "upload_file") return `${index + 1}. Upload document in "${field}" from Cloudinary URL`;
  if (type === "manual_captcha_required" || type === "manual_step_required") {
    return `${index + 1}. Manual step needed: ${cleanText(action?.reason || action?.value || "Captcha/Auth check")}`;
  }
  if (type === "review_before_submit" || type === "preview_pause") {
    return `${index + 1}. Review all fields before final submit`;
  }
  if (type === "submit_form") return `${index + 1}. Submit only after user confirmation`;
  return `${index + 1}. ${cleanText(type || "step")} ${field ? `(${field})` : ""}`.trim();
};

const splitToPdfLines = (lines = [], maxChars = 95) => {
  const output = [];
  for (const line of lines) {
    const text = cleanText(line);
    if (!text) continue;
    if (text.length <= maxChars) {
      output.push(text);
      continue;
    }

    const words = text.split(" ");
    let current = "";
    for (const word of words) {
      if (!current) {
        current = word;
        continue;
      }
      if (`${current} ${word}`.length > maxChars) {
        output.push(current);
        current = word;
      } else {
        current = `${current} ${word}`;
      }
    }
    if (current) output.push(current);
  }
  return output;
};

const buildSimplePdfBuffer = (lines = []) => {
  const pdfLines = splitToPdfLines(lines, 95);
  const contentLines = ["BT", "/F1 11 Tf", "40 800 Td"];
  let first = true;
  for (const line of pdfLines) {
    const escaped = escapePdfText(line);
    if (first) {
      contentLines.push(`(${escaped}) Tj`);
      first = false;
    } else {
      contentLines.push("0 -14 Td");
      contentLines.push(`(${escaped}) Tj`);
    }
  }
  contentLines.push("ET");
  const stream = contentLines.join("\n");

  const objects = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
  );
  objects.push(
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`
  );
  objects.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");

  const header = "%PDF-1.4\n";
  let body = "";
  const offsets = [0];
  for (const objectText of objects) {
    offsets.push(Buffer.byteLength(header + body, "utf8"));
    body += objectText;
  }

  const xrefOffset = Buffer.byteLength(header + body, "utf8");
  let xref = `xref\n0 ${objects.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(header + body + xref + trailer, "utf8");
};

const annotatePageFields = async (page, actions = []) => {
  const highlightTargets = actions
    .map((action) => ({
      selector: String(action?.selector || "").trim(),
      label: cleanText(action?.field || action?.type || "field"),
    }))
    .filter((item) => item.selector);

  if (highlightTargets.length === 0) return;
  await page.evaluate((targets) => {
    targets.forEach((target, idx) => {
      const node = document.querySelector(target.selector);
      if (!node) return;
      node.style.outline = "3px solid #cc0000";
      node.style.outlineOffset = "2px";
      const tag = document.createElement("div");
      tag.textContent = `${idx + 1}. ${target.label}`;
      tag.style.position = "absolute";
      tag.style.background = "#cc0000";
      tag.style.color = "#fff";
      tag.style.padding = "2px 6px";
      tag.style.fontSize = "10px";
      tag.style.zIndex = "2147483647";
      tag.style.borderRadius = "2px";
      const rect = node.getBoundingClientRect();
      tag.style.left = `${window.scrollX + rect.left}px`;
      tag.style.top = `${window.scrollY + Math.max(rect.top - 18, 0)}px`;
      document.body.appendChild(tag);
    });
  }, highlightTargets);
};

const withTimeout = async (promise, timeoutMs, timeoutMessage) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)),
  ]);

const capturePdfWithPlaywright = async ({ portalUrl, actions = [] }) => {
  const playwright = await import("playwright");
  const chromium = playwright?.chromium;
  if (!chromium) throw new Error("Playwright chromium not available");

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await withTimeout(
      page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: GUIDE_TIMEOUT_MS }),
      GUIDE_TIMEOUT_MS,
      "Timeout while opening page for PDF guide"
    );
    await annotatePageFields(page, actions);
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", bottom: "20px", left: "15px", right: "15px" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close().catch(() => {});
  }
};

const capturePdfWithPuppeteer = async ({ portalUrl, actions = [] }) => {
  const puppeteer = await import("puppeteer");
  if (!puppeteer?.launch) throw new Error("Puppeteer launch not available");

  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await withTimeout(
      page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: GUIDE_TIMEOUT_MS }),
      GUIDE_TIMEOUT_MS,
      "Timeout while opening page for PDF guide"
    );
    await annotatePageFields(page, actions);
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", bottom: "20px", left: "15px", right: "15px" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close().catch(() => {});
  }
};

const buildGuideLines = ({
  reason = "",
  portalUrl = "",
  actions = [],
  formRepresentation = null,
}) => {
  const lines = [];
  lines.push("Government Scheme Form Fill Guide");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  if (portalUrl) lines.push(`Portal: ${portalUrl}`);
  if (reason) lines.push(`Reason: ${cleanText(reason)}`);
  lines.push("Safety: Do not bypass captcha or authentication checks.");
  lines.push("Safety: User should review all values before submit.");
  lines.push("");
  lines.push("Suggested fill steps:");

  const normalizedActions = Array.isArray(actions) ? actions : [];
  if (normalizedActions.length > 0) {
    normalizedActions.forEach((action, index) => lines.push(actionToGuideLine(action, index)));
  } else if (Array.isArray(formRepresentation?.forms) && formRepresentation.forms.length > 0) {
    let index = 0;
    formRepresentation.forms.forEach((form) => {
      (form?.fields || []).forEach((field) => {
        if (normalize(field?.type) === "hidden") return;
        const label = cleanText(field?.label || field?.name || field?.id || "field");
        lines.push(`${index + 1}. Fill "${label}" with your profile value/example.`);
        index += 1;
      });
    });
    if (index === 0) lines.push("1. Fill visible fields manually using your profile details.");
  } else {
    lines.push("1. Open portal and fill visible fields manually using your profile details.");
    lines.push("2. Upload required documents from Cloudinary URLs.");
  }

  return lines;
};

const toGuidePayload = ({ buffer, engine, lines, reason }) => ({
  generated: true,
  engine,
  reason: cleanText(reason || ""),
  mime_type: "application/pdf",
  file_name: `autofill-guide-${Date.now()}.pdf`,
  pdf_base64: buffer.toString("base64"),
  instructions: lines,
});

export const generateFallbackPdfGuide = async ({
  portalUrl = "",
  actions = [],
  formRepresentation = null,
  reason = "",
}) => {
  if (!ENABLE_FALLBACK_GUIDE) {
    return {
      generated: false,
      reason: "Fallback guide disabled by configuration",
      instructions: [],
    };
  }

  const guideLines = buildGuideLines({
    reason,
    portalUrl,
    actions,
    formRepresentation,
  });

  if (ENABLE_BROWSER_PDF_CAPTURE && portalUrl) {
    try {
      const pdfBuffer = await capturePdfWithPlaywright({
        portalUrl,
        actions,
      });
      return toGuidePayload({
        buffer: pdfBuffer,
        engine: "playwright",
        lines: guideLines,
        reason,
      });
    } catch {
      // try next engine
    }

    try {
      const pdfBuffer = await capturePdfWithPuppeteer({
        portalUrl,
        actions,
      });
      return toGuidePayload({
        buffer: pdfBuffer,
        engine: "puppeteer",
        lines: guideLines,
        reason,
      });
    } catch {
      // fall back to built-in template
    }
  }

  const pdfBuffer = buildSimplePdfBuffer(guideLines);
  return toGuidePayload({
    buffer: pdfBuffer,
    engine: "template",
    lines: guideLines,
    reason,
  });
};
