process.env.GEMINI_API_KEY = "";
process.env.AUTOMATION_ENABLE_GEMINI_FIELD_MAPPING = "false";
process.env.AUTOMATION_EXECUTION_MODE = "simulation";
process.env.AUTOMATION_ENABLE_BROWSER_PDF_CAPTURE = "false";

const { default: express } = await import("express");
const { default: jwt } = await import("jsonwebtoken");
const { default: router } = await import("../Routes/route.js");

const { default: Profile } = await import("../Schema/Profileschema.js");
const { default: Scheme } = await import("../Schema/Schemeschema.js");
const { default: UserDocument } = await import("../Schema/UserDocumentschema.js");
const { default: FormCrawlCache } = await import("../Schema/FormCrawlCacheSchema.js");
const { default: AutomationLog } = await import("../Schema/AutomationLogSchema.js");
const { default: AutomationSession } = await import("../Schema/AutomationSessionSchema.js");

const TEST_PROFILE = {
  name: "Test User",
  date_of_birth: "2002-08-12",
  age: 22,
  gender: "Male",
  occupation: "Student",
  income: "300000",
  state: "Maharashtra",
  category: "OBC",
  aadhaar_number: "123456789012",
  pan_number: "ABCDE1234F",
  bank_account: "1234567890",
  ifsc_code: "SBIN0001234",
  address: "Mumbai",
  email: "test@example.com",
  phone: "9876543210",
};

const TEST_DOCUMENTS = {
  documents: [
    {
      document_name: "Aadhaar Card",
      cloudinary_url: "https://res.cloudinary.com/demo/aadhaar.jpg",
    },
    {
      document_name: "Income Certificate",
      cloudinary_url: "https://res.cloudinary.com/demo/income.jpg",
    },
  ],
};

const TEST_SCHEME = {
  scheme_name: "National Overseas Scholarship For Students With Disabilities",
  official_application_link: "",
  documents_required: [
    "Aadhaar Card",
    "Disability Certificate",
    "Educational Certificates",
    "Income Certificate",
  ],
};

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const clone = (value) => JSON.parse(JSON.stringify(value));
const matches = (doc, filter = {}) =>
  Object.entries(filter).every(([key, expected]) => String(doc[key] ?? "") === String(expected ?? ""));

const userId = "507f1f77bcf86cd799439011";
const profileStore = [
  {
    user: userId,
    age: TEST_PROFILE.age,
    occupation: TEST_PROFILE.occupation,
    category: TEST_PROFILE.category,
    annual_income: Number(TEST_PROFILE.income),
    gender: TEST_PROFILE.gender,
    phone: TEST_PROFILE.phone,
    location: {
      state: TEST_PROFILE.state,
    },
  },
];

const schemeStore = [
  {
    scheme_name: TEST_SCHEME.scheme_name,
    description: "Scholarship support for higher education.",
    eligibility: "Students with disabilities and limited annual income can apply.",
    benefits: ["Financial support"],
    documents_required: TEST_SCHEME.documents_required,
    state: "All",
    category: "OBC,SC,ST,EWS",
    occupation: "Student",
    age_min: 18,
    age_max: 35,
    apply_link: "https://scholarships.gov.in/schemes/nos",
    original_apply_link: "https://scholarships.gov.in",
    scheme_page_link: "https://scholarships.gov.in/schemes/nos",
  },
];

const userDocumentStore = [];
const cacheStore = [];
const logStore = [];
const sessionStore = [];
let sessionCounter = 1;

Profile.findOne = (filter = {}) => ({
  lean: async () => {
    const found = profileStore.find((item) => matches(item, filter));
    return found ? clone(found) : null;
  },
});

Scheme.findOne = (filter = {}) => ({
  lean: async () => {
    const found = schemeStore.find((item) => matches(item, filter));
    return found ? clone(found) : null;
  },
});

Scheme.collection.find = () => ({
  toArray: async () => schemeStore.map((item) => clone(item)),
});

