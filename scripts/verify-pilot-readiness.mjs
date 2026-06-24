import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const requiredFiles = [
  "docs/operations/pilot-runbook.md",
  "docs/operations/operator-training.md",
  "docs/operations/pilot-feedback.md",
  "admin-menu-manager/contracts/pilotReadiness.ts",
  "admin-menu-manager/server/pilot/pilotReadinessService.ts",
  "admin-menu-manager/src/features/audit/AuditPage.tsx"
];

const requiredPhrases = new Map([
  [
    "docs/operations/pilot-runbook.md",
    [
      "Production D1",
      "Secret Checklist",
      "Customer Repo Pages",
      "Migration Backup Rollback",
      "Token Rotation",
      "Monitoring Incident",
      "Pilot Data",
      "Representative Menu Data",
      "Publication Lifecycle",
      "Device Acceptance",
      "Network Delay",
      "Release Gate",
      "Codex는 이 승인과 production deploy를 수행하지 않는다."
    ]
  ],
  [
    "docs/operations/operator-training.md",
    ["Roles", "Bar Selector", "Menu Operations", "Publication", "Orders", "Incident Drill"]
  ],
  [
    "docs/operations/pilot-feedback.md",
    ["Defect Ledger", "현재 P0/P1 open: 0", "Feedback Log", "Follow-up Backlog"]
  ],
  [
    "admin-menu-manager/server/pilot/pilotReadinessService.ts",
    [
      "운영 D1 바인딩과 migration 확인",
      "비밀값 점검표",
      "고객 저장소·Pages 연결 절차",
      "GitHub·Cloudflare 토큰 교체 절차",
      "대표 와인·위스키·칵테일·푸드·시가 데이터",
      "준비·발행·재발행·비활성화 시나리오",
      "주문 생성·추가·조정·정산 시나리오",
      "사람의 운영 배포 승인"
    ]
  ],
  [
    "admin-menu-manager/src/features/audit/AuditPage.tsx",
    ["파일럿 준비", "실제 운영 비밀값, 원격 반영, 운영 배포는 승인 전까지 실행하지 않습니다."]
  ]
]);

const forbiddenSecretPatterns = [
  /ghp_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/
];

const failures = [];
const files = new Map();

for (const relative of requiredFiles) {
  try {
    files.set(relative, await readFile(path.join(root, relative), "utf8"));
  } catch {
    failures.push(`${relative}: required D24 artifact is missing`);
  }
}

for (const [relative, phrases] of requiredPhrases) {
  const source = files.get(relative);
  if (!source) continue;
  for (const phrase of phrases) {
    if (!source.includes(phrase)) failures.push(`${relative}: missing phrase "${phrase}"`);
  }
}

for (const [relative, source] of files) {
  for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(source)) failures.push(`${relative}: looks like it contains a production secret (${pattern})`);
  }
}

const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
if (packageJson.scripts?.["verify:pilot"] !== "node scripts/verify-pilot-readiness.mjs") {
  failures.push("package.json: missing verify:pilot script");
}

if (failures.length > 0) {
  console.error("Pilot readiness verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Pilot readiness artifacts verified.");
