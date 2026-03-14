process.env.GEMINI_API_KEY = "";
process.env.ENFORCE_CLOUDINARY_URL = "true";
process.env.REJECT_EMPTY_EXTRACTION = "true";
process.env.STRICT_REQUIRED_DOC_MATCH = "true";
process.env.CLOUDINARY_CLOUD_NAME = "demo";
process.env.CLOUDINARY_UPLOAD_PRESET = "unsigned_test";

const { default: express } = await import("express");
const { default: jwt } = await import("jsonwebtoken");
const { default: documentRoutes } = await import("../Routes/documentRoutes.js");
const { default: UserDocument } = await import("../Schema/UserDocumentschema.js");

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const matchesFilter = (doc, filter = {}) =>
  Object.entries(filter).every(([key, expected]) => String(doc[key] ?? "") === String(expected ?? ""));

const store = [];
let idCounter = 1;

UserDocument.findOne = (filter = {}) => ({
  lean: async () => {
    const found = store.find((item) => matchesFilter(item, filter));
    return found ? clone(found) : null;
  },
});

UserDocument.create = async (payload = {}) => {
  const now = new Date().toISOString();
  const record = {
    _id: String(idCounter++),
    ...clone(payload),
    uploaded_at: payload.uploaded_at || now,
    createdAt: now,
    updatedAt: now,
  };
  store.push(record);
  return clone(record);
};

UserDocument.findByIdAndUpdate = async (id, payload = {}) => {
  const index = store.findIndex((item) => String(item._id) === String(id));
  if (index < 0) return null;
  const updated = {
    ...store[index],
    ...clone(payload),
    _id: store[index]._id,
    updatedAt: new Date().toISOString(),
  };
  store[index] = updated;
  return clone(updated);
};

UserDocument.find = (filter = {}) => ({
  sort: (sortSpec = {}) => ({
    lean: async () => {
      const sortKey = Object.keys(sortSpec)[0] || "uploaded_at";
      const direction = sortSpec[sortKey] === -1 ? -1 : 1;
      return store
        .filter((item) => matchesFilter(item, filter))
        .sort((a, b) => {
          const aVal = new Date(a[sortKey] || 0).getTime();
          const bVal = new Date(b[sortKey] || 0).getTime();
          return direction === -1 ? bVal - aVal : aVal - bVal;
        })
        .map((item) => clone(item));
    },
  }),
});

const mockCloudinaryDocs = {
  "https://res.cloudinary.com/demo/raw/upload/v1/aadhaar_1.txt": {
    contentType: "text/plain",
    body: [
      "Name: Ravi Kumar",
      "Date of Birth: 12/08/1995",
      "Aadhaar Number: 1234 5678 9012",
      "Address: Delhi",
    ].join("\n"),
  },
  "https://res.cloudinary.com/demo/raw/upload/v1/aadhaar_2.txt": {
    contentType: "text/plain",
    body: [
      "Name: Ravi Kumar",
      "Date of Birth: 12/08/1995",
      "Aadhaar Number: 9999 8888 7777",
      "Address: Mumbai",
    ].join("\n"),
  },
  "https://res.cloudinary.com/demo/raw/upload/v1/income_invalid.txt": {
    contentType: "text/plain",
    body: "This upload has unreadable OCR and no required values.",
  },
  "https://res.cloudinary.com/demo/raw/upload/v1/uploaded_from_multipart.txt": {
    contentType: "text/plain",
    body: [
      "Name: Ravi Kumar",
      "Date of Birth: 01/01/1999",
      "Aadhaar Number: 1111 2222 3333",
      "Address: Pune",
    ].join("\n"),
  },
};

