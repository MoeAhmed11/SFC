import { prisma } from "../src/server/db";
import { createSchool } from "../src/server/repositories/schoolRepository";
import { inviteStaff, activateWithPassword } from "../src/server/services/staffAdminService";
import { createClass, createPupilRecord, createGuardianRecord, linkGuardianToPupil } from "../src/server/services/dataService";
import { createEventDraft, publishEvent } from "../src/server/services/eventService";
import { issueTokenForRecipient } from "../src/server/services/secureLinkService";
import { submitConsent } from "../src/server/services/consentService";
import type { StaffContext } from "../src/server/tenancy/context";

// Synthetic seed data only — NO real children's or guardians' personal data
// (Section 18.4). Creates two demo schools with staff, and populates the first
// one with classes/pupils/guardians/a published event with some consent
// responses, so a local demo has something to actually look at. Safe to run
// repeatedly (idempotent by email/name where practical).

// Satisfies the classic-complexity password policy (12+ chars, upper, lower,
// digit, symbol) enforced by passwordSchema in src/server/validation.ts.
const DEMO_PASSWORD = "Change-Me-In-Real-Life9!";

async function seedSchool(name: string, schoolType: "state" | "independent") {
  const existing = await prisma.school.findFirst({ where: { name } });
  const school = existing ?? (await createSchool(prisma, { name, schoolType, timezone: "Europe/London" }));

  const bootstrapCtx: StaffContext = { schoolId: school.id, staffUserId: "seed", role: "admin" };

  const adminEmail = `admin@${slug(name)}.example`;
  let adminId: string;
  const existingAdmin = await prisma.staffUser.findUnique({
    where: { schoolId_email: { schoolId: school.id, email: adminEmail } },
  });
  if (existingAdmin) {
    adminId = existingAdmin.id;
  } else {
    const admin = await inviteStaff(prisma, bootstrapCtx, {
      name: "Demo Admin",
      email: adminEmail,
      role: "admin",
    });
    await activateWithPassword(prisma, school.id, admin.id, { password: DEMO_PASSWORD });
    adminId = admin.id;
  }

  const organiserEmail = `organiser@${slug(name)}.example`;
  if (
    !(await prisma.staffUser.findUnique({
      where: { schoolId_email: { schoolId: school.id, email: organiserEmail } },
    }))
  ) {
    const organiser = await inviteStaff(prisma, bootstrapCtx, {
      name: "Demo Organiser",
      email: organiserEmail,
      role: "organiser",
    });
    await activateWithPassword(prisma, school.id, organiser.id, { password: DEMO_PASSWORD });
  }

  return { school, adminCtx: { schoolId: school.id, staffUserId: adminId, role: "admin" as const } };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Synthetic pupil/guardian pairs. Names are clearly fictional placeholders,
// not real children's data.
const DEMO_ROSTER = [
  { pupilFirst: "Alex", pupilLast: "Baker", guardianName: "Sam Baker", email: "sam.baker@example.test" },
  { pupilFirst: "Jordan", pupilLast: "Clarke", guardianName: "Priya Clarke", email: "priya.clarke@example.test" },
  { pupilFirst: "Morgan", pupilLast: "Diallo", guardianName: "Kwame Diallo", email: "kwame.diallo@example.test" },
  { pupilFirst: "Riley", pupilLast: "Evans", guardianName: "Lin Evans", email: "lin.evans@example.test" },
];

async function seedDemoData(school: { id: string; name: string }, adminCtx: StaffContext) {
  const existingClass = await prisma.classGroup.findUnique({
    where: { schoolId_name: { schoolId: school.id, name: "Year 3" } },
  });
  if (existingClass) {
    // Already populated on a previous run.
    return;
  }

  const cls = await createClass(prisma, adminCtx, { name: "Year 3", yearGroup: "Year 3" });

  const recipients: { pupilId: string; guardianId: string }[] = [];
  for (const entry of DEMO_ROSTER) {
    const pupil = await createPupilRecord(prisma, adminCtx, {
      firstName: entry.pupilFirst,
      lastName: entry.pupilLast,
      classGroupId: cls.id,
    });
    const guardian = await createGuardianRecord(prisma, adminCtx, {
      name: entry.guardianName,
      email: entry.email,
    });
    await linkGuardianToPupil(prisma, adminCtx, {
      pupilId: pupil.id,
      guardianId: guardian.id,
      isPrimaryContact: true,
      relationship: "Parent",
    });
    recipients.push({ pupilId: pupil.id, guardianId: guardian.id });
  }

  const startsAt = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const event = await createEventDraft(prisma, adminCtx, {
    title: "Science Museum Trip",
    description: "Bring a coat and a packed lunch.",
    location: "London Science Museum",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 5 * 3600 * 1000),
    consentDeadline: new Date(startsAt.getTime() - 7 * 24 * 3600 * 1000),
  });
  await publishEvent(prisma, adminCtx, event.id, { classGroupId: cls.id });

  // Simulate a couple of parent responses so the dashboard shows a mix of
  // consented/declined/outstanding rather than all zeros.
  const responsePlan: ("granted" | "declined" | null)[] = ["granted", "granted", "declined", null];
  for (let i = 0; i < recipients.length; i++) {
    const plan = responsePlan[i];
    if (!plan) continue; // leave outstanding
    const recipient = recipients[i]!;
    const token = await issueTokenForRecipient(prisma, school.id, event.id, recipient.pupilId, recipient.guardianId);
    await submitConsent(prisma, token.raw, { response: plan });
  }
}

async function main() {
  const a = await seedSchool("Greenfield Primary", "state");
  const b = await seedSchool("Oakwood Independent", "independent");

  await seedDemoData(a.school, a.adminCtx);

  console.log("Seeded schools:");
  console.log(`  - ${a.school.name} (${a.school.id}) — has a demo class, pupils, and a published event`);
  console.log(`  - ${b.school.name} (${b.school.id})`);
  console.log(`Demo admin login: admin@greenfield-primary.example / ${DEMO_PASSWORD}`);
  console.log(`Demo organiser login: organiser@greenfield-primary.example / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
