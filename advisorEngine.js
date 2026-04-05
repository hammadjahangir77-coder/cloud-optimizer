/**
 * Cloud cost advisor — rule-based recommendations aligned with Unit 16 proposal themes:
 * SME adoption, overspending / visibility, right-sizing, reserved/savings plans, scheduling,
 * barriers (skills, billing complexity). Savings figures are ranges from cited sources, not guarantees.
 */

const PROVIDERS = {
  aws: { id: "aws", name: "Amazon Web Services (AWS)" },
  azure: { id: "azure", name: "Microsoft Azure" },
  gcp: { id: "gcp", name: "Google Cloud" },
};

function normalizeAnswers(raw) {
  const w = Array.isArray(raw.workloads) ? raw.workloads : [];
  const workloads = w.filter((x) =>
    ["web", "internal", "devtest", "analytics", "microsoft_ecosystem"].includes(x)
  );
  const it_skill = ["low", "medium", "high"].includes(raw.it_skill)
    ? raw.it_skill
    : "medium";
  const traffic_pattern = ["spiky", "mixed", "steady"].includes(raw.traffic_pattern)
    ? raw.traffic_pattern
    : "mixed";
  const billing_confidence = ["low", "medium", "high"].includes(raw.billing_confidence)
    ? raw.billing_confidence
    : "medium";
  const priority = ["cost", "simplicity", "scale"].includes(raw.priority)
    ? raw.priority
    : "cost";
  return {
    workloads,
    it_skill,
    traffic_pattern,
    billing_confidence,
    priority,
  };
}

function scoreProviders(answers) {
  let aws = 52;
  let azure = 52;
  let gcp = 50;

  const { workloads, it_skill, traffic_pattern, priority } = answers;

  if (workloads.includes("microsoft_ecosystem")) {
    azure += 28;
    aws += 4;
    gcp += 2;
  }
  if (workloads.includes("analytics")) {
    gcp += 22;
    aws += 14;
    azure += 10;
  }
  if (workloads.includes("web")) {
    aws += 10;
    azure += 8;
    gcp += 8;
  }
  if (workloads.includes("internal")) {
    azure += 8;
    aws += 8;
    gcp += 6;
  }
  if (workloads.includes("devtest")) {
    aws += 6;
    azure += 6;
    gcp += 8;
  }

  if (priority === "simplicity") {
    azure += 5;
    gcp += 5;
    aws += 3;
  }
  if (priority === "scale") {
    aws += 6;
    gcp += 5;
    azure += 4;
  }
  if (priority === "cost") {
    aws += 5;
    azure += 4;
    gcp += 6;
  }

  if (it_skill === "low") {
    azure += 4;
    gcp += 3;
  }
  if (traffic_pattern === "steady") {
    azure += 3;
    aws += 3;
  }
  if (traffic_pattern === "spiky") {
    gcp += 4;
    aws += 3;
  }

  return [
    { ...PROVIDERS.aws, score: aws },
    { ...PROVIDERS.azure, score: azure },
    { ...PROVIDERS.gcp, score: gcp },
  ].sort((a, b) => b.score - a.score);
}

