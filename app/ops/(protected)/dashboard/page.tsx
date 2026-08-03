import { prisma } from "@/lib/prisma";
import { SystemOverviewSection } from "./_components/SystemOverviewSection";
import { CampaignOverviewSection } from "./_components/CampaignOverviewSection";
import { AutomationActivitySection } from "./_components/AutomationActivitySection";
import { LeadOverviewSection } from "./_components/LeadOverviewSection";
import { SystemHealthSection } from "./_components/SystemHealthSection";
import { tokenExpiryStatus } from "./_lib/derive-status";

export default async function DashboardPage() {
  const [
    socialAccounts,
    activeCampaignCount,
    totalLeads,
    totalConversionLogs,
    recentActivityRaw,
    campaignsRaw,
    activityLogsRaw,
    leadsRaw,
    lastExecutedLog,
    recoveryCountsRaw,
  ] = await Promise.all([
    prisma.socialAccount.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.campaign.count({ where: { isActive: true } }),
    prisma.lead.count(),
    prisma.conversionLog.count(),
    prisma.conversionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { campaign: { select: { name: true } } },
    }),
    prisma.campaign.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        socialAccount: { select: { instagramUsername: true, instagramBusinessId: true } },
        conversionLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.conversionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        campaign: { select: { name: true } },
        lead: { select: { handle: true, instagramUserId: true } },
      },
    }),
    prisma.lead.findMany({
      orderBy: { lastInteractedAt: "desc" },
      take: 20,
      include: {
        conversionLogs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { campaign: { select: { name: true } } },
        },
      },
    }),
    // "Last automation executed": most recent row the pipeline actually ran
    // on (not merely persisted) — distinguishes from "last webhook
    // received" below, which is every persisted row regardless of whether
    // the pipeline reached it yet.
    prisma.conversionLog.findFirst({
      where: { status: { not: "PENDING" } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    // Phase A (Automation Reliability): operational visibility into rows
    // sitting in a recovery-relevant state — a dead letter, an ambiguous
    // outcome awaiting manual review, a scheduled retry, or an account
    // block — none of which are otherwise surfaced anywhere in the UI.
    prisma.conversionLog.groupBy({
      by: ["status"],
      _count: true,
      where: { status: { in: ["RETRY_PENDING", "ACCOUNT_BLOCKED", "DELIVERY_UNCERTAIN", "DEAD_LETTER"] } },
    }),
  ]);

  const recoveryCounts = {
    retryPending: recoveryCountsRaw.find((row) => row.status === "RETRY_PENDING")?._count ?? 0,
    accountBlocked: recoveryCountsRaw.find((row) => row.status === "ACCOUNT_BLOCKED")?._count ?? 0,
    deliveryUncertain: recoveryCountsRaw.find((row) => row.status === "DELIVERY_UNCERTAIN")?._count ?? 0,
    deadLetter: recoveryCountsRaw.find((row) => row.status === "DEAD_LETTER")?._count ?? 0,
  };

  const lastWebhookReceivedAt = recentActivityRaw[0]?.createdAt ?? null;

  const webhookConfigured = Boolean(process.env.META_APP_SECRET && process.env.META_WEBHOOK_VERIFY_TOKEN);
  const oauthConnected = socialAccounts.some((account) => account.status === "ACTIVE");

  const tokenWarnings = socialAccounts
    .filter((account) => account.status === "ACTIVE")
    .map((account) => {
      const status = tokenExpiryStatus(account.tokenExpiresAt);
      return {
        accountLabel: account.instagramUsername ?? account.instagramBusinessId,
        level: status.level,
        message: status.message,
      };
    });

  return (
    <div className="flex flex-1 flex-col gap-10 px-6 py-10">
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Automation Dashboard</h1>

      <SystemOverviewSection
        socialAccounts={socialAccounts}
        activeCampaignCount={activeCampaignCount}
        totalLeads={totalLeads}
        totalConversionLogs={totalConversionLogs}
        recentActivity={recentActivityRaw.map((log) => ({
          id: log.id,
          createdAt: log.createdAt,
          status: log.status,
          campaignName: log.campaign?.name ?? null,
        }))}
      />

      <CampaignOverviewSection
        campaigns={campaignsRaw.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          instagramMediaId: campaign.instagramMediaId,
          isActive: campaign.isActive,
          triggerKeywords: campaign.triggerKeywords,
          lastActivityAt: campaign.conversionLogs[0]?.createdAt ?? null,
        }))}
      />

      <AutomationActivitySection
        logs={activityLogsRaw.map((log) => ({
          id: log.id,
          createdAt: log.createdAt,
          campaignName: log.campaign?.name ?? null,
          instagramHandle: log.lead?.handle ?? log.instagramUserId,
          matchedKeyword: log.matchedKeyword,
          status: log.status,
          dmSentAt: log.dmSentAt,
          publicRepliedAt: log.publicRepliedAt,
        }))}
      />

      <LeadOverviewSection
        leads={leadsRaw.map((lead) => ({
          id: lead.id,
          handle: lead.handle,
          instagramUserId: lead.instagramUserId,
          lastInteractedAt: lead.lastInteractedAt,
          campaignName: lead.conversionLogs[0]?.campaign?.name ?? null,
          status: lead.conversionLogs[0]?.status ?? null,
        }))}
      />

      <SystemHealthSection
        oauthConnected={oauthConnected}
        webhookConfigured={webhookConfigured}
        receivingEvents={totalConversionLogs > 0}
        tokenWarnings={tokenWarnings}
        lastWebhookReceivedAt={lastWebhookReceivedAt}
        lastAutomationExecutedAt={lastExecutedLog?.createdAt ?? null}
        recoveryCounts={recoveryCounts}
      />
    </div>
  );
}
