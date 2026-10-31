CREATE TABLE IF NOT EXISTS players (
  openid TEXT PRIMARY KEY,
  nickname TEXT NOT NULL DEFAULT '',
  best_score INTEGER NOT NULL DEFAULT 0,
  -- 达成当前最高分的时刻，同分时早达成的排前面
  best_at INTEGER NOT NULL
);

-- 榜单排序和名次统计都走这个索引；字段顺序必须与 ORDER BY 完全一致
CREATE INDEX IF NOT EXISTS players_rank ON players (best_score DESC, best_at ASC, openid ASC);

-- 分数桶：bucket = best_score / 10，名次查询只需汇总自己前面的桶
CREATE TABLE IF NOT EXISTS score_buckets (
  bucket INTEGER PRIMARY KEY,
  cnt INTEGER NOT NULL DEFAULT 0
);

CREATE TRIGGER IF NOT EXISTS score_buckets_insert AFTER INSERT ON players
WHEN new.best_score > 0
BEGIN
  INSERT INTO score_buckets (bucket, cnt) VALUES (new.best_score / 10, 1)
  ON CONFLICT(bucket) DO UPDATE SET cnt = cnt + 1;
END;

CREATE TRIGGER IF NOT EXISTS score_buckets_update AFTER UPDATE OF best_score ON players
WHEN old.best_score <> new.best_score AND new.best_score > 0
 AND (old.best_score = 0 OR old.best_score / 10 <> new.best_score / 10)
BEGIN
  UPDATE score_buckets SET cnt = cnt - 1
   WHERE bucket = old.best_score / 10 AND old.best_score > 0;
  INSERT INTO score_buckets (bucket, cnt) VALUES (new.best_score / 10, 1)
  ON CONFLICT(bucket) DO UPDATE SET cnt = cnt + 1;
END;
