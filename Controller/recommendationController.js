import Profile from "../Schema/Profileschema.js";
import Scheme from "../Schema/Schemeschema.js";
import {
  inferOriginalApplyLinkFromSchemeName,
  resolveBestOriginalApplyLink,
  resolveSchemePageLink,
  validateEligibilityWithGemini,
} from "./geminiEligibilityAgent.js";

const MAX_SCORE = 10;
const TOP_N = 7;
const GEMINI_VALIDATION_LIMIT = 7;

const OCCUPATION_WEIGHT = 4;
const ELIGIBILITY_WEIGHT = 3;
const STATE_WEIGHT = 2;
const CATEGORY_WEIGHT = 1;

const OCCUPATION_KEYWORD_MAP = {
  student: ["student", "education", "scholarship", "phd", "masters", "college", "learner"],
  farmer: ["farmer", "agriculture", "crop", "cultivator", "farming", "agricultural worker", "kisan"],
  women: ["women", "female", "girl", "woman"],
  entrepreneur: ["startup", "business", "entrepreneur", "self employed", "self-employed"],
  disabled: ["disability", "disabled", "pwd", "divyang", "person with disability"],
};

const GENDER_KEYWORD_MAP = {
  female: ["female", "women", "woman", "girl", "ladies"],
  male: ["male", "men", "man", "boy", "gentlemen"],
};

const CATEGORY_TOKENS = ["sc", "st", "obc", "ews", "general", "minority"];

const normalize = (value) => String(value ?? "").trim().toLowerCase();

const toText = (value) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => toText(item)).join(" ");
  if (typeof value === "object") return Object.values(value).map((item) => toText(item)).join(" ");
  return String(value);
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value).replace(/,/g, "").match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const tokenize = (value) =>
  normalize(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);

const unique = (values) => Array.from(new Set(values.map((item) => normalize(item)).filter(Boolean)));

const includesAny = (text, keywords) => keywords.some((keyword) => text.includes(normalize(keyword)));

const deriveOccupationGroupKeywords = (occupation) => {
  const occ = normalize(occupation);
  if (!occ) return [];

  const derived = new Set([occ, ...tokenize(occ)]);
  Object.entries(OCCUPATION_KEYWORD_MAP).forEach(([group, words]) => {
    if (occ.includes(group) || words.some((word) => occ.includes(normalize(word)))) {
      words.forEach((word) => derived.add(normalize(word)));
    }
  });
  return Array.from(derived);
};

const buildSearchKeywords = (profile) => {
  const occKeywords = deriveOccupationGroupKeywords(profile.occupation);
  const category = normalize(profile.category);
  const gender = normalize(profile.gender);
  const state = normalize(profile.location?.state);

  const keywords = new Set([...occKeywords]);
  if (category) keywords.add(category);
  if (gender) {
    keywords.add(gender);
    if (gender.includes("female")) {
      GENDER_KEYWORD_MAP.female.forEach((word) => keywords.add(normalize(word)));
    }
    if (gender.includes("male")) {
      GENDER_KEYWORD_MAP.male.forEach((word) => keywords.add(normalize(word)));
    }
  }
  if (state) keywords.add(state);

  return {
    occupationKeywords: occKeywords,
    searchKeywords: Array.from(keywords),
  };
};

const mergeKeywords = (...keywordLists) =>
  unique(keywordLists.flatMap((list) => (Array.isArray(list) ? list : [])));

