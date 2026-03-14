process.env.AUTOMATION_EXECUTION_MODE = "simulation";
process.env.AUTOMATION_ENABLE_GEMINI_FIELD_MAPPING = "false";
process.env.AUTOMATION_ENABLE_BROWSER_PDF_CAPTURE = "false";

const { default: express } = await import("express");
const { default: jwt } = await import("jsonwebtoken");
const { default: automationRoutes } = await import("../Routes/automationRoutes.js");

const { default: Profile } = await import("../Schema/Profileschema.js");
const { default: Scheme } = await import("../Schema/Schemeschema.js");
const { default: UserDocument } = await import("../Schema/UserDocumentschema.js");
const { default: FormCrawlCache } = await import("../Schema/FormCrawlCacheSchema.js");
const { default: AutomationSession } = await import("../Schema/AutomationSessionSchema.js");
const { default: AutomationLog } = await import("../Schema/AutomationLogSchema.js");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const filterMatch = (doc, filter = {}) =>
  Object.entries(filter).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "$gt" in expected) {
      return new Date(doc[key]).getTime() > new Date(expected.$gt).getTime();
    }
    return String(doc[key] ?? "") === String(expected ?? "");
  });

const profileStore = [
  {
    user: "507f1f77bcf86cd799439011",
    age: 29,
    occupation: "Farmer",
    category: "OBC",
    annual_income: 180000,
    gender: "Male",
    phone: "9999999999",
    location: { state: "Maharashtra" },
  },
];

const userDocumentStore = [
  {
    user_id: "507f1f77bcf86cd799439011",
    document_name: "Aadhaar Card",
    cloudinary_url: "https://res.cloudinary.com/demo/raw/upload/v1/aadhaar.txt",
    extracted_data: {
      name: "Ravi Kumar",
      date_of_birth: "1996-04-12",
      aadhaar_number: "123412341234",
      address: "Pune",
    },
    autofill_fields: {
      applicant_name: "Ravi Kumar",
      dob: "1996-04-12",
      aadhaar: "123412341234",
      address: "Pune",
    },
    uploaded_at: "2026-03-14T01:00:00.000Z",
  },
  {
    user_id: "507f1f77bcf86cd799439011",
    document_name: "Income Certificate",
    cloudinary_url: "https://res.cloudinary.com/demo/raw/upload/v1/income.txt",
    extracted_data: {
      name: "Ravi Kumar",
      annual_income: "180000",
    },
    autofill_fields: {
      applicant_name: "Ravi Kumar",
      annual_income: "180000",
    },
    uploaded_at: "2026-03-14T01:05:00.000Z",
  },
];

const cacheStore = [];
const sessionStore = [];
const logStore = [];
let sessionCounter = 1;

Profile.findOne = (filter = {}) => ({
  lean: async () => {
    const found = profileStore.find((item) => filterMatch(item, filter));
    return found ? clone(found) : null;
  },
});

Scheme.findOne = (filter = {}) => ({
  lean: async () => {
    const dbItem = {
      scheme_name: "Farmer Support Scheme",
      original_apply_link: "https://services.gov.in/farmer-support",
      documents_required: ["Aadhaar Card", "Income Certificate"],
    };
    return filter?.scheme_name === dbItem.scheme_name ? clone(dbItem) : null;
  },
});

UserDocument.find = (filter = {}) => ({
  sort: (sortSpec = {}) => ({
    lean: async () => {
      const key = Object.keys(sortSpec)[0] || "uploaded_at";
      const dir = sortSpec[key] === -1 ? -1 : 1;
      return userDocumentStore
        .filter((item) => filterMatch(item, filter))
        .sort((a, b) => {
          const aT = new Date(a[key] || 0).getTime();
          const bT = new Date(b[key] || 0).getTime();
          return dir === -1 ? bT - aT : aT - bT;
        })
        .map((item) => clone(item));
    },
  }),
});

FormCrawlCache.findOne = (filter = {}) => ({
  lean: async () => {
    const found = cacheStore.find((item) => filterMatch(item, filter));
    return found ? clone(found) : null;
  },
});

FormCrawlCache.findOneAndUpdate = async (filter = {}, payload = {}) => {
  const index = cacheStore.findIndex((item) => filterMatch(item, filter));
  if (index >= 0) {
    cacheStore[index] = { ...cacheStore[index], ...clone(payload) };
    return clone(cacheStore[index]);
  }
  const record = { ...clone(payload) };
  cacheStore.push(record);
  return clone(record);
};

AutomationSession.create = async (payload = {}) => {
  const now = new Date().toISOString();
  const record = {
    _id: String(sessionCounter++),
    ...clone(payload),
    createdAt: now,
    updatedAt: now,
  };
  sessionStore.push(record);
  return clone(record);
};

