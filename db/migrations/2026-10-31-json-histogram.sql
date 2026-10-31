-- 2026-10-31 直方图从“每个分数一行”改成“单行 JSON”：
-- 每次破纪录由 3 行写（players + 旧桶 + 新桶）降到 2 行写（players + 直方图）
CREATE TABLE IF NOT EXISTS score_stats (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  histogram TEXT NOT NULL DEFAULT '{}'
);

DROP TRIGGER IF EXISTS score_buckets_insert;
DROP TRIGGER IF EXISTS score_buckets_update;

DELETE FROM score_stats;
INSERT INTO score_stats (id, histogram)
  SELECT 1, COALESCE(json_group_object(bucket, cnt), '{}')
    FROM score_buckets WHERE cnt > 0;

DROP TABLE IF EXISTS score_buckets;

CREATE TRIGGER score_stats_insert AFTER INSERT ON players
WHEN new.best_score > 0
BEGIN
  UPDATE score_stats
     SET histogram = json_set(
       histogram,
       '$."' || new.best_score || '"',
       COALESCE(json_extract(histogram, '$."' || new.best_score || '"'), 0) + 1
     )
   WHERE id = 1;
END;

CREATE TRIGGER score_stats_update AFTER UPDATE OF best_score ON players
WHEN old.best_score <> new.best_score AND new.best_score > 0
BEGIN
  -- 一条 UPDATE 只算 1 行写；旧分数降到 0 时删掉 key，避免 JSON 只增不减
  UPDATE score_stats
     SET histogram = json_set(
       CASE
         WHEN COALESCE(json_extract(histogram, '$."' || old.best_score || '"'), 0) <= 1
           THEN json_remove(histogram, '$."' || old.best_score || '"')
         ELSE json_set(
           histogram,
           '$."' || old.best_score || '"',
           json_extract(histogram, '$."' || old.best_score || '"') - 1
         )
       END,
       '$."' || new.best_score || '"',
       COALESCE(
         json_extract(
           CASE
             WHEN COALESCE(json_extract(histogram, '$."' || old.best_score || '"'), 0) <= 1
               THEN json_remove(histogram, '$."' || old.best_score || '"')
             ELSE json_set(
               histogram,
               '$."' || old.best_score || '"',
               json_extract(histogram, '$."' || old.best_score || '"') - 1
             )
           END,
           '$."' || new.best_score || '"'
         ),
         0
       ) + 1
     )
   WHERE id = 1;
END;