const buildSearchKeywordsWithQuery = (
  profile,
  queryText = "",
  occupationOverride = "",
  genderOverride = ""
) => {
  const effectiveOccupation = occupationOverride || profile.occupation || "";
  const effectiveGender = genderOverride || profile.gender || "";
  const base = buildSearchKeywords({
    ...profile,
    occupation: effectiveOccupation,
    gender: effectiveGender,
  });
  const queryKeywords = tokenize(queryText);
  const occupationKeywords = deriveOccupationGroupKeywords(effectiveOccupation);
  const genderKeywords = effectiveGender.includes("female")
    ? GENDER_KEYWORD_MAP.female
    : effectiveGender.includes("male")
      ? GENDER_KEYWORD_MAP.male
      : [];
  return {
    occupationKeywords: mergeKeywords(base.occupationKeywords, occupationKeywords),
    searchKeywords: mergeKeywords(
      base.searchKeywords,
      queryKeywords,
      occupationKeywords,
      genderKeywords
    ),
  };
};

const countKeywordHits = (text, keywords) =>
  unique(keywords.filter((keyword) => text.includes(normalize(keyword)))).length;

const parseMoneyValue = (amount, unit) => {
  const base = Number(String(amount).replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const normalizedUnit = normalize(unit);
  if (normalizedUnit.startsWith("lakh") || normalizedUnit === "lac" || normalizedUnit === "lacs") {
    return base * 100000;
  }
  if (normalizedUnit.startsWith("crore")) return base * 10000000;
  if (normalizedUnit === "k" || normalizedUnit.startsWith("thousand")) return base * 1000;
  return base;
};

const extractIncomeLimit = (text) => {
  if (!text.includes("income")) return { hasRule: false, value: null };

  const patterns = [
    /income[^.\n]{0,90}?(?:not\s*exceed(?:ing)?|up\s*to|below|under|less\s*than|at\s*most|max(?:imum)?)\s*(?:inr|rs\.?)?\s*([\d,.]+)\s*(lakh|lakhs|lac|lacs|crore|crores|thousand|k)?/i,
    /(?:inr|rs\.?)\s*([\d,.]+)\s*(lakh|lakhs|lac|lacs|crore|crores|thousand|k)?[^.\n]{0,50}?income/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = parseMoneyValue(match[1], match[2] || "");
    if (value !== null) return { hasRule: true, value };
  }
  return { hasRule: false, value: null };
};

const extractAgeRule = (text, fallbackMin, fallbackMax) => {
  let min = parseNumber(fallbackMin);
  let max = parseNumber(fallbackMax);

  const rangeMatch = text.match(/(?:age[^.\n]{0,20})?(\d{1,2})\s*(?:to|-)\s*(\d{1,2})/i);
  if (rangeMatch) {
    min = Number(rangeMatch[1]);
    max = Number(rangeMatch[2]);
  }

  const maxPatterns = [
    /(\d{1,2})\s*(?:years?|yrs?)\s*(?:or\s*)?(?:below|under|younger)/i,
    /(?:age[^.\n]{0,30})?(?:not\s*exceed(?:ing)?|up\s*to|below|under|max(?:imum)?|at\s*most)\s*(\d{1,2})/i,
  ];
  for (const pattern of maxPatterns) {
    const match = text.match(pattern);
    if (match) {
      max = Number(match[1]);
      break;
    }
  }

  const minPatterns = [
    /(\d{1,2})\s*(?:years?|yrs?)\s*(?:or\s*)?(?:above|more|older)/i,
    /(?:age[^.\n]{0,30})?(?:at\s*least|min(?:imum)?|above|more\s*than)\s*(\d{1,2})/i,
  ];
  for (const pattern of minPatterns) {
    const match = text.match(pattern);
    if (match) {
      min = Number(match[1]);
      break;
    }
  }

  return {
    hasRule: min !== null || max !== null,
    min,
    max,
  };
};

const extractGenderRule = (text) => {
  if (/(women|woman|female|girl)/i.test(text)) return { hasRule: true, value: "female" };
  if (/(men|man|male|boy)/i.test(text)) return { hasRule: true, value: "male" };
  return { hasRule: false, value: "all" };
};

const extractCategoryRule = (text, schemeCategory) => {
  const fromText = CATEGORY_TOKENS.filter((token) => new RegExp(`\\b${token}\\b`, "i").test(text));
  const normalizedField = normalize(schemeCategory);
  const fromField = CATEGORY_TOKENS.filter((token) => normalizedField.includes(token));
  const required = unique([...fromText, ...fromField]);

  return {
    hasRule: required.length > 0,
    required,
  };
};

const extractStateRule = (text, schemeState) => {
  const normalizedState = normalize(schemeState);
  const allIndiaHints = ["all states", "all over india", "across india", "pan india", "all india"];

  if (!normalizedState || normalizedState === "all" || includesAny(text, allIndiaHints)) {
    return { hasRule: false, value: "all" };
  }
  return { hasRule: true, value: normalizedState };
};

const detectOccupationRequirement = (eligibilityText, schemeOccupation) => {
  const groups = [];
  Object.entries(OCCUPATION_KEYWORD_MAP).forEach(([group, words]) => {
    if (includesAny(eligibilityText, words) || includesAny(normalize(schemeOccupation), words)) {
      groups.push(group);
    }
  });

  const normalizedSchemeOcc = normalize(schemeOccupation);
  const generic =
    !normalizedSchemeOcc ||
    normalizedSchemeOcc === "all" ||
    normalizedSchemeOcc === "any" ||
    normalizedSchemeOcc === "general";

  return {
    hasRule: groups.length > 0 || !generic,
    groups: unique(groups),
    raw: normalizedSchemeOcc,
    generic,
  };
};

const evaluateRuleMatch = ({ hasRule, profileValue, matcher }) => {
  if (!hasRule) return { comparable: false, matched: true, contradiction: false };
  if (profileValue === null || profileValue === undefined || profileValue === "") {
    return { comparable: false, matched: false, contradiction: false };
  }
  const matched = matcher(profileValue);
  return { comparable: true, matched, contradiction: !matched };
};

const evaluateOptionalRuleMatch = ({ hasRule, profileValue, matcher }) => {
  if (!hasRule) return { comparable: false, matched: false, contradiction: false };
  if (profileValue === null || profileValue === undefined || profileValue === "") {
    return { comparable: false, matched: false, contradiction: false };
  }
  const matched = matcher(profileValue);
  return { comparable: true, matched, contradiction: !matched };
};

const normalizeMatchedConditions = (matchedConditions) => ({
  occupation: Boolean(matchedConditions?.occupation),
  age: Boolean(matchedConditions?.age),
  income: Boolean(matchedConditions?.income),
  gender: Boolean(matchedConditions?.gender),
  state: Boolean(matchedConditions?.state),
  category: Boolean(matchedConditions?.category),
  eligibility_rule: Boolean(matchedConditions?.eligibility_rule),
});

const calculateScoreFromMatchedConditions = (matchedConditions) => {
  const matched = normalizeMatchedConditions(matchedConditions);
  let score = 0;
  if (matched.occupation) score += OCCUPATION_WEIGHT;
  if (matched.eligibility_rule) score += ELIGIBILITY_WEIGHT;
  if (matched.state) score += STATE_WEIGHT;
  if (matched.category) score += CATEGORY_WEIGHT;
  return { matched, score };
};

const buildRecommendationReason = (matched) => {
  const reasons = [];
  if (matched.occupation) reasons.push("Occupation matched");
  if (matched.eligibility_rule) reasons.push("Eligibility rules matched");
  if (matched.gender) reasons.push("Gender matched");
  if (matched.state) reasons.push("State matched");
  if (matched.category) reasons.push("Category matched");
  return reasons.length > 0 ? reasons.join(", ") : "General profile relevance";
};

const evaluateSchemeDeterministic = (scheme, profile, profileKeywords) => {
  const eligibilityText = normalize(toText(scheme.eligibility));
  const searchableText = normalize(
    [
      toText(scheme.scheme_name),
      toText(scheme.description),
      toText(scheme.eligibility),
      toText(scheme.occupation),
      toText(scheme.category),
      toText(scheme.target_group),
    ]
      .filter(Boolean)
      .join(" ")
  );

  const keywordHits = countKeywordHits(searchableText, profileKeywords.searchKeywords);
  const occupationRule = detectOccupationRequirement(eligibilityText, scheme.occupation);
  const ageRule = extractAgeRule(eligibilityText, scheme.age_min, scheme.age_max);
  const incomeRule = extractIncomeLimit(eligibilityText);
  const genderRule = extractGenderRule(eligibilityText);
  const categoryRule = extractCategoryRule(eligibilityText, scheme.category);
  const stateRule = extractStateRule(eligibilityText, scheme.state);

  const userAge = parseNumber(profile.age);
  const userIncome = parseNumber(profile.annual_income ?? profile.income);
  const userGender = normalize(profile.gender);
  const userCategory = normalize(profile.category);
  const userState = normalize(profile.location?.state);
  const userOccupationKeywords = profileKeywords.occupationKeywords;
  const userOccupationRaw = normalize(profile.occupation);

  const occupationComparable = occupationRule.hasRule && !!userOccupationRaw;
  const occupationMatchedByKeyword = countKeywordHits(searchableText, userOccupationKeywords) > 0;
  let occupationMatched = false;
  let occupationContradiction = false;

  if (occupationRule.hasRule) {
    if (occupationRule.groups.length > 0) {
      const requiredWords = unique(
        occupationRule.groups.flatMap((group) => OCCUPATION_KEYWORD_MAP[group] || [group])
      );
      occupationMatched =
        requiredWords.some(
          (word) =>
            userOccupationKeywords.includes(normalize(word)) || userOccupationRaw.includes(normalize(word))
        ) || occupationMatchedByKeyword;
      occupationContradiction = occupationComparable && !occupationMatched;
    } else if (!occupationRule.generic) {
      occupationMatched =
        occupationRule.raw === userOccupationRaw ||
        occupationRule.raw.includes(userOccupationRaw) ||
        userOccupationRaw.includes(occupationRule.raw) ||
        occupationMatchedByKeyword;
      occupationContradiction = occupationComparable && !occupationMatched;
    }
  } else {
    occupationMatched = occupationMatchedByKeyword;
  }

  const ageResult = evaluateRuleMatch({
    hasRule: ageRule.hasRule,
    profileValue: userAge,
    matcher: (age) => (ageRule.min === null || age >= ageRule.min) && (ageRule.max === null || age <= ageRule.max),
  });

  const incomeResult = evaluateRuleMatch({
    hasRule: incomeRule.hasRule,
    profileValue: userIncome,
    matcher: (income) => income <= incomeRule.value,
  });

  const genderResult = evaluateRuleMatch({
    hasRule: genderRule.hasRule,
    profileValue: userGender,
    matcher: (gender) => gender.includes(genderRule.value),
  });

  const stateResult = evaluateRuleMatch({
    hasRule: stateRule.hasRule,
    profileValue: userState,
    matcher: (state) =>
      state === stateRule.value || state.includes(stateRule.value) || stateRule.value.includes(state),
  });

  const categoryResult = evaluateOptionalRuleMatch({
    hasRule: categoryRule.hasRule,
    profileValue: userCategory,
    matcher: (category) => categoryRule.required.some((required) => category.includes(normalize(required))),
  });

  const hasComparableEligibilityRule =
    occupationComparable ||
    ageResult.comparable ||
    incomeResult.comparable ||
    genderResult.comparable ||
    stateResult.comparable ||
    categoryResult.comparable;

  const eligibilityRuleMatched =
    hasComparableEligibilityRule &&
    !occupationContradiction &&
    (!occupationRule.hasRule || !occupationComparable || occupationMatched) &&
    (!ageRule.hasRule || ageResult.matched) &&
    (!incomeRule.hasRule || incomeResult.matched) &&
    (!genderRule.hasRule || genderResult.matched) &&
    (!stateRule.hasRule || stateResult.matched) &&
    (!categoryRule.hasRule || categoryResult.matched);

  const clearlyContradicts =
    occupationContradiction ||
    ageResult.contradiction ||
    incomeResult.contradiction ||
    genderResult.contradiction ||
    stateResult.contradiction ||
    categoryResult.contradiction;

  const { matched, score } = calculateScoreFromMatchedConditions({
    occupation: occupationMatched,
    age: ageResult.matched,
    income: incomeResult.matched,
    gender: genderResult.matched,
    state: stateResult.matched,
    category: categoryResult.matched,
    eligibility_rule: eligibilityRuleMatched,
  });
  const schemeLink = resolveSchemePageLink(
    scheme.scheme_page_link || scheme.apply_link,
    scheme.application_process,
    scheme.description,
    scheme.scheme_name
  );
  const originalApplyLink = resolveBestOriginalApplyLink(
    scheme.original_apply_link,
    scheme.scheme_name,
    scheme.description,
    scheme.application_process,
    scheme.description,
    scheme.documents_required,
    scheme.benefits
  );

  return {
    scheme_name: scheme.scheme_name || "",
    eligible: !clearlyContradicts && (eligibilityRuleMatched || score > 0),
    score,
    match_probability: Number(((score / MAX_SCORE) * 100).toFixed(2)),
    matched_conditions: matched,
    reason: buildRecommendationReason(matched),
    benefits: Array.isArray(scheme.benefits) ? scheme.benefits : [],
    documents_required: Array.isArray(scheme.documents_required) ? scheme.documents_required : [],
    scheme_link: schemeLink,
    original_apply_link: originalApplyLink,
    apply_link: "",
    _keyword_hits: keywordHits,
    _contradiction: clearlyContradicts,
    _raw_scheme: scheme,
    _ai_attempted: false,
    _ai_validated: false,
  };
};

const mergeGeminiValidation = (deterministic, geminiResult) => {
  if (!geminiResult) return deterministic;

  const { matched, score } = calculateScoreFromMatchedConditions({
    ...deterministic.matched_conditions,
    ...geminiResult.matched_conditions,
  });

  return {
    ...deterministic,
    eligible: Boolean(geminiResult.eligible),
    matched_conditions: matched,
    score,
    match_probability: Number(((score / MAX_SCORE) * 100).toFixed(2)),
    reason: buildRecommendationReason(matched),
    scheme_link:
      geminiResult.scheme_page_link ||
      deterministic.scheme_link ||
      resolveSchemePageLink(
        deterministic._raw_scheme?.scheme_page_link || deterministic._raw_scheme?.apply_link,
        deterministic._raw_scheme?.application_process,
        deterministic._raw_scheme?.description,
        deterministic._raw_scheme?.scheme_name
      ),
    original_apply_link:
      resolveBestOriginalApplyLink(
        geminiResult.apply_link || deterministic._raw_scheme?.original_apply_link,
        deterministic._raw_scheme?.scheme_name,
        deterministic._raw_scheme?.description,
        deterministic._raw_scheme?.application_process,
        deterministic._raw_scheme?.description,
        deterministic._raw_scheme?.documents_required,
        deterministic._raw_scheme?.benefits
      ) || deterministic.original_apply_link,
    apply_link: "",
    _ai_attempted: true,
    _ai_validated: true,
  };
};

const runGeminiValidationPass = async (candidates, profile) => {
  if (!Array.isArray(candidates) || candidates.length === 0) return candidates;

  const validationBatch = candidates.slice(0, GEMINI_VALIDATION_LIMIT);
  const remaining = candidates.slice(GEMINI_VALIDATION_LIMIT);

  const validatedBatch = await Promise.all(
    validationBatch.map(async (candidate) => {
      const geminiResult = await validateEligibilityWithGemini(profile, candidate._raw_scheme || {});
      if (!geminiResult) {
        return {
          ...candidate,
          _ai_attempted: true,
          _ai_validated: false,
        };
      }
      return mergeGeminiValidation(candidate, geminiResult);
    })
  );

  return [...validatedBatch, ...remaining];
};

const toPublicRecommendations = (items) =>
  items.map(
    ({
      _keyword_hits,
      _contradiction,
      _raw_scheme,
      _ai_attempted,
      _ai_validated,
      ...publicData
    }) => {
      const schemeLink = publicData.scheme_link || "";
      const originalApplyLink = publicData.original_apply_link || "";
      const inferredByName = inferOriginalApplyLinkFromSchemeName(
        _raw_scheme?.scheme_name,
        _raw_scheme?.description
      );
      const originalSource = !originalApplyLink
        ? "not_found"
        : inferredByName && inferredByName === originalApplyLink
          ? "name_inference"
          : "crawled_or_agent";
      return {
        ...publicData,
        scheme_link: schemeLink,
        original_apply_link: originalApplyLink,
        original_apply_link_source: originalSource,
        apply_link: originalApplyLink || schemeLink || "",
        ai_validation_attempted: _ai_attempted,
        ai_validated: _ai_validated,
      };
    }
  );

const buildRecommendations = async ({
  profile,
  schemes,
  profileKeywords,
  requireKeywordMatch = false,
}) => {
  const deterministic = schemes.map((scheme) =>
    evaluateSchemeDeterministic(scheme, profile, profileKeywords)
  );

  const byKeyword = deterministic.filter((scheme) => scheme._keyword_hits > 0);
  const workingSet =
    requireKeywordMatch && byKeyword.length > 0
      ? byKeyword
      : byKeyword.length >= TOP_N
        ? byKeyword
        : deterministic;

  const preRanked = workingSet
    .filter((scheme) => !scheme._contradiction && scheme.score > 0 && !!scheme.scheme_link)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b._keyword_hits - a._keyword_hits ||
        b.match_probability - a.match_probability ||
        a.scheme_name.localeCompare(b.scheme_name)
    );

  const aiValidated = await runGeminiValidationPass(preRanked, profile);

  const top = aiValidated
    .filter((scheme) => scheme.eligible && scheme.score > 0 && !!scheme.scheme_link)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b._keyword_hits - a._keyword_hits ||
        b.match_probability - a.match_probability ||
        a.scheme_name.localeCompare(b.scheme_name)
    )
    .slice(0, TOP_N);

  return toPublicRecommendations(top);
};