AutomationSession.findByIdAndUpdate = async (id, payload = {}) => {
  const index = sessionStore.findIndex((item) => String(item._id) === String(id));
  if (index < 0) return null;
  sessionStore[index] = {
    ...sessionStore[index],
    ...clone(payload),
    updatedAt: new Date().toISOString(),
  };
  return clone(sessionStore[index]);
};

AutomationSession.findOne = (filter = {}) => ({
  lean: async () => {
    const found = sessionStore.find((item) => filterMatch(item, filter));
    return found ? clone(found) : null;
  },
});

AutomationLog.create = async (payload = {}) => {
  logStore.push(clone(payload));
  return clone(payload);
};

const portalHtml = `
<!DOCTYPE html>
<html>
<head><title>Gov Scheme Apply</title></head>
<body>
  <form id="loginForm" action="/login" method="post">
    <label for="loginEmail">Email</label>
    <input id="loginEmail" name="email" type="email" />
    <label for="loginPassword">Password</label>
    <input id="loginPassword" name="password" type="password" />
    <button id="loginBtn" type="submit">Login</button>
  </form>

  <form id="applyForm" action="/apply" method="post">
    <label for="fullName">Full Name</label>
    <input id="fullName" name="full_name" type="text" required />
    <label for="dob">DOB</label>
    <input id="dob" name="dob" type="text" required />
    <label for="aadhaarNo">Aadhaar Number</label>
    <input id="aadhaarNo" name="aadhaar_number" type="text" />
    <label for="income">Annual Income</label>
    <input id="income" name="income" type="text" />
    <label for="category">Category</label>
    <select id="category" name="category">
      <option value="">Select</option>
      <option value="OBC">OBC</option>
      <option value="SC">SC</option>
    </select>
    <label for="aadhaarUpload">Upload Aadhaar Card</label>
    <input id="aadhaarUpload" name="aadhaar_upload" type="file" />
    <label for="incomeUpload">Upload Income Certificate</label>
    <input id="incomeUpload" name="income_upload" type="file" />
    <button id="submitBtn" type="submit">Submit Application</button>
  </form>
</body>
</html>
`;

