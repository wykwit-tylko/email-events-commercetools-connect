#!/usr/bin/env node
/**
 * Deploy the event-proxy connector to commercetools Connect.
 *
 * Steps:
 *   1. Reads .env from the working directory.
 *   2. Auto-constructs OUTBOUND_PUBLISHER_CONFIG from CF_* vars if the full JSON is absent.
 *   3. Validates prerequisites (commercetools CLI, required credentials, publisher config).
 *   4. Authenticates with the commercetools CLI.
 *   5. Reads the latest git tag.
 *   6. Updates (or creates) the ConnectorStaged with the new tag.
 *   7. Publishes the staged connector and waits for Published.
 *   8. Verifies the connector supports the current project.
 *   9. Finds existing deployments for this connector key.
 *   10. Attempts an in-place update of the existing deployment.
 *   11. If no deployment exists or update fails, creates a new deployment.
 *   12. If a new deployment was created and an old one existed, waits for the new one
 *       to reach Deployed, then deletes the old one.
 *   13. Polls deployment status until terminal.
 *   14. Reports total elapsed time.
 *
 * Usage:
 *   node scripts/deploy.mjs
 *   node scripts/deploy.mjs --dry-run
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Configuration ───────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONNECTOR_KEY = "email-events-proxy";
const CONNECTOR_NAME = "Email Events Proxy";
const CREATOR_EMAIL = "emails@tylko.dev";
const INTEGRATION_TYPES = "email";
const DEPLOYMENT_TYPE = "sandbox";
const POLL_INTERVAL_SECONDS = 20;
const MAX_POLL_ATTEMPTS = 60; // 20 minutes

const STEPS = [
  "load",
  "tag",
  "auth",
  "stage",
  "publish",
  "verify",
  "find",
  "deploy",
  "poll",
  "cleanup",
];

function parseFromArg(args) {
  const fromArg = args.find((a) => a.startsWith("--from="));
  if (!fromArg) return null;

  const raw = fromArg.slice("--from=".length).toLowerCase();

  // Accept step names or 1-based numbers
  const stepIndex = STEPS.indexOf(raw);
  if (stepIndex !== -1) {
    return { name: raw, index: stepIndex };
  }

  const num = parseInt(raw, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= STEPS.length) {
    return { name: STEPS[num - 1], index: num - 1 };
  }

  console.error(`Error: Invalid --from value '${raw}'.`);
  console.error(`  Use a step name: ${STEPS.join(", ")}`);
  console.error(`  Or a step number: 1-${STEPS.length}`);
  process.exit(1);
}

function shouldRun(step, from) {
  if (!from) return true;
  const stepIndex = STEPS.indexOf(step);
  return stepIndex >= from.index;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadEnv(path = ".env") {
  const envPath = resolve(path);
  if (!existsSync(envPath)) {
    console.error(`Error: .env file not found at ${envPath}`);
    console.error("Create one from .env.example and fill in your credentials.");
    process.exit(1);
  }

  const content = readFileSync(envPath, "utf8");
  const env = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function extractRegion(authUrl) {
  try {
    const url = new URL(authUrl);
    const parts = url.hostname.split(".");
    if (parts.length >= 4) {
      return parts.slice(1, -2).join(".");
    }
  } catch {
    // ignore
  }
  return null;
}

function sleepSync(seconds) {
  try {
    execSync(`sleep ${seconds}`, { stdio: "ignore" });
  } catch {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      // busy wait
    }
  }
}

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, "");
}

function run(command, options = {}) {
  console.log(`\n> ${command}\n`);
  try {
    return execSync(command, { encoding: "utf8", stdio: "inherit", ...options });
  } catch (e) {
    if (options.ignoreError) {
      console.log(`Command failed (ignored): ${e.message || ""}`);
      return null;
    }
    throw e;
  }
}

function runSilent(command, options = {}) {
  try {
    const output = execSync(command, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      ...options,
    });
    return stripAnsi(output);
  } catch {
    return null;
  }
}

function runWithOutput(command, options = {}) {
  console.log(`\n> ${command}\n`);
  try {
    const output = execSync(command, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "inherit"],
      ...options,
    });
    return stripAnsi(output);
  } catch (e) {
    if (options.ignoreError) {
      return null;
    }
    throw e;
  }
}

function getLatestGitTag() {
  const output = runSilent("git describe --tags --abbrev=0");
  if (!output) {
    console.error("Error: Could not determine latest git tag. Ensure the repository has at least one tag.");
    process.exit(1);
  }
  return output.trim();
}

function getGitRemoteUrl() {
  const output = runSilent("git remote get-url origin");
  if (!output) {
    console.error("Error: Could not determine git remote URL. Ensure 'origin' remote is configured.");
    process.exit(1);
  }
  return output.trim();
}

function formatDuration(ms) {
  const sec = (ms / 1000).toFixed(1);
  return `${sec}s`;
}

function b64(value) {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return `b64:${encoded}`;
}

// ─── Publisher Config Auto-Construction ────────────────────────────────────────

function buildPublisherConfig(env) {
  // If already explicitly configured, validate and return it
  if (env.OUTBOUND_PUBLISHER_CONFIG) {
    try {
      const parsed = JSON.parse(env.OUTBOUND_PUBLISHER_CONFIG);
      if (parsed?.type !== "cloudflare-queue") {
        throw new Error("OUTBOUND_PUBLISHER_CONFIG.type must be cloudflare-queue");
      }
      if (!parsed.accountId || !parsed.queueId || !parsed.apiToken) {
        throw new Error("OUTBOUND_PUBLISHER_CONFIG must contain accountId, queueId, and apiToken");
      }
      return parsed;
    } catch (e) {
      console.error(`Error: Invalid OUTBOUND_PUBLISHER_CONFIG: ${e.message}`);
      process.exit(1);
    }
  }

  // Auto-construct from individual CF_* variables
  const accountId = env.CF_ACCOUNT_ID;
  const queueId = env.CF_QUEUE_ID;
  const apiToken = env.CF_QUEUE_API_TOKEN;

  if (!accountId && !queueId && !apiToken) {
    return null;
  }

  if (!accountId || !queueId || !apiToken) {
    console.error("Error: Partial Cloudflare configuration found.");
    console.error("  Provide all three: CF_ACCOUNT_ID, CF_QUEUE_ID, CF_QUEUE_API_TOKEN");
    console.error("  Or provide the full OUTBOUND_PUBLISHER_CONFIG JSON.");
    process.exit(1);
  }

  return {
    type: "cloudflare-queue",
    accountId,
    queueId,
    apiToken,
  };
}

// ─── Config Flags Builder ────────────────────────────────────────────────────

function buildConfigFlags(env, publisherConfig) {
  const flags = [];
  const prefix = "event-proxy";

  const standardConfigKeys = [
    "CT_SUBSCRIPTION_KEY",
    "MAX_BODY_BYTES",
    "FORWARDING_TIMEOUT_MS",
    "DRY_RUN_FORWARDING",
    "DEV_INSPECTION_ENABLED",
    "DEV_INSPECTION_MAX_MESSAGES",
  ];

  for (const key of standardConfigKeys) {
    const value = env[key];
    if (value && value.trim().length > 0) {
      flags.push(`--configuration '${prefix}.${key}=${value}'`);
    }
  }

  // Values that contain commas or JSON are base64-encoded so the
  // commercetools CLI does not split them. The app decodes them at runtime.
  if (env.CT_MESSAGE_TYPES) {
    flags.push(`--configuration '${prefix}.CT_MESSAGE_TYPES=${b64(env.CT_MESSAGE_TYPES)}'`);
  }

  if (env.CT_MESSAGE_RESOURCE_TYPES) {
    flags.push(`--configuration '${prefix}.CT_MESSAGE_RESOURCE_TYPES=${b64(env.CT_MESSAGE_RESOURCE_TYPES)}'`);
  }

  if (publisherConfig) {
    flags.push(`--configuration '${prefix}.OUTBOUND_PUBLISHER_CONFIG=${b64(JSON.stringify(publisherConfig))}'`);
  }

  return flags;
}

// ─── Connector Staging & Publishing ────────────────────────────────────────

function stageOrCreateConnector(latestTag) {
  const updateCommand = [
    "commercetools connect connectorstaged update",
    `--key ${CONNECTOR_KEY}`,
    `--repository-tag ${latestTag}`,
    `--integration-types ${INTEGRATION_TYPES}`,
  ].join(" ");

  try {
    run(updateCommand);
    console.log(`ConnectorStaged '${CONNECTOR_KEY}' updated to tag ${latestTag}`);
  } catch {
    console.log("\nUpdate failed; attempting to create ConnectorStaged...\n");
    const repoUrl = getGitRemoteUrl();
    const createCommand = [
      "commercetools connect connectorstaged create",
      `--key ${CONNECTOR_KEY}`,
      `--repository-url ${repoUrl}`,
      `--repository-tag ${latestTag}`,
      `--name "${CONNECTOR_NAME}"`,
      `--creator-email ${CREATOR_EMAIL}`,
      `--integration-types ${INTEGRATION_TYPES}`,
    ].join(" ");
    run(createCommand);
    console.log(`ConnectorStaged '${CONNECTOR_KEY}' created with tag ${latestTag}`);
  }
}

function publishConnector() {
  const publishCommand = `commercetools connect connectorstaged publish --key ${CONNECTOR_KEY}`;
  run(publishCommand, { ignoreError: true });

  const published = pollConnectorPublished();
  if (!published) {
    console.error("\nConnector publication did not reach Published state. Aborting.");
    process.exit(1);
  }
  console.log("Connector published successfully.");
}

function pollConnectorPublished() {
  console.log(`\nPolling connector '${CONNECTOR_KEY}' publish status every ${POLL_INTERVAL_SECONDS}s...\n`);

  const terminalStates = ["Published", "Failed"];

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    const output = runSilent(`commercetools connect connectorstaged describe --key ${CONNECTOR_KEY}`);

    if (!output) {
      console.log(`Attempt ${attempt}: unable to fetch connector status, retrying in ${POLL_INTERVAL_SECONDS}s...`);
      sleepSync(POLL_INTERVAL_SECONDS);
      continue;
    }

    const statusMatch = output.match(/status:\s*['"]?([\w]+)['"]?/i);
    if (statusMatch) {
      const status = statusMatch[1];
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Connector status: ${status}`);

      if (terminalStates.includes(status)) {
        console.log(`\nConnector reached terminal state: ${status}`);
        return status === "Published";
      }
    } else {
      console.log(`Attempt ${attempt}: could not parse status, retrying in ${POLL_INTERVAL_SECONDS}s...`);
    }

    if (attempt < MAX_POLL_ATTEMPTS) {
      sleepSync(POLL_INTERVAL_SECONDS);
    }
  }

  console.error(`\nTimed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_SECONDS} seconds.`);
  return false;
}

// ─── Connector Project Support Verification ────────────────────────────────

function verifyConnectorSupportsProject(projectKey) {
  const output = runSilent(`commercetools connect connectorstaged describe --key ${CONNECTOR_KEY}`);
  if (!output) {
    console.log("Could not fetch connector details; skipping project support check.");
    return;
  }

  // Check if the connector is private (restricted to specific projects)
  const privateMatch = output.match(/private:\s*(true|false)/i);
  const isPrivate = privateMatch ? privateMatch[1].toLowerCase() === "true" : false;

  if (!isPrivate) {
    console.log(`Connector '${CONNECTOR_KEY}' is public (supports all projects).`);
    return;
  }

  // Extract privateProjects list. The CLI formats connectors as a single
  // comma-separated line where field names act as delimiters.
  // We find everything between "privateProjects:" and the next known field.
  const privateProjectsIdx = output.indexOf("privateProjects:");
  let supportedProjects = [];

  if (privateProjectsIdx !== -1) {
    const start = privateProjectsIdx + "privateProjects:".length;
    const nextFieldNames = [
      "integrationTypes:", "supportedRegions:", "hasChanges:",
      "alreadyListed:", "status:", "publishingReport:", "isPreviewable:",
      "previewableReport:", "private:", "documentationUrl:", "apiClient:",
      "globalConfiguration:", "configurations:", "repository:", "creator:",
      "key:", "name:", "description:", "id:", "version:",
    ];

    let end = output.length;
    for (const field of nextFieldNames) {
      const idx = output.indexOf(field, start);
      if (idx !== -1 && idx < end) {
        end = idx;
      }
    }

    const rawValues = output.slice(start, end).trim();
    supportedProjects = rawValues
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((p) => p.trim().replace(/['"\[\]]/g, ""))
      .filter(Boolean);
  }

  if (supportedProjects.includes(projectKey)) {
    console.log(`Connector '${CONNECTOR_KEY}' supports project '${projectKey}'.`);
    return;
  }

  console.error(`\nError: Connector '${CONNECTOR_KEY}' is restricted to specific projects.`);
  console.error(`Current project '${projectKey}' is NOT in the supported projects list.`);
  console.error(`Supported projects: ${supportedProjects.length > 0 ? supportedProjects.join(", ") : "(none listed)"}`);
  console.error("\nHow to fix:");
  console.error("  1. Go to Merchant Center → Connect → Manage connectors");
  console.error(`  2. Find the connector '${CONNECTOR_KEY}'`);
  console.error("  3. Edit the connector settings");
  console.error("  4. In 'Supported projects', select 'All projects of this organization'");
  console.error(`     OR add '${projectKey}' to the specific projects list`);
  console.error("  5. Save and re-run the deployment script");
  process.exit(1);
}

// ─── Deployment Management ───────────────────────────────────────────────────

function listDeployments() {
  const output = runSilent("commercetools connect deployment list");
  if (!output) return [];

  const deployments = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("ID") || trimmed.startsWith("Showing")) continue;

    const idMatch = trimmed.match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
    if (idMatch) {
      deployments.push({ id: idMatch[1] });
    }
  }

  return deployments;
}

function getDeploymentConnectorKey(deploymentId) {
  const output = runSilent(`commercetools connect deployment describe --id ${deploymentId}`);
  if (!output) return null;

  const connectorKeyMatch = output.match(/connector:\s*\{[\s\S]*?key:\s*'([^']+)'/);
  if (connectorKeyMatch) return connectorKeyMatch[1];

  const altMatch = output.match(/"key":\s*"([^"]+)"/);
  if (altMatch) return altMatch[1];

  return null;
}

function findDeploymentsForConnector(connectorKey) {
  const deployments = listDeployments();
  const matching = [];

  for (const dep of deployments) {
    const depConnectorKey = getDeploymentConnectorKey(dep.id);
    if (depConnectorKey === connectorKey) {
      const output = runSilent(`commercetools connect deployment describe --id ${dep.id}`);
      const statusMatch = output?.match(/status:\s*['"']?(\w+)['"']?/i);
      const keyMatch = output?.match(/key:\s*['"']?([\w-]+)['"']?/i);
      matching.push({
        id: dep.id,
        key: keyMatch ? keyMatch[1] : null,
        status: statusMatch ? statusMatch[1] : "unknown",
      });
    }
  }

  return matching;
}

function extractDeploymentIdFromOutput(stdout) {
  const idMatch = stdout.match(/ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i) ||
                  stdout.match(/"id":\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/);
  return idMatch ? idMatch[1] : null;
}

function extractDeploymentKeyFromOutput(stdout) {
  const keyMatch = stdout.match(/key:\s*([A-Za-z0-9_-]+)/i) ||
                   stdout.match(/"key":\s*"([A-Za-z0-9_-]+)"/);
  return keyMatch ? keyMatch[1] : null;
}

function deleteDeployment(deleteFlag) {
  const command = `printf "y\\n" | commercetools connect deployment delete ${deleteFlag}`;
  console.log(`\n> ${command}\n`);
  try {
    const output = execSync(command, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const clean = stripAnsi(output);
    const successLine = clean.match(/Deployment .* has been successfully deleted/);
    if (successLine) {
      console.log(successLine[0]);
    }
    return true;
  } catch (e) {
    const clean = stripAnsi(e.stdout || "");
    const errMatch = clean.match(/Error:\s*(.+)/);
    const reason = errMatch ? errMatch[1].trim() : (e.message || "unknown error");
    console.log(`Command failed (ignored): ${reason}`);
    return false;
  }
}

function pollDeploymentStatus(targetRef, isId = false) {
  console.log(`\nPolling deployment ${isId ? "id" : "key"}=${targetRef} every ${POLL_INTERVAL_SECONDS}s until terminal...\n`);

  const terminalStates = ["Deployed", "Failed", "UndeployFailed"];
  const describeFlag = isId ? `--id ${targetRef}` : `--key ${targetRef}`;

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
    const output = runSilent(`commercetools connect deployment describe ${describeFlag}`);

    if (!output) {
      console.log(`Attempt ${attempt}: unable to fetch status, retrying in ${POLL_INTERVAL_SECONDS}s...`);
      sleepSync(POLL_INTERVAL_SECONDS);
      continue;
    }

    const statusMatch = output.match(/status:\s*['"']?(\w+)['"']?/i);
    if (statusMatch) {
      const status = statusMatch[1];
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Status: ${status}`);

      if (terminalStates.includes(status)) {
        console.log(`\nDeployment reached terminal state: ${status}`);
        return status === "Deployed";
      }
    } else {
      console.log(`Attempt ${attempt}: could not parse status, retrying in ${POLL_INTERVAL_SECONDS}s...`);
    }

    if (attempt < MAX_POLL_ATTEMPTS) {
      sleepSync(POLL_INTERVAL_SECONDS);
    }
  }

  console.error(`\nTimed out after ${MAX_POLL_ATTEMPTS * POLL_INTERVAL_SECONDS} seconds.`);
  return false;
}

function createDeployment(region, configFlags) {
  const deployCommandParts = [
    "commercetools connect deployment create",
    `--region ${region}`,
    `--connector-key ${CONNECTOR_KEY}`,
    `--type ${DEPLOYMENT_TYPE}`,
    ...configFlags,
  ];
  const deployCommand = deployCommandParts.join(" ");

  let stdout;
  try {
    stdout = runWithOutput(deployCommand);
  } catch (e) {
    const clean = stripAnsi(e.stdout || "");
    if (clean.includes("AuthorizationError") || clean.includes("Access denied")) {
      console.error("\nError: Your API client does not have permission to create Connect deployments.");
      console.error("The commercetools CLI authenticated successfully, but the API rejected the request.");
      console.error("\nRequired scopes for deployment management:");
      console.error("  - manage_project  (or a Connect-specific scope like manage_connectors)");
      console.error("\nHow to fix:");
      console.error("  1. Go to the Merchant Center → Settings → Developer Settings → API Clients");
      console.error("  2. Create or update an API client with the required scopes");
      console.error("  3. Update CTP_CLIENT_ID and CTP_CLIENT_SECRET in your .env");
      process.exit(1);
    }
    throw e;
  }

  if (!stdout) {
    throw new Error("Deployment creation produced no output.");
  }

  const deploymentKey = extractDeploymentKeyFromOutput(stdout);
  const deploymentId = extractDeploymentIdFromOutput(stdout);

  return { deploymentKey, deploymentId };
}

function updateDeployment(deploymentRef, region, configFlags, isId = false) {
  const refFlag = isId ? `--id ${deploymentRef}` : `--key ${deploymentRef}`;
  const updateCommandParts = [
    "commercetools connect deployment update",
    refFlag,
    `--region ${region}`,
    ...configFlags,
  ];
  const updateCommand = updateCommandParts.join(" ");

  try {
    const stdout = runWithOutput(updateCommand);
    if (!stdout) {
      return null;
    }

    const deploymentKey = extractDeploymentKeyFromOutput(stdout);
    const deploymentId = extractDeploymentIdFromOutput(stdout);

    return { deploymentKey, deploymentId, updated: true };
  } catch (e) {
    const clean = stripAnsi(e.stdout || "");
    if (clean.includes("AuthorizationError") || clean.includes("Access denied")) {
      console.error("\nError: Your API client does not have permission to update Connect deployments.");
      console.error("The commercetools CLI authenticated successfully, but the API rejected the request.");
      console.error("\nRequired scopes for deployment management:");
      console.error("  - manage_project (or a Connect-specific scope like manage_connectors)");
      console.error("\nHow to fix:");
      console.error("  1. Go to the Merchant Center → Settings → Developer Settings → API Clients");
      console.error("  2. Create or update an API client with the required scopes");
      console.error("  3. Update CTP_CLIENT_ID and CTP_CLIENT_SECRET in your .env");
      process.exit(1);
    }
    return { updated: false };
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validatePrerequisites(env) {
  // Check commercetools CLI
  try {
    execSync("commercetools --version", { stdio: "ignore" });
  } catch {
    console.error("Error: commercetools CLI is not installed or not in PATH.");
    console.error("Install it with: npm install -g @commercetools/cli");
    process.exit(1);
  }

  // Check required commercetools credentials
  const requiredCtpVars = ["CTP_CLIENT_ID", "CTP_CLIENT_SECRET", "CTP_PROJECT_KEY"];
  const missingCtp = requiredCtpVars.filter((key) => !env[key]);
  if (missingCtp.length > 0) {
    console.error("Error: Missing required commercetools credentials in .env:");
    for (const key of missingCtp) {
      console.error(`  ${key}`);
    }
    process.exit(1);
  }

  // Check region can be determined
  const authUrl = env.CTP_AUTH_URL;
  const region = env.CTP_REGION;
  if (!authUrl && !region) {
    console.error("Error: Either CTP_AUTH_URL or CTP_REGION must be set in .env.");
    process.exit(1);
  }

  // Check publisher config
  const publisherConfig = buildPublisherConfig(env);
  if (!publisherConfig) {
    console.error("Error: No outbound publisher configuration found.");
    console.error("  Set OUTBOUND_PUBLISHER_CONFIG as JSON in .env");
    console.error("  Or set CF_ACCOUNT_ID, CF_QUEUE_ID, and CF_QUEUE_API_TOKEN");
    process.exit(1);
  }

  return publisherConfig;
}

// ─── Main Pipeline ───────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const from = parseFromArg(args);

  const pipelineStart = Date.now();

  console.log("=== Event Proxy Connector Deployment ===\n");

  if (from) {
    console.log(`*** STARTING FROM STEP: ${from.name} (${from.index + 1}/${STEPS.length}) ***\n`);
  }

  if (dryRun) {
    console.log("\n*** DRY RUN MODE ***");
    console.log("No changes will be made. Commands will be printed but not executed.\n");
  }

  // ── Step 1: Load and validate configuration ────────────────────────────────
  let env;
  let publisherConfig;
  let resolvedRegion;

  const stepLoadStart = Date.now();
  console.log("--- Step 1: Load and validate configuration ---");
  env = loadEnv();
  publisherConfig = validatePrerequisites(env);

  resolvedRegion = env.CTP_REGION || extractRegion(env.CTP_AUTH_URL);
  if (!resolvedRegion) {
    console.error(`Error: Could not extract region from CTP_AUTH_URL: ${env.CTP_AUTH_URL}`);
    process.exit(1);
  }

  console.log(`Region: ${resolvedRegion}`);
  console.log(`Project: ${env.CTP_PROJECT_KEY}`);
  console.log(`Publisher: cloudflare-queue (account=${publisherConfig.accountId}, queue=${publisherConfig.queueId})`);
  console.log(`Step 1 completed in ${formatDuration(Date.now() - stepLoadStart)}\n`);

  if (dryRun) {
    console.log("Dry run: would construct the following configuration flags:");
    const flags = buildConfigFlags(env, publisherConfig);
    for (const flag of flags) {
      console.log(`  ${flag}`);
    }
    console.log("\nDry run complete. No changes made.");
    return;
  }

  // ── Step 2: Determine release version ───────────────────────────────────────
  let latestTag = null;

  if (shouldRun("tag", from)) {
    const stepStart = Date.now();
    console.log("--- Step 2: Determine release version ---");
    latestTag = getLatestGitTag();
    console.log(`Latest git tag: ${latestTag}`);
    console.log(`Step 2 completed in ${formatDuration(Date.now() - stepStart)}\n`);
  }

  function authenticate() {
    run(
      [
        "commercetools auth login",
        "--client-credentials",
        `--client-id ${env.CTP_CLIENT_ID}`,
        `--client-secret ${env.CTP_CLIENT_SECRET}`,
        `--region ${resolvedRegion}`,
        `--project-key ${env.CTP_PROJECT_KEY}`,
      ].join(" "),
    );
  }

  // ── Step 3: Authenticate with commercetools ─────────────────────────────────
  if (shouldRun("auth", from)) {
    const stepStart = Date.now();
    console.log("--- Step 3: Authenticate with commercetools ---");
    authenticate();
    console.log(`Step 3 completed in ${formatDuration(Date.now() - stepStart)}\n`);
  }

  function reauthenticate() {
    console.log("--- Re-authenticating with commercetools ---");
    authenticate();
  }

  // ── Step 4: Stage or create connector ─────────────────────────────────────
  if (shouldRun("stage", from)) {
    const stepStart = Date.now();
    console.log(`--- Step 4: Stage ConnectorStaged '${CONNECTOR_KEY}' ---`);
    stageOrCreateConnector(latestTag);
    console.log(`Step 4 completed in ${formatDuration(Date.now() - stepStart)}\n`);
  }

  // ── Step 5: Publish connector ─────────────────────────────────────────────
  if (shouldRun("publish", from)) {
    const stepStart = Date.now();
    console.log(`--- Step 5: Publish ConnectorStaged '${CONNECTOR_KEY}' ---`);
    publishConnector();
    console.log(`Step 5 completed in ${formatDuration(Date.now() - stepStart)}\n`);
  }

  // ── Step 6: Verify connector project support ────────────────────────────────
  if (shouldRun("find", from) || shouldRun("deploy", from)) {
    const stepStart = Date.now();
    console.log(`--- Step 6: Verify connector supports project '${env.CTP_PROJECT_KEY}' ---`);
    verifyConnectorSupportsProject(env.CTP_PROJECT_KEY);
    console.log(`Step 6 completed in ${formatDuration(Date.now() - stepStart)}\n`);
  }

  // ── Step 7: Find existing deployments ─────────────────────────────────────
  let oldDeployments = [];

  if (shouldRun("find", from)) {
    const stepStart = Date.now();
    console.log(`--- Step 7: Find existing deployments ---`);
    oldDeployments = findDeploymentsForConnector(CONNECTOR_KEY);

    if (oldDeployments.length === 0) {
      console.log("No existing deployments found.");
    } else {
      console.log(`Found ${oldDeployments.length} existing deployment(s):`);
      for (const dep of oldDeployments) {
        console.log(`  - ${dep.key || dep.id} (${dep.status})`);
      }
    }
    console.log(`Step 7 completed in ${formatDuration(Date.now() - stepStart)}\n`);
  }

  // ── Step 8: Deploy (update in-place or create new) ─────────────────────────
  let newDeployment = null;
  let deploymentMethod = "unknown";

  if (shouldRun("deploy", from)) {
    const configFlags = buildConfigFlags(env, publisherConfig);

    const stepStart = Date.now();
    console.log("--- Step 8: Deploy ---");

    // Re-authenticate before deployment because the token may have expired
    // while waiting for connector publication in Step 5
    reauthenticate();

    // Try update in-place first
    if (oldDeployments.length > 0) {
      const target = oldDeployments[0];
      console.log(`\nAttempting in-place update of deployment ${target.key || target.id}...`);
      const updateResult = updateDeployment(
        target.key || target.id,
        resolvedRegion,
        configFlags,
        !target.key, // use id if no key
      );

      if (updateResult?.updated) {
        console.log("In-place update succeeded.");
        newDeployment = updateResult;
        deploymentMethod = "update";
      } else {
        console.log("In-place update failed or not supported. Will create new deployment.");
      }
    }

    // Create new deployment if update failed or no existing deployment
    if (!newDeployment) {
      console.log("\nCreating new deployment...");
      newDeployment = createDeployment(resolvedRegion, configFlags);
      deploymentMethod = "create";
    }

    console.log(`Step 8 completed in ${formatDuration(Date.now() - stepStart)}\n`);
  }

  // ── Step 9: Poll deployment status ──────────────────────────────────────────
  let deployed = false;

  if (shouldRun("poll", from)) {
    const stepStart = Date.now();
    console.log("--- Step 9: Poll deployment status ---");

    if (!newDeployment) {
      // When starting from poll, discover the deployment by connector key
      console.log("Discovering deployment to poll...");
      const currentDeployments = findDeploymentsForConnector(CONNECTOR_KEY);
      if (currentDeployments.length === 0) {
        console.error("Error: No deployment found for connector. Cannot poll.");
        process.exit(1);
      }
      newDeployment = {
        deploymentKey: currentDeployments[0].key,
        deploymentId: currentDeployments[0].id,
      };
    }

    if (newDeployment.deploymentKey) {
      deployed = pollDeploymentStatus(newDeployment.deploymentKey, false);
    } else if (newDeployment.deploymentId) {
      deployed = pollDeploymentStatus(newDeployment.deploymentId, true);
    } else {
      console.log("No deployment key or ID found in output; skipping poll.");
    }

    if (!deployed) {
      console.error("\nDeployment did not reach Deployed state. Aborting.");
      process.exit(1);
    }
    console.log(`Step 9 completed in ${formatDuration(Date.now() - stepStart)}\n`);
  }

  // ── Step 10: Clean up old deployments ────────────────────────────────────────
  if (shouldRun("cleanup", from)) {
    const stepStart = Date.now();
    console.log("--- Step 10: Clean up old deployments ---");

    if (!oldDeployments && deploymentMethod === "create") {
      // When starting from cleanup, we need to know old deployments
      oldDeployments = findDeploymentsForConnector(CONNECTOR_KEY);
    }

    if (deploymentMethod === "create" && oldDeployments.length > 0) {
      for (const dep of oldDeployments) {
        const deleteFlag = dep.key ? `--key ${dep.key}` : `--id ${dep.id}`;
        deleteDeployment(deleteFlag);
      }
      console.log(`Step 10 completed in ${formatDuration(Date.now() - stepStart)}\n`);
    } else {
      console.log("Skipped (update-in-place used or no previous deployment).");
      console.log();
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────────
  const elapsedMs = Date.now() - pipelineStart;
  console.log(`=== Deployment completed in ${formatDuration(elapsedMs)} ===`);
  console.log(`\nConnector: ${CONNECTOR_KEY}`);
  console.log(`Version:   ${latestTag || "(skipped)"}`);
  console.log(`Region:    ${resolvedRegion}`);
  console.log(`Project:   ${env.CTP_PROJECT_KEY}`);
  if (newDeployment?.deploymentKey) {
    console.log(`Deployment key: ${newDeployment.deploymentKey}`);
  }
  if (newDeployment?.deploymentId) {
    console.log(`Deployment id:  ${newDeployment.deploymentId}`);
  }

  // Note: comma-containing configs are automatically base64-encoded
  // by the deploy script and decoded by the app at runtime.
}

main().catch((err) => {
  console.error("\nUnexpected error:", err.message);
  process.exit(1);
});
