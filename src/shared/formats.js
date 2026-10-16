// Every way the add-on can hand credentials over. Each format is a pure
// function of one "ctx": the credentials plus what we know about the role.
//
//   ctx = { accessKeyId, secretAccessKey, sessionToken, expiration,
//           region, accountId, accountName, roleName, roleArn, profileName }
//
// Bundles render several roles into one text (a credentials file with a
// profile per role, env blocks with a comment each).

export const OS_TABS = [
  { id: "sh", label: "macOS and Linux" },
  { id: "win", label: "Windows" },
  { id: "ps", label: "PowerShell" },
  { id: "fish", label: "fish" },
];

export const DEFAULT_PROFILE_PATTERN = "{account}-{role}";

// A profile name from the user's pattern. Keeps to the characters the CLI
// is happy with in a section header.
export function profileNameFor(pattern, ctx) {
  const raw = String(pattern || DEFAULT_PROFILE_PATTERN)
    .replace(/\{account\}/g, ctx.accountName || ctx.accountId || "")
    .replace(/\{accountId\}/g, ctx.accountId || "")
    .replace(/\{role\}/g, ctx.roleName || "")
    .trim();
  const cleaned = raw
    .replace(/[^A-Za-z0-9_.@-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "saml";
}

const q = (v) => `"${String(v).replace(/(["\\$`])/g, "\\$1")}"`;

export function envLines(ctx, os) {
  const vars = [
    ["AWS_ACCESS_KEY_ID", ctx.accessKeyId],
    ["AWS_SECRET_ACCESS_KEY", ctx.secretAccessKey],
    ["AWS_SESSION_TOKEN", ctx.sessionToken],
  ];
  if (ctx.expiration) vars.push(["AWS_CREDENTIAL_EXPIRATION", ctx.expiration]);
  if (ctx.region)
    vars.push(["AWS_REGION", ctx.region], ["AWS_DEFAULT_REGION", ctx.region]);
  switch (os) {
    case "win":
      return vars.map(([k, v]) => `set ${k}=${v}`).join("\n");
    case "ps":
      return vars.map(([k, v]) => `$Env:${k}=${q(v)}`).join("\n");
    case "fish":
      return vars.map(([k, v]) => `set -gx ${k} ${q(v)}`).join("\n");
    default:
      return vars.map(([k, v]) => `export ${k}=${q(v)}`).join("\n");
  }
}

export function unsetLines(ctx, os) {
  const names = [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_CREDENTIAL_EXPIRATION",
  ];
  switch (os) {
    case "win":
      return names.map((k) => `set ${k}=`).join("\n");
    case "ps":
      return names
        .map((k) => `Remove-Item Env:${k} -ErrorAction SilentlyContinue`)
        .join("\n");
    case "fish":
      return `set -e ${names.join(" ")}`;
    default:
      return `unset ${names.join(" ")}`;
  }
}

export function profileBlock(ctx) {
  const lines = [
    `[${ctx.profileName}]`,
    `aws_access_key_id = ${ctx.accessKeyId}`,
    `aws_secret_access_key = ${ctx.secretAccessKey}`,
    `aws_session_token = ${ctx.sessionToken}`,
  ];
  if (ctx.accountId) lines.push(`aws_account_id = ${ctx.accountId}`);
  if (ctx.expiration)
    lines.push(`x_security_token_expires = ${ctx.expiration}`);
  return lines.join("\n");
}

export function configBlock(ctx) {
  const lines = [`[profile ${ctx.profileName}]`];
  if (ctx.region) lines.push(`region = ${ctx.region}`);
  lines.push("output = json");
  return lines.join("\n");
}

export function configureSetLines(ctx) {
  const p = `--profile ${ctx.profileName}`;
  const lines = [
    `aws configure set aws_access_key_id ${ctx.accessKeyId} ${p}`,
    `aws configure set aws_secret_access_key ${ctx.secretAccessKey} ${p}`,
    `aws configure set aws_session_token ${ctx.sessionToken} ${p}`,
  ];
  if (ctx.region) lines.push(`aws configure set region ${ctx.region} ${p}`);
  return lines.join("\n");
}