function providerNarrative(id, answers) {
  const { workloads, it_skill, traffic_pattern } = answers;
  const reasons = [];
  const cautions = [];

  if (id === "azure") {
    reasons.push(
      "Strong fit if you already rely on Microsoft 365, Entra ID, or Windows-based systems — licensing and identity integration are often simpler on Azure."
    );
    reasons.push(
      "Azure Cost Management + Billing is designed to sit alongside enterprise Microsoft agreements (see Microsoft Learn cost documentation)."
    );
    if (workloads.includes("microsoft_ecosystem"))
      reasons.push("Your profile prioritises the Microsoft ecosystem — Azure is typically the lowest-friction cloud for that stack.");
    cautions.push(
      "Pricing and service names change often (literature notes this as a barrier for non-specialists — Fernandes et al.; Oliveira et al.)."
    );
  } else if (id === "aws") {
    reasons.push(
      "Largest global footprint and broadest service catalogue — useful when you want one provider for many workload types (IaaS, PaaS, SaaS-style managed services)."
    );
    reasons.push(
      "AWS Cost Management tools (e.g. Cost Explorer, Compute Optimizer) are widely documented for right-sizing and reservation planning."
    );
    if (workloads.includes("web") || workloads.includes("internal"))
      reasons.push("Common choice for public-facing apps and general SME infrastructure when you want maximum third-party tutorials and partners.");
    cautions.push(
      "Invoices can be hard to interpret without technical help — a known SME pain point (Kumar & Lu; your proposal)."
    );
  } else {
    reasons.push(
      "Competitive managed data/analytics story (BigQuery, etc.) — often highlighted for data-heavy SMB paths."
    );
    reasons.push(
      "Committed-use and sustained-use discounts can suit predictable analytics pipelines when modelled carefully."
    );
    if (workloads.includes("analytics"))
      reasons.push("Your profile includes analytics — Google Cloud is frequently shortlisted for data platforms alongside AWS/Azure.");
    cautions.push(
      "Smaller local partner ecosystems in some regions vs AWS/Azure — check support availability for your country."
    );
  }

  if (it_skill === "low") {
    cautions.push(
      "Low in-house IT depth: favour **managed** services, budgets/alerts, and vendor support — literature ties overspend to lack of visibility and expertise (Oliveira et al.)."
    );
  }
  if (traffic_pattern === "spiky") {
    cautions.push(
      "Spiky demand: avoid large 1–3 year commitments until usage is understood; start with on-demand + autoscaling + budgets."
    );
  }
  if (traffic_pattern === "steady") {
    reasons.push(
      "Steady baseline load: investigate **savings plans / reserved capacity** where vendor math shows break-even vs on-demand (vendor docs cite large % discounts for commitment)."
    );
  }

  return { reasons, cautions };
}

function buildStrategies(answers, monthlyBudget) {
  const { workloads, it_skill, traffic_pattern, billing_confidence } = answers;
  const list = [];

  list.push({
    key: "visibility",
    title: "Billing visibility, budgets, and alerts",
    summary:
      "SMEs often overspend because invoices are complex and nobody monitors them until later (Kumar & Lu). Start with cost dashboards, monthly budgets, and anomaly alerts.",
    savingsRangePercent: { low: 5, high: 20 },
    savingsNote:
      "Industry reporting links poor visibility to sustained waste; fixing ‘silent drift’ commonly recovers **single-digit to low-double-digit %** of spend in year one when starting from little governance.",
    sources: [
      "Kumar, R. and Lu, B. (2021) — billing complexity & cloud research themes",
      "Flexera (2023) — substantial share of spend reported as wasted or underutilised",
    ],
  });

  list.push({
    key: "rightsizing",
    title: "Right-sizing (match capacity to real usage)",
    summary:
      "Over-provisioning ‘just in case’ is a dominant misuse pattern (Gill et al.). Use vendor advisors (e.g. AWS Compute Optimizer, Azure Advisor) to downsize idle or oversized VMs/databases where safe.",
    savingsRangePercent: { low: 10, high: 30 },
    savingsNote:
      "When environments were never tuned, **~10–30%** reclaimed through right-sizing and cleanup is a common band quoted in practitioner literature — your mileage depends on current waste.",
    sources: [
      "Gill et al. (2022) — over-provisioning",
      "Amazon Web Services (2023) — cost optimisation / Compute Optimizer",
    ],
  });

  if (traffic_pattern === "steady" || workloads.includes("internal")) {
    list.push({
      key: "commitments",
      title: "Reserved instances / savings plans (stable baselines only)",
      summary:
        "For predictable baseline compute, committing for 1–3 years can materially beat on-demand — but only after usage is stable (your proposal cites vendor documentation on deep discounts).",
      savingsRangePercent: { low: 30, high: 72 },
      savingsNote:
        "Microsoft Azure documentation discusses **up to ~72%** savings vs pay-as-you-go for some committed purchase options — applies to **eligible steady** workloads, not spikes.",
      sources: ["Microsoft Azure (2022) — Cost Management & commitment discounts"],
    });
  }

  if (workloads.includes("devtest")) {
    list.push({
      key: "schedule",
      title: "Automated shutdown / schedules for non-production",
      summary:
        "Dev/test environments that run 24/7 waste money. Scheduling nights/weekends off is a low-skill win (your proposal highlights this family of tactics).",
      savingsRangePercent: { low: 35, high: 65 },
      savingsNote:
        "Published examples report **large %** reductions in **non-production** environments when automation is applied — e.g. **up to ~65%** in cited conference literature (Alharthi et al., 2022, as summarised in your proposal).",
      sources: ["Alharthi et al. (2022) — scheduling / cloud cost reduction in non-prod contexts"],
    });
  }

  if (billing_confidence === "low" || it_skill === "low") {
    list.push({
      key: "governance",
      title: "Govern shadow IT and duplicate SaaS",
      summary:
        "Employees subscribing to cloud tools without central approval inflates monthly spend (Brender & Markov). A simple approved-tools list and review cadence reduces duplicate seats.",
      savingsRangePercent: { low: 5, high: 15 },
      savingsNote:
        "Hard to quantify without inventory — many SMEs recover **~5–15%** when duplicate subscriptions are merged after an audit.",
      sources: [
        "Brender, N. and Markov, I. (2022) — risk / cloud subscription behaviour",
      ],
    });
  }

  return list;
}