export const recommendSchemes = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const profile = await Profile.findOne({ user: userId }).lean();
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    const schemes = await Scheme.collection.find({}).toArray();
    const profileKeywords = buildSearchKeywords(profile);
    const recommendations = await buildRecommendations({
      profile,
      schemes,
      profileKeywords,
      requireKeywordMatch: false,
    });

    return res.status(200).json({
      success: true,
      total_recommendations: recommendations.length,
      best_match: recommendations[0] || null,
      recommendations,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to recommend schemes",
      error: error.message,
    });
  }
};

export const searchSchemes = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const profile = await Profile.findOne({ user: userId }).lean();
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    const query = String(req.body?.query || "").trim();
    const occupation = String(req.body?.occupation || "").trim();
    const gender = String(req.body?.gender || "").trim();

    const effectiveProfile = {
      ...profile,
      occupation: occupation || profile.occupation,
      gender: gender || profile.gender,
    };

    const schemes = await Scheme.collection.find({}).toArray();
    const profileKeywords = buildSearchKeywordsWithQuery(
      effectiveProfile,
      query,
      occupation,
      gender
    );

    const recommendations = await buildRecommendations({
      profile: effectiveProfile,
      schemes,
      profileKeywords,
      requireKeywordMatch: Boolean(query || occupation),
    });

    return res.status(200).json({
      success: true,
      total_recommendations: recommendations.length,
      best_match: recommendations[0] || null,
      recommendations,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to search schemes",
      error: error.message,
    });
  }
};
