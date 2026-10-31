-- 2026-10-31 名次改为“同分并列同名次”：分数桶从 10 分一桶改成 1 分一桶
-- 名次 = 比我分高的人数 + 1，不再逐行数同分的人
-- 可重复执行：重建桶数据并重建触发器
DROP TRIGGER IF EXISTS score_buckets_insert;
DROP TRIGGER IF EXISTS score_buckets_update;

DELETE FROM score_buckets;
INSERT INTO score_buckets (bucket, cnt)
  SELECT best_score, COUNT(*) FROM players WHERE best_score > 0 GROUP BY best_score;

CREATE TRIGGER score_buckets_insert AFTER INSERT ON players
WHEN new.best_score > 0
BEGIN
  INSERT INTO score_buckets (bucket, cnt) VALUES (new.best_score, 1)
  ON CONFLICT(bucket) DO UPDATE SET cnt = cnt + 1;
END;

CREATE TRIGGER score_buckets_update AFTER UPDATE OF best_score ON players
WHEN old.best_score <> new.best_score AND new.best_score > 0
BEGIN
  UPDATE score_buckets SET cnt = cnt - 1
   WHERE bucket = old.best_score AND old.best_score > 0;
  INSERT INTO score_buckets (bucket, cnt) VALUES (new.best_score, 1)
  ON CONFLICT(bucket) DO UPDATE SET cnt = cnt + 1;
END;

-- 空桶保留（删一行要多计一次写）；名次查询带 cnt > 0，靠这个局部索引跳过空桶
CREATE INDEX IF NOT EXISTS score_buckets_rank ON score_buckets (bucket, cnt) WHERE cnt > 0;
