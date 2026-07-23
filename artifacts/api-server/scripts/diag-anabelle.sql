-- READ-ONLY diagnostic for "I get no notifications when Anabelle posts / prays for me".
-- Paste into Railway → Postgres → Query (or psql). Nothing here writes.

-- 1) Find Anabelle (any spelling). MORE THAN ONE ROW = duplicate-account bug.
--    Note her id + whether email is NULL (early accounts sometimes have null email).
SELECT id, name, email, push_enabled, created_at
FROM users
WHERE name ILIKE '%nabelle%' OR email ILIKE '%nabelle%'
ORDER BY id;

-- 2) Your own account.
SELECT id, name, email, push_enabled
FROM users
WHERE lower(email) = 'jcannon3000@gmail.com';

-- 3) THE CRUX — one row that answers every link in the chain.
--    Resolves you + the lowest-id Anabelle automatically.
WITH me  AS (SELECT id FROM users WHERE lower(email) = 'jcannon3000@gmail.com' LIMIT 1),
     her AS (SELECT id, email FROM users WHERE name ILIKE '%nabelle%' ORDER BY id LIMIT 1)
SELECT
  (SELECT id FROM me)             AS jcannon_id,
  (SELECT id FROM her)            AS anabelle_id,
  (SELECT email FROM her)         AS anabelle_email,           -- NULL here was a throw cause (now guarded)

  -- Are you fellows (either direction)? After fix be57ec8a, TRUE alone guarantees delivery.
  EXISTS (SELECT 1 FROM fellows f, me, her
          WHERE (f.user_id = her.id AND f.fellow_user_id = me.id)
             OR (f.user_id = me.id  AND f.fellow_user_id = her.id))   AS fellow_bond,

  -- Do you share a group (you as a non-hidden-admin peer in a group she's in)?
  EXISTS (SELECT 1
          FROM group_members her_gm
          JOIN group_members jc_gm ON jc_gm.group_id = her_gm.group_id
          CROSS JOIN me CROSS JOIN her
          WHERE (her_gm.user_id = her.id OR lower(her_gm.email) = lower(her.email))
            AND jc_gm.user_id = me.id
            AND coalesce(jc_gm.role, 'member') <> 'hidden_admin')     AS shared_group,

  -- RECEIVE-SIDE readiness (these are the usual real culprits):
  (SELECT push_enabled FROM users u, me WHERE u.id = me.id)           AS jcannon_push_enabled,
  (SELECT count(*) FROM device_tokens dt, me
     WHERE dt.user_id = me.id AND dt.invalidated_at IS NULL)          AS jcannon_active_tokens,   -- 0 = silent no-op
  EXISTS (SELECT 1 FROM user_mutes um, me, her
          WHERE um.muter_id = me.id AND um.muted_user_id = her.id)    AS jcannon_mutes_anabelle;

-- 4) "Something with early users?" — email data quality across the base.
SELECT count(*)                                              AS total,
       count(*) FILTER (WHERE email IS NULL)                 AS null_email,
       count(*) FILTER (WHERE btrim(coalesce(email,'')) = '') AS empty_email
FROM users;

-- 5) The 15 earliest accounts — watch for NULL/blank emails (the early-account fingerprint).
SELECT id, name, email, created_at
FROM users
ORDER BY id ASC
LIMIT 15;