function illustrativeReclaim(monthlyBudget, strategies) {
  if (monthlyBudget == null || !Number.isFinite(Number(monthlyBudget)) || Number(monthlyBudget) <= 0) {
    return null;
  }
  const b = Number(monthlyBudget);
  // Flexera-style headline: ~32% wasted or underutilised (proposal) — use as central scenario, not a promise
  const flexeraStyleWaste = { percent: 32, note: "Flexera (2023) reports ~32% of cloud spend as wasted or underutilised in surveyed organisations — illustrative for SMEs starting from weak governance." };
  const wasteLow = 0.18;
  const wasteHigh = 0.38;
  const reclaimOfWasteLow = 0.35;
  const reclaimOfWasteHigh = 0.7;

  const monthlyWasteLow = b * wasteLow;
  const monthlyWasteHigh = b * wasteHigh;
  const potentialReclaimLow = monthlyWasteLow * reclaimOfWasteLow;
  const potentialReclaimHigh = monthlyWasteHigh * reclaimOfWasteHigh;

  const yearLow = potentialReclaimLow * 12;
  const yearHigh = potentialReclaimHigh * 12;

  return {
    flexeraStyleWaste,
    assumedWasteBandPercent: { low: 18, high: 38 },
    reclaimableShareOfWaste: { low: 35, high: 70 },
    monthlyWasteEstimate: { low: roundMoney(monthlyWasteLow), high: roundMoney(monthlyWasteHigh) },
    monthlyReclaimPotential: { low: roundMoney(potentialReclaimLow), high: roundMoney(potentialReclaimHigh) },
    annualReclaimPotential: { low: roundMoney(yearLow), high: roundMoney(yearHigh) },
    disclaimer:
      "These money figures are **illustrative scenarios** from waste-band assumptions — not a forecast. Actual savings require measurement on your invoices and careful change control.",
  };
}

function roundMoney(n) {
  return Math.round(n * 100) / 100;
}

function computeReport(businessRow, answersRaw) {
  const answers = normalizeAnswers(answersRaw || {});
  const ranked = scoreProviders(answers);
  const withNarrative = ranked.map((p, i) => {
    const { reasons, cautions } = providerNarrative(p.id, answers);
    return {
      rank: i + 1,
      id: p.id,
      name: p.name,
      score: p.score,
      verdict:
        i === 0
          ? "Best overall match for your answers today"
          : i === 1
            ? "Strong alternative — compare egress, support, and existing vendor credits"
            : "Still viable — weigh data/analytics features and regional pricing",
      reasons,
      cautions,
    };
  });

  const monthlyBudget = businessRow.monthly_cloud_budget;
  const strategies = buildStrategies(answers, monthlyBudget);
  const reclaim = illustrativeReclaim(monthlyBudget, strategies);

  return {
    topicAlignment: [
      "Grounded in your Unit 16 focus: **cloud cost optimisation for small businesses** (overspend, visibility, right-sizing, commitments, automation, SME barriers).",
      "Provider choice is only step one — literature stresses **governance and skills** as the real limit (Oliveira et al.; Fernandes et al.).",
    ],
    topPick: withNarrative[0],
    allProviders: withNarrative,
    optimizationStrategies: strategies,
    illustrativeReclaim: reclaim,
    citationsFooter: [
      "Flexera (2023) State of the Cloud Report — waste / underutilisation headline.",
      "Gill et al. (2022); Kumar & Lu (2021) — over-provisioning & billing complexity.",
      "AWS (2023); Microsoft Azure (2022) — vendor cost tooling & commitment savings.",
      "Alharthi et al. (2022) — automation / scheduling savings in non-production contexts.",
      "Oliveira et al. (2022); Fernandes et al. (2022) — adoption barriers & changing pricing.",
    ],
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  normalizeAnswers,
  computeReport,
};