export function processJson(ctx) {
  const o = {
    Version: 1,
    AccessKeyId: ctx.accessKeyId,
    SecretAccessKey: ctx.secretAccessKey,
    SessionToken: ctx.sessionToken,
  };
  if (ctx.expiration) o.Expiration = ctx.expiration;
  return JSON.stringify(o, null, 2);
}

export function dotenv(ctx) {
  const lines = [
    `AWS_ACCESS_KEY_ID=${ctx.accessKeyId}`,
    `AWS_SECRET_ACCESS_KEY=${ctx.secretAccessKey}`,
    `AWS_SESSION_TOKEN=${ctx.sessionToken}`,
  ];
  if (ctx.region) lines.push(`AWS_REGION=${ctx.region}`);
  return lines.join("\n");
}

export function dockerRun(ctx) {
  const lines = [
    "docker run --rm -it \\",
    `  -e AWS_ACCESS_KEY_ID=${ctx.accessKeyId} \\`,
    `  -e AWS_SECRET_ACCESS_KEY=${ctx.secretAccessKey} \\`,
    `  -e AWS_SESSION_TOKEN=${ctx.sessionToken} \\`,
  ];
  if (ctx.region) lines.push(`  -e AWS_REGION=${ctx.region} \\`);
  lines.push("  amazon/aws-cli sts get-caller-identity");
  return lines.join("\n");
}