UserDocument.findOne = (filter = {}) => ({
  lean: async () => {
    const found = userDocumentStore.find((item) => matches(item, filter));
    return found ? clone(found) : null;
  },
});

UserDocument.create = async (payload = {}) => {
  const now = new Date().toISOString();
  const record = {
    _id: String(userDocumentStore.length + 1),
    ...clone(payload),
    uploaded_at: payload.uploaded_at || now,
    createdAt: now,
    updatedAt: now,
  };
  userDocumentStore.push(record);
  return clone(record);
};

UserDocument.findByIdAndUpdate = async (id, payload = {}) => {
  const index = userDocumentStore.findIndex((item) => String(item._id) === String(id));
  if (index < 0) return null;
  userDocumentStore[index] = {
    ...userDocumentStore[index],
    ...clone(payload),
    _id: userDocumentStore[index]._id,
    updatedAt: new Date().toISOString(),
  };
  return clone(userDocumentStore[index]);
};

UserDocument.find = (filter = {}) => ({
  sort: (sortSpec = {}) => ({
    lean: async () => {
      const sortKey = Object.keys(sortSpec)[0] || "uploaded_at";
      const direction = sortSpec[sortKey] === -1 ? -1 : 1;
      return userDocumentStore
        .filter((item) => matches(item, filter))
        .sort((a, b) => {
          const aVal = new Date(a[sortKey] || 0).getTime();
          const bVal = new Date(b[sortKey] || 0).getTime();
          return direction === -1 ? bVal - aVal : aVal - bVal;
        })
        .map((item) => clone(item));
    },
  }),
});

FormCrawlCache.findOne = (filter = {}) => ({
  lean: async () => {
    const found = cacheStore.find((item) => {
      const urlMatch = String(item.url || "") === String(filter.url || "");
      const ttlMatch = !filter?.expires_at?.$gt || new Date(item.expires_at).getTime() > new Date(filter.expires_at.$gt).getTime();
      return urlMatch && ttlMatch;
    });
    return found ? clone(found) : null;
  },
});

FormCrawlCache.findOneAndUpdate = async (filter = {}, payload = {}) => {
  const index = cacheStore.findIndex((item) => String(item.url) === String(filter.url));
  if (index >= 0) {
    cacheStore[index] = { ...cacheStore[index], ...clone(payload) };
    return clone(cacheStore[index]);
  }
  const record = { ...clone(payload) };
  cacheStore.push(record);
  return clone(record);
};

AutomationLog.create = async (payload = {}) => {
  logStore.push(clone(payload));
  return clone(payload);
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
    const found = sessionStore.find((item) => matches(item, filter));
    return found ? clone(found) : null;
  },
});

const mockHtml = `
<!DOCTYPE html>
<html>
<head><title>NOS Application</title></head>
<body>
  <form id="nosApplyForm" action="/submit" method="post">
    <label for="fullName">Full Name</label>
    <input id="fullName" name="full_name" type="text" />
    <label for="dob">DOB</label>
    <input id="dob" name="dob" type="text" />
    <label for="category">Category</label>
    <select id="category" name="category">
      <option value="OBC">OBC</option>
      <option value="SC">SC</option>
    </select>
    <label for="annualIncome">Annual Income</label>
    <input id="annualIncome" name="annual_income" type="text" />
    <label for="aadhaarUpload">Upload Aadhaar Card</label>
    <input id="aadhaarUpload" name="aadhaar_upload" type="file" />
    <label for="disabilityUpload">Upload Disability Certificate</label>
    <input id="disabilityUpload" name="disability_upload" type="file" />
    <label for="incomeUpload">Upload Income Certificate</label>
    <input id="incomeUpload" name="income_upload" type="file" />
    <button id="submitBtn" type="submit">Submit</button>
  </form>
</body>
</html>
`;