const nativeFetch = global.fetch.bind(global);
global.fetch = async (url, options) => {
  const target = String(url || "");
  if (target === "https://services.gov.in/farmer-support") {
    return new Response(portalHtml, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  }
  return nativeFetch(url, options);
};

const app = express();
app.use(express.json());
app.use("/automation", automationRoutes);
const server = app.listen(0);
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;
const authToken = jwt.sign({ id: "507f1f77bcf86cd799439011" }, "mysecretkey");
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${authToken}`,
};

const post = async (path, body) => {
  const response = await nativeFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: await response.json(),
  };
};

const get = async (path) => {
  const response = await nativeFetch(`${baseUrl}${path}`, { headers });
  return {
    status: response.status,
    json: await response.json(),
  };
};

try {
  const previewPayload = {
    scheme_data: {
      scheme_name: "Farmer Support Scheme",
      official_application_link: "https://services.gov.in/farmer-support",
      documents_required: ["Aadhaar Card", "Income Certificate"],
    },
    user_profile: {
      email: "ravi@example.com",
      date_of_birth: "1996-04-12",
    },
    portal_credentials: {
      email: "ravi@example.com",
      password: "secret123",
    },
  };

  const crawlOne = await post("/automation/crawl", previewPayload);
  assert(crawlOne.status === 200, "crawl endpoint should return 200");
  assert(crawlOne.json.cache_hit === false, "first crawl should miss cache");
  assert(crawlOne.json.summary.total_forms === 2, "crawler should detect both forms");

  const crawlTwo = await post("/automation/crawl", previewPayload);
  assert(crawlTwo.status === 200, "second crawl should return 200");
  assert(crawlTwo.json.cache_hit === true, "second crawl should hit cache");

  const generatedSteps = await post("/automation/generate-steps", {
    scheme_data: {
      scheme_name: "Farmer Support Scheme",
      official_application_link: "https://services.gov.in/farmer-support",
      documents_required: ["Aadhaar Card", "Income Certificate"],
    },
    user_data: {
      name: "Ravi Kumar",
      date_of_birth: "1996-04-12",
      category: "OBC",
      income: "180000",
      aadhaar_number: "123412341234",
      phone: "9999999999",
    },
    user_documents: {
      documents: [
        {
          document_name: "Aadhaar Card",
          cloudinary_url: "https://res.cloudinary.com/demo/raw/upload/v1/aadhaar.txt",
        },
        {
          document_name: "Income Certificate",
          cloudinary_url: "https://res.cloudinary.com/demo/raw/upload/v1/income.txt",
        },
      ],
    },
    form_structure: {
      fields: [
        { label: "Full Name", name: "full_name", type: "text" },
        { label: "DOB", name: "dob", type: "text" },
        { label: "Category", name: "category", type: "dropdown", options: ["OBC", "SC"] },
        { label: "Upload Aadhaar Card", name: "aadhaar_upload", type: "file" },
        { label: "Captcha", name: "captcha_input", type: "text" },
      ],
    },
  });
  assert(generatedSteps.status === 200, "generate-steps endpoint should return 200");
  assert(
    Array.isArray(generatedSteps.json.automation_steps),
    "generate-steps should return automation_steps array"
  );
  assert(
    generatedSteps.json.automation_steps.some((item) => item.action === "navigate"),
    "generate-steps should include navigate action"
  );
  assert(
    generatedSteps.json.automation_steps.some((item) => item.action === "fill_input"),
    "generate-steps should include fill_input action"
  );
  assert(
    generatedSteps.json.automation_steps.some((item) => item.action === "select_dropdown"),
    "generate-steps should include select_dropdown action"
  );
  assert(
    generatedSteps.json.automation_steps.some((item) => item.action === "upload_file"),
    "generate-steps should include upload_file action"
  );
  assert(
    generatedSteps.json.automation_steps.some((item) => item.action === "manual_captcha_required"),
    "generate-steps should include manual_captcha_required action"
  );
  assert(
    generatedSteps.json.automation_steps.some((item) => item.action === "review_before_submit"),
    "generate-steps should include review_before_submit action"
  );

  const preview = await post("/automation/preview", previewPayload);
  assert(preview.status === 200, "preview endpoint should return 200");
  assert(preview.json.preview_required === true, "preview should require confirmation");
  assert(Array.isArray(preview.json.actions), "preview should return actions");
  assert(preview.json.actions.some((item) => item.type === "navigate"), "plan should include navigate");
  assert(preview.json.actions.some((item) => item.type === "upload_file"), "plan should include upload_file");
  assert(preview.json.actions.some((item) => item.type === "submit_form"), "plan should include submit action");
  assert(
    preview.json.fallback_guide?.generated === true,
    "preview should include fallback guide when manual/login steps are present"
  );

  const executeBlocked = await post("/automation/execute", {
    session_id: preview.json.session_id,
    confirm_token: preview.json.confirm_token,
    confirm_submission: false,
  });
  assert(executeBlocked.status === 400, "execute should block without confirmation");

  const executeDryRun = await post("/automation/execute", {
    session_id: preview.json.session_id,
    confirm_token: preview.json.confirm_token,
    confirm_submission: false,
    dry_run_fill_only: true,
    force_simulation: true,
  });
  assert(executeDryRun.status === 200, "dry run fill only should execute without submit confirmation");
  assert(executeDryRun.json.success === true, "dry run fill only should succeed");
  assert(executeDryRun.json.dry_run_fill_only === true, "dry run mode should be returned in response");
  assert(executeDryRun.json.submit_skipped === true, "dry run should report submit skipped");
  assert(
    (executeDryRun.json.execution_logs || []).some(
      (item) => item.type === "submit_form" && item.status === "skipped"
    ),
    "dry run should skip submit_form action"
  );

  const execute = await post("/automation/execute", {
    session_id: preview.json.session_id,
    confirm_token: preview.json.confirm_token,
    confirm_submission: true,
    portal_credentials: {
      email: "ravi@example.com",
      password: "secret123",
    },
    force_simulation: true,
  });
  assert(execute.status === 200, "execute should return 200");
  assert(execute.json.success === true, "execute should succeed in simulation");
  assert(execute.json.simulation === true, "execute should run in simulation");

  const session = await get(`/automation/session/${preview.json.session_id}`);
  assert(session.status === 200, "session endpoint should return 200");
  assert(session.json.session.status === "executed", "session status should be executed");

  const blockedPortal = await post("/automation/preview", {
    scheme_data: {
      scheme_name: "Blocked Portal",
      official_application_link: "https://example.com/apply",
      documents_required: [],
    },
  });
  assert(blockedPortal.status === 400, "non-official portal must be blocked");
  assert(
    blockedPortal.json.fallback_guide?.generated === true,
    "blocked portal response should include fallback guide"
  );

  const fallbackGuide = await post("/automation/fallback-guide", {
    session_id: preview.json.session_id,
    reason: "Manual guidance requested",
  });
  assert(fallbackGuide.status === 200, "fallback-guide endpoint should return 200");
  assert(fallbackGuide.json.fallback_guide?.generated === true, "fallback-guide should generate a PDF guide");

  console.log("All automation layer tests passed.");
} finally {
  server.close();
  global.fetch = nativeFetch;
}
