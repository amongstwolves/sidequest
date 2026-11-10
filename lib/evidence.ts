import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reviewEvidence, type Review } from "@/lib/ai/reviewer";
import { TransitionError } from "@/lib/objectives";

const MAX_PHOTOS = 4;
const MAX_BYTES = 4 * 1024 * 1024;
const SUBMITTABLE = ["ACCEPTED", "IN_PROGRESS", "CHANGES_REQUESTED"];

type MediaType = "image/jpeg" | "image/png" | "image/webp";

/** Trust the bytes, not the file name or the browser's claimed type. */
function sniff(bytes: Buffer): MediaType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/**
 * Operator submits proof (spec §7.1: only the active assignee). Photos are stored first, then
 * Claude reviews them; a failed review leaves the submission for human review instead of losing it.
 */
export async function submitEvidence(missionId: string, operatorId: string, files: File[]): Promise<Review> {
  if (files.length === 0) throw new TransitionError("Add at least one photo.");
  if (files.length > MAX_PHOTOS) throw new TransitionError(`Up to ${MAX_PHOTOS} photos per submission.`);
  const photos: { bytes: Buffer; mediaType: MediaType; hash: string }[] = [];
  for (const f of files) {
    if (f.size > MAX_BYTES) throw new TransitionError("Each photo must be under 4 MB.");
    const bytes = Buffer.from(await f.arrayBuffer());
    const mediaType = sniff(bytes);
    if (!mediaType) throw new TransitionError("Photos must be JPEG, PNG or WebP images.");
    photos.push({ bytes, mediaType, hash: createHash("sha256").update(bytes).digest("hex") });
  }

  const sql = db();
  const ctx = await sql.begin(async (tx) => {
    const [m] = await tx<{ state: string; title: string; description: string; rubric_json: { items: { id: string; requirement: string }[] }; location_name: string; permission_note: string }[]>`
      select m.state, m.title, m.description, m.rubric_json, l.name as location_name, l.permission_note
      from missions m left join locations l on l.id = m.location_id where m.id = ${missionId} for update of m`;
    if (!m) throw new TransitionError("Mission not found.");
    const [a] = await tx<{ id: string; operator_id: string }[]>`
      select id, operator_id from assignments where mission_id = ${missionId} and status not in ('WITHDRAWN', 'CANCELLED')`;
    if (!a || a.operator_id !== operatorId) throw new TransitionError("Only the operator who accepted this mission can submit proof.");
    if (!SUBMITTABLE.includes(m.state)) throw new TransitionError(`Proof can't be submitted while the mission is ${m.state.toLowerCase().replaceAll("_", " ")}.`);

    const [{ next }] = await tx<{ next: number }[]>`
      select coalesce(max(e.submission_no), 0) + 1 as next from evidence e where e.assignment_id = ${a.id}`;
    const evidenceIds: string[] = [];
    for (const p of photos) {
      const [e] = await tx<{ id: string }[]>`
        insert into evidence (assignment_id, storage_key, mime_type, file_hash, metadata_json, submission_no)
        values (${a.id}, 'db', ${p.mediaType}, ${p.hash}, ${tx.json({ byte_size: p.bytes.length } as never)}, ${next})
        returning id`;
      await tx`update evidence set storage_key = ${"db:" + e.id} where id = ${e.id}`;
      await tx`insert into evidence_files (evidence_id, bytes, byte_size) values (${e.id}, ${p.bytes}, ${p.bytes.length})`;
      evidenceIds.push(e.id);
    }
    await tx`update assignments set status = 'EVIDENCE_SUBMITTED', submitted_at = now(), started_at = coalesce(started_at, now()) where id = ${a.id}`;
    await tx`update missions set state = 'EVIDENCE_SUBMITTED', updated_at = now() where id = ${missionId}`;
    await audit(tx, {
      actorType: "human",
      actorId: operatorId,
      action: "evidence.submitted",
      resourceType: "mission",
      resourceId: missionId,
      beforeState: m.state,
      afterState: "EVIDENCE_SUBMITTED",
      metadata: { photos: photos.length, submission: next },
    });
    return { mission: m, assignmentId: a.id, submissionNo: next, evidenceIds };
  });

  const review = await reviewEvidence({
    missionTitle: ctx.mission.title,
    missionDescription: ctx.mission.description,
    locationName: ctx.mission.location_name,
    permissionNote: ctx.mission.permission_note,
    rubric: ctx.mission.rubric_json.items,
    photos: photos.map((p) => ({ mediaType: p.mediaType, base64: p.bytes.toString("base64") })),
  });

  const changes = review.result === "CHANGES_REQUESTED";
  await sql.begin(async (tx) => {
    await tx`
      insert into evidence_reviews (evidence_id, mission_id, reviewer_type, model, result, findings_json, submission_no, summary, operator_message)
      values (${ctx.evidenceIds[0]}, ${missionId}, 'ai', ${review.model}, ${review.result},
              ${tx.json({ findings: review.findings, privacy_concern: review.privacyConcern } as never)},
              ${ctx.submissionNo}, ${review.summary}, ${review.operatorMessage})`;
    await tx`
      update missions set state = ${changes ? "CHANGES_REQUESTED" : "UNDER_REVIEW"}, updated_at = now()
      where id = ${missionId} and state = 'EVIDENCE_SUBMITTED'`;
    if (changes) await tx`update assignments set status = 'CHANGES_REQUESTED' where id = ${ctx.assignmentId}`;
    await audit(tx, {
      actorType: "system",
      actorId: "proof_engine",
      action: changes ? "review.changes_requested" : "review.completed",
      resourceType: "mission",
      resourceId: missionId,
      beforeState: "EVIDENCE_SUBMITTED",
      afterState: changes ? "CHANGES_REQUESTED" : "UNDER_REVIEW",
      metadata: { result: review.result, model: review.model, submission: ctx.submissionNo },
    });
  });
  return review;
}