const mockCloudinaryContent = {
  "https://res.cloudinary.com/demo/aadhaar.jpg": {
    contentType: "text/plain",
    body: [
      "Name: Test User",
      "Date of Birth: 12/08/2002",
      "Aadhaar Number: 1234 5678 9012",
      "Address: Mumbai",
    ].join("\n"),
  },
  "https://res.cloudinary.com/demo/income.jpg": {
    contentType: "text/plain",
    body: [
      "Name: Test User",
      "Annual Income: INR 300000",
    ].join("\n"),
  },
  "https://scholarships.gov.in/schemes/nos": {
    contentType: "text/html",
    body: mockHtml,
  },
};

const nativeFetch = global.fetch.bind(global);
global.fetch = async (url, options) => {
  const target = String(url || "");
  if (mockCloudinaryContent[target]) {
    const mock = mockCloudinaryContent[target];
    return new Response(mock.body, {
      status: 200,
      headers: {
        "content-type": mock.contentType,
      },
    });
  }
  return nativeFetch(url, options);
};

const app = express();
app.use(express.json());
app.use("/", router);

const server = app.listen(0);
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;
const token = jwt.sign({ id: userId }, "mysecretkey");
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
};

const doPost = async (path, payload = {}) => {
  const response = await nativeFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  let json = {};
  try {
    json = await response.json();
  } catch {
    json = {};
  }
  return { status: response.status, json };
};

const doGet = async (path) => {
  const response = await nativeFetch(`${baseUrl}${path}`, {
    method: "GET",
    headers,
  });
  let json = {};
  try {
    json = await response.json();
  } catch {
    json = {};
  }
  return { status: response.status, json };
};

const result = {
  system_test_result: {
    api_tests: "fail",
    cloudinary_upload: "fail",
    document_extraction: "fail",
    database_storage: "fail",
    document_matching: "fail",
    form_crawling: "fail",
    form_mapping: "fail",
    form_autofill: "fail",
    document_upload: "fail",
  },
  missing_documents: [],
  automation_actions: [],
};