export function terraformProvider(ctx) {
  return [
    `provider "aws" {`,
    ctx.region ? `  region     = "${ctx.region}"` : null,
    `  access_key = "${ctx.accessKeyId}"`,
    `  secret_key = "${ctx.secretAccessKey}"`,
    `  token      = "${ctx.sessionToken}"`,
    `}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function boto3Session(ctx) {
  return [
    "import boto3",
    "",
    "session = boto3.Session(",
    `    aws_access_key_id="${ctx.accessKeyId}",`,
    `    aws_secret_access_key="${ctx.secretAccessKey}",`,
    `    aws_session_token="${ctx.sessionToken}",`,
    ctx.region ? `    region_name="${ctx.region}",` : null,
    ")",
  ]
    .filter(Boolean)
    .join("\n");
}

export function jsV3(ctx) {
  return [
    `import { STSClient } from "@aws-sdk/client-sts";`,
    "",
    "const client = new STSClient({",
    ctx.region ? `  region: "${ctx.region}",` : null,
    "  credentials: {",
    `    accessKeyId: "${ctx.accessKeyId}",`,
    `    secretAccessKey: "${ctx.secretAccessKey}",`,
    `    sessionToken: "${ctx.sessionToken}",`,
    ctx.expiration ? `    expiration: new Date("${ctx.expiration}"),` : null,
    "  },",
    "});",
  ]
    .filter(Boolean)
    .join("\n");
}

export function goV2(ctx) {
  return [
    `cfg, err := config.LoadDefaultConfig(ctx,`,
    ctx.region ? `\tconfig.WithRegion("${ctx.region}"),` : null,
    `\tconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(`,
    `\t\t"${ctx.accessKeyId}",`,
    `\t\t"${ctx.secretAccessKey}",`,
    `\t\t"${ctx.sessionToken}",`,
    `\t)),`,
    `)`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function javaV2(ctx) {
  return [
    "AwsSessionCredentials creds = AwsSessionCredentials.create(",
    `    "${ctx.accessKeyId}",`,
    `    "${ctx.secretAccessKey}",`,
    `    "${ctx.sessionToken}");`,
    "StsClient sts = StsClient.builder()",
    ctx.region ? `    .region(Region.of("${ctx.region}"))` : null,
    "    .credentialsProvider(StaticCredentialsProvider.create(creds))",
    "    .build();",
  ]
    .filter(Boolean)
    .join("\n");
}

export function dotnet(ctx) {
  return [
    "var creds = new SessionAWSCredentials(",
    `    "${ctx.accessKeyId}",`,
    `    "${ctx.secretAccessKey}",`,
    `    "${ctx.sessionToken}");`,
    ctx.region
      ? `var sts = new AmazonSecurityTokenServiceClient(creds, RegionEndpoint.GetBySystemName("${ctx.region}"));`
      : "var sts = new AmazonSecurityTokenServiceClient(creds);",
  ].join("\n");
}

export function powershellTools(ctx) {
  return [
    `Set-AWSCredential -AccessKey ${ctx.accessKeyId} -SecretKey ${ctx.secretAccessKey} -SessionToken ${ctx.sessionToken} -StoreAs ${ctx.profileName}`,
    ctx.region ? `Set-DefaultAWSRegion -Region ${ctx.region}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function onePassword(ctx) {
  const sq = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
  return [
    `op item create --category=login --title=${sq(`AWS ${ctx.profileName}`)} --tags=aws \\`,
    `  ${sq(`access key id[text]=${ctx.accessKeyId}`)} \\`,
    `  ${sq(`secret access key[concealed]=${ctx.secretAccessKey}`)} \\`,
    `  ${sq(`session token[concealed]=${ctx.sessionToken}`)}` +
      (ctx.expiration ? " \\" : ""),
    ctx.expiration ? `  ${sq(`expires[text]=${ctx.expiration}`)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function rawJson(ctx) {
  return JSON.stringify(
    {
      AccessKeyId: ctx.accessKeyId,
      SecretAccessKey: ctx.secretAccessKey,
      SessionToken: ctx.sessionToken,
      Expiration: ctx.expiration || undefined,
    },
    null,
    2
  );
}

// A user template: {{placeholders}} from ctx, nothing else.
export function applyTemplate(template, ctx) {
  return String(template || "").replace(
    /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g,
    (_, key) =>
      key in ctx && ctx[key] !== undefined && ctx[key] !== null
        ? String(ctx[key])
        : ""
  );
}

export const TEMPLATE_KEYS = [
  "accessKeyId",
  "secretAccessKey",
  "sessionToken",
  "expiration",
  "region",
  "accountId",
  "accountName",
  "roleName",
  "roleArn",
  "profileName",
];

// The "more formats" chips, in the order shown.
export const EXTRA_FORMATS = [
  {
    id: "configure",
    label: "aws configure set",
    render: configureSetLines,
    bundle: "join",
  },
  { id: "process", label: "credential_process JSON", render: processJson },
  { id: "dotenv", label: ".env", render: dotenv },
  { id: "docker", label: "Docker", render: dockerRun },
  { id: "tf", label: "Terraform", render: terraformProvider },
  { id: "boto3", label: "boto3", render: boto3Session },
  { id: "js", label: "JS SDK v3", render: jsV3 },
  { id: "go", label: "Go SDK v2", render: goV2 },
  { id: "java", label: "Java SDK v2", render: javaV2 },
  { id: "dotnet", label: ".NET", render: dotnet },
  {
    id: "pstools",
    label: "AWS Tools for PowerShell",
    render: powershellTools,
    bundle: "join",
  },
  { id: "op", label: "1Password", render: onePassword, bundle: "join" },
  { id: "json", label: "Raw JSON", render: rawJson },
];

export function renderExtra(id, ctx) {
  const f = EXTRA_FORMATS.find((x) => x.id === id);
  return f ? f.render(ctx) : "";
}

const header = (ctx) =>
  `# ${ctx.accountName || ctx.accountId} · ${ctx.roleName} (${ctx.accountId})`;

// Several roles as one text.
export function bundleEnv(ctxs, os) {
  const c = os === "win" ? "rem" : "#";
  return ctxs
    .map(
      (ctx) =>
        `${c} ${ctx.accountName || ctx.accountId} · ${ctx.roleName}\n${envLines(ctx, os)}`
    )
    .join("\n\n");
}

export function credentialsFile(ctxs) {
  return ctxs.map(profileBlock).join("\n\n") + "\n";
}

export function configFile(ctxs) {
  return ctxs.map(configBlock).join("\n\n") + "\n";
}

export function bundleExtra(id, ctxs) {
  const f = EXTRA_FORMATS.find((x) => x.id === id);
  if (!f) return "";
  if (f.bundle === "join") return ctxs.map((ctx) => f.render(ctx)).join("\n");
  return ctxs.map((ctx) => `${header(ctx)}\n${f.render(ctx)}`).join("\n\n");
}