const nativeFetch = global.fetch.bind(global);
global.fetch = async (url, options) => {
  const target = String(url || "");
  if (target === "https://api.cloudinary.com/v1_1/demo/auto/upload") {
    return new Response(
      JSON.stringify({
        secure_url: "https://res.cloudinary.com/demo/raw/upload/v1/uploaded_from_multipart.txt",
        format: "txt",
        resource_type: "raw",
        bytes: 128,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }
    );
  }
  if (mockCloudinaryDocs[target]) {
    const mock = mockCloudinaryDocs[target];
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
app.use("/documents", documentRoutes);

const server = app.listen(0);
const port = server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;
const authToken = jwt.sign({ id: "507f1f77bcf86cd799439011" }, "mysecretkey");
const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${authToken}`,
};

const call = async (path, payload) => {
  const response = await nativeFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  return { status: response.status, json };
};

const callMultipart = async (path, fields = {}, filePayload = {}) => {
  const formData = new FormData();
  const fileContent = String(filePayload.content || "");
  const fileType = String(filePayload.type || "text/plain");
  const fileName = String(filePayload.name || "document.txt");

  formData.append("file", new Blob([fileContent], { type: fileType }), fileName);
  Object.entries(fields || {}).forEach(([key, value]) => {
    formData.append(key, typeof value === "string" ? value : JSON.stringify(value));
  });

  const response = await nativeFetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
    body: formData,
  });
  const json = await response.json();
  return { status: response.status, json };
};

try {
  const schemeData = {
    scheme_name: "Test Scheme",
    documents_required: ["Aadhaar Card", "Income Certificate"],
  };

  const preStatus = await call("/documents/required-status", { scheme_data: schemeData });
  assert(preStatus.status === 200, "required-status should return 200 before uploads");
  assert(
    preStatus.json.next_documents_to_upload.length === 2,
    "required-status should show both documents as pending"
  );

  const firstUpload = await call("/documents/process", {
    scheme_data: schemeData,
    user_profile: { name: "Ravi Kumar", state: "Delhi" },
    document_upload_event: {
      document_name: "Aadhaar Card",
      cloudinary_url: "https://res.cloudinary.com/demo/raw/upload/v1/aadhaar_1.txt",
      file_type: "txt",
    },
  });
  assert(firstUpload.status === 200, "first upload should return 200");
  assert(firstUpload.json.document_processed === true, "first upload should be processed");
  assert(
    firstUpload.json.extracted_data?.aadhaar_number === "123456789012",
    "aadhaar number should be extracted from upload"
  );
  assert(
    firstUpload.json.dynamic_schema?.autofill_payload?.aadhaar === "123456789012",
    "dynamic schema should include normalized Aadhaar autofill payload"
  );
  assert(
    firstUpload.json.autofill_fields?.aadhaar_number === "123456789012",
    "autofill aliases should include aadhaar_number key"
  );
  assert(store.length === 1, "first upload should create exactly one document record");

  const duplicateUpload = await call("/documents/process", {
    scheme_data: schemeData,
    document_upload_event: {
      document_name: "Aadhaar Card",
      cloudinary_url: "https://res.cloudinary.com/demo/raw/upload/v1/aadhaar_1.txt",
      file_type: "txt",
    },
  });
  assert(duplicateUpload.status === 200, "duplicate upload should still return 200");
  assert(duplicateUpload.json.duplicate_document === true, "duplicate upload should be flagged");
  assert(store.length === 1, "duplicate upload should not create extra record");

  const replacementUpload = await call("/documents/process", {
    scheme_data: schemeData,
    document_upload_event: {
      document_name: "Aadhaar Card",
      cloudinary_url: "https://res.cloudinary.com/demo/raw/upload/v1/aadhaar_2.txt",
      file_type: "txt",
    },
  });
  assert(replacementUpload.status === 200, "replacement upload should return 200");
  assert(replacementUpload.json.duplicate_replaced === true, "replacement should update prior record");
  assert(store.length === 1, "replacement should still keep one Aadhaar record");
  assert(
    replacementUpload.json.extracted_data?.aadhaar_number === "999988887777",
    "replacement upload should refresh extracted value"
  );

  const mismatchUpload = await call("/documents/process", {
    scheme_data: schemeData,
    document_upload_event: {
      document_name: "PAN Card",
      cloudinary_url: "https://res.cloudinary.com/demo/raw/upload/v1/aadhaar_1.txt",
      file_type: "txt",
    },
  });
  assert(mismatchUpload.status === 400, "non-required document should return 400");

  const emptyExtractUpload = await call("/documents/process", {
    scheme_data: { scheme_name: "Test Scheme", documents_required: ["Income Certificate"] },
    document_upload_event: {
      document_name: "Income Certificate",
      cloudinary_url: "https://res.cloudinary.com/demo/raw/upload/v1/income_invalid.txt",
      file_type: "txt",
    },
  });
  assert(emptyExtractUpload.status === 422, "empty extraction should return 422");

  const nonCloudinaryUpload = await call("/documents/process", {
    scheme_data: { scheme_name: "Test Scheme", documents_required: [] },
    document_upload_event: {
      document_name: "Aadhaar Card",
      cloudinary_url: "https://example.com/fake.txt",
      file_type: "txt",
    },
  });
  assert(nonCloudinaryUpload.status === 400, "non-cloudinary URL should return 400 when enforced");

  const postStatus = await call("/documents/required-status", { scheme_data: schemeData });
  assert(postStatus.status === 200, "required-status should return 200 after uploads");
  assert(
    postStatus.json.next_documents_to_upload.length === 1 &&
      postStatus.json.next_documents_to_upload[0] === "Income Certificate",
    "required-status should show only Income Certificate pending"
  );

  const multipartUpload = await callMultipart(
    "/documents/upload-and-process",
    {
      document_name: "Aadhaar Card",
      scheme_data: {
        scheme_name: "Upload API Test Scheme",
        documents_required: ["Aadhaar Card"],
      },
      user_profile: {
        name: "Ravi Kumar",
      },
    },
    {
      name: "aadhaar_upload.txt",
      type: "text/plain",
      content: mockCloudinaryDocs["https://res.cloudinary.com/demo/raw/upload/v1/uploaded_from_multipart.txt"].body,
    }
  );
  assert(multipartUpload.status === 200, "upload-and-process should return 200");
  assert(
    multipartUpload.json.cloudinary_url ===
      "https://res.cloudinary.com/demo/raw/upload/v1/uploaded_from_multipart.txt",
    "upload-and-process should return uploaded cloudinary_url"
  );
  assert(
    multipartUpload.json.extracted_data?.aadhaar_number === "111122223333",
    "upload-and-process should extract Aadhaar from uploaded file"
  );

  console.log("All document endpoint tests passed.");
} finally {
  server.close();
  global.fetch = nativeFetch;
}