try {
  const legacyEndpointChecks = await Promise.all([
    doPost("/upload-document", {}),
    doPost("/extract-document-data", {}),
    doGet("/get-user-documents"),
    doGet("/recommend-schemes"),
    doPost("/apply-scheme", {}),
  ]);
  const missingLegacyEndpoints = legacyEndpointChecks.filter((entry) => entry.status === 404).length;

  const recResponse = await doGet("/scheme/recommend-schemes");
  const recommendEngineHealthy = recResponse.status === 200;
  result.system_test_result.api_tests =
    missingLegacyEndpoints === 0 && recommendEngineHealthy ? "pass" : "fail";

  const aadhaarProcess = await doPost("/documents/process", {
    scheme_data: TEST_SCHEME,
    user_profile: TEST_PROFILE,
    document_upload_event: {
      document_name: TEST_DOCUMENTS.documents[0].document_name,
      cloudinary_url: TEST_DOCUMENTS.documents[0].cloudinary_url,
      file_type: "",
    },
  });
  const incomeProcess = await doPost("/documents/process", {
    scheme_data: TEST_SCHEME,
    user_profile: TEST_PROFILE,
    document_upload_event: {
      document_name: TEST_DOCUMENTS.documents[1].document_name,
      cloudinary_url: TEST_DOCUMENTS.documents[1].cloudinary_url,
      file_type: "",
    },
  });

  const cloudinaryReachable =
    aadhaarProcess.status === 200 &&
    incomeProcess.status === 200 &&
    TEST_DOCUMENTS.documents.every((doc) => normalize(doc.cloudinary_url).includes("res.cloudinary.com"));
  result.system_test_result.cloudinary_upload = cloudinaryReachable ? "pass" : "fail";

  const aadhaarExtracted = aadhaarProcess.json?.extracted_data || {};
  const incomeExtracted = incomeProcess.json?.extracted_data || {};
  const extractionValid =
    normalize(aadhaarExtracted.name) === normalize(TEST_PROFILE.name) &&
    (aadhaarExtracted.date_of_birth || aadhaarExtracted.dob) &&
    normalize(String(aadhaarExtracted.aadhaar_number || "")) === normalize(TEST_PROFILE.aadhaar_number) &&
    normalize(String(incomeExtracted.annual_income || "")) === normalize(TEST_PROFILE.income);
  result.system_test_result.document_extraction = extractionValid ? "pass" : "fail";

  const myDocs = await doGet("/documents/my");
  const docs = Array.isArray(myDocs.json?.documents) ? myDocs.json.documents : [];
  const dbStored =
    myDocs.status === 200 &&
    docs.length >= 2 &&
    docs.some((doc) => normalize(doc.document_name) === normalize("Aadhaar Card")) &&
    docs.some((doc) => normalize(doc.document_name) === normalize("Income Certificate"));
  result.system_test_result.database_storage = dbStored ? "pass" : "fail";

  const requiredStatus = await doPost("/documents/required-status", {
    scheme_data: TEST_SCHEME,
  });
  const missingDocs = Array.isArray(requiredStatus.json?.next_documents_to_upload)
    ? requiredStatus.json.next_documents_to_upload
    : [];
  result.missing_documents = missingDocs;
  result.system_test_result.document_matching =
    requiredStatus.status === 200 && missingDocs.length > 0 ? "pass" : "fail";

  // Intentional test with provided input: official link is empty, so crawler should fail.
  const crawlRes = await doPost("/automation/crawl", {
    scheme_data: TEST_SCHEME,
  });
  result.system_test_result.form_crawling = crawlRes.status === 200 ? "pass" : "fail";

  const generateSteps = await doPost("/automation/generate-steps", {
    scheme_data: TEST_SCHEME,
    user_data: TEST_PROFILE,
    user_documents: TEST_DOCUMENTS,
    form_structure: {
      fields: [
        { label: "Full Name", name: "full_name", type: "text" },
        { label: "DOB", name: "dob", type: "text" },
        { label: "Category", name: "category", type: "dropdown", options: ["OBC", "SC", "ST"] },
        { label: "Annual Income", name: "annual_income", type: "text" },
        { label: "Upload Aadhaar Card", name: "aadhaar_upload", type: "file" },
        { label: "Upload Disability Certificate", name: "disability_upload", type: "file" },
        { label: "Upload Income Certificate", name: "income_upload", type: "file" },
      ],
    },
  });

  const actions = Array.isArray(generateSteps.json?.automation_steps) ? generateSteps.json.automation_steps : [];
  result.automation_actions = actions;

  const mappedFields = Array.isArray(generateSteps.json?.field_mappings)
    ? generateSteps.json.field_mappings
    : [];
  const mappingOk =
    generateSteps.status === 200 &&
    mappedFields.some((entry) => normalize(entry.source_key) === "name") &&
    mappedFields.some((entry) => normalize(entry.source_key) === "date_of_birth") &&
    mappedFields.some((entry) => normalize(entry.source_key) === "income") &&
    mappedFields.some((entry) => normalize(entry.source_key) === "category");
  result.system_test_result.form_mapping = mappingOk ? "pass" : "fail";

  const autofillOk =
    actions.some((entry) => normalize(entry.action) === "fill_input") &&
    actions.some((entry) => normalize(entry.action) === "select_dropdown") &&
    actions.some((entry) => normalize(entry.action) === "review_before_submit");
  result.system_test_result.form_autofill = autofillOk ? "pass" : "fail";

  const uploadOk =
    actions.some(
      (entry) =>
        normalize(entry.action) === "upload_file" &&
        normalize(entry.field).includes("aadhaar") &&
        normalize(entry.file_url).includes("res.cloudinary.com")
    ) &&
    actions.some(
      (entry) =>
        normalize(entry.action) === "upload_file" &&
        normalize(entry.field).includes("income") &&
        normalize(entry.file_url).includes("res.cloudinary.com")
    );
  result.system_test_result.document_upload = uploadOk ? "pass" : "fail";

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    JSON.stringify(
      {
        error: error.message,
        partial_result: result,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} finally {
  server.close();
  global.fetch = nativeFetch;
}
