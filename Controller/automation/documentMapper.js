const DOCUMENT_ALIASES = [
  {
    normalized_name: "aadhaar_card",
    labels: ["aadhaar card", "aadhar card", "aadhaar", "aadhar", "uidai"],
  },
  {
    normalized_name: "pan_card",
    labels: ["pan card", "pan", "permanent account number"],
  },
  {
    normalized_name: "income_certificate",
    labels: ["income certificate", "income proof", "salary certificate", "annual income"],
  },
  {
    normalized_name: "bank_passbook",
    labels: ["bank passbook", "passbook", "cancelled cheque", "bank proof", "bank statement"],
  },
  {
    normalized_name: "education_certificate",
    labels: ["education certificate", "marksheet", "degree certificate", "school certificate"],
  },
  {
    normalized_name: "disability_certificate",
    labels: ["disability certificate", "pwd certificate", "divyang certificate"],
  },
  {
    normalized_name: "residence_certificate",
    labels: ["domicile certificate", "residence certificate", "address proof"],
  },
  {
    normalized_name: "caste_certificate",
    labels: ["caste certificate", "category certificate", "sc certificate", "st certificate", "obc certificate"],
  },
];

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const findAliasRecord = (text) => {
  const normalizedText = normalize(text);
  for (const record of DOCUMENT_ALIASES) {
    if (record.labels.some((label) => normalizedText.includes(normalize(label)))) {
      return record;
    }
  }
  return null;
};

export const normalizeDocumentName = (name) => {
  const record = findAliasRecord(name);
  if (record) return record.normalized_name;
  return normalize(name).replace(/\s+/g, "_");
};

const scoreDocumentMatch = (requiredName, uploadedDocument) => {
  const required = normalize(requiredName);
  const uploadedLabel = normalize(uploadedDocument?.document_name || "");
  const uploadedNormalized = normalizeDocumentName(uploadedDocument?.document_name || "");
  const requiredNormalized = normalizeDocumentName(requiredName);

  let score = 0;
  if (requiredNormalized && requiredNormalized === uploadedNormalized) score += 8;
  if (required && uploadedLabel && (required.includes(uploadedLabel) || uploadedLabel.includes(required))) {
    score += 5;
  }

  const requiredRecord = findAliasRecord(requiredName);
  if (requiredRecord) {
    for (const label of requiredRecord.labels) {
      const token = normalize(label);
      if (token && uploadedLabel.includes(token)) score += 3;
    }
  }
  return score;
};

export const resolveRequiredDocumentMatches = (requiredDocuments = [], uploadedDocuments = []) => {
  const required = (Array.isArray(requiredDocuments) ? requiredDocuments : [])
    .map((name) => String(name || "").trim())
    .filter(Boolean);
  const uploaded = (Array.isArray(uploadedDocuments) ? uploadedDocuments : [])
    .map((doc) => ({
      document_name: String(doc?.document_name || "").trim(),
      cloudinary_url: String(doc?.cloudinary_url || "").trim(),
    }))
    .filter((doc) => doc.document_name && doc.cloudinary_url);

  const usedIndexes = new Set();
  const matches = required.map((requiredName) => {
    let bestIndex = -1;
    let bestScore = 0;
    for (let index = 0; index < uploaded.length; index += 1) {
      if (usedIndexes.has(index)) continue;
      const score = scoreDocumentMatch(requiredName, uploaded[index]);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const matched = bestScore >= 3 && bestIndex >= 0;
    if (matched) usedIndexes.add(bestIndex);

    return {
      required_document_name: requiredName,
      required_document_key: normalizeDocumentName(requiredName),
      found: matched,
      matched_document_name: matched ? uploaded[bestIndex].document_name : "",
      matched_document_url: matched ? uploaded[bestIndex].cloudinary_url : "",
      score: bestScore,
    };
  });

  const missingRequiredDocuments = matches
    .filter((item) => !item.found)
    .map((item) => item.required_document_name);

  return {
    matches,
    missing_required_documents: missingRequiredDocuments,
  };
};