export type Submission = {
  submissionNo: number;
  photoIds: string[];
  submittedAt: Date;
  review: {
    result: string;
    model: string | null;
    summary: string | null;
    operator_message: string | null;
    findings: Review["findings"];
    privacy_concern: boolean;
  } | null;
};

/** Every submission for the mission's active assignment, newest first. */
export async function getSubmissions(missionId: string): Promise<Submission[]> {
  const sql = db();
  const photos = await sql<{ id: string; submission_no: number; submitted_at: Date }[]>`
    select e.id, e.submission_no, e.submitted_at from evidence e
    join assignments a on a.id = e.assignment_id
    where a.mission_id = ${missionId} and a.status not in ('WITHDRAWN', 'CANCELLED')
    order by e.submission_no desc, e.submitted_at`;
  const reviews = await sql<{ submission_no: number; result: string; model: string | null; summary: string | null; operator_message: string | null; findings_json: { findings: Review["findings"]; privacy_concern: boolean } }[]>`
    select submission_no, result, model, summary, operator_message, findings_json from evidence_reviews
    where mission_id = ${missionId} order by created_at desc`;
  const bySubmission = new Map<number, Submission>();
  for (const p of photos) {
    if (!bySubmission.has(p.submission_no)) {
      const r = reviews.find((x) => x.submission_no === p.submission_no);
      bySubmission.set(p.submission_no, {
        submissionNo: p.submission_no,
        photoIds: [],
        submittedAt: p.submitted_at,
        review: r ? { result: r.result, model: r.model, summary: r.summary, operator_message: r.operator_message, findings: r.findings_json.findings, privacy_concern: r.findings_json.privacy_concern } : null,
      });
    }
    bySubmission.get(p.submission_no)!.photoIds.push(p.id);
  }
  return [...bySubmission.values()];
}

/** Photo bytes, only for the mission's requester or its assigned operator (invariant 8). */
export async function readEvidencePhoto(evidenceId: string, viewerId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(evidenceId)) return null;
  const [row] = await db()<{ bytes: Buffer; mime_type: string; requester_id: string; operator_id: string }[]>`
    select f.bytes, e.mime_type, o.requester_id, a.operator_id
    from evidence e
    join evidence_files f on f.evidence_id = e.id
    join assignments a on a.id = e.assignment_id
    join missions m on m.id = a.mission_id
    join objectives o on o.id = m.objective_id
    where e.id = ${evidenceId}`;
  if (!row || (viewerId !== row.requester_id && viewerId !== row.operator_id)) return null;
  return { bytes: row.bytes, mimeType: row.mime_type };
}
