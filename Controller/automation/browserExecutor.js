const EXECUTION_MODE = String(process.env.AUTOMATION_EXECUTION_MODE || "simulation").toLowerCase();
const EXECUTION_TIMEOUT_MS = Number(process.env.AUTOMATION_EXECUTION_TIMEOUT_MS || 60000);

const normalize = (value) => String(value ?? "").trim().toLowerCase();

const buildFilePayloadFromUrl = async (fileUrl) => {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch upload file: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await response.arrayBuffer());
  const url = new URL(fileUrl);
  const fileName = url.pathname.split("/").pop() || "document";

  return {
    name: fileName,
    mimeType: contentType,
    buffer,
  };
};

const executeWithPlaywright = async ({
  actions = [],
  allowSubmit = false,
  dryRunFillOnly = false,
  headless = true,
}) => {
  const playwright = await import("playwright");
  const chromium = playwright?.chromium;
  if (!chromium) {
    throw new Error("Playwright chromium not available");
  }

  const browser = await chromium.launch({ headless });
  const executionLogs = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(EXECUTION_TIMEOUT_MS);

    for (const action of actions) {
      const actionType = normalize(action?.type);
      if (!actionType) continue;

      if (action?.skip_execution) {
        executionLogs.push({
          type: actionType,
          status: "skipped",
          message: action?.skip_reason || "Action skipped by execution policy",
        });
        continue;
      }

      if (actionType === "preview_pause") {
        executionLogs.push({
          type: "preview_pause",
          status: "skipped",
          message: "Preview pause skipped in confirmed execution mode",
        });
        continue;
      }

      if (actionType === "manual_step_required") {
        executionLogs.push({
          type: "manual_step_required",
          status: "warning",
          message: action?.reason || "Manual step required",
        });
        continue;
      }

      if (actionType === "navigate") {
        await page.goto(action.url, { waitUntil: "domcontentloaded" });
        executionLogs.push({ type: actionType, status: "success", message: `Navigated to ${action.url}` });
        continue;
      }

      if (actionType === "fill_input") {
        if (!action.selector) throw new Error(`Missing selector for fill_input: ${action.field || ""}`);
        await page.locator(action.selector).first().fill(String(action.value ?? ""));
        executionLogs.push({ type: actionType, status: "success", message: `Filled ${action.field}` });
        continue;
      }

      if (actionType === "select_dropdown") {
        if (!action.selector) throw new Error(`Missing selector for select_dropdown: ${action.field || ""}`);
        await page.locator(action.selector).first().selectOption(String(action.value ?? ""));
        executionLogs.push({ type: actionType, status: "success", message: `Selected ${action.field}` });
        continue;
      }

      if (actionType === "upload_file") {
        if (!action.selector) throw new Error(`Missing selector for upload_file: ${action.field || ""}`);
        if (!action.file_url) throw new Error(`Missing file_url for upload_file: ${action.field || ""}`);
        const payload = await buildFilePayloadFromUrl(action.file_url);
        await page.locator(action.selector).first().setInputFiles(payload);
        executionLogs.push({ type: actionType, status: "success", message: `Uploaded ${action.field}` });
        continue;
      }

      if (actionType === "click") {
        if (action.selector) {
          await page.locator(action.selector).first().click();
        }
        executionLogs.push({ type: actionType, status: "success", message: `Clicked ${action.field || "button"}` });
        continue;
      }

      if (actionType === "wait") {
        const durationMs = Number(action.duration_ms || 1000);
        await page.waitForTimeout(durationMs);
        executionLogs.push({ type: actionType, status: "success", message: `Waited ${durationMs} ms` });
        continue;
      }

      if (actionType === "submit_form") {
        if (dryRunFillOnly) {
          executionLogs.push({
            type: actionType,
            status: "skipped",
            message: "Submit skipped due to dry_run_fill_only mode",
          });
          continue;
        }

        if (!allowSubmit) {
          executionLogs.push({
            type: actionType,
            status: "skipped",
            message: "Submit blocked because confirmation flag is false",
          });
          continue;
        }

        if (action.selector) {
          await page.locator(action.selector).first().click();
        } else {
          await page.keyboard.press("Enter");
        }
        executionLogs.push({ type: actionType, status: "success", message: "Form submitted" });
        continue;
      }

      executionLogs.push({
        type: actionType,
        status: "warning",
        message: "Unknown action type, skipped",
      });
    }

    return {
      executed: true,
      simulation: false,
      logs: executionLogs,
    };
  } finally {
    await browser.close().catch(() => {});
  }
};

const executeInSimulation = async ({ actions = [], allowSubmit = false, dryRunFillOnly = false }) => {
  const logs = actions.map((action) => {
    if (action?.skip_execution) {
      return {
        type: action?.type || "unknown",
        status: "skipped",
        message: action?.skip_reason || "Action skipped by execution policy",
      };
    }
    if (normalize(action?.type) === "submit_form" && dryRunFillOnly) {
      return {
        type: action.type,
        status: "skipped",
        message: "Submit skipped due to dry_run_fill_only mode",
      };
    }
    if (normalize(action?.type) === "submit_form" && !allowSubmit) {
      return {
        type: action.type,
        status: "skipped",
        message: "Submit blocked in simulation mode",
      };
    }
    return {
      type: action?.type || "unknown",
      status: "simulated",
      message: `Simulated action ${action?.type || "unknown"}`,
    };
  });
  return {
    executed: true,
    simulation: true,
    logs,
  };
};

export const executeAutomationActions = async ({
  actions = [],
  confirmSubmission = false,
  dryRunFillOnly = false,
  forceSimulation = false,
}) => {
  const allowSubmit = Boolean(confirmSubmission);
  const simulationMode = forceSimulation || EXECUTION_MODE !== "playwright";
  if (simulationMode) {
    return executeInSimulation({ actions, allowSubmit, dryRunFillOnly });
  }
  return executeWithPlaywright({ actions, allowSubmit, dryRunFillOnly, headless: true });
};